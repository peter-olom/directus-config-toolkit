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
    await this.handleImporSchema();
    console.log("Collections imported successfully.");
  };

  private async handleImporSchema() {
    const vcSchema = JSON.parse(readFileSync(this.schemaPath, "utf8"));

    // check schema differences
    const diffSchema = await client.request(schemaDiff(vcSchema));

    if (_.isEmpty(diffSchema)) {
      console.log("No schema differences found.");
      return;
    }

    // apply schema differences
    await client.request(schemaApply(diffSchema));
  }
}
