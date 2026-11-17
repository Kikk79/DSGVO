# ISA Synchronisation – Anforderungen, Entscheidungen, Umsetzungsstand

Lebendes Dokument. Jede Änderung am Sync (Backend `src-tauri/src/database.rs`, `webdav_sync.rs`,
`main.rs`, Frontend `src/pages/einstellungen/SynchronisationTab.tsx`) wird hier nachgetragen:
Anforderung, Entscheidung, Status. Stand: 2026-11-17.

Status-Werte: `offen` · `in Arbeit` · `umgesetzt` · `verworfen`

## 1. Verbindliche Vorgaben (vom Auftraggeber festgelegt)

| ID | Vorgabe | Status |
|---|---|---|
| V1 | **Alle Daten werden übertragen:** Klassen, Schüler, Kategorien, Beobachtungen und alle weiteren fachlichen Daten. Ein neues Gerät ist nach dem ersten Abgleich vollständig, ohne Backup-Umweg. | umgesetzt (Gesamtstand-Datei `snapshot_<device_id>.json` mit allen vier Tabellen inkl. Löschvermerken; Abgleich in `sync_engine.rs`) |
| V2 | **Gemeinsame Zeitbasis:** Alle Geräte nutzen dieselbe Zeit für alle Zeitstempel, die beim Abgleich entscheiden; die lokale Rechneruhr ist nicht maßgeblich. Quelle: Uhrzeit des WebDAV-Servers (HTTP-`Date`), Entscheidung 2026-11-17 („egal woher, Hauptsache synchron“). | umgesetzt (Versatz aus HTTP-`Date` jeder Verzeichnisabfrage, gespeichert in `sync_config.clock_offset_ms`; alle Zeitstempel nach Serverzeit) |

## 2. Weitere Anforderungen (aus Analyse, umzusetzen)

| ID | Anforderung | Begründung | Status |
|---|---|---|---|
| A1 | Global eindeutige IDs (UUID) für alle synchronisierten Datensätze | Jedes Gerät zählt heute eigene Auto-Increment-IDs; Kollisionen führen dazu, dass fremde Datensätze stillschweigend nicht übernommen werden | umgesetzt (UUID in allen vier Tabellen; Zusammenführen über UUID in `merge.rs`) |
| A2 | Löschungen synchronisieren (Löschmarker/Tombstones) | Gelöschte Datensätze kommen heute vom anderen Gerät zurück | umgesetzt (Löschvermerke werden mit dem Gesamtstand übertragen; Löschen gewinnt immer, Kaskade auf abhängige Datensätze) |
| A3 | Import in einer Transaktion | Abgebrochener Import bleibt heute halb angewendet | umgesetzt (`merge.rs`: `merge_snapshot`/`replace_with_snapshot` je eine Transaktion; Fehler → Rollback, lokale Daten unverändert) |
| A4 | Konfliktregel: jüngere Fassung gewinnt, gemessen an V2-Zeit | heute last-writer-wins auf lokaler Uhr (`updated_at`) | umgesetzt (`merge.rs`: jüngeres `max(updated_at, deleted_at)` nach Serverzeit gewinnt, Gleichstand → größere `modified_by_device`; Zeitvergleich formatunabhängig) |
| A5 | Abhängigkeiten in richtiger Reihenfolge importieren (Klasse → Schüler → Beobachtung; Kategorien vor Beobachtungen) | Fremdschlüssel (`PRAGMA foreign_keys=ON`) lassen Importe sonst scheitern | umgesetzt (`merge.rs`: Kategorien → Klassen → Schüler → Beobachtungen; unbekannter Elternverweis → ganze Datei zurückgerollt) |
| A6 | Zeitpunkt des letzten erfolgreichen Abgleichs dauerhaft speichern | `update_last_sync_timestamp` wird nie aufgerufen; derzeit nur im Speicher des Sync-Managers | umgesetzt (`sync_config.last_sync_timestamp` nach jedem erfolgreichen Abgleich, Serverzeit) |
| A7 | Übernommene Fremdänderungen im Audit-Log protokollieren (ohne Inhalt) | heute nur auf dem Gerät, auf dem bearbeitet wurde | umgesetzt (`merge.rs`: `MergeReport.changes` + `log_merge_audit`: Aktion `sync_merge`, Objekt-Typ, lokale ID, Art – ohne Inhalt) |
| A8 | Kategorien: aktiv/inaktiv und Reihenfolge als Felder, die mit synchronisiert werden | Backend kann beides heute nicht; Oberfläche lässt es deshalb weg | offen |
| A9 | Schüler bearbeiten / Klasse wechseln, mit Sync | kein Backend-Befehl vorhanden | offen |
| A10 | Migration bestehender Datenbanken (vorhandene Integer-IDs → UUID, ohne Datenverlust) | Bestandsdaten bei Lehrkräften | umgesetzt (`sync_schema.rs`: Sicherung `*.vor-sync-v2-*.bak`, abgeleitete UUIDv5, eine Transaktion) |
| A11 | Aufräumen alter Änderungsdateien auf dem Server | Dateien werden heute nie gelöscht | umgesetzt (jedes Gerät löscht beim Abgleich seine eigenen `changeset_<device_id>_*.dat`; fremde Dateien bleiben unberührt) |
| A12 | Datenschutz: Server-Dateien enthalten Klartext; Hinweis in der Oberfläche aktuell halten, Verschlüsselung später prüfen | Verschlüsselung ist ausgebaut (ENCRYPTION_DISABLED.md) | offen |
| A13 | WebDAV-Passwort sicher ablegen (heute nur leicht verschleiert in der DB) | Datenschutz | offen |

## 3. Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-11-17 | V1 und V2 vom Auftraggeber festgelegt. |
| 2026-11-17 | Aufbau: jedes Gerät legt genau eine Datei mit seinem Gesamtstand ab, Zusammenführen pro Datensatz (Design: `docs/superpowers/specs/2026-11-17-sync-redesign-design.md`). |
| 2026-11-17 | Zeitquelle: Uhrzeit des WebDAV-Servers, kein NTP. |
| 2026-11-17 | Endgültiges Löschen gewinnt immer gegen Bearbeitungen, auch jüngere; Kaskade auf abhängige Datensätze. |
| 2026-11-17 | Laptop ist maßgeblich; vorhandene Workstation-Daten sind veraltet und werden beim **ersten** Abgleich durch den Laptop-Stand ersetzt (mit Sicherungskopie), danach normales Zusammenführen. |
| 2026-11-17 | Pflichtauswahl der Geräterolle Laptop/Desktop beim ersten Start; Desktop wartet beim ersten Abgleich auf einen Laptop-Stand und lädt bis dahin nichts hoch. |
| 2026-11-17 | Zusammenführen (Sync v2, `merge.rs`): Löschvermerk gewinnt immer; sonst jüngere Fassung nach Serverzeit, Gleichstand → lexikografisch größere `modified_by_device` (ersetzt für Sync v2 die Regel „Gleichstand → lokale Fassung bleibt“). Lokale Kinder eines übernommenen Löschvermerks (Schüler gelöschter Klassen, Beobachtungen gelöschter Schüler) werden ebenfalls inhaltslose Löschvermerke. |
| 2026-11-17 | Kategorien gleichen Namens mit verschiedener UUID werden zusammengelegt (kleinere UUID, Felder der jüngeren Fassung). Die verdrängte UUID verschwindet lokal **ohne** Löschvermerk: ein Löschvermerk würde auf einem Gerät, das die Zusammenlegung noch nicht kennt, die aktive Kategorie löschen (Löschen gewinnt immer); ohne Vermerk führen beide Geräte nach Austausch in beide Richtungen zum selben Stand. Namenstausch zweier Kategorien wird nicht als Zusammenlegung behandelt. |
| 2026-11-17 | Bearbeitete Beobachtungen: Import übernimmt die Fassung mit jüngerem `updated_at`; Übernahme nur, wenn `source_device_id` und `created_at` übereinstimmen (Schutz gegen ID-Kollision). Gleichstand → lokale Fassung bleibt. |
| 2026-11-17 | Sicherung und Datei-Austausch (5.9, umgesetzt): `export_all_data`, `export_changeset(_to_file)` schreiben immer den vollständigen Gesamtstand (`snapshot_v2`, Parameter `days_back` bleibt nur aus Kompatibilität und wird ignoriert). Alle Import-Befehle (`import_full_backup(_data)`, `import_changeset(_data/_from_file)`) lesen erst das neue Format, sonst alte Dateien (`full_export`, `changeset_file_v1`, `src-tauri/src/legacy_import.rs`) und führen über `merge_snapshot` zusammen; Rückgabe „N neu, N aktualisiert, N gelöscht“, danach Audit-Einträge. Alte Zeilen erhalten dieselbe `derived_uuid` wie bei der Datenbank-Umstellung (fehlende `source_device_id` = leer), treffen also vorhandene Zeilen statt sie zu verdoppeln. Alte Änderungsdateien enthalten nur Beobachtungen: ihre Schüler-IDs werden gegen die lokale Datenbank aufgelöst; Beobachtungen ohne lokalen Schüler werden übersprungen und im Ergebnistext gezählt. Entfernt: `import_full_backup`, `merge_existing_observation` (ID-basiert), altes Format der Änderungsdatei beim Einlesen. |
| 2026-11-17 | Abgleich über Gesamtstände (`src-tauri/src/sync_engine.rs`, `run_sync`), ausgelöst beim Start, alle 3 Minuten, beim Beenden und manuell (`trigger_manual_sync` → `{outcome, report?}`). Ablauf: Verzeichnis lesen und Versatz übernehmen; fremde `snapshot_*.json` nur bei geändertem ETag laden (gemerkt in `sync_config.remote_etags`, nur nach erfolgreichem Zusammenführen); unlesbare, manipulierte oder fremde Dateien werden übersprungen und protokolliert; zusammenführen; eigenen Stand nur hochladen, wenn sich der Inhalt (ohne `generated_at`) seit dem letzten Hochladen geändert hat (`last_upload_hash`) oder die Datei auf dem Server fehlt; eigene alte Änderungsdateien löschen; Zeitpunkt speichern. Geräterolle in `sync_config.device_role` (`get_device_role`/`set_device_role`, Vorschlag `get_device_role_suggestion` aus dem Gerätetyp); ohne Rolle findet kein Abgleich statt (`not_configured`). Desktop beim ersten Abgleich: ohne Laptop-Stand `waiting_for_laptop` (bzw. `no_laptop_found`, wenn nur Desktop-Stände vorliegen), nichts hochladen; sonst Sicherungskopie `<db>.vor-erstabgleich-<zeit>.bak` (entfällt ohne lokale Daten; Standard-Kategorien zählen nicht), Ersetzen durch den jüngsten Laptop-Stand, übrige Stände zusammenführen, `first_sync_done = 1`. Die Datenbank wird nie über Netzwerk-Aufrufe gesperrt; Abgleiche laufen nacheinander. Übernommene Änderungen landen im Audit-Log (Fehler dort brechen den Abgleich nicht ab). Der alte Änderungsdatei-Abgleich (`create_changeset_file`/`apply_changeset_file`) ist entfernt. |

## 4. Offene Fragen

- Keine (Stand 2026-11-17). Abgleich-Umfang: nur fachliche Daten, Audit-Log und Gerätekonfiguration nicht.

## 5. Bekannter Ist-Zustand (vor Umbau)

- Übertragen wurden nur Beobachtungen der letzten 30 Tage (Changeset-Dateien über WebDAV oder per Datei). Abgelöst durch den Abgleich über Gesamtstände (siehe Entscheidungen).
- Abgleich beim Start, alle 3 Minuten und beim Beenden; manuell über Einstellungen → Synchronisation.
- 13 vorbestehende Sync-/Changeset-/Backup-Tests in `database.rs` schlugen fehl (vor 2026-11-17 schon rot); seit Task 7 sind sie entfernt oder auf das neue Format umgeschrieben und grün.
