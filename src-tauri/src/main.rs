// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod crypto;
mod p2p;
mod audit;
mod gdpr;

use tauri::Manager;
use std::sync::Arc;
use tokio::sync::Mutex;
use base64::Engine;
use p2p::ActivePin;

// Data structures
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Student {
    pub id: i64,
    pub class_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub status: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct DeviceConfig {
    pub device_type: String, // "computer" or "notebook"
    pub device_name: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Class {
    pub id: i64,
    pub name: String,
    pub school_year: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Observation {
    pub id: i64,
    pub student_id: i64,
    pub author_id: i64,
    pub category: String,
    pub text: String,
    pub tags: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub source_device_id: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncStatus {
    pub peer_connected: bool,
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
    pub pending_changes: u32,
}

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<database::Database>>,
    pub crypto: Arc<crypto::CryptoManager>,
    pub p2p: Arc<Mutex<Option<p2p::P2PManager>>>,
    pub audit: Arc<audit::AuditLogger>,
    pub gdpr: Arc<gdpr::GdprManager>,
}

// Tauri commands
#[tauri::command]
async fn get_sync_status(state: tauri::State<'_, AppState>) -> Result<SyncStatus, String> {
    let p2p_guard = state.p2p.lock().await;
    let status = if let Some(p2p) = p2p_guard.as_ref() {
        p2p.get_status().await.map_err(|e| e.to_string())?
    } else {
        SyncStatus {
            peer_connected: false,
            last_sync: None,
            pending_changes: 0,
        }
    };
    Ok(status)
}

#[tauri::command]
async fn create_observation(
    state: tauri::State<'_, AppState>,
    student_id: i64,
    category: String,
    text: String,
    tags: Vec<String>,
) -> Result<Observation, String> {
    let db = state.db.lock().await;
    let observation = db.create_observation(student_id, 1, category, text, tags).await
        .map_err(|e| e.to_string())?;
    
    // Log the creation
    state.audit.log_action("create", "observation", observation.id, 1, None).await
        .map_err(|e| e.to_string())?;
    
    Ok(observation)
}

#[tauri::command]
async fn get_students(state: tauri::State<'_, AppState>) -> Result<Vec<Student>, String> {
    let db = state.db.lock().await;
    db.get_students().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_classes(state: tauri::State<'_, AppState>) -> Result<Vec<Class>, String> {
    let db = state.db.lock().await;
    db.get_classes().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_class(
    state: tauri::State<'_, AppState>,
    name: String,
    school_year: String,
) -> Result<Class, String> {
    let db = state.db.lock().await;
    db.create_class(name, school_year).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_student(
    state: tauri::State<'_, AppState>,
    class_id: i64,
    first_name: String,
    last_name: String,
    status: Option<String>,
) -> Result<Student, String> {
    let db = state.db.lock().await;
    db.create_student(class_id, first_name, last_name, status).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_observations(
    state: tauri::State<'_, AppState>,
    query: Option<String>,
    student_id: Option<i64>,
    category: Option<String>,
) -> Result<Vec<Observation>, String> {
    let db = state.db.lock().await;
    db.search_observations(query, student_id, category).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_student_data(
    state: tauri::State<'_, AppState>,
    student_id: i64,
    format: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let export_data = state.gdpr.export_student_data(&*db, student_id).await
        .map_err(|e| e.to_string())?;
    
    // Log the export
    state.audit.log_action("export", "student_data", student_id, 1, Some(&format)).await
        .map_err(|e| e.to_string())?;
    
    match format.as_str() {
        "json" => Ok(serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())?),
        "csv" => {
            // Convert to CSV format
            // Implementation would go here
            Ok("CSV data".to_string())
        }
        _ => Err("Unsupported export format".to_string())
    }
}

#[tauri::command]
async fn start_p2p_sync(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut p2p_guard = state.p2p.lock().await;
    if p2p_guard.is_none() {
        let p2p_manager = p2p::P2PManager::new(state.crypto.clone(), state.db.clone())
            .map_err(|e| e.to_string())?;
        *p2p_guard = Some(p2p_manager);
    }
    
    if let Some(p2p) = p2p_guard.as_mut() {
        p2p.start_discovery().await.map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn stop_p2p_sync(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_mut() {
        p2p.stop_discovery().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn pair_device(
    state: tauri::State<'_, AppState>,
    pairing_code: String,
) -> Result<(), String> {
    let mut p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_mut() {
        p2p.pair_with_device(&pairing_code).await.map_err(|e| e.to_string())?;
        
        // Log the pairing action
        state.audit.log_action("pair", "device", 0, 1, Some(&pairing_code)).await
            .map_err(|e| e.to_string())?;
    } else {
        return Err("P2P not initialized".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn generate_pairing_pin(
    state: tauri::State<'_, AppState>,
) -> Result<ActivePin, String> {
    let p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_ref() {
        let active_pin = p2p.generate_pin().await.map_err(|e| e.to_string())?;
        
        // Log the PIN generation
        state.audit.log_action("generate", "pairing_pin", 0, 1, Some(&active_pin.pin)).await
            .map_err(|e| e.to_string())?;
        
        Ok(active_pin)
    } else {
        Err("P2P not initialized".to_string())
    }
}

#[tauri::command]
async fn get_pairing_code(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_ref() {
        let pairing_code = p2p.generate_pairing_code().map_err(|e| e.to_string())?;
        
        // Log the pairing code generation
        state.audit.log_action("generate", "pairing_code", 0, 1, None).await
            .map_err(|e| e.to_string())?;
        
        Ok(pairing_code)
    } else {
        Err("P2P not initialized".to_string())
    }
}

#[tauri::command]
async fn get_current_pairing_pin(
    state: tauri::State<'_, AppState>,
) -> Result<Option<ActivePin>, String> {
    let p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_ref() {
        Ok(p2p.get_current_pin().await)
    } else {
        Err("P2P not initialized".to_string())
    }
}

#[tauri::command]
async fn clear_pairing_pin(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_ref() {
        p2p.clear_pin().await;
        
        // Log the PIN clearing
        state.audit.log_action("clear", "pairing_pin", 0, 1, None).await
            .map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err("P2P not initialized".to_string())
    }
}

#[tauri::command]
async fn trigger_sync(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut p2p_guard = state.p2p.lock().await;
    if let Some(p2p) = p2p_guard.as_mut() {
        p2p.sync_with_peers().await.map_err(|e| e.to_string())?;
        
        // Log the sync action
        state.audit.log_action("sync", "data", 0, 1, None).await
            .map_err(|e| e.to_string())?;
    } else {
        return Err("P2P not initialized".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn export_changeset(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().await;
    let changeset = db.get_pending_changesets("export").await.map_err(|e| e.to_string())?;
    
    // Convert to base64 for safe transport
    let encoded = base64::prelude::BASE64_STANDARD.encode(&changeset);
    
    // Log the export
    state.audit.log_action("export", "changeset", 0, 1, None).await
        .map_err(|e| e.to_string())?;
    
    Ok(encoded)
}

#[tauri::command]
async fn import_changeset(
    state: tauri::State<'_, AppState>,
    changeset_data: String,
) -> Result<(), String> {
    let changeset = base64::prelude::BASE64_STANDARD.decode(&changeset_data)
        .map_err(|e| format!("Invalid changeset format: {}", e))?;
    
    let db = state.db.lock().await;
    db.apply_changeset(&changeset, "import").await.map_err(|e| e.to_string())?;
    
    // Log the import
    state.audit.log_action("import", "changeset", 0, 1, None).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn get_device_config(state: tauri::State<'_, AppState>) -> Result<DeviceConfig, String> {
    let config = state.crypto.get_device_config().await
        .map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
async fn set_device_config(
    state: tauri::State<'_, AppState>,
    device_type: String,
    device_name: Option<String>,
) -> Result<(), String> {
    let config = DeviceConfig {
        device_type,
        device_name,
    };
    
    state.crypto.set_device_config(&config).await
        .map_err(|e| e.to_string())?;
    
    // Log the configuration change
    state.audit.log_action("update", "device_config", 0, 1, Some(&config.device_type)).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn delete_student(
    state: tauri::State<'_, AppState>,
    student_id: i64,
    force_delete: Option<bool>,
) -> Result<(), String> {
    let force_delete = force_delete.unwrap_or(false);
    let db = state.db.lock().await;
    
    // Log the deletion attempt
    let delete_type = if force_delete { "hard_delete" } else { "soft_delete" };
    state.audit.log_action("delete", "student", student_id, 1, Some(delete_type)).await
        .map_err(|e| e.to_string())?;
    
    db.delete_student(student_id, force_delete).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn delete_class(
    state: tauri::State<'_, AppState>,
    class_id: i64,
    force_delete: Option<bool>,
) -> Result<(), String> {
    let force_delete = force_delete.unwrap_or(false);
    let db = state.db.lock().await;
    
    // Log the deletion attempt
    let delete_type = if force_delete { "force_delete" } else { "safe_delete" };
    state.audit.log_action("delete", "class", class_id, 1, Some(delete_type)).await
        .map_err(|e| e.to_string())?;
    
    db.delete_class(class_id, force_delete).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn delete_observation(
    state: tauri::State<'_, AppState>,
    observation_id: i64,
    force_delete: Option<bool>,
) -> Result<(), String> {
    let force_delete = force_delete.unwrap_or(false);
    let db = state.db.lock().await;
    
    // In a real system, you would get the current user ID from session/auth
    // For now, using author_id = 1 as default
    let author_id = 1;
    
    // Log the deletion attempt
    let delete_type = if force_delete { "force_delete" } else { "author_delete" };
    state.audit.log_action("delete", "observation", observation_id, author_id, Some(delete_type)).await
        .map_err(|e| e.to_string())?;
    
    db.delete_observation(observation_id, author_id, force_delete).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn get_observation(
    state: tauri::State<'_, AppState>,
    observation_id: i64,
) -> Result<Option<Observation>, String> {
    let db = state.db.lock().await;
    db.get_observation(observation_id).await.map_err(|e| e.to_string())
}

fn main() {
    // A simple logger that prints to the console
    env_logger::init();
    
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            
            // Initialize crypto manager (do not panic if secure storage is unavailable)
            let crypto = Arc::new(crypto::CryptoManager::new().expect("Failed to initialize CryptoManager"));
            
            // Initialize database
            let db_path = app_data_dir.join("observations.db");
            let db = tauri::async_runtime::block_on(async {
                database::Database::new(db_path, crypto.clone()).await
            }).unwrap();
            
            // Initialize audit logger
            let audit_path = app_data_dir.join("audit.db");
            let audit = Arc::new(tauri::async_runtime::block_on(async {
                audit::AuditLogger::new(audit_path).await
            }).unwrap());
            
            let gdpr = Arc::new(gdpr::GdprManager::new());
            
            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                crypto,
                p2p: Arc::new(Mutex::new(None)),
                audit,
                gdpr,
            };
            
            app.manage(state.clone());
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_sync_status,
            create_observation,
            get_observation,
            delete_observation,
            get_students,
            get_classes,
            search_observations,
            export_student_data,
            create_class,
            create_student,
            delete_student,
            delete_class,
            start_p2p_sync,
            stop_p2p_sync,
            pair_device,
            generate_pairing_pin,
            get_pairing_code,
            get_current_pairing_pin,
            clear_pairing_pin,
            trigger_sync,
            export_changeset,
            import_changeset,
            get_device_config,
            set_device_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}