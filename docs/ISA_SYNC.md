# ISA Synchronisation – Anforderungen, Entscheidungen, Umsetzungsstand

Lebendes Dokument. Jede Änderung am Sync (Backend `src-tauri/src/database.rs`, `webdav_sync.rs`,
`main.rs`, Frontend `src/pages/einstellungen/SynchronisationTab.tsx`) wird hier nachgetragen:
Anforderung, Entscheidung, Status. Stand: 2026-11-18.

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
| 2026-11-17 | Bearbeitete Beobachtungen: Import übernimmt die Fassung mit jüngerem `updated_at`; Übernahme nur, wenn `source_device_id` und `created_at` übereinstimmen (Schutz gegen ID-Kollision). Gleichstand → lexikografisch größere `modified_by_device` gewinnt (gleiche Regel wie oben; die frühere Regel „Gleichstand → lokale Fassung bleibt“ gilt seit Sync v2 nicht mehr). |
| 2026-11-17 | Sicherung und Datei-Austausch (5.9, umgesetzt): `export_all_data`, `export_changeset(_to_file)` schreiben immer den vollständigen Gesamtstand (`snapshot_v2`, Parameter `days_back` bleibt nur aus Kompatibilität und wird ignoriert). Alle Import-Befehle (`import_full_backup(_data)`, `import_changeset(_data/_from_file)`) lesen erst das neue Format, sonst alte Dateien (`full_export`, `changeset_file_v1`, `src-tauri/src/legacy_import.rs`) und führen über `merge_snapshot` zusammen; Rückgabe „N neu, N aktualisiert, N gelöscht“, danach Audit-Einträge. Alte Zeilen erhalten dieselbe `derived_uuid` wie bei der Datenbank-Umstellung (fehlende `source_device_id` = leer), treffen also vorhandene Zeilen statt sie zu verdoppeln. Alte Änderungsdateien enthalten nur Beobachtungen: ihre Schüler-IDs werden gegen die lokale Datenbank aufgelöst; Beobachtungen ohne lokalen Schüler werden übersprungen und im Ergebnistext gezählt. Entfernt: `import_full_backup`, `merge_existing_observation` (ID-basiert), altes Format der Änderungsdatei beim Einlesen. |
| 2026-11-17 | Abgleich über Gesamtstände (`src-tauri/src/sync_engine.rs`, `run_sync`), ausgelöst beim Start, alle 3 Minuten, beim Beenden und manuell (`trigger_manual_sync` → `{outcome, report?}`). Ablauf: Verzeichnis lesen und Versatz übernehmen; fremde `snapshot_*.json` nur bei geändertem ETag laden (gemerkt in `sync_config.remote_etags`, nur nach erfolgreichem Zusammenführen); unlesbare, manipulierte oder fremde Dateien werden übersprungen und protokolliert; zusammenführen; eigenen Stand nur hochladen, wenn sich der Inhalt (ohne `generated_at`) seit dem letzten Hochladen geändert hat (`last_upload_hash`) oder die Datei auf dem Server fehlt; eigene alte Änderungsdateien löschen; Zeitpunkt speichern. Geräterolle in `sync_config.device_role` (`get_device_role`/`set_device_role`, Vorschlag `get_device_role_suggestion` aus dem Gerätetyp); ohne Rolle findet kein Abgleich statt (`not_configured`). Desktop beim ersten Abgleich: ohne Laptop-Stand `waiting_for_laptop` (bzw. `no_laptop_found`, wenn nur Desktop-Stände vorliegen), nichts hochladen; sonst Sicherungskopie `<db>.vor-erstabgleich-<zeit>.bak` (entfällt ohne lokale Daten; Standard-Kategorien zählen nicht), Ersetzen durch den jüngsten Laptop-Stand, übrige Stände zusammenführen, `first_sync_done = 1`. Die Datenbank wird nie über Netzwerk-Aufrufe gesperrt; Abgleiche laufen nacheinander. Übernommene Änderungen landen im Audit-Log (Fehler dort brechen den Abgleich nicht ab). Der alte Änderungsdatei-Abgleich (`create_changeset_file`/`apply_changeset_file`) ist entfernt. |
| 2026-11-18 | Vorschlag der Geräterolle (`get_device_role_suggestion` → `Option<String>`) nur bei ausdrücklich gesetztem Gerätetyp: `notebook` → Laptop, `computer` → Desktop; sonst kein Vorschlag und keine Vorbelegung in der Pflichtauswahl. Grund: eine Vorbelegung „Desktop“ auf dem Gerät mit den echten Daten hätte diese beim ersten Abgleich ersetzt. Auswahl und Reiter „Synchronisation“ sagen ausdrücklich, dass Desktop beim ersten Abgleich alles auf dem Gerät ersetzt; beim Wechsel zu Desktop hängt der Hinweis von `first_sync_done` ab (danach wird nichts mehr ersetzt). Nach `set_device_role` startet sofort ein Abgleich im Hintergrund, falls WebDAV eingerichtet ist. |
| 2026-11-18 | Desktop vor dem ersten Abgleich: Reiter „Synchronisation“ und Statuszeile der Seitenleiste (sichtbar und als Tooltip) warnen, dass Einträge auf diesem Gerät beim ersten Abgleich verloren gehen, und bitten, noch nichts zu erfassen. Kein technischer Schutz (Sperren der Eingabe), nur Warnung. |
| 2026-11-18 | Automatische Sicherungskopien (`*.vor-sync-v2-*.bak`, `*.vor-erstabgleich-*.bak`) enthalten alle Daten unverschlüsselt: Reiter „Datenschutz“ nennt sie (was, wo, warum) mit Pfad, Größe, Zeitpunkt (`list_safety_backups`) und löscht sie nach Rückfrage (`delete_safety_backups`; nur diese beiden Namensmuster mit dem Dateinamen der Datenbank im Ordner der Datenbank, nur reguläre Dateien, nie die Datenbank selbst). Kein automatisches Löschen. |
| 2026-11-18 | Abgleich beim Schließen des Fensters: nur, wenn gerade kein Abgleich läuft (`try_lock` auf die Abgleich-Sperre, sonst übersprungen), höchstens 10 Sekunden (`tokio::time::timeout`); Überspringen und Abbruch werden protokolliert. Ein abgebrochener Abgleich rollt seine Transaktion zurück; der nächste Start holt ihn nach. |
| 2026-11-18 | Gesamtstand: Beobachtungen werden nur mit Schülern exportiert, die selbst in der Datei stehen (also mit vorhandener Klasse); übrige zählen als Waisen (`snapshot_orphan_counts`). Vorher scheiterte beim Empfänger das Zusammenführen des ganzen Laptop-Stands. |
| 2026-11-18 | Startfehler der Datenbank (z.B. Umstellung bricht wegen unerwarteter Spalten ab): kein Panic mehr, sondern Fehlermeldung (Daten unverändert, Pfad der Datenbank), Erklärung als `schuelerbeobachtung-startfehler.txt` neben der Datenbank, Beenden mit Code 1. |
| 2026-11-18 | Sicherungen aus dieser Version (`snapshot_v2`-Hülle) werden im Reiter „Daten“ erkannt und zusammengefasst (gezählt werden Einträge ohne Löschvermerk); alte `full_export`-Dateien bleiben lesbar. |

## 4. Offene Fragen

- Keine (Stand 2026-11-18). Abgleich-Umfang: nur fachliche Daten, Audit-Log und Gerätekonfiguration nicht.
- Außerhalb von Sync v2, weiterhin `offen`: A8, A9, A12, A13.

### Akzeptierte Restrisiken (Stand 2026-11-18)

- **Alte Änderungsdateien:** Beim Import einer alten Änderungsdatei (`changeset_file_v1`) werden Schüler-IDs lokal aufgelöst (die Datei enthält nur Beobachtungen). Stimmen die lokalen IDs nicht mit denen des Absenders überein, kann eine Beobachtung dem falschen Schüler zugeordnet oder übersprungen werden.
- **Sehr alte Sicherungen** ohne `source_device_id` können beim Import Klassen und Schüler doppelt anlegen, weil die abgeleitete UUID dann nicht mit der vorhandenen übereinstimmt. Doppelte lassen sich in der Oberfläche löschen.
- **Verwaiste Zeilen** (z.B. Beobachtung ohne Schüler, Schüler ohne Klasse in der Altdatenbank) werden nicht übertragen.

## 5. Bekannter Ist-Zustand (vor Umbau)

- Übertragen wurden nur Beobachtungen der letzten 30 Tage (Changeset-Dateien über WebDAV oder per Datei). Abgelöst durch den Abgleich über Gesamtstände (siehe Entscheidungen).
- Abgleich beim Start, alle 3 Minuten und beim Beenden; manuell über Einstellungen → Synchronisation.
- 13 vorbestehende Sync-/Changeset-/Backup-Tests in `database.rs` schlugen fehl (vor 2026-11-17 schon rot); seit Task 7 sind sie entfernt oder auf das neue Format umgeschrieben und grün.

### Probelauf der Umstellung (2026-11-18)

Keine Kopie der echten Laptop-Datenbank verfügbar; stattdessen realistische Altdatenbank über das Legacy-Schema (Test `sync_engine::tests::test_rehearsal_migration_300_observations`, `cargo test --bin schuelerbeobachtung test_rehearsal -- --ignored --nocapture`): 3 Klassen, 30 Schüler (1 `deleted`), 8 Kategorien mit eigenen Farben (1 inaktiv), 320 Beobachtungen, gemischte Zeitstempelformate (`CURRENT_TIMESTAMP`, RFC 3339 mit `Z`/Offset/Millisekunden), Apostrophe, Umlaute, Zeilenumbrüche.

| Prüfung | Ergebnis |
|---|---|
| Zeilenzahlen vorher/nachher (classes/students/categories/observations) | 3 / 30 / 8 / 320, unverändert |
| SHA-256 über alle fachlichen Altspalten je Tabelle (Speichertyp inkl.) | identisch vor/nach Umstellung |
| UUID | in jeder Zeile gesetzt und eindeutig; Schüler mit Status `deleted`: 1 (erhalten) |
| Sicherungskopie `.vor-sync-v2-*.bak` | 1 Datei (114 688 Bytes), öffnet, Prüfsummen = Vorzustand |
| Dauer der Umstellung | 47 ms |
| Laptop → Desktop (Fake-WebDAV) | Gesamtstand 130 741 Bytes; Desktop gleich Laptop (30 Schüler, 320 Beobachtungen), Sicherungskopie `.vor-erstabgleich-*.bak` vorhanden; zweiter Lauf auf beiden Seiten: 0 Änderungen |

### Echter WebDAV-Server (2026-11-18)

Test `sync_engine::tests::test_real_webdav_roundtrip` (`#[ignore]`, URL aus `SYNC_E2E_WEBDAV_URL`) fährt Laptop/Desktop-Ablauf (Desktop wartet, Ersetzen, Bearbeiten, Löschweitergabe) gegen einen echten Server. Gleicher Ablauf läuft ohne Server gegen den Fake (`test_roundtrip_scenario_against_fake_dav`, grün). **Gegen einen echten Server nicht ausgeführt:** in der Build-Umgebung ließ sich wsgidav nicht installieren (kein pip/ensurepip, Nachladen von pip verweigert). Vor Auslieferung einmal gegen den echten Server (z.B. Nextcloud oder `wsgidav --host 127.0.0.1 --port 8765 --root <dir> --auth anonymous`) ausführen.

