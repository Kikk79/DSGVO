// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;
mod database;
// mod p2p; // Removed - using file-based changeset sync
mod audit;
mod gdpr;
mod webdav_sync;

#[cfg(test)]
mod tests;

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

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: String,            // Hex color code like "#3B82F6"
    pub background_color: String, // Background color like "#EBF8FF"
    pub text_color: String,       // Text color like "#1E3A8A"
    pub is_active: bool,
    pub sort_order: i32,
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

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct StudentWithStats {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub class_name: String,
    pub class_id: i64,
    pub status: String,
    pub observation_count: i64,
    pub last_observation_date: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct AssessmentRecord {
    pub observation_id: i64,
    pub observation_created_at: chrono::DateTime<chrono::Utc>,
    pub observation_updated_at: chrono::DateTime<chrono::Utc>,
    pub student_id: i64,
    pub student_first_name: String,
    pub student_last_name: String,
    pub class_id: i64,
    pub class_name: String,
    pub category: String,
    pub category_color: String,
    pub category_background_color: String,
    pub category_text_color: String,
    pub text: String,
    pub tags: String, // JSON string
    pub author_id: i64,
    pub source_device_id: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct CalendarObservation {
    pub id: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub student_id: i64,
    pub student_first_name: String,
    pub student_last_name: String,
    pub class_id: i64,
    pub class_name: String,
    pub category: String,
    pub category_color: String,
    pub category_background_color: String,
    pub category_text_color: String,
    pub text: String,
    pub tags: String, // JSON string
}

// Application state
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<database::Database>>,
    pub crypto: Arc<crypto::CryptoManager>,
    // p2p: Removed - using file-based changeset sync
    pub audit: Arc<audit::AuditLogger>,
    pub gdpr: Arc<gdpr::GdprManager>,
    pub webdav_sync: Arc<Mutex<Option<Arc<webdav_sync::WebDavSyncManager>>>>,
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
async fn get_students_with_stats(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<StudentWithStats>, String> {
    let db = state.db.lock().await;
    db.get_students_with_stats()
        .await
        .map_err(|e| e.to_string())
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

    // Get all students, classes, categories, and observations
    let students = db
        .get_all_students_including_deleted()
        .await
        .map_err(|e| e.to_string())?;
    let classes = db.get_classes().await.map_err(|e| e.to_string())?;
    let categories = db.get_categories().await.map_err(|e| e.to_string())?;

    // Filter observations by date if specified
    let observations = if let Some(days) = days_back {
        if days > 0 {
            // Get observations from specific time range
            let cutoff_date = chrono::Utc::now() - chrono::Duration::days(days as i64);
            db.get_observations_since(cutoff_date)
                .await
                .map_err(|e| e.to_string())?
        } else {
            // days_back <= 0 means all data
            db.search_observations(None, None, None)
                .await
                .map_err(|e| e.to_string())?
        }
    } else {
        // No filter - get all observations
        db.search_observations(None, None, None)
            .await
            .map_err(|e| e.to_string())?
    };

    // Get device config for metadata
    let device_config = state
        .crypto
        .get_device_config()
        .map_err(|e| e.to_string())?;

    // Create comprehensive export data
    let export_data = serde_json::json!({
        "format": "full_export",
        "version": "1.1",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "export_scope": {
            "days_back": days_back,
            "total_students": students.len(),
            "total_classes": classes.len(),
            "total_observations": observations.len(),
            "total_categories": categories.len()
        },
        "source_device": {
            "device_type": device_config.get("device_type").unwrap_or(&"unknown".to_string()),
            "device_name": device_config.get("device_name"),
            "device_id": device_config.get("device_id")
        },
        "data": {
            "students": students,
            "classes": classes,
            "observations": observations,
            "categories": categories
        },
        "device_config": {
            "device_type": device_config.get("device_type").unwrap_or(&"unknown".to_string()).clone(),
            "device_name": device_config.get("device_name").cloned()
        }
    });

    // Log the export
    let scope_description = match days_back {
        Some(days) if days > 0 => format!("last {} days", days),
        _ => "all data".to_string(),
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
        .map_err(|e| e.to_string())?;

    // Convert HashMap to DeviceConfig struct
    let device_config = DeviceConfig {
        device_type: config
            .get("device_type")
            .unwrap_or(&"unknown".to_string())
            .clone(),
        device_name: config.get("device_name").cloned(),
    };

    Ok(device_config)
}

#[tauri::command]
async fn set_device_config(
    state: tauri::State<'_, AppState>,
    device_type: String,
    device_name: Option<String>,
) -> Result<(), String> {
    let _config = DeviceConfig {
        device_type: device_type.clone(),
        device_name: device_name.clone(),
    };

    state
        .crypto
        .set_device_config(Some(device_type.clone()), device_name)
        .map_err(|e| e.to_string())?;

    // Log the configuration change
    state
        .audit
        .log_action("update", "device_config", 0, 1, Some(&device_type))
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

// Category management commands
#[tauri::command]
async fn get_categories(state: tauri::State<'_, AppState>) -> Result<Vec<Category>, String> {
    let db = state.db.lock().await;
    db.get_categories().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_category(
    state: tauri::State<'_, AppState>,
    name: String,
    color: String,
    background_color: String,
    text_color: String,
) -> Result<Category, String> {
    let db = state.db.lock().await;
    let category = db
        .create_category(name.clone(), color, background_color, text_color)
        .await
        .map_err(|e| e.to_string())?;

    // Log the creation
    state
        .audit
        .log_action("create", "category", category.id, 1, Some(&name))
        .await
        .map_err(|e| e.to_string())?;

    Ok(category)
}

#[tauri::command]
async fn update_category(
    state: tauri::State<'_, AppState>,
    id: i64,
    name: String,
    color: String,
    background_color: String,
    text_color: String,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_category(id, name.clone(), color, background_color, text_color)
        .await
        .map_err(|e| e.to_string())?;

    // Log the update
    state
        .audit
        .log_action("update", "category", id, 1, Some(&name))
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_category(
    state: tauri::State<'_, AppState>,
    id: i64,
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
        .log_action("delete", "category", id, 1, Some(delete_type))
        .await
        .map_err(|e| e.to_string())?;

    db.delete_category(id, force_delete)
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
async fn get_assessments_comprehensive(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
    sort_field: Option<String>,
    sort_direction: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    category_filter: Option<String>,
    class_filter: Option<String>,
    student_filter: Option<String>,
) -> Result<Vec<AssessmentRecord>, String> {
    let db = state.db.lock().await;
    db.get_assessments_comprehensive(
        limit.unwrap_or(100),
        offset.unwrap_or(0),
        sort_field.unwrap_or_else(|| "observation_created_at".to_string()),
        sort_direction.unwrap_or_else(|| "desc".to_string()),
        date_from,
        date_to,
        category_filter,
        class_filter,
        student_filter,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_assessments_csv(
    state: tauri::State<'_, AppState>,
    date_from: Option<String>,
    date_to: Option<String>,
    category_filter: Option<String>,
    class_filter: Option<String>,
    student_filter: Option<String>,
    sort_field: Option<String>,
    sort_direction: Option<String>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let assessments = db
        .get_assessments_comprehensive(
            10000, // High limit for export
            0,     // No offset
            sort_field.unwrap_or_else(|| "observation_created_at".to_string()),
            sort_direction.unwrap_or_else(|| "desc".to_string()),
            date_from,
            date_to,
            category_filter,
            class_filter,
            student_filter,
        )
        .await
        .map_err(|e| e.to_string())?;

    // Convert to CSV format
    let mut csv_content = String::new();
    csv_content.push_str("Datum,Schüler*in,Klasse,Kategorie,Beobachtung,Tags\n");

    for assessment in assessments {
        let formatted_date = assessment.observation_created_at.format("%d.%m.%Y %H:%M");
        let student_name = format!(
            "{}, {}",
            assessment.student_last_name, assessment.student_first_name
        );
        let tags: Vec<String> = serde_json::from_str(&assessment.tags).unwrap_or_default();
        let tags_str = tags.join("; ");

        // Escape CSV values
        let escaped_text = assessment.text.replace("\"", "\"\"");
        let escaped_tags = tags_str.replace("\"", "\"\"");

        csv_content.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
            formatted_date,
            student_name,
            assessment.class_name,
            assessment.category,
            escaped_text,
            escaped_tags
        ));
    }

    // Log the export
    state
        .audit
        .log_action("export", "assessments_csv", 0, 1, Some("csv_export"))
        .await
        .map_err(|e| e.to_string())?;

    Ok(csv_content)
}

#[tauri::command]
async fn get_calendar_observations(
    state: tauri::State<'_, AppState>,
    start_date: String,
    end_date: String,
    class_id: Option<i64>,
    category: Option<String>,
) -> Result<Vec<CalendarObservation>, String> {
    // Parse date strings to DateTime
    let start_dt = chrono::DateTime::parse_from_rfc3339(&start_date)
        .map_err(|e| format!("Invalid start_date format: {}", e))?
        .with_timezone(&chrono::Utc);

    let end_dt = chrono::DateTime::parse_from_rfc3339(&end_date)
        .map_err(|e| format!("Invalid end_date format: {}", e))?
        .with_timezone(&chrono::Utc);

    let db = state.db.lock().await;
    db.get_calendar_observations(start_dt, end_dt, class_id, category)
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

// ============================================
// WebDAV Sync Commands
// ============================================

#[tauri::command]
async fn configure_webdav(
    state: tauri::State<'_, AppState>,
    url: String,
    username: String,
    password: String,
) -> Result<String, String> {
    let db = state.db.lock().await;

    // Store credentials in database (encrypted)
    db.store_webdav_credentials(url.clone(), username.clone(), password.clone())
        .await
        .map_err(|e| e.to_string())?;

    // Initialize WebDAV sync manager
    let device_id = db.get_device_id();
    drop(db); // Release lock

    let sync_manager = Arc::new(webdav_sync::WebDavSyncManager::new(device_id));
    sync_manager
        .configure(url, username, password)
        .await
        .map_err(|e| e.to_string())?;

    // Store sync manager in state
    let mut webdav_sync = state.webdav_sync.lock().await;
    *webdav_sync = Some(sync_manager.clone());

    // Start background sync task
    let state_clone_export = state.inner().clone();
    let state_clone_import = state.inner().clone();
    sync_manager.clone().start_background_sync(
        move || {
            // Export changeset function
            let state = state_clone_export.clone();
            async move {
                let db = state.db.lock().await;
                match db.create_changeset_file(30).await {
                    Ok(data) => Ok(data),
                    Err(e) => {
                        eprintln!("Failed to export changeset: {}", e);
                        Ok(vec![]) // Return empty on error to avoid breaking sync
                    }
                }
            }
        },
        move |data| {
            // Import changeset function
            let state = state_clone_import.clone();
            async move {
                if data.is_empty() {
                    return Ok(()); // Skip empty data
                }
                let db = state.db.lock().await;
                match db.apply_changeset_file(&data).await {
                    Ok(_) => {
                        println!("✅ Successfully imported changeset");
                        Ok(())
                    }
                    Err(e) => {
                        eprintln!("⚠️ Failed to import changeset: {}", e);
                        Ok(()) // Don't fail sync on import errors
                    }
                }
            }
        },
    );

    // Perform initial sync
    let state_clone2 = state.inner().clone();
    let state_clone3 = state.inner().clone();
    sync_manager
        .sync_on_startup(
            move || {
                let state = state_clone2.clone();
                async move {
                    let db = state.db.lock().await;
                    match db.create_changeset_file(30).await {
                        Ok(data) => Ok(data),
                        Err(e) => {
                            eprintln!("Failed to export changeset on startup: {}", e);
                            Ok(vec![])
                        }
                    }
                }
            },
            move |data| {
                let state = state_clone3.clone();
                async move {
                    if data.is_empty() {
                        return Ok(());
                    }
                    let db = state.db.lock().await;
                    match db.apply_changeset_file(&data).await {
                        Ok(_) => {
                            println!("✅ Initial sync: imported changeset");
                            Ok(())
                        }
                        Err(e) => {
                            eprintln!("⚠️ Initial sync: failed to import: {}", e);
                            Ok(())
                        }
                    }
                }
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok("WebDAV configured successfully".to_string())
}

#[tauri::command]
async fn test_webdav_connection(
    url: String,
    username: String,
    password: String,
) -> Result<bool, String> {
    let client = webdav_sync::WebDavClient::new(url, username, password);
    client.test_connection().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn trigger_manual_sync(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let webdav_sync = state.webdav_sync.lock().await;

    if let Some(sync_manager) = webdav_sync.as_ref() {
        let state_clone = state.inner().clone();
        let state_clone2 = state.inner().clone();

        sync_manager
            .sync_on_startup(
                move || {
                    let state = state_clone.clone();
                    async move {
                        let db = state.db.lock().await;
                        match db.create_changeset_file(30).await {
                            Ok(data) => Ok(data),
                            Err(e) => {
                                eprintln!("Manual sync: failed to export: {}", e);
                                Ok(vec![])
                            }
                        }
                    }
                },
                move |data| {
                    let state = state_clone2.clone();
                    async move {
                        if data.is_empty() {
                            return Ok(());
                        }
                        let db = state.db.lock().await;
                        match db.apply_changeset_file(&data).await {
                            Ok(_) => {
                                println!("✅ Manual sync: imported changeset");
                                Ok(())
                            }
                            Err(e) => {
                                eprintln!("⚠️ Manual sync: failed to import: {}", e);
                                Ok(())
                            }
                        }
                    }
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok("Sync completed successfully".to_string())
    } else {
        Err("WebDAV not configured".to_string())
    }
}

#[tauri::command]
async fn get_webdav_sync_status(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;

    // Check if configured
    let credentials = db
        .get_webdav_credentials()
        .await
        .map_err(|e| e.to_string())?;
    let is_configured = credentials.is_some();

    // Get last sync timestamp
    let last_sync = db
        .get_last_sync_timestamp()
        .await
        .map_err(|e| e.to_string())?;

    // Check if sync manager is active
    let webdav_sync = state.webdav_sync.lock().await;
    let is_active = webdav_sync.is_some();

    Ok(serde_json::json!({
        "configured": is_configured,
        "active": is_active,
        "last_sync": last_sync,
        "url": credentials.as_ref().map(|(url, _, _)| url.clone()),
        "username": credentials.as_ref().map(|(_, username, _)| username.clone()),
    }))
}

#[tauri::command]
async fn disable_webdav_sync(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Clear sync manager
    let mut webdav_sync = state.webdav_sync.lock().await;
    *webdav_sync = None;

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
                webdav_sync: Arc::new(Mutex::new(None)),
            };

            app.manage(state.clone());

            // Initialize WebDAV sync if configured
            tauri::async_runtime::spawn(async move {
                let db_lock = state.db.lock().await;
                if let Ok(Some((url, username, password))) = db_lock.get_webdav_credentials().await
                {
                    let device_id = db_lock.get_device_id();
                    drop(db_lock);

                    let sync_manager = Arc::new(webdav_sync::WebDavSyncManager::new(device_id));
                    if sync_manager
                        .configure(url, username, password)
                        .await
                        .is_ok()
                    {
                        let mut webdav_sync = state.webdav_sync.lock().await;
                        *webdav_sync = Some(sync_manager.clone());
                        drop(webdav_sync);

                        println!("✅ WebDAV sync initialized from stored credentials");

                        // Start background sync task
                        let state_clone_export = state.clone();
                        let state_clone_import = state.clone();
                        
                        sync_manager.clone().start_background_sync(
                            move || {
                                let state = state_clone_export.clone();
                                async move {
                                    let db = state.db.lock().await;
                                    match db.create_changeset_file(30).await {
                                        Ok(data) => Ok(data),
                                        Err(e) => {
                                            eprintln!("Background sync: failed to export: {}", e);
                                            Ok(vec![])
                                        }
                                    }
                                }
                            },
                            move |data| {
                                let state = state_clone_import.clone();
                                async move {
                                    if data.is_empty() {
                                        return Ok(());
                                    }
                                    let db = state.db.lock().await;
                                    match db.apply_changeset_file(&data).await {
                                        Ok(_) => {
                                            println!("✅ Background sync: imported changeset");
                                            Ok(())
                                        }
                                        Err(e) => {
                                            eprintln!("⚠️ Background sync: failed to import: {}", e);
                                            Ok(())
                                        }
                                    }
                                }
                            },
                        );
                        
                        println!("✅ WebDAV background sync task started");
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle();
                
                // Try to get the state and perform shutdown sync
                if let Some(state) = app_handle.try_state::<AppState>() {
                    tauri::async_runtime::block_on(async {
                        let webdav_sync = state.webdav_sync.lock().await;
                        
                        if let Some(sync_manager) = webdav_sync.as_ref() {
                            let state_clone = state.inner().clone();
                            
                            let result = sync_manager
                                .sync_on_shutdown(move || {
                                    let state = state_clone.clone();
                                    async move {
                                        let db = state.db.lock().await;
                                        match db.create_changeset_file(30).await {
                                            Ok(data) => Ok(data),
                                            Err(e) => {
                                                eprintln!("Shutdown sync: failed to export: {}", e);
                                                Ok(vec![])
                                            }
                                        }
                                    }
                                })
                                .await;
                            
                            if let Err(e) = result {
                                eprintln!("⚠️ Shutdown sync failed: {}", e);
                            }
                        }
                    });
                }
            }
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
            get_students_with_stats,
            get_classes,
            search_observations,
            export_student_data,
            create_class,
            create_student,
            delete_student,
            delete_class,
            get_categories,
            create_category,
            update_category,
            delete_category,
            get_assessments_comprehensive,
            export_assessments_csv,
            get_calendar_observations,
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
            set_database_path,
            // WebDAV Sync commands
            configure_webdav,
            test_webdav_connection,
            trigger_manual_sync,
            get_webdav_sync_status,
            disable_webdav_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
