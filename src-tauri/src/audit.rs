use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{sqlite::SqlitePool, Pool, Row, Sqlite};
use std::path::Path;

pub struct AuditLogger {
    pool: Pool<Sqlite>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub action: String,
    pub object_type: String,
    pub object_id: i64,
    pub user_id: i64,
    pub timestamp: DateTime<Utc>,
    pub details: Option<Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

impl AuditLogger {
    pub async fn new<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.as_ref().parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .context("Failed to create audit directory")?;
        }

        let db_url = format!("sqlite:{}?mode=rwc", db_path.as_ref().display());
        let pool = SqlitePool::connect(&db_url)
            .await
            .context("Failed to connect to audit database")?;

        let logger = Self { pool };
        logger.migrate().await?;
        Ok(logger)
    }

    async fn migrate(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                object_type TEXT NOT NULL,
                object_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes for better query performance
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_log(object_type, object_id)",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn log_action(
        &self,
        action: &str,
        object_type: &str,
        object_id: i64,
        user_id: i64,
        details: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO audit_log (action, object_type, object_id, user_id, details)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(action)
        .bind(object_type)
        .bind(object_id)
        .bind(user_id)
        .bind(details)
        .execute(&self.pool)
        .await
        .context("Failed to log audit entry")?;

        Ok(())
    }

    pub async fn log_action_with_context(
        &self,
        action: &str,
        object_type: &str,
        object_id: i64,
        user_id: i64,
        details: Option<&str>,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO audit_log (action, object_type, object_id, user_id, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(action)
        .bind(object_type)
        .bind(object_id)
        .bind(user_id)
        .bind(details)
        .bind(ip_address)
        .bind(user_agent)
        .execute(&self.pool)
        .await
        .context("Failed to log audit entry with context")?;

        Ok(())
    }

    pub async fn get_entries(
        &self,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<AuditEntry>> {
        let limit = limit.unwrap_or(100);
        let offset = offset.unwrap_or(0);

        let entries = sqlx::query_as::<_, AuditEntry>(
            r#"
            SELECT id, action, object_type, object_id, user_id, timestamp, 
                   details, ip_address, user_agent
            FROM audit_log 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch audit entries")?;

        Ok(entries)
    }

    pub async fn get_entries_for_object(
        &self,
        object_type: &str,
        object_id: i64,
    ) -> Result<Vec<AuditEntry>> {
        let entries = sqlx::query_as::<_, AuditEntry>(
            r#"
            SELECT id, action, object_type, object_id, user_id, timestamp, 
                   details, ip_address, user_agent
            FROM audit_log 
            WHERE object_type = ? AND object_id = ?
            ORDER BY timestamp DESC
            "#,
        )
        .bind(object_type)
        .bind(object_id)
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch audit entries for object")?;

        Ok(entries)
    }

    pub async fn get_entries_for_user(
        &self,
        user_id: i64,
        limit: Option<i64>,
    ) -> Result<Vec<AuditEntry>> {
        let limit = limit.unwrap_or(100);

        let entries = sqlx::query_as::<_, AuditEntry>(
            r#"
            SELECT id, action, object_type, object_id, user_id, timestamp, 
                   details, ip_address, user_agent
            FROM audit_log 
            WHERE user_id = ?
            ORDER BY timestamp DESC 
            LIMIT ?
            "#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch audit entries for user")?;

        Ok(entries)
    }

    pub async fn get_entries_by_action(
        &self,
        action: &str,
        limit: Option<i64>,
    ) -> Result<Vec<AuditEntry>> {
        let limit = limit.unwrap_or(100);

        let entries = sqlx::query_as::<_, AuditEntry>(
            r#"
            SELECT id, action, object_type, object_id, user_id, timestamp, 
                   details, ip_address, user_agent
            FROM audit_log 
            WHERE action = ?
            ORDER BY timestamp DESC 
            LIMIT ?
            "#,
        )
        .bind(action)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch audit entries by action")?;

        Ok(entries)
    }

    pub async fn get_entries_since(
        &self,
        since: DateTime<Utc>,
        limit: Option<i64>,
    ) -> Result<Vec<AuditEntry>> {
        let limit = limit.unwrap_or(1000);

        let entries = sqlx::query_as::<_, AuditEntry>(
            r#"
            SELECT id, action, object_type, object_id, user_id, timestamp, 
                   details, ip_address, user_agent
            FROM audit_log 
            WHERE timestamp >= ?
            ORDER BY timestamp DESC 
            LIMIT ?
            "#,
        )
        .bind(since)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch audit entries since timestamp")?;

        Ok(entries)
    }

    pub async fn count_entries(&self) -> Result<i64> {
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM audit_log")
            .fetch_one(&self.pool)
            .await
            .context("Failed to count audit entries")?;

        Ok(count)
    }

    pub async fn cleanup_old_entries(&self, retention_days: i32) -> Result<i64> {
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days as i64);

        let result = sqlx::query(
            "DELETE FROM audit_log WHERE timestamp < ?",
        )
        .bind(cutoff_date)
        .execute(&self.pool)
        .await
        .context("Failed to cleanup old audit entries")?;

        Ok(result.rows_affected() as i64)
    }

    // Verify audit log integrity - audit logs should be immutable
    pub async fn verify_integrity(&self) -> Result<bool> {
        // Check that timestamps are monotonic (no backdating)
        let count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM audit_log a1 
            JOIN audit_log a2 ON a1.id < a2.id 
            WHERE a1.timestamp > a2.timestamp
            "#,
        )
        .fetch_one(&self.pool)
        .await
        .context("Failed to verify audit log integrity")?;

        Ok(count == 0)
    }

    // Get statistics for GDPR compliance reporting
    pub async fn get_statistics(&self) -> Result<AuditStatistics> {
        let total_entries = self.count_entries().await?;
        
        let oldest_entry = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
            "SELECT MIN(timestamp) FROM audit_log",
        )
        .fetch_one(&self.pool)
        .await
        .context("Failed to get oldest audit entry")?;

        let newest_entry = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
            "SELECT MAX(timestamp) FROM audit_log",
        )
        .fetch_one(&self.pool)
        .await
        .context("Failed to get newest audit entry")?;

        let actions_count = sqlx::query(
            "SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC",
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to get action statistics")?;

        let mut action_statistics = std::collections::HashMap::new();
        for row in actions_count {
            let action: String = row.get("action");
            let count: i64 = row.get("count");
            action_statistics.insert(action, count);
        }

        Ok(AuditStatistics {
            total_entries,
            oldest_entry,
            newest_entry,
            action_statistics,
        })
    }

    #[cfg(test)]
    pub async fn clear_all_entries(&self) -> Result<()> {
        sqlx::query("DELETE FROM audit_log")
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[derive(Debug, serde::Serialize)]
pub struct AuditStatistics {
    pub total_entries: i64,
    pub oldest_entry: Option<DateTime<Utc>>,
    pub newest_entry: Option<DateTime<Utc>>,
    pub action_statistics: std::collections::HashMap<String, i64>,
}

// Implement SQLx FromRow for AuditEntry
impl sqlx::FromRow<'_, sqlx::sqlite::SqliteRow> for AuditEntry {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> std::result::Result<Self, sqlx::Error> {
        let details_str: Option<String> = row.try_get("details")?;
        let details = match details_str {
            Some(s) => serde_json::from_str(&s).ok(),
            None => None,
        };

        Ok(AuditEntry {
            id: row.try_get("id")?,
            action: row.try_get("action")?,
            object_type: row.try_get("object_type")?,
            object_id: row.try_get("object_id")?,
            user_id: row.try_get("user_id")?,
            timestamp: row.try_get("timestamp")?,
            details,
            ip_address: row.try_get("ip_address")?,
            user_agent: row.try_get("user_agent")?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    async fn create_test_audit_logger() -> (AuditLogger, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_audit.db");
        let logger = AuditLogger::new(&db_path).await.unwrap();
        (logger, temp_dir)
    }

    #[tokio::test]
    async fn test_create_audit_logger() {
        let (logger, _temp_dir) = create_test_audit_logger().await;
        let count = logger.count_entries().await.unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_log_simple_action() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        logger
            .log_action("create", "student", 123, 1, Some("Test student creation"))
            .await
            .unwrap();

        let entries = logger.get_entries(None, None).await.unwrap();
        assert_eq!(entries.len(), 1);
        
        let entry = &entries[0];
        assert_eq!(entry.action, "create");
        assert_eq!(entry.object_type, "student");
        assert_eq!(entry.object_id, 123);
        assert_eq!(entry.user_id, 1);
        assert!(entry.details.is_some());
    }

    #[tokio::test]
    async fn test_log_action_with_context() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        logger
            .log_action_with_context(
                "delete",
                "observation",
                456,
                2,
                Some("Force delete"),
                Some("192.168.1.1"),
                Some("Mozilla/5.0"),
            )
            .await
            .unwrap();

        let entries = logger.get_entries(None, None).await.unwrap();
        assert_eq!(entries.len(), 1);
        
        let entry = &entries[0];
        assert_eq!(entry.action, "delete");
        assert_eq!(entry.object_type, "observation");
        assert_eq!(entry.object_id, 456);
        assert_eq!(entry.user_id, 2);
        assert_eq!(entry.ip_address.as_ref().unwrap(), "192.168.1.1");
        assert_eq!(entry.user_agent.as_ref().unwrap(), "Mozilla/5.0");
    }

    #[tokio::test]
    async fn test_get_entries_for_object() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Log multiple actions for the same object
        logger.log_action("create", "student", 123, 1, None).await.unwrap();
        logger.log_action("update", "student", 123, 1, Some("Name change")).await.unwrap();
        logger.log_action("delete", "student", 456, 1, None).await.unwrap();

        let student_123_entries = logger.get_entries_for_object("student", 123).await.unwrap();
        assert_eq!(student_123_entries.len(), 2);

        let student_456_entries = logger.get_entries_for_object("student", 456).await.unwrap();
        assert_eq!(student_456_entries.len(), 1);

        // Entries should be ordered by timestamp DESC
        assert_eq!(student_123_entries[0].action, "update");
        assert_eq!(student_123_entries[1].action, "create");
    }

    #[tokio::test]
    async fn test_get_entries_for_user() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Log actions for different users
        logger.log_action("create", "student", 123, 1, None).await.unwrap();
        logger.log_action("create", "student", 124, 1, None).await.unwrap();
        logger.log_action("create", "student", 125, 2, None).await.unwrap();

        let user_1_entries = logger.get_entries_for_user(1, None).await.unwrap();
        assert_eq!(user_1_entries.len(), 2);

        let user_2_entries = logger.get_entries_for_user(2, None).await.unwrap();
        assert_eq!(user_2_entries.len(), 1);

        // Test limit
        let user_1_limited = logger.get_entries_for_user(1, Some(1)).await.unwrap();
        assert_eq!(user_1_limited.len(), 1);
    }

    #[tokio::test]
    async fn test_get_entries_by_action() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Log different actions
        logger.log_action("create", "student", 123, 1, None).await.unwrap();
        logger.log_action("update", "student", 123, 1, None).await.unwrap();
        logger.log_action("delete", "student", 123, 1, None).await.unwrap();
        logger.log_action("create", "class", 456, 1, None).await.unwrap();

        let create_entries = logger.get_entries_by_action("create", None).await.unwrap();
        assert_eq!(create_entries.len(), 2);

        let update_entries = logger.get_entries_by_action("update", None).await.unwrap();
        assert_eq!(update_entries.len(), 1);

        let delete_entries = logger.get_entries_by_action("delete", None).await.unwrap();
        assert_eq!(delete_entries.len(), 1);
    }

    #[tokio::test]
    async fn test_get_entries_since() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        let now = Utc::now();
        let one_hour_ago = now - chrono::Duration::hours(1);
        let two_hours_ago = now - chrono::Duration::hours(2);

        // Log some entries
        logger.log_action("create", "student", 123, 1, None).await.unwrap();
        
        // Wait a tiny bit to ensure different timestamps
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        
        logger.log_action("update", "student", 123, 1, None).await.unwrap();

        // Get all entries since 2 hours ago
        let entries_since = logger.get_entries_since(two_hours_ago, None).await.unwrap();
        assert_eq!(entries_since.len(), 2);

        // Get entries since 1 hour in the future (should be empty)
        let future_time = now + chrono::Duration::hours(1);
        let future_entries = logger.get_entries_since(future_time, None).await.unwrap();
        assert_eq!(future_entries.len(), 0);
    }

    #[tokio::test]
    async fn test_pagination() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Create 15 audit entries
        for i in 0..15 {
            logger.log_action("test", "object", i, 1, Some(&format!("Entry {}", i))).await.unwrap();
        }

        // Test limit
        let first_page = logger.get_entries(Some(10), None).await.unwrap();
        assert_eq!(first_page.len(), 10);

        // Test offset
        let second_page = logger.get_entries(Some(10), Some(10)).await.unwrap();
        assert_eq!(second_page.len(), 5);

        // Verify no overlap
        assert_ne!(first_page[0].id, second_page[0].id);

        let total_count = logger.count_entries().await.unwrap();
        assert_eq!(total_count, 15);
    }

    #[tokio::test]
    async fn test_cleanup_old_entries() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Create some entries
        logger.log_action("old", "test", 1, 1, None).await.unwrap();
        logger.log_action("recent", "test", 2, 1, None).await.unwrap();

        let count_before = logger.count_entries().await.unwrap();
        assert_eq!(count_before, 2);

        // Cleanup entries older than 0 days (should remove all)
        let deleted_count = logger.cleanup_old_entries(0).await.unwrap();
        assert_eq!(deleted_count, 2);

        let count_after = logger.count_entries().await.unwrap();
        assert_eq!(count_after, 0);
    }

    #[tokio::test]
    async fn test_audit_immutability() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Log some entries
        logger.log_action("create", "student", 123, 1, None).await.unwrap();
        
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        
        logger.log_action("update", "student", 123, 1, None).await.unwrap();

        // Verify integrity (no backdated entries)
        let integrity_ok = logger.verify_integrity().await.unwrap();
        assert!(integrity_ok);

        // Try to manually insert a backdated entry (simulating tampering)
        let backdated_time = Utc::now() - chrono::Duration::hours(1);
        sqlx::query(
            "INSERT INTO audit_log (action, object_type, object_id, user_id, timestamp) VALUES (?, ?, ?, ?, ?)",
        )
        .bind("backdated")
        .bind("test")
        .bind(999)
        .bind(1)
        .bind(backdated_time)
        .execute(&logger.pool)
        .await
        .unwrap();

        // Now integrity should fail
        let integrity_after_tampering = logger.verify_integrity().await.unwrap();
        assert!(!integrity_after_tampering);
    }

    #[tokio::test]
    async fn test_audit_statistics() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Create varied audit entries
        logger.log_action("create", "student", 1, 1, None).await.unwrap();
        logger.log_action("create", "student", 2, 1, None).await.unwrap();
        logger.log_action("update", "student", 1, 1, None).await.unwrap();
        logger.log_action("delete", "student", 2, 1, None).await.unwrap();
        logger.log_action("export", "data", 1, 1, None).await.unwrap();

        let stats = logger.get_statistics().await.unwrap();
        
        assert_eq!(stats.total_entries, 5);
        assert!(stats.oldest_entry.is_some());
        assert!(stats.newest_entry.is_some());
        
        // Check action statistics
        assert_eq!(stats.action_statistics.get("create").unwrap(), &2);
        assert_eq!(stats.action_statistics.get("update").unwrap(), &1);
        assert_eq!(stats.action_statistics.get("delete").unwrap(), &1);
        assert_eq!(stats.action_statistics.get("export").unwrap(), &1);
    }

    #[tokio::test]
    async fn test_complex_details_json() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        let complex_details = serde_json::json!({
            "original_value": "Max Mustermann",
            "new_value": "Max Schmidt",
            "field": "last_name",
            "reason": "Marriage"
        });

        logger.log_action("update", "student", 123, 1, Some(&complex_details.to_string())).await.unwrap();

        let entries = logger.get_entries_for_object("student", 123).await.unwrap();
        assert_eq!(entries.len(), 1);
        
        let entry = &entries[0];
        assert!(entry.details.is_some());
        
        let details = entry.details.as_ref().unwrap();
        assert_eq!(details["field"], "last_name");
        assert_eq!(details["reason"], "Marriage");
    }

    #[tokio::test]
    async fn test_gdpr_compliance_scenarios() {
        let (logger, _temp_dir) = create_test_audit_logger().await;

        // Simulate GDPR data subject request
        logger.log_action("export", "student_data", 123, 1, Some("GDPR Article 15 request")).await.unwrap();
        
        // Simulate right to rectification
        logger.log_action("update", "student", 123, 1, Some("GDPR Article 16 correction")).await.unwrap();
        
        // Simulate right to erasure
        logger.log_action("delete", "student", 123, 1, Some("GDPR Article 17 right to be forgotten")).await.unwrap();

        // Verify all GDPR actions are logged
        let gdpr_entries = logger.get_entries_for_object("student", 123).await.unwrap();
        assert_eq!(gdpr_entries.len(), 2); // export targets student_data, not student

        let export_entries = logger.get_entries_for_object("student_data", 123).await.unwrap();
        assert_eq!(export_entries.len(), 1);

        // Verify audit trail shows complete GDPR compliance
        let all_entries = logger.get_entries(None, None).await.unwrap();
        assert_eq!(all_entries.len(), 3);

        // Check that we can trace the complete lifecycle
        let lifecycle = all_entries.iter()
            .filter(|e| (e.object_type == "student" && e.object_id == 123) || 
                       (e.object_type == "student_data" && e.object_id == 123))
            .collect::<Vec<_>>();
        assert_eq!(lifecycle.len(), 3);
    }
}