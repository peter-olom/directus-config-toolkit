#!/bin/bash
set -e

echo "=========================================="
echo "DCT Integration Test - Final Verification"
echo "=========================================="

# Cleanup function
cleanup() {
  echo -e "\nCleaning up..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# Setup
CONTAINER_NAME="dct-final-$(date +%s)"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')

echo "Container: $CONTAINER_NAME"
echo "Port: $PORT"

# 1. Start Directus
echo -e "\n1. Starting Directus container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:8055" \
  -e "KEY=test-key-$(date +%s)" \
  -e "SECRET=test-secret-$(date +%s)" \
  -e "ADMIN_EMAIL=admin@example.com" \
  -e "ADMIN_PASSWORD=d1r3ctu5" \
  -e "DB_CLIENT=sqlite3" \
  -e "DB_FILENAME=/tmp/database.db" \
  -e "WEBSOCKETS_ENABLED=false" \
  directus/directus:11.9.3 > /dev/null

# 2. Wait for ready
echo -e "\n2. Waiting for Directus..."
for i in {1..30}; do
  if curl -s http://localhost:$PORT/server/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "✅ Directus is ready!"
    break
  fi
  sleep 2
done

# 3. Test DCT locally against the container
echo -e "\n3. Testing DCT export from host..."
export DCT_API_URL="http://localhost:$PORT"
export DCT_CONFIG_PATH="./test-config"
mkdir -p "$DCT_CONFIG_PATH"

# Get token
TOKEN=$(curl -s -X POST http://localhost:$PORT/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"d1r3ctu5"}' \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

export DCT_TOKEN="$TOKEN"

# Create test data
echo -e "\n4. Creating test data..."
curl -s -X POST http://localhost:$PORT/roles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"TestRole","icon":"group","description":"Test role"}' > /dev/null

# Run DCT export
echo -e "\n5. Running DCT export..."
node dist/cli.js export roles

# Verify
echo -e "\n6. Verifying export..."
if [ -f "$DCT_CONFIG_PATH/roles.json" ]; then
  echo "✅ roles.json exists"
  if grep -q "TestRole" "$DCT_CONFIG_PATH/roles.json"; then
    echo "✅ Test role found in export!"
  else
    echo "❌ Test role NOT found!"
    exit 1
  fi
else
  echo "❌ roles.json not found!"
  exit 1
fi

# Test permissions export
echo -e "\n7. Creating and exporting permissions..."

# Create policy
POLICY_ID=$(curl -s -X POST http://localhost:$PORT/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"TestPolicy","icon":"policy","admin_access":false,"app_access":true}' \
  | grep -o '"id":"[^"]*' | cut -d'"' -f4)

# Create permission with multiple fields
curl -s -X POST http://localhost:$PORT/permissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"collection\": \"directus_users\",
    \"action\": \"read\",
    \"permissions\": {\"_and\": [{\"id\": {\"_eq\": \"\$CURRENT_USER\"}}]},
    \"fields\": [\"id\", \"first_name\", \"last_name\", \"email\", \"avatar\"],
    \"policy\": \"$POLICY_ID\"
  }" > /dev/null

# Export again to get permissions
node dist/cli.js export roles

# Check permissions
if [ -f "$DCT_CONFIG_PATH/permissions.json" ]; then
  echo "✅ permissions.json exists"
  if grep -q "first_name" "$DCT_CONFIG_PATH/permissions.json"; then
    echo "✅ Permission fields preserved!"
  else
    echo "❌ Permission fields NOT preserved!"
    exit 1
  fi
else
  echo "❌ permissions.json not found!"
  exit 1
fi

echo -e "\n=========================================="
echo "✅ ALL TESTS PASSED!"
echo "=========================================="

# Cleanup config
rm -rf "$DCT_CONFIG_PATH"