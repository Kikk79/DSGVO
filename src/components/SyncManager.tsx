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
  const { syncStatus, getSyncStatus } = useAppStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    getSyncStatus();
    // Refresh sync status every 30 seconds
    const interval = setInterval(getSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [getSyncStatus]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await getSyncStatus();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getConnectionStatus = () => {
    if (!syncStatus) return { status: 'unknown', color: 'gray', text: 'Unbekannt' };
    if (syncStatus.peer_connected) return { status: 'connected', color: 'green', text: 'Verbunden' };
    if (syncStatus.pending_changes > 0) return { status: 'pending', color: 'yellow', text: 'Ausstehend' };
    return { status: 'disconnected', color: 'red', text: 'Getrennt' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="space-y-6">
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
              <Monitor className="h-6 w-6 text-blue-600 mr-3" aria-hidden="true" />
              <div>
                <h3 className="font-medium text-gray-900">Dieses Gerät</h3>
                <p className="text-sm text-gray-500">Desktop-Arbeitsplatz</p>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Typ:</span>
                <span className="text-gray-900">Haupt-Arbeitsplatz</span>
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
              <Smartphone className="h-6 w-6 text-gray-400 mr-3" aria-hidden="true" />
              <div>
                <h3 className="font-medium text-gray-900">Notebook</h3>
                <p className="text-sm text-gray-500">
                  {syncStatus?.peer_connected ? 'Verbunden' : 'Nicht verbunden'}
                </p>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Typ:</span>
                <span className="text-gray-900">Notebook (Schule)</span>
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
          <div className="space-y-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  1. Kopplungscode vom Notebook eingeben
                </h3>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="Kopplungscode eingeben..."
                  className="input-field"
                />
                <button
                  disabled={!pairingCode.trim()}
                  className="btn-primary mt-2 w-full"
                >
                  Gerät koppeln
                </button>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  2. Oder QR-Code scannen
                </h3>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <QrCode className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">
                    QR-Code vom Notebook hier scannen
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sync Actions */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Sync-Aktionen</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="btn-secondary flex items-center justify-center p-4">
            <Download className="h-5 w-5 mr-3" aria-hidden="true" />
            <div className="text-left">
              <div className="font-medium">Daten abrufen</div>
              <div className="text-sm text-gray-600">Neue Beobachtungen vom Notebook laden</div>
            </div>
          </button>
          
          <button className="btn-secondary flex items-center justify-center p-4">
            <Upload className="h-5 w-5 mr-3" aria-hidden="true" />
            <div className="text-left">
              <div className="font-medium">Daten senden</div>
              <div className="text-sm text-gray-600">Änderungen an Notebook übertragen</div>
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
          <button className="btn-secondary">
            Änderungspaket exportieren
          </button>
          <button className="btn-secondary">
            Änderungspaket importieren
          </button>
        </div>
      </div>
    </div>
  );
};