#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { FlowsManager } from "./flows";
import pkg from "../package.json";
import { RolesManager } from "./roles";
import { SettingsManager } from "./settings";
import { FilesManager } from "./files";
import { SchemaManager } from "./schema";
import { printConfig, client } from "./helper";
import { readMe } from "@directus/sdk";
import checkEnvironment from "./utils/checkEnv";
import { AuditManager } from "./audit";
import { ConfigType } from "./types/generic";

interface BaseManager {
  exportFlows?: () => Promise<void>;
  exportRoles?: () => Promise<void>;
  exportSettings?: () => Promise<void>;
  exportFiles?: () => Promise<void>;
  exportSchema?: () => Promise<void>;
  importFlows?: (dryRun?: boolean) => Promise<void>;
  importRoles?: (dryRun?: boolean) => Promise<void>;
  importSettings?: (dryRun?: boolean) => Promise<void>;
  importFiles?: (dryRun?: boolean) => Promise<void>;
  importSchema?: (dryRun?: boolean) => Promise<void>;
}

const managers: Record<ConfigType, BaseManager> = {
  flows: new FlowsManager(),
  roles: new RolesManager(),
  settings: new SettingsManager(),
  files: new FilesManager(),
  schema: new SchemaManager(),
};

const auditManager = new AuditManager();

const supportedTypes = Object.keys(managers) as ConfigType[];

const program = new Command();

program
  .name("directus-config-toolkit")
  .description("CLI tool for managing Directus configurations")
  .version(pkg.version);

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
  .option("--dry-run", "Preview changes without applying them")
  .action(async (type: ConfigType, options) => {
    try {
      const manager = managers[type];
      const importMethod =
        manager[
          `import${
            type.charAt(0).toUpperCase() + type.slice(1)
          }` as keyof BaseManager
        ];

      if (typeof importMethod === "function") {
        await (importMethod as any)(options.dryRun);
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

const auditCommand = program
  .command("audit")
  .description("Audit and diff configuration snapshots");

auditCommand
  .command("list <type>")
  .description("List all snapshots for a config type")
  .action(async (type: string) => {
    const snapshots = await auditManager.getSnapshots(type);
    if (snapshots.length === 0) {
      console.log(`No snapshots found for type: ${type}`);
      return;
    }
    console.log(`Snapshots for ${type}:`);
    snapshots.forEach((snap, idx) => {
      console.log(`${idx + 1}. ${snap.id}`);
    });
  });

auditCommand
  .command("diff <type> <idx1> <idx2>")
  .description("Show a diff between two snapshots by index (see 'audit list')")
  .action(async (type: string, idx1: string, idx2: string) => {
    const snapshots = await auditManager.getSnapshots(type);
    const i1 = parseInt(idx1, 10) - 1;
    const i2 = parseInt(idx2, 10) - 1;
    if (
      isNaN(i1) ||
      isNaN(i2) ||
      i1 < 0 ||
      i2 < 0 ||
      i1 >= snapshots.length ||
      i2 >= snapshots.length
    ) {
      console.error("Invalid snapshot indices.");
      process.exit(1);
    }
    const diff = await auditManager.diffSnapshots(
      snapshots[i1].path,
      snapshots[i2].path
    );
    console.log(diff);
  });

auditCommand
  .command("timemachine <type>")
  .description(
    "Show a time machine diff for a config type (all consecutive diffs)"
  )
  .option("--limit <n>", "Limit to last N diffs", parseInt)
  .option("--start-time <iso>", "Only show diffs after this ISO date/time")
  .action(async (type: string, options) => {
    await auditManager.printTimeMachineDiff(type, {
      limit: options.limit,
      startTime: options.startTime,
    });
  });

auditCommand
  .command("import-diffs <type>")
  .description("Show latest import diff for a config type (preview vs actual)")
  .action(async (type: string) => {
    await auditManager.printImportDiffs(type);
  });

program
  .command("debug")
  .description("Debug connection and authentication issues")
  .action(async () => {
    try {
      printConfig(); // This will show basic configuration

      // Add more thorough connection testing
      console.log("Performing additional diagnostics...");

      // First test the connection without auth
      try {
        const response = await fetch(`${process.env.DCT_API_URL}/server/ping`);
        if (response.ok) {
          console.log("✅ Connection successful");
        } else {
          console.log(`❌ Connection failed with status: ${response.status}`);
        }
      } catch (error: any) {
        console.log(`❌ Connection failed: ${error.message}`);
        console.log(
          "Please check that the Directus server is running at the specified URL."
        );
        return;
      }

      // Then test with auth
      try {
        // Use readMe imported at the top of the file
        await client.request(readMe());
        console.log(
          "✅ Authentication works - successfully retrieved current user"
        );
      } catch (error: any) {
        console.log("\n❌ Authentication test failed");
        console.log(`Error: ${error.message || "Unknown error"}`);

        if (error.response?.data) {
          console.log(
            "\nResponse data:",
            JSON.stringify(error.response.data, null, 2)
          );
        }

        console.log("\nTips:");
        console.log("1. Check that your token is valid and has not expired");
        console.log("2. Verify the API URL is correct and accessible");
        console.log("3. Make sure the token has sufficient permissions");
        console.log(
          "\nIf using a .env file, check that it's being loaded correctly:"
        );
        console.log("- File should be in the current working directory");
        console.log("- File should be named .env");
        console.log("- Variables should be in format: DCT_TOKEN=your_token");
      }
    } catch (error) {
      console.error("Debug check failed:", error);
      process.exit(1);
    }
  });

program
  .command("debug-env")
  .description(
    "Run detailed environment checks to diagnose configuration issues"
  )
  .action(async () => {
    try {
      await checkEnvironment();
    } catch (error) {
      console.error("Environment check failed:", error);
      process.exit(1);
    }
  });

program.parse();
