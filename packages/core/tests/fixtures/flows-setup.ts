import { createDirectus, rest, authentication, RestCommand } from '@directus/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { DirectusTestInstance } from '../utils/directus-sqlite';

interface FlowRecord {
  id: string;
  name: string;
  status: string;
  trigger: string;
  accountability: string;
  operation: string | null;
}

interface OperationRecord {
  id: string;
  name: string;
  key: string;
  type: string;
  flow: string;
  resolve: string | null;
  reject: string | null;
  options: Record<string, any>;
  position_x: number;
  position_y: number;
}

interface FlowSeedResult {
  flows: FlowRecord[];
  operations: OperationRecord[];
}

export async function seedFlowFixtures(
  instance: DirectusTestInstance
): Promise<FlowSeedResult> {
  const client = createDirectus(instance.apiUrl)
    .with(rest())
    .with(authentication());

  client.setToken(instance.adminToken!);

  const flows: FlowRecord[] = [];
  const operations: OperationRecord[] = [];

  // Helper to create a flow
  const createFlowCommand = (
    payload: Partial<FlowRecord>
  ): RestCommand<any, any> => {
    return () => ({
      path: '/flows',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  };

  const createOperationCommand = (
    payload: Partial<OperationRecord>
  ): RestCommand<any, any> => {
    return () => ({
      path: '/operations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  };

  const updateFlowCommand = (
    id: string,
    payload: Partial<FlowRecord>
  ): RestCommand<any, any> => {
    return () => ({
      path: `/flows/${id}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  };

  const updateOperationCommand = (
    id: string,
    payload: Partial<OperationRecord>
  ): RestCommand<any, any> => {
    return () => ({
      path: `/operations/${id}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  };

  const readFlowsCommand = (
    ids: string[]
  ): RestCommand<any, any> => {
    return () => ({
      path: '/flows',
      method: 'GET',
      params: { limit: -1, filter: { id: { _in: ids } } }
    });
  };

  const createFlow = async (payload: Partial<FlowRecord>) => {
    const response = await client.request<any>(createFlowCommand(payload));
    const record = response?.data ?? response;
    const flow: FlowRecord = {
      id: record.id,
      name: record.name,
      status: record.status,
      trigger: record.trigger,
      accountability: record.accountability,
      operation: record.operation
    };
    flows.push(flow);
    return flow;
  };

  // Helper to create an operation
  const createOperation = async (payload: Partial<OperationRecord>) => {
    const response = await client.request<any>(
      createOperationCommand(payload)
    );
    const record = response?.data ?? response;
    const operation: OperationRecord = {
      id: record.id,
      name: record.name,
      key: record.key,
      type: record.type,
      flow: record.flow,
      resolve: record.resolve,
      reject: record.reject,
      options: record.options,
      position_x: record.position_x,
      position_y: record.position_y
    };
    operations.push(operation);
    return operation;
  };

  const updateFlow = async (id: string, payload: Partial<FlowRecord>) => {
    const response = await client.request<any>(updateFlowCommand(id, payload));
    const record = response?.data ?? response;
    const flowIndex = flows.findIndex((flow) => flow.id === id);
    if (flowIndex >= 0) {
      flows[flowIndex] = {
        id: record.id,
        name: record.name,
        status: record.status,
        trigger: record.trigger,
        accountability: record.accountability,
        operation: record.operation
      };
    }
  };

  // Flow A with two linked operations
  const flowAId = uuidv4();
  const operationA1Id = uuidv4();
  const operationA2Id = uuidv4();

  await createFlow({
    id: flowAId,
    name: 'Fixture Flow A',
    trigger: 'manual',
    status: 'active'
  });

  await createOperation({
    id: operationA1Id,
    name: 'Flow A - Start',
    key: 'flow_a_start',
    type: 'log',
    flow: flowAId,
    resolve: null,
    reject: null,
    options: { message: 'Flow A start' },
    position_x: 120,
    position_y: 140
  });

  await createOperation({
    id: operationA2Id,
    name: 'Flow A - Finish',
    key: 'flow_a_finish',
    type: 'log',
    flow: flowAId,
    resolve: null,
    reject: null,
    options: { message: 'Flow A finish' },
    position_x: 360,
    position_y: 140
  });

  await client.request(updateOperationCommand(operationA1Id, { resolve: operationA2Id }));
  const operationIndex = operations.findIndex((op) => op.id === operationA1Id);
  if (operationIndex >= 0) {
    operations[operationIndex].resolve = operationA2Id;
  }

  await updateFlow(flowAId, { operation: operationA1Id });

  // Flow B with a single operation
  const flowBId = uuidv4();
  const operationB1Id = uuidv4();

  await createFlow({
    id: flowBId,
    name: 'Fixture Flow B',
    trigger: 'manual',
    status: 'active'
  });

  await createOperation({
    id: operationB1Id,
    name: 'Flow B - Log',
    key: 'flow_b_log',
    type: 'log',
    flow: flowBId,
    resolve: null,
    reject: null,
    options: { message: 'Flow B log' },
    position_x: 200,
    position_y: 220
  });

  await updateFlow(flowBId, { operation: operationB1Id });

  // Refresh flow entries to include the root operation updates
  const refreshedResponse = await client.request<any>(
    readFlowsCommand([flowAId, flowBId])
  );
  const refreshedFlows = refreshedResponse?.data ?? refreshedResponse;

  const normalizedFlows: FlowRecord[] = refreshedFlows
    .map((flow: any) => ({
      id: flow.id,
      name: flow.name,
      status: flow.status,
      trigger: flow.trigger,
      accountability: flow.accountability,
      operation: flow.operation ?? null
    }))
    .sort((a: FlowRecord, b: FlowRecord) => a.id.localeCompare(b.id));

  // Ensure flows array uses refreshed data with operation field populated
  flows.length = 0;
  flows.push(...normalizedFlows);

  return {
    flows,
    operations: operations.sort((a, b) => a.id.localeCompare(b.id))
  };
}
