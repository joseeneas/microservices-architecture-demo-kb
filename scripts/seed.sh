#!/bin/bash
set -e

NAMESPACE="${1:-microdemo}"
BASE="${2:-http://127.0.0.1:8080}"

echo "Setting up port-forward..."
kubectl -n "$NAMESPACE" port-forward svc/gateway 8080:80 >/tmp/gw-pf.log 2>&1 &
PF_PID=$!
echo "$PF_PID" > /tmp/gw-pf.pid
sleep 2

cleanup() {
    echo "Cleaning up..."
    kill "$PF_PID" >/dev/null 2>&1 || true
    rm -f /tmp/gw-pf.pid /tmp/gw-pf.log
}
trap cleanup EXIT

echo "Getting admin token..."
ADMIN_LOGIN=$(curl -sS -X POST "$BASE/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}')

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c 'import sys,json; d=sys.stdin.read(); print(json.loads(d).get("access_token","") if json.loads(d).get("access_token") else "")')

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Admin user not found, registering..."
    curl -sS -X POST "$BASE/users/register" \
      -H "Content-Type: application/json" \
      -d '{"name":"Admin","email":"admin@test.com","password":"password123"}' >/dev/null || true
    
    ADMIN_LOGIN=$(curl -sS -X POST "$BASE/users/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@test.com","password":"password123"}')
    
    ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("access_token",""))')
fi

echo "Admin token obtained: ${ADMIN_TOKEN:0:20}..."

# Grant admin role to the user
echo "Granting admin role..."
POD=$(kubectl -n "$NAMESPACE" get pod -l app=users-db -o jsonpath='{.items[0].metadata.name}')
kubectl -n "$NAMESPACE" exec "$POD" -- psql -U users -d usersdb -c "UPDATE users SET role='admin' WHERE email='admin@test.com';" 2>/dev/null || true

# Add inventory item
echo "Adding inventory item..."
curl -sS -X POST "$BASE/inventory/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-001","qty":200}' >/dev/null || true

# Register Bob user
echo "Registering Bob user..."
curl -sS -X POST "$BASE/users/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com","password":"password123"}' >/dev/null || true

# Get Bob's token
echo "Getting Bob token..."
BOB_LOGIN=$(curl -sS -X POST "$BASE/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"password123"}')

USER_TOKEN=$(echo "$BOB_LOGIN" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("access_token",""))')

echo "Bob token obtained: ${USER_TOKEN:0:20}..."

# Get Bob's ID
echo "Getting Bob ID..."
BOB_ME=$(curl -sS -X GET "$BASE/users/me" \
  -H "Authorization: Bearer $USER_TOKEN")

BOB_ID=$(echo "$BOB_ME" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["id"])')

echo "Bob ID: $BOB_ID"

# Create an order for Bob
echo "Creating order for Bob..."
curl -sS -X POST "$BASE/orders/" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"ORD-001\",\"user_id\":$BOB_ID,\"total\":10.0,\"status\":\"pending\",\"items\":[{\"sku\":\"SKU-001\",\"quantity\":1,\"price\":10.0}]}" >/dev/null || true

echo "Seed complete!"
