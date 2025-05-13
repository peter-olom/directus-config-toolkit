import { schemaApply, schemaDiff, schemaSnapshot } from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import _ from "lodash";

export class SchemaManager {
  private schemaPath: string = join(CONFIG_PATH, "schema.json");

  exportSchema = async () => {
    ensureConfigDirs();

    const snapshot = await client.request(schemaSnapshot());
    writeFileSync(this.schemaPath, JSON.stringify(snapshot, null, 2));

    console.log(`Schema exported to ${this.schemaPath}`);
  };

  importSchema = async () => {
    try {
      await this.handleImporSchema();
      console.log("Collections imported successfully.");
    } catch (error: any) {
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
