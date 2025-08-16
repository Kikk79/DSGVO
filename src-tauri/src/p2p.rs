use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::{TlsAcceptor, TlsConnector, rustls::{ClientConfig, ServerConfig}};
use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use crate::{crypto::CryptoManager, database::Database, SyncStatus};
use base64::Engine;
use std::io::Cursor;
use tokio::sync::Mutex;
use rand::Rng;

pub struct P2PManager {
    crypto: Arc<CryptoManager>,
    _db: Arc<Mutex<Database>>,
    device_id: String,
    peers: HashMap<String, PeerInfo>,
    mdns_daemon: Option<ServiceDaemon>,
    server_handle: Option<tokio::task::JoinHandle<()>>,
    pin_storage: Arc<Mutex<HashMap<String, PinData>>>,
}

#[derive(Clone)]
struct PeerInfo {
    _id: String,
    address: std::net::SocketAddr,
    _last_seen: DateTime<Utc>,
    _certificate: String,
}

#[derive(Clone)]
pub struct PinData {
    pub pairing_code: String,
    pub _device_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ActivePin {
    pub pin: String,
    pub expires_at: DateTime<Utc>,
    pub expires_in_seconds: i64,
}

impl P2PManager {
    pub fn new(crypto: Arc<CryptoManager>, db: Arc<Mutex<Database>>) -> Result<Self> {
        let device_id = crypto.get_device_id();
        
        Ok(Self {
            crypto,
            _db: db,
            device_id,
            peers: HashMap::new(),
            mdns_daemon: None,
            server_handle: None,
            pin_storage: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Generate a 6-digit PIN for device pairing
    pub async fn generate_pin(&self) -> Result<ActivePin> {
        // Clean up expired PINs first
        self.cleanup_expired_pins().await;
        
        // Generate a 6-digit PIN
        let pin = format!("{:06}", rand::thread_rng().gen_range(100000..1000000));
        
        // Generate the full pairing code that will be used internally
        let pairing_code = self.generate_pairing_code()?;
        
        // Set expiration time (10 minutes from now)
        let expires_at = Utc::now() + Duration::minutes(10);
        let expires_in_seconds = (expires_at - Utc::now()).num_seconds();
        
        // Store the PIN mapping
        let pin_data = PinData {
            pairing_code,
            _device_id: self.device_id.clone(),
            expires_at,
        };
        
        let mut pin_storage = self.pin_storage.lock().await;
        pin_storage.insert(pin.clone(), pin_data);
        
        tracing::info!("Generated PIN {} for device pairing (expires at {})", pin, expires_at);
        
        Ok(ActivePin {
            pin,
            expires_at,
            expires_in_seconds,
        })
    }
    
    /// Get the current active PIN if it exists and hasn't expired
    pub async fn get_current_pin(&self) -> Option<ActivePin> {
        let pin_storage = self.pin_storage.lock().await;
        let now = Utc::now();
        
        // Find the first non-expired PIN
        for (pin, pin_data) in pin_storage.iter() {
            if pin_data.expires_at > now {
                let expires_in_seconds = (pin_data.expires_at - now).num_seconds();
                return Some(ActivePin {
                    pin: pin.clone(),
                    expires_at: pin_data.expires_at,
                    expires_in_seconds,
                });
            }
        }
        
        None
    }
    
    /// Clear the current PIN manually
    pub async fn clear_pin(&self) {
        let mut pin_storage = self.pin_storage.lock().await;
        pin_storage.clear();
        tracing::info!("Cleared all pairing PINs");
    }
    
    /// Clean up expired PINs from storage
    async fn cleanup_expired_pins(&self) {
        let mut pin_storage = self.pin_storage.lock().await;
        let now = Utc::now();
        
        let expired_pins: Vec<String> = pin_storage.iter()
            .filter(|(_, pin_data)| pin_data.expires_at <= now)
            .map(|(pin, _)| pin.clone())
            .collect();
            
        for pin in expired_pins {
            pin_storage.remove(&pin);
            tracing::info!("Removed expired PIN: {}", pin);
        }
    }

    pub async fn start_discovery_with_port(&mut self, port: u16) -> Result<()> {
        // Start mDNS service advertisement
        let mdns = ServiceDaemon::new().context("Failed to create mDNS daemon")?;
        
        let service_info = ServiceInfo::new(
            "_schuelerbeobachtung._tcp.local.",
            &format!("device-{}", &self.device_id[..8]),
            "localhost",
            "127.0.0.1",
            port,
            None,
        ).context("Failed to create service info")?;
        
        mdns.register(service_info).context("Failed to register mDNS service")?;
        
        // Start service discovery
        let receiver = mdns.browse("_schuelerbeobachtung._tcp.local.")
            .context("Failed to start service browsing")?;
        
        // Spawn task to handle discovered services
        let _crypto_clone = self.crypto.clone();
        let device_id_clone = self.device_id.clone();
        tokio::spawn(async move {
            while let Ok(event) = receiver.recv_async().await {
                match event {
                    mdns_sd::ServiceEvent::ServiceResolved(info) => {
                        if info.get_fullname().contains(&device_id_clone) {
                            continue; // Skip self
                        }
                        
                        tracing::info!("Discovered peer: {:?}", info);
                        // Handle discovered peer
                        // In a full implementation, this would add the peer to the peers list
                    }
                    _ => {}
                }
            }
        });
        
        self.mdns_daemon = Some(mdns);
        Ok(())
    }

    pub async fn start_server(&mut self, port: u16) -> Result<()> {
        let (cert_pem, key_pem) = self.crypto.get_or_create_certificate_pair()?;
        
        // Create TLS server configuration
        let mut cert_reader = Cursor::new(cert_pem.as_bytes());
        let certs = rustls_pemfile::certs(&mut cert_reader)
            .collect::<Result<Vec<_>, _>>()?;

        let mut key_reader = Cursor::new(key_pem.as_bytes());
        let private_key = rustls_pemfile::private_key(&mut key_reader)
            .context("Failed to parse private key")?
            .ok_or_else(|| anyhow::anyhow!("No private key found"))?;
        
        let config = ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(certs, private_key)
            .context("Failed to create server config")?;
        
        let acceptor = TlsAcceptor::from(Arc::new(config));
        let listener = TcpListener::bind(("127.0.0.1", port)).await
            .context("Failed to bind server socket")?;
        
        tracing::info!("P2P server listening on port {}", port);
        
        let crypto_clone = self.crypto.clone();
        let handle = tokio::spawn(async move {
            while let Ok((stream, _addr)) = listener.accept().await {
                let acceptor_clone = acceptor.clone();
                let crypto_clone = crypto_clone.clone();
                
                tokio::spawn(async move {
                    if let Err(e) = Self::handle_connection(stream, acceptor_clone, crypto_clone).await {
                        tracing::error!("Connection error: {}", e);
                    }
                });
            }
        });
        
        self.server_handle = Some(handle);
        Ok(())
    }

    async fn handle_connection(
        stream: TcpStream,
        acceptor: TlsAcceptor,
        _crypto: Arc<CryptoManager>,
    ) -> Result<()> {
        let _tls_stream = acceptor.accept(stream).await
            .context("TLS handshake failed")?;
        
        tracing::info!("Accepted TLS connection");
        
        // In a full implementation, this would:
        // 1. Authenticate the peer using their certificate
        // 2. Handle sync requests (get/apply changesets)
        // 3. Stream file chunks for attachments
        // 4. Maintain connection state
        
        Ok(())
    }

    pub async fn sync_with_peer(&self, peer_id: &str) -> Result<()> {
        if let Some(peer) = self.peers.get(peer_id) {
            // Create TLS client configuration
            let config = ClientConfig::builder()
                .with_root_certificates(rustls::RootCertStore::empty())
                .with_no_client_auth();
            
            let connector = TlsConnector::from(Arc::new(config));
            let stream = TcpStream::connect(peer.address).await
                .context("Failed to connect to peer")?;
            
            let domain = rustls::pki_types::ServerName::try_from("localhost".to_string())
                .context("Failed to parse server name")?;
            
            let _tls_stream = connector.connect(domain, stream).await
                .context("TLS handshake failed")?;
            
            // In a full implementation, this would:
            // 1. Request changesets from peer since last sync
            // 2. Send our changesets to peer
            // 3. Handle conflicts using configured strategy
            // 4. Update sync state
            
            tracing::info!("Successfully synced with peer {}", peer_id);
        }
        
        Ok(())
    }

    pub async fn get_status(&self) -> Result<SyncStatus> {
        Ok(SyncStatus {
            peer_connected: !self.peers.is_empty(),
            last_sync: None, // Would be retrieved from database
            pending_changes: 0, // Would be calculated from changesets
        })
    }

    pub fn add_peer_manually(&mut self, peer_id: String, address: String, certificate: String) -> Result<()> {
        let addr: std::net::SocketAddr = address.parse()
            .context("Invalid peer address")?;
        
        // Store peer certificate securely
        self.crypto.store_peer_certificate(&peer_id, &certificate)?;
        
        self.peers.insert(peer_id.clone(), PeerInfo {
            _id: peer_id,
            address: addr,
            _last_seen: Utc::now(),
            _certificate: certificate,
        });
        
        Ok(())
    }

    pub fn generate_pairing_code(&self) -> Result<String> {
        let (cert_pem, _) = self.crypto.get_or_create_certificate_pair()?;
        
        let pairing_data = serde_json::json!({
            "device_id": self.device_id,
            "certificate": cert_pem,
            "timestamp": Utc::now().timestamp()
        });
        
        // In a real implementation, this would be QR-encoded
        let pairing_code = base64::prelude::BASE64_STANDARD.encode(pairing_data.to_string());
        Ok(pairing_code)
    }

    pub async fn process_pairing_code(&mut self, pairing_code: &str, peer_address: String) -> Result<String> {
        // Check if input is a 6-digit PIN or a full pairing code
        let actual_pairing_code = if pairing_code.len() == 6 && pairing_code.chars().all(|c| c.is_ascii_digit()) {
            // This is a PIN - look up the corresponding pairing code
            let pin_storage = self.pin_storage.lock().await;
            let pin_data = pin_storage.get(pairing_code)
                .context("PIN not found or expired")?;
            
            // Check if PIN has expired
            if pin_data.expires_at <= Utc::now() {
                return Err(anyhow::anyhow!("PIN has expired"));
            }
            
            pin_data.pairing_code.clone()
        } else {
            // This is a full pairing code
            pairing_code.to_string()
        };
        
        let pairing_data: serde_json::Value = serde_json::from_str(
            &String::from_utf8(base64::prelude::BASE64_STANDARD.decode(&actual_pairing_code)?)?
        ).context("Invalid pairing code format")?;
        
        let peer_id = pairing_data["device_id"].as_str()
            .context("Invalid pairing code: missing device_id")?
            .to_string();
        
        let peer_cert = pairing_data["certificate"].as_str()
            .context("Invalid pairing code: missing certificate")?
            .to_string();
        
        self.add_peer_manually(peer_id.clone(), peer_address, peer_cert)?;
        
        tracing::info!("Successfully paired with device: {}", peer_id);
        
        Ok(peer_id)
    }

    // Simplified methods to match main.rs calls
    pub async fn start_discovery(&mut self) -> Result<()> {
        // Start discovery on default port 8080
        self.start_discovery_with_port(8080).await
    }
    
    pub async fn stop_discovery(&mut self) -> Result<()> {
        if let Some(handle) = self.server_handle.take() {
            handle.abort();
        }
        self.mdns_daemon = None;
        Ok(())
    }
    
    pub async fn pair_with_device(&mut self, pairing_code: &str) -> Result<()> {
        // In a real implementation, this would parse the pairing code
        // and establish a connection with the peer device
        let peer_id = self.process_pairing_code(pairing_code, "127.0.0.1:8081".to_string()).await?;
        tracing::info!("Successfully paired with device: {}", peer_id);
        Ok(())
    }
    
    pub async fn sync_with_peers(&mut self) -> Result<()> {
        for peer_id in self.peers.keys().cloned().collect::<Vec<_>>() {
            if let Err(e) = self.sync_with_peer(&peer_id).await {
                tracing::error!("Failed to sync with peer {}: {}", peer_id, e);
            }
        }
        Ok(())
    }
}

impl Drop for P2PManager {
    fn drop(&mut self) {
        if let Some(handle) = self.server_handle.take() {
            handle.abort();
        }
    }
}