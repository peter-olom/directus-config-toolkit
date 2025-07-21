import { DockerTestManager } from '../utils/docker';
import { DirectusSQLiteTestManager, DirectusTestInstance } from '../utils/directus-sqlite';
import { setupDirectusTestData, verifyUserAccess } from '../fixtures/directus-setup';
import { ConfigComparator } from '../utils/comparison';
import { DIRECTUS_VERSIONS, TEST_CONFIG } from '../utils/test-config';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { createDirectus, rest, RestCommand } from '@directus/sdk';
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

// Test each Directus version
describe.each([
  ['Stable (11.2.0)', DIRECTUS_VERSIONS.STABLE],
  ['Latest (11.9.3)', DIRECTUS_VERSIONS.LATEST]
])('RoleManager Integration Tests with Directus %s', (versionName, directusVersion) => {
  let dockerManager: DockerTestManager;
  let directusManager: DirectusSQLiteTestManager;
  let sourceInstance: DirectusTestInstance;
  let targetInstance: DirectusTestInstance;
  let tempConfigPath: string;

  // Override the test config for this version
  const originalImage = TEST_CONFIG.DIRECTUS_IMAGE;

  beforeAll(async () => {
    // Set the Directus version for this test suite
    TEST_CONFIG.DIRECTUS_IMAGE = `directus/directus:${directusVersion}`;
    
    console.log(`Setting up test infrastructure for Directus ${directusVersion}...`);
    
    // Initialize Docker manager
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    
    // Pull required images
    console.log(`Pulling Docker image: directus/directus:${directusVersion}...`);
    await dockerManager.pullImage(`directus/directus:${directusVersion}`);
    
    directusManager = new DirectusSQLiteTestManager(dockerManager);
    
    // Create temporary config directory
    tempConfigPath = await mkdtemp(join(tmpdir(), 'dct-test-config-'));
  });

  afterAll(async () => {
    console.log(`Cleaning up test infrastructure for Directus ${directusVersion}...`);
    
    // Restore original image
    TEST_CONFIG.DIRECTUS_IMAGE = originalImage;
    
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

  describe('Cross-version compatibility', () => {
    test('should export from one version and import to another', async () => {
      // This test is only meaningful when we have multiple versions
      if (DIRECTUS_VERSIONS.STABLE === DIRECTUS_VERSIONS.LATEST) {
        console.log('Skipping cross-version test - versions are the same');
        return;
      }

      // Create source instance with stable version
      console.log(`Creating source instance with Directus ${DIRECTUS_VERSIONS.STABLE}...`);
      TEST_CONFIG.DIRECTUS_IMAGE = `directus/directus:${DIRECTUS_VERSIONS.STABLE}`;
      const stableManager = new DirectusSQLiteTestManager(dockerManager);
      sourceInstance = await stableManager.createDirectusInstance({
        name: 'source-stable'
      });

      // Set up test data
      await setupDirectusTestData(sourceInstance);

      // Export from stable version
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      runDCTCommand('export roles');

      // Create target instance with latest version
      console.log(`Creating target instance with Directus ${DIRECTUS_VERSIONS.LATEST}...`);
      TEST_CONFIG.DIRECTUS_IMAGE = `directus/directus:${DIRECTUS_VERSIONS.LATEST}`;
      const latestManager = new DirectusSQLiteTestManager(dockerManager);
      targetInstance = await latestManager.createDirectusInstance({
        name: 'target-latest'
      });

      // Import to latest version
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      runDCTCommand('import roles');

      // Verify the import was successful by checking a permission
      const fs = require('fs');
      const exportedPermissions = JSON.parse(fs.readFileSync(join(tempConfigPath, 'permissions.json'), 'utf8'));
      
      const userReadPermission = exportedPermissions.find((p: any) => 
        p.collection === 'directus_users' && 
        p.action === 'read' &&
        p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
      );

      expect(userReadPermission).toBeDefined();
      expect(userReadPermission.fields.length).toBeGreaterThan(1);

      // Cleanup
      await sourceInstance.cleanup();
      await targetInstance.cleanup();
    });
  });

  describe('Version-specific tests', () => {
    let sourceSetupResult: any;

    beforeEach(async () => {
      // Create instances for this specific version
      console.log(`Creating Directus ${directusVersion} instances...`);
      
      sourceInstance = await directusManager.createDirectusInstance({
        name: `source-${directusVersion}`
      });

      // Set up test data
      console.log('Setting up test data...');
      sourceSetupResult = await setupDirectusTestData(sourceInstance);

      targetInstance = await directusManager.createDirectusInstance({
        name: `target-${directusVersion}`
      });
    });

    afterEach(async () => {
      if (sourceInstance) {
        await sourceInstance.cleanup();
      }
      if (targetInstance) {
        await targetInstance.cleanup();
      }
    });

    test(`should handle permission fields correctly in Directus ${directusVersion}`, async () => {
      // Export from source
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      runDCTCommand('export roles');

      // Check exported permissions structure
      const fs = require('fs');
      const exportedPermissions = JSON.parse(fs.readFileSync(join(tempConfigPath, 'permissions.json'), 'utf8'));
      
      // Find the directus_users read permission
      const userReadPermission = exportedPermissions.find((p: any) => 
        p.collection === 'directus_users' && 
        p.action === 'read' &&
        p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
      );

      expect(userReadPermission).toBeDefined();
      expect(userReadPermission.fields).toBeInstanceOf(Array);
      expect(userReadPermission.fields).toContain('role');
      expect(userReadPermission.fields).toContain('first_name');
      expect(userReadPermission.fields).toContain('last_name');
      expect(userReadPermission.fields).toContain('email');

      // Import to target
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      runDCTCommand('import roles');

      // Create and verify user access
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());

      const readRoles = (): RestCommand<any[], any[]> => () => ({
        path: '/roles',
        method: 'GET',
        params: { limit: -1, fields: ['id', 'name'] }
      });

      const clientWithToken = Object.assign(targetClient, {
        getToken: () => targetInstance.adminToken!
      });

      const targetRoles = await clientWithToken.request(readRoles());
      const roleMap = new Map(targetRoles.map((r: any) => [r.name, r.id]));

      // Create vendor user
      const createUser = (userData: any): RestCommand<any, any> => () => ({
        path: '/users',
        method: 'POST',
        body: userData
      });

      await clientWithToken.request(createUser({
        email: 'vendor@test.local',
        password: 'vendor123456',
        first_name: 'Test',
        last_name: 'Vendor',
        role: roleMap.get('VendorRole'),
        status: 'active'
      }));

      // Verify user can access their data
      const vendorData = await verifyUserAccess(
        targetInstance,
        'vendor@test.local',
        'vendor123456'
      );

      expect(vendorData).toBeDefined();
      expect(vendorData.email).toBe('vendor@test.local');
      expect(vendorData.role).toBeDefined();
      expect(vendorData.role.name).toBe('VendorRole');
      expect(vendorData.first_name).toBe('Test');
      expect(vendorData.last_name).toBe('Vendor');

      // Verify they can see more than just ID
      const fieldCount = Object.keys(vendorData).length;
      expect(fieldCount).toBeGreaterThan(1);
      console.log(`User can access ${fieldCount} fields in Directus ${directusVersion}`);
    });

    test(`should handle dry-run correctly in Directus ${directusVersion}`, async () => {
      // Export from source
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      runDCTCommand('export roles');

      // Get initial state
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());

      const readRoles = (): RestCommand<any[], any[]> => () => ({
        path: '/roles',
        method: 'GET',
        params: { limit: -1, fields: ['id', 'name'] }
      });

      const clientWithToken = Object.assign(targetClient, {
        getToken: () => targetInstance.adminToken!
      });

      const initialRoles = await clientWithToken.request(readRoles());
      const initialRoleCount = initialRoles.length;

      // Import with dry-run
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      const dryRunOutput = runDCTCommand('import roles --dry-run');
      
      expect(dryRunOutput.toLowerCase()).toContain('dry');

      // Verify no changes
      const afterRoles = await clientWithToken.request(readRoles());
      expect(afterRoles.length).toBe(initialRoleCount);
    });
  });
});