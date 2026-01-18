# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

This is a Kubernetes-based microservices architecture demo featuring three FastAPI backend services (users, orders, inventory) behind an NGINX gateway, each with its own PostgreSQL database, Redis caching, and a React TypeScript frontend. The application is designed to run on Minikube or Docker Desktop Kubernetes.

## Development Environment Setup

### Prerequisites

- kubectl
- minikube or Docker Desktop with Kubernetes enabled
- make
- Docker (for local image builds)
- Python 3.x (for services)
- Node.js/npm (for web frontend)

### Initial Setup

```bash
# Start Kubernetes cluster
minikube start --kubernetes-version=stable

# Build all service images inside Minikube
make build

# Deploy to Kubernetes
make apply wait

# Seed demo data (creates admin user and sample data)
make seed
```

## Common Commands

### Building and Deployment

- `make build` - Build all service images (users, orders, inventory, web) inside Minikube
- `make apply` - Apply all Kubernetes manifests from k8s/ directory
- `make wait` - Wait for all deployments to be ready
- `make build apply wait` - Full rebuild and redeploy workflow

### Local Development

- `make dev` - Start port-forward to localhost:8080 and open browser
- `make dev-stop` - Stop the port-forward process
- `make port-forward` - Manual port-forward (gateway available at <http://127.0.0.1:8080>)

### Access Methods

- **NodePort**: Gateway exposed on port 30080 - access via `$(minikube ip):30080`
- **Ingress**: Enable with `make ingress-enable && make ingress-apply`, then add host mapping: `echo "$(minikube ip) microdemo.local" | sudo tee -a /etc/hosts`
- **Port-forward** (recommended for macOS Docker driver): `make port-forward` or `make dev`

### Data Management

- `make seed` - Create admin user (<admin@test.com>), sample inventory item (SKU-001), test user (<bob@example.com>), and example order
- `make reset` - Delete and recreate the namespace (complete clean slate)
- `make down` - Delete all resources but keep namespace

### Troubleshooting

- `kubectl -n microdemo get pods` - Check status of all pods
- `kubectl -n microdemo get svc` - Check services and their cluster IPs
- `kubectl -n microdemo describe pod <pod-name>` - Detailed pod info for
- `kubectl -n microdemo logs deploy/users --tail=200` - View users service logs
- `kubectl -n microdemo logs deploy/orders --tail=200` - View orders service logs
- `kubectl -n microdemo logs deploy/inventory --tail=200` - View inventory service logs
- `kubectl -n microdemo logs deploy/gateway --tail=200` - View gateway logs
- `make logs` - Shortcut for users service logs

### Image Management

- Local images: Use `make build` to build into Minikube's Docker daemon (tagged as `microdemo-kb-<service>:latest`)
- GHCR images: CI builds and pushes to `ghcr.io/<owner>/microservices-architecture-demo-kb-<service>:latest` and `:<sha>`
- Switch to GHCR: `make deploy-ghcr GHCR_NS=<namespace> TAG=<tag>`

## Architecture

### High-Level Structure

```bash
Gateway (NGINX) → FastAPI Services → PostgreSQL DBs
                                   ↘ Redis (shared cache)
```

### Services

- **Gateway** (Port 80/NodePort 30080): NGINX reverse proxy routing requests by path
  - `/users/*` → users service
  - `/orders/*` → orders service
  - `/inventory/*` → inventory service
  - `/*` → web frontend
- **Users Service** (Port 8000): JWT authentication, user management, role-based access control (user/admin)
- **Orders Service** (Port 8000): Order management, event tracking, inter-service calls to users and inventory
- **Inventory Service** (Port 8000): Stock management, SKU tracking
- **Web** (Port 80): React SPA with TypeScript, Tailwind CSS, React Router, TanStack Query

### Databases

Each service has its own PostgreSQL 15 database:

- `users-db`: usersdb (user: users)
- `orders-db`: ordersdb (user: orders)
- `inventory-db`: inventorydb (user: inventory)

All databases run as StatefulSets with PersistentVolumeClaims.

### Redis Caching

Shared Redis instance with separate databases:

- DB 0: Users cache
- DB 1: Orders cache
- DB 2: Inventory cache

### Authentication Flow

1. User registers/logs in via `/users/register` or `/users/login`
2. Service returns JWT token containing `{sub: user_id, email, role}`
3. Client includes token in `Authorization: Bearer <token>` header
4. Each service validates token using shared `JWT_SECRET_KEY` (default provided in config.py)
5. Endpoints use `Depends(auth.get_current_user)` or `Depends(auth.require_admin)` dependencies

### Inter-Service Communication

Services communicate via HTTP using Kubernetes DNS:

- Users service: `http://users:8000`
- Orders service: `http://orders:8000`
- Inventory service: `http://inventory:8000`

Example: Orders service validates users via `services/orders/app/clients/users_client.py` and checks/reduces inventory via `services/orders/app/clients/inventory_client.py` using httpx async client with 5-second timeout.

### Order Flow

1. Client creates order via `POST /orders/`
2. Orders service validates user exists (calls users service)
3. Orders service checks inventory availability for each SKU (calls inventory service)
4. If stock available, orders service deducts inventory (calls inventory service)
5. Orders service creates order record and logs event to `order_events` table
6. Orders service optionally sends webhook notification to external systems

### Event Tracking

Orders maintain an audit trail in the `order_events` table with:

- Event type (created, status_changed, updated, deleted, etc.)
- Description, old_value, new_value
- User ID who triggered the event
- Timestamp

## Backend Services (FastAPI)

### Common Structure

Each service (users, orders, inventory) follows the same pattern:

```bash
services/<service>/
├── Dockerfile
├── requirements.txt
└── app/
    ├── main.py        # FastAPI app, routes
    ├── models.py      # SQLAlchemy ORM models
    ├── schemas.py     # Pydantic schemas for request/response
    ├── crud.py        # Database operations
    ├── database.py    # Database connection, session management
    ├── config.py      # Configuration (env vars, constants)
    ├── cache.py       # Redis caching utilities
    └── auth.py        # JWT authentication (users service)
```

### Database Initialization

Tables are created automatically on service startup via `models.Base.metadata.create_all(bind=engine)` in main.py.

### Health Checks

All services expose `GET /healthz` returning `{"status": "healthy"}` used by Kubernetes readiness/liveness probes.

### Running Services Locally (Development)

Not typical for this K8s-focused project, but if needed:

```bash
cd services/users
pip install -r requirements.txt
# Set environment variables: DATABASE_URL, REDIS_URL, JWT_SECRET_KEY
uvicorn app.main:app --reload --port 8000
```

## Frontend (React + TypeScript)

### Structure

```bash
web/
├── src/
│   ├── App.tsx           # Main app component with routing
│   ├── main.tsx          # Entry point
│   ├── components/       # Reusable UI components
│   ├── pages/            # Page components (Dashboard, Users, Orders, etc.)
│   ├── services/         # API client services
│   ├── context/          # React context (AuthContext)
│   └── types/            # TypeScript type definitions
├── package.json
├── tsconfig.json
├── vite.config.ts
└── Dockerfile            # Multi-stage build (nginx serves static files)
```

### Development Commands

```bash
cd web
npm install
npm run dev      # Start Vite dev server (usually port 5173)
npm run build    # TypeScript compile + Vite build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

### API Integration

Frontend communicates with backend via gateway at `/users/`, `/orders/`, `/inventory/`. TanStack Query is used for data fetching and caching.

## Kubernetes Manifests

Located in `k8s/` directory with numeric prefixes for ordering:

- `00-namespace.yaml` - Creates `microdemo` namespace
- `01-gateway-configmap.yaml` - NGINX configuration (upstream routing)
- `10-redis.yaml` - Redis StatefulSet
- `20-users-db.yaml`, `21-orders-db.yaml`, `22-inventory-db.yaml` - PostgreSQL databases
- `30-users.yaml`, `31-orders.yaml`, `32-inventory.yaml` - Service deployments
- `40-web.yaml` - React frontend deployment
- `50-gateway.yaml` - NGINX gateway deployment + NodePort service
- `60-ingress.yaml` - Optional Ingress (host: microdemo.local)

### Kustomize Overlays

- `k8s/overlays/dev-local/` - Uses local Minikube images
- `k8s/overlays/ghcr/` - Uses GHCR images with placeholders for namespace and tag

## Key Design Patterns

1. **Database per Service**: Each microservice has its own PostgreSQL database for data independence
2. **API Gateway Pattern**: NGINX routes requests to appropriate services based on path prefix
3. **JWT Authentication**: Stateless authentication with role-based access control (user/admin)
4. **Cache-Aside Pattern**: Check Redis cache first, query DB on miss, update cache
5. **Event Sourcing**: Order events tracked in separate table for audit trail
6. **Inter-Service Communication**: HTTP-based service-to-service calls via Kubernetes DNS
7. **Health Check Pattern**: All services expose /healthz for Kubernetes probes
8. **Compensating Transactions**: Inventory can be restored if order creation fails

## Default Credentials

After running `make seed`:

- Admin: <admin@test.com> / password123
- Test user: <bob@example.com> / password123

## Configuration

### Environment Variables (Set in Kubernetes Deployments)

- `DATABASE_URL`: PostgreSQL connection string (postgresql://user:password@host:5432/dbname)
- `REDIS_URL`: Redis connection string (redis://redis:6379/N where N is db number)
- `JWT_SECRET_KEY`: Secret key for JWT signing (default in config.py, should be overridden in production)

### Service Endpoints

All services use port 8000 internally. Gateway is accessible on port 80 (NodePort 30080).

## Testing

Currently no automated tests are present in the repository. If adding tests:

- Consider pytest for Python services
- Consider React Testing Library + Vitest for frontend
- Integration tests should target the gateway endpoint after full deployment

## CI/CD

GitHub Actions workflow `.github/workflows/build-images.yml`:

- Triggers on push to main/master or manual dispatch
- Builds multi-arch images (amd64, arm64) for all services
- Pushes to GitHub Container Registry (GHCR) with tags `latest` and `<sha>`
- Uses Docker Buildx with layer caching

## Important Notes

### Service Communication

When adding new inter-service calls:

1. Create client module in `services/<service>/app/clients/`
2. Use httpx AsyncClient for non-blocking calls
3. Set reasonable timeouts (currently 5 seconds)
4. Include token in Authorization header if endpoint requires auth
5. Handle httpx.HTTPError exceptions gracefully

### Adding New Endpoints

1. Define Pydantic schema in `schemas.py`
2. Add database operation in `crud.py` if needed
3. Create route in `main.py` with appropriate auth dependency
4. Update frontend service client in `web/src/services/`

### Database Migrations

Currently using declarative table creation on startup. For production:

- Consider using Alembic for schema migrations
- Track migrations in version control
- Apply migrations before deploying new service versions

### Scaling Considerations

- All service deployments are stateless and can be scaled horizontally
- PostgreSQL and Redis run as StatefulSets (single replica) - consider clustering for production
- Gateway can be scaled but currently uses single replica
- Update deployment replicas in manifest or use `kubectl scale`

## Troubleshooting Common Issues

### NodePort Unreachable on macOS (Docker Driver)

Use `make port-forward` or `make dev` to forward gateway to localhost:8080.

### Fresh Database (No Users)

Run `make seed` to create admin user and sample data.

### Service 502 from Gateway

Check that deployment is running: `kubectl -n microdemo get pods`
Check service DNS resolution: `kubectl -n microdemo exec -it deploy/gateway -- nslookup users`

### Token Authentication Failures

Ensure all services use the same `JWT_SECRET_KEY` environment variable.
