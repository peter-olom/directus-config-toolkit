# Build stage
FROM node:20-alpine3.19 AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Production stage
FROM node:20-alpine3.19

# Install curl and jq for healthcheck and json parsing
RUN apk add --no-cache curl jq

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy built files from builder
COPY --from=builder /build/dist ./dist
COPY entrypoint.sh /entrypoint.sh

# Create config directory
RUN mkdir -p /app/config && \
	chmod +x /entrypoint.sh && \
	npm install -g .

# Set default environment variables
ENV DIRECTUS_CT_URL=http://localhost:8055
ENV DIRECTUS_CT_CONFIG_PATH=/app/config
ENV DIRECTUS_CT_API_PORT=3001

# Expose API port
EXPOSE 3001

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]
CMD ["--help"]