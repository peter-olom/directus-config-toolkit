// Export/import commands for configuration types (schema, roles, settings, files, flows)
import { Command } from "commander";
import { ConfigType } from "../types/generic";
import { printConfig, callDirectusAPI } from "../helper";
import { managers, BaseManager, validateType } from "../utils/supportedTypes";
import { addBackupFieldToCollections } from "../utils/addBackupField";

const SYNC_SEQUENCE: ConfigType[] = [
  "schema",
  "roles",
  "files",
  "settings",
  "flows",
];

export function registerConfigCommands(program: Command) {
  program
    .command("config")
    .description("Print API token and URL from environment")
    .action(printConfig);

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
    .option("--force", "Force schema sync, bypassing version and vendor checks (schema only)")
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
          // For schema imports, pass both dryRun and force flags
          if (type === "schema") {
            await (importMethod as any)(options.dryRun, options.force);
          } else {
            await (importMethod as any)(options.dryRun);
          }
        } else {
          throw new Error(`Import not implemented for type: ${type}`);
        }
      } catch (error) {
        console.error("Import failed:", error);
        process.exit(1);
      }
    });

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
            console.warn(
              `Export not implemented for type: ${type}, skipping...`
            );
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
    .option("--force", "Force schema sync, bypassing version and vendor checks")
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
            // For schema imports, pass the force flag
            if (type === "schema") {
              await (importMethod as any)(false, options.force);
            } else {
              await importMethod();
            }
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

  program
    .command("add-backup-field")
    .description(
      "Add backup field (should_backup) to directus_files and directus_folders collections"
    )
    .option(
      "--field-name <name>",
      "Name for the backup field (must be 'shouldBackup' or 'should_backup')",
      "should_backup"
    )
    .option("--dry-run", "Preview the changes without applying them")
    .action(async (options) => {
      try {
        if (
          options.fieldName !== "shouldBackup" &&
          options.fieldName !== "should_backup"
        ) {
          console.error(
            "Error: --field-name must be either 'shouldBackup' or 'should_backup'."
          );
          process.exit(1);
        }
        await addBackupFieldToCollections({
          fieldName: options.fieldName,
          dryRun: options.dryRun,
        });
      } catch (error) {
        console.error("Failed to add backup field:", error);
        process.exit(1);
      }
    });
}
