#!/bin/sh

# Print version
echo "toolkit version: $(cat /app/package.json | jq -r .version)"

# Wait for Directus to be ready
until curl -s "${DCT_API_URL}/server/ping"; do
  echo "Waiting for ${DCT_API_URL} to be ready..."
  sleep 5
done

#  Echo `which dct` to confirm the command is available
echo "Using dct command from: $(which dct)"

# Execute the directus-ct command passed as arguments
exec dct "$@"
