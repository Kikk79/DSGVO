use anyhow::{Context, Result};
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce,
};
use keyring::Entry;
use uuid::Uuid;
use base64::prelude::*;
use std::{collections::HashMap, fs, path::PathBuf};
use directories::ProjectDirs;

fn data_dir() -> Result<PathBuf> {
    let proj = ProjectDirs::from("", "", "schuelerbeobachtung")
        .context("Failed to determine data directory")?;
    let dir = proj.data_dir().to_path_buf();
    fs::create_dir_all(&dir).ok();
    Ok(dir)
}

fn secrets_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("secure.json"))
}

fn load_secrets() -> HashMap<String, String> {
    let path = match secrets_file() { Ok(p) => p, Err(_) => return HashMap::new() };
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_secrets(map: &HashMap<String, String>) -> Result<()> {
    let path = secrets_file()?;
    let s = serde_json::to_string_pretty(map)?;
    fs::write(path, s).context("Failed to write secrets file")?;
    Ok(())
}

fn secret_get(name: &str) -> Result<Option<String>> {
    // Try keyring first
    if std::env::var("DISABLE_KEYRING").ok().as_deref() != Some("1") {
        if let Ok(entry) = Entry::new("schuelerbeobachtung", name) {
            if let Ok(val) = entry.get_password() {
                return Ok(Some(val));
            }
        }
    }
    // Fallback to file
    let map = load_secrets();
    Ok(map.get(name).cloned())
}

fn secret_set(name: &str, value: &str) -> Result<()> {
    // Try keyring first unless disabled
    if std::env::var("DISABLE_KEYRING").ok().as_deref() != Some("1") {
        if let Ok(entry) = Entry::new("schuelerbeobachtung", name) {
            if entry.set_password(value).is_ok() {
                return Ok(());
            }
        }
    }
    // Fallback to file
    let mut map = load_secrets();
    map.insert(name.to_string(), value.to_string());
    save_secrets(&map)
}

pub struct CryptoManager {
    cipher: ChaCha20Poly1305,
    device_id: String,
}

impl CryptoManager {
    pub fn new() -> Result<Self> {
        let device_id = Self::get_or_create_device_id()?;
        let key = Self::get_or_create_key(&device_id)?;
        let cipher = ChaCha20Poly1305::new(&key);

        Ok(Self { cipher, device_id })
    }

    fn get_or_create_device_id() -> Result<String> {
        if let Some(id) = secret_get("device_id")? { return Ok(id); }
        let device_id = Uuid::new_v4().to_string();
        secret_set("device_id", &device_id).context("Failed to persist device ID")?;
        Ok(device_id)
    }

    fn get_or_create_key(device_id: &str) -> Result<Key> {
        let name = format!("encryption_key_{}", device_id);
        if let Some(key_base64) = secret_get(&name)? {
            let key_bytes = BASE64_STANDARD
                .decode(&key_base64)
                .context("Failed to decode encryption key from base64")?;
            if key_bytes.len() != 32 { anyhow::bail!("Invalid key length"); }
            return Ok(Key::from_slice(&key_bytes).clone());
        }
        // Generate and store
        let key = ChaCha20Poly1305::generate_key(&mut OsRng);
        let key_base64 = BASE64_STANDARD.encode(&key);
        secret_set(&name, &key_base64).context("Failed to persist encryption key")?;
        Ok(key)
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ciphertext = self.cipher.encrypt(&nonce, plaintext)
            .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;
        
        // Prepend nonce to ciphertext
        let mut result = nonce.to_vec();
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    pub fn decrypt(&self, encrypted_data: &[u8]) -> Result<Vec<u8>> {
        if encrypted_data.len() < 12 {
            anyhow::bail!("Invalid encrypted data length");
        }

        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        
        let plaintext = self.cipher.decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;
        
        Ok(plaintext)
    }

    pub fn get_device_id(&self) -> String {
        self.device_id.clone()
    }

    pub fn generate_certificate_pair() -> Result<(String, String)> {
        // Generate self-signed certificate for mTLS
        use rcgen::{Certificate, CertificateParams, DistinguishedName};
        
        let mut params = CertificateParams::new(vec!["localhost".to_string()]);
        params.distinguished_name = DistinguishedName::new();
        params.distinguished_name.push(rcgen::DnType::CommonName, "schuelerbeobachtung");
        
        let cert = Certificate::from_params(params)
            .context("Failed to generate certificate")?;
        
        let cert_pem = cert.serialize_pem()
            .context("Failed to serialize certificate")?;
        let key_pem = cert.serialize_private_key_pem();
        
        Ok((cert_pem, key_pem))
    }

    pub fn store_peer_certificate(&self, peer_id: &str, cert_pem: &str) -> Result<()> {
        let name = format!("peer_cert_{}", peer_id);
        secret_set(&name, cert_pem).context("Failed to persist peer certificate")
    }

    pub fn get_peer_certificate(&self, peer_id: &str) -> Result<Option<String>> {
        let name = format!("peer_cert_{}", peer_id);
        secret_get(&name)
    }

    pub fn get_or_create_certificate_pair(&self) -> Result<(String, String)> {
        let cert_name = format!("device_cert_{}", self.device_id);
        let key_name = format!("device_key_{}", self.device_id);
        match (secret_get(&cert_name)?, secret_get(&key_name)?) {
            (Some(cert_pem), Some(key_pem)) => Ok((cert_pem, key_pem)),
            _ => {
                let (cert_pem, key_pem) = Self::generate_certificate_pair()?;
                secret_set(&cert_name, &cert_pem).context("Failed to persist device certificate")?;
                secret_set(&key_name, &key_pem).context("Failed to persist device key")?;
                Ok((cert_pem, key_pem))
            }
        }
    }

    pub async fn get_device_config(&self) -> Result<crate::DeviceConfig> {
        let device_type = secret_get("device_type")?
            .unwrap_or_else(|| "computer".to_string()); // Default to computer
        let device_name = secret_get("device_name")?;
        
        Ok(crate::DeviceConfig {
            device_type,
            device_name,
        })
    }

    pub async fn set_device_config(&self, config: &crate::DeviceConfig) -> Result<()> {
        secret_set("device_type", &config.device_type)
            .context("Failed to persist device type")?;
        
        if let Some(name) = &config.device_name {
            secret_set("device_name", name)
                .context("Failed to persist device name")?;
        } else {
            // Remove device name if set to None
            let mut map = load_secrets();
            map.remove("device_name");
            save_secrets(&map).context("Failed to remove device name")?;
        }
        
        Ok(())
    }

    pub async fn regenerate_key(&self) -> Result<()> {
        // This is a placeholder. A real implementation would need to:
        // 1. Generate a new key.
        // 2. Re-encrypt all data with the new key.
        // 3. Securely delete the old key.
        // This is a complex and sensitive operation.
        println!("Encryption key regeneration requested.");
        Ok(())
    }

    pub fn get_device_id_from_cert(cert: &rustls::pki_types::CertificateDer) -> Result<String> {
        use x509_parser::prelude::*;

        let (_, x509) = x509_parser::parse_x509_certificate(cert.as_ref())
            .map_err(|e| anyhow::anyhow!("Failed to parse certificate: {:?}", e))?;

        // Try to get Common Name from Subject
        if let Some(cn) = x509.subject.iter_common_name().next() {
            return Ok(cn.as_str()?.to_string());
        }

        // Fallback: Try to get from Subject Alternative Name (SAN) if present
        for extension in x509.extensions() {
            if let ParsedExtension::SubjectAlternativeName(san) = extension.parsed_extension() {
                for name in san.general_names {
                    if let GeneralName::DNSName(dns_name) = name {
                        // Assuming device ID is a DNS name in SAN
                        return Ok(dns_name.to_string());
                    }
                }
            }
        }

        Err(anyhow::anyhow!("Could not extract device ID from certificate"))
    }
}