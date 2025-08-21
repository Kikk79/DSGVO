// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;
mod database;
// mod p2p; // Removed - using file-based changeset sync
mod audit;
mod gdpr;

use base64::Engine;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;
// use p2p::ActivePin; // Removed - using file-based changeset sync

// Data structures
#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Student {
    pub id: i64,
    pub class_id: i64,
    pub first_name: String,
    pub last_name: String,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub source_device_id: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct DeviceConfig {
    pub device_type: String, // "computer" or "notebook"
    pub device_name: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Class {
    pub id: i64,
    pub name: String,
    pub school_year: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub source_device_id: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Observation {
    pub id: i64,
    pub student_id: i64,
    pub author_id: i64,
    pub category: String,
    pub text: String,
    pub tags: String, // Store as JSON string for SQLx compatibility
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
    // p2p: Removed - using file-based changeset sync
    pub audit: Arc<audit::AuditLogger>,
    pub gdpr: Arc<gdpr::GdprManager>,
}

// Tauri commands
#[tauri::command]
async fn get_sync_status(_state: tauri::State<'_, AppState>) -> Result<SyncStatus, String> {
    // File-based sync status - no real-time peer connection
    Ok(SyncStatus {
        peer_connected: false, // Always false for file-based sync
        last_sync: None,       // Could be read from settings in future
        pending_changes: 0,    // Could be calculated from database
    })
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
    let observation = db
        .create_observation(student_id, 1, category, text, tags)
        .await
        .map_err(|e| e.to_string())?;

    // Log the creation
    state
        .audit
        .log_action("create", "observation", observation.id, 1, None)
        .await
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
    db.create_class(name, school_year)
        .await
        .map_err(|e| e.to_string())
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
    db.create_student(class_id, first_name, last_name, status)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_observations(
    state: tauri::State<'_, AppState>,
    query: Option<String>,
    student_id: Option<i64>,
    category: Option<String>,
) -> Result<Vec<Observation>, String> {
    let db = state.db.lock().await;
    db.search_observations(query, student_id, category)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_student_data(
    state: tauri::State<'_, AppState>,
    student_id: i64,
    format: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let export_data = state
        .gdpr
        .export_student_data(&*db, student_id)
        .await
        .map_err(|e| e.to_string())?;

    // Log the export
    state
        .audit
        .log_action("export", "student_data", student_id, 1, Some(&format))
        .await
        .map_err(|e| e.to_string())?;

    match format.as_str() {
        "json" => Ok(serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())?),
        "csv" => {
            // Convert to CSV format
            // Implementation would go here
            Ok("CSV data".to_string())
        }
        _ => Err("Unsupported export format".to_string()),
    }
}

// P2P sync commands removed - using file-based changeset sync

#[tauri::command]
async fn export_changeset(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().await;
    let changeset = db
        .get_pending_changesets("export")
        .await
        .map_err(|e| e.to_string())?;

    // Convert to base64 for safe transport (legacy compatibility)
    let encoded = base64::prelude::BASE64_STANDARD.encode(&changeset);

    // Log the export
    state
        .audit
        .log_action("export", "changeset", 0, 1, None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(encoded)
}

#[tauri::command]
async fn export_changeset_to_file(
    state: tauri::State<'_, AppState>,
    file_path: String,
    days_back: Option<u32>,
) -> Result<String, String> {
    let days_back = days_back.unwrap_or(30); // Default to 30 days
    let db = state.db.lock().await;

    // Generate enhanced changeset with metadata
    let changeset_data = db
        .create_changeset_file(days_back)
        .await
        .map_err(|e| e.to_string())?;

    // Write to file
    std::fs::write(&file_path, &changeset_data)
        .map_err(|e| format!("Failed to write changeset file: {}", e))?;

    // Log the export with file path
    state
        .audit
        .log_action("export", "changeset_file", 0, 1, Some(&file_path))
        .await
        .map_err(|e| e.to_string())?;

    let file_size = changeset_data.len();
    Ok(format!(
        "Changeset exported to {} ({} bytes)",
        file_path, file_size
    ))
}

#[tauri::command]
async fn import_changeset(
    state: tauri::State<'_, AppState>,
    changeset_data: String,
) -> Result<(), String> {
    let changeset = base64::prelude::BASE64_STANDARD
        .decode(&changeset_data)
        .map_err(|e| format!("Invalid changeset format: {}", e))?;

    let db = state.db.lock().await;
    db.apply_changeset(&changeset, "import")
        .await
        .map_err(|e| e.to_string())?;

    // Log the import
    state
        .audit
        .log_action("import", "changeset", 0, 1, None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn import_changeset_from_file(
    state: tauri::State<'_, AppState>,
    file_path: String,
) -> Result<String, String> {
    // Read changeset file
    let changeset_data =
        std::fs::read(&file_path).map_err(|e| format!("Failed to read changeset file: {}", e))?;

    let db = state.db.lock().await;
    let import_result = db
        .apply_changeset_file(&changeset_data)
        .await
        .map_err(|e| e.to_string())?;

    // Log the import with file path
    state
        .audit
        .log_action("import", "changeset_file", 0, 1, Some(&file_path))
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "Imported changeset from {}: {}",
        file_path, import_result
    ))
}

#[tauri::command]
async fn export_all_data(
    state: tauri::State<'_, AppState>,
    days_back: Option<i32>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    
    // Get all students, classes, and observations
    let students = db.get_students().await.map_err(|e| e.to_string())?;
    let classes = db.get_classes().await.map_err(|e| e.to_string())?;
    
    // Filter observations by date if specified
    let observations = if let Some(days) = days_back {
        if days > 0 {
            // Get observations from specific time range
            let cutoff_date = chrono::Utc::now() - chrono::Duration::days(days as i64);
            db.get_observations_since(cutoff_date).await.map_err(|e| e.to_string())?
        } else {
            // days_back <= 0 means all data
            db.search_observations(None, None, None).await.map_err(|e| e.to_string())?
        }
    } else {
        // No filter - get all observations
        db.search_observations(None, None, None).await.map_err(|e| e.to_string())?
    };

    // Get device config for metadata
    let device_config = state.crypto.get_device_config().await.map_err(|e| e.to_string())?;
    
    // Create comprehensive export data
    let export_data = serde_json::json!({
        "format": "full_export",
        "version": "1.0",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "export_scope": {
            "days_back": days_back,
            "total_students": students.len(),
            "total_classes": classes.len(), 
            "total_observations": observations.len()
        },
        "source_device": {
            "device_type": &device_config.device_type,
            "device_name": device_config.device_name.as_ref()
        },
        "data": {
            "students": students,
            "classes": classes,
            "observations": observations
        }
    });

    // Log the export
    let scope_description = match days_back {
        Some(days) if days > 0 => format!("last {} days", days),
        _ => "all data".to_string()
    };
    
    state
        .audit
        .log_action("export", "all_data", 0, 1, Some(&scope_description))
        .await
        .map_err(|e| e.to_string())?;

    Ok(export_data.to_string())
}

#[tauri::command]
async fn import_full_backup(
    state: tauri::State<'_, AppState>,
    file_path: String,
) -> Result<String, String> {
    // Read backup file
    let backup_data = std::fs::read(&file_path).map_err(|e| e.to_string())?;

    let db = state.db.lock().await;
    let import_result = db
        .import_full_backup(&backup_data)
        .await
        .map_err(|e| e.to_string())?;

    // Log the import with file path
    state
        .audit
        .log_action("import", "full_backup", 0, 1, Some(&file_path))
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "Imported full backup from {}: {}",
        file_path, import_result
    ))
}

#[tauri::command]
async fn import_changeset_data(
    state: tauri::State<'_, AppState>,
    changeset_data: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let import_result = db
        .apply_changeset_file(changeset_data.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // Log the import
    state
        .audit
        .log_action("import", "changeset_data", 0, 1, Some("direct"))
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Imported changeset data: {}", import_result))
}

#[tauri::command]
async fn import_full_backup_data(
    state: tauri::State<'_, AppState>,
    backup_data: String,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let import_result = db
        .import_full_backup(backup_data.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // Log the import
    state
        .audit
        .log_action("import", "full_backup_data", 0, 1, Some("direct"))
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Imported full backup data: {}", import_result))
}

#[tauri::command]
async fn get_device_config(state: tauri::State<'_, AppState>) -> Result<DeviceConfig, String> {
    let config = state
        .crypto
        .get_device_config()
        .await
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

    state
        .crypto
        .set_device_config(&config)
        .await
        .map_err(|e| e.to_string())?;

    // Log the configuration change
    state
        .audit
        .log_action("update", "device_config", 0, 1, Some(&config.device_type))
        .await
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
    let delete_type = if force_delete {
        "hard_delete"
    } else {
        "soft_delete"
    };
    state
        .audit
        .log_action("delete", "student", student_id, 1, Some(delete_type))
        .await
        .map_err(|e| e.to_string())?;

    db.delete_student(student_id, force_delete)
        .await
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
    let delete_type = if force_delete {
        "force_delete"
    } else {
        "safe_delete"
    };
    state
        .audit
        .log_action("delete", "class", class_id, 1, Some(delete_type))
        .await
        .map_err(|e| e.to_string())?;

    db.delete_class(class_id, force_delete)
        .await
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
    let delete_type = if force_delete {
        "force_delete"
    } else {
        "author_delete"
    };
    state
        .audit
        .log_action(
            "delete",
            "observation",
            observation_id,
            author_id,
            Some(delete_type),
        )
        .await
        .map_err(|e| e.to_string())?;

    db.delete_observation(observation_id, author_id, force_delete)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_observation(
    state: tauri::State<'_, AppState>,
    observation_id: i64,
) -> Result<Option<Observation>, String> {
    let db = state.db.lock().await;
    db.get_observation(observation_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_database_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let default_path = app_data_dir.join("observations.db");

    // Check if custom path is stored in config
    let config_path = app_data_dir.join("config.json");
    if config_path.exists() {
        if let Ok(config_data) = std::fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_data) {
                if let Some(custom_path) = config.get("database_path").and_then(|p| p.as_str()) {
                    return Ok(custom_path.to_string());
                }
            }
        }
    }

    Ok(default_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_database_path(app: tauri::AppHandle, new_path: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Validate the new path
    let path = std::path::Path::new(&new_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("The specified directory does not exist".to_string());
        }
    } else {
        return Err("Invalid path specified".to_string());
    }

    // Store the custom path in config
    let config_path = app_data_dir.join("config.json");
    let config = serde_json::json!({
        "database_path": new_path
    });

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("Failed to save configuration: {}", e))?;

    Ok(())
}

fn main() {
    // A simple logger that prints to the console
    env_logger::init();

    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            // Initialize crypto manager (do not panic if secure storage is unavailable)
            let crypto =
                Arc::new(crypto::CryptoManager::new().expect("Failed to initialize CryptoManager"));

            // Initialize database - check for custom path
            let config_path = app_data_dir.join("config.json");
            let db_path = if config_path.exists() {
                if let Ok(config_data) = std::fs::read_to_string(&config_path) {
                    if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_data) {
                        if let Some(custom_path) =
                            config.get("database_path").and_then(|p| p.as_str())
                        {
                            std::path::PathBuf::from(custom_path)
                        } else {
                            app_data_dir.join("observations.db")
                        }
                    } else {
                        app_data_dir.join("observations.db")
                    }
                } else {
                    app_data_dir.join("observations.db")
                }
            } else {
                app_data_dir.join("observations.db")
            };

            let db = tauri::async_runtime::block_on(async {
                database::Database::new(db_path, crypto.clone()).await
            })
            .unwrap();

            // Initialize audit logger
            let audit_path = app_data_dir.join("audit.db");
            let audit = Arc::new(
                tauri::async_runtime::block_on(async { audit::AuditLogger::new(audit_path).await })
                    .unwrap(),
            );

            let gdpr = Arc::new(gdpr::GdprManager::new());

            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                crypto,
                // p2p: Removed - using file-based changeset sync
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
            // P2P commands removed - using file-based changeset sync:
            // start_p2p_sync, stop_p2p_sync, pair_device, generate_pairing_pin,
            // get_pairing_code, get_current_pairing_pin, clear_pairing_pin, trigger_sync
            export_changeset,
            import_changeset,
            export_changeset_to_file,
            import_changeset_from_file,
            export_all_data,
            import_full_backup,
            import_changeset_data,
            import_full_backup_data,
            get_device_config,
            set_device_config,
            get_database_path,
            set_database_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
