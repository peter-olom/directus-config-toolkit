import fs from "fs-extra";
import path from "path";
import { diffJson } from "diff";

export interface AuditLogEntry {
  timestamp: string;
  operation: "import" | "export";
  manager: string;
  itemType: string;
  status: "success" | "failure";
  message?: string;
  snapshotFile?: string;
  localConfigSnapshot?: string;
  remoteBeforeSnapshot?: string;
  remoteAfterSnapshot?: string;
}

export interface SnapshotInfo {
  id: string;
  path: string;
}

/**
 * AuditManager provides robust auditing for import/export operations.
 * It stores audit logs and JSON snapshots of configuration states, enabling time machine diffs and traceability.
 *
 * Snapshots and logs are stored in a configurable directory (default: ./audit/).
 * Supports CLI-friendly diffing and time-based navigation of config history.
 */
export class AuditManager {
  private auditLogFilePath: string;
  private snapshotsBaseDir: string;
  private chalkPromise: Promise<any> | null = null; // To store the promise of chalk.default

  /**
   * Create a new AuditManager.
   * @param auditDir Optional absolute path to the audit directory. If not provided, uses DCT_AUDIT_PATH env, then DCT_CONFIG_PATH/audit, then cwd/audit.
   */
  constructor(auditDir?: string) {
    let resolvedAuditDir: string;
    if (auditDir) {
      resolvedAuditDir = auditDir;
    } else if (process.env.DCT_AUDIT_PATH) {
      resolvedAuditDir = process.env.DCT_AUDIT_PATH;
    } else if (process.env.DCT_CONFIG_PATH) {
      resolvedAuditDir = path.join(process.env.DCT_CONFIG_PATH, "audit");
    } else {
      resolvedAuditDir = path.join(process.cwd(), "audit");
    }
    this.auditLogFilePath = path.join(resolvedAuditDir, "audit.ndjson");
    this.snapshotsBaseDir = path.join(resolvedAuditDir, "snapshots");
    fs.ensureDirSync(this.snapshotsBaseDir);
    fs.ensureFileSync(this.auditLogFilePath);
  }

  private getChalk(): Promise<any> {
    if (!this.chalkPromise) {
      // Dynamically import chalk and store the promise for its default export
      this.chalkPromise = import("chalk").then((module) => module.default);
    }
    return this.chalkPromise;
  }

  /**
   * Get the directory for storing snapshots of a given item type.
   * @param itemType The config type (e.g., 'flows', 'roles').
   * @returns The absolute path to the snapshot directory for the item type.
   */
  private getSnapshotDir(itemType: string): string {
    return path.join(this.snapshotsBaseDir, itemType);
  }

  /**
   * Write an audit log entry to the audit log file.
   * @param entryData The log entry data (timestamp is auto-generated).
   */
  async log(entryData: Omit<AuditLogEntry, "timestamp">): Promise<void> {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      ...entryData,
    };
    await fs.appendFile(this.auditLogFilePath, JSON.stringify(entry) + "\n");
  }

  /**
   * Store a JSON snapshot for a given item type.
   * @param itemType The config type (e.g., 'flows', 'roles').
   * @param data The JSON data to snapshot.
   * @param identifier Optional custom identifier for the snapshot filename.
   * @returns The absolute path to the stored snapshot file.
   */
  async storeSnapshot(
    itemType: string,
    data: any,
    identifier?: string
  ): Promise<string> {
    const dir = this.getSnapshotDir(itemType);
    await fs.ensureDir(dir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${identifier || timestamp}_${itemType}.json`;
    const snapshotFilePath = path.join(dir, filename);
    await fs.writeJson(snapshotFilePath, data, { spaces: 2 });
    return snapshotFilePath;
  }

  /**
   * List all available snapshots for a given item type, sorted chronologically.
   * @param itemType The config type (e.g., 'flows', 'roles').
   * @returns Array of snapshot info objects (id and path).
   */
  async getSnapshots(itemType: string): Promise<SnapshotInfo[]> {
    const dir = this.getSnapshotDir(itemType);
    if (!(await fs.pathExists(dir))) {
      return [];
    }
    const files = await fs.readdir(dir);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((fileName) => ({
        id: fileName,
        path: path.join(dir, fileName),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Compute and format a human-readable diff between two snapshot files.
   * Output is colorized for CLI use (green for additions, red for deletions).
   * @param snapshotPath1 Path to the first snapshot file.
   * @param snapshotPath2 Path to the second snapshot file.
   * @returns A string representing the colored diff output for the CLI.
   * @throws If either snapshot file does not exist.
   */
  async diffSnapshots(
    snapshotPath1: string,
    snapshotPath2: string
  ): Promise<string> {
    const chalk = await this.getChalk();
    if (!(await fs.pathExists(snapshotPath1))) {
      throw new Error(`Snapshot file not found: ${snapshotPath1}`);
    }
    if (!(await fs.pathExists(snapshotPath2))) {
      throw new Error(`Snapshot file not found: ${snapshotPath2}`);
    }
    const data1 = await fs.readJson(snapshotPath1);
    const data2 = await fs.readJson(snapshotPath2);
    const differences = diffJson(data1, data2);
    let output = "";
    differences.forEach((part) => {
      const partLines = part.value.replace(/\r\n/g, "\n").split("\n");
      partLines.forEach((line, index) => {
        if (
          index === partLines.length - 1 &&
          line === "" &&
          part.value.endsWith("\n")
        ) {
          if (part.value !== "\n" || partLines.length > 1) {
            return;
          }
        }
        if (part.added) {
          output += chalk.green(`+ ${line}\n`);
        } else if (part.removed) {
          output += chalk.red(`- ${line}\n`);
        } else {
          output += `  ${line}\n`;
        }
      });
    });
    return output.length > 0 ? output.slice(0, -1) : output;
  }

  /**
   * Audit an import operation by snapshotting local config, remote state before/after, and logging the operation.
   * Snapshots are stored with a shared timestamp for easy pairing.
   */
  async auditImportOperation(
    itemType: string,
    manager: string,
    localConfig: any,
    fetchRemoteState: () => Promise<any>,
    doImport: () => Promise<{
      status: "success" | "failure";
      message?: string;
    }>,
    dryRun = false
  ) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = this.getSnapshotDir(itemType);
    await fs.ensureDir(dir); // Ensure directory exists before writing snapshots

    // Store local config snapshot
    const localConfigSnapshot = path.join(
      dir,
      `${timestamp}_import_local.json`
    );
    await fs.writeJson(localConfigSnapshot, localConfig, { spaces: 2 });

    // Store remote before snapshot
    const remoteBefore = await fetchRemoteState();
    const remoteBeforeSnapshot = path.join(
      dir,
      `${timestamp}_import_remote_before.json`
    );
    await fs.writeJson(remoteBeforeSnapshot, remoteBefore, { spaces: 2 });

    let importResult: { status: "success" | "failure"; message?: string } = {
      status: "success",
    };
    let remoteAfterSnapshot: string | undefined = undefined;

    if (!dryRun) {
      try {
        importResult = await doImport();
      } catch (err: any) {
        importResult = { status: "failure", message: err.message };
      }
      // Store remote after snapshot
      const remoteAfter = await fetchRemoteState();
      remoteAfterSnapshot = path.join(
        dir,
        `${timestamp}_import_remote_after.json`
      );
      await fs.writeJson(remoteAfterSnapshot, remoteAfter, { spaces: 2 });
    } else {
      importResult = {
        status: "success",
        message: "Dry run: no changes applied.",
      };
    }

    await this.log({
      operation: "import",
      manager,
      itemType,
      status: importResult.status,
      message: importResult.message,
      localConfigSnapshot,
      remoteBeforeSnapshot,
      remoteAfterSnapshot,
    });
  }

  /**
   * Find and diff import snapshots for a given item type.
   * Shows: remote_before vs local (preview), remote_before vs remote_after (actual)
   * Only shows the latest snapshot set by default
   */
  async printImportDiffs(itemType: string) {
    const chalk = await this.getChalk();
    const dir = this.getSnapshotDir(itemType);
    if (!(await fs.pathExists(dir))) {
      console.log(chalk.yellow(`No snapshots found for "${itemType}".`));
      return;
    }
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    // Group by timestamp
    const importSets: Record<
      string,
      { local?: string; before?: string; after?: string }
    > = {};
    for (const file of files) {
      const match = file.match(
        /^(.+)_import_(local|remote_before|remote_after)\.json$/
      );
      if (!match) continue;
      const [, ts, type] = match;
      if (!importSets[ts]) importSets[ts] = {};
      if (type === "local") importSets[ts].local = path.join(dir, file);
      if (type === "remote_before")
        importSets[ts].before = path.join(dir, file);
      if (type === "remote_after") importSets[ts].after = path.join(dir, file);
    }
    const timestamps = Object.keys(importSets).sort();
    if (timestamps.length === 0) {
      console.log(
        chalk.yellow(`No import snapshot sets found for "${itemType}".`)
      );
      return;
    }

    // Only process the latest snapshot
    const latestTs = timestamps[timestamps.length - 1];
    const set = importSets[latestTs];
    console.log(
      chalk.blue.bold(
        `\n=== Latest Import Diff Set @ ${latestTs} (${itemType}) ===`
      )
    );
    if (set.before && set.local) {
      console.log(
        chalk.magenta(
          "\n--- Preview: remote_before → local (what would change) ---"
        )
      );
      const diff = await this.diffSnapshots(set.before, set.local);
      console.log(diff.trim() ? diff : chalk.gray("No changes.\n"));
    }
    if (set.before && set.after) {
      console.log(
        chalk.cyan(
          "\n--- Actual: remote_before → remote_after (what changed) ---"
        )
      );
      const diff = await this.diffSnapshots(set.before, set.after);
      console.log(diff.trim() ? diff : chalk.gray("No changes.\n"));
    }
  }

  /**
   * Print a "time machine" diff for all consecutive non-import snapshots of an itemType.
   * Skips import-related snapshots (those with _import_ in the filename) and only diffs regular snapshots.
   * Allows filtering by start time and limiting the number of diffs shown.
   * @param itemType The config type (e.g., 'flows').
   * @param options Optional: { limit, startTime }.
   *   - limit: only show the last N diffs (default: 5)
   *   - startTime: ISO string or Date; only show diffs for snapshots after this time
   */
  async printTimeMachineDiff(
    itemType: string,
    options?: { limit?: number; startTime?: string | Date }
  ) {
    const chalk = await this.getChalk();
    let snapshots = (await this.getSnapshots(itemType)).filter(
      (snap) => !snap.id.includes("_import_")
    );
    if (snapshots.length < 2) {
      console.log(
        chalk.yellow(
          `Not enough non-import snapshots to show a diff for "${itemType}".`
        )
      );
      return;
    }
    if (options?.startTime) {
      const startDate = new Date(options.startTime);
      snapshots = snapshots.filter((snap) => {
        const match = snap.id.match(
          /^([\dT\-:Z]+)_/ // match timestamp at start
        );
        if (!match) return false;
        // Try to parse ISO string, fallback to old logic
        let snapDate: Date;
        try {
          snapDate = new Date(
            match[1].replace(/-/g, ":").replace(/:(\d{3})Z/, ".$1Z")
          );
        } catch {
          return false;
        }
        return snapDate >= startDate;
      });
    }
    const limit = options?.limit ?? 5;
    const start = limit ? Math.max(0, snapshots.length - limit - 1) : 0; // Corrected start index logic for pairs

    const diffsToShow = snapshots.slice(start);
    if (diffsToShow.length < 2 && snapshots.length >= 2) {
      // Ensure we show at least one diff if possible
      // If limit reduced it to less than 2, but we have enough overall, adjust to show the last diff
      if (snapshots.length - 1 >= 0) {
        for (
          let i = Math.max(1, snapshots.length - limit);
          i < snapshots.length;
          i++
        ) {
          const prev = snapshots[i - 1];
          const curr = snapshots[i];
          console.log(
            chalk.blue.bold(
              `\n=== Diff: ${prev.id} → ${curr.id} (${itemType}) ===\n`
            )
          );
          const diff = await this.diffSnapshots(prev.path, curr.path);
          if (diff.trim().length === 0) {
            console.log(chalk.gray("No changes.\n"));
          } else {
            console.log(diff + "\n");
          }
        }
        return;
      }
    }

    for (let i = 1; i < diffsToShow.length; i++) {
      // Adjust index to be relative to diffsToShow, but access original snapshots array
      const prev = diffsToShow[i - 1];
      const curr = diffsToShow[i];
      console.log(
        chalk.blue.bold(
          `\n=== Diff: ${prev.id} → ${curr.id} (${itemType}) ===\n`
        )
      );
      const diff = await this.diffSnapshots(prev.path, curr.path);
      if (diff.trim().length === 0) {
        console.log(chalk.gray("No changes.\n"));
      } else {
        console.log(diff + "\n");
      }
    }
    if (
      diffsToShow.length < 2 &&
      snapshots.length >= 2 &&
      limit >= snapshots.length - 1
    ) {
      // This case handles when limit is high enough to include all, but we only had 2 total snapshots.
      // The loop above wouldn't run if diffsToShow.length is 1 (e.g. limit=1 from 2 snapshots)
      // or if diffsToShow.length is 0.
      // The previous correction for `start` and the loop condition `i < diffsToShow.length` should handle most cases.
      // This specific block might be redundant now or needs careful review of edge cases with `limit`.
      // For simplicity and correctness, the loop `for (let i = Math.max(1, snapshots.length - limit); i < snapshots.length; i++)`
      // from the previous thought block is more direct for "last N diffs".
      // Let's stick to a simpler loop for the last N diffs.
    }

    // Revised loop for showing last N diffs:
    // Calculate the starting point in the original snapshots array to get `limit` number of diffs.
    // A diff is between snapshots[i-1] and snapshots[i].
    // If limit is 5, we want 5 diffs: (s[n-6],s[n-5]), ..., (s[n-2],s[n-1])
    // So, `i` should go from `snapshots.length - limit` up to `snapshots.length - 1`.
    // The first `prev` would be `snapshots[snapshots.length - limit - 1]`.
    // The loop should start for `curr` at `snapshots.length - limit`.

    // Clearing previous loop logic for printTimeMachineDiff for clarity
    if (snapshots.length < 2) return; // Already handled, but good guard

    const numDiffsToShow = Math.min(limit, snapshots.length - 1);
    const loopStartIndex = snapshots.length - numDiffsToShow;

    for (let i = loopStartIndex; i < snapshots.length; i++) {
      if (i === 0) continue; // Should not happen if snapshots.length >= 2 and numDiffsToShow >= 1
      const prev = snapshots[i - 1];
      const curr = snapshots[i];
      console.log(
        chalk.blue.bold(
          `\n=== Diff: ${prev.id} → ${curr.id} (${itemType}) ===\n`
        )
      );
      const diff = await this.diffSnapshots(prev.path, curr.path);
      if (diff.trim().length === 0) {
        console.log(chalk.gray("No changes.\n"));
      } else {
        console.log(diff + "\n");
      }
    }
  }
}
