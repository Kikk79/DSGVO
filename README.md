# 🎯 DSGVO-Compliant Student Observation System

A secure desktop application for educational student observation with built-in GDPR compliance, designed for teachers and educational professionals who need to document student progress while maintaining the highest standards of data protection.

## ✨ Key Features

### 🛡️ **Privacy by Design**
- **GDPR Compliant**: Built-in compliance with European data protection laws
- **Local Storage**: No cloud dependencies - your data stays on your device
- **Audit Trail**: Complete logging of all data operations for compliance
- **Data Minimization**: Only collect and store essential information
- **Right to be Forgotten**: Complete and secure data deletion capabilities

### 📝 **Observation Management**
- **Quick Entry**: Add observations in under 10 seconds
- **Flexible Categories**: Academic, social, behavioral, and support observations  
- **Smart Search**: Full-text search across all observations
- **Tag System**: Organize observations with custom tags
- **Export Options**: JSON and CSV exports for data portability

### 👥 **Student & Class Management**
- **Class Organization**: Organize students by class and school year
- **Student Profiles**: Basic student information with privacy controls
- **Status Management**: Active, inactive, and deleted student states
- **Bulk Operations**: Efficient management of multiple students

### 🔄 **Unified Synchronization**
- **Single Sync Interface**: All export/import operations in one place
- **Dual Export Modes**: Choose between Changeset (incremental) or Full Export (complete database)
- **Flexible Data Ranges**: Export last 7 days, 30 days, 90 days, 1 year, or **ALL DATA** (unlimited)
- **Smart File Detection**: Automatic file type recognition and handling
- **Offline-First**: Works completely without internet connection
- **Device Independence**: No complex setup or pairing required
- **Data Integrity**: Maintains data consistency across transfers

## 🚀 Quick Installation

### Ubuntu/Debian (Recommended)
```bash
# Download the application package
wget https://github.com/your-repo/releases/latest/Schuelerbeobachtung_0.1.0_amd64.deb

# Install with one command
sudo apt install ./Schuelerbeobachtung_0.1.0_amd64.deb

# Launch the application
schuelerbeobachtung
```

### System Requirements
- **Linux**: Ubuntu 20.04+, Debian 11+, Linux Mint 20+
- **Memory**: 2 GB RAM minimum, 4 GB recommended
- **Storage**: 100 MB free space
- **Display**: Any resolution, responsive interface

### What's Included
- Desktop application with native integration
- Complete documentation and user guides
- GDPR compliance templates and guidance
- Sample workflows and best practices

## 🛡️ GDPR Compliance Features

### Data Subject Rights
- **✅ Right of Access (Art. 15)**: Export complete student data in structured formats
- **✅ Right to Rectification (Art. 16)**: Edit and correct observations with audit trail
- **✅ Right to Erasure (Art. 17)**: Secure deletion with "right to be forgotten" compliance
- **✅ Data Portability (Art. 20)**: Export data in machine-readable formats

### Privacy Controls
- **Data Minimization**: Only essential fields are mandatory
- **Purpose Limitation**: Clear separation of observation types
- **Storage Limitation**: Configurable retention periods
- **Transparency**: Complete audit logs of all operations

### Security Measures
- **Local Storage**: No external servers or cloud services
- **Secure Deletion**: Multi-level deletion strategies (soft/hard delete)
- **Audit Logging**: Immutable logs for compliance verification
- **Input Validation**: Protection against data corruption

## 📱 User Interface

### Dashboard Overview
- **Quick Stats**: Student count, observation statistics, recent activity
- **Recent Observations**: Latest entries with quick access to details
- **Search Access**: Fast navigation to any student or observation
- **Export Tools**: One-click data exports for compliance requests

### Observation Entry
- **Student Selection**: Quick search and selection from class lists
- **Category Selection**: Pre-defined categories for consistency
- **Text Entry**: Rich text editor for detailed observations
- **Tag Management**: Add and manage tags for organization
- **Save & Continue**: Efficient workflow for multiple observations

### Student Management
- **Class Overview**: Visual organization by class and year
- **Student Profiles**: Essential information with privacy controls
- **Status Management**: Clear indication of active/inactive students
- **GDPR Operations**: Direct access to export and deletion functions

## 🔄 Unified Data Synchronization

The system features a **unified synchronization interface** accessible from the main navigation (`/sync`), consolidating all export/import operations for seamless data sharing between devices (e.g., between school notebook and home desktop):

### Enhanced Export Options

**1. Changeset Export** (Recommended for regular sync)
- **Purpose**: Incremental changes only for efficient device synchronization
- **Format**: Binary `.dat` files optimized for sync operations
- **Time Ranges**: 7 days, 30 days, 90 days, 1 year, or **ALL DATA** (unlimited)
- **Use Case**: Regular sync between work devices

**2. Full Export** (Complete database backup)
- **Purpose**: Complete database backup or migration
- **Format**: Structured `.json` files with comprehensive metadata
- **Content**: All students, classes, observations, and device information
- **Use Case**: System backup, data migration, comprehensive transfers

### Export Process
1. **Choose Export Type**: Select Changeset or Full Export based on your needs
2. **Set Data Range**: Choose time period (including unlimited "All Data" option)
3. **Generate File**: System creates appropriate export file with verification
4. **Auto-Download**: File downloads automatically with descriptive filename
5. **Transfer File**: Use USB, email, or network file sharing

### Import Process  
1. **Access Sync Tab**: Navigate to the unified synchronization interface
2. **Select File**: Choose export file using native file dialog
3. **Auto-Detection**: System automatically detects file type and format
4. **Smart Import**: Data is merged with automatic conflict resolution
5. **Complete Refresh**: UI updates to show all imported changes

### Best Practices
- **Regular Exports**: Create backups before major changes
- **Verify Transfers**: Always verify data integrity after import
- **Clean Imports**: Remove temporary files after successful imports
- **Document Changes**: Use built-in audit logs to track all transfers

## 🔧 For Developers

### Technology Stack
- **Framework**: Tauri 2.0 (Rust + React + TypeScript)
- **Frontend**: React 18 with TypeScript, TailwindCSS
- **Backend**: Rust with SQLite database
- **State Management**: Zustand for predictable state handling
- **Testing**: Comprehensive test suite with high coverage

### Development Setup
```bash
# System dependencies (Ubuntu/Debian)
sudo apt install -y build-essential libssl-dev pkg-config \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.0-dev

# Install Rust and Node.js
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and build
git clone [repository-url]
cd schuelerbeobachtung
npm install
npm run tauri:dev
```

### Code Quality Standards
- **TypeScript**: Strict configuration with comprehensive type checking
- **Rust**: Clippy linting and cargo fmt formatting
- **Testing**: 80% backend coverage, 70% frontend coverage minimum
- **Documentation**: Inline documentation for all public APIs
- **GDPR**: All data operations must include audit logging

### Contributing
We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for:
- Code style guidelines
- Pull request process
- Issue reporting procedures  
- Development environment setup
- Testing requirements

## 📖 Documentation

### User Guides
- **[Installation Guide](docs/INSTALLATION.md)**: Complete setup instructions
- **[User Manual](docs/USER_GUIDE.md)**: Step-by-step usage instructions
- **[GDPR Guide](docs/DPIA.md)**: Data protection compliance information
- **[Quick Start](docs/QUICK_INSTALL.md)**: Get up and running in minutes

### Administrator Resources
- **[Deployment Guide](docs/DEPLOYMENT.md)**: Installation for multiple users
- **[API Reference](docs/API.md)**: Complete technical documentation
- **[Delete Features](docs/DELETE_FEATURES.md)**: GDPR deletion implementation
- **[Security Guidelines](SECURITY.md)**: Best practices for data protection

### Legal Compliance
- **[Data Protection Impact Assessment](docs/DPIA.md)**: Complete GDPR compliance analysis
- **[Privacy Policy Templates](docs/privacy/)**: Ready-to-use privacy documentation
- **[Audit Procedures](docs/audit/)**: Compliance verification processes

## ⚠️ Important Security Notice

**Current Version Status**: This version features the new **Unified Synchronization System** and has encryption temporarily disabled due to system compatibility issues. This means:

- **🔄 New: Unified Sync Interface** - All export/import operations consolidated into single `/sync` tab
- **🔄 New: Flexible Export Options** - Choose between Changeset and Full Export modes  
- **🔄 New: "All Data" Export** - No time restrictions on data exports
- **⚠️ Data is stored in plaintext** in the SQLite database
- **✅ GDPR compliance functions still work** (deletion, audit, export)
- **✅ Local storage only** - no network transmission of data
- **Recommended for testing and evaluation** rather than production use

For production environments, please ensure appropriate physical security of devices and consider the encryption status in your data protection assessment.

## 🤝 Support & Community

### Getting Help
- **Documentation**: Comprehensive guides for all features
- **GitHub Issues**: Report bugs and request features
- **Community Forum**: Connect with other users and developers
- **Professional Support**: Available for educational institutions

### Feedback & Contributions
- **Feature Requests**: Share your ideas for improvements
- **Bug Reports**: Help us improve the application
- **Code Contributions**: Join our development community
- **Documentation**: Help improve guides and documentation

### Educational Partnership
This project is designed specifically for educational environments. We offer:
- **Training Sessions**: For teachers and IT staff
- **Custom Implementations**: Tailored to specific institutional needs
- **GDPR Consulting**: Data protection compliance guidance
- **Technical Support**: Professional assistance for deployments

## 📄 License & Legal

### Open Source License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Data Protection Compliance
- **GDPR Article 25**: Privacy by Design and by Default
- **GDPR Article 32**: Security of Processing
- **GDPR Chapter 3**: Rights of Data Subjects (Articles 15-22)
- **Educational Data Protection**: Complies with sector-specific requirements

### Third-Party Components
- All dependencies are carefully selected for security and compliance
- Regular security audits of all third-party components
- Clear licensing information for all included libraries
- No telemetry or external data transmission

## 🏆 Why Choose This Solution?

### ✅ **Designed for Education**
- Built specifically for teachers and educational professionals
- Workflows optimized for classroom and administrative use
- Flexible enough for different educational contexts and requirements

### ✅ **Privacy-First Approach**
- No external servers or cloud dependencies
- Complete control over your data
- Built-in GDPR compliance from day one

### ✅ **Professional Quality**
- Comprehensive testing and quality assurance
- Regular security updates and maintenance
- Professional documentation and support resources

### ✅ **Easy to Deploy**
- One-command installation on Linux systems
- Minimal system requirements
- Works offline without internet connectivity

### ✅ **Transparent & Open**
- Open source code for complete transparency
- Comprehensive documentation of all features
- Clear data handling and privacy practices

---

**🎯 Ready to get started?** Download the latest release and follow our [Quick Installation Guide](docs/QUICK_INSTALL.md) to have the system running in under 5 minutes.

**🔒 Need GDPR compliance help?** Check out our [Data Protection Guide](docs/DPIA.md) for complete compliance documentation and templates.

**💡 Questions or feedback?** Visit our [GitHub Issues](https://github.com/your-repo/issues) or [Community Forum](https://community.example.com) for support and discussion.

---

**📅 Last Updated**: August 2025 • **🔒 GDPR-Compliant** • **🚀 Ready for Educational Use**