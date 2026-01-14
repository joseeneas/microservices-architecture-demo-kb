.PHONY: start build apply wait ingress-enable ingress-apply url port-forward seed down reset logs

NAMESPACE ?= microdemo
K8S_DIR := k8s
BASE ?= http://127.0.0.1:8080
GHCR_NS ?= your-gh-namespace
TAG ?= latest

# Services to build as images inside minikube
IMAGES := users orders inventory web gateway

start:
	minikube start

build:
	@for s in $(IMAGES); do \
		minikube image build -t microdemo-kb-$$s:latest services/$$s || exit 1; \
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
	@bash scripts/seed.sh $(NAMESPACE) 

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
.PHONY: dev dev-stop
dev:
	@bash -lc 'set -e; \
	kubectl -n $(NAMESPACE) port-forward svc/gateway 8080:80 >/tmp/gw-pf.log 2>&1 & echo $$! > /tmp/gw-pf.pid; \
	sleep 1; \
	echo "Gateway forwarded on http://127.0.0.1:8080 (PID $$(cat /tmp/gw-pf.pid))"; \
	if command -v open >/dev/null 2>&1; then open http://127.0.0.1:8080; fi'

dev-stop:
	-@kill $$(cat /tmp/gw-pf.pid) >/dev/null 2>&1 || true; rm -f /tmp/gw-pf.pid /tmp/gw-pf.log; echo "Port-forward stopped"
