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
        // Create initial tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                school_year TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
                text_encrypted BLOB NOT NULL,
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
                file_data_encrypted BLOB NOT NULL,
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

        Ok(())
    }

    pub async fn get_students(&self) -> Result<Vec<Student>> {
        let rows = sqlx::query("SELECT id, class_id, first_name, last_name, status FROM students WHERE status = 'active' ORDER BY last_name, first_name")
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
            });
        }
        Ok(students)
    }

    pub async fn get_classes(&self) -> Result<Vec<Class>> {
        let rows = sqlx::query("SELECT id, name, school_year FROM classes ORDER BY school_year DESC, name")
            .fetch_all(&self.pool)
            .await?;

        let mut classes = Vec::new();
        for row in rows {
            classes.push(Class {
                id: row.get("id"),
                name: row.get("name"),
                school_year: row.get("school_year"),
            });
        }
        Ok(classes)
    }

    pub async fn create_class(&self, name: String, school_year: String) -> Result<Class> {
        let id = sqlx::query(
            r#"
            INSERT INTO classes (name, school_year)
            VALUES (?, ?)
            "#,
        )
        .bind(&name)
        .bind(&school_year)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        Ok(Class { id, name, school_year })
    }

    pub async fn create_student(&self, class_id: i64, first_name: String, last_name: String, status: Option<String>) -> Result<Student> {
        let status = status.unwrap_or_else(|| "active".to_string());
        let id = sqlx::query(
            r#"
            INSERT INTO students (class_id, first_name, last_name, status)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(class_id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&status)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        Ok(Student { id, class_id, first_name, last_name, status })
    }

    pub async fn create_observation(
        &self,
        student_id: i64,
        author_id: i64,
        category: String,
        text: String,
        tags: Vec<String>,
    ) -> Result<Observation> {
        let encrypted_text = self.crypto.encrypt(text.as_bytes())?;
        let tags_json = serde_json::to_string(&tags)?;
        let now = Utc::now();
        let device_id = self.crypto.get_device_id();

        let id = sqlx::query(
            r#"
            INSERT INTO observations (student_id, author_id, category, text_encrypted, tags, created_at, updated_at, source_device_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(student_id)
        .bind(author_id)
        .bind(&category)
        .bind(&encrypted_text)
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
            tags,
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
        let mut sql = "SELECT id, student_id, author_id, category, text_encrypted, tags, created_at, updated_at, source_device_id FROM observations WHERE 1=1".to_string();
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
            let encrypted_text: Vec<u8> = row.get("text_encrypted");
            let decrypted_text = self.crypto.decrypt(&encrypted_text)?;
            let text = String::from_utf8(decrypted_text)?;
            
            let tags_json: String = row.get("tags");
            let tags: Vec<String> = serde_json::from_str(&tags_json)?;

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
                tags,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                source_device_id: row.get("source_device_id"),
            });
        }

        Ok(observations)
    }

    pub async fn get_pending_changesets(&self, peer_id: &str) -> Result<Vec<u8>> {
        // This would implement SQLite session/changeset functionality
        // For now, return empty changeset
        // In a full implementation, this would:
        // 1. Start a session
        // 2. Compare with peer's last_seq
        // 3. Generate changeset for all changes since then
        // 4. Return signed, versioned changeset
        Ok(Vec::new())
    }

    pub async fn apply_changeset(&self, changeset: &[u8], peer_id: &str) -> Result<()> {
        // This would apply SQLite changeset
        // In a full implementation, this would:
        // 1. Verify changeset signature
        // 2. Apply changeset to database
        // 3. Handle conflicts according to strategy
        // 4. Update sync_state for peer
        Ok(())
    }
}