import { schemaApply, schemaDiff, schemaSnapshot } from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { client, ensureConfigDirs, callDirectusAPI } from "./helper";
import _ from "lodash";
import { BaseConfigManager, FieldExclusionConfig } from "./base-config-manager";

interface DirectusSchema {
  collections?: any[];
  fields?: any[];
  relations?: any[];
  [key: string]: any;
}

export class SchemaManager extends BaseConfigManager<DirectusSchema> {
  protected readonly configType = "schema";
  protected readonly defaultFilename = "schema.json";

  constructor() {
    // Schema typically doesn't need field exclusions
    const fieldConfig: FieldExclusionConfig = {};

    super(fieldConfig);
    this.initializeConfigPath();
  }

  protected async fetchRemoteData(): Promise<DirectusSchema[]> {
    const snapshot = await client.request(schemaSnapshot());
    // Schema is a single object, but we wrap it in an array for consistency with BaseConfigManager
    return [snapshot];
  }

  private async auditExport(schema: DirectusSchema) {
    const schemaSnapshotPath = await this.storeEnhancedSnapshot([schema]);
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

  public async exportConfig(): Promise<void> {
    ensureConfigDirs();
    try {
      const schemas = await this.fetchRemoteData();
      const schema = schemas[0]; // Schema is always a single object

      writeFileSync(this.configPath, JSON.stringify(schema, null, 2));
      await this.auditExport(schema);
      console.log(`Schema exported to ${this.configPath}`);
    } catch (error) {
      console.error("Error exporting schema:", error);
      throw error;
    }
  }

  private async auditImport(dryRun = false, force = false) {
    const localSchema = JSON.parse(readFileSync(this.configPath, "utf8"));
    await this.auditManager.auditImportOperation(
      "schema",
      "SchemaManager",
      localSchema,
      async () => await this.fetchRemoteSchema(),
      async () => {
        await this.handleImporSchema(force);
        return {
          status: "success",
          message: "Schema imported successfully.",
        };
      },
      dryRun
    );
  }

  public async importConfig(
    dryRun = false,
    force = false
  ): Promise<{ status: "success" | "failure"; message?: string }> {
    try {
      await this.auditImport(dryRun, force);
      if (!dryRun) {
        console.log("Schema imported successfully.");
      } else {
        console.log("[Dry Run] Import preview complete. No changes applied.");
      }
      return { status: "success", message: "Schema imported successfully." };
    } catch (error: any) {
      console.error("Error importing schema:", error);
      return { status: "failure", message: error.message };
    }
  }

  // Legacy method names for backward compatibility
  exportSchema = () => this.exportConfig();
  importSchema = (dryRun?: boolean, force?: boolean) => this.importConfig(dryRun, force);

  private async handleImporSchema(force = false) {
    try {
      const vcSchema = JSON.parse(readFileSync(this.configPath, "utf8"));

      console.log("Checking schema differences...");
      // check schema differences
      let diffSchema: any;
      if (force) {
        // When force is enabled, use axios to get diff with force query parameter
        diffSchema = await callDirectusAPI("schema/diff?force=true", "POST", vcSchema);
      } else {
        diffSchema = await client.request(schemaDiff(vcSchema));
      }

      if (_.isEmpty(diffSchema)) {
        console.log("No schema differences found.");
        return;
      }

      console.log("Applying schema differences...");
      if (force) {
        console.log("Using --force flag to bypass version and vendor checks.");
        // When force is enabled, use axios to apply schema with force query parameter
        await callDirectusAPI("schema/apply?force=true", "POST", diffSchema);
      } else {
        // Normal schema apply without force
        await client.request(schemaApply(diffSchema));
      }
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
