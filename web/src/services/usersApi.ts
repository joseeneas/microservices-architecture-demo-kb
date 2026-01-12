import apiClient from './apiClient';
import type { User, UserCreate, UserUpdate } from '../types';

const API_BASE = '/users';

export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const { data } = await apiClient.get(API_BASE + '/');
    return data;
  },

  getById: async (id: number): Promise<User> => {
    const { data } = await apiClient.get(`${API_BASE}/${id}`);
    return data;
  },

  create: async (user: UserCreate): Promise<User> => {
    const { data } = await apiClient.post(API_BASE + '/', user);
    return data;
  },

  resetPassword: async (id: number): Promise<{ temp_password: string }> => {
    const { data } = await apiClient.post(`${API_BASE}/${id}/reset_password`);
    return data;
  },

  update: async (id: number, user: UserUpdate): Promise<User> => {
    const { data } = await apiClient.put(`${API_BASE}/${id}`, user);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`${API_BASE}/${id}`);
  },
};
