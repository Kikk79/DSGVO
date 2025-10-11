#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Post-build script to increment version numbers for build artifacts only
 * Keeps source code versions unchanged while providing build tracking
 */

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BUILD_COUNTER_FILE = path.join(PROJECT_ROOT, '.build-counter.json');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'src-tauri', 'target', 'release');
const BUNDLE_DIR = path.join(RELEASE_DIR, 'bundle');

/**
 * Load or initialize build counter
 */
function loadBuildCounter() {
    if (fs.existsSync(BUILD_COUNTER_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(BUILD_COUNTER_FILE, 'utf8'));
            return {
                major: data.major || 0,
                minor: data.minor || 1,
                patch: data.patch || 0,
                build: data.build || 0
            };
        } catch (error) {
            console.warn('Warning: Could not parse build counter, initializing...');
        }
    }

    return { major: 0, minor: 1, patch: 0, build: 0 };
}

/**
 * Save build counter
 */
function saveBuildCounter(counter) {
    fs.writeFileSync(BUILD_COUNTER_FILE, JSON.stringify(counter, null, 2));
}

/**
 * Increment patch version
 */
function incrementPatchVersion(counter) {
    return {
        major: counter.major,
        minor: counter.minor,
        patch: counter.patch + 1,
        build: counter.build
    };
}

/**
 * Get version string
 */
function getVersionString(counter) {
    return `${counter.major}.${counter.minor}.${counter.patch}`;
}

/**
 * Rename artifact file with new version
 */
function renameArtifact(filePath, oldVersion, newVersion) {
    if (!fs.existsSync(filePath)) {
        return false;
    }

    const fileName = path.basename(filePath);
    const dir = path.dirname(filePath);

    // Replace version in filename
    const newFileName = fileName.replace(oldVersion, newVersion);
    const newFilePath = path.join(dir, newFileName);

    try {
        fs.renameSync(filePath, newFilePath);
        console.log(`✓ Renamed: ${fileName} → ${newFileName}`);
        return true;
    } catch (error) {
        console.error(`✗ Failed to rename ${fileName}:`, error.message);
        return false;
    }
}

/**
 * Find and rename all artifacts
 */
function processArtifacts(oldVersion, newVersion) {
    let processedCount = 0;

    // Process MSI files
    const msiDir = path.join(BUNDLE_DIR, 'msi');
    if (fs.existsSync(msiDir)) {
        const msiFiles = fs.readdirSync(msiDir).filter(f => f.endsWith('.msi'));
        msiFiles.forEach(file => {
            if (renameArtifact(path.join(msiDir, file), oldVersion, newVersion)) {
                processedCount++;
            }
        });
    }

    // Process NSIS files
    const nsisDir = path.join(BUNDLE_DIR, 'nsis');
    if (fs.existsSync(nsisDir)) {
        const nsisFiles = fs.readdirSync(nsisDir).filter(f => f.endsWith('.exe'));
        nsisFiles.forEach(file => {
            if (renameArtifact(path.join(nsisDir, file), oldVersion, newVersion)) {
                processedCount++;
            }
        });
    }

    // Process DEB files (if they exist)
    const debDir = path.join(BUNDLE_DIR, 'deb');
    if (fs.existsSync(debDir)) {
        const debFiles = fs.readdirSync(debDir).filter(f => f.endsWith('.deb'));
        debFiles.forEach(file => {
            if (renameArtifact(path.join(debDir, file), oldVersion, newVersion)) {
                processedCount++;
            }
        });
    }

    // Process AppImage files (if they exist)
    const appimageDir = path.join(BUNDLE_DIR, 'appimage');
    if (fs.existsSync(appimageDir)) {
        const appimageFiles = fs.readdirSync(appimageDir).filter(f => f.endsWith('.AppImage'));
        appimageFiles.forEach(file => {
            if (renameArtifact(path.join(appimageDir, file), oldVersion, newVersion)) {
                processedCount++;
            }
        });
    }

    return processedCount;
}

/**
 * Main execution
 */
function main() {
    console.log('🔢 Incrementing artifact versions...\n');

    // Load current counter
    const counter = loadBuildCounter();
    const oldVersion = getVersionString(counter);

    // Increment patch version
    const newCounter = incrementPatchVersion(counter);
    const newVersion = getVersionString(newCounter);

    console.log(`📦 Version: ${oldVersion} → ${newVersion}`);

    // Check if build artifacts exist
    if (!fs.existsSync(BUNDLE_DIR)) {
        console.error('✗ No build artifacts found. Run "npm run tauri:build" first.');
        process.exit(1);
    }

    // Process artifacts
    const processedCount = processArtifacts(oldVersion, newVersion);

    if (processedCount > 0) {
        // Save new counter
        saveBuildCounter(newCounter);
        console.log(`\n✅ Successfully incremented version for ${processedCount} artifact(s)`);
        console.log(`📝 Build counter saved: ${JSON.stringify(newCounter, null, 2)}`);
    } else {
        console.log('\n⚠️  No artifacts were processed. Check if files exist and match expected pattern.');
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Artifact Version Incrementer

Usage: node increment-artifacts.js [options]

Options:
  --help, -h    Show this help message

Description:
  Increments the patch version number for build artifacts only.
  Source code versions in package.json, Cargo.toml, and tauri.conf.json remain unchanged.

  Build counter is stored in .build-counter.json
  Processed artifacts: .msi, .exe (NSIS), .deb, .AppImage files

Examples:
  node scripts/increment-artifacts.js     # Increment version for all artifacts
`);
    process.exit(0);
}

// Run main function - simplified execution check
main();

export { loadBuildCounter, incrementPatchVersion, getVersionString };