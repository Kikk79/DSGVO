import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { Cloud, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

export function WebDavSettings() {
  const { 
    webdavSync,
    configureWebDav,
    testWebDavConnection,
    triggerManualSync,
    getWebDavSyncStatus,
    disableWebDavSync,
  } = useAppStore();

  // Form state
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // UI state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Load existing configuration
  useEffect(() => {
    getWebDavSyncStatus();
  }, [getWebDavSyncStatus]);

  // Update form when config is loaded
  useEffect(() => {
    if (webdavSync.config) {
      setUrl(webdavSync.config.url);
      setUsername(webdavSync.config.username);
    }
  }, [webdavSync.config]);

  const handleTestConnection = async () => {
    if (!url || !username || !password) {
      setTestResult('error');
      setTestMessage('Bitte füllen Sie alle Felder aus');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestMessage('');

    try {
      const success = await testWebDavConnection(url, username, password);
      if (success) {
        setTestResult('success');
        setTestMessage('✅ Verbindung erfolgreich!');
      } else {
        setTestResult('error');
        setTestMessage('❌ Verbindung fehlgeschlagen');
      }
    } catch (error) {
      setTestResult('error');
      setTestMessage(`Fehler: ${error}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!url || !username || !password) {
      alert('Bitte füllen Sie alle Felder aus');
      return;
    }

    try {
      await configureWebDav(url, username, password);
      alert('WebDAV-Konfiguration erfolgreich gespeichert!');
      setPassword(''); // Clear password after successful save
    } catch (error) {
      alert(`Fehler beim Speichern: ${error}`);
    }
  };

  const handleManualSync = async () => {
    try {
      await triggerManualSync();
      alert('Synchronisation erfolgreich abgeschlossen!');
    } catch (error) {
      alert(`Synchronisation fehlgeschlagen: ${error}`);
    }
  };

  const handleDisableSync = async () => {
    if (confirm('Möchten Sie die WebDAV-Synchronisation wirklich deaktivieren?')) {
      try {
        await disableWebDavSync();
        setUrl('');
        setUsername('');
        setPassword('');
        alert('WebDAV-Synchronisation deaktiviert');
      } catch (error) {
        alert(`Fehler beim Deaktivieren: ${error}`);
      }
    }
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Noch nie synchronisiert';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Minute${diffMins > 1 ? 'n' : ''}`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours > 1 ? 'n' : ''}`;
    
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSyncStatusIcon = () => {
    switch (webdavSync.status) {
      case 'syncing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Cloud className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSyncStatusText = () => {
    switch (webdavSync.status) {
      case 'syncing':
        return 'Synchronisiere...';
      case 'success':
        return 'Erfolgreich synchronisiert';
      case 'error':
        return 'Synchronisation fehlgeschlagen';
      default:
        return webdavSync.config?.configured ? 'Bereit' : 'Nicht konfiguriert';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Cloud className="w-6 h-6" />
          WebDAV-Synchronisation
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Synchronisieren Sie Ihre Daten zwischen mehreren Geräten über WebDAV (z.B. Nextcloud, Synology NAS)
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Status</h3>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {getSyncStatusIcon()}
            <div>
              <p className="font-medium text-gray-900">{getSyncStatusText()}</p>
              <p className="text-sm text-gray-500">
                Letzte Sync: {formatLastSync(webdavSync.lastSyncTime)}
              </p>
            </div>
          </div>
          
          {webdavSync.config?.configured && (
            <button
              onClick={handleManualSync}
              disabled={webdavSync.status === 'syncing'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${webdavSync.status === 'syncing' ? 'animate-spin' : ''}`} />
              Jetzt synchronisieren
            </button>
          )}
        </div>

        {webdavSync.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Fehler</p>
              <p className="text-sm text-red-700">{webdavSync.error}</p>
            </div>
          </div>
        )}

        {webdavSync.config?.configured && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">URL:</span>
                <p className="font-medium text-gray-900">{webdavSync.config.url}</p>
              </div>
              <div>
                <span className="text-gray-500">Benutzername:</span>
                <p className="font-medium text-gray-900">{webdavSync.config.username}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {webdavSync.config?.configured ? 'Konfiguration ändern' : 'WebDAV konfigurieren'}
        </h3>

        <div className="space-y-4">
          {/* URL Input */}
          <div>
            <label htmlFor="webdav-url" className="block text-sm font-medium text-gray-700 mb-2">
              WebDAV-URL *
            </label>
            <input
              id="webdav-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://cloud.example.com/remote.php/dav/files/username/"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Beispiel Nextcloud: https://ihre-cloud.de/remote.php/dav/files/username/
            </p>
          </div>

          {/* Username Input */}
          <div>
            <label htmlFor="webdav-username" className="block text-sm font-medium text-gray-700 mb-2">
              Benutzername *
            </label>
            <input
              id="webdav-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="webdav-password" className="block text-sm font-medium text-gray-700 mb-2">
              Passwort / App-Passwort *
            </label>
            <div className="relative">
              <input
                id="webdav-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Tipp: Verwenden Sie ein App-spezifisches Passwort für mehr Sicherheit
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-4 rounded-lg flex items-start gap-3 ${
              testResult === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {testResult === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm ${testResult === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                {testMessage}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleTestConnection}
              disabled={testing || !url || !username || !password}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Teste...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Verbindung testen
                </>
              )}
            </button>

            <button
              onClick={handleSaveConfiguration}
              disabled={!url || !username || !password || webdavSync.status === 'syncing'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-1"
            >
              Konfiguration speichern
            </button>

            {webdavSync.config?.configured && (
              <button
                onClick={handleDisableSync}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
              >
                Deaktivieren
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">ℹ️ Wie funktioniert die Synchronisation?</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Die App synchronisiert automatisch beim Start und alle 3 Minuten im Hintergrund</li>
          <li>Änderungen auf beiden Geräten werden zusammengeführt (neuere gewinnt)</li>
          <li>Die Daten werden verschlüsselt auf Ihrem WebDAV-Server gespeichert</li>
          <li>Sie können jederzeit eine manuelle Synchronisation auslösen</li>
          <li>Offline-Betrieb ist möglich - Sync erfolgt bei nächster Verbindung</li>
        </ul>
      </div>
    </div>
  );
}