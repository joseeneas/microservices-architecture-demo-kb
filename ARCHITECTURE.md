# Architecture Diagram

## System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Web Browser]
        API[API Client/curl]
    end

    subgraph "Gateway Layer - Port 8080"
        Gateway[Nginx Gateway<br/>Reverse Proxy<br/>Path-based Routing]
    end

    subgraph "Frontend"
        Web[React SPA<br/>TypeScript + Tailwind<br/>React Router + Query]
    end

    subgraph "Backend Services - Port 8000"
        Users[Users Service<br/>FastAPI<br/>JWT Auth]
        Orders[Orders Service<br/>FastAPI<br/>Event Tracking]
        Inventory[Inventory Service<br/>FastAPI<br/>Stock Management]
    end

    subgraph "Cache Layer"
        Redis[(Redis 7<br/>DB 0: Users<br/>DB 1: Orders<br/>DB 2: Inventory)]
    end

    subgraph "Database Layer"
        UsersDB[(PostgreSQL 15<br/>usersdb)]
        OrdersDB[(PostgreSQL 15<br/>ordersdb)]
        InventoryDB[(PostgreSQL 15<br/>inventorydb)]
    end

    subgraph "External Systems"
        Webhooks[Webhook Subscribers<br/>External APIs]
    end

    Browser -->|HTTP :8080| Gateway
    API -->|HTTP :8080| Gateway
    
    Gateway -->|/users/| Users
    Gateway -->|/orders/| Orders
    Gateway -->|/inventory/| Inventory
    Gateway -->|/| Web

    Users -->|Read/Write| UsersDB
    Orders -->|Read/Write| OrdersDB
    Inventory -->|Read/Write| InventoryDB

    Users -.->|Cache| Redis
    Orders -.->|Cache| Redis
    Inventory -.->|Cache| Redis

    Orders -->|Validate User| Users
    Orders -->|Check/Deduct Stock| Inventory
    Orders -.->|Notify Events| Webhooks

    Web -->|Auth + CRUD| Gateway

    style Gateway fill:#f9f,stroke:#333,stroke-width:4px
    style Redis fill:#ff9,stroke:#333,stroke-width:2px
    style Webhooks fill:#9ff,stroke:#333,stroke-width:2px
```

## Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant Users
    participant Orders
    participant Inventory
    participant Redis
    participant DB

    Note over Client,DB: User Authentication Flow
    Client->>Gateway: POST /users/login
    Gateway->>Users: Forward request
    Users->>DB: Query user + validate password
    DB-->>Users: User data
    Users-->>Gateway: JWT token
    Gateway-->>Client: JWT token

    Note over Client,DB: Create Order Flow
    Client->>Gateway: POST /orders/ + JWT
    Gateway->>Orders: Forward request
    Orders->>Users: Validate user exists
    Users-->>Orders: User valid
    Orders->>Inventory: Check stock availability
    Inventory->>Redis: Check cache
    Redis-->>Inventory: Cache miss
    Inventory->>DB: Query inventory
    DB-->>Inventory: Stock data
    Inventory-->>Orders: Stock available
    Orders->>Inventory: Deduct inventory
    Inventory->>DB: Update stock
    Orders->>DB: Create order + event
    Orders->>Redis: Invalidate cache
    Orders-->>Gateway: Order created
    Gateway-->>Client: Order response
```

## Data Flow Architecture

```mermaid
graph LR
    subgraph "Write Path"
        W1[Client Request] --> W2[Gateway]
        W2 --> W3[Service]
        W3 --> W4[Validation]
        W4 --> W5[Database Write]
        W5 --> W6[Cache Invalidation]
        W6 --> W7[Webhook Notification]
    end

    subgraph "Read Path"
        R1[Client Request] --> R2[Gateway]
        R2 --> R3[Service]
        R3 --> R4[Check Cache]
        R4 -->|Hit| R5[Return Cached]
        R4 -->|Miss| R6[Query Database]
        R6 --> R7[Cache Result]
        R7 --> R8[Return Data]
    end

    style W4 fill:#f96,stroke:#333
    style R4 fill:#9f6,stroke:#333
```

## Network Architecture

```mermaid
graph TB
    subgraph "Docker Network: msnet (bridge)"
        Gateway[gateway:80]
        Users[users:8000]
        Orders[orders:8000]
        Inventory[inventory:8000]
        Web[web:80]
        Redis[redis:6379]
        UsersDB[users-db:5432]
        OrdersDB[orders-db:5432]
        InventoryDB[inventory-db:5432]
    end

    Host[Host Machine<br/>localhost:8080] -->|Port Mapping| Gateway

    Gateway -.->|DNS: users:8000| Users
    Gateway -.->|DNS: orders:8000| Orders
    Gateway -.->|DNS: inventory:8000| Inventory
    Gateway -.->|DNS: web:80| Web

    Users -.->|DNS: users-db:5432| UsersDB
    Orders -.->|DNS: orders-db:5432| OrdersDB
    Inventory -.->|DNS: inventory-db:5432| InventoryDB

    Users -.->|DNS: redis:6379| Redis
    Orders -.->|DNS: redis:6379| Redis
    Inventory -.->|DNS: redis:6379| Redis

    Orders -.->|DNS: users:8000| Users
    Orders -.->|DNS: inventory:8000| Inventory

    style Host fill:#f96,stroke:#333,stroke-width:4px
```

## Component Details

### Services

| Service | Port | Database | Redis DB | Key Features |
|---------|------|----------|----------|--------------|
| **Gateway** | 80 | - | - | Nginx reverse proxy, path routing |
| **Users** | 8000 | usersdb | 0 | JWT auth, role-based access |
| **Orders** | 8000 | ordersdb | 1 | Event tracking, webhooks, validation |
| **Inventory** | 8000 | inventorydb | 2 | Stock management, auto-deduction |
| **Web** | 80 | - | - | React SPA, lazy loading |
| **Redis** | 6379 | - | 0,1,2 | Caching layer |

### Databases

| Database | User | Port | Health Check |
|----------|------|------|--------------|
| **users-db** | users | 5432 | pg_isready -U users -d usersdb |
| **orders-db** | orders | 5432 | pg_isready -U orders -d ordersdb |
| **inventory-db** | inventory | 5432 | pg_isready -U inventory -d inventorydb |

### Data Models

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    ORDERS ||--o{ ORDER_ITEMS : contains
    INVENTORY ||--o{ ORDER_ITEMS : references
    ORDERS ||--o{ ORDER_EVENTS : tracks

    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string role
        boolean is_active
        datetime created_at
    }

    ORDERS {
        string id PK
        int user_id FK
        decimal total
        string status
        jsonb items
        datetime created_at
    }

    ORDER_EVENTS {
        int id PK
        string order_id FK
        string event_type
        string description
        string old_value
        string new_value
        int user_id
        datetime created_at
    }

    INVENTORY {
        int id PK
        string sku UK
        int qty
        datetime created_at
    }
```

## Security Architecture

```mermaid
graph TB
    subgraph "Public Endpoints"
        Login[POST /users/login]
        Register[POST /users/register]
        Health[GET /*/healthz]
    end

    subgraph "Authenticated Endpoints"
        Users[Users CRUD<br/>Bearer Token Required]
        Orders[Orders CRUD<br/>Bearer Token Required]
        Inventory[Inventory CRUD<br/>Bearer Token Required]
    end

    subgraph "Authorization Layers"
        Self[User - Own Data Only]
        Admin[Admin - All Data Access]
    end

    Login --> JWT[JWT Token Generation]
    Register --> JWT
    
    JWT --> Auth{Token Valid?}
    Auth -->|Yes| Role{Role Check}
    Auth -->|No| Reject[401 Unauthorized]
    
    Role -->|user| Self
    Role -->|admin| Admin

    Self --> Users
    Self --> Orders
    Self --> Inventory

    Admin --> Users
    Admin --> Orders
    Admin --> Inventory

    style JWT fill:#9f9,stroke:#333,stroke-width:2px
    style Reject fill:#f99,stroke:#333,stroke-width:2px
    style Admin fill:#99f,stroke:#333,stroke-width:2px
```

## Deployment View

```mermaid
graph TB
    subgraph "Container Orchestration"
        DC[Docker Compose]
    end

    subgraph "Containers"
        GW[gateway<br/>nginx:1.27-alpine]
        U[users<br/>python:3.11-slim]
        O[orders<br/>python:3.11-slim]
        I[inventory<br/>python:3.11-slim]
        W[web<br/>nginx:1.27-alpine]
        R[redis<br/>redis:7-alpine]
        UDB[users-db<br/>postgres:15-alpine]
        ODB[orders-db<br/>postgres:15-alpine]
        IDB[inventory-db<br/>postgres:15-alpine]
    end

    subgraph "Volumes"
        UV[users-db-data]
        OV[orders-db-data]
        IV[inventory-db-data]
        RV[redis-data]
    end

    DC -->|manages| GW
    DC -->|manages| U
    DC -->|manages| O
    DC -->|manages| I
    DC -->|manages| W
    DC -->|manages| R
    DC -->|manages| UDB
    DC -->|manages| ODB
    DC -->|manages| IDB

    UDB -.->|persists to| UV
    ODB -.->|persists to| OV
    IDB -.->|persists to| IV
    R -.->|persists to| RV

    style DC fill:#f96,stroke:#333,stroke-width:4px
```

## Key Design Patterns

1. **API Gateway Pattern**: Single entry point (Nginx) for all client requests
2. **Database per Service**: Each microservice has its own database for independence
3. **Service Discovery**: Services communicate via Docker network DNS
4. **Event Sourcing**: Order events tracked in separate table for audit trail
5. **Cache-Aside Pattern**: Check cache first, query DB on miss, update cache
6. **Circuit Breaker**: Graceful degradation when services are unavailable
7. **Webhook Pattern**: Async notifications to external systems
8. **JWT Token Authentication**: Stateless authentication across services
9. **Role-Based Access Control (RBAC)**: User vs Admin authorization
10. **Health Check Pattern**: All services expose health endpoints

## Performance Characteristics

- **Frontend Bundle**: Code-split by route with lazy loading
- **Database Queries**: Indexed on frequently queried columns
- **Caching Strategy**: 5-minute stale time, 10-minute garbage collection
- **Service Communication**: Async HTTP with connection pooling
- **Webhook Delivery**: Fire-and-forget with 5-second timeout
- **Database Connections**: Connection pooling via SQLAlchemy

## Scalability Considerations

- **Horizontal Scaling**: Services are stateless (except databases)
- **Load Balancing**: Nginx can distribute to multiple service instances
- **Database Sharding**: Each service has separate database
- **Cache Layer**: Redis can be clustered for high availability
- **CDN**: Static assets can be served via CDN
- **Queue**: Future: Add message queue for async processing
