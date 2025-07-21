import { DockerTestManager } from '../utils/docker';
import { DirectusSQLiteTestManager, DirectusTestInstance } from '../utils/directus-sqlite';
import { setupDirectusTestData, verifyUserAccess } from '../fixtures/directus-setup';
import { ConfigComparator } from '../utils/comparison';
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

describe('RoleManager Integration Tests with SQLite', () => {
  let dockerManager: DockerTestManager;
  let directusManager: DirectusSQLiteTestManager;
  let sourceInstance: DirectusTestInstance;
  let targetInstance: DirectusTestInstance;
  let tempConfigPath: string;

  beforeAll(async () => {
    console.log('Setting up test infrastructure...');
    
    // Initialize Docker manager
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    
    // Pull required images
    console.log('Pulling Docker images...');
    await dockerManager.pullImage('directus/directus:11.2.0');
    
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

  describe('Export and Import using DCT CLI', () => {
    let sourceSetupResult: any;

    beforeEach(async () => {
      // Create source instance
      console.log('Creating source Directus instance with SQLite...');
      sourceInstance = await directusManager.createDirectusInstance({
        name: 'source-instance'
      });

      // Set up test data
      console.log('Setting up test data in source instance...');
      sourceSetupResult = await setupDirectusTestData(sourceInstance);

      // Create target instance
      console.log('Creating target Directus instance with SQLite...');
      targetInstance = await directusManager.createDirectusInstance({
        name: 'target-instance'
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

    test('should export and import Role Manager configurations successfully using DCT CLI', async () => {
      // Step 1: Export from source instance using DCT CLI
      console.log('Exporting configurations from source using DCT CLI...');
      
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      
      // Export roles (includes roles, policies, access, permissions)
      const exportOutput = runDCTCommand('export roles');
      console.log('Export output:', exportOutput);
      
      // Verify export files were created
      const fs = require('fs');
      expect(fs.existsSync(join(tempConfigPath, 'roles.json'))).toBe(true);
      expect(fs.existsSync(join(tempConfigPath, 'policies.json'))).toBe(true);
      expect(fs.existsSync(join(tempConfigPath, 'access.json'))).toBe(true);
      expect(fs.existsSync(join(tempConfigPath, 'permissions.json'))).toBe(true);

      // Read exported files for comparison
      const exportedConfig = {
        roles: JSON.parse(fs.readFileSync(join(tempConfigPath, 'roles.json'), 'utf8')),
        policies: JSON.parse(fs.readFileSync(join(tempConfigPath, 'policies.json'), 'utf8')),
        access: JSON.parse(fs.readFileSync(join(tempConfigPath, 'access.json'), 'utf8')),
        permissions: JSON.parse(fs.readFileSync(join(tempConfigPath, 'permissions.json'), 'utf8'))
      };

      // Step 2: Import to target instance using DCT CLI
      console.log('Importing configurations to target using DCT CLI...');
      
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      
      const importOutput = runDCTCommand('import roles');
      console.log('Import output:', importOutput);

      // Step 3: Fetch configurations from target instance
      console.log('Fetching configurations from target for comparison...');
      
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());
      
      // Custom read functions with proper RestCommand type
      const readRoles = (): RestCommand<any[], any[]> => () => ({
        path: '/roles',
        method: 'GET',
        params: { limit: -1, fields: ['*'] }
      });

      const readPolicies = (): RestCommand<any[], any[]> => () => ({
        path: '/policies',
        method: 'GET',
        params: { limit: -1, fields: ['*'] }
      });

      const readAccess = (): RestCommand<any[], any[]> => () => ({
        path: '/access',
        method: 'GET',
        params: { limit: -1, fields: ['*'] }
      });

      const readPermissions = (): RestCommand<any[], any[]> => () => ({
        path: '/permissions',
        method: 'GET',
        params: { limit: -1, fields: ['*'] }
      });

      // Set token using custom method
      const clientWithToken = Object.assign(targetClient, {
        getToken: () => targetInstance.adminToken!
      });

      const targetRoles = await clientWithToken.request(readRoles());
      const targetPolicies = await clientWithToken.request(readPolicies());
      const targetAccess = await clientWithToken.request(readAccess());
      const targetPermissions = await clientWithToken.request(readPermissions());

      const targetConfig = {
        roles: targetRoles.filter((r: any) => !['Administrator', 'Public'].includes(r.name)),
        policies: targetPolicies.filter((p: any) => p.name !== 'Administrator'),
        access: targetAccess,
        permissions: targetPermissions
      };

      // Step 4: Compare configurations
      console.log('Comparing source and target configurations...');
      
      const comparisonResult = ConfigComparator.compareRoleManagerConfigs(exportedConfig, targetConfig);

      if (!comparisonResult.isEqual) {
        console.log('Configuration differences found:');
        comparisonResult.differences.forEach(diff => {
          console.log(`- ${diff.message}`);
          if (diff.type === 'different') {
            console.log(`  Source: ${JSON.stringify(diff.source)}`);
            console.log(`  Target: ${JSON.stringify(diff.target)}`);
          }
        });
      }

      expect(comparisonResult.isEqual).toBe(true);
      expect(comparisonResult.differences).toHaveLength(0);
    });

    test('should preserve user access permissions after import', async () => {
      // Export from source
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      runDCTCommand('export roles');

      // Import to target
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      runDCTCommand('import roles');

      // Create test users in target instance
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());

      // Get role IDs in target
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

      // Create vendor user in target
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

      // Verify vendor can access their own data
      console.log('Verifying vendor user access...');
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
    });

    test('should handle dry-run mode without making changes', async () => {
      // Export from source
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      runDCTCommand('export roles');

      // Get initial state of target
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

      // Import with dry-run
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      const dryRunOutput = runDCTCommand('import roles --dry-run');
      console.log('Dry run output:', dryRunOutput);

      // Verify no changes were made
      const afterRoles = await clientWithToken.request(readRoles());

      expect(afterRoles).toEqual(initialRoles);
      expect(dryRunOutput).toContain('dry-run');
    });

    test('should handle permission field arrays correctly', async () => {
      // This test verifies the specific issue from the debug guide
      // where users could only see their 'id' field
      
      setupDCTEnvironment(sourceInstance.apiUrl, sourceInstance.adminToken!, tempConfigPath);
      runDCTCommand('export roles');

      // Check exported permissions
      const fs = require('fs');
      const exportedPermissions = JSON.parse(fs.readFileSync(join(tempConfigPath, 'permissions.json'), 'utf8'));
      
      // Find the directus_users read permission for authenticated users
      const userReadPermission = exportedPermissions.find((p: any) => 
        p.collection === 'directus_users' && 
        p.action === 'read' &&
        p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
      );

      expect(userReadPermission).toBeDefined();
      expect(userReadPermission.fields).toContain('role');
      expect(userReadPermission.fields).toContain('role.name');
      expect(userReadPermission.fields).toContain('first_name');
      expect(userReadPermission.fields).toContain('last_name');
      expect(userReadPermission.fields).toContain('email');

      // Import and verify
      setupDCTEnvironment(targetInstance.apiUrl, targetInstance.adminToken!, tempConfigPath);
      runDCTCommand('import roles');

      // Check imported permissions
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());

      const readPermissions = (): RestCommand<any[], any[]> => () => ({
        path: '/permissions',
        method: 'GET',
        params: { limit: -1, fields: ['*'] }
      });

      const clientWithToken = Object.assign(targetClient, {
        getToken: () => targetInstance.adminToken!
      });

      const targetPermissions = await clientWithToken.request(readPermissions());

      const targetUserReadPerm = targetPermissions.find((p: any) => 
        p.collection === 'directus_users' && 
        p.action === 'read' &&
        p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
      );

      expect(targetUserReadPerm).toBeDefined();
      expect(targetUserReadPerm.fields).toContain('role');
      expect(targetUserReadPerm.fields).toContain('role.name');
      expect(targetUserReadPerm.fields.length).toBeGreaterThan(1);
    });
  });
});