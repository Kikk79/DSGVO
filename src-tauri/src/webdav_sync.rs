use crate::audit::AuditLogger;
use crate::database::Database;
use crate::sync_engine::{run_sync, SyncOutcome};
use crate::sync_time::offset_from_date_header;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use reqwest::Client;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval_at, Duration, Instant};

/// Antwort eines WebDAV-Aufrufs samt gemessenem Versatz zur Serverzeit (ms),
/// sofern die Antwort einen `Date`-Header hatte.
#[derive(Debug, Clone, PartialEq)]
pub struct DavResponse<T> {
    pub value: T,
    pub offset_ms: Option<i64>,
}

/// Eintrag eines WebDAV-Verzeichnisses; `etag` ist ersatzweise `getlastmodified`.
#[derive(Debug, Clone, PartialEq)]
pub struct DavEntry {
    pub name: String,
    pub etag: Option<String>,
}

/// WebDAV client for HTTP operations
pub struct WebDavClient {
    client: Client,
    base_url: String,
    username: String,
    password: String,
}

impl WebDavClient {
    pub fn new(base_url: String, username: String, password: String) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap(),
            base_url,
            username,
            password,
        }
    }

    fn url_for(&self, name: &str) -> String {
        format!("{}/{}", self.base_url.trim_end_matches('/'), name)
    }

    /// Messt den Versatz zur Serverzeit anhand des `Date`-Headers (falls vorhanden).
    fn measure_offset(
        resp: &reqwest::Response,
        sent: DateTime<Utc>,
        received: DateTime<Utc>,
    ) -> Option<i64> {
        let date = resp.headers().get(reqwest::header::DATE)?.to_str().ok()?;
        offset_from_date_header(date, sent, received)
    }

    /// Sendet eine Anfrage und misst dabei den Serverzeit-Versatz.
    async fn send_measured(
        &self,
        req: reqwest::RequestBuilder,
        what: &str,
    ) -> Result<(reqwest::Response, Option<i64>)> {
        let sent = Utc::now();
        let resp = req
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .with_context(|| format!("Failed to send {} request", what))?;
        let received = Utc::now();
        let offset_ms = Self::measure_offset(&resp, sent, received);
        Ok((resp, offset_ms))
    }

    /// Test WebDAV connection
    pub async fn test_connection(&self) -> Result<DavResponse<bool>> {
        let req = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &self.base_url)
            .header("Depth", "0");
        match self.send_measured(req, "PROPFIND").await {
            Ok((resp, offset_ms)) => Ok(DavResponse {
                value: resp.status().is_success(),
                offset_ms,
            }),
            Err(_) => Ok(DavResponse {
                value: false,
                offset_ms: None,
            }),
        }
    }

    /// List all entries in WebDAV directory (with ETag or last-modified fallback)
    pub async fn list_entries(&self) -> Result<DavResponse<Vec<DavEntry>>> {
        let req = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &self.base_url)
            .header("Depth", "1")
            .header("Content-Type", "application/xml")
            .body(
                r#"<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getetag/><getlastmodified/></prop></propfind>"#,
            );
        let (response, offset_ms) = self.send_measured(req, "PROPFIND").await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "PROPFIND failed with status: {}",
                response.status()
            ));
        }

        let body = response.text().await?;
        let entries = Self::parse_webdav_listing(&body)?;
        Ok(DavResponse {
            value: entries,
            offset_ms,
        })
    }

    /// Download file from WebDAV
    pub async fn download(&self, name: &str) -> Result<DavResponse<Vec<u8>>> {
        let req = self.client.get(self.url_for(name));
        let (response, offset_ms) = self.send_measured(req, "GET").await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Download failed with status: {}",
                response.status()
            ));
        }

        let value = response.bytes().await?.to_vec();
        Ok(DavResponse { value, offset_ms })
    }

    /// Plain PUT upload
    async fn put(&self, name: &str, data: Vec<u8>) -> Result<Option<i64>> {
        let req = self.client.put(self.url_for(name)).body(data);
        let (response, offset_ms) = self.send_measured(req, "PUT").await?;
        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Upload failed with status: {}",
                response.status()
            ));
        }
        Ok(offset_ms)
    }

    /// Upload atomically: PUT to `name.tmp`, then MOVE onto `name`.
    /// Falls back to a direct PUT if the server does not support MOVE (405/501).
    pub async fn upload_atomic(&self, name: &str, data: Vec<u8>) -> Result<DavResponse<()>> {
        let tmp = format!("{}.tmp", name);
        let mut offset_ms = self.put(&tmp, data.clone()).await?;

        let req = self
            .client
            .request(reqwest::Method::from_bytes(b"MOVE")?, self.url_for(&tmp))
            .header("Destination", self.url_for(name))
            .header("Overwrite", "T");
        let (response, move_offset) = self.send_measured(req, "MOVE").await?;
        offset_ms = move_offset.or(offset_ms);

        let status = response.status();
        if status.is_success() {
            return Ok(DavResponse {
                value: (),
                offset_ms,
            });
        }
        if status.as_u16() == 405 || status.as_u16() == 501 {
            let put_offset = self.put(name, data).await?;
            offset_ms = put_offset.or(offset_ms);
            let _ = self.delete(&tmp).await;
            return Ok(DavResponse {
                value: (),
                offset_ms,
            });
        }
        let _ = self.delete(&tmp).await;
        Err(anyhow::anyhow!("MOVE failed with status: {}", status))
    }

    /// Delete file from WebDAV
    pub async fn delete(&self, name: &str) -> Result<DavResponse<()>> {
        let req = self.client.delete(self.url_for(name));
        let (response, offset_ms) = self.send_measured(req, "DELETE").await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Delete failed with status: {}",
                response.status()
            ));
        }

        Ok(DavResponse {
            value: (),
            offset_ms,
        })
    }

    /// Parse WebDAV PROPFIND XML response (collections are skipped).
    fn parse_webdav_listing(xml: &str) -> Result<Vec<DavEntry>> {
        use quick_xml::events::Event;
        use quick_xml::Reader;

        fn local(name: &[u8]) -> &[u8] {
            match name.iter().position(|b| *b == b':') {
                Some(i) => &name[i + 1..],
                None => name,
            }
        }

        let mut reader = Reader::from_str(xml);
        reader.trim_text(true);

        let mut entries = Vec::new();
        let mut href = String::new();
        let mut etag: Option<String> = None;
        let mut modified: Option<String> = None;
        let mut current: Option<&'static str> = None;

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => match local(e.name().as_ref()) {
                    b"response" => {
                        href.clear();
                        etag = None;
                        modified = None;
                    }
                    b"href" => current = Some("href"),
                    b"getetag" => current = Some("etag"),
                    b"getlastmodified" => current = Some("modified"),
                    _ => {}
                },
                Ok(Event::Text(e)) => {
                    if let Some(field) = current {
                        let text = e.unescape().unwrap_or_default().trim().to_string();
                        match field {
                            "href" => href.push_str(&text),
                            "etag" => etag = Some(text),
                            _ => modified = Some(text),
                        }
                    }
                }
                Ok(Event::End(e)) => match local(e.name().as_ref()) {
                    b"href" | b"getetag" | b"getlastmodified" => current = None,
                    b"response" => {
                        if !href.is_empty() && !href.ends_with('/') {
                            if let Some(last) = href.split('/').last() {
                                let name =
                                    urlencoding::decode(last).unwrap_or_default().to_string();
                                let id = etag.take().filter(|s| !s.is_empty()).or(modified.take());
                                if !name.is_empty() && !name.ends_with(".tmp") {
                                    entries.push(DavEntry { name, etag: id });
                                }
                            }
                        }
                    }
                    _ => {}
                },
                Ok(Event::Eof) => break,
                Err(e) => {
                    eprintln!("XML parse error: {}", e);
                    break;
                }
                _ => {}
            }
            buf.clear();
        }

        Ok(entries)
    }
}

/// Hält die WebDAV-Verbindung und löst Abgleiche aus (Start, alle 3 Minuten, Beenden,
/// manuell). Jeder Abgleich läuft über `sync_engine::run_sync`; Abgleiche laufen nie parallel.
///
/// Sperr-Reihenfolge: `run_lock` → Datenbank. Die Datenbank wird in `run_sync` nur kurz für
/// reine DB-Schritte gesperrt; niemand hält die Datenbank und wartet auf `run_lock`.
pub struct WebDavSyncManager {
    client: std::sync::Mutex<Option<Arc<WebDavClient>>>,
    run_lock: Mutex<()>,
    stopped: AtomicBool,
    last_sync: std::sync::Mutex<Option<DateTime<Utc>>>,
    last_outcome: std::sync::Mutex<Option<String>>,
}

impl Default for WebDavSyncManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WebDavSyncManager {
    pub fn new() -> Self {
        Self {
            client: std::sync::Mutex::new(None),
            run_lock: Mutex::new(()),
            stopped: AtomicBool::new(false),
            last_sync: std::sync::Mutex::new(None),
            last_outcome: std::sync::Mutex::new(None),
        }
    }

    /// Configure WebDAV connection
    pub async fn configure(
        &self,
        base_url: String,
        username: String,
        password: String,
    ) -> Result<()> {
        let client = WebDavClient::new(base_url, username, password);

        // Test connection
        if !client.test_connection().await?.value {
            return Err(anyhow::anyhow!("WebDAV connection test failed"));
        }

        *self.client.lock().unwrap() = Some(Arc::new(client));
        Ok(())
    }

    /// Check if WebDAV is configured
    pub fn is_configured(&self) -> bool {
        self.client.lock().unwrap().is_some()
    }

    /// Beendet die Hintergrund-Schleife (bei Neukonfiguration oder Abschalten).
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }

    /// Ein Abgleich; Ergebnis wird als `last_outcome` (bzw. Zeitpunkt) gemerkt.
    pub async fn sync_now(
        &self,
        db: &Mutex<Database>,
        audit: Option<&AuditLogger>,
    ) -> Result<SyncOutcome> {
        let client = self
            .client
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| anyhow::anyhow!("WebDAV ist nicht eingerichtet"))?;
        let _running = self.run_lock.lock().await;
        let result = run_sync(db, &client, audit).await;
        match &result {
            Ok(outcome) => {
                *self.last_outcome.lock().unwrap() = Some(outcome.as_str().to_string());
                if matches!(outcome, SyncOutcome::Synced(_)) {
                    *self.last_sync.lock().unwrap() = Some(Utc::now());
                }
            }
            Err(_) => *self.last_outcome.lock().unwrap() = Some("error".to_string()),
        }
        result
    }

    /// Abgleich mit Protokollausgabe; Fehler werden nur protokolliert.
    pub async fn sync_logged(&self, db: &Mutex<Database>, audit: Option<&AuditLogger>, what: &str) {
        match self.sync_now(db, audit).await {
            Ok(outcome) => println!("Abgleich ({}): {}", what, outcome.as_str()),
            Err(e) => eprintln!("Abgleich ({}) fehlgeschlagen: {:#}", what, e),
        }
    }

    /// Hintergrund-Abgleich alle 3 Minuten (erster Lauf nach 3 Minuten).
    pub fn start_background_sync(
        self: Arc<Self>,
        db: Arc<Mutex<Database>>,
        audit: Arc<AuditLogger>,
    ) {
        tokio::spawn(async move {
            let period = Duration::from_secs(180);
            let mut ticker = interval_at(Instant::now() + period, period);
            loop {
                ticker.tick().await;
                if self.stopped.load(Ordering::SeqCst) {
                    break;
                }
                if self.is_configured() {
                    self.sync_logged(&db, Some(&audit), "Hintergrund").await;
                }
            }
        });
    }

    /// Zeitpunkt des letzten erfolgreichen Abgleichs in dieser Sitzung.
    pub fn get_last_sync(&self) -> Option<DateTime<Utc>> {
        *self.last_sync.lock().unwrap()
    }

    /// `SyncOutcome::as_str()` des letzten Abgleichs bzw. `"error"`.
    pub fn get_last_outcome(&self) -> Option<String> {
        self.last_outcome.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[derive(Debug, Clone)]
    struct Recorded {
        method: String,
        path: String,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    }

    struct Reply {
        status: u16,
        body: String,
    }

    /// Minimal fake HTTP server; every response carries a `Date` header.
    async fn fake_server<F>(
        date: &'static str,
        handler: F,
    ) -> (String, Arc<std::sync::Mutex<Vec<Recorded>>>)
    where
        F: Fn(&Recorded) -> Reply + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let log = Arc::new(std::sync::Mutex::new(Vec::new()));
        let log2 = log.clone();
        let handler = Arc::new(handler);
        tokio::spawn(async move {
            loop {
                let (mut sock, _) = match listener.accept().await {
                    Ok(x) => x,
                    Err(_) => break,
                };
                let log = log2.clone();
                let handler = handler.clone();
                tokio::spawn(async move {
                    let mut data = Vec::new();
                    let mut chunk = [0u8; 4096];
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
                    let rec = Recorded {
                        method,
                        path,
                        headers,
                        body,
                    };
                    let reply = handler(&rec);
                    log.lock().unwrap().push(rec);
                    let resp = format!(
                        "HTTP/1.1 {} X\r\nDate: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        reply.status,
                        date,
                        reply.body.len(),
                        reply.body
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                    let _ = sock.shutdown().await;
                });
            }
        });
        (format!("http://{}/dav", addr), log)
    }

    fn client(url: String) -> WebDavClient {
        WebDavClient::new(url, "u".into(), "p".into())
    }

    const LISTING: &str = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:getlastmodified>Mon, 01 Jan 2024 00:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
 <d:response><d:href>/dav/a%20b.dat</d:href><d:propstat><d:prop><d:getetag>"abc123"</d:getetag><d:getlastmodified>Tue, 02 Jan 2024 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
 <d:response><d:href>/dav/c.dat</d:href><d:propstat><d:prop><d:getlastmodified>Wed, 03 Jan 2024 11:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
</d:multistatus>"#;

    #[tokio::test]
    async fn test_list_entries_parses_etags() {
        let (url, log) = fake_server("Mon, 01 Jan 2024 12:00:00 GMT", |_| Reply {
            status: 207,
            body: LISTING.to_string(),
        })
        .await;
        let res = client(url).list_entries().await.unwrap();
        assert_eq!(
            res.value,
            vec![
                DavEntry {
                    name: "a b.dat".into(),
                    etag: Some("\"abc123\"".into())
                },
                DavEntry {
                    name: "c.dat".into(),
                    etag: Some("Wed, 03 Jan 2024 11:00:00 GMT".into())
                },
            ]
        );
        let rec = log.lock().unwrap();
        assert_eq!(rec[0].method, "PROPFIND");
        assert_eq!(rec[0].headers.get("depth").unwrap(), "1");
        assert!(String::from_utf8_lossy(&rec[0].body).contains("getetag"));
    }

    #[tokio::test]
    async fn test_offset_measured_from_date_header() {
        // Server date far in the past => large negative offset.
        let (url, _log) = fake_server("Mon, 01 Jan 2024 12:00:00 GMT", |_| Reply {
            status: 200,
            body: "hello".into(),
        })
        .await;
        let c = client(url);
        let res = c.download("x.dat").await.unwrap();
        assert_eq!(res.value, b"hello".to_vec());
        let expected = chrono::DateTime::parse_from_rfc3339("2024-01-01T12:00:00Z")
            .unwrap()
            .timestamp_millis()
            - Utc::now().timestamp_millis();
        let off = res.offset_ms.expect("offset measured");
        assert!((off - expected).abs() < 5_000, "off={off} expected={expected}");
    }

    #[tokio::test]
    async fn test_upload_atomic_uses_move() {
        let (url, log) = fake_server("Mon, 01 Jan 2024 12:00:00 GMT", |_| Reply {
            status: 201,
            body: String::new(),
        })
        .await;
        let res = client(url.clone())
            .upload_atomic("f.dat", b"data".to_vec())
            .await
            .unwrap();
        assert!(res.offset_ms.is_some());
        let rec = log.lock().unwrap();
        assert_eq!(rec.len(), 2);
        assert_eq!(
            (rec[0].method.as_str(), rec[0].path.as_str()),
            ("PUT", "/dav/f.dat.tmp")
        );
        assert_eq!(rec[0].body, b"data".to_vec());
        assert_eq!(
            (rec[1].method.as_str(), rec[1].path.as_str()),
            ("MOVE", "/dav/f.dat.tmp")
        );
        assert_eq!(
            rec[1].headers.get("destination").unwrap(),
            &format!("{}/f.dat", url)
        );
        assert_eq!(rec[1].headers.get("overwrite").unwrap(), "T");
    }

    #[tokio::test]
    async fn test_upload_atomic_falls_back_without_move() {
        let (url, log) = fake_server("Mon, 01 Jan 2024 12:00:00 GMT", |r| Reply {
            status: match r.method.as_str() {
                "MOVE" => 405,
                "DELETE" => 204,
                _ => 201,
            },
            body: String::new(),
        })
        .await;
        client(url)
            .upload_atomic("f.dat", b"data".to_vec())
            .await
            .unwrap();
        let rec = log.lock().unwrap();
        let seq: Vec<(&str, &str)> = rec
            .iter()
            .map(|r| (r.method.as_str(), r.path.as_str()))
            .collect();
        assert_eq!(
            seq,
            vec![
                ("PUT", "/dav/f.dat.tmp"),
                ("MOVE", "/dav/f.dat.tmp"),
                ("PUT", "/dav/f.dat"),
                ("DELETE", "/dav/f.dat.tmp"),
            ]
        );
        assert_eq!(rec[2].body, b"data".to_vec());
    }

    #[tokio::test]
    async fn test_list_entries_skips_tmp_files() {
        let xml = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/dav/changeset_a_1.dat</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag></d:prop></d:propstat></d:response>
 <d:response><d:href>/dav/changeset_a_2.dat.tmp</d:href><d:propstat><d:prop><d:getetag>"2"</d:getetag></d:prop></d:propstat></d:response>
</d:multistatus>"#;
        let (url, _log) = fake_server("Mon, 01 Jan 2024 12:00:00 GMT", move |_| Reply {
            status: 207,
            body: xml.to_string(),
        })
        .await;
        let res = client(url).list_entries().await.unwrap();
        let names: Vec<String> = res.value.into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["changeset_a_1.dat".to_string()]);
    }
}
