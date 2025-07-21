import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export interface DirectusContainerConfig {
  name?: string;
  port?: number;
  adminEmail?: string;
  adminPassword?: string;
}

export interface DirectusContainer {
  id: string;
  name: string;
  port: number;
  dataPath: string;
  configPath: string;
}

/**
 * Simple Docker manager using exec commands - more reliable than dockerode
 */
export class DockerExecManager {
  private containers: Map<string, DirectusContainer> = new Map();
  
  /**
   * Start a Directus container using docker CLI
   */
  async startDirectusContainer(config: DirectusContainerConfig = {}): Promise<DirectusContainer> {
    const name = config.name || `dct-test-${Date.now()}`;
    const port = config.port || 0; // 0 means no port exposure
    const adminEmail = config.adminEmail || 'admin@test.com';
    const adminPassword = config.adminPassword || 'test123456';
    
    // Create temp directories
    const dataPath = await mkdtemp(join(tmpdir(), 'dct-data-'));
    const configPath = await mkdtemp(join(tmpdir(), 'dct-config-'));
    
    // Build docker command
    const cmd = [
      'docker run -d',
      `--name ${name}`,
      port > 0 ? `-p ${port}:8055` : '',
      `-e KEY=test-key-${Date.now()}`,
      `-e SECRET=test-secret-${Date.now()}`,
      `-e ADMIN_EMAIL=${adminEmail}`,
      `-e ADMIN_PASSWORD=${adminPassword}`,
      '-e DB_CLIENT=sqlite3',
      '-e DB_FILENAME=/tmp/database.db',
      '-e WEBSOCKETS_ENABLED=false',
      '-e TELEMETRY_ENABLED=false',
      '-e CACHE_ENABLED=false',
      '-e RATE_LIMITER_ENABLED=false',
      port > 0 ? `-e PUBLIC_URL=http://localhost:${port}` : '',
      `-v ${dataPath}:/directus/database`,
      `-v ${configPath}:/directus/config`,
      'directus/directus:11.9.3'
    ].filter(Boolean).join(' ');
    
    console.log('Starting container with command:', cmd);
    
    try {
      const { stdout } = await execAsync(cmd);
      const containerId = stdout.trim();
      
      const container: DirectusContainer = {
        id: containerId,
        name,
        port,
        dataPath,
        configPath
      };
      
      this.containers.set(name, container);
      return container;
    } catch (error) {
      throw new Error(`Failed to start container: ${error}`);
    }
  }
  
  /**
   * Execute command inside container
   */
  async execInContainer(containerName: string, command: string[]): Promise<string> {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }
    
    const cmd = `docker exec ${container.name} ${command.join(' ')}`;
    try {
      const { stdout } = await execAsync(cmd);
      return stdout;
    } catch (error) {
      if (error instanceof Error && 'stderr' in error) {
        throw new Error(`Exec failed: ${(error as any).stderr}`);
      }
      throw error;
    }
  }
  
  /**
   * Wait for Directus to be healthy
   */
  async waitForHealthy(containerName: string, timeout = 60000): Promise<void> {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }
    
    const startTime = Date.now();
    console.log(`Waiting for ${containerName} to be healthy...`);
    
    while (Date.now() - startTime < timeout) {
      try {
        // Check container status
        const { stdout: statusOutput } = await execAsync(
          `docker inspect -f '{{.State.Status}}' ${container.name}`
        );
        
        if (statusOutput.trim() !== 'running') {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // Check health endpoint using node
        const healthCmd = `docker exec ${container.name} node -e "
          const http = require('http');
          http.get('http://localhost:8055/server/health', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => console.log(data));
          }).on('error', err => process.exit(1));
        "`;
        
        try {
          const { stdout: healthOutput } = await execAsync(healthCmd);
          
          if (healthOutput.includes('"status":"ok"')) {
            console.log('Directus is healthy!');
            return;
          }
        } catch (error) {
          // Not ready yet
        }
      } catch (error) {
        // Not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Get logs for debugging
    try {
      const { stdout: logs } = await execAsync(`docker logs --tail 50 ${container.name}`);
      console.error('Container logs:', logs);
    } catch (e) {
      console.error('Could not get logs');
    }
    
    throw new Error(`Container did not become healthy within ${timeout}ms`);
  }
  
  /**
   * Get admin token
   */
  async getAdminToken(containerName: string): Promise<string> {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }
    
    // Wait a bit for auth to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Login and get token using node
    const cmd = `node -e "
      const http = require('http');
      const data = JSON.stringify({email:'admin@test.com',password:'test123456'});
      const options = {
        hostname: 'localhost',
        port: 8055,
        path: '/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };
      const req = http.request(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            console.log(json.data.access_token);
          } catch (e) {
            process.exit(1);
          }
        });
      });
      req.on('error', () => process.exit(1));
      req.write(data);
      req.end();
    "`;
    
    try {
      const output = await this.execInContainer(containerName, ['sh', '-c', cmd]);
      const token = output.trim();
      if (token && token.length > 10) {
        return token;
      }
    } catch (error) {
      console.warn('Failed to get token:', error);
    }
    
    return 'static-admin-token';
  }
  
  /**
   * Install DCT in container
   */
  async installDCT(containerName: string, dctPath: string): Promise<void> {
    const container = this.containers.get(containerName);
    if (!container) {
      throw new Error(`Container ${containerName} not found`);
    }
    
    // Copy DCT files
    await execAsync(`docker cp ${dctPath}/dist ${container.name}:/directus/dct`);
    
    // Create wrapper script
    const wrapperScript = `#!/bin/sh
export DCT_API_URL=http://localhost:8055
export DCT_CONFIG_PATH=/directus/config
export DCT_TOKEN=\${DCT_TOKEN:-admin-token}

exec node /directus/dct/cli.js "\$@"
`;
    
    // Write wrapper to container
    await this.execInContainer(containerName, [
      'sh', '-c',
      `echo '${wrapperScript}' > /usr/local/bin/dct && chmod +x /usr/local/bin/dct`
    ]);
  }
  
  /**
   * Stop and remove container
   */
  async stopContainer(containerName: string): Promise<void> {
    const container = this.containers.get(containerName);
    if (!container) {
      return;
    }
    
    try {
      await execAsync(`docker stop ${container.name}`);
      await execAsync(`docker rm ${container.name}`);
      
      // Clean up directories
      await rm(container.dataPath, { recursive: true, force: true });
      await rm(container.configPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to stop container ${containerName}:`, error);
    }
    
    this.containers.delete(containerName);
  }
  
  /**
   * Clean up all containers
   */
  async cleanup(): Promise<void> {
    for (const containerName of this.containers.keys()) {
      await this.stopContainer(containerName);
    }
  }
}