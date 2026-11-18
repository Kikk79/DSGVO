use crate::crypto::CryptoManager;
use crate::{
    AssessmentRecord, CalendarObservation, Category, Class, Observation, Student, StudentWithStats,
};
use anyhow::{Context, Result};
use sha2::Digest;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use crate::sync_schema::derived_uuid;
use crate::sync_time::{format_ts, SyncClock};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Namen der beim Anlegen erzeugten Standard-Kategorien (siehe `seed_default_categories`).
const DEFAULT_CATEGORY_NAMES: [&str; 5] = ["Sozial", "Fachlich", "Verhalten", "Förderung", "Sonstiges"];

pub struct Database {
    pool: Pool<Sqlite>,
    crypto: Arc<CryptoManager>,
    /// Pfad der Datenbankdatei (für Sicherungskopien neben der DB).
    db_path: PathBuf,
    /// Uhr mit Versatz zur Serverzeit; Versatz aus `sync_config.clock_offset_ms`.
    clock: Arc<SyncClock>,
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

        let db = Self {
            pool,
            crypto,
            db_path: db_path.as_ref().to_path_buf(),
            clock: Arc::new(SyncClock::new(0)),
        };
        db.migrate().await?;
        Ok(db)
    }

    /// Verbindungspool für Module, die eigene Transaktionen über mehrere Tabellen brauchen
    /// (Zusammenführen in `merge.rs`).
    pub(crate) fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }

    /// Test-Datenbank mit fester Geräte-ID und eigenem Uhrversatz (zwei "Geräte" in einem
    /// Testprozess). Eine Verbindung, damit Lesen nach Schreiben deterministisch ist.
    #[cfg(test)]
    pub(crate) async fn open_for_test(
        db_path: &Path,
        device_id: &str,
        offset_ms: i64,
    ) -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&format!("sqlite:{}?mode=rwc", db_path.display()))
            .await?;
        sqlx::query("PRAGMA foreign_keys=ON").execute(&pool).await?;
        let db = Self {
            pool,
            crypto: Arc::new(CryptoManager::with_device_id(device_id)),
            db_path: db_path.to_path_buf(),
            clock: Arc::new(SyncClock::new(0)),
        };
        db.migrate().await?;
        db.clock.set_offset_ms(offset_ms);
        Ok(db)
    }

    /// Aktuelle Zeit nach Serverzeit (lokale Uhr plus gemessener Versatz).
    pub fn now(&self) -> chrono::DateTime<chrono::Utc> {
        self.clock.now()
    }

    /// Serverzeit als Text für `created_at`/`updated_at`.
    fn now_ts(&self) -> String {
        format_ts(self.now())
    }

    /// Füllt fehlende UUIDs (Zeilen aus Importen oder älteren Ständen) mit der abgeleiteten
    /// UUID. Idempotent: Zeilen mit UUID bleiben unberührt.
    async fn backfill_missing_uuids(&self) -> Result<()> {
        for table in ["classes", "students", "categories", "observations"] {
            let rows: Vec<(i64, String, Option<String>)> = sqlx::query_as(&format!(
                "SELECT id, source_device_id, CAST(created_at AS TEXT) FROM {} WHERE uuid IS NULL OR uuid = ''",
                table
            ))
            .fetch_all(&self.pool)
            .await?;
            for (id, source_device_id, created_at) in rows {
                let uuid = derived_uuid(
                    table,
                    &source_device_id,
                    id,
                    created_at.as_deref().unwrap_or(""),
                );
                sqlx::query(&format!("UPDATE {} SET uuid = ? WHERE id = ?", table))
                    .bind(uuid)
                    .bind(id)
                    .execute(&self.pool)
                    .await?;
            }
        }
        Ok(())
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

        // Sync v2: UUIDs, Löschvermerke, Sicherungskopie (A10). Vor dem Seeding, damit eine
        // neue, leere DB keine Sicherung bekommt.
        match crate::sync_schema::migrate_to_v2(&self.pool, &self.db_path).await? {
            crate::sync_schema::MigrationOutcome::AlreadyCurrent => {}
            crate::sync_schema::MigrationOutcome::Migrated { backup_path } => {
                println!(
                    "Datenbank auf Sync-Schema v2 umgestellt (Sicherung: {})",
                    backup_path
                        .as_ref()
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|| "keine, DB war leer".to_string())
                );
            }
        }

        // Gespeicherten Versatz zur Serverzeit laden (noch nie gemessen: 0)
        let offset_ms: Option<i64> =
            sqlx::query_scalar("SELECT clock_offset_ms FROM sync_config WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;
        self.clock.set_offset_ms(offset_ms.unwrap_or(0));

        // Zeilen ohne UUID (z.B. durch alte Importe) nachtragen
        self.backfill_missing_uuids().await?;

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
        let now = self.now_ts();

        let class = sqlx::query_as::<_, Class>(
            r#"
            INSERT INTO classes (name, school_year, source_device_id, uuid, modified_by_device, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(&name)
        .bind(&school_year)
        .bind(&device_id)
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&device_id)
        .bind(&now)
        .bind(&now)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create class")?;

        Ok(class)
    }

    pub async fn get_classes(&self) -> Result<Vec<Class>> {
        let classes = sqlx::query_as::<_, Class>("SELECT * FROM classes WHERE deleted_at IS NULL ORDER BY name")
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch classes")?;

        Ok(classes)
    }

    pub async fn delete_class(&self, class_id: i64, force_delete: bool) -> Result<()> {
        if !force_delete {
            // Soft delete: check if class has students
            let student_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM students WHERE class_id = ? AND status != 'deleted' AND deleted_at IS NULL",
            )
            .bind(class_id)
            .fetch_one(&self.pool)
            .await?;

            if student_count > 0 {
                return Err(anyhow::anyhow!(
                    "Cannot delete class with active students. Use force delete or remove students first."
                ));
            }
        }

        self.tombstone_class(class_id).await
    }

    /// Löscht eine Klasse endgültig als Löschvermerk: Name wird geleert, Schüler und deren
    /// Beobachtungen werden in derselben Transaktion ebenfalls zu inhaltslosen Löschvermerken.
    pub async fn tombstone_class(&self, class_id: i64) -> Result<()> {
        let now = self.now_ts();
        let device = self.crypto.get_device_id();
        let mut tx = self.pool.begin().await?;
        Self::tombstone_students_in(&mut tx, "class_id = ?", class_id, &now, &device).await?;
        sqlx::query(
            "UPDATE classes SET name = '', deleted_at = ?, updated_at = ?, modified_by_device = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&now)
        .bind(&now)
        .bind(&device)
        .bind(class_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Vermerkt Schüler (gefiltert über `filter`) samt Beobachtungen als gelöscht.
    async fn tombstone_students_in(
        tx: &mut sqlx::SqliteConnection,
        filter: &str,
        bind_id: i64,
        now: &str,
        device: &str,
    ) -> Result<()> {
        sqlx::query(&format!(
            "UPDATE observations SET text = '', tags = '[]', deleted_at = ?, updated_at = ?, modified_by_device = ? \
             WHERE deleted_at IS NULL AND student_id IN (SELECT id FROM students WHERE {})",
            filter
        ))
        .bind(now)
        .bind(now)
        .bind(device)
        .bind(bind_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(&format!(
            "UPDATE students SET first_name = '', last_name = '', deleted_at = ?, updated_at = ?, modified_by_device = ? \
             WHERE deleted_at IS NULL AND {}",
            filter
        ))
        .bind(now)
        .bind(now)
        .bind(device)
        .bind(bind_id)
        .execute(&mut *tx)
        .await?;
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
        let now = self.now_ts();

        let student = sqlx::query_as::<_, Student>(
            r#"
            INSERT INTO students (class_id, first_name, last_name, status, source_device_id, uuid, modified_by_device, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(class_id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&status)
        .bind(&device_id)
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&device_id)
        .bind(&now)
        .bind(&now)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create student")?;

        Ok(student)
    }

    pub async fn get_students(&self) -> Result<Vec<Student>> {
        let students = sqlx::query_as::<_, Student>(
            "SELECT * FROM students WHERE status != 'deleted' AND deleted_at IS NULL ORDER BY last_name, first_name",
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch students")?;

        Ok(students)
    }

    pub async fn get_all_students_including_deleted(&self) -> Result<Vec<Student>> {
        let students =
            sqlx::query_as::<_, Student>("SELECT * FROM students WHERE deleted_at IS NULL ORDER BY last_name, first_name")
                .fetch_all(&self.pool)
                .await
                .context("Failed to fetch all students")?;

        Ok(students)
    }

    pub async fn get_students_with_stats(&self) -> Result<Vec<StudentWithStats>> {
        #[derive(sqlx::FromRow)]
        struct StudentWithStatsRaw {
            id: i64,
            first_name: String,
            last_name: String,
            class_name: String,
            class_id: i64,
            status: String,
            observation_count: i64,
            last_observation_date: Option<String>,
        }

        let raw_students: Vec<StudentWithStatsRaw> = sqlx::query_as(
            r#"
            SELECT 
                s.id,
                s.first_name,
                s.last_name,
                c.name as class_name,
                s.class_id,
                s.status,
                COALESCE(obs_stats.observation_count, 0) as observation_count,
                obs_stats.last_observation_date
            FROM students s
            LEFT JOIN classes c ON s.class_id = c.id
            LEFT JOIN (
                SELECT 
                    student_id,
                    COUNT(*) as observation_count,
                    MAX(created_at) as last_observation_date
                FROM observations
                WHERE deleted_at IS NULL
                GROUP BY student_id
            ) obs_stats ON s.id = obs_stats.student_id
            WHERE s.status != 'deleted' AND s.deleted_at IS NULL AND c.deleted_at IS NULL
            ORDER BY s.last_name, s.first_name
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch students with stats")?;

        // Convert String dates to DateTime
        let students_with_stats = raw_students
            .into_iter()
            .map(|raw| StudentWithStats {
                id: raw.id,
                first_name: raw.first_name,
                last_name: raw.last_name,
                class_name: raw.class_name,
                class_id: raw.class_id,
                status: raw.status,
                observation_count: raw.observation_count,
                last_observation_date: raw
                    .last_observation_date
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&chrono::Utc)),
            })
            .collect();

        Ok(students_with_stats)
    }

    pub async fn get_assessments_comprehensive(
        &self,
        limit: i64,
        offset: i64,
        sort_field: String,
        sort_direction: String,
        date_from: Option<String>,
        date_to: Option<String>,
        category_filter: Option<String>,
        class_filter: Option<String>,
        student_filter: Option<String>,
    ) -> Result<Vec<AssessmentRecord>> {
        let mut sql = r#"
            SELECT 
                o.id as observation_id,
                o.created_at as observation_created_at,
                o.updated_at as observation_updated_at,
                o.student_id,
                s.first_name as student_first_name,
                s.last_name as student_last_name,
                s.class_id,
                c.name as class_name,
                o.category,
                COALESCE(cat.color, '#6B7280') as category_color,
                COALESCE(cat.background_color, '#F3F4F6') as category_background_color,
                COALESCE(cat.text_color, '#374151') as category_text_color,
                o.text,
                o.tags,
                o.author_id,
                o.source_device_id
            FROM observations o
            LEFT JOIN students s ON o.student_id = s.id
            LEFT JOIN classes c ON s.class_id = c.id
            LEFT JOIN categories cat ON o.category = cat.name AND cat.deleted_at IS NULL
            WHERE s.status != 'deleted'
              AND o.deleted_at IS NULL AND s.deleted_at IS NULL AND c.deleted_at IS NULL
        "#
        .to_string();

        let mut bind_values: Vec<String> = Vec::new();

        // Add date filters
        if let Some(date_from) = date_from {
            sql.push_str(" AND o.created_at >= ?");
            bind_values.push(date_from);
        }
        if let Some(date_to) = date_to {
            sql.push_str(" AND o.created_at <= ?");
            bind_values.push(date_to);
        }

        // Add category filter
        if let Some(category_filter) = category_filter.as_ref() {
            if !category_filter.is_empty() {
                sql.push_str(" AND o.category = ?");
                bind_values.push(category_filter.clone());
            }
        }

        // Add class filter
        if let Some(class_filter) = class_filter.as_ref() {
            if !class_filter.is_empty() {
                sql.push_str(" AND c.name = ?");
                bind_values.push(class_filter.clone());
            }
        }

        // Add student filter (searches in first_name and last_name)
        if let Some(student_filter) = student_filter.as_ref() {
            if !student_filter.is_empty() {
                sql.push_str(" AND (s.first_name LIKE ? OR s.last_name LIKE ?)");
                let search_term = format!("%{}%", student_filter);
                bind_values.push(search_term.clone());
                bind_values.push(search_term);
            }
        }

        // Add sorting
        let sort_field_sql = match sort_field.as_str() {
            "student_name" => "s.last_name, s.first_name",
            "student_first_name" => "s.first_name",
            "student_last_name" => "s.last_name",
            "class_name" => "c.name",
            "category" => "o.category",
            "observation_created_at" => "datetime(o.created_at)",
            "observation_updated_at" => "datetime(o.updated_at)",
            _ => "datetime(o.created_at)", // Default fallback
        };

        let sort_dir = if sort_direction.to_lowercase() == "asc" {
            "ASC"
        } else {
            "DESC"
        };

        sql.push_str(&format!(" ORDER BY {} {}", sort_field_sql, sort_dir));

        // Add pagination
        sql.push_str(" LIMIT ? OFFSET ?");
        bind_values.push(limit.to_string());
        bind_values.push(offset.to_string());

        // Build and execute query
        let mut query = sqlx::query_as::<_, AssessmentRecord>(&sql);
        for value in bind_values {
            query = query.bind(value);
        }

        let assessments = query
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch comprehensive assessments")?;

        Ok(assessments)
    }

    pub async fn delete_student(&self, student_id: i64, force_delete: bool) -> Result<()> {
        if force_delete {
            self.tombstone_student(student_id).await?;
        } else {
            // Soft delete: mark as deleted
            sqlx::query("UPDATE students SET status = 'deleted', updated_at = ?, modified_by_device = ? WHERE id = ?")
                .bind(self.now_ts())
                .bind(self.crypto.get_device_id())
                .bind(student_id)
                .execute(&self.pool)
                .await?;
        }

        Ok(())
    }

    /// Löscht einen Schüler endgültig als Löschvermerk (Namen leer, Status bleibt) und
    /// kaskadiert in derselben Transaktion auf seine Beobachtungen.
    pub async fn tombstone_student(&self, student_id: i64) -> Result<()> {
        let now = self.now_ts();
        let device = self.crypto.get_device_id();
        let mut tx = self.pool.begin().await?;
        Self::tombstone_students_in(&mut tx, "id = ?", student_id, &now, &device).await?;
        tx.commit().await?;
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
        Self::validate_observation_content(&category, &text)?;
        let device_id = self.crypto.get_device_id();
        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
        let now = self.now_ts();

        let observation = sqlx::query_as::<_, Observation>(
            r#"
            INSERT INTO observations (student_id, author_id, category, text, tags, source_device_id, uuid, modified_by_device, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(student_id)
        .bind(author_id)
        .bind(&category)
        .bind(&text)
        .bind(&tags_json)
        .bind(&device_id)
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&device_id)
        .bind(&now)
        .bind(&now)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create observation")?;

        Ok(observation)
    }

    pub async fn get_observation(&self, observation_id: i64) -> Result<Option<Observation>> {
        let observation =
            sqlx::query_as::<_, Observation>("SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL")
                .bind(observation_id)
                .fetch_optional(&self.pool)
                .await
                .context("Failed to fetch observation")?;

        Ok(observation)
    }

    pub fn validate_observation_content(category: &str, text: &str) -> Result<()> {
        if category.trim().is_empty() {
            return Err(anyhow::anyhow!("Observation category must not be empty"));
        }
        if text.trim().is_empty() {
            return Err(anyhow::anyhow!("Observation text must not be empty"));
        }
        Ok(())
    }

    pub async fn update_observation(
        &self,
        observation_id: i64,
        category: String,
        text: String,
        tags: Vec<String>,
    ) -> Result<Observation> {
        Self::validate_observation_content(&category, &text)?;

        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

        // student_id, author_id, created_at and source_device_id stay untouched: together
        // with the id they identify the observation on other devices (see
        // merge_existing_observation). updated_at is bound as a UTC timestamp, like the
        // import code does, because it decides which copy wins during sync.
        let result = sqlx::query(
            "UPDATE observations SET category = ?, text = ?, tags = ?, updated_at = ?, modified_by_device = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&category)
        .bind(&text)
        .bind(&tags_json)
        .bind(self.now_ts())
        .bind(self.crypto.get_device_id())
        .bind(observation_id)
        .execute(&self.pool)
        .await
        .context("Failed to update observation")?;

        if result.rows_affected() == 0 {
            return Err(anyhow::anyhow!(
                "Observation with id {} not found",
                observation_id
            ));
        }

        self.get_observation(observation_id)
            .await?
            .context("Failed to fetch updated observation")
    }

    pub async fn search_observations(
        &self,
        query: Option<String>,
        student_id: Option<i64>,
        category: Option<String>,
    ) -> Result<Vec<Observation>> {
        let mut sql = "SELECT * FROM observations WHERE deleted_at IS NULL".to_string();
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

        sql.push_str(" ORDER BY strftime('%Y-%m-%d %H:%M:%f', created_at) DESC");

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

    pub async fn get_observations_since(
        &self,
        since: chrono::DateTime<chrono::Utc>,
    ) -> Result<Vec<Observation>> {
        let observations = sqlx::query_as::<_, Observation>(
            "SELECT * FROM observations WHERE deleted_at IS NULL AND (strftime('%Y-%m-%d %H:%M:%f', created_at) >= strftime('%Y-%m-%d %H:%M:%f', ?) OR strftime('%Y-%m-%d %H:%M:%f', updated_at) >= strftime('%Y-%m-%d %H:%M:%f', ?)) ORDER BY strftime('%Y-%m-%d %H:%M:%f', created_at) DESC",
        )
        .bind(format_ts(since))
        .bind(format_ts(since))
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch observations since timestamp")?;

        Ok(observations)
    }

    pub async fn get_calendar_observations(
        &self,
        start_date: chrono::DateTime<chrono::Utc>,
        end_date: chrono::DateTime<chrono::Utc>,
        class_id: Option<i64>,
        category: Option<String>,
    ) -> Result<Vec<CalendarObservation>> {
        let mut query = r#"
            SELECT 
                o.id,
                o.created_at,
                o.student_id,
                s.first_name as student_first_name,
                s.last_name as student_last_name,
                s.class_id,
                c.name as class_name,
                o.category,
                COALESCE(cat.color, '#3B82F6') as category_color,
                COALESCE(cat.background_color, '#EBF8FF') as category_background_color,
                COALESCE(cat.text_color, '#1E3A8A') as category_text_color,
                o.text,
                o.tags
            FROM observations o
            LEFT JOIN students s ON o.student_id = s.id
            LEFT JOIN classes c ON s.class_id = c.id
            LEFT JOIN categories cat ON o.category = cat.name AND cat.deleted_at IS NULL
            WHERE strftime('%Y-%m-%d %H:%M:%f', o.created_at) BETWEEN strftime('%Y-%m-%d %H:%M:%f', ?) AND strftime('%Y-%m-%d %H:%M:%f', ?)
              AND s.status = 'active'
              AND o.deleted_at IS NULL AND s.deleted_at IS NULL AND c.deleted_at IS NULL
        "#
        .to_string();

        // Build query dynamically based on filters
        if class_id.is_some() {
            query.push_str(" AND s.class_id = ?");
        }

        if category.is_some() {
            query.push_str(" AND o.category = ?");
        }

        query.push_str(" ORDER BY strftime('%Y-%m-%d %H:%M:%f', o.created_at) DESC");

        // Build the query with parameters
        let mut query_builder = sqlx::query_as::<_, CalendarObservation>(&query)
            .bind(format_ts(start_date))
            .bind(format_ts(end_date));

        if let Some(class_id) = class_id {
            query_builder = query_builder.bind(class_id);
        }

        if let Some(category) = category {
            query_builder = query_builder.bind(category);
        }

        let observations = query_builder
            .fetch_all(&self.pool)
            .await
            .context("Failed to fetch calendar observations")?;

        Ok(observations)
    }

    pub async fn delete_observation(
        &self,
        observation_id: i64,
        author_id: i64,
        force_delete: bool,
    ) -> Result<()> {
        if !force_delete {
            // Check if user is the author
            let author_check = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM observations WHERE id = ? AND author_id = ? AND deleted_at IS NULL",
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
        }

        self.tombstone_observation(observation_id).await
    }

    /// Löscht eine Beobachtung endgültig als inhaltslosen Löschvermerk.
    pub async fn tombstone_observation(&self, id: i64) -> Result<()> {
        let now = self.now_ts();
        sqlx::query(
            "UPDATE observations SET text = '', tags = '[]', deleted_at = ?, updated_at = ?, modified_by_device = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&now)
        .bind(&now)
        .bind(self.crypto.get_device_id())
        .bind(id)
        .execute(&self.pool)
        .await?;
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

    async fn seed_default_categories(&self) -> Result<()> {
        // Check if categories already exist
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(&self.pool)
            .await?;

        if count > 0 {
            return Ok(()); // Categories already exist
        }

        let device_id = self.crypto.get_device_id();
        let now = self.now_ts();

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
                INSERT INTO categories (name, color, background_color, text_color, is_active, sort_order, source_device_id, uuid, modified_by_device, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(name)
            .bind(color)
            .bind(bg_color)
            .bind(text_color)
            .bind(true)
            .bind(sort_order)
            .bind(&device_id)
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&device_id)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }

        println!("Created {} default categories", category_count);
        Ok(())
    }

    // Category CRUD operations
    pub async fn get_categories(&self) -> Result<Vec<crate::Category>> {
        let categories = sqlx::query_as::<_, crate::Category>(
            "SELECT * FROM categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order ASC",
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to fetch categories")?;
        Ok(categories)
    }

    pub async fn create_category(
        &self,
        name: String,
        color: String,
        background_color: String,
        text_color: String,
    ) -> Result<crate::Category> {
        let device_id = self.crypto.get_device_id();
        let now = self.now_ts();

        // Get next sort order
        let max_order: i32 =
            sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) FROM categories")
                .fetch_one(&self.pool)
                .await
                .unwrap_or(0);

        let category = sqlx::query_as::<_, crate::Category>(
            r#"
            INSERT INTO categories (name, color, background_color, text_color, is_active, sort_order, source_device_id, uuid, modified_by_device, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&device_id)
        .bind(&now)
        .bind(&now)
        .fetch_one(&self.pool)
        .await
        .context("Failed to create category")?;
        Ok(category)
    }

    pub async fn update_category(
        &self,
        id: i64,
        name: String,
        color: String,
        background_color: String,
        text_color: String,
    ) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE categories 
            SET name = ?, color = ?, background_color = ?, text_color = ?, updated_at = ?, modified_by_device = ?
            WHERE id = ?
            "#
        )
        .bind(&name)
        .bind(&color)
        .bind(&background_color)
        .bind(&text_color)
        .bind(self.now_ts())
        .bind(self.crypto.get_device_id())
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_category(&self, id: i64, force_delete: bool) -> Result<()> {
        if !force_delete {
            // Check if category is used in observations
            let usage_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM observations WHERE deleted_at IS NULL AND category = (SELECT name FROM categories WHERE id = ?)")
                .bind(id)
                .fetch_one(&self.pool)
                .await?;

            if usage_count > 0 {
                // Soft delete: mark as inactive
                sqlx::query("UPDATE categories SET is_active = 0, updated_at = ?, modified_by_device = ? WHERE id = ?")
                    .bind(self.now_ts())
                    .bind(self.crypto.get_device_id())
                    .bind(id)
                    .execute(&self.pool)
                    .await?;
                return Ok(());
            }
        }

        self.tombstone_category(id).await
    }

    /// Löscht eine Kategorie endgültig als Löschvermerk. Name und Farben bleiben (kein
    /// Personenbezug); der partielle Unique-Index gibt den Namen wieder frei.
    pub async fn tombstone_category(&self, id: i64) -> Result<()> {
        let now = self.now_ts();
        sqlx::query(
            "UPDATE categories SET deleted_at = ?, updated_at = ?, modified_by_device = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&now)
        .bind(&now)
        .bind(self.crypto.get_device_id())
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // Bewusst hartes Löschen: nur lokaler Reset/Testhelfer (keine Tauri-Befehle rufen ihn auf), nichts muss synchronisiert werden.
    pub async fn clear_all_data(&self) -> Result<()> {
        sqlx::query("DELETE FROM observations")
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM students")
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM classes")
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM categories")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn import_categories_with_merge(
        &self,
        categories_data: &[serde_json::Value],
    ) -> Result<i32> {
        let mut imported_count = 0;
        let device_id = self.crypto.get_device_id();

        for category_value in categories_data {
            if let Ok(category) = serde_json::from_value::<Category>(category_value.clone()) {
                // Check if category with same name exists
                let existing_id: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL")
                        .bind(&category.name)
                        .fetch_optional(&self.pool)
                        .await?;

                if let Some(existing_id) = existing_id {
                    // Update existing category with import data (merge colors/settings)
                    sqlx::query(
                        "UPDATE categories SET 
                         color = ?, background_color = ?, text_color = ?, 
                         is_active = ?, sort_order = ?, updated_at = ?,
                         source_device_id = ?, modified_by_device = ?
                         WHERE id = ?",
                    )
                    .bind(&category.color)
                    .bind(&category.background_color)
                    .bind(&category.text_color)
                    .bind(category.is_active)
                    .bind(category.sort_order)
                    .bind(self.now_ts())
                    .bind(&device_id)
                    .bind(&device_id)
                    .bind(existing_id)
                    .execute(&self.pool)
                    .await?;
                } else {
                    // Create new category
                    sqlx::query(
                        "INSERT INTO categories (name, color, background_color, text_color, is_active, sort_order, source_device_id, uuid, modified_by_device, created_at, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    )
                    .bind(&category.name)
                    .bind(&category.color)
                    .bind(&category.background_color)
                    .bind(&category.text_color)
                    .bind(category.is_active)
                    .bind(category.sort_order)
                    .bind(&device_id)
                    .bind(if category.uuid.is_empty() {
                        uuid::Uuid::new_v4().to_string()
                    } else {
                        category.uuid.clone()
                    })
                    .bind(&device_id)
                    .bind(self.now_ts())
                    .bind(self.now_ts())
                    .execute(&self.pool)
                    .await?;

                    imported_count += 1;
                }
            }
        }

        // Deactivate categories that exist locally but not in import (soft delete)
        let import_category_names: Vec<String> = categories_data
            .iter()
            .filter_map(|v| {
                v.get("name")
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string())
            })
            .collect();

        if !import_category_names.is_empty() {
            let placeholders = import_category_names
                .iter()
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(", ");
            let query = format!("UPDATE categories SET is_active = 0, updated_at = ?, modified_by_device = ? WHERE deleted_at IS NULL AND is_active = 1 AND name NOT IN ({})", placeholders);

            let mut query_builder = sqlx::query(&query)
                .bind(self.now_ts())
                .bind(&device_id);
            for name in import_category_names {
                query_builder = query_builder.bind(name);
            }
            query_builder.execute(&self.pool).await?;
        }

        Ok(imported_count)
    }

    async fn import_device_config(&self, config: &serde_json::Value) -> Result<()> {
        // Import device configuration (but keep current device_id)
        let device_type = config
            .get("device_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let device_name = config
            .get("device_name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Update device config in crypto manager, but preserve current device_id
        // Note: We deliberately don't update device_id to keep each device unique
        self.crypto.set_device_config(device_type, device_name)?;

        Ok(())
    }

    // ============================================
    // WebDAV Sync Support Methods
    // ============================================

    /// Store WebDAV credentials (encrypted)
    pub async fn store_webdav_credentials(
        &self,
        url: String,
        username: String,
        password: String,
    ) -> Result<()> {
        // Encrypt password using device-specific key
        let encrypted_password = self.encrypt_credential(&password)?;

        // Create sync_config table if not exists
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sync_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                webdav_url TEXT NOT NULL,
                webdav_username TEXT NOT NULL,
                webdav_password_encrypted BLOB NOT NULL,
                auto_sync_enabled BOOLEAN DEFAULT 1,
                sync_interval_seconds INTEGER DEFAULT 180,
                last_sync_timestamp DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Upsert credentials (singleton table)
        sqlx::query(
            r#"
            INSERT INTO sync_config (id, webdav_url, webdav_username, webdav_password_encrypted)
            VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                webdav_url = excluded.webdav_url,
                webdav_username = excluded.webdav_username,
                webdav_password_encrypted = excluded.webdav_password_encrypted,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&url)
        .bind(&username)
        .bind(&encrypted_password)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get WebDAV credentials (decrypted)
    pub async fn get_webdav_credentials(&self) -> Result<Option<(String, String, String)>> {
        #[derive(sqlx::FromRow)]
        struct SyncConfig {
            webdav_url: String,
            webdav_username: String,
            webdav_password_encrypted: Vec<u8>,
        }

        let config: Option<SyncConfig> = sqlx::query_as(
            // `webdav_url = ''`: Platzhalterzeile aus der Umstellung auf Sync v2, keine Zugangsdaten
            "SELECT webdav_url, webdav_username, webdav_password_encrypted FROM sync_config WHERE id = 1 AND webdav_url <> ''",
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(config) = config {
            let decrypted_password = self.decrypt_credential(&config.webdav_password_encrypted)?;
            Ok(Some((
                config.webdav_url,
                config.webdav_username,
                decrypted_password,
            )))
        } else {
            Ok(None)
        }
    }

    /// Update last sync timestamp
    pub async fn update_last_sync_timestamp(&self) -> Result<()> {
        sqlx::query("UPDATE sync_config SET last_sync_timestamp = ? WHERE id = 1")
            .bind(self.now_ts())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ---------------------------------------------------------------------------------------
    // Sync v2: Geräterolle, erster Abgleich, Versatz, Hochlade-Prüfsumme, ETags (`sync_config`)

    /// `"laptop"`, `"desktop"` oder `None` (noch nicht gewählt).
    pub async fn get_device_role(&self) -> Result<Option<String>> {
        let role: Option<Option<String>> =
            sqlx::query_scalar("SELECT device_role FROM sync_config WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;
        Ok(role.flatten())
    }

    /// Nur `"laptop"` oder `"desktop"`; setzt den erledigten ersten Abgleich nicht zurück.
    pub async fn set_device_role(&self, role: &str) -> Result<()> {
        if role != "laptop" && role != "desktop" {
            anyhow::bail!("Ungültige Geräterolle '{}' (erlaubt: laptop, desktop)", role);
        }
        sqlx::query("UPDATE sync_config SET device_role = ? WHERE id = 1")
            .bind(role)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn is_first_sync_done(&self) -> Result<bool> {
        let done: Option<i64> =
            sqlx::query_scalar("SELECT first_sync_done FROM sync_config WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;
        Ok(done.unwrap_or(0) != 0)
    }

    pub async fn set_first_sync_done(&self) -> Result<()> {
        sqlx::query("UPDATE sync_config SET first_sync_done = 1 WHERE id = 1")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Aktueller Versatz der Uhr zur Serverzeit (ms).
    pub fn clock_offset_ms(&self) -> i64 {
        self.clock.offset_ms()
    }

    /// Übernimmt einen gemessenen Versatz in die Uhr und speichert ihn dauerhaft.
    pub async fn set_clock_offset_ms(&self, offset_ms: i64) -> Result<()> {
        self.clock.set_offset_ms(offset_ms);
        sqlx::query("UPDATE sync_config SET clock_offset_ms = ? WHERE id = 1")
            .bind(offset_ms)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_last_upload_hash(&self) -> Result<Option<String>> {
        let hash: Option<Option<String>> =
            sqlx::query_scalar("SELECT last_upload_hash FROM sync_config WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;
        Ok(hash.flatten())
    }

    pub async fn set_last_upload_hash(&self, hash: &str) -> Result<()> {
        sqlx::query("UPDATE sync_config SET last_upload_hash = ? WHERE id = 1")
            .bind(hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// ETags fremder Server-Dateien beim letzten erfolgreichen Einlesen (Dateiname → ETag).
    pub async fn get_remote_etags(&self) -> Result<std::collections::HashMap<String, String>> {
        let json: Option<String> =
            sqlx::query_scalar("SELECT remote_etags FROM sync_config WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;
        // Unlesbarer Inhalt → leer, d.h. beim nächsten Abgleich alles neu laden.
        Ok(json
            .and_then(|j| serde_json::from_str(&j).ok())
            .unwrap_or_default())
    }

    pub async fn set_remote_etags(
        &self,
        etags: &std::collections::HashMap<String, String>,
    ) -> Result<()> {
        sqlx::query("UPDATE sync_config SET remote_etags = ? WHERE id = 1")
            .bind(serde_json::to_string(etags)?)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Gibt es lokale fachliche Daten (inkl. Löschvermerken)? Die beim Anlegen der Datenbank
    /// erzeugten Standard-Kategorien zählen nicht.
    pub async fn has_business_data(&self) -> Result<bool> {
        let placeholders = DEFAULT_CATEGORY_NAMES
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT (SELECT COUNT(*) FROM classes) + (SELECT COUNT(*) FROM students)
                  + (SELECT COUNT(*) FROM observations)
                  + (SELECT COUNT(*) FROM categories WHERE name NOT IN ({}))",
            placeholders
        );
        let mut q = sqlx::query_scalar::<_, i64>(&sql);
        for name in DEFAULT_CATEGORY_NAMES {
            q = q.bind(name);
        }
        Ok(q.fetch_one(&self.pool).await? > 0)
    }

    /// Sicherungskopie `<db>.vor-erstabgleich-<zeit>.bak` vor dem Ersetzen beim ersten Abgleich.
    pub async fn backup_before_first_sync(&self) -> Result<PathBuf> {
        crate::sync_schema::write_labeled_backup(&self.pool, &self.db_path, "vor-erstabgleich")
            .await
    }

    /// Zeilen, die `all_rows_for_snapshot` mangels Elternteil auslässt:
    /// (Schüler ohne Klasse, Beobachtungen ohne exportierten Schüler – also auch Beobachtungen
    /// von Schülern ohne Klasse).
    pub async fn snapshot_orphan_counts(&self) -> Result<(i64, i64)> {
        let students: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM students WHERE class_id NOT IN (SELECT id FROM classes)",
        )
        .fetch_one(&self.pool)
        .await?;
        let observations: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM observations WHERE student_id NOT IN \
             (SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id)",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok((students, observations))
    }

    /// Get last sync timestamp
    pub async fn get_last_sync_timestamp(&self) -> Result<Option<String>> {
        #[derive(sqlx::FromRow)]
        struct LastSync {
            last_sync_timestamp: Option<String>,
        }

        let result: Option<LastSync> =
            sqlx::query_as("SELECT last_sync_timestamp FROM sync_config WHERE id = 1")
                .fetch_optional(&self.pool)
                .await?;
        
        Ok(result.and_then(|r| r.last_sync_timestamp))
    }

    /// Check if there are changes since last sync
    pub async fn has_changes_since(&self, since: chrono::DateTime<chrono::Utc>) -> Result<bool> {
        // Check if any records were updated after 'since' timestamp
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM (
                SELECT 1 FROM (SELECT 1 FROM students WHERE strftime('%Y-%m-%d %H:%M:%f', updated_at) > strftime('%Y-%m-%d %H:%M:%f', ?) LIMIT 1)
                UNION ALL
                SELECT 1 FROM (SELECT 1 FROM classes WHERE strftime('%Y-%m-%d %H:%M:%f', updated_at) > strftime('%Y-%m-%d %H:%M:%f', ?) LIMIT 1)
                UNION ALL
                SELECT 1 FROM (SELECT 1 FROM observations WHERE strftime('%Y-%m-%d %H:%M:%f', updated_at) > strftime('%Y-%m-%d %H:%M:%f', ?) LIMIT 1)
                UNION ALL
                SELECT 1 FROM (SELECT 1 FROM categories WHERE strftime('%Y-%m-%d %H:%M:%f', updated_at) > strftime('%Y-%m-%d %H:%M:%f', ?) LIMIT 1)
            )
            "#,
        )
        .bind(format_ts(since))
        .bind(format_ts(since))
        .bind(format_ts(since))
        .bind(format_ts(since))
        .fetch_one(&self.pool)
        .await?;

        Ok(count > 0)
    }

    /// Get device ID
    pub fn get_device_id(&self) -> String {
        self.crypto.get_device_id()
    }

    /// Encrypt credential using device-specific key
    fn encrypt_credential(&self, plain: &str) -> Result<Vec<u8>> {
        use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
        use ring::rand::{SecureRandom, SystemRandom};

        let device_id = self.crypto.get_device_id();
        let key_material = sha2::Sha256::digest(device_id.as_bytes());

        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_material)
            .map_err(|_| anyhow::anyhow!("Failed to create key"))?;
        let key = LessSafeKey::new(unbound_key);

        // Generate random nonce
        let rng = SystemRandom::new();
        let mut nonce_bytes = vec![0u8; 12];
        rng.fill(&mut nonce_bytes)
            .map_err(|_| anyhow::anyhow!("Failed to generate nonce"))?;

        let nonce = Nonce::try_assume_unique_for_key(&nonce_bytes)
            .map_err(|_| anyhow::anyhow!("Invalid nonce"))?;

        // Encrypt
        let mut in_out = plain.as_bytes().to_vec();
        key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| anyhow::anyhow!("Encryption failed"))?;

        // Prepend nonce to ciphertext
        let mut result = nonce_bytes;
        result.extend_from_slice(&in_out);

        Ok(result)
    }

    /// Decrypt credential using device-specific key
    fn decrypt_credential(&self, encrypted: &[u8]) -> Result<String> {
        use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};

        if encrypted.len() < 12 {
            return Err(anyhow::anyhow!("Invalid encrypted data"));
        }

        let device_id = self.crypto.get_device_id();
        let key_material = sha2::Sha256::digest(device_id.as_bytes());

        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_material)
            .map_err(|_| anyhow::anyhow!("Failed to create key"))?;
        let key = LessSafeKey::new(unbound_key);

        // Extract nonce and ciphertext
        let (nonce_bytes, ciphertext) = encrypted.split_at(12);
        let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| anyhow::anyhow!("Invalid nonce"))?;

        // Decrypt
        let mut in_out = ciphertext.to_vec();
        let decrypted = key
            .open_in_place(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| anyhow::anyhow!("Decryption failed"))?;

        String::from_utf8(decrypted.to_vec()).context("Failed to convert decrypted data to string")
    }

    /// Log sync operation to audit trail
    pub async fn log_sync_operation(
        &self,
        sync_type: &str,
        sync_direction: &str,
        changeset_filename: Option<&str>,
        records_synced: i32,
        bytes_transferred: i64,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<()> {
        // Create sync_log table if not exists
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sync_type TEXT NOT NULL,
                sync_direction TEXT NOT NULL,
                changeset_filename TEXT,
                records_synced INTEGER DEFAULT 0,
                bytes_transferred INTEGER DEFAULT 0,
                status TEXT NOT NULL,
                error_message TEXT,
                source_device_id TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        let device_id = self.crypto.get_device_id();

        sqlx::query(
            r#"
            INSERT INTO sync_log (
                sync_type, sync_direction, changeset_filename,
                records_synced, bytes_transferred, status, error_message, source_device_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(sync_type)
        .bind(sync_direction)
        .bind(changeset_filename)
        .bind(records_synced)
        .bind(bytes_transferred)
        .bind(status)
        .bind(error_message)
        .bind(&device_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Alle Zeilen für die Gesamtstand-Datei (Snapshot), einschließlich Löschvermerken
    /// (`deleted_at` wird bewusst nicht gefiltert). Verweise werden als UUID aufgelöst.
    pub async fn all_rows_for_snapshot(&self) -> Result<crate::snapshot::SnapshotRows> {
        use crate::snapshot::{CategoryRec, ClassRec, ObservationRec, SnapshotRows, StudentRec};
        use std::collections::HashMap;

        let classes = sqlx::query_as::<_, Class>("SELECT * FROM classes")
            .fetch_all(&self.pool)
            .await?;
        let students = sqlx::query_as::<_, Student>("SELECT * FROM students")
            .fetch_all(&self.pool)
            .await?;
        let categories = sqlx::query_as::<_, Category>("SELECT * FROM categories")
            .fetch_all(&self.pool)
            .await?;
        let observations = sqlx::query_as::<_, Observation>("SELECT * FROM observations")
            .fetch_all(&self.pool)
            .await?;

        let class_uuids: HashMap<i64, String> =
            classes.iter().map(|c| (c.id, c.uuid.clone())).collect();
        // Nur Schüler, die auch in der Datei stehen (mit vorhandener Klasse). Beobachtungen
        // anderer Schüler würden beim Empfänger ins Leere zeigen und den ganzen Abgleich
        // scheitern lassen; sie werden ausgelassen und in `snapshot_orphan_counts` gezählt.
        let student_uuids: HashMap<i64, String> = students
            .iter()
            .filter(|s| class_uuids.contains_key(&s.class_id))
            .map(|s| (s.id, s.uuid.clone()))
            .collect();

        Ok(SnapshotRows {
            categories: categories
                .into_iter()
                .map(|c| CategoryRec {
                    uuid: c.uuid,
                    name: c.name,
                    color: c.color,
                    background_color: c.background_color,
                    text_color: c.text_color,
                    is_active: c.is_active,
                    sort_order: c.sort_order,
                    created_at: format_ts(c.created_at),
                    updated_at: format_ts(c.updated_at),
                    deleted_at: c.deleted_at,
                    modified_by_device: c.modified_by_device,
                    source_device_id: c.source_device_id,
                })
                .collect(),
            classes: classes
                .into_iter()
                .map(|c| ClassRec {
                    uuid: c.uuid,
                    name: c.name,
                    school_year: c.school_year,
                    created_at: format_ts(c.created_at),
                    updated_at: format_ts(c.updated_at),
                    deleted_at: c.deleted_at,
                    modified_by_device: c.modified_by_device,
                    source_device_id: c.source_device_id,
                })
                .collect(),
            students: students
                .into_iter()
                .filter_map(|s| {
                    let class_uuid = class_uuids.get(&s.class_id)?.clone();
                    Some(StudentRec {
                        uuid: s.uuid,
                        class_uuid,
                        first_name: s.first_name,
                        last_name: s.last_name,
                        status: s.status,
                        created_at: format_ts(s.created_at),
                        updated_at: format_ts(s.updated_at),
                        deleted_at: s.deleted_at,
                        modified_by_device: s.modified_by_device,
                        source_device_id: s.source_device_id,
                    })
                })
                .collect(),
            observations: observations
                .into_iter()
                .filter_map(|o| {
                    let student_uuid = student_uuids.get(&o.student_id)?.clone();
                    Some(ObservationRec {
                        uuid: o.uuid,
                        student_uuid,
                        category: o.category,
                        text: o.text,
                        tags: o.tags,
                        created_at: format_ts(o.created_at),
                        updated_at: format_ts(o.updated_at),
                        deleted_at: o.deleted_at,
                        modified_by_device: o.modified_by_device,
                        source_device_id: o.source_device_id,
                    })
                })
                .collect(),
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Datei einlesen wie die Import-Befehle (neues oder altes Format), Ergebnistext.
    async fn import_file(db: &Database, bytes: &[u8]) -> Result<String> {
        crate::legacy_import::import_bytes(db, bytes)
            .await
            .map(|o| o.summary())
    }

    /// Alte Änderungsdatei (`changeset_file_v1`): Beobachtungen der letzten `days_back` Tage.
    async fn legacy_changeset(db: &Database, days_back: u32) -> Result<Vec<u8>> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(days_back as i64);
        let data = serde_json::json!({
            "format": "changeset_file_v1",
            "version": "1.0",
            "timestamp": chrono::Utc::now(),
            "device_id": db.get_device_id(),
            "days_back": days_back,
            "changes": { "observations": db.get_observations_since(cutoff).await? }
        });
        let mut hasher = sha2::Sha256::new();
        hasher.update(data.to_string().as_bytes());
        let checksum = format!("{:x}", hasher.finalize());
        Ok(serde_json::json!({ "checksum": checksum, "data": data })
            .to_string()
            .into_bytes())
    }

    async fn create_test_db() -> (Database, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let crypto = Arc::new(CryptoManager::new().unwrap());
        let db = Database::new(&db_path, crypto).await.unwrap();
        (db, temp_dir)
    }

    /// Schüler ohne Klasse fehlen in der Datei; ihre Beobachtungen dürfen dann nicht auf sie
    /// verweisen, sonst scheitert der Abgleich beim Empfänger komplett.
    #[tokio::test]
    async fn test_snapshot_skips_observations_of_classless_students() {
        let (db, _dir) = create_test_db().await;
        let keep = db.create_class("5a".into(), "2025/26".into()).await.unwrap();
        let gone = db.create_class("6b".into(), "2025/26".into()).await.unwrap();
        let ok = db
            .create_student(keep.id, "Anna".into(), "Klasse".into(), None)
            .await
            .unwrap();
        let lost = db
            .create_student(gone.id, "Ben".into(), "Ohneklasse".into(), None)
            .await
            .unwrap();
        db.create_observation(ok.id, 1, "Sozialverhalten".into(), "bleibt".into(), vec![])
            .await
            .unwrap();
        db.create_observation(lost.id, 1, "Sozialverhalten".into(), "Waise 1".into(), vec![])
            .await
            .unwrap();
        db.create_observation(lost.id, 1, "Sozialverhalten".into(), "Waise 2".into(), vec![])
            .await
            .unwrap();
        // Klasse hart entfernen (wie in alten Datenbanken vorgekommen)
        {
            let mut conn = db.pool.acquire().await.unwrap();
            sqlx::query("PRAGMA foreign_keys=OFF").execute(&mut *conn).await.unwrap();
            sqlx::query("DELETE FROM classes WHERE id = ?")
                .bind(gone.id)
                .execute(&mut *conn)
                .await
                .unwrap();
            sqlx::query("PRAGMA foreign_keys=ON").execute(&mut *conn).await.unwrap();
        }

        assert_eq!(db.snapshot_orphan_counts().await.unwrap(), (1, 2));
        let snap = crate::snapshot::build_snapshot(&db, Some("laptop".into()), None)
            .await
            .unwrap();
        assert_eq!(snap.rows.students.len(), 1);
        assert_eq!(snap.rows.observations.len(), 1);
        let exported: std::collections::HashSet<_> =
            snap.rows.students.iter().map(|s| s.uuid.clone()).collect();
        assert!(snap
            .rows
            .observations
            .iter()
            .all(|o| exported.contains(&o.student_uuid)));

        // Auf einem leeren Gerät: dekodieren und zusammenführen ohne Fehler
        let decoded = crate::snapshot::decode(&crate::snapshot::encode(&snap)).unwrap();
        let (empty, _dir2) = create_test_db().await;
        crate::merge::merge_snapshot(&empty, &decoded).await.unwrap();
        let texts: Vec<String> = sqlx::query_scalar("SELECT text FROM observations")
            .fetch_all(&empty.pool)
            .await
            .unwrap();
        assert_eq!(texts, vec!["bleibt".to_string()]);
    }

    #[tokio::test]
    async fn test_create_and_get_class() {
        let (db, _temp_dir) = create_test_db().await;

        // Create a class
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
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
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();

        // Create a student
        let student = db
            .create_student(
                class.id,
                "Max".to_string(),
                "Mustermann".to_string(),
                Some("active".to_string()),
            )
            .await
            .unwrap();

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
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

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
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

        // Create observation for student
        let _observation = db
            .create_observation(
                student.id,
                1,
                "social".to_string(),
                "Test observation".to_string(),
                vec!["test".to_string()],
            )
            .await
            .unwrap();

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
    async fn test_student_delete_and_restore_via_import() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class and student
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

        // Create observation for student
        let observation = db
            .create_observation(
                student.id,
                1,
                "social".to_string(),
                "Test observation".to_string(),
                vec!["test".to_string()],
            )
            .await
            .unwrap();

        // Verify initial state
        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 1);
        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1);

        // Create export before deletion (should include all students)
        let all_students = db.get_all_students_including_deleted().await.unwrap();
        assert_eq!(all_students.len(), 1);

        let backup_json = serde_json::json!({
            "format": "full_export",
            "version": "1.1",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "data": {
                "classes": [class],
                "students": [student],
                "observations": [observation]
            }
        });
        let backup_data = backup_json.to_string().into_bytes();

        // Soft delete student (should hide from regular queries)
        db.delete_student(student.id, false).await.unwrap();

        // Student should be hidden from regular queries
        let students_after_soft = db.get_students().await.unwrap();
        assert_eq!(students_after_soft.len(), 0);

        // But should still exist in all_students query
        let all_students_after_soft = db.get_all_students_including_deleted().await.unwrap();
        assert_eq!(all_students_after_soft.len(), 1);
        assert_eq!(all_students_after_soft[0].status, "deleted");

        // Observations should still exist (soft delete preserves them)
        let observations_after_soft = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations_after_soft.len(), 1);

        // Now hard delete student (completely remove)
        db.delete_student(student.id, true).await.unwrap();

        // Student should be completely gone
        let students_after_hard = db.get_students().await.unwrap();
        assert_eq!(students_after_hard.len(), 0);
        let all_students_after_hard = db.get_all_students_including_deleted().await.unwrap();
        assert_eq!(all_students_after_hard.len(), 0);

        // Observations should also be gone
        let observations_after_hard = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations_after_hard.len(), 0);

        // Ein Löschvermerk gewinnt: ein alter Import belebt Schüler und Beobachtung nicht wieder
        let result = import_file(&db, &backup_data).await.unwrap();
        assert!(result.contains("neu"), "{result}");
        assert_eq!(db.get_students().await.unwrap().len(), 0);
        assert_eq!(db.search_observations(None, None, None).await.unwrap().len(), 0);
        let leaked: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM students WHERE first_name != '' OR last_name != ''",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(leaked, 0);
    }

    #[tokio::test]
    async fn test_create_and_search_observations() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup class and student
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

        // Create observation
        let observation = db
            .create_observation(
                student.id,
                1,
                "social".to_string(),
                "Shows excellent teamwork skills".to_string(),
                vec!["teamwork".to_string(), "social".to_string()],
            )
            .await
            .unwrap();

        assert_eq!(observation.student_id, student.id);
        assert_eq!(observation.category, "social");
        assert!(observation.text.contains("teamwork"));

        // Search observations
        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1);

        // Search by student ID
        let student_observations = db
            .search_observations(None, Some(student.id), None)
            .await
            .unwrap();
        assert_eq!(student_observations.len(), 1);

        // Search by text query
        let text_search = db
            .search_observations(Some("teamwork".to_string()), None, None)
            .await
            .unwrap();
        assert_eq!(text_search.len(), 1);

        // Search by category
        let category_search = db
            .search_observations(None, None, Some("social".to_string()))
            .await
            .unwrap();
        assert_eq!(category_search.len(), 1);
    }

    #[tokio::test]
    async fn test_delete_observation_permissions() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();
        let observation = db
            .create_observation(
                student.id,
                1, // Author ID 1
                "social".to_string(),
                "Test observation".to_string(),
                vec![],
            )
            .await
            .unwrap();

        // Author should be able to delete their observation
        let result = db.delete_observation(observation.id, 1, false).await;
        assert!(result.is_ok());

        // Recreate observation for next test
        let observation2 = db
            .create_observation(
                student.id,
                1, // Author ID 1
                "social".to_string(),
                "Test observation 2".to_string(),
                vec![],
            )
            .await
            .unwrap();

        // Different user should not be able to delete
        let result = db.delete_observation(observation2.id, 2, false).await; // Different author ID
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Permission denied"));

        // Force delete should work regardless of author
        let result = db.delete_observation(observation2.id, 2, true).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_get_observations_since() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

        // Create observation
        let _observation = db
            .create_observation(
                student.id,
                1,
                "social".to_string(),
                "Recent observation".to_string(),
                vec![],
            )
            .await
            .unwrap();

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

        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();
        let _observation = db
            .create_observation(
                student.id,
                1,
                "social".to_string(),
                "Test for changeset".to_string(),
                vec!["test".to_string()],
            )
            .await
            .unwrap();

        // Datei-Austausch im neuen Format: Gesamtstand schreiben, Datenbank leeren, einspielen
        let snap = crate::snapshot::build_snapshot(&db, None, None).await.unwrap();
        let changeset_data = crate::snapshot::encode(&snap);
        let parsed: serde_json::Value = serde_json::from_slice(&changeset_data).unwrap();
        assert!(parsed.get("checksum").is_some());
        assert!(parsed.get("data").is_some());

        db.clear_all_data().await.unwrap();
        let empty_observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(empty_observations.len(), 0);

        let result = import_file(&db, &changeset_data).await.unwrap();
        assert!(result.contains("neu"), "{result}");

        let restored_observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(restored_observations.len(), 1);
        assert_eq!(restored_observations[0].text, "Test for changeset");
    }

    #[tokio::test]
    async fn test_full_backup_operations() {
        let (db, _temp_dir) = create_test_db().await;

        // Create comprehensive test data
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();
        let _observation = db
            .create_observation(
                student.id,
                1,
                "social".to_string(),
                "Full backup test".to_string(),
                vec!["backup".to_string(), "test".to_string()],
            )
            .await
            .unwrap();

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
        let result = import_file(&db, &backup_data).await.unwrap();
        assert_eq!(result, "3 neu, 0 aktualisiert, 0 gelöscht");

        // Verify imported data (Zeilen bekommen lokale IDs; die Sicherung enthält nur die
        // importierte Beobachtung, die ursprüngliche wurde vorher gelöscht)
        let classes = db.get_classes().await.unwrap();
        assert_eq!(classes.len(), 1);

        let students = db.get_students().await.unwrap();
        assert_eq!(students.len(), 1);

        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1);
        assert_eq!(observations[0].text, "Imported observation");
    }

    #[tokio::test]
    async fn test_delete_observation_leaves_contentless_tombstone() {
        let (db, _t) = create_test_db().await;
        let class = db.create_class("5a".into(), "2023/24".into()).await.unwrap();
        let st = db.create_student(class.id, "Max".into(), "M".into(), None).await.unwrap();
        let o = db.create_observation(st.id, 1, "social".into(), "Geheim".into(), vec!["x".into()]).await.unwrap();
        db.delete_observation(o.id, 1, false).await.unwrap();
        let row: (String, String, Option<String>, Option<String>) = sqlx::query_as(
            "SELECT text, tags, deleted_at, modified_by_device FROM observations WHERE id = ?").bind(o.id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(row.0, "");
        assert_eq!(row.1, "[]");
        assert!(row.2.is_some());
        assert!(row.3.is_some());
    }

    #[tokio::test]
    async fn test_force_delete_student_cascades_tombstones() {
        let (db, _t) = create_test_db().await;
        let class = db.create_class("5a".into(), "2023/24".into()).await.unwrap();
        let st = db.create_student(class.id, "Max".into(), "Mustermann".into(), None).await.unwrap();
        db.create_observation(st.id, 1, "social".into(), "A".into(), vec!["t".into()]).await.unwrap();
        db.create_observation(st.id, 1, "social".into(), "B".into(), vec![]).await.unwrap();
        db.delete_student(st.id, true).await.unwrap();
        let s: (String, String, Option<String>) = sqlx::query_as(
            "SELECT first_name, last_name, deleted_at FROM students WHERE id = ?").bind(st.id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!((s.0.as_str(), s.1.as_str()), ("", ""));
        assert!(s.2.is_some());
        let obs: Vec<(String, String, Option<String>)> = sqlx::query_as(
            "SELECT text, tags, deleted_at FROM observations WHERE student_id = ?").bind(st.id)
            .fetch_all(&db.pool).await.unwrap();
        assert_eq!(obs.len(), 2);
        assert!(obs.iter().all(|o| o.0.is_empty() && o.1 == "[]" && o.2.is_some()));
    }

    #[tokio::test]
    async fn test_force_delete_class_cascades_tombstones() {
        let (db, _t) = create_test_db().await;
        let class = db.create_class("5a".into(), "2023/24".into()).await.unwrap();
        let st = db.create_student(class.id, "Max".into(), "Mustermann".into(), None).await.unwrap();
        db.create_observation(st.id, 1, "social".into(), "A".into(), vec![]).await.unwrap();
        db.delete_class(class.id, true).await.unwrap();
        let c: (String, String, Option<String>) = sqlx::query_as(
            "SELECT name, school_year, deleted_at FROM classes WHERE id = ?").bind(class.id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(c.0, "");
        assert_eq!(c.1, "2023/24");
        assert!(c.2.is_some());
        let s: (String, String, Option<String>) = sqlx::query_as(
            "SELECT first_name, last_name, deleted_at FROM students WHERE id = ?").bind(st.id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!((s.0.as_str(), s.1.as_str()), ("", ""));
        assert!(s.2.is_some());
        let o: (String, Option<String>) = sqlx::query_as(
            "SELECT text, deleted_at FROM observations WHERE student_id = ?").bind(st.id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(o.0, "");
        assert!(o.1.is_some());
    }

    #[tokio::test]
    async fn test_delete_category_tombstone_frees_name() {
        let (db, _t) = create_test_db().await;
        let cat = db.create_category("Sozial2".into(), "#111111".into(), "#222222".into(), "#333333".into()).await.unwrap();
        db.delete_category(cat.id, true).await.unwrap();
        let row: (String, String, Option<String>) = sqlx::query_as(
            "SELECT name, color, deleted_at FROM categories WHERE id = ?").bind(cat.id)
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(row.0, "Sozial2");
        assert_eq!(row.1, "#111111");
        assert!(row.2.is_some());
        db.create_category("Sozial2".into(), "#111111".into(), "#222222".into(), "#333333".into()).await.unwrap();
    }

    #[tokio::test]
    async fn test_class_deletion_with_students() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class with student
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let _student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

        // Soft delete should fail
        let result = db.delete_class(class.id, false).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Cannot delete class with active students"));

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
        let result = db
            .create_student(999, "Max".to_string(), "Mustermann".to_string(), None)
            .await;
        assert!(result.is_err()); // Should fail due to foreign key constraint

        // Create valid class first
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await;
        assert!(student.is_ok()); // Should work now

        // Try to create observation with non-existent student
        let result = db
            .create_observation(999, 1, "test".to_string(), "test".to_string(), vec![])
            .await;
        assert!(result.is_err()); // Should fail due to foreign key constraint
    }

    // ========== UNIFIED SYNCHRONIZATION SYSTEM TESTS ==========

    #[tokio::test]
    async fn test_sync_export_changeset_time_filtering() {
        let (db, _temp_dir) = create_test_db().await;

        // Create class and student
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();

        // Create old observation (simulate by creating it first)
        let _old_obs = db
            .create_observation(
                student.id,
                1,
                "old".to_string(),
                "Old observation".to_string(),
                vec![],
            )
            .await
            .unwrap();

        // Wait to ensure time difference
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Get cutoff time
        let cutoff_time = chrono::Utc::now();

        // Create new observation
        let _new_obs = db
            .create_observation(
                student.id,
                1,
                "new".to_string(),
                "New observation".to_string(),
                vec![],
            )
            .await
            .unwrap();

        // Export with time filter (get observations since cutoff)
        let observations = db
            .get_observations_since(cutoff_time - chrono::Duration::seconds(1))
            .await
            .unwrap();

        // Should contain both observations (within time range)
        assert_eq!(observations.len(), 2);

        // Test with very recent cutoff (should get only new observation)
        let observations = db.get_observations_since(cutoff_time).await.unwrap();
        assert_eq!(observations.len(), 1);
        assert_eq!(observations[0].text, "New observation");
    }

    #[tokio::test]
    async fn test_sync_import_changeset_invalid_format() {
        let (db, _temp_dir) = create_test_db().await;

        // Test with invalid JSON
        let invalid_data = b"invalid json data";
        let result = import_file(&db, invalid_data).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("JSON"));

        // Test with missing required fields
        let incomplete_json = serde_json::json!({
            "version": "1.0",
            "timestamp": chrono::Utc::now().to_rfc3339()
            // Missing changeset and checksum
        });

        let incomplete_data = incomplete_json.to_string().into_bytes();
        let result = import_file(&db, &incomplete_data).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_sync_full_export_with_filtering() {
        let (db, _temp_dir) = create_test_db().await;

        // Setup test data
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student1 = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();
        let student2 = db
            .create_student(class.id, "Anna".to_string(), "Test".to_string(), None)
            .await
            .unwrap();

        // Create observations with different timestamps
        let _obs1 = db
            .create_observation(
                student1.id,
                1,
                "old".to_string(),
                "Old observation".to_string(),
                vec![],
            )
            .await
            .unwrap();
        let _obs2 = db
            .create_observation(
                student2.id,
                1,
                "recent".to_string(),
                "Recent observation".to_string(),
                vec![],
            )
            .await
            .unwrap();

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

    // ---- update_observation and sync of edited observations ----

    // The create_* methods return their `RETURNING` row before the INSERT statement has
    // finished, so an immediate read on another pooled connection can miss the new row.
    // A single connection keeps the tests below deterministic.
    async fn create_single_connection_test_db() -> (Database, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_url = format!(
            "sqlite:{}?mode=rwc",
            temp_dir.path().join("test.db").display()
        );
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap();
        let crypto = Arc::new(CryptoManager::new().unwrap());
        let db = Database {
            pool,
            crypto,
            db_path: temp_dir.path().join("test.db"),
            clock: Arc::new(SyncClock::new(0)),
        };
        db.migrate().await.unwrap();
        (db, temp_dir)
    }

    async fn create_test_observation(db: &Database) -> Observation {
        let class = db
            .create_class("5a".to_string(), "2023/24".to_string())
            .await
            .unwrap();
        let student = db
            .create_student(class.id, "Max".to_string(), "Mustermann".to_string(), None)
            .await
            .unwrap();
        db.create_observation(
            student.id,
            1,
            "social".to_string(),
            "Original observation".to_string(),
            vec!["original".to_string()],
        )
        .await
        .unwrap()
    }

    // Same "data" layout as the export_all_data command, which import_full_backup reads
    async fn export_full_backup(db: &Database) -> Vec<u8> {
        serde_json::json!({
            "format": "full_export",
            "data": {
                "classes": db.get_classes().await.unwrap(),
                "students": db.get_all_students_including_deleted().await.unwrap(),
                "observations": db.search_observations(None, None, None).await.unwrap()
            }
        })
        .to_string()
        .into_bytes()
    }

    // Two devices holding the same observation: created on A, transferred to B by full backup
    async fn create_synced_devices() -> ((Database, TempDir), (Database, TempDir), Observation) {
        let device_a = create_single_connection_test_db().await;
        let device_b = create_single_connection_test_db().await;

        let observation = create_test_observation(&device_a.0).await;
        import_file(&device_b.0, &export_full_backup(&device_a.0).await)
            .await
            .unwrap();

        let on_b = device_b.0.get_observation(observation.id).await.unwrap();
        assert_eq!(on_b.unwrap().text, "Original observation");

        (device_a, device_b, observation)
    }

    #[tokio::test]
    async fn test_update_observation_success() {
        let (db, _temp_dir) = create_single_connection_test_db().await;
        let observation = create_test_observation(&db).await;

        let updated = db
            .update_observation(
                observation.id,
                "academic".to_string(),
                "Edited observation".to_string(),
                vec!["edited".to_string(), "math".to_string()],
            )
            .await
            .unwrap();

        // Editable fields are changed
        assert_eq!(updated.id, observation.id);
        assert_eq!(updated.category, "academic");
        assert_eq!(updated.text, "Edited observation");
        assert_eq!(updated.tags, r#"["edited","math"]"#);

        // Identity fields are kept
        assert_eq!(updated.student_id, observation.student_id);
        assert_eq!(updated.author_id, observation.author_id);
        assert_eq!(updated.source_device_id, observation.source_device_id);

        // The returned row is what is stored
        let stored = db.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(stored.category, "academic");
        assert_eq!(stored.text, "Edited observation");
        assert_eq!(stored.tags, r#"["edited","math"]"#);
        assert_eq!(stored.updated_at, updated.updated_at);

        // No additional row was created
        let observations = db.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1);
    }

    #[tokio::test]
    async fn test_update_observation_unknown_id() {
        let (db, _temp_dir) = create_single_connection_test_db().await;
        let observation = create_test_observation(&db).await;

        let result = db
            .update_observation(
                observation.id + 999,
                "academic".to_string(),
                "Edited observation".to_string(),
                vec![],
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));

        // The existing observation is untouched
        let stored = db.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(stored.text, "Original observation");
        assert_eq!(stored.updated_at, observation.updated_at);
    }

    #[tokio::test]
    async fn test_update_observation_validation() {
        let (db, _temp_dir) = create_single_connection_test_db().await;
        let observation = create_test_observation(&db).await;

        // Empty and whitespace-only text is rejected
        for text in ["", "   \n\t"] {
            let result = db
                .update_observation(
                    observation.id,
                    "academic".to_string(),
                    text.to_string(),
                    vec![],
                )
                .await;
            assert!(result.unwrap_err().to_string().contains("text"));
        }

        // Empty category is rejected
        let result = db
            .update_observation(
                observation.id,
                " ".to_string(),
                "Edited observation".to_string(),
                vec![],
            )
            .await;
        assert!(result.unwrap_err().to_string().contains("category"));

        // Rejected updates change nothing
        let stored = db.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(stored.category, "social");
        assert_eq!(stored.text, "Original observation");
        assert_eq!(stored.tags, r#"["original"]"#);
        assert_eq!(stored.updated_at, observation.updated_at);
    }

    #[tokio::test]
    async fn test_update_observation_changes_updated_at_only() {
        let (db, _temp_dir) = create_single_connection_test_db().await;
        let observation = create_test_observation(&db).await;
        // Zeitstempel haben Millisekunden-Auflösung: sicherstellen, dass die Bearbeitung später liegt
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;

        let updated = db
            .update_observation(
                observation.id,
                "social".to_string(),
                "Edited observation".to_string(),
                vec![],
            )
            .await
            .unwrap();

        assert_eq!(updated.created_at, observation.created_at);
        assert!(updated.updated_at > observation.updated_at);

        let stored = db.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(stored.created_at, observation.created_at);
        assert_eq!(stored.updated_at, updated.updated_at);
    }

    #[tokio::test]
    async fn test_changeset_export_selects_observation_by_edit_time() {
        let (db, _temp_dir) = create_single_connection_test_db().await;
        let observation = create_test_observation(&db).await;

        // Simulate an observation that was created and last changed 60 days ago
        let sixty_days_ago = chrono::Utc::now() - chrono::Duration::days(60);
        sqlx::query("UPDATE observations SET created_at = ?, updated_at = ? WHERE id = ?")
            .bind(sixty_days_ago)
            .bind(sixty_days_ago)
            .bind(observation.id)
            .execute(&db.pool)
            .await
            .unwrap();

        // Outside of the 30 day window while it is unchanged
        let cutoff = chrono::Utc::now() - chrono::Duration::days(30);
        assert!(db.get_observations_since(cutoff).await.unwrap().is_empty());

        db.update_observation(
            observation.id,
            "social".to_string(),
            "Edited today".to_string(),
            vec![],
        )
        .await
        .unwrap();

        // The edit brings it back into the window
        let recent = db.get_observations_since(cutoff).await.unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].text, "Edited today");
        assert_eq!(recent[0].created_at, sixty_days_ago);

        // ... and therefore into the exported changeset
        let changeset: serde_json::Value =
            serde_json::from_slice(&legacy_changeset(&db, 30).await.unwrap()).unwrap();
        let exported = changeset["data"]["changes"]["observations"]
            .as_array()
            .unwrap();
        assert_eq!(exported.len(), 1);
        assert_eq!(exported[0]["text"], "Edited today");
    }

    #[tokio::test]
    async fn test_sync_changeset_edit_reaches_other_device() {
        let ((db_a, _dir_a), (db_b, _dir_b), observation) = create_synced_devices().await;

        // Edit on device A
        let edited = db_a
            .update_observation(
                observation.id,
                "academic".to_string(),
                "Edited on device A".to_string(),
                vec!["edited".to_string()],
            )
            .await
            .unwrap();

        // Device B imports the changeset of device A
        let changeset = legacy_changeset(&db_a, 30).await.unwrap();
        let result = import_file(&db_b, &changeset).await.unwrap();
        assert_eq!(result, "0 neu, 1 aktualisiert, 0 gelöscht");

        let on_b = db_b.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(on_b.category, "academic");
        assert_eq!(on_b.text, "Edited on device A");
        assert_eq!(on_b.tags, r#"["edited"]"#);
        assert_eq!(on_b.updated_at, edited.updated_at);
        assert_eq!(on_b.created_at, observation.created_at);
        assert_eq!(on_b.source_device_id, observation.source_device_id);

        // Importing the same changeset again (WebDAV sync re-reads every file) is a no-op
        let result = import_file(&db_b, &changeset).await.unwrap();
        assert_eq!(result, "0 neu, 0 aktualisiert, 0 gelöscht");
        let observations = db_b.search_observations(None, None, None).await.unwrap();
        assert_eq!(observations.len(), 1);
    }

    #[tokio::test]
    async fn test_sync_changeset_stale_copy_does_not_overwrite_newer_edit() {
        let ((db_a, _dir_a), (db_b, _dir_b), observation) = create_synced_devices().await;

        // Device A exports the original version, edits, and exports again
        let original_changeset = legacy_changeset(&db_a, 30).await.unwrap();
        db_a.update_observation(
            observation.id,
            "social".to_string(),
            "Older edit on device A".to_string(),
            vec![],
        )
        .await
        .unwrap();
        let older_changeset = legacy_changeset(&db_a, 30).await.unwrap();

        // Device B edits afterwards
        let newer = db_b
            .update_observation(
                observation.id,
                "academic".to_string(),
                "Newer edit on device B".to_string(),
                vec!["newer".to_string()],
            )
            .await
            .unwrap();

        // Neither older copy may replace the newer edit on device B
        for changeset in [&original_changeset, &older_changeset] {
            let result = import_file(&db_b, changeset).await.unwrap();
            assert_eq!(result, "0 neu, 0 aktualisiert, 0 gelöscht");
        }
        let on_b = db_b.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(on_b.category, "academic");
        assert_eq!(on_b.text, "Newer edit on device B");
        assert_eq!(on_b.tags, r#"["newer"]"#);
        assert_eq!(on_b.updated_at, newer.updated_at);

        // The newer edit wins on device A as well
        let newer_changeset = legacy_changeset(&db_b, 30).await.unwrap();
        let result = import_file(&db_a, &newer_changeset).await.unwrap();
        assert_eq!(result, "0 neu, 1 aktualisiert, 0 gelöscht");
        let on_a = db_a.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(on_a.text, "Newer edit on device B");
        assert_eq!(on_a.updated_at, newer.updated_at);
    }

    #[tokio::test]
    async fn test_sync_full_backup_merges_edits_by_updated_at() {
        let ((db_a, _dir_a), (db_b, _dir_b), observation) = create_synced_devices().await;

        // Edit on device A arrives on device B through a full backup
        let edited = db_a
            .update_observation(
                observation.id,
                "academic".to_string(),
                "Edited on device A".to_string(),
                vec!["edited".to_string()],
            )
            .await
            .unwrap();
        let backup_a = export_full_backup(&db_a).await;
        let result = import_file(&db_b, &backup_a).await.unwrap();
        assert!(result.starts_with("0 neu, 1 aktualisiert"), "{result}");

        let on_b = db_b.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(on_b.category, "academic");
        assert_eq!(on_b.text, "Edited on device A");
        assert_eq!(on_b.tags, r#"["edited"]"#);
        assert_eq!(on_b.updated_at, edited.updated_at);

        // A newer edit on device B is not overwritten by the older backup of device A
        let newer = db_b
            .update_observation(
                observation.id,
                "social".to_string(),
                "Newer edit on device B".to_string(),
                vec![],
            )
            .await
            .unwrap();
        let result = import_file(&db_b, &backup_a).await.unwrap();
        assert!(result.starts_with("0 neu, 0 aktualisiert"), "{result}");

        let on_b = db_b.get_observation(observation.id).await.unwrap().unwrap();
        assert_eq!(on_b.text, "Newer edit on device B");
        assert_eq!(on_b.updated_at, newer.updated_at);
    }

    #[tokio::test]
    async fn test_sync_same_id_of_different_observation_is_not_overwritten() {
        let (db, _temp_dir) = create_single_connection_test_db().await;
        let local = create_test_observation(&db).await;
        let later = chrono::Utc::now() + chrono::Duration::hours(1);
        let student = db.get_students().await.unwrap().remove(0);
        let class = db.get_classes().await.unwrap().remove(0);

        // Anderes Gerät hat dieselbe Integer-ID vergeben (ohne uuid: abgeleitet aus Gerät+ID+Zeit)
        let mut other_device = serde_json::to_value(&local).unwrap();
        other_device.as_object_mut().unwrap().remove("uuid");
        other_device["source_device_id"] = serde_json::json!("other-device");
        other_device["text"] = serde_json::json!("Observation of another device");
        other_device["updated_at"] = serde_json::json!(later);

        // Gleiches Gerät und ID, aber anderer Erstellzeitpunkt (z. B. andere Datenbankdatei)
        let mut other_creation = serde_json::to_value(&local).unwrap();
        other_creation.as_object_mut().unwrap().remove("uuid");
        other_creation["created_at"] =
            serde_json::json!(local.created_at - chrono::Duration::days(1));
        other_creation["text"] = serde_json::json!("Observation of another database");
        other_creation["updated_at"] = serde_json::json!(later);

        let backup = serde_json::json!({
            "format": "full_export",
            "data": { "classes": [class], "students": [student],
                      "observations": [other_device, other_creation] }
        })
        .to_string();
        let result = import_file(&db, backup.as_bytes()).await.unwrap();
        // Die UUID bestimmt die Identität: zwei fremde Beobachtungen kommen neu hinzu.
        assert_eq!(result, "2 neu, 0 aktualisiert, 0 gelöscht");

        let stored = db.get_observation(local.id).await.unwrap().unwrap();
        assert_eq!(stored.text, "Original observation");
        assert_eq!(stored.updated_at, local.updated_at);
        assert_eq!(db.search_observations(None, None, None).await.unwrap().len(), 3);
    }

    // ============================================
    // Sync v2: Schema-Umstellung (Task 2, A10)
    // ============================================
    pub(crate) mod sync_v2_migration {
        use super::*;
        use crate::sync_schema::{self, derived_uuid, MigrationOutcome};
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;

        const SYNCED_TABLES: [&str; 4] = ["classes", "students", "categories", "observations"];

        /// Kopie der Schema-Texte vor Sync v2 (inkl. `categories.name UNIQUE`).
        pub(crate) const LEGACY_SCHEMA: &[&str] = &[
            r#"CREATE TABLE classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                school_year TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_device_id TEXT NOT NULL DEFAULT ''
            )"#,
            r#"CREATE TABLE students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                source_device_id TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (class_id) REFERENCES classes (id)
            )"#,
            r#"CREATE TABLE categories (
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
            )"#,
            r#"CREATE TABLE observations (
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
            )"#,
            r#"CREATE TABLE attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                observation_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                file_data BLOB NOT NULL,
                file_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (observation_id) REFERENCES observations (id)
            )"#,
            r#"CREATE TABLE sync_state (
                peer_id TEXT PRIMARY KEY,
                last_seq INTEGER DEFAULT 0,
                last_pull DATETIME,
                last_push DATETIME,
                changeset_hash TEXT
            )"#,
            r#"CREATE TABLE sync_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                webdav_url TEXT NOT NULL,
                webdav_username TEXT NOT NULL,
                webdav_password_encrypted BLOB NOT NULL,
                auto_sync_enabled BOOLEAN DEFAULT 1,
                sync_interval_seconds INTEGER DEFAULT 180,
                last_sync_timestamp DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )"#,
            "CREATE INDEX idx_observations_student ON observations(student_id)",
            "CREATE INDEX idx_observations_created ON observations(created_at)",
        ];

        /// Daten: 2 Klassen, 3 Schüler (einer `deleted`), 6 Kategorien, 5 Beobachtungen.
        /// Zeitstempel gemischt: `CURRENT_TIMESTAMP`-Format und RFC 3339.
        const LEGACY_DATA: &[&str] = &[
            r#"INSERT INTO classes VALUES
                (1, '5a', '2025/26', '2025-08-01 08:00:00', '2025-08-01 08:00:00', 'laptop-A'),
                (2, '6b', '2025/26', '2025-08-02T09:15:30.123+00:00', '2025-09-01T10:00:00Z', 'laptop-A')"#,
            r#"INSERT INTO students VALUES
                (1, 1, 'Anna', 'Müller', 'active', '2025-08-03 10:00:00', '2025-08-03 10:00:00', 'laptop-A'),
                (2, 1, 'Ben', 'O''Brien', 'deleted', '2025-08-03T10:05:00.000Z', '2025-10-01 12:00:00', 'laptop-A'),
                (3, 2, 'Çelik', 'Zoë', 'active', '2025-08-04 11:11:11', '2025-08-04T11:11:11.500+00:00', 'desktop-B')"#,
            r#"INSERT INTO categories VALUES
                (1, 'Sozial', '#10B981', '#D1FAE5', '#065F46', 1, 1, '2025-08-01 07:00:00', '2025-08-01 07:00:00', 'laptop-A'),
                (2, 'Fachlich', '#3B82F6', '#DBEAFE', '#1E3A8A', 1, 2, '2025-08-01 07:00:00', '2025-08-01 07:00:00', 'laptop-A'),
                (3, 'Verhalten', '#F59E0B', '#FEF3C7', '#92400E', 1, 3, '2025-08-01 07:00:00', '2025-08-01 07:00:00', 'laptop-A'),
                (4, 'Förderung', '#8B5CF6', '#EDE9FE', '#5B21B6', 1, 4, '2025-08-01 07:00:00', '2025-08-01 07:00:00', 'laptop-A'),
                (5, 'Sonstiges', '#6B7280', '#F3F4F6', '#374151', 0, 5, '2025-08-01 07:00:00', '2025-08-01 07:00:00', 'laptop-A'),
                (7, 'Elterngespräch', '#EF4444', '#FEE2E2', '#7F1D1D', 1, 6, '2025-09-10T08:30:00.250Z', '2025-09-10T08:30:00.250Z', 'desktop-B')"#,
            // Simuliert endgültig gelöschte Kategorien mit höheren IDs (AUTOINCREMENT-Zähler > max(id)).
            "UPDATE sqlite_sequence SET seq = 9 WHERE name = 'categories'",
            r#"INSERT INTO observations VALUES
                (1, 1, 1, 'Sozial', 'Hilft anderen „gern“ – sehr kooperativ.', '["team"]', '2025-09-01 08:00:00', '2025-09-01 08:00:00', 'laptop-A'),
                (2, 1, 1, 'Fachlich', 'Rechnet sicher; Text mit '' Apostroph', '[]', '2025-09-02T09:00:00.000Z', '2025-09-02T09:30:00.000Z', 'laptop-A'),
                (3, 2, 1, 'Verhalten', 'Störung im Unterricht', '["a","b"]', '2025-09-03 10:00:00.123', '2025-09-03 10:00:00.123', 'laptop-A'),
                (4, 3, 1, 'Umbenannt-alt', 'Kategorie existiert nicht mehr', '[]', '2025-09-04T10:00:00+02:00', '2025-09-04T10:00:00+02:00', 'desktop-B'),
                (5, 3, 1, 'Elterngespräch', 'Mehrzeilig
zweite Zeile', '[]', '2025-09-05 12:00:00', '2025-09-05T12:00:00Z', 'desktop-B')"#,
            r#"INSERT INTO attachments VALUES
                (1, 1, 'foto.jpg', 'image/jpeg', X'FFD8FFE000104A464946', 'abc123', '2025-09-01 08:00:01')"#,
            r#"INSERT INTO sync_state VALUES ('peer-1', 7, '2025-10-01 10:00:00', NULL, 'hash')"#,
            r#"INSERT INTO sync_config (id, webdav_url, webdav_username, webdav_password_encrypted, auto_sync_enabled, sync_interval_seconds, last_sync_timestamp, created_at, updated_at)
                VALUES (1, 'https://dav.example.org/remote.php/dav/files/lehrer/', 'lehrer', X'000102030405060708090A0B0C0D0E0F', 1, 180, '2025-11-01 07:00:00', '2025-08-01 07:00:00', '2025-08-01 07:00:00')"#,
        ];

        async fn open_raw(path: &Path) -> Pool<Sqlite> {
            let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.display()))
                .unwrap()
                .create_if_missing(true)
                .foreign_keys(false);
            SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(opts)
                .await
                .unwrap()
        }

        async fn create_legacy_db(path: &Path) {
            let pool = open_raw(path).await;
            for sql in LEGACY_SCHEMA.iter().chain(LEGACY_DATA.iter()) {
                sqlx::query(sql).execute(&pool).await.unwrap();
            }
            pool.close().await;
        }

        async fn columns(pool: &Pool<Sqlite>, table: &str) -> Vec<String> {
            sqlx::query_scalar::<_, String>(&format!(
                "SELECT name FROM pragma_table_info('{}') ORDER BY cid",
                table
            ))
            .fetch_all(pool)
            .await
            .unwrap()
        }

        /// Exakter Inhalt (inkl. Speichertyp via `quote()`) der angegebenen Spalten.
        async fn dump(pool: &Pool<Sqlite>, table: &str, cols: &[String]) -> Vec<String> {
            let expr = cols
                .iter()
                .map(|c| format!("quote(\"{}\")", c))
                .collect::<Vec<_>>()
                .join(" || char(31) || ");
            let order = if table == "sync_state" { "peer_id" } else { "id" };
            sqlx::query_scalar::<_, String>(&format!(
                "SELECT {} FROM {} ORDER BY {}",
                expr, table, order
            ))
            .fetch_all(pool)
            .await
            .unwrap()
        }

        const ALL_LEGACY_TABLES: [&str; 7] = [
            "classes",
            "students",
            "categories",
            "observations",
            "attachments",
            "sync_state",
            "sync_config",
        ];

        async fn snapshot_legacy(path: &Path) -> Vec<(String, Vec<String>, Vec<String>)> {
            let pool = open_raw(path).await;
            let mut out = Vec::new();
            for t in ALL_LEGACY_TABLES {
                let cols = columns(&pool, t).await;
                let rows = dump(&pool, t, &cols).await;
                out.push((t.to_string(), cols, rows));
            }
            pool.close().await;
            out
        }

        fn backups_in(dir: &Path) -> Vec<PathBuf> {
            std::fs::read_dir(dir)
                .unwrap()
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| {
                    let n = p.file_name().unwrap().to_string_lossy().to_string();
                    n.contains(".vor-sync-v2-") && n.ends_with(".bak")
                })
                .collect()
        }

        async fn open_db(path: &Path) -> Database {
            let crypto = Arc::new(CryptoManager::new().unwrap());
            Database::new(path, crypto).await.unwrap()
        }

        async fn legacy_fixture() -> (TempDir, PathBuf) {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("observations.db");
            create_legacy_db(&path).await;
            (dir, path)
        }

        async fn uuids(pool: &Pool<Sqlite>, table: &str) -> Vec<(i64, Option<String>)> {
            sqlx::query_as::<_, (i64, Option<String>)>(&format!(
                "SELECT id, uuid FROM {} ORDER BY id",
                table
            ))
            .fetch_all(pool)
            .await
            .unwrap()
        }

        #[tokio::test]
        async fn test_migration_preserves_all_rows() {
            let (_dir, path) = legacy_fixture().await;
            let before = snapshot_legacy(&path).await;
            let expected_counts = [2usize, 3, 6, 5, 1, 1, 1];
            for ((t, _, rows), n) in before.iter().zip(expected_counts) {
                assert_eq!(rows.len(), n, "Fixture {}", t);
            }

            let db = open_db(&path).await;
            for (t, cols, rows) in &before {
                let after = dump(&db.pool, t, cols).await;
                assert_eq!(&after, rows, "Inhalt von {} verändert", t);
            }

            // AUTOINCREMENT-Zähler der neu aufgebauten Tabelle bleibt erhalten (keine ID-Wiederverwendung)
            let seq: i64 =
                sqlx::query_scalar("SELECT seq FROM sqlite_sequence WHERE name = 'categories'")
                    .fetch_one(&db.pool)
                    .await
                    .unwrap();
            assert!(seq >= 9, "sqlite_sequence für categories: {}", seq);

            // Bestehende Lesepfade (SELECT * + FromRow) funktionieren mit den Zusatzspalten
            assert_eq!(db.get_classes().await.unwrap().len(), 2);
            assert_eq!(db.get_all_students_including_deleted().await.unwrap().len(), 3);
            assert_eq!(db.get_categories().await.unwrap().len(), 5); // nur aktive
            assert_eq!(db.get_observation(5).await.unwrap().unwrap().text, "Mehrzeilig\nzweite Zeile");

            // Kein Seeding in eine bestehende DB
            let cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
                .fetch_one(&db.pool)
                .await
                .unwrap();
            assert_eq!(cat_count, 6);
        }

        #[tokio::test]
        async fn test_migration_assigns_unique_uuids() {
            let (_dir, path) = legacy_fixture().await;
            let db = open_db(&path).await;
            for t in SYNCED_TABLES {
                let rows = uuids(&db.pool, t).await;
                assert!(!rows.is_empty());
                let mut seen = std::collections::HashSet::new();
                for (id, u) in &rows {
                    let u = u.clone().unwrap_or_default();
                    assert!(!u.is_empty(), "{}#{} ohne UUID", t, id);
                    assert!(uuid::Uuid::parse_str(&u).is_ok(), "{}#{} UUID ungültig: {}", t, id, u);
                    assert!(seen.insert(u), "{}#{} UUID doppelt", t, id);
                }
                // modified_by_device = source_device_id
                let mismatched: i64 = sqlx::query_scalar(&format!(
                    "SELECT COUNT(*) FROM {} WHERE modified_by_device <> source_device_id OR deleted_at IS NOT NULL",
                    t
                ))
                .fetch_one(&db.pool)
                .await
                .unwrap();
                assert_eq!(mismatched, 0, "{}", t);
                // Eindeutiger Index auf uuid existiert
                let idx: i64 = sqlx::query_scalar(&format!(
                    "SELECT COUNT(*) FROM pragma_index_list('{}') l WHERE l.\"unique\" = 1 AND EXISTS (SELECT 1 FROM pragma_index_info(l.name) i WHERE i.name = 'uuid')",
                    t
                ))
                .fetch_one(&db.pool)
                .await
                .unwrap();
                assert_eq!(idx, 1, "UNIQUE-Index auf {}.uuid", t);
            }
            // Erwartete abgeleitete UUID für eine Beispielzeile
            let obs = uuids(&db.pool, "observations").await;
            assert_eq!(
                obs[0].1.as_deref().unwrap(),
                derived_uuid("observations", "laptop-A", 1, "2025-09-01 08:00:00")
            );
        }

        #[tokio::test]
        async fn test_migration_uuid_is_deterministic() {
            let (dir, path_a) = legacy_fixture().await;
            let path_b = dir.path().join("kopie.db");
            std::fs::copy(&path_a, &path_b).unwrap();

            let db_a = open_db(&path_a).await;
            let db_b = open_db(&path_b).await; // anderes Gerät (andere CryptoManager-Geräte-ID)
            for t in SYNCED_TABLES {
                assert_eq!(uuids(&db_a.pool, t).await, uuids(&db_b.pool, t).await, "{}", t);
            }
        }

        #[tokio::test]
        async fn test_migration_handles_mixed_timestamp_formats() {
            // Beide Formate ergeben dieselbe UUID
            let a = derived_uuid("observations", "laptop-A", 3, "2025-09-03 10:00:00");
            let b = derived_uuid("observations", "laptop-A", 3, "2025-09-03T10:00:00Z");
            let c = derived_uuid("observations", "laptop-A", 3, "2025-09-03T10:00:00.000+00:00");
            let d = derived_uuid("observations", "laptop-A", 3, "2025-09-03T12:00:00+02:00");
            assert_eq!(a, b);
            assert_eq!(a, c);
            assert_eq!(a, d);

            // Gerät B hat dieselbe Zeile im anderen Format gespeichert (Kopie per altem Abgleich)
            let (dir, path_a) = legacy_fixture().await;
            let path_b = dir.path().join("geraet-b.db");
            std::fs::copy(&path_a, &path_b).unwrap();
            {
                let raw = open_raw(&path_b).await;
                sqlx::query("UPDATE observations SET created_at = '2025-09-01T08:00:00.000Z' WHERE id = 1")
                    .execute(&raw)
                    .await
                    .unwrap();
                sqlx::query("UPDATE classes SET created_at = '2025-08-02 09:15:30.123' WHERE id = 2")
                    .execute(&raw)
                    .await
                    .unwrap();
                raw.close().await;
            }
            let before_a = snapshot_legacy(&path_a).await;

            let db_a = open_db(&path_a).await;
            let db_b = open_db(&path_b).await;
            for t in SYNCED_TABLES {
                assert_eq!(uuids(&db_a.pool, t).await, uuids(&db_b.pool, t).await, "{}", t);
            }
            // Zeitstempel unverändert (kein Umformatieren)
            for (t, cols, rows) in &before_a {
                assert_eq!(&dump(&db_a.pool, t, cols).await, rows, "{}", t);
            }
        }

        #[tokio::test]
        async fn test_migration_writes_backup_before_change() {
            let (dir, path) = legacy_fixture().await;
            let _db = open_db(&path).await;

            let backups = backups_in(dir.path());
            assert_eq!(backups.len(), 1, "{:?}", backups);
            let name = backups[0].file_name().unwrap().to_string_lossy().to_string();
            assert!(name.starts_with("observations.db.vor-sync-v2-"), "{}", name);

            let raw = open_raw(&backups[0]).await;
            for t in SYNCED_TABLES {
                assert!(!columns(&raw, t).await.contains(&"uuid".to_string()), "{} in Sicherung schon umgestellt", t);
            }
            let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM observations")
                .fetch_one(&raw)
                .await
                .unwrap();
            assert_eq!(n, 5);
            let schema_meta: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'schema_meta'",
            )
            .fetch_one(&raw)
            .await
            .unwrap();
            assert_eq!(schema_meta, 0);
            raw.close().await;
        }

        #[tokio::test]
        async fn test_migration_is_idempotent() {
            let (dir, path) = legacy_fixture().await;
            let db = open_db(&path).await;
            let first = uuids(&db.pool, "observations").await;

            let again = sync_schema::migrate_to_v2(&db.pool, &db.db_path).await.unwrap();
            assert_eq!(again, MigrationOutcome::AlreadyCurrent);
            assert_eq!(backups_in(dir.path()).len(), 1);
            drop(db);

            // Neustart der App
            let db = open_db(&path).await;
            assert_eq!(backups_in(dir.path()).len(), 1);
            assert_eq!(uuids(&db.pool, "observations").await, first);
            let version: String =
                sqlx::query_scalar("SELECT value FROM schema_meta WHERE key = 'sync_schema_version'")
                    .fetch_one(&db.pool)
                    .await
                    .unwrap();
            assert_eq!(version, "2");
        }

        #[tokio::test]
        async fn test_migration_allows_reusing_deleted_category_name() {
            let (_dir, path) = legacy_fixture().await;
            let db = open_db(&path).await;

            sqlx::query("UPDATE categories SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE name = 'Sozial'")
                .execute(&db.pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO categories (name, source_device_id, uuid) VALUES ('Sozial', 'x', 'u-neu-1')")
                .execute(&db.pool)
                .await
                .expect("Name einer gelöschten Kategorie muss wieder verwendbar sein");
            let dup = sqlx::query("INSERT INTO categories (name, source_device_id, uuid) VALUES ('Sozial', 'x', 'u-neu-2')")
                .execute(&db.pool)
                .await;
            assert!(dup.is_err(), "zwei aktive Kategorien gleichen Namens dürfen nicht entstehen");
        }

        #[tokio::test]
        async fn test_migration_fresh_database_has_v2_schema_without_backup() {
            let (db, dir) = create_test_db().await;
            assert!(backups_in(dir.path()).is_empty());

            for t in SYNCED_TABLES {
                let cols = columns(&db.pool, t).await;
                for c in ["uuid", "deleted_at", "modified_by_device"] {
                    assert!(cols.contains(&c.to_string()), "{}.{} fehlt", t, c);
                }
            }
            // Standard-Kategorien haben UUIDs
            let missing: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM categories WHERE uuid IS NULL OR uuid = '' OR modified_by_device = ''",
            )
            .fetch_one(&db.pool)
            .await
            .unwrap();
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
                .fetch_one(&db.pool)
                .await
                .unwrap();
            assert_eq!(total, 5);
            assert_eq!(missing, 0);

            let cfg_cols = columns(&db.pool, "sync_config").await;
            for c in ["device_role", "first_sync_done", "clock_offset_ms", "last_upload_hash", "remote_etags"] {
                assert!(cfg_cols.contains(&c.to_string()), "sync_config.{} fehlt", c);
            }
            let (role, first, offset, hash, etags): (Option<String>, i64, i64, Option<String>, String) =
                sqlx::query_as(
                    "SELECT device_role, first_sync_done, clock_offset_ms, last_upload_hash, remote_etags FROM sync_config WHERE id = 1",
                )
                .fetch_one(&db.pool)
                .await
                .unwrap();
            assert_eq!((role, first, offset, hash, etags.as_str()), (None, 0, 0, None, "{}"));

            // Platzhalter-Zeile gilt nicht als konfigurierte WebDAV-Verbindung
            assert!(db.get_webdav_credentials().await.unwrap().is_none());
            assert_eq!(db.clock.offset_ms(), 0);

            // Speichern von Zugangsdaten funktioniert weiterhin
            db.store_webdav_credentials("https://dav".into(), "u".into(), "pw".into())
                .await
                .unwrap();
            let creds = db.get_webdav_credentials().await.unwrap().unwrap();
            assert_eq!(creds, ("https://dav".into(), "u".into(), "pw".into()));
        }

        #[tokio::test]
        async fn test_migration_keeps_existing_sync_config_and_loads_clock_offset() {
            let (_dir, path) = legacy_fixture().await;
            let db = open_db(&path).await;
            let (url, last, role, first, etags): (String, Option<String>, Option<String>, i64, String) =
                sqlx::query_as(
                    "SELECT webdav_url, last_sync_timestamp, device_role, first_sync_done, remote_etags FROM sync_config WHERE id = 1",
                )
                .fetch_one(&db.pool)
                .await
                .unwrap();
            assert_eq!(url, "https://dav.example.org/remote.php/dav/files/lehrer/");
            assert_eq!(last.as_deref(), Some("2025-11-01 07:00:00"));
            assert_eq!((role, first, etags.as_str()), (None, 0, "{}"));
            assert_eq!(db.clock.offset_ms(), 0);

            sqlx::query("UPDATE sync_config SET clock_offset_ms = -4321 WHERE id = 1")
                .execute(&db.pool)
                .await
                .unwrap();
            drop(db);
            let db = open_db(&path).await;
            assert_eq!(db.clock.offset_ms(), -4321);
        }

        #[tokio::test]
        async fn test_migration_tolerates_preexisting_orphan_rows() {
            let (_dir, path) = legacy_fixture().await;
            {
                let raw = open_raw(&path).await;
                sqlx::query("INSERT INTO observations (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id) VALUES (6, 99, 1, 'Sozial', 'Waise', '[]', '2025-09-06 08:00:00', '2025-09-06 08:00:00', 'laptop-A')")
                    .execute(&raw)
                    .await
                    .unwrap();
                raw.close().await;
            }
            let before = snapshot_legacy(&path).await;
            let db = open_db(&path).await;
            for (t, cols, rows) in &before {
                assert_eq!(&dump(&db.pool, t, cols).await, rows, "{}", t);
            }
            let u = uuids(&db.pool, "observations").await;
            assert_eq!(u.len(), 6);
            assert!(u.iter().all(|(_, u)| u.is_some()));
        }

        #[tokio::test]
        async fn test_migration_backup_failure_changes_nothing() {
            let (dir, path) = legacy_fixture().await;
            let pool = open_raw(&path).await;
            // Sicherung soll in ein nicht existierendes Verzeichnis gehen → muss scheitern
            let bogus = dir.path().join("gibt-es-nicht").join("observations.db");
            let res = sync_schema::migrate_to_v2(&pool, &bogus).await;
            assert!(res.is_err());
            for t in SYNCED_TABLES {
                assert!(!columns(&pool, t).await.contains(&"uuid".to_string()), "{}", t);
            }
            let meta: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = 'schema_meta'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(meta, 0);
            pool.close().await;
        }

        #[tokio::test]
        async fn test_migration_refuses_unknown_category_columns() {
            let (_dir, path) = legacy_fixture().await;
            let pool = open_raw(&path).await;
            sqlx::query("ALTER TABLE categories ADD COLUMN icon TEXT DEFAULT 'x'")
                .execute(&pool)
                .await
                .unwrap();
            let res = sync_schema::migrate_to_v2(&pool, &path).await;
            assert!(res.is_err(), "unbekannte Spalte darf nicht stillschweigend verworfen werden");
            assert!(columns(&pool, "categories").await.contains(&"icon".to_string()));
            assert!(!columns(&pool, "classes").await.contains(&"uuid".to_string()));
            pool.close().await;
        }
    }

    mod sync_v2_stamping {
        use super::*;

        fn within_2s(ts: chrono::DateTime<chrono::Utc>, expected: chrono::DateTime<chrono::Utc>) {
            let diff = (ts - expected).num_milliseconds().abs();
            assert!(diff <= 2000, "{} vs {} ({} ms)", ts, expected, diff);
        }

        #[tokio::test]
        async fn test_create_stamps_uuid_time_and_device() {
            let (db, _dir) = create_test_db().await;
            db.clock.set_offset_ms(3_600_000);
            let device = db.crypto.get_device_id();

            let class = db.create_class("5a".into(), "2025/26".into()).await.unwrap();
            let student = db
                .create_student(class.id, "Max".into(), "Muster".into(), None)
                .await
                .unwrap();
            let category = db
                .create_category("Neu".into(), "#000".into(), "#111".into(), "#222".into())
                .await
                .unwrap();
            let obs = db
                .create_observation(student.id, 1, "Sozial".into(), "Text".into(), vec![])
                .await
                .unwrap();

            let stamps = [
                (class.uuid, class.modified_by_device, class.created_at, class.updated_at),
                (student.uuid, student.modified_by_device, student.created_at, student.updated_at),
                (category.uuid, category.modified_by_device, category.created_at, category.updated_at),
                (obs.uuid, obs.modified_by_device, obs.created_at, obs.updated_at),
            ];
            for (uuid, modified_by, created, updated) in stamps {
                assert!(uuid::Uuid::parse_str(&uuid).is_ok(), "uuid {}", uuid);
                assert_eq!(modified_by, device);
                within_2s(created, db.now());
                within_2s(updated, db.now());
            }
            assert!(db.now() > chrono::Utc::now() + chrono::Duration::minutes(59));
        }

        #[tokio::test]
        async fn test_update_observation_uses_clock() {
            let (db, _dir) = create_test_db().await;
            let obs = create_test_observation(&db).await;
            db.clock.set_offset_ms(3_600_000);
            let updated = db
                .update_observation(obs.id, "social".into(), "Neu".into(), vec![])
                .await
                .unwrap();
            within_2s(updated.updated_at, db.now());
            assert_eq!(updated.uuid, obs.uuid);
            assert_eq!(updated.modified_by_device, db.crypto.get_device_id());
        }

        #[tokio::test]
        async fn test_other_writes_use_clock_and_device() {
            let (db, _dir) = create_test_db().await;
            let class = db.create_class("5a".into(), "x".into()).await.unwrap();
            let student = db
                .create_student(class.id, "A".into(), "B".into(), None)
                .await
                .unwrap();
            let cat = db.get_categories().await.unwrap().remove(0);
            db.clock.set_offset_ms(3_600_000);
            sqlx::query("UPDATE students SET modified_by_device = 'fremd'")
                .execute(&db.pool)
                .await
                .unwrap();
            sqlx::query("UPDATE categories SET modified_by_device = 'fremd'")
                .execute(&db.pool)
                .await
                .unwrap();

            db.update_category(cat.id, "Sozial2".into(), "#1".into(), "#2".into(), "#3".into())
                .await
                .unwrap();
            db.delete_student(student.id, false).await.unwrap();

            let device = db.crypto.get_device_id();
            let row: (String, String) =
                sqlx::query_as("SELECT updated_at, modified_by_device FROM categories WHERE id = ?")
                    .bind(cat.id)
                    .fetch_one(&db.pool)
                    .await
                    .unwrap();
            within_2s(crate::sync_time::parse_ts(&row.0).unwrap(), db.now());
            assert_eq!(row.1, device);
            let row: (String, String) =
                sqlx::query_as("SELECT updated_at, modified_by_device FROM students WHERE id = ?")
                    .bind(student.id)
                    .fetch_one(&db.pool)
                    .await
                    .unwrap();
            within_2s(crate::sync_time::parse_ts(&row.0).unwrap(), db.now());
            assert_eq!(row.1, device);
        }

        #[tokio::test]
        async fn test_seeded_categories_use_clock() {
            let (db, _dir) = create_test_db().await;
            let cats = db.get_categories().await.unwrap();
            assert_eq!(cats.len(), 5);
            for c in cats {
                assert!(!c.uuid.is_empty());
                assert_eq!(c.modified_by_device, db.crypto.get_device_id());
                within_2s(c.created_at, db.now());
            }
        }

        #[tokio::test]
        async fn test_imports_stamp_uuid_and_device() {
            let (db, _dir) = create_test_db().await;
            let backup = serde_json::json!({
                "data": {
                    "classes": [{"id": 7, "name": "7a", "school_year": "x",
                        "created_at": "2025-01-01T08:00:00.000Z", "updated_at": "2025-01-01T08:00:00.000Z",
                        "source_device_id": "laptop-A"}],
                    "students": [{"id": 8, "class_id": 7, "first_name": "A", "last_name": "B", "status": "active",
                        "created_at": "2025-01-01T08:00:00.000Z", "updated_at": "2025-01-01T08:00:00.000Z",
                        "source_device_id": "laptop-A"}],
                    "observations": [{"id": 9, "student_id": 8, "author_id": 1, "category": "Sozial", "text": "t", "tags": "[]",
                        "created_at": "2025-01-01T08:00:00.000Z", "updated_at": "2025-01-01T08:00:00.000Z",
                        "source_device_id": "laptop-A", "uuid": "11111111-1111-4111-8111-111111111111",
                        "modified_by_device": "laptop-B"}],
                    "categories": [{"id": 1, "name": "Importiert", "color": "#1", "background_color": "#2",
                        "text_color": "#3", "is_active": true, "sort_order": 9,
                        "created_at": "2025-01-01T08:00:00.000Z", "updated_at": "2025-01-01T08:00:00.000Z",
                        "source_device_id": "laptop-A"}]
                }
            });
            import_file(&db, backup.to_string().as_bytes()).await.unwrap();

            // Importierte Zeilen bekommen lokale IDs; Identität ist die UUID.
            let obs: (String, String) = sqlx::query_as(
                "SELECT uuid, modified_by_device FROM observations WHERE uuid = '11111111-1111-4111-8111-111111111111'",
            )
            .fetch_one(&db.pool)
            .await
            .unwrap();
            assert_eq!(obs.1, "laptop-B");
            let classes = db.get_classes().await.unwrap();
            let class = classes.iter().find(|c| c.name == "7a").unwrap();
            assert_eq!(
                class.uuid,
                derived_uuid("classes", "laptop-A", 7, "2025-01-01T08:00:00.000Z")
            );
            assert_eq!(class.modified_by_device, "laptop-A");
            let students = db.get_students().await.unwrap();
            assert!(!students[0].uuid.is_empty());
            let cats = db.get_categories().await.unwrap();
            let imported = cats.iter().find(|c| c.name == "Importiert").unwrap();
            assert_eq!(
                imported.uuid,
                derived_uuid("categories", "laptop-A", 1, "2025-01-01T08:00:00.000Z")
            );
            assert_eq!(imported.modified_by_device, "laptop-A");
            let missing: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM categories WHERE uuid IS NULL OR uuid = '' OR modified_by_device = ''",
            )
            .fetch_one(&db.pool)
            .await
            .unwrap();
            assert_eq!(missing, 0);
        }

        async fn assess(db: &Database) -> usize {
            db.get_assessments_comprehensive(
                50,
                0,
                "observation_created_at".into(),
                "desc".into(),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap()
            .len()
        }

        #[tokio::test]
        async fn test_reads_hide_tombstones() {
            let (db, _dir) = create_test_db().await;
            let obs = create_test_observation(&db).await;
            let class2 = db.create_class("6b".into(), "x".into()).await.unwrap();
            let student2 = db
                .create_student(class2.id, "C".into(), "D".into(), None)
                .await
                .unwrap();
            let obs2 = db
                .create_observation(student2.id, 1, "Sozial".into(), "zwei".into(), vec![])
                .await
                .unwrap();
            let cat_count = db.get_categories().await.unwrap().len();
            let tomb = "2026-01-01T00:00:00.000Z";

            let ts = chrono::Utc::now() - chrono::Duration::days(1);
            let end = chrono::Utc::now() + chrono::Duration::days(1);
            assert_eq!(assess(&db).await, 2);

            // Beobachtung 1 hat Löschvermerk
            sqlx::query("UPDATE observations SET deleted_at = ? WHERE id = ?")
                .bind(tomb)
                .bind(obs.id)
                .execute(&db.pool)
                .await
                .unwrap();
            assert!(db.get_observation(obs.id).await.unwrap().is_none());
            assert_eq!(db.search_observations(None, None, None).await.unwrap().len(), 1);
            assert_eq!(db.get_observations_since(ts).await.unwrap().len(), 1);
            assert_eq!(
                db.get_calendar_observations(ts, end, None, None).await.unwrap().len(),
                1
            );
            assert_eq!(assess(&db).await, 1);
            let stats = db.get_students_with_stats().await.unwrap();
            assert_eq!(stats.iter().map(|s| s.observation_count).sum::<i64>(), 1);

            // Schüler 2 hat Löschvermerk -> auch seine Beobachtung verschwindet
            sqlx::query("UPDATE students SET deleted_at = ? WHERE id = ?")
                .bind(tomb)
                .bind(student2.id)
                .execute(&db.pool)
                .await
                .unwrap();
            assert_eq!(db.get_students().await.unwrap().len(), 1);
            assert_eq!(db.get_all_students_including_deleted().await.unwrap().len(), 1);
            assert_eq!(db.get_students_with_stats().await.unwrap().len(), 1);
            assert_eq!(assess(&db).await, 0);
            assert_eq!(
                db.get_calendar_observations(ts, end, None, None).await.unwrap().len(),
                0
            );
            let _ = obs2;

            // Klasse 2 mit Löschvermerk
            sqlx::query("UPDATE classes SET deleted_at = ? WHERE id = ?")
                .bind(tomb)
                .bind(class2.id)
                .execute(&db.pool)
                .await
                .unwrap();
            assert_eq!(db.get_classes().await.unwrap().len(), 1);

            // Kategorie mit Löschvermerk
            sqlx::query("UPDATE categories SET deleted_at = ? WHERE name = 'Sozial'")
                .bind(tomb)
                .execute(&db.pool)
                .await
                .unwrap();
            assert_eq!(db.get_categories().await.unwrap().len(), cat_count - 1);
        }

        #[tokio::test]
        async fn test_startup_backfills_missing_uuids() {
            let dir = TempDir::new().unwrap();
            let path = dir.path().join("test.db");
            let crypto = Arc::new(CryptoManager::new().unwrap());
            {
                let db = Database::new(&path, crypto.clone()).await.unwrap();
                sqlx::query("INSERT INTO classes (id, name, school_year, created_at, updated_at, source_device_id) VALUES (4, '4a', 'x', '2025-03-01 10:00:00', '2025-03-01 10:00:00', 'dev-X')")
                    .execute(&db.pool).await.unwrap();
                sqlx::query("INSERT INTO students (id, class_id, first_name, last_name, status, created_at, updated_at, source_device_id, uuid) VALUES (5, 4, 'A', 'B', 'active', '2025-03-01 10:00:00', '2025-03-01 10:00:00', 'dev-X', '')")
                    .execute(&db.pool).await.unwrap();
                sqlx::query("INSERT INTO observations (id, student_id, author_id, category, text, tags, created_at, updated_at, source_device_id) VALUES (6, 5, 1, 'Sozial', 't', '[]', '2025-03-01 10:00:00', '2025-03-01 10:00:00', 'dev-X')")
                    .execute(&db.pool).await.unwrap();
                sqlx::query("UPDATE categories SET uuid = NULL WHERE name = 'Sozial'")
                    .execute(&db.pool).await.unwrap();
                db.pool.close().await;
            }
            let db = Database::new(&path, crypto.clone()).await.unwrap();
            let u: String = sqlx::query_scalar("SELECT uuid FROM classes WHERE id = 4")
                .fetch_one(&db.pool).await.unwrap();
            assert_eq!(u, derived_uuid("classes", "dev-X", 4, "2025-03-01 10:00:00"));
            let u: String = sqlx::query_scalar("SELECT uuid FROM observations WHERE id = 6")
                .fetch_one(&db.pool).await.unwrap();
            assert_eq!(u, derived_uuid("observations", "dev-X", 6, "2025-03-01 10:00:00"));
            let missing: i64 = sqlx::query_scalar(
                "SELECT (SELECT COUNT(*) FROM classes WHERE uuid IS NULL OR uuid = '') + (SELECT COUNT(*) FROM students WHERE uuid IS NULL OR uuid = '') + (SELECT COUNT(*) FROM categories WHERE uuid IS NULL OR uuid = '') + (SELECT COUNT(*) FROM observations WHERE uuid IS NULL OR uuid = '')",
            ).fetch_one(&db.pool).await.unwrap();
            assert_eq!(missing, 0);
            let before: Vec<(i64, String)> = sqlx::query_as("SELECT id, uuid FROM categories ORDER BY id")
                .fetch_all(&db.pool).await.unwrap();
            db.pool.close().await;
            // idempotent
            let db = Database::new(&path, crypto).await.unwrap();
            let after: Vec<(i64, String)> = sqlx::query_as("SELECT id, uuid FROM categories ORDER BY id")
                .fetch_all(&db.pool).await.unwrap();
            assert_eq!(before, after);
        }

        #[tokio::test]
        async fn test_category_import_ignores_tombstones_and_keeps_inactive_stamps() {
            let (db, _dir) = create_test_db().await;
            let tomb = "2026-01-01T00:00:00.000Z";
            sqlx::query("UPDATE categories SET deleted_at = ? WHERE name = 'Sozial'")
                .bind(tomb).execute(&db.pool).await.unwrap();
            sqlx::query("UPDATE categories SET is_active = 0 WHERE name = 'Fachlich'")
                .execute(&db.pool).await.unwrap();
            let stamp = |n: &str| {
                let n = n.to_string();
                let pool = db.pool.clone();
                async move {
                    sqlx::query_as::<_, (String,)>("SELECT CAST(updated_at AS TEXT) FROM categories WHERE name = ? ORDER BY id")
                        .bind(n).fetch_all(&pool).await.unwrap()
                }
            };
            let tomb_before = stamp("Sozial").await;
            let inactive_before = stamp("Fachlich").await;
            let data = vec![serde_json::json!({"id": 1, "name": "Sozial", "color": "#1", "background_color": "#2",
                "text_color": "#3", "is_active": true, "sort_order": 1,
                "created_at": "2025-01-01T08:00:00.000Z", "updated_at": "2025-01-01T08:00:00.000Z",
                "source_device_id": "x"})];
            let n = db.import_categories_with_merge(&data).await.unwrap();
            assert_eq!(n, 1);
            let visible = db.get_categories().await.unwrap();
            assert_eq!(visible.iter().filter(|c| c.name == "Sozial").count(), 1);
            let tomb_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE name = 'Sozial' AND deleted_at = ?")
                .bind(tomb).fetch_one(&db.pool).await.unwrap();
            assert_eq!(tomb_rows, 1);
            assert_eq!(stamp("Sozial").await[0], tomb_before[0]);
            assert_eq!(stamp("Fachlich").await, inactive_before);
        }

        #[tokio::test]
        async fn test_mixed_timestamp_formats_order_and_compare() {
            let (db, _dir) = create_test_db().await;
            let obs = create_test_observation(&db).await;
            let obs2 = db
                .create_observation(obs.student_id, 1, "Sozial".into(), "zwei".into(), vec![])
                .await
                .unwrap();
            // Alt-Format 10:00 (spaeter) vs. neues Format 09:00 (frueher), gleicher Tag.
            // Als Text sortiert 'T' nach ' ' -> falsche Reihenfolge ohne Normalisierung.
            sqlx::query("UPDATE observations SET created_at = '2026-03-01 10:00:00', updated_at = '2026-03-01 10:00:00' WHERE id = ?")
                .bind(obs.id).execute(&db.pool).await.unwrap();
            sqlx::query("UPDATE observations SET created_at = '2026-03-01T09:00:00.000Z', updated_at = '2026-03-01T09:00:00.000Z' WHERE id = ?")
                .bind(obs2.id).execute(&db.pool).await.unwrap();
            let all = db.search_observations(None, None, None).await.unwrap();
            assert_eq!(all[0].id, obs.id);
            assert_eq!(all[1].id, obs2.id);
            let cutoff = crate::sync_time::parse_ts("2026-03-01T09:30:00.000Z").unwrap();
            let since = db.get_observations_since(cutoff).await.unwrap();
            assert_eq!(since.len(), 1);
            assert_eq!(since[0].id, obs.id);
            assert!(db.has_changes_since(cutoff).await.unwrap());
            // Alle Zeilen auf den 1. Maerz setzen; Grenze nach dem Alt-Format-Eintrag (10:00)
            for t in ["classes", "students", "categories", "observations"] {
                sqlx::query(&format!("UPDATE {} SET updated_at = '2026-03-01 10:00:00'", t))
                    .execute(&db.pool).await.unwrap();
            }
            let after = crate::sync_time::parse_ts("2026-03-01T10:30:00.000Z").unwrap();
            assert!(!db.has_changes_since(after).await.unwrap());
            let before = crate::sync_time::parse_ts("2026-03-01T09:59:00.000Z").unwrap();
            assert!(db.has_changes_since(before).await.unwrap());
        }
    }
}
