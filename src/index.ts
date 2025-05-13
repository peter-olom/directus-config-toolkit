#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { FlowsManager } from "./flows";
import { RolesManager } from "./roles";
import { SettingsManager } from "./settings";
import { FilesManager } from "./files";
import { SchemaManager } from "./schema";
import { SnapshotManager } from "./snapshot";
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

// Add snapshot manager separately as it's not part of the regular import/export cycle
const snapshotManager = new SnapshotManager();

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
  "roles", // Import roles before settings to avoid foreign key constraint issues
  "files",
  "settings",
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
  .option("--continue-on-error", "Continue import sequence if one type fails")
  .action(async (options) => {
    console.log("Running sync sequence:", SYNC_SEQUENCE.join(" -> "));
    const results: Record<string, { success: boolean; error?: any }> = {};

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
        try {
          await importMethod();
          console.log(`✅ Successfully imported ${type}`);
          results[type] = { success: true };
        } catch (error: any) {
          console.error(
            `❌ Failed to import ${type}:`,
            error.message || JSON.stringify(error)
          );
          results[type] = {
            success: false,
            error: error.message || JSON.stringify(error),
          };

          if (!options.continueOnError) {
            console.error(
              "Import-all failed. Use --continue-on-error to continue despite failures."
            );
            process.exit(1);
          }
        }
      } else {
        console.warn(`Import not implemented for type: ${type}, skipping...`);
        results[type] = { success: false, error: "Not implemented" };
      }
    }

    // Print summary
    console.log("\n=== Import Summary ===");
    let hasFailures = false;
    for (const [type, result] of Object.entries(results)) {
      if (result.success) {
        console.log(`✅ ${type}: Success`);
      } else {
        console.log(`❌ ${type}: Failed - ${result.error}`);
        hasFailures = true;
      }
    }

    if (hasFailures) {
      console.log("\nSome imports failed. Review logs above for details.");
      process.exit(1);
    } else {
      console.log("\nAll imports completed successfully");
    }
  });

// Add snapshot commands
program
  .command("snapshot")
  .description("Create and manage snapshots of Directus instance state")
  .command("create")
  .description("Create a snapshot of the current Directus instance state")
  .action(async () => {
    try {
      await snapshotManager.createSnapshot();
    } catch (error) {
      console.error("Snapshot creation failed:", error);
      process.exit(1);
    }
  });

program
  .command("snapshot")
  .command("compare")
  .description("Compare snapshot with configuration files")
  .action(async () => {
    try {
      await snapshotManager.compareWithConfig();
    } catch (error) {
      console.error("Snapshot comparison failed:", error);
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate configuration files for potential import issues")
  .action(async () => {
    try {
      await snapshotManager.findDuplicateIds();
    } catch (error) {
      console.error("Validation failed:", error);
      process.exit(1);
    }
  });

program.parse();
