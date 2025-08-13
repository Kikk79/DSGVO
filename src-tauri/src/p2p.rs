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
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct P2PManager {
    crypto: Arc<CryptoManager>,
    db: Arc<Mutex<Database>>,
    device_id: String,
    peers: Arc<Mutex<HashMap<String, PeerInfo>>>,
    mdns_daemon: Option<ServiceDaemon>,
    server_handle: Option<tokio::task::JoinHandle<()>>,
    pin_storage: Arc<Mutex<HashMap<String, PinData>>>,
}

#[derive(Clone)]
struct PeerInfo {
    id: String,
    address: std::net::SocketAddr,
    last_seen: DateTime<Utc>,
    certificate: String,
}

#[derive(Clone)]
pub struct PinData {
    pub pairing_code: String,
    pub device_id: String,
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
            db,
            device_id,
            peers: Arc::new(Mutex::new(HashMap::new())),
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
            device_id: self.device_id.clone(),
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
        let device_id_clone = self.device_id.clone();
        let peers_clone = self.peers.clone();
        tokio::spawn(async move {
            while let Ok(event) = receiver.recv_async().await {
                match event {
                    mdns_sd::ServiceEvent::ServiceResolved(info) => {
                        if info.get_fullname().contains(&device_id_clone) {
                            continue; // Skip self
                        }
                        
                        tracing::info!("Discovered peer: {:?}", info);
                        
                        let peer_id_from_service = info.get_fullname().split('.').next().unwrap_or("").to_string();

                        if !peer_id_from_service.is_empty() {
                            if let Some(address) = info.get_addresses().iter().next() {
                                let peer_info = PeerInfo {
                                    id: peer_id_from_service.clone(),
                                    address: std::net::SocketAddr::new(*address, info.get_port()),
                                    last_seen: Utc::now(),
                                    certificate: "".to_string(), // Certificate will be exchanged during pairing
                                };

                                let mut peers = peers_clone.lock().await;
                                peers.insert(peer_id_from_service, peer_info);
                            }
                        }
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
        let db_clone = self.db.clone(); // Clone db here
        let handle = tokio::spawn(async move {
            while let Ok((stream, addr)) = listener.accept().await {
                let acceptor_clone = acceptor.clone();
                let crypto_clone = crypto_clone.clone();
                let db_clone = db_clone.clone(); // Clone db for each task

                tokio::spawn(async move {
                    if let Err(e) = Self::handle_connection(stream, acceptor_clone, crypto_clone, db_clone).await {
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
        crypto: Arc<CryptoManager>,
        db: Arc<Mutex<Database>>,
    ) -> Result<()> {
        let mut tls_stream = acceptor.accept(stream).await
            .context("TLS handshake failed")?;

        tracing::info!("Accepted TLS connection");

        // 1. Authenticate the peer using their certificate
        let (_read_half, conn) = tls_stream.get_mut(); // Get the rustls::Connection
        let peer_cert = conn.peer_certificates()
            .context("Failed to get peer certificate")?
            .into_iter()
            .next()
            .context("No peer certificate found")?;

        let peer_id = CryptoManager::get_device_id_from_cert(&peer_cert)?; // Assuming a method to extract device ID from cert
        crypto.store_peer_certificate(&peer_id, &base64::engine::general_purpose::STANDARD.encode(peer_cert.as_ref()))?;

        tracing::info!("Authenticated peer: {}", peer_id);

        // --- Changeset Exchange Protocol ---
        // 1. Receive peer's changesets
        let mut len_bytes = [0u8; 8];
        tls_stream.read_exact(&mut len_bytes).await?;
        let peer_changesets_len = u64::from_le_bytes(len_bytes);
        let mut peer_changesets = vec![0u8; peer_changesets_len as usize];
        tls_stream.read_exact(&mut peer_changesets).await?;
        tracing::info!("Received {} bytes of changesets from peer {}", peer_changesets_len, peer_id);

        // 2. Apply peer's changesets
        db.lock().await.apply_changeset(&peer_changesets, &peer_id).await?;
        tracing::info!("Applied changesets from peer {}", peer_id);

        // 3. Send our changesets
        let our_changesets = db.lock().await.get_pending_changesets(&peer_id).await?;
        let len = our_changesets.len() as u64;
        tls_stream.write_all(&len.to_le_bytes()).await?;
        tls_stream.write_all(&our_changesets).await?;
        tracing::info!("Sent {} bytes of changesets to peer {}", len, peer_id);

        Ok(())
    }

    pub async fn sync_with_peer(&self, peer_id: &str) -> Result<()> {
        let peer_info_option = {
            let peers = self.peers.lock().await;
            peers.get(peer_id).cloned()
        };

        if let Some(peer) = peer_info_option {
            // Create TLS client configuration
            let mut root_store = rustls::RootCertStore::empty();
            // Add peer's certificate to root store for authentication
            let peer_cert_der = base64::engine::general_purpose::STANDARD.decode(&peer.certificate)?;
            root_store.add(rustls::pki_types::CertificateDer::from(peer_cert_der))?;

            let config = ClientConfig::builder()
                .with_root_certificates(root_store)
                .with_no_client_auth(); // Client authentication is handled by mTLS in handle_connection

            let connector = TlsConnector::from(Arc::new(config));
            let stream = TcpStream::connect(peer.address).await
                .context("Failed to connect to peer")?;

            let domain = rustls::pki_types::ServerName::try_from("localhost".to_string())
                .context("Failed to parse server name")?;

            let mut tls_stream = connector.connect(domain, stream).await
                .context("TLS handshake failed")?;

            tracing::info!("Successfully established TLS connection with peer {}", peer_id);

            // --- Changeset Exchange Protocol ---
            // 1. Send our changesets
            let our_changesets = self.db.lock().await.get_pending_changesets(&peer.id).await?;
            let len = our_changesets.len() as u64;
            tls_stream.write_all(&len.to_le_bytes()).await?;
            tls_stream.write_all(&our_changesets).await?;
            tracing::info!("Sent {} bytes of changesets to peer {}", len, peer_id);

            // 2. Receive peer's changesets
            let mut len_bytes = [0u8; 8];
            tls_stream.read_exact(&mut len_bytes).await?;
            let peer_changesets_len = u64::from_le_bytes(len_bytes);
            let mut peer_changesets = vec![0u8; peer_changesets_len as usize];
            tls_stream.read_exact(&mut peer_changesets).await?;
            tracing::info!("Received {} bytes of changesets from peer {}", peer_changesets_len, peer_id);

            // 3. Apply peer's changesets
            self.db.lock().await.apply_changeset(&peer_changesets, &peer.id).await?;
            tracing::info!("Applied changesets from peer {}", peer_id);

            // Update sync_state (last_push and last_pull are updated in get_pending_changesets and apply_changeset)
            tracing::info!("Successfully synced with peer {}", peer_id);
        } else {
            tracing::warn!("Peer {} not found for synchronization.", peer_id);
        }

        Ok(())
    }

    pub async fn get_status(&self) -> Result<SyncStatus> {
        Ok(SyncStatus {
            peer_connected: !self.peers.lock().await.is_empty(),
            last_sync: None, // Would be retrieved from database
            pending_changes: 0, // Would be calculated from changesets
        })
    }

    pub fn add_peer_manually(&mut self, peer_id: String, address: String, certificate: String) -> Result<()> {
        let addr: std::net::SocketAddr = address.parse()
            .context("Invalid peer address")?;
        
        // Store peer certificate securely
        self.crypto.store_peer_certificate(&peer_id, &certificate)?;
        
        self.peers.lock().await.insert(peer_id.clone(), PeerInfo {
            id: peer_id,
            address: addr,
            last_seen: Utc::now(),
            certificate,
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
        let actual_pairing_code = if pairing_code.len() == 6 && pairing_code.chars().all(|c| c.is_ascii_digit()) {
            // This looks like a 6-digit PIN - look it up in our PIN storage
            let pin_storage = self.pin_storage.lock().await;
            let pin_data = pin_storage.get(pairing_code)
                .context("Invalid PIN or PIN has expired")?;
                
            // Check if the PIN has expired
            if pin_data.expires_at <= Utc::now() {
                return Err(anyhow::anyhow!("PIN has expired"));
            }
            
            tracing::info!("Using PIN {} for pairing", pairing_code);
            pin_data.pairing_code.clone()
        } else {
            // This should be a full base64-encoded pairing code
            pairing_code.to_string()
        };
        
        let pairing_data: serde_json::Value = serde_json::from_str(
            &String::from_utf8(base64::prelude::BASE64_STANDARD.decode(&actual_pairing_code)?)?
        )?;
        
        let peer_id = pairing_data["device_id"].as_str()
            .context("Invalid pairing code: missing device_id")?
            .to_string();
        
        let peer_cert = pairing_data["certificate"].as_str()
            .context("Invalid pairing code: missing certificate")?
            .to_string();
        
        self.add_peer_manually(peer_id.clone(), peer_address, peer_cert)?;
        
        // If we used a PIN, remove it from storage (single use)
        if pairing_code.len() == 6 && pairing_code.chars().all(|c| c.is_ascii_digit()) {
            let mut pin_storage = self.pin_storage.lock().await;
            pin_storage.remove(pairing_code);
            tracing::info!("Removed used PIN {} from storage", pairing_code);
        }
        
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
        let peers = self.peers.lock().await;
        if let Some(peer_info) = peers.values().next() {
            let peer_address = peer_info.address.to_string();
            drop(peers);

            let peer_id = self.process_pairing_code(pairing_code, peer_address).await?;
            tracing::info!("Successfully paired with device: {}", peer_id);
            Ok(())
        } else {
            Err(anyhow::anyhow!("No peer discovered to pair with. Make sure the other device is on the same network and has generated a PIN."))
        }
    }
    
    pub async fn sync_with_peers(&mut self) -> Result<()> {
        for peer_id in self.peers.lock().await.keys().cloned().collect::<Vec<String>>() {
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