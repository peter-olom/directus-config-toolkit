// Audit-related CLI commands
import { Command } from "commander";
import { AuditManager } from "../audit";

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
}
