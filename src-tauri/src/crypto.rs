use anyhow::{Context, Result};
use uuid::Uuid;
use std::{collections::HashMap, fs, path::PathBuf};
use directories::ProjectDirs;

// Encryption disabled - using plaintext storage
// Original encryption dependencies commented out:
// use chacha20poly1305::{
//     aead::{Aead, AeadCore, KeyInit, OsRng},
//     ChaCha20Poly1305, Key, Nonce,
// };
// use keyring::Entry;
// use base64::prelude::*;

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
    // Keyring disabled - using file storage only
    let map = load_secrets();
    Ok(map.get(name).cloned())
}

fn secret_set(name: &str, value: &str) -> Result<()> {
    // Keyring disabled - using file storage only
    let mut map = load_secrets();
    map.insert(name.to_string(), value.to_string());
    save_secrets(&map)
}

pub struct CryptoManager {
    // Encryption disabled - cipher removed
    device_id: String,
}

impl CryptoManager {
    pub fn new() -> Result<Self> {
        let device_id = Self::get_or_create_device_id()?;
        // Encryption disabled - no key or cipher initialization
        println!("CryptoManager initialized WITHOUT encryption");
        Ok(Self { device_id })
    }

    fn get_or_create_device_id() -> Result<String> {
        if let Some(id) = secret_get("device_id")? { return Ok(id); }
        let device_id = Uuid::new_v4().to_string();
        secret_set("device_id", &device_id).context("Failed to persist device ID")?;
        Ok(device_id)
    }

    // Key generation disabled - no longer needed
    // fn get_or_create_key(device_id: &str) -> Result<Key> { ... }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        // Encryption disabled - return plaintext as-is
        println!("CryptoManager: encrypt() called - returning plaintext (NO ENCRYPTION)");
        Ok(plaintext.to_vec())
    }

    pub fn decrypt(&self, encrypted_data: &[u8]) -> Result<Vec<u8>> {
        // Encryption disabled - return data as-is
        println!("CryptoManager: decrypt() called - returning data as-is (NO DECRYPTION)");
        Ok(encrypted_data.to_vec())
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
}