#!/bin/bash
#
# Convenience script for building the UI Docker image
# 
# This script builds the UI Docker image from the monorepo root,
# which is required because the Dockerfile needs access to both
# the core and UI packages.
#
# Usage:
#   ./build-image.sh [tag] [port]
#
# Example:
#   ./build-image.sh latest 3001      # Build with tag "latest" and test on port 3001
#   ./build-image.sh v1.0.0 3008      # Build with tag "v1.0.0" and test on port 3008
#   ./build-image.sh                  # Build with tag "dev" and test on port 3000

# Default tag if not specified
TAG=${1:-dev}
PORT=${2:-3000}

# Navigate to monorepo root (from the UI package directory)
cd $(dirname "$0")/../..

echo "Building directus-config-toolkit-ui:$TAG from monorepo root..."

# Build the Docker image with the correct context
docker build -t ghcr.io/peter-olom/directus-config-toolkit-ui:$TAG -f packages/ui/Dockerfile .

echo "Build complete! Image is available as directus-config-toolkit-ui:$TAG"
echo ""
echo "Testing container startup..."
docker run --rm -d --name dct-ui-test -p ${PORT}:3000 directus-config-toolkit-ui:$TAG
sleep 3
if docker ps | grep dct-ui-test > /dev/null; then
  echo "✅ Container started successfully!"
  echo "Container logs:"
  docker logs dct-ui-test
  
  # Debug file structure inside container
  echo ""
  echo "Debugging container file structure:"
  docker exec dct-ui-test ls -la /app
  docker exec dct-ui-test ls -la /app/packages/ui
  docker exec dct-ui-test ls -la /app/packages/ui/.next/static 2>/dev/null || echo "Static directory not found!"
  
  # Check for 404 requests by keeping the container running for a moment
  echo ""
  echo "Container will run for 5 seconds to test for 404s - check your browser at http://localhost:${PORT}"
  echo "Press Ctrl+C now if you want to keep it running longer"
  sleep 5
  
  docker stop dct-ui-test
else
  echo "❌ Container failed to start properly"
  docker logs dct-ui-test
  docker rm dct-ui-test || true
fi
echo ""
echo "To run the container locally:"
echo "docker run -p ${PORT}:3000 directus-config-toolkit-ui:$TAG"
echo ""
echo "To push to GitHub Container Registry:"
echo "docker tag directus-config-toolkit-ui:$TAG ghcr.io/peter-olom/directus-config-toolkit-ui:$TAG"
echo "docker push ghcr.io/peter-olom/directus-config-toolkit-ui:$TAG"
