#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { FlowsManager } from "./flows";
import { RolesManager } from "./roles";
import { SettingsManager } from "./settings";
import { FilesManager } from "./files";
import { SchemaManager } from "./schema";
import { printConfig } from "./helper";

type ConfigType = "flows" | "roles" | "settings" | "files" | "schema";

interface BaseManager {
  exportFlows?: () => Promise<void>;
  exportRoles?: () => Promise<void>;
  exportSettings?: () => Promise<void>;
  exportFiles?: () => Promise<void>;
  exportSchema?: () => Promise<void>;
  importFlows?: () => Promise<void>;
  importRoles?: () => Promise<void>;
  importSettings?: () => Promise<void>;
  importFiles?: () => Promise<void>;
  importSchema?: () => Promise<void>;
}

const managers: Record<ConfigType, BaseManager> = {
  flows: new FlowsManager(),
  roles: new RolesManager(),
  settings: new SettingsManager(),
  files: new FilesManager(),
  schema: new SchemaManager(),
};

const supportedTypes = Object.keys(managers) as ConfigType[];

const program = new Command();

program
  .name("directus-ct")
  .description("CLI tool for managing Directus configurations")
  .version("1.0.0");

function validateType(value: string): ConfigType {
  if (supportedTypes.includes(value as ConfigType)) {
    return value as ConfigType;
  } else {
    console.error(
      `Invalid type: ${value}. Supported types are: ${supportedTypes.join(
        ", "
      )}`
    );
    process.exit(1);
  }
}

program
  .command("export")
  .description("Export configuration")
  .argument("<type>", "Type of configuration to export", validateType)
  .action(async (type: ConfigType) => {
    try {
      const manager = managers[type];
      const exportMethod =
        manager[
          `export${
            type.charAt(0).toUpperCase() + type.slice(1)
          }` as keyof BaseManager
        ];

      if (typeof exportMethod === "function") {
        await exportMethod();
      } else {
        throw new Error(`Export not implemented for type: ${type}`);
      }
    } catch (error) {
      console.error("Export failed:", error);
      process.exit(1);
    }
  });

program
  .command("import")
  .description("Import configuration")
  .argument("<type>", "Type of configuration to import", validateType)
  .action(async (type: ConfigType) => {
    try {
      const manager = managers[type];
      const importMethod =
        manager[
          `import${
            type.charAt(0).toUpperCase() + type.slice(1)
          }` as keyof BaseManager
        ];

      if (typeof importMethod === "function") {
        await importMethod();
      } else {
        throw new Error(`Import not implemented for type: ${type}`);
      }
    } catch (error) {
      console.error("Import failed:", error);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Print API token and URL from environment")
  .action(printConfig);

const SYNC_SEQUENCE: ConfigType[] = [
  "schema",
  "files",
  "settings",
  "roles",
  "flows",
];

program
  .command("export-all")
  .description("Export all configurations in sequence")
  .action(async () => {
    console.log("Running sync sequence:", SYNC_SEQUENCE.join(" -> "));
    try {
      for (const type of SYNC_SEQUENCE) {
        console.log(`Exporting ${type}...`);
        const manager = managers[type];
        const exportMethod =
          manager[
            `export${
              type.charAt(0).toUpperCase() + type.slice(1)
            }` as keyof BaseManager
          ];

        if (typeof exportMethod === "function") {
          await exportMethod();
        } else {
          console.warn(`Export not implemented for type: ${type}, skipping...`);
        }
      }
      console.log("All exports completed successfully");
    } catch (error) {
      console.error("Export-all failed:", error);
      process.exit(1);
    }
  });

program
  .command("import-all")
  .description("Import all configurations in sequence")
  .action(async () => {
    console.log("Running sync sequence:", SYNC_SEQUENCE.join(" -> "));
    try {
      for (const type of SYNC_SEQUENCE) {
        console.log(`Importing ${type}...`);
        const manager = managers[type];
        const importMethod =
          manager[
            `import${
              type.charAt(0).toUpperCase() + type.slice(1)
            }` as keyof BaseManager
          ];

        if (typeof importMethod === "function") {
          await importMethod();
        } else {
          console.warn(`Import not implemented for type: ${type}, skipping...`);
        }
      }
      console.log("All imports completed successfully");
    } catch (error) {
      console.error("Import-all failed:", JSON.stringify(error));
      process.exit(1);
    }
  });

program.parse();
