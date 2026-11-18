//! Abgleich über Gesamtstände mit Geräterolle (Spezifikation 5.5, 5.8).
//!
//! Ablauf von [`run_sync`]:
//! 1. Server-Verzeichnis lesen, Versatz zur Serverzeit übernehmen und speichern.
//! 2. Fremde `snapshot_*.json` laden (nur wenn der ETag sich geändert hat; beim ersten Abgleich
//!    eines Desktops immer alle). Unlesbare Dateien werden übersprungen und protokolliert.
//! 3. Desktop vor dem ersten Abgleich: ohne Laptop-Stand nichts tun (`WaitingForLaptop` bzw.
//!    `NoLaptopFound`); sonst Sicherungskopie (falls lokale Daten), lokalen Stand durch den
//!    jüngsten Laptop-Stand ersetzen, übrige Stände zusammenführen, ersten Abgleich merken.
//! 4. Sonst: alle fremden Stände zusammenführen.
//! 5. Eigenen Stand bauen und nur hochladen, wenn er sich seit dem letzten Hochladen geändert hat.
//! 6. Eigene alte Änderungsdateien `changeset_<device_id>_*.dat` löschen (A11).
//! 7. Zeitpunkt des erfolgreichen Abgleichs speichern (A6).
//!
//! Die Datenbank-Sperre wird nur für reine Datenbank-Schritte genommen, nie über Netzwerk-Aufrufe.

use crate::audit::AuditLogger;
use crate::database::Database;
use crate::merge::{log_merge_audit, merge_snapshot, replace_with_snapshot, MergeReport};
use crate::snapshot::{build_snapshot, counts, decode, encode, snapshot_file_name, Snapshot};
use crate::sync_time::parse_ts;
use crate::webdav_sync::WebDavClient;
use anyhow::{Context, Result};
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::sync::Mutex;

pub const ROLE_LAPTOP: &str = "laptop";
pub const ROLE_DESKTOP: &str = "desktop";

#[derive(Debug, Clone, PartialEq)]
pub enum SyncOutcome {
    Synced(MergeReport),
    WaitingForLaptop,
    NoLaptopFound,
    NotConfigured,
}

impl SyncOutcome {
    pub fn as_str(&self) -> &'static str {
        match self {
            SyncOutcome::Synced(_) => "synced",
            SyncOutcome::WaitingForLaptop => "waiting_for_laptop",
            SyncOutcome::NoLaptopFound => "no_laptop_found",
            SyncOutcome::NotConfigured => "not_configured",
        }
    }
}

/// `{ "outcome": "...", "report"?: {inserted, updated, tombstoned, skipped} }`
impl Serialize for SyncOutcome {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("outcome", self.as_str())?;
        if let SyncOutcome::Synced(r) = self {
            map.serialize_entry(
                "report",
                &serde_json::json!({
                    "inserted": r.inserted,
                    "updated": r.updated,
                    "tombstoned": r.tombstoned,
                    "skipped": r.skipped,
                }),
            )?;
        }
        map.end()
    }
}

/// Vorbelegung der Rollenauswahl aus dem Gerätetyp: nur bei ausdrücklich gesetztem Typ
/// (`notebook` → Laptop, `computer` → Desktop). Sonst kein Vorschlag – eine falsche
/// Vorbelegung „Desktop“ auf dem Gerät mit den echten Daten würde diese beim ersten Abgleich
/// ersetzen.
pub fn role_suggestion(device_type: Option<&str>) -> Option<&'static str> {
    match device_type {
        Some("notebook") => Some(ROLE_LAPTOP),
        Some("computer") => Some(ROLE_DESKTOP),
        _ => None,
    }
}

/// Eine gelesene fremde Server-Datei.
struct Remote {
    name: String,
    etag: Option<String>,
    snap: Snapshot,
}

fn add_report(total: &mut MergeReport, r: MergeReport) {
    total.inserted += r.inserted;
    total.updated += r.updated;
    total.tombstoned += r.tombstoned;
    total.skipped += r.skipped;
    total.changes.extend(r.changes);
}

/// Prüfsumme des Inhalts ohne `generated_at` (das sich bei jedem Bauen ändert).
fn content_hash(snap: &Snapshot) -> String {
    let mut s = snap.clone();
    s.generated_at = String::new();
    let mut hasher = Sha256::new();
    hasher.update(encode(&s));
    format!("{:x}", hasher.finalize())
}

fn is_snapshot_file(name: &str) -> bool {
    name.starts_with("snapshot_") && name.ends_with(".json")
}

/// Jüngster Laptop-Stand nach `generated_at` (Serverzeit).
fn newest_laptop(remotes: &[Remote]) -> Option<usize> {
    remotes
        .iter()
        .enumerate()
        .filter(|(_, r)| r.snap.device_role.as_deref() == Some(ROLE_LAPTOP))
        .max_by(|(_, a), (_, b)| {
            match (
                parse_ts(&a.snap.generated_at),
                parse_ts(&b.snap.generated_at),
            ) {
                (Ok(x), Ok(y)) => x.cmp(&y),
                _ => a.snap.generated_at.cmp(&b.snap.generated_at),
            }
            .then_with(|| a.snap.device_id.cmp(&b.snap.device_id))
        })
        .map(|(i, _)| i)
}

/// Führt eine Datei zusammen; Fehler → Datei überspringen (alles zurückgerollt), protokollieren.
/// Audit nach dem Festschreiben; Audit-Fehler brechen den Abgleich nicht ab.
async fn merge_one(
    db: &Database,
    remote: &Remote,
    audit: Option<&AuditLogger>,
    total: &mut MergeReport,
    etags: &mut HashMap<String, String>,
) {
    match merge_snapshot(db, &remote.snap).await {
        Ok(report) => {
            println!(
                "Abgleich: {} zusammengeführt ({} neu, {} aktualisiert, {} gelöscht)",
                remote.name, report.inserted, report.updated, report.tombstoned
            );
            write_audit(audit, &report).await;
            add_report(total, report);
            if let Some(tag) = &remote.etag {
                etags.insert(remote.name.clone(), tag.clone());
            }
        }
        Err(e) => {
            eprintln!(
                "Abgleich: {} übersprungen (Zusammenführen fehlgeschlagen): {:#}",
                remote.name, e
            );
            etags.remove(&remote.name);
        }
    }
}

async fn write_audit(audit: Option<&AuditLogger>, report: &MergeReport) {
    if let Some(audit) = audit {
        if let Err(e) = log_merge_audit(audit, report).await {
            eprintln!(
                "Abgleich: Audit-Einträge konnten nicht geschrieben werden: {:#}",
                e
            );
        }
    }
}

/// Ein vollständiger Abgleich mit dem WebDAV-Ordner. `audit`: Audit-Log für übernommene
/// Änderungen (in Tests `None`). Der zurückgegebene Bericht dient nur der Anzeige; die
/// Audit-Einträge sind bereits geschrieben.
pub async fn run_sync(
    db: &Mutex<Database>,
    client: &WebDavClient,
    audit: Option<&AuditLogger>,
) -> Result<SyncOutcome> {
    // Lokaler Zustand (nur DB)
    let (role, first_done, stored_etags, device_id) = {
        let db = db.lock().await;
        (
            db.get_device_role().await?,
            db.is_first_sync_done().await?,
            db.get_remote_etags().await?,
            db.get_device_id(),
        )
    };
    let Some(role) = role else {
        return Ok(SyncOutcome::NotConfigured);
    };
    let first_desktop_sync = role == ROLE_DESKTOP && !first_done;
    let own_name = snapshot_file_name(&device_id);

    // 1. Verzeichnis lesen, Versatz übernehmen
    let listing = client
        .list_entries()
        .await
        .context("Server-Verzeichnis konnte nicht gelesen werden")?;
    if let Some(offset) = listing.offset_ms {
        db.lock().await.set_clock_offset_ms(offset).await?;
    }
    let entries = listing.value;

    // 2. Fremde Gesamtstände laden (Netz, ohne DB-Sperre)
    let mut etags: HashMap<String, String> = stored_etags
        .iter()
        .filter(|(name, _)| entries.iter().any(|e| &e.name == *name))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let mut remotes = Vec::new();
    // Eine fremde Datei, die sich nicht laden lässt, blockiert den Abgleich nicht; sie könnte
    // aber ein (neuerer) Laptop-Stand sein → der erste Abgleich eines Desktops wartet dann.
    let mut download_failed = false;
    for entry in entries
        .iter()
        .filter(|e| is_snapshot_file(&e.name) && e.name != own_name)
    {
        let unchanged = matches!(
            (&entry.etag, stored_etags.get(&entry.name)),
            (Some(now), Some(before)) if now == before
        );
        if unchanged && !first_desktop_sync {
            continue;
        }
        let bytes = match client.download(&entry.name).await {
            Ok(r) => r.value,
            Err(e) => {
                eprintln!(
                    "Abgleich: {} konnte nicht geladen werden, übersprungen: {:#}",
                    entry.name, e
                );
                etags.remove(&entry.name);
                download_failed = true;
                continue;
            }
        };
        match decode(&bytes) {
            Ok(snap) if snap.device_id == device_id => {
                eprintln!(
                    "Abgleich: {} übersprungen (enthält den Stand dieses Geräts)",
                    entry.name
                );
                etags.remove(&entry.name);
            }
            Ok(snap) => remotes.push(Remote {
                name: entry.name.clone(),
                etag: entry.etag.clone(),
                snap,
            }),
            Err(e) => {
                eprintln!("Abgleich: {} übersprungen: {:#}", entry.name, e);
                etags.remove(&entry.name);
            }
        }
    }

    // 3./4. Zusammenführen bzw. erster Abgleich des Desktops (nur DB)
    let mut total = MergeReport::default();
    {
        let db = db.lock().await;
        // Rolle und ersten Abgleich unter der Sperre erneut lesen: wurde die Rolle während des
        // Netzwerk-Schritts geändert, gilt dieser Durchlauf nicht (nichts ersetzen/ändern).
        let role_now = db.get_device_role().await?;
        if role_now.as_deref() != Some(role.as_str()) {
            anyhow::bail!(
                "Geräterolle wurde während des Abgleichs geändert; Abgleich wird wiederholt"
            );
        }
        let first_done_now = db.is_first_sync_done().await?;
        if first_desktop_sync && !first_done_now {
            if download_failed {
                return Ok(SyncOutcome::WaitingForLaptop);
            }
            let Some(laptop_idx) = newest_laptop(&remotes) else {
                let any_desktop = remotes
                    .iter()
                    .any(|r| r.snap.device_role.as_deref() == Some(ROLE_DESKTOP));
                return Ok(if any_desktop {
                    SyncOutcome::NoLaptopFound
                } else {
                    SyncOutcome::WaitingForLaptop
                });
            };
            let laptop = &remotes[laptop_idx];
            if db.has_business_data().await? {
                let backup = db.backup_before_first_sync().await?;
                println!("Erster Abgleich: Sicherungskopie {}", backup.display());
            }
            let report = replace_with_snapshot(&db, &laptop.snap)
                .await
                .with_context(|| format!("Stand vom Laptop ({}) übernehmen", laptop.name))?;
            let (students, observations) = counts(&laptop.snap);
            println!(
                "Erster Abgleich: lokaler Stand durch {} ersetzt ({} Schüler, {} Beobachtungen)",
                laptop.name, students, observations
            );
            write_audit(audit, &report).await;
            add_report(&mut total, report);
            if let Some(tag) = &laptop.etag {
                etags.insert(laptop.name.clone(), tag.clone());
            }
            for (i, remote) in remotes.iter().enumerate() {
                if i != laptop_idx {
                    merge_one(&db, remote, audit, &mut total, &mut etags).await;
                }
            }
        } else {
            for remote in &remotes {
                merge_one(&db, remote, audit, &mut total, &mut etags).await;
            }
        }
        if !first_done_now {
            db.set_first_sync_done().await?;
        }
        db.set_remote_etags(&etags).await?;
    }

    // 5. Eigenen Stand bauen (DB), nur bei Änderung hochladen (Netz)
    let (bytes, hash, last_hash) = {
        let db = db.lock().await;
        let (orphan_students, orphan_observations) = db.snapshot_orphan_counts().await?;
        if orphan_students + orphan_observations > 0 {
            eprintln!(
                "Abgleich: {} Schüler ohne Klasse und {} Beobachtungen ohne Schüler werden nicht übertragen",
                orphan_students, orphan_observations
            );
        }
        let snap = build_snapshot(&db, Some(role.clone()), None).await?;
        (
            encode(&snap),
            content_hash(&snap),
            db.get_last_upload_hash().await?,
        )
    };
    let own_on_server = entries.iter().any(|e| e.name == own_name);
    if last_hash.as_deref() != Some(hash.as_str()) || !own_on_server {
        client
            .upload_atomic(&own_name, bytes)
            .await
            .with_context(|| format!("{} konnte nicht hochgeladen werden", own_name))?;
        db.lock().await.set_last_upload_hash(&hash).await?;
        println!("Abgleich: eigener Stand hochgeladen ({})", own_name);
    }

    // 6. Eigene alte Änderungsdateien löschen (A11); Fehler nicht fatal
    let legacy_prefix = format!("changeset_{}_", device_id);
    for entry in entries
        .iter()
        .filter(|e| e.name.starts_with(&legacy_prefix) && e.name.ends_with(".dat"))
    {
        match client.delete(&entry.name).await {
            Ok(_) => println!("Abgleich: alte Änderungsdatei {} gelöscht", entry.name),
            Err(e) => eprintln!(
                "Abgleich: alte Änderungsdatei {} nicht gelöscht: {:#}",
                entry.name, e
            ),
        }
    }

    // 7. Erfolgreichen Abgleich vermerken
    db.lock().await.update_last_sync_timestamp().await?;
    Ok(SyncOutcome::Synced(total))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::Arc;
    use tempfile::TempDir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    // -----------------------------------------------------------------------------------------
    // In-Memory-WebDAV (PROPFIND/GET/PUT/MOVE/DELETE)

    #[derive(Default)]
    struct DavState {
        files: BTreeMap<String, (Vec<u8>, u64)>,
        version: u64,
        log: Vec<(String, String)>,
        /// GET auf diese Dateien → 403.
        fail: std::collections::HashSet<String>,
        /// GET meldet sich hier an und wartet auf Freigabe.
        gate: Option<Arc<Gate>>,
        /// Verzögerung jedes GET (ms).
        get_delay_ms: u64,
    }

    #[derive(Default)]
    struct Gate {
        arrived: tokio::sync::Notify,
        release: tokio::sync::Notify,
    }

    #[derive(Clone)]
    struct FakeDav {
        url: String,
        state: Arc<std::sync::Mutex<DavState>>,
    }

    impl FakeDav {
        async fn start() -> Self {
            Self::start_on(TcpListener::bind("127.0.0.1:0").await.unwrap())
        }

        fn start_on(listener: TcpListener) -> Self {
            let addr = listener.local_addr().unwrap();
            let state = Arc::new(std::sync::Mutex::new(DavState::default()));
            let st = state.clone();
            tokio::spawn(async move {
                while let Ok((sock, _)) = listener.accept().await {
                    let st = st.clone();
                    tokio::spawn(async move { serve(sock, st).await });
                }
            });
            Self {
                url: format!("http://{}/dav", addr),
                state,
            }
        }

        fn client(&self) -> WebDavClient {
            WebDavClient::new(self.url.clone(), "u".into(), "p".into())
        }

        fn put_raw(&self, name: &str, data: &[u8]) {
            let mut s = self.state.lock().unwrap();
            s.version += 1;
            let v = s.version;
            s.files.insert(name.to_string(), (data.to_vec(), v));
        }

        fn get(&self, name: &str) -> Option<Vec<u8>> {
            self.state
                .lock()
                .unwrap()
                .files
                .get(name)
                .map(|f| f.0.clone())
        }

        fn names(&self) -> Vec<String> {
            self.state.lock().unwrap().files.keys().cloned().collect()
        }

        fn count(&self, method: &str) -> usize {
            self.state
                .lock()
                .unwrap()
                .log
                .iter()
                .filter(|(m, _)| m == method)
                .count()
        }

        fn clear_log(&self) {
            self.state.lock().unwrap().log.clear();
        }
    }

    fn file_name_of(path: &str) -> String {
        let last = path.rsplit('/').next().unwrap_or("");
        urlencoding::decode(last).unwrap_or_default().to_string()
    }

    async fn serve(mut sock: tokio::net::TcpStream, state: Arc<std::sync::Mutex<DavState>>) {
        let mut data = Vec::new();
        let mut chunk = [0u8; 8192];
        let header_end = loop {
            let n = sock.read(&mut chunk).await.unwrap_or(0);
            if n == 0 {
                return;
            }
            data.extend_from_slice(&chunk[..n]);
            if let Some(p) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                break p;
            }
        };
        let head = String::from_utf8_lossy(&data[..header_end]).to_string();
        let mut lines = head.lines();
        let mut first = lines.next().unwrap().split_whitespace();
        let method = first.next().unwrap().to_string();
        let path = first.next().unwrap().to_string();
        let headers: HashMap<String, String> = lines
            .filter_map(|l| l.split_once(':'))
            .map(|(k, v)| (k.trim().to_lowercase(), v.trim().to_string()))
            .collect();
        let len: usize = headers
            .get("content-length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let mut body = data[header_end + 4..].to_vec();
        while body.len() < len {
            let n = sock.read(&mut chunk).await.unwrap_or(0);
            if n == 0 {
                break;
            }
            body.extend_from_slice(&chunk[..n]);
        }

        if method == "GET" {
            let (gate, delay) = {
                let s = state.lock().unwrap();
                (s.gate.clone(), s.get_delay_ms)
            };
            if let Some(gate) = gate {
                gate.arrived.notify_one();
                gate.release.notified().await;
            }
            if delay > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }
        }
        let (status, resp_body): (u16, Vec<u8>) = {
            let mut s = state.lock().unwrap();
            s.log.push((method.clone(), path.clone()));
            let name = file_name_of(&path);
            match method.as_str() {
                "PROPFIND" => {
                    let mut xml = String::from(
                        r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href></d:response>"#,
                    );
                    for (n, (_, v)) in &s.files {
                        xml.push_str(&format!(
                            r#"<d:response><d:href>/dav/{}</d:href><d:propstat><d:prop><d:getetag>"v{}"</d:getetag></d:prop></d:propstat></d:response>"#,
                            urlencoding::encode(n),
                            v
                        ));
                    }
                    xml.push_str("</d:multistatus>");
                    (207, xml.into_bytes())
                }
                "GET" if s.fail.contains(&name) => (403, Vec::new()),
                "GET" => match s.files.get(&name) {
                    Some((d, _)) => (200, d.clone()),
                    None => (404, Vec::new()),
                },
                "PUT" => {
                    s.version += 1;
                    let v = s.version;
                    s.files.insert(name, (body, v));
                    (201, Vec::new())
                }
                "MOVE" => {
                    let dest =
                        file_name_of(headers.get("destination").map(|d| d.as_str()).unwrap_or(""));
                    match s.files.remove(&name) {
                        Some((d, _)) => {
                            s.version += 1;
                            let v = s.version;
                            s.files.insert(dest, (d, v));
                            (201, Vec::new())
                        }
                        None => (404, Vec::new()),
                    }
                }
                "DELETE" => match s.files.remove(&name) {
                    Some(_) => (204, Vec::new()),
                    None => (404, Vec::new()),
                },
                _ => (405, Vec::new()),
            }
        };
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT");
        let mut resp = format!(
            "HTTP/1.1 {} X\r\nDate: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            status,
            date,
            resp_body.len()
        )
        .into_bytes();
        resp.extend_from_slice(&resp_body);
        let _ = sock.write_all(&resp).await;
        let _ = sock.shutdown().await;
    }

    // -----------------------------------------------------------------------------------------
    // Testgeräte

    struct Device {
        db: Mutex<Database>,
        dir: TempDir,
    }

    async fn device(id: &str, role: Option<&str>) -> Device {
        let dir = TempDir::new().unwrap();
        let db = Database::open_for_test(&dir.path().join("t.db"), id, 0)
            .await
            .unwrap();
        if let Some(role) = role {
            db.set_device_role(role).await.unwrap();
        }
        Device {
            db: Mutex::new(db),
            dir,
        }
    }

    impl Device {
        async fn sync(&self, dav: &FakeDav) -> Result<SyncOutcome> {
            run_sync(&self.db, &dav.client(), None).await
        }

        /// Fachlicher Stand ohne gerätespezifische Kopfdaten, nach UUID sortiert.
        async fn rows(&self) -> crate::snapshot::SnapshotRows {
            let db = self.db.lock().await;
            let mut r = db.all_rows_for_snapshot().await.unwrap();
            r.categories.sort_by(|a, b| a.uuid.cmp(&b.uuid));
            r.classes.sort_by(|a, b| a.uuid.cmp(&b.uuid));
            r.students.sort_by(|a, b| a.uuid.cmp(&b.uuid));
            r.observations.sort_by(|a, b| a.uuid.cmp(&b.uuid));
            r
        }

        /// Legt Klasse, Schüler und Beobachtung an; liefert die Schüler-ID.
        async fn seed(&self, class: &str, first: &str, text: &str) -> i64 {
            let db = self.db.lock().await;
            let c = db
                .create_class(class.into(), "2026/27".into())
                .await
                .unwrap();
            let s = db
                .create_student(c.id, first.into(), "Muster".into(), None)
                .await
                .unwrap();
            db.create_observation(s.id, 1, "Sozial".into(), text.into(), vec![])
                .await
                .unwrap();
            s.id
        }

        async fn observation_texts(&self) -> Vec<String> {
            let db = self.db.lock().await;
            let mut v: Vec<String> = db
                .search_observations(None, None, None)
                .await
                .unwrap()
                .into_iter()
                .map(|o| o.text)
                .collect();
            v.sort();
            v
        }

        fn backups(&self) -> Vec<String> {
            std::fs::read_dir(self.dir.path())
                .unwrap()
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| n.contains(".vor-erstabgleich-") && n.ends_with(".bak"))
                .collect()
        }
    }

    fn synced(o: SyncOutcome) -> MergeReport {
        match o {
            SyncOutcome::Synced(r) => r,
            other => panic!("erwartet Synced, war {:?}", other),
        }
    }

    // -----------------------------------------------------------------------------------------
    // Tests


    // -----------------------------------------------------------------------------------------
    // Probelauf der Umstellung (ISA §5)

    /// Inhalt aller fachlichen Altspalten (Speichertyp inklusive) als Prüfsumme je Tabelle:
    /// (Zeilenzahl, SHA-256).
    async fn legacy_checksums(
        path: &std::path::Path,
    ) -> Vec<(&'static str, usize, String)> {
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;
        let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.display()))
            .unwrap()
            .foreign_keys(false);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        let tables: [(&str, &str); 4] = [
            ("classes", "id, name, school_year, created_at, updated_at, source_device_id"),
            (
                "students",
                "id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id",
            ),
            (
                "categories",
                "id, name, color, background_color, text_color, is_active, sort_order, created_at, updated_at, source_device_id",
            ),
            (
                "observations",
                "id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id",
            ),
        ];
        let mut out = Vec::new();
        for (t, cols) in tables {
            let expr = cols
                .split(", ")
                .map(|c| format!("quote({})", c))
                .collect::<Vec<_>>()
                .join(" || char(31) || ");
            let rows: Vec<String> =
                sqlx::query_scalar(&format!("SELECT {} FROM {} ORDER BY id", expr, t))
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            let mut h = Sha256::new();
            for r in &rows {
                h.update(r.as_bytes());
                h.update([30u8]);
            }
            out.push((t, rows.len(), format!("{:x}", h.finalize())));
        }
        pool.close().await;
        out
    }

    /// Realistische Altdatenbank: 3 Klassen, 30 Schüler (einer `deleted`), 8 Kategorien mit
    /// eigenen Farben, 320 Beobachtungen mit gemischten Zeitstempelformaten.
    async fn build_realistic_legacy_db(path: &std::path::Path) {
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;
        let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.display()))
            .unwrap()
            .create_if_missing(true)
            .foreign_keys(false);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        for sql in crate::database::tests::sync_v2_migration::LEGACY_SCHEMA {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
        let ts = |i: usize| -> String {
            let day = 1 + i % 27;
            let hour = i % 24;
            match i % 4 {
                0 => format!("2025-10-{:02} {:02}:15:00", day, hour),
                1 => format!("2025-10-{:02}T{:02}:15:00.123Z", day, hour),
                2 => format!("2025-10-{:02}T{:02}:15:00+02:00", day, hour),
                _ => format!("2025-10-{:02} {:02}:15:00.456", day, hour),
            }
        };
        for c in 1..=3 {
            sqlx::query("INSERT INTO classes (id, name, school_year, created_at, updated_at, source_device_id) VALUES (?,?,?,?,?,?)")
                .bind(c as i64)
                .bind(format!("{}a", 4 + c))
                .bind("2025/26")
                .bind(ts(c))
                .bind(ts(c + 1))
                .bind("laptop-1")
                .execute(&pool)
                .await
                .unwrap();
        }
        for s in 1..=30usize {
            sqlx::query("INSERT INTO students (id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id) VALUES (?,?,?,?,?,?,?,?)")
                .bind(s as i64)
                .bind(((s - 1) % 3 + 1) as i64)
                .bind(format!("Vorname{}", s))
                .bind(if s % 7 == 0 { format!("O'Brien-Ünal{}", s) } else { format!("Nachname{}", s) })
                .bind(if s == 13 { "deleted" } else { "active" })
                .bind(ts(s))
                .bind(ts(s + 2))
                .bind("laptop-1")
                .execute(&pool)
                .await
                .unwrap();
        }
        let colours = [
            ("Sozial", "#10B981", "#D1FAE5", "#065F46"),
            ("Fachlich", "#123456", "#ABCDEF", "#FEDCBA"),
            ("Verhalten", "#F59E0B", "#FEF3C7", "#92400E"),
            ("Förderung", "#8B5CF6", "#EDE9FE", "#5B21B6"),
            ("Elterngespräch", "#EF4444", "#FEE2E2", "#7F1D1D"),
            ("Lernstand", "#0EA5E9", "#E0F2FE", "#0C4A6E"),
            ("Arbeitsverhalten", "#14B8A6", "#CCFBF1", "#134E4A"),
            ("Sonstiges", "#6B7280", "#F3F4F6", "#374151"),
        ];
        for (i, (n, c, b, t)) in colours.iter().enumerate() {
            sqlx::query("INSERT INTO categories (id, name, color, background_color, text_color, is_active, sort_order, created_at, updated_at, source_device_id) VALUES (?,?,?,?,?,?,?,?,?,?)")
                .bind((i + 1) as i64)
                .bind(*n)
                .bind(*c)
                .bind(*b)
                .bind(*t)
                .bind(if *n == "Sonstiges" { 0 } else { 1 })
                .bind((i + 1) as i64)
                .bind(ts(i))
                .bind(ts(i))
                .bind("laptop-1")
                .execute(&pool)
                .await
                .unwrap();
        }
        for o in 1..=320usize {
            sqlx::query("INSERT INTO observations (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id) VALUES (?,?,?,?,?,?,?,?,?)")
                .bind(o as i64)
                .bind(((o - 1) % 30 + 1) as i64)
                .bind(1i64)
                .bind(colours[o % colours.len()].0)
                .bind(format!("Beobachtung {} – „Text“ mit ' und\nZeilenumbruch", o))
                .bind(if o % 5 == 0 { "[\"team\",\"a\"]" } else { "[]" })
                .bind(ts(o))
                .bind(ts(o + 3))
                .bind(if o % 10 == 0 { "desktop-old" } else { "laptop-1" })
                .execute(&pool)
                .await
                .unwrap();
        }
        pool.close().await;
    }

    #[tokio::test]
    #[ignore = "Probelauf der Umstellung; mit --ignored --nocapture ausführen"]
    async fn test_rehearsal_migration_300_observations() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("t.db");
        build_realistic_legacy_db(&path).await;
        let before = legacy_checksums(&path).await;
        assert_eq!(before[3].1, 320);

        // Umstellung beim Öffnen
        let t0 = std::time::Instant::now();
        let db = Database::open_for_test(&path, "laptop-1", 0).await.unwrap();
        let migrate_ms = t0.elapsed().as_millis();
        db.set_device_role("laptop").await.unwrap();

        // Zeilenzahlen und Inhalt aller fachlichen Altspalten unverändert
        let after = legacy_checksums(&path).await;
        assert_eq!(before, after, "Inhalt nach Umstellung verändert");
        for (t, n, sum) in &after {
            println!("MIGRATION {t}: {n} Zeilen, sha256 {sum}");
        }
        // Eindeutige UUID in jeder Zeile
        for t in ["classes", "students", "categories", "observations"] {
            let (total, distinct): (i64, i64) = sqlx::query_as(&format!(
                "SELECT COUNT(*), COUNT(DISTINCT uuid) FROM {t} WHERE uuid IS NOT NULL AND uuid <> ''"
            ))
            .fetch_one(db.pool())
            .await
            .unwrap();
            let rows: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {t}"))
                .fetch_one(db.pool())
                .await
                .unwrap();
            assert_eq!((total, distinct), (rows, rows), "{t}");
        }
        let deleted_students: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM students WHERE status = 'deleted'")
                .fetch_one(db.pool())
                .await
                .unwrap();
        assert_eq!(deleted_students, 1);

        // Sicherungskopie existiert, lässt sich öffnen und entspricht dem Vorzustand
        let baks: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                let n = p.file_name().unwrap().to_string_lossy().to_string();
                n.contains(".vor-sync-v2-") && n.ends_with(".bak")
            })
            .collect();
        assert_eq!(baks.len(), 1);
        assert_eq!(legacy_checksums(&baks[0]).await, before, ".bak weicht vom Vorzustand ab");
        println!(
            "MIGRATION Dauer {} ms, .bak {} Bytes",
            migrate_ms,
            std::fs::metadata(&baks[0]).unwrap().len()
        );

        // Laptop -> Desktop über den Fake-WebDAV
        let laptop = Device {
            db: Mutex::new(db),
            dir,
        };
        let desktop = device("desktop-1", Some("desktop")).await;
        desktop.seed("alt", "Veraltet", "veraltet").await;
        let dav = FakeDav::start().await;
        let t1 = std::time::Instant::now();
        synced(laptop.sync(&dav).await.unwrap());
        let up_ms = t1.elapsed().as_millis();
        let size = dav.get("snapshot_laptop-1.json").unwrap().len();
        let t2 = std::time::Instant::now();
        synced(desktop.sync(&dav).await.unwrap());
        let down_ms = t2.elapsed().as_millis();
        assert_eq!(desktop.rows().await, laptop.rows().await);
        assert_eq!(desktop.observation_texts().await.len(), 320);
        assert_eq!(desktop.backups().len(), 1);
        let r = laptop.rows().await;
        println!(
            "SYNC Laptop->Desktop: Gesamtstand {} Bytes, Hochladen {} ms, Desktop-Ersetzen {} ms; \
             Zeilen cls {} / std {} / cat {} / obs {}",
            size,
            up_ms,
            down_ms,
            r.classes.len(),
            r.students.len(),
            r.categories.len(),
            r.observations.len()
        );
        // Zweiter Lauf auf beiden Seiten: keine Änderung
        let r1 = synced(laptop.sync(&dav).await.unwrap());
        let r2 = synced(desktop.sync(&dav).await.unwrap());
        assert_eq!(r1.inserted + r1.updated, 0);
        assert_eq!(r2.inserted + r2.updated, 0);
        assert_eq!(desktop.rows().await, laptop.rows().await);
    }


    // -----------------------------------------------------------------------------------------
    // Echter WebDAV-Server (PROPFIND-Parsing, ETag, Date, MOVE)

    /// Laptop/Desktop-Ablauf von `test_desktop_waits_then_replaces_once` plus Löschweitergabe
    /// gegen den WebDAV-Server unter `url`. Eindeutige Geräte-IDs; Aufräumen am Ende.
    async fn roundtrip_scenario(url: &str) {
        let stamp = chrono::Utc::now().timestamp_millis();
        let lid = format!("laptop-e2e-{stamp}");
        let did = format!("desktop-e2e-{stamp}");
        let client = || WebDavClient::new(url.to_string(), "u".into(), "p".into());
        let laptop = device(&lid, Some("laptop")).await;
        let desktop = device(&did, Some("desktop")).await;
        desktop.seed("alt", "Veraltet", "veraltet").await;
        let sid = laptop.seed("5a", "Max", "vom Laptop").await;

        let before = desktop.rows().await;
        assert_eq!(
            run_sync(&desktop.db, &client(), None).await.unwrap(),
            SyncOutcome::WaitingForLaptop
        );
        assert_eq!(desktop.rows().await, before);

        synced(run_sync(&laptop.db, &client(), None).await.unwrap());
        // Serverzeit-Versatz aus dem echten Date-Header gespeichert und plausibel
        assert!(laptop.db.lock().await.clock_offset_ms().abs() < 60_000);
        synced(run_sync(&desktop.db, &client(), None).await.unwrap());
        assert_eq!(desktop.rows().await, laptop.rows().await);
        assert_eq!(desktop.observation_texts().await, vec!["vom Laptop".to_string()]);
        assert_eq!(desktop.backups().len(), 1);

        // Zweiter Lauf: ETag unverändert -> nichts zu tun
        let r = synced(run_sync(&desktop.db, &client(), None).await.unwrap());
        assert_eq!(r.inserted + r.updated + r.tombstoned, 0);

        // Desktop-Änderung kommt am Laptop an
        {
            let db = desktop.db.lock().await;
            let s = db.get_students().await.unwrap()[0].id;
            db.create_observation(s, 1, "Sozial".into(), "neu am Desktop".into(), vec![])
                .await
                .unwrap();
        }
        synced(run_sync(&desktop.db, &client(), None).await.unwrap());
        synced(run_sync(&laptop.db, &client(), None).await.unwrap());
        assert_eq!(
            laptop.observation_texts().await,
            vec!["neu am Desktop".to_string(), "vom Laptop".to_string()]
        );

        // Löschen am Laptop kommt am Desktop an
        laptop.db.lock().await.delete_student(sid, true).await.unwrap();
        synced(run_sync(&laptop.db, &client(), None).await.unwrap());
        synced(run_sync(&desktop.db, &client(), None).await.unwrap());
        assert!(desktop.db.lock().await.get_students().await.unwrap().is_empty());
        assert_eq!(desktop.rows().await, laptop.rows().await);

        // Aufräumen auf dem Server
        for id in [&lid, &did] {
            let _ = client().delete(&format!("snapshot_{id}.json")).await;
        }
    }

    #[tokio::test]
    async fn test_roundtrip_scenario_against_fake_dav() {
        let dav = FakeDav::start().await;
        roundtrip_scenario(&dav.url).await;
        assert!(dav.names().is_empty(), "Aufräumen: {:?}", dav.names());
    }

    #[tokio::test]
    #[ignore = "braucht echten WebDAV-Server: SYNC_E2E_WEBDAV_URL=http://127.0.0.1:8765/ ..."]
    async fn test_real_webdav_roundtrip() {
        let Ok(url) = std::env::var("SYNC_E2E_WEBDAV_URL") else {
            eprintln!("SYNC_E2E_WEBDAV_URL nicht gesetzt, übersprungen");
            return;
        };
        roundtrip_scenario(&url).await;
    }

    #[tokio::test]
    async fn test_laptop_then_desktop_end_to_end() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        let desktop = device("desktop-1", Some("desktop")).await;
        laptop.seed("5a", "Max", "vom Laptop").await;

        synced(laptop.sync(&dav).await.unwrap());
        assert!(dav.names().contains(&"snapshot_laptop-1.json".to_string()));

        synced(desktop.sync(&dav).await.unwrap());
        assert_eq!(desktop.rows().await, laptop.rows().await);
        // Leerer Desktop: keine Sicherungskopie
        assert!(desktop.backups().is_empty());

        // Desktop bearbeitet, beide synchronisieren
        {
            let db = desktop.db.lock().await;
            let s = db.get_students().await.unwrap()[0].id;
            db.create_observation(s, 1, "Sozial".into(), "vom Desktop".into(), vec![])
                .await
                .unwrap();
        }
        synced(desktop.sync(&dav).await.unwrap());
        let r = synced(laptop.sync(&dav).await.unwrap());
        assert_eq!(r.inserted, 1);
        assert_eq!(
            laptop.observation_texts().await,
            vec!["vom Desktop".to_string(), "vom Laptop".to_string()]
        );
        assert_eq!(desktop.rows().await, laptop.rows().await);
        // Zeitpunkt des Abgleichs gespeichert (A6)
        assert!(laptop
            .db
            .lock()
            .await
            .get_last_sync_timestamp()
            .await
            .unwrap()
            .is_some());
    }

    #[tokio::test]
    async fn test_desktop_waits_then_replaces_once() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        let desktop = device("desktop-1", Some("desktop")).await;
        desktop.seed("alt", "Veraltet", "veraltet").await;
        laptop.seed("5a", "Max", "vom Laptop").await;

        // Desktop zuerst: wartet, lädt nichts hoch, ändert nichts
        let before = desktop.rows().await;
        assert_eq!(
            desktop.sync(&dav).await.unwrap(),
            SyncOutcome::WaitingForLaptop
        );
        assert_eq!(dav.count("PUT"), 0);
        assert!(dav.names().is_empty());
        assert_eq!(desktop.rows().await, before);
        assert!(!desktop.db.lock().await.is_first_sync_done().await.unwrap());

        synced(laptop.sync(&dav).await.unwrap());
        synced(desktop.sync(&dav).await.unwrap());
        assert_eq!(desktop.rows().await, laptop.rows().await);
        assert_eq!(
            desktop.observation_texts().await,
            vec!["vom Laptop".to_string()]
        );
        assert_eq!(
            desktop.backups().len(),
            1,
            "Sicherungskopie vor dem Ersetzen"
        );
        assert!(desktop.db.lock().await.is_first_sync_done().await.unwrap());

        // Danach: eigene Beobachtung wird zusammengeführt, nicht ersetzt
        {
            let db = desktop.db.lock().await;
            let s = db.get_students().await.unwrap()[0].id;
            db.create_observation(s, 1, "Sozial".into(), "neu am Desktop".into(), vec![])
                .await
                .unwrap();
        }
        // Laptop ändert ebenfalls etwas, damit sein Stand neu geladen wird
        laptop.seed("6b", "Erika", "zweite vom Laptop").await;
        synced(laptop.sync(&dav).await.unwrap());
        synced(desktop.sync(&dav).await.unwrap());
        assert_eq!(
            desktop.observation_texts().await,
            vec![
                "neu am Desktop".to_string(),
                "vom Laptop".to_string(),
                "zweite vom Laptop".to_string()
            ]
        );
        assert_eq!(desktop.backups().len(), 1, "keine zweite Ersetzung");
        synced(laptop.sync(&dav).await.unwrap());
        assert_eq!(desktop.rows().await, laptop.rows().await);
    }

    #[tokio::test]
    async fn test_two_laptops_merge_without_replace() {
        let dav = FakeDav::start().await;
        let a = device("laptop-a", Some("laptop")).await;
        let b = device("laptop-b", Some("laptop")).await;
        a.seed("5a", "Anna", "von A").await;
        b.seed("7c", "Bert", "von B").await;

        synced(a.sync(&dav).await.unwrap());
        synced(b.sync(&dav).await.unwrap());
        synced(a.sync(&dav).await.unwrap());
        let both = vec!["von A".to_string(), "von B".to_string()];
        assert_eq!(a.observation_texts().await, both);
        assert_eq!(b.observation_texts().await, both);
        assert_eq!(a.rows().await, b.rows().await);
        assert!(a.backups().is_empty() && b.backups().is_empty());
    }

    #[tokio::test]
    async fn test_two_desktops_report_no_laptop() {
        let dav = FakeDav::start().await;
        let d1 = device("desktop-1", Some("desktop")).await;
        let d2 = device("desktop-2", Some("desktop")).await;
        d1.seed("5a", "Anna", "d1").await;
        d2.seed("5b", "Bert", "d2").await;

        assert_eq!(d1.sync(&dav).await.unwrap(), SyncOutcome::WaitingForLaptop);
        assert_eq!(d2.sync(&dav).await.unwrap(), SyncOutcome::WaitingForLaptop);
        assert!(dav.names().is_empty());

        // Ein Desktop-Stand liegt vor (z.B. von einem früher als Laptop eingestellten Gerät,
        // das inzwischen Desktop ist), aber kein Laptop-Stand → "Kein Laptop gefunden".
        let snap = {
            let db = d2.db.lock().await;
            build_snapshot(&db, Some(ROLE_DESKTOP.into()), None)
                .await
                .unwrap()
        };
        dav.put_raw("snapshot_desktop-2.json", &encode(&snap));
        let before = d1.rows().await;
        assert_eq!(d1.sync(&dav).await.unwrap(), SyncOutcome::NoLaptopFound);
        assert_eq!(d1.rows().await, before);
        assert_eq!(dav.names(), vec!["snapshot_desktop-2.json".to_string()]);
    }

    #[tokio::test]
    async fn test_role_unknown_is_not_configured() {
        let dav = FakeDav::start().await;
        let d = device("dev-1", None).await;
        assert_eq!(d.sync(&dav).await.unwrap(), SyncOutcome::NotConfigured);
        assert_eq!(
            dav.count("PUT") + dav.count("DELETE") + dav.count("MOVE"),
            0
        );
    }

    #[tokio::test]
    async fn test_sync_without_server_leaves_data_untouched() {
        let laptop = device("laptop-1", Some("laptop")).await;
        laptop.seed("5a", "Max", "Text").await;
        laptop
            .db
            .lock()
            .await
            .set_clock_offset_ms(1234)
            .await
            .unwrap();
        let before = laptop.rows().await;

        // Geschlossener Port
        let port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let client = WebDavClient::new(
            format!("http://127.0.0.1:{}/dav", port),
            "u".into(),
            "p".into(),
        );
        assert!(run_sync(&laptop.db, &client, None).await.is_err());
        assert_eq!(laptop.rows().await, before);
        let db = laptop.db.lock().await;
        assert_eq!(db.clock_offset_ms(), 1234);
        assert!(db.get_last_sync_timestamp().await.unwrap().is_none());
        assert!(!db.is_first_sync_done().await.unwrap());
    }

    #[tokio::test]
    async fn test_sync_skips_corrupt_and_foreign_files() {
        let dav = FakeDav::start().await;
        let other = device("laptop-b", Some("laptop")).await;
        other.seed("5a", "Max", "gültig").await;
        synced(other.sync(&dav).await.unwrap());

        dav.put_raw("snapshot_kaputt.json", b"{nicht json");
        let mut bad: serde_json::Value =
            serde_json::from_slice(&dav.get("snapshot_laptop-b.json").unwrap()).unwrap();
        bad["data"]["device_id"] = serde_json::json!("manipuliert");
        dav.put_raw("snapshot_manipuliert.json", bad.to_string().as_bytes());
        dav.put_raw("changeset_laptop-b_20250101_000000.dat", b"alt");
        dav.put_raw("notizen.txt", b"egal");

        let me = device("laptop-a", Some("laptop")).await;
        let r = synced(me.sync(&dav).await.unwrap());
        assert!(r.inserted >= 3);
        assert_eq!(me.observation_texts().await, vec!["gültig".to_string()]);
        // Fremde Dateien bleiben unangetastet
        for n in [
            "snapshot_kaputt.json",
            "changeset_laptop-b_20250101_000000.dat",
            "notizen.txt",
        ] {
            assert!(dav.names().contains(&n.to_string()), "{n}");
        }
        // Kaputte Dateien werden beim nächsten Mal erneut versucht (kein ETag gemerkt)
        let etags = me.db.lock().await.get_remote_etags().await.unwrap();
        assert!(etags.contains_key("snapshot_laptop-b.json"));
        assert!(!etags.contains_key("snapshot_kaputt.json"));
        assert!(!etags.contains_key("snapshot_manipuliert.json"));
    }

    #[tokio::test]
    async fn test_unchanged_state_is_not_reuploaded() {
        let dav = FakeDav::start().await;
        let a = device("laptop-a", Some("laptop")).await;
        let b = device("laptop-b", Some("laptop")).await;
        a.seed("5a", "Max", "Text").await;
        synced(a.sync(&dav).await.unwrap());
        synced(b.sync(&dav).await.unwrap());
        synced(a.sync(&dav).await.unwrap());

        dav.clear_log();
        synced(a.sync(&dav).await.unwrap());
        assert_eq!(dav.count("PUT"), 0, "kein Hochladen ohne Änderung");
        assert_eq!(
            dav.count("GET"),
            0,
            "unveränderte fremde Datei nicht erneut geladen"
        );

        // Nach einer Änderung wird wieder hochgeladen
        a.seed("5b", "Erika", "Neu").await;
        synced(a.sync(&dav).await.unwrap());
        assert_eq!(dav.count("PUT"), 1);
    }

    #[tokio::test]
    async fn test_own_legacy_changesets_deleted() {
        let dav = FakeDav::start().await;
        let a = device("laptop-a", Some("laptop")).await;
        dav.put_raw("changeset_laptop-a_20250101_000000.dat", b"alt1");
        dav.put_raw("changeset_laptop-a_20250102_000000.dat", b"alt2");
        dav.put_raw("changeset_laptop-b_20250101_000000.dat", b"fremd");
        synced(a.sync(&dav).await.unwrap());
        assert_eq!(
            dav.names(),
            vec![
                "changeset_laptop-b_20250101_000000.dat".to_string(),
                "snapshot_laptop-a.json".to_string()
            ]
        );
    }

    #[tokio::test]
    async fn test_delete_propagates_between_devices() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        let desktop = device("desktop-1", Some("desktop")).await;
        let sid = laptop.seed("5a", "Max", "Text").await;
        synced(laptop.sync(&dav).await.unwrap());
        synced(desktop.sync(&dav).await.unwrap());
        assert_eq!(
            desktop.db.lock().await.get_students().await.unwrap().len(),
            1
        );

        laptop
            .db
            .lock()
            .await
            .delete_student(sid, true)
            .await
            .unwrap();
        synced(laptop.sync(&dav).await.unwrap());
        let r = synced(desktop.sync(&dav).await.unwrap());
        assert!(r.tombstoned >= 1);
        let db = desktop.db.lock().await;
        assert!(db.get_students().await.unwrap().is_empty());
        assert!(db
            .search_observations(None, None, None)
            .await
            .unwrap()
            .is_empty());
        drop(db);
        // Löschvermerk vorhanden, ohne Inhalt
        let rows = desktop.rows().await;
        assert_eq!(rows.students.len(), 1);
        assert!(rows.students[0].deleted_at.is_some());
        assert_eq!(rows.students[0].first_name, "");
        assert!(rows.observations.iter().all(|o| o.deleted_at.is_some()));
    }

    fn manager(dav_url: &str, lock: &Arc<Mutex<()>>) -> Arc<crate::webdav_sync::WebDavSyncManager> {
        let m = Arc::new(crate::webdav_sync::WebDavSyncManager::new(lock.clone()));
        m.set_credentials(dav_url.to_string(), "u".into(), "p".into());
        m
    }

    #[tokio::test]
    async fn test_concurrent_syncs_replace_only_once() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        laptop.seed("5a", "Max", "vom Laptop").await;
        synced(laptop.sync(&dav).await.unwrap());

        let desktop = device("desktop-1", Some("desktop")).await;
        desktop.seed("alt", "Veraltet", "veraltet").await;
        dav.state.lock().unwrap().get_delay_ms = 150;

        // Alter Manager (Startabgleich) und neuer Manager (Einstellungen erneut gespeichert)
        let lock = Arc::new(Mutex::new(()));
        let old = manager(&dav.url, &lock);
        let new = manager(&dav.url, &lock);
        let (a, b) = tokio::join!(
            old.sync_now(&desktop.db, None),
            new.sync_now(&desktop.db, None)
        );
        synced(a.unwrap());
        synced(b.unwrap());
        assert_eq!(desktop.backups().len(), 1, "genau eine Ersetzung");
        assert_eq!(
            desktop.observation_texts().await,
            vec!["vom Laptop".to_string()]
        );
        assert_eq!(desktop.rows().await, laptop.rows().await);
    }

    #[tokio::test]
    async fn test_shutdown_sync_skips_when_another_sync_runs() {
        let dav = FakeDav::start().await;
        let me = device("laptop-1", Some("laptop")).await;
        let lock = Arc::new(Mutex::new(()));
        let m = manager(&dav.url, &lock);
        let _busy = lock.lock().await;
        let started = std::time::Instant::now();
        let r = m
            .sync_on_shutdown(&me.db, None, std::time::Duration::from_secs(10))
            .await;
        assert!(matches!(r, crate::webdav_sync::ShutdownSync::Busy), "{:?}", r);
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
        assert!(dav.state.lock().unwrap().log.is_empty(), "kein Netzwerkzugriff");
    }

    #[tokio::test]
    async fn test_shutdown_sync_times_out_and_releases_lock() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        laptop.seed("5a", "Max", "vom Laptop").await;
        synced(laptop.sync(&dav).await.unwrap());

        let desktop = device("desktop-1", Some("desktop")).await;
        let gate = Arc::new(Gate::default());
        dav.state.lock().unwrap().gate = Some(gate.clone()); // Herunterladen hängt
        let lock = Arc::new(Mutex::new(()));
        let m = manager(&dav.url, &lock);
        let r = m
            .sync_on_shutdown(&desktop.db, None, std::time::Duration::from_millis(300))
            .await;
        assert!(matches!(r, crate::webdav_sync::ShutdownSync::TimedOut), "{:?}", r);
        assert!(lock.try_lock().is_ok(), "Sperre wieder frei");
        assert!(!desktop.db.lock().await.is_first_sync_done().await.unwrap());
        dav.state.lock().unwrap().gate = None;
        gate.release.notify_one();
    }

    #[tokio::test]
    async fn test_shutdown_sync_runs_when_idle() {
        let dav = FakeDav::start().await;
        let me = device("laptop-1", Some("laptop")).await;
        me.seed("5a", "Max", "eigene").await;
        let lock = Arc::new(Mutex::new(()));
        let m = manager(&dav.url, &lock);
        let r = m
            .sync_on_shutdown(&me.db, None, std::time::Duration::from_secs(10))
            .await;
        match r {
            crate::webdav_sync::ShutdownSync::Done(Ok(outcome)) => {
                synced(outcome);
            }
            other => panic!("{:?}", other),
        }
        assert!(dav.names().contains(&"snapshot_laptop-1.json".to_string()));
    }

    #[tokio::test]
    async fn test_spawn_sync_after_role_choice_runs_immediately() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        laptop.seed("5a", "Max", "vom Laptop").await;
        synced(laptop.sync(&dav).await.unwrap());

        let dir = TempDir::new().unwrap();
        let db = Database::open_for_test(&dir.path().join("t.db"), "desktop-1", 0)
            .await
            .unwrap();
        db.set_device_role("desktop").await.unwrap();
        let db = Arc::new(Mutex::new(db));
        let lock = Arc::new(Mutex::new(()));
        let m = manager(&dav.url, &lock);
        m.clone().spawn_sync(db.clone(), None, "Rollenwahl").await.unwrap();
        assert_eq!(m.get_last_outcome().as_deref(), Some("synced"));
        assert!(db.lock().await.is_first_sync_done().await.unwrap());
    }

    #[tokio::test]
    async fn test_role_change_to_laptop_mid_sync_prevents_replace() {
        let dav = FakeDav::start().await;
        let laptop = device("laptop-1", Some("laptop")).await;
        laptop.seed("5a", "Max", "vom Laptop").await;
        synced(laptop.sync(&dav).await.unwrap());

        let desktop = Arc::new(device("desktop-1", Some("desktop")).await);
        desktop.seed("alt", "Veraltet", "vorhanden").await;
        let before = desktop.rows().await;
        let gate = Arc::new(Gate::default());
        dav.state.lock().unwrap().gate = Some(gate.clone());

        let (d, client) = (desktop.clone(), dav.client());
        let run = tokio::spawn(async move { run_sync(&d.db, &client, None).await });
        // Abgleich hängt im Herunterladen; Rolle wird jetzt auf Laptop geändert
        gate.arrived.notified().await;
        desktop
            .db
            .lock()
            .await
            .set_device_role("laptop")
            .await
            .unwrap();
        dav.state.lock().unwrap().gate = None;
        gate.release.notify_one();

        assert!(run.await.unwrap().is_err());
        assert_eq!(desktop.rows().await, before, "nichts ersetzt");
        assert!(desktop.backups().is_empty());
        assert!(!desktop.db.lock().await.is_first_sync_done().await.unwrap());

        // Nächster Durchlauf als Laptop: zusammenführen, eigene Daten bleiben
        synced(desktop.sync(&dav).await.unwrap());
        assert_eq!(
            desktop.observation_texts().await,
            vec!["vom Laptop".to_string(), "vorhanden".to_string()]
        );
        assert!(desktop.backups().is_empty());
    }

    #[tokio::test]
    async fn test_failing_foreign_download_does_not_block_sync() {
        let dav = FakeDav::start().await;
        let other = device("laptop-b", Some("laptop")).await;
        other.seed("5a", "Max", "gültig").await;
        synced(other.sync(&dav).await.unwrap());
        dav.put_raw("snapshot_gesperrt.json", b"egal");
        dav.state
            .lock()
            .unwrap()
            .fail
            .insert("snapshot_gesperrt.json".into());

        // Laptop: Datei übersprungen, Rest zusammengeführt, eigener Stand hochgeladen
        let me = device("laptop-a", Some("laptop")).await;
        me.seed("6b", "Erika", "eigene").await;
        synced(me.sync(&dav).await.unwrap());
        assert_eq!(
            me.observation_texts().await,
            vec!["eigene".to_string(), "gültig".to_string()]
        );
        assert!(dav.names().contains(&"snapshot_laptop-a.json".to_string()));
        let etags = me.db.lock().await.get_remote_etags().await.unwrap();
        assert!(!etags.contains_key("snapshot_gesperrt.json"));
        // Wiederholung: wird erneut versucht, blockiert weiterhin nicht
        dav.clear_log();
        synced(me.sync(&dav).await.unwrap());
        assert_eq!(dav.count("GET"), 1);

        // Desktop beim ersten Abgleich: unlesbare Datei könnte ein Laptop sein → warten
        let desktop = device("desktop-1", Some("desktop")).await;
        desktop.seed("alt", "Veraltet", "veraltet").await;
        let before = desktop.rows().await;
        dav.clear_log();
        assert_eq!(
            desktop.sync(&dav).await.unwrap(),
            SyncOutcome::WaitingForLaptop
        );
        assert_eq!(dav.count("PUT"), 0);
        assert_eq!(desktop.rows().await, before);
        assert!(desktop.backups().is_empty());

        // Datei wieder lesbar (hier: entfernt) → Desktop übernimmt
        dav.state
            .lock()
            .unwrap()
            .files
            .remove("snapshot_gesperrt.json");
        synced(desktop.sync(&dav).await.unwrap());
        assert!(desktop.db.lock().await.is_first_sync_done().await.unwrap());
    }

    #[tokio::test]
    async fn test_manager_from_stored_credentials_retries_when_server_returns() {
        let laptop = device("laptop-1", Some("laptop")).await;
        laptop.seed("5a", "Max", "Text").await;
        let port = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            l.local_addr().unwrap().port()
        };
        let url = format!("http://127.0.0.1:{}/dav", port);
        let m = manager(&url, &Arc::new(Mutex::new(())));
        // Server beim Start nicht erreichbar: Manager trotzdem eingerichtet, Fehler gemeldet
        assert!(m.is_configured());
        assert!(m.sync_now(&laptop.db, None).await.is_err());
        assert_eq!(m.get_last_outcome().as_deref(), Some("error"));

        // Server wieder da → nächster Durchlauf gelingt
        let dav = FakeDav::start_on(TcpListener::bind(("127.0.0.1", port)).await.unwrap());
        synced(m.sync_now(&laptop.db, None).await.unwrap());
        assert_eq!(m.get_last_outcome().as_deref(), Some("synced"));
        assert!(dav.names().contains(&"snapshot_laptop-1.json".to_string()));
    }

    #[test]
    fn test_newest_laptop_by_generated_at() {
        let mk = |id: &str, role: Option<&str>, at: &str| Remote {
            name: format!("snapshot_{id}.json"),
            etag: None,
            snap: Snapshot {
                format: crate::snapshot::SNAPSHOT_FORMAT.into(),
                schema_version: crate::snapshot::SNAPSHOT_SCHEMA_VERSION,
                device_id: id.into(),
                device_role: role.map(String::from),
                device_name: None,
                generated_at: at.into(),
                rows: Default::default(),
            },
        };
        let remotes = vec![
            mk("l1", Some("laptop"), "2026-11-17T10:00:00.000Z"),
            mk("d1", Some("desktop"), "2026-11-17T12:00:00.000Z"),
            mk("l2", Some("laptop"), "2026-11-17T11:00:00.000Z"),
            mk("x", None, "2026-11-17T13:00:00.000Z"),
        ];
        assert_eq!(newest_laptop(&remotes), Some(2));
        assert_eq!(newest_laptop(&remotes[1..2]), None);
    }

    #[test]
    fn test_outcome_serialization() {
        let r = MergeReport {
            inserted: 1,
            updated: 2,
            tombstoned: 3,
            skipped: 4,
            changes: vec![],
        };
        assert_eq!(
            serde_json::to_value(SyncOutcome::Synced(r)).unwrap(),
            serde_json::json!({"outcome": "synced", "report": {"inserted": 1, "updated": 2, "tombstoned": 3, "skipped": 4}})
        );
        assert_eq!(
            serde_json::to_value(SyncOutcome::WaitingForLaptop).unwrap(),
            serde_json::json!({"outcome": "waiting_for_laptop"})
        );
        assert_eq!(SyncOutcome::NoLaptopFound.as_str(), "no_laptop_found");
        assert_eq!(SyncOutcome::NotConfigured.as_str(), "not_configured");
    }

    #[test]
    fn test_role_suggestion() {
        assert_eq!(role_suggestion(Some("notebook")), Some("laptop"));
        assert_eq!(role_suggestion(Some("computer")), Some("desktop"));
        assert_eq!(role_suggestion(None), None);
        assert_eq!(role_suggestion(Some("unknown")), None);
        assert_eq!(role_suggestion(Some("")), None);
    }
}
