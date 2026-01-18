import { useState } from 'react';
import { usePreferences } from '../context/PreferencesContext';

export function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const [theme, setTheme] = useState(preferences.theme || 'light');
  const [language, setLanguage] = useState(preferences.language || 'en');
  const [chartPalette, setChartPalette] = useState<'brand' | 'accessible' | 'auto'>(preferences.chartPalette || 'accessible');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [forecastMethod, setForecastMethod] = useState<'auto' | 'linear' | 'exp' | 'hw'>(preferences.forecastMethod as any || 'auto');
  const [forecastSeasonality, setForecastSeasonality] = useState<'auto' | 'weekday' | 'none'>(preferences.forecastSeasonality || 'auto');
  const [forecastConfidence, setForecastConfidence] = useState<80 | 95 | 99>((preferences.forecastConfidence as 80|95|99) || 95);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    
    try {
      await updatePreferences({ theme, language, chartPalette, forecastMethod, forecastSeasonality, forecastConfidence });
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-onSurface">Settings</h2>
        <p className="text-muted mt-1">Manage your preferences and appearance</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.includes('success') 
              ? 'bg-success-bg text-success-fg' 
              : 'bg-error-bg text-error-fg'
          }`}>
            {message}
          </div>
        )}

        {/* Theme Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-onSurface mb-2">
            Theme
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-1">☀️</div>
                <div className="font-medium">Light</div>
              </div>
            </button>
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme('dark')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-1">🌙</div>
                <div className="font-medium">Dark</div>
              </div>
            </button>
          </div>
        </div>

        {/* Charts Palette */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-onSurface mb-2">
            Charts palette
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              aria-pressed={chartPalette === 'brand'}
              onClick={() => setChartPalette('brand')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                chartPalette === 'brand'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Brand</div>
                <div className="text-xs text-muted">Matches app accent colors</div>
              </div>
            </button>
            <button
              type="button"
              aria-pressed={chartPalette === 'accessible'}
              onClick={() => setChartPalette('accessible')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                chartPalette === 'accessible'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Accessible</div>
                <div className="text-xs text-muted">Color‑blind friendly (Okabe–Ito)</div>
              </div>
            </button>
            <button
              type="button"
              aria-pressed={chartPalette === 'auto'}
              onClick={() => setChartPalette('auto')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                chartPalette === 'auto'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Auto</div>
                <div className="text-xs text-muted">Light→Brand, Dark→Accessible</div>
              </div>
            </button>
          </div>
        </div>

        {/* Forecast Method */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-onSurface mb-2">
            Revenue forecast method
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              aria-pressed={forecastMethod === 'auto'}
              onClick={() => setForecastMethod('auto')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                forecastMethod === 'auto' ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Auto</div>
                <div className="text-xs text-muted">Pick linear when trend is strong, else exponential</div>
              </div>
            </button>
            <button
              type="button"
              aria-pressed={forecastMethod === 'linear'}
              onClick={() => setForecastMethod('linear')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                forecastMethod === 'linear' ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Linear</div>
                <div className="text-xs text-muted">Least-squares trend line</div>
              </div>
            </button>
            <button
              type="button"
              aria-pressed={forecastMethod === 'exp'}
              onClick={() => setForecastMethod('exp')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                forecastMethod === 'exp' ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Exponential</div>
                <div className="text-xs text-muted">Holt’s linear trend</div>
              </div>
            </button>
            <button
              type="button"
              aria-pressed={forecastMethod === 'hw'}
              onClick={() => setForecastMethod('hw')}
              className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                forecastMethod === 'hw' ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-left">
                <div className="font-medium mb-1">Holt‑Winters</div>
                <div className="text-xs text-muted">Trend + weekly seasonality</div>
              </div>
            </button>
          </div>
        </div>

        {/* Seasonality */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-onSurface mb-2">
            Seasonality
          </label>
          <div className="flex gap-4">
            {(['auto','weekday','none'] as const).map(opt => (
              <button key={opt}
                type="button"
                aria-pressed={forecastSeasonality === opt}
                onClick={() => setForecastSeasonality(opt)}
                className={`relative flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                  forecastSeasonality === opt ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-medium mb-1">{opt === 'auto' ? 'Auto' : opt === 'weekday' ? 'Weekday' : 'None'}</div>
                  <div className="text-xs text-muted">{opt === 'auto' ? 'Detect weekday pattern' : opt === 'weekday' ? 'Force weekday adjustments' : 'Disable seasonality'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Confidence */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-onSurface mb-2">
            Confidence level
          </label>
          <div className="flex gap-2">
            {[80,95,99].map((cl) => (
              <button key={cl}
                type="button"
                aria-pressed={forecastConfidence===cl}
                onClick={() => setForecastConfidence(cl as 80|95|99)}
                className={`px-3 py-2 rounded-lg border-2 text-sm ${forecastConfidence===cl ? 'border-blue-500 bg-blue-50 ring-2 ring-inset ring-blue-500/60 dark:ring-blue-400/60 font-semibold' : 'border-gray-300 hover:border-gray-400'}`}
              >
                {forecastConfidence===cl ? '✓ ' : ''}{cl}%
              </button>
            ))}
          </div>
        </div>

        {/* Language Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-onSurface mb-2">
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'en' | 'es' | 'pt')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
          </select>
          <p className="text-xs text-muted mt-1">
            Language support is coming soon
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition font-medium"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Table Preferences Info */}
      <div className="bg-white rounded-lg shadow p-6 max-w-2xl mt-6">
        <h3 className="text-lg font-semibold text-onSurface mb-2">Table Preferences</h3>
        <p className="text-sm text-muted">
          Your table sorting preferences are automatically saved. Click on any sortable column header to sort the data.
        </p>
      </div>
    </div>
  );
}
