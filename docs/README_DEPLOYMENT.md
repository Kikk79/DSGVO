# 📦 Deployment Documentation Index

## Available Documents

### 🚀 Quick Start
- **[QUICK_INSTALL.md](./QUICK_INSTALL.md)** - One-command installation guide
  - Single command deployment
  - Basic verification steps
  - Quick troubleshooting

### 📋 Complete Documentation  
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Comprehensive deployment guide
  - System requirements and dependencies
  - Multiple installation methods
  - Post-installation configuration
  - Troubleshooting and maintenance

### ✅ Quality Assurance
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
  - Step-by-step verification process
  - Quality assurance guidelines
  - Sign-off procedures

## Package Details

**Current Release**: `Schuelerbeobachtung_0.1.0_amd64.deb`  
**Size**: 8.1 MB  
**Target**: Ubuntu 20.04+, Debian 11+, Linux Mint 20+  
**Architecture**: x86_64 (amd64)  

## Quick Command Reference

```bash
# Install application
sudo apt install ./Schuelerbeobachtung_0.1.0_amd64.deb

# Verify installation  
which schuelerbeobachtung

# Launch application
schuelerbeobachtung

# Remove application (keep data)
sudo apt remove schuelerbeobachtung

# Complete removal (delete all data)
sudo apt remove --purge schuelerbeobachtung
rm -rf ~/.local/share/schuelerbeobachtung
```

## Support

- **Technical Issues**: Check [DEPLOYMENT.md](./DEPLOYMENT.md) troubleshooting section
- **GDPR Compliance**: See main README.md for privacy documentation
- **Security**: Data stored locally in plaintext

---

**Choose your deployment approach**:
- New to the application? → Start with [QUICK_INSTALL.md](./QUICK_INSTALL.md)
- Production deployment? → Use [DEPLOYMENT.md](./DEPLOYMENT.md) + [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- System administrator? → Follow complete [DEPLOYMENT.md](./DEPLOYMENT.md) guide
