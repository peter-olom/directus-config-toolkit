# <img src="./dct-logo.png" alt="DCT Logo" width="48" height="60" style="vertical-align:middle;"> Directus Config Toolkit – Development Guide

Welcome to the development guide for the Directus Config Toolkit (DCT)! This document will help you set up, develop, and contribute to the DCT dashboard and core packages.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Development Workflow](#development-workflow)
  - [API Server](#api-server)
  - [UI Dashboard](#ui-dashboard)
- [Building for Production](#building-for-production)
- [Docker Usage](#docker-usage)
- [Environment Variables](#environment-variables)
- [Testing the API](#testing-the-api)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** v18 or higher
- **npm** or **yarn**
- A running **Directus** instance (for full functionality)

---

## Project Structure

This repository is a monorepo containing:

- **packages/core**: CLI and API server
- **packages/ui**: Next.js-based web dashboard

---

## Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/peter-olom/directus-config-toolkit.git
   cd directus-config-toolkit
   ```
2. **Install dependencies (root):**
   ```bash
   npm install
   ```
3. **Build the Packages:**
   ```bash
   npm run build
   ```

---

## Development Workflow

### Core (cli)

Start the API server in development mode (from the project root):

```bash
cd packages/core
npm run dev
```

- You'll now be able to run the builts cli `node ./dist/cli.js`

### UI Dashboard

To develop the web dashboard:

1. Navigate to the UI package:
   ```bash
   cd packages/ui
   ```
2. Install UI dependencies (if not already - from the monorepo root):
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   cd packages/ui
   npm run dev
   ```
4. The dashboard will be available at [http://localhost:3000](http://localhost:3000)

---

## Building for Production

Build both the API server and UI for production deployment:

```bash
# Build API server
cd packages/ui
npm run build

# Build UI
cd packages/ui
npm run build

# Or from root
npm run build
```

---

## Docker Usage

You can build and run the toolkit using Docker for easy deployment.

**Build the Docker image:**

```bash
docker build -t directus-config-toolkit .
```

**Run the container:**

```bash
docker run -p 3000:3000 \
  -e DCT_API_URL=http://your-directus-url \
  -e DCT_TOKEN=your_token \
  -v /path/to/config:/app/config \
  directus-config-toolkit dashboard
```

---

## Environment Variables

Set the following environment variables as needed:

- `DCT_API_URL`: Your Directus instance URL (required)
- `DCT_TOKEN`: Your Directus API token (required)
- `DCT_CONFIG_PATH`: Path to store configuration files (default: `./config`)
- `DCT_API_PORT`: API server port (default: `3001`)

For UI development, you may also need:

- `AUTH_SECRET`, `AUTH_TRUST_HOST`, `DCT_UI_URL`, `DCT_UI_USERNAME`, `DCT_UI_PASSWORD`

---

## Testing the API

You can test the API endpoints using `curl` or any HTTP client:

```bash
# Health check
curl http://localhost:3000
```

---

## Contributing

We welcome contributions! To get started:

1. Fork the repository and create a new branch for your feature or fix.
2. Follow the setup instructions above.
3. Make your changes and ensure all tests pass.
4. Submit a pull request with a clear description of your changes.

---

## Troubleshooting

- **Connection Issues:**
  - Check your environment variables and Directus instance status.
  - Use `dct debug` and `dct debug-env` for diagnostics.
- **Schema Import Failures:**
  - Try running schema import in dry-run mode: `dct import schema --dry-run`
- **Role & Permission Issues:**
  - Admin roles are excluded from import/export.
  - Public roles are mapped by name and icon, not by ID.

For more help, see the [README.md](./README.md) or open an issue on GitHub.

---

Happy coding! 🚀
