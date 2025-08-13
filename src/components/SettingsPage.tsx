import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, 
  Database, 
  Bell, 
  Eye, 
  Trash2,
  Download,
  AlertTriangle,
  Settings,
  Lock,
  FileText,
  Monitor,
  Laptop
} from 'lucide-react';
import { open } from '@tauri-apps/api/dialog';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { deviceConfig, setDeviceConfig, loading, changeDatabasePath, regenerateEncryptionKey } = useAppStore();
  const [notifications, setNotifications] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);
  const [dataRetention, setDataRetention] = useState('365');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localDeviceType, setLocalDeviceType] = useState<'computer' | 'notebook'>('computer');
  const [localDeviceName, setLocalDeviceName] = useState('');

  // Initialize local state from device config
  useEffect(() => {
    if (deviceConfig) {
      setLocalDeviceType(deviceConfig.device_type);
      setLocalDeviceName(deviceConfig.device_name || '');
    }
  }, [deviceConfig]);

  const handleDataExport = () => {
    // Implementation would trigger full data export
    console.log('Exporting all data...');
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

  const handleChangeDatabasePath = async () => {
    const result = await open({
      directory: true,
      multiple: false,
      title: 'Select a new database location'
    });

    if (typeof result === 'string') {
      try {
        await changeDatabasePath(result);
        alert('Database path changed successfully. Please restart the application.');
      } catch (error) {
        alert(`Failed to change database path: ${error}`);
      }
    }
  };

  const handleRegenerateKey = async () => {
    if (window.confirm('Are you sure you want to regenerate the encryption key? This action is irreversible.')) {
      try {
        await regenerateEncryptionKey();
        alert('Encryption key regenerated successfully. Please restart the application.');
      } catch (error) {
        alert(`Failed to regenerate encryption key: ${error}`);
      }
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
                <button className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline" onClick={() => navigate('/datenschutz')}>
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
              <button className="btn-secondary flex items-center justify-center" onClick={() => navigate('/datenberichtigung')}>
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
              <button className="btn-secondary flex items-center justify-center" onClick={() => navigate('/datenuebertragbarkeit')}>
                <Shield className="h-4 w-4 mr-2" aria-hidden="true" />
                Datenübertragbarkeit (Art. 20 DSGVO)
              </button>
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
                value="%APPDATA%/schuelerbeobachtung/observations.db"
                className="input-field flex-1 bg-gray-50"
              />
              <button className="btn-secondary" onClick={handleChangeDatabasePath}>
                Ändern
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Sichere Lage außerhalb des Benutzerverzeichnisses
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
            <button className="btn-secondary flex items-center justify-center" onClick={() => console.log('Regenerate encryption key')}>
              Verschlüsselungsschlüssel neu generieren
            </button>
            <button className="btn-secondary flex items-center justify-center" onClick={() => console.log('Create security report')}>
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
    </div>
  );
};