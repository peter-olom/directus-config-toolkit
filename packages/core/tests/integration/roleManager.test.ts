import { DockerTestManager } from '../utils/docker';
import { DirectusTestManager, DirectusTestInstance } from '../utils/directus';
import { setupDirectusTestData, verifyUserAccess } from '../fixtures/directus-setup';
import { ConfigComparator } from '../utils/comparison';
import { RolesManager } from '../../src/roles';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { createDirectus, rest } from '@directus/sdk';

describe('RoleManager Integration Tests', () => {
  let dockerManager: DockerTestManager;
  let directusManager: DirectusTestManager;
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
    await dockerManager.pullImage('postgres:15-alpine');
    await dockerManager.pullImage('directus/directus:11.2.0');
    
    directusManager = new DirectusTestManager(dockerManager);
    
    // Create temporary config directory
    tempConfigPath = await mkdtemp(join(tmpdir(), 'dct-test-'));
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

  describe('Export and Import', () => {
    let sourceSetupResult: any;
    let exportedConfig: any;

    beforeEach(async () => {
      // Create source instance
      console.log('Creating source Directus instance...');
      sourceInstance = await directusManager.createDirectusInstance({
        name: 'source-instance'
      });

      // Set up test data
      console.log('Setting up test data in source instance...');
      sourceSetupResult = await setupDirectusTestData(sourceInstance);

      // Create target instance
      console.log('Creating target Directus instance...');
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

    test('should export and import Role Manager configurations successfully', async () => {
      // Step 1: Export from source instance
      console.log('Exporting configurations from source...');
      
      const sourceManager = new RolesManager({
        apiUrl: sourceInstance.apiUrl,
        apiToken: sourceInstance.adminToken!,
        configPath: tempConfigPath
      });

      await sourceManager.exportConfig();
      
      // Verify export files were created
      const exportedRoles = await sourceManager['readConfigFile']('roles.json');
      const exportedPolicies = await sourceManager['readConfigFile']('policies.json');
      const exportedAccess = await sourceManager['readConfigFile']('access.json');
      const exportedPermissions = await sourceManager['readConfigFile']('permissions.json');

      expect(exportedRoles).toBeDefined();
      expect(exportedPolicies).toBeDefined();
      expect(exportedAccess).toBeDefined();
      expect(exportedPermissions).toBeDefined();

      // Store for comparison
      exportedConfig = {
        roles: exportedRoles,
        policies: exportedPolicies,
        access: exportedAccess,
        permissions: exportedPermissions
      };

      // Step 2: Import to target instance
      console.log('Importing configurations to target...');
      
      const targetManager = new RolesManager({
        apiUrl: targetInstance.apiUrl,
        apiToken: targetInstance.adminToken!,
        configPath: tempConfigPath
      });

      await targetManager.importConfig();

      // Step 3: Fetch configurations from target instance
      console.log('Fetching configurations from target for comparison...');
      
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());
      targetClient.setToken(targetInstance.adminToken!);

      // Custom read functions
      const readRoles = () => ({
        path: '/roles',
        method: 'GET' as const,
        params: { limit: -1, fields: ['*'] }
      });

      const readPolicies = () => ({
        path: '/policies',
        method: 'GET' as const,
        params: { limit: -1, fields: ['*'] }
      });

      const readAccess = () => ({
        path: '/access',
        method: 'GET' as const,
        params: { limit: -1, fields: ['*'] }
      });

      const readPermissions = () => ({
        path: '/permissions',
        method: 'GET' as const,
        params: { limit: -1, fields: ['*'] }
      });

      const targetRoles = await targetClient.request(readRoles());
      const targetPolicies = await targetClient.request(readPolicies());
      const targetAccess = await targetClient.request(readAccess());
      const targetPermissions = await targetClient.request(readPermissions());

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
      const sourceManager = new RolesManager({
        apiUrl: sourceInstance.apiUrl,
        apiToken: sourceInstance.adminToken!,
        configPath: tempConfigPath
      });
      await sourceManager.exportConfig();

      // Import to target
      const targetManager = new RolesManager({
        apiUrl: targetInstance.apiUrl,
        apiToken: targetInstance.adminToken!,
        configPath: tempConfigPath
      });
      await targetManager.importConfig();

      // Create test users in target instance
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());
      targetClient.setToken(targetInstance.adminToken!);

      // Get role IDs in target
      const roleResponse = await targetClient.request({
        path: '/roles',
        method: 'GET' as const,
        params: { limit: -1, fields: ['id', 'name'] }
      });
      const roleMap = new Map(roleResponse.map((r: any) => [r.name, r.id]));

      // Create vendor user in target
      await targetClient.request(createUser({
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
      const sourceManager = new RolesManager({
        apiUrl: sourceInstance.apiUrl,
        apiToken: sourceInstance.adminToken!,
        configPath: tempConfigPath
      });
      await sourceManager.exportConfig();

      // Get initial state of target
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());
      targetClient.setToken(targetInstance.adminToken!);

      const initialRoles = await targetClient.request({
        path: '/roles',
        method: 'GET' as const,
        params: { limit: -1, fields: ['id', 'name'] }
      });

      // Import with dry-run
      const targetManager = new RolesManager({
        apiUrl: targetInstance.apiUrl,
        apiToken: targetInstance.adminToken!,
        configPath: tempConfigPath
      });

      const dryRunResult = await targetManager.importConfig(true);

      // Verify no changes were made
      const afterRoles = await targetClient.request({
        path: '/roles',
        method: 'GET' as const,
        params: { limit: -1, fields: ['id', 'name'] }
      });

      expect(afterRoles).toEqual(initialRoles);
      expect(dryRunResult).toBeDefined();
    });

    test('should handle permission field arrays correctly', async () => {
      // This test verifies the specific issue from the debug guide
      // where users could only see their 'id' field
      
      const sourceManager = new RolesManager({
        apiUrl: sourceInstance.apiUrl,
        apiToken: sourceInstance.adminToken!,
        configPath: tempConfigPath
      });
      await sourceManager.exportConfig();

      // Check exported permissions
      const exportedPermissions = await sourceManager['readConfigFile']('permissions.json');
      
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
      const targetManager = new RolesManager({
        apiUrl: targetInstance.apiUrl,
        apiToken: targetInstance.adminToken!,
        configPath: tempConfigPath
      });
      await targetManager.importConfig();

      // Check imported permissions
      const targetClient = createDirectus(targetInstance.apiUrl)
        .with(rest());
      targetClient.setToken(targetInstance.adminToken!);

      const targetPermissions = await targetClient.request({
        path: '/permissions',
        method: 'GET' as const,
        params: { limit: -1, fields: ['*'] }
      });

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

// Add this function at the module level for creating users
function createUser(userData: any) {
  return {
    path: '/users',
    method: 'POST' as const,
    body: userData
  };
}