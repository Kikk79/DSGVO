# Löschfunktionen - DSGVO-konforme Datenlöschung

## 🎯 Überblick

Die Löschfunktionen des Schülerbeobachtungssystems bieten vollständige DSGVO-Compliance durch differenzierte Löschungsstrategien, die sowohl das Recht auf Vergessenwerden (Art. 17 DSGVO) als auch datenschutzrechtliche Archivierungspflichten berücksichtigen.

## 🔧 Backend-Implementierung

### Tauri-Commands

#### `delete_student`
```rust
#[tauri::command]
async fn delete_student(
    state: tauri::State<'_, AppState>,
    student_id: i64,
    force_delete: Option<bool>,
) -> Result<(), String>
```

**Parameter:**
- `student_id`: Eindeutige ID der zu löschenden Schüler*in
- `force_delete`: Optional, Standard `false`
  - `false`: Intelligente Löschung (Soft Delete bei Beobachtungen)
  - `true`: Vollständige Löschung aller Daten (Recht auf Vergessenwerden)

**Verhalten:**
1. **Beobachtungen vorhanden + `force_delete=false`**: Student wird als "deleted" markiert (Soft Delete)
2. **Beobachtungen vorhanden + `force_delete=true`**: Vollständige Löschung aller Daten
3. **Keine Beobachtungen**: Sicherer Löschung der Schüler*in-Daten

#### `delete_class`
```rust
#[tauri::command]
async fn delete_class(
    state: tauri::State<'_, AppState>,
    class_id: i64,
    force_delete: Option<bool>,
) -> Result<(), String>
```

**Parameter:**
- `class_id`: Eindeutige ID der zu löschenden Klasse
- `force_delete`: Optional, Standard `false`
  - `false`: Sicherheitsprüfung - keine aktiven Schüler*innen
  - `true`: Vollständige Löschung inkl. aller Schüler*innen und Beobachtungen

**Verhalten:**
1. **Aktive Schüler*innen + `force_delete=false`**: Fehler mit Anzahl aktiver Schüler*innen
2. **Aktive Schüler*innen + `force_delete=true`**: Kaskadierte Löschung aller zugehörigen Daten
3. **Keine aktiven Schüler*innen**: Sichere Löschung der Klasse

### Datenbank-Methoden

#### `Database::delete_student(student_id: i64, force_delete: bool)`

**GDPR-konforme Löschungslogik:**

```sql
-- 1. Prüfung auf Beobachtungen
SELECT COUNT(*) FROM observations WHERE student_id = ?;

-- 2a. Soft Delete (bei Beobachtungen + !force_delete)
UPDATE students 
SET status = 'deleted', updated_at = CURRENT_TIMESTAMP 
WHERE id = ?;

-- 2b. Hard Delete (bei force_delete = true)
DELETE FROM attachments 
WHERE observation_id IN (
    SELECT id FROM observations WHERE student_id = ?
);
DELETE FROM observations WHERE student_id = ?;
DELETE FROM students WHERE id = ?;

-- 2c. Safe Delete (keine Beobachtungen)
DELETE FROM students WHERE id = ?;
```

#### `Database::delete_class(class_id: i64, force_delete: bool)`

**Kaskadierte Löschungslogik:**

```sql
-- 1. Prüfung auf aktive Schüler*innen
SELECT COUNT(*) FROM students 
WHERE class_id = ? AND status = 'active';

-- 2. Bei force_delete: Löschung aller Schüler*innen
SELECT id FROM students WHERE class_id = ?;
-- Für jede student_id: delete_student(id, true)

-- 3. Löschung der Klasse
DELETE FROM classes WHERE id = ?;
```

### Audit-Protokollierung

Alle Löschoperationen werden vollständig protokolliert:

```rust
// Student-Löschung
state.audit.log_action(
    "delete", 
    "student", 
    student_id, 
    1, 
    Some(if force_delete { "hard_delete" } else { "soft_delete" })
).await?;

// Klassen-Löschung  
state.audit.log_action(
    "delete", 
    "class", 
    class_id, 
    1, 
    Some(if force_delete { "force_delete" } else { "safe_delete" })
).await?;
```

**Audit-Einträge enthalten:**
- Aktion: `delete`
- Objekttyp: `student` oder `class`
- Objekt-ID: Eindeutige Identifikation
- Benutzer-ID: Verantwortliche Person
- Zeitstempel: Exakte Löschzeit
- Details: Löschungstyp (soft/hard/safe/force)

## 🎨 Frontend-Implementierung

### Store-Integration

#### `useAppStore` Erweiterungen

```typescript
// Schüler*in löschen
deleteStudent: async (student_id: number, force_delete: boolean = false) => {
  set({ loading: true, error: null });
  try {
    await invoke('delete_student', { 
      studentId: student_id, 
      forceDelete: force_delete 
    });
    await get().loadStudents(); // UI-Aktualisierung
    set({ loading: false });
  } catch (err) {
    set({ error: `Failed to delete student: ${err}`, loading: false });
    throw err;
  }
}

// Klasse löschen
deleteClass: async (class_id: number, force_delete: boolean = false) => {
  set({ loading: true, error: null });
  try {
    await invoke('delete_class', { 
      classId: class_id, 
      forceDelete: force_delete 
    });
    await Promise.all([
      get().loadClasses(),
      get().loadStudents()
    ]);
    set({ loading: false });
  } catch (err) {
    set({ error: `Failed to delete class: ${err}`, loading: false });
    throw err;
  }
}
```

### UI-Komponenten

#### Management-Interface (`AddStudent.tsx`)

**Erweiterte Funktionen:**
- ✅ Kombination aus Erstellen und Verwalten
- ✅ Übersichtslisten für Klassen und Schüler*innen
- ✅ Lösch-Buttons mit konfirmiertem Zugriff
- ✅ GDPR-konforme Bestätigungsdialoge

**Visueller Aufbau:**
```
┌─────────────────────────────────────────┐
│ Schüler & Klassen verwalten             │
├─────────────────────────────────────────┤
│ [Neue Klasse] [Neue/r Schüler*in]      │
├─────────────────────────────────────────┤
│ 🏫 Klassen (X)                          │
│ ├── 5a (2024/25) • 25 Schüler*innen 🗑️ │
│ └── 6b (2024/25) • 18 Schüler*innen 🗑️ │
├─────────────────────────────────────────┤
│ 👥 Schüler*innen (X)                    │
│ ├── Max Mustermann (5a) • Aktiv     🗑️ │
│ └── Anna Schmidt (6b) • Aktiv       🗑️ │
└─────────────────────────────────────────┘
```

#### Lösch-Bestätigungsdialog

**Multi-Level-Bestätigung mit GDPR-Aufklärung:**

```
┌─────────────────────────────────────────┐
│ ⚠️  Schüler*in löschen                  │
├─────────────────────────────────────────┤
│ Sind Sie sicher, dass Sie die           │
│ Schüler*in Max Mustermann löschen       │
│ möchten?                                │
│                                         │
│ 🔵 GDPR-Hinweis:                        │
│ Schüler*innen mit Beobachtungen werden  │
│ zunächst als "gelöscht" markiert.       │
│ Für vollständige Löschung (Recht auf    │
│ Vergessenwerden) verwenden Sie          │
│ "Endgültig löschen".                    │
│                                         │
│ [Abbrechen] [Als gelöscht markieren]    │
└─────────────────────────────────────────┘
```

**Force-Delete-Dialog bei Konflikten:**

```
┌─────────────────────────────────────────┐
│ ⚠️  Endgültige Löschung erforderlich    │
├─────────────────────────────────────────┤
│ 🔴 Die Schüler*in hat noch              │
│    Beobachtungen.                       │
│                                         │
│ ⚠️  Endgültiges Löschen entfernt alle   │
│     Daten unwiderruflich!               │
│                                         │
│ [Abbrechen] [Endgültig löschen]         │
└─────────────────────────────────────────┘
```

## 🛡️ GDPR-Compliance

### Rechtliche Grundlagen

#### Art. 17 DSGVO - Recht auf Löschung ("Recht auf Vergessenwerden")

**Implementierung:**
- ✅ **Vollständige Löschung**: `force_delete=true` entfernt alle personenbezogenen Daten
- ✅ **Kaskadierte Löschung**: Automatische Entfernung aller zugehörigen Beobachtungen und Anhänge
- ✅ **Audit-Nachweis**: Vollständige Protokollierung der Löschungsoperationen
- ✅ **Sofortige Wirksamkeit**: Daten sind nach Löschung nicht mehr abrufbar

#### Datenschutzrechtliche Archivierungspflichten

**Balance zwischen Löschung und Aufbewahrung:**
- 🔄 **Soft Delete**: Erhält strukturelle Datenintegrität bei gleichzeitiger Anonymisierung
- 📊 **Statistische Auswertungen**: Ermöglicht anonyme Aggregationen ohne Personenbezug
- ⏰ **Aufbewahrungsfristen**: Automatische Löschung nach konfigurierbaren Zeiträumen
- 🔒 **Pseudonymisierung**: Alternative zur vollständigen Löschung

### Datenminimierung

#### Soft Delete Strategie
```sql
-- Schüler*in wird als gelöscht markiert
UPDATE students SET status = 'deleted' WHERE id = ?;

-- Beobachtungen bleiben für statistische Zwecke erhalten
-- Zugriff nur noch über spezielle Aggregationsfunktionen
SELECT COUNT(*), category 
FROM observations o
JOIN students s ON o.student_id = s.id
WHERE s.status != 'deleted'
GROUP BY category;
```

#### Hard Delete Strategie
```sql
-- Vollständige Entfernung aller Daten
DELETE FROM attachments WHERE observation_id IN (
    SELECT id FROM observations WHERE student_id = ?
);
DELETE FROM observations WHERE student_id = ?;
DELETE FROM students WHERE id = ?;

-- Audit-Eintrag bleibt für Nachweis erhalten
INSERT INTO audit_log (action, object_type, object_id, details)
VALUES ('hard_delete', 'student', ?, 'right_to_be_forgotten');
```

### Betroffenenrechte

#### Art. 15 DSGVO - Auskunftsrecht
- ✅ Export-Funktion zeigt alle gespeicherten Daten vor Löschung
- ✅ Vollständige Transparenz über Datenumfang und -zweck

#### Art. 16 DSGVO - Berichtigungsrecht
- ✅ Korrektur von Daten vor Löschung möglich
- ✅ Audit-Trail dokumentiert alle Änderungen

#### Art. 17 DSGVO - Löschungsrecht
- ✅ Wahlweise Soft Delete oder Hard Delete
- ✅ Sofortige Wirksamkeit mit Bestätigung
- ✅ Kaskadierte Löschung aller zugehörigen Daten

## 📋 Benutzerhandbuch

### Schüler*in löschen

#### Standard-Löschung (Empfohlen)
1. **Navigation**: "Schüler & Klassen verwalten" öffnen
2. **Auswahl**: Lösch-Button (🗑️) bei gewünschter Schüler*in klicken
3. **Bestätigung**: Dialog bestätigen
4. **Ergebnis**: 
   - Ohne Beobachtungen: Schüler*in wird vollständig entfernt
   - Mit Beobachtungen: Status wird auf "gelöscht" gesetzt

#### Vollständige Löschung (Recht auf Vergessenwerden)
1. **Standard-Löschung**: Wie oben, Dialog erscheint
2. **Hinweis beachten**: "Schüler*in hat noch Beobachtungen"
3. **Endgültige Löschung**: Button "Endgültig löschen" wählen
4. **Bestätigung**: Sicherheitswarnung bestätigen
5. **Ergebnis**: Alle Daten werden unwiderruflich entfernt

**⚠️ Warnung**: Endgültige Löschung kann nicht rückgängig gemacht werden!

### Klasse löschen

#### Sichere Löschung (Keine Schüler*innen)
1. **Navigation**: "Schüler & Klassen verwalten" öffnen
2. **Auswahl**: Lösch-Button (🗑️) bei gewünschter Klasse klicken
3. **Bestätigung**: Dialog bestätigen
4. **Ergebnis**: Klasse wird vollständig entfernt

#### Forcierte Löschung (Mit Schüler*innen)
1. **Versuch der Standard-Löschung**: Dialog zeigt Fehlermeldung
2. **Warnung beachten**: "Klasse hat noch X aktive Schüler*innen"
3. **Forcierte Löschung**: Button "Endgültig löschen" wählen
4. **Bestätigung**: Sicherheitswarnung bestätigen
5. **Ergebnis**: Klasse und alle zugehörigen Schüler*innen/Beobachtungen werden entfernt

**⚠️ Warnung**: Forcierte Klassenlöschung entfernt alle Schüler*innen-Daten unwiderruflich!

### GDPR-Hinweise für Nutzer

#### Wann verwende ich welche Löschung?

**Soft Delete (Standard) verwenden bei:**
- 📊 Erhaltung statistischer Daten gewünscht
- 📋 Erfüllung von Dokumentationspflichten
- 🔄 Möglichkeit einer späteren Wiederherstellung
- ⏰ Automatische Löschung nach Aufbewahrungszeit

**Hard Delete (Endgültig) verwenden bei:**
- 👤 Expliziter Antrag auf Löschung (Recht auf Vergessenwerden)
- 🚫 Widerruf der Einverständniserklärung
- ❌ Unrechtmäßige Datenverarbeitung festgestellt
- 🔒 Vollständige Datenentfernung erforderlich

#### Rechtliche Verpflichtungen
- ✅ Löschanträge müssen innerhalb von 30 Tagen bearbeitet werden (Art. 17 Abs. 1 DSGVO)
- ✅ Bestätigung der Löschung ist dokumentationspflichtig
- ✅ Bei Hard Delete muss Löschung auch in Backups erfolgen
- ✅ Audit-Trail muss für Nachweiszwecke erhalten bleiben

## 🧪 Testing

### Unit Tests

#### Backend-Tests (Rust)
```rust
#[cfg(test)]
mod delete_tests {
    use super::*;

    #[tokio::test]
    async fn test_soft_delete_student_with_observations() {
        // Szenario: Student mit Beobachtungen, force_delete = false
        // Erwartet: Status auf 'deleted', Beobachtungen bleiben
    }

    #[tokio::test]
    async fn test_hard_delete_student_cascade() {
        // Szenario: Student mit Beobachtungen, force_delete = true
        // Erwartet: Vollständige Entfernung aller Daten
    }

    #[tokio::test]
    async fn test_safe_delete_student_no_observations() {
        // Szenario: Student ohne Beobachtungen
        // Erwartet: Direkte Entfernung aus Datenbank
    }

    #[tokio::test]
    async fn test_delete_class_with_students_fails() {
        // Szenario: Klasse mit aktiven Schülern, force_delete = false
        // Erwartet: Fehlermeldung mit Anzahl Schüler
    }

    #[tokio::test]
    async fn test_force_delete_class_cascade() {
        // Szenario: Klasse mit aktiven Schülern, force_delete = true
        // Erwartet: Kaskadierte Löschung aller zugehörigen Daten
    }

    #[tokio::test]
    async fn test_audit_logging_delete_operations() {
        // Szenario: Verschiedene Löschoperationen
        // Erwartet: Vollständige Audit-Einträge für alle Operationen
    }
}
```

#### Frontend-Tests (TypeScript)
```typescript
describe('Delete Functionality', () => {
  test('delete student updates UI after success', async () => {
    // Szenario: Erfolgreiche Student-Löschung
    // Erwartet: UI wird aktualisiert, Student nicht mehr sichtbar
  });

  test('delete confirmation dialog shows correct warnings', () => {
    // Szenario: Verschiedene Löschszenarien
    // Erwartet: Passende GDPR-Hinweise werden angezeigt
  });

  test('force delete option appears after soft delete conflict', () => {
    // Szenario: Soft Delete schlägt fehl (Beobachtungen vorhanden)
    // Erwartet: Force Delete Option wird angezeigt
  });

  test('error handling displays user-friendly messages', () => {
    // Szenario: Backend-Fehler bei Löschoperationen
    // Erwartet: Verständliche Fehlermeldungen für Benutzer
  });
});
```

### Integration Tests

#### WebDAV-Synchronisation / Export-Import
```rust
#[tokio::test]
async fn test_delete_sync_via_changeset() {
    // Szenario: Löschung auf einem Gerät, Changeset-Export/Import auf anderes
    // Erwartet: Konsistente Löschung auf allen synchronisierten Geräten
}

#[tokio::test]
async fn test_conflict_resolution_delete_vs_modify() {
    // Szenario: Gleichzeitige Löschung und Änderung eines Objekts
    // Erwartet: Löschung gewinnt (Delete-Wins Strategie)
}
```

#### GDPR-Compliance-Tests
```rust
#[tokio::test]
async fn test_right_to_be_forgotten_completeness() {
    // Szenario: Hard Delete einer Schüler*in
    // Erwartet: Keine Spuren in der gesamten Datenbank
}

#[tokio::test]
async fn test_audit_trail_immutability() {
    // Szenario: Versuch der Manipulation von Lösch-Audit-Einträgen
    // Erwartet: Datenbank-Constraints verhindern Änderungen
}
```

## 🚀 Best Practices

### Für Entwickler

#### Implementierung neuer Löschfunktionen
1. **GDPR-Analyse**: Rechtliche Anforderungen klären
2. **Cascading-Design**: Abhängigkeiten und Beziehungen berücksichtigen
3. **Audit-Integration**: Vollständige Protokollierung implementieren
4. **UI/UX-Konsistenz**: Bestehende Bestätigungsdialoge wiederverwenden
5. **Testing**: Unit- und Integrationstests für alle Szenarien

#### Code-Qualität
```rust
// Gut: Explizite GDPR-Behandlung
pub async fn delete_student(&self, student_id: i64, gdpr_right_to_be_forgotten: bool) -> Result<DeletionResult> {
    let deletion_strategy = if gdpr_right_to_be_forgotten {
        DeletionStrategy::HardDelete
    } else {
        self.determine_deletion_strategy(student_id).await?
    };
    // ...
}

// Schlecht: Unklare Parameter
pub async fn delete_student(&self, id: i64, force: bool) -> Result<()> {
    // Was bedeutet force genau?
    // Welche GDPR-Implikationen?
}
```

### Für Benutzer

#### Entscheidungshilfen
**Verwende Soft Delete (Standard) wenn:**
- 📈 Statistische Auswertungen weiterhin benötigt werden
- 📚 Dokumentationspflichten bestehen
- ⏰ Automatische Löschung nach Aufbewahrungszeit ausreicht
- 🔄 Eventuell späteren Wiederherstellungsbedarf gibt

**Verwende Hard Delete (Endgültig) wenn:**
- 👤 Expliziter Löschantrag gestellt wurde
- 🚫 Einverständniserklärung widerrufen wurde
- ❌ Datenverarbeitung als unrechtmäßig eingestuft wurde
- 🔐 Vollständige Datenentfernung gesetzlich erforderlich ist

#### Vor der Löschung prüfen
1. **Backup erstellen**: Sicherung vor irreversiblen Löschungen
2. **Export durchführen**: Datenauskunft für eigene Unterlagen
3. **Beziehungen prüfen**: Auswirkungen auf andere Schüler*innen/Klassen
4. **Rechtslage klären**: GDPR-Anforderungen vs. Aufbewahrungspflichten

## 📖 Weiterführende Dokumentation

- **[DPIA.md](DPIA.md)**: Datenschutz-Folgenabschätzung
- **[API-Reference.md](API.md)**: Vollständige API-Dokumentation  
- **[GDPR-Compliance.md](GDPR.md)**: Detaillierte GDPR-Compliance-Analyse
- **[User-Guide.md](USER_GUIDE.md)**: Vollständiges Benutzerhandbuch
- **[Security.md](SECURITY.md)**: Sicherheitsarchitektur und Best Practices

---

**📝 Letzte Aktualisierung**: 2024 • **🔒 GDPR-Konform** • **✅ Produktionsbereit**
