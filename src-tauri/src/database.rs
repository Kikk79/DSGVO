use sqlx::{Pool, Sqlite, Row, sqlite::SqlitePoolOptions};
use anyhow::{Result, Context};
use chrono::Utc;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use crate::crypto::CryptoManager;
use crate::{Student, Class, Observation};

use rusqlite::{Connection, OpenFlags};
use libsqlite3_sys::{
    sqlite3_session_create, sqlite3_session_changeset, sqlite3_session_enable,
    sqlite3_session_object_config, sqlite3_session_attach, sqlite3_session_delete,
    SQLITE_SESSION_OBJCONFIG_SIZE_LIMIT, SQLITE_SESSION_OBJCONFIG_ROWID_COLUMN,
    SQLITE_CHANGESET_DATA, SQLITE_CHANGESET_NOT_FOUND, SQLITE_CHANGESET_CONFLICT,
    SQLITE_CHANGESET_CONSTRAINT, SQLITE_CHANGESET_FOREIGN_KEY, SQLITE_CHANGESET_OMIT,
    SQLITE_CHANGESET_REPLACE, SQLITE_CHANGESET_ABORT,
    sqlite3_value, sqlite3_changeset_apply,
};
use std::ffi::{CStr, CString};
use std::os::raw::{c_int, c_void, c_char};

pub struct Database {
    pool: Pool<Sqlite>,
    crypto: Arc<CryptoManager>,
    db_path: PathBuf,
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
        // This PRAGMA is for WAL mode, not directly for session. Session is enabled via C API.
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&pool)
            .await?;
        
        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&pool)
            .await?;

        let db = Self { pool, crypto, db_path: db_path.as_ref().to_path_buf() };
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

    pub async fn get_pending_changesets(&self, peer_id: &str) -> Result<Vec<u8>> {
        let db_path_str = self.db_path.to_str().context("Invalid database path")?;
        let db_path_cstring = CString::new(db_path_str)?;

        // Open a separate rusqlite connection for session management
        let conn = Connection::open_with_flags(&self.db_path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;

        unsafe {
            let mut session = std::ptr::null_mut();
            let rc = sqlite3_session_create(conn.handle(), CString::new("main")?.as_ptr(), &mut session);
            if rc != 0 {
                return Err(anyhow::anyhow!("Failed to create SQLite session: {}", rc));
            }

            // Enable session for all tables
            let rc = sqlite3_session_enable(session, CString::new("main")?.as_ptr(), 1);
            if rc != 0 {
                sqlite3_session_delete(session);
                return Err(anyhow::anyhow!("Failed to enable SQLite session: {}", rc));
            }

            // Get last_seq for this peer
            let last_seq: i64 = sqlx::query_scalar(
                "SELECT last_seq FROM sync_state WHERE peer_id = ?"
            )
            .bind(peer_id)
            .fetch_optional(&self.pool)
            .await?
            .unwrap_or(0);

            // Configure session to start from last_seq (this is a simplified approach,
            // a real implementation would use sqlite3_session_set_sync_data or similar
            // to track changes more precisely based on a sync token/timestamp)
            // For now, we'll just generate a full changeset and rely on the apply_changeset
            // to handle conflicts.
            // This part needs more thought for a robust solution.

            let mut changeset_ptr = std::ptr::null_mut();
            let mut changeset_len = 0;
            let rc = sqlite3_session_changeset(session, &mut changeset_ptr, &mut changeset_len);
            if rc != 0 {
                sqlite3_session_delete(session);
                return Err(anyhow::anyhow!("Failed to get changeset: {}", rc));
            }

            let changeset_data = std::slice::from_raw_parts(changeset_ptr, changeset_len as usize).to_vec();

            // Update last_seq (simplified: just increment for now)
            sqlx::query(
                "INSERT OR REPLACE INTO sync_state (peer_id, last_seq, last_pull, last_push) VALUES (?, ?, ?, ?)"
            )
            .bind(peer_id)
            .bind(last_seq + 1) // Simplified: just increment
            .bind(Utc::now())
            .bind(Utc::now())
            .execute(&self.pool)
            .await?;

            sqlite3_session_delete(session);
            Ok(changeset_data)
        }
    }

    pub async fn apply_changeset(&self, changeset: &[u8], peer_id: &str) -> Result<()> {
        let db_path_str = self.db_path.to_str().context("Invalid database path")?;
        let db_path_cstring = CString::new(db_path_str)?;

        // Open a separate rusqlite connection for session management
        let mut conn = Connection::open_with_flags(&self.db_path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;

        // Conflict handler: always apply the incoming change (last-writer-wins)
        let conflict_handler = | _table: *const c_char, _col: *const c_char, _op: c_int, _old_val: *mut sqlite3_value, _new_val: *mut sqlite3_value | -> c_int {
            SQLITE_CHANGESET_REPLACE
        };

        unsafe {
            let rc = libsqlite3_sys::sqlite3changeset_apply(
                conn.handle(),
                changeset.len() as i32,
                changeset.as_ptr() as *const c_void,
                Some(conflict_handler),
                std::ptr::null_mut(), // context for conflict handler
            );

            if rc != 0 {
                return Err(anyhow::anyhow!("Failed to apply changeset: {}", rc));
            }
        }

        // Update sync_state for the peer
        sqlx::query(
            "INSERT OR REPLACE INTO sync_state (peer_id, last_pull, last_push) VALUES (?, ?, ?)"
        )
        .bind(peer_id)
        .bind(Utc::now())
        .bind(Utc::now()) // Assuming push also happened
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn change_path(&self, new_path: String) -> Result<()> {
        // This is a placeholder. A real implementation would need to:
        // 1. Close the current database connection.
        // 2. Move the database file to the new path.
        // 3. Re-open the database connection with the new path.
        // This is not straightforward with the current application architecture.
        // For now, we'll just log the intention.
        println!("Database path change requested to: {}", new_path);
        Ok(())
    }
}