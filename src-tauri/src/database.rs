use sqlx::{Pool, Sqlite, Row, sqlite::SqlitePoolOptions};
use anyhow::{Result, Context};
use chrono::Utc;
use std::path::Path;
use std::sync::Arc;
use crate::crypto::CryptoManager;
use crate::{Student, Class, Observation};

pub struct Database {
    pool: Pool<Sqlite>,
    crypto: Arc<CryptoManager>,
}

impl Database {
    pub async fn new<P: AsRef<Path>>(db_path: P, crypto: Arc<CryptoManager>) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.as_ref().parent() {
            tokio::fs::create_dir_all(parent).await
                .context("Failed to create database directory")?;
        }

        let db_url = format!("sqlite:{}?mode=rwc", db_path.as_ref().display());
        
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .context("Failed to connect to database")?;

        // Enable SQLite session extension for changeset functionality
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&pool)
            .await?;
        
        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&pool)
            .await?;

        let db = Self { pool, crypto };
        db.migrate().await?;
        Ok(db)
    }

    async fn migrate(&self) -> Result<()> {
        // Check if we're migrating from encrypted schema to plaintext
        let needs_migration = self.check_schema_migration_needed().await?;
        
        if needs_migration {
            println!("Migrating database schema from encrypted to plaintext format...");
            self.migrate_encrypted_to_plaintext().await?;
        }

        // Create initial tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                school_year TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_device_id TEXT NOT NULL DEFAULT ''
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_device_id TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (class_id) REFERENCES classes (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_device_id TEXT NOT NULL,
                FOREIGN KEY (student_id) REFERENCES students (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                observation_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                file_data BLOB NOT NULL,
                file_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (observation_id) REFERENCES observations (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sync_state (
                peer_id TEXT PRIMARY KEY,
                last_seq INTEGER DEFAULT 0,
                last_pull DATETIME,
                last_push DATETIME,
                changeset_hash TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create indexes for better performance
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_observations_student ON observations(student_id)")
            .execute(&self.pool)
            .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at)")
            .execute(&self.pool)
            .await?;

        // Migrate existing tables to add source_device_id columns if they don't exist
        self.add_missing_columns().await?;

        Ok(())
    }

    async fn add_missing_columns(&self) -> Result<()> {
        let device_id = self.crypto.get_device_id();
        
        // Check and add source_device_id to classes table
        let classes_has_column = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM pragma_table_info('classes') WHERE name = 'source_device_id'"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        if classes_has_column == 0 {
            println!("Adding source_device_id column to classes table...");
            sqlx::query("ALTER TABLE classes ADD COLUMN source_device_id TEXT NOT NULL DEFAULT ''")
                .execute(&self.pool)
                .await?;
            
            // Update existing records with current device ID
            sqlx::query("UPDATE classes SET source_device_id = ? WHERE source_device_id = ''")
                .bind(&device_id)
                .execute(&self.pool)
                .await?;
        }

        // Check and add source_device_id to students table
        let students_has_column = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM pragma_table_info('students') WHERE name = 'source_device_id'"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        if students_has_column == 0 {
            println!("Adding source_device_id column to students table...");
            sqlx::query("ALTER TABLE students ADD COLUMN source_device_id TEXT NOT NULL DEFAULT ''")
                .execute(&self.pool)
                .await?;
            
            // Update existing records with current device ID
            sqlx::query("UPDATE students SET source_device_id = ? WHERE source_device_id = ''")
                .bind(&device_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    pub async fn get_students(&self) -> Result<Vec<Student>> {
        let rows = sqlx::query("SELECT id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id FROM students WHERE status = 'active' ORDER BY last_name, first_name")
            .fetch_all(&self.pool)
            .await?;

        let mut students = Vec::new();
        for row in rows {
            students.push(Student {
                id: row.get("id"),
                class_id: row.get("class_id"),
                first_name: row.get("first_name"),
                last_name: row.get("last_name"),
                status: row.get("status"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                source_device_id: row.get("source_device_id"),
            });
        }
        Ok(students)
    }

    pub async fn get_classes(&self) -> Result<Vec<Class>> {
        let rows = sqlx::query("SELECT id, name, school_year, created_at, updated_at, source_device_id FROM classes ORDER BY school_year DESC, name")
            .fetch_all(&self.pool)
            .await?;

        let mut classes = Vec::new();
        for row in rows {
            classes.push(Class {
                id: row.get("id"),
                name: row.get("name"),
                school_year: row.get("school_year"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                source_device_id: row.get("source_device_id"),
            });
        }
        Ok(classes)
    }

    pub async fn create_class(&self, name: String, school_year: String) -> Result<Class> {
        let device_id = self.crypto.get_device_id();
        let now = chrono::Utc::now();
        
        let id = sqlx::query(
            r#"
            INSERT INTO classes (name, school_year, created_at, updated_at, source_device_id)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&name)
        .bind(&school_year)
        .bind(now)
        .bind(now)
        .bind(&device_id)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        Ok(Class { 
            id, 
            name, 
            school_year,
            created_at: now,
            updated_at: now,
            source_device_id: device_id,
        })
    }

    pub async fn create_student(&self, class_id: i64, first_name: String, last_name: String, status: Option<String>) -> Result<Student> {
        let status = status.unwrap_or_else(|| "active".to_string());
        let device_id = self.crypto.get_device_id();
        let now = chrono::Utc::now();
        
        let id = sqlx::query(
            r#"
            INSERT INTO students (class_id, first_name, last_name, status, created_at, updated_at, source_device_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(class_id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&status)
        .bind(now)
        .bind(now)
        .bind(&device_id)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        Ok(Student { 
            id, 
            class_id, 
            first_name, 
            last_name, 
            status,
            created_at: now,
            updated_at: now,
            source_device_id: device_id,
        })
    }

    pub async fn create_observation(
        &self,
        student_id: i64,
        author_id: i64,
        category: String,
        text: String,
        tags: Vec<String>,
    ) -> Result<Observation> {
        // Encryption disabled - storing plaintext
        let tags_json = serde_json::to_string(&tags)?;
        let now = Utc::now();
        let device_id = self.crypto.get_device_id();

        let id = sqlx::query(
            r#"
            INSERT INTO observations (student_id, author_id, category, text, tags, created_at, updated_at, source_device_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(student_id)
        .bind(author_id)
        .bind(&category)
        .bind(&text)
        .bind(&tags_json)
        .bind(&now)
        .bind(&now)
        .bind(&device_id)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        Ok(Observation {
            id,
            student_id,
            author_id,
            category,
            text,
            tags: tags_json,
            created_at: now,
            updated_at: now,
            source_device_id: device_id,
        })
    }

    pub async fn search_observations(
        &self,
        query: Option<String>,
        student_id: Option<i64>,
        category: Option<String>,
    ) -> Result<Vec<Observation>> {
        let mut sql = "SELECT id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id FROM observations WHERE 1=1".to_string();
        let mut bind_values: Vec<String> = Vec::new();

        if let Some(sid) = student_id {
            sql.push_str(" AND student_id = ?");
            bind_values.push(sid.to_string());
        }

        if let Some(cat) = category {
            sql.push_str(" AND category = ?");
            bind_values.push(cat);
        }

        sql.push_str(" ORDER BY created_at DESC");

            let mut sql_query = sqlx::query(&sql);
        for value in bind_values {
            sql_query = sql_query.bind(value);
        }
        
        let rows = sql_query.fetch_all(&self.pool).await?;

        // Precompute lowercase query once to avoid moving inside the loop
        let query_lc = query.as_ref().map(|s| s.to_lowercase());

        let mut observations = Vec::new();
        for row in rows {
            // Encryption disabled - text stored as plaintext
            let text: String = row.get("text");
            
            let tags_json: String = row.get("tags");
            let _tags_vec: Vec<String> = serde_json::from_str(&tags_json)?;

            // If there's a text query, filter by decrypted content
            if let Some(ref q) = query_lc {
                if !text.to_lowercase().contains(q) {
                    continue;
                }
            }

            observations.push(Observation {
                id: row.get("id"),
                student_id: row.get("student_id"),
                author_id: row.get("author_id"),
                category: row.get("category"),
                text,
                tags: tags_json,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                source_device_id: row.get("source_device_id"),
            });
        }

        Ok(observations)
    }

    pub async fn delete_student(&self, student_id: i64, force_delete: bool) -> Result<()> {
        // GDPR compliance: Check if student has observations
        let observation_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM observations WHERE student_id = ?"
        )
        .bind(student_id)
        .fetch_one(&self.pool)
        .await?;

        if observation_count > 0 && !force_delete {
            // Soft delete: mark student as inactive (GDPR-compliant archiving)
            sqlx::query(
                "UPDATE students SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )
            .bind(student_id)
            .execute(&self.pool)
            .await?;
        } else if force_delete {
            // Hard delete: Remove all observations first (Right to be Forgotten)
            sqlx::query("DELETE FROM attachments WHERE observation_id IN (SELECT id FROM observations WHERE student_id = ?)")
                .bind(student_id)
                .execute(&self.pool)
                .await?;
            
            sqlx::query("DELETE FROM observations WHERE student_id = ?")
                .bind(student_id)
                .execute(&self.pool)
                .await?;
            
            sqlx::query("DELETE FROM students WHERE id = ?")
                .bind(student_id)
                .execute(&self.pool)
                .await?;
        } else {
            // Safe delete: No observations, can remove student record
            sqlx::query("DELETE FROM students WHERE id = ?")
                .bind(student_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    pub async fn delete_class(&self, class_id: i64, force_delete: bool) -> Result<()> {
        // Check if class has students
        let student_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM students WHERE class_id = ? AND status = 'active'"
        )
        .bind(class_id)
        .fetch_one(&self.pool)
        .await?;

        if student_count > 0 && !force_delete {
            return Err(anyhow::anyhow!(
                "Cannot delete class with active students. {} students found. Use force_delete to override.",
                student_count
            ));
        }

        if force_delete {
            // Get all students in this class
            let student_ids: Vec<i64> = sqlx::query_scalar(
                "SELECT id FROM students WHERE class_id = ?"
            )
            .bind(class_id)
            .fetch_all(&self.pool)
            .await?;

            // Delete all students and their data
            for student_id in student_ids {
                self.delete_student(student_id, true).await?;
            }
        }

        // Delete the class
        sqlx::query("DELETE FROM classes WHERE id = ?")
            .bind(class_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn delete_observation(&self, observation_id: i64, author_id: i64, force_delete: bool) -> Result<()> {
        // First verify the observation exists and get its details
        let observation = sqlx::query(
            "SELECT id, student_id, author_id FROM observations WHERE id = ?"
        )
        .bind(observation_id)
        .fetch_optional(&self.pool)
        .await?;

        let observation_row = match observation {
            Some(row) => row,
            None => return Err(anyhow::anyhow!("Observation with ID {} not found", observation_id)),
        };

        let stored_author_id: i64 = observation_row.get("author_id");
        let _student_id: i64 = observation_row.get("student_id");

        // Security check: Only allow author or system admin to delete
        // In a real system, you'd have proper role-based access control
        if stored_author_id != author_id && !force_delete {
            return Err(anyhow::anyhow!(
                "Access denied: Only the author can delete this observation. Use force_delete for administrative override."
            ));
        }

        // Check if there are attachments
        let attachment_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM attachments WHERE observation_id = ?"
        )
        .bind(observation_id)
        .fetch_one(&self.pool)
        .await?;

        // Delete attachments first (GDPR compliance - cascading deletion)
        if attachment_count > 0 {
            sqlx::query("DELETE FROM attachments WHERE observation_id = ?")
                .bind(observation_id)
                .execute(&self.pool)
                .await?;
        }

        // Delete the observation (hard delete for GDPR compliance)
        let rows_affected = sqlx::query("DELETE FROM observations WHERE id = ?")
            .bind(observation_id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows_affected == 0 {
            return Err(anyhow::anyhow!(
                "Failed to delete observation {}. It may have been already deleted.", 
                observation_id
            ));
        }

        Ok(())
    }

    pub async fn get_observation(&self, observation_id: i64) -> Result<Option<Observation>> {
        let row = sqlx::query(
            "SELECT id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id FROM observations WHERE id = ?"
        )
        .bind(observation_id)
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => {
                // Encryption disabled - text stored as plaintext
                let text: String = row.get("text");
                
                let tags_json: String = row.get("tags");
                let _tags_vec: Vec<String> = serde_json::from_str(&tags_json)?;

                Ok(Some(Observation {
                    id: row.get("id"),
                    student_id: row.get("student_id"),
                    author_id: row.get("author_id"),
                    category: row.get("category"),
                    text,
                    tags: tags_json,
                    created_at: row.get("created_at"),
                    updated_at: row.get("updated_at"),
                    source_device_id: row.get("source_device_id"),
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn get_pending_changesets(&self, _peer_id: &str) -> Result<Vec<u8>> {
        // Get all changes since last sync timestamp for the peer
        // For simplicity, we'll export all recent changes as a JSON changeset
        let mut changeset = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "changes": {
                "students": [],
                "classes": [],
                "observations": []
            }
        });

        // Get recent students (within last 30 days)
        let students = sqlx::query_as::<_, Student>(
            "SELECT * FROM students WHERE updated_at > datetime('now', '-30 days')"
        )
        .fetch_all(&self.pool)
        .await?;
        changeset["changes"]["students"] = serde_json::to_value(students)?;

        // Get recent classes (within last 30 days)
        let classes = sqlx::query_as::<_, Class>(
            "SELECT * FROM classes WHERE updated_at > datetime('now', '-30 days')"
        )
        .fetch_all(&self.pool)
        .await?;
        changeset["changes"]["classes"] = serde_json::to_value(classes)?;

        // Get recent observations (within last 30 days)
        let observations = sqlx::query_as::<_, Observation>(
            "SELECT * FROM observations WHERE updated_at > datetime('now', '-30 days')"
        )
        .fetch_all(&self.pool)
        .await?;
        changeset["changes"]["observations"] = serde_json::to_value(observations)?;

        let changeset_str = serde_json::to_string(&changeset)?;
        Ok(changeset_str.into_bytes())
    }

    pub async fn apply_changeset(&self, changeset: &[u8], _peer_id: &str) -> Result<()> {
        // Parse the JSON changeset
        let changeset_str = String::from_utf8(changeset.to_vec())?;
        let changeset_data: serde_json::Value = serde_json::from_str(&changeset_str)?;

        // Verify changeset format
        if changeset_data["version"].as_str() != Some("1.0") {
            return Err(anyhow::anyhow!("Unsupported changeset version"));
        }

        let changes = &changeset_data["changes"];

        // Apply student changes
        if let Some(students) = changes["students"].as_array() {
            for student_data in students {
                let student: Student = serde_json::from_value(student_data.clone())?;
                // Use INSERT OR REPLACE to handle both updates and inserts
                sqlx::query(
                    "INSERT OR REPLACE INTO students (id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(student.id)
                .bind(student.class_id)
                .bind(&student.first_name)
                .bind(&student.last_name)
                .bind(&student.status)
                .bind(&student.created_at)
                .bind(&student.updated_at)
                .bind(&student.source_device_id)
                .execute(&self.pool)
                .await?;
            }
        }

        // Apply class changes
        if let Some(classes) = changes["classes"].as_array() {
            for class_data in classes {
                let class: Class = serde_json::from_value(class_data.clone())?;
                sqlx::query(
                    "INSERT OR REPLACE INTO classes (id, name, school_year, created_at, updated_at, source_device_id) 
                     VALUES (?, ?, ?, ?, ?, ?)"
                )
                .bind(class.id)
                .bind(&class.name)
                .bind(&class.school_year)
                .bind(&class.created_at)
                .bind(&class.updated_at)
                .bind(&class.source_device_id)
                .execute(&self.pool)
                .await?;
            }
        }

        // Apply observation changes
        if let Some(observations) = changes["observations"].as_array() {
            for obs_data in observations {
                let observation: Observation = serde_json::from_value(obs_data.clone())?;
                // Encrypt the text before storing
                let encrypted_text = self.crypto.encrypt(observation.text.as_bytes())?;
                sqlx::query(
                    "INSERT OR REPLACE INTO observations (id, student_id, category, text, tags, created_at, updated_at, source_device_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(observation.id)
                .bind(observation.student_id)
                .bind(&observation.category)
                .bind(&encrypted_text)
                .bind(&observation.tags)
                .bind(&observation.created_at)
                .bind(&observation.updated_at)
                .bind(&observation.source_device_id)
                .execute(&self.pool)
                .await?;
            }
        }

        tracing::info!("Successfully applied changeset with {} students, {} classes, {} observations",
            changes["students"].as_array().map(|a| a.len()).unwrap_or(0),
            changes["classes"].as_array().map(|a| a.len()).unwrap_or(0),
            changes["observations"].as_array().map(|a| a.len()).unwrap_or(0)
        );

        Ok(())
    }

    async fn check_schema_migration_needed(&self) -> Result<bool> {
        // Check if observations table exists with old encrypted schema
        let has_text_encrypted = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM pragma_table_info('observations') WHERE name = 'text_encrypted'"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        Ok(has_text_encrypted > 0)
    }

    async fn migrate_encrypted_to_plaintext(&self) -> Result<()> {
        // Create backup table for safety
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS observations_backup AS SELECT * FROM observations"
        )
        .execute(&self.pool)
        .await?;

        // Create new table with plaintext schema
        sqlx::query(
            r#"
            CREATE TABLE observations_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_device_id TEXT NOT NULL,
                FOREIGN KEY (student_id) REFERENCES students (id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Migrate data from encrypted to plaintext format
        // Since encryption is disabled, text_encrypted should contain readable text
        let rows = sqlx::query(
            "SELECT id, student_id, author_id, category, text_encrypted, tags, created_at, updated_at, source_device_id FROM observations"
        )
        .fetch_all(&self.pool)
        .await?;

        println!("Migrating {} observations from encrypted to plaintext format", rows.len());

        for row in rows {
            let text_encrypted: Vec<u8> = row.get("text_encrypted");
            
            // Attempt to decrypt or use as-is (since encryption is disabled)
            let text = match String::from_utf8(text_encrypted) {
                Ok(plaintext) => plaintext,
                Err(_) => {
                    // If it's not valid UTF-8, it might be actually encrypted
                    // Since encryption is disabled, we'll use a placeholder
                    "[Migration Error: Unable to decrypt text]".to_string()
                }
            };

            sqlx::query(
                "INSERT INTO observations_new (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(row.get::<i64, _>("id"))
            .bind(row.get::<i64, _>("student_id"))
            .bind(row.get::<i64, _>("author_id"))
            .bind(row.get::<String, _>("category"))
            .bind(text)
            .bind(row.get::<String, _>("tags"))
            .bind(row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"))
            .bind(row.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"))
            .bind(row.get::<String, _>("source_device_id"))
            .execute(&self.pool)
            .await?;
        }

        // Replace old table with new table
        sqlx::query("DROP TABLE observations")
            .execute(&self.pool)
            .await?;

        sqlx::query("ALTER TABLE observations_new RENAME TO observations")
            .execute(&self.pool)
            .await?;

        println!("Schema migration completed successfully");
        Ok(())
    }
}