use anyhow::{Context, Result};
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

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

    /// Test WebDAV connection
    pub async fn test_connection(&self) -> Result<bool> {
        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &self.base_url)
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "0")
            .send()
            .await;

        match response {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// List all files in WebDAV directory
    pub async fn list_files(&self) -> Result<Vec<String>> {
        println!("🔍 Querying WebDAV URL: {}", self.base_url);
        let response = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND")?, &self.base_url)
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "1")
            .header("Content-Type", "application/xml")
            .body(r#"<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>"#)
            .send()
            .await
            .context("Failed to send PROPFIND request")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "PROPFIND failed with status: {}",
                response.status()
            ));
        }

        println!("✅ PROPFIND response status: {}", response.status());
        let body = response.text().await?;
        println!("📄 WebDAV response (first 500 chars): {}", &body.chars().take(500).collect::<String>());
        let files = self.parse_webdav_listing(&body)?;
        println!("📂 Parsed {} file(s) from WebDAV", files.len());

        Ok(files)
    }

    /// Download file from WebDAV
    pub async fn download_file(&self, filename: &str) -> Result<Vec<u8>> {
        let url = format!("{}/{}", self.base_url.trim_end_matches('/'), filename);

        let response = self
            .client
            .get(&url)
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .context("Failed to download file")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Download failed with status: {}",
                response.status()
            ));
        }

        let data = response.bytes().await?.to_vec();
        Ok(data)
    }

    /// Upload file to WebDAV
    pub async fn upload_file(&self, filename: &str, data: Vec<u8>) -> Result<()> {
        let url = format!("{}/{}", self.base_url.trim_end_matches('/'), filename);

        let response = self
            .client
            .put(&url)
            .basic_auth(&self.username, Some(&self.password))
            .body(data)
            .send()
            .await
            .context("Failed to upload file")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Upload failed with status: {}",
                response.status()
            ));
        }

        Ok(())
    }

    /// Delete file from WebDAV
    pub async fn delete_file(&self, filename: &str) -> Result<()> {
        let url = format!("{}/{}", self.base_url.trim_end_matches('/'), filename);

        let response = self
            .client
            .delete(&url)
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .context("Failed to delete file")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Delete failed with status: {}",
                response.status()
            ));
        }

        Ok(())
    }

    /// Parse WebDAV PROPFIND XML response
    fn parse_webdav_listing(&self, xml: &str) -> Result<Vec<String>> {
        use quick_xml::events::Event;
        use quick_xml::Reader;

        let mut reader = Reader::from_str(xml);
        reader.trim_text(true);

        let mut files = Vec::new();
        let mut in_href = false;
        let mut current_href = String::new();

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e))
                    if e.name().as_ref() == b"d:href" || e.name().as_ref() == b"href" =>
                {
                    in_href = true;
                    current_href.clear();
                }
                Ok(Event::Text(e)) if in_href => {
                    let text = e.unescape().unwrap_or_default();
                    current_href.push_str(&text);
                }
                Ok(Event::End(e))
                    if (e.name().as_ref() == b"d:href" || e.name().as_ref() == b"href")
                        && in_href =>
                {
                    in_href = false;
                    // Extract filename from href (handle URL encoded paths)
                    println!("🔗 Found href: {}", current_href);
                    if let Some(filename) = current_href.split('/').last() {
                        let decoded = urlencoding::decode(filename).unwrap_or_default();
                        println!("  → Extracted filename: '{}'", decoded);
                        if !decoded.is_empty() && decoded.starts_with("changeset_") {
                            println!("  ✅ Adding to files list: {}", decoded);
                            files.push(decoded.to_string());
                        } else if !decoded.is_empty() {
                            println!("  ❌ Skipped (not a changeset file)");
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    eprintln!("XML parse error: {}", e);
                    break;
                }
                _ => {}
            }
            buf.clear();
        }

        Ok(files)
    }
}

/// Sync manager for bidirectional WebDAV synchronization
pub struct WebDavSyncManager {
    webdav_client: Arc<Mutex<Option<WebDavClient>>>,
    device_id: String,
    last_sync: Arc<Mutex<Option<chrono::DateTime<chrono::Utc>>>>,
}

impl WebDavSyncManager {
    pub fn new(device_id: String) -> Self {
        Self {
            webdav_client: Arc::new(Mutex::new(None)),
            device_id,
            last_sync: Arc::new(Mutex::new(None)),
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
        if !client.test_connection().await? {
            return Err(anyhow::anyhow!("WebDAV connection test failed"));
        }

        let mut webdav_client = self.webdav_client.lock().await;
        *webdav_client = Some(client);

        Ok(())
    }

    /// Check if WebDAV is configured
    pub async fn is_configured(&self) -> bool {
        self.webdav_client.lock().await.is_some()
    }

    /// Sync on app startup
    pub async fn sync_on_startup<ExportFut, ImportFut>(
        &self,
        export_changeset_fn: impl Fn() -> ExportFut,
        import_changeset_fn: impl Fn(Vec<u8>) -> ImportFut,
    ) -> Result<()>
    where
        ExportFut: std::future::Future<Output = Result<Vec<u8>>>,
        ImportFut: std::future::Future<Output = Result<()>>,
    {
        if !self.is_configured().await {
            println!("WebDAV not configured, skipping startup sync");
            return Ok(());
        }

        println!("🔄 Starting synchronization on app startup...");

        // Import from WebDAV
        self.sync_from_webdav(import_changeset_fn).await?;

        // Export to WebDAV
        self.sync_to_webdav(export_changeset_fn).await?;

        println!("✅ Startup synchronization completed");
        Ok(())
    }

    /// Start background sync task (every 3 minutes)
    pub fn start_background_sync<ExportFn, ImportFn, ExportFut, ImportFut>(
        self: Arc<Self>,
        export_changeset_fn: ExportFn,
        import_changeset_fn: ImportFn,
    )
    where
        ExportFn: Fn() -> ExportFut + Send + Sync + 'static,
        ImportFn: Fn(Vec<u8>) -> ImportFut + Send + Sync + 'static,
        ExportFut: std::future::Future<Output = Result<Vec<u8>>> + Send,
        ImportFut: std::future::Future<Output = Result<()>> + Send,
    {
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(180)); // 3 minutes

            loop {
                interval.tick().await;

                if !self.is_configured().await {
                    continue;
                }

                match self
                    .sync_bidirectional(&export_changeset_fn, &import_changeset_fn)
                    .await
                {
                    Ok(_) => println!("✅ Background sync successful"),
                    Err(e) => eprintln!("⚠️ Background sync error: {}", e),
                }
            }
        });
    }

    /// Sync on app shutdown
    pub async fn sync_on_shutdown<ExportFut>(
        &self,
        export_changeset_fn: impl Fn() -> ExportFut,
    ) -> Result<()>
    where
        ExportFut: std::future::Future<Output = Result<Vec<u8>>>,
    {
        if !self.is_configured().await {
            println!("WebDAV not configured, skipping shutdown sync");
            return Ok(());
        }

        println!("🔄 Final synchronization before shutdown...");
        self.sync_to_webdav(export_changeset_fn).await?;
        println!("✅ Shutdown sync completed");
        Ok(())
    }

    /// Bidirectional sync
    async fn sync_bidirectional<ExportFn, ImportFn, ExportFut, ImportFut>(
        &self,
        export_changeset_fn: &ExportFn,
        import_changeset_fn: &ImportFn,
    ) -> Result<()>
    where
        ExportFn: Fn() -> ExportFut + Sync,
        ImportFn: Fn(Vec<u8>) -> ImportFut + Sync,
        ExportFut: std::future::Future<Output = Result<Vec<u8>>>,
        ImportFut: std::future::Future<Output = Result<()>>,
    {
        // Import from WebDAV
        self.sync_from_webdav(import_changeset_fn).await?;

        // Export to WebDAV
        self.sync_to_webdav(export_changeset_fn).await?;

        // Update last sync timestamp
        let mut last_sync = self.last_sync.lock().await;
        *last_sync = Some(chrono::Utc::now());

        Ok(())
    }

    /// Import changesets from WebDAV
    async fn sync_from_webdav<ImportFn, ImportFut>(
        &self,
        import_changeset_fn: ImportFn,
    ) -> Result<()>
    where
        ImportFn: Fn(Vec<u8>) -> ImportFut,
        ImportFut: std::future::Future<Output = Result<()>>,
    {
        let webdav_client_guard = self.webdav_client.lock().await;
        let webdav_client = webdav_client_guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("WebDAV not configured"))?;

        // List all files on WebDAV
        let files = webdav_client.list_files().await?;

        let mut imported_count = 0;
        println!("🔑 Current device ID: {}", self.device_id);
        println!("📂 Found {} file(s) on WebDAV to process", files.len());

        for filename in files {
            println!("📄 Processing: {}", filename);
            // Skip our own changesets
            if filename.contains(&self.device_id) {
                println!("  ⏭️ Skipping own changeset: {}", filename);
                continue;
            }
            println!("  📥 Will attempt to import: {}", filename);

            // Download and import changeset
            match webdav_client.download_file(&filename).await {
                Ok(data) => {
                    match import_changeset_fn(data).await {
                        Ok(_) => {
                            println!("✅ Imported: {}", filename);
                            imported_count += 1;

                            // Optionally delete imported changeset to keep WebDAV clean
                            // let _ = webdav_client.delete_file(&filename).await;
                        }
                        Err(e) => {
                            eprintln!("⚠️ Failed to import {}: {}", filename, e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("⚠️ Failed to download {}: {}", filename, e);
                }
            }
        }

        if imported_count > 0 {
            println!("📥 Imported {} changeset(s) from WebDAV", imported_count);
        } else {
            println!("ℹ️ No new changesets to import from WebDAV");
        }

        Ok(())
    }

    /// Export changesets to WebDAV
    async fn sync_to_webdav<ExportFn, ExportFut>(
        &self,
        export_changeset_fn: ExportFn,
    ) -> Result<()>
    where
        ExportFn: Fn() -> ExportFut,
        ExportFut: std::future::Future<Output = Result<Vec<u8>>>,
    {
        let webdav_client_guard = self.webdav_client.lock().await;
        let webdav_client = webdav_client_guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("WebDAV not configured"))?;

        // Export local changeset
        let changeset_data = export_changeset_fn().await?;

        // Check if there are actual changes
        if changeset_data.is_empty() {
            println!("ℹ️ No local changes to export");
            return Ok(());
        }

        // Generate filename with timestamp
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let filename = format!("changeset_{}_{}.dat", self.device_id, timestamp);

        // Upload to WebDAV
        webdav_client.upload_file(&filename, changeset_data).await?;

        println!("📤 Exported changeset to WebDAV: {}", filename);

        Ok(())
    }

    /// Get last sync timestamp
    pub async fn get_last_sync(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        *self.last_sync.lock().await
    }
}
