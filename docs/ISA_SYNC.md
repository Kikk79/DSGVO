# ISA Synchronisation – Anforderungen, Entscheidungen, Umsetzungsstand

Lebendes Dokument. Jede Änderung am Sync (Backend `src-tauri/src/database.rs`, `webdav_sync.rs`,
`main.rs`, Frontend `src/pages/einstellungen/SynchronisationTab.tsx`) wird hier nachgetragen:
Anforderung, Entscheidung, Status. Stand: 2026-11-17.

Status-Werte: `offen` · `in Arbeit` · `umgesetzt` · `verworfen`

## 1. Verbindliche Vorgaben (vom Auftraggeber festgelegt)

| ID | Vorgabe | Status |
|---|---|---|
| V1 | **Alle Daten werden übertragen:** Klassen, Schüler, Kategorien, Beobachtungen und alle weiteren fachlichen Daten. Ein neues Gerät ist nach dem ersten Abgleich vollständig, ohne Backup-Umweg. | offen |
| V2 | **Gemeinsame Zeitbasis über einen Zeitserver:** Die App holt die Uhrzeit von einem Zeitserver (NTP) und nutzt diese Zeit für alle Zeitstempel, die beim Abgleich entscheiden. Die lokale Rechneruhr ist dafür nicht maßgeblich. | offen |

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
| 2026-11-17 | Bearbeitete Beobachtungen: Import übernimmt die Fassung mit jüngerem `updated_at`; Übernahme nur, wenn `source_device_id` und `created_at` übereinstimmen (Schutz gegen ID-Kollision). Gleichstand → lokale Fassung bleibt. |

## 4. Offene Fragen

- V2: Welcher Zeitserver (z. B. `pool.ntp.org`, PTB `ptbtime1.ptb.de`, Schulserver)? Verhalten ohne Netz: lokale Uhr plus zuletzt gemessene Abweichung verwenden und Zeitstempel als „unsicher“ markieren?
- V1: Werden auch Audit-Log und Gerätekonfiguration übertragen, oder nur fachliche Daten?
- Zeitraum: Heute werden nur Beobachtungen der letzten 30 Tage übertragen. Mit V1 Vollabgleich beim ersten Mal, danach nur Änderungen?

## 5. Bekannter Ist-Zustand (vor Umbau)

- Übertragen werden nur Beobachtungen der letzten 30 Tage (Changeset-Dateien über WebDAV oder per Datei).
- Abgleich beim Start, alle 3 Minuten und beim Beenden; manuell über Einstellungen → Synchronisation.
- 13 vorbestehende Sync-/Changeset-/Backup-Tests in `database.rs` schlagen fehl (vor 2026-11-17 schon rot).
