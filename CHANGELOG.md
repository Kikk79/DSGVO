# Changelog

All notable changes to the Schülerbeobachtung GDPR-compliant student observation system will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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