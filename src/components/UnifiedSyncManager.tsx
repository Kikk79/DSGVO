import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { 
  Download, 
  Upload, 
  RefreshCcw, 
  HardDrive, 
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  FileText,
  Database,
  Settings
} from 'lucide-react';

const ExportType = {
  FULL_EXPORT: 'full' as const,
  CHANGESET: 'changeset' as const
};

const DataRange = {
  DAYS_7: 7,
  DAYS_30: 30,
  DAYS_90: 90,
  DAYS_365: 365,
  ALL_DATA: -1
};

type ExportTypeValue = typeof ExportType[keyof typeof ExportType];
type DataRangeValue = typeof DataRange[keyof typeof DataRange];

export const UnifiedSyncManager: React.FC = () => {
  const { 
    syncStatus, 
    getSyncStatus, 
    exportChangesetToFile, 
    exportAllData,
    importChangesetData,
    importFullBackupData,
    loading,
    error,
    deviceConfig
  } = useAppStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [exportType, setExportType] = useState<ExportTypeValue>(ExportType.CHANGESET);
  const [dataRange, setDataRange] = useState<DataRangeValue>(DataRange.DAYS_30);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  useEffect(() => {
    getSyncStatus();
    // Refresh sync status every 30 seconds  
    const interval = setInterval(() => {
      getSyncStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [getSyncStatus]);

  // Auto-hide notifications after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
  };

  const refreshStatus = async () => {
    setIsRefreshing(true);
    try {
      await getSyncStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExport = async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      
      if (exportType === ExportType.CHANGESET) {
        // Export changeset with specified time range
        const daysBack = dataRange === DataRange.ALL_DATA ? 99999 : dataRange;
        const filename = `changeset-${timestamp}.dat`;
        const result = await exportChangesetToFile(`./${filename}`, daysBack);
        showNotification('success', result);
      } else {
        // Export full data with new backend function
        const daysBack = dataRange === DataRange.ALL_DATA ? -1 : dataRange;
        const exportData = await exportAllData(daysBack);
        
        // Create and download the file
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `full-export-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const data = JSON.parse(exportData);
        const scopeText = dataRange === DataRange.ALL_DATA ? 'alle Daten' : `${dataRange} Tage`;
        showNotification('success', 
          `Vollständiger Export erstellt: ${data.export_scope.total_students} Schüler, ${data.export_scope.total_observations} Beobachtungen (${scopeText})`
        );
      }
    } catch (err) {
      showNotification('error', `Export fehlgeschlagen: ${err}`);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const confirmDataImport = async () => {
    if (!importFile) return;

    try {
      let importResult;
      
      // Read file content for direct import
      const fileContent = await importFile.text();
      
      if (importFile.name.endsWith('.json')) {
        // Handle JSON full export
        try {
          const data = JSON.parse(fileContent);
          
          if (data.format === 'full_export') {
            // Import full backup data directly
            importResult = await importFullBackupData(fileContent);
          } else {
            showNotification('error', 'Unbekanntes JSON-Format. Verwenden Sie vollständige Exporte oder Changeset-Dateien (.dat).');
            return;
          }
        } catch (parseError) {
          showNotification('error', 'Ungültige JSON-Datei: ' + parseError);
          return;
        }
      } else if (importFile.name.endsWith('.dat')) {
        // Handle changeset import
        try {
          // Validate that it looks like a changeset file
          const data = JSON.parse(fileContent);
          if (data.changeset && data.checksum) {
            // Import changeset data directly
            importResult = await importChangesetData(fileContent);
          } else {
            showNotification('error', 'Ungültige Changeset-Datei. Fehlende erforderliche Felder.');
            return;
          }
        } catch (parseError) {
          showNotification('error', 'Ungültige Changeset-Datei: ' + parseError);
          return;
        }
      } else {
        showNotification('error', 'Nicht unterstütztes Dateiformat. Verwenden Sie .json (vollständige Exporte) oder .dat (Changeset) Dateien.');
        return;
      }
      
      setShowImportDialog(false);
      setImportFile(null);
      showNotification('success', importResult);
    } catch (error) {
      console.error('Import failed:', error);
      showNotification('error', `Import fehlgeschlagen: ${error}`);
    }
  };

  const getDataRangeLabel = (range: DataRangeValue): string => {
    switch (range) {
      case DataRange.DAYS_7: return 'Letzte 7 Tage';
      case DataRange.DAYS_30: return 'Letzte 30 Tage';
      case DataRange.DAYS_90: return 'Letzte 90 Tage';
      case DataRange.DAYS_365: return 'Letztes Jahr';
      case DataRange.ALL_DATA: return 'Alle Daten';
      default: return 'Unbekannt';
    }
  };

  const getDataRangeDescription = (): string => {
    if (exportType === ExportType.CHANGESET) {
      return dataRange === DataRange.ALL_DATA 
        ? 'Alle Änderungen seit Systembeginn' 
        : `Änderungen der letzten ${dataRange} Tage`;
    } else {
      return dataRange === DataRange.ALL_DATA 
        ? 'Vollständige Datenbank mit allen Schülern, Klassen und Beobachtungen'
        : `Alle Schüler/Klassen + Beobachtungen der letzten ${dataRange} Tage`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datensynchronisation</h1>
          <p className="text-gray-600 mt-1">
            Einheitlicher Export und Import aller Anwendungsdaten
          </p>
        </div>
        <button 
          onClick={refreshStatus}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg transition-colors"
        >
          <RefreshCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>

      {/* Status Section */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <HardDrive className="h-5 w-5 mr-2" aria-hidden="true" />
            Systemstatus
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-700">System bereit</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-700">
              Letzte Aktivität: {syncStatus?.last_sync ? 
                new Date(syncStatus.last_sync).toLocaleString('de-DE') : 
                'Nie'
              }
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-700">
              Gerät: {deviceConfig?.device_name || 'Unbenannt'} ({deviceConfig?.device_type || 'Computer'})
            </span>
          </div>
        </div>
      </div>

      {/* Export Configuration */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Download className="h-5 w-5 mr-2" aria-hidden="true" />
            Daten exportieren
          </h2>
        </div>

        <div className="space-y-6">
          {/* Export Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Export-Typ
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportType(ExportType.CHANGESET)}
                className={`p-4 border-2 rounded-lg transition-colors text-left ${
                  exportType === ExportType.CHANGESET
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                }`}
              >
                <div className="flex items-center mb-2">
                  <Database className="h-5 w-5 mr-2" />
                  <span className="font-medium">Changeset</span>
                </div>
                <p className="text-sm opacity-75">
                  Nur Änderungen für Synchronisation zwischen Geräten
                </p>
              </button>
              
              <button
                type="button"
                onClick={() => setExportType(ExportType.FULL_EXPORT)}
                className={`p-4 border-2 rounded-lg transition-colors text-left ${
                  exportType === ExportType.FULL_EXPORT
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                }`}
              >
                <div className="flex items-center mb-2">
                  <FileText className="h-5 w-5 mr-2" />
                  <span className="font-medium">Vollständiger Export</span>
                </div>
                <p className="text-sm opacity-75">
                  Komplette Datenbank für Backup oder Migration
                </p>
              </button>
            </div>
          </div>

          {/* Data Range Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Datenbereich
            </label>
            <select 
              value={dataRange}
              onChange={(e) => setDataRange(parseInt(e.target.value) as DataRangeValue)}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={DataRange.DAYS_7}>{getDataRangeLabel(DataRange.DAYS_7)}</option>
              <option value={DataRange.DAYS_30}>{getDataRangeLabel(DataRange.DAYS_30)}</option>
              <option value={DataRange.DAYS_90}>{getDataRangeLabel(DataRange.DAYS_90)}</option>
              <option value={DataRange.DAYS_365}>{getDataRangeLabel(DataRange.DAYS_365)}</option>
              <option value={DataRange.ALL_DATA}>{getDataRangeLabel(DataRange.ALL_DATA)}</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              {getDataRangeDescription()}
            </p>
          </div>

          {/* Export Button */}
          <div>
            <button
              onClick={handleExport}
              disabled={loading}
              className="btn-primary flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              {loading ? 'Exportiere...' : `${exportType === ExportType.CHANGESET ? 'Changeset' : 'Vollständigen Export'} erstellen`}
            </button>
          </div>
        </div>
      </div>

      {/* Import Section */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Upload className="h-5 w-5 mr-2" aria-hidden="true" />
            Daten importieren
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Importieren Sie Changeset-Dateien (.dat) für die Synchronisation oder vollständige JSON-Exporte für die Datenmigration.
          </p>

          <button
            onClick={() => setShowImportDialog(true)}
            disabled={loading}
            className="btn-secondary flex items-center"
          >
            <Upload className="w-4 h-4 mr-2" />
            {loading ? 'Importiere...' : 'Datei zum Import auswählen'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Fehler</span>
          </div>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Daten importieren
            </h3>
            
            <div className="mb-4">
              <label htmlFor="import-file" className="block text-sm font-medium text-gray-700 mb-2">
                Import-Datei auswählen
              </label>
              <input
                type="file"
                id="import-file"
                accept=".dat,.json"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              <p className="text-sm text-gray-500 mt-1">
                Unterstützte Formate: Changeset-Dateien (.dat), Vollständige Exporte (.json)
              </p>
            </div>

            {importFile && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm font-medium text-gray-900">
                  Ausgewählte Datei:
                </p>
                <p className="text-sm text-gray-600">
                  {importFile.name} ({Math.round(importFile.size / 1024)} KB)
                </p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800">
                    Wichtiger Hinweis
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Changesets führen Datenänderungen zusammen. Vollständige Exporte überschreiben vorhandene Daten mit gleichen IDs.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFile(null);
                }}
                className="btn-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDataImport}
                disabled={!importFile}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Importieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-md ${
          notification.type === 'success' ? 'bg-green-100 border border-green-200' : 'bg-red-100 border border-red-200'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {notification.type === 'success' ? 
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /> : 
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              }
              <span className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {notification.message}
              </span>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};