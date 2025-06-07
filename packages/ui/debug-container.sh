#!/bin/bash
#
# Debug script for investigating the UI Docker container file structure
# 
# This script starts the container and gives you a shell inside it
# to explore the file system and troubleshoot issues.
#
# Usage:
#   ./debug-container.sh [tag] [port]
#
# Example:
#   ./debug-container.sh latest 3001   # Debug the "latest" tagged container on port 3001
#   ./debug-container.sh v1.0.0 3008   # Debug v1.0.0 on port 3008
#   ./debug-container.sh               # Debug the "dev" tagged container on port 3000

# Default tag if not specified
TAG=${1:-dev}
PORT=${2:-3000}

# Navigate to monorepo root (from the UI package directory)
cd $(dirname "$0")/../..

echo "Starting directus-config-toolkit-ui:$TAG in debug mode on port $PORT..."
echo "This will give you a shell inside the container to explore."

# Run the container with an interactive shell
docker run --rm -it \
  -p ${PORT}:3000 \
  --entrypoint /bin/sh \
  directus-config-toolkit-ui:$TAG

# Container will be automatically removed when you exit the shell
