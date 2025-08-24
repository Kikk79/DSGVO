use crate::crypto::CryptoManager;
use crate::{Class, Observation, Student};
use anyhow::{Context, Result};
// use chrono::Utc; // Temporarily unused
use sha2::{Digest, Sha256};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::Path;
use std::sync::Arc;

pub struct Database {
    pool: Pool<Sqlite>,
    crypto: Arc<CryptoManager>,
}

impl Database {
    pub async fn new<P: AsRef<Path>>(db_path: P, crypto: Arc<CryptoManager>) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.as_ref().parent() {
            tokio::fs::create_dir_all(parent)
                .await
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

        sqlx::query("PRAGMA foreign_keys=ON").execute(&pool).await?;

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
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#3B82F6',
                background_color TEXT NOT NULL DEFAULT '#EBF8FF',
                text_color TEXT NOT NULL DEFAULT '#1E3A8A', 
                is_active BOOLEAN NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
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
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_observations_student ON observations(student_id)",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at)",
        )
        .execute(&self.pool)
        .await?;

        // Migrate existing tables to add source_device_id columns if they don't exist
        self.add_missing_columns().await?;
        
        // Seed default categories if none exist
        self.seed_default_categories().await?;

        Ok(())
    }

    async fn add_missing_columns(&self) -> Result<()> {
        let device_id = self.crypto.get_device_id();

        // Check and add source_device_id to classes table
        let classes_has_column = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM pragma_table_info('classes') WHERE name = 'source_device_id'",
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
            "SELECT COUNT(*) FROM pragma_table_info('students') WHERE name = 'source_device_id'",
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        if students_has_column == 0 {
            println!("Adding source_device_id column to students table...");
            sqlx::query(
                "ALTER TABLE students ADD COLUMN source_device_id TEXT NOT NULL DEFAULT ''",
            )
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

    // Legacy migration support for encrypted -> plaintext transition
    async fn check_schema_migration_needed(&self) -> Result<bool> {
        // Check if we have the old encrypted text column
        let has_encrypted_column = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='observations' AND sql LIKE '%text_encrypted%'",
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        Ok(has_encrypted_column > 0)
    }

    async fn migrate_encrypted_to_plaintext(&self) -> Result<()> {
        // This is a placeholder for encrypted->plaintext migration
        // In practice, you would decrypt the data and move it to the plaintext columns
        println!("Note: Encrypted data migration not implemented - starting with fresh database");
        Ok(())
    }

    // Class operations
    pub async fn create_class(&self, name: String, school_year: String) -> Result<Class> {
        let device_id = self.crypto.get_device_id();

        let class = sqlx::query_as::<_, Class>(
            r#"
            INSERT INTO classes (name, school_year, source_device_id)
            VALUES (?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(&name)
        .bind(&school_year)
        .bind(&device_id)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create class")?;

        Ok(class)
    }

    pub async fn get_classes(&self) -> Result<Vec<Class>> {
        let classes = sqlx::query_as::<_, Class>("SELECT * FROM classes ORDER BY name")
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch classes")?;

        Ok(classes)
    }

    pub async fn delete_class(&self, class_id: i64, force_delete: bool) -> Result<()> {
        if force_delete {
            // Hard delete: remove class and all related data
            sqlx::query("DELETE FROM observations WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)")
                .bind(class_id)
                .execute(&self.pool)
                .await?;

            sqlx::query("DELETE FROM students WHERE class_id = ?")
                .bind(class_id)
                .execute(&self.pool)
                .await?;

            sqlx::query("DELETE FROM classes WHERE id = ?")
                .bind(class_id)
                .execute(&self.pool)
                .await?;
        } else {
            // Soft delete: check if class has students
            let student_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM students WHERE class_id = ? AND status != 'deleted'",
            )
            .bind(class_id)
            .fetch_one(&self.pool)
            .await?;

            if student_count > 0 {
                return Err(anyhow::anyhow!(
                    "Cannot delete class with active students. Use force delete or remove students first."
                ));
            }

            sqlx::query("DELETE FROM classes WHERE id = ?")
                .bind(class_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    // Student operations
    pub async fn create_student(
        &self,
        class_id: i64,
        first_name: String,
        last_name: String,
        status: Option<String>,
    ) -> Result<Student> {
        let device_id = self.crypto.get_device_id();
        let status = status.unwrap_or_else(|| "active".to_string());

        let student = sqlx::query_as::<_, Student>(
            r#"
            INSERT INTO students (class_id, first_name, last_name, status, source_device_id)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(class_id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&status)
        .bind(&device_id)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create student")?;

        Ok(student)
    }

    pub async fn get_students(&self) -> Result<Vec<Student>> {
        let students = sqlx::query_as::<_, Student>(
            "SELECT * FROM students WHERE status != 'deleted' ORDER BY last_name, first_name",
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch students")?;

        Ok(students)
    }

    pub async fn delete_student(&self, student_id: i64, force_delete: bool) -> Result<()> {
        if force_delete {
            // Hard delete: remove student and all observations
            sqlx::query("DELETE FROM observations WHERE student_id = ?")
                .bind(student_id)
                .execute(&self.pool)
                .await?;

            sqlx::query("DELETE FROM students WHERE id = ?")
                .bind(student_id)
                .execute(&self.pool)
                .await?;
        } else {
            // Soft delete: mark as deleted
            sqlx::query("UPDATE students SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(student_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    // Observation operations
    pub async fn create_observation(
        &self,
        student_id: i64,
        author_id: i64,
        category: String,
        text: String,
        tags: Vec<String>,
    ) -> Result<Observation> {
        let device_id = self.crypto.get_device_id();
        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

        let observation = sqlx::query_as::<_, Observation>(
            r#"
            INSERT INTO observations (student_id, author_id, category, text, tags, source_device_id)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(student_id)
        .bind(author_id)
        .bind(&category)
        .bind(&text)
        .bind(&tags_json)
        .bind(&device_id)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create observation")?;

        Ok(observation)
    }

    pub async fn get_observation(&self, observation_id: i64) -> Result<Option<Observation>> {
        let observation = sqlx::query_as::<_, Observation>(
            "SELECT * FROM observations WHERE id = ?",
        )
        .bind(observation_id)
        .fetch_optional(&self.pool)
        .await
        .context("Failed to fetch observation")?;

        Ok(observation)
    }

    pub async fn search_observations(
        &self,
        query: Option<String>,
        student_id: Option<i64>,
        category: Option<String>,
    ) -> Result<Vec<Observation>> {
        let mut sql = "SELECT * FROM observations WHERE 1=1".to_string();
        let mut params: Vec<String> = Vec::new();

        if let Some(q) = query {
            sql.push_str(" AND text LIKE ?");
            params.push(format!("%{}%", q));
        }

        if let Some(sid) = student_id {
            sql.push_str(" AND student_id = ?");
            params.push(sid.to_string());
        }

        if let Some(cat) = category {
            sql.push_str(" AND category = ?");
            params.push(cat);
        }

        sql.push_str(" ORDER BY created_at DESC");

        let mut query_builder = sqlx::query_as::<_, Observation>(&sql);
        
        for param in params {
            query_builder = query_builder.bind(param);
        }

        let observations = query_builder
            .fetch_all(&self.pool)
            .await
            .context("Failed to search observations")?;

        Ok(observations)
    }

    pub async fn get_observations_since(&self, since: chrono::DateTime<chrono::Utc>) -> Result<Vec<Observation>> {
        let observations = sqlx::query_as::<_, Observation>(
            "SELECT * FROM observations WHERE created_at >= ? ORDER BY created_at DESC",
        )
        .bind(since)
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch observations since timestamp")?;

        Ok(observations)
    }

    pub async fn delete_observation(
        &self,
        observation_id: i64,
        author_id: i64,
        force_delete: bool,
    ) -> Result<()> {
        if force_delete {
            // Hard delete: remove completely
            sqlx::query("DELETE FROM observations WHERE id = ?")
                .bind(observation_id)
                .execute(&self.pool)
                .await?;
        } else {
            // Check if user is the author
            let author_check = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM observations WHERE id = ? AND author_id = ?",
            )
            .bind(observation_id)
            .bind(author_id)
            .fetch_one(&self.pool)
            .await?;

            if author_check == 0 {
                return Err(anyhow::anyhow!(
                    "Permission denied: You can only delete your own observations"
                ));
            }

            sqlx::query("DELETE FROM observations WHERE id = ? AND author_id = ?")
                .bind(observation_id)
                .bind(author_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    // Sync and changeset operations
    pub async fn get_pending_changesets(&self, _operation: &str) -> Result<Vec<u8>> {
        // Placeholder for changeset export functionality
        // In a real implementation, this would track changes and serialize them
        let changeset = serde_json::json!({
            "format": "changeset_v1",
            "timestamp": chrono::Utc::now(),
            "changes": []
        });

        Ok(changeset.to_string().into_bytes())
    }

    pub async fn apply_changeset(&self, _changeset: &[u8], _operation: &str) -> Result<()> {
        // Placeholder for changeset import functionality
        // In a real implementation, this would parse and apply changes
        Ok(())
    }

    pub async fn create_changeset_file(&self, days_back: u32) -> Result<Vec<u8>> {
        let device_id = self.crypto.get_device_id();
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(days_back as i64);

        let recent_observations = self.get_observations_since(cutoff_date).await?;
        
        let changeset = serde_json::json!({
            "format": "changeset_file_v1",
            "version": "1.0",
            "timestamp": chrono::Utc::now(),
            "device_id": device_id,
            "days_back": days_back,
            "changes": {
                "observations": recent_observations
            }
        });

        // Calculate checksum for integrity
        let content = changeset.to_string();
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let checksum = format!("{:x}", hasher.finalize());

        let final_changeset = serde_json::json!({
            "checksum": checksum,
            "data": changeset
        });

        Ok(final_changeset.to_string().into_bytes())
    }

    pub async fn apply_changeset_file(&self, changeset_data: &[u8]) -> Result<String> {
        let content = String::from_utf8(changeset_data.to_vec())
            .context("Invalid changeset file encoding")?;

        let parsed: serde_json::Value = serde_json::from_str(&content)
            .context("Invalid changeset file format")?;

        // Verify checksum
        let stored_checksum = parsed.get("checksum")
            .and_then(|c| c.as_str())
            .context("Missing checksum in changeset file")?;

        let data_section = parsed.get("data")
            .context("Missing data section in changeset file")?;

        let data_content = data_section.to_string();
        let mut hasher = Sha256::new();
        hasher.update(data_content.as_bytes());
        let calculated_checksum = format!("{:x}", hasher.finalize());

        if stored_checksum != calculated_checksum {
            return Err(anyhow::anyhow!("Checksum verification failed"));
        }

        // Extract observations and merge them
        let observations_data = data_section.get("changes")
            .and_then(|c| c.get("observations"))
            .and_then(|o| o.as_array())
            .context("Invalid observations data in changeset")?;

        let mut imported_count = 0;
        for obs_value in observations_data {
            if let Ok(obs) = serde_json::from_value::<Observation>(obs_value.clone()) {
                // Check if observation already exists
                let exists = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM observations WHERE id = ?",
                )
                .bind(obs.id)
                .fetch_one(&self.pool)
                .await?;

                if exists == 0 {
                    // Insert new observation (preserving original ID and timestamps)
                    sqlx::query(
                        r#"
                        INSERT INTO observations (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        "#,
                    )
                    .bind(obs.id)
                    .bind(obs.student_id)
                    .bind(obs.author_id)
                    .bind(obs.category)
                    .bind(obs.text)
                    .bind(obs.tags)
                    .bind(obs.created_at)
                    .bind(obs.updated_at)
                    .bind(obs.source_device_id)
                    .execute(&self.pool)
                    .await?;

                    imported_count += 1;
                }
            }
        }

        Ok(format!("Successfully imported {} observations", imported_count))
    }

    pub async fn import_full_backup(&self, backup_data: &[u8]) -> Result<String> {
        let content = String::from_utf8(backup_data.to_vec())
            .context("Invalid backup file encoding")?;

        let parsed: serde_json::Value = serde_json::from_str(&content)
            .context("Invalid backup file format")?;

        let mut imported_students = 0;
        let mut imported_classes = 0;
        let mut imported_observations = 0;

        // Import classes first (due to foreign key constraints)
        if let Some(classes_data) = parsed.get("data").and_then(|d| d.get("classes")).and_then(|c| c.as_array()) {
            for class_value in classes_data {
                if let Ok(class) = serde_json::from_value::<Class>(class_value.clone()) {
                    let exists = sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM classes WHERE id = ?",
                    )
                    .bind(class.id)
                    .fetch_one(&self.pool)
                    .await?;

                    if exists == 0 {
                        sqlx::query(
                            "INSERT INTO classes (id, name, school_year, created_at, updated_at, source_device_id) VALUES (?, ?, ?, ?, ?, ?)",
                        )
                        .bind(class.id)
                        .bind(class.name)
                        .bind(class.school_year)
                        .bind(class.created_at)
                        .bind(class.updated_at)
                        .bind(class.source_device_id)
                        .execute(&self.pool)
                        .await?;

                        imported_classes += 1;
                    }
                }
            }
        }

        // Import students
        if let Some(students_data) = parsed.get("data").and_then(|d| d.get("students")).and_then(|s| s.as_array()) {
            for student_value in students_data {
                if let Ok(student) = serde_json::from_value::<Student>(student_value.clone()) {
                    let exists = sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM students WHERE id = ?",
                    )
                    .bind(student.id)
                    .fetch_one(&self.pool)
                    .await?;

                    if exists == 0 {
                        sqlx::query(
                            "INSERT INTO students (id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        )
                        .bind(student.id)
                        .bind(student.class_id)
                        .bind(student.first_name)
                        .bind(student.last_name)
                        .bind(student.status)
                        .bind(student.created_at)
                        .bind(student.updated_at)
                        .bind(student.source_device_id)
                        .execute(&self.pool)
                        .await?;

                        imported_students += 1;
                    }
                }
            }
        }

        // Import observations
        if let Some(observations_data) = parsed.get("data").and_then(|d| d.get("observations")).and_then(|o| o.as_array()) {
            for obs_value in observations_data {
                if let Ok(obs) = serde_json::from_value::<Observation>(obs_value.clone()) {
                    let exists = sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM observations WHERE id = ?",
                    )
                    .bind(obs.id)
                    .fetch_one(&self.pool)
                    .await?;

                    if exists == 0 {
                        sqlx::query(
                            "INSERT INTO observations (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        )
                        .bind(obs.id)
                        .bind(obs.student_id)
                        .bind(obs.author_id)
                        .bind(obs.category)
                        .bind(obs.text)
                        .bind(obs.tags)
                        .bind(obs.created_at)
                        .bind(obs.updated_at)
                        .bind(obs.source_device_id)
                        .execute(&self.pool)
                        .await?;

                        imported_observations += 1;
                    }
                }
            }
        }

        Ok(format!(
            "Successfully imported {} classes, {} students, {} observations",
            imported_classes, imported_students, imported_observations
        ))
    }

    async fn seed_default_categories(&self) -> Result<()> {
        // Check if categories already exist
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(&self.pool)
            .await?;

        if count > 0 {
            return Ok(()); // Categories already exist
        }

        let device_id = self.crypto.get_device_id();
        
        // Default categories with appealing colors
        let default_categories = vec![
            ("Sozial", "#10B981", "#D1FAE5", "#065F46", 1), // Green theme
            ("Fachlich", "#3B82F6", "#DBEAFE", "#1E3A8A", 2), // Blue theme  
            ("Verhalten", "#F59E0B", "#FEF3C7", "#92400E", 3), // Amber theme
            ("Förderung", "#8B5CF6", "#EDE9FE", "#5B21B6", 4), // Purple theme
            ("Sonstiges", "#6B7280", "#F3F4F6", "#374151", 5), // Gray theme
        ];

        let category_count = default_categories.len();

        for (name, color, bg_color, text_color, sort_order) in default_categories {
            sqlx::query(
                r#"
                INSERT INTO categories (name, color, background_color, text_color, is_active, sort_order, source_device_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(name)
            .bind(color)
            .bind(bg_color) 
            .bind(text_color)
            .bind(true)
            .bind(sort_order)
            .bind(&device_id)
            .execute(&self.pool)
            .await?;
        }

        println!("Created {} default categories", category_count);
        Ok(())
    }

    // Category CRUD operations
    pub async fn get_categories(&self) -> Result<Vec<crate::Category>> {
        let categories = sqlx::query_as::<_, crate::Category>(
            "SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC"
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch categories")?;
        Ok(categories)
    }

    pub async fn create_category(&self, name: String, color: String, background_color: String, text_color: String) -> Result<crate::Category> {
        let device_id = self.crypto.get_device_id();
        
        // Get next sort order
        let max_order: i32 = sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) FROM categories")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let category = sqlx::query_as::<_, crate::Category>(
            r#"
            INSERT INTO categories (name, color, background_color, text_color, is_active, sort_order, source_device_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#
        )
        .bind(&name)
        .bind(&color)
        .bind(&background_color)
        .bind(&text_color)
        .bind(true)
        .bind(max_order + 1)
        .bind(&device_id)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create category")?;
        Ok(category)
    }

    pub async fn update_category(&self, id: i64, name: String, color: String, background_color: String, text_color: String) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE categories 
            SET name = ?, color = ?, background_color = ?, text_color = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#
        )
        .bind(&name)
        .bind(&color)
        .bind(&background_color)
        .bind(&text_color)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_category(&self, id: i64, force_delete: bool) -> Result<()> {
        if !force_delete {
            // Check if category is used in observations
            let usage_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM observations WHERE category = (SELECT name FROM categories WHERE id = ?)")
                .bind(id)
                .fetch_one(&self.pool)
                .await?;

            if usage_count > 0 {
                // Soft delete: mark as inactive
                sqlx::query("UPDATE categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                    .bind(id)
                    .execute(&self.pool)
                    .await?;
                return Ok(());
            }
        }
        
        // Hard delete: remove completely
        sqlx::query("DELETE FROM categories WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn clear_all_data(&self) -> Result<()> {
        sqlx::query("DELETE FROM observations").execute(&self.pool).await?;
        sqlx::query("DELETE FROM students").execute(&self.pool).await?;
        sqlx::query("DELETE FROM classes").execute(&self.pool).await?;
        sqlx::query("DELETE FROM categories").execute(&self.pool).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    async fn create_test_db() -> (Database, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let crypto = Arc::new(CryptoManager::new().unwrap());
        let db = Database::new(&db_path, crypto).await.unwrap();
        (db, temp_dir)
    }

    #[tokio::test]
    async fn test_create_and_get_class() {
        let (db, _temp_dir) = create_test_db().await;

        // Create a class
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        assert_eq!(class.name, "5a");
        assert_eq!(class.school_year, "2023/24");

        // Get all classes
        let classes = db.get_classes().await.unwrap();
        assert_eq!(classes.len(), 1);
        assert_eq!(classes[0].name, "5a");
    }

    #[tokio::test]
    async fn test_create_and_get_student() {
        let (db, _temp_dir) = create_test_db().await;

        // Create a class first
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();

        // Create a student
        let student = db.create_student(
            class.id,
            "Max".to_string(),
            "Mustermann".to_string(),
            Some("active".to_string()),
        ).await.unwrap();

        assert_eq!(student.first_name, "Max");
        assert_eq!(student.last_name, "Mustermann");
        assert_eq!(student.class_id, class.id);

        // Get all students
        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0].first_name, "Max");
    }

    #[tokio::test]
    async fn test_soft_delete_student() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class and student
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Soft delete student
        db.delete_student(student.id, false).await.unwrap();

        // Student should not appear in regular queries
        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 0);
    }

    #[tokio::test]
    async fn test_hard_delete_student() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class and student
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Create observation for student
        let _observation = db.create_observation(
            student.id,
            1,
            "social".to_string(),
            "Test observation".to_string(),
            vec!["test".to_string()],
        ).await.unwrap();

        // Hard delete student
        db.delete_student(student.id, true).await.unwrap();

        // Student should be completely gone
        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 0);

        // Observations should also be gone
        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 0);
    }

    #[tokio::test]
    async fn test_create_and_search_observations() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup class and student
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Create observation
        let observation = db.create_observation(
            student.id,
            1,
            "social".to_string(),
            "Shows excellent teamwork skills".to_string(),
            vec!["teamwork".to_string(), "social".to_string()],
        ).await.unwrap();

        assert_eq!(observation.student_id, student.id);
        assert_eq!(observation.category, "social");
        assert!(observation.text.contains("teamwork"));

        // Search observations
        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1);

        // Search by student ID
        let student_observations = db.search_observations(None, Some(student.id), None).await.unwrap();
        assert_eq!(student_observations.len(), 1);

        // Search by text query
        let text_search = db.search_observations(Some("teamwork".to_string()), None, None).await.unwrap();
        assert_eq!(text_search.len(), 1);

        // Search by category
        let category_search = db.search_observations(None, None, Some("social".to_string())).await.unwrap();
        assert_eq!(category_search.len(), 1);
    }

    #[tokio::test]
    async fn test_delete_observation_permissions() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
        let observation = db.create_observation(
            student.id,
            1, // Author ID 1
            "social".to_string(),
            "Test observation".to_string(),
            vec![],
        ).await.unwrap();

        // Author should be able to delete their observation
        let result = db.delete_observation(observation.id, 1, false).await;
        assert!(result.is_ok());

        // Recreate observation for next test
        let observation2 = db.create_observation(
            student.id,
            1, // Author ID 1
            "social".to_string(),
            "Test observation 2".to_string(),
            vec![],
        ).await.unwrap();

        // Different user should not be able to delete
        let result = db.delete_observation(observation2.id, 2, false).await; // Different author ID
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Permission denied"));

        // Force delete should work regardless of author
        let result = db.delete_observation(observation2.id, 2, true).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_get_observations_since() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Create observation
        let _observation = db.create_observation(
            student.id,
            1,
            "social".to_string(),
            "Recent observation".to_string(),
            vec![],
        ).await.unwrap();

        // Get observations from 1 hour ago
        let one_hour_ago = chrono::Utc::now() - chrono::Duration::hours(1);
        let recent_observations = db.get_observations_since(one_hour_ago).await.unwrap();
        assert_eq!(recent_observations.len(), 1);

        // Get observations from 1 hour in the future (should be empty)
        let future_time = chrono::Utc::now() + chrono::Duration::hours(1);
        let future_observations = db.get_observations_since(future_time).await.unwrap();
        assert_eq!(future_observations.len(), 0);
    }

    #[tokio::test]
    async fn test_changeset_file_operations() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup test data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
        let _observation = db.create_observation(
            student.id,
            1,
            "social".to_string(),
            "Test for changeset".to_string(),
            vec!["test".to_string()],
        ).await.unwrap();

        // Create changeset file
        let changeset_data = db.create_changeset_file(30).await.unwrap();
        assert!(!changeset_data.is_empty());

        // Parse the changeset to verify structure
        let content = String::from_utf8(changeset_data.clone()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        
        assert!(parsed.get("checksum").is_some());
        assert!(parsed.get("data").is_some());

        // Clear database and re-import
        db.clear_all_data().await.unwrap();
        let empty_observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(empty_observations.len(), 0);

        // Apply changeset
        let result = db.apply_changeset_file(&changeset_data).await.unwrap();
        assert!(result.contains("Successfully imported"));

        // Verify data was restored
        let restored_observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(restored_observations.len(), 1);
        assert_eq!(restored_observations[0].text, "Test for changeset");
    }

    #[tokio::test]
    async fn test_full_backup_operations() {
        let (db, _temp_dir) = create_test_db().await;

        // Create comprehensive test data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
        let _observation = db.create_observation(
            student.id,
            1,
            "social".to_string(),
            "Full backup test".to_string(),
            vec!["backup".to_string(), "test".to_string()],
        ).await.unwrap();

        // Create a mock full backup JSON
        let backup_json = serde_json::json!({
            "format": "full_export",
            "version": "1.0",
            "data": {
                "classes": [class],
                "students": [student],
                "observations": [{
                    "id": 999,
                    "student_id": student.id,
                    "author_id": 1,
                    "category": "test",
                    "text": "Imported observation",
                    "tags": "[\"imported\"]",
                    "created_at": chrono::Utc::now(),
                    "updated_at": chrono::Utc::now(),
                    "source_device_id": "test-device"
                }]
            }
        });

        let backup_data = backup_json.to_string().into_bytes();

        // Clear existing data
        db.clear_all_data().await.unwrap();

        // Import backup
        let result = db.import_full_backup(&backup_data).await.unwrap();
        assert!(result.contains("Successfully imported"));

        // Verify imported data
        let classes = db.get_classes().await.unwrap();
        assert_eq!(classes.len(), 1);

        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 1);

        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 2); // Original + imported
        
        // Find the imported observation
        let imported_obs = observations.iter()
            .find(|o| o.text == "Imported observation")
            .expect("Imported observation not found");
        assert_eq!(imported_obs.id, 999);
    }

    #[tokio::test]
    async fn test_class_deletion_with_students() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class with student
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let _student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Soft delete should fail
        let result = db.delete_class(class.id, false).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Cannot delete class with active students"));

        // Force delete should work
        let result = db.delete_class(class.id, true).await;
        assert!(result.is_ok());

        // Verify class is gone
        let classes = db.get_classes().await.unwrap();
        assert_eq!(classes.len(), 0);

        // Verify students are gone
        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 0);
    }

    #[tokio::test]
    async fn test_database_integrity_foreign_keys() {
        let (db, _temp_dir) = create_test_db().await;

        // Try to create student with non-existent class
        let result = db.create_student(999, "Max".to_string(), "Mustermann".to_string(), None).await;
        assert!(result.is_err()); // Should fail due to foreign key constraint

        // Create valid class first
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await;
        assert!(student.is_ok()); // Should work now

        // Try to create observation with non-existent student
        let result = db.create_observation(999, 1, "test".to_string(), "test".to_string(), vec![]).await;
        assert!(result.is_err()); // Should fail due to foreign key constraint
    }

    // ========== UNIFIED SYNCHRONIZATION SYSTEM TESTS ==========

    #[tokio::test]
    async fn test_sync_export_changeset_empty_database() {
        let (db, _temp_dir) = create_test_db().await;

        // Export changeset from empty database
        let changeset = db.create_changeset_file(30).await.unwrap();
        assert!(!changeset.is_empty());

        // Parse and verify structure
        let changeset_data: serde_json::Value = serde_json::from_str(&changeset).unwrap();
        assert_eq!(changeset_data["changeset"]["students"].as_array().unwrap().len(), 0);
        assert_eq!(changeset_data["changeset"]["classes"].as_array().unwrap().len(), 0);
        assert_eq!(changeset_data["changeset"]["observations"].as_array().unwrap().len(), 0);
        assert!(changeset_data["checksum"].as_str().unwrap().len() > 0);
    }

    #[tokio::test]
    async fn test_sync_export_changeset_with_data() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup test data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
        let observation = db.create_observation(
            student.id, 
            1, 
            "test".to_string(), 
            "Test observation".to_string(), 
            vec!["tag1".to_string()]
        ).await.unwrap();

        // Export changeset
        let changeset = db.create_changeset_file(30).await.unwrap();
        
        // Parse and verify content
        let changeset_data: serde_json::Value = serde_json::from_str(&changeset).unwrap();
        assert_eq!(changeset_data["changeset"]["students"].as_array().unwrap().len(), 1);
        assert_eq!(changeset_data["changeset"]["classes"].as_array().unwrap().len(), 1);
        assert_eq!(changeset_data["changeset"]["observations"].as_array().unwrap().len(), 1);

        // Verify checksum exists
        let checksum = changeset_data["checksum"].as_str().unwrap();
        assert!(!checksum.is_empty());

        // Verify metadata
        assert!(changeset_data["timestamp"].as_str().is_some());
        assert_eq!(changeset_data["source_device_id"].as_str().unwrap(), "device_001");
    }

    #[tokio::test]
    async fn test_sync_export_changeset_time_filtering() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class and student
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Create old observation (simulate by creating it first)
        let _old_obs = db.create_observation(
            student.id, 
            1, 
            "old".to_string(), 
            "Old observation".to_string(), 
            vec![]
        ).await.unwrap();

        // Wait to ensure time difference
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Get cutoff time
        let cutoff_time = chrono::Utc::now();

        // Create new observation
        let _new_obs = db.create_observation(
            student.id, 
            1, 
            "new".to_string(), 
            "New observation".to_string(), 
            vec![]
        ).await.unwrap();

        // Export with time filter (get observations since cutoff)
        let observations = db.get_observations_since(cutoff_time - chrono::Duration::seconds(1)).await.unwrap();
        
        // Should contain both observations (within time range)
        assert_eq!(observations.len(), 2);

        // Test with very recent cutoff (should get only new observation)
        let observations = db.get_observations_since(cutoff_time).await.unwrap();
        assert_eq!(observations.len(), 1);
        assert_eq!(observations[0].text, "New observation");
    }

    #[tokio::test]
    async fn test_sync_import_changeset_success() {
        let (db, _temp_dir) = create_test_db().await;

        // Create initial data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Create changeset with new data
        let changeset_json = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source_device_id": "device_002",
            "changeset": {
                "classes": [{"id": 100, "name": "6b", "school_year": "2023/24"}],
                "students": [{"id": 200, "class_id": 100, "first_name": "Anna", "last_name": "Test", "status": "active", "source_device_id": "device_002"}],
                "observations": [{"id": 300, "student_id": 200, "author_id": 1, "category": "social", "text": "Imported observation", "tags": "[\"imported\"]", "created_at": chrono::Utc::now(), "updated_at": chrono::Utc::now(), "source_device_id": "device_002"}]
            },
            "checksum": "test_checksum_123"
        });

        let changeset_data = changeset_json.to_string().into_bytes();

        // Apply changeset
        let result = db.apply_changeset_file(&changeset_data).await.unwrap();
        assert!(result.contains("Successfully applied changeset"));

        // Verify imported data
        let classes = db.get_classes().await.unwrap();
        assert_eq!(classes.len(), 2); // Original + imported

        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 2); // Original + imported

        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1); // Only imported (no observations in original)

        // Find imported data
        let imported_class = classes.iter().find(|c| c.name == "6b").unwrap();
        assert_eq!(imported_class.id, 100);

        let imported_student = students.iter().find(|s| s.first_name == "Anna").unwrap();
        assert_eq!(imported_student.id, 200);
        assert_eq!(imported_student.class_id, 100);
    }

    #[tokio::test]
    async fn test_sync_import_changeset_invalid_format() {
        let (db, _temp_dir) = create_test_db().await;

        // Test with invalid JSON
        let invalid_data = b"invalid json data";
        let result = db.apply_changeset_file(invalid_data).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("JSON"));

        // Test with missing required fields
        let incomplete_json = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339()
            // Missing changeset and checksum
        });
        
        let incomplete_data = incomplete_json.to_string().into_bytes();
        let result = db.apply_changeset_file(&incomplete_data).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_sync_import_changeset_constraint_violations() {
        let (db, _temp_dir) = create_test_db().await;

        // Create changeset with invalid foreign key references
        let changeset_json = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source_device_id": "device_002",
            "changeset": {
                "classes": [],
                "students": [{"id": 200, "class_id": 999, "first_name": "Anna", "last_name": "Test", "status": "active", "source_device_id": "device_002"}], // Non-existent class_id
                "observations": []
            },
            "checksum": "test_checksum_123"
        });

        let changeset_data = changeset_json.to_string().into_bytes();

        // Apply changeset should handle constraint violations gracefully
        let result = db.apply_changeset_file(&changeset_data).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("FOREIGN KEY constraint"));
    }

    #[tokio::test]
    async fn test_sync_full_export_with_filtering() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup test data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student1 = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
        let student2 = db.create_student(class.id, "Anna".to_string(), "Test".to_string(), None).await.unwrap();

        // Create observations with different timestamps
        let _obs1 = db.create_observation(student1.id, 1, "old".to_string(), "Old observation".to_string(), vec![]).await.unwrap();
        let _obs2 = db.create_observation(student2.id, 1, "recent".to_string(), "Recent observation".to_string(), vec![]).await.unwrap();

        // Test full export (all data)
        let all_classes = db.get_classes().await.unwrap();
        let all_students = db.get_students().await.unwrap();
        let all_observations = db.search_observations(None, None, None).await.unwrap();

        assert_eq!(all_classes.len(), 1);
        assert_eq!(all_students.len(), 2);
        assert_eq!(all_observations.len(), 2);

        // Test time-filtered export
        let cutoff = chrono::Utc::now() - chrono::Duration::days(1);
        let filtered_observations = db.get_observations_since(cutoff).await.unwrap();
        assert_eq!(filtered_observations.len(), 2); // Both should be within 1 day
    }

    #[tokio::test]
    async fn test_sync_full_backup_import_with_conflicts() {
        let (db, _temp_dir) = create_test_db().await;

        // Create initial data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();
        let _observation = db.create_observation(student.id, 1, "original".to_string(), "Original observation".to_string(), vec![]).await.unwrap();

        // Create backup with conflicting IDs
        let backup_json = serde_json::json!({
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
                "device_name": "test-device"
            },
            "data": {
                "classes": [{"id": class.id, "name": "5a_updated", "school_year": "2024/25"}], // Same ID, different data
                "students": [{"id": student.id, "class_id": class.id, "first_name": "Max_Updated", "last_name": "Mustermann", "status": "active", "source_device_id": "backup-device"}], // Same ID, different data
                "observations": [{"id": 999, "student_id": student.id, "author_id": 1, "category": "imported", "text": "Backup observation", "tags": "[\"backup\"]", "created_at": chrono::Utc::now(), "updated_at": chrono::Utc::now(), "source_device_id": "backup-device"}]
            }
        });

        let backup_data = backup_json.to_string().into_bytes();

        // Import backup (should handle conflicts by updating existing records)
        let result = db.import_full_backup(&backup_data).await.unwrap();
        assert!(result.contains("Successfully imported"));

        // Verify conflict resolution - existing records should be updated
        let classes = db.get_classes().await.unwrap();
        assert_eq!(classes.len(), 1);
        assert_eq!(classes[0].name, "5a_updated"); // Updated name
        assert_eq!(classes[0].school_year, "2024/25"); // Updated year

        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 1);
        assert_eq!(students[0].first_name, "Max_Updated"); // Updated name

        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 2); // Original + imported
    }

    #[tokio::test]
    async fn test_sync_checksum_verification() {
        let (db, _temp_dir) = create_test_db().await;

        // Create test data
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None).await.unwrap();

        // Export changeset to get checksum
        let changeset1 = db.create_changeset_file(30).await.unwrap();
        let changeset_data1: serde_json::Value = serde_json::from_str(&changeset1).unwrap();
        let checksum1 = changeset_data1["checksum"].as_str().unwrap();

        // Export again immediately - checksum should be identical
        let changeset2 = db.create_changeset_file(30).await.unwrap();
        let changeset_data2: serde_json::Value = serde_json::from_str(&changeset2).unwrap();
        let checksum2 = changeset_data2["checksum"].as_str().unwrap();

        assert_eq!(checksum1, checksum2);

        // Add new observation
        let _new_obs = db.create_observation(student.id, 1, "new".to_string(), "New observation".to_string(), vec![]).await.unwrap();

        // Export again - checksum should be different
        let changeset3 = db.create_changeset_file(30).await.unwrap();
        let changeset_data3: serde_json::Value = serde_json::from_str(&changeset3).unwrap();
        let checksum3 = changeset_data3["checksum"].as_str().unwrap();

        assert_ne!(checksum1, checksum3);
        assert!(!checksum3.is_empty());
    }

    #[tokio::test]
    async fn test_sync_device_metadata_handling() {
        let (db, _temp_dir) = create_test_db().await;

        // Create data with specific device ID
        let class = db.create_class("5a".to_string(), "2023/24".to_string()).await.unwrap();
        let student = db.create_student(class.id, "Max".to_string(), "Mustermann".to_string(), Some("device_123".to_string())).await.unwrap();

        // Verify device ID is stored
        assert_eq!(student.source_device_id, "device_123");

        // Create changeset with device from other device
        let changeset_json = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source_device_id": "device_456",
            "changeset": {
                "classes": [],
                "students": [{"id": 999, "class_id": class.id, "first_name": "Remote", "last_name": "User", "status": "active", "source_device_id": "device_456"}],
                "observations": []
            },
            "checksum": "test_checksum"
        });

        let changeset_data = changeset_json.to_string().into_bytes();
        let _result = db.apply_changeset_file(&changeset_data).await.unwrap();

        // Verify imported student has correct device ID
        let students = db.get_students().await.unwrap();
        let remote_student = students.iter().find(|s| s.first_name == "Remote").unwrap();
        assert_eq!(remote_student.source_device_id, "device_456");
    }

    #[tokio::test]
    async fn test_sync_large_dataset_performance() {
        let (db, _temp_dir) = create_test_db().await;

        // Create large dataset
        let class = db.create_class("Performance Test".to_string(), "2023/24".to_string()).await.unwrap();

        // Create 50 students
        let mut student_ids = Vec::new();
        for i in 0..50 {
            let student = db.create_student(
                class.id, 
                format!("Student{}", i), 
                "Test".to_string(), 
                Some(format!("device_{}", i % 5))
            ).await.unwrap();
            student_ids.push(student.id);
        }

        // Create 100 observations
        for i in 0..100 {
            let student_id = student_ids[i % student_ids.len()];
            let _obs = db.create_observation(
                student_id,
                1,
                "performance".to_string(),
                format!("Performance test observation {}", i),
                vec![format!("tag{}", i % 10)]
            ).await.unwrap();
        }

        // Test export performance
        let start = std::time::Instant::now();
        let changeset = db.create_changeset_file(365).await.unwrap();
        let export_duration = start.elapsed();

        // Verify export completed and contains expected data
        let changeset_data: serde_json::Value = serde_json::from_str(&changeset).unwrap();
        assert_eq!(changeset_data["changeset"]["students"].as_array().unwrap().len(), 50);
        assert_eq!(changeset_data["changeset"]["classes"].as_array().unwrap().len(), 1);
        assert_eq!(changeset_data["changeset"]["observations"].as_array().unwrap().len(), 100);

        // Export should complete in reasonable time (under 1 second for this size)
        assert!(export_duration.as_millis() < 1000, "Export took too long: {:?}", export_duration);

        // Test full export performance
        let start = std::time::Instant::now();
        let all_students = db.get_students().await.unwrap();
        let all_classes = db.get_classes().await.unwrap();
        let all_observations = db.search_observations(None, None, None).await.unwrap();
        let full_export_duration = start.elapsed();

        // Verify data integrity
        assert_eq!(all_students.len(), 50);
        assert_eq!(all_classes.len(), 1);
        assert_eq!(all_observations.len(), 100);

        // Full export should also be fast
        assert!(full_export_duration.as_millis() < 1000, "Full export took too long: {:?}", full_export_duration);
    }
}