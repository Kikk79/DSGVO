// Integration tests for synchronization Tauri commands
// Tests the complete integration between main.rs commands and database operations

use crate::{AppState};
use crate::database::Database;
use crate::audit::AuditLogger;
use crate::crypto::CryptoManager;
use std::sync::Arc;
use tokio::sync::Mutex;
use tempfile::TempDir;
use serde_json;

// Helper function to create test AppState
async fn create_test_app_state() -> (AppState, TempDir) {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test.db");
    
    let database = Database::new(db_path.to_str().unwrap())
        .await
        .expect("Failed to create test database");
        
    let audit_logger = AuditLogger::new(&database)
        .await
        .expect("Failed to create audit logger");
        
    let crypto_manager = CryptoManager::new(temp_dir.path())
        .await
        .expect("Failed to create crypto manager");
    
    let state = AppState {
        db: Arc::new(Mutex::new(database)),
        audit: Arc::new(Mutex::new(audit_logger)),
        crypto: Arc::new(Mutex::new(crypto_manager)),
    };
    
    (state, temp_dir)
}

#[cfg(test)]
mod sync_integration_tests {
    use super::*;
    use crate::{export_all_data, import_full_backup_data, import_changeset_data, export_changeset_to_file};

    #[tokio::test]
    async fn test_export_all_data_command_empty_database() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Test export with no data
        let result = export_all_data(tauri::State::from(&state), None).await;
        assert!(result.is_ok());
        
        let export_json = result.unwrap();
        let export_data: serde_json::Value = serde_json::from_str(&export_json).unwrap();
        
        // Verify structure
        assert_eq!(export_data["format"], "full_export");
        assert_eq!(export_data["version"], "1.0");
        assert!(export_data["timestamp"].is_string());
        
        // Verify empty data
        let data_section = &export_data["data"];
        assert_eq!(data_section["students"].as_array().unwrap().len(), 0);
        assert_eq!(data_section["classes"].as_array().unwrap().len(), 0);
        assert_eq!(data_section["observations"].as_array().unwrap().len(), 0);
        
        // Verify export scope
        let scope = &export_data["export_scope"];
        assert_eq!(scope["total_students"], 0);
        assert_eq!(scope["total_classes"], 0);
        assert_eq!(scope["total_observations"], 0);
    }

    #[tokio::test]
    async fn test_export_all_data_command_with_time_filtering() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Setup test data
        {
            let db = state.db.lock().await;
            let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
            let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
            let _observation = db.create_observation(student.id, 1, "test".to_string(), "Test observation".to_string(), vec![]).await.unwrap();
        }
        
        // Test export with 30 days filter
        let result = export_all_data(tauri::State::from(&state), Some(30)).await;
        assert!(result.is_ok());
        
        let export_json = result.unwrap();
        let export_data: serde_json::Value = serde_json::from_str(&export_json).unwrap();
        
        // Verify filtered data is included
        let data_section = &export_data["data"];
        assert_eq!(data_section["students"].as_array().unwrap().len(), 1);
        assert_eq!(data_section["classes"].as_array().unwrap().len(), 1);
        assert_eq!(data_section["observations"].as_array().unwrap().len(), 1);
        
        // Verify scope reflects filtering
        let scope = &export_data["export_scope"];
        assert_eq!(scope["days_back"], 30);
        assert_eq!(scope["total_students"], 1);
        assert_eq!(scope["total_classes"], 1);
        assert_eq!(scope["total_observations"], 1);
        
        // Test export with "all data" (-1)
        let result_all = export_all_data(tauri::State::from(&state), Some(-1)).await;
        assert!(result_all.is_ok());
        
        let export_all_json = result_all.unwrap();
        let export_all_data: serde_json::Value = serde_json::from_str(&export_all_json).unwrap();
        
        // Should include all data regardless of timestamp
        let all_data_section = &export_all_data["data"];
        assert_eq!(all_data_section["students"].as_array().unwrap().len(), 1);
        assert_eq!(all_data_section["classes"].as_array().unwrap().len(), 1);
        assert_eq!(all_data_section["observations"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_import_full_backup_data_command_success() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Create backup data structure
        let backup_data = serde_json::json!({
            "format": "full_export",
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "export_scope": {
                "total_students": 1,
                "total_classes": 1,
                "total_observations": 1
            },
            "source_device": {
                "device_type": "test",
                "device_name": "integration-test"
            },
            "data": {
                "classes": [{"id": 100, "name": "Test Class", "school_year": "2023/24"}],
                "students": [{"id": 200, "class_id": 100, "first_name": "Test", "last_name": "Student", "status": "active", "source_device_id": "test-device"}],
                "observations": [{"id": 300, "student_id": 200, "author_id": 1, "category": "integration", "text": "Integration test observation", "tags": "[\"integration\"]", "created_at": chrono::Utc::now(), "updated_at": chrono::Utc::now(), "source_device_id": "test-device"}]
            }
        });
        
        let backup_json = backup_data.to_string();
        
        // Import backup data
        let result = import_full_backup_data(tauri::State::from(&state), backup_json).await;
        assert!(result.is_ok());
        
        let import_message = result.unwrap();
        assert!(import_message.contains("Imported full backup data"));
        
        // Verify data was imported correctly
        {
            let db = state.db.lock().await;
            
            let classes = db.get_classes().await.unwrap();
            assert_eq!(classes.len(), 1);
            assert_eq!(classes[0].id, 100);
            assert_eq!(classes[0].name, "Test Class");
            
            let students = db.get_students().await.unwrap();
            assert_eq!(students.len(), 1);
            assert_eq!(students[0].id, 200);
            assert_eq!(students[0].first_name, "Test");
            
            let observations = db.search_observations(None, None, None).await.unwrap();
            assert_eq!(observations.len(), 1);
            assert_eq!(observations[0].id, 300);
            assert_eq!(observations[0].text, "Integration test observation");
        }
        
        // Verify audit log entry was created
        {
            let audit = state.audit.lock().await;
            let entries = audit.get_audit_entries(0, 10, None, None).await.unwrap();
            let import_entry = entries.iter().find(|e| e.action == "import" && e.object_type == "full_backup_data");
            assert!(import_entry.is_some());
        }
    }

    #[tokio::test]
    async fn test_import_full_backup_data_command_invalid_data() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Test with invalid JSON
        let result = import_full_backup_data(tauri::State::from(&state), "invalid json".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("JSON") || result.unwrap_err().contains("parse"));
        
        // Test with missing required fields
        let incomplete_backup = serde_json::json!({
            "format": "full_export",
            "version": "1.0"
            // Missing data section
        }).to_string();
        
        let result = import_full_backup_data(tauri::State::from(&state), incomplete_backup).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_import_changeset_data_command_success() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // First create a base class for the changeset
        {
            let db = state.db.lock().await;
            let _class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        }
        
        // Create changeset data
        let changeset_data = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source_device_id": "integration-test-device",
            "changeset": {
                "classes": [{"id": 100, "name": "Changeset Class", "school_year": "2023/24"}],
                "students": [{"id": 200, "class_id": 100, "first_name": "Changeset", "last_name": "Student", "status": "active", "source_device_id": "test-device"}],
                "observations": [{"id": 300, "student_id": 200, "author_id": 1, "category": "changeset", "text": "Changeset test observation", "tags": "[\"changeset\"]", "created_at": chrono::Utc::now(), "updated_at": chrono::Utc::now(), "source_device_id": "test-device"}]
            },
            "checksum": "integration_test_checksum"
        });
        
        let changeset_json = changeset_data.to_string();
        
        // Import changeset
        let result = import_changeset_data(tauri::State::from(&state), changeset_json).await;
        assert!(result.is_ok());
        
        let import_message = result.unwrap();
        assert!(import_message.contains("Imported changeset data"));
        
        // Verify data was imported
        {
            let db = state.db.lock().await;
            
            let classes = db.get_classes().await.unwrap();
            assert_eq!(classes.len(), 2); // Original + imported
            let changeset_class = classes.iter().find(|c| c.name == "Changeset Class").unwrap();
            assert_eq!(changeset_class.id, 100);
            
            let students = db.get_students().await.unwrap();
            assert_eq!(students.len(), 1);
            assert_eq!(students[0].first_name, "Changeset");
            
            let observations = db.search_observations(None, None, None).await.unwrap();
            assert_eq!(observations.len(), 1);
            assert_eq!(observations[0].text, "Changeset test observation");
        }
    }

    #[tokio::test]
    async fn test_import_changeset_data_command_constraint_handling() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Create changeset with invalid foreign key
        let invalid_changeset = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source_device_id": "test-device",
            "changeset": {
                "classes": [],
                "students": [{"id": 200, "class_id": 999, "first_name": "Invalid", "last_name": "Student", "status": "active", "source_device_id": "test-device"}], // Non-existent class
                "observations": []
            },
            "checksum": "test_checksum"
        }).to_string();
        
        // Should handle constraint violations gracefully
        let result = import_changeset_data(tauri::State::from(&state), invalid_changeset).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("FOREIGN KEY") || result.unwrap_err().contains("constraint"));
    }

    #[tokio::test]
    async fn test_export_changeset_to_file_command() {
        let (state, temp_dir) = create_test_app_state().await;
        
        // Setup test data
        {
            let db = state.db.lock().await;
            let class = db.create_class("Export Test".to_string(), "2023/24".to_string()).await.unwrap();
            let student = db.create_student(class.id, "Export".to_string(), "Student".to_string(), None).await.unwrap();
            let _observation = db.create_observation(student.id, 1, "export".to_string(), "Export test observation".to_string(), vec!["test".to_string()]).await.unwrap();
        }
        
        // Export to file
        let file_path = temp_dir.path().join("test_changeset.dat");
        let file_path_str = file_path.to_str().unwrap().to_string();
        
        let result = export_changeset_to_file(tauri::State::from(&state), file_path_str.clone(), Some(30)).await;
        assert!(result.is_ok());
        
        let export_message = result.unwrap();
        assert!(export_message.contains("Exported changeset"));
        
        // Verify file was created and contains valid data
        assert!(file_path.exists());
        
        let file_content = std::fs::read_to_string(&file_path).unwrap();
        let changeset_data: serde_json::Value = serde_json::from_str(&file_content).unwrap();
        
        // Verify structure
        assert!(changeset_data["version"].is_string());
        assert!(changeset_data["timestamp"].is_string());
        assert!(changeset_data["source_device_id"].is_string());
        assert!(changeset_data["changeset"].is_object());
        assert!(changeset_data["checksum"].is_string());
        
        // Verify content
        let changeset = &changeset_data["changeset"];
        assert_eq!(changeset["classes"].as_array().unwrap().len(), 1);
        assert_eq!(changeset["students"].as_array().unwrap().len(), 1);
        assert_eq!(changeset["observations"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_sync_command_integration_roundtrip() {
        let (source_state, _temp_dir1) = create_test_app_state().await;
        let (target_state, temp_dir2) = create_test_app_state().await;
        
        // Create data on source system
        {
            let db = source_state.db.lock().await;
            let class = db.create_class("Roundtrip Test".to_string(), "2023/24".to_string()).await.unwrap();
            let student = db.create_student(class.id, "Roundtrip".to_string(), "Student".to_string(), Some("source-device".to_string())).await.unwrap();
            let _observation = db.create_observation(student.id, 1, "roundtrip".to_string(), "Roundtrip test observation".to_string(), vec!["roundtrip".to_string()]).await.unwrap();
        }
        
        // Export from source
        let export_result = export_all_data(tauri::State::from(&source_state), None).await;
        assert!(export_result.is_ok());
        let export_json = export_result.unwrap();
        
        // Import to target
        let import_result = import_full_backup_data(tauri::State::from(&target_state), export_json).await;
        assert!(import_result.is_ok());
        
        // Verify data made the roundtrip correctly
        {
            let target_db = target_state.db.lock().await;
            
            let classes = target_db.get_classes().await.unwrap();
            assert_eq!(classes.len(), 1);
            assert_eq!(classes[0].name, "Roundtrip Test");
            
            let students = target_db.get_students().await.unwrap();
            assert_eq!(students.len(), 1);
            assert_eq!(students[0].first_name, "Roundtrip");
            assert_eq!(students[0].source_device_id.as_ref().unwrap(), "source-device");
            
            let observations = target_db.search_observations(None, None, None).await.unwrap();
            assert_eq!(observations.len(), 1);
            assert_eq!(observations[0].text, "Roundtrip test observation");
        }
        
        // Now test changeset sync from target back to source
        {
            let target_db = target_state.db.lock().await;
            let student = target_db.get_students().await.unwrap().into_iter().next().unwrap();
            let _new_observation = target_db.create_observation(
                student.id, 
                1, 
                "return".to_string(), 
                "Return journey observation".to_string(), 
                vec!["return".to_string()]
            ).await.unwrap();
        }
        
        // Export changeset from target
        let changeset_file = temp_dir2.path().join("return_changeset.dat");
        let changeset_result = export_changeset_to_file(
            tauri::State::from(&target_state), 
            changeset_file.to_str().unwrap().to_string(), 
            Some(30)
        ).await;
        assert!(changeset_result.is_ok());
        
        // Read changeset and import to source
        let changeset_content = std::fs::read_to_string(&changeset_file).unwrap();
        let changeset_import_result = import_changeset_data(
            tauri::State::from(&source_state), 
            changeset_content
        ).await;
        assert!(changeset_import_result.is_ok());
        
        // Verify source now has both observations
        {
            let source_db = source_state.db.lock().await;
            let observations = source_db.search_observations(None, None, None).await.unwrap();
            assert_eq!(observations.len(), 2);
            
            let return_obs = observations.iter().find(|o| o.text == "Return journey observation");
            assert!(return_obs.is_some());
        }
    }

    #[tokio::test]
    async fn test_sync_commands_audit_logging() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Perform various sync operations
        {
            let db = state.db.lock().await;
            let _class = db.create_class("Audit Test".to_string(), "2023/24".to_string()).await.unwrap();
        }
        
        // Export all data - should create audit entry
        let _export_result = export_all_data(tauri::State::from(&state), Some(30)).await.unwrap();
        
        // Import backup data - should create audit entry
        let backup_data = serde_json::json!({
            "format": "full_export",
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "data": {
                "classes": [],
                "students": [],
                "observations": []
            }
        }).to_string();
        
        let _import_result = import_full_backup_data(tauri::State::from(&state), backup_data).await.unwrap();
        
        // Verify audit entries were created
        {
            let audit = state.audit.lock().await;
            let entries = audit.get_audit_entries(0, 10, None, None).await.unwrap();
            
            // Should have at least export and import entries
            assert!(entries.len() >= 2);
            
            let export_entry = entries.iter().find(|e| e.action == "export" && e.object_type == "all_data");
            assert!(export_entry.is_some());
            
            let import_entry = entries.iter().find(|e| e.action == "import" && e.object_type == "full_backup_data");
            assert!(import_entry.is_some());
        }
    }

    #[tokio::test]
    async fn test_sync_commands_concurrent_operations() {
        let (state, temp_dir) = create_test_app_state().await;
        
        // Setup test data
        {
            let db = state.db.lock().await;
            let class = db.create_class("Concurrent Test".to_string(), "2023/24".to_string()).await.unwrap();
            let _student = db.create_student(class.id, "Concurrent".to_string(), "Student".to_string(), None).await.unwrap();
        }
        
        // Run multiple sync operations concurrently
        let export_handle1 = {
            let state_clone = state.clone();
            tokio::spawn(async move {
                export_all_data(tauri::State::from(&state_clone), Some(30)).await
            })
        };
        
        let export_handle2 = {
            let state_clone = state.clone();
            let file_path = temp_dir.path().join("concurrent_test.dat");
            tokio::spawn(async move {
                export_changeset_to_file(
                    tauri::State::from(&state_clone), 
                    file_path.to_str().unwrap().to_string(), 
                    Some(30)
                ).await
            })
        };
        
        // Wait for both operations to complete
        let (result1, result2) = tokio::try_join!(export_handle1, export_handle2).unwrap();
        
        // Both operations should succeed
        assert!(result1.is_ok());
        assert!(result2.is_ok());
        
        // Verify data integrity wasn't compromised
        {
            let db = state.db.lock().await;
            let classes = db.get_classes().await.unwrap();
            assert_eq!(classes.len(), 1);
            assert_eq!(classes[0].name, "Concurrent Test");
        }
    }
}