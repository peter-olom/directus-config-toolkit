import { DockerTestManager } from '../utils/docker';
import { DirectusSQLiteTestManager, DirectusTestInstance } from '../utils/directus-sqlite';

describe('Directus Startup Test', () => {
  let dockerManager: DockerTestManager;
  let directusManager: DirectusSQLiteTestManager;
  let instance: DirectusTestInstance;

  beforeAll(async () => {
    console.log('Initializing Docker manager...');
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    
    directusManager = new DirectusSQLiteTestManager(dockerManager);
  });

  afterAll(async () => {
    console.log('Cleaning up...');
    if (instance) {
      await instance.cleanup();
    }
    await dockerManager.cleanup();
  });

  test('should start Directus with SQLite', async () => {
    console.log('Creating Directus instance...');
    
    try {
      instance = await directusManager.createDirectusInstance({
        name: 'test-startup'
      });
      
      console.log(`✅ Directus started successfully at ${instance.apiUrl}`);
      console.log(`   Admin token: ${instance.adminToken?.substring(0, 10)}...`);
      
      expect(instance.apiUrl).toBeDefined();
      expect(instance.adminToken).toBeDefined();
      
      // Try to make a simple API call
      const { createDirectus, rest } = require('@directus/sdk');
      const client = createDirectus(instance.apiUrl).with(rest());
      
      const serverInfo = await client.request(() => ({
        path: '/server/info',
        method: 'GET'
      }));
      
      console.log('Server info:', JSON.stringify(serverInfo, null, 2));
      expect(serverInfo).toBeDefined();
      
    } catch (error) {
      console.error('Failed to start Directus:', error);
      
      // Try to get container logs
      try {
        const logs = await dockerManager.getContainerLogs('api-test-startup');
        console.log('Container logs:', logs);
      } catch (logError) {
        console.error('Could not get container logs:', logError);
      }
      
      throw error;
    }
  });
});