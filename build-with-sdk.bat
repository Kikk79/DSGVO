@echo off
echo Setting up Windows SDK environment for Tauri build...

REM Set Visual Studio environment
set "VSINSTALLDIR=C:\Program Files\Microsoft Visual Studio\2022\Preview\"
set "VCINSTALLDIR=%VSINSTALLDIR%VC\"
set "VCToolsInstallDir=%VCINSTALLDIR%Tools\MSVC\14.44.35207\"

REM Set Windows SDK paths
set "WindowsSdkDir=C:\Program Files (x86)\Windows Kits\10\"
set "WindowsSDKVersion=10.0.17134.0\"

REM Set library paths for linker
set "LIB=%VCToolsInstallDir%lib\x64;%WindowsSdkDir%Lib\%WindowsSDKVersion%\um\x64;%WindowsSdkDir%Lib\%WindowsSDKVersion%\ucrt\x64"

REM Set include paths (for completeness)
set "INCLUDE=%VCToolsInstallDir%include;%WindowsSdkDir%Include\%WindowsSDKVersion%\shared;%WindowsSdkDir%Include\%WindowsSDKVersion%\um;%WindowsSdkDir%Include\%WindowsSDKVersion%\ucrt"

REM Set PATH to include tools
set "PATH=%VCToolsInstallDir%bin\HostX64\x64;%WindowsSdkDir%bin\%WindowsSDKVersion%\x64;%PATH%"

echo Environment configured. Library paths:
echo LIB=%LIB%
echo.
echo Running Tauri build...
npm run tauri:build