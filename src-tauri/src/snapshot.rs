//! Gesamtstand-Datei (Snapshot, `snapshot_v2`): vollständiger Stand eines Geräts inkl.
//! Löschvermerken. Verweise zwischen Zeilen laufen über UUIDs, nicht über lokale Integer-IDs.

use crate::database::Database;
use crate::sync_time::format_ts;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SNAPSHOT_FORMAT: &str = "snapshot_v2";
pub const SNAPSHOT_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CategoryRec {
    pub uuid: String,
    pub name: String,
    pub color: String,
    pub background_color: String,
    pub text_color: String,
    pub is_active: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub modified_by_device: String,
    pub source_device_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClassRec {
    pub uuid: String,
    pub name: String,
    pub school_year: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub modified_by_device: String,
    pub source_device_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StudentRec {
    pub uuid: String,
    pub class_uuid: String,
    pub first_name: String,
    pub last_name: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub modified_by_device: String,
    pub source_device_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObservationRec {
    pub uuid: String,
    pub student_uuid: String,
    /// Kategorie über ihren Namen.
    pub category: String,
    pub text: String,
    /// Tags als JSON-Text (wie in der Datenbank).
    pub tags: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub modified_by_device: String,
    pub source_device_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SnapshotRows {
    pub categories: Vec<CategoryRec>,
    pub classes: Vec<ClassRec>,
    pub students: Vec<StudentRec>,
    pub observations: Vec<ObservationRec>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Snapshot {
    pub format: String,
    pub schema_version: u32,
    pub device_id: String,
    pub device_role: Option<String>,
    pub device_name: Option<String>,
    pub generated_at: String,
    pub rows: SnapshotRows,
}

pub async fn build_snapshot(
    db: &Database,
    device_role: Option<String>,
    device_name: Option<String>,
) -> Result<Snapshot> {
    Ok(Snapshot {
        format: SNAPSHOT_FORMAT.to_string(),
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        device_id: db.get_device_id(),
        device_role,
        device_name,
        generated_at: format_ts(db.now()),
        rows: db.all_rows_for_snapshot().await?,
    })
}

fn checksum(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Hülle `{"checksum": sha256(data_json), "data": <Snapshot>}` wie bei den Änderungsdateien.
/// Datensätze werden nach UUID sortiert, damit identischer Stand byteweise identisch
/// kodiert wird (Grundlage für "nur hochladen, wenn geändert").
pub fn encode(s: &Snapshot) -> Vec<u8> {
    let mut s = s.clone();
    s.rows.categories.sort_by(|a, b| a.uuid.cmp(&b.uuid));
    s.rows.classes.sort_by(|a, b| a.uuid.cmp(&b.uuid));
    s.rows.students.sort_by(|a, b| a.uuid.cmp(&b.uuid));
    s.rows.observations.sort_by(|a, b| a.uuid.cmp(&b.uuid));
    let data = serde_json::to_value(&s).expect("Snapshot ist serialisierbar");
    let envelope = serde_json::json!({
        "checksum": checksum(&data.to_string()),
        "data": data,
    });
    envelope.to_string().into_bytes()
}

pub fn decode(bytes: &[u8]) -> Result<Snapshot> {
    let parsed: serde_json::Value =
        serde_json::from_slice(bytes).context("Gesamtstand-Datei ist kein gültiges JSON")?;
    let stored = parsed
        .get("checksum")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Gesamtstand-Datei: Prüfsumme fehlt"))?;
    let data = parsed
        .get("data")
        .ok_or_else(|| anyhow!("Gesamtstand-Datei: Daten fehlen"))?;
    if checksum(&data.to_string()) != stored {
        return Err(anyhow!("Gesamtstand-Datei: Prüfsumme stimmt nicht überein"));
    }
    let format = data.get("format").and_then(|v| v.as_str()).unwrap_or("");
    if format != SNAPSHOT_FORMAT {
        return Err(anyhow!(
            "Gesamtstand-Datei: unbekanntes Format '{}', erwartet '{}'",
            format,
            SNAPSHOT_FORMAT
        ));
    }
    serde_json::from_value(data.clone()).context("Gesamtstand-Datei: ungültiger Inhalt")
}

/// (aktive Schüler, aktive Beobachtungen), also ohne Löschvermerk.
pub fn counts(s: &Snapshot) -> (usize, usize) {
    (
        s.rows.students.iter().filter(|r| r.deleted_at.is_none()).count(),
        s.rows
            .observations
            .iter()
            .filter(|r| r.deleted_at.is_none())
            .count(),
    )
}

pub fn snapshot_file_name(device_id: &str) -> String {
    format!("snapshot_{device_id}.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::CryptoManager;
    use std::sync::Arc;
    use tempfile::TempDir;

    async fn test_db() -> (Database, TempDir) {
        let dir = TempDir::new().unwrap();
        let crypto = Arc::new(CryptoManager::new().unwrap());
        let db = Database::new(dir.path().join("t.db"), crypto).await.unwrap();
        (db, dir)
    }

    /// Befüllt Klasse, Schüler, Beobachtung; liefert (class, student).
    async fn seed(db: &Database) -> (crate::Class, crate::Student) {
        let class = db.create_class("5a".into(), "2025/26".into()).await.unwrap();
        let student = db
            .create_student(class.id, "Max".into(), "Muster".into(), None)
            .await
            .unwrap();
        let cat = db
            .get_categories()
            .await
            .unwrap()
            .into_iter()
            .next()
            .map(|c| c.name)
            .unwrap_or_else(|| "Sozialverhalten".into());
        db.create_observation(student.id, 1, cat, "Text".into(), vec!["a".into()])
            .await
            .unwrap();
        (class, student)
    }

    #[tokio::test]
    async fn test_snapshot_roundtrip() {
        let (db, _d) = test_db().await;
        seed(&db).await;
        let snap = build_snapshot(&db, Some("computer".into()), Some("PC".into()))
            .await
            .unwrap();
        assert_eq!(snap.format, "snapshot_v2");
        assert_eq!(snap.schema_version, 2);
        let decoded = decode(&encode(&snap)).unwrap();
        // encode sortiert; Vergleich daher gegen erneut kodierte/dekodierte Form
        assert_eq!(decode(&encode(&decoded)).unwrap(), decoded);
        assert_eq!(decoded.device_id, snap.device_id);
        assert_eq!(decoded.device_role.as_deref(), Some("computer"));
        assert_eq!(decoded.rows.students.len(), 1);
        assert_eq!(decoded.rows.observations.len(), 1);
        assert_eq!(counts(&decoded), (1, 1));
    }

    #[tokio::test]
    async fn test_snapshot_includes_tombstones() {
        let (db, dir) = test_db().await;
        let (_c, student) = seed(&db).await;
        // Löschvermerk direkt setzen (eigene Verbindung auf dieselbe Datei)
        let pool = sqlx::SqlitePool::connect(&format!(
            "sqlite:{}?mode=rw",
            dir.path().join("t.db").display()
        ))
        .await
        .unwrap();
        sqlx::query("UPDATE students SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?")
            .bind(student.id)
            .execute(&pool)
            .await
            .unwrap();
        let snap = build_snapshot(&db, None, None).await.unwrap();
        assert_eq!(snap.rows.students.len(), 1);
        assert_eq!(
            snap.rows.students[0].deleted_at.as_deref(),
            Some("2026-01-01T00:00:00.000Z")
        );
        assert_eq!(counts(&snap).0, 0);
    }

    #[tokio::test]
    async fn test_snapshot_rejects_bad_checksum() {
        let (db, _d) = test_db().await;
        seed(&db).await;
        let snap = build_snapshot(&db, None, None).await.unwrap();
        let mut v: serde_json::Value = serde_json::from_slice(&encode(&snap)).unwrap();
        v["data"]["device_id"] = serde_json::json!("manipuliert");
        let err = decode(v.to_string().as_bytes()).unwrap_err();
        assert!(err.to_string().contains("Prüfsumme"), "{err}");
    }

    #[tokio::test]
    async fn test_snapshot_rejects_legacy_changeset() {
        // Alte Änderungsdatei mit gültiger Prüfsumme, aber anderem Format
        let data = serde_json::json!({
            "format": "changeset_file_v1",
            "version": "1.0",
            "device_id": "alt",
            "changes": { "observations": [] }
        });
        let legacy = serde_json::json!({ "checksum": checksum(&data.to_string()), "data": data })
            .to_string();
        let err = decode(legacy.as_bytes()).unwrap_err();
        assert!(err.to_string().contains("Format"), "{err}");
    }

    #[tokio::test]
    async fn test_snapshot_references_by_uuid() {
        let (db, _d) = test_db().await;
        let (class, student) = seed(&db).await;
        let snap = build_snapshot(&db, None, None).await.unwrap();
        assert!(!class.uuid.is_empty());
        assert_eq!(snap.rows.students[0].class_uuid, class.uuid);
        assert_eq!(snap.rows.observations[0].student_uuid, student.uuid);
        let json = String::from_utf8(encode(&snap)).unwrap();
        assert!(!json.contains("\"class_id\"") && !json.contains("\"student_id\""));
    }

    #[tokio::test]
    async fn test_snapshot_encoding_is_deterministic() {
        let (db, _d) = test_db().await;
        seed(&db).await;
        db.create_class("6b".into(), "2025/26".into()).await.unwrap();
        let mut a = build_snapshot(&db, None, None).await.unwrap();
        let mut b = a.clone();
        a.rows.classes.reverse();
        b.rows.classes.sort_by(|x, y| x.uuid.cmp(&y.uuid));
        assert_eq!(encode(&a), encode(&b));
        assert_eq!(encode(&a), encode(&a.clone()));
    }

    #[test]
    fn test_snapshot_file_name() {
        assert_eq!(snapshot_file_name("abc"), "snapshot_abc.json");
    }
}
