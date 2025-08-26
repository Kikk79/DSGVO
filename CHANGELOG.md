# Changelog

All notable changes to the Schülerbeobachtung GDPR-compliant student observation system will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-08-26

### Added

#### 📅 **Feature 2: Configurable Calendar View - FULLY IMPLEMENTED**

**Core Calendar Functionality:**
- **Full Calendar Integration**: Professional calendar interface using FullCalendar React with German localization
- **Multiple View Modes**: Month, Week, Day, and List views with seamless switching and intuitive navigation
- **Dashboard Integration**: Click handler on "Diese Woche" card navigates directly to `/kalender` route
- **Advanced Event Management**: Click events to view full observation details in responsive modal overlay

**Smart Filtering & Configuration:**
- **Dynamic Filters**: Real-time filtering by class and category with "All Classes"/"All Categories" options
- **Visual Integration**: Events automatically color-coded using existing custom category colors from database
- **Configuration Panel**: Weekend toggle, filter controls, and calendar density settings
- **Responsive Design**: Mobile-friendly interface with collapsible filter panel and touch navigation

**Technical Implementation:**
- **Backend Enhancement**: New `get_calendar_observations` Tauri command with date range filtering and comprehensive JOIN queries (students + classes + categories)
- **State Management**: Complete Zustand store extension with calendar state, preferences persistence, and efficient event transformation
- **Event Processing**: Smart observation-to-event transformation with color mapping and text truncation
- **Navigation Controls**: Today button, prev/next navigation, and automatic date range handling

**Dependencies Added:**
```json
{
  "@fullcalendar/react": "^6.1.19",
  "@fullcalendar/daygrid": "^6.1.19", 
  "@fullcalendar/timegrid": "^6.1.19",
  "@fullcalendar/list": "^6.1.19",
  "@fullcalendar/interaction": "^6.1.19"
}
```

**Files Created:**
- `src/components/CalendarView.tsx` - **NEW** (410 lines) - Complete calendar interface with all view modes and filtering

**Files Enhanced:**
- `src/stores/appStore.ts` - Extended with calendar state management and `loadCalendarEvents` functionality
- `src-tauri/src/main.rs` - New `get_calendar_observations` command with parameter handling
- `src-tauri/src/database.rs` - New `get_calendar_observations` method with dynamic filtering
- `src/App.tsx` - Added `/kalender` route 
- `src/components/Dashboard.tsx` - Added click handler for "Diese Woche" card

**Quality Assurance:**
- ✅ Frontend compilation successful with TypeScript strict mode
- ✅ Backend compilation successful with minimal clippy warnings  
- ✅ Complete integration testing with existing GDPR-compliant data model
- ✅ Maintains all custom category colors and data relationships

### Fixed

#### 🐛 **Calendar Parameter Mapping Issue**
- **Parameter Convention**: Fixed Tauri command parameter mapping from JavaScript camelCase (`startDate`, `endDate`, `classId`) to Rust snake_case (`start_date`, `end_date`, `class_id`)
- **Error Resolution**: Resolved "missing required key startDate" error by ensuring consistent parameter naming convention across frontend-backend interface

## [0.3.1] - 2025-01-24

### Fixed

#### 🐛 **Critical Student Delete/Import Bug Resolution**
- **Student Hard Delete Issue**: Hard delete was functioning correctly but orphaned observations remained visible
- **Import Restoration Failure**: Deleted students could not be restored via import, causing permanent data loss
- **Export Incomplete Coverage**: Export operations excluded soft-deleted students, making restoration impossible

#### 🔧 **Technical Root Cause Analysis**
**Problem 1 - Export Coverage Gap:**
- `get_students()` filtered out soft-deleted students (`WHERE status != 'deleted'`)
- Export only included active students, losing soft-deleted student data
- Import had no data to restore deleted students

**Problem 2 - Import Reactivation Logic:**
- `import_full_backup` only checked `EXISTS = 0` for new student insertion
- No logic to reactivate deleted students when importing backup data
- Deleted students remained permanently inaccessible

#### 🛠️ **Solution Implementation**

**New Export Function** (`src-tauri/src/database.rs:361`):
```rust
pub async fn get_all_students_including_deleted(&self) -> Result<Vec<Student>> {
    // Exports ALL students including soft-deleted ones
    let students = sqlx::query_as::<_, Student>(
        "SELECT * FROM students ORDER BY last_name, first_name"
    ).fetch_all(&self.pool).await?;
    Ok(students)
}
```

**Enhanced Import Logic** (`src-tauri/src/database.rs:690-720`):
```rust
if exists == 0 {
    // Insert new student (existing logic)
} else {
    // NEW: Check if student needs reactivation
    let current_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM students WHERE id = ?"
    ).bind(student.id).fetch_one(&self.pool).await?;
    
    if current_status == "deleted" && student.status != "deleted" {
        // Reactivate deleted student with full data update
        sqlx::query(
            "UPDATE students SET class_id = ?, first_name = ?, last_name = ?, 
             status = ?, updated_at = ?, source_device_id = ? WHERE id = ?"
        ).bind(student.class_id)
         .bind(student.first_name)
         .bind(student.last_name)
         .bind(student.status)        // "active" instead of "deleted"
         .bind(student.updated_at)
         .bind(student.source_device_id)
         .bind(student.id)
         .execute(&self.pool).await?;
    }
}
```

**Updated Export Command** (`src-tauri/src/main.rs:325`):
```rust
// Export now uses comprehensive student query
let students = db.get_all_students_including_deleted().await.map_err(|e| e.to_string())?;
```

#### ✅ **Validation & Testing**
**New Comprehensive Test** (`src-tauri/src/database.rs:1134-1205`):
```rust
#[tokio::test]
async fn test_student_delete_and_restore_via_import() {
    // ✅ Student creation and observation creation
    // ✅ Soft delete → student hidden from UI but preserved
    // ✅ Hard delete → student completely removed  
    // ✅ Import backup → student fully restored as active
    // ✅ Observations correctly restored and linked
}
```

#### 🎯 **User Impact Resolution**
**Before Fix:**
- ❌ Soft-deleted students lost forever after hard delete
- ❌ Import/export cycle caused permanent data loss
- ❌ Observations left pointing to non-existent students

**After Fix:**
- ✅ All student deletion scenarios work correctly
- ✅ Export captures complete student dataset (including deleted)
- ✅ Import can restore any deleted student to active status
- ✅ Full data lifecycle: Create → Delete → Export → Import → Restore
- ✅ Zero data loss during delete/import cycles

#### 📁 **Files Modified**
- `src-tauri/src/database.rs` - Added `get_all_students_including_deleted()` function and enhanced import logic
- `src-tauri/src/main.rs` - Updated export command to use comprehensive student query
- Added comprehensive test case for delete/restore workflow validation

---

## [0.3.0] - 2025-01-24

### Added

#### 🔄 **Complete Export/Import System Enhancement**
- **Categories Export/Import**: User-defined categories with colors are now fully included in export/import operations
- **Device Configuration Synchronization**: Device type and device name are synchronized between systems
- **Enhanced Full Backup Format**: Export format updated to version 1.1 with comprehensive data coverage
- **Intelligent Category Merge Logic**: Smart handling of category conflicts during import
  - Existing categories updated with import colors/settings
  - New categories automatically created
  - Missing categories soft-deleted (deactivated)

#### 🏗️ **Complete Data Synchronization**
- **100% Data Coverage**: Export now includes ALL system data for perfect replication
  - ✅ Students, Classes, Observations (existing)
  - ✅ **Categories with custom colors** (NEW)
  - ✅ **Device configuration** (NEW)
  - ⚠️ Device ID remains unique per device (by design)
- **Perfect System Replication**: Imported systems are functionally identical to source
- **Backward Compatibility**: Works with older export files without categories

#### 🛠️ **Technical Implementation**

**Enhanced Export Structure (JSON v1.1):**
```json
{
  "format": "full_export",
  "version": "1.1",
  "export_scope": {
    "total_categories": 5
  },
  "data": {
    "students": [...],
    "classes": [...], 
    "observations": [...],
    "categories": [...]
  },
  "device_config": {
    "device_type": "laptop",
    "device_name": "Office-PC"
  }
}
```

**New Database Functions:**
- `import_categories_with_merge()` - Intelligent category conflict resolution
- `import_device_config()` - Device settings synchronization (preserving device_id uniqueness)

### Changed

#### 🔄 **Import/Export Workflow Enhancement**
- **Expanded Success Messages**: Import now reports categories and device config updates
- **Enhanced Metadata**: Export scope includes category count for validation
- **Device Uniqueness Preserved**: Each device maintains its unique device_id during import

#### 🎯 **User Experience Improvements**
- **Complete System Migration**: One export/import cycle now transfers entire system configuration
- **Visual Consistency**: Imported categories maintain exact color schemes across devices
- **Zero Configuration Loss**: Device names and types preserved during migration

### Fixed

#### 🐛 **Critical Data Coverage Issues**
- **Categories Missing from Export**: Categories were completely omitted from export operations
- **Device Config Not Synchronized**: Device settings were lost during import
- **Incomplete System Replication**: Target systems were missing customizations

### Technical Details

#### 📁 **Files Modified**
- `src-tauri/src/main.rs:318-381` - Enhanced `export_all_data` command with categories and device config
- `src-tauri/src/database.rs:636-979` - Extended `import_full_backup` with merge logic and device config
- Export version bumped from 1.0 → 1.1 for compatibility tracking

#### 🧪 **Quality Assurance**
- ✅ Frontend build successful
- ✅ Backend build successful
- ✅ Export/import cycle tested and verified
- ✅ Category synchronization validated
- ✅ Device config preservation confirmed
- ✅ Backward compatibility with v1.0 exports maintained

#### 🎯 **Mission Accomplished**
**Requirement Fulfilled**: *"Falls der Export auf einem anderen rechner importiert wird muss dass Programm exakt genauso konfiguriert und genau diesselben Daten enthalten wie auf dem anderen Rechner."*

**Result**: After full export/import, both systems are functionally identical:
- Same data (students, classes, observations)
- Same category configuration with colors
- Same device naming (unique device_id preserved)
- Same user experience and visual appearance

---

## [0.2.0] - 2025-01-24

### Added

#### 🎨 **User-Defined Category Management System**
- **Complete Category CRUD Operations**: Create, read, update, and delete custom observation categories
- **Advanced Color System**: Each category supports custom primary color, background color, and text color
- **CategoryManager Component** (`/kategorien`): Full admin interface for category management
  - Color preset templates for quick setup (Green, Blue, Amber, Purple, Red, Pink, Teal, Orange, Gray)
  - Live preview of category appearance
  - Drag-and-drop color picker with hex code input
  - Sort order management for category organization
  - Soft/hard delete options with usage validation

#### 🗄️ **Database Schema Enhancements**
- **New `categories` table** with comprehensive color and metadata support:
  ```sql
  CREATE TABLE categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      background_color TEXT NOT NULL DEFAULT '#EBF8FF', 
      text_color TEXT NOT NULL DEFAULT '#1E3A8A',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_device_id TEXT NOT NULL DEFAULT ''
  );
  ```
- **Automatic Default Category Seeding**: Creates 5 default categories with appealing color schemes:
  - Sozial (Green theme: #10B981, #D1FAE5, #065F46)
  - Fachlich (Blue theme: #3B82F6, #DBEAFE, #1E3A8A)
  - Verhalten (Amber theme: #F59E0B, #FEF3C7, #92400E)
  - Förderung (Purple theme: #8B5CF6, #EDE9FE, #5B21B6)
  - Sonstiges (Gray theme: #6B7280, #F3F4F6, #374151)

#### 🎯 **Enhanced User Experience**
- **Dynamic Category Integration**: ObservationForm now loads categories from database with live color preview
- **Visual Category Display**: Dashboard and StudentSearch components show observations with category-specific colors
- **Responsive Color Feedback**: Real-time visual feedback when selecting categories during observation creation
- **Navigation Integration**: Added "Kategorien" menu item with Palette icon in main navigation

#### 🔧 **Backend API Extensions**
- **New Tauri Commands**: `get_categories`, `create_category`, `update_category`, `delete_category`
- **GDPR-Compliant Audit Logging**: All category operations tracked in immutable audit trail
- **Soft Delete Support**: Categories with existing observations can be deactivated instead of deleted
- **Category Usage Validation**: Prevents accidental deletion of categories in use

### Changed

#### 🔄 **Migration Strategy**
- **Backward Compatibility Maintained**: Existing observations continue to work with new category system
- **Seamless Transition**: Hardcoded categories replaced with database-driven system while preserving data
- **Zero-Downtime Migration**: Default categories automatically created on first run

#### 🎨 **UI/UX Improvements**
- **Enhanced Visual Hierarchy**: Category colors provide better visual organization in observation lists
- **Improved Form Experience**: Category selection now includes visual preview of appearance
- **Better Error Handling**: Comprehensive error states and loading indicators for category operations

### Technical Details

#### 📁 **New Files Added**
- `src/components/CategoryManager.tsx` (647 lines) - Complete category management interface
- Database migration logic in `src-tauri/src/database.rs` (150+ new lines)
- Category struct definition in `src-tauri/src/main.rs`

#### 🛠️ **Files Modified**
- `src/components/ObservationForm.tsx` - Dynamic category loading with color preview
- `src/components/Dashboard.tsx` - Category color display in recent observations
- `src/components/StudentSearch.tsx` - Category color display in search results
- `src/components/Layout.tsx` - Added navigation link to category manager
- `src/App.tsx` - Added route for category management
- `src-tauri/src/database.rs` - Category CRUD operations and migration
- `src-tauri/src/main.rs` - Category struct and Tauri command definitions

#### 🧪 **Quality Assurance**
- ✅ Frontend build: All TypeScript compilation successful
- ✅ Backend build: All Rust compilation successful  
- ✅ Database migration: Tested category creation and seeding
- ✅ API integration: All Tauri commands functional
- ✅ UI responsiveness: Tested across different screen sizes

#### 🎯 **User Impact**
- **Enhanced Flexibility**: Users can now create unlimited custom categories with personalized colors
- **Better Organization**: Color-coded categories improve visual scanning and organization
- **Maintained Workflow**: Existing observation creation process unchanged, only enhanced
- **Professional Appearance**: Customizable colors allow adaptation to institutional branding

---

## [0.1.0] - 2025-01-21

### Added
- Initial release of GDPR-compliant student observation system
- Local-first SQLite database with audit logging
- Student and class management
- Observation creation and search
- Unified synchronization system with export/import functionality
- GDPR compliance features (right to access, rectification, erasure)
- No-crypto version with plaintext storage
- Comprehensive test coverage for backend operations

### Architecture
- Tauri 2.0 desktop application framework
- React 18 + TypeScript frontend
- Rust backend with SQLx database layer
- TailwindCSS for styling
- Zustand for state management