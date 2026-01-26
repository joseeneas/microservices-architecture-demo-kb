import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../services/ordersApi';
import { usersApi } from '../services/usersApi';
import { inventoryApi } from '../services/inventoryApi';
import { DataTable } from '../components/DataTable';
import type { Order, OrderCreate, OrderItem } from '../types';

export function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [formData, setFormData] = useState({ 
    id: '', 
    user_id: 0, 
    total: 0, 
    status: 'pending',
    items: [] as OrderItem[]
  });
  const [currentItem, setCurrentItem] = useState({ sku: '', quantity: 1, price: 0 });
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: ordersApi.getAll,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const { data: inventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: inventoryApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      closeModal();
    },
    onError: (error: any) => {
      setError(error.response?.data?.detail || 'Failed to create order');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<OrderCreate> }) =>
      ordersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ordersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  // Auto-calculate total when items change
  useEffect(() => {
    const total = formData.items.reduce((sum, item) => {
      const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      return sum + (price * item.quantity);
    }, 0);
    setFormData(prev => ({ ...prev, total }));
  }, [formData.items]);

  const openCreateModal = () => {
    setEditingOrder(null);
    setFormData({ id: '', user_id: 0, total: 0, status: 'pending', items: [] });
    setCurrentItem({ sku: '', quantity: 1, price: 0 });
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setFormData({ 
      id: order.id, 
      user_id: order.user_id, 
      total: parseFloat(order.total), 
      status: order.status,
      items: order.items || []
    });
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setError(null);
  };

  const addItem = () => {
    if (!currentItem.sku || currentItem.quantity <= 0 || currentItem.price <= 0) {
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { ...currentItem }]
    }));
    setCurrentItem({ sku: '', quantity: 1, price: 0 });
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (editingOrder) {
      const { id, ...updateData } = formData;
      updateMutation.mutate({ id: editingOrder.id, data: updateData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this order?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/orders/export/csv', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orders.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/orders/import/csv', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Import failed');
      }

      const inventoryMsg = result.inventory_created_count > 0 ? `, Inventory auto-created: ${result.inventory_created_count}` : '';
      setImportResult(`✓ Created: ${result.created_count}, Updated: ${result.updated_count}, Skipped: ${result.skipped_count}${inventoryMsg}`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      
      if (result.errors && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
      }
    } catch (error) {
      setImportResult('✗ ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const counts = useMemo(() => {
    const c = { all: (orders?.length || 0), pending: 0, completed: 0, cancelled: 0 };
    (orders || []).forEach((o) => {
      const s = (o.status || '').toLowerCase();
      if (s === 'pending' || s === 'completed' || s === 'cancelled') {
        // @ts-ignore - keyof type literal
        c[s] += 1;
      }
    });
    return c;
  }, [orders]);

  const columns = [
    { key: 'id', label: 'Order ID', sortable: true, thClassName: 'w-[20%]', tdClassName: 'w-[20%]' },
    { key: 'user_id', label: 'User ID', align: 'right' as const, sortable: true, thClassName: 'w-[12%]', tdClassName: 'w-[12%]' },
    {
      key: 'items',
      label: 'Lines',
      align: 'right' as const,
      thClassName: 'w-[10%]',
      tdClassName: 'w-[10%]',
      render: (order: Order) => (
        <span className="text-muted">{order.items?.length || 0}</span>
      ),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      align: 'right' as const,
      thClassName: 'w-[12%]',
      tdClassName: 'w-[12%]',
      render: (order: Order) => (
        <span className="font-medium">
          {order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0}
        </span>
      ),
    },
    {
      key: 'total',
      label: 'TotalX',
      align: 'right' as const,
      thClassName: 'w-[14%]',
      tdClassName: 'w-[14%]',
      render: (order: Order) => <span className="font-medium">${order.total}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center' as const,
      thClassName: 'w-[14%]',
      tdClassName: 'w-[14%]',
      render: (order: Order) => (
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            order.status === 'completed'
              ? 'bg-success-bg text-success-fg'
              : order.status === 'pending'
              ? 'bg-warning-bg text-warning-fg'
              : order.status === 'cancelled'
              ? 'bg-error-bg text-error-fg'
              : 'bg-neutral-bg text-onSurface'
          }`}
        >
          {order.status}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      hideBelow: 'sm' as const,
      thClassName: 'w-[12%]',
      tdClassName: 'w-[12%]',
      render: (order: Order) => new Date(order.created_at).toLocaleDateString(),
    },
  ];

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  // Optional date filter from query string
  const params = new URLSearchParams(location.search);
  const dateFilter = params.get('date');
  const filtered = (orders || [])
    .filter(o => !dateFilter || (o.created_at && o.created_at.startsWith(dateFilter)))
    .filter(o => statusFilter === 'all' ? true : ((o.status || '').toLowerCase() === statusFilter));

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-3xl font-bold text-onSurface">Orders</h2>
            <p className="text-muted mt-1">Manage customer orders and track status</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition font-medium shadow-sm text-sm"
            >
              Export CSV
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition font-medium shadow-sm text-sm"
            >
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="hidden"
              title="Import CSV file"
              aria-label="Import CSV file"
            />
            <button
              onClick={openCreateModal}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition font-medium shadow-sm"
            >
              + Add Order
            </button>
          </div>
        </div>
        {importResult && (
          <div className={`mt-2 p-2 text-sm rounded ${importResult.startsWith('✓') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {importResult}
          </div>
        )}

        {/* Status filter row (visible below header on all screen sizes) */}
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="orders-status-filter">
          {([
            { id: 'all', label: 'All', count: counts.all },
            { id: 'pending', label: 'Pending', count: counts.pending },
            { id: 'completed', label: 'Completed', count: counts.completed },
            { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
          ] as const).map(btn => (
            <button
              key={btn.id}
              onClick={() => setStatusFilter(btn.id)}
              className={`px-3 py-1.5 text-sm rounded-full border transition ${
                statusFilter === btn.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-onSurface border-gray-300 hover:border-gray-400'
              }`}
              aria-pressed={statusFilter === btn.id}
            >
              {btn.label}
              <span className={`ml-2 inline-flex items-center justify-center text-xs px-2 py-0.5 rounded-full border ${
                statusFilter === btn.id ? 'bg-white text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-800 border-gray-300'
              }`}>
                {btn.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        onEdit={openEditModal}
        onDelete={(order) => handleDelete(order.id)}
        searchable={true}
        searchKeys={['id', 'status', 'user_id', 'created_at']}
        customActions={[
          {
            label: '📈 Timeline',
            onClick: (order) => navigate(`/orders/${order.id}/timeline`),
            className: 'text-blue-600 hover:text-blue-800'
          }
        ]}
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col min-h-0 mt-6">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">
                {editingOrder ? 'Edit Order' : 'Create Order'}
              </h3>
              {error && (
                <div className="mt-3 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                {!editingOrder && (
                  <div>
                    <label className="block text-sm font-medium text-onSurface mb-1">Order ID</label>
                    <input
                      type="text"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="Enter order ID"
                      aria-label="Order ID"
                      required
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-onSurface mb-1">User</label>
                  <select
                    value={formData.user_id}
                    onChange={(e) => setFormData({ ...formData, user_id: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    aria-label="Select user"
                    required
                  >
                    <option value={0}>Select a user...</option>
                    {users?.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-onSurface mb-2">Order Items</label>
                  <div className="border border-gray-300 rounded-lg p-4 mb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
                      <div className="sm:col-span-2">
                        <select
                          value={currentItem.sku}
                          onChange={(e) => {
                            const selectedItem = inventory?.find(i => i.sku === e.target.value);
                            setCurrentItem({
                              ...currentItem,
                              sku: e.target.value,
                              price: selectedItem ? 0 : 0
                            });
                          }}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          aria-label="Select SKU"
                        >
                          <option value="">Select SKU...</option>
                          {inventory?.map((item) => (
                            <option key={item.id} value={item.sku}>
                              {item.sku} (Stock: {item.qty})
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={currentItem.quantity}
                        onChange={(e) => setCurrentItem({ ...currentItem, quantity: parseInt(e.target.value) })}
                        placeholder="Qty"
                        aria-label="Item quantity"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={currentItem.price}
                        onChange={(e) => setCurrentItem({ ...currentItem, price: parseFloat(e.target.value) })}
                        placeholder="Price"
                        aria-label="Item price"
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addItem}
                      disabled={!currentItem.sku || currentItem.quantity <= 0 || currentItem.price <= 0}
                      className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white text-sm px-3 py-1 rounded transition"
                    >
                      Add Item
                    </button>
                  </div>

                  {formData.items.length > 0 && (
                    <div className="border border-gray-300 rounded-lg p-3 max-h-40 sm:max-h-64 overflow-y-auto">
                      <div className="text-xs font-medium text-muted mb-2">Added Items:</div>
                      {formData.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm mb-1 bg-surface p-2 rounded">
                          <span>
                            {item.sku} × {item.quantity} @ ${typeof item.price === 'string' ? item.price : item.price.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-onSurface mb-1">Total</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.total}
                    readOnly
                    aria-label="Order total"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-surface"
                  />
                  <p className="text-xs text-muted mt-1">Auto-calculated from items</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-onSurface mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    aria-label="Order status"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-200 bg-white p-4 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-onSurface/70 hover:text-onSurface">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (editingOrder ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
