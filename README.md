# Microservices Architecture Demo (Kubernetes Edition)

A full-featured microservices demo with three FastAPI services (users, orders, inventory) behind an NGINX gateway, each with its own PostgreSQL DB, Redis caching, and a React web UI.

This copy is tailored for Kubernetes (Minikube or Docker Desktop Kubernetes) and includes manifests, Makefile targets, optional Ingress, and a CI workflow to build/push images.

## Prerequisites
- kubectl, minikube, make
- Docker (for local image builds)

## Quick start (Minikube)
```sh
# 1) Start a supported Kubernetes version
minikube start --kubernetes-version=stable

# 2) Build service images inside Minikube
make build

# 3) Apply manifests and wait for rollouts
make apply wait

# 4) Open the app (choose one)
# NodePort
MINI_IP=$(minikube ip); open "http://$MINI_IP:30080/"
# or Ingress (after enabling and host mapping below)
# open http://microdemo.local/
```

## Access options
- NodePort: gateway is exposed on port 30080
- Ingress: enable NGINX controller and apply our Ingress
```sh
make ingress-enable
make ingress-apply
# Add host mapping once
echo "$(minikube ip) microdemo.local" | sudo tee -a /etc/hosts
open http://microdemo.local/
```

Tip: On macOS with the Docker driver, NodePort may be unreachable; use:
```sh
# Developer port-forward (local loopback)
make port-forward  # then browse http://127.0.0.1:8080
```

## Admin login
- Email: admin@test.com
- Password: password123

If the DB is brand-new, create and promote the admin automatically with:
```sh
make seed
```

## Common workflows
```sh
# Rebuild images and redeploy
make build apply wait

# Start local dev forwarding and open the app
make dev     # starts port-forward and opens 127.0.0.1:8080
make dev-stop

# Tear down all resources (namespace objects remain until reset)
make down

# Reset the namespace completely
make reset
```

## Makefile targets
- start: minikube start
- build: minikube image build for users, orders, inventory, web, gateway
- apply: kubectl apply k8s/ (namespace + all manifests)
- wait: rollout status for all Deployments
- url: print minikube service URL for gateway
- port-forward: forward gateway service to localhost:8080
- ingress-enable: enable NGINX ingress controller in Minikube
- ingress-apply: apply k8s/60-ingress.yaml (host microdemo.local)
- seed: create admin, seed SKU-001, create bob@example.com, create order ORD-001
- down: delete manifests in namespace
- reset: delete and recreate the namespace
- dev, dev-stop: convenience for local testing

## CI: Build and push images (GHCR)
A GitHub Actions workflow is included:
- .github/workflows/build-images.yml
- Builds multi-arch images (amd64, arm64) for users, orders, inventory, web, gateway
- Pushes tags latest and <SHA> to GHCR under ghcr.io/<owner>/<repo>-<service>

To use GHCR images in the cluster, set Deployment images to the GHCR tags. If your cluster needs auth, create an imagePullSecret and reference it in the Deployments.

## Repository layout (Kubernetes)
```text
k8s/
  00-namespace.yaml
  01-gateway-configmap.yaml
  10-redis.yaml
  20-users-db.yaml
  21-orders-db.yaml
  22-inventory-db.yaml
  30-users.yaml
  31-orders.yaml
  32-inventory.yaml
  40-web.yaml
  50-gateway.yaml  # NodePort 30080
  60-ingress.yaml  # optional Ingress (microdemo.local)
services/
  users/, orders/, inventory/  # FastAPI apps
web/                            # React app
gateway/                        # NGINX gateway
Makefile                        # K8s workflows (build/deploy/dev/seed)
```

## Troubleshooting
- NodePort not reachable on macOS (Docker driver): use `make port-forward` or `minikube tunnel`.
- Inventory 502 from gateway: ensure `k8s/32-inventory.yaml` is applied and the Deployment is Running.
- Fresh DB (empty users): run `make seed` to create/promote admin and create sample data.
- Check logs:
```sh
kubectl -n microdemo logs deploy/users --tail=200
kubectl -n microdemo logs deploy/orders --tail=200
kubectl -n microdemo logs deploy/inventory --tail=200
kubectl -n microdemo logs deploy/gateway --tail=200
```

## License
© J. Eneas, 2025 - Demo/Educational purposes
