import { DockerTestManager } from '../utils/docker';
import { IsolatedDirectusManager } from '../utils/directus-isolated';

describe('Simple Isolated Container Test', () => {
  let dockerManager: DockerTestManager;
  let directusManager: IsolatedDirectusManager;

  beforeAll(async () => {
    console.log('Setting up Docker infrastructure...');
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    directusManager = new IsolatedDirectusManager(dockerManager);
  }, 30000);

  afterAll(async () => {
    console.log('Cleaning up...');
    await directusManager.cleanupAll();
    await dockerManager.cleanup();
  });

  test('should create and communicate with isolated container', async () => {
    console.log('Creating Directus instance...');
    const instance = await directusManager.createDirectusInstance({
      name: 'simple-test'
    });

    console.log('Testing command execution...');
    const output = await directusManager.executeInContainer(instance.id, [
      'echo', 'Hello from container'
    ]);
    
    expect(output.trim()).toBe('Hello from container');
    
    console.log('Testing Directus health...');
    const healthOutput = await directusManager.executeInContainer(instance.id, [
      'curl', '-s', 'http://localhost:8055/server/health'
    ]);
    
    const health = JSON.parse(healthOutput);
    expect(health.status).toBe('ok');
    
    console.log('✅ Basic container test passed!');
  }, 120000);
});