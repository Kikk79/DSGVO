//! Einlesen alter Dateien (Sicherung `full_export`, Änderungsdatei `changeset_file_v1`) und
//! gemeinsamer Einstieg für alle Datei-Importe: erst neues Format (`snapshot_v2`), sonst
//! altes Format in einen Snapshot umwandeln, dann `merge_snapshot`.
//!
//! Alte Zeilen bekommen dieselbe abgeleitete UUID wie bei der Umstellung der Datenbank
//! (`derived_uuid(tabelle, source_device_id, id, created_at)`, fehlende `source_device_id`
//! = leerer Text), damit sie auf vorhandene Zeilen treffen statt sie zu verdoppeln.

use crate::database::Database;
use crate::merge::{merge_snapshot, MergeReport};
use crate::snapshot::{
    decode, CategoryRec, ClassRec, ObservationRec, Snapshot, SnapshotRows, StudentRec,
    SNAPSHOT_FORMAT, SNAPSHOT_SCHEMA_VERSION,
};
use crate::sync_schema::derived_uuid;
use crate::sync_time::{format_ts, parse_ts};
use anyhow::{anyhow, bail, Context, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// Ergebnis der Umwandlung: Snapshot und Zahl der übersprungenen Beobachtungen, deren
/// Schüler weder in der Datei noch lokal gefunden wurde.
#[derive(Debug)]
pub struct Converted {
    pub snapshot: Snapshot,
    pub skipped_observations: usize,
}

/// Ergebnis eines Datei-Imports.
#[derive(Debug)]
pub struct ImportOutcome {
    pub report: MergeReport,
    pub skipped_observations: usize,
}

impl ImportOutcome {
    /// `"{inserted} neu, {updated} aktualisiert, {tombstoned} gelöscht"`, ggf. mit Hinweis auf
    /// übersprungene Beobachtungen.
    pub fn summary(&self) -> String {
        let mut s = format!(
            "{} neu, {} aktualisiert, {} gelöscht",
            self.report.inserted, self.report.updated, self.report.tombstoned
        );
        if self.skipped_observations > 0 {
            s.push_str(&format!(
                " ({} Beobachtungen übersprungen: Schüler nicht vorhanden)",
                self.skipped_observations
            ));
        }
        s
    }
}

#[allow(dead_code)] // Schnittstelle laut Plan; die Befehle nutzen die Variante mit Datenbank
/// Wandelt eine alte Datei ohne Zugriff auf die lokale Datenbank um. Beobachtungen mit
/// Schülern, die nicht in der Datei stehen, werden ausgelassen.
pub fn legacy_to_snapshot(bytes: &[u8]) -> Result<Snapshot> {
    Ok(convert_legacy(bytes, &HashMap::new())?.snapshot)
}

/// Wie `legacy_to_snapshot`, löst aber unbekannte Schüler-IDs (alte Änderungsdateien)
/// gegen die lokale Datenbank auf.
pub async fn legacy_to_snapshot_with_db(db: &Database, bytes: &[u8]) -> Result<Converted> {
    let rows: Vec<(i64, Option<String>)> = sqlx::query_as("SELECT id, uuid FROM students")
        .fetch_all(db.pool())
        .await
        .context("Lokale Schüler lesen")?;
    let local: HashMap<i64, String> = rows
        .into_iter()
        .filter_map(|(id, uuid)| uuid.filter(|u| !u.is_empty()).map(|u| (id, u)))
        .collect();
    convert_legacy(bytes, &local)
}

/// Gemeinsamer Einstieg: neues Format, sonst altes Format; danach Zusammenführen.
/// Das Audit-Log schreibt der Aufrufer (`merge::log_merge_audit`) nach dem Commit.
pub async fn import_bytes(db: &Database, bytes: &[u8]) -> Result<ImportOutcome> {
    let (snapshot, skipped_observations) = match decode(bytes) {
        Ok(s) => (s, 0),
        Err(new_err) => {
            if is_snapshot_candidate(bytes) {
                // Neues Format erkannt, aber beschädigt: nicht als altes Format raten.
                return Err(new_err);
            }
            let c = legacy_to_snapshot_with_db(db, bytes).await?;
            (c.snapshot, c.skipped_observations)
        }
    };
    let report = merge_snapshot(db, &snapshot).await?;
    Ok(ImportOutcome {
        report,
        skipped_observations,
    })
}

fn is_snapshot_candidate(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Value>(bytes)
        .ok()
        .and_then(|v| {
            v.get("data")
                .and_then(|d| d.get("format"))
                .and_then(|f| f.as_str())
                .map(|f| f == SNAPSHOT_FORMAT)
        })
        .unwrap_or(false)
}

fn convert_legacy(bytes: &[u8], local_students: &HashMap<i64, String>) -> Result<Converted> {
    let parsed: Value = serde_json::from_slice(bytes).context("Datei ist kein gültiges JSON")?;
    let data = parsed
        .get("data")
        .ok_or_else(|| anyhow!("Datei: Datenteil fehlt"))?;

    let top_format = parsed.get("format").and_then(|f| f.as_str());
    let inner_format = data.get("format").and_then(|f| f.as_str());

    if top_format == Some("full_export") || data.get("students").is_some() {
        return convert_full_export(&parsed, data);
    }
    if inner_format == Some("changeset_file_v1") || data.get("changes").is_some() {
        verify_changeset_checksum(&parsed, data)?;
        return convert_changeset(data, local_students);
    }
    bail!("Datei: unbekanntes Format")
}

fn verify_changeset_checksum(parsed: &Value, data: &Value) -> Result<()> {
    let stored = parsed
        .get("checksum")
        .and_then(|c| c.as_str())
        .ok_or_else(|| anyhow!("Änderungsdatei: Prüfsumme fehlt"))?;
    let mut hasher = Sha256::new();
    hasher.update(data.to_string().as_bytes());
    if format!("{:x}", hasher.finalize()) != stored {
        bail!("Änderungsdatei: Prüfsumme stimmt nicht überein");
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Feldzugriff

fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

fn opt_s(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(|x| x.as_str())
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string())
}

fn id_of(v: &Value, key: &str, what: &str) -> Result<i64> {
    v.get(key)
        .and_then(|x| x.as_i64())
        .ok_or_else(|| anyhow!("{}: Feld '{}' fehlt", what, key))
}

/// Zeitstempel in das einheitliche Format; Unlesbares bleibt unverändert (der
/// Zusammenführer meldet es dann als fehlerhafte Datei).
fn ts(v: &Value, key: &str) -> String {
    let raw = s(v, key);
    parse_ts(&raw).map(format_ts).unwrap_or(raw)
}

struct Stamp {
    uuid: String,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    modified_by_device: String,
    source_device_id: String,
}

/// UUID und Zeitstempel einer alten Zeile. `created_at` geht roh in `derived_uuid`
/// (normalisiert dort selbst), wie bei der Datenbank-Umstellung.
fn stamp(table: &str, v: &Value, id: i64) -> Stamp {
    let source = s(v, "source_device_id");
    let created_raw = s(v, "created_at");
    let uuid = opt_s(v, "uuid").unwrap_or_else(|| derived_uuid(table, &source, id, &created_raw));
    let created_at = ts(v, "created_at");
    let updated_at = if opt_s(v, "updated_at").is_some() {
        ts(v, "updated_at")
    } else {
        created_at.clone()
    };
    let modified_by_device = opt_s(v, "modified_by_device").unwrap_or_else(|| source.clone());
    Stamp {
        uuid,
        created_at,
        updated_at,
        deleted_at: opt_s(v, "deleted_at").map(|d| parse_ts(&d).map(format_ts).unwrap_or(d)),
        modified_by_device,
        source_device_id: source,
    }
}

fn tags_of(v: &Value) -> String {
    match v.get("tags") {
        Some(Value::String(t)) => t.clone(),
        Some(Value::Null) | None => "[]".to_string(),
        Some(other) => other.to_string(),
    }
}

fn observation_rec(v: &Value, student_uuid: String) -> Result<ObservationRec> {
    let id = id_of(v, "id", "Beobachtung")?;
    let st = stamp("observations", v, id);
    Ok(ObservationRec {
        uuid: st.uuid,
        student_uuid,
        category: s(v, "category"),
        text: s(v, "text"),
        tags: tags_of(v),
        created_at: st.created_at,
        updated_at: st.updated_at,
        deleted_at: st.deleted_at,
        modified_by_device: st.modified_by_device,
        source_device_id: st.source_device_id,
    })
}

fn wrap(
    rows: SnapshotRows,
    device_id: String,
    device_name: Option<String>,
    device_role: Option<String>,
    generated_at: String,
) -> Snapshot {
    Snapshot {
        format: SNAPSHOT_FORMAT.to_string(),
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        device_id,
        device_role,
        device_name,
        generated_at,
        rows,
    }
}

// ---------------------------------------------------------------------------------------------
// full_export

fn convert_full_export(parsed: &Value, data: &Value) -> Result<Converted> {
    let list = |key: &str| -> Vec<Value> {
        data.get(key)
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default()
    };
    let mut rows = SnapshotRows::default();

    for v in list("categories") {
        let id = id_of(&v, "id", "Kategorie")?;
        let st = stamp("categories", &v, id);
        rows.categories.push(CategoryRec {
            uuid: st.uuid,
            name: s(&v, "name"),
            color: s(&v, "color"),
            background_color: s(&v, "background_color"),
            text_color: s(&v, "text_color"),
            is_active: v.get("is_active").and_then(|b| b.as_bool()).unwrap_or(true),
            sort_order: v.get("sort_order").and_then(|n| n.as_i64()).unwrap_or(0) as i32,
            created_at: st.created_at,
            updated_at: st.updated_at,
            deleted_at: st.deleted_at,
            modified_by_device: st.modified_by_device,
            source_device_id: st.source_device_id,
        });
    }

    let mut class_uuid: HashMap<i64, String> = HashMap::new();
    for v in list("classes") {
        let id = id_of(&v, "id", "Klasse")?;
        let st = stamp("classes", &v, id);
        class_uuid.insert(id, st.uuid.clone());
        rows.classes.push(ClassRec {
            uuid: st.uuid,
            name: s(&v, "name"),
            school_year: s(&v, "school_year"),
            created_at: st.created_at,
            updated_at: st.updated_at,
            deleted_at: st.deleted_at,
            modified_by_device: st.modified_by_device,
            source_device_id: st.source_device_id,
        });
    }

    let mut student_uuid: HashMap<i64, String> = HashMap::new();
    for v in list("students") {
        let id = id_of(&v, "id", "Schüler")?;
        let class_id = id_of(&v, "class_id", "Schüler")?;
        let cu = class_uuid
            .get(&class_id)
            .cloned()
            .ok_or_else(|| anyhow!("Schüler {}: Klasse {} fehlt in der Datei", id, class_id))?;
        let st = stamp("students", &v, id);
        student_uuid.insert(id, st.uuid.clone());
        rows.students.push(StudentRec {
            uuid: st.uuid,
            class_uuid: cu,
            first_name: s(&v, "first_name"),
            last_name: s(&v, "last_name"),
            status: opt_s(&v, "status").unwrap_or_else(|| "active".to_string()),
            created_at: st.created_at,
            updated_at: st.updated_at,
            deleted_at: st.deleted_at,
            modified_by_device: st.modified_by_device,
            source_device_id: st.source_device_id,
        });
    }

    let mut skipped = 0;
    for v in list("observations") {
        let sid = id_of(&v, "student_id", "Beobachtung")?;
        match student_uuid.get(&sid) {
            Some(su) => rows.observations.push(observation_rec(&v, su.clone())?),
            None => skipped += 1,
        }
    }

    let device_id = parsed
        .get("source_device")
        .map(|d| s(d, "device_id"))
        .unwrap_or_default();
    let device_name = parsed
        .get("source_device")
        .and_then(|d| opt_s(d, "device_name"));
    Ok(Converted {
        snapshot: wrap(
            rows,
            device_id,
            device_name,
            None,
            s(parsed, "timestamp"),
        ),
        skipped_observations: skipped,
    })
}

// ---------------------------------------------------------------------------------------------
// changeset_file_v1

fn convert_changeset(data: &Value, local_students: &HashMap<i64, String>) -> Result<Converted> {
    let observations = data
        .get("changes")
        .and_then(|c| c.get("observations"))
        .and_then(|o| o.as_array())
        .ok_or_else(|| anyhow!("Änderungsdatei: Beobachtungen fehlen"))?;
    let mut rows = SnapshotRows::default();
    let mut skipped = 0;
    for v in observations {
        let sid = id_of(v, "student_id", "Beobachtung")?;
        match local_students.get(&sid) {
            Some(su) => rows.observations.push(observation_rec(v, su.clone())?),
            None => skipped += 1,
        }
    }
    Ok(Converted {
        snapshot: wrap(rows, s(data, "device_id"), None, None, s(data, "timestamp")),
        skipped_observations: skipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::CryptoManager;
    use crate::snapshot::{build_snapshot, encode};
    use std::sync::Arc;
    use tempfile::TempDir;

    async fn test_db() -> (Database, TempDir) {
        let dir = TempDir::new().unwrap();
        let crypto = Arc::new(CryptoManager::new().unwrap());
        let db = Database::new(dir.path().join("t.db"), crypto).await.unwrap();
        (db, dir)
    }

    /// Alte Sicherung wie sie `export_all_data` vor Sync v2 schrieb (ohne uuid/modified_by).
    fn legacy_backup() -> Value {
        let ts = "2025-03-01T08:00:00.000Z";
        serde_json::json!({
            "format": "full_export",
            "version": "1.1",
            "timestamp": "2025-03-02T10:00:00Z",
            "source_device": {"device_id": "laptop-A", "device_name": "Laptop", "device_type": "notebook"},
            "data": {
                "classes": [{"id": 3, "name": "5a", "school_year": "2025/26",
                    "created_at": ts, "updated_at": ts, "source_device_id": "laptop-A"}],
                "students": [{"id": 4, "class_id": 3, "first_name": "Max", "last_name": "Muster",
                    "status": "active", "created_at": ts, "updated_at": ts, "source_device_id": "laptop-A"}],
                "observations": [
                    {"id": 5, "student_id": 4, "author_id": 1, "category": "Sozial", "text": "eins",
                     "tags": "[\"a\"]", "created_at": ts, "updated_at": ts, "source_device_id": "laptop-A"},
                    {"id": 6, "student_id": 4, "author_id": 1, "category": "Sozial", "text": "zwei",
                     "tags": "[]", "created_at": ts, "updated_at": ts, "source_device_id": "laptop-A"}
                ],
                "categories": [{"id": 1, "name": "Sozial", "color": "#1", "background_color": "#2",
                    "text_color": "#3", "is_active": true, "sort_order": 1,
                    "created_at": ts, "updated_at": ts, "source_device_id": ""}]
            }
        })
    }

    /// Legt die Zeilen aus `legacy_backup` so in einer Datenbank an, wie sie nach der Umstellung
    /// aus der alten Datenbank aussähen (alte IDs, `YYYY-MM-DD HH:MM:SS`-Zeitstempel, UUIDs
    /// abgeleitet wie in `assign_derived_uuids`).
    async fn migrated_db() -> (Database, TempDir) {
        let (db, dir) = test_db().await;
        let ts = "2025-03-01 08:00:00";
        let u = |t: &str, d: &str, id: i64| derived_uuid(t, d, id, ts);
        let pool = db.pool();
        sqlx::query("DELETE FROM categories").execute(pool).await.unwrap();
        sqlx::query(
            "INSERT INTO categories (id, name, color, background_color, text_color, is_active, sort_order, created_at, updated_at, source_device_id, uuid, modified_by_device) VALUES (1,'Sozial','#1','#2','#3',1,1,?,?,'',?,'')",
        )
        .bind(ts).bind(ts).bind(u("categories", "", 1))
        .execute(pool).await.unwrap();
        sqlx::query(
            "INSERT INTO classes (id, name, school_year, created_at, updated_at, source_device_id, uuid, modified_by_device) VALUES (3,'5a','2025/26',?,?,'laptop-A',?,'laptop-A')",
        )
        .bind(ts).bind(ts).bind(u("classes", "laptop-A", 3))
        .execute(pool).await.unwrap();
        sqlx::query(
            "INSERT INTO students (id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id, uuid, modified_by_device) VALUES (4,3,'Max','Muster','active',?,?,'laptop-A',?,'laptop-A')",
        )
        .bind(ts).bind(ts).bind(u("students", "laptop-A", 4))
        .execute(pool).await.unwrap();
        for (id, text) in [(5, "eins"), (6, "zwei")] {
            sqlx::query(
                "INSERT INTO observations (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id, uuid, modified_by_device) VALUES (?,4,1,'Sozial',?,'[]',?,?,'laptop-A',?,'laptop-A')",
            )
            .bind(id).bind(text).bind(ts).bind(ts).bind(u("observations", "laptop-A", id))
            .execute(pool).await.unwrap();
        }
        (db, dir)
    }

    async fn count(db: &Database, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", table))
            .fetch_one(db.pool())
            .await
            .unwrap()
    }

    fn changeset_file(observations: Vec<Value>) -> Vec<u8> {
        let data = serde_json::json!({
            "format": "changeset_file_v1", "version": "1.0",
            "timestamp": "2025-03-05T10:00:00Z", "device_id": "laptop-A", "days_back": 30,
            "changes": {"observations": observations}
        });
        let mut h = Sha256::new();
        h.update(data.to_string().as_bytes());
        serde_json::json!({"checksum": format!("{:x}", h.finalize()), "data": data})
            .to_string()
            .into_bytes()
    }

    #[tokio::test]
    async fn test_legacy_backup_matches_migrated_rows() {
        let (db, _d) = migrated_db().await;
        let before = (
            count(&db, "classes").await,
            count(&db, "students").await,
            count(&db, "observations").await,
            count(&db, "categories").await,
        );
        let out = import_bytes(&db, legacy_backup().to_string().as_bytes())
            .await
            .unwrap();
        assert_eq!(out.report.inserted, 0, "{:?}", out.report);
        assert_eq!(out.report.tombstoned, 0);
        let after = (
            count(&db, "classes").await,
            count(&db, "students").await,
            count(&db, "observations").await,
            count(&db, "categories").await,
        );
        assert_eq!(before, after);
    }

    #[tokio::test]
    async fn test_legacy_backup_into_empty_db() {
        let (db, _d) = test_db().await;
        sqlx::query("DELETE FROM categories").execute(db.pool()).await.unwrap();
        let out = import_bytes(&db, legacy_backup().to_string().as_bytes())
            .await
            .unwrap();
        assert_eq!(out.report.inserted, 5, "{:?}", out.report);
        assert_eq!(count(&db, "classes").await, 1);
        assert_eq!(count(&db, "students").await, 1);
        assert_eq!(count(&db, "observations").await, 2);
        assert_eq!(count(&db, "categories").await, 1);
        let stu = db.get_students().await.unwrap();
        assert_eq!(stu[0].first_name, "Max");
        assert_eq!(out.summary(), "5 neu, 0 aktualisiert, 0 gelöscht");
    }

    #[tokio::test]
    async fn test_legacy_changeset_import() {
        let (db, _d) = migrated_db().await;
        let ts = "2025-03-01T08:00:00.000Z";
        let edited = "2025-03-04T09:00:00.000Z";
        let file = changeset_file(vec![
            serde_json::json!({"id": 5, "student_id": 4, "author_id": 1, "category": "Sozial",
                "text": "eins bearbeitet", "tags": "[]", "created_at": ts, "updated_at": edited,
                "source_device_id": "laptop-A"}),
            serde_json::json!({"id": 6, "student_id": 4, "author_id": 1, "category": "Sozial",
                "text": "zwei", "tags": "[]", "created_at": ts, "updated_at": ts,
                "source_device_id": "laptop-A"}),
        ]);
        let out = import_bytes(&db, &file).await.unwrap();
        assert_eq!(out.report.inserted, 0, "{:?}", out.report);
        assert_eq!(out.report.updated, 1);
        assert_eq!(out.skipped_observations, 0);
        assert_eq!(count(&db, "observations").await, 2);
        let text: String = sqlx::query_scalar("SELECT text FROM observations WHERE id = 5")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(text, "eins bearbeitet");
    }

    #[tokio::test]
    async fn test_legacy_changeset_skips_unknown_student() {
        let (db, _d) = migrated_db().await;
        let ts = "2025-03-01T08:00:00.000Z";
        let file = changeset_file(vec![
            serde_json::json!({"id": 9, "student_id": 99, "author_id": 1, "category": "Sozial",
                "text": "verwaist", "tags": "[]", "created_at": ts, "updated_at": ts,
                "source_device_id": "laptop-A"}),
            serde_json::json!({"id": 5, "student_id": 4, "author_id": 1, "category": "Sozial",
                "text": "eins", "tags": "[\"a\"]", "created_at": ts, "updated_at": ts,
                "source_device_id": "laptop-A"}),
        ]);
        let out = import_bytes(&db, &file).await.unwrap();
        assert_eq!(out.skipped_observations, 1);
        assert_eq!(out.report.inserted, 0);
        assert!(out.summary().contains("1 Beobachtungen übersprungen"));
        assert_eq!(count(&db, "observations").await, 2);
    }

    #[tokio::test]
    async fn test_legacy_changeset_rejects_bad_checksum() {
        let (db, _d) = migrated_db().await;
        let mut v: Value = serde_json::from_slice(&changeset_file(vec![])).unwrap();
        v["data"]["device_id"] = serde_json::json!("manipuliert");
        assert!(import_bytes(&db, v.to_string().as_bytes()).await.is_err());
    }

    #[tokio::test]
    async fn test_backup_roundtrip_new_format() {
        let (a, _da) = migrated_db().await;
        let (b, _db) = test_db().await;
        sqlx::query("DELETE FROM categories").execute(b.pool()).await.unwrap();
        let snap = build_snapshot(&a, Some("laptop".into()), None).await.unwrap();
        let out = import_bytes(&b, &encode(&snap)).await.unwrap();
        assert_eq!(out.report.inserted, 5, "{:?}", out.report);
        assert_eq!(out.skipped_observations, 0);
        // gleicher Stand ein zweites Mal: nichts Neues
        let again = import_bytes(&b, &encode(&snap)).await.unwrap();
        assert_eq!(again.report.inserted, 0);
        assert_eq!(count(&b, "observations").await, 2);
    }

    #[tokio::test]
    async fn test_corrupt_new_format_is_not_read_as_legacy() {
        let (a, _da) = migrated_db().await;
        let snap = build_snapshot(&a, None, None).await.unwrap();
        let mut v: Value = serde_json::from_slice(&encode(&snap)).unwrap();
        v["data"]["device_id"] = serde_json::json!("manipuliert");
        let (b, _db) = test_db().await;
        let err = import_bytes(&b, v.to_string().as_bytes()).await.unwrap_err();
        assert!(err.to_string().contains("Prüfsumme"), "{err}");
    }

    #[tokio::test]
    async fn test_legacy_deleted_student_arrives_as_tombstone() {
        let (db, _d) = migrated_db().await;
        let mut b = legacy_backup();
        b["data"]["students"][0]["deleted_at"] = serde_json::json!("2025-03-03T08:00:00.000Z");
        b["data"]["students"][0]["updated_at"] = serde_json::json!("2025-03-03T08:00:00.000Z");
        let out = import_bytes(&db, b.to_string().as_bytes()).await.unwrap();
        assert!(out.report.tombstoned >= 1, "{:?}", out.report);
        assert!(db.get_students().await.unwrap().is_empty());
    }

    #[test]
    fn test_unknown_format_is_rejected() {
        assert!(legacy_to_snapshot(b"{\"data\": {\"foo\": 1}}").is_err());
        assert!(legacy_to_snapshot(b"kein json").is_err());
    }
}
