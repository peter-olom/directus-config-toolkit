FROM node:20-alpine3.19

# Install curl for the healthcheck in entrypoint.sh
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Install dependencies and the package globally
RUN npm install -g .

# Create config directory
RUN mkdir -p /app/config

# Set proper permissions for entrypoint
RUN chmod +x /entrypoint.sh

# Set default environment variables
ENV DIRECTUS_CT_URL=http://localhost:8055
ENV DIRECTUS_CT_CONFIG_PATH=/app/config

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# Default command (can be overridden)
CMD ["--help"]
