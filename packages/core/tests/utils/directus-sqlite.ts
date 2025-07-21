import { DockerTestManager, DockerContainerConfig } from './docker';
import { generateRandomPort, generateTestId, wait } from './helpers';
import { TEST_CONFIG } from './test-config';
import axios from 'axios';
import { createDirectus, rest, authentication } from '@directus/sdk';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export interface DirectusTestInstance {
  id: string;
  apiUrl: string;
  apiPort: string;
  adminToken?: string;
  cleanup: () => Promise<void>;
  dataPath: string;
}

export interface DirectusTestConfig {
  name?: string;
  adminEmail?: string;
  adminPassword?: string;
  key?: string;
  secret?: string;
}

export class DirectusSQLiteTestManager {
  private dockerManager: DockerTestManager;
  private instances: Map<string, DirectusTestInstance> = new Map();

  constructor(dockerManager: DockerTestManager) {
    this.dockerManager = dockerManager;
  }

  async createDirectusInstance(config: DirectusTestConfig = {}): Promise<DirectusTestInstance> {
    const instanceId = config.name || generateTestId();
    const apiPort = generateRandomPort();
    const apiName = `api-${instanceId}`;
    
    const adminEmail = config.adminEmail || TEST_CONFIG.DEFAULT_ADMIN_EMAIL;
    const adminPassword = config.adminPassword || TEST_CONFIG.DEFAULT_ADMIN_PASSWORD;
    const key = config.key || generateTestId();
    const secret = config.secret || generateTestId();

    // Create temporary directory for SQLite database
    const dataPath = await mkdtemp(join(tmpdir(), 'directus-test-'));

    // Create Directus container with SQLite
    const directusContainer = await this.dockerManager.createContainer({
      name: apiName,
      image: TEST_CONFIG.DIRECTUS_IMAGE,
      env: {
        KEY: key,
        SECRET: secret,
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
        DB_CLIENT: 'sqlite3',
        DB_FILENAME: '/directus/database/db.sqlite',
        WEBSOCKETS_ENABLED: 'false',
        CACHE_ENABLED: 'false',
        RATE_LIMITER_ENABLED: 'false',
        PUBLIC_URL: `http://localhost:${apiPort}`
      },
      ports: {
        '8055/tcp': apiPort
      },
      volumes: [
        `${dataPath}:/directus/database`
      ]
    });

    await this.dockerManager.startContainer(apiName);
    
    // Wait for Directus to be ready
    const apiUrl = `http://localhost:${apiPort}`;
    await this.waitForDirectus(apiUrl);

    // Get admin token
    const adminToken = await this.getAdminToken(apiUrl, adminEmail, adminPassword);

    const instance: DirectusTestInstance = {
      id: instanceId,
      apiUrl,
      apiPort,
      adminToken,
      dataPath,
      cleanup: async () => {
        await this.cleanup(instanceId);
      }
    };

    this.instances.set(instanceId, instance);
    return instance;
  }

  private async waitForDirectus(apiUrl: string, timeout: number = TEST_CONFIG.CONTAINER_STARTUP_TIMEOUT): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(`${apiUrl}/server/health`);
        if (response.status === 200) {
          // Give it a bit more time to fully initialize
          await wait(2000);
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await wait(1000);
    }
    
    throw new Error(`Directus at ${apiUrl} failed to become ready within ${timeout}ms`);
  }

  private async getAdminToken(apiUrl: string, email: string, password: string): Promise<string> {
    try {
      const client = createDirectus(apiUrl)
        .with(rest())
        .with(authentication());

      const result = await client.login({ email, password });
      
      if (!result.access_token) {
        throw new Error('No access token received');
      }
      
      return result.access_token;
    } catch (error) {
      console.error('Failed to get admin token:', error);
      throw error;
    }
  }

  async cleanup(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    // Remove temporary directory
    try {
      await rm(instance.dataPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove data directory ${instance.dataPath}:`, error);
    }

    // Containers are auto-removed by Docker due to AutoRemove flag
    this.instances.delete(instanceId);
  }

  async cleanupAll(): Promise<void> {
    for (const instanceId of this.instances.keys()) {
      await this.cleanup(instanceId);
    }
  }

  getInstance(instanceId: string): DirectusTestInstance | undefined {
    return this.instances.get(instanceId);
  }
}