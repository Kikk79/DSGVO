# System Utilities and Commands (Linux)

## Core System Information
- **Operating System**: Linux (WSL2 on Windows subsystem)
- **Kernel**: Linux 6.6.87.1-microsoft-standard-WSL2  
- **Platform**: linux
- **Architecture**: x86_64

## Essential Linux Commands

### File System Navigation
```bash
# Directory operations
ls -la                    # List files with details and hidden files
ls -lh                    # List with human-readable sizes  
cd /path/to/directory     # Change directory
pwd                       # Print working directory
mkdir -p path/to/dir      # Create directory with parents
rmdir directory           # Remove empty directory
rm -rf directory          # Remove directory and contents (dangerous!)

# File operations
cp source destination     # Copy file
cp -r source dest         # Copy directory recursively
mv source destination     # Move/rename file or directory
rm filename               # Remove file
ln -s target linkname     # Create symbolic link
```

### File Content and Search
```bash
# Content viewing
cat filename              # Display entire file
less filename             # View file with pagination
head -n 20 filename       # Show first 20 lines
tail -n 20 filename       # Show last 20 lines  
tail -f filename          # Follow file changes (logs)

# Searching
grep "pattern" filename   # Search for pattern in file
grep -r "pattern" dir/    # Recursive search in directory
grep -i "pattern" file    # Case-insensitive search
find . -name "*.rs"       # Find files by name pattern
find . -type f -exec grep -l "pattern" {} \;  # Find files containing pattern
```

### Process and System Management
```bash
# Process management
ps aux                    # List all running processes
ps aux | grep process     # Find specific process
kill PID                  # Terminate process by PID
killall process_name      # Terminate all processes by name
top                       # Real-time process viewer
htop                      # Enhanced process viewer (if installed)

# System information
uname -a                  # System information
df -h                     # Disk space usage
free -h                   # Memory usage
lscpu                     # CPU information
```

### Network Operations
```bash
# Network status
netstat -tlnp             # List listening ports
netstat -tlnp | grep :1420  # Check specific port
ss -tlnp                  # Modern alternative to netstat
ping hostname             # Test network connectivity
curl -I url               # Check HTTP headers

# Firewall (if needed for P2P)
sudo ufw status           # Check firewall status
sudo ufw allow 1420       # Allow port for development
```

### File Permissions and Ownership
```bash
# Permissions
chmod +x filename         # Make file executable
chmod 644 filename        # Set read/write for owner, read for others
chmod -R 755 directory    # Set permissions recursively
chown user:group filename # Change ownership
ls -l filename            # View permissions
```

## Development-Specific Commands

### Git Version Control
```bash
# Repository status
git status                # Working directory status
git log --oneline         # Commit history
git log --graph --oneline # Visual commit graph
git branch -a             # List all branches
git remote -v             # List remotes

# File operations
git add .                 # Stage all changes
git add filename          # Stage specific file
git commit -m "message"   # Commit with message
git diff                  # View unstaged changes
git diff --staged         # View staged changes

# Branch operations
git checkout -b branch    # Create and switch to new branch
git checkout branch       # Switch to existing branch
git merge branch          # Merge branch into current
git pull origin main      # Pull latest changes
git push origin branch    # Push branch to remote
```

### Package Management (Debian/Ubuntu)
```bash
# System packages
sudo apt update           # Update package lists
sudo apt upgrade          # Upgrade packages
sudo apt install package  # Install package
sudo apt remove package   # Remove package
apt search keyword        # Search for packages

# Development dependencies (as per README)
sudo apt install -y build-essential libssl-dev pkg-config \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.0-dev
```

### Environment Variables
```bash
# View environment
env                       # Show all environment variables
echo $PATH                # Show PATH variable
echo $HOME                # Show home directory
export VAR=value          # Set environment variable
unset VAR                 # Remove environment variable

# Development environment
export RUST_LOG=debug     # Enable Rust debug logging
export NODE_ENV=development  # Set Node environment
```

## Project-Specific Directories

### Data Directories (Runtime)
```bash
# User data directory
~/.local/share/schuelerbeobachtung/
├── data.db               # Main SQLite database
├── audit.db              # Audit logging database
├── certs/                # TLS certificates  
└── logs/                 # Application logs

# Development directories
./node_modules/           # Node.js dependencies
./src-tauri/target/       # Rust build artifacts
./dist/                   # Frontend build output
```

### Log File Locations
```bash
# Application logs
tail -f ~/.local/share/schuelerbeobachtung/logs/app.log

# System logs (if needed)
sudo tail -f /var/log/syslog
sudo journalctl -f -u service_name
```

## Archive and Compression
```bash
# Create archives
tar -czf archive.tar.gz directory/     # Create compressed tar
zip -r archive.zip directory/          # Create ZIP archive

# Extract archives  
tar -xzf archive.tar.gz                # Extract tar.gz
unzip archive.zip                      # Extract ZIP

# View archive contents
tar -tzf archive.tar.gz                # List tar.gz contents
unzip -l archive.zip                   # List ZIP contents
```

## Text Processing
```bash
# Text manipulation
sort filename             # Sort lines
uniq filename             # Remove duplicate lines
wc -l filename            # Count lines
sed 's/old/new/g' file    # Replace text
awk '{print $1}' file     # Print first column
cut -d',' -f1 file        # Extract CSV column
```

## System Monitoring
```bash
# Performance monitoring
iotop                     # I/O usage (if installed)
iftop                     # Network usage (if installed)
watch "command"           # Repeat command every 2 seconds
watch -n 1 "ps aux | grep schuelerbeobachtung"  # Monitor process

# Disk usage
du -sh directory          # Directory size
du -h --max-depth=1       # Size of subdirectories
ncdu                      # Interactive disk usage (if installed)
```

## Debugging and Troubleshooting
```bash
# System debugging  
dmesg | tail              # Kernel messages
journalctl --since "1 hour ago"  # System logs
strace -p PID             # Trace system calls
lsof -i :1420            # List processes using port

# Application debugging
gdb ./target/debug/schuelerbeobachtung  # Debug with GDB
valgrind ./program        # Memory debugging
```

## Useful Shortcuts
```bash
# Command line shortcuts
Ctrl+C                    # Interrupt current command
Ctrl+Z                    # Suspend current command
fg                        # Bring suspended job to foreground
bg                        # Continue suspended job in background
history                   # Command history
!!                        # Repeat last command
!grep                     # Repeat last command starting with 'grep'

# Directory shortcuts
cd ~                      # Go to home directory
cd -                      # Go to previous directory
pushd /path && popd       # Directory stack operations
```