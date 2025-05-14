import {
  createFlow,
  createOperation,
  deleteFlows,
  deleteOperations,
  readFlows,
  readOperations,
  updateFlow,
  updateOperation,
} from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import _ from "lodash";
import { MetadataManager, ConfigType } from "./metadata";
import { v4 as uuidv4 } from "uuid";

interface DirectusOperation {
  id: string;
  resolve: string | null;
  reject: string | null;
  [key: string]: any;
}

/**
 * FlowsManager is a class that handles exporting and importing flows.
 */
export class FlowsManager {
  private flowPath: string = join(CONFIG_PATH, "flows.json");
  private operationPath: string = join(CONFIG_PATH, "operations.json");
  private metadataManager: MetadataManager;

  constructor() {
    this.metadataManager = new MetadataManager();
  }

  setUserNull(record: Record<string, any>) {
    if (record["user_created"]) {
      record["user_created"] = null;
    }
    return record;
  }

  emptyOperations(record: Record<string, any>) {
    if (record["operations"]) {
      record["operations"] = [];
    }
    return record;
  }

  exportFlows = async () => {
    ensureConfigDirs();

    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "flows";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "export",
      status: "running",
      createdAt: now,
    });

    try {
      // flows are tied to operations, so we need to fetch all operations
      const operations = await client.request(readOperations());
      writeFileSync(
        this.operationPath,
        JSON.stringify(operations.map(this.setUserNull), null, 2)
      );

      const flows = await client.request(readFlows());
      writeFileSync(
        this.flowPath,
        // empty operations because it is many-to-many relationship; relationship will be created when operations are imported
        JSON.stringify(
          flows.map(this.setUserNull).map(this.emptyOperations),
          null,
          2
        )
      );

      // Track the number of items exported
      const totalItems = operations.length + flows.length;
      this.metadataManager.updateItemsCount(jobType, totalItems);

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log(`Flows exported to ${this.flowPath}`);
      console.log(`Operations exported to ${this.operationPath}`);
      console.log(
        `Exported ${flows.length} flows and ${operations.length} operations`
      );
    } catch (error) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error("Error exporting flows:", error);
      throw error;
    }
  };

  importFlows = async () => {
    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "flows";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "import",
      status: "running",
      createdAt: now,
    });

    try {
      await this.handleImportFlows();
      await this.handleImportOperations();

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log("Flows and operations imported successfully.");
    } catch (error) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error("Error importing flows:", error);
      throw error;
    }
  };

  private async handleImportFlows() {
    const incompingFlows = JSON.parse(readFileSync(this.flowPath, "utf8"));
    const destinationFlows = await client.request(readFlows());

    for (const flow of incompingFlows) {
      const existingFlow = destinationFlows.find((f) => f.id === flow.id);
      if (existingFlow) {
        if (_.isEqual(existingFlow, flow)) {
          await client.request(updateFlow(flow.id, flow));
        }
      } else {
        await client.request(createFlow(flow));
      }
    }

    const diffFlows = _.differenceBy(destinationFlows, incompingFlows, "id");
    if (diffFlows.length) {
      await client.request(deleteFlows(diffFlows.map((f) => f.id)));
    }
  }

  private async handleImportOperations() {
    const incomingOperations = JSON.parse(
      readFileSync(this.operationPath, "utf8")
    );
    const destinationOperations = await client.request(readOperations());

    // Sort operations based on dependencies
    const sortedOperations =
      this.sortOperationsByDependency(incomingOperations);

    for (const operation of sortedOperations) {
      const existingOperation = destinationOperations.find(
        (o) => o.id === operation.id
      );
      if (existingOperation) {
        if (!_.isEqual(existingOperation, operation)) {
          await client.request(updateOperation(operation.id, operation));
        }
      } else {
        await client.request(createOperation(operation));
      }
    }

    const diffOperations = _.differenceBy(
      destinationOperations,
      incomingOperations,
      "id"
    );
    if (diffOperations.length) {
      await client.request(deleteOperations(diffOperations.map((o) => o.id)));
    }

    // Update the item count after import
    const totalItems =
      incomingOperations.length +
      JSON.parse(readFileSync(this.flowPath, "utf8")).length;
    this.metadataManager.updateItemsCount("flows", totalItems);
  }

  private sortOperationsByDependency(
    operations: DirectusOperation[]
  ): DirectusOperation[] {
    const sorted: DirectusOperation[] = [];
    const visited = new Set<string>();

    // First, add all operations with no dependencies
    operations.forEach((operation) => {
      if (!operation.resolve && !operation.reject) {
        sorted.push(operation);
        visited.add(operation.id);
      }
    });

    // Then, repeatedly find and add operations whose dependencies are satisfied
    let added: boolean;
    do {
      added = false;
      operations.forEach((operation) => {
        if (!visited.has(operation.id)) {
          const dependencies = [operation.resolve, operation.reject].filter(
            (dep): dep is string => dep !== null
          );
          if (dependencies.every((depId) => visited.has(depId))) {
            sorted.push(operation);
            visited.add(operation.id);
            added = true;
          }
        }
      });
    } while (added);

    return sorted;
  }
}
