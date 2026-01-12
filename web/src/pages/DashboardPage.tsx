import { useMemo, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import apiClient from '../services/apiClient';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ComposedChart,
  Area,
} from 'recharts';
import { ChartBox } from '../components/ChartBox';

interface UserAnalytics {
  total_users: number;
  active_users: number;
  inactive_users: number;
  role_breakdown: Record<string, number>;
  recent_signups_7d: number;
}

interface OrderAnalytics {
  total_orders: number;
  total_revenue: string;
  status_breakdown: Record<string, number>;
  recent_orders_7d: number;
  recent_orders: Array<{
    id: string;
    user_id: number;
    total: string;
    status: string;
    created_at: string;
  }>;
}

interface InventoryAnalytics {
  total_items: number;
  total_quantity: number;
  out_of_stock: number;
  low_stock: number;
  low_stock_items: Array<{
    id: number;
    sku: string;
    qty: number;
  }>;
}

interface OrdersTimeseriesResponse {
  days: number;
  series: Array<{ date: string; orders: number; revenue: number }>;
}

interface OrdersForecastResponse {
  days: number;
  method: 'linear' | 'exp';
  seasonality: 'none' | 'weekday';
  history: Array<{ date: string; revenue: number }>;
  forecast: Array<{ date: string; revenue: number; lower?: number; upper?: number }>;
  anomalies?: Array<{ date: string; revenue: number; z: number }>;
}

interface UsersTimeseriesResponse {
  days: number;
  series: Array<{ date: string; signups: number }>;
}

export function DashboardPage() {
  const { user, token } = useAuth();
  const { preferences } = usePreferences();
  const [days, setDays] = useState<number>(30);
  const navigate = useNavigate();
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  const { data: userAnalytics } = useQuery({
    queryKey: ['analytics', 'users'],
    enabled: !!token,
    refetchOnMount: 'always',
    queryFn: async (): Promise<UserAnalytics> => {
      const { data } = await apiClient.get('/users/analytics');
      return data;
    },
  });

  const { data: orderAnalytics } = useQuery({
    queryKey: ['analytics', 'orders'],
    enabled: !!token,
    refetchOnMount: 'always',
    queryFn: async (): Promise<OrderAnalytics> => {
      const { data } = await apiClient.get('/orders/analytics');
      return data;
    },
  });

  const { data: inventoryAnalytics } = useQuery({
    queryKey: ['analytics', 'inventory'],
    enabled: !!token,
    refetchOnMount: 'always',
    queryFn: async (): Promise<InventoryAnalytics> => {
      const { data } = await apiClient.get('/inventory/analytics');
      return data;
    },
  });

  const { data: ordersSeries } = useQuery({
    queryKey: ['analytics', 'orders', 'timeseries', days],
    enabled: !!token,
    refetchOnMount: 'always',
    queryFn: async (): Promise<OrdersTimeseriesResponse> => {
      const { data } = await apiClient.get(`/orders/analytics/timeseries?days=${days}`);
      return data;
    },
  });

  const { data: usersSeries } = useQuery({
    queryKey: ['analytics', 'users', 'timeseries', days],
    enabled: !!token && user?.role === 'admin',
    refetchOnMount: 'always',
    queryFn: async (): Promise<UsersTimeseriesResponse> => {
      const { data } = await apiClient.get(`/users/analytics/timeseries?days=${days}`);
      return data;
    },
  });

  const { data: forecast } = useQuery({
    queryKey: ['analytics', 'orders', 'forecast', days, preferences.forecastMethod, preferences.forecastSeasonality, preferences.forecastConfidence],
    enabled: !!token,
    refetchOnMount: 'always',
    queryFn: async (): Promise<OrdersForecastResponse> => {
      const method = preferences.forecastMethod || 'auto';
      const seas = preferences.forecastSeasonality || 'auto';
      const conf = (preferences.forecastConfidence || 95) / 100;
      const { data } = await apiClient.get(`/orders/analytics/forecast?days=${days}&method=${method}&seasonality=${seas}&conf=${conf}`);
      return data;
    },
  });

  const statusData = useMemo(() => {
    if (!orderAnalytics?.status_breakdown) return [] as { name: string; value: number }[];
    return Object.entries(orderAnalytics.status_breakdown).map(([name, value]) => ({ name, value: Number(value) }));
  }, [orderAnalytics?.status_breakdown]);

  const roleData = useMemo(() => {
    if (!userAnalytics?.role_breakdown) return [] as { name: string; value: number }[];
    return Object.entries(userAnalytics.role_breakdown).map(([name, value]) => ({ name, value: Number(value) }));
  }, [userAnalytics?.role_breakdown]);

  const lowStockBars = useMemo(() => {
    const items = inventoryAnalytics?.low_stock_items ?? [];
    return items.slice(0, 10).map(i => ({ sku: i.sku, qty: i.qty }));
  }, [inventoryAnalytics?.low_stock_items]);

  // Palettes
  const OKABE_ITO = ['#0072B2', '#D55E00', '#009E73', '#E69F00', '#56B4E9', '#F0E442', '#CC79A7', '#000000'];
  const BRAND = ['#3b82f6', '#22c55e', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#f97316', '#64748b'];

  const effectivePalette = (() => {
    const pref = preferences.chartPalette || 'accessible';
    if (pref === 'auto') {
      return preferences.theme === 'dark' ? OKABE_ITO : BRAND;
    }
    return pref === 'brand' ? BRAND : OKABE_ITO;
  })();

  const PALETTE = effectivePalette;
  const COLORS = PALETTE; // alias for pie mapping fallback

  // Status → color mapping (switches with palette where appropriate)
  const STATUS_COLORS: Record<string, string> = preferences.chartPalette === 'brand'
    ? {
        completed: '#22c55e',
        delivered: '#22c55e',
        shipped: '#3b82f6',
        processing: '#0ea5e9',
        pending: '#eab308',
        cancelled: '#ef4444',
        failed: '#ef4444',
      }
    : {
        completed: '#009E73',
        delivered: '#009E73',
        shipped: '#56B4E9',
        processing: '#0072B2',
        pending: '#E69F00',
        cancelled: '#D55E00',
        failed: '#D55E00',
      };

  const ordersSeriesData = ordersSeries?.series ?? [];
  const usersSeriesData = usersSeries?.series ?? [];

  const composedData = useMemo(() => {
    const anomalyDates = new Set((forecast?.anomalies ?? []).map(a => a.date));
    const hist = ordersSeriesData.map(s => ({
      date: s.date,
      orders: s.orders,
      revenue: s.revenue,
      revenue_forecast: null as number | null,
      revenue_lower: null as number | null,
      revenue_band: null as number | null,
      anomaly_value: anomalyDates.has(s.date) ? s.revenue : null,
    }));
    const fc = (forecast?.forecast ?? []).map(s => ({
      date: s.date,
      orders: null as any,
      revenue: null as any,
      revenue_forecast: s.revenue,
      revenue_lower: s.lower ?? null,
      revenue_band: s.upper != null && s.lower != null ? (s.upper - s.lower) : null,
      anomaly_value: null,
    }));
    return [...hist, ...fc];
  }, [ordersSeriesData, forecast?.forecast]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-onSurface">Dashboard</h2>
        <p className="text-muted mt-1">Analytics and key metrics overview</p>
      </div>

      {/* Key Metrics Table */}
      <div className="w-[50%] mx-auto">
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-bold text-onSurface mb-3">Key Metrics</h3>
        <DataTable
          data={[
            { metric: 'Total Revenue', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(orderAnalytics?.total_revenue ?? 0)) },
            { metric: 'Total Orders', value: String(orderAnalytics?.total_orders ?? 0) },
            { metric: 'Recent Orders (7d)', value: String(orderAnalytics?.recent_orders_7d ?? 0) },
            ...(user?.role === 'admin' ? [{ metric: 'Active Users', value: `${userAnalytics?.active_users ?? 0} (from ${userAnalytics?.total_users ?? 0})` }] : []),
            { metric: 'Low Stock', value: String(inventoryAnalytics?.low_stock ?? 0) },
            { metric: 'Inventory out of stock', value: String(inventoryAnalytics?.out_of_stock ?? 0) },
          ]}
          columns={[
            { key: 'metric', label: 'Metric' },
            { key: 'value', label: 'Value', align: 'right' as const },
          ]}
          searchable={false}
          pagination={false}
        />
      </div>
      </div>
      {/* Trends (30 days) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 w-full">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="text-xs text-muted">
            <span title="Forecast methods: Linear (trend line), Exponential (Holt). Auto picks based on trend strength. Bands reflect chosen confidence level (±z·σ). Seasonality can auto‑detect weekday patterns.">ℹ️ Forecast help</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Build CSV from composedData
                const rows = composedData.map(r => ({
                  date: r.date,
                  orders: r.orders ?? '',
                  revenue: r.revenue ?? '',
                  revenue_forecast: r.revenue_forecast ?? '',
                  lower: r.revenue_lower ?? '',
                  upper: r.revenue_lower != null && r.revenue_band != null ? (Number(r.revenue_lower) + Number(r.revenue_band)) : '',
                }));
                const header = Object.keys(rows[0] || { date:'',orders:'',revenue:'',revenue_forecast:'',lower:'',upper:''});
                const csv = [header.join(','), ...rows.map(r => header.map(h => r[h as keyof typeof r]).join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `orders_revenue_${days}d.csv`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:border-gray-400"
            >
              Export CSV
            </button>
            <button
              onClick={() => {
                const svg = chartWrapRef.current?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
                if (!svg) return;
                const clone = svg.cloneNode(true) as SVGSVGElement;
                // inline font color styles are fine; wrap in xmlns
                clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                const data = new XMLSerializer().serializeToString(clone);
                const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `orders_revenue_${days}d.svg`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:border-gray-400"
            >
              Export SVG
            </button>
          </div>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded border text-sm ${days === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-gray-400'}`}
            >
              {d}d
            </button>
          ))}
        </div>
        {/* Orders & Revenue */}
        <div className="bg-white rounded-lg shadow p-6 w-full" ref={chartWrapRef}>
          <h3 className="text-lg font-bold text-onSurface mb-1">Orders & Revenue ({days}d)</h3>
          <p className="text-xs text-muted mb-3">Forecast: {forecast?.method ?? (preferences.forecastMethod || 'auto')} • Seasonality: {forecast?.seasonality ?? 'n/a'}</p>
          {ordersSeriesData.length ? (
            <ChartBox height={256}>
              {({ width, height }) => (
                <ComposedChart width={width} height={height} data={composedData} margin={{ right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" allowDecimals={false} label={{ value: 'Orders', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Revenue', angle: -90, position: 'insideRight' }} />
                  <Tooltip formatter={(value: any, name: string) => {
                    if (name === 'Revenue') {
                      const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
                      return [currency.format(Number(value)), name];
                    }
                    return [value, name];
                  }} />
                  <Legend />
                  {/* Confidence band (stacked area: lower + band thickness) */}
                  <Area yAxisId="right" type="monotone" dataKey="revenue_lower" stackId="ci" stroke="none" fill="transparent" activeDot={false} isAnimationActive={false} />
                  <Area yAxisId="right" type="monotone" dataKey="revenue_band" stackId="ci" stroke="none" fill={preferences.chartPalette === 'brand' ? '#16a34a' : '#CC79A7'} fillOpacity={0.15} isAnimationActive={false} />
                  <Line type="monotone" yAxisId="left" dataKey="orders" name="Orders" stroke={preferences.chartPalette === 'brand' ? '#3b82f6' : '#0072B2'} strokeWidth={2} dot={false} />
                  <Line type="monotone" yAxisId="right" dataKey="revenue" name="Revenue" stroke={preferences.chartPalette === 'brand' ? '#22c55e' : '#D55E00'} strokeWidth={2} dot={false} />
                  <Line type="monotone" yAxisId="right" dataKey="revenue_forecast" name="Revenue (forecast)" stroke={preferences.chartPalette === 'brand' ? '#16a34a' : '#CC79A7'} strokeWidth={2} strokeDasharray="6 6" dot={false} />
                  <Line
                    type="monotone"
                    yAxisId="right"
                    dataKey="anomaly_value"
                    name="Anomaly"
                    stroke="none"
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (payload?.anomaly_value == null) return <g />;
                      return (
                        <g>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill="#ef4444"
                            stroke="#ef4444"
                            className="cursor-pointer"
                            onClick={() => navigate(`/orders?date=${payload.date}`)}
                          />
                        </g>
                      );
                    }}
                  />
                </ComposedChart>
              )}
            </ChartBox>
          ) : (
            <p className="text-muted">No data</p>
          )}
        </div>
        {/* Signups */}
        {user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow p-6 w-full">
            <h3 className="text-lg font-bold text-onSurface mb-4">User Signups ({days}d)</h3>
            {usersSeriesData.length ? (
              <ChartBox height={256}>
                {({ width, height }) => (
                  <LineChart width={width} height={height} data={usersSeriesData} margin={{ right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="signups" name="Signups" stroke={preferences.chartPalette === 'brand' ? '#22c55e' : '#009E73'} strokeWidth={2} dot={false} />
                  </LineChart>
                )}
              </ChartBox>
            ) : (
              <p className="text-muted">No data</p>
            )}
          </div>
        )}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
        {/* Order status pie */}
        <div className="bg-white rounded-lg shadow p-6 w-full">
          <h3 className="text-lg font-bold text-onSurface mb-4">Order Status</h3>
          {statusData.length ? (
            <ChartBox height={256}>
              {({ width, height }) => (
                <PieChart width={width} height={height}>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusData.map((s, index) => {
                      const key = (s.name || '').toLowerCase();
                      const fill = STATUS_COLORS[key] || COLORS[index % COLORS.length];
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              )}
            </ChartBox>
          ) : (
            <p className="text-muted">No data</p>
          )}
        </div>
        {/* User roles bar (admin only) */}
        {user?.role === 'admin' ? (
          <div className="bg-white rounded-lg shadow p-6 w-full">
            <h3 className="text-lg font-bold text-onSurface mb-4">User Roles</h3>
            {roleData.length ? (
              <ChartBox height={256}>
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={roleData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill={preferences.chartPalette === 'brand' ? '#3b82f6' : '#56B4E9'} radius={[6,6,0,0]} />
                  </BarChart>
                )}
              </ChartBox>
            ) : (
              <p className="text-muted">No data</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-onSurface mb-4">Recent Orders (7d)</h3>
            <p className="text-3xl font-semibold">{orderAnalytics?.recent_orders_7d ?? 0}</p>
          </div>
        )}
        {/* Low stock bar */}
        <div className="bg-white rounded-lg shadow p-6 w-full">
          <h3 className="text-lg font-bold text-onSurface mb-4">Low Stock (Top 10)</h3>
          {lowStockBars.length ? (
            <ChartBox height={256}>
              {({ width, height }) => (
                <BarChart width={width} height={height} data={lowStockBars} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sku" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="qty" fill={preferences.chartPalette === 'brand' ? '#ef4444' : '#D55E00'} radius={[6,6,0,0]} />
                </BarChart>
              )}
            </ChartBox>
          ) : (
            <p className="text-muted">No low stock items</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Recent Orders (Table) */}
        <div className="w-[75%] mx-auto lg:w-full lg:mx-0">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-onSurface mb-4">Recent Orders</h3>
            {orderAnalytics?.recent_orders?.length ? (
              <>
              {(() => {
                const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
                return (
              <DataTable
                data={orderAnalytics.recent_orders}
                columns={[
                  { key: 'id', label: 'Order ID', sortable: true, thClassName: 'w-[28%]' },
                  { key: 'user_id', label: 'User ID', align: 'right', sortable: true, thClassName: 'w-[12%]' },
                  {
                    key: 'total', label: 'Total', align: 'right', thClassName: 'w-[18%]',
                    render: (row: any) => <span className="font-medium">{currency.format(Number(row.total))}</span>,
                  },
                  {
                    key: 'status', label: 'Status', thClassName: 'w-[18%]',
                    render: (row: any) => (
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        row.status === 'completed' ? 'bg-green-100 text-green-800'
                        : row.status === 'pending' ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                      }`}>
                        {row.status}
                      </span>
                    )
                  },
                  {
                    key: 'created_at', label: 'Created', align: 'right', thClassName: 'w-[24%]',
                    render: (row: any) => new Date(row.created_at).toLocaleString(),
                  }
                ]}
                pagination={true}
                searchable={true}
                searchKeys={['id', 'status', 'user_id']}
                defaultPageSize={5}
              />
                );
              })()}
              </>
            ) : (
              <p className="text-muted text-center py-4">No recent orders</p>
            )}
          </div>
        </div>
        {/* Low Stock (Table) */}
        <div className="w-[75%] mx-auto lg:w-full lg:mx-0">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-onSurface mb-4">Low Stock Alerts</h3>
            {inventoryAnalytics?.low_stock_items?.length ? (
              <DataTable
                data={inventoryAnalytics.low_stock_items}
                columns={[
                  { key: 'sku', label: 'SKU', thClassName: 'w-[40%]', render: (row: any) => <span className="font-mono">{row.sku}</span> },
                  { key: 'qty', label: 'Quantity', align: 'right', thClassName: 'w-[20%]' },
                  { key: 'id', label: 'ID', align: 'right', thClassName: 'w-[20%]' }
                ]}
                pagination={false}
                searchable={true}
                searchKeys={['sku']}
                defaultPageSize={5}
              />
            ) : (
              <p className="text-muted text-center py-4">No low stock items</p>
            )}
          </div>
        </div>
      </div>
      {/* Status Breakdown (Chart replaces table) */}
      {user?.role === 'admin' && statusData.length > 0 && (
        <div className="w-[50%] mx-auto">
          <div className="bg-white rounded-lg shadow p-6 mt-6 w-full">
            <h3 className="text-lg font-bold text-onSurface mb-4">Order Status Breakdown</h3>
            <ChartBox height={288}>
              {({ width, height }) => (
                <PieChart width={width} height={height}>
                  <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={100} label>
                    {statusData.map((s, index) => {
                      const key = (s.name || '').toLowerCase();
                      const fill = STATUS_COLORS[key] || COLORS[index % COLORS.length];
                      return <Cell key={`cell-admin-${index}`} fill={fill} />;
                    })}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              )}
            </ChartBox>
          </div>
        </div>
      )}
    </div>
  );
}
