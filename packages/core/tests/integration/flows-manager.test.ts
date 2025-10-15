import { DockerTestManager } from '../utils/docker';
import {
  DirectusSQLiteTestManager,
  DirectusTestInstance
} from '../utils/directus-sqlite';
import { seedFlowFixtures } from '../fixtures/flows-setup';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import {
  createDirectus,
  rest,
  authentication,
  RestCommand
} from '@directus/sdk';
import { v4 as uuidv4 } from 'uuid';
import { TEST_CONFIG } from '../utils/test-config';

jest.setTimeout(300000);

const cliPath = join(__dirname, '../../dist/cli.js');

interface SnapshotFlow {
  id: string;
  name: string;
  status: string;
  trigger: string;
  accountability?: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  operation: string | null;
}

interface SnapshotOperation {
  id: string;
  name: string;
  key: string;
  type: string;
  flow: string;
  resolve: string | null;
  reject: string | null;
  options: Record<string, any>;
  position_x?: number;
  position_y?: number;
}

function simplifyFlows(flows: any[]): SnapshotFlow[] {
  return flows
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      status: flow.status,
      trigger: flow.trigger,
      accountability: flow.accountability,
      operation: flow.operation ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function simplifyOperations(operations: any[]): SnapshotOperation[] {
  return operations
    .map((operation) => ({
      id: operation.id,
      name: operation.name,
      key: operation.key,
      type: operation.type,
      flow: operation.flow,
      resolve: operation.resolve ?? null,
      reject: operation.reject ?? null,
      options: operation.options || {}
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function runDctCommand(
  args: string,
  env: NodeJS.ProcessEnv,
  options: Partial<{ stdio: 'inherit' | 'pipe'; encoding: BufferEncoding }> = {}
): string {
  const stdio = options.stdio ?? 'pipe';
  const execOptions = {
    env,
    encoding: options.encoding ?? 'utf8',
    stdio
  } as const;
  if (stdio === 'inherit') {
    execSync(`node ${cliPath} ${args}`, execOptions);
    return '';
  }
  return execSync(`node ${cliPath} ${args}`, execOptions) as unknown as string;
}

function restRequest<T = any>(request: {
  path: string;
  method: 'GET' | 'POST' | 'PATCH';
  params?: Record<string, any>;
  body?: Record<string, any>;
}): RestCommand<T, T> {
  const { body, ...rest } = request;
  return () =>
    ({
      ...rest,
      ...(body
        ? {
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          }
        : {})
    } as any);
}

describe('FlowsManager Integration', () => {
  let dockerManager: DockerTestManager;
  let directusManager: DirectusSQLiteTestManager;
  let sourceInstance: DirectusTestInstance | undefined;
  let targetInstance: DirectusTestInstance | undefined;
  let configDir: string;
  let auditDir: string;

  beforeAll(async () => {
    dockerManager = new DockerTestManager();
    await dockerManager.createNetwork();
    await dockerManager.pullImage(TEST_CONFIG.DIRECTUS_IMAGE);
    directusManager = new DirectusSQLiteTestManager(dockerManager);
    configDir = await mkdtemp(join(tmpdir(), 'dct-flows-config-'));
    auditDir = await mkdtemp(join(tmpdir(), 'dct-flows-audit-'));

    execSync('npm run build --workspace @devrue/directus-config-toolkit', {
      stdio: 'inherit'
    });
  });

  afterAll(async () => {
    await rm(configDir, { recursive: true, force: true });
    await rm(auditDir, { recursive: true, force: true });

    await directusManager.cleanupAll();
    await dockerManager.cleanup();

    const dockerApi = (dockerManager as any)?.docker;
    if (dockerApi?.modem?.destroy) {
      try {
        dockerApi.modem.destroy();
      } catch (error) {
        console.error('Failed to destroy Docker modem:', error);
      }
    }
  });

  afterEach(async () => {
    if (sourceInstance) {
      await sourceInstance.cleanup();
      sourceInstance = undefined;
    }
    if (targetInstance) {
      await targetInstance.cleanup();
      targetInstance = undefined;
    }
    await directusManager.cleanupAll();
    await rm(configDir, { recursive: true, force: true });
    await rm(auditDir, { recursive: true, force: true });
    configDir = await mkdtemp(join(tmpdir(), 'dct-flows-config-'));
    auditDir = await mkdtemp(join(tmpdir(), 'dct-flows-audit-'));
  });

  test('exports, previews, and imports flows without destructive deletes', async () => {
    sourceInstance = await directusManager.createDirectusInstance({
      name: 'flows-source',
      adminEmail: 'admin@example.com',
      startupTimeout: 120000
    });

    const seedResult = await seedFlowFixtures(sourceInstance);

    const sourceEnv = {
      ...process.env,
      DCT_API_URL: sourceInstance.apiUrl,
      DCT_TOKEN: sourceInstance.adminToken!,
      DCT_CONFIG_PATH: configDir,
      DCT_AUDIT_PATH: auditDir
    };

    runDctCommand('export flows', sourceEnv, { stdio: 'inherit' });

    const flowsPath = join(configDir, 'flows.json');
    const operationsPath = join(configDir, 'operations.json');

    const exportedFlows: SnapshotFlow[] = JSON.parse(
      await readFile(flowsPath, 'utf8')
    );
    const exportedOperations: SnapshotOperation[] = JSON.parse(
      await readFile(operationsPath, 'utf8')
    );

    expect(exportedFlows.length).toBe(seedResult.flows.length);
    expect(exportedOperations.length).toBe(seedResult.operations.length);

    targetInstance = await directusManager.createDirectusInstance({
      name: 'flows-target',
      adminEmail: 'admin@example.com',
      startupTimeout: 120000
    });

    const targetEnv = {
      ...process.env,
      DCT_API_URL: targetInstance.apiUrl,
      DCT_TOKEN: targetInstance.adminToken!,
      DCT_CONFIG_PATH: configDir,
      DCT_AUDIT_PATH: auditDir
    };

    const dryRunOutput = runDctCommand('import flows --dry-run', targetEnv);
    expect(dryRunOutput).toContain('Flows:');
    expect(dryRunOutput).toContain('Operations:');

    runDctCommand('import flows', targetEnv, { stdio: 'inherit' });

    const targetClient = createDirectus(targetInstance.apiUrl)
      .with(rest())
      .with(authentication());
    targetClient.setToken(targetInstance.adminToken!);

    const remoteFlowsResponse = await targetClient.request<any>(
      restRequest({
        path: '/flows',
        method: 'GET',
        params: { limit: -1 }
      })
    );
    const remoteOperationsResponse = await targetClient.request<any>(
      restRequest({
        path: '/operations',
        method: 'GET',
        params: { limit: -1 }
      })
    );

    const remoteFlows = remoteFlowsResponse?.data ?? remoteFlowsResponse;
    const remoteOperations =
      remoteOperationsResponse?.data ?? remoteOperationsResponse;

    const simplifiedRemoteFlows = simplifyFlows(remoteFlows);
    const simplifiedExportedFlows = simplifyFlows(exportedFlows);
    expect(simplifiedRemoteFlows).toEqual(simplifiedExportedFlows);

    const simplifiedRemoteOperations = simplifyOperations(remoteOperations);
    const simplifiedExportedOperations = simplifyOperations(exportedOperations);
    expect(simplifiedRemoteOperations).toEqual(simplifiedExportedOperations);

    // Stage two: mutate local config and ensure updates apply without deleting extra operations
    const extraOperationId = uuidv4();
    await targetClient.request(
      restRequest({
        path: '/operations',
        method: 'POST',
        body: {
          id: extraOperationId,
          name: 'Manual Operation',
          key: 'manual_operation',
          type: 'log',
          flow: exportedFlows[0].id,
          resolve: null,
          reject: null,
          options: { message: 'manually added' },
          position_x: 480,
          position_y: 320
        }
      })
    );

    const flowsForUpdate = JSON.parse(
      await readFile(flowsPath, 'utf8')
    ) as SnapshotFlow[];
    flowsForUpdate[0].name = `${flowsForUpdate[0].name} (Updated)`;

    const operationsForUpdate = JSON.parse(
      await readFile(operationsPath, 'utf8')
    ) as SnapshotOperation[];
    operationsForUpdate[0].options = { message: 'Flow A start updated' };

    const newFlowId = uuidv4();
    const newOperationId = uuidv4();

    flowsForUpdate.push({
      id: newFlowId,
      name: 'Fixture Flow C',
      status: 'active',
      trigger: 'manual',
      accountability: 'all',
      icon: null,
      color: null,
      description: null,
      operation: newOperationId
    });

    operationsForUpdate.push({
      id: newOperationId,
      name: 'Flow C - Log',
      key: 'flow_c_log',
      type: 'log',
      flow: newFlowId,
      resolve: null,
      reject: null,
      options: { message: 'Flow C log' },
      position_x: 160,
      position_y: 160
    });

    await writeFile(flowsPath, JSON.stringify(flowsForUpdate, null, 2));
    await writeFile(operationsPath, JSON.stringify(operationsForUpdate, null, 2));

    const updateOutput = runDctCommand('import flows', targetEnv);
    expect(updateOutput).toContain('pending manual removal');

    const updatedFlowsResponse = await targetClient.request<any>(
      restRequest({
        path: '/flows',
        method: 'GET',
        params: { limit: -1 }
      })
    );
    const updatedOperationsResponse = await targetClient.request<any>(
      restRequest({
        path: '/operations',
        method: 'GET',
        params: { limit: -1 }
      })
    );

    const updatedFlows = updatedFlowsResponse?.data ?? updatedFlowsResponse;
    const updatedOperations =
      updatedOperationsResponse?.data ?? updatedOperationsResponse;

    const targetFlowMap = new Map<string, any>(
      (updatedFlows as any[]).map((flow: any) => [flow.id, flow])
    );

    expect(targetFlowMap.get(flowsForUpdate[0].id)?.name).toBe(
      flowsForUpdate[0].name
    );
    expect(targetFlowMap.has(newFlowId)).toBe(true);

    const targetOperationMap = new Map<string, any>(
      (updatedOperations as any[]).map((operation: any) => [
        operation.id,
        operation
      ])
    );

    expect(
      targetOperationMap.get(operationsForUpdate[0].id)?.options?.message
    ).toBe('Flow A start updated');

    expect(targetOperationMap.has(extraOperationId)).toBe(true);
    expect(
      targetOperationMap.get(extraOperationId)?.options?.message
    ).toBe('manually added');
  });
});
