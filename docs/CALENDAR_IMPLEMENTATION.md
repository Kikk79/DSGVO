# 📅 Calendar Implementation Documentation

## Overview

The DSGVO Student Observation System features a comprehensive calendar view for visualizing student observations across different time periods. This document provides complete technical documentation of the calendar implementation, configuration options, and integration details.

## 🏗️ Architecture Overview

### Technology Stack
- **Frontend Framework**: React 18 with TypeScript
- **Calendar Library**: FullCalendar React v6.1.19
- **State Management**: Zustand store integration
- **Styling**: TailwindCSS with custom responsive design
- **Backend Integration**: Tauri commands for data fetching

### Core Dependencies
```json
{
  "@fullcalendar/react": "^6.1.19",
  "@fullcalendar/daygrid": "^6.1.19", 
  "@fullcalendar/timegrid": "^6.1.19",
  "@fullcalendar/list": "^6.1.19",
  "@fullcalendar/interaction": "^6.1.19"
}
```

## 📁 File Structure

### Primary Implementation
- **`src/components/CalendarView.tsx`** (577 lines) - Main calendar component
- **`src/stores/appStore.ts`** - Calendar state management and event handling
- **`src-tauri/src/main.rs`** - `get_calendar_observations` Tauri command
- **`src-tauri/src/database.rs`** - Database queries for calendar events

### Integration Points
- **`src/App.tsx:12,32`** - Calendar route registration (`/kalender`)
- **`src/components/Dashboard.tsx`** - Navigation link to calendar view
- **`src/components/Layout.tsx`** - Main navigation menu integration

## 🎛️ Calendar Configuration

### Current FullCalendar Options
Located in `CalendarView.tsx:279-300` (`baseCalendarOptions` object):

```typescript
const baseCalendarOptions = React.useMemo(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: calendarView,                    // Dynamic view from Zustand store
  headerToolbar: false as false,                // Custom header implementation
  eventClick: handleEventClick,                 // Event click handler
  weekends: calendarFilters.showWeekends,       // Weekend display toggle
  firstDay: calendarFilters.startWeek === 'monday' ? 1 : 0, // Week start preference
  height: 'auto',                               // Auto-sizing
  eventDisplay: 'block',                        // Event display style
  dayMaxEvents: 3,                              // Max events per day (month view)
  locale: 'de',                                 // German localization
  eventDidMount: (info: any) => {               // Tooltip setup
    info.el.title = info.event.extendedProps.fullText || info.event.title;
  },
  eventClassNames: ['cursor-pointer', 'hover:opacity-80', 'transition-opacity'],
}), [dependencies...]);
```

### View Modes
The calendar supports four distinct view modes:

1. **`dayGridMonth`** - Month view with day grid
   - **Icon**: Calendar icon
   - **Label**: "Monat"
   - **Time Slots**: None (day-based grid)

2. **`timeGridWeek`** - Week view with hourly time slots
   - **Icon**: CalendarDays icon  
   - **Label**: "Woche"
   - **Time Slots**: Hourly (currently 00:00-24:00)

3. **`timeGridDay`** - Single day view with hourly time slots
   - **Icon**: Clock icon
   - **Label**: "Tag" 
   - **Time Slots**: Hourly (currently 00:00-24:00)

4. **`listWeek`** - List view of events for the week
   - **Icon**: List icon
   - **Label**: "Liste"
   - **Time Slots**: None (chronological list)

## 🔧 Time Configuration (FullCalendar Properties)

### Researched FullCalendar Time Properties

Based on FullCalendar documentation analysis:

#### `slotMinTime`
- **Purpose**: Determines the first time slot displayed for each day
- **Default**: `"00:00:00"` (midnight)
- **Format**: Duration object as string (HH:MM:SS)
- **Applies To**: `timeGridWeek` and `timeGridDay` views only
- **Behavior**: Sets the earliest visible time slot, even when scrolled

#### `slotMaxTime`  
- **Purpose**: Determines the last time slot displayed for each day
- **Default**: `"24:00:00"` (midnight next day)
- **Format**: Duration object as string (HH:MM:SS)
- **Applies To**: `timeGridWeek` and `timeGridDay` views only
- **Behavior**: Exclusive end time - events ending exactly at this time are visible
- **Important**: Should be specified as exclusive end time

#### `scrollTime`
- **Purpose**: Initial scroll position when time grid loads
- **Default**: `"06:00:00"`
- **Format**: Duration object as string (HH:MM:SS)
- **Applies To**: `timeGridWeek` and `timeGridDay` views only
- **Benefit**: Automatically positions calendar at relevant time on load

#### `slotDuration`
- **Purpose**: Time interval for each time slot
- **Default**: `"00:30:00"` (30 minutes)
- **Format**: Duration object as string (HH:MM:SS)
- **Common Values**: `"00:30:00"` (30min), `"01:00:00"` (1hr), `"00:15:00"` (15min)

## 📊 State Management Integration

### Zustand Store Properties
The calendar integrates with the main application store:

```typescript
interface CalendarState {
  calendarEvents: CalendarEvent[];              // Transformed observation events
  calendarView: string;                         // Current view mode
  calendarFilters: {
    classId: number | null;                     // Class filter
    category: string | null;                    // Category filter  
    showWeekends: boolean;                      // Weekend display
    startWeek: 'monday' | 'sunday';            // Week start preference
  };
  calendarLoading: boolean;                     // Loading state
  calendarDate: Date;                           // Current calendar date
}
```

### Calendar Event Transformation
Observations are transformed into FullCalendar events with:

```typescript
interface CalendarEvent {
  id: string;                                   // Observation ID
  title: string;                                // Student name + truncated text
  start: Date;                                  // Observation created_at
  end: Date;                                    // Same as start (point events)
  backgroundColor: string;                      // Category background color
  borderColor: string;                         // Category primary color
  textColor: string;                           // Category text color
  extendedProps: {
    studentName: string;                        // Full student name
    className: string;                          // Class name
    category: string;                           // Category name
    fullText: string;                           // Complete observation text
    tags: string[];                             // Observation tags
  };
}
```

### Key Store Methods

#### `loadCalendarEvents(start, end, classId?, category?)`
- **Purpose**: Loads observations for date range with optional filters
- **Tauri Command**: `get_calendar_observations`
- **Database Query**: Complex JOIN across students, classes, categories, observations
- **Transformation**: Converts database rows to FullCalendar event format
- **Color Integration**: Uses custom category colors from database

#### `setCalendarView(view)`
- **Purpose**: Updates current view mode and persists preference
- **Views**: `'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'`

#### `setCalendarFilters(filters)`
- **Purpose**: Updates filter preferences and triggers event reload
- **Filters**: Class ID, category name, weekend display, week start day

## 🎨 Visual Integration

### Category Color System
Events are visually styled using the user-defined category color system:

- **Background Color**: `categories.background_color` (e.g., `#DBEAFE`)
- **Border Color**: `categories.color` (primary color, e.g., `#3B82F6`)
- **Text Color**: `categories.text_color` (e.g., `#1E3A8A`)

### Event Display Features
- **Tooltips**: Hover shows full observation text
- **Click Interaction**: Modal with complete observation details
- **Responsive Design**: Mobile-friendly with collapsible filters
- **Color Coding**: Category-based color differentiation

## 🔄 Data Flow Architecture

### 1. Initialization Flow
```
Component Mount → Load Classes/Categories → Load Initial Events → Mark Initialized
```

### 2. Navigation Flow  
```
User Navigation → datesSet Callback → Load Events for New Range → Update Calendar
```

### 3. Filter Flow
```  
Filter Change → Update Store → Reload Events → Refresh Calendar Display
```

### 4. Event Interaction Flow
```
Event Click → Extract Event Data → Show Modal → Close Modal
```

## 🛡️ Performance Optimizations

### Initialization Guards
- **Duplicate Prevention**: `hasInitialized` flag prevents multiple initial loads
- **Mount Tracking**: `hasCalendarMountedRef` skips first datesSet callback
- **Range Comparison**: `lastRangeRef` prevents duplicate range loads

### State Management
- **Memoized Options**: `baseCalendarOptions` memoized to prevent re-initialization
- **Stable Dependencies**: Careful dependency arrays to prevent render loops
- **Effect Cleanup**: Proper cleanup with `isMounted` flags

### Data Loading
- **Range-Based Loading**: Only loads events for visible date range
- **Filter Integration**: Server-side filtering reduces data transfer
- **Efficient Queries**: Complex JOINs handled at database level

## 🧪 Testing Considerations

### Component Testing
- **View Mode Switching**: Test all four view modes
- **Event Interaction**: Click events and modal display
- **Filter Functionality**: Class and category filtering
- **Navigation**: Date navigation and range changes

### Integration Testing
- **Store Integration**: State updates and persistence
- **Backend Integration**: Tauri command calls and responses
- **Color Integration**: Category color application

### Performance Testing
- **Large Datasets**: Many observations across date ranges
- **Rapid Navigation**: Quick date range changes
- **Filter Changes**: Frequent filter updates

## 🔧 Known Limitations

### Current Implementation
- **Time Range**: Default 24-hour display (00:00-24:00)
- **Time Zone**: Local timezone only
- **Event Duration**: All events treated as point events
- **Recurring Events**: No recurrence support
- **Drag & Drop**: Not implemented for event management

### FullCalendar Constraints
- **Time Properties**: Only affect timeGrid views (week/day)
- **Event Positioning**: Events outside time range not visible in time grids
- **Scroll Position**: Manual scroll position management required

## 🚀 Implementation Roadmap

### Immediate Enhancements
1. **Time Range Configuration**: Add `slotMinTime`/`slotMaxTime` for school hours
2. **Scroll Position**: Add `scrollTime` for better initial positioning
3. **Documentation**: Complete technical documentation

### Future Enhancements  
1. **User Preferences**: Configurable time ranges per user
2. **School Profiles**: Different time configurations per institution
3. **Event Duration**: Support for observation duration/end times
4. **Recurring Patterns**: Weekly/monthly observation patterns
5. **Drag & Drop**: Visual event management interface
6. **Time Zones**: Multi-timezone support for distributed schools

## 📖 FullCalendar Documentation References

### Key Documentation Pages
- **TimeGrid View**: https://fullcalendar.io/docs/timegrid-view
- **slotMinTime**: https://fullcalendar.io/docs/slotMinTime  
- **slotMaxTime**: https://fullcalendar.io/docs/slotMaxTime
- **Duration Object**: https://fullcalendar.io/docs/duration-object
- **Event Object**: https://fullcalendar.io/docs/event-parsing

### Configuration Options
- **View-Specific Options**: Different settings per view type
- **Locale Support**: German localization (`locale: 'de'`)
- **Event Display**: Multiple event rendering styles
- **Interaction**: Click handling and user interaction

## 📝 Development Notes

### Code Quality
- **TypeScript**: Fully typed implementation with proper interfaces
- **Error Handling**: Comprehensive error handling and loading states
- **Logging**: Extensive console logging for debugging
- **Memory Management**: Proper cleanup and reference management

### Architecture Decisions
- **Custom Header**: Disabled default toolbar for custom UI
- **Store Integration**: Deep Zustand integration for state persistence  
- **Color System**: Leverages existing category color management
- **German Localization**: Aligned with application language settings

---

**📅 Last Updated**: 2025-01-24
**🎯 Status**: Production Ready - Time Range Enhancement Planned
**📍 Location**: `/docs/CALENDAR_IMPLEMENTATION.md`
**🔗 Related**: `CLAUDE.md`, `src/components/CalendarView.tsx`, `src/stores/appStore.ts`