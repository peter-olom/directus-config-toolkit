import {
  createFlow,
  createOperation,
  deleteFlows,
  deleteOperations,
  readFlows,
  readOperations,
  updateFlow,
} from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { client, ensureConfigDirs } from "./helper";
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
      // Load local configuration
      const localFlows: DirectusFlow[] = JSON.parse(
        readFileSync(this.configPath, "utf8")
      );
      const localOperations: DirectusOperation[] = JSON.parse(
        readFileSync(this.operationPath, "utf8")
      );

      // Sort operations by dependency to ensure proper import order
      const sortedOperations = this.sortOperationsByDependency(localOperations);

      // Use audit manager for comprehensive import tracking
      return new Promise((resolve) => {
        this.auditManager
          .auditImportOperation(
            "flows",
            "FlowsManager",
            { flows: localFlows, operations: localOperations },
            async () => {
              const flows = await this.fetchRemoteData();
              const operations = await this.fetchRemoteOperations();
              return { flows, operations };
            },
            async () => {
              if (dryRun) {
                return {
                  status: "success" as const,
                  message: "Dry run completed - no changes applied",
                };
              }

              // Delete existing flows and operations
              const existingFlows = await this.fetchRemoteData();
              if (existingFlows.length > 0) {
                await client.request(
                  deleteFlows(existingFlows.map((f) => f.id))
                );
              }

              const existingOperations = await this.fetchRemoteOperations();
              if (existingOperations.length > 0) {
                await client.request(
                  deleteOperations(existingOperations.map((op) => op.id))
                );
              }

              // Import operations first (in dependency order)
              for (const operation of sortedOperations) {
                const { id, ...operationData } = operation;
                await client.request(createOperation(operationData));
              }

              // Import flows
              for (const flow of localFlows) {
                const { id, ...flowData } = flow;
                await client.request(createFlow(flowData));
              }

              return {
                status: "success" as const,
                message: `Imported ${localFlows.length} flows and ${sortedOperations.length} operations`,
              };
            },
            dryRun
          )
          .then(() => {
            resolve({
              status: "success",
              message: "Import operation completed successfully",
            });
          })
          .catch((error) => {
            resolve({ status: "failure", message: error.message });
          });
      });
    } catch (error: any) {
      return { status: "failure", message: error.message };
    }
  }

  // Wrapper methods for backward compatibility with the command system
  exportFlows = () => this.exportConfig();
  importFlows = (dryRun?: boolean) => this.importConfig(dryRun);
}
