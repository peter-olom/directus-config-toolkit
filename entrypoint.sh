#!/bin/sh

# Print version
echo "directus-ct version: $(cat /app/package.json | jq -r .version)"

# Wait for Directus to be ready
until curl -s "${DCT_API_URL}/server/ping"; do
  echo "Waiting for Directus to be ready..."
  sleep 5
done

# Check if the command is to start the dashboard
if [ "$1" = "dashboard" ]; then
  echo "Starting dashboard API server..."
  exec directus-ct dashboard
else
  # Execute the directus-ct command passed as arguments
  exec directus-ct "$@"
fi