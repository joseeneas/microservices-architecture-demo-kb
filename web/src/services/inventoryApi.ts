import apiClient from './apiClient';
import type { InventoryItem, InventoryItemCreate, InventoryItemUpdate } from '../types';

const API_BASE = '/inventory';

export const inventoryApi = {
  getAll: async (): Promise<InventoryItem[]> => {
    const { data } = await apiClient.get(API_BASE + '/');
    return data;
  },

  getById: async (id: number): Promise<InventoryItem> => {
    const { data } = await apiClient.get(`${API_BASE}/${id}`);
    return data;
  },

  create: async (item: InventoryItemCreate): Promise<InventoryItem> => {
    const { data } = await apiClient.post(API_BASE + '/', item);
    return data;
  },

  update: async (id: number, item: InventoryItemUpdate): Promise<InventoryItem> => {
    const { data} = await apiClient.put(`${API_BASE}/${id}`, item);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${API_BASE}/${id}`);
  },
};
