# <img src="https://raw.githubusercontent.com/peter-olom/directus-config-toolkit/31ce87446f86d85deb691454a4b9544f8ba5d4d2/dct-logo.png" alt="DCT Logo" width="48" height="60" style="vertical-align:middle;"> Directus Config Toolkit (DCT)

Directus Config Toolkit is a utility for managing Directus configurations across environments. It provides robust tools for exporting, importing, and versioning your Directus instance configurations, making it easier to implement DevOps practices with Directus.

<div align="center">

| <img src="https://raw.githubusercontent.com/peter-olom/directus-config-toolkit/56424f1fd6f6092ea6d5eb50e52ce3ba5daf4e32/timemachine-ui.png" width="600px" /> | <img src="https://raw.githubusercontent.com/peter-olom/directus-config-toolkit/56424f1fd6f6092ea6d5eb50e52ce3ba5daf4e32/menu-cli.png" width="500px" /> |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |

</div>

## Features

- **Export & Import**: Easily backup and restore Directus configurations including flows, roles, settings, files, and schema
- **Configuration Versioning**: Track changes over time with audit snapshots
- **Web Dashboard**: Intuitive GUI for managing configurations
- **Docker Support**: Containerized deployment options
- **CI/CD Integration**: Seamlessly integrate with CI/CD pipelines
- **Time Machine**: View configuration history and changes over time
- **Import Preview**: See changes before applying them
- **Role & Permission Management**: Safely transfer role configurations between environments

## Project Structure

The project is now organized as a monorepo with two main packages:

- **packages/core (@devrue/directus-config-toolkit)**: Core CLI functionality (formerly directus-ct)
- **packages/ui (@devrue/directus-config-toolkit-ui)**: Web dashboard for GUI-based management

## Installation

### CLI Tool

```bash
# Install globally
npm install -g @devrue/directus-config-toolkit

# Or use with npx
npx @devrue/directus-config-toolkit [command]
```

<div align="center">
  <img src="https://raw.githubusercontent.com/peter-olom/directus-config-toolkit/56424f1fd6f6092ea6d5eb50e52ce3ba5daf4e32/timemachine-cli.png" width="800px" />
</div>

### Docker

```bash
# Pull and run the CLI image
docker pull ghcr.io/peter-olom/directus-config-toolkit:latest
docker run -v $(pwd)/config:/app/config -e DCT_API_URL=http://directus:8055 -e DCT_TOKEN=your_token ghcr.io/peter-olom/directus-config-toolkit:latest [command]

# Pull and run the UI image
docker pull ghcr.io/peter-olom/directus-config-toolkit-ui:latest
docker run -p 3000:3000 -v $(pwd)/config:/app/config -e DCT_API_URL=http://directus:8055 -e DCT_TOKEN=your_token ghcr.io/peter-olom/directus-config-toolkit-ui:latest
```

## Configuration

DCT can be configured using environment variables:

```bash
# Required variables
DCT_API_URL=http://localhost:8055  # Your Directus instance URL
DCT_TOKEN=your_token               # Your Directus API token

# Optional variables
DCT_CONFIG_PATH=./config           # Path to store configuration files
DCT_AUDIT_PATH=./audit             # Path to store audit logs and snapshots
DCT_AUDIT_RETENTION_DAYS=30        # Days to keep audit snapshots

# If Using the UI
AUTH_SECRET=random-secret-used-by-next-auth
AUTH_TRUST_HOST=true # Use this if you run into - UntrustedHost: Host must be trusted. URL was: http://localhost:PORT/api/auth/session. Read more at https://errors.authjs.dev#untrustedhost
DCT_UI_URL=http://localhost:3000
DCT_UI_USERNAME=admin
DCT_UI_PASSWORD=bcrypt-hash-string # DCT can generate this for you
```

You can set these variables in your shell, a `.env` file, or pass them directly when using Docker.

## CLI Commands

> **Note**: The binary name has changed from `directus-ct` to `dct`

### Configuration Management

```bash
# Export configuration
dct export <type>            # Export a specific configuration type
dct export-all               # Export all configuration types in the correct order

# Import configuration
dct import <type>            # Import a specific configuration type
dct import-all               # Import all configuration types in the proper sequence
dct import-all --continue-on-error  # Continue importing if one type fails

# Available types: schema, roles, files, settings, flows
```

### Audit & Time Machine

```bash
# List snapshots
dct audit list <type>

# Show differences between snapshots
dct audit diff <type> <idx1> <idx2>

# See configuration changes over time
dct audit timemachine <type> [--limit <n>] [--start-time <iso>]

# Show import differences
dct audit import-diffs <type>
```

### Debug & Utilities

```bash
# Show environment configuration
dct config

# Debug connection issues
dct debug
dct debug-env

# Generate secure password hash for UI authentication
dct hash-password [-p password] [-o output-file]
```

### UI Management

```bash
# Start the UI
dct ui start [-p port] [-t tag] [-n name]

# Check UI status
dct ui status [-n name]

# Stop the UI
dct ui stop [-n name]

# View UI logs
dct ui logs [-n name] [-f]
```

## Web Dashboard

For those who prefer a graphical interface, DCT includes a web-based dashboard for managing your Directus configurations.

### Starting the UI

```bash
# Using the CLI
dct ui start

# Using Docker
docker run -p 3000:3000 \
  -e DCT_API_URL=http://directus:8055 \
  -e DCT_TOKEN=your_token \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/audit:/app/audit \
  ghcr.io/peter-olom/directus-config-toolkit-ui:latest
```

<div align="center">
  <img src="https://raw.githubusercontent.com/peter-olom/directus-config-toolkit/56424f1fd6f6092ea6d5eb50e52ce3ba5daf4e32/import-diff-ui.png" width="800px" />
</div>

The dashboard provides:

- At-a-glance configuration status
- Interactive diff viewing
- Configuration export/import with visual feedback
- Time machine for browsing configuration history
- Easy setup for CI/CD pipelines

## How It Works

### Export Process

When you export configurations, DCT:

1. Connects to your Directus instance using the provided API token
2. Fetches the specified configuration type(s)
3. Stores the configurations as JSON files in the config directory
4. Creates audit snapshots for tracking changes over time

### Import Process

When you import configurations, DCT:

1. Reads the configuration files from the config directory
2. Creates a snapshot of the current state of your Directus instance
3. Applies the configurations to your Directus instance
4. Creates an "after" snapshot to document changes
5. Follows the correct sequence to handle dependencies between configuration types

## Troubleshooting

### Connection Issues

If you're having trouble connecting:

```bash
# Check your environment configuration
dct debug-env

# Test connection and authentication
dct debug
```

### Schema Import Failures

Schema imports can fail if there are incompatible changes:

```bash
# Try running the schema import in dry-run mode
dct import schema --dry-run
```

### Role & Permission Issues

The tool handles special cases like admin roles and public permissions:

- Admin roles are automatically excluded from export/import
- Public roles are mapped between environments by name and icon, not by ID
- Role references in permissions and policies are automatically remapped

## Development

To contribute to DCT:

```bash
# Clone the repository
git clone https://github.com/peter-olom/directus-config-toolkit.git
cd directus-config-toolkit

# Install dependencies
npm install

# Build the packages
npm run build

# Run the core package in development mode
cd packages/core
npm run dev

# Run the UI in development mode
cd packages/ui
npm run dev
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for more detailed development instructions.

## Acknowledgements

- The [Directus](https://directus.io/) team for their amazing headless CMS 🤩
- Contributors to this project
- Users who provide feedback and bug reports

---

For more information, visit the [GitHub repository](https://github.com/peter-olom/directus-config-toolkit).
