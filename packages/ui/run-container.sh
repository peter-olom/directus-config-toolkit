#!/bin/bash
#
# Run the UI container with environment variables from .env.local
#
# Usage:
#   ./run-container.sh [tag] [port]
#
# Example:
#   ./run-container.sh dev 3008     # Run dev container on port 3008
#   ./run-container.sh latest 3000  # Run latest container on port 3000
#   ./run-container.sh              # Run dev container on port 3000

# Default values
TAG=${1:-dev}
PORT=${2:-3000}

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Path to .env.local file
ENV_FILE="${SCRIPT_DIR}/.env.local"

# Check if .env.local exists
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: .env.local file not found at ${ENV_FILE}"
  exit 1
fi

# Stop existing container if running
if docker ps -q --filter "name=dct-ui" | grep -q .; then
  echo "Stopping existing dct-ui container..."
  docker stop dct-ui
  docker rm dct-ui
fi

echo "Starting directus-config-toolkit-ui:${TAG} on port ${PORT}..."

# Read environment variables from .env.local, ignoring comments and empty lines
ENV_VARS=""
while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip empty lines and comments
  if [[ -z "$line" || "$line" =~ ^# ]]; then
    continue
  fi
  
  # Extract key and value
  key=$(echo "$line" | cut -d'=' -f1)
  value=$(echo "$line" | cut -d'=' -f2-)
  
  # Add to environment variables
  ENV_VARS="$ENV_VARS -e $key=\"$value\""
done < "$ENV_FILE"

# Handle special paths for Docker volumes
CONFIG_PATH=$(grep DCT_CONFIG_PATH "$ENV_FILE" | grep -v '^#' | head -n 1 | cut -d'=' -f2-)
AUDIT_PATH=$(grep DCT_AUDIT_PATH "$ENV_FILE" | grep -v '^#' | head -n 1 | cut -d'=' -f2-)

# Set container paths
CONTAINER_CONFIG_PATH="/app/config"
CONTAINER_AUDIT_PATH="/app/audit"

# Prepare volume mounts
VOLUMES=""
if [ -n "$CONFIG_PATH" ]; then
  VOLUMES="$VOLUMES -v \"$CONFIG_PATH:$CONTAINER_CONFIG_PATH\""
  # Override the path in container
  ENV_VARS="$ENV_VARS -e DCT_CONFIG_PATH=\"$CONTAINER_CONFIG_PATH\""
fi

if [ -n "$AUDIT_PATH" ]; then
  VOLUMES="$VOLUMES -v \"$AUDIT_PATH:$CONTAINER_AUDIT_PATH\""
  # Override the path in container
  ENV_VARS="$ENV_VARS -e DCT_AUDIT_PATH=\"$CONTAINER_AUDIT_PATH\""
fi

# Build and execute the docker run command
CMD="docker run --name dct-ui -d -p ${PORT}:3000 ${ENV_VARS} ${VOLUMES} directus-config-toolkit-ui:${TAG}"
eval "$CMD"

echo "✅ Container started! UI available at http://localhost:${PORT}"
echo "View logs with: docker logs dct-ui"
echo "Stop container with: docker stop dct-ui"
