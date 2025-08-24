use anyhow::{Context, Result};
use directories::ProjectDirs;
use std::{collections::HashMap, fs, path::PathBuf};
use uuid::Uuid;

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
    let path = match secrets_file() {
        Ok(p) => p,
        Err(_) => return HashMap::new(),
    };
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
    device_id: String,
}

impl CryptoManager {
    pub fn new() -> Result<Self> {
        let device_id = Self::get_or_create_device_id()?;
        Ok(Self { device_id })
    }

    fn get_or_create_device_id() -> Result<String> {
        let key = "device_id";
        if let Some(id) = secret_get(key)? {
            Ok(id)
        } else {
            let new_id = Uuid::new_v4().to_string();
            secret_set(key, &new_id)?;
            Ok(new_id)
        }
    }

    pub fn get_device_id(&self) -> String {
        self.device_id.clone()
    }

    // Encryption disabled - these methods now handle plaintext
    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        // Return plaintext as-is (encryption disabled)
        Ok(plaintext.to_string())
    }

    pub fn decrypt(&self, ciphertext: &str) -> Result<String> {
        // Return ciphertext as-is (assuming it's plaintext)
        Ok(ciphertext.to_string())
    }

    pub fn encrypt_bytes(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        // Return bytes as-is (encryption disabled)
        Ok(plaintext.to_vec())
    }

    pub fn decrypt_bytes(&self, ciphertext: &[u8]) -> Result<Vec<u8>> {
        // Return bytes as-is (assuming they're plaintext)
        Ok(ciphertext.to_vec())
    }

    // Generate a simple "hash" for integrity checking (not cryptographically secure)
    pub fn generate_checksum(&self, data: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        data.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }

    pub fn verify_checksum(&self, data: &str, checksum: &str) -> bool {
        self.generate_checksum(data) == checksum
    }

    // Legacy method for checking if we're using encryption
    pub fn is_encryption_enabled(&self) -> bool {
        false
    }

    // Method for testing - reset device ID
    #[cfg(test)]
    pub fn reset_device_id() -> Result<()> {
        let mut secrets = load_secrets();
        secrets.remove("device_id");
        save_secrets(&secrets)
    }

    // Method to manually set device ID (for testing)
    #[cfg(test)]
    pub fn set_device_id(&mut self, new_id: String) -> Result<()> {
        secret_set("device_id", &new_id)?;
        self.device_id = new_id;
        Ok(())
    }

    // Get encryption status for display
    pub fn get_encryption_status(&self) -> HashMap<String, serde_json::Value> {
        let mut status = HashMap::new();
        status.insert("enabled".to_string(), serde_json::Value::Bool(false));
        status.insert("algorithm".to_string(), serde_json::Value::String("none".to_string()));
        status.insert("key_storage".to_string(), serde_json::Value::String("file".to_string()));
        status.insert("warning".to_string(), serde_json::Value::String("Encryption is disabled - data stored in plaintext".to_string()));
        status
    }

    // Device configuration methods
    pub fn get_device_config(&self) -> Result<HashMap<String, String>> {
        let mut config = HashMap::new();
        config.insert("device_id".to_string(), self.device_id.clone());
        config.insert("encryption_enabled".to_string(), "false".to_string());
        config.insert("key_storage".to_string(), "file".to_string());
        
        // Try to load additional device info
        if let Ok(Some(device_type)) = secret_get("device_type") {
            config.insert("device_type".to_string(), device_type);
        }
        
        if let Ok(Some(device_name)) = secret_get("device_name") {
            config.insert("device_name".to_string(), device_name);
        }

        Ok(config)
    }

    pub fn set_device_config(&self, device_type: Option<String>, device_name: Option<String>) -> Result<()> {
        if let Some(dt) = device_type {
            secret_set("device_type", &dt)?;
        }
        
        if let Some(dn) = device_name {
            secret_set("device_name", &dn)?;
        }

        Ok(())
    }

    // Key rotation (placeholder since encryption is disabled)
    pub fn rotate_keys(&self) -> Result<()> {
        // In a real implementation with encryption, this would:
        // 1. Generate new encryption key
        // 2. Re-encrypt all data with new key
        // 3. Update key storage
        
        // For now, just update device ID as a form of "rotation"
        let new_device_id = Uuid::new_v4().to_string();
        secret_set("device_id", &new_device_id)?;
        
        Ok(())
    }

    // Backup and restore methods
    pub fn export_crypto_config(&self) -> Result<HashMap<String, String>> {
        let mut config = HashMap::new();
        config.insert("device_id".to_string(), self.device_id.clone());
        config.insert("encryption_enabled".to_string(), "false".to_string());
        
        if let Ok(Some(device_type)) = secret_get("device_type") {
            config.insert("device_type".to_string(), device_type);
        }
        
        if let Ok(Some(device_name)) = secret_get("device_name") {
            config.insert("device_name".to_string(), device_name);
        }

        Ok(config)
    }

    pub fn import_crypto_config(&mut self, config: &HashMap<String, String>) -> Result<()> {
        if let Some(device_id) = config.get("device_id") {
            self.device_id = device_id.clone();
            secret_set("device_id", device_id)?;
        }

        if let Some(device_type) = config.get("device_type") {
            secret_set("device_type", device_type)?;
        }

        if let Some(device_name) = config.get("device_name") {
            secret_set("device_name", device_name)?;
        }

        Ok(())
    }
}

impl Default for CryptoManager {
    fn default() -> Self {
        Self::new().expect("Failed to create CryptoManager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::env;

    fn setup_test_env() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        // Set environment variable to use temp directory for testing
        env::set_var("HOME", temp_dir.path());
        temp_dir
    }

    #[test]
    fn test_new_crypto_manager() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        assert!(!crypto.device_id.is_empty());
        assert!(crypto.device_id.len() == 36); // UUID length
    }

    #[test]
    fn test_device_id_persistence() {
        let _temp_dir = setup_test_env();
        
        let crypto1 = CryptoManager::new().unwrap();
        let device_id1 = crypto1.get_device_id();

        let crypto2 = CryptoManager::new().unwrap();
        let device_id2 = crypto2.get_device_id();

        assert_eq!(device_id1, device_id2);
    }

    #[test]
    fn test_encryption_disabled() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        assert!(!crypto.is_encryption_enabled());

        let plaintext = "This is sensitive data";
        
        // Encryption should return the same text
        let encrypted = crypto.encrypt(plaintext).unwrap();
        assert_eq!(encrypted, plaintext);

        // Decryption should also return the same text
        let decrypted = crypto.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_encrypt_decrypt_bytes() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        let original_data = b"Binary data for testing";

        let encrypted = crypto.encrypt_bytes(original_data).unwrap();
        assert_eq!(encrypted, original_data);

        let decrypted = crypto.decrypt_bytes(&encrypted).unwrap();
        assert_eq!(decrypted, original_data);
    }

    #[test]
    fn test_checksum_generation() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        let data = "Test data for checksum";
        
        let checksum1 = crypto.generate_checksum(data);
        let checksum2 = crypto.generate_checksum(data);
        
        // Same data should produce same checksum
        assert_eq!(checksum1, checksum2);
        assert_eq!(checksum1.len(), 16); // 64-bit hash as hex
        
        // Different data should produce different checksum
        let different_data = "Different test data";
        let different_checksum = crypto.generate_checksum(different_data);
        assert_ne!(checksum1, different_checksum);
    }

    #[test]
    fn test_checksum_verification() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        let data = "Test data for verification";
        
        let checksum = crypto.generate_checksum(data);
        
        // Valid checksum should verify
        assert!(crypto.verify_checksum(data, &checksum));
        
        // Invalid checksum should not verify
        let wrong_checksum = "0000000000000000";
        assert!(!crypto.verify_checksum(data, wrong_checksum));
        
        // Modified data should not verify with original checksum
        let modified_data = "Modified test data";
        assert!(!crypto.verify_checksum(modified_data, &checksum));
    }

    #[test]
    fn test_get_encryption_status() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        let status = crypto.get_encryption_status();
        
        assert_eq!(status.get("enabled").unwrap(), &serde_json::Value::Bool(false));
        assert_eq!(status.get("algorithm").unwrap(), &serde_json::Value::String("none".to_string()));
        assert_eq!(status.get("key_storage").unwrap(), &serde_json::Value::String("file".to_string()));
        assert!(status.get("warning").unwrap().as_str().unwrap().contains("disabled"));
    }

    #[test]
    fn test_device_config() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        
        // Set device config
        crypto.set_device_config(Some("laptop".to_string()), Some("Teacher's Laptop".to_string())).unwrap();
        
        // Get device config
        let config = crypto.get_device_config().unwrap();
        
        assert_eq!(config.get("device_type").unwrap(), "laptop");
        assert_eq!(config.get("device_name").unwrap(), "Teacher's Laptop");
        assert_eq!(config.get("encryption_enabled").unwrap(), "false");
        assert!(!config.get("device_id").unwrap().is_empty());
    }

    #[test]
    fn test_key_rotation() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        let original_device_id = crypto.get_device_id();
        
        crypto.rotate_keys().unwrap();
        
        // Create new crypto manager to see if device ID changed
        let crypto2 = CryptoManager::new().unwrap();
        let new_device_id = crypto2.get_device_id();
        
        assert_ne!(original_device_id, new_device_id);
    }

    #[test]
    fn test_export_import_crypto_config() {
        let _temp_dir = setup_test_env();
        
        let mut crypto = CryptoManager::new().unwrap();
        
        // Set some config
        crypto.set_device_config(Some("desktop".to_string()), Some("Main Computer".to_string())).unwrap();
        let original_device_id = crypto.get_device_id();
        
        // Export config
        let exported_config = crypto.export_crypto_config().unwrap();
        
        // Reset device ID
        CryptoManager::reset_device_id().unwrap();
        
        // Create new crypto manager (should have different device ID)
        let mut crypto2 = CryptoManager::new().unwrap();
        assert_ne!(crypto2.get_device_id(), original_device_id);
        
        // Import config
        crypto2.import_crypto_config(&exported_config).unwrap();
        
        // Check if config was restored
        assert_eq!(crypto2.get_device_id(), original_device_id);
        
        let restored_config = crypto2.get_device_config().unwrap();
        assert_eq!(restored_config.get("device_type").unwrap(), "desktop");
        assert_eq!(restored_config.get("device_name").unwrap(), "Main Computer");
    }

    #[test]
    fn test_secrets_file_operations() {
        let _temp_dir = setup_test_env();
        
        // Test secret storage
        secret_set("test_key", "test_value").unwrap();
        let retrieved = secret_get("test_key").unwrap();
        assert_eq!(retrieved, Some("test_value".to_string()));
        
        // Test non-existent key
        let non_existent = secret_get("non_existent_key").unwrap();
        assert_eq!(non_existent, None);
        
        // Test overwriting
        secret_set("test_key", "new_value").unwrap();
        let updated = secret_get("test_key").unwrap();
        assert_eq!(updated, Some("new_value".to_string()));
    }

    #[test]
    fn test_data_directory_creation() {
        let _temp_dir = setup_test_env();
        
        let data_path = data_dir().unwrap();
        assert!(data_path.exists());
        assert!(data_path.is_dir());
    }

    #[test]
    fn test_secrets_file_persistence() {
        let _temp_dir = setup_test_env();
        
        // Save a secret
        secret_set("persistent_key", "persistent_value").unwrap();
        
        // Load secrets manually to verify file persistence
        let secrets = load_secrets();
        assert_eq!(secrets.get("persistent_key").unwrap(), "persistent_value");
        
        // Verify the file exists
        let secrets_path = secrets_file().unwrap();
        assert!(secrets_path.exists());
    }

    #[test] 
    fn test_device_id_reset() {
        let _temp_dir = setup_test_env();
        
        let crypto1 = CryptoManager::new().unwrap();
        let original_id = crypto1.get_device_id();
        
        // Reset device ID
        CryptoManager::reset_device_id().unwrap();
        
        let crypto2 = CryptoManager::new().unwrap();
        let new_id = crypto2.get_device_id();
        
        assert_ne!(original_id, new_id);
    }

    #[test]
    fn test_manual_device_id_setting() {
        let _temp_dir = setup_test_env();
        
        let mut crypto = CryptoManager::new().unwrap();
        let custom_id = "custom-device-id-123";
        
        crypto.set_device_id(custom_id.to_string()).unwrap();
        assert_eq!(crypto.get_device_id(), custom_id);
        
        // Verify persistence
        let crypto2 = CryptoManager::new().unwrap();
        assert_eq!(crypto2.get_device_id(), custom_id);
    }

    #[test]
    fn test_large_data_encryption() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        
        // Test with large text data
        let large_text = "A".repeat(10000);
        let encrypted = crypto.encrypt(&large_text).unwrap();
        let decrypted = crypto.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, large_text);
        
        // Test with large binary data
        let large_binary = vec![0x42; 10000];
        let encrypted_bytes = crypto.encrypt_bytes(&large_binary).unwrap();
        let decrypted_bytes = crypto.decrypt_bytes(&encrypted_bytes).unwrap();
        assert_eq!(decrypted_bytes, large_binary);
    }

    #[test]
    fn test_special_characters_in_data() {
        let _temp_dir = setup_test_env();
        
        let crypto = CryptoManager::new().unwrap();
        
        let special_text = "Hello 世界! 🌍 Special chars: àáâãäåæçèéêë ñ øþð";
        let encrypted = crypto.encrypt(special_text).unwrap();
        let decrypted = crypto.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, special_text);
        
        // Test checksum with special characters
        let checksum = crypto.generate_checksum(special_text);
        assert!(crypto.verify_checksum(special_text, &checksum));
    }

    #[test]
    fn test_concurrent_crypto_operations() {
        let _temp_dir = setup_test_env();
        
        let crypto = std::sync::Arc::new(CryptoManager::new().unwrap());
        let mut handles = vec![];
        
        // Test concurrent encryption operations
        for i in 0..10 {
            let crypto_clone = crypto.clone();
            let handle = std::thread::spawn(move || {
                let data = format!("Test data {}", i);
                let encrypted = crypto_clone.encrypt(&data).unwrap();
                let decrypted = crypto_clone.decrypt(&encrypted).unwrap();
                assert_eq!(decrypted, data);
            });
            handles.push(handle);
        }
        
        // Wait for all threads to complete
        for handle in handles {
            handle.join().unwrap();
        }
    }

    #[test]
    fn test_error_handling() {
        let _temp_dir = setup_test_env();
        
        // Test with invalid path
        env::set_var("HOME", "/invalid/path/that/should/not/exist");
        
        // Should still work due to fallback handling
        let crypto = CryptoManager::new();
        
        // Reset to valid path
        let temp_dir = TempDir::new().unwrap();
        env::set_var("HOME", temp_dir.path());
        
        assert!(crypto.is_ok());
    }
}