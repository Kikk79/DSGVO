# PowerShell script to set up Windows SDK environment and build Tauri app
Write-Host "Setting up Windows SDK environment for Tauri build..." -ForegroundColor Green

# Set Visual Studio environment variables
$env:VSINSTALLDIR = "C:\Program Files\Microsoft Visual Studio\2022\Preview\"
$env:VCINSTALLDIR = "$env:VSINSTALLDIR\VC\"
$env:VCToolsInstallDir = "$env:VCINSTALLDIR\Tools\MSVC\14.44.35207\"

# Set Windows SDK paths
$env:WindowsSdkDir = "C:\Program Files (x86)\Windows Kits\10\"
$env:WindowsSDKVersion = "10.0.17134.0"

# Set library paths for linker - this is the key fix
$env:LIB = "$env:VCToolsInstallDir\lib\x64;$env:WindowsSdkDir\Lib\$env:WindowsSDKVersion\um\x64;$env:WindowsSdkDir\Lib\$env:WindowsSDKVersion\ucrt\x64"

# Set include paths
$env:INCLUDE = "$env:VCToolsInstallDir\include;$env:WindowsSdkDir\Include\$env:WindowsSDKVersion\shared;$env:WindowsSdkDir\Include\$env:WindowsSDKVersion\um;$env:WindowsSdkDir\Include\$env:WindowsSDKVersion\ucrt"

# Update PATH to include build tools
$env:PATH = "$env:VCToolsInstallDir\bin\HostX64\x64;$env:WindowsSdkDir\bin\$env:WindowsSDKVersion\x64;$env:PATH"

Write-Host "Environment configured successfully!" -ForegroundColor Green
Write-Host "LIB path: $env:LIB" -ForegroundColor Yellow
Write-Host ""
Write-Host "Running Tauri build..." -ForegroundColor Green

# Run increment artifacts script
npm run increment:artifacts