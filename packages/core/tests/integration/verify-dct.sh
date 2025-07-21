#!/bin/bash
set -e

echo "DCT Integration Test - Verifying export/import functionality"
echo "============================================================"

# Setup
CONTAINER_NAME="dct-verify-test-$(date +%s)"
echo "Container name: $CONTAINER_NAME"

# Find available port
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')
echo "Using port: $PORT"

# Start container
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
  -e "TELEMETRY_ENABLED=false" \
  directus/directus:11.9.3 > /dev/null

# Wait for Directus
echo -e "\n2. Waiting for Directus to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:$PORT/server/health | grep -q '"status":"ok"'; then
    echo "✅ Directus is ready!"
    break
  fi
  sleep 2
done

# Get token
echo -e "\n3. Getting admin token..."
TOKEN=$(curl -s -X POST http://localhost:$PORT/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"d1r3ctu5"}' \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:20}..."

# Create test data
echo -e "\n4. Creating test role..."
curl -s -X POST http://localhost:$PORT/roles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "TestRole",
    "icon": "supervised_user_circle",
    "description": "Test role for DCT verification"
  }' > /dev/null

# Create policy and permissions
echo "Creating test policy..."
POLICY_ID=$(curl -s -X POST http://localhost:$PORT/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "TestPolicy",
    "icon": "policy",
    "description": "Test policy",
    "admin_access": false,
    "app_access": true
  }' | grep -o '"id":"[^"]*' | cut -d'"' -f4)

echo "Creating test permission with multiple fields..."
curl -s -X POST http://localhost:$PORT/permissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"collection\": \"directus_users\",
    \"action\": \"read\",
    \"permissions\": {\"_and\": [{\"id\": {\"_eq\": \"\$CURRENT_USER\"}}]},
    \"fields\": [\"id\", \"first_name\", \"last_name\", \"email\", \"avatar\", \"role\", \"status\"],
    \"policy\": \"$POLICY_ID\"
  }" > /dev/null

# Install DCT
echo -e "\n5. Installing DCT in container..."
docker cp dist "$CONTAINER_NAME:/directus/dct"
docker cp tests/integration/dct-wrapper.js "$CONTAINER_NAME:/directus/dct-wrapper.js"
docker exec "$CONTAINER_NAME" chmod +x /directus/dct-wrapper.js

# Export configuration
echo -e "\n6. Running DCT export..."
docker exec "$CONTAINER_NAME" sh -c "DCT_TOKEN=$TOKEN node /directus/dct-wrapper.js export roles"

# Verify export
echo -e "\n7. Verifying exported files..."
docker exec "$CONTAINER_NAME" ls -la /directus/config/

echo -e "\n8. Checking roles.json..."
ROLES_JSON=$(docker exec "$CONTAINER_NAME" cat /directus/config/roles.json)
if echo "$ROLES_JSON" | grep -q "TestRole"; then
  echo "✅ Test role found in export!"
else
  echo "❌ Test role NOT found in export!"
  exit 1
fi

echo -e "\n9. Checking permissions.json..."
PERMS_JSON=$(docker exec "$CONTAINER_NAME" cat /directus/config/permissions.json)
if echo "$PERMS_JSON" | grep -q "first_name"; then
  echo "✅ Permission fields preserved correctly!"
else
  echo "❌ Permission fields NOT preserved!"
  exit 1
fi

# Summary
echo -e "\n============================================================"
echo "✅ DCT EXPORT TEST PASSED!"
echo "- Container started successfully"
echo "- Test data created via API"
echo "- DCT installed and executed"
echo "- Roles exported correctly"
echo "- Permission fields preserved"
echo "============================================================"

# Cleanup
echo -e "\nCleaning up..."
docker rm -f "$CONTAINER_NAME" > /dev/null
echo "Done!"