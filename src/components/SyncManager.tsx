import React, { useState, useEffect } from 'react';
import { 
  WifiOff, 
  Smartphone, 
  Monitor, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  QrCode,
  Download,
  Upload
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const SyncManager: React.FC = () => {
  const { 
    syncStatus, 
    getSyncStatus, 
    startP2PSync, 
    stopP2PSync, 
    pairDevice, 
    triggerSync, 
    exportChangeset, 
    importChangeset,
    loading,
    error,
    deviceConfig,
    currentPin,
    generatePairingPin,
    getCurrentPairingPin,
    clearPairingPin
  } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    getSyncStatus();
    getCurrentPairingPin();
    // Refresh sync status every 30 seconds
    const interval = setInterval(() => {
      getSyncStatus();
      getCurrentPairingPin();
    }, 30000);
    return () => clearInterval(interval);
  }, [getSyncStatus, getCurrentPairingPin]);

  // PIN countdown timer effect
  useEffect(() => {
    if (currentPin && currentPin.expires_in_seconds > 0) {
      setRemainingSeconds(currentPin.expires_in_seconds);
      
      const interval = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            getCurrentPairingPin(); // Refresh to check if PIN is still valid
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setRemainingSeconds(0);
    }
  }, [currentPin, getCurrentPairingPin]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await getSyncStatus();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handlePairDevice = async () => {
    if (!pairingCode.trim()) return;
    
    try {
      await pairDevice(pairingCode.trim());
      showNotification('success', 'Gerät erfolgreich gekoppelt!');
      setPairingCode('');
      setShowPairing(false);
    } catch (error) {
      showNotification('error', `Fehler beim Koppeln: ${error}`);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await triggerSync();
      showNotification('success', 'Synchronisation erfolgreich abgeschlossen!');
    } catch (error) {
      showNotification('error', `Synchronisation fehlgeschlagen: ${error}`);
    }
  };

  const handleExportChangeset = async () => {
    try {
      const changeset = await exportChangeset();
      // Create and download file
      const blob = new Blob([changeset], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `changeset-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('success', 'Änderungspaket erfolgreich exportiert!');
    } catch (error) {
      showNotification('error', `Export fehlgeschlagen: ${error}`);
    }
  };

  const handleImportChangeset = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const content = await file.text();
          await importChangeset(content);
          showNotification('success', 'Änderungspaket erfolgreich importiert!');
        } catch (error) {
          showNotification('error', `Import fehlgeschlagen: ${error}`);
        }
      }
    };
    input.click();
  };

  const handleGeneratePin = async () => {
    try {
      await generatePairingPin();
      showNotification('success', 'PIN erfolgreich generiert!');
    } catch (error) {
      showNotification('error', `PIN-Generierung fehlgeschlagen: ${error}`);
    }
  };

  const handleClearPin = async () => {
    try {
      await clearPairingPin();
      showNotification('success', 'PIN erfolgreich gelöscht!');
    } catch (error) {
      showNotification('error', `PIN-Löschung fehlgeschlagen: ${error}`);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getConnectionStatus = () => {
    if (!syncStatus) return { status: 'unknown', color: 'gray', text: 'Unbekannt' };
    if (syncStatus.peer_connected) return { status: 'connected', color: 'green', text: 'Verbunden' };
    if (syncStatus.pending_changes > 0) return { status: 'pending', color: 'yellow', text: 'Ausstehend' };
    return { status: 'disconnected', color: 'red', text: 'Getrennt' };
  };

  const connectionStatus = getConnectionStatus();

  // Helper functions to get device display information
  const getThisDeviceInfo = () => {
    if (!deviceConfig) {
      return {
        icon: Monitor,
        name: 'Dieses Gerät',
        type: 'Desktop-Arbeitsplatz',
        description: 'Computer (Zuhause)',
      };
    }

    if (deviceConfig.device_type === 'notebook') {
      return {
        icon: Smartphone,
        name: deviceConfig.device_name || 'Dieses Gerät',
        type: 'Notebook (Schule)',
        description: 'Mobiles Gerät',
      };
    }

    return {
      icon: Monitor,
      name: deviceConfig.device_name || 'Dieses Gerät',
      type: 'Desktop-Arbeitsplatz',
      description: 'Computer (Zuhause)',
    };
  };

  const getPeerDeviceInfo = () => {
    if (!deviceConfig) {
      return {
        icon: Smartphone,
        name: 'Notebook',
        type: 'Notebook (Schule)',
        description: 'Mobiles Gerät',
      };
    }

    // If this is a notebook, the peer is likely a computer
    if (deviceConfig.device_type === 'notebook') {
      return {
        icon: Monitor,
        name: 'Computer',
        type: 'Desktop-Arbeitsplatz',
        description: 'Computer (Zuhause)',
      };
    }

    // If this is a computer, the peer is likely a notebook
    return {
      icon: Smartphone,
      name: 'Notebook',
      type: 'Notebook (Schule)',
      description: 'Mobiles Gerät',
    };
  };

  const thisDevice = getThisDeviceInfo();
  const peerDevice = getPeerDeviceInfo();

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div className={`p-4 rounded-md ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <div className="flex">
            {notification.type === 'success' ? (
              <CheckCircle className="h-5 w-5 mr-2 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
            )}
            <div>
              <p className="font-medium">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
            <div>
              <p className="font-medium">Fehler</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Synchronisation</h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie die Gerätesynchronisation
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-secondary flex items-center"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          Aktualisieren
        </button>
      </div>

      {/* Connection Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Verbindungsstatus</h2>
          <div className="flex items-center space-x-2">
            {connectionStatus.status === 'connected' && (
              <CheckCircle className="h-5 w-5 text-green-500" aria-hidden="true" />
            )}
            {connectionStatus.status === 'pending' && (
              <AlertCircle className="h-5 w-5 text-yellow-500" aria-hidden="true" />
            )}
            {(connectionStatus.status === 'disconnected' || connectionStatus.status === 'unknown') && (
              <WifiOff className="h-5 w-5 text-red-500" aria-hidden="true" />
            )}
            <span className={`font-medium text-${connectionStatus.color}-600`}>
              {connectionStatus.text}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* This Device */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center mb-3">
              <thisDevice.icon className="h-6 w-6 text-blue-600 mr-3" aria-hidden="true" />
              <div>
                <h3 className="font-medium text-gray-900">{thisDevice.name}</h3>
                <p className="text-sm text-gray-500">{thisDevice.description}</p>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Typ:</span>
                <span className="text-gray-900">{thisDevice.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="text-green-600">Online</span>
              </div>
            </div>
          </div>

          {/* Peer Device */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center mb-3">
              <peerDevice.icon className="h-6 w-6 text-gray-400 mr-3" aria-hidden="true" />
              <div>
                <h3 className="font-medium text-gray-900">{peerDevice.name}</h3>
                <p className="text-sm text-gray-500">
                  {syncStatus?.peer_connected ? 'Verbunden' : 'Nicht verbunden'}
                </p>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Typ:</span>
                <span className="text-gray-900">{peerDevice.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={syncStatus?.peer_connected ? 'text-green-600' : 'text-red-600'}>
                  {syncStatus?.peer_connected ? 'Online' : 'Offline'}
                </span>
              </div>
              {syncStatus?.last_sync && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Letzte Sync:</span>
                  <span className="text-gray-900">
                    {format(new Date(syncStatus.last_sync), 'dd.MM.yy HH:mm', { locale: de })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sync Statistics */}
        {syncStatus && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {syncStatus.pending_changes}
                </p>
                <p className="text-sm text-gray-600">Ausstehende Änderungen</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {syncStatus.last_sync ? '1' : '0'}
                </p>
                <p className="text-sm text-gray-600">Verbundene Geräte</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {syncStatus.last_sync ? format(new Date(syncStatus.last_sync), 'HH:mm', { locale: de }) : '--:--'}
                </p>
                <p className="text-sm text-gray-600">Letzte Synchronisation</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pairing Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Geräte-Kopplung</h2>
          <button
            onClick={() => setShowPairing(!showPairing)}
            className="btn-secondary"
          >
            <QrCode className="h-4 w-4 mr-2" aria-hidden="true" />
            Gerät koppeln
          </button>
        </div>

        {showPairing && (
          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">
                    Sicherheitshinweis
                  </h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Koppeln Sie nur vertrauenswürdige Geräte. Der Kopplungsvorgang 
                    ermöglicht die Synchronisation aller Beobachtungsdaten.
                  </p>
                </div>
              </div>
            </div>

            {/* PIN Display Section */}
            {currentPin !== null && remainingSeconds > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">
                    Ihr Kopplungs-PIN
                  </h3>
                  <div className="text-4xl font-mono font-bold text-blue-600 mb-2">
                    {currentPin.pin}
                  </div>
                  <p className="text-sm text-blue-700 mb-2">
                    Geben Sie diese PIN auf dem anderen Gerät ein
                  </p>
                  <div className="flex items-center justify-center space-x-2">
                    <div className="text-sm text-blue-600">
                      Läuft ab in: <span className="font-mono font-semibold">{formatTime(remainingSeconds)}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleClearPin}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    PIN löschen
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Generate PIN Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Option 1: PIN generieren
                </h3>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Generieren Sie eine 6-stellige PIN für die einfache Gerätekopplung.
                  </p>
                  <button
                    onClick={handleGeneratePin}
                    disabled={loading || (currentPin !== null && remainingSeconds > 0)}
                    className="btn-primary w-full flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                        Generiert...
                      </>
                    ) : currentPin !== null && remainingSeconds > 0 ? (
                      'PIN bereits aktiv'
                    ) : (
                      'PIN generieren'
                    )}
                  </button>
                </div>
              </div>

              {/* Enter PIN/Code Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Option 2: PIN/Code eingeben
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    placeholder="6-stellige PIN oder Kopplungscode eingeben..."
                    className="input-field"
                  />
                  <button
                    onClick={handlePairDevice}
                    disabled={!pairingCode.trim() || loading}
                    className="btn-primary w-full flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                        Koppelt...
                      </>
                    ) : (
                      'Gerät koppeln'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sync Actions */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Sync-Aktionen</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={handleTriggerSync}
            disabled={loading}
            className="btn-secondary flex items-center justify-center p-4"
          >
            <Download className="h-5 w-5 mr-3" aria-hidden="true" />
            <div className="text-left">
              <div className="font-medium">Daten synchronisieren</div>
              <div className="text-sm text-gray-600">Bidirektionale Synchronisation starten</div>
            </div>
          </button>
          
          <button 
            onClick={() => startP2PSync()}
            disabled={loading}
            className="btn-secondary flex items-center justify-center p-4"
          >
            <Upload className="h-5 w-5 mr-3" aria-hidden="true" />
            <div className="text-left">
              <div className="font-medium">P2P starten</div>
              <div className="text-sm text-gray-600">Peer-to-Peer Verbindung aktivieren</div>
            </div>
          </button>

          <button 
            onClick={() => stopP2PSync()}
            disabled={loading}
            className="btn-danger flex items-center justify-center p-4"
          >
            <WifiOff className="h-5 w-5 mr-3" aria-hidden="true" />
            <div className="text-left">
              <div className="font-medium">P2P stoppen</div>
              <div className="text-sm text-gray-600">Peer-to-Peer Verbindung beenden</div>
            </div>
          </button>
        </div>
      </div>

      {/* Manual Backup */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Manueller Transfer</h2>
        <p className="text-gray-600 mb-4">
          Für den Fall, dass keine Netzwerkverbindung verfügbar ist, können Sie 
          Änderungen manuell per USB-Stick übertragen.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={handleExportChangeset}
            disabled={loading}
            className="btn-secondary flex items-center justify-center"
          >
            {loading ? (
              <div className="animate-spin h-4 w-4 mr-2 border-2 border-gray-600 border-t-transparent rounded-full" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Änderungspaket exportieren
          </button>
          <button 
            onClick={handleImportChangeset}
            disabled={loading}
            className="btn-secondary flex items-center justify-center"
          >
            <Upload className="h-4 w-4 mr-2" />
            Änderungspaket importieren
          </button>
        </div>
      </div>
    </div>
  );
};