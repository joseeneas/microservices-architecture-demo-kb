import { useAuth } from '../context/AuthContext';
import { BUILD_TIME } from '../buildInfo';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

function BuildStamp() {
  const ts = BUILD_TIME;
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return <span title={`Build UTC: ${ts}`}>Built: {d.toLocaleString()}</span>;
    }
  } catch {}
  return <span title="Build time not set">Built: dev</span>;
}

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📈' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'orders', label: 'Orders', icon: '📦' },
    { id: 'inventory', label: 'Inventory', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="flex flex-col h-full w-64 bg-brand border-r border-slate-800 text-onBrand">
      {/* Logo/Brand */}
      <div className="p-8 border-b border-slate-800 bg-brand shrink-0">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-sm mt-1">Microservices Demo</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 px-4 pt-8 pb-8 overflow-y-auto" role="navigation" aria-label="Main Navigation">
        {navItems.map((item) => (
          <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xxl transition-all mb-2 ${
          activeTab === item.id
            ? 'bg-neutral-bg text-onSurface shadow-lg rounded-xxl'
            : 'text-onBrand hover:bg-gray-800 rounded-xxl'
        }`}
          >
        <span className="text-2xl">{item.icon}</span>
        <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
      {/* User Info & Logout */}
      <div className="p-6 pb-8 border-t border-slate-800 shrink-0">
        <div className="mb-4">
          <p className="text-sm font-small text-onBrand">Signed in as {user?.email}{' '}
            Role: <span className="text-onBrand font-small">{user?.role}</span>
          </p>
        </div>
        <button
          onClick={logout}
          className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
        >
          Logout
        </button>
        <div className="mt-4 text-center text-onBrand/70 text-xs" aria-label="App version">
          v1.0 • Demo<br />
          <BuildStamp />
          <div>(c) 2025 Your Company</div>
        </div>
      </div>
    </div>
  );
};
