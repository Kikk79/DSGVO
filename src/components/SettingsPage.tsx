import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Database, 
  Bell, 
  Eye, 
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Settings,
  Lock,
  FileText,
  Monitor,
  Laptop
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';

export const SettingsPage: React.FC = () => {
  const { 
    deviceConfig, 
    setDeviceConfig, 
    loading, 
    databasePath, 
    getDatabasePath, 
    setDatabasePath,
    exportStudentData,
    exportChangeset,
    importChangeset,
    students,
    classes,
    observations
  } = useAppStore();
  const [notifications, setNotifications] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);
  const [dataRetention, setDataRetention] = useState('730');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localDeviceType, setLocalDeviceType] = useState<'computer' | 'notebook'>('computer');
  const [localDeviceName, setLocalDeviceName] = useState('');
  const [showPathDialog, setShowPathDialog] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // Initialize local state from device config
  useEffect(() => {
    if (deviceConfig) {
      setLocalDeviceType(deviceConfig.device_type);
      setLocalDeviceName(deviceConfig.device_name || '');
    }
  }, [deviceConfig]);

  // Initialize database path
  useEffect(() => {
    getDatabasePath();
  }, [getDatabasePath]);

  const handleDataExport = async () => {
    try {
      // Export all student data
      const studentExports = [];
      
      for (const student of students) {
        const data = await exportStudentData(student.id, 'json');
        studentExports.push({
          student: student,
          data: JSON.parse(data)
        });
      }
      
      const exportData = {
        timestamp: new Date().toISOString(),
        students: students,
        classes: classes,
        observations: observations,
        studentData: studentExports
      };
      
      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dsgvo-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('Datenexport erfolgreich erstellt und heruntergeladen.');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Fehler beim Datenexport: ' + error);
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
      const fileContent = await importFile.text();
      
      // Check if it's a changeset or full export
      let data;
      try {
        data = JSON.parse(fileContent);
      } catch (error) {
        // Assume it's base64 encoded changeset
        await importChangeset(fileContent);
        setShowImportDialog(false);
        setImportFile(null);
        alert('Changeset erfolgreich importiert.');
        return;
      }

      // If it's a JSON export, we need to convert it to changeset format
      // For now, we'll handle it as a changeset
      if (data.timestamp && data.students) {
        // This is a full export - we could implement conversion logic here
        alert('Vollständiger Datenimport wird derzeit nicht unterstützt. Bitte verwenden Sie Changeset-Dateien.');
      } else {
        // Assume it's already a changeset
        await importChangeset(fileContent);
        setShowImportDialog(false);
        setImportFile(null);
        alert('Daten erfolgreich importiert.');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('Fehler beim Datenimport: ' + error);
    }
  };

  const handleChangesetExport = async () => {
    try {
      const changeset = await exportChangeset();
      
      // Create and download changeset file
      const blob = new Blob([changeset], { 
        type: 'application/octet-stream' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `changeset-${new Date().toISOString().split('T')[0]}.dat`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('Changeset erfolgreich exportiert.');
    } catch (error) {
      console.error('Changeset export failed:', error);
      alert('Fehler beim Changeset-Export: ' + error);
    }
  };

  const handleDeviceConfigSave = async () => {
    try {
      await setDeviceConfig(localDeviceType, localDeviceName || undefined);
    } catch (error) {
      console.error('Failed to save device config:', error);
    }
  };

  const handleDataDeletion = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDataDeletion = () => {
    // Implementation would trigger data deletion
    console.log('Deleting expired data...');
    setShowDeleteConfirm(false);
  };

  const handlePathChange = () => {
    setCustomPath(databasePath || '');
    setShowPathDialog(true);
  };

  const confirmPathChange = async () => {
    if (customPath && customPath !== databasePath) {
      try {
        await setDatabasePath(customPath);
        setShowPathDialog(false);
        
        // Show restart notification
        alert('Datenbankpfad wurde erfolgreich geändert. Bitte starten Sie die Anwendung neu, damit die Änderung wirksam wird.');
      } catch (error) {
        console.error('Failed to change database path:', error);
        alert('Fehler beim Ändern des Datenbankpfads: ' + error);
      }
    } else {
      setShowPathDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-gray-600 mt-1">
          Konfigurieren Sie die Anwendung und Datenschutzeinstellungen
        </p>
      </div>

      {/* Privacy Settings */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Shield className="h-5 w-5 mr-2" aria-hidden="true" />
            Datenschutz & DSGVO
          </h2>
        </div>

        <div className="space-y-6">
          {/* Data Retention */}
          <div>
            <label htmlFor="data-retention" className="block text-sm font-medium text-gray-700 mb-1">
              Aufbewahrungsdauer für Beobachtungen
            </label>
            <select
              id="data-retention"
              value={dataRetention}
              onChange={(e) => setDataRetention(e.target.value)}
              className="select-field max-w-xs"
            >
              <option value="365">1 Jahr</option>
              <option value="730">2 Jahre</option>
              <option value="1095">3 Jahre</option>
              <option value="1825">5 Jahre</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Beobachtungen werden nach Ablauf automatisch anonymisiert.
            </p>
          </div>

          {/* Privacy Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <Eye className="h-5 w-5 text-blue-400 mt-0.5 mr-3" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-medium text-blue-800">
                  Datenschutzerklärung
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Alle Daten werden lokal verschlüsselt gespeichert. Keine Übertragung 
                  an Dritte oder Cloud-Services.
                </p>
                <button className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline">
                  Vollständige Datenschutzerklärung anzeigen
                </button>
              </div>
            </div>
          </div>

          {/* Data Subject Rights */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Betroffenenrechte (DSGVO)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button 
                onClick={handleDataExport}
                className="btn-secondary flex items-center justify-center"
              >
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Datenauskunft (Art. 15 DSGVO)
              </button>
              <button className="btn-secondary flex items-center justify-center">
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                Datenberichtigung (Art. 16 DSGVO)
              </button>
              <button 
                onClick={handleDataDeletion}
                className="btn-danger flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                Datenlöschung (Art. 17 DSGVO)
              </button>
              <button className="btn-secondary flex items-center justify-center">
                <Shield className="h-4 w-4 mr-2" aria-hidden="true" />
                Datenübertragbarkeit (Art. 20 DSGVO)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Data Transfer & Sync */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <FileText className="h-5 w-5 mr-2" aria-hidden="true" />
            Datentransfer & Synchronisation
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Changeset-Verwaltung
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Exportieren und importieren Sie Datenänderungen für die Synchronisation zwischen Geräten.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button 
                className="btn-secondary flex items-center justify-center"
                onClick={handleChangesetExport}
              >
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Changeset exportieren
              </button>
              
              <button 
                className="btn-secondary flex items-center justify-center"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                Changeset importieren
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <Database className="h-5 w-5 text-blue-400 mt-0.5 mr-3" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-medium text-blue-800">
                  Changeset-Information
                </h4>
                <p className="text-sm text-blue-700 mt-1">
                  Changesets enthalten nur die Änderungen seit dem letzten Export und sind 
                  ideal für die sichere Synchronisation zwischen Geräten.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Settings */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Settings className="h-5 w-5 mr-2" aria-hidden="true" />
            Systemeinstellungen
          </h2>
        </div>

        <div className="space-y-6">
          {/* Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Bell className="h-5 w-5 text-gray-400 mr-3" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Benachrichtigungen
                </p>
                <p className="text-sm text-gray-500">
                  Systembenachrichtigungen für wichtige Ereignisse
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Auto Backup */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Database className="h-5 w-5 text-gray-400 mr-3" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Automatische Sicherung
                </p>
                <p className="text-sm text-gray-500">
                  Tägliche verschlüsselte Backups erstellen
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={(e) => setAutoBackup(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Storage Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Speicherort der Datenbank
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={databasePath || 'Wird geladen...'}
                className="input-field flex-1 bg-gray-50"
              />
              <button 
                onClick={handlePathChange}
                className="btn-secondary"
                disabled={loading}
              >
                Ändern
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Sichere Lage außerhalb des Benutzerverzeichnisses. Hinweis: Ein Neustart der Anwendung ist nach der Änderung erforderlich.
            </p>
          </div>
        </div>
      </div>

      {/* Device Configuration */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Settings className="h-5 w-5 mr-2" aria-hidden="true" />
            Gerätekonfiguration
          </h2>
        </div>

        <div className="space-y-6">
          {/* Device Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Gerätetyp
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocalDeviceType('computer')}
                className={`p-4 border-2 rounded-lg transition-colors ${
                  localDeviceType === 'computer'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                }`}
              >
                <div className="flex items-center justify-center mb-2">
                  <Monitor className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <div className="font-medium">Computer</div>
                  <div className="text-sm mt-1 opacity-75">
                    Desktop-Arbeitsplatz (Zuhause)
                  </div>
                </div>
              </button>
              
              <button
                type="button"
                onClick={() => setLocalDeviceType('notebook')}
                className={`p-4 border-2 rounded-lg transition-colors ${
                  localDeviceType === 'notebook'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                }`}
              >
                <div className="flex items-center justify-center mb-2">
                  <Laptop className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <div className="font-medium">Notebook</div>
                  <div className="text-sm mt-1 opacity-75">
                    Mobiles Gerät (Schule)
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Device Name (Optional) */}
          <div>
            <label htmlFor="device-name" className="block text-sm font-medium text-gray-700 mb-1">
              Gerätename (Optional)
            </label>
            <input
              type="text"
              id="device-name"
              value={localDeviceName}
              onChange={(e) => setLocalDeviceName(e.target.value)}
              placeholder="z.B. Mein Arbeitsplatz, Schul-Laptop..."
              className="input-field"
            />
            <p className="text-sm text-gray-500 mt-1">
              Ein benutzerdefinierter Name für dieses Gerät in der Synchronisation.
            </p>
          </div>

          {/* Save Button */}
          <div>
            <button
              onClick={handleDeviceConfigSave}
              disabled={loading}
              className="btn-primary flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                  Speichern...
                </>
              ) : (
                'Konfiguration speichern'
              )}
            </button>
          </div>

          {/* Current Configuration Display */}
          {deviceConfig && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <Settings className="h-5 w-5 text-green-400 mt-0.5 mr-3" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-medium text-green-800">
                    Aktuelle Konfiguration
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    Gerätetyp: <strong>{deviceConfig.device_type === 'computer' ? 'Computer' : 'Notebook'}</strong>
                    {deviceConfig.device_name && (
                      <span> • Name: <strong>{deviceConfig.device_name}</strong></span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Settings */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Lock className="h-5 w-5 mr-2" aria-hidden="true" />
            Sicherheit
          </h2>
        </div>

        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <Shield className="h-5 w-5 text-green-400 mt-0.5 mr-3" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-medium text-green-800">
                  Verschlüsselung aktiv
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Alle Daten werden mit AES-256-GCM verschlüsselt. 
                  Schlüssel sind im System-Keystore gesichert.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button className="btn-secondary flex items-center justify-center">
              Verschlüsselungsschlüssel neu generieren
            </button>
            <button className="btn-secondary flex items-center justify-center">
              Sicherheitsbericht erstellen
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200">
        <div className="card-header">
          <h2 className="text-lg font-medium text-red-900 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" aria-hidden="true" />
            Gefahrenbereich
          </h2>
        </div>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-sm font-medium text-red-800 mb-2">
              Alle Daten löschen
            </h3>
            <p className="text-sm text-red-700 mb-3">
              Diese Aktion löscht alle Beobachtungen, Schülerdaten und 
              Einstellungen unwiderruflich.
            </p>
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-danger"
            >
              Alle Daten löschen
            </button>
          </div>
        </div>
      </div>

      {/* Path Change Dialog */}
      {showPathDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center mb-4">
              <Database className="h-6 w-6 text-blue-600 mr-3" aria-hidden="true" />
              <h3 className="text-lg font-medium text-gray-900">
                Datenbankpfad ändern
              </h3>
            </div>
            
            <div className="mb-4">
              <label htmlFor="custom-path" className="block text-sm font-medium text-gray-700 mb-2">
                Neuer Datenbankpfad
              </label>
              <input
                type="text"
                id="custom-path"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="z.B. C:\Daten\schuelerbeobachtung\observations.db"
                className="input-field w-full"
              />
              <p className="text-sm text-gray-500 mt-1">
                Geben Sie den vollständigen Pfad zur neuen Datenbankdatei an. Das Verzeichnis muss existieren.
              </p>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 mr-3" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800">
                    Wichtiger Hinweis
                  </h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Nach der Pfadänderung muss die Anwendung neu gestartet werden. 
                    Die aktuelle Datenbank wird nicht automatisch verschoben.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPathDialog(false)}
                className="btn-secondary"
                disabled={loading}
              >
                Abbrechen
              </button>
              <button
                onClick={confirmPathChange}
                className="btn-primary"
                disabled={loading || !customPath.trim()}
              >
                {loading ? 'Speichert...' : 'Pfad ändern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-3" aria-hidden="true" />
              <h3 className="text-lg font-medium text-gray-900">
                Datenlöschung bestätigen
              </h3>
            </div>
            
            <p className="text-sm text-gray-700 mb-6">
              Sind Sie sicher, dass Sie alle Daten löschen möchten? 
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDataDeletion}
                className="btn-danger"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
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
                Datei auswählen
              </label>
              <input
                type="file"
                id="import-file"
                accept=".json,.dat"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              <p className="text-sm text-gray-500 mt-1">
                Unterstützte Formate: JSON-Export, Changeset-Dateien (.dat)
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
                <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800">
                    Wichtiger Hinweis
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Der Import überschreibt möglicherweise vorhandene Daten. 
                    Erstellen Sie vorher eine Sicherung.
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
    </div>
  );
};