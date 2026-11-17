# ISA Synchronisation – Anforderungen, Entscheidungen, Umsetzungsstand

Lebendes Dokument. Jede Änderung am Sync (Backend `src-tauri/src/database.rs`, `webdav_sync.rs`,
`main.rs`, Frontend `src/pages/einstellungen/SynchronisationTab.tsx`) wird hier nachgetragen:
Anforderung, Entscheidung, Status. Stand: 2026-11-17.

Status-Werte: `offen` · `in Arbeit` · `umgesetzt` · `verworfen`

## 1. Verbindliche Vorgaben (vom Auftraggeber festgelegt)

| ID | Vorgabe | Status |
|---|---|---|
| V1 | **Alle Daten werden übertragen:** Klassen, Schüler, Kategorien, Beobachtungen und alle weiteren fachlichen Daten. Ein neues Gerät ist nach dem ersten Abgleich vollständig, ohne Backup-Umweg. | offen |
| V2 | **Gemeinsame Zeitbasis:** Alle Geräte nutzen dieselbe Zeit für alle Zeitstempel, die beim Abgleich entscheiden; die lokale Rechneruhr ist nicht maßgeblich. Quelle: Uhrzeit des WebDAV-Servers (HTTP-`Date`), Entscheidung 2026-11-17 („egal woher, Hauptsache synchron“). | offen |

## 2. Weitere Anforderungen (aus Analyse, umzusetzen)

| ID | Anforderung | Begründung | Status |
|---|---|---|---|
| A1 | Global eindeutige IDs (UUID) für alle synchronisierten Datensätze | Jedes Gerät zählt heute eigene Auto-Increment-IDs; Kollisionen führen dazu, dass fremde Datensätze stillschweigend nicht übernommen werden | offen |
| A2 | Löschungen synchronisieren (Löschmarker/Tombstones) | Gelöschte Datensätze kommen heute vom anderen Gerät zurück | offen |
| A3 | Import in einer Transaktion | Abgebrochener Import bleibt heute halb angewendet | offen |
| A4 | Konfliktregel: jüngere Fassung gewinnt, gemessen an V2-Zeit | heute last-writer-wins auf lokaler Uhr (`updated_at`) | teilweise (nur Beobachtungen, lokale Uhr) |
| A5 | Abhängigkeiten in richtiger Reihenfolge importieren (Klasse → Schüler → Beobachtung; Kategorien vor Beobachtungen) | Fremdschlüssel (`PRAGMA foreign_keys=ON`) lassen Importe sonst scheitern | offen |
| A6 | Zeitpunkt des letzten erfolgreichen Abgleichs dauerhaft speichern | `update_last_sync_timestamp` wird nie aufgerufen; derzeit nur im Speicher des Sync-Managers | teilweise |
| A7 | Übernommene Fremdänderungen im Audit-Log protokollieren (ohne Inhalt) | heute nur auf dem Gerät, auf dem bearbeitet wurde | offen |
| A8 | Kategorien: aktiv/inaktiv und Reihenfolge als Felder, die mit synchronisiert werden | Backend kann beides heute nicht; Oberfläche lässt es deshalb weg | offen |
| A9 | Schüler bearbeiten / Klasse wechseln, mit Sync | kein Backend-Befehl vorhanden | offen |
| A10 | Migration bestehender Datenbanken (vorhandene Integer-IDs → UUID, ohne Datenverlust) | Bestandsdaten bei Lehrkräften | offen |
| A11 | Aufräumen alter Änderungsdateien auf dem Server | Dateien werden heute nie gelöscht | offen |
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
| 2026-11-17 | Bearbeitete Beobachtungen: Import übernimmt die Fassung mit jüngerem `updated_at`; Übernahme nur, wenn `source_device_id` und `created_at` übereinstimmen (Schutz gegen ID-Kollision). Gleichstand → lokale Fassung bleibt. |

## 4. Offene Fragen

- Keine (Stand 2026-11-17). Abgleich-Umfang: nur fachliche Daten, Audit-Log und Gerätekonfiguration nicht.

## 5. Bekannter Ist-Zustand (vor Umbau)

- Übertragen werden nur Beobachtungen der letzten 30 Tage (Changeset-Dateien über WebDAV oder per Datei).
- Abgleich beim Start, alle 3 Minuten und beim Beenden; manuell über Einstellungen → Synchronisation.
- 13 vorbestehende Sync-/Changeset-/Backup-Tests in `database.rs` schlagen fehl (vor 2026-11-17 schon rot).
