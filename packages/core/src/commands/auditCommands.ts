// Audit-related CLI commands
import { Command } from "commander";
import { AuditManager } from "../audit";
import * as fs from "fs-extra";
import * as path from "path";

export function registerAuditCommands(program: Command) {
  const auditManager = new AuditManager();
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
    .description(
      "Show a diff between two snapshots by index (see 'audit list')"
    )
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
    .description(
      "Show latest import diff for a config type (preview vs actual)"
    )
    .action(async (type: string) => {
      await auditManager.printImportDiffs(type);
    });

  auditCommand
    .command("validate <type>")
    .description(
      "Validate snapshot consistency and integrity for a config type"
    )
    .action(async (type: string) => {
      try {
        const snapshots = await auditManager.getSnapshots(type);

        if (snapshots.length === 0) {
          console.log(`No snapshots found for type: ${type}`);
          return;
        }

        console.log(
          `🔍 Validating ${snapshots.length} snapshots for ${type}...`
        );

        let validCount = 0;
        let invalidCount = 0;

        for (const snapshot of snapshots) {
          try {
            // Try to read snapshot as enhanced format
            const data = await fs.readJson(snapshot.path);

            if (data.metadata && data.data) {
              // Enhanced snapshot format
              const checksum = require("crypto")
                .createHash("sha256")
                .update(JSON.stringify(data.data, null, 0))
                .digest("hex");

              if (checksum === data.metadata.checksum) {
                console.log(`✅ ${snapshot.id} - Valid enhanced snapshot`);
                validCount++;
              } else {
                console.log(`❌ ${snapshot.id} - Checksum mismatch`);
                invalidCount++;
              }
            } else {
              // Legacy format
              console.log(`⚠️  ${snapshot.id} - Legacy format (no metadata)`);
              validCount++;
            }
          } catch (error: any) {
            console.log(`❌ ${snapshot.id} - Corrupted: ${error.message}`);
            invalidCount++;
          }
        }

        console.log(`\n📊 Validation Summary:`);
        console.log(`   Valid snapshots: ${validCount}`);
        console.log(`   Invalid snapshots: ${invalidCount}`);
        console.log(`   Total snapshots: ${snapshots.length}`);

        if (invalidCount > 0) {
          process.exit(1);
        }
      } catch (error: any) {
        console.error(`Failed to validate snapshots: ${error.message}`);
        process.exit(1);
      }
    });

  auditCommand
    .command("integrity-check")
    .description("Perform full data integrity check across all config types")
    .action(async () => {
      const configTypes = [
        "flows",
        "roles",
        "policies",
        "permissions",
        "access",
        "files",
        "folders",
        "operations",
        "schema",
        "settings",
      ];

      console.log(`🔍 Performing comprehensive integrity check...`);

      let totalValid = 0;
      let totalInvalid = 0;

      for (const type of configTypes) {
        const snapshots = await auditManager.getSnapshots(type);

        if (snapshots.length === 0) {
          console.log(`   ${type}: No snapshots`);
          continue;
        }

        let validCount = 0;
        let invalidCount = 0;

        for (const snapshot of snapshots) {
          try {
            const data = await fs.readJson(snapshot.path);

            if (data.metadata && data.data) {
              const checksum = require("crypto")
                .createHash("sha256")
                .update(JSON.stringify(data.data, null, 0))
                .digest("hex");

              if (checksum === data.metadata.checksum) {
                validCount++;
              } else {
                invalidCount++;
              }
            } else {
              validCount++; // Legacy format considered valid
            }
          } catch {
            invalidCount++;
          }
        }

        const status = invalidCount > 0 ? "❌" : validCount > 0 ? "✅" : "⚪";
        console.log(
          `   ${status} ${type}: ${validCount} valid, ${invalidCount} invalid`
        );

        totalValid += validCount;
        totalInvalid += invalidCount;
      }

      console.log(`\n📊 Overall Integrity Status:`);
      console.log(`   Total valid snapshots: ${totalValid}`);
      console.log(`   Total invalid snapshots: ${totalInvalid}`);

      if (totalInvalid > 0) {
        console.log(
          `\n⚠️  Found ${totalInvalid} corrupted snapshots. Consider running repair operations.`
        );
        process.exit(1);
      } else {
        console.log(`\n✅ All snapshots are valid!`);
      }
    });
}
