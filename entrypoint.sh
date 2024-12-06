#!/bin/sh

# Print version
echo "directus-ct version: $(cat /app/package.json | jq -r .version)"

# Wait for Directus to be ready
until curl -s "${DIRECTUS_CT_URL}/server/ping"; do
  echo "Waiting for Directus to be ready..."
  sleep 5
done

# Execute the directus-ct command passed as arguments
exec directus-ct "$@"