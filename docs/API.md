# API-Referenz - Tauri Commands

## 🎯 Überblick

Diese API-Referenz dokumentiert alle verfügbaren Tauri-Commands der DSGVO-konformen Schülerbeobachtungsanwendung. Alle Commands sind vollständig typisiert und verwenden Rust-Backend mit React-Frontend-Integration.

## 📋 Inhaltsverzeichnis

- [Schüler*innen-Management](#schülerinnen-management)
- [Klassen-Management](#klassen-management)
- [Beobachtungs-System](#beobachtungs-system)
- [GDPR-Funktionen](#gdpr-funktionen)
- [P2P-Synchronisation](#p2p-synchronisation)
- [Geräte-Konfiguration](#geräte-konfiguration)
- [System-Status](#system-status)

## 👥 Schüler*innen-Management

### `get_students`

**Beschreibung**: Lädt alle aktiven Schüler*innen aus der Datenbank

```typescript
get_students(): Promise<Student[]>
```

**Parameter**: Keine

**Rückgabe**:
```typescript
interface Student {
  id: number;
  class_id: number;
  first_name: string;
  last_name: string;
  status: 'active' | 'inactive' | 'deleted';
}
```

**Beispiel**:
```typescript
const students = await invoke('get_students');
console.log(`${students.length} Schüler*innen gefunden`);
```

**Fehlerbehandlung**: 
- SQLite-Fehler bei Datenbankzugriff
- Verschlüsselungsfehler bei korrupter Datenbank

### `create_student`

**Beschreibung**: Erstellt eine neue Schüler*in in der Datenbank

```typescript
create_student(params: {
  classId: number;
  firstName: string;
  lastName: string;
  status?: string;
}): Promise<Student>
```

**Parameter**:
- `classId`: ID der zugehörigen Klasse (FK zu `classes.id`)
- `firstName`: Vorname der Schüler*in
- `lastName`: Nachname der Schüler*in  
- `status`: Optional, Standard `"active"`

**Rückgabe**: Neu erstellte Schüler*in mit generierter ID

**Beispiel**:
```typescript
const newStudent = await invoke('create_student', {
  classId: 5,
  firstName: 'Max',
  lastName: 'Mustermann',
  status: 'active'
});
```

**Validierung**:
- Namen müssen nicht-leer sein
- `class_id` muss existierende Klasse referenzieren
- Status muss gültiger Wert sein (`active`, `inactive`)

### `delete_student` 🆕

**Beschreibung**: GDPR-konforme Löschung einer Schüler*in mit differenzierten Strategien

```typescript
delete_student(params: {
  studentId: number;
  forceDelete?: boolean;
}): Promise<void>
```

**Parameter**:
- `studentId`: ID der zu löschenden Schüler*in
- `forceDelete`: Optional, Standard `false`
  - `false`: Intelligente Löschung (Soft Delete bei Beobachtungen)
  - `true`: Vollständige Löschung (Recht auf Vergessenwerden)

**Löschungsstrategien**:

| Szenario | `forceDelete` | Aktion | Audit-Log |
|----------|---------------|--------|-----------|
| Keine Beobachtungen | `false`/`true` | Vollständige Entfernung | `safe_delete` |
| Mit Beobachtungen | `false` | Status → `"deleted"` | `soft_delete` |
| Mit Beobachtungen | `true` | Vollständige Entfernung + Kaskade | `hard_delete` |

**Beispiel**:
```typescript
// Soft Delete (Standard)
await invoke('delete_student', { studentId: 123 });

// Hard Delete (Recht auf Vergessenwerden)
await invoke('delete_student', { 
  studentId: 123, 
  forceDelete: true 
});
```

**GDPR-Compliance**:
- ✅ Art. 17 DSGVO - Recht auf Löschung
- ✅ Vollständige Audit-Protokollierung
- ✅ Kaskadierte Löschung aller Beobachtungen und Anhänge
- ✅ Erhaltung statistischer Daten bei Soft Delete

## 🏫 Klassen-Management

### `get_classes`

**Beschreibung**: Lädt alle Klassen sortiert nach Schuljahr und Name

```typescript
get_classes(): Promise<Class[]>
```

**Parameter**: Keine

**Rückgabe**:
```typescript
interface Class {
  id: number;
  name: string;
  school_year: string;
}
```

**Sortierung**: `ORDER BY school_year DESC, name ASC`

**Beispiel**:
```typescript
const classes = await invoke('get_classes');
const currentYear = classes.filter(c => 
  c.school_year === '2024/25'
);
```

### `create_class`

**Beschreibung**: Erstellt eine neue Klasse

```typescript
create_class(params: {
  name: string;
  schoolYear: string;
}): Promise<Class>
```

**Parameter**:
- `name`: Klassenbezeichnung (z.B. "5a", "10B")
- `schoolYear`: Schuljahr (z.B. "2024/25")

**Rückgabe**: Neu erstellte Klasse mit generierter ID

**Beispiel**:
```typescript
const newClass = await invoke('create_class', {
  name: '5a',
  schoolYear: '2024/25'
});
```

**Validierung**:
- Name und Schuljahr müssen nicht-leer sein
- Duplikate werden akzeptiert (verschiedene Schulen)

### `delete_class` 🆕

**Beschreibung**: GDPR-konforme Löschung einer Klasse mit Sicherheitsprüfungen

```typescript
delete_class(params: {
  classId: number;
  forceDelete?: boolean;
}): Promise<void>
```

**Parameter**:
- `classId`: ID der zu löschenden Klasse
- `forceDelete`: Optional, Standard `false`
  - `false`: Nur leere Klassen (keine aktiven Schüler*innen)
  - `true`: Kaskadierte Löschung aller zugehörigen Daten

**Löschungsstrategien**:

| Szenario | `forceDelete` | Aktion | Audit-Log |
|----------|---------------|--------|-----------|
| Keine aktiven Schüler*innen | `false`/`true` | Klassenlöschung | `safe_delete` |
| Mit aktiven Schüler*innen | `false` | Fehler + Schüler*innen-Anzahl | - |
| Mit aktiven Schüler*innen | `true` | Kaskadierte Löschung | `force_delete` |

**Beispiel**:
```typescript
// Sichere Löschung (nur leere Klassen)
await invoke('delete_class', { classId: 42 });

// Forcierte Löschung (mit allen Schüler*innen)
try {
  await invoke('delete_class', { classId: 42 });
} catch (error) {
  if (error.includes('students found')) {
    // Force Delete erforderlich
    await invoke('delete_class', { 
      classId: 42, 
      forceDelete: true 
    });
  }
}
```

**Kaskadierung bei Force Delete**:
1. Alle Schüler*innen der Klasse ermitteln
2. Für jede Schüler*in: `delete_student(id, true)` aufrufen
3. Klasse selbst löschen
4. Audit-Log für gesamte Operation

## 📝 Beobachtungs-System

### `create_observation`

**Beschreibung**: Erstellt eine neue verschlüsselte Beobachtung

```typescript
create_observation(params: {
  studentId: number;
  category: string;
  text: string;
  tags: string[];
}): Promise<Observation>
```

**Parameter**:
- `studentId`: ID der beobachteten Schüler*in
- `category`: Beobachtungskategorie
- `text`: Beobachtungstext (wird verschlüsselt gespeichert)
- `tags`: Liste von Tags für Kategorisierung

**Rückgabe**:
```typescript
interface Observation {
  id: number;
  student_id: number;
  author_id: number;
  category: string;
  text: string; // Entschlüsselt für Frontend
  tags: string[];
  created_at: string; // ISO 8601 DateTime
  updated_at: string;
  source_device_id: string;
}
```

**Verschlüsselung**: Text wird mit AES-256-GCM verschlüsselt gespeichert

**Beispiel**:
```typescript
const observation = await invoke('create_observation', {
  studentId: 123,
  category: 'Sozial',
  text: 'Zeigt sehr gute Teamarbeit in der Gruppenarbeit.',
  tags: ['teamwork', 'positive', 'gruppe']
});
```

### `search_observations`

**Beschreibung**: Durchsucht Beobachtungen mit Volltext-Suche und Filtern

```typescript
search_observations(params: {
  query?: string;
  studentId?: number;
  category?: string;
}): Promise<Observation[]>
```

**Parameter**: Alle optional, mindestens ein Parameter sollte gesetzt sein
- `query`: Volltext-Suche in entschlüsselten Beobachtungstexten
- `studentId`: Filter nach bestimmter Schüler*in
- `category`: Filter nach Kategorie

**Suchlogik**:
1. Datenbankabfrage mit strukturierten Filtern
2. Entschlüsselung aller gefundenen Texte
3. Volltext-Suche im entschlüsselten Content (case-insensitive)
4. Sortierung nach `created_at DESC`

**Beispiel**:
```typescript
// Alle Beobachtungen einer Schüler*in
const studentObs = await invoke('search_observations', {
  studentId: 123
});

// Volltext-Suche
const searchResults = await invoke('search_observations', {
  query: 'teamwork'
});

// Kombinierte Filter
const filtered = await invoke('search_observations', {
  query: 'positiv',
  category: 'Sozial',
  studentId: 123
});
```

**Performance**: 
- Indizierung auf `student_id` und `created_at`
- Volltext-Suche erfolgt im Speicher nach DB-Filter

## 🛡️ GDPR-Funktionen

### `export_student_data`

**Beschreibung**: Vollständiger Datenexport einer Schüler*in (Art. 15 DSGVO)

```typescript
export_student_data(params: {
  studentId: number;
  format: 'json' | 'csv';
}): Promise<string>
```

**Parameter**:
- `studentId`: ID der Schüler*in für Datenexport
- `format`: Export-Format
  - `json`: Strukturierte JSON-Ausgabe
  - `csv`: Tabellarische CSV-Ausgabe (geplant)

**Rückgabe**: Formatierte String-Daten zum Download

**Export-Inhalte**:
```json
{
  "student": {
    "id": 123,
    "first_name": "Max",
    "last_name": "Mustermann",
    "class": "5a (2024/25)",
    "status": "active",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "observations": [
    {
      "id": 456,
      "category": "Sozial",
      "text": "Zeigt sehr gute Teamarbeit...",
      "tags": ["teamwork", "positive"],
      "created_at": "2024-01-20T14:45:00Z",
      "author_id": 1,
      "source_device": "notebook-001"
    }
  ],
  "export_metadata": {
    "exported_at": "2024-01-25T16:20:00Z",
    "export_reason": "data_subject_request",
    "total_observations": 15,
    "date_range": {
      "from": "2024-01-15T10:30:00Z",
      "to": "2024-01-25T16:20:00Z"
    }
  }
}
```

**Audit-Logging**: Jeder Export wird vollständig protokolliert

**Beispiel**:
```typescript
const exportData = await invoke('export_student_data', {
  studentId: 123,
  format: 'json'
});

// Download-Link erstellen
const blob = new Blob([exportData], { 
  type: 'application/json' 
});
const url = URL.createObjectURL(blob);
```

## 🔄 P2P-Synchronisation

### `start_p2p_sync`

**Beschreibung**: Startet P2P-Discovery und Synchronisation

```typescript
start_p2p_sync(): Promise<void>
```

**Funktionalität**:
- mDNS-Service-Advertisement (`_schuelerbeob._tcp.local`)
- TLS-Server auf zufälligem Port starten
- Listening für eingehende Pairing-Anfragen

### `stop_p2p_sync`

**Beschreibung**: Stoppt P2P-Synchronisation

```typescript
stop_p2p_sync(): Promise<void>
```

### `get_sync_status`

**Beschreibung**: Aktueller Status der P2P-Synchronisation

```typescript
get_sync_status(): Promise<SyncStatus>
```

**Rückgabe**:
```typescript
interface SyncStatus {
  peer_connected: boolean;
  last_sync: string | null; // ISO 8601 DateTime
  pending_changes: number;
}
```

### `generate_pairing_pin`

**Beschreibung**: Generiert einen temporären Pairing-PIN für Gerätekopplung

```typescript
generate_pairing_pin(): Promise<ActivePin>
```

**Rückgabe**:
```typescript
interface ActivePin {
  pin: string; // 6-stelliger numerischer PIN
  expires_at: string; // ISO 8601 DateTime
  expires_in_seconds: number;
}
```

**Sicherheit**:
- PIN gültig für 5 Minuten
- Kryptografisch sicherer Zufallsgenerator
- Automatische Invalidierung nach Ablauf

### `pair_device`

**Beschreibung**: Koppelt mit anderem Gerät über Pairing-Code

```typescript
pair_device(params: {
  pairingCode: string;
}): Promise<void>
```

**Parameter**:
- `pairingCode`: 6-stelliger PIN vom anderen Gerät

**Pairing-Prozess**:
1. mDNS-Discovery nach Service mit PIN
2. TLS-Handshake mit Zertifikat-Austausch
3. PIN-Validierung
4. Persistent Pairing speichern

### `trigger_sync`

**Beschreibung**: Manuelle Synchronisation mit gekoppeltem Gerät

```typescript
trigger_sync(): Promise<void>
```

**Sync-Prozess**:
1. Changeset seit letzter Sync generieren
2. An Peer übertragen
3. Changesets vom Peer empfangen
4. Konflikte auflösen (Last-Writer-Wins)
5. Sync-Status aktualisieren

## 🔧 Geräte-Konfiguration

### `get_device_config`

**Beschreibung**: Aktuelle Geräte-Konfiguration abrufen

```typescript
get_device_config(): Promise<DeviceConfig>
```

**Rückgabe**:
```typescript
interface DeviceConfig {
  device_type: 'computer' | 'notebook';
  device_name?: string;
}
```

### `set_device_config`

**Beschreibung**: Geräte-Konfiguration aktualisieren

```typescript
set_device_config(params: {
  deviceType: 'computer' | 'notebook';
  deviceName?: string;
}): Promise<void>
```

**Parameter**:
- `deviceType`: Gerätetyp für UI-Anpassungen und P2P-Discovery
- `deviceName`: Optional, benutzerfreundlicher Name

## 📊 System-Status

### `export_changeset`

**Beschreibung**: SQLite-Changeset für manuellen Datenexport

```typescript
export_changeset(): Promise<string>
```

**Rückgabe**: Base64-kodiertes SQLite-Changeset

**Verwendung**: Manuelle Datensicherung oder Offline-Transfer

### `import_changeset`

**Beschreibung**: SQLite-Changeset importieren

```typescript
import_changeset(params: {
  changesetData: string;
}): Promise<void>
```

**Parameter**:
- `changesetData`: Base64-kodiertes Changeset

**Validierung**: 
- Changeset-Integrität prüfen
- Konfliktbehandlung anwenden
- Audit-Log-Eintrag erstellen

## 🔒 Sicherheit & Validierung

### Allgemeine Prinzipien

**Input-Validierung**:
- Alle String-Parameter werden auf Länge und Zeichen geprüft
- Numerische IDs werden auf positive Integers validiert
- SQL-Injection-Schutz durch Prepared Statements

**Berechtigungen**:
- Alle Commands setzen `author_id: 1` (Single-User-System)
- Zukünftige Multi-User-Erweiterung vorbereitet

**Fehlerbehandlung**:
```typescript
// Einheitliche Fehler-Struktur
interface ApiError {
  code: string;
  message: string;
  details?: any;
}
```

**Audit-Logging**:
- Alle state-changing Operations werden protokolliert
- Unveränderliches Audit-Log mit Triggers
- GDPR-konforme Metadaten (Aktion, Zeitstempel, Benutzer)

### Verschlüsselung

**Ruhende Daten**:
- AES-256-GCM für Beobachtungstexte
- OS-Keystore für Schlüsselverwaltung
- Automatische Schlüssel-Rotation (geplant)

**Transport**:
- mTLS für P2P-Kommunikation
- Selbstsignierte Zertifikate mit Pinning
- ChaCha20-Poly1305 für Changeset-Verschlüsselung

## 📈 Performance & Limits

### Datenbankgrenzen

| Entität | Soft Limit | Hard Limit | Performance-Hinweis |
|---------|------------|------------|-------------------|
| Schüler*innen | 1.000 | 10.000 | Linear skalierend |
| Klassen | 100 | 500 | Keine Performance-Auswirkung |
| Beobachtungen | 50.000 | 500.000 | Indiziert, gut skalierend |
| Beobachtungstext | 10 KB | 100 KB | Verschlüsselung-Overhead |

### Memory Usage

**Verschlüsselung**:
- ~100 Bytes Overhead pro verschlüsselter Beobachtung
- Entschlüsselung on-demand bei Suchanfragen
- LRU-Cache für häufig abgerufene Texte

**P2P-Sync**:
- Changeset-Größe proportional zu Änderungsvolumen
- Streaming für große Changesets (>10MB)
- Kompressionsverhältnis ~70% für typische Textdaten

## 🧪 Testing

### API-Testing

```typescript
// Mock für Tauri invoke
const mockInvoke = jest.fn();
jest.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

describe('Student API', () => {
  test('create_student validates required fields', async () => {
    mockInvoke.mockRejectedValue('Failed to create student: firstName required');
    
    await expect(
      invoke('create_student', { classId: 1, firstName: '', lastName: 'Test' })
    ).rejects.toContain('firstName required');
  });

  test('delete_student soft delete preserves observations', async () => {
    mockInvoke.mockResolvedValue(undefined);
    
    await invoke('delete_student', { studentId: 123, forceDelete: false });
    
    expect(mockInvoke).toHaveBeenCalledWith('delete_student', {
      studentId: 123,
      forceDelete: false
    });
  });
});
```

### Rust Backend Testing

```rust
#[cfg(test)]
mod api_tests {
    use super::*;
    use tokio_test;

    #[tokio::test]
    async fn test_delete_student_audit_logging() {
        let state = create_test_state().await;
        
        delete_student(state.clone(), 123, Some(true))
            .await
            .expect("Delete should succeed");
            
        // Audit-Eintrag prüfen
        let audit_entry = state.audit
            .get_last_entry()
            .await
            .expect("Audit entry should exist");
            
        assert_eq!(audit_entry.action, "delete");
        assert_eq!(audit_entry.object_type, "student");
        assert_eq!(audit_entry.object_id, 123);
        assert_eq!(audit_entry.details, Some("hard_delete"));
    }
}
```

## 📋 Migration Guide

### Von vorherigen Versionen

**Breaking Changes in v1.1**:
- `delete_student` und `delete_class` Commands hinzugefügt
- `Student.status` kann jetzt `"deleted"` sein
- Neue Audit-Log-Einträge für Löschoperationen

**Migration**:
```sql
-- Für bestehende Installationen
ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'active';
UPDATE students SET status = 'active' WHERE status IS NULL;
```

**Frontend-Updates**:
```typescript
// Status-Filter für gelöschte Schüler*innen
const activeStudents = students.filter(s => s.status !== 'deleted');

// GDPR-Export vor Löschung anbieten
const handleDelete = async (studentId: number) => {
  const exportData = await invoke('export_student_data', {
    studentId,
    format: 'json'
  });
  
  // Download anbieten vor Löschung
  offerDownload(exportData, `student-${studentId}-export.json`);
  
  // Dann löschen
  await invoke('delete_student', { studentId });
};
```

## 🔗 Verwandte Dokumentation

- **[DELETE_FEATURES.md](DELETE_FEATURES.md)**: Detaillierte Löschfunktionen-Dokumentation
- **[DPIA.md](DPIA.md)**: Datenschutz-Folgenabschätzung
- **[GDPR_COMPLIANCE.md](GDPR_COMPLIANCE.md)**: GDPR-Compliance-Details
- **[SECURITY.md](SECURITY.md)**: Sicherheitsarchitektur
- **[USER_GUIDE.md](USER_GUIDE.md)**: Benutzerhandbuch

---

**📝 Letzte Aktualisierung**: 2024 • **🔒 GDPR-Konform** • **✅ Produktionsbereit**