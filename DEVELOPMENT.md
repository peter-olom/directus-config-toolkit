# Development Guide

This document provides instructions for developing and running the Directus Config Toolkit dashboard.

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- A running Directus instance

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the API server:
   ```bash
   npm run build
   ```

## Running in Development Mode

### API Server

Start the API server in development mode:

```bash
npm run dev:dashboard
```

This will compile the TypeScript files and start the API server at http://localhost:3001.

### UI Development

To run the UI in development mode:

1. Navigate to the ui directory:

   ```bash
   cd ui
   ```

2. Install dependencies if you haven't already:

   ```bash
   npm install
   ```

3. Start the Next.js development server:

   ```bash
   npm run dev
   ```

4. The UI will be available at http://localhost:3000

## Building for Production

Build the entire project:

```bash
# Build API server
npm run build

# Build UI
cd ui
npm run build
```

## Docker

Build the Docker image:

```bash
docker build -t directus-config-toolkit .
```

Run the container:

```bash
docker run -p 3001:3001 \
  -e DIRECTUS_CT_URL=http://your-directus-url \
  -e DIRECTUS_CT_TOKEN=your_token \
  -v /path/to/config:/app/config \
  directus-config-toolkit dashboard
```

## Environment Variables

Remember to set these environment variables:

- `DIRECTUS_CT_URL`: Your Directus instance URL
- `DIRECTUS_CT_TOKEN`: Your Directus API token
- `DIRECTUS_CT_CONFIG_PATH`: Path to store configuration files
- `DIRECTUS_CT_API_PORT`: API server port (default: 3001)

## Testing the API

You can use curl to test the API endpoints:

```bash
# Health check
curl http://localhost:3001/health

# Get configuration status
curl http://localhost:3001/status

# Create a snapshot
curl -X POST http://localhost:3001/snapshot
```
