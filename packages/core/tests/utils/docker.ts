import Docker = require('dockerode');
import { Container, Network } from 'dockerode';
import { wait } from './helpers';

export interface DockerContainerConfig {
  name: string;
  image: string;
  env?: Record<string, string>;
  ports?: { [key: string]: string };
  networkMode?: string;
  volumes?: string[];
  healthcheck?: {
    test: string[];
    interval?: number;
    timeout?: number;
    retries?: number;
  };
}

export class DockerTestManager {
  private docker: Docker;
  private containers: Map<string, Container> = new Map();
  private network: Network | null = null;
  private networkName: string;

  constructor(networkName: string = 'dct-test-network') {
    this.docker = new Docker();
    this.networkName = networkName;
  }

  async createNetwork(): Promise<void> {
    try {
      // Check if network already exists
      const networks = await this.docker.listNetworks();
      const existingNetwork = networks.find(n => n.Name === this.networkName);
      
      if (existingNetwork) {
        this.network = this.docker.getNetwork(existingNetwork.Id);
      } else {
        this.network = await this.docker.createNetwork({
          Name: this.networkName,
          Driver: 'bridge'
        });
      }
    } catch (error) {
      console.error('Failed to create network:', error);
      throw error;
    }
  }

  async createContainer(config: DockerContainerConfig): Promise<Container> {
    try {
      const createOptions: Docker.ContainerCreateOptions = {
        name: config.name,
        Image: config.image,
        Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
        HostConfig: {
          NetworkMode: this.networkName,
          PortBindings: config.ports ? this.formatPortBindings(config.ports) : undefined,
          Binds: config.volumes,
          AutoRemove: true
        }
      };

      // Healthcheck is set via HostConfig in newer dockerode versions
      if (config.healthcheck && createOptions.HostConfig) {
        (createOptions as any).Healthcheck = {
          Test: config.healthcheck.test,
          Interval: (config.healthcheck.interval || 5) * 1e9, // Convert to nanoseconds
          Timeout: (config.healthcheck.timeout || 3) * 1e9,
          Retries: config.healthcheck.retries || 5
        };
      }

      const container = await this.docker.createContainer(createOptions);
      this.containers.set(config.name, container);
      return container;
    } catch (error) {
      console.error(`Failed to create container ${config.name}:`, error);
      throw error;
    }
  }

  private formatPortBindings(ports: { [key: string]: string }): Docker.PortMap {
    const bindings: Docker.PortMap = {};
    for (const [containerPort, hostPort] of Object.entries(ports)) {
      bindings[containerPort] = [{ HostPort: hostPort }];
    }
    return bindings;
  }

  async startContainer(name: string): Promise<void> {
    const container = this.containers.get(name);
    if (!container) {
      throw new Error(`Container ${name} not found`);
    }
    await container.start();
    
    // Give container a moment to initialize
    await wait(1000);
  }

  async waitForContainer(name: string, timeout: number = 60000): Promise<void> {
    const container = this.containers.get(name);
    if (!container) {
      throw new Error(`Container ${name} not found`);
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const info = await container.inspect();
        
        // Check if container has healthcheck
        if ((info.Config as any).Healthcheck) {
          if (info.State.Health?.Status === 'healthy') {
            return;
          }
        } else {
          // No healthcheck, just check if running
          if (info.State.Running) {
            return;
          }
        }
      } catch (error) {
        // Container might not be ready yet
      }
      
      await wait(1000);
    }
    
    throw new Error(`Container ${name} failed to become healthy within ${timeout}ms`);
  }

  async getContainerLogs(name: string): Promise<string> {
    const container = this.containers.get(name);
    if (!container) {
      throw new Error(`Container ${name} not found`);
    }

    const stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
      tail: 100
    });

    return stream.toString();
  }

  async cleanup(): Promise<void> {
    // Stop and remove all containers
    for (const [name, container] of this.containers) {
      try {
        await container.stop({ t: 5 });
      } catch (error) {
        // Container might already be stopped
      }
      
      try {
        await container.remove({ force: true });
      } catch (error) {
        console.error(`Failed to remove container ${name}:`, error);
      }
    }

    // Remove network
    if (this.network) {
      try {
        await this.network.remove();
      } catch (error) {
        // Network might still have containers attached
        console.error('Failed to remove network:', error);
      }
    }

    this.containers.clear();
  }

  async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Follow the pull progress
        this.docker.modem.followProgress(stream, (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }, (event: any) => {
          // Optional: log progress
          if (event.status) {
            console.log(`${imageName}: ${event.status}`);
          }
        });
      });
    });
  }
}