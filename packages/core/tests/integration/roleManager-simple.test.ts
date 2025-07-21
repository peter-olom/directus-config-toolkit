import { DockerTestManager } from '../utils/docker';
import { DirectusSQLiteTestManager, DirectusTestInstance } from '../utils/directus-sqlite';
import { setupDirectusTestData, verifyUserAccess } from '../fixtures/directus-setup';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { execSync } from 'child_process';

// Set environment variables for DCT
function setupDCTEnvironment(apiUrl: string, token: string, configPath: string) {
  process.env.DCT_API_URL = apiUrl;
  process.env.DCT_TOKEN = token;
  process.env.DCT_CONFIG_PATH = configPath;
}

// Run DCT CLI command
function runDCTCommand(command: string): string {
  const cliPath = join(__dirname, '../../dist/cli.js');
  try {
    const output = execSync(`node ${cliPath} ${command}`, {
      encoding: 'utf8',
      env: process.env
    });
    return output;
  } catch (error: any) {
    console.error(`DCT command failed: ${command}`);
    console.error(error.stdout);
    console.error(error.stderr);
    throw error;
  }
}

describe('RoleManager Integration Test - Directus 11.9.3', () => {
  let dockerManager: DockerTestManager;
  let directusManager: DirectusSQLiteTestManager;
  let sourceInstance: DirectusTestInstance;
  let targetInstance: DirectusTestInstance;
  let tempConfigPath: string;

  beforeAll(async () => {
    console.log('Setting up test infrastructure for Directus 11.9.3...');
    
    // Initialize Docker manager
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    
    // No need to pull - we already have 11.9.3
    console.log('Using directus/directus:11.9.3 (already pulled)');
    
    directusManager = new DirectusSQLiteTestManager(dockerManager);
    
    // Create temporary config directory
    tempConfigPath = await mkdtemp(join(tmpdir(), 'dct-test-config-'));
  });

  afterAll(async () => {
    console.log('Cleaning up test infrastructure...');
    
    // Clean up Directus instances
    if (sourceInstance) {
      await sourceInstance.cleanup();
    }
    if (targetInstance) {
      await targetInstance.cleanup();
    }
    
    // Clean up Docker resources
    await dockerManager.cleanup();
    
    // Remove temp directory
    await rm(tempConfigPath, { recursive: true, force: true });
  });

  test('should export and import permissions correctly', async () => {
    // Create source instance
    console.log('Creating source Directus instance...');
    sourceInstance = await directusManager.createDirectusInstance({
      name: 'source-instance'
    });

    // Set up test data
    console.log('Setting up test data...');
    await setupDirectusTestData(sourceInstance);

    // Export from source
    console.log('Exporting configurations...');
    setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
    const exportOutput = runDCTCommand('export roles');
    console.log('Export completed');

    // Check exported permissions
    const fs = require('fs');
    const exportedPermissions = JSON.parse(fs.readFileSync(join(tempConfigPath, 'permissions.json'), 'utf8'));
    
    // Find the directus_users read permission
    const userReadPermission = exportedPermissions.find((p: any) => 
      p.collection === 'directus_users' && 
      p.action === 'read' &&
      p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
    );

    expect(userReadPermission).toBeDefined();
    expect(userReadPermission.fields).toContain('role');
    expect(userReadPermission.fields).toContain('first_name');
    expect(userReadPermission.fields).toContain('last_name');
    expect(userReadPermission.fields).toContain('email');
    
    // Create target instance
    console.log('Creating target Directus instance...');
    targetInstance = await directusManager.createDirectusInstance({
      name: 'target-instance'
    });

    // Import to target
    console.log('Importing configurations...');
    setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
    const importOutput = runDCTCommand('import roles');
    console.log('Import completed');

    // Verify a user can access their data
    console.log('Creating test user and verifying access...');
    
    // First, get the role ID in the target instance
    const { createDirectus, rest } = require('@directus/sdk');
    const targetClient = createDirectus(targetInstance.apiUrl).with(rest());
    
    const getRoles = () => ({
      path: '/roles',
      method: 'GET',
      params: { limit: -1, fields: ['id', 'name'] }
    });

    const clientWithToken = Object.assign(targetClient, {
      getToken: () => targetInstance.adminToken!
    });

    const roles = await clientWithToken.request(getRoles());
    const vendorRole = roles.find((r: any) => r.name === 'VendorRole');
    expect(vendorRole).toBeDefined();

    // Create a test user
    const createUser = (userData: any) => ({
      path: '/users',
      method: 'POST',
      body: userData
    });

    await clientWithToken.request(createUser({
      email: 'vendor@test.local',
      password: 'vendor123456',
      first_name: 'Test',
      last_name: 'Vendor',
      role: vendorRole.id,
      status: 'active'
    }));

    // Verify the user can access their data
    const vendorData = await verifyUserAccess(
      targetInstance,
      'vendor@test.local',
      'vendor123456'
    );

    expect(vendorData).toBeDefined();
    expect(vendorData.email).toBe('vendor@test.local');
    expect(vendorData.first_name).toBe('Test');
    expect(vendorData.last_name).toBe('Vendor');
    expect(vendorData.role).toBeDefined();
    expect(vendorData.role.name).toBe('VendorRole');
    
    // Verify they can see more than just ID (the bug we're testing for)
    const fieldCount = Object.keys(vendorData).length;
    expect(fieldCount).toBeGreaterThan(1);
    console.log(`✅ User can access ${fieldCount} fields - permissions working correctly!`);
  });
});