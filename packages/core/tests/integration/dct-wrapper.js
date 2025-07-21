#!/usr/bin/env node

// Simple wrapper for DCT that works in Directus container
const { spawn } = require('child_process');
const path = require('path');

// Set environment variables
process.env.DCT_API_URL = process.env.DCT_API_URL || 'http://localhost:8055';
process.env.DCT_CONFIG_PATH = process.env.DCT_CONFIG_PATH || '/directus/config';

// Get CLI path
const cliPath = path.join(__dirname, '../../dist/cli.js');

// Pass through arguments
const args = process.argv.slice(2);

// Run the CLI
const child = spawn('node', [cliPath, ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code);
});