import { readFlows, readOperations } from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import {
  callDirectusAPI,
  client,
  ensureConfigDirs,
  retryOperation,
} from "./helper";
import _ from "lodash";
import {
  BaseConfigManager,
  DependencyInfo,
  FieldExclusionConfig,
} from "./base-config-manager";

interface DirectusOperation {
  id: string;
  resolve: string | null;
  reject: string | null;
  flow: string;
  [key: string]: any;
}

interface DirectusFlow {
  id: string;
  name: string;
  operations?: DirectusOperation[];
  [key: string]: any;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
  pendingDelete: number;
}

interface SyncResult<T> {
  stats: SyncStats;
  pendingDeletion: T[];
}

/**
 * Operations Manager for handling Directus operations
 */
class OperationsManager extends BaseConfigManager<DirectusOperation> {
  protected readonly configType = "operations";
  protected readonly defaultFilename = "operations.json";

  constructor() {
    const fieldConfig: FieldExclusionConfig = {
      nullifyFields: ["user_created"],
    };

    super(fieldConfig);
    this.initializeConfigPath();
  }

  protected async fetchRemoteData(): Promise<DirectusOperation[]> {
    const operations = await client.request(readOperations());
    return operations as DirectusOperation[];
  }

  public async exportConfig(): Promise<void> {
    // Implementation for operations export
    const operations = await this.fetchRemoteData();
    const normalizedOperations = this.normalizeItems(operations);

    writeFileSync(
      this.configPath,
      JSON.stringify(normalizedOperations, null, 2)
    );
    await this.storeEnhancedSnapshot(operations);
  }

  public async importConfig(
    dryRun?: boolean
  ): Promise<{ status: "success" | "failure"; message?: string }> {
    // Implementation for operations import
    return {
      status: "success",
      message: "Operations import not implemented yet",
    };
  }
}

/**
 * FlowsManager that inherits from BaseConfigManager
 * Provides standardized data normalization and audit capabilities
 */
export class FlowsManager extends BaseConfigManager<DirectusFlow> {
  protected readonly configType = "flows";
  protected readonly defaultFilename = "flows.json";

  private operationPath: string;
  private operationsManager: OperationsManager;

  constructor() {
    // Configure field exclusion patterns for flows
    const fieldConfig: FieldExclusionConfig = {
      nullifyFields: ["user_created"],
      emptyRelationFields: ["operations"], // Many-to-many relationship
    };

    super(fieldConfig);
    this.initializeConfigPath();
    this.operationPath = this.configPath.replace(
      "flows.json",
      "operations.json"
    );
    this.operationsManager = new OperationsManager();
  }

  protected validateLocalConfig(
    flows: DirectusFlow[],
    operations: DirectusOperation[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(flows)) {
      errors.push("Local flows configuration must be an array.");
    }

    if (!Array.isArray(operations)) {
      errors.push("Local operations configuration must be an array.");
    }

    if (!Array.isArray(flows) || !Array.isArray(operations)) {
      return { errors, warnings };
    }

    const flowIds = new Set<string>();
    const duplicateFlowIds = new Set<string>();

    flows.forEach((flow, index) => {
      if (!flow.id || typeof flow.id !== "string") {
        errors.push(`Flow at index ${index} is missing a valid "id".`);
        return;
      }
      if (flowIds.has(flow.id)) {
        duplicateFlowIds.add(flow.id);
      } else {
        flowIds.add(flow.id);
      }

      if (!flow.name) {
        warnings.push(`Flow ${flow.id} is missing a name.`);
      }
    });

    duplicateFlowIds.forEach((id) => {
      errors.push(`Duplicate flow id detected: ${id}`);
    });

    const operationIds = new Set<string>();
    const duplicateOperationIds = new Set<string>();
    operations.forEach((operation, index) => {
      if (!operation.id || typeof operation.id !== "string") {
        errors.push(`Operation at index ${index} is missing a valid "id".`);
        return;
      }
      if (operationIds.has(operation.id)) {
        duplicateOperationIds.add(operation.id);
      } else {
        operationIds.add(operation.id);
      }

      if (!operation.flow || typeof operation.flow !== "string") {
        errors.push(
          `Operation ${operation.id} does not reference a valid flow id.`
        );
      } else if (!flowIds.has(operation.flow)) {
        errors.push(
          `Operation ${operation.id} references unknown flow "${operation.flow}".`
        );
      }
    });

    duplicateOperationIds.forEach((id) => {
      errors.push(`Duplicate operation id detected: ${id}`);
    });

    operations.forEach((operation) => {
      if (operation.resolve && !operationIds.has(operation.resolve)) {
        warnings.push(
          `Operation ${operation.id} resolve references missing operation ${operation.resolve}.`
        );
      }
      if (operation.reject && !operationIds.has(operation.reject)) {
        warnings.push(
          `Operation ${operation.id} reject references missing operation ${operation.reject}.`
        );
      }
    });

    return { errors, warnings };
  }

  private sanitizeFlowForWrite(
    flow: DirectusFlow,
    options: { includeId?: boolean } = {}
  ): Record<string, any> {
    const { includeId = false } = options;
    const {
      operations,
      user_created,
      user_updated,
      date_created,
      date_updated,
      ...rest
    } = flow;

    const payload: Record<string, any> = { ...rest };

    if (includeId) {
      payload.id = flow.id;
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    return payload;
  }

  private sanitizeOperationForWrite(
    operation: DirectusOperation,
    options: { includeId?: boolean } = {}
  ): Record<string, any> {
    const { includeId = false } = options;
    const {
      user_created,
      user_updated,
      date_created,
      date_updated,
      ...rest
    } = operation;

    const payload: Record<string, any> = { ...rest, flow: operation.flow };

    if (includeId) {
      payload.id = operation.id;
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    return payload;
  }

  private normalizeFlowForComparison(flow: DirectusFlow): Record<string, any> {
    return this.sanitizeFlowForWrite(flow, { includeId: true });
  }

  private normalizeOperationForComparison(
    operation: DirectusOperation
  ): Record<string, any> {
    return this.sanitizeOperationForWrite(operation, { includeId: true });
  }

  private logSyncPreview<T extends { id?: string }>(
    label: string,
    result: SyncResult<T>
  ) {
    const { stats, pendingDeletion } = result;
    const summaryParts = [
      `${stats.created} create`,
      `${stats.updated} update`,
      `${stats.skipped} unchanged`,
    ];
    if (stats.pendingDelete > 0) {
      summaryParts.push(`${stats.pendingDelete} pending manual removal`);
    }
    console.log(`${label}: ${summaryParts.join(", ")}`);

    if (pendingDeletion.length > 0) {
      const sampleIds = pendingDeletion
        .slice(0, 5)
        .map((item) => item.id || "<unknown>")
        .join(", ");
      console.warn(
        `⚠️ ${label} not present in snapshot (${pendingDeletion.length}). No automatic deletion performed. Sample: ${sampleIds}${
          pendingDeletion.length > 5 ? "…" : ""
        }`
      );
    }
  }

  private buildImportSummary(
    flowStats: SyncStats,
    operationStats: SyncStats
  ): string {
    const flowSummary = [
      `Flows → ${flowStats.created} created`,
      `${flowStats.updated} updated`,
      `${flowStats.skipped} unchanged`,
    ];
    if (flowStats.pendingDelete > 0) {
      flowSummary.push(`${flowStats.pendingDelete} pending manual removal`);
    }

    const operationSummary = [
      `Operations → ${operationStats.created} created`,
      `${operationStats.updated} updated`,
      `${operationStats.skipped} unchanged`,
    ];
    if (operationStats.pendingDelete > 0) {
      operationSummary.push(
        `${operationStats.pendingDelete} pending manual removal`
      );
    }

    return `${flowSummary.join(", ")}; ${operationSummary.join(", ")}`;
  }

  private async syncFlows(
    localFlows: DirectusFlow[],
    existingFlows: DirectusFlow[],
    options: { simulate?: boolean } = {}
  ): Promise<SyncResult<DirectusFlow>> {
    const { simulate = false } = options;
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
    };

    const existingMap = new Map(existingFlows.map((flow) => [flow.id, flow]));
    const managedFlowIds = new Set<string>();

    for (const flow of localFlows) {
      managedFlowIds.add(flow.id);
      const existing = existingMap.get(flow.id);
      const desired = this.normalizeFlowForComparison(flow);

      if (existing) {
        const current = this.normalizeFlowForComparison(existing);
        if (!_.isEqual(current, desired)) {
          stats.updated++;
          if (!simulate) {
            const payload = this.sanitizeFlowForWrite(flow);
            await retryOperation(() =>
              callDirectusAPI(`flows/${flow.id}`, "PATCH", payload)
            );
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          const payload = this.sanitizeFlowForWrite(flow, { includeId: true });
          await retryOperation(() =>
            callDirectusAPI("flows", "POST", payload)
          );
        }
      }
    }

    const pendingDeletion = existingFlows.filter(
      (flow) => !managedFlowIds.has(flow.id)
    );
    stats.pendingDelete = pendingDeletion.length;

    return { stats, pendingDeletion };
  }

  private async syncOperations(
    operations: DirectusOperation[],
    existingOperations: DirectusOperation[],
    options: { simulate?: boolean; managedFlowIds?: Set<string> } = {}
  ): Promise<SyncResult<DirectusOperation>> {
    const { simulate = false, managedFlowIds } = options;
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
    };

    const existingMap = new Map(
      existingOperations.map((operation) => [operation.id, operation])
    );
    const managedOperationIds = new Set<string>();

    for (const operation of operations) {
      managedOperationIds.add(operation.id);

      if (managedFlowIds && !managedFlowIds.has(operation.flow)) {
        console.warn(
          `⚠️ Operation ${operation.id} references unmanaged flow ${operation.flow}; skipping.`
        );
        continue;
      }

      const desired = this.normalizeOperationForComparison(operation);
      const existing = existingMap.get(operation.id);

      if (existing) {
        const current = this.normalizeOperationForComparison(existing);
        if (!_.isEqual(current, desired)) {
          stats.updated++;
          if (!simulate) {
            const payload = this.sanitizeOperationForWrite(operation);
            await retryOperation(() =>
              callDirectusAPI(`operations/${operation.id}`, "PATCH", payload)
            );
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          const payload = this.sanitizeOperationForWrite(operation, {
            includeId: true,
          });
          await retryOperation(() =>
            callDirectusAPI("operations", "POST", payload)
          );
        }
      }
    }

    const pendingDeletion = existingOperations.filter((operation) => {
      const belongsToManagedFlow = managedFlowIds
        ? managedFlowIds.has(operation.flow)
        : true;
      return belongsToManagedFlow && !managedOperationIds.has(operation.id);
    });
    stats.pendingDelete = pendingDeletion.length;

    return { stats, pendingDeletion };
  }

  /**
   * Detect dependencies within flows configuration
   * Maps flow -> operation relationships and operation -> operation chains
   */
  protected detectDependencies(flows: DirectusFlow[]): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];

    // This would require loading operations data as well
    // For now, return empty array - will be enhanced in Phase 2
    return dependencies;
  }

  /**
   * Enhanced dependency sorting for operations
   * Handles operation -> operation trigger relationships
   */
  private sortOperationsByDependency(
    operations: DirectusOperation[]
  ): DirectusOperation[] {
    const operationMap = new Map<string, DirectusOperation>();
    const sortedOperations: DirectusOperation[] = [];
    const processed = new Set<string>();
    const processing = new Set<string>(); // For circular dependency detection

    // Build operation map
    operations.forEach((op) => operationMap.set(op.id, op));

    const processOperation = (operationId: string): void => {
      if (processed.has(operationId)) return;

      if (processing.has(operationId)) {
        console.warn(
          `Circular dependency detected in operations involving: ${operationId}`
        );
        return;
      }

      const operation = operationMap.get(operationId);
      if (!operation) return;

      processing.add(operationId);

      // Process dependencies first (resolve and reject operations)
      if (operation.resolve && operationMap.has(operation.resolve)) {
        processOperation(operation.resolve);
      }
      if (operation.reject && operationMap.has(operation.reject)) {
        processOperation(operation.reject);
      }

      processing.delete(operationId);
      processed.add(operationId);
      sortedOperations.push(operation);
    };

    // Process all operations
    operations.forEach((op) => processOperation(op.id));

    return sortedOperations;
  }

  /**
   * Fetch remote flows data from Directus
   */
  protected async fetchRemoteData(): Promise<DirectusFlow[]> {
    const flows = await client.request(readFlows());
    return flows as DirectusFlow[];
  }

  /**
   * Fetch remote operations data from Directus
   */
  private async fetchRemoteOperations(): Promise<DirectusOperation[]> {
    const operations = await client.request(readOperations());
    return operations as DirectusOperation[];
  }

  /**
   * Export flows and operations configuration with enhanced audit
   */
  public async exportConfig(): Promise<void> {
    ensureConfigDirs();

    try {
      // Fetch operations first (flows depend on operations)
      const operations = await this.fetchRemoteOperations();
      const normalizedOperations =
        this.operationsManager.normalizeItems(operations);

      // Write operations file
      writeFileSync(
        this.operationPath,
        JSON.stringify(normalizedOperations, null, 2)
      );

      // Fetch and normalize flows
      const flows = await this.fetchRemoteData();
      const normalizedFlows = this.normalizeItems(flows);

      // Write flows file
      writeFileSync(this.configPath, JSON.stringify(normalizedFlows, null, 2));

      // Create enhanced audit snapshots
      await this.storeEnhancedSnapshot(
        flows,
        `export_${new Date().toISOString().replace(/[:.]/g, "-")}`
      );
      await this.operationsManager.storeEnhancedSnapshot(
        operations,
        `export_operations_${new Date().toISOString().replace(/[:.]/g, "-")}`
      );

      // Validate export consistency
      const validation = await this.validateExportAuditConsistency(flows);
      if (!validation.isConsistent) {
        console.warn(
          "Export-audit consistency issues found:",
          validation.differences
        );
      }

      await this.auditManager.log({
        operation: "export",
        manager: "FlowsManager",
        itemType: "flows",
        status: "success",
        message: `Exported ${flows.length} flows and ${operations.length} operations with enhanced metadata`,
      });

      console.log(
        `✅ Successfully exported ${flows.length} flows and ${operations.length} operations`
      );
    } catch (error: any) {
      await this.auditManager.log({
        operation: "export",
        manager: "FlowsManager",
        itemType: "flows",
        status: "failure",
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Import flows and operations configuration with enhanced validation
   */
  public async importConfig(
    dryRun = false
  ): Promise<{ status: "success" | "failure"; message?: string }> {
    try {
      const localFlows: DirectusFlow[] = JSON.parse(
        readFileSync(this.configPath, "utf8")
      );
      const localOperations: DirectusOperation[] = JSON.parse(
        readFileSync(this.operationPath, "utf8")
      );

      const validation = this.validateLocalConfig(localFlows, localOperations);
      if (validation.errors.length > 0) {
        validation.errors.forEach((error) => console.error(`❌ ${error}`));
        return {
          status: "failure",
          message: `Validation failed with ${validation.errors.length} error(s).`,
        };
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning) =>
          console.warn(`⚠️ ${warning}`)
        );
      }

      const sortedOperations = this.sortOperationsByDependency(localOperations);
      const managedFlowIds = new Set(localFlows.map((flow) => flow.id));

      const fetchRemoteState = async () => {
        const [flows, operations] = await Promise.all([
          this.fetchRemoteData(),
          this.fetchRemoteOperations(),
        ]);
        return { flows, operations };
      };

      if (dryRun) {
        const remoteState = await fetchRemoteState();
        const flowPreview = await this.syncFlows(localFlows, remoteState.flows, {
          simulate: true,
        });
        const operationPreview = await this.syncOperations(
          sortedOperations,
          remoteState.operations,
          { simulate: true, managedFlowIds }
        );
        this.logSyncPreview("Flows", flowPreview);
        this.logSyncPreview("Operations", operationPreview);
        return {
          status: "success",
          message: "Dry run completed - no changes applied",
        };
      }

      let outcome: { status: "success" | "failure"; message?: string } = {
        status: "success",
      };

      await this.auditManager.auditImportOperation(
        "flows",
        "FlowsManager",
        { flows: localFlows, operations: localOperations },
        fetchRemoteState,
        async () => {
          try {
            const { flows: existingFlows, operations: existingOperations } =
              await fetchRemoteState();
            const flowResult = await this.syncFlows(localFlows, existingFlows);
            const operationResult = await this.syncOperations(
              sortedOperations,
              existingOperations,
              { managedFlowIds }
            );

            this.logSyncPreview("Flows", flowResult);
            this.logSyncPreview("Operations", operationResult);

            const summary = this.buildImportSummary(
              flowResult.stats,
              operationResult.stats
            );
            outcome = { status: "success", message: summary };
            return outcome;
          } catch (error: any) {
            outcome = { status: "failure", message: error.message };
            throw error;
          }
        },
        false
      );

      return outcome;
    } catch (error: any) {
      console.error("Failed to import flows and operations:", error.message);
      return { status: "failure", message: error.message };
    }
  }

  // Wrapper methods for backward compatibility with the command system
  exportFlows = () => this.exportConfig();
  importFlows = (dryRun?: boolean) => this.importConfig(dryRun);
}
