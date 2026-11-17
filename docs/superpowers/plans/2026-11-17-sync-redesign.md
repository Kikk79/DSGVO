# Sync neu – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei Geräte (Laptop maßgeblich, Desktop) gleichen über WebDAV alle fachlichen Daten inklusive Löschungen ab, mit gemeinsamer Zeit aus dem `Date`-Header des WebDAV-Servers.

**Architecture:** Jedes Gerät lädt genau eine Datei `snapshot_<device_id>.json` mit seinem Gesamtstand hoch und führt die Dateien der anderen Geräte pro Datensatz (UUID) in einer Transaktion zusammen. Die Integer-IDs bleiben lokal; abgeglichen wird über neue Spalten `uuid`, `deleted_at`, `modified_by_device`. Eine Uhr mit Versatz zur Serverzeit stempelt alle Änderungen.

**Tech Stack:** Rust (Tauri 2, sqlx 0.7 SQLite, reqwest 0.11, chrono, uuid), React/TypeScript-Frontend.

**Spec:** `docs/superpowers/specs/2026-11-17-sync-redesign-design.md` (Abschnittsnummern unten verweisen darauf). Laufende Referenz: `docs/ISA_SYNC.md`.

## Global Constraints

- Keine Zeile der bestehenden Laptop-Datenbank darf verloren gehen (Anti-Ziel 1).
- Endgültiges Löschen gewinnt immer, auch gegen jüngere Bearbeitungen; Kaskade auf abhängige Datensätze (5.5).
- Löschvermerke enthalten keine personenbezogenen Inhalte (5.2).
- Zeitquelle ist ausschließlich der HTTP-`Date`-Header des WebDAV-Servers; kein NTP (5.3).
- Zeitstempel werden als UTC RFC 3339 mit Millisekunden von der App geschrieben, nicht per `CURRENT_TIMESTAMP` (5.3).
- Server-Datei: `snapshot_<device_id>.json`, `format: "snapshot_v2"` (5.4).
- Rollen-Werte: `"laptop"` / `"desktop"`; Ersetzen nur beim ersten Abgleich eines Desktops (5.8).
- Integer-`id` und alle bestehenden Tauri-Befehle für Frontend-Daten bleiben kompatibel.
- UI-Texte Deutsch, Anrede „Sie“; Gestaltung mit den Bausteinen aus `src/components/ui/`.
- `docs/ISA_SYNC.md` wird im selben Commit nachgetragen, in dem eine Anforderung umgesetzt wird.
- Rust-Tests: `cd src-tauri && CARGO_TARGET_DIR=$HOME/.cache/dsgvo-update-observation-target cargo test --bin schuelerbeobachtung <filter>`; Frontend: `npx tsc --noEmit -p . && npx eslint src --ext ts,tsx && npx vitest run <pfad>`.
- Vorbestehend rot (nicht reparieren, nicht verschlechtern): die in `docs/ISA_SYNC.md` §5 genannten Sync-Tests und die dort genannten übrigen; Liste vor Task 1 mit einem Gesamtlauf festhalten.

## Review Focus

1. **Umstellung einer echten alten Datenbank mit Zeitstempeln in beiden Formaten** (`CURRENT_TIMESTAMP` „YYYY-MM-DD HH:MM:SS“ und RFC 3339) → Umstellung gelingt, Zeilenzahl und Inhalte gleich. Test in Task 2: `test_migration_handles_mixed_timestamp_formats`.
2. **Erster Start auf dem Laptop ohne Netz** → App startet, Versatz 0, Rollenauswahl erscheint, Daten unverändert. Test in Task 9: `test_sync_without_server_leaves_data_untouched`.
3. **Halb hochgeladene oder fremde Datei im WebDAV-Ordner** (falsche Prüfsumme, altes `changeset_*.dat`, beliebige andere Datei) → wird übersprungen, Abgleich läuft weiter, lokale Daten unverändert. Test in Task 9: `test_sync_skips_corrupt_and_foreign_files`.
4. **Desktop mit lokalen Daten, Laptop-Stand erscheint erst beim zweiten Abgleich** → erster Durchlauf lädt nichts hoch, zweiter ersetzt; danach normales Zusammenführen. Test in Task 9: `test_desktop_waits_then_replaces_once`.
5. **Umbenannte Kategorie, deren Beobachtungen den alten Namen tragen** → Beobachtungen bleiben erhalten und sichtbar (ohne Farbe, wie heute). Test in Task 6: `test_merge_category_rename_keeps_observations`.

---

### Task 1: Uhr mit Serverzeit-Versatz

**Files:**
- Create: `src-tauri/src/sync_time.rs`
- Modify: `src-tauri/src/main.rs` (`mod sync_time;`)

**Interfaces:**
- Produces:
  - `pub struct SyncClock { offset_ms: AtomicI64 }` mit `pub fn new(offset_ms: i64) -> Self`, `pub fn now(&self) -> DateTime<Utc>` (lokale Uhr + Versatz, auf Millisekunden gekürzt), `pub fn offset_ms(&self) -> i64`, `pub fn set_offset_ms(&self, ms: i64)`.
  - `pub fn offset_from_date_header(date_header: &str, sent_local: DateTime<Utc>, received_local: DateTime<Utc>) -> Option<i64>`: Server-Datum (RFC 2822 / HTTP-date) minus Mittelpunkt von `sent_local`..`received_local`, in ms; `None` bei unlesbarem Header.
  - `pub fn format_ts(t: DateTime<Utc>) -> String`: RFC 3339, Millisekunden, `Z`.
  - `pub fn parse_ts(s: &str) -> Result<DateTime<Utc>>`: akzeptiert RFC 3339 und `YYYY-MM-DD HH:MM:SS[.fff]` (als UTC).

- [ ] **Step 1: Tests schreiben** (im Modul, `#[cfg(test)]`)
  - `test_offset_from_date_header_uses_midpoint`: Header `"Tue, 17 Nov 2026 10:00:10 GMT"`, sent `10:00:00.000Z`, received `10:00:02.000Z` → `Some(9_000)`.
  - `test_offset_from_date_header_rejects_garbage`: `"kaputt"` → `None`.
  - `test_clock_now_applies_offset`: `SyncClock::new(60_000).now()` liegt 59–61 s nach `Utc::now()`.
  - `test_parse_ts_accepts_both_formats`: `"2026-11-17 08:00:00"` und `"2026-11-17T08:00:00.000Z"` → gleicher Wert.
  - `test_format_ts_roundtrip`: `parse_ts(&format_ts(t)) == t` für einen Wert mit Millisekunden.
- [ ] **Step 2:** Tests laufen lassen → FAIL (Modul fehlt).
- [ ] **Step 3:** Implementieren (`httpdate`-Parsing über `chrono::DateTime::parse_from_rfc2822`; GMT-Suffix vorher durch `+0000` ersetzen).
- [ ] **Step 4:** `cargo test ... sync_time` → PASS.
- [ ] **Step 5:** Commit `feat(sync): Uhr mit Versatz zur Serverzeit`.

### Task 2: Schema-Umstellung v2 mit Sicherungskopie

**Files:**
- Create: `src-tauri/src/sync_schema.rs`
- Modify: `src-tauri/src/database.rs` (`Database` bekommt Felder `db_path: PathBuf`, `clock: Arc<SyncClock>`; `Database::new` ruft nach `migrate()` `sync_schema::migrate_to_v2` auf und lädt den gespeicherten Versatz in `clock`), `src-tauri/Cargo.toml` (`uuid` Feature `v5`).

**Interfaces:**
- Consumes: `SyncClock` (Task 1), `parse_ts`.
- Produces:
  - `pub fn derived_uuid(table: &str, source_device_id: &str, id: i64, created_at: &str) -> String` — UUIDv5, Namespace fest im Code: `Uuid::from_u128(0x5c1e_6a2b_9d7f_4e31_8b0a_d5e4_c3b2_a190)`, Name = `"{table}|{source_device_id}|{id}|{created_at_normalisiert}"`, wobei `created_at_normalisiert = format_ts(parse_ts(created_at))` (damit beide Zeitformate dieselbe UUID ergeben).
  - `pub async fn migrate_to_v2(pool: &Pool<Sqlite>, db_path: &Path) -> Result<MigrationOutcome>`; `pub enum MigrationOutcome { AlreadyCurrent, Migrated { backup_path: Option<PathBuf> } }`.
  - Neue Spalten in `classes`, `students`, `categories`, `observations`: `uuid TEXT` (danach `CREATE UNIQUE INDEX`), `deleted_at TEXT NULL`, `modified_by_device TEXT NOT NULL DEFAULT ''` (gefüllt mit `source_device_id`).
  - `categories`: Tabelle neu aufbauen ohne `UNIQUE` auf `name`, dafür `CREATE UNIQUE INDEX idx_categories_name_active ON categories(name) WHERE deleted_at IS NULL`.
  - `sync_config` neue Spalten: `device_role TEXT NULL`, `first_sync_done INTEGER NOT NULL DEFAULT 0`, `clock_offset_ms INTEGER NOT NULL DEFAULT 0`, `last_upload_hash TEXT NULL`, `remote_etags TEXT NOT NULL DEFAULT '{}'` (JSON Dateiname→ETag). Zeile `id = 1` anlegen, falls fehlend.
  - Tabelle `schema_meta(key TEXT PRIMARY KEY, value TEXT)`, Schlüssel `sync_schema_version` = `"2"`.

- [ ] **Step 1: Tests schreiben** (`database.rs` Testmodul). Hilfsfunktion `create_legacy_db(path)`: legt das alte Schema per SQL an (Kopie der heutigen `CREATE TABLE`-Texte inkl. `categories.name UNIQUE`) und füllt 2 Klassen, 3 Schüler (einer `status='deleted'`), 6 Kategorien, 5 Beobachtungen; Zeitstempel teils `CURRENT_TIMESTAMP`-Format, teils RFC 3339.
  - `test_migration_preserves_all_rows`: Zeilenzahlen und alle Inhaltsspalten vorher == nachher.
  - `test_migration_assigns_unique_uuids`: keine NULL-/leeren UUIDs, alle eindeutig.
  - `test_migration_uuid_is_deterministic`: zwei getrennte Kopien derselben Legacy-DB → identische UUIDs pro Zeile.
  - `test_migration_handles_mixed_timestamp_formats` (Review Focus 1).
  - `test_migration_writes_backup_before_change`: Datei `*.vor-sync-v2-*.bak` existiert, öffnet sich als SQLite, enthält das alte Schema (kein `uuid`).
  - `test_migration_is_idempotent`: zweiter Aufruf → `AlreadyCurrent`, keine zweite Sicherung.
  - `test_migration_allows_reusing_deleted_category_name`: nach Umstellung zwei Zeilen gleichen Namens möglich, wenn eine `deleted_at` hat; zwei aktive → Fehler.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implementieren. Sicherung per `VACUUM INTO '<db>.vor-sync-v2-<YYYYMMDD-HHMMSS>.bak'` (konsistent trotz WAL); schlägt sie fehl → `Err`, keine Änderung. Bei leerer DB (alle vier Tabellen leer) keine Sicherung. Alle Änderungen in einer Transaktion; `PRAGMA foreign_keys=OFF` nur für den Tabellen-Neuaufbau von `categories`, danach `PRAGMA foreign_key_check` muss leer sein.
- [ ] **Step 4:** → PASS; außerdem kompletter Gesamtlauf: keine neuen Fehlschläge gegenüber der Liste aus den Global Constraints.
- [ ] **Step 5:** ISA: A10 → `umgesetzt`. Commit `feat(sync): Schema v2 mit UUIDs, Löschvermerken und Sicherungskopie`.

### Task 3: Schreibende Befehle stempeln UUID, Serverzeit und Gerät

**Files:**
- Modify: `src-tauri/src/database.rs` (alle `create_*`, `update_*`, `delete_*` mit Soft-Delete, `store_webdav_credentials` unberührt), `src-tauri/src/main.rs` (Structs `Class`, `Student`, `Category`, `Observation` um `uuid: String`, `deleted_at: Option<String>`, `modified_by_device: String` erweitern; `#[serde(default)]` für die drei Felder, damit alte JSON-Dateien weiter deserialisieren).

**Interfaces:**
- Consumes: `Database.clock`, `format_ts`.
- Produces: Jede neu angelegte Zeile hat `uuid = Uuid::new_v4()`, `created_at = updated_at = format_ts(clock.now())`, `modified_by_device = device_id`; jede Änderung setzt `updated_at = format_ts(clock.now())`, `modified_by_device = device_id`. Alle lesenden Abfragen (`get_classes`, `get_students*`, `get_categories`, `search_observations`, `get_observation`, `get_observations_since`, `get_calendar_observations`, `get_assessments_comprehensive`, `get_students_with_stats`, Zählabfragen) filtern `deleted_at IS NULL` auf allen beteiligten Tabellen. `pub fn now(&self) -> DateTime<Utc>` auf `Database`.

- [ ] **Step 1: Tests**
  - `test_create_stamps_uuid_time_and_device`: `create_class/student/category/observation` → UUID gesetzt, `modified_by_device == db.get_device_id()`, `created_at` innerhalb ±2 s von `db.now()` bei Versatz `+3_600_000` (also eine Stunde vor der lokalen Uhr).
  - `test_update_observation_uses_clock`: Versatz +1 h → `updated_at` ≈ `db.now()`.
  - `test_reads_hide_tombstones`: Zeile per SQL mit `deleted_at` versehen → taucht in keiner der genannten Leseabfragen auf.
- [ ] **Step 2:** → FAIL. **Step 3:** Implementieren; `CURRENT_TIMESTAMP` in Schreibpfaden entfernen (`grep -n CURRENT_TIMESTAMP src/database.rs` darf danach nur noch in `CREATE TABLE`-Defaults stehen). **Step 4:** → PASS + Gesamtlauf ohne neue Fehlschläge.
- [ ] **Step 5:** Commit `feat(sync): Änderungen tragen UUID, Serverzeit und Gerät`.

### Task 4: Endgültiges Löschen als Löschvermerk mit Kaskade

**Files:**
- Modify: `src-tauri/src/database.rs` (`delete_observation`, `delete_student`, `delete_class`, `delete_category`; `clear_all_data` bleibt hartes Löschen, da nur lokal genutzt — prüfen und im Kommentar begründen).

**Interfaces:**
- Produces: `async fn tombstone_observation(&self, id: i64) -> Result<()>` (setzt `deleted_at = updated_at = now`, `text = ''`, `tags = '[]'`, `modified_by_device`); `tombstone_student` (Namen `''`, Status bleibt, kaskadiert auf seine Beobachtungen); `tombstone_class` (Name `''`, kaskadiert auf Schüler und deren Beobachtungen); `tombstone_category` (Name bleibt, Farben bleiben). Öffentliche `delete_*`-Signaturen unverändert: `force_delete=true` bzw. heute hartes `DELETE` → Löschvermerk. `delete_student(force=false)` bleibt Status `deleted`. `delete_category(force=false)` mit Nutzung bleibt `is_active=0`.

- [ ] **Step 1: Tests**
  - `test_delete_observation_leaves_contentless_tombstone`: Zeile existiert, `text==''`, `tags=='[]'`, `deleted_at` gesetzt.
  - `test_force_delete_student_cascades_tombstones`: Schüler und alle seine Beobachtungen haben `deleted_at`, Namen/Texte leer.
  - `test_force_delete_class_cascades_tombstones`.
  - `test_delete_category_tombstone_frees_name`: danach `create_category` mit gleichem Namen erfolgreich.
- [ ] **Step 2–4:** FAIL → implementieren → PASS + Gesamtlauf.
- [ ] **Step 5:** ISA: A2 → `teilweise` (lokal), Commit `feat(sync): Löschen hinterlässt inhaltslose Löschvermerke`.

### Task 5: Gesamtstand-Datei (Snapshot)

**Files:**
- Create: `src-tauri/src/snapshot.rs`

**Interfaces:**
- Consumes: `Database` (neue Methode `pub async fn all_rows_for_snapshot(&self) -> Result<SnapshotRows>`, liefert alle Zeilen inkl. Löschvermerke).
- Produces:
  - `pub struct Snapshot { format: String /* "snapshot_v2" */, schema_version: u32 /* 2 */, device_id: String, device_role: Option<String>, device_name: Option<String>, generated_at: String, rows: SnapshotRows }`.
  - `pub struct SnapshotRows { categories: Vec<CategoryRec>, classes: Vec<ClassRec>, students: Vec<StudentRec>, observations: Vec<ObservationRec> }`. Rec-Typen tragen keine Integer-IDs, Verweise als `class_uuid`, `student_uuid`; Felder sonst wie die Tabellen plus `uuid`, `deleted_at`, `modified_by_device`, `source_device_id`. Beobachtung verweist auf Kategorie über `category` (Name).
  - `pub fn encode(s: &Snapshot) -> Vec<u8>`: `{"checksum": sha256(data_json), "data": <Snapshot>}` (gleiches Hülle-Format wie bisher).
  - `pub fn decode(bytes: &[u8]) -> Result<Snapshot>`: prüft Prüfsumme und `format == "snapshot_v2"`, sonst `Err` mit klarer Meldung.
  - `pub fn counts(s: &Snapshot) -> (usize /*Schüler aktiv*/, usize /*Beobachtungen aktiv*/)`.
  - `pub fn snapshot_file_name(device_id: &str) -> String` = `format!("snapshot_{device_id}.json")`.

- [ ] **Step 1: Tests:** `test_snapshot_roundtrip` (encode→decode gleich), `test_snapshot_includes_tombstones`, `test_snapshot_rejects_bad_checksum`, `test_snapshot_rejects_legacy_changeset` (ein heutiges `create_changeset_file`-Ergebnis → `Err`), `test_snapshot_references_by_uuid` (Schüler-Rec trägt `class_uuid` der Klasse).
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5:** Commit `feat(sync): Gesamtstand-Datei snapshot_v2`.

### Task 6: Zusammenführen und Ersetzen

**Files:**
- Create: `src-tauri/src/merge.rs`
- Modify: `src-tauri/src/audit.rs` nur falls nötig für einen Aufruf `log_simple_action`-ähnlich ohne Inhalt (vorhandene Funktion verwenden, keine neue Tabelle).

**Interfaces:**
- Consumes: `Snapshot` (Task 5), `Database` (Pool-Zugriff: `pub(crate) fn pool(&self) -> &Pool<Sqlite>`), `parse_ts`.
- Produces:
  - `pub struct MergeReport { pub inserted: usize, pub updated: usize, pub tombstoned: usize, pub skipped: usize }`.
  - `pub async fn merge_snapshot(db: &Database, snap: &Snapshot) -> Result<MergeReport>` — eine Transaktion; Reihenfolge Kategorien → Klassen → Schüler → Beobachtungen; bei Fehler Rollback, lokale Daten unverändert.
  - `pub async fn replace_with_snapshot(db: &Database, snap: &Snapshot) -> Result<MergeReport>` — eine Transaktion: alle Zeilen der vier Tabellen löschen (hart, nur hier), dann Snapshot einfügen.
  - Regeln (Spec 5.5/5.6), genau so:
    1. Unbekannte UUID → einfügen (Löschvermerke ebenfalls).
    2. Lokal oder eingehend `deleted_at` gesetzt → Ergebnis ist Löschvermerk (Inhalt leer gemäß Task 4), unabhängig von Zeitstempeln.
    3. Sonst gewinnt größeres `updated_at`; bei Gleichstand größeres `modified_by_device` (String-Vergleich); bei völliger Gleichheit nichts tun.
    4. Kaskade: Ist das Elternteil (per UUID aufgelöst) lokal Löschvermerk, wird der eingehende Datensatz als Löschvermerk gespeichert.
    5. Verweis auf unbekannte Eltern-UUID → `Err` (ganze Datei zurückrollen).
    6. Kategorie mit unbekannter UUID, deren Name lokal als aktive Kategorie existiert → zusammenlegen: beide Zeilen werden eine; behalten wird die lexikografisch kleinere UUID mit den Feldern der jüngeren Fassung. Dieselbe Regel, wenn eine übernommene Umbenennung mit einer anderen aktiven Kategorie kollidiert.
    7. Pro übernommener Änderung ein Audit-Eintrag (Aktion `sync_merge`, Objekt-Typ, lokale ID, Art `insert|update|tombstone`), ohne Inhalte.

- [ ] **Step 1: Tests** (zwei Test-DBs A und B, je eigener Versatz)
  - `test_merge_new_device_receives_everything`: B leer, merge(A-Snapshot) → B hat alle Zeilen von A, gleiche UUIDs und Inhalte.
  - `test_merge_newer_edit_wins_both_directions`.
  - `test_merge_equal_timestamp_tiebreak_is_symmetric`: A und B ändern dieselbe Beobachtung mit gleichem `updated_at`; nach Austausch in beide Richtungen identischer Inhalt.
  - `test_merge_delete_wins_over_newer_edit`.
  - `test_merge_cascade_drops_observation_of_deleted_student` (Spec-Beispiel Schüler X).
  - `test_merge_category_same_name_different_uuid_merges` → genau eine aktive Kategorie, auf beiden Seiten gleiche UUID.
  - `test_merge_category_rename_keeps_observations` (Review Focus 5).
  - `test_merge_unknown_parent_rolls_back`: Snapshot mit Schüler auf unbekannte Klassen-UUID → `Err`, Zeilenzahlen unverändert.
  - `test_merge_is_idempotent`: zweimal derselbe Snapshot → zweiter `MergeReport` alles 0 außer `skipped`.
  - `test_merge_writes_audit_without_content`: Audit-Details enthalten den Beobachtungstext nicht.
  - `test_replace_with_snapshot_discards_local`: B hat eigene Daten → danach exakt A-Stand.
- [ ] **Step 2–4:** FAIL → implementieren → PASS + Gesamtlauf.
- [ ] **Step 5:** ISA: A1, A3, A4 (jetzt Serverzeit), A5, A7 → `umgesetzt`; Commit `feat(sync): Zusammenführen pro Datensatz, Löschen gewinnt`.

### Task 7: Sicherung und Datei-Austausch auf neues Format

**Files:**
- Modify: `src-tauri/src/main.rs` (Befehle `export_all_data`, `import_full_backup`, `import_full_backup_data`, `export_changeset`, `export_changeset_to_file`, `import_changeset`, `import_changeset_data`, `import_changeset_from_file`), `src-tauri/src/database.rs` (`create_changeset_file`, `apply_changeset_file`, `merge_existing_observation`, `import_full_backup` entfernen bzw. auf neue Funktionen umleiten).
- Create: `src-tauri/src/legacy_import.rs`

**Interfaces:**
- Consumes: `Snapshot`, `encode/decode`, `merge_snapshot`, `derived_uuid`.
- Produces:
  - `pub fn legacy_to_snapshot(bytes: &[u8]) -> Result<Snapshot>`: liest alte Sicherungen (`format: "full_export"` mit `data.{classes,students,categories,observations}`) und alte `changeset_file_v1`; vergibt UUIDs per `derived_uuid` (gleiche Regel wie Task 2), Verweise über die alten Integer-IDs innerhalb der Datei aufgelöst.
  - Befehlsnamen und Parameter bleiben (Frontend unverändert lauffähig). `export_all_data` liefert `encode(snapshot)` als String; `days_back` wird ignoriert (immer vollständig) — Frontend-Auswahl dazu entfällt in Task 10. Import-Befehle: `decode` versuchen, sonst `legacy_to_snapshot`, dann `merge_snapshot`; Rückgabetext `"{inserted} neu, {updated} aktualisiert, {tombstoned} gelöscht"`.

- [ ] **Step 1: Tests:** `test_legacy_backup_matches_migrated_rows` (Legacy-DB aus Task 2 umstellen; ihre alte Sicherung einspielen → keine neuen Zeilen), `test_legacy_backup_into_empty_db` (alle Zeilen da), `test_legacy_changeset_import` (alte Changeset-Datei mit 2 Beobachtungen in passende DB → 0 neue, Bearbeitungen übernommen), `test_backup_roundtrip_new_format`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS. Alte Tests, die nur das entfernte Format prüfen (`test_sync_*changeset*`, `test_full_backup_operations`, `test_changeset_file_operations`, die 9 Tests von 2026-11-17 zu `update_observation`/Sync), auf das neue Format umschreiben oder löschen; jede Löschung im Commit-Text nennen.
- [ ] **Step 5:** ISA: Abschnitt 5.9 umgesetzt; Commit `feat(sync): Sicherung und Datei-Austausch im Snapshot-Format`.

### Task 8: WebDAV-Client: Serverzeit, ETag, sicheres Hochladen

**Files:**
- Modify: `src-tauri/src/webdav_sync.rs` (`WebDavClient`)

**Interfaces:**
- Consumes: `offset_from_date_header`.
- Produces (alle Methoden liefern zusätzlich den gemessenen Versatz, wenn ein `Date`-Header kam):
  - `pub struct DavResponse<T> { pub value: T, pub offset_ms: Option<i64> }`.
  - `pub async fn list_entries(&self) -> Result<DavResponse<Vec<DavEntry>>>`; `pub struct DavEntry { pub name: String, pub etag: Option<String> }` (PROPFIND Depth 1 mit `getetag`, `getlastmodified`; Ersatz-Kennung = `getlastmodified`, wenn `getetag` fehlt).
  - `pub async fn download(&self, name: &str) -> Result<DavResponse<Vec<u8>>>`.
  - `pub async fn upload_atomic(&self, name: &str, data: Vec<u8>) -> Result<DavResponse<()>>`: `PUT` auf `name + ".tmp"`, dann `MOVE` mit `Destination` (absolute URL) und `Overwrite: T`; antwortet der Server auf `MOVE` mit 405/501 → direkt `PUT name`, Temp-Datei löschen.
  - `pub async fn delete(&self, name: &str) -> Result<DavResponse<()>>` (vorhandenes `delete_file` umbenennen).
  - `test_connection` liefert `DavResponse<bool>`.

- [ ] **Step 1: Tests** mit lokalem Fake-Server (kleiner `tokio`-TCP-/`hyper`-freier HTTP-Responder im Testmodul, der feste Antworten mit `Date`-Header liefert; keine neue Abhängigkeit): `test_list_entries_parses_etags`, `test_offset_measured_from_date_header`, `test_upload_atomic_uses_move`, `test_upload_atomic_falls_back_without_move`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5:** Commit `feat(sync): WebDAV-Client misst Serverzeit, lädt atomar hoch`.

### Task 9: Abgleich-Ablauf, Geräterolle, Verdrahtung

**Files:**
- Create: `src-tauri/src/sync_engine.rs`
- Modify: `src-tauri/src/webdav_sync.rs` (`WebDavSyncManager` ruft nur noch `sync_engine::run_sync` auf; Start-, Intervall- und Beenden-Abgleich behalten), `src-tauri/src/main.rs` (die drei duplizierten Export/Import-Closures bei `configure_webdav`, `trigger_manual_sync` und Programmstart durch `run_sync` ersetzen; neue Befehle registrieren), `src-tauri/src/database.rs` (Getter/Setter für `sync_config`-Spalten aus Task 2).

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces:
  - `pub enum SyncOutcome { Synced(MergeReport), WaitingForLaptop, NoLaptopFound, NotConfigured }`.
  - `pub async fn run_sync(db: &Mutex<Database>, client: &WebDavClient) -> Result<SyncOutcome>` — Ablauf Spec 5.5 + 5.8:
    1. `list_entries`; Versatz übernehmen (`clock.set_offset_ms`, in `sync_config.clock_offset_ms` speichern).
    2. Fremde `snapshot_*.json` (nicht die eigene) laden, nur wenn ETag sich gegenüber `remote_etags` geändert hat; `decode`; Fehler → Datei überspringen und loggen (Review Focus 3).
    3. Rolle `desktop` und `first_sync_done == 0`: kein Laptop-Snapshot → `WaitingForLaptop` (wenn auch kein anderer Snapshot mit Rolle `laptop` und mindestens ein Desktop-Snapshot existiert → `NoLaptopFound`), **nichts hochladen**. Sonst: hat die DB fachliche Zeilen → Sicherung per `VACUUM INTO '<db>.vor-erstabgleich-<zeit>.bak'`; `replace_with_snapshot` mit dem Laptop-Snapshot mit größtem `generated_at`; danach die übrigen Snapshots normal `merge_snapshot`; `first_sync_done = 1`.
    4. Sonst: alle fremden Snapshots `merge_snapshot`; `first_sync_done = 1`.
    5. Eigenen Snapshot bauen; `sha256` mit `last_upload_hash` vergleichen; nur bei Änderung `upload_atomic`.
    6. Eigene alte `changeset_<device_id>_*.dat` löschen (A11).
    7. `update_last_sync_timestamp` mit `format_ts(clock.now())`; ETags speichern.
    - Datenbank-Sperre nie über Netzwerk-Aufrufe halten (Lock nur für DB-Schritte nehmen).
  - Rolle unbekannt (`device_role IS NULL`) → `run_sync` gibt `NotConfigured` zurück, ohne Netz-Schreibzugriffe.
  - Tauri-Befehle: `get_device_role() -> Option<String>`, `set_device_role(role: String)` (nur `"laptop"`/`"desktop"`, sonst Fehler), `trigger_manual_sync() -> SyncOutcome` (serialisiert als `{ "outcome": "synced"|"waiting_for_laptop"|"no_laptop_found"|"not_configured", "report"?: MergeReport }`), `get_webdav_sync_status` zusätzlich `clock_offset_ms`, `device_role`, `first_sync_done`, `last_outcome`.
  - Vorbelegung der Rolle für die Oberfläche: `get_device_role_suggestion() -> String` aus vorhandenem `device_type` (`notebook` → `laptop`, sonst `desktop`).

- [ ] **Step 1: Tests** (Fake-WebDAV aus Task 8 mit In-Memory-Dateien, zwei Test-DBs):
  - `test_laptop_then_desktop_end_to_end`: Laptop mit Daten synct; leerer Desktop synct → gleicher Stand; Desktop bearbeitet, beide syncen → Laptop hat Bearbeitung.
  - `test_desktop_waits_then_replaces_once` (Review Focus 4): Desktop mit veralteten Daten synct zuerst → `WaitingForLaptop`, keine Datei hochgeladen; Laptop synct; Desktop synct → Desktop == Laptop, Sicherungsdatei existiert; Desktop legt danach eigene Beobachtung an, synct erneut → wird zusammengeführt, nicht ersetzt.
  - `test_two_laptops_merge_without_replace`.
  - `test_two_desktops_report_no_laptop`.
  - `test_sync_without_server_leaves_data_untouched` (Review Focus 2): Client zeigt auf geschlossenen Port → `Err`, Daten unverändert, Versatz bleibt.
  - `test_sync_skips_corrupt_and_foreign_files` (Review Focus 3).
  - `test_unchanged_state_is_not_reuploaded`: zweiter Abgleich ohne Änderung → kein `PUT`.
  - `test_own_legacy_changesets_deleted`.
  - `test_delete_propagates_between_devices`: Laptop löscht Schüler endgültig → nach Abgleich auf Desktop Löschvermerk, Schüler unsichtbar.
- [ ] **Step 2–4:** FAIL → implementieren → PASS + Gesamtlauf; `cargo clippy` ohne neue Warnungen in neuen Modulen.
- [ ] **Step 5:** ISA: V1, V2, A6, A11 → `umgesetzt`; A2 → `umgesetzt`. Commit `feat(sync): Abgleich über Gesamtstände mit Geräterolle`.

### Task 10: Oberfläche: Pflichtauswahl und Synchronisation-Reiter

**Files:**
- Create: `src/components/layout/DeviceRoleGate.tsx`, `src/components/layout/__tests__/DeviceRoleGate.test.tsx`
- Modify: `src/App.tsx` (Gate um `AppShell`), `src/stores/appStore.ts` (Typen/Funktionen für neue Befehle), `src/pages/einstellungen/SynchronisationTab.tsx`, `src/pages/einstellungen/DatenTab.tsx` (Zeitraum-Auswahl der Sicherung entfernen), `src/pages/einstellungen/DatenschutzTab.tsx` (Texte), `src/components/layout/AppShell.tsx` (Status „Warte auf den Stand vom Laptop“), `src/dev/mockBackend.ts` (neue Befehle).

**Interfaces:**
- Consumes: Befehle aus Task 9.
- Produces: `DeviceRoleGate({ children })`: lädt `get_device_role`; `null` → Vollbild-Auswahl, sonst `children`.

Texte (verbindlich):
- Titel: „Welches Gerät ist das?“
- Option 1: „Laptop“ – „Hier sammeln Sie Beobachtungen. Dieser Stand ist maßgeblich.“
- Option 2: „Desktop“ – „Arbeitsplatzrechner. Übernimmt beim ersten Abgleich den Stand vom Laptop; Daten, die hier schon liegen, werden dabei ersetzt.“
- Knopf: „Weiter“ (deaktiviert ohne Auswahl).
- Statuszeile Desktop wartend: „Warte auf den Stand vom Laptop“; keine Laptops: „Kein Laptop gefunden. Bitte auf dem Laptop einmal synchronisieren.“

- [ ] **Step 1: Tests:** Gate zeigt Auswahl bei `null`, Vorbelegung aus `get_device_role_suggestion`, „Weiter“ ruft `set_device_role('laptop')` und zeigt danach Kinder; Synchronisation-Reiter zeigt Rolle, Uhrabweichung („Rechneruhr weicht 3 Sekunden von der Serverzeit ab“) und Wartestatus; Hinweis „Löschungen werden nicht übertragen“ kommt nicht mehr vor.
- [ ] **Step 2–4:** FAIL → implementieren → PASS; Screenshots bei 1400 und 800 px (Skript wie in früheren Seiten) ansehen.
- [ ] **Step 5:** Commit `feat(ui): Geräterolle als Pflichtauswahl, Sync-Reiter für neuen Abgleich`.

### Task 11: Abschluss: Probelauf mit Laptop-Kopie, Doku, Build

**Files:**
- Modify: `docs/ISA_SYNC.md`, `README.md` (Abschnitt „Synchronisation einrichten“: Reihenfolge Laptop zuerst, Rollen), `CHANGELOG.md`.

- [ ] **Step 1:** Probelauf der Umstellung an einer realistischen alten Datenbank: Legacy-DB mit ≥ 300 Beobachtungen über das Test-Hilfsmittel aus Task 2 erzeugen (alternativ, falls vom Auftraggeber bereitgestellt, eine Kopie der Laptop-DB — nie das Original), mit neuer Version starten, Zeilenzahlen und Stichproben vergleichen; Ergebnis in ISA §5 festhalten.
- [ ] **Step 2:** End-to-End im Browser mit Mock und mit zwei echten App-Instanzen gegen einen lokalen WebDAV-Server (`rclone serve webdav` oder Apache, falls verfügbar), Ablauf aus `test_desktop_waits_then_replaces_once` von Hand.
- [ ] **Step 3:** Vollständige Prüfungen: Rust-Gesamtlauf (keine neuen Fehlschläge), `npx tsc`, `npx eslint`, `npx vitest run`.
- [ ] **Step 4:** Windows-Build: `PATH=$HOME/.cargo/bin:$PATH npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --config '{"bundle":{"targets":["nsis"]}}'`.
- [ ] **Step 5:** ISA vollständig aktualisieren (alle Status, Datum). Commit `docs(sync): Abschluss Sync v2`, Push.
