import { schemaApply, schemaDiff, schemaSnapshot } from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import _ from "lodash";
import { AuditManager } from "./audit";

export class SchemaManager {
  private schemaPath: string = join(CONFIG_PATH, "schema.json");
  private auditManager: AuditManager = new AuditManager();

  private async auditExport(schema: any) {
    const schemaSnapshotPath = await this.auditManager.storeSnapshot(
      "schema",
      schema
    );
    await this.auditManager.log({
      operation: "export",
      manager: "SchemaManager",
      itemType: "schema",
      status: "success",
      message: `Exported schema with ${
        schema.collections?.length || 0
      } collections and ${schema.fields?.length || 0} fields`,
      snapshotFile: schemaSnapshotPath,
    });
  }

  exportSchema = async () => {
    ensureConfigDirs();
    try {
      const snapshot = await client.request(schemaSnapshot());
      writeFileSync(this.schemaPath, JSON.stringify(snapshot, null, 2));
      await this.auditExport(snapshot);
      console.log(`Schema exported to ${this.schemaPath}`);
    } catch (error) {
      console.error("Error exporting schema:", error);
      throw error;
    }
  };

  private async auditImport(dryRun = false) {
    const localSchema = JSON.parse(readFileSync(this.schemaPath, "utf8"));
    await this.auditManager.auditImportOperation(
      "schema",
      "SchemaManager",
      localSchema,
      async () => await this.fetchRemoteSchema(),
      async () => {
        await this.handleImporSchema();
        return {
          status: "success",
          message: "Schema imported successfully.",
        };
      },
      dryRun
    );
  }

  importSchema = async (dryRun = false) => {
    await this.auditImport(dryRun);
    if (!dryRun) {
      console.log("Schema imported successfully.");
    } else {
      console.log("[Dry Run] Import preview complete. No changes applied.");
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
    } catch (error: any) {
      // Handle connection errors with detailed messages
      if (
        error.message?.includes("ECONNREFUSED") ||
        error.code === "ECONNREFUSED"
      ) {
        console.error(
          `Connection refused - check that the Directus server is running at ${
            process.env.DCT_API_URL || "http://localhost:8055"
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

  normalizeSchemaItem(item: any) {
    // Nullify user_created and any other environment-specific fields
    const i = { ...item };
    if (i["user_created"]) i["user_created"] = null;
    return i;
  }

  private async fetchRemoteSchema() {
    // You may need to adjust this if schema is more complex
    const schema = await client.request(schemaSnapshot());
    // If schema is an object with collections/fields arrays, normalize each
    if (schema.collections)
      schema.collections = schema.collections.map((c: any) =>
        this.normalizeSchemaItem(c)
      );
    if (schema.fields)
      schema.fields = schema.fields.map((f: any) =>
        this.normalizeSchemaItem(f)
      );
    return schema;
  }
}
