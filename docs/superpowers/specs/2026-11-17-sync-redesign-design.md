# Design: Synchronisation neu (Gesamtstand pro Gerät, gemeinsame Serverzeit)

Stand: 2026-11-17 · Bezug: `docs/ISA_SYNC.md` (V1, V2, A1–A13)

## 1. Zweck

Eine Lehrkraft sammelt Beobachtungen auf ihrem **Laptop** (Produktivdaten, einzige echte
Datenquelle) und arbeitet an ihrer **Workstation** mit denselben Daten weiter; danach soll der
Laptop wieder denselben Stand haben. Beide Geräte gleichen über einen WebDAV-Ordner ab.
Es ist eine Person auf zwei Geräten, abwechselnd; gleichzeitige Bearbeitung desselben
Eintrags ist selten.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- V1: Alle fachlichen Daten werden abgeglichen: Klassen, Schüler, Kategorien, Beobachtungen,
  inklusive Änderungen und Löschungen. Ein leeres Gerät ist nach einem Abgleich vollständig.
- V2: Alle Zeitstempel, die beim Abgleich entscheiden, beruhen auf einer gemeinsamen Zeit.
  **Entscheidung des Auftraggebers: Quelle ist die Uhrzeit des WebDAV-Servers** („egal woher,
  Hauptsache synchron“). Kein NTP.
- Bestehende Datenbank des Laptops wird ohne Datenverlust umgestellt.
- Server wächst nicht unbegrenzt.

**Nicht-Ziele (diese Runde)**
- Audit-Log und Gerätekonfiguration werden nicht abgeglichen.
- Sicheres Ablegen des WebDAV-Passworts (A13), Verschlüsselung der Server-Dateien (A12).
- Neue Bedienfunktionen (Schüler bearbeiten A9, Kategorie-Reihenfolge/aktiv in der Oberfläche A8).
  Die vorhandenen Felder `is_active`, `sort_order` werden aber mit abgeglichen.
- Android/Capacitor.
- Mehr als eine Person, Rechte, Mehrbenutzer.

**Anti-Ziele (gilt als gescheitert, auch wenn es technisch läuft)**
- Irgendein Datensatz des Laptops geht bei Umstellung oder Abgleich verloren.
- Gelöschte Einträge tauchen nach einem Abgleich wieder auf.
- Doppelte Klassen/Schüler/Kategorien durch den Abgleich.
- Ein halb angewendeter Import.
- Löschvermerke enthalten noch personenbezogene Inhalte (DSGVO Art. 17).

## 3. Rahmenbedingungen

- Tauri 2, Rust, SQLite über sqlx 0.7; Frontend und alle Befehle arbeiten mit Integer-IDs
  (`id INTEGER PRIMARY KEY AUTOINCREMENT`), Fremdschlüssel `students.class_id`,
  `observations.student_id`. Beobachtungen verweisen auf Kategorien **über den Namen**
  (`observations.category TEXT`).
- Heute: alle 3 Minuten, beim Start und beim Beenden wird eine `changeset_<device>_<zeit>.dat`
  mit Beobachtungen der letzten 30 Tage hochgeladen; jede fremde Datei wird bei jedem Abgleich
  neu importiert; Dateien werden nie gelöscht. Löschen ist teils hart (`DELETE`), teils Status
  `deleted` (Schüler), wird nicht übertragen.
- Geräte-ID: persistente UUIDv4 (`crypto.rs`).
- Datenmenge: eine Lehrkraft, wenige hundert bis tausend Beobachtungen.
- Beide Geräte müssen auf die neue Version aktualisiert werden. Eine alte Version darf neue
  Server-Dateien nicht kaputt importieren (heute: unbekanntes Format → Importfehler, harmlos;
  muss so bleiben).

## 4. Erwogene Ansätze (Auswahl durch Auftraggeber)

| Ansatz | Kern | Bewertung |
|---|---|---|
| **A. Gesamtstand pro Gerät** ✅ gewählt | Jedes Gerät hält genau eine Datei mit allen Datensätzen inkl. Löschvermerken; überschreibt sie bei jedem Abgleich; liest die Dateien der anderen und führt pro Datensatz zusammen | einfach, selbstheilend, Server wächst nicht, neues Gerät sofort vollständig; Datenmenge bei einer Lehrkraft unkritisch |
| B. Änderungsprotokoll | jede Änderung als eigene Datei | sparsamer, aber Aufräumregeln und Nachspielen nötig; hier unnötig |
| C. Eine gemeinsame DB-Datei | ganze Datenbank hochladen | Offline-Arbeit wird überschrieben; verworfen |

Zeitquelle: (1) nur NTP, (2) NTP mit WebDAV-Ersatz, (3) **nur WebDAV-Serverzeit ✅ gewählt**.

## 5. Entwurf

### 5.1 Eindeutige Kennungen (A1)
- Jede abgeglichene Tabelle (`classes`, `students`, `categories`, `observations`) bekommt eine
  Spalte `uuid TEXT NOT NULL UNIQUE`. Die Integer-`id` bleibt als lokaler Schlüssel; Frontend
  und Befehle bleiben unverändert.
- In Server-Dateien werden Datensätze und Verweise **nur über UUIDs** ausgedrückt
  (`class_uuid`, `student_uuid`). Beim Import wird auf die lokale Integer-ID übersetzt.
- Neue Datensätze erhalten beim Anlegen eine UUIDv4.
- **Bestehende Zeilen (Umstellung) erhalten eine abgeleitete UUID** (UUIDv5 aus
  Tabellenname, `source_device_id`, Integer-`id`, `created_at`). Bisher kopierte der Abgleich
  und das Einspielen von Sicherungen Zeilen mit unveränderter `id`, `created_at` und
  `source_device_id`; dieselbe Zeile bekommt so auf beiden Geräten dieselbe UUID und wird
  beim ersten Abgleich nicht verdoppelt. *(Entscheidung Umsetzung/Design)*
- Neue Spalte `modified_by_device` (Gerät der letzten Änderung) für den Gleichstand-Fall.
  *(Entscheidung Umsetzung/Design)*

### 5.2 Löschvermerke (A2)
- Jede abgeglichene Tabelle bekommt `deleted_at DATETIME NULL`.
- „Endgültig löschen“ (heute `DELETE`) wird zu: Inhalt leeren, `deleted_at` setzen
  (Beobachtung: `text=''`, `tags='[]'`; Schüler: Namen leeren; Klasse: Name leeren).
  Der Vermerk enthält nur UUID, Zeitstempel und Verweise, keine personenbezogenen Inhalte.
- Alle Lese-Abfragen filtern `deleted_at IS NULL`. Der Schüler-Status `deleted`
  („aus der Liste entfernen“) bleibt ein normales Feld und wird normal abgeglichen.
- Kaskaden (Klasse/Schüler endgültig löschen) setzen Vermerke auf alle abhängigen Datensätze.
- Löschvermerke bleiben dauerhaft (klein); Aufräumen ist nicht Teil dieser Runde.

### 5.3 Gemeinsame Zeit (V2)
- Neues Modul `sync_time`: hält einen Versatz `offset = Serverzeit − lokale Uhr`.
- Gemessen bei jeder WebDAV-Antwort aus dem HTTP-Header `Date`, korrigiert um die halbe
  Laufzeit der Anfrage. Gespeichert in der DB (überlebt Neustart), mit Zeitpunkt der Messung.
- **Alle** Zeitstempel in den abgeglichenen Tabellen (`created_at`, `updated_at`, `deleted_at`)
  werden von der App als `lokale Uhr + offset` in UTC (RFC 3339, Millisekunden) geschrieben,
  nicht mehr über SQL `CURRENT_TIMESTAMP`.
- Ohne Netz: zuletzt gespeicherter Versatz. Noch nie gemessen: Versatz 0.
- `Date` hat Sekundenauflösung; das reicht für eine Person auf zwei Geräten.

### 5.4 Server-Datei
- Pro Gerät genau eine Datei `snapshot_<device_id>.json` im WebDAV-Ordner.
- Inhalt: `format: "snapshot_v2"`, `schema_version`, `device_id`, `generated_at` (Serverzeit),
  alle Datensätze aller vier Tabellen inklusive Löschvermerke, Prüfsumme (SHA-256 wie heute).
- Hochladen erst unter temporärem Namen, dann per WebDAV `MOVE` auf den endgültigen Namen,
  damit das andere Gerät nie eine halbe Datei liest. (Unterstützt der Server `MOVE` nicht:
  direkt `PUT`; die Prüfsumme erkennt halbe Dateien, Import wird dann übersprungen.)
- Alte `changeset_<eigene device_id>_*.dat` löscht jedes Gerät nach erfolgreicher Umstellung
  selbst (A11). Fremde alte Dateien werden ignoriert.

### 5.5 Abgleich-Ablauf
1. Fremde `snapshot_*.json` herunterladen (nur wenn geändert: ETag/`getlastmodified` merken).
2. Je Datei: Prüfsumme prüfen, dann Zusammenführen in **einer Transaktion** (A3); Reihenfolge
   Kategorien → Klassen → Schüler → Beobachtungen (A5).
3. Pro Datensatz (über UUID):
   - unbekannt → anlegen (auch als Löschvermerk);
   - bekannt → die Fassung mit jüngerem `max(updated_at, deleted_at)` gewinnt; bei exakt
     gleichem Zeitstempel gewinnt die lexikografisch größere `modified_by_device`
     (alle Geräte kommen so zum selben Ergebnis);
   - **Endgültiges Löschen gewinnt immer** (Entscheidung Auftraggeber): ein Löschvermerk
     gewinnt gegen jede Fassung, auch eine jüngere. Ein gelöschter Datensatz kommt nie zurück.
   - Kaskade: Ein übernommener oder neuer Datensatz, dessen Elternteil (Schüler → Klasse,
     Beobachtung → Schüler) lokal einen Löschvermerk hat, wird nur als Löschvermerk gespeichert,
     ohne Inhalt. Beispiel: Schüler X am Laptop gelöscht, an der Workstation danach eine
     Beobachtung zu X ergänzt → die Beobachtung wird verworfen.
4. Verweis auf unbekannte UUID (z. B. Schüler fehlt) → ganzer Import dieser Datei wird
   zurückgerollt und als Fehler gemeldet (darf durch Schritt 2 nicht vorkommen).
5. Jede übernommene Änderung bekommt einen Audit-Eintrag ohne Inhalt (A7).
6. Eigenen Gesamtstand schreiben und hochladen (5.4).
7. Zeitpunkt des erfolgreichen Abgleichs in der DB speichern (A6).
- Auslöser wie heute: Start, alle 3 Minuten, Beenden, manuell.
  Hochladen nur, wenn sich seit dem letzten Hochladen lokal etwas geändert hat.

### 5.6 Kategorien
- Kategorien werden über UUID abgeglichen. Name ist lokal `UNIQUE`.
- Kommt eine fremde Kategorie mit unbekannter UUID, deren Name lokal schon existiert,
  gilt sie als **dieselbe Kategorie**: die beiden Datensätze werden zusammengelegt; behalten
  wird die lexikografisch kleinere UUID, damit beide Geräte gleich entscheiden.
- `UNIQUE` auf dem Namen gilt nur für nicht gelöschte Kategorien (partieller Index
  `WHERE deleted_at IS NULL`). Gelöschte Kategorien behalten ihren Namen und nehmen an der
  Zusammenlegung nach Namen nicht teil. Führt eine übernommene Umbenennung zu einem
  Namen, den lokal eine andere aktive Kategorie trägt, gilt dieselbe Zusammenlegungsregel.
  *(Entscheidung Umsetzung/Design)*
- Beobachtungen verweisen weiter über den Namen. Umbenennen einer Kategorie benennt in dieser
  Runde die Beobachtungen nicht mit um (Verhalten wie heute).

### 5.7 Umstellung bestehender Datenbanken (A10)
- Beim ersten Start der neuen Version, vor jeder Änderung: Kopie der Datenbankdatei als
  `<name>.vor-sync-v2-<zeitstempel>.bak` neben der Datenbank. Schlägt das Kopieren fehl,
  startet die Umstellung nicht.
- In einer Transaktion: Spalten `uuid`, `deleted_at` anlegen; jeder vorhandenen Zeile eine
  neue UUID geben; Zeitstempel unverändert lassen. Wiederholbar (bereits umgestellt → nichts tun).
- Nachweis vor Auslieferung: Umstellung gegen eine Kopie einer realistisch befüllten alten
  Datenbank testen (gleiche Zeilenzahl und Inhalte vorher/nachher).

### 5.8 Erster Abgleich der Workstation
Entscheidung Auftraggeber: Daten, die heute auf der Workstation liegen, sind veraltet und
dürfen weg. Maßgeblich ist der Laptop.

- Hat ein Gerät lokal Daten, hat noch nie mit diesem WebDAV-Ordner abgeglichen, und liegen dort
  Gesamtstände anderer Geräte, wird **nicht automatisch** abgeglichen. Die App fragt:
  - „Stand vom Server übernehmen“: lokale Daten werden verworfen und durch den Stand vom Server
    ersetzt. Vorher wird die Datenbankdatei als Kopie gesichert (wie 5.7).
  - „Zusammenführen“: normaler Abgleich.
  - „Abbrechen“: kein Abgleich.
  Die Rückfrage zeigt, von welchem Gerät der Server-Stand stammt (Gerätename, Zeitpunkt,
  Anzahl Schüler und Beobachtungen), damit erkennbar ist, dass es der Laptop ist.
- Leeres Gerät: ohne Rückfrage übernehmen.
- Schutz des Laptops: Nichts löscht lokale Daten ohne diese ausdrückliche Wahl. Empfohlene
  Reihenfolge bei der Einführung: **zuerst den Laptop aktualisieren und abgleichen**, dann die
  Workstation. In der Anleitung und im Release-Hinweis festhalten.
- Das Ersetzen gibt es **nur beim ersten Abgleich** eines Geräts mit diesem WebDAV-Ordner
  (Entscheidung Auftraggeber). Danach wird immer normal pro Datensatz zusammengeführt;
  eine spätere Aktion „Stand vom Server übernehmen“ gibt es nicht.

### 5.9 Datei-Austausch und Sicherungen
- „Austausch per Datei“ (Einstellungen → Synchronisation) nutzt dasselbe Snapshot-Format und
  denselben Zusammenführungs-Code.
- Sicherung (`export_all_data`) enthält UUIDs und Löschvermerke; „Sicherung einspielen“ nutzt
  denselben Zusammenführungs-Code. Alte Sicherungen ohne UUIDs bleiben einspielbar;
  ihre Zeilen bekommen dieselbe abgeleitete UUID wie in 5.1 und treffen so auf vorhandene
  Zeilen statt sie zu verdoppeln. *(Entscheidung Umsetzung/Design)*

### 5.10 Oberfläche
- Synchronisation-Reiter: Texte an neuen Umfang anpassen (alles wird abgeglichen, Löschungen
  werden übertragen), Hinweis „Löschungen werden nicht übertragen“ entfernen, Abweichung der
  Rechneruhr zur Serverzeit anzeigen, Rückfrage aus 5.8.
- `docs/ISA_SYNC.md` im selben Zug aktualisieren.

## 6. Dem Umsetzer überlassen
- Tabellen- und Funktionsaufteilung im Rust-Code, Namen.
- Ob `merge_existing_observation` / `apply_changeset_file` ersetzt oder umgebaut werden.
- Umgang mit der Tabelle `attachments` (heute ungenutzt): nicht abgleichen.
- Testaufbau; Pflicht sind Tests für: Umstellung ohne Datenverlust, Zusammenführen in beide
  Richtungen, Löschvermerke, gleicher Zeitstempel, Kategorie-Namensgleichheit, abgebrochener
  Import, Zeitversatz-Messung.
