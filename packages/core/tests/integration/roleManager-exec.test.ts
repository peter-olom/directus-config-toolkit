import { DockerExecManager, DirectusContainer } from '../utils/docker-exec';
import { join } from 'path';

describe('RoleManager Exec Integration Tests', () => {
  let dockerManager: DockerExecManager;
  let sourceContainer: DirectusContainer;
  let targetContainer: DirectusContainer;
  
  beforeAll(async () => {
    dockerManager = new DockerExecManager();
  }, 30000);
  
  afterAll(async () => {
    await dockerManager.cleanup();
  });
  
  test('should export and import role configurations', async () => {
    // Step 1: Start source container
    console.log('Starting source container...');
    sourceContainer = await dockerManager.startDirectusContainer({
      name: 'dct-source'
    });
    
    // Step 2: Wait for it to be healthy
    await dockerManager.waitForHealthy('dct-source');
    
    // Step 3: Get admin token
    const sourceToken = await dockerManager.getAdminToken('dct-source');
    console.log('Got admin token');
    
    // Step 4: Create test data via API
    console.log('Creating test data...');
    
    // Create role using node
    const createRoleCmd = `node -e "
      const http = require('http');
      const data = JSON.stringify({
        name: 'VendorRole',
        icon: 'store',
        description: 'Role for vendors'
      });
      const options = {
        hostname: 'localhost',
        port: 8055,
        path: '/roles',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${sourceToken}',
          'Content-Length': data.length
        }
      };
      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => console.log(body));
      });
      req.write(data);
      req.end();
    "`;
    
    await dockerManager.execInContainer('dct-source', ['sh', '-c', createRoleCmd]);
    
    // Create policy
    const policyResponse = await dockerManager.execInContainer('dct-source', [
      'curl', '-s', '-X', 'POST',
      'http://localhost:8055/policies',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${sourceToken}`,
      '-d', JSON.stringify({
        name: 'Authenticated',
        icon: 'verified_user',
        description: 'Default policy for authenticated users',
        admin_access: false,
        app_access: true
      })
    ]);
    
    const policyData = JSON.parse(policyResponse);
    const policyId = policyData.data.id;
    
    // Get role ID
    const rolesResponse = await dockerManager.execInContainer('dct-source', [
      'curl', '-s',
      'http://localhost:8055/roles',
      '-H', `Authorization: Bearer ${sourceToken}`
    ]);
    
    const rolesData = JSON.parse(rolesResponse);
    const vendorRole = rolesData.data.find((r: any) => r.name === 'VendorRole');
    
    // Create access mapping
    await dockerManager.execInContainer('dct-source', [
      'curl', '-s', '-X', 'POST',
      'http://localhost:8055/access',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${sourceToken}`,
      '-d', JSON.stringify({
        role: vendorRole.id,
        policy: policyId
      })
    ]);
    
    // Create permission with multiple fields
    await dockerManager.execInContainer('dct-source', [
      'curl', '-s', '-X', 'POST',
      'http://localhost:8055/permissions',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${sourceToken}`,
      '-d', JSON.stringify({
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
          'status'
        ],
        policy: policyId
      })
    ]);
    
    // Step 5: Install DCT
    console.log('Installing DCT...');
    const dctPath = join(__dirname, '../..');
    await dockerManager.installDCT('dct-source', dctPath);
    
    // Step 6: Export configuration
    console.log('Exporting configuration...');
    await dockerManager.execInContainer('dct-source', [
      'sh', '-c',
      `DCT_TOKEN=${sourceToken} dct export roles`
    ]);
    
    // Verify export
    const exportedFiles = await dockerManager.execInContainer('dct-source', [
      'ls', '-la', '/directus/config/'
    ]);
    console.log('Exported files:', exportedFiles);
    
    // Check permissions export
    const permissionsContent = await dockerManager.execInContainer('dct-source', [
      'cat', '/directus/config/permissions.json'
    ]);
    const permissions = JSON.parse(permissionsContent);
    
    const userReadPerm = permissions.find((p: any) => 
      p.collection === 'directus_users' && 
      p.action === 'read'
    );
    
    expect(userReadPerm).toBeDefined();
    expect(userReadPerm.fields).toContain('first_name');
    expect(userReadPerm.fields).toContain('last_name');
    expect(userReadPerm.fields).toContain('email');
    
    console.log('✅ Export verified - permissions contain multiple fields');
    
    // Step 7: Start target container
    console.log('Starting target container...');
    targetContainer = await dockerManager.startDirectusContainer({
      name: 'dct-target'
    });
    
    await dockerManager.waitForHealthy('dct-target');
    const targetToken = await dockerManager.getAdminToken('dct-target');
    
    // Step 8: Copy config files
    console.log('Copying configuration files...');
    await dockerManager.execInContainer('dct-source', [
      'sh', '-c',
      'cd /directus/config && tar cf - *.json'
    ]).then(tarData => {
      return dockerManager.execInContainer('dct-target', [
        'sh', '-c',
        `cd /directus/config && echo '${Buffer.from(tarData).toString('base64')}' | base64 -d | tar xf -`
      ]);
    }).catch(() => {
      // Fallback: copy files one by one
      console.log('Using fallback copy method...');
      const files = ['roles.json', 'policies.json', 'access.json', 'permissions.json'];
      return Promise.all(files.map(async file => {
        const content = await dockerManager.execInContainer('dct-source', ['cat', `/directus/config/${file}`]);
        await dockerManager.execInContainer('dct-target', [
          'sh', '-c',
          `echo '${content.replace(/'/g, "'\\''")}' > /directus/config/${file}`
        ]);
      }));
    });
    
    // Step 9: Install DCT on target
    await dockerManager.installDCT('dct-target', dctPath);
    
    // Step 10: Import configuration
    console.log('Importing configuration...');
    await dockerManager.execInContainer('dct-target', [
      'sh', '-c',
      `DCT_TOKEN=${targetToken} dct import roles`
    ]);
    
    // Step 11: Verify import
    console.log('Verifying import...');
    const targetPermsResponse = await dockerManager.execInContainer('dct-target', [
      'curl', '-s',
      'http://localhost:8055/permissions',
      '-H', `Authorization: Bearer ${targetToken}`
    ]);
    
    const targetPerms = JSON.parse(targetPermsResponse);
    const targetUserReadPerm = targetPerms.data.find((p: any) => 
      p.collection === 'directus_users' && 
      p.action === 'read' &&
      p.permissions?._and?.[0]?.id?._eq === '$CURRENT_USER'
    );
    
    expect(targetUserReadPerm).toBeDefined();
    expect(targetUserReadPerm.fields).toContain('first_name');
    expect(targetUserReadPerm.fields).toContain('last_name');
    expect(targetUserReadPerm.fields).toContain('email');
    
    console.log('✅ Import verified - permissions preserved correctly!');
  }, 180000);
});