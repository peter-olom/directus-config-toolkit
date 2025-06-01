import { schemaApply, schemaDiff, schemaSnapshot } from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import _ from "lodash";
import { MetadataManager, ConfigType } from "./metadata";
import { v4 as uuidv4 } from "uuid";

export class SchemaManager {
  private schemaPath: string = join(CONFIG_PATH, "schema.json");
  private metadataManager: MetadataManager;

  constructor() {
    this.metadataManager = new MetadataManager();
  }

  exportSchema = async () => {
    ensureConfigDirs();

    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "schema";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "export",
      status: "running",
      createdAt: now,
    });

    try {
      const snapshot = await client.request(schemaSnapshot());
      writeFileSync(this.schemaPath, JSON.stringify(snapshot, null, 2));

      // Update schema items count - count collections and fields
      let itemsCount = 0;

      if (snapshot.collections) {
        itemsCount += snapshot.collections.length;
      }

      if (snapshot.fields) {
        itemsCount += snapshot.fields.length;
      }

      // Track the number of items exported
      this.metadataManager.updateItemsCount(jobType, itemsCount);

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log(`Schema exported to ${this.schemaPath}`);
    } catch (error) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error("Error exporting schema:", error);
      throw error;
    }
  };

  importSchema = async () => {
    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "schema";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "import",
      status: "running",
      createdAt: now,
    });

    try {
      await this.handleImporSchema();

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log("Collections imported successfully.");
    } catch (error: any) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error(
        `Schema import failed: ${error.message || JSON.stringify(error)}`
      );
      throw error;
    }
  };

  private async handleImporSchema() {
    try {
      const vcSchema = JSON.parse(readFileSync(this.schemaPath, "utf8"));

      console.log("Checking schema differences...");
      // check schema differences
      const diffSchema = await client.request(schemaDiff(vcSchema));

      if (_.isEmpty(diffSchema)) {
        console.log("No schema differences found.");
        return;
      }

      console.log("Applying schema differences...");
      // apply schema differences
      await client.request(schemaApply(diffSchema));

      // Update the item count
      let itemsCount = 0;
      if (vcSchema.collections) {
        itemsCount += vcSchema.collections.length;
      }
      if (vcSchema.fields) {
        itemsCount += vcSchema.fields.length;
      }
      this.metadataManager.updateItemsCount("schema", itemsCount);
    } catch (error: any) {
      // Handle connection errors with detailed messages
      if (
        error.message?.includes("ECONNREFUSED") ||
        error.code === "ECONNREFUSED"
      ) {
        console.error(
          `Connection refused - check that the Directus server is running at ${
            process.env.DIRECTUS_CT_URL || "http://localhost:8055"
          }`
        );
      } else if (error.response?.status === 403) {
        console.error(
          "Permission denied - check that your token has proper permissions"
        );
      }
      throw error;
    }
  }
}
