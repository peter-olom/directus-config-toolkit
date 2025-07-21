import Docker = require('dockerode');
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Basic Container Test', () => {
  const docker = new Docker();
  let container: Docker.Container | null = null;
  let dataPath: string;

  afterAll(async () => {
    // Cleanup
    if (container) {
      try {
        await container.stop({ t: 5 });
        await container.remove({ force: true });
      } catch (e) {
        // Ignore errors
      }
    }
    
    if (dataPath) {
      await rm(dataPath, { recursive: true, force: true });
    }
  });

  test('should create and start a basic Directus container', async () => {
    // Create temp directory
    dataPath = await mkdtemp(join(tmpdir(), 'dct-test-'));
    
    // Create container with minimal config
    const containerName = `dct-test-${Date.now()}`;
    console.log(`Creating container: ${containerName}`);
    
    container = await docker.createContainer({
      name: containerName,
      Image: 'directus/directus:11.9.3',
      Env: [
        'KEY=test-key',
        'SECRET=test-secret',
        'ADMIN_EMAIL=admin@test.local',
        'ADMIN_PASSWORD=admin123456',
        'DB_CLIENT=sqlite3',
        'DB_FILENAME=/directus/database/db.sqlite',
        'WEBSOCKETS_ENABLED=false',
        'CACHE_ENABLED=false'
      ],
      HostConfig: {
        Binds: [`${dataPath}:/directus/database`],
        AutoRemove: false
      }
    });

    console.log('Starting container...');
    await container.start();
    
    // Wait a bit for container to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if container is running
    const info = await container.inspect();
    expect(info.State.Running).toBe(true);
    console.log('Container is running!');
    
    // Try to execute a simple command
    const exec = await container.exec({
      Cmd: ['echo', 'Hello from container'],
      AttachStdout: true
    });
    
    const stream = await exec.start({ hijack: true, stdin: false });
    const output = await new Promise<string>((resolve) => {
      let data = '';
      stream.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      stream.on('end', () => resolve(data));
    });
    
    console.log('Exec output:', output);
    expect(output).toContain('Hello from container');
    
    // Check Directus health after waiting longer
    console.log('Waiting for Directus to be ready...');
    let isReady = false;
    
    for (let i = 0; i < 30; i++) {
      try {
        const healthExec = await container.exec({
          Cmd: ['curl', '-s', 'http://localhost:8055/server/health'],
          AttachStdout: true,
          AttachStderr: true
        });
        
        const healthStream = await healthExec.start({ hijack: true, stdin: false });
        const healthOutput = await new Promise<string>((resolve) => {
          let data = '';
          healthStream.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          healthStream.on('end', () => resolve(data));
        });
        
        if (healthOutput.includes('"status":"ok"')) {
          isReady = true;
          console.log('Directus is ready!');
          break;
        }
      } catch (e) {
        // Not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    expect(isReady).toBe(true);
  }, 120000);
});