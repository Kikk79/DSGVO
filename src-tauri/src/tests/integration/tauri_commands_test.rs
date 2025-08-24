// Comprehensive integration tests for existing Tauri commands
// Tests complete command interfaces from frontend API calls to backend operations

use crate::{AppState, SyncStatus};
use crate::database::Database;
use crate::audit::AuditLogger;
use crate::crypto::CryptoManager;
use std::sync::Arc;
use tokio::sync::Mutex;
use tempfile::TempDir;
use serde_json;

// Import command functions that actually exist
use crate::{
    // Student management commands
    create_student, get_students, delete_student,
    // Class management commands
    create_class, get_classes, delete_class,
    // Observation management commands
    create_observation, search_observations, get_observation, delete_observation,
    // Sync and export commands
    export_all_data, import_full_backup_data, import_changeset_data, export_changeset_to_file,
    // Configuration commands
    get_device_config, set_device_config, get_database_path, get_sync_status,
    // GDPR commands  
    export_student_data
};

async fn create_test_app_state() -> (AppState, TempDir) {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("integration_test.db");
    
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
mod tauri_integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_student_management_commands_integration() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // First create a class
        let class_result = create_class(
            tauri::State::from(&state),
            "Integration Test Class".to_string(),
            "2023/24".to_string()
        ).await;
        assert!(class_result.is_ok());
        let class = class_result.unwrap();
        
        // Test create_student command
        let student_result = create_student(
            tauri::State::from(&state),
            class.id,
            "Integration".to_string(),
            "Test".to_string()
        ).await;
        assert!(student_result.is_ok());
        let student = student_result.unwrap();
        
        // Verify student fields
        assert_eq!(student.first_name, "Integration");
        assert_eq!(student.last_name, "Test");
        assert_eq!(student.class_id, class.id);
        assert_eq!(student.status, "active");
        
        // Test get_students command
        let students_result = get_students(tauri::State::from(&state)).await;
        assert!(students_result.is_ok());
        let students = students_result.unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0].id, student.id);
        
        // Test soft delete
        let soft_delete_result = delete_student(
            tauri::State::from(&state),
            student.id,
            Some(false) // soft delete
        ).await;
        assert!(soft_delete_result.is_ok());
        
        // Verify student is marked as deleted
        let students_after_soft = get_students(tauri::State::from(&state)).await.unwrap();
        let deleted_student = students_after_soft.iter().find(|s| s.id == student.id).unwrap();
        assert_eq!(deleted_student.status, "deleted");
        
        // Test hard delete
        let hard_delete_result = delete_student(
            tauri::State::from(&state),
            student.id,
            Some(true) // force delete
        ).await;
        assert!(hard_delete_result.is_ok());
        
        // Verify student is completely removed
        let students_after_hard = get_students(tauri::State::from(&state)).await.unwrap();
        assert_eq!(students_after_hard.len(), 0);
    }

    #[tokio::test]
    async fn test_class_management_commands_integration() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Test create_class command
        let class_result = create_class(
            tauri::State::from(&state),
            "Test Class".to_string(),
            "2023/24".to_string()
        ).await;
        assert!(class_result.is_ok());
        let class = class_result.unwrap();
        
        // Verify class fields
        assert_eq!(class.name, "Test Class");
        assert_eq!(class.school_year, "2023/24");
        
        // Test get_classes command
        let classes_result = get_classes(tauri::State::from(&state)).await;
        assert!(classes_result.is_ok());
        let classes = classes_result.unwrap();
        assert_eq!(classes.len(), 1);
        assert_eq!(classes[0].id, class.id);
        
        // Test delete empty class (should succeed)
        let delete_result = delete_class(
            tauri::State::from(&state),
            class.id,
            Some(false) // soft delete
        ).await;
        assert!(delete_result.is_ok());
        
        // Verify class is removed
        let classes_after_delete = get_classes(tauri::State::from(&state)).await.unwrap();
        assert_eq!(classes_after_delete.len(), 0);
    }

    #[tokio::test]
    async fn test_class_deletion_with_students() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Create class with student
        let class = create_class(
            tauri::State::from(&state),
            "Class with Students".to_string(),
            "2023/24".to_string()
        ).await.unwrap();
        
        let _student = create_student(
            tauri::State::from(&state),
            class.id,
            "Student".to_string(),
            "InClass".to_string()
        ).await.unwrap();
        
        // Soft delete should fail (has active students)
        let soft_delete_result = delete_class(
            tauri::State::from(&state),
            class.id,
            Some(false)
        ).await;
        assert!(soft_delete_result.is_err());
        assert!(soft_delete_result.unwrap_err().contains("active students"));
        
        // Force delete should succeed
        let force_delete_result = delete_class(
            tauri::State::from(&state),
            class.id,
            Some(true)
        ).await;
        assert!(force_delete_result.is_ok());
        
        // Verify both class and students are removed
        let classes = get_classes(tauri::State::from(&state)).await.unwrap();
        let students = get_students(tauri::State::from(&state)).await.unwrap();
        assert_eq!(classes.len(), 0);
        assert_eq!(students.len(), 0);
    }

    #[tokio::test]
    async fn test_observation_management_commands_integration() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Setup prerequisites
        let class = create_class(
            tauri::State::from(&state),
            "Observation Test".to_string(),
            "2023/24".to_string()
        ).await.unwrap();
        
        let student = create_student(
            tauri::State::from(&state),
            class.id,
            "Observed".to_string(),
            "Student".to_string()
        ).await.unwrap();
        
        // Test create_observation command
        let observation_result = create_observation(
            tauri::State::from(&state),
            student.id,
            "social".to_string(),
            "Integration test observation".to_string(),
            vec!["integration".to_string(), "test".to_string()]
        ).await;
        assert!(observation_result.is_ok());
        let observation = observation_result.unwrap();
        
        // Verify observation fields
        assert_eq!(observation.student_id, student.id);
        assert_eq!(observation.author_id, 1);
        assert_eq!(observation.category, "social");
        assert_eq!(observation.text, "Integration test observation");
        assert_eq!(observation.tags, vec!["integration", "test"]);
        
        // Test get_observation command
        let get_result = get_observation(
            tauri::State::from(&state),
            observation.id
        ).await;
        assert!(get_result.is_ok());
        let retrieved_obs = get_result.unwrap().unwrap();
        assert_eq!(retrieved_obs.id, observation.id);
        
        // Test search_observations command (no filters)
        let search_all_result = search_observations(
            tauri::State::from(&state),
            None, // student_id
            None, // category
            None  // search_term
        ).await;
        assert!(search_all_result.is_ok());
        let all_observations = search_all_result.unwrap();
        assert_eq!(all_observations.len(), 1);
        
        // Test search with student filter
        let search_student_result = search_observations(
            tauri::State::from(&state),
            Some(student.id),
            None,
            None
        ).await;
        assert!(search_student_result.is_ok());
        let student_observations = search_student_result.unwrap();
        assert_eq!(student_observations.len(), 1);
        
        // Test search with category filter
        let search_category_result = search_observations(
            tauri::State::from(&state),
            None,
            Some("social".to_string()),
            None
        ).await;
        assert!(search_category_result.is_ok());
        let social_observations = search_category_result.unwrap();
        assert_eq!(social_observations.len(), 1);
        
        // Test search with text filter
        let search_text_result = search_observations(
            tauri::State::from(&state),
            None,
            None,
            Some("integration".to_string())
        ).await;
        assert!(search_text_result.is_ok());
        let text_observations = search_text_result.unwrap();
        assert_eq!(text_observations.len(), 1);
        
        // Test delete_observation command (soft)
        let delete_result = delete_observation(
            tauri::State::from(&state),
            observation.id,
            Some(false) // soft delete
        ).await;
        assert!(delete_result.is_ok());
        
        // Test hard delete
        let hard_delete_result = delete_observation(
            tauri::State::from(&state),
            observation.id,
            Some(true)
        ).await;
        assert!(hard_delete_result.is_ok());
        
        // Verify observation is completely removed
        let removed_obs = get_observation(
            tauri::State::from(&state),
            observation.id
        ).await.unwrap();
        assert!(removed_obs.is_none());
    }

    #[tokio::test]
    async fn test_device_config_commands_integration() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Test initial device config
        let initial_config = get_device_config(tauri::State::from(&state)).await;
        assert!(initial_config.is_ok());
        let config = initial_config.unwrap();
        assert_eq!(config.device_type, "computer"); // Default value
        
        // Test set_device_config command
        let set_result = set_device_config(
            tauri::State::from(&state),
            "tablet".to_string(),
            Some("Integration Test Device".to_string())
        ).await;
        assert!(set_result.is_ok());
        
        // Verify config was updated
        let updated_config = get_device_config(tauri::State::from(&state)).await.unwrap();
        assert_eq!(updated_config.device_type, "tablet");
        assert_eq!(updated_config.device_name, Some("Integration Test Device".to_string()));
        
        // Test with None device_name
        let set_none_result = set_device_config(
            tauri::State::from(&state),
            "laptop".to_string(),
            None
        ).await;
        assert!(set_none_result.is_ok());
        
        let final_config = get_device_config(tauri::State::from(&state)).await.unwrap();
        assert_eq!(final_config.device_type, "laptop");
        assert_eq!(final_config.device_name, None);
    }

    #[tokio::test]
    async fn test_sync_status_command() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        let status_result = get_sync_status(tauri::State::from(&state)).await;
        assert!(status_result.is_ok());
        let status = status_result.unwrap();
        
        // Status should have expected structure
        assert_eq!(status.peer_connected, false); // Always false for file-based sync
        assert_eq!(status.last_sync, None); // No sync history yet
        assert_eq!(status.pending_changes, 0); // No changes pending
    }

    #[tokio::test]
    async fn test_gdpr_export_command_integration() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Setup test data
        let class = create_class(
            tauri::State::from(&state),
            "GDPR Test".to_string(),
            "2023/24".to_string()
        ).await.unwrap();
        
        let student = create_student(
            tauri::State::from(&state),
            class.id,
            "GDPR".to_string(),
            "Subject".to_string()
        ).await.unwrap();
        
        let _observation = create_observation(
            tauri::State::from(&state),
            student.id,
            "privacy".to_string(),
            "GDPR test observation".to_string(),
            vec!["gdpr".to_string()]
        ).await.unwrap();
        
        // Test JSON export
        let json_result = export_student_data(
            tauri::State::from(&state),
            student.id,
            "json".to_string()
        ).await;
        assert!(json_result.is_ok());
        let json_export = json_result.unwrap();
        
        // Verify JSON structure
        let export_data: serde_json::Value = serde_json::from_str(&json_export).unwrap();
        assert_eq!(export_data["format"], "gdpr_export");
        assert_eq!(export_data["student"]["first_name"], "GDPR");
        assert_eq!(export_data["observations"].as_array().unwrap().len(), 1);
        
        // Test CSV export
        let csv_result = export_student_data(
            tauri::State::from(&state),
            student.id,
            "csv".to_string()
        ).await;
        assert!(csv_result.is_ok());
        let csv_export = csv_result.unwrap();
        
        // Verify CSV contains expected headers and data
        assert!(csv_export.contains("id,student_id,category,text,tags"));
        assert!(csv_export.contains("GDPR test observation"));
    }

    #[tokio::test]
    async fn test_error_handling_integration() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Test invalid student ID
        let invalid_student_result = get_observation(
            tauri::State::from(&state),
            99999
        ).await;
        assert!(invalid_student_result.is_ok()); // Should return None, not error
        assert!(invalid_student_result.unwrap().is_none());
        
        // Test creating student with invalid class ID
        let invalid_class_result = create_student(
            tauri::State::from(&state),
            99999,
            "Invalid".to_string(),
            "Student".to_string()
        ).await;
        assert!(invalid_class_result.is_err());
        assert!(invalid_class_result.unwrap_err().contains("FOREIGN KEY"));
        
        // Test deleting non-existent student
        let delete_invalid_result = delete_student(
            tauri::State::from(&state),
            99999,
            Some(false)
        ).await;
        assert!(delete_invalid_result.is_err());
        assert!(delete_invalid_result.unwrap_err().contains("not found"));
        
        // Test invalid export format
        let invalid_export_result = export_student_data(
            tauri::State::from(&state),
            1,
            "invalid_format".to_string()
        ).await;
        assert!(invalid_export_result.is_err());
        assert!(invalid_export_result.unwrap_err().contains("Unsupported export format"));
    }

    #[tokio::test]
    async fn test_concurrent_command_execution() {
        let (state, _temp_dir) = create_test_app_state().await;
        
        // Setup base data
        let class = create_class(
            tauri::State::from(&state),
            "Concurrent Test".to_string(),
            "2023/24".to_string()
        ).await.unwrap();
        
        // Run multiple commands concurrently
        let create_students_tasks: Vec<_> = (0..5).map(|i| {
            let state_clone = state.clone();
            let name = format!("Student{}", i);
            tokio::spawn(async move {
                create_student(
                    tauri::State::from(&state_clone),
                    class.id,
                    name,
                    "Concurrent".to_string()
                ).await
            })
        }).collect();
        
        // Wait for all tasks to complete
        let results: Vec<_> = futures::future::join_all(create_students_tasks).await;
        
        // All operations should succeed
        for result in results {
            assert!(result.is_ok());
            assert!(result.unwrap().is_ok());
        }
        
        // Verify all students were created
        let students = get_students(tauri::State::from(&state)).await.unwrap();
        assert_eq!(students.len(), 5);
        
        // Verify each student has a unique name
        let mut names: Vec<_> = students.iter().map(|s| s.first_name.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["Student0", "Student1", "Student2", "Student3", "Student4"]);
    }

    #[tokio::test]
    async fn test_full_application_workflow_integration() {
        let (state, temp_dir) = create_test_app_state().await;
        
        // Simulate a complete application workflow
        
        // 1. Configure device
        let _config_result = set_device_config(
            tauri::State::from(&state),
            "workflow_test".to_string(),
            Some("Full Workflow Test Device".to_string())
        ).await.unwrap();
        
        // 2. Create educational structure
        let class1 = create_class(
            tauri::State::from(&state),
            "Class 5a".to_string(),
            "2023/24".to_string()
        ).await.unwrap();
        
        let class2 = create_class(
            tauri::State::from(&state),
            "Class 5b".to_string(),
            "2023/24".to_string()
        ).await.unwrap();
        
        // 3. Add students to classes
        let student1 = create_student(
            tauri::State::from(&state),
            class1.id,
            "Alice".to_string(),
            "Smith".to_string()
        ).await.unwrap();
        
        let student2 = create_student(
            tauri::State::from(&state),
            class1.id,
            "Bob".to_string(),
            "Jones".to_string()
        ).await.unwrap();
        
        let student3 = create_student(
            tauri::State::from(&state),
            class2.id,
            "Charlie".to_string(),
            "Brown".to_string()
        ).await.unwrap();
        
        // 4. Create observations
        let _obs1 = create_observation(
            tauri::State::from(&state),
            student1.id,
            "social".to_string(),
            "Alice shows excellent collaboration skills".to_string(),
            vec!["collaboration".to_string(), "positive".to_string()]
        ).await.unwrap();
        
        let _obs2 = create_observation(
            tauri::State::from(&state),
            student2.id,
            "academic".to_string(),
            "Bob needs support with mathematics".to_string(),
            vec!["mathematics".to_string(), "support_needed".to_string()]
        ).await.unwrap();
        
        let _obs3 = create_observation(
            tauri::State::from(&state),
            student3.id,
            "behavior".to_string(),
            "Charlie shows leadership qualities".to_string(),
            vec!["leadership".to_string(), "positive".to_string()]
        ).await.unwrap();
        
        // 5. Perform searches and queries
        let all_observations = search_observations(
            tauri::State::from(&state),
            None, None, None
        ).await.unwrap();
        assert_eq!(all_observations.len(), 3);
        
        let positive_observations = search_observations(
            tauri::State::from(&state),
            None, None, Some("positive".to_string())
        ).await.unwrap();
        assert_eq!(positive_observations.len(), 2);
        
        let class1_observations = search_observations(
            tauri::State::from(&state),
            Some(student1.id),
            None, None
        ).await.unwrap();
        assert_eq!(class1_observations.len(), 1);
        
        // 6. Export data for backup
        let full_export = export_all_data(
            tauri::State::from(&state),
            None
        ).await.unwrap();
        
        let export_data: serde_json::Value = serde_json::from_str(&full_export).unwrap();
        assert_eq!(export_data["data"]["classes"].as_array().unwrap().len(), 2);
        assert_eq!(export_data["data"]["students"].as_array().unwrap().len(), 3);
        assert_eq!(export_data["data"]["observations"].as_array().unwrap().len(), 3);
        
        // 7. Export changeset for sync
        let changeset_file = temp_dir.path().join("workflow_changeset.dat");
        let changeset_result = export_changeset_to_file(
            tauri::State::from(&state),
            changeset_file.to_str().unwrap().to_string(),
            Some(30)
        ).await.unwrap();
        assert!(changeset_result.contains("Exported changeset"));
        
        // 8. GDPR compliance operations
        let gdpr_export = export_student_data(
            tauri::State::from(&state),
            student1.id,
            "json".to_string()
        ).await.unwrap();
        
        let gdpr_data: serde_json::Value = serde_json::from_str(&gdpr_export).unwrap();
        assert_eq!(gdpr_data["student"]["first_name"], "Alice");
        assert_eq!(gdpr_data["observations"].as_array().unwrap().len(), 1);
        
        // 9. Verify system status
        let sync_status = get_sync_status(tauri::State::from(&state)).await.unwrap();
        assert_eq!(sync_status.peer_connected, false);
        assert_eq!(sync_status.last_sync, None);
        assert_eq!(sync_status.pending_changes, 0);
        
        // 10. Final cleanup test (soft delete)
        let _soft_delete = delete_student(
            tauri::State::from(&state),
            student3.id,
            Some(false)
        ).await.unwrap();
        
        let students_after_soft = get_students(tauri::State::from(&state)).await.unwrap();
        let deleted_student = students_after_soft.iter()
            .find(|s| s.id == student3.id)
            .unwrap();
        assert_eq!(deleted_student.status, "deleted");
        
        // Workflow completed successfully - all commands integrated properly
    }
}