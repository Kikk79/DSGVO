# Installation und Setup

Commands for future builds:

- Linux: npm run tauri build
- Windows: npm run tauri build -- --target x86_64-pc-windows-gnu

## Systemvoraussetzungen

### Mindestanforderungen

- **Betriebssystem**: Windows 10 (1909+), macOS 10.15+, Ubuntu 18.04+
- **RAM**: 4 GB (8 GB empfohlen)
- **Speicher**: 500 MB für Anwendung + Daten
- **Netzwerk**: WiFi für P2P-Synchronisation (optional)

### Entwicklungsumgebung

- **Rust**: 1.70.0+
- **Node.js**: 18.0.0+
- **Git**: 2.25+

## Installation für Endanwender

### Windows

1. **System-Vorbereitung**

   ```powershell
   # Microsoft Visual C++ Redistributable installieren
   winget install Microsoft.VCRedist.2015+.x64
   ```

2. **Anwendung installieren**

   - [Installer herunterladen](releases/latest)
   - `schuelerbeobachtung-setup.exe` ausführen
   - Setup-Assistent folgen

3. **Erste Einrichtung**
   - Anwendung starten
   - Verschlüsselung wird automatisch initialisiert
   - Gerät wird automatisch registriert

### macOS

1. **System-Vorbereitung**

   ```bash
   # Keine zusätzlichen Dependencies erforderlich
   ```

2. **Anwendung installieren**

   - [DMG-Datei herunterladen](releases/latest)
   - `Schuelerbeobachtung.app` in `/Applications` ziehen
   - Bei erster Ausführung: Rechtsklick → Öffnen

3. **Sicherheitseinstellungen**
   - System Preferences → Security & Privacy
   - "Allow apps downloaded from: App Store and identified developers"

### Ubuntu/Debian

1. **System-Dependencies**

   ```bash
   sudo apt update
   sudo apt install -y \
       libgtk-3-0 \
       libwebkit2gtk-4.0-37 \
       libayatana-appindicator3-1
   ```

2. **Anwendung installieren**

   ```bash
   # AppImage (empfohlen)
   wget https://releases.../schuelerbeobachtung-x86_64.AppImage
   chmod +x schuelerbeobachtung-x86_64.AppImage
   ./schuelerbeobachtung-x86_64.AppImage

   # Oder DEB-Paket
   wget https://releases.../schuelerbeobachtung_1.0.0_amd64.deb
   sudo dpkg -i schuelerbeobachtung_1.0.0_amd64.deb
   sudo apt-get install -f  # Abhängigkeiten nachinstallieren
   ```

## Entwicklungsumgebung

### 1. Repository klonen

```bash
git clone https://github.com/your-org/schuelerbeobachtung.git
cd schuelerbeobachtung
```

### 2. Rust Installation

#### Windows

```powershell
# Über rustup.rs (empfohlen)
$env:RUSTUP_INIT_SKIP_PATH_CHECK = 1
Invoke-WebRequest -Uri https://win.rustup.rs -OutFile rustup-init.exe
./rustup-init.exe -y
```

#### macOS/Linux

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### 3. Node.js Installation

#### Via Package Manager

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS (Homebrew)
brew install node

# Windows (Scoop)
scoop install nodejs
```

#### Via Node Version Manager

```bash
# nvm installieren
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
source ~/.bashrc

# Node.js 18 installieren
nvm install 18
nvm use 18
```

### 4. System-Dependencies

#### Ubuntu/Debian

```bash
sudo apt update && sudo apt install -y \
    build-essential \
    libssl-dev \
    pkg-config \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.0-dev \
    curl \
    wget \
    file \
    libxdo3 \
    libxrandr2 \
    libasound2-dev
```

#### Fedora/RHEL/CentOS

```bash
sudo dnf groupinstall \"Development Tools\" \"Development Libraries\"
sudo dnf install -y \
    openssl-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    webkit2gtk4.0-devel \
    libxdo-devel \
    libXrandr-devel \
    alsa-lib-devel
```

#### macOS

```bash
# Xcode Command Line Tools
xcode-select --install

# Homebrew Dependencies (falls benötigt)
brew install pkg-config
```

#### Windows

```powershell
# Visual Studio Build Tools 2019/2022
winget install Microsoft.VisualStudio.2022.BuildTools

# Oder Visual Studio Community
winget install Microsoft.VisualStudio.2022.Community
```

### 5. Projekt-Dependencies installieren

```bash
# Frontend Dependencies
npm install

# Rust Dependencies (wird automatisch beim Build geladen)
cd src-tauri
cargo fetch
cd ..
```

### 6. Entwicklungsserver starten

```bash
# Development Mode (Frontend + Backend)
npm run tauri dev

# Nur Frontend (Mock-Backend)
npm run dev

# Nur Backend-Tests
cd src-tauri && cargo test
```

## Konfiguration

### Datenbank-Pfad

Standard-Speicherorte:

- **Windows**: `%APPDATA%/schuelerbeobachtung/`
- **macOS**: `~/Library/Application Support/schuelerbeobachtung/`
- **Linux**: `~/.local/share/schuelerbeobachtung/`

### Netzwerk-Konfiguration

```json
{
  \"p2p\": {
    \"discovery_port\": 5353,
    \"sync_port\": 8443,
    \"enabled\": true,
    \"auto_sync\": false
  },
  \"security\": {
    \"require_2fa\": false,
    \"certificate_pinning\": true,
    \"session_timeout\": 3600
  }
}
```

### DSGVO-Einstellungen

```json
{
  \"gdpr\": {
    \"retention_days\": 365,
    \"auto_anonymize\": true,
    \"anonymize_after_days\": 1095,
    \"audit_retention_days\": 2555
  },
  \"privacy\": {
    \"optional_fields\": {
      \"tags\": true,
      \"attachments\": false,
      \"location\": false
    }
  }
}
```

## Troubleshooting

### Häufige Probleme

#### \"cargo: command not found\"

```bash
# PATH aktualisieren
source ~/.cargo/env

# Oder manuell setzen
export PATH=\"$HOME/.cargo/bin:$PATH\"
```

#### \"pkg-config not found\" (Linux)

```bash
# Ubuntu/Debian
sudo apt install pkg-config

# Fedora/CentOS
sudo dnf install pkg-config

# Arch Linux
sudo pacman -S pkg-config
```

#### Tauri Build-Fehler (Windows)

```powershell
# Visual Studio Build Tools prüfen
where cl.exe

# Wenn nicht gefunden:
winget install Microsoft.VisualStudio.2022.BuildTools
```

#### GTK/WebKit Fehler (Linux)

```bash
# Alle GUI-Dependencies neu installieren
sudo apt install --reinstall \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libayatana-appindicator3-dev

# Display-Variablen prüfen
echo $DISPLAY
export DISPLAY=:0
```

#### Keyring/Credential Store Fehler

```bash
# Ubuntu: GNOME Keyring installieren
sudo apt install gnome-keyring

# macOS: Keychain Access prüfen
# Anwendungen → Dienstprogramme → Schlüsselbundverwaltung

# Windows: Credential Manager verfügbar
# Systemsteuerung → Anmeldeinformationsverwaltung
```

### Performance-Optimierung

#### Entwicklungsumgebung

```bash
# Rust Compiler Cache aktivieren
export RUSTC_WRAPPER=sccache
cargo install sccache

# Node.js Build Cache
npm config set cache ~/.npm-cache
```

#### Produktions-Build

```bash
# Release-Build mit Optimierungen
npm run tauri build --release

# Bundle-Größe analysieren
npm run build
npx vite-bundle-analyzer dist
```

### Debugging

#### Frontend (React)

```bash
# Chrome DevTools verfügbar im Development Mode
npm run tauri dev
# Dann: Rechtsklick → Element untersuchen
```

#### Backend (Rust)

```bash
# Debug-Logs aktivieren
RUST_LOG=debug npm run tauri dev

# GDB Debugging
cd src-tauri
cargo build
gdb target/debug/schuelerbeobachtung
```

#### Netzwerk-Issues

```bash
# mDNS-Service testen
avahi-browse -a  # Linux
dns-sd -B _services._dns-sd._udp  # macOS

# Firewall-Regeln prüfen
sudo ufw status  # Ubuntu
netsh advfirewall show allprofiles  # Windows
```

## Build und Deployment

### Release-Build erstellen

```bash
# Vollständiger Build mit Installern
npm run tauri build

# Nur Binary ohne Installer
cargo build --release
```

### Cross-Platform Builds

```bash
# Zusätzliche Targets installieren
rustup target add x86_64-pc-windows-gnu
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# GitHub Actions für automatische Builds (siehe .github/workflows/)
```

### Code-Signierung

```bash
# Windows (signtool)
signtool sign /f certificate.p12 /p password target/release/bundle/nsis/schuelerbeobachtung_1.0.0_x64-setup.exe

# macOS (codesign)
codesign --sign \"Developer ID Application: Your Name\" target/release/bundle/macos/Schuelerbeobachtung.app

# Linux (kein Signing erforderlich für AppImage)
```

## Support

### Dokumentation

- [Benutzerhandbuch](USER_GUIDE.md)
- [API-Dokumentation](API.md)
- [DSGVO-Compliance](DPIA.md)
- [Entwickler-Guide](DEVELOPMENT.md)

### Community

- **Issues**: [GitHub Issues](https://github.com/your-org/schuelerbeobachtung/issues)
- **Diskussionen**: [GitHub Discussions](https://github.com/your-org/schuelerbeobachtung/discussions)
- **Wiki**: [Project Wiki](https://github.com/your-org/schuelerbeobachtung/wiki)

### Kommerzieller Support

Für Schulen und Bildungseinrichtungen bieten wir professionelle Unterstützung:

- Installation und Setup
- Schulungen für Lehrkräfte
- Datenschutz-Beratung
- Individueller Support

Kontakt: support@your-domain.com
