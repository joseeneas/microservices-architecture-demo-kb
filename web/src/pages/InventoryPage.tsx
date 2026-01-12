import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../services/inventoryApi';
import { DataTable } from '../components/DataTable';
import type { InventoryItem, InventoryItemCreate } from '../types';

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({ sku: '', qty: 0 });
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: inventoryApi.getAll,
  });

  const invalidateInventoryData = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['analytics', 'inventory'] });
  };

  const createMutation = useMutation({
    mutationFn: inventoryApi.create,
    onSuccess: () => {
      invalidateInventoryData();
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InventoryItemCreate> }) =>
      inventoryApi.update(id, data),
    onSuccess: () => {
      invalidateInventoryData();
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: inventoryApi.delete,
    onSuccess: () => {
      invalidateInventoryData();
    },
  });

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({ sku: '', qty: 0 });
    setIsModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({ sku: item.sku, qty: item.qty });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/inventory/export/csv', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory.csv';
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
      const response = await fetch('/inventory/import/csv', {
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

      setImportResult(`✓ Created: ${result.created_count}, Updated: ${result.updated_count}, Skipped: ${result.skipped_count}`);
      invalidateInventoryData();
      
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

  const columns = [
    { key: 'id', label: 'ID', align: 'right' as const, sortable: true, hideBelow: 'md' as const },
    {
      key: 'sku',
      label: 'SKU',
      sortable: true,
      thClassName: 'w-[50%]',
      tdClassName: 'w-[50%]',
      render: (item: InventoryItem) => (
        <span className="font-mono font-medium">{item.sku}</span>
      ),
    },
    {
      key: 'qty',
      label: 'Quantity',
      align: 'right' as const,
      thClassName: 'w-[15%]',
      tdClassName: 'w-[15%]',
      render: (item: InventoryItem) => (
        <span
          className={`font-medium ${
            item.qty === 0
              ? 'text-error'
              : item.qty < 20
              ? 'text-warning'
              : 'text-success'
          }`}
        >
          {item.qty}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      hideBelow: 'sm' as const,
      render: (item: InventoryItem) => new Date(item.created_at).toLocaleDateString(),
    },
  ];

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-3xl font-bold text-onSurface">Inventory</h2>
            <p className="text-muted mt-1">Track and manage product stock levels</p>
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
            />
            <button
              onClick={openCreateModal}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition font-medium shadow-sm"
            >
              + Add Item
            </button>
          </div>
        </div>
        {importResult && (
          <div className={`mt-2 p-2 text-sm rounded ${importResult.startsWith('✓') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {importResult}
          </div>
        )}
      </div>

      <DataTable
        data={items || []}
        columns={columns}
        onEdit={openEditModal}
        onDelete={(item) => handleDelete(item.id)}
        searchable={true}
        searchKeys={['sku']}
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Item' : 'Create Item'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-onSurface mb-1">SKU</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-onSurface mb-1">Quantity</label>
                <input
                  type="number"
                  value={formData.qty}
                  onChange={(e) => setFormData({ ...formData, qty: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-700 hover:text-gray-900">
                  Cancel
                </button>
                <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition">
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
