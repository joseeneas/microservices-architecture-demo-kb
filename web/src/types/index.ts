export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface UserCreate {
  name: string;
  email: string;
  password?: string; // optional temp password
}

export interface ResetPasswordResponse {
  temp_password: string;
}

export interface UserUpdate {
  name?: string;
  email?: string;
}

export interface OrderItem {
  sku: string;
  quantity: number;
  price: string | number;
}

export interface Order {
  id: string;
  user_id: number;
  total: string;
  status: string;
  items: OrderItem[];
  created_at: string;
}

export interface OrderCreate {
  id: string;
  user_id: number;
  total: number;
  status?: string;
  items: OrderItem[];
}

export interface OrderUpdate {
  user_id?: number;
  total?: number;
  status?: string;
  items?: OrderItem[];
}

export interface InventoryItem {
  id: number;
  sku: string;
  qty: number;
  created_at: string;
}

export interface InventoryItemCreate {
  sku: string;
  qty: number;
}

export interface InventoryItemUpdate {
  sku?: string;
  qty?: number;
}
