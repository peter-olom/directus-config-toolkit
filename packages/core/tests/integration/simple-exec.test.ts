import { DockerExecManager } from '../utils/docker-exec';
import { join } from 'path';

describe('Simple DCT Integration Test', () => {
  let dockerManager: DockerExecManager;
  
  beforeAll(() => {
    dockerManager = new DockerExecManager();
  });
  
  afterAll(async () => {
    await dockerManager.cleanup();
  });
  
  test('should start container and run DCT', async () => {
    // Start container
    console.log('Starting container...');
    const container = await dockerManager.startDirectusContainer({
      name: 'dct-simple-test'
    });
    
    // Wait for healthy
    await dockerManager.waitForHealthy('dct-simple-test');
    
    // Get token
    const token = await dockerManager.getAdminToken('dct-simple-test');
    console.log('Token length:', token.length);
    
    // Create a simple role using the API
    const createRoleResult = await dockerManager.execInContainer('dct-simple-test', [
      'node', '-e', `
        const http = require('http');
        const data = JSON.stringify({
          name: 'TestRole',
          icon: 'supervised_user_circle',
          description: 'Test role'
        });
        
        const req = http.request({
          hostname: 'localhost',
          port: 8055,
          path: '/roles',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${token}',
            'Content-Length': Buffer.byteLength(data)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            console.log(JSON.stringify({status: res.statusCode, body: JSON.parse(body)}));
          });
        });
        
        req.on('error', e => console.error(e));
        req.write(data);
        req.end();
      `
    ]);
    
    console.log('Create role result:', createRoleResult);
    
    // Verify role was created
    const getRolesResult = await dockerManager.execInContainer('dct-simple-test', [
      'node', '-e', `
        http.get({
          hostname: 'localhost',
          port: 8055,
          path: '/roles',
          headers: {
            'Authorization': 'Bearer ${token}'
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const roles = JSON.parse(body).data;
            const testRole = roles.find(r => r.name === 'TestRole');
            console.log(testRole ? 'Role found!' : 'Role not found');
          });
        });
      `
    ]);
    
    expect(getRolesResult).toContain('Role found!');
    
    // Install DCT
    console.log('Installing DCT...');
    const dctPath = join(__dirname, '../..');
    await dockerManager.installDCT('dct-simple-test', dctPath);
    
    // Test DCT command
    const dctTestResult = await dockerManager.execInContainer('dct-simple-test', [
      'sh', '-c', `DCT_TOKEN=${token} dct --help`
    ]);
    
    console.log('DCT help output:', dctTestResult.substring(0, 200));
    expect(dctTestResult).toContain('Usage:');
    
    // Export roles
    console.log('Exporting roles...');
    const exportResult = await dockerManager.execInContainer('dct-simple-test', [
      'sh', '-c', `DCT_TOKEN=${token} dct export roles`
    ]);
    
    console.log('Export result:', exportResult);
    
    // Check exported files
    const lsResult = await dockerManager.execInContainer('dct-simple-test', [
      'ls', '-la', '/directus/config/'
    ]);
    
    console.log('Config directory:', lsResult);
    expect(lsResult).toContain('roles.json');
    
    // Check roles.json content
    const rolesContent = await dockerManager.execInContainer('dct-simple-test', [
      'cat', '/directus/config/roles.json'
    ]);
    
    const roles = JSON.parse(rolesContent);
    const exportedTestRole = roles.find((r: any) => r.name === 'TestRole');
    expect(exportedTestRole).toBeDefined();
    expect(exportedTestRole.description).toBe('Test role');
    
    console.log('✅ Test completed successfully!');
  }, 120000);
});