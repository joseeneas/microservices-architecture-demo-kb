# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Core commands

- Start the full stack (build + run):
  - `make up`
- Follow logs (gateway + services):
  - `make logs`
- Stop everything:
  - `make down`
- Rebuild images without cache:
  - `make rebuild`
- Build or run a single service with Docker Compose:
  - Build: `docker compose build users` (or `orders`, `inventory`)
  - Run detached: `docker compose up -d users`

Local (non-Docker) service run for development:

- From a service directory (e.g., `services/users`):
  - Install deps: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
  - Run: `uvicorn app.main:app --host 0.0.0.0 --port 8000`

Notes on linting/tests:

- No project-level lint or test configuration is present (no pytest/flake8 configs found). If tests are added later, document the commands here (including how to run a single test).

## Big-picture architecture

- Orchestration: Docker Compose (`docker-compose.yml`) defines services on a single bridge network `msnet`.
  - `gateway` (Nginx) publishes `localhost:8080 -> container:80` and depends on backend services + web UI.
  - Backends: `users`, `orders`, `inventory` — FastAPI apps (Python 3.11) with PostgreSQL databases.
  - Frontend: `web` — React + TypeScript SPA with Tailwind CSS.
- Routing: `gateway/nginx.conf` performs path-based reverse proxying with trailing-slash normalization:
  - Redirects `/users` → `/users/`, `/orders` → `/orders/`, `/inventory` → `/inventory/`.
  - Proxies:
    - `/users/` → `users:8000/`
    - `/orders/` → `orders:8000/`
    - `/inventory/` → `inventory:8000/`
    - `/` → `web:80/` (React SPA)
- Service apps (FastAPI):
  - Location of entrypoints: `services/<name>/app/main.py`.
  - Each has full CRUD operations with PostgreSQL persistence.
  - Health check: `GET /healthz` — returns `{ "status": "healthy" }`.
- Databases: PostgreSQL 15 containers with persistent volumes (`users-db`, `orders-db`, `inventory-db`).
- Inter-service communication: HTTP calls via internal Docker hostnames (e.g., `users:8000`).
  - Orders service validates users and inventory before creating orders.
  - Orders service automatically deducts inventory when orders are placed.
- Authentication: JWT-based authentication fully implemented across all services and web UI.

## Useful URLs and curl checks

- Gateway base URL: `http://localhost:8080/`
- Web UI: `http://localhost:8080/` (React SPA)
- Health checks:
  - `curl http://localhost:8080/users/healthz`
  - `curl http://localhost:8080/orders/healthz`
  - `curl http://localhost:8080/inventory/healthz`
- Service endpoints (most require authentication):
  - Users: `http://localhost:8080/users/`
  - Orders: `http://localhost:8080/orders/`
  - Inventory: `http://localhost:8080/inventory/`

### Authentication Testing

**Register a new user:**
```bash
curl -X POST http://localhost:8080/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

**Login and get JWT token:**
```bash
curl -X POST http://localhost:8080/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Access protected endpoint with token:**
```bash
TOKEN="your-jwt-token-here"
curl http://localhost:8080/users/me -H "Authorization: Bearer $TOKEN"
```

**Test user (admin):**
- Email: `admin@test.com`
- Password: `password123`
- Role: `admin`

## Repository layout (high level)

- `docker-compose.yml` — service topology, network, and database configuration.
- `gateway/nginx.conf` — reverse proxy and path routing.
- `services/<service>/` — Microservice directories:
  - `app/main.py` — FastAPI application and endpoints.
  - `app/models.py` — SQLAlchemy ORM models.
  - `app/schemas.py` — Pydantic validation schemas.
  - `app/crud.py` — Database operations.
  - `app/database.py` — Database connection setup.
  - `app/auth.py` — Authentication utilities (JWT validation in all services).
  - `app/clients/` — HTTP clients for inter-service communication (orders service).
  - `Dockerfile` — Service container definition.
  - `requirements.txt` — Python dependencies.
- `web/` — React + TypeScript frontend:
  - `src/components/` — Reusable components (Layout, Sidebar, DataTable).
  - `src/pages/` — Page components (LoginPage, UsersPage, OrdersPage, InventoryPage).
  - `src/context/` — React context for auth state management.
  - `src/types/` — TypeScript type definitions.
  - `src/api/` — API client modules with auth interceptors.
- `Makefile` — convenience targets for compose lifecycle.

## Authentication

### Status: ✅ Fully Implemented

**Users Service:**
- JWT-based authentication with bcrypt password hashing (passlib==1.7.4, bcrypt==4.0.1)
- Registration endpoint: `POST /users/register` (returns JWT token)
- Login endpoint: `POST /users/login` (returns JWT token)
- Current user endpoint: `GET /users/me` (authenticated)
- Protected endpoints with role-based access control:
  - `GET /users/` (list users) - admin only
  - `GET /users/{id}` (get user) - authenticated
  - `PUT /users/{id}` (update user) - self or admin
  - `DELETE /users/{id}` (delete user) - admin only

**Orders Service:**
- All endpoints require authentication
- Users see only their own orders, admins see all
- Create/update/delete restricted to order owner or admin

**Inventory Service:**
- All read endpoints require authentication
- Create/update/delete restricted to admin only

**Web UI:**
- AuthContext managing authentication state
- LoginPage with combined login/register forms
- Protected routes - redirects to login if not authenticated
- Axios interceptors automatically add Authorization header
- Token stored in localStorage with 30-minute expiration

**Technology Stack:**
- python-jose[cryptography] for JWT handling
- passlib==1.7.4 with bcrypt==4.0.1 for password hashing
- Python 3.11 (for passlib/bcrypt compatibility)
- FastAPI HTTPBearer security scheme
- React Context API for auth state

**Database Schema Changes:**
```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
```

## Web UI

### Status: ✅ Fully Implemented

**Features:**
- Modern React SPA with TypeScript and Tailwind CSS
- Left sidebar navigation with user info and logout
- Fully authenticated flow (login/register pages)
- Three main pages with reusable DataTable component:
  - **UsersPage**: Searchable table with ID, Name, Email, Role badges, Created date
  - **OrdersPage**: Searchable table with Order ID, User ID, Items count, Total, Status badges (color-coded), Created date
  - **InventoryPage**: Searchable table with ID, SKU (monospaced), Quantity (color-coded by stock level), Created date
- Edit/Delete actions for all tables
- Responsive design with hover effects

**Technical Implementation:**
- `Layout.tsx` - Main layout wrapper with sidebar and content area
- `Sidebar.tsx` - Dark navigation sidebar with active state highlighting
- `DataTable.tsx` - Generic table with search, sorting, and action buttons
- `AuthContext.tsx` - Global auth state with login/logout/token management
- `apiClient.ts` - Axios instance with automatic Authorization header injection
- Protected routes that redirect to login when unauthenticated

## Inventory Management

- Orders automatically deduct inventory when created (status != "cancelled")
- Cancelled orders restore inventory
- Reactivating cancelled orders re-deducts inventory
- Rollback logic ensures consistency if deductions fail mid-transaction
- Logging for all inventory operations in Orders service

## Database Operations

**Direct database access (for debugging/setup):**
```bash
# Users database
docker exec microservices-architecture-demo-users-db-1 psql -U users -d usersdb -c "SELECT * FROM users;"

# Orders database
docker exec microservices-architecture-demo-orders-db-1 psql -U orders -d ordersdb -c "SELECT * FROM orders;"

# Inventory database
docker exec microservices-architecture-demo-inventory-db-1 psql -U inventory -d inventorydb -c "SELECT * FROM inventory;"
```

**Make a user an admin:**
```bash
docker exec microservices-architecture-demo-users-db-1 psql -U users -d usersdb -c "UPDATE users SET role = 'admin' WHERE email = 'admin@test.com';"
```

## Performance Improvements

### Frontend Optimizations
- **Lazy Loading**: Routes and heavy components are lazy-loaded with React.lazy() and Suspense
- **React Query Caching**: Configured with 5-minute stale time, 10-minute garbage collection time
- **Code Splitting**: Automatic code splitting for each lazy-loaded route

### Backend Optimizations
- **Redis Caching**: Redis 7 instance for caching frequently accessed data
  - Users service: DB 0 (redis://redis:6379/0)
  - Orders service: DB 1 (redis://redis:6379/1)
  - Inventory service: DB 2 (redis://redis:6379/2)
- **Database Indexes**: Indexes on frequently queried columns (see scripts/add_indexes.sql)
  - Users: email, role, is_active, created_at
  - Orders: user_id, status, created_at (composite indexes for common patterns)
  - Inventory: sku, qty, created_at
  - Order Events: order_id, created_at, event_type

### How to Apply Database Indexes
```bash
# Run index creation script
docker exec -i microservices-architecture-demo-users-db-1 psql -U users < scripts/add_indexes.sql
```

## Backend Improvements

### Enhanced Validation
- **Order Items Validation** (services/orders/app/validators.py):
  - Maximum 100 items per order
  - No duplicate SKUs
  - Quantity limits (1-10,000)
  - Price limits (0-1,000,000)
  - Order total verification
- **Status Transition Validation**:
  - Enforces valid status transitions:
    - pending → processing or cancelled
    - processing → shipped or cancelled
    - shipped → delivered or cancelled
    - cancelled → pending (reactivation)

### Webhook System
- **Event Notifications** (services/orders/app/webhooks.py):
  - Sends HTTP POST webhooks for order events
  - Events: order.created, order.status_changed, order.updated, order.deleted
  - Configure via WEBHOOK_URLS environment variable (comma-separated)
  - Example: `WEBHOOK_URLS=https://example.com/webhook1,https://example.com/webhook2`
  - Async delivery with 5-second timeout

### Cache Module
- **Redis Caching Utilities** (services/users/app/cache.py):
  - get_cache(key) - Retrieve from cache
  - set_cache(key, value, ttl) - Store with TTL
  - delete_cache(key) - Invalidate single key
  - delete_pattern(pattern) - Invalidate multiple keys
  - @cache_result decorator - Auto-cache function results

## Tips for agents working in this repo

- When adding a new service, mirror the existing pattern:
  1) create `services/<new>/app/main.py` with a FastAPI `app`,
  2) add the service and database to `docker-compose.yml`,
  3) add an upstream and `location /<new>/` block in `gateway/nginx.conf`.
- Trailing slashes matter at the gateway; requests without `/` are redirected.
- All services use Python 3.11 (for compatibility with passlib/bcrypt).
- Database migrations are manual - use `docker exec` with psql for schema changes.
- Inter-service calls use internal Docker hostnames (e.g., `http://users:8000`).
- JWT SECRET_KEY is stored in `services/users/app/config.py` (should be env var in production).
