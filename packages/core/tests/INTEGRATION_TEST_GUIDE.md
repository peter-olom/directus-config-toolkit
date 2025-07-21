# DCT Integration Test Guide

## Overview

This guide explains how to run the integration tests for the Directus Config Toolkit (DCT). The tests verify that DCT correctly exports and imports Directus configurations between instances.

### Testing Approaches

1. **Isolated Container Tests** (`roleManager-isolated.test.ts`) - **Recommended**
   - No port exposure to host - avoids conflicts
   - All operations happen inside containers via `docker exec`
   - DCT is installed and run inside the container
   - Configuration files are shared via Docker volumes
   - Complete isolation from host environment

2. **Port-based Tests** (`roleManager-sqlite.test.ts`)
   - Exposes Directus API to host
   - Uses dynamic port discovery to avoid conflicts
   - Suitable for debugging with external tools
   - May have conflicts with existing services

## Prerequisites

1. **Docker Desktop** must be installed and running
2. **Node.js 18+** installed
3. **Sufficient disk space** for Docker images (~500MB)

## Running the Tests

### First Time Setup

```bash
# Install dependencies
npm install

# Pull required Docker images (one-time)
docker pull directus/directus:11.2.0  # Stable version from debug guide
docker pull directus/directus:11.9.3  # Latest version

# Note: Tests now use SQLite instead of PostgreSQL for faster execution
```

### Run Integration Tests

```bash
# Run all integration tests (uses latest version by default)
npm run test:integration

# Test against specific Directus versions
npm run test:integration:stable  # Tests with v11.2.0
npm run test:integration:latest  # Tests with v11.9.3
npm run test:integration:all     # Tests against all versions

# Run specific test file
npm test roleManager-sqlite.test.ts

# Run tests with debug output
DEBUG=true npm run test:integration

# Run tests in watch mode
npm run test:watch -- integration

# Use custom Directus version
DIRECTUS_TEST_VERSION=11.5.0 npm run test:integration
```

## What the Tests Do

1. **Spin up Source Instance**: Creates a Directus instance with SQLite
2. **Setup Test Data**: Creates roles, policies, access mappings, and permissions
3. **Export Configuration**: Uses DCT to export the configuration
4. **Spin up Target Instance**: Creates a fresh Directus instance
5. **Import Configuration**: Uses DCT to import the exported config
6. **Verify**: Compares source and target configurations for equivalence

## Test Structure

```
tests/
├── integration/
│   └── roleManager.test.ts    # Main integration test suite
├── fixtures/
│   └── directus-setup.ts      # Test data setup
└── utils/
    ├── docker.ts              # Docker container management
    ├── directus.ts            # Directus instance utilities
    └── comparison.ts          # Config comparison logic
```

## Troubleshooting

### Port Conflicts
Tests use random ports (10000-60000). If you get port conflicts, just re-run the tests.

### Docker Issues
```bash
# Check Docker is running
docker ps

# Clean up any leftover containers
docker ps -a | grep "test-" | awk '{print $1}' | xargs docker rm -f

# Remove test network
docker network rm dct-test-network
```

### Timeout Errors
Integration tests have a 5-minute timeout. If tests timeout:
- Ensure Docker images are pre-pulled
- Check your internet connection
- Increase timeout in `jest.config.js`

### TypeScript Errors
```bash
# Check for TypeScript errors
npx tsc --noEmit

# Rebuild the project
npm run build
```

## Test Data

The tests create the following test data:

**Roles:**
- VendorRole
- ConsumerRole  
- Promoter
- Supervisor

**Policies:**
- Authenticated (default for all users)
- Promoter Policy
- Supervisor Policy

**Permissions:**
- Users can read/update their own profile
- Supervisors can read all users and roles
- All authenticated users can read files/folders

**Test Users:**
- vendor@test.local (password: vendor123456)
- consumer@test.local (password: consumer123456)
- promoter@test.local (password: promoter123456)
- supervisor@test.local (password: supervisor123456)

## CI/CD Integration

To run tests in CI:

```yaml
# Example GitHub Actions
- name: Run Integration Tests
  run: |
    docker pull postgres:15-alpine
    docker pull directus/directus:11.2.0
    npm run test:integration
```

## Extending the Tests

To add tests for other managers (Schema, Files, etc.):

1. Create a new test file in `tests/integration/`
2. Use the existing utilities in `tests/utils/`
3. Add comparison logic to `tests/utils/comparison.ts`
4. Follow the same pattern as `roleManager.test.ts`