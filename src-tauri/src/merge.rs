//! Zusammenführen und Ersetzen einer Gesamtstand-Datei (Spezifikation 5.5, 5.6).
//!
//! Regeln pro Datensatz (über UUID), Reihenfolge Kategorien → Klassen → Schüler → Beobachtungen,
//! alles in **einer** Transaktion:
//! 1. Unbekannte UUID → einfügen (Löschvermerke ebenfalls).
//! 2. Lokal oder eingehend `deleted_at` gesetzt → Ergebnis ist ein inhaltsloser Löschvermerk,
//!    unabhängig von Zeitstempeln. Sind beide Löschvermerke, entscheidet Regel 3 nur über
//!    die Stempel (damit beide Geräte gleich enden).
//! 3. Sonst gewinnt das jüngere `max(updated_at, deleted_at)`, bei Gleichstand das größere
//!    `modified_by_device`; bei völliger Gleichheit nichts tun.
//! 4. Kaskade: Elternteil lokal Löschvermerk → Datensatz wird Löschvermerk. Zusätzlich werden
//!    am Ende lokale Kinder gelöschter Eltern zu Löschvermerken (Spezifikationsbeispiel
//!    "Schüler X").
//! 5. Verweis auf unbekannte Eltern-UUID → `Err`, alles zurückgerollt.
//! 6. Kategorie, deren Name lokal als aktive Kategorie existiert → zusammenlegen: behalten wird
//!    die kleinere UUID mit den Feldern der jüngeren Fassung. Die verdrängte UUID verschwindet
//!    lokal ohne Löschvermerk (sie ist zusammengelegt, nicht gelöscht).
//! 7. Pro übernommener Änderung ein Eintrag in `MergeReport::changes`; `log_merge_audit`
//!    schreibt daraus Audit-Einträge ohne Inhalte (das Audit-Log ist eine eigene Datenbank).
#![allow(dead_code)] // genutzt ab Task 7/9

use crate::audit::AuditLogger;
use crate::database::Database;
use crate::snapshot::{
    CategoryRec, ClassRec, ObservationRec, Snapshot, StudentRec, SNAPSHOT_FORMAT,
};
use crate::sync_time::{format_ts, parse_ts};
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Utc};
use sqlx::SqliteConnection;
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Insert,
    Update,
    Tombstone,
}

impl ChangeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ChangeKind::Insert => "insert",
            ChangeKind::Update => "update",
            ChangeKind::Tombstone => "tombstone",
        }
    }
}

/// Eine übernommene Änderung, ohne Inhalt: Objekt-Typ, lokale ID, Art.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeChange {
    pub object_type: &'static str,
    pub local_id: i64,
    pub kind: ChangeKind,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MergeReport {
    pub inserted: usize,
    pub updated: usize,
    pub tombstoned: usize,
    pub skipped: usize,
    /// Für das Audit-Log (siehe `log_merge_audit`).
    pub changes: Vec<MergeChange>,
}

impl MergeReport {
    fn record(&mut self, object_type: &'static str, local_id: i64, kind: ChangeKind) {
        match kind {
            ChangeKind::Insert => self.inserted += 1,
            ChangeKind::Update => self.updated += 1,
            ChangeKind::Tombstone => self.tombstoned += 1,
        }
        self.changes.push(MergeChange {
            object_type,
            local_id,
            kind,
        });
    }
}

/// Führt eine fremde Gesamtstand-Datei in die lokale Datenbank ein (eine Transaktion; bei
/// Fehler bleibt alles unverändert).
pub async fn merge_snapshot(db: &Database, snap: &Snapshot) -> Result<MergeReport> {
    check_format(snap)?;
    let ctx = Ctx {
        now: format_ts(db.now()),
        device: db.get_device_id(),
    };
    let mut tx = db.pool().begin().await?;
    let mut report = MergeReport::default();
    apply_all(&mut tx, snap, &ctx, &mut report).await?;
    tx.commit().await?;
    Ok(report)
}

/// Ersetzt den lokalen Stand vollständig durch die Gesamtstand-Datei (erster Abgleich des
/// Desktops). Einzige Stelle mit hartem Löschen; eine Transaktion.
pub async fn replace_with_snapshot(db: &Database, snap: &Snapshot) -> Result<MergeReport> {
    check_format(snap)?;
    let ctx = Ctx {
        now: format_ts(db.now()),
        device: db.get_device_id(),
    };
    let mut tx = db.pool().begin().await?;
    // `attachments` verweist per Fremdschlüssel auf Beobachtungen (Tabelle derzeit ungenutzt).
    for table in [
        "attachments",
        "observations",
        "students",
        "classes",
        "categories",
    ] {
        sqlx::query(&format!("DELETE FROM {}", table))
            .execute(&mut *tx)
            .await
            .with_context(|| format!("Tabelle {} leeren", table))?;
    }
    let mut report = MergeReport::default();
    apply_all(&mut tx, snap, &ctx, &mut report).await?;
    tx.commit().await?;
    Ok(report)
}

/// Schreibt pro übernommener Änderung einen Audit-Eintrag (Aktion `sync_merge`, Objekt-Typ,
/// lokale ID, Art) – ohne Inhalte. Aufruf nach erfolgreichem `merge_snapshot`/`replace_with_snapshot`.
pub async fn log_merge_audit(audit: &AuditLogger, report: &MergeReport) -> Result<()> {
    for c in &report.changes {
        // Details als JSON (das Audit-Log liest `details` als JSON); nur die Art, kein Inhalt.
        let details = serde_json::json!({ "kind": c.kind.as_str() }).to_string();
        audit
            .log_action("sync_merge", c.object_type, c.local_id, 1, Some(&details))
            .await?;
    }
    Ok(())
}

fn check_format(snap: &Snapshot) -> Result<()> {
    if snap.format != SNAPSHOT_FORMAT {
        bail!("Gesamtstand-Datei: unbekanntes Format '{}'", snap.format);
    }
    Ok(())
}

/// Serverzeit und Gerät für Löschvermerke, die dieses Gerät beim Zusammenführen erzeugt.
struct Ctx {
    now: String,
    device: String,
}

async fn apply_all(
    tx: &mut SqliteConnection,
    snap: &Snapshot,
    ctx: &Ctx,
    report: &mut MergeReport,
) -> Result<()> {
    merge_categories(tx, &snap.rows.categories, report).await?;
    merge_classes(tx, &snap.rows.classes, ctx, report).await?;
    merge_students(tx, &snap.rows.students, ctx, report).await?;
    merge_observations(tx, &snap.rows.observations, ctx, report).await?;
    cascade_local_children(tx, ctx, report).await?;
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Versionsvergleich

/// Maßgeblicher Zeitpunkt `max(updated_at, deleted_at)` und Gerät der letzten Änderung.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Stamp {
    at: DateTime<Utc>,
    device: String,
}

impl Stamp {
    /// Eingehende Zeitstempel müssen lesbar sein, sonst ist die Datei fehlerhaft.
    fn incoming(
        uuid: &str,
        updated_at: &str,
        deleted_at: Option<&str>,
        device: &str,
    ) -> Result<Self> {
        if uuid.trim().is_empty() {
            bail!("Gesamtstand-Datei: Datensatz ohne UUID");
        }
        let mut at = parse_ts(updated_at)
            .with_context(|| format!("Datensatz {}: updated_at unlesbar", uuid))?;
        if let Some(d) = deleted_at {
            at = at.max(
                parse_ts(d).with_context(|| format!("Datensatz {}: deleted_at unlesbar", uuid))?,
            );
        }
        Ok(Self {
            at,
            device: device.to_string(),
        })
    }

    /// Lokale, unlesbare Zeitstempel gelten als uralt (eingehende Fassung gewinnt dann).
    fn local(updated_at: Option<&str>, deleted_at: Option<&str>, device: &str) -> Self {
        let old = DateTime::<Utc>::MIN_UTC;
        let mut at = updated_at.and_then(|s| parse_ts(s).ok()).unwrap_or(old);
        if let Some(d) = deleted_at.and_then(|s| parse_ts(s).ok()) {
            at = at.max(d);
        }
        Self {
            at,
            device: device.to_string(),
        }
    }
}

fn newer(a: &Stamp, b: &Stamp) -> Ordering {
    a.at.cmp(&b.at).then_with(|| a.device.cmp(&b.device))
}

/// Lokale Kopfdaten eines Datensatzes.
#[derive(sqlx::FromRow)]
struct Meta {
    id: i64,
    updated_at: Option<String>,
    deleted_at: Option<String>,
    modified_by_device: String,
}

impl Meta {
    fn stamp(&self) -> Stamp {
        Stamp::local(
            self.updated_at.as_deref(),
            self.deleted_at.as_deref(),
            &self.modified_by_device,
        )
    }
}

async fn read_meta(tx: &mut SqliteConnection, table: &str, uuid: &str) -> Result<Option<Meta>> {
    Ok(sqlx::query_as::<_, Meta>(&format!(
        "SELECT id, CAST(updated_at AS TEXT) AS updated_at, deleted_at, modified_by_device FROM {} WHERE uuid = ?",
        table
    ))
    .bind(uuid)
    .fetch_optional(&mut *tx)
    .await?)
}

enum Action {
    Skip,
    /// Eingehende Fassung schreiben (Löschvermerk → Inhalt geleert).
    Write(ChangeKind),
    /// Eingehende Fassung als Löschvermerk dieses Geräts schreiben (Kaskade, Regel 4).
    Cascade(ChangeKind),
}

/// Regeln 1–4 für einen Datensatz.
fn decide(local: Option<&Meta>, inc: &Stamp, inc_deleted: bool, parent_deleted: bool) -> Action {
    match local {
        None if inc_deleted => Action::Write(ChangeKind::Insert),
        None if parent_deleted => Action::Cascade(ChangeKind::Insert),
        None => Action::Write(ChangeKind::Insert),
        Some(l) if l.deleted_at.is_some() => {
            // Löschvermerk bleibt; zwischen zwei Löschvermerken nur die Stempel angleichen.
            if inc_deleted && newer(inc, &l.stamp()) == Ordering::Greater {
                Action::Write(ChangeKind::Update)
            } else {
                Action::Skip
            }
        }
        Some(_) if inc_deleted => Action::Write(ChangeKind::Tombstone),
        Some(l) => {
            // Erst den Gewinner bestimmen; Kaskade nur, wenn die GEWINNENDE (eingehende) Fassung
            // auf ein gelöschtes Elternteil zeigt. Gewinnt die lokale Fassung, bleibt sie
            // (z. B. Schüler lokal in eine andere Klasse verschoben); lokale Kinder gelöschter
            // Eltern erfasst `cascade_local_children`.
            if newer(inc, &l.stamp()) != Ordering::Greater {
                Action::Skip
            } else if parent_deleted {
                Action::Cascade(ChangeKind::Tombstone)
            } else {
                Action::Write(ChangeKind::Update)
            }
        }
    }
}

/// Elternteil über UUID: (lokale ID, ist Löschvermerk). Unbekannt → Fehler (Regel 5).
async fn resolve_parent(
    tx: &mut SqliteConnection,
    table: &str,
    uuid: &str,
    child: &str,
) -> Result<(i64, bool)> {
    let row: Option<(i64, bool)> = sqlx::query_as(&format!(
        "SELECT id, deleted_at IS NOT NULL FROM {} WHERE uuid = ?",
        table
    ))
    .bind(uuid)
    .fetch_optional(&mut *tx)
    .await?;
    row.ok_or_else(|| {
        anyhow!(
            "Gesamtstand-Datei: Datensatz {} verweist auf unbekannten Eintrag {} in {}",
            child,
            uuid,
            table
        )
    })
}

// ---------------------------------------------------------------------------------------------
// Klassen, Schüler, Beobachtungen

fn wipe_class(r: &mut ClassRec) {
    r.name = String::new();
}
fn wipe_student(r: &mut StudentRec) {
    r.first_name = String::new();
    r.last_name = String::new();
}
fn wipe_observation(r: &mut ObservationRec) {
    r.text = String::new();
    r.tags = "[]".to_string();
}

/// Gemeinsame Schritte: Fassung bestimmen, die geschrieben wird (oder `None` = nichts tun).
macro_rules! prepared {
    ($action:expr, $rec:expr, $ctx:expr, $wipe:ident) => {{
        match $action {
            Action::Skip => None,
            Action::Write(kind) => {
                let mut r = $rec.clone();
                if r.deleted_at.is_some() {
                    $wipe(&mut r);
                }
                Some((kind, r))
            }
            Action::Cascade(kind) => {
                let mut r = $rec.clone();
                r.deleted_at = Some($ctx.now.clone());
                r.updated_at = $ctx.now.clone();
                r.modified_by_device = $ctx.device.clone();
                $wipe(&mut r);
                Some((kind, r))
            }
        }
    }};
}

async fn merge_classes(
    tx: &mut SqliteConnection,
    recs: &[ClassRec],
    ctx: &Ctx,
    report: &mut MergeReport,
) -> Result<()> {
    // Klassen haben kein Elternteil; Kaskade gibt es hier nicht.
    for rec in recs {
        let inc = Stamp::incoming(
            &rec.uuid,
            &rec.updated_at,
            rec.deleted_at.as_deref(),
            &rec.modified_by_device,
        )?;
        let local = read_meta(tx, "classes", &rec.uuid).await?;
        let action = decide(local.as_ref(), &inc, rec.deleted_at.is_some(), false);
        let Some((kind, r)) = prepared!(action, rec, ctx, wipe_class) else {
            report.skipped += 1;
            continue;
        };
        let id = match local {
            Some(l) => {
                sqlx::query(
                    "UPDATE classes SET name = ?, school_year = ?, created_at = ?, updated_at = ?, deleted_at = ?, \
                     modified_by_device = ?, source_device_id = ? WHERE id = ?",
                )
                .bind(&r.name)
                .bind(&r.school_year)
                .bind(&r.created_at)
                .bind(&r.updated_at)
                .bind(&r.deleted_at)
                .bind(&r.modified_by_device)
                .bind(&r.source_device_id)
                .bind(l.id)
                .execute(&mut *tx)
                .await?;
                l.id
            }
            None => sqlx::query(
                "INSERT INTO classes (uuid, name, school_year, created_at, updated_at, deleted_at, modified_by_device, source_device_id) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&r.uuid)
            .bind(&r.name)
            .bind(&r.school_year)
            .bind(&r.created_at)
            .bind(&r.updated_at)
            .bind(&r.deleted_at)
            .bind(&r.modified_by_device)
            .bind(&r.source_device_id)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid(),
        };
        report.record("class", id, kind);
    }
    Ok(())
}

async fn merge_students(
    tx: &mut SqliteConnection,
    recs: &[StudentRec],
    ctx: &Ctx,
    report: &mut MergeReport,
) -> Result<()> {
    for rec in recs {
        let inc = Stamp::incoming(
            &rec.uuid,
            &rec.updated_at,
            rec.deleted_at.as_deref(),
            &rec.modified_by_device,
        )?;
        let (class_id, class_deleted) =
            resolve_parent(tx, "classes", &rec.class_uuid, &rec.uuid).await?;
        let local = read_meta(tx, "students", &rec.uuid).await?;
        let action = decide(
            local.as_ref(),
            &inc,
            rec.deleted_at.is_some(),
            class_deleted,
        );
        let Some((kind, r)) = prepared!(action, rec, ctx, wipe_student) else {
            report.skipped += 1;
            continue;
        };
        let id = match local {
            Some(l) => {
                sqlx::query(
                    "UPDATE students SET class_id = ?, first_name = ?, last_name = ?, status = ?, created_at = ?, \
                     updated_at = ?, deleted_at = ?, modified_by_device = ?, source_device_id = ? WHERE id = ?",
                )
                .bind(class_id)
                .bind(&r.first_name)
                .bind(&r.last_name)
                .bind(&r.status)
                .bind(&r.created_at)
                .bind(&r.updated_at)
                .bind(&r.deleted_at)
                .bind(&r.modified_by_device)
                .bind(&r.source_device_id)
                .bind(l.id)
                .execute(&mut *tx)
                .await?;
                l.id
            }
            None => sqlx::query(
                "INSERT INTO students (uuid, class_id, first_name, last_name, status, created_at, updated_at, \
                 deleted_at, modified_by_device, source_device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&r.uuid)
            .bind(class_id)
            .bind(&r.first_name)
            .bind(&r.last_name)
            .bind(&r.status)
            .bind(&r.created_at)
            .bind(&r.updated_at)
            .bind(&r.deleted_at)
            .bind(&r.modified_by_device)
            .bind(&r.source_device_id)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid(),
        };
        report.record("student", id, kind);
    }
    Ok(())
}

async fn merge_observations(
    tx: &mut SqliteConnection,
    recs: &[ObservationRec],
    ctx: &Ctx,
    report: &mut MergeReport,
) -> Result<()> {
    for rec in recs {
        let inc = Stamp::incoming(
            &rec.uuid,
            &rec.updated_at,
            rec.deleted_at.as_deref(),
            &rec.modified_by_device,
        )?;
        let (student_id, student_deleted) =
            resolve_parent(tx, "students", &rec.student_uuid, &rec.uuid).await?;
        let local = read_meta(tx, "observations", &rec.uuid).await?;
        let action = decide(
            local.as_ref(),
            &inc,
            rec.deleted_at.is_some(),
            student_deleted,
        );
        let Some((kind, r)) = prepared!(action, rec, ctx, wipe_observation) else {
            report.skipped += 1;
            continue;
        };
        let id = match local {
            Some(l) => {
                sqlx::query(
                    "UPDATE observations SET student_id = ?, category = ?, text = ?, tags = ?, created_at = ?, \
                     updated_at = ?, deleted_at = ?, modified_by_device = ?, source_device_id = ? WHERE id = ?",
                )
                .bind(student_id)
                .bind(&r.category)
                .bind(&r.text)
                .bind(&r.tags)
                .bind(&r.created_at)
                .bind(&r.updated_at)
                .bind(&r.deleted_at)
                .bind(&r.modified_by_device)
                .bind(&r.source_device_id)
                .bind(l.id)
                .execute(&mut *tx)
                .await?;
                l.id
            }
            // author_id wird nicht abgeglichen (Einzelnutzer-App): immer 1.
            None => sqlx::query(
                "INSERT INTO observations (uuid, student_id, author_id, category, text, tags, created_at, updated_at, \
                 deleted_at, modified_by_device, source_device_id) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&r.uuid)
            .bind(student_id)
            .bind(&r.category)
            .bind(&r.text)
            .bind(&r.tags)
            .bind(&r.created_at)
            .bind(&r.updated_at)
            .bind(&r.deleted_at)
            .bind(&r.modified_by_device)
            .bind(&r.source_device_id)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid(),
        };
        report.record("observation", id, kind);
    }
    Ok(())
}

/// Kaskade für lokale Datensätze: Schüler gelöschter Klassen und Beobachtungen gelöschter
/// Schüler werden inhaltslose Löschvermerke (z. B. eine nur hier ergänzte Beobachtung zu
/// einem Schüler, der auf dem anderen Gerät gelöscht wurde).
async fn cascade_local_children(
    tx: &mut SqliteConnection,
    ctx: &Ctx,
    report: &mut MergeReport,
) -> Result<()> {
    let students: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM students WHERE deleted_at IS NULL \
         AND class_id IN (SELECT id FROM classes WHERE deleted_at IS NOT NULL)",
    )
    .fetch_all(&mut *tx)
    .await?;
    for id in students {
        sqlx::query(
            "UPDATE students SET first_name = '', last_name = '', deleted_at = ?, updated_at = ?, modified_by_device = ? WHERE id = ?",
        )
        .bind(&ctx.now)
        .bind(&ctx.now)
        .bind(&ctx.device)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        report.record("student", id, ChangeKind::Tombstone);
    }
    let observations: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM observations WHERE deleted_at IS NULL \
         AND student_id IN (SELECT id FROM students WHERE deleted_at IS NOT NULL)",
    )
    .fetch_all(&mut *tx)
    .await?;
    for id in observations {
        sqlx::query(
            "UPDATE observations SET text = '', tags = '[]', deleted_at = ?, updated_at = ?, modified_by_device = ? WHERE id = ?",
        )
        .bind(&ctx.now)
        .bind(&ctx.now)
        .bind(&ctx.device)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        report.record("observation", id, ChangeKind::Tombstone);
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// Kategorien (Regel 6)

#[derive(sqlx::FromRow, Clone)]
struct LocalCat {
    id: i64,
    uuid: String,
    name: String,
    color: String,
    background_color: String,
    text_color: String,
    is_active: bool,
    sort_order: i32,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
    modified_by_device: String,
    source_device_id: String,
}

const LOCAL_CAT_COLUMNS: &str =
    "id, uuid, name, color, background_color, text_color, is_active, sort_order, \
     CAST(created_at AS TEXT) AS created_at, CAST(updated_at AS TEXT) AS updated_at, deleted_at, \
     modified_by_device, source_device_id";

impl LocalCat {
    fn stamp(&self) -> Stamp {
        Stamp::local(
            self.updated_at.as_deref(),
            self.deleted_at.as_deref(),
            &self.modified_by_device,
        )
    }

    fn meta(&self) -> Meta {
        Meta {
            id: self.id,
            updated_at: self.updated_at.clone(),
            deleted_at: self.deleted_at.clone(),
            modified_by_device: self.modified_by_device.clone(),
        }
    }

    /// Als Datensatz der Gesamtstand-Datei (Zeitstempel unverändert als Text).
    fn rec(&self) -> CategoryRec {
        CategoryRec {
            uuid: self.uuid.clone(),
            name: self.name.clone(),
            color: self.color.clone(),
            background_color: self.background_color.clone(),
            text_color: self.text_color.clone(),
            is_active: self.is_active,
            sort_order: self.sort_order,
            created_at: self.created_at.clone().unwrap_or_default(),
            updated_at: self.updated_at.clone().unwrap_or_default(),
            deleted_at: self.deleted_at.clone(),
            modified_by_device: self.modified_by_device.clone(),
            source_device_id: self.source_device_id.clone(),
        }
    }
}

async fn cat_by_uuid(tx: &mut SqliteConnection, uuid: &str) -> Result<Option<LocalCat>> {
    Ok(sqlx::query_as::<_, LocalCat>(&format!(
        "SELECT {} FROM categories WHERE uuid = ?",
        LOCAL_CAT_COLUMNS
    ))
    .bind(uuid)
    .fetch_optional(&mut *tx)
    .await?)
}

/// Aktive (nicht gelöschte) Kategorie mit diesem Namen, außer Zeile `except_id`.
async fn active_cat_by_name(
    tx: &mut SqliteConnection,
    name: &str,
    except_id: i64,
) -> Result<Option<LocalCat>> {
    Ok(sqlx::query_as::<_, LocalCat>(&format!(
        "SELECT {} FROM categories WHERE name = ? AND deleted_at IS NULL AND id <> ?",
        LOCAL_CAT_COLUMNS
    ))
    .bind(name)
    .bind(except_id)
    .fetch_optional(&mut *tx)
    .await?)
}

async fn write_category(
    tx: &mut SqliteConnection,
    id: Option<i64>,
    r: &CategoryRec,
) -> Result<i64> {
    Ok(match id {
        Some(id) => {
            sqlx::query(
                "UPDATE categories SET uuid = ?, name = ?, color = ?, background_color = ?, text_color = ?, \
                 is_active = ?, sort_order = ?, created_at = ?, updated_at = ?, deleted_at = ?, \
                 modified_by_device = ?, source_device_id = ? WHERE id = ?",
            )
            .bind(&r.uuid)
            .bind(&r.name)
            .bind(&r.color)
            .bind(&r.background_color)
            .bind(&r.text_color)
            .bind(r.is_active)
            .bind(r.sort_order)
            .bind(&r.created_at)
            .bind(&r.updated_at)
            .bind(&r.deleted_at)
            .bind(&r.modified_by_device)
            .bind(&r.source_device_id)
            .bind(id)
            .execute(&mut *tx)
            .await?;
            id
        }
        None => sqlx::query(
            "INSERT INTO categories (uuid, name, color, background_color, text_color, is_active, sort_order, \
             created_at, updated_at, deleted_at, modified_by_device, source_device_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.uuid)
        .bind(&r.name)
        .bind(&r.color)
        .bind(&r.background_color)
        .bind(&r.text_color)
        .bind(r.is_active)
        .bind(r.sort_order)
        .bind(&r.created_at)
        .bind(&r.updated_at)
        .bind(&r.deleted_at)
        .bind(&r.modified_by_device)
        .bind(&r.source_device_id)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid(),
    })
}

/// Gleicher Inhalt, Zeitstempel als Zeitpunkt verglichen (Textformat egal).
fn same_category(a: &CategoryRec, b: &CategoryRec) -> bool {
    let ts = |s: &str| parse_ts(s).map(format_ts).unwrap_or_else(|_| s.to_string());
    let opt = |s: &Option<String>| s.as_deref().map(ts);
    a.uuid == b.uuid
        && a.name == b.name
        && a.color == b.color
        && a.background_color == b.background_color
        && a.text_color == b.text_color
        && a.is_active == b.is_active
        && a.sort_order == b.sort_order
        && ts(&a.created_at) == ts(&b.created_at)
        && ts(&a.updated_at) == ts(&b.updated_at)
        && opt(&a.deleted_at) == opt(&b.deleted_at)
        && a.modified_by_device == b.modified_by_device
        && a.source_device_id == b.source_device_id
}

enum CatOutcome {
    Done,
    /// Name kollidiert mit der aktiven lokalen Kategorie dieser UUID.
    Blocked(String),
}

async fn merge_categories(
    tx: &mut SqliteConnection,
    recs: &[CategoryRec],
    report: &mut MergeReport,
) -> Result<()> {
    for rec in recs {
        Stamp::incoming(
            &rec.uuid,
            &rec.updated_at,
            rec.deleted_at.as_deref(),
            &rec.modified_by_device,
        )?;
    }
    // Löschvermerke zuerst: sie geben Namen frei und nehmen an der Zusammenlegung nicht teil.
    for rec in recs.iter().filter(|r| r.deleted_at.is_some()) {
        apply_category(tx, rec, false, report).await?;
    }
    // Aktive Fassungen: zuerst alles ohne Namenskollision; eine Kollision kann sich durch eine
    // spätere Umbenennung derselben Datei auflösen. Was danach noch kollidiert, wird
    // zusammengelegt.
    let mut pending: Vec<&CategoryRec> = recs.iter().filter(|r| r.deleted_at.is_none()).collect();
    let mut rounds = 0;
    while !pending.is_empty() {
        rounds += 1;
        let mut blocked: Vec<(&CategoryRec, String)> = Vec::new();
        for rec in &pending {
            if let CatOutcome::Blocked(by) = apply_category(tx, rec, false, report).await? {
                blocked.push((rec, by));
            }
        }
        let progress = blocked.len() < pending.len();
        pending = blocked.iter().map(|(r, _)| *r).collect();
        if pending.is_empty() || (progress && rounds <= recs.len() + 1) {
            continue;
        }
        // Ringtausch von Namen (X↔Y): eine blockierende Kategorie, die selbst noch umbenannt
        // wird, vorübergehend auf einen freien Namen setzen.
        let cycle = blocked
            .iter()
            .find(|(_, by)| pending.iter().any(|r| &r.uuid == by))
            .map(|(_, by)| by.clone());
        if let (Some(by), true) = (cycle, rounds <= recs.len() + 1) {
            sqlx::query("UPDATE categories SET name = ? WHERE uuid = ?")
                .bind(format!("\u{1}umbenennen-{}", by))
                .bind(&by)
                .execute(&mut *tx)
                .await?;
            continue;
        }
        for rec in std::mem::take(&mut pending) {
            apply_category(tx, rec, true, report).await?;
        }
    }
    Ok(())
}

async fn apply_category(
    tx: &mut SqliteConnection,
    rec: &CategoryRec,
    allow_merge: bool,
    report: &mut MergeReport,
) -> Result<CatOutcome> {
    let inc = Stamp::incoming(
        &rec.uuid,
        &rec.updated_at,
        rec.deleted_at.as_deref(),
        &rec.modified_by_device,
    )?;
    let local = cat_by_uuid(tx, &rec.uuid).await?;
    let action = decide(
        local.as_ref().map(|l| l.meta()).as_ref(),
        &inc,
        rec.deleted_at.is_some(),
        false,
    );
    let kind = match action {
        Action::Skip => {
            report.skipped += 1;
            return Ok(CatOutcome::Done);
        }
        Action::Write(kind) | Action::Cascade(kind) => kind,
    };
    if rec.deleted_at.is_none() {
        let own_id = local.as_ref().map(|l| l.id).unwrap_or(-1);
        if let Some(other) = active_cat_by_name(tx, &rec.name, own_id).await? {
            if !allow_merge {
                return Ok(CatOutcome::Blocked(other.uuid));
            }
            merge_category_pair(tx, rec, &inc, &other, local.as_ref().map(|l| l.id), report)
                .await?;
            return Ok(CatOutcome::Done);
        }
    }
    let id = write_category(tx, local.as_ref().map(|l| l.id), rec).await?;
    report.record("category", id, kind);
    Ok(CatOutcome::Done)
}

/// Legt die eingehende Fassung `rec` mit der aktiven lokalen Kategorie `other` gleichen Namens
/// zusammen: kleinere UUID, Felder der jüngeren Fassung (bei völligem Gleichstand die Fassung
/// mit der behaltenen UUID). `own_row` ist die lokale Zeile mit `rec.uuid`, falls vorhanden
/// (übernommene Umbenennung); sie geht in der zusammengelegten Zeile auf.
async fn merge_category_pair(
    tx: &mut SqliteConnection,
    rec: &CategoryRec,
    inc: &Stamp,
    other: &LocalCat,
    own_row: Option<i64>,
    report: &mut MergeReport,
) -> Result<()> {
    let keep_uuid = std::cmp::min(&rec.uuid, &other.uuid).clone();
    let other_rec = other.rec();
    let mut merged = match newer(inc, &other.stamp()) {
        Ordering::Greater => rec.clone(),
        Ordering::Less => other_rec.clone(),
        Ordering::Equal if rec.uuid == keep_uuid => rec.clone(),
        Ordering::Equal => other_rec.clone(),
    };
    merged.uuid = keep_uuid;
    if own_row.is_none() && same_category(&merged, &other_rec) {
        report.skipped += 1;
        return Ok(());
    }
    if let Some(id) = own_row {
        // Zusammengelegt, nicht gelöscht: kein Löschvermerk, die UUID lebt in `merged` weiter
        // oder wird auf beiden Geräten gleich verdrängt.
        sqlx::query("DELETE FROM categories WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    let id = write_category(tx, Some(other.id), &merged).await?;
    report.record("category", id, ChangeKind::Update);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::snapshot::{build_snapshot, SnapshotRows};
    use tempfile::TempDir;

    const A: &str = "device-a";
    const B: &str = "device-b";

    /// Zwei Geräte mit eigener Geräte-ID und eigenem Uhrversatz.
    async fn devices() -> (Database, Database, TempDir) {
        let dir = TempDir::new().unwrap();
        let a = Database::open_for_test(&dir.path().join("a.db"), A, 0)
            .await
            .unwrap();
        let b = Database::open_for_test(&dir.path().join("b.db"), B, -90_000)
            .await
            .unwrap();
        (a, b, dir)
    }

    async fn snap(db: &Database) -> Snapshot {
        build_snapshot(db, None, None).await.unwrap()
    }

    fn sorted(mut r: SnapshotRows) -> SnapshotRows {
        r.categories.sort_by(|a, b| a.uuid.cmp(&b.uuid));
        r.classes.sort_by(|a, b| a.uuid.cmp(&b.uuid));
        r.students.sort_by(|a, b| a.uuid.cmp(&b.uuid));
        r.observations.sort_by(|a, b| a.uuid.cmp(&b.uuid));
        r
    }

    async fn rows(db: &Database) -> SnapshotRows {
        sorted(snap(db).await.rows)
    }

    /// Austausch in beide Richtungen mit den Ständen von vorher (gleichzeitiger Abgleich).
    async fn exchange(a: &Database, b: &Database) {
        let (sa, sb) = (snap(a).await, snap(b).await);
        merge_snapshot(a, &sb).await.unwrap();
        merge_snapshot(b, &sa).await.unwrap();
    }

    /// Bis zur Ruhe abgleichen und Gleichstand prüfen.
    async fn converge(a: &Database, b: &Database) {
        for _ in 0..3 {
            exchange(a, b).await;
        }
        assert_eq!(rows(a).await, rows(b).await, "Geräte nicht deckungsgleich");
    }

    async fn exec(db: &Database, sql: &str, binds: &[&str]) {
        let mut q = sqlx::query(sql);
        for b in binds {
            q = q.bind(*b);
        }
        q.execute(db.pool()).await.unwrap();
    }

    async fn count(db: &Database, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", table))
            .fetch_one(db.pool())
            .await
            .unwrap()
    }

    async fn counts(db: &Database) -> Vec<i64> {
        let mut v = Vec::new();
        for t in ["categories", "classes", "students", "observations"] {
            v.push(count(db, t).await);
        }
        v
    }

    async fn obs_text(db: &Database, uuid: &str) -> (String, Option<String>) {
        sqlx::query_as("SELECT text, deleted_at FROM observations WHERE uuid = ?")
            .bind(uuid)
            .fetch_one(db.pool())
            .await
            .unwrap()
    }

    /// Klasse, zwei Schüler, Beobachtung, gelöschte Beobachtung, eigene Kategorie.
    async fn seed(db: &Database) -> (crate::Class, crate::Student, crate::Observation) {
        let class = db
            .create_class("5a".into(), "2026/27".into())
            .await
            .unwrap();
        let s1 = db
            .create_student(class.id, "Max".into(), "Muster".into(), None)
            .await
            .unwrap();
        let s2 = db
            .create_student(class.id, "Erika".into(), "Beispiel".into(), None)
            .await
            .unwrap();
        let o = db
            .create_observation(
                s1.id,
                1,
                "Sozial".into(),
                "Hilft anderen".into(),
                vec!["x".into()],
            )
            .await
            .unwrap();
        let gone = db
            .create_observation(s2.id, 1, "Fachlich".into(), "Wird gelöscht".into(), vec![])
            .await
            .unwrap();
        db.tombstone_observation(gone.id).await.unwrap();
        db.create_category(
            "Projekt".into(),
            "#111111".into(),
            "#222222".into(),
            "#333333".into(),
        )
        .await
        .unwrap();
        (class, s1, o)
    }

    fn active_names(r: &SnapshotRows) -> Vec<String> {
        let mut v: Vec<String> = r
            .categories
            .iter()
            .filter(|c| c.deleted_at.is_none())
            .map(|c| c.name.clone())
            .collect();
        v.sort();
        v
    }

    #[tokio::test]
    async fn test_merge_new_device_receives_everything() {
        let (a, b, _d) = devices().await;
        seed(&a).await;
        let sa = snap(&a).await;
        let report = merge_snapshot(&b, &sa).await.unwrap();
        assert!(report.inserted >= 6, "{:?}", report);

        let (ra, rb) = (rows(&a).await, rows(&b).await);
        assert_eq!(ra.classes, rb.classes);
        assert_eq!(ra.students, rb.students);
        assert_eq!(ra.observations, rb.observations);
        // Standardkategorien gibt es auf beiden Geräten mit eigener UUID → zusammengelegt
        assert_eq!(active_names(&ra), active_names(&rb));

        // Nach dem Rückweg sind auch die Kategorien identisch
        merge_snapshot(&a, &snap(&b).await).await.unwrap();
        assert_eq!(rows(&a).await, rows(&b).await);
    }

    #[tokio::test]
    async fn test_merge_newer_edit_wins_both_directions() {
        let (a, b, _d) = devices().await;
        let (_c, _s, o) = seed(&a).await;
        converge(&a, &b).await;
        let ob = sqlx::query_scalar::<_, i64>("SELECT id FROM observations WHERE uuid = ?")
            .bind(&o.uuid)
            .fetch_one(b.pool())
            .await
            .unwrap();

        // B ist jünger (Zeitstempel im alten Format, gleicher Zeitpunkt-Vergleich per parse_ts)
        a.update_observation(o.id, "Sozial".into(), "A-Text".into(), vec![])
            .await
            .unwrap();
        exec(
            &a,
            "UPDATE observations SET updated_at = '2026-11-17T10:00:00.000Z' WHERE uuid = ?",
            &[&o.uuid],
        )
        .await;
        b.update_observation(ob, "Sozial".into(), "B-Text".into(), vec![])
            .await
            .unwrap();
        exec(
            &b,
            "UPDATE observations SET updated_at = '2026-11-17 10:00:05' WHERE uuid = ?",
            &[&o.uuid],
        )
        .await;
        exchange(&a, &b).await;
        assert_eq!(obs_text(&a, &o.uuid).await.0, "B-Text");
        assert_eq!(obs_text(&b, &o.uuid).await.0, "B-Text");

        // Jetzt ist A jünger
        a.update_observation(o.id, "Sozial".into(), "A-Text 2".into(), vec![])
            .await
            .unwrap();
        exec(
            &a,
            "UPDATE observations SET updated_at = '2026-11-17T10:00:10.000Z' WHERE uuid = ?",
            &[&o.uuid],
        )
        .await;
        exchange(&a, &b).await;
        assert_eq!(obs_text(&a, &o.uuid).await.0, "A-Text 2");
        assert_eq!(obs_text(&b, &o.uuid).await.0, "A-Text 2");
        converge(&a, &b).await;
    }

    #[tokio::test]
    async fn test_merge_equal_timestamp_tiebreak_is_symmetric() {
        let (a, b, _d) = devices().await;
        let (_c, _s, o) = seed(&a).await;
        converge(&a, &b).await;
        let ob = sqlx::query_scalar::<_, i64>("SELECT id FROM observations WHERE uuid = ?")
            .bind(&o.uuid)
            .fetch_one(b.pool())
            .await
            .unwrap();
        a.update_observation(o.id, "Sozial".into(), "von A".into(), vec![])
            .await
            .unwrap();
        b.update_observation(ob, "Sozial".into(), "von B".into(), vec![])
            .await
            .unwrap();
        // derselbe Zeitpunkt in beiden Formaten
        exec(
            &a,
            "UPDATE observations SET updated_at = '2026-11-17T09:00:00.000Z' WHERE uuid = ?",
            &[&o.uuid],
        )
        .await;
        exec(
            &b,
            "UPDATE observations SET updated_at = '2026-11-17 09:00:00' WHERE uuid = ?",
            &[&o.uuid],
        )
        .await;

        exchange(&a, &b).await;
        // "device-b" > "device-a"
        assert_eq!(obs_text(&a, &o.uuid).await.0, "von B");
        assert_eq!(obs_text(&b, &o.uuid).await.0, "von B");
        converge(&a, &b).await;
    }

    #[tokio::test]
    async fn test_merge_delete_wins_over_newer_edit() {
        let (a, b, _d) = devices().await;
        let (_c, _s, o) = seed(&a).await;
        converge(&a, &b).await;
        let ob = sqlx::query_scalar::<_, i64>("SELECT id FROM observations WHERE uuid = ?")
            .bind(&o.uuid)
            .fetch_one(b.pool())
            .await
            .unwrap();
        a.tombstone_observation(o.id).await.unwrap();
        b.update_observation(ob, "Sozial".into(), "spätere Bearbeitung".into(), vec![])
            .await
            .unwrap();
        exec(
            &b,
            "UPDATE observations SET updated_at = '2099-01-01T00:00:00.000Z' WHERE uuid = ?",
            &[&o.uuid],
        )
        .await;

        exchange(&a, &b).await;
        for db in [&a, &b] {
            let (text, deleted) = obs_text(db, &o.uuid).await;
            assert_eq!(text, "");
            assert!(deleted.is_some());
            let visible = db.search_observations(None, None, None).await.unwrap();
            assert!(visible.iter().all(|x| x.uuid != o.uuid));
        }
        converge(&a, &b).await;
    }

    #[tokio::test]
    async fn test_merge_cascade_drops_observation_of_deleted_student() {
        // Spezifikation: Schüler X am Laptop (A) gelöscht, an der Workstation (B) danach eine
        // Beobachtung zu X ergänzt → die Beobachtung wird verworfen. Beide Abgleich-Reihenfolgen.
        for laptop_first in [true, false] {
            let (a, b, _d) = devices().await;
            let (_c, x, _o) = seed(&a).await;
            converge(&a, &b).await;
            let xb = sqlx::query_scalar::<_, i64>("SELECT id FROM students WHERE uuid = ?")
                .bind(&x.uuid)
                .fetch_one(b.pool())
                .await
                .unwrap();
            a.tombstone_student(x.id).await.unwrap();
            let neu = b
                .create_observation(
                    xb,
                    1,
                    "Sozial".into(),
                    "Nach Löschung ergänzt".into(),
                    vec![],
                )
                .await
                .unwrap();

            if laptop_first {
                // Beobachtung kommt mit gelöschtem Elternteil an → nur Löschvermerk
                let report = merge_snapshot(&a, &snap(&b).await).await.unwrap();
                assert_eq!(report.inserted, 1, "{:?}", report);
                let (text, deleted) = obs_text(&a, &neu.uuid).await;
                assert_eq!(text, "");
                assert!(deleted.is_some());
                merge_snapshot(&b, &snap(&a).await).await.unwrap();
            } else {
                // Workstation zuerst: der Laptop-Stand kennt die neue Beobachtung nicht;
                // sie wird mit dem gelöschten Schüler lokal zum Löschvermerk.
                let report = merge_snapshot(&b, &snap(&a).await).await.unwrap();
                assert!(report
                    .changes
                    .iter()
                    .any(|c| c.object_type == "observation" && c.kind == ChangeKind::Tombstone));
                merge_snapshot(&a, &snap(&b).await).await.unwrap();
            }

            for db in [&a, &b] {
                let (text, deleted) = obs_text(db, &neu.uuid).await;
                assert_eq!(text, "", "laptop_first={}", laptop_first);
                assert!(deleted.is_some());
                let live: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM observations o JOIN students s ON s.id = o.student_id \
                     WHERE s.uuid = ? AND o.deleted_at IS NULL",
                )
                .bind(&x.uuid)
                .fetch_one(db.pool())
                .await
                .unwrap();
                assert_eq!(live, 0);
                let leaked: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM observations WHERE text LIKE '%Löschung%' OR text = 'Hilft anderen'",
                )
                .fetch_one(db.pool())
                .await
                .unwrap();
                assert_eq!(leaked, 0);
            }
            converge(&a, &b).await;
        }
    }

    #[tokio::test]
    async fn test_merge_moved_student_survives_deletion_of_old_class() {
        // B verschiebt Schüler S von Klasse C nach D und löscht danach C. A hat noch die alte
        // Fassung von S in C. S und seine Beobachtungen müssen auf beiden Geräten leben.
        for b_first in [true, false] {
            let (a, b, _d) = devices().await;
            let (_c, s, o) = seed(&a).await;
            a.create_class("5b".into(), "2026/27".into()).await.unwrap();
            converge(&a, &b).await;

            let (c_id, d_id): (i64, i64) = sqlx::query_as(
                "SELECT (SELECT id FROM classes WHERE name = '5a'), (SELECT id FROM classes WHERE name = '5b')",
            )
            .fetch_one(b.pool())
            .await
            .unwrap();
            let d_id_s = d_id.to_string();
            exec(
                &b,
                "UPDATE students SET class_id = CAST(? AS INTEGER), updated_at = '2099-01-01T00:00:00.000Z', \
                 modified_by_device = 'device-b' WHERE uuid = ?",
                &[&d_id_s, &s.uuid],
            )
            .await;
            b.tombstone_class(c_id).await.unwrap();

            if b_first {
                merge_snapshot(&b, &snap(&a).await).await.unwrap();
                merge_snapshot(&a, &snap(&b).await).await.unwrap();
            } else {
                merge_snapshot(&a, &snap(&b).await).await.unwrap();
                merge_snapshot(&b, &snap(&a).await).await.unwrap();
            }
            converge(&a, &b).await;

            for db in [&a, &b] {
                let (first, deleted, class): (String, Option<String>, String) = sqlx::query_as(
                    "SELECT s.first_name, s.deleted_at, c.name FROM students s \
                     JOIN classes c ON c.id = s.class_id WHERE s.uuid = ?",
                )
                .bind(&s.uuid)
                .fetch_one(db.pool())
                .await
                .unwrap();
                assert_eq!(
                    (first.as_str(), deleted, class.as_str()),
                    ("Max", None, "5b"),
                    "b_first={}",
                    b_first
                );
                let (text, deleted) = obs_text(db, &o.uuid).await;
                assert_eq!(text, "Hilft anderen", "b_first={}", b_first);
                assert!(deleted.is_none());
            }
        }
    }

    async fn cat_uuid(db: &Database, name: &str) -> String {
        sqlx::query_scalar("SELECT uuid FROM categories WHERE name = ? AND deleted_at IS NULL")
            .bind(name)
            .fetch_one(db.pool())
            .await
            .unwrap()
    }

    async fn active_count(db: &Database, name: &str) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM categories WHERE name = ? AND deleted_at IS NULL")
            .bind(name)
            .fetch_one(db.pool())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_merge_category_same_name_different_uuid_merges() {
        // 0: A→B zuerst, 1: B→A zuerst, 2: gleichzeitig (Stände von vorher)
        for order in 0..3 {
            let (a, b, _d) = devices().await;
            a.create_category(
                "Projekt".into(),
                "#a00000".into(),
                "#a00001".into(),
                "#a00002".into(),
            )
            .await
            .unwrap();
            b.create_category(
                "Projekt".into(),
                "#b00000".into(),
                "#b00001".into(),
                "#b00002".into(),
            )
            .await
            .unwrap();
            // B ist jünger → Felder von B
            exec(&a, "UPDATE categories SET updated_at = '2026-11-17T08:00:00.000Z' WHERE name = 'Projekt'", &[]).await;
            exec(
                &b,
                "UPDATE categories SET updated_at = '2026-11-17 08:00:01' WHERE name = 'Projekt'",
                &[],
            )
            .await;
            let (ua, ub) = (cat_uuid(&a, "Projekt").await, cat_uuid(&b, "Projekt").await);
            assert_ne!(ua, ub);
            let expected = std::cmp::min(ua.clone(), ub.clone());

            match order {
                0 => {
                    merge_snapshot(&b, &snap(&a).await).await.unwrap();
                    merge_snapshot(&a, &snap(&b).await).await.unwrap();
                }
                1 => {
                    merge_snapshot(&a, &snap(&b).await).await.unwrap();
                    merge_snapshot(&b, &snap(&a).await).await.unwrap();
                }
                _ => exchange(&a, &b).await,
            }
            for db in [&a, &b] {
                assert_eq!(
                    active_count(db, "Projekt").await,
                    1,
                    "Reihenfolge {}",
                    order
                );
                assert_eq!(
                    cat_uuid(db, "Projekt").await,
                    expected,
                    "Reihenfolge {}",
                    order
                );
                let color: String =
                    sqlx::query_scalar("SELECT color FROM categories WHERE name = 'Projekt'")
                        .fetch_one(db.pool())
                        .await
                        .unwrap();
                assert_eq!(color, "#b00000");
            }
            assert_eq!(rows(&a).await, rows(&b).await, "Reihenfolge {}", order);
            converge(&a, &b).await;
        }
    }

    #[tokio::test]
    async fn test_merge_category_rename_keeps_observations() {
        let (a, b, _d) = devices().await;
        let (_c, _s, o) = seed(&a).await;
        converge(&a, &b).await;
        let before = b.search_observations(None, None, None).await.unwrap().len();

        let sozial: i64 = sqlx::query_scalar(
            "SELECT id FROM categories WHERE name = 'Sozial' AND deleted_at IS NULL",
        )
        .fetch_one(a.pool())
        .await
        .unwrap();
        a.update_category(
            sozial,
            "Sozialverhalten".into(),
            "#10B981".into(),
            "#D1FAE5".into(),
            "#065F46".into(),
        )
        .await
        .unwrap();
        merge_snapshot(&b, &snap(&a).await).await.unwrap();

        let names = active_names(&rows(&b).await);
        assert!(names.contains(&"Sozialverhalten".to_string()));
        assert!(!names.contains(&"Sozial".to_string()));
        let obs = b.search_observations(None, None, None).await.unwrap();
        assert_eq!(obs.len(), before);
        let kept = obs
            .iter()
            .find(|x| x.uuid == o.uuid)
            .expect("Beobachtung fehlt");
        assert_eq!(kept.category, "Sozial");
        assert_eq!(kept.text, "Hilft anderen");
        converge(&a, &b).await;
    }

    #[tokio::test]
    async fn test_merge_category_rename_collision_merges() {
        // A benennt "Projekt" in "Werkstatt" um, B hat unabhängig eine aktive "Werkstatt".
        let (a, b, _d) = devices().await;
        let p = a
            .create_category("Projekt".into(), "#1".into(), "#2".into(), "#3".into())
            .await
            .unwrap();
        converge(&a, &b).await;
        b.create_category("Werkstatt".into(), "#4".into(), "#5".into(), "#6".into())
            .await
            .unwrap();
        a.update_category(
            p.id,
            "Werkstatt".into(),
            "#7".into(),
            "#8".into(),
            "#9".into(),
        )
        .await
        .unwrap();
        exchange(&a, &b).await;
        for db in [&a, &b] {
            assert_eq!(active_count(db, "Werkstatt").await, 1);
            assert_eq!(active_count(db, "Projekt").await, 0);
        }
        converge(&a, &b).await;
    }

    #[tokio::test]
    async fn test_merge_category_name_swap_does_not_merge() {
        // Beide UUID-Reihenfolgen, damit das Ergebnis nicht vom Zufall der UUIDs abhängt.
        let low = "00000000-0000-4000-8000-000000000001";
        let high = "ffffffff-ffff-4fff-bfff-fffffffffff1";
        for (ux, uy) in [(low, high), (high, low)] {
            let (a, b, _d) = devices().await;
            let x = a
                .create_category("X".into(), "#1".into(), "#1".into(), "#1".into())
                .await
                .unwrap();
            let y = a
                .create_category("Y".into(), "#2".into(), "#2".into(), "#2".into())
                .await
                .unwrap();
            exec(&a, "UPDATE categories SET uuid = ? WHERE name = 'X'", &[ux]).await;
            exec(&a, "UPDATE categories SET uuid = ? WHERE name = 'Y'", &[uy]).await;
            converge(&a, &b).await;
            // Tausch über einen Zwischennamen (der eindeutige Index verlangt das lokal)
            a.update_category(x.id, "tmp".into(), "#1".into(), "#1".into(), "#1".into())
                .await
                .unwrap();
            a.update_category(y.id, "X".into(), "#2".into(), "#2".into(), "#2".into())
                .await
                .unwrap();
            a.update_category(x.id, "Y".into(), "#1".into(), "#1".into(), "#1".into())
                .await
                .unwrap();
            merge_snapshot(&b, &snap(&a).await).await.unwrap();
            assert_eq!(cat_uuid(&b, "X").await, uy);
            assert_eq!(cat_uuid(&b, "Y").await, ux);
            assert_eq!(rows(&a).await, rows(&b).await);
            converge(&a, &b).await;
        }
    }

    #[tokio::test]
    async fn test_merge_unknown_parent_rolls_back() {
        let (a, b, _d) = devices().await;
        seed(&a).await;
        b.create_class("eigene".into(), "2026/27".into())
            .await
            .unwrap();
        let mut s = snap(&a).await;
        s.rows.students[0].class_uuid = "00000000-0000-0000-0000-000000000000".into();
        let before = (counts(&b).await, rows(&b).await);
        assert!(merge_snapshot(&b, &s).await.is_err());
        assert_eq!((counts(&b).await, rows(&b).await), before);

        let mut s = snap(&a).await;
        s.rows.observations[0].student_uuid = "unbekannt".into();
        assert!(merge_snapshot(&b, &s).await.is_err());
        assert_eq!((counts(&b).await, rows(&b).await), before);
    }

    #[tokio::test]
    async fn test_merge_is_idempotent() {
        let (a, b, _d) = devices().await;
        seed(&a).await;
        // B hat eigene Daten, darunter eine Kategorie gleichen Namens und einen Löschvermerk
        let (_c, x, _o) = seed(&b).await;
        b.tombstone_student(x.id).await.unwrap();
        let sa = snap(&a).await;
        let first = merge_snapshot(&b, &sa).await.unwrap();
        assert!(first.inserted > 0);
        let second = merge_snapshot(&b, &sa).await.unwrap();
        let total = sa.rows.categories.len()
            + sa.rows.classes.len()
            + sa.rows.students.len()
            + sa.rows.observations.len();
        assert_eq!(
            (
                second.inserted,
                second.updated,
                second.tombstoned,
                second.skipped
            ),
            (0, 0, 0, total),
            "{:?}",
            second
        );
        assert!(second.changes.is_empty());
    }

    #[tokio::test]
    async fn test_merge_writes_audit_without_content() {
        let (a, b, d) = devices().await;
        seed(&a).await;
        let report = merge_snapshot(&b, &snap(&a).await).await.unwrap();
        let audit = AuditLogger::new(d.path().join("audit.db")).await.unwrap();
        log_merge_audit(&audit, &report).await.unwrap();

        let entries = audit.get_entries(Some(10_000), None).await.unwrap();
        let merged: Vec<_> = entries
            .iter()
            .filter(|e| e.action == "sync_merge")
            .collect();
        assert_eq!(merged.len(), report.changes.len());
        assert!(merged.iter().any(|e| e.object_type == "observation"));
        let all = serde_json::to_string(&entries).unwrap();
        for secret in ["Hilft anderen", "Max", "Muster", "Erika", "5a"] {
            assert!(!all.contains(secret), "Audit enthält Inhalt: {}", secret);
        }
        for e in merged {
            let details = e
                .details
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_default();
            assert!(
                ["insert", "update", "tombstone"]
                    .iter()
                    .any(|k| details.contains(k)),
                "{}",
                details
            );
        }
    }

    #[tokio::test]
    async fn test_replace_with_snapshot_discards_local() {
        let (a, b, _d) = devices().await;
        seed(&a).await;
        let c = b
            .create_class("B-Klasse".into(), "2025/26".into())
            .await
            .unwrap();
        let s = b
            .create_student(c.id, "Nur".into(), "AufB".into(), None)
            .await
            .unwrap();
        b.create_observation(s.id, 1, "Sozial".into(), "Nur auf B".into(), vec![])
            .await
            .unwrap();

        replace_with_snapshot(&b, &snap(&a).await).await.unwrap();
        assert_eq!(rows(&a).await, rows(&b).await);
        let leaked: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM observations WHERE text = 'Nur auf B') + \
                    (SELECT COUNT(*) FROM students WHERE last_name = 'AufB') + \
                    (SELECT COUNT(*) FROM classes WHERE name = 'B-Klasse')",
        )
        .fetch_one(b.pool())
        .await
        .unwrap();
        assert_eq!(leaked, 0);
    }
}
