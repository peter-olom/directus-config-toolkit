import { DockerTestManager } from '../utils/docker';
import { IsolatedDirectusManager, IsolatedDirectusInstance } from '../utils/directus-isolated';
import { setupDirectusTestData } from '../fixtures/directus-setup';
import { ConfigComparator } from '../utils/comparison';

describe('RoleManager Isolated Integration Tests', () => {
  let dockerManager: DockerTestManager;
  let directusManager: IsolatedDirectusManager;
  let sourceInstance: IsolatedDirectusInstance;
  let targetInstance: IsolatedDirectusInstance;

  beforeAll(async () => {
    console.log('Setting up isolated test infrastructure...');
    
    // Initialize Docker manager
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    
    directusManager = new IsolatedDirectusManager(dockerManager);
    
    // Pull the image first
    console.log('Pulling Directus image...');
    await dockerManager.pullImage('directus/directus:11.9.3');
  }, 120000);

  afterAll(async () => {
    console.log('Cleaning up test infrastructure...');
    
    // Clean up instances
    await directusManager.cleanupAll();
    
    // Clean up Docker resources
    await dockerManager.cleanup();
  });

  test('should export and import Role Manager configurations in isolation', async () => {
    // Step 1: Create source instance
    console.log('Creating source Directus instance...');
    sourceInstance = await directusManager.createDirectusInstance({
      name: 'source'
    });

    // Step 2: Set up test data using API calls inside container
    console.log('Setting up test data...');
    
    // Create roles
    await directusManager.apiRequest(sourceInstance.id, 'POST', '/roles', {
      name: 'VendorRole',
      icon: 'store',
      description: 'Role for vendors'
    });

    await directusManager.apiRequest(sourceInstance.id, 'POST', '/roles', {
      name: 'ConsumerRole',
      icon: 'person',
      description: 'Role for consumers'
    });

    // Create policies
    const authPolicy = await directusManager.apiRequest(sourceInstance.id, 'POST', '/policies', {
      name: 'Authenticated',
      icon: 'verified_user',
      description: 'Default policy for authenticated users',
      admin_access: false,
      app_access: true
    });

    // Get role IDs
    const roles = await directusManager.apiRequest(sourceInstance.id, 'GET', '/roles');
    const vendorRole = roles.data.find((r: any) => r.name === 'VendorRole');
    const consumerRole = roles.data.find((r: any) => r.name === 'ConsumerRole');

    // Create access mappings
    await directusManager.apiRequest(sourceInstance.id, 'POST', '/access', {
      role: vendorRole.id,
      policy: authPolicy.data.id
    });

    await directusManager.apiRequest(sourceInstance.id, 'POST', '/access', {
      role: consumerRole.id,
      policy: authPolicy.data.id
    });

    // Create permissions with multiple fields
    await directusManager.apiRequest(sourceInstance.id, 'POST', '/permissions', {
      collection: 'directus_users',
      action: 'read',
      permissions: {
        _and: [{
          id: { _eq: '$CURRENT_USER' }
        }]
      },
      fields: [
        'id',
        'first_name',
        'last_name',
        'email',
        'avatar',
        'role',
        'role.id',
        'role.name',
        'status'
      ],
      policy: authPolicy.data.id
    });

    // Step 3: Export configuration
    console.log('Exporting configuration from source...');
    await directusManager.exportConfig(sourceInstance.id, 'roles');

    // Step 4: Get exported config
    const exportedConfig = await directusManager.getExportedConfig(sourceInstance.id);
    console.log('Exported config:', JSON.stringify(exportedConfig, null, 2));

    // Verify export
    expect(exportedConfig.roles).toBeDefined();
    expect(exportedConfig.policies).toBeDefined();
    expect(exportedConfig.access).toBeDefined();
    expect(exportedConfig.permissions).toBeDefined();

    // Check permission fields
    const userReadPerm = exportedConfig.permissions.find((p: any) => 
      p.collection === 'directus_users' && 
      p.action === 'read'
    );
    
    expect(userReadPerm).toBeDefined();
    expect(userReadPerm.fields).toContain('first_name');
    expect(userReadPerm.fields).toContain('last_name');
    expect(userReadPerm.fields).toContain('email');
    expect(userReadPerm.fields.length).toBeGreaterThan(1);

    // Step 5: Create target instance
    console.log('Creating target Directus instance...');
    targetInstance = await directusManager.createDirectusInstance({
      name: 'target'
    });

    // Step 6: Copy config files
    console.log('Copying configuration files...');
    await directusManager.copyConfig(sourceInstance.id, targetInstance.id);

    // Step 7: Import configuration
    console.log('Importing configuration to target...');
    await directusManager.importConfig(targetInstance.id, 'roles');

    // Step 8: Verify import
    console.log('Verifying imported configuration...');
    
    // Get permissions from target
    const targetPerms = await directusManager.apiRequest(targetInstance.id, 'GET', '/permissions');
    const targetUserReadPerm = targetPerms.data.find((p: any) => 
      p.collection === 'directus_users' && 
      p.action === 'read' &&
      p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
    );

    expect(targetUserReadPerm).toBeDefined();
    expect(targetUserReadPerm.fields).toContain('first_name');
    expect(targetUserReadPerm.fields).toContain('last_name');
    expect(targetUserReadPerm.fields).toContain('email');
    
    console.log('✅ Permission fields preserved correctly!');

    // Step 9: Test user access
    console.log('Testing user access...');
    
    // Create a test user
    const targetRoles = await directusManager.apiRequest(targetInstance.id, 'GET', '/roles');
    const targetVendorRole = targetRoles.data.find((r: any) => r.name === 'VendorRole');

    await directusManager.apiRequest(targetInstance.id, 'POST', '/users', {
      email: 'vendor@test.local',
      password: 'vendor123456',
      first_name: 'Test',
      last_name: 'Vendor',
      role: targetVendorRole.id,
      status: 'active'
    });

    // Login as the vendor user and check accessible fields
    const loginCmd = `
      curl -s -X POST http://localhost:8055/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"vendor@test.local","password":"vendor123456"}' | jq -r .data.access_token
    `;
    
    const tokenOutput = await directusManager.executeInContainer(targetInstance.id, ['sh', '-c', loginCmd]);
    const vendorToken = tokenOutput.trim();

    // Get user data with vendor token
    const userDataCmd = `
      curl -s http://localhost:8055/users/me \
        -H "Authorization: Bearer ${vendorToken}" | jq .data
    `;
    
    const userDataOutput = await directusManager.executeInContainer(targetInstance.id, ['sh', '-c', userDataCmd]);
    const userData = JSON.parse(userDataOutput);

    console.log('User can access fields:', Object.keys(userData));
    
    expect(userData.email).toBe('vendor@test.local');
    expect(userData.first_name).toBe('Test');
    expect(userData.last_name).toBe('Vendor');
    expect(Object.keys(userData).length).toBeGreaterThan(1);
    
    console.log('✅ User access verified - can see multiple fields!');
  }, 180000);

  test('should handle dry-run without making changes', async () => {
    // Create instance
    const instance = await directusManager.createDirectusInstance({
      name: 'dry-run-test'
    });

    try {
      // Create minimal test data
      await directusManager.apiRequest(instance.id, 'POST', '/roles', {
        name: 'TestRole',
        icon: 'test'
      });

      // Export
      await directusManager.exportConfig(instance.id, 'roles');

      // Get initial state
      const initialRoles = await directusManager.apiRequest(instance.id, 'GET', '/roles');
      const initialCount = initialRoles.data.length;

      // Run import with dry-run
      const dryRunOutput = await directusManager.executeInContainer(instance.id, [
        'sh', '-c',
        'DCT_TOKEN=admin-token /directus/config/dct import roles --dry-run'
      ]);

      console.log('Dry-run output:', dryRunOutput);
      expect(dryRunOutput.toLowerCase()).toContain('dry');

      // Verify no changes
      const afterRoles = await directusManager.apiRequest(instance.id, 'GET', '/roles');
      expect(afterRoles.data.length).toBe(initialCount);

    } finally {
      await instance.cleanup();
    }
  }, 120000);
});