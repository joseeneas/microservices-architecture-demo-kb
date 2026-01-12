import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import apiClient from '../services/apiClient';

interface TablePreferences {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hiddenColumns?: string[];
}

interface Preferences {
  theme?: 'light' | 'dark';
  language?: 'en' | 'es' | 'pt';
  chartPalette?: 'brand' | 'accessible' | 'auto';
  forecastMethod?: 'auto' | 'linear' | 'exp' | 'hw';
  forecastSeasonality?: 'auto' | 'weekday' | 'none';
  forecastConfidence?: 80 | 95 | 99;
  tablePreferences?: {
    users?: TablePreferences;
    orders?: TablePreferences;
    inventory?: TablePreferences;
  };
}

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (newPreferences: Partial<Preferences>) => Promise<void>;
  getTablePreferences: (tableName: string) => TablePreferences;
  updateTablePreferences: (tableName: string, tablePrefs: TablePreferences) => Promise<void>;
  loading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'light',
    language: 'en',
    chartPalette: 'accessible',
    forecastMethod: 'auto',
    forecastSeasonality: 'auto',
    forecastConfidence: 95,
    tablePreferences: {},
  });
  const [loading, setLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await apiClient.get('/users/me/preferences');
        setPreferences(response.data || {});
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (preferences.theme) {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(preferences.theme);
    }
  }, [preferences.theme]);

  const updatePreferences = async (newPreferences: Partial<Preferences>) => {
    const updated = { ...preferences, ...newPreferences };
    setPreferences(updated);

    try {
      await apiClient.put('/users/me/preferences', { preferences: updated });
    } catch (error) {
      console.error('Failed to save preferences:', error);
      // Revert on error
      setPreferences(preferences);
      throw error;
    }
  };

  const getTablePreferences = (tableName: string): TablePreferences => {
    return preferences.tablePreferences?.[tableName as keyof typeof preferences.tablePreferences] || {};
  };

  const updateTablePreferences = async (tableName: string, tablePrefs: TablePreferences) => {
    const updated = {
      ...preferences,
      tablePreferences: {
        ...preferences.tablePreferences,
        [tableName]: tablePrefs,
      },
    };

    setPreferences(updated);

    try {
      await apiClient.put('/users/me/preferences', { preferences: updated });
    } catch (error) {
      console.error('Failed to save table preferences:', error);
      setPreferences(preferences);
      throw error;
    }
  };

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updatePreferences,
        getTablePreferences,
        updateTablePreferences,
        loading,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
};
