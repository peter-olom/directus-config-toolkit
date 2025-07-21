import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

async function runTest() {
  const containerName = `dct-final-test-${Date.now()}`;
  
  try {
    console.log('1. Starting Directus container...');
    const { stdout: containerId } = await execAsync(`
      docker run -d \
        --name ${containerName} \
        -e KEY=test-key-${Date.now()} \
        -e SECRET=test-secret-${Date.now()} \
        -e ADMIN_EMAIL=admin@example.com \
        -e ADMIN_PASSWORD=d1r3ctu5 \
        -e DB_CLIENT=sqlite3 \
        -e DB_FILENAME=/tmp/database.db \
        -e WEBSOCKETS_ENABLED=false \
        -e TELEMETRY_ENABLED=false \
        directus/directus:11.9.3
    `);
    
    console.log('Container ID:', containerId.trim());
    
    console.log('2. Waiting for Directus to be ready...');
    let isReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const { stdout } = await execAsync(`docker exec ${containerName} node -p "require('http').get('http://localhost:8055/server/health', r => {let d=''; r.on('data',c=>d+=c); r.on('end',()=>console.log(d.includes('ok')))}).on('error',()=>console.log(false))"`);
        
        if (stdout.includes('true')) {
          isReady = true;
          break;
        }
      } catch (e) {
        // Not ready
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!isReady) {
      throw new Error('Directus did not become ready');
    }
    
    console.log('✅ Directus is ready!');
    
    console.log('3. Getting admin token...');
    const { stdout: tokenResult } = await execAsync(`
      docker exec ${containerName} node -p "
        const http = require('http');
        const data = JSON.stringify({email:'admin@example.com',password:'d1r3ctu5'});
        http.request({
          hostname: 'localhost',
          port: 8055,
          path: '/auth/login',
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Content-Length': data.length}
        }, res => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => console.log(JSON.parse(body).data.access_token));
        }).end(data);
      "
    `);
    
    const token = tokenResult.trim().split('\n').pop() || '';
    console.log('Token obtained:', token.substring(0, 20) + '...');
    
    console.log('4. Creating test role...');
    await execAsync(`
      docker exec ${containerName} node -p "
        const http = require('http');
        const data = JSON.stringify({name:'TestRole',icon:'group',description:'Test role for DCT'});
        const req = http.request({
          hostname: 'localhost',
          port: 8055,
          path: '/roles',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${token}',
            'Content-Length': data.length
          }
        }, res => {
          res.on('data', () => {});
          res.on('end', () => console.log('Created'));
        });
        req.end(data);
      "
    `);
    
    console.log('5. Installing DCT...');
    const dctPath = join(__dirname, '../../dist');
    await execAsync(`docker cp ${dctPath} ${containerName}:/directus/dct`);
    
    console.log('6. Running DCT export...');
    const { stdout: exportResult } = await execAsync(`
      docker exec ${containerName} sh -c "
        export DCT_API_URL=http://localhost:8055
        export DCT_TOKEN=${token}
        export DCT_CONFIG_PATH=/directus/config
        node /directus/dct/cli.js export roles
      "
    `);
    
    console.log('Export output:', exportResult);
    
    console.log('7. Checking exported files...');
    const { stdout: files } = await execAsync(`docker exec ${containerName} ls -la /directus/config/`);
    console.log('Files:', files);
    
    console.log('8. Verifying roles.json...');
    const { stdout: rolesJson } = await execAsync(`docker exec ${containerName} cat /directus/config/roles.json`);
    const roles = JSON.parse(rolesJson);
    const testRole = roles.find((r: any) => r.name === 'TestRole');
    
    if (testRole) {
      console.log('✅ Test role found in export!');
      console.log('Role:', testRole);
    } else {
      throw new Error('Test role not found in export');
    }
    
    console.log('\n✅ All tests passed!');
    
  } finally {
    console.log('Cleaning up...');
    await execAsync(`docker rm -f ${containerName}`).catch(() => {});
  }
}

// Run the test
runTest().catch(console.error);