#!/bin/bash

# Test script for local DCT CLI during development
# Usage: ./test-cli.sh [commands...]
# Example: ./test-cli.sh audit integrity-check

cd packages/core
node dist/cli.js "$@"
