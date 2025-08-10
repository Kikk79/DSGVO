# Deployment Guide - Schuelerbeobachtung

## Overview

This guide provides comprehensive instructions for deploying the GDPR-compliant student observation application using the generated `.deb` package.

## Package Information

**Package**: `Schuelerbeobachtung_0.1.0_amd64.deb`  
**Size**: 8.1 MB  
**Architecture**: amd64 (64-bit)  
**Installed Size**: 23.6 MB  

## System Requirements

### Minimum System Requirements
- **Operating System**: Ubuntu 20.04+ / Debian 11+ / Linux Mint 20+
- **Architecture**: x86_64 (amd64)
- **RAM**: 2 GB minimum, 4 GB recommended
- **Storage**: 100 MB free space
- **Desktop Environment**: GNOME, KDE, XFCE, or similar

### Dependencies
The package automatically installs these dependencies:
- `libwebkit2gtk-4.1-0` - WebKit2 GTK library for web rendering
- `libgtk-3-0` - GTK3 library for native UI components

## Installation Methods

### Method 1: GUI Installation (Ubuntu/Debian Desktop)

1. **Download the Package**
   ```bash
   # If not already available, copy to target system
   scp Schuelerbeobachtung_0.1.0_amd64.deb user@target-system:~/
   ```

2. **Install via GUI**
   - Double-click the `.deb` file
   - Click "Install" in the Software Center
   - Enter administrator password when prompted
   - Wait for installation to complete

### Method 2: Command Line Installation

1. **Update Package Cache**
   ```bash
   sudo apt update
   ```

2. **Install the Package**
   ```bash
   # Install with automatic dependency resolution
   sudo apt install ./Schuelerbeobachtung_0.1.0_amd64.deb
   
   # Alternative: Use dpkg (may require manual dependency installation)
   sudo dpkg -i Schuelerbeobachtung_0.1.0_amd64.deb
   sudo apt --fix-broken install  # If dependencies are missing
   ```

3. **Verify Installation**
   ```bash
   # Check if package is installed
   dpkg -l | grep schuelerbeobachtung
   
   # Verify binary location
   which schuelerbeobachtung
   ```

### Method 3: Remote/Automated Deployment

```bash
#!/bin/bash
# deployment-script.sh

# Update system
sudo apt update && sudo apt upgrade -y

# Install the application
sudo apt install -y ./Schuelerbeobachtung_0.1.0_amd64.deb

# Verify installation
if command -v schuelerbeobachtung &> /dev/null; then
    echo "✅ Schuelerbeobachtung installed successfully"
    schuelerbeobachtung --version 2>/dev/null || echo "Application ready to launch"
else
    echo "❌ Installation failed"
    exit 1
fi
```

## Post-Installation

### Application Launch
- **GUI**: Find "Schuelerbeobachtung" in the Applications menu under "Education"
- **Command Line**: Run `schuelerbeobachtung` in terminal
- **Desktop**: Create desktop shortcut if needed

### Data Directory
The application creates data directories in:
```
~/.local/share/schuelerbeobachtung/     # Application data
~/.cache/schuelerbeobachtung/           # Cache files  
```

### Initial Setup
1. Launch the application
2. Accept privacy and data handling policies
3. Configure initial settings (classes, user preferences)
4. Set up P2P synchronization if needed between devices

## Uninstallation

### Complete Removal
```bash
# Remove package and configuration files
sudo apt remove --purge schuelerbeobachtung

# Clean up user data (optional - THIS WILL DELETE ALL DATA)
rm -rf ~/.local/share/schuelerbeobachtung
rm -rf ~/.cache/schuelerbeobachtung
```

### Keep User Data
```bash
# Remove only the application, keep user data
sudo apt remove schuelerbeobachtung
```

## Troubleshooting

### Common Issues

**1. Dependency Conflicts**
```bash
# Fix broken dependencies
sudo apt --fix-broken install

# Force dependency resolution  
sudo apt install -f
```

**2. Permission Issues**
```bash
# Ensure proper permissions
sudo chown -R $USER:$USER ~/.local/share/schuelerbeobachtung/
sudo chmod -R 755 ~/.local/share/schuelerbeobachtung/
```

**3. Desktop Entry Not Appearing**
```bash
# Update desktop database
sudo update-desktop-database
```

**4. WebKit/GTK Issues**
```bash
# Install additional GTK dependencies
sudo apt install -y libgtk-3-dev libwebkit2gtk-4.1-dev
```

### Logs and Diagnostics
```bash
# Run with debug output
RUST_LOG=debug schuelerbeobachtung

# Check system logs
journalctl -f -u schuelerbeobachtung

# Application logs location
ls ~/.local/share/schuelerbeobachtung/logs/
```

## Security Considerations

### Network Requirements
- **Local Network**: P2P sync requires devices on same network
- **Firewall**: Application uses dynamic ports for P2P communication
- **Encryption**: All data encrypted with ChaCha20Poly1305

### Data Protection
- Encryption keys stored in system keychain/keyring
- Database files encrypted at rest
- Audit logs immutable and timestamped

### GDPR Compliance
- Data minimization by design
- Built-in data export functionality
- Automated retention policy enforcement
- No external server dependencies

## Multi-System Deployment

### Network Installation
```bash
# Set up local package repository
mkdir -p /var/www/html/packages
cp Schuelerbeobachtung_0.1.0_amd64.deb /var/www/html/packages/
cd /var/www/html/packages/
dpkg-scanpackages . /dev/null | gzip -9c > Packages.gz

# On client systems, add to sources.list:
echo "deb [trusted=yes] http://your-server/packages ./" | sudo tee /etc/apt/sources.list.d/schuelerbeobachtung.list
sudo apt update && sudo apt install schuelerbeobachtung
```

### Configuration Management
```bash
# Deploy with predefined configuration
sudo mkdir -p /etc/schuelerbeobachtung/
sudo cp config.toml /etc/schuelerbeobachtung/
```

## Monitoring and Maintenance

### Health Checks
```bash
# Verify application status
systemctl status schuelerbeobachtung 2>/dev/null || echo "Service not running"

# Check database integrity
sqlite3 ~/.local/share/schuelerbeobachtung/observations.db "PRAGMA integrity_check;"
```

### Updates
```bash
# Check for updates
apt list --upgradable | grep schuelerbeobachtung

# Update when new version available
sudo apt update && sudo apt upgrade schuelerbeobachtung
```

## Distribution-Specific Notes

### Ubuntu 20.04+
- Fully supported, all dependencies available
- Snap alternative: Consider snapcraft packaging for broader compatibility

### Debian 11+
- Fully supported
- May require `contrib` repositories for some multimedia codecs

### Linux Mint 20+
- Fully supported through Ubuntu repositories
- Desktop integration works seamlessly

### Elementary OS 6+
- Compatible, AppCenter integration possible
- May require additional theming for native appearance

## Support and Documentation

- **Application Documentation**: Available in `/usr/share/doc/schuelerbeobachtung/`
- **Configuration Examples**: `/etc/schuelerbeobachtung/examples/`  
- **Issue Reporting**: Document bugs with system information and logs
- **Privacy Documentation**: GDPR compliance details in application help

---

**Version**: 0.1.0  
**Last Updated**: August 2024  
**Compatibility**: Ubuntu 20.04+, Debian 11+, Linux Mint 20+