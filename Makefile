.PHONY: start build buildx load-images apply wait ingress-enable ingress-apply url port-forward seed down reset logs

NAMESPACE ?= microdemo
K8S_DIR := k8s
BASE ?= http://127.0.0.1:8080
GHCR_NS ?= your-gh-namespace
TAG ?= latest

# Services to build as images inside minikube
IMAGES := users orders inventory web

start:
	minikube start

# Default: build using minikube's image builder (works across drivers but may show legacy builder warning)
build:
	@for s in $(IMAGES); do \
		ctx=services/$$s; \
		if [ "$$s" = "web" ]; then ctx=web; fi; \
		echo "Building image microdemo-kb-$$s:latest from $$ctx"; \
		minikube image build -t microdemo-kb-$$s:latest $$ctx || exit 1; \
	done

# Alternative: build with Docker BuildKit/Buildx on the host and load into the daemon
# Recommended when using the Docker driver on macOS/Linux to avoid the legacy builder warning
buildx:
	@docker buildx ls >/dev/null 2>&1 || docker buildx create --use --name microdemo-builder >/dev/null 2>&1 || true
	@for s in $(IMAGES); do \
		ctx=services/$$s; \
		if [ "$$s" = "web" ]; then ctx=web; fi; \
		echo "Building image microdemo-kb-$$s:latest from $$ctx (buildx)"; \
		docker buildx build --load -t microdemo-kb-$$s:latest $$ctx || exit 1; \
	done

# Build with buildx, restart web to pick up :latest, then wait for rollout
.PHONY: deployx
deployx: buildx rollout-web wait

# Build only the web image with a unique dev tag and update the deployment to that tag
.PHONY: deployx-web
deployx-web:
	@docker buildx ls >/dev/null 2>&1 || docker buildx create --use --name microdemo-builder >/dev/null 2>&1 || true
	@TS=$$(date -u +%Y%m%d%H%M%S); \
	ARCH=$$(minikube ssh 'uname -m' 2>/dev/null | tr -d "\r"); \
	PLAT=$$(if [ "$$ARCH" = "x86_64" ]; then echo linux/amd64; else echo linux/arm64; fi); \
	echo "Detected minikube arch: $$ARCH → building for $$PLAT"; \
	echo "Building web image with tags: latest and dev-$$TS"; \
	docker buildx build --platform $$PLAT --load -t microdemo-kb-web:latest -t microdemo-kb-web:dev-$$TS web || exit 1; \
	echo "Loading image into Minikube (if needed)"; \
	minikube image load microdemo-kb-web:dev-$$TS >/dev/null 2>&1 || true; \
	echo "Updating deployment to image microdemo-kb-web:dev-$$TS"; \
	kubectl -n $(NAMESPACE) set image deploy/web web=microdemo-kb-web:dev-$$TS; \
	kubectl -n $(NAMESPACE) rollout status deploy/web

# If you're not on the Docker driver, you may need to load images into Minikube after buildx
load-images:
	@for s in $(IMAGES); do \
		minikube image load microdemo-kb-$$s:latest || true; \
	done

apply:
	kubectl apply -f $(K8S_DIR)/00-namespace.yaml
	@find $(K8S_DIR) -maxdepth 1 -type f -name "*.yaml" ! -name "kustomization.yaml" | xargs -I {} kubectl apply -f {} -n $(NAMESPACE)

# Kustomize-based deploys
.PHONY: deploy-local deploy-ghcr
deploy-local:
	# Using base manifests directly for local images (equivalent to dev-local overlay)
	@find $(K8S_DIR) -maxdepth 1 -type f -name "*.yaml" ! -name "kustomization.yaml" -print0 | xargs -0 -I {} kubectl apply -n $(NAMESPACE) -f {}

deploy-ghcr:
	@echo "Using GHCR namespace: $(GHCR_NS), tag: $(TAG)"; \
	kubectl kustomize $(K8S_DIR)/overlays/ghcr | sed "s|GHCR_NS_PLACEHOLDER|$(GHCR_NS)|g; s|TAG_PLACEHOLDER|$(TAG)|g" | kubectl apply -n $(NAMESPACE) -f -

wait:
	kubectl -n $(NAMESPACE) rollout status deploy/users deploy/orders deploy/inventory deploy/web deploy/gateway

url:
	minikube service gateway -n $(NAMESPACE) --url

port-forward:
	kubectl -n $(NAMESPACE) port-forward svc/gateway 8080:80

# Enable nginx ingress controller in minikube and apply our Ingress
ingress-enable:
	minikube addons enable ingress

ingress-apply:
	kubectl apply -f $(K8S_DIR)/60-ingress.yaml -n $(NAMESPACE)
	@echo "If using host microdemo.local, add to /etc/hosts: $$(minikube ip) microdemo.local"

# Seed admin, one inventory item, a normal user, and an example order
seed:
	@chmod +x scripts/seed.sh && scripts/seed.sh $(NAMESPACE)

# Remove all resources
down:
	-kubectl delete -f $(K8S_DIR) -n $(NAMESPACE)

# Delete and recreate namespace
reset:
	-kubectl delete namespace $(NAMESPACE)
	kubectl apply -f $(K8S_DIR)/00-namespace.yaml

logs:
	kubectl -n $(NAMESPACE) logs deploy/users --tail=200

# Developer convenience: start port-forward and open the app
.PHONY: dev dev-stop rollout-web

dev:
	@bash -lc 'set -e; \
	kubectl -n $(NAMESPACE) port-forward svc/gateway 8080:80 >/tmp/gw-pf.log 2>&1 & echo $$! > /tmp/gw-pf.pid; \
	sleep 1; \
	echo "Gateway forwarded on http://127.0.0.1:8080 (PID $$(cat /tmp/gw-pf.pid))"; \
	if command -v open >/dev/null 2>&1; then open http://127.0.0.1:8080; fi'

# Roll web deployment to pick up freshly built :latest image
rollout-web:
	kubectl -n $(NAMESPACE) rollout restart deploy/web

dev-stop:
	-@kill $$(cat /tmp/gw-pf.pid) >/dev/null 2>&1 || true; rm -f /tmp/gw-pf.pid /tmp/gw-pf.log; echo "Port-forward stopped"
