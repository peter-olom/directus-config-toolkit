import { DockerTestManager, DockerContainerConfig } from './docker';
import { generateRandomPort, generateTestId, wait } from './helpers';
import axios, { AxiosInstance } from 'axios';
import { createDirectus, rest, authentication, readMe } from '@directus/sdk';

export interface DirectusTestInstance {
  id: string;
  apiUrl: string;
  apiPort: string;
  dbPort: string;
  adminToken?: string;
  cleanup: () => Promise<void>;
}

export interface DirectusTestConfig {
  name?: string;
  adminEmail?: string;
  adminPassword?: string;
  dbPassword?: string;
  key?: string;
  secret?: string;
  extensions?: string[];
}

export class DirectusTestManager {
  private dockerManager: DockerTestManager;
  private instances: Map<string, DirectusTestInstance> = new Map();

  constructor(dockerManager: DockerTestManager) {
    this.dockerManager = dockerManager;
  }

  async createDirectusInstance(config: DirectusTestConfig = {}): Promise<DirectusTestInstance> {
    const instanceId = config.name || generateTestId();
    const apiPort = generateRandomPort();
    const dbPort = generateRandomPort();
    
    const dbName = `db-${instanceId}`;
    const apiName = `api-${instanceId}`;
    
    const adminEmail = config.adminEmail || 'admin@test.local';
    const adminPassword = config.adminPassword || 'admin123456';
    const dbPassword = config.dbPassword || 'postgres123456';
    const key = config.key || generateTestId();
    const secret = config.secret || generateTestId();

    // Create PostgreSQL container
    const pgContainer = await this.dockerManager.createContainer({
      name: dbName,
      image: 'postgres:15-alpine',
      env: {
        POSTGRES_USER: 'directus',
        POSTGRES_PASSWORD: dbPassword,
        POSTGRES_DB: 'directus'
      },
      ports: {
        '5432/tcp': dbPort
      },
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U directus'],
        interval: 5,
        timeout: 5,
        retries: 5
      }
    });

    await this.dockerManager.startContainer(dbName);
    await this.dockerManager.waitForContainer(dbName);

    // Create Directus container
    const directusContainer = await this.dockerManager.createContainer({
      name: apiName,
      image: 'directus/directus:11.2.0',
      env: {
        KEY: key,
        SECRET: secret,
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
        DB_CLIENT: 'pg',
        DB_HOST: dbName,
        DB_PORT: '5432',
        DB_DATABASE: 'directus',
        DB_USER: 'directus',
        DB_PASSWORD: dbPassword,
        WEBSOCKETS_ENABLED: 'false',
        CACHE_ENABLED: 'false',
        RATE_LIMITER_ENABLED: 'false',
        PUBLIC_URL: `http://localhost:${apiPort}`
      },
      ports: {
        '8055/tcp': apiPort
      }
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
      dbPort,
      adminToken,
      cleanup: async () => {
        await this.cleanup(instanceId);
      }
    };

    this.instances.set(instanceId, instance);
    return instance;
  }

  private async waitForDirectus(apiUrl: string, timeout: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(`${apiUrl}/server/health`);
        if (response.status === 200) {
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

  async executeQuery(instanceId: string, query: string): Promise<any> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Execute query via Directus API
    const response = await axios.post(
      `${instance.apiUrl}/utils/run-sql`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${instance.adminToken}`
        }
      }
    );

    return response.data;
  }
}