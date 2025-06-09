# <img src="https://raw.githubusercontent.com/peter-olom/directus-config-toolkit/31ce87446f86d85deb691454a4b9544f8ba5d4d2/dct-logo.png" alt="DCT Logo" width="48" height="60" style="vertical-align:middle;"> Directus Config Toolkit (DCT) - Core CLI

A powerful CLI tool for managing Directus configurations across environments. Export, import, and version your Directus instance configurations with ease.

## Installation

```bash
# Install globally
npm install -g @devrue/directus-config-toolkit

# Or use with npx
npx @devrue/directus-config-toolkit --help
```

## Quick Start

```bash
# Export configuration
dct export --url https://your-directus.com --token your-token

# Import configuration
dct import --url https://target-directus.com --token target-token --config ./config

# Preview changes before import
dct import --url https://target-directus.com --token target-token --config ./config --preview
```

## Features

- **Export & Import**: Backup and restore Directus configurations
- **Configuration Versioning**: Track changes with audit snapshots
- **Schema Management**: Handle database schema changes
- **Role & Permission Management**: Transfer roles between environments
- **Asset Management**: Handle file uploads and downloads
- **Preview Mode**: See changes before applying them

## Core Commands

### Export

```bash
dct export [options]
```

Export your Directus configuration to local files.

**Options:**

- `--url <url>`: Directus instance URL
- `--token <token>`: Admin access token
- `--output <path>`: Output directory (default: ./config)
- `--collections <items>`: Specific collections to export

### Import

```bash
dct import [options]
```

Import configuration to a Directus instance.

**Options:**

- `--url <url>`: Target Directus instance URL
- `--token <token>`: Admin access token
- `--config <path>`: Configuration directory (default: ./config)
- `--preview`: Preview changes without applying them

### Audit

```bash
dct audit [options]
```

Track and manage configuration changes over time.

**Options:**

- `--snapshot`: Create a snapshot of current configuration
- `--compare <snapshot1> <snapshot2>`: Compare two snapshots

## Configuration

Create a `.env` file or set environment variables:

```bash
DIRECTUS_URL=https://your-directus.com
DIRECTUS_TOKEN=your-admin-token
```

## Docker Usage

```bash
# Pull the image
docker pull ghcr.io/peter-olom/directus-config-toolkit:latest

# Run export
docker run --rm -v $(pwd)/config:/app/config \
  ghcr.io/peter-olom/directus-config-toolkit:latest \
  export --url https://your-directus.com --token your-token

# Run import
docker run --rm -v $(pwd)/config:/app/config \
  ghcr.io/peter-olom/directus-config-toolkit:latest \
  import --url https://target-directus.com --token target-token
```

## Web Dashboard

For a GUI-based experience, check out the companion web dashboard:

```bash
npm install -g @devrue/directus-config-toolkit-ui
```

Or use the Docker image:

```bash
docker pull ghcr.io/peter-olom/directus-config-toolkit-ui:latest
```

## Project Repository

This package is part of the [Directus Config Toolkit](https://github.com/peter-olom/directus-config-toolkit) monorepo, which includes both the CLI tool and web dashboard.
