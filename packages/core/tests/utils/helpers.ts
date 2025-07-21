import * as net from 'net';

export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateRandomPort(min: number = 10000, max: number = 60000): string {
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Find an available port by trying to create a server
 */
export async function findAvailablePort(startPort: number = 10000, maxAttempts: number = 100): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    
    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      
      server.once('error', () => {
        resolve(false);
      });
      
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      
      server.listen(port);
    });
    
    if (isAvailable) {
      return port;
    }
  }
  
  throw new Error(`Could not find available port after ${maxAttempts} attempts`);
}