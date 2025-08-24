import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FileText, 
  Search, 
  RefreshCw, 
  Settings, 
  Home,
  User, 
  PlusCircle,
  Palette
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { error } = useAppStore();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <nav 
        className="w-64 bg-white shadow-sm border-r border-gray-200"
        role="navigation"
        aria-label="Hauptnavigation"
      >
        <div className="p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-8">
            Schülerbeobachtung
          </h1>
          
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <Home className="mr-3 h-5 w-5" aria-hidden="true" />
                Startseite
              </NavLink>
            </li>
            
            <li>
              <NavLink
                to="/neue-beobachtung"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <FileText className="mr-3 h-5 w-5" aria-hidden="true" />
                Neue Beobachtung
              </NavLink>
            </li>
            
            <li>
              <NavLink
                to="/schueler-hinzufuegen"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <PlusCircle className="mr-3 h-5 w-5" aria-hidden="true" />
                Schüler hinzufügen
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/schueler-suchen"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <Search className="mr-3 h-5 w-5" aria-hidden="true" />
                Schüler finden
              </NavLink>
            </li>
            
            <li>
              <NavLink
                to="/sync"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <RefreshCw className="mr-3 h-5 w-5" aria-hidden="true" />
                Synchronisation
              </NavLink>
            </li>
            
            <li>
              <NavLink
                to="/kategorien"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <Palette className="mr-3 h-5 w-5" aria-hidden="true" />
                Kategorien
              </NavLink>
            </li>
            
            <li>
              <NavLink
                to="/einstellungen"
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <Settings className="mr-3 h-5 w-5" aria-hidden="true" />
                Einstellungen
              </NavLink>
            </li>
          </ul>
        </div>
        
        {/* User Info */}
        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <div className="flex items-center">
            <User className="h-8 w-8 text-gray-400" aria-hidden="true" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">Lehrkraft</p>
              <p className="text-xs text-gray-500">Angemeldet</p>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Error banner */}
        {error && (
          <div 
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 m-4 rounded-md"
            role="alert"
            aria-live="polite"
          >
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium">Fehler</h3>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
};