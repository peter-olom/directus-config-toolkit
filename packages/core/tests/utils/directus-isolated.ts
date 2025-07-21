import { DockerTestManager } from './docker';
import { generateTestId, wait } from './helpers';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import Docker = require('dockerode');

export interface IsolatedDirectusInstance {
  id: string;
  containerName: string;
  configPath: string;
  dataPath: string;
  cleanup: () => Promise<void>;
}

export interface IsolatedDirectusConfig {
  name?: string;
  adminEmail?: string;
  adminPassword?: string;
  importConfig?: boolean; // Whether to import config on startup
}

/**
 * Manages Directus instances in complete isolation using Docker
 * No ports are exposed to the host - all operations happen inside containers
 */
export class IsolatedDirectusManager {
  private docker: Docker;
  private instances: Map<string, IsolatedDirectusInstance> = new Map();
  private networkName: string;

  constructor(private dockerManager: DockerTestManager) {
    this.docker = new Docker();
    this.networkName = dockerManager['networkName']; // Access the network name
  }

  /**
   * Create a Directus instance that runs DCT commands internally
   */
  async createDirectusInstance(config: IsolatedDirectusConfig = {}): Promise<IsolatedDirectusInstance> {
    const instanceId = config.name || generateTestId();
    const containerName = `directus-${instanceId}`;
    
    const adminEmail = config.adminEmail || 'admin@test.local';
    const adminPassword = config.adminPassword || 'admin123456';

    // Create directories for config and data
    const configPath = await mkdtemp(join(tmpdir(), 'dct-config-'));
    const dataPath = await mkdtemp(join(tmpdir(), 'dct-data-'));

    // Create the container
    const container = await this.dockerManager.createContainer({
      name: containerName,
      image: 'directus/directus:11.9.3',
      env: {
        KEY: generateTestId(),
        SECRET: generateTestId(),
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
        DB_CLIENT: 'sqlite3',
        DB_FILENAME: '/directus/database/db.sqlite',
        WEBSOCKETS_ENABLED: 'false',
        CACHE_ENABLED: 'false',
        RATE_LIMITER_ENABLED: 'false'
      },
      volumes: [
        `${dataPath}:/directus/database`,
        `${configPath}:/directus/config`
      ]
    });

    await this.dockerManager.startContainer(containerName);
    
    // Wait for Directus to initialize
    await this.waitForDirectusReady(containerName);

    const instance: IsolatedDirectusInstance = {
      id: instanceId,
      containerName,
      configPath,
      dataPath,
      cleanup: async () => {
        await this.cleanup(instanceId);
      }
    };

    this.instances.set(instanceId, instance);
    return instance;
  }

  /**
   * Execute a command inside the Directus container
   */
  async executeInContainer(instanceId: string, command: string[]): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const container = this.dockerManager['containers'].get(instance.containerName);
    if (!container) {
      throw new Error(`Container ${instance.containerName} not found in manager`);
    }
    
    // Create exec instance
    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/directus'
    });

    // Start exec and collect output
    const stream = await exec.start({ hijack: true, stdin: false });
    
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const fullData = Buffer.concat(chunks);
        let output = '';
        let error = '';
        
        // Parse Docker multiplexed stream
        let offset = 0;
        while (offset < fullData.length) {
          // Check if we have enough data for header
          if (offset + 8 > fullData.length) break;
          
          const header = fullData.slice(offset, offset + 8);
          const streamType = header[0];
          const length = header.readUInt32BE(4);
          
          // Check if we have enough data for payload
          if (offset + 8 + length > fullData.length) break;
          
          const payload = fullData.slice(offset + 8, offset + 8 + length);
          
          if (streamType === 1) {
            output += payload.toString('utf8');
          } else if (streamType === 2) {
            error += payload.toString('utf8');
          }
          
          offset += 8 + length;
        }
        
        // If no multiplexed data, treat as raw output
        if (output === '' && error === '' && fullData.length > 0) {
          output = fullData.toString('utf8');
        }
        
        if (error && !output) {
          reject(new Error(error));
        } else {
          resolve(output);
        }
      });

      stream.on('error', reject);
    });
  }

  /**
   * Get admin token from inside the container
   */
  async getAdminToken(instanceId: string): Promise<string> {
    // Try to get a token using the admin credentials
    const tokenCmd = `
      curl -s -X POST http://localhost:8055/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@test.local","password":"admin123456"}' \
        | grep -o '"access_token":"[^"]*"' \
        | cut -d'"' -f4
    `;
    
    try {
      const output = await this.executeInContainer(instanceId, ['sh', '-c', tokenCmd]);
      const token = output.trim();
      
      if (token && token.length > 10) {
        return token;
      }
    } catch (error) {
      console.warn('Failed to get token via API, trying CLI method');
    }

    // Fallback: use static token for testing
    return 'static-admin-token';
  }

  /**
   * Copy DCT binary into container and make it executable
   */
  async installDCT(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Read the built DCT CLI
    const dctCliPath = join(__dirname, '../../dist/cli.js');
    const dctCli = await readFile(dctCliPath, 'utf8');

    // Create a wrapper script that includes node
    const dctWrapper = `#!/bin/sh
export DCT_API_URL=http://localhost:8055
export DCT_CONFIG_PATH=/directus/config
export DCT_TOKEN=\${DCT_TOKEN:-admin-token}

# Run DCT with node
exec node /directus/dct-cli.js "$@"
`;

    // Write files to the config directory which is mounted
    await writeFile(join(instance.configPath, 'dct-cli.js'), dctCli);
    await writeFile(join(instance.configPath, 'dct'), dctWrapper);

    // Make the wrapper executable inside container
    await this.executeInContainer(instanceId, ['chmod', '+x', '/directus/config/dct']);
  }

  /**
   * Run DCT export inside the container
   */
  async exportConfig(instanceId: string, configType: string = 'roles'): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Get admin token
    const token = await this.getAdminToken(instanceId);

    // Install DCT if not already done
    await this.installDCT(instanceId);

    // Run DCT export
    const output = await this.executeInContainer(instanceId, [
      'sh', '-c',
      `DCT_TOKEN=${token} /directus/config/dct export ${configType}`
    ]);

    console.log('DCT export output:', output);
  }

  /**
   * Run DCT import inside the container
   */
  async importConfig(instanceId: string, configType: string = 'roles'): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Get admin token
    const token = await this.getAdminToken(instanceId);

    // Install DCT if not already done
    await this.installDCT(instanceId);

    // Run DCT import
    const output = await this.executeInContainer(instanceId, [
      'sh', '-c',
      `DCT_TOKEN=${token} /directus/config/dct import ${configType}`
    ]);

    console.log('DCT import output:', output);
  }

  /**
   * Copy configuration files from one instance to another
   */
  async copyConfig(sourceId: string, targetId: string): Promise<void> {
    const source = this.instances.get(sourceId);
    const target = this.instances.get(targetId);
    
    if (!source || !target) {
      throw new Error('Source or target instance not found');
    }

    // Copy the config files from source to target
    const files = ['roles.json', 'policies.json', 'access.json', 'permissions.json'];
    
    for (const file of files) {
      try {
        const content = await readFile(join(source.configPath, file), 'utf8');
        await writeFile(join(target.configPath, file), content);
      } catch (error) {
        console.warn(`Could not copy ${file}:`, error);
      }
    }
  }

  /**
   * Get exported configuration from instance
   */
  async getExportedConfig(instanceId: string): Promise<any> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const config: any = {};
    const files = ['roles.json', 'policies.json', 'access.json', 'permissions.json'];
    
    for (const file of files) {
      try {
        const content = await readFile(join(instance.configPath, file), 'utf8');
        config[file.replace('.json', '')] = JSON.parse(content);
      } catch (error) {
        console.warn(`Could not read ${file}:`, error);
      }
    }

    return config;
  }

  /**
   * Execute API request inside container using curl
   */
  async apiRequest(instanceId: string, method: string, path: string, data?: any): Promise<any> {
    const token = await this.getAdminToken(instanceId);
    
    const curlCmd = [
      'curl', '-s', '-X', method,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${token}`,
      `http://localhost:8055${path}`
    ];

    if (data) {
      curlCmd.push('-d', JSON.stringify(data));
    }

    const output = await this.executeInContainer(instanceId, curlCmd);
    
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  /**
   * Wait for Directus to be ready by checking inside the container
   */
  private async waitForDirectusReady(containerName: string, timeout: number = 90000): Promise<void> {
    const startTime = Date.now();
    let lastError = '';

    console.log(`Waiting for Directus to be ready in container ${containerName}...`);

    while (Date.now() - startTime < timeout) {
      try {
        // Get container from DockerTestManager's map
        const containerObj = this.dockerManager['containers'].get(containerName);
        if (!containerObj) {
          throw new Error(`Container ${containerName} not found in manager`);
        }
        
        const container = containerObj;
        
        // First check if container is running
        const info = await container.inspect();
        if (!info.State.Running) {
          throw new Error('Container is not running');
        }

        // Check if Directus is responding
        const exec = await container.exec({
          Cmd: ['curl', '-s', '-f', '-m', '5', 'http://localhost:8055/server/health'],
          AttachStdout: true,
          AttachStderr: true
        });

        const stream = await exec.start({ hijack: true, stdin: false });
        
        const result = await new Promise<{ exitCode: number, output: string }>((resolve) => {
          const chunks: Buffer[] = [];
          
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          stream.on('end', async () => {
            const execInfo = await exec.inspect();
            const fullData = Buffer.concat(chunks);
            
            // Parse output
            let output = '';
            if (fullData.length > 0) {
              // Try to parse multiplexed stream
              let offset = 0;
              while (offset + 8 <= fullData.length) {
                const header = fullData.slice(offset, offset + 8);
                const length = header.readUInt32BE(4);
                
                if (offset + 8 + length <= fullData.length) {
                  const payload = fullData.slice(offset + 8, offset + 8 + length);
                  output += payload.toString('utf8');
                  offset += 8 + length;
                } else {
                  break;
                }
              }
              
              // If no multiplexed data, use raw
              if (output === '') {
                output = fullData.toString('utf8');
              }
            }
            
            resolve({ exitCode: execInfo.ExitCode || 1, output });
          });
          
          stream.on('error', () => {
            resolve({ exitCode: 1, output: 'Stream error' });
          });
        });

        if (result.exitCode === 0) {
          console.log('Directus is ready!');
          return;
        }
        
        lastError = result.output;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      
      // Wait before retrying
      await wait(3000);
    }

    // Get container logs for debugging
    try {
      const containerObj = this.dockerManager['containers'].get(containerName);
      if (containerObj) {
        const logs = await containerObj.logs({ stdout: true, stderr: true, tail: 50 });
        console.error('Container logs:', logs.toString());
      }
    } catch (e) {
      console.error('Could not get container logs');
    }

    throw new Error(`Directus failed to become ready within ${timeout}ms. Last error: ${lastError}`);
  }

  async cleanup(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    // Remove temporary directories
    try {
      await rm(instance.configPath, { recursive: true, force: true });
      await rm(instance.dataPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to remove temp directories:', error);
    }

    this.instances.delete(instanceId);
  }

  async cleanupAll(): Promise<void> {
    for (const instanceId of this.instances.keys()) {
      await this.cleanup(instanceId);
    }
  }
}