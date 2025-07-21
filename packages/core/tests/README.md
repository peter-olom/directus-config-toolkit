# DCT Integration Tests

This directory contains integration tests for the Directus Config Toolkit (DCT).

## Overview

The integration tests verify that DCT correctly exports and imports Directus configurations between instances. The tests use Docker to spin up isolated Directus instances with PostgreSQL databases.

## Structure

```
tests/
├── integration/       # Integration test suites
│   └── roleManager.test.ts
├── fixtures/         # Test data and setup scripts
│   └── directus-setup.ts
└── utils/            # Test utilities
    ├── docker.ts     # Docker container management
    ├── directus.ts   # Directus instance management
    ├── comparison.ts # Configuration comparison logic
    └── helpers.ts    # General test helpers
```

## Running Tests

```bash
# Run all tests
npm test

# Run only integration tests
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run with debug output
DEBUG=true npm test
```

## Requirements

- Docker must be installed and running
- Node.js 18+ 
- Sufficient disk space for Docker images

## Test Flow

1. **Setup**: Creates a Docker network and pulls required images
2. **Source Instance**: Spins up a Directus instance and populates it with test data
3. **Export**: Uses DCT to export configurations from the source
4. **Target Instance**: Spins up a fresh Directus instance
5. **Import**: Uses DCT to import configurations to the target
6. **Verification**: Compares source and target configurations for equivalence
7. **Cleanup**: Removes all containers and temporary files

## Key Features Tested

- Role Manager export/import (roles, policies, access, permissions)
- ID mapping between instances
- Permission field preservation
- User access verification
- Dry-run mode
- System entity filtering

## Debugging

Set `DEBUG=true` to see console output during tests:

```bash
DEBUG=true npm test
```

To inspect containers during test execution, the containers are named:
- `test-{timestamp}-{random}-source` (source Directus)
- `test-{timestamp}-{random}-target` (target Directus)
- `db-test-{timestamp}-{random}` (PostgreSQL)

## Adding New Tests

1. Create test data in `fixtures/`
2. Add comparison logic in `utils/comparison.ts`
3. Write test suite in `integration/`
4. Ensure proper cleanup in `afterAll` hooks

## Common Issues

- **Port conflicts**: Tests use random ports (10000-60000)
- **Docker not running**: Ensure Docker daemon is active
- **Timeout errors**: Increase timeout in jest.config.js
- **Image pull failures**: Check internet connection