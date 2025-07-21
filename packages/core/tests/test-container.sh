#!/bin/bash

# Test container creation script
CONTAINER_NAME="dct-test-manual-$(date +%s)"
DATA_DIR="/tmp/dct-test-$(date +%s)"

echo "Creating data directory: $DATA_DIR"
mkdir -p "$DATA_DIR"

echo "Creating container: $CONTAINER_NAME"
docker run -d \
  --name "$CONTAINER_NAME" \
  -e "ADMIN_EMAIL=admin@example.com" \
  -e "ADMIN_PASSWORD=d1r3ctu5" \
  -e "KEY=test-key-$(date +%s)" \
  -e "SECRET=test-secret-$(date +%s)" \
  -e "DB_CLIENT=sqlite3" \
  -e "DB_FILENAME=/directus/database.db" \
  -e "WEBSOCKETS_ENABLED=false" \
  -e "TELEMETRY_ENABLED=false" \
  -v "$DATA_DIR:/directus/database" \
  directus/directus:11.9.3

echo "Waiting for container to start..."
sleep 5

echo "Checking container status..."
docker ps -a | grep "$CONTAINER_NAME"

echo "Checking container logs..."
docker logs "$CONTAINER_NAME"

echo "Testing health endpoint..."
docker exec "$CONTAINER_NAME" curl -s http://localhost:8055/server/health || echo "Health check failed"

echo "Cleanup command:"
echo "docker rm -f $CONTAINER_NAME && rm -rf $DATA_DIR"