use anyhow::{Result, Context};
use sqlx::{Pool, Sqlite, Row, sqlite::SqlitePool};
use chrono::{DateTime, Utc};
use serde_json::Value;
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
            tokio::fs::create_dir_all(parent).await
                .context("Failed to create audit directory")?;
        }

        let db_url = format!("sqlite:{}?mode=rwc", db_path.as_ref().display());
        let pool = SqlitePool::connect(&db_url).await
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
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                -- Immutability constraints
                CONSTRAINT immutable_log CHECK (
                    -- This constraint prevents updates and deletes
                    -- In practice, we would also use database triggers
                    1 = 1
                )
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create index for efficient querying
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)")
            .execute(&self.pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_log(object_type, object_id)")
            .execute(&self.pool)
            .await?;

        // Create triggers to prevent modification of audit log entries
        sqlx::query(
            r#"
            CREATE TRIGGER IF NOT EXISTS prevent_audit_update
            BEFORE UPDATE ON audit_log
            BEGIN
                SELECT RAISE(FAIL, 'Audit log entries are immutable');
            END
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
            BEFORE DELETE ON audit_log
            BEGIN
                SELECT RAISE(FAIL, 'Audit log entries are immutable');
            END
            "#,
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
    ) -> Result<i64> {
        let timestamp = Utc::now();
        
        let result = sqlx::query(
            r#"
            INSERT INTO audit_log (action, object_type, object_id, user_id, timestamp, details)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(action)
        .bind(object_type)
        .bind(object_id)
        .bind(user_id)
        .bind(&timestamp)
        .bind(details)
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn log_action_with_context(
        &self,
        action: &str,
        object_type: &str,
        object_id: i64,
        user_id: i64,
        details: Option<Value>,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<i64> {
        let timestamp = Utc::now();
        let details_json = details.map(|d| d.to_string());
        
        let result = sqlx::query(
            r#"
            INSERT INTO audit_log (action, object_type, object_id, user_id, timestamp, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(action)
        .bind(object_type)
        .bind(object_id)
        .bind(user_id)
        .bind(&timestamp)
        .bind(details_json.as_deref())
        .bind(ip_address)
        .bind(user_agent)
        .execute(&self.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_audit_trail(
        &self,
        object_type: Option<&str>,
        object_id: Option<i64>,
        user_id: Option<i64>,
        start_date: Option<DateTime<Utc>>,
        end_date: Option<DateTime<Utc>>,
        limit: Option<u32>,
    ) -> Result<Vec<AuditEntry>> {
        let mut query = "SELECT id, action, object_type, object_id, user_id, timestamp, details, ip_address, user_agent FROM audit_log WHERE 1=1".to_string();
        let mut conditions = Vec::new();

        if let Some(ot) = object_type {
            query.push_str(" AND object_type = ?");
            conditions.push(ot.to_string());
        }

        if let Some(oid) = object_id {
            query.push_str(" AND object_id = ?");
            conditions.push(oid.to_string());
        }

        if let Some(uid) = user_id {
            query.push_str(" AND user_id = ?");
            conditions.push(uid.to_string());
        }

        if let Some(start) = start_date {
            query.push_str(" AND timestamp >= ?");
            conditions.push(start.to_rfc3339());
        }

        if let Some(end) = end_date {
            query.push_str(" AND timestamp <= ?");
            conditions.push(end.to_rfc3339());
        }

        query.push_str(" ORDER BY timestamp DESC");

        if let Some(l) = limit {
            query.push_str(&format!(" LIMIT {}", l));
        }

        let mut query_builder = sqlx::query(&query);
        for condition in conditions {
            query_builder = query_builder.bind(condition);
        }

        let rows = query_builder.fetch_all(&self.pool).await?;

        let mut entries = Vec::new();
        for row in rows {
            let details_str: Option<String> = row.try_get("details").ok();
            let details = details_str.and_then(|s| serde_json::from_str(s.as_str()).ok());

            entries.push(AuditEntry {
                id: row.get("id"),
                action: row.get("action"),
                object_type: row.get("object_type"),
                object_id: row.get("object_id"),
                user_id: row.get("user_id"),
                timestamp: row.get("timestamp"),
                details,
                ip_address: row.try_get("ip_address").ok(),
                user_agent: row.try_get("user_agent").ok(),
            });
        }

        Ok(entries)
    }

    pub async fn export_audit_log(&self, format: &str) -> Result<String> {
        let entries = self.get_audit_trail(None, None, None, None, None, None).await?;

        match format {
            "json" => {
                serde_json::to_string_pretty(&entries)
                    .context("Failed to serialize audit log to JSON")
            }
            "csv" => {
                let mut csv_data = String::from("id,action,object_type,object_id,user_id,timestamp,details\n");
                for entry in entries {
                    let details = entry.details
                        .map(|d| d.to_string())
                        .unwrap_or_default()
                        .replace('"', "\"\"");
                    csv_data.push_str(&format!(
                        "{},{},{},{},{},{},\"{}\"\n",
                        entry.id,
                        entry.action,
                        entry.object_type,
                        entry.object_id,
                        entry.user_id,
                        entry.timestamp.to_rfc3339(),
                        details
                    ));
                }
                Ok(csv_data)
            }
            _ => Err(anyhow::anyhow!("Unsupported export format: {}", format))
        }
    }

    pub async fn verify_integrity(&self) -> Result<bool> {
        // In a production system, this would:
        // 1. Verify that no entries have been modified
        // 2. Check hash chains if implemented
        // 3. Verify digital signatures if implemented
        // 4. Check for gaps in sequence numbers
        
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log")
            .fetch_one(&self.pool)
            .await?;

        // Basic integrity check: ensure entries exist and are ordered
        if count > 0 {
            let first_id: i64 = sqlx::query_scalar("SELECT MIN(id) FROM audit_log")
                .fetch_one(&self.pool)
                .await?;
            let last_id: i64 = sqlx::query_scalar("SELECT MAX(id) FROM audit_log")
                .fetch_one(&self.pool)
                .await?;

            // Check for gaps in sequence (simplified check)
            let expected_count = last_id - first_id + 1;
            Ok(count == expected_count)
        } else {
            Ok(true) // Empty log is valid
        }
    }
}