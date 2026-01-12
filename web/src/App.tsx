/**
 * Application root component that sets up routing, authentication, and query client configuration.
 * 
 * @component
 * @returns {JSX.Element} The application with BrowserRouter, AuthProvider, and QueryClientProvider
 * 
 * @example
 * ```tsx
 * import App from './App';
 * 
 * ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
 * ```
 */

/**
 * Authenticated application wrapper that conditionally renders login page or dashboard.
 * 
 * @component
 * @returns {JSX.Element} Either LoginPage or Dashboard component based on authentication state
 * 
 * @remarks
 * Displays a loading state while authentication status is being determined.
 * Uses useAuth hook to access authentication context.
 */

/**
 * Main dashboard layout with navigation and route handling for authenticated users.
 * 
 * @component
 * @returns {JSX.Element} Dashboard with sidebar navigation and routed page content
 * 
 * @remarks
 * - Lazy loads heavy page components for better performance
 * - Maintains active tab state based on current route
 * - Provides QueryClient configuration with 5-minute stale time and 10-minute cache time
 * - Displays loading state while authentication context is initializing
 * 
 * @see {@link Tab} for available navigation tabs
 * 
 * @example
 * ```tsx
 * // Active tab is automatically determined from current route
 * // Users can navigate using the Layout component's tab change handler
 * ```
 */

/**
 * Available navigation tabs in the dashboard.
 * 
 * @typedef {('dashboard' | 'users' | 'orders' | 'inventory' | 'settings')} Tab
 */
import {
  lazy,
  Suspense
} from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation
} from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';
import {
  AuthProvider,
  useAuth
} from './context/AuthContext';
import {
  PreferencesProvider
} from './context/PreferencesContext';
import {
  LoginPage
} from './pages/LoginPage';
import {
  Layout
} from './components/Layout';

// Lazy load heavy components
const DashboardPage     = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const UsersPage         = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const OrdersPage        = lazy(() => import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage })));
const InventoryPage     = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const SettingsPage      = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const OrderTimelinePage = lazy(() => import('./pages/OrderTimelinePage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (was cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type Tab = 'dashboard' | 'users' | 'orders' | 'inventory' | 'settings';

function Dashboard() {
  const { isLoading } = useAuth();
  const location      = useLocation();
  const navigate      = useNavigate();
  
  // Determine active tab from current route
  const getActiveTab = (): Tab => {
    const path = location.pathname;
    if (path.startsWith('/users')) return 'users';
    if (path.startsWith('/orders')) return 'orders';
    if (path.startsWith('/inventory')) return 'inventory';
    if (path.startsWith('/settings')) return 'settings';
    return 'dashboard';
  };
  
  const activeTab = getActiveTab();
  
  const handleTabChange = (tab: Tab) => {
    navigate(`/${tab}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <div className="min-h-screen bg-surface">
          <Layout activeTab={activeTab} onTabChange={handleTabChange}>
            <Suspense fallback={
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-600">Loading...</div>
              </div>
            }>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/orders/:orderId/timeline" element={<OrderTimelinePage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </Layout>
        </div>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <AuthenticatedApp />
        </QueryClientProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <Dashboard />;
}

export default App;
