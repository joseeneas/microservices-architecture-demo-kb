-- Database Indexes for Performance Optimization
-- Run these commands to add indexes to frequently queried columns

-- ======================
-- USERS DATABASE
-- ======================
\c usersdb

-- Index on email for login queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index on role for filtering admin users
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Index on is_active for filtering active users
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Index on created_at for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);


-- ======================
-- ORDERS DATABASE  
-- ======================
\c ordersdb

-- Index on user_id for filtering orders by user
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Index on status for filtering by order status
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Index on created_at for sorting and date-based queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Composite index for common query patterns (user + status)
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);

-- Composite index for recent orders queries
CREATE INDEX IF NOT EXISTS idx_orders_created_desc ON orders(created_at DESC);

-- Order Events table indexes
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);

CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

CREATE INDEX IF NOT EXISTS idx_order_events_event_type ON order_events(event_type);


-- ======================
-- INVENTORY DATABASE
-- ======================
\c inventorydb

-- Index on SKU for lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);

-- Index on qty for low stock queries
CREATE INDEX IF NOT EXISTS idx_inventory_qty ON inventory(qty);

-- Index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON inventory(created_at);

-- Composite index for low stock queries (qty < threshold)
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(qty) WHERE qty < 20;
