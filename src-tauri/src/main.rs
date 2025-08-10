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

// Data structures
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Student {
    pub id: i64,
    pub class_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub status: String,
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
            get_students,
            get_classes,
            search_observations,
            export_student_data,
            create_class,
            create_student
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}