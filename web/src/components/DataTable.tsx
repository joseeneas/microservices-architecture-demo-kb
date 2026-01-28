import { useState, useMemo, useEffect } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  thClassName?: string;
  tdClassName?: string;
  hideBelow?: 'sm' | 'md' | 'lg'; // hides column below breakpoint
}

interface CustomAction<T> {
  label: string;
  onClick: (item: T) => void;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  customActions?: CustomAction<T>[];
  searchable?: boolean;
  searchKeys?: string[];
  tableName?: string;
  pagination?: boolean;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  onEdit,
  onDelete,
  customActions = [],
  searchable = true,
  searchKeys = [],
  pagination = true,
  pageSizeOptions = [5, 10, 20, 50,100],
  defaultPageSize = 10,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  useEffect(() => {
    // reset to first page when search changes
    setPage(1);
  }, [searchTerm]);

  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(columnKey);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedData = useMemo(() => {
    let result = data;

    // Filter
    if (searchable && searchTerm) {
      result = result.filter((item) => {
        const searchLower = searchTerm.toLowerCase();
        return searchKeys.some((key) => {
          const value = item[key];
          return value?.toString().toLowerCase().includes(searchLower);
        });
      });
    }

    // Sort
    if (sortBy) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        
        if (aVal === bVal) return 0;
        
        const comparison = aVal < bVal ? -1 : 1;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchTerm, searchable, searchKeys, sortBy, sortOrder]);

  const totalItems = filteredAndSortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / (pagination ? pageSize : totalItems || 1)));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedData = useMemo(() => {
    if (!pagination) return filteredAndSortedData;
    const start = (page - 1) * pageSize;
    return filteredAndSortedData.slice(start, start + pageSize);
  }, [filteredAndSortedData, pagination, page, pageSize]);

  const startItem = pagination ? (page - 1) * pageSize + 1 : (totalItems ? 1 : 0);
  const endItem = pagination ? Math.min(page * pageSize, totalItems) : totalItems;

  return (
    <div className="space-y-4">
      {/* Search + Meta */}
      <div className="flex items-center justify-between">
        {searchable ? (
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
          />
        ) : <span />}
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>
            {totalItems === 0 ? '0 items' : `Showing ${startItem}-${endItem} of ${totalItems} items `}
          </span>
          {pagination && (
            <label className="flex items-center gap-2">
              <span>--Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-1 text-onSurface bg-white"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-surface">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-6 py-3 text-xs font-medium text-muted uppercase tracking-wider ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                    } ${column.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''} ${column.hideBelow ? `hidden ${column.hideBelow}:table-cell` : ''} ${column.thClassName || ''}`}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      {column.label}
                      {column.sortable && sortBy === column.key && (
                        <span className="text-xs">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </th>
                ))}
                {(onEdit || onDelete || customActions.length > 0) && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider w-[120px]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-onSurface">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (onEdit || onDelete || customActions.length > 0 ? 1 : 0)}
                    className="px-6 py-8 text-center text-muted"
                  >
                    No data found
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => (
                  <tr key={index} className="transition-colors">
                    {columns.map((column) => (
                      <td key={column.key} className={`px-6 py-4 whitespace-normal wrap-break-words text-sm text-onSurface ${
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                      } ${column.hideBelow ? `hidden ${column.hideBelow}:table-cell` : ''} ${column.tdClassName || ''}`}>
                        {column.render ? column.render(item) : item[column.key]}
                      </td>
                    ))}
                    {(onEdit || onDelete || customActions.length > 0) && (
                      <td className="px-6 py-4 whitespace-normal text-right text-sm font-medium space-x-2 w-[120px]">
                        {customActions.map((action, actionIdx) => (
                          <button
                            key={actionIdx}
                            onClick={() => action.onClick(item)}
                            className={action.className || 'text-gray-600 hover:text-gray-800 font-medium'}
                          >
                            {action.label}
                          </button>
                        ))}
                        {onEdit && (
                          <button
                            onClick={() => onEdit(item)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(item)}
                            className="text-red-600 hover:text-red-700 font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination controls */}
        {pagination && totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-surface text-sm">
            <div />
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 border rounded disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span className="px-2">Page {page} of {totalPages}</span>
              <button
                className="px-3 py-1 border rounded disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
