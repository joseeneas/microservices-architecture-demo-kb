import apiClient from './apiClient';
import type { Order, OrderCreate, OrderUpdate } from '../types';

const API_BASE = '/orders';

export const ordersApi = {
  getAll: async (): Promise<Order[]> => {
    const { data } = await apiClient.get(API_BASE + '/');
    return data;
  },

  getById: async (id: string): Promise<Order> => {
    const { data } = await apiClient.get(`${API_BASE}/${id}`);
    return data;
  },

  create: async (order: OrderCreate): Promise<Order> => {
    const { data } = await apiClient.post(API_BASE + '/', order);
    return data;
  },

  update: async (id: string, order: OrderUpdate): Promise<Order> => {
    const { data } = await apiClient.put(`${API_BASE}/${id}`, order);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${API_BASE}/${id}`);
  },
};
