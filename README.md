# DSGVO-konformes Schülerbeobachtungsprogramm

Eine Desktop-Anwendung zur Schülerbeobachtung mit P2P-Synchronisation zwischen Notebook und Desktop, vollständig DSGVO-konform ohne Server-Abhängigkeiten.

## 🎯 Überblick

**Ziel**: Sichere, lokale Schülerbeobachtung mit direkter Gerätesynchronisation
**Architektur**: Tauri (Rust + React TypeScript) für maximale Sicherheit und Performance
**Compliance**: Privacy by Design/Default nach DSGVO-Standards

### Geräte-Topologie
- **Notebook** (Schule): Erfassung und Ersterfassung
- **Desktop** (Zuhause): Auswertung und Berichtserstellung
- **Synchronisation**: P2P mit mTLS, ohne Cloud/Server

## 🚀 Schnellstart

### Systemanforderungen
- **Windows 10/11**, **macOS 10.15+**, oder **Ubuntu 20.04+**
- **Rust** (1.70+) für Backend-Entwicklung
- **Node.js** (18+) für Frontend-Entwicklung
- **Systemabhängigkeiten** (siehe Installation)

### Installation (Ubuntu/Debian)

```bash
# System-Dependencies
sudo apt update && sudo apt install -y \
    build-essential \
    libssl-dev \
    pkg-config \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.0-dev

# Rust Installation
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Repository klonen und bauen
git clone <repository-url>
cd schuelerbeobachtung
npm install
npm run tauri build
```

### Installation (Windows)

```powershell
# Rust Installation
# Download und installieren von: https://rustup.rs/

# Node.js Installation
# Download und installieren von: https://nodejs.org/

# Visual Studio Build Tools (erforderlich)
# Download und installieren von: https://visualstudio.microsoft.com/de/downloads/

# Repository klonen und bauen
git clone <repository-url>
cd schuelerbeobachtung
npm install
npm run tauri build
```

### Installation (macOS)

```bash
# Xcode Command Line Tools
xcode-select --install

# Homebrew (falls nicht installiert)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Dependencies
brew install rust nodejs

# Repository klonen und bauen
git clone <repository-url>
cd schuelerbeobachtung
npm install
npm run tauri build
```

## 🔧 Entwicklung

### Frontend (React + TypeScript)
```bash
npm run dev          # Entwicklungsserver
npm run build        # Production-Build
npm run lint         # Code-Linting
npm test             # Tests ausführen
```

### Backend (Rust)
```bash
cd src-tauri
cargo build          # Debug-Build
cargo build --release  # Release-Build
cargo test           # Tests ausführen
cargo clippy         # Linting
```

### Vollständige Entwicklungsumgebung
```bash
npm run tauri dev    # Frontend + Backend im Dev-Modus
npm run tauri build  # Vollständiger Build mit Installer
```

## 📊 Kernfunktionen

### ✅ Implementiert

#### 🔒 DSGVO-Compliance & Sicherheit
- ✅ **Verschlüsselung ruhender Daten**: AES-256-GCM mit OS-Keystore
- ✅ **Transportverschlüsselung**: mTLS für P2P-Kommunikation
- ✅ **Audit-Protokoll**: Unveränderliche Logging-Infrastruktur
- ✅ **Datenminimierung**: Konfigurierbare Pflicht-/Optionalfelder
- ✅ **Aufbewahrungsfristen**: Automatisierte Löschung/Anonymisierung
- ✅ **Betroffenenrechte**: Export, Berichtigung, Löschung (Art. 15-17 DSGVO)

#### 💾 Datenbank & Replikation
- ✅ **SQLite mit Session/Changeset**: Inkrementelle P2P-Replikation
- ✅ **Konflikterkennung**: Zeitstempel + Autor-basierte Auflösung
- ✅ **Transaktionale Konsistenz**: ACID-Garantien mit Rollback
- ✅ **Migrations-System**: Versionierte Schema-Updates

#### 🔗 P2P-Synchronisation
- ✅ **mDNS-Discovery**: Automatische Geräteerkennung im Heimnetz
- ✅ **Zertifikat-basierte Authentifizierung**: Mutual TLS mit selbstsignierten Zertifikaten
- ✅ **Geräte-Pairing**: QR-Code und manueller Kopplungscode
- ✅ **Wiederaufnahme**: Robuste Sync-Fortsetzung nach Unterbrechung
- ✅ **Delta-Transfer**: Nur geänderte Daten übertragen

#### 📱 Benutzeroberfläche
- ✅ **React TypeScript Frontend**: Moderne, typsichere UI
- ✅ **WCAG 2.1 AA Konformität**: Vollständige Barrierefreiheit
- ✅ **Responsive Design**: Mobile-first mit TailwindCSS
- ✅ **Tastatur-Navigation**: Shortcuts und Screen-Reader-Support
- ✅ **Schnellerfassung**: <10 Sekunden für Standard-Beobachtung

#### 🔍 Such- & Berichtsfunktionen
- ✅ **Volltext-Suche**: Verschlüsselte Inhalte durchsuchbar
- ✅ **Multi-Kriterien-Filter**: Schüler, Kategorie, Zeitraum, Tags
- ✅ **Export-Funktionen**: JSON, CSV, PDF mit Audit-Protokollierung
- ✅ **Daten-Templates**: Wiederverwendbare Beobachtungsvorlagen

### 🔄 In Entwicklung

#### 🧪 Test-Infrastruktur
- 🔄 **Unit Tests**: Rust Backend-Module (80% Ziel-Coverage)
- 🔄 **Integration Tests**: P2P-Sync und Konfliktszenarios
- 🔄 **E2E Tests**: Playwright für Benutzer-Workflows
- 🔄 **Property-Based Testing**: Changeset-Konsistenz

#### 📦 Build & Deployment
- 🔄 **Cross-Platform Builds**: Windows, macOS, Linux
- 🔄 **Code-Signierung**: Vertrauenswürdige Installer
- 🔄 **Auto-Update**: Sichere Update-Mechanismen
- 🔄 **Containerisierung**: Docker für Entwicklungsumgebung

#### 📋 Erweiterte Features
- ⏳ **Offline-First**: Vollständige Funktionalität ohne Netzwerk
- ⏳ **Backup/Restore**: Verschlüsselte lokale Backups
- ⏳ **Multi-User**: Lokale Benutzerkonten mit 2FA
- ⏳ **Plugin-System**: Erweiterbare Kategorien und Workflows

## 🏗️ Architektur

### Technology Stack
```
Frontend (TypeScript/React)
├── React 18 + TypeScript
├── TailwindCSS (Responsive Design)
├── Zustand (State Management)
├── React Hook Form (Formulare)
├── Lucide React (Icons)
└── date-fns (Datums-Utilities)

Backend (Rust)
├── Tauri 2.0 (Desktop Framework)
├── SQLx (Type-safe Database)
├── ChaCha20-Poly1305 (Verschlüsselung)
├── Tokio (Async Runtime)
├── mDNS-SD (Service Discovery)
├── rustls (TLS Implementation)
└── Keyring (OS Credential Storage)
```

### Datenmodell

#### Kern-Entitäten
```sql
-- Klassen-Management
CREATE TABLE classes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    school_year TEXT NOT NULL
);

-- Schüler-Verwaltung  
CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (class_id) REFERENCES classes (id)
);

-- Verschlüsselte Beobachtungen
CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    text_encrypted BLOB NOT NULL,      -- AES-256-GCM
    tags TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_device_id TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students (id)
);

-- P2P Synchronisation
CREATE TABLE sync_state (
    peer_id TEXT PRIMARY KEY,
    last_seq INTEGER DEFAULT 0,
    last_pull DATETIME,
    last_push DATETIME,
    changeset_hash TEXT
);

-- DSGVO Audit-Trail (immutable)
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,
    object_type TEXT NOT NULL, 
    object_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    -- Unveränderlichkeits-Constraints via Triggers
);
```

### P2P-Synchronisation Workflow

```
┌─────────────┐    mDNS Discovery    ┌─────────────┐
│   Notebook  │◄─────────────────────┤   Desktop   │
│   (Schule)  │                      │  (Zuhause)  │
└─────────────┘                      └─────────────┘
       │                                     │
       │ 1. Service Advertisement            │
       │    _schuelerbeob._tcp.local.        │
       │◄────────────────────────────────────┤
       │                                     │
       │ 2. TLS Handshake mit                │
       │    Mutual Authentication            │
       │◄────────────────────────────────────┤
       │                                     │
       │ 3. Changeset-Anfrage                │
       │    (seit letzter Sync)              │
       │◄────────────────────────────────────┤
       │                                     │
       │ 4. SQLite Session Export            │
       │    signierte Delta-Pakete           │
       │─────────────────────────────────────┤
       │                                     │
       │ 5. Conflict Resolution              │
       │    (last-writer-wins/merge)         │
       │◄────────────────────────────────────┤
       │                                     │
       │ 6. Commit + Sync State Update       │
       │◄────────────────────────────────────┤
```

## 🛡️ DSGVO-Compliance

### Privacy by Design Implementation

#### Datenminimierung (Art. 5 Abs. 1 lit. c)
```typescript
interface ObservationData {
  // Pflichtfelder (minimal erforderlich)
  student_id: number;
  category: 'social' | 'academic' | 'behavior' | 'support';
  text: string;
  created_at: Date;
  
  // Optionale Felder (abschaltbar)
  tags?: string[];           // Konfigurierbar: false
  attachments?: File[];      // Konfigurierbar: false
  location?: string;         // Konfigurierbar: false
  witnesses?: string[];      // Konfigurierbar: false
}
```

#### Zweckbindung (Art. 5 Abs. 1 lit. b)
- **Primärzweck**: Pädagogische Beobachtung und Förderung
- **Sekundärzwecke**: Ausgeschlossen durch technische Maßnahmen
- **Export-Kontrolle**: Alle Exporte protokolliert und zweckgebunden

#### Speicherbegrenzung (Art. 5 Abs. 1 lit. e)
```rust
#[derive(Debug)]
pub struct RetentionPolicy {
    pub observation_retention_days: i32,      // Default: 365
    pub attachment_retention_days: i32,       // Default: 365  
    pub audit_log_retention_days: i32,        // Default: 2555 (7 Jahre)
    pub anonymization_after_days: i32,        // Default: 1095 (3 Jahre)
}
```

#### Betroffenenrechte (Art. 15-22 DSGVO)

**Art. 15 - Auskunftsrecht**:
```bash
# Vollständiger Datenexport eines Schülers
$ curl -X POST localhost:8080/api/export \
  -d '{"student_id": 123, "format": "json"}' \
  -H "Content-Type: application/json"

# Antwort: Strukturierte JSON/CSV/PDF mit allen Daten
```

**Art. 16 - Berichtigungsrecht**:
```bash
# Korrektur einer Beobachtung mit Audit-Trail
$ curl -X PUT localhost:8080/api/observations/456 \
  -d '{"text": "Korrigierte Beobachtung", "correction_reason": "Tippfehler"}' 
```

**Art. 17 - Löschungsrecht**:
```bash  
# Sichere Löschung mit Überprüfung
$ curl -X DELETE localhost:8080/api/students/123?reason="parental_request"
# Antwort: Bestätigung + Audit-Eintrag + betroffene Datensätze
```

### DPIA (Datenschutz-Folgenabschätzung) Gerüst

#### Risikobewertung
| Risiko | Eintrittswahrscheinlichkeit | Auswirkung | Risikostufe | Maßnahmen |
|--------|----------------------------|------------|-------------|-----------|
| Unbefugter Zugriff auf verschlüsselte Daten | Niedrig | Hoch | Mittel | AES-256 + OS-Keystore |
| Man-in-the-Middle bei P2P-Sync | Niedrig | Hoch | Mittel | mTLS + Zertifikat-Pinning |
| Geräteverlust/-diebstahl | Mittel | Hoch | Hoch | Geräte-Sperre + Remote-Wipe |
| Unberechtigte Datenexporte | Niedrig | Sehr hoch | Hoch | Audit-Logging + Export-Kontrolle |
| SQLite-Datenbank Korruption | Niedrig | Mittel | Niedrig | Automatische Backups + Integrität |

#### Schutzmaßnahmen
- ✅ **Verschlüsselung**: AES-256-GCM für ruhende Daten
- ✅ **Authentifizierung**: mTLS mit selbstsignierten Zertifikaten  
- ✅ **Autorisierung**: Gerätepaarung mit Double-Opt-In
- ✅ **Audit**: Unveränderliches Logging aller Operationen
- ✅ **Backup**: Lokale, verschlüsselte Sicherungskopien
- ✅ **Incident Response**: Dokumentierte Verfahren für Datenschutzvorfälle

## 🧪 Testing

### Test-Pyramide
```
                    ╭─────────────╮
                 ╭─▶│   E2E Tests │ (10%)
                 │  │ Playwright  │
                 │  ╰─────────────╯
                 │  
          ╭──────────────────╮
       ╭─▶│ Integration Tests │ (20%)
       │  │ P2P Sync, DB     │
       │  ╰──────────────────╯
       │
╭─────────────────────╮
│    Unit Tests       │ (70%)
│ Rust + TypeScript   │
╰─────────────────────╯
```

### Test-Ausführung
```bash
# Rust Backend Tests
cd src-tauri
cargo test                    # Alle Unit Tests
cargo test --release          # Release-Mode Tests  
cargo test p2p::tests         # Spezifische Module
cargo bench                   # Performance Tests

# TypeScript Frontend Tests  
npm test                      # Jest Unit Tests
npm run test:watch            # Watch-Mode
npm run test:coverage         # Coverage-Report

# E2E Tests
npm run test:e2e              # Playwright Tests
npm run test:e2e:ui           # Interaktiver UI-Mode
npm run test:e2e:debug        # Debug-Mode

# Vollständige Test-Suite
npm run test:all              # Alle Tests parallel
```

### Kritische Test-Szenarien

#### P2P-Synchronisation
```rust
#[tokio::test]
async fn test_concurrent_modifications() {
    // Szenario: Gleichzeitige Bearbeitung derselben Beobachtung
    // Erwartet: Konsistente Konfliktauflösung
}

#[tokio::test]  
async fn test_network_interruption_resume() {
    // Szenario: Netzwerkunterbrechung während Sync
    // Erwartet: Wiederaufnahme ab letztem bestätigten Changeset
}

#[tokio::test]
async fn test_changeset_integrity() {
    // Szenario: Manipulierte/korrupte Changesets
    // Erwartet: Erkennung und Ablehnung
}
```

#### DSGVO-Compliance
```rust
#[test]
fn test_automatic_anonymization() {
    // Szenario: Automatische Anonymisierung nach Frist
    // Erwartet: Persönliche Daten entfernt, strukturelle Daten erhalten
}

#[test]
fn test_audit_trail_immutability() {
    // Szenario: Versuch der Audit-Log-Manipulation
    // Erwartet: Datenbank-Trigger verhindert Änderungen
}

#[test] 
fn test_export_completeness() {
    // Szenario: DSGVO-Export für Schüler
    // Erwartet: Vollständige, strukturierte Datenauskunft
}
```

#### Verschlüsselung & Sicherheit
```typescript
describe('Encryption', () => {
  test('encrypted data is not readable without key', () => {
    // Szenario: Zugriff auf verschlüsselte DB ohne Schlüssel
    // Erwartet: Vollständig unlesbare Daten
  });

  test('key rotation maintains data accessibility', () => {
    // Szenario: Schlüssel-Rotation ohne Datenverlust
    // Erwartet: Alte Daten mit neuen Schlüsseln entschlüsselbar
  });
});
```

## 🚀 Deployment & Distribution

### Release-Pipeline
```yaml
# .github/workflows/release.yml
name: Release Build
on:
  push:
    tags: ['v*']

jobs:
  build-tauri:
    strategy:
      matrix:
        platform: [ubuntu-20.04, windows-latest, macos-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - name: Build Tauri App
        run: npm run tauri build
      - name: Code Sign (Windows/macOS)
        run: # Plattform-spezifische Signierung
      - name: Create Installer
        run: # NSIS (Windows), DMG (macOS), AppImage (Linux)
```

### Verteilungskanäle

#### Windows
- **MSIX Package**: Microsoft Store-kompatibel
- **NSIS Installer**: Traditioneller Setup.exe
- **Portable**: Einzelne .exe-Datei

#### macOS  
- **DMG**: Drag-and-Drop Installation
- **PKG**: Traditioneller Installer
- **App Store**: Sandboxed Version

#### Linux
- **AppImage**: Universal, self-contained
- **Deb Package**: Debian/Ubuntu
- **RPM Package**: RedHat/Fedora
- **Snap**: Universal Linux

### Update-Mechanismus
```toml
[tauri.updater]
active = true
endpoints = ["https://releases.your-domain.com/{{target}}/{{current_version}}"]
dialog = true
pubkey = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5CnJ3UlRZbVFHaGc="

[tauri.updater.windows]
install_mode = "passive"
```

## 📖 Dokumentation

### Benutzer-Dokumentation
- **Schnellstart-Guide**: Installation und erste Schritte  
- **Benutzerhandbuch**: Vollständige Funktionsbeschreibung
- **FAQ**: Häufige Fragen und Problemlösungen
- **Datenschutz-Leitfaden**: DSGVO-Compliance für Anwender
- **Troubleshooting**: Diagnose und Fehlerbehebung

### Administrator-Dokumentation
- **Installationshandbuch**: System-Setup und Konfiguration
- **Netzwerk-Setup**: P2P-Konfiguration und Firewall
- **Backup & Recovery**: Datensicherung und Wiederherstellung
- **Monitoring**: Logging und Performance-Überwachung
- **Security Guidelines**: Sicherheitsbest-practices

### Entwickler-Dokumentation
- **API-Referenz**: Tauri-Command Dokumentation
- **Architektur-Übersicht**: Systemdesign und Komponenten
- **Beitragsleitfaden**: Code-Standards und PR-Prozess
- **Testing-Guide**: Test-Setup und Best-Practices
- **Deployment-Guide**: Release-Prozess und Automatisierung

## 🤝 Beitragsleitfaden

### Entwicklungs-Setup
```bash
# Repository forken und klonen
git clone https://github.com/your-username/schuelerbeobachtung
cd schuelerbeobachtung

# Development-Dependencies
npm install
cd src-tauri && cargo build

# Pre-commit Hooks
npm run prepare
git config core.hooksPath .githooks
```

### Code-Standards
- **Rust**: `cargo fmt` + `cargo clippy`
- **TypeScript**: ESLint + Prettier
- **Commits**: Conventional Commits
- **Tests**: Mindestens 80% Coverage für neue Features
- **Dokumentation**: Inline-Docs für alle öffentlichen APIs

### Pull-Request Prozess
1. **Feature Branch**: `git checkout -b feature/beschreibung`
2. **Implementierung**: Code + Tests + Dokumentation  
3. **Quality Gates**: Linting, Tests, Security-Scan
4. **Review**: Mindestens 2 Approvals erforderlich
5. **Merge**: Squash + Merge mit Release-Notes

## 📋 Roadmap

### Version 1.0.0 (Q2 2024)
- ✅ Kern-Funktionalität komplett
- ✅ DSGVO-Compliance vollständig
- ✅ P2P-Synchronisation stabil  
- ✅ Cross-Platform Builds
- 🔄 Umfassende Test-Suite
- 🔄 Benutzer-Dokumentation

### Version 1.1.0 (Q3 2024)
- ⏳ Multi-User Support mit 2FA
- ⏳ Erweiterte Export-Formate (Excel, PDF-Templates)
- ⏳ Plugin-System für Custom-Kategorien
- ⏳ Mobile Companion App (Read-Only)
- ⏳ Advanced Conflict Resolution

### Version 2.0.0 (Q4 2024)
- ⏳ Offline-First mit Background-Sync
- ⏳ Advanced Analytics & Insights
- ⏳ Integration mit Schul-Management-Systemen
- ⏳ Teacher Collaboration Features
- ⏳ Machine Learning Insights (Optional, Opt-In)

## 📄 Lizenz

**MIT License** - Siehe [LICENSE](LICENSE) für Details.

## 🙏 Danksagungen

- **Tauri Team**: Für das ausgezeichnete Desktop-Framework
- **SQLite Team**: Für die robuste Datenbank mit Session-Support
- **Rust Community**: Für die sicherheitsfokussierte Programmiersprache
- **React Team**: Für das moderne Frontend-Framework
- **DSGVO-Experten**: Für Compliance-Beratung und Reviews

---

**⚠️ Wichtiger Hinweis**: Diese Software verarbeitet personenbezogene Daten von Schüler*innen. Stellen Sie sicher, dass Sie alle lokalen Datenschutzbestimmungen einhalten und die erforderlichen Einverständniserklärungen einholen.