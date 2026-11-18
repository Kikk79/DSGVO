//! Schema-Umstellung auf Sync v2 (Spezifikation 5.1, 5.2, 5.6, 5.7; ISA A10).
//!
//! - Sicherungskopie `<db>.vor-sync-v2-<YYYYMMDD-HHMMSS>.bak` per `VACUUM INTO`, bevor irgendetwas
//!   geändert wird (entfällt bei leerer Datenbank). Schlägt sie fehl, wird nichts geändert.
//! - Alle Änderungen in **einer** Transaktion: Spalten `uuid`, `deleted_at`, `modified_by_device`
//!   in `classes`, `students`, `categories`, `observations`; abgeleitete UUIDv5 für jede
//!   vorhandene Zeile; `categories` ohne `UNIQUE(name)`, dafür partieller Index auf aktive Namen;
//!   neue Spalten in `sync_config`; `schema_meta.sync_schema_version = "2"`.
//! - Wiederholbar: Version 2 bereits eingetragen → `AlreadyCurrent`, keine Sicherung.
use crate::sync_time::{format_ts, parse_ts};
use anyhow::{anyhow, bail, Context, Result};
use sqlx::{Connection, Pool, Sqlite, SqliteConnection};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const SYNC_SCHEMA_VERSION: &str = "2";

/// Fester Namensraum für abgeleitete UUIDs. Darf sich nie ändern, sonst bekämen
/// dieselben Zeilen auf zwei Geräten unterschiedliche UUIDs.
const DERIVED_UUID_NAMESPACE: Uuid = Uuid::from_u128(0x5c1e_6a2b_9d7f_4e31_8b0a_d5e4_c3b2_a190);

/// Abgeglichene Tabellen, in der Reihenfolge ohne Abhängigkeitsprobleme.
const SYNCED_TABLES: [&str; 4] = ["classes", "students", "categories", "observations"];

/// Spalten, die die bisherige `categories`-Tabelle haben darf. Jede andere Spalte würde beim
/// Neuaufbau verloren gehen → Umstellung bricht dann lieber ab.
const CATEGORY_COLUMNS: [&str; 13] = [
    "id",
    "name",
    "color",
    "background_color",
    "text_color",
    "is_active",
    "sort_order",
    "created_at",
    "updated_at",
    "source_device_id",
    "uuid",
    "deleted_at",
    "modified_by_device",
];

const CATEGORIES_V2_DDL: &str = r#"
    CREATE TABLE categories_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3B82F6',
        background_color TEXT NOT NULL DEFAULT '#EBF8FF',
        text_color TEXT NOT NULL DEFAULT '#1E3A8A',
        is_active BOOLEAN NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_device_id TEXT NOT NULL DEFAULT '',
        uuid TEXT,
        deleted_at TEXT NULL,
        modified_by_device TEXT NOT NULL DEFAULT ''
    )
"#;

/// Gleiche Definition wie in `Database::store_webdav_credentials` (dort lazy angelegt).
const SYNC_CONFIG_DDL: &str = r#"
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
"#;

const SYNC_CONFIG_NEW_COLUMNS: [(&str, &str); 5] = [
    ("device_role", "TEXT NULL"),
    ("first_sync_done", "INTEGER NOT NULL DEFAULT 0"),
    ("clock_offset_ms", "INTEGER NOT NULL DEFAULT 0"),
    ("last_upload_hash", "TEXT NULL"),
    ("remote_etags", "TEXT NOT NULL DEFAULT '{}'"),
];

const SYNCED_NEW_COLUMNS: [(&str, &str); 3] = [
    ("uuid", "TEXT"),
    ("deleted_at", "TEXT NULL"),
    ("modified_by_device", "TEXT NOT NULL DEFAULT ''"),
];

#[derive(Debug, PartialEq, Eq)]
pub enum MigrationOutcome {
    AlreadyCurrent,
    Migrated { backup_path: Option<PathBuf> },
}

/// UUIDv5 für eine bestehende Zeile. `created_at` wird vorher normalisiert
/// (`format_ts(parse_ts(..))`), damit `"YYYY-MM-DD HH:MM:SS"` und RFC 3339 desselben
/// Zeitpunkts dieselbe UUID ergeben. Nicht lesbare Zeitstempel gehen unverändert
/// (getrimmt) in den Namen ein – weiterhin deterministisch.
pub fn derived_uuid(table: &str, source_device_id: &str, id: i64, created_at: &str) -> String {
    let normalized = parse_ts(created_at)
        .map(format_ts)
        .unwrap_or_else(|_| created_at.trim().to_string());
    let name = format!("{}|{}|{}|{}", table, source_device_id, id, normalized);
    Uuid::new_v5(&DERIVED_UUID_NAMESPACE, name.as_bytes()).to_string()
}

pub async fn migrate_to_v2(pool: &Pool<Sqlite>, db_path: &Path) -> Result<MigrationOutcome> {
    if current_version(pool).await?.as_deref() == Some(SYNC_SCHEMA_VERSION) {
        return Ok(MigrationOutcome::AlreadyCurrent);
    }

    // Sicherung vor jeder Änderung (nicht bei leerer DB).
    let backup_path = if has_synced_rows(pool).await? {
        Some(write_backup(pool, db_path).await?)
    } else {
        None
    };

    // Eine einzelne Verbindung: `PRAGMA foreign_keys` gilt pro Verbindung und ist innerhalb
    // einer Transaktion wirkungslos, daher vor BEGIN aus- und nach COMMIT wieder einschalten.
    let mut conn = pool.acquire().await.context("Verbindung für Umstellung")?;
    sqlx::query("PRAGMA foreign_keys=OFF")
        .execute(&mut *conn)
        .await?;
    let result = migrate_in_transaction(&mut conn).await;
    let restored = sqlx::query("PRAGMA foreign_keys=ON")
        .execute(&mut *conn)
        .await;
    if restored.is_err() {
        // Verbindung nicht mit abgeschalteten Fremdschlüsseln in den Pool zurückgeben.
        drop(conn.detach());
    }
    result.context("Umstellung auf Sync-Schema v2 fehlgeschlagen")?;
    restored.context("PRAGMA foreign_keys=ON nach Umstellung")?;

    Ok(MigrationOutcome::Migrated { backup_path })
}

async fn current_version(pool: &Pool<Sqlite>) -> Result<Option<String>> {
    let has_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
    )
    .fetch_one(pool)
    .await?;
    if has_table == 0 {
        return Ok(None);
    }
    let v: Option<Option<String>> =
        sqlx::query_scalar("SELECT value FROM schema_meta WHERE key = 'sync_schema_version'")
            .fetch_optional(pool)
            .await?;
    Ok(v.flatten())
}

async fn has_synced_rows(pool: &Pool<Sqlite>) -> Result<bool> {
    for t in SYNCED_TABLES {
        let n: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", t))
            .fetch_one(pool)
            .await
            .with_context(|| format!("Tabelle {} fehlt vor der Umstellung", t))?;
        if n > 0 {
            return Ok(true);
        }
    }
    Ok(false)
}

/// `VACUUM INTO` liefert eine konsistente Kopie, auch mit WAL.
async fn write_backup(pool: &Pool<Sqlite>, db_path: &Path) -> Result<PathBuf> {
    write_labeled_backup(pool, db_path, "vor-sync-v2").await
}

/// Sicherungskopie `<db>.<label>-<YYYYMMDD-HHMMSS>.bak` neben der Datenbank (`VACUUM INTO`).
pub(crate) async fn write_labeled_backup(
    pool: &Pool<Sqlite>,
    db_path: &Path,
    label: &str,
) -> Result<PathBuf> {
    let file_name = db_path
        .file_name()
        .ok_or_else(|| anyhow!("Datenbankpfad ohne Dateinamen: {}", db_path.display()))?
        .to_string_lossy()
        .to_string();
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut backup = db_path.with_file_name(format!("{}.{}-{}.bak", file_name, label, stamp));
    let mut n = 1;
    while backup.exists() {
        backup = db_path.with_file_name(format!("{}.{}-{}-{}.bak", file_name, label, stamp, n));
        n += 1;
    }
    let target = backup
        .to_str()
        .ok_or_else(|| anyhow!("Sicherungspfad nicht als UTF-8 darstellbar"))?
        .to_string();

    sqlx::query("VACUUM INTO ?")
        .bind(&target)
        .execute(pool)
        .await
        .with_context(|| format!("Sicherungskopie {} konnte nicht geschrieben werden", target))?;

    let len = std::fs::metadata(&backup)
        .with_context(|| format!("Sicherungskopie {} fehlt", target))?
        .len();
    if len == 0 {
        bail!("Sicherungskopie {} ist leer", target);
    }
    println!("Sicherungskopie ({}): {}", label, target);
    Ok(backup)
}

/// Bezeichnungen der automatisch angelegten Sicherungskopien (siehe `write_labeled_backup`).
const SAFETY_BACKUP_LABELS: [&str; 2] = ["vor-sync-v2", "vor-erstabgleich"];

/// Eine automatisch angelegte Sicherungskopie neben der Datenbank.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SafetyBackup {
    pub path: String,
    pub size: u64,
    /// Erstellungszeit (ersatzweise letzte Änderung) als RFC 3339, falls bekannt.
    pub created: Option<String>,
}

/// Ist `name` eine Sicherungskopie der Datenbank `db_file_name`?
/// Nur `<db>.vor-sync-v2-….bak` und `<db>.vor-erstabgleich-….bak`; nie die Datenbank selbst.
pub(crate) fn is_safety_backup_name(name: &str, db_file_name: &str) -> bool {
    if name == db_file_name || !name.ends_with(".bak") {
        return false;
    }
    SAFETY_BACKUP_LABELS.iter().any(|label| {
        let prefix = format!("{}.{}-", db_file_name, label);
        name.len() > prefix.len() + ".bak".len() && name.starts_with(&prefix)
    })
}

/// Pfade aller Sicherungskopien im Ordner der Datenbank (nur reguläre Dateien), sortiert.
fn safety_backup_paths(db_path: &Path) -> Result<Vec<PathBuf>> {
    let db_file_name = db_path
        .file_name()
        .ok_or_else(|| anyhow!("Datenbankpfad ohne Dateinamen: {}", db_path.display()))?
        .to_string_lossy()
        .to_string();
    let dir = match db_path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let mut paths = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(paths),
        Err(e) => return Err(e).with_context(|| format!("Ordner {} lesen", dir.display())),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_safety_backup_name(&name, &db_file_name) {
            continue;
        }
        // Keine Ordner, keine symbolischen Verknüpfungen
        if entry.file_type()?.is_file() {
            paths.push(entry.path());
        }
    }
    paths.sort();
    Ok(paths)
}

/// Automatisch angelegte Sicherungskopien neben der Datenbank (Pfad, Größe, Zeitpunkt).
pub fn list_safety_backups(db_path: &Path) -> Result<Vec<SafetyBackup>> {
    safety_backup_paths(db_path)?
        .into_iter()
        .map(|path| {
            let meta = std::fs::metadata(&path)
                .with_context(|| format!("Datei {} lesen", path.display()))?;
            let created = meta
                .created()
                .or_else(|_| meta.modified())
                .ok()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());
            Ok(SafetyBackup {
                path: path.to_string_lossy().to_string(),
                size: meta.len(),
                created,
            })
        })
        .collect()
}

/// Löscht die automatisch angelegten Sicherungskopien (nur die beiden Namensmuster im Ordner
/// der Datenbank). Gibt die gelöschten Pfade zurück.
pub fn delete_safety_backups(db_path: &Path) -> Result<Vec<String>> {
    let mut deleted = Vec::new();
    for path in safety_backup_paths(db_path)? {
        std::fs::remove_file(&path)
            .with_context(|| format!("Sicherungskopie {} konnte nicht gelöscht werden", path.display()))?;
        deleted.push(path.to_string_lossy().to_string());
    }
    Ok(deleted)
}

async fn migrate_in_transaction(conn: &mut SqliteConnection) -> Result<()> {
    let mut tx = conn.begin().await?;

    // Bereits vorhandene Verstöße (z. B. aus Zeiten ohne Fremdschlüsselprüfung) dürfen die
    // Umstellung nicht verhindern; neue Verstöße schon.
    let fk_before = foreign_key_violations(&mut tx).await?;
    if !fk_before.is_empty() {
        println!(
            "Hinweis: {} vorhandene Fremdschlüssel-Verstöße vor der Umstellung (bleiben unverändert)",
            fk_before.len()
        );
    }

    // sync_config
    sqlx::query(SYNC_CONFIG_DDL).execute(&mut *tx).await?;
    for (col, ddl) in SYNC_CONFIG_NEW_COLUMNS {
        add_column_if_missing(&mut tx, "sync_config", col, ddl).await?;
    }
    sqlx::query(
        "INSERT INTO sync_config (id, webdav_url, webdav_username, webdav_password_encrypted)
         SELECT 1, '', '', X'' WHERE NOT EXISTS (SELECT 1 FROM sync_config WHERE id = 1)",
    )
    .execute(&mut *tx)
    .await?;

    // classes, students, observations: Spalten ergänzen
    for t in ["classes", "students", "observations"] {
        for (col, ddl) in SYNCED_NEW_COLUMNS {
            add_column_if_missing(&mut tx, t, col, ddl).await?;
        }
    }

    // categories: Neuaufbau ohne UNIQUE(name)
    rebuild_categories(&mut tx).await?;

    // UUIDs, modified_by_device, Indizes
    for t in SYNCED_TABLES {
        assign_derived_uuids(&mut tx, t).await?;
        sqlx::query(&format!(
            "UPDATE {} SET modified_by_device = source_device_id WHERE modified_by_device = ''",
            t
        ))
        .execute(&mut *tx)
        .await?;
        sqlx::query(&format!(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_{t}_uuid ON {t}(uuid)",
            t = t
        ))
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_active ON categories(name) WHERE deleted_at IS NULL",
    )
    .execute(&mut *tx)
    .await?;

    // Versionsvermerk
    sqlx::query("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)")
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('sync_schema_version', ?)",
    )
    .bind(SYNC_SCHEMA_VERSION)
    .execute(&mut *tx)
    .await?;

    let fk_after = foreign_key_violations(&mut tx).await?;
    let new_violations: Vec<_> = fk_after.difference(&fk_before).collect();
    if !new_violations.is_empty() {
        bail!(
            "Fremdschlüssel-Prüfung nach der Umstellung: neue Verstöße {:?}",
            new_violations
        );
    }

    tx.commit().await?;
    Ok(())
}

async fn table_columns(conn: &mut SqliteConnection, table: &str) -> Result<Vec<String>> {
    Ok(sqlx::query_scalar::<_, String>(&format!(
        "SELECT name FROM pragma_table_info('{}') ORDER BY cid",
        table
    ))
    .fetch_all(&mut *conn)
    .await?)
}

async fn add_column_if_missing(
    conn: &mut SqliteConnection,
    table: &str,
    column: &str,
    ddl: &str,
) -> Result<()> {
    if !table_columns(conn, table)
        .await?
        .iter()
        .any(|c| c == column)
    {
        sqlx::query(&format!(
            "ALTER TABLE {} ADD COLUMN {} {}",
            table, column, ddl
        ))
        .execute(&mut *conn)
        .await
        .with_context(|| format!("Spalte {}.{} anlegen", table, column))?;
    }
    Ok(())
}

async fn rebuild_categories(conn: &mut SqliteConnection) -> Result<()> {
    let old_cols = table_columns(conn, "categories").await?;
    if old_cols.is_empty() {
        bail!("Tabelle categories fehlt");
    }
    let unknown: Vec<&String> = old_cols
        .iter()
        .filter(|c| !CATEGORY_COLUMNS.contains(&c.as_str()))
        .collect();
    if !unknown.is_empty() {
        bail!(
            "categories hat unbekannte Spalten {:?}; Neuaufbau würde sie verwerfen",
            unknown
        );
    }
    // Eigene Indizes/Trigger würden beim DROP verloren gehen (die App legt keine an).
    let extras: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master
         WHERE tbl_name = 'categories' AND type IN ('index', 'trigger') AND sql IS NOT NULL
           AND name NOT IN ('idx_categories_uuid', 'idx_categories_name_active')",
    )
    .fetch_all(&mut *conn)
    .await?;
    if !extras.is_empty() {
        bail!(
            "categories hat unbekannte Indizes/Trigger {:?}; Neuaufbau abgebrochen",
            extras
        );
    }

    let old_seq: Option<i64> =
        sqlx::query_scalar("SELECT seq FROM sqlite_sequence WHERE name = 'categories'")
            .fetch_optional(&mut *conn)
            .await?;
    let old_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
        .fetch_one(&mut *conn)
        .await?;

    sqlx::query("DROP TABLE IF EXISTS categories_v2")
        .execute(&mut *conn)
        .await?;
    sqlx::query(CATEGORIES_V2_DDL).execute(&mut *conn).await?;
    let col_list = old_cols
        .iter()
        .map(|c| format!("\"{}\"", c))
        .collect::<Vec<_>>()
        .join(", ");
    sqlx::query(&format!(
        "INSERT INTO categories_v2 ({cols}) SELECT {cols} FROM categories",
        cols = col_list
    ))
    .execute(&mut *conn)
    .await?;
    let new_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories_v2")
        .fetch_one(&mut *conn)
        .await?;
    if new_count != old_count {
        bail!(
            "Kategorien-Neuaufbau: {} statt {} Zeilen",
            new_count,
            old_count
        );
    }
    sqlx::query("DROP TABLE categories")
        .execute(&mut *conn)
        .await?;
    sqlx::query("ALTER TABLE categories_v2 RENAME TO categories")
        .execute(&mut *conn)
        .await?;

    // AUTOINCREMENT-Zähler erhalten, damit IDs endgültig gelöschter Kategorien nicht neu
    // vergeben werden.
    if let Some(seq) = old_seq {
        let updated =
            sqlx::query("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'categories'")
                .bind(seq)
                .execute(&mut *conn)
                .await?
                .rows_affected();
        if updated == 0 {
            sqlx::query("INSERT INTO sqlite_sequence (name, seq) VALUES ('categories', ?)")
                .bind(seq)
                .execute(&mut *conn)
                .await?;
        }
    }
    Ok(())
}

async fn assign_derived_uuids(conn: &mut SqliteConnection, table: &str) -> Result<()> {
    let rows: Vec<(i64, Option<String>, Option<String>)> = sqlx::query_as(&format!(
        "SELECT id, source_device_id, CAST(created_at AS TEXT) FROM {} WHERE uuid IS NULL OR uuid = ''",
        table
    ))
    .fetch_all(&mut *conn)
    .await?;
    for (id, device, created_at) in rows {
        let u = derived_uuid(
            table,
            device.as_deref().unwrap_or(""),
            id,
            created_at.as_deref().unwrap_or(""),
        );
        sqlx::query(&format!("UPDATE {} SET uuid = ? WHERE id = ?", table))
            .bind(&u)
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

async fn foreign_key_violations(
    conn: &mut SqliteConnection,
) -> Result<HashSet<(String, Option<i64>, String)>> {
    let rows: Vec<(String, Option<i64>, String)> =
        sqlx::query_as("SELECT \"table\", rowid, parent FROM pragma_foreign_key_check")
            .fetch_all(&mut *conn)
            .await?;
    Ok(rows.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safety_backup_name_matches_only_the_two_patterns() {
        let db = "observations.db";
        assert!(is_safety_backup_name("observations.db.vor-sync-v2-20261117-101500.bak", db));
        assert!(is_safety_backup_name("observations.db.vor-sync-v2-20261117-101500-1.bak", db));
        assert!(is_safety_backup_name("observations.db.vor-erstabgleich-20261117-101500.bak", db));
        // nie die Datenbank selbst oder andere Dateien
        assert!(!is_safety_backup_name("observations.db", db));
        assert!(!is_safety_backup_name("observations.db-wal", db));
        assert!(!is_safety_backup_name("observations.db-shm", db));
        assert!(!is_safety_backup_name("audit.db", db));
        assert!(!is_safety_backup_name("observations.db.bak", db));
        assert!(!is_safety_backup_name("observations.db.vor-sync-v2-.bak", db));
        assert!(!is_safety_backup_name("observations.db.vor-sync-v2-20261117.db", db));
        assert!(!is_safety_backup_name("andere.db.vor-sync-v2-20261117-101500.bak", db));
        assert!(!is_safety_backup_name("observations.db.vor-update-20261117.bak", db));
        assert!(!is_safety_backup_name("sicherung.json", db));
    }

    #[test]
    fn delete_safety_backups_removes_only_matching_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = dir.path().join("observations.db");
        let keep = [
            "observations.db",
            "observations.db-wal",
            "audit.db",
            "config.json",
            "observations.db.bak",
            "andere.db.vor-erstabgleich-20261117-101500.bak",
        ];
        let remove = [
            "observations.db.vor-sync-v2-20261117-101500.bak",
            "observations.db.vor-erstabgleich-20261118-090000.bak",
        ];
        for name in keep.iter().chain(remove.iter()) {
            std::fs::write(dir.path().join(name), b"inhalt").unwrap();
        }
        // Ein Ordner mit passendem Namen bleibt unangetastet
        std::fs::create_dir(dir.path().join("observations.db.vor-sync-v2-ordner.bak")).unwrap();

        let listed = list_safety_backups(&db).unwrap();
        let names: Vec<String> = listed
            .iter()
            .map(|b| Path::new(&b.path).file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec![remove[1].to_string(), remove[0].to_string()]);
        assert!(listed.iter().all(|b| b.size == 6 && b.created.is_some()));

        let deleted = delete_safety_backups(&db).unwrap();
        assert_eq!(deleted.len(), 2);
        for name in keep {
            assert!(dir.path().join(name).exists(), "{} muss bleiben", name);
        }
        for name in remove {
            assert!(!dir.path().join(name).exists(), "{} muss weg sein", name);
        }
        assert!(dir.path().join("observations.db.vor-sync-v2-ordner.bak").is_dir());
        assert!(list_safety_backups(&db).unwrap().is_empty());
    }

    #[test]
    fn list_safety_backups_tolerates_missing_directory() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = dir.path().join("fehlt").join("observations.db");
        assert!(list_safety_backups(&db).unwrap().is_empty());
        assert!(delete_safety_backups(&db).unwrap().is_empty());
    }

    #[test]
    fn derived_uuid_is_v5_and_stable() {
        let a = derived_uuid("classes", "dev", 1, "2025-08-01 08:00:00");
        let u = Uuid::parse_str(&a).unwrap();
        assert_eq!(u.get_version_num(), 5);
        assert_eq!(a, derived_uuid("classes", "dev", 1, "2025-08-01 08:00:00"));
    }

    #[test]
    fn derived_uuid_differs_by_table_device_id_and_time() {
        let base = derived_uuid("classes", "dev", 1, "2025-08-01 08:00:00");
        assert_ne!(
            base,
            derived_uuid("students", "dev", 1, "2025-08-01 08:00:00")
        );
        assert_ne!(
            base,
            derived_uuid("classes", "dev2", 1, "2025-08-01 08:00:00")
        );
        assert_ne!(
            base,
            derived_uuid("classes", "dev", 2, "2025-08-01 08:00:00")
        );
        assert_ne!(
            base,
            derived_uuid("classes", "dev", 1, "2025-08-01 08:00:01")
        );
    }

    #[test]
    fn derived_uuid_normalizes_timestamp_formats() {
        let a = derived_uuid("observations", "d", 7, "2025-08-01 08:00:00");
        for other in [
            "2025-08-01T08:00:00Z",
            "2025-08-01T08:00:00.000Z",
            "2025-08-01T08:00:00+00:00",
            "2025-08-01T10:00:00+02:00",
            "2025-08-01 08:00:00+00:00",
            "2025-08-01 08:00:00.000",
            " 2025-08-01 08:00:00 ",
        ] {
            assert_eq!(a, derived_uuid("observations", "d", 7, other), "{}", other);
        }
    }

    #[test]
    fn derived_uuid_tolerates_unparseable_timestamp() {
        let a = derived_uuid("classes", "d", 1, "");
        assert_eq!(a, derived_uuid("classes", "d", 1, ""));
        assert_ne!(a, derived_uuid("classes", "d", 1, "kaputt"));
    }
}
