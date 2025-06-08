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
 * AuditManager
 * robust auditing for import/export operations.
 * It stores audit logs and JSON snapshots of configuration states, enabling time machine diffs and traceability.
 *
 * Snapshots and logs are stored in a configurable directory (default: ./audit/).
 * Supports CLI-friendly diffing and time-based navigation of config history.
 */
export class AuditManager {
  private auditLogFilePath: string;
  private snapshotsBaseDir: string;
  private chalkPromise: Promise<any> | null = null; // To store the promise of chalk.default
  private retentionPeriodDays: number; // Number of days to keep snapshots

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

    // Set retention period from environment variable or default to 30 days
    const retentionDays = process.env.DCT_AUDIT_RETENTION_DAYS;
    this.retentionPeriodDays = retentionDays ? parseInt(retentionDays, 10) : 30;

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

    // Prune old snapshots after creating a new one
    await this.pruneOldSnapshots(itemType);

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

  /**
   * Prunes snapshots older than the retention period.
   * @param itemType Optional item type to prune. If not provided, prunes all item types.
   * @returns Number of snapshots removed.
   */
  async pruneOldSnapshots(itemType?: string): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionPeriodDays);

    let snapshotsRemoved = 0;

    // If itemType is provided, only prune that type
    if (itemType) {
      snapshotsRemoved = await this.pruneItemTypeSnapshots(
        itemType,
        cutoffDate
      );
    } else {
      // Otherwise, prune all item types
      try {
        const itemTypes = await fs.readdir(this.snapshotsBaseDir);
        for (const type of itemTypes) {
          const typePath = path.join(this.snapshotsBaseDir, type);
          const stats = await fs.stat(typePath);
          if (stats.isDirectory()) {
            snapshotsRemoved += await this.pruneItemTypeSnapshots(
              type,
              cutoffDate
            );
          }
        }
      } catch (err) {
        // Directory might not exist yet
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as any).code !== "ENOENT"
        ) {
          throw err;
        }
      }
    }

    return snapshotsRemoved;
  }

  /**
   * Parse a snapshot filename to extract its date.
   * @param snapshotId The snapshot filename
   * @returns A Date object representing the snapshot creation time
   */
  private parseSnapshotDate(snapshotId: string): Date {
    // Extract the timestamp part from the filename
    const fileSafeDate = snapshotId.split("_")[0];

    // Split into date and time parts at "T"
    const [datePart, timePart] = fileSafeDate.split("T");
    if (!timePart) throw new Error("Invalid date format");

    // Match the time part pattern: HH-mm-ss-mmmZ
    const match = timePart.match(/^(\d{2})-(\d{2})-(\d{2})-?(\d{3})Z$/);
    if (!match) throw new Error("Invalid time format");

    const [, hours, minutes, seconds, millis] = match;
    // Reconstitute the valid ISO date string: YYYY-MM-DDTHH:mm:ss.mmmZ
    const reconstituted = `${datePart}T${hours}:${minutes}:${seconds}.${millis}Z`;
    return new Date(reconstituted);
  }

  /**
   * Prunes snapshots for a specific item type that are older than the cutoff date.
   * @param itemType The item type to prune.
   * @param cutoffDate The date before which snapshots should be removed.
   * @returns Number of snapshots removed.
   */
  private async pruneItemTypeSnapshots(
    itemType: string,
    cutoffDate: Date
  ): Promise<number> {
    let removedCount = 0;
    const snapshots = await this.getSnapshots(itemType);

    // Define minimum number of regular snapshots and import sets to keep
    const MINIMUM_REGULAR_SNAPSHOTS = 3;
    const MINIMUM_IMPORT_SETS = 2;

    // Separate regular snapshots from import snapshots
    const regularSnapshots: SnapshotInfo[] = [];
    const importSnapshots: Record<string, SnapshotInfo[]> = {};

    for (const snapshot of snapshots) {
      const importMatch = snapshot.id.match(/^([\dT\-:Z]+)_import_/);
      if (importMatch) {
        // This is an import snapshot
        const timestamp = importMatch[1];
        if (!importSnapshots[timestamp]) {
          importSnapshots[timestamp] = [];
        }
        importSnapshots[timestamp].push(snapshot);
      } else {
        // This is a regular snapshot
        regularSnapshots.push(snapshot);
      }
    }

    // Sort regular snapshots by date (newest first)
    regularSnapshots.sort((a, b) => {
      try {
        const dateA = this.parseSnapshotDate(a.id);
        const dateB = this.parseSnapshotDate(b.id);
        return dateB.getTime() - dateA.getTime(); // Newest first
      } catch {
        return b.id.localeCompare(a.id); // Fallback to string comparison
      }
    });

    // Sort import snapshot sets by date (newest first)
    const importSets = Object.keys(importSnapshots).sort((a, b) =>
      b.localeCompare(a)
    );

    // We need to ensure we keep at least the minimum number of snapshots
    // regardless of their age
    let keptRegularCount = 0;
    let keptImportSetsCount = 0;

    // Check regular snapshots for pruning
    for (const snapshot of regularSnapshots) {
      try {
        const snapshotDate = this.parseSnapshotDate(snapshot.id);

        // Always keep at least MINIMUM_REGULAR_SNAPSHOTS regular snapshots
        if (keptRegularCount < MINIMUM_REGULAR_SNAPSHOTS) {
          keptRegularCount++;
          continue;
        }

        // Only prune snapshots that are older than the cutoff date
        if (snapshotDate < cutoffDate) {
          await fs.remove(snapshot.path);
          removedCount++;
        } else {
          keptRegularCount++;
        }
      } catch (err: any) {
        console.warn(`Could not parse timestamp for snapshot: ${snapshot.id}`);
        // Keep snapshots with unparseable timestamps just to be safe
        keptRegularCount++;
      }
    }

    // Check import sets for pruning
    for (const timestamp of importSets) {
      try {
        const snapshotDate = this.parseSnapshotDate(`${timestamp}_dummy`);

        // Always keep at least MINIMUM_IMPORT_SETS import sets
        if (keptImportSetsCount < MINIMUM_IMPORT_SETS) {
          keptImportSetsCount++;
          continue;
        }

        // Only prune import sets that are older than the cutoff date
        if (snapshotDate < cutoffDate) {
          // Prune all snapshots in this import set
          for (const snapshot of importSnapshots[timestamp]) {
            await fs.remove(snapshot.path);
            removedCount++;
          }
        } else {
          keptImportSetsCount++;
        }
      } catch (err: any) {
        console.warn(`Could not parse timestamp for import set: ${timestamp}`);
        // Keep import sets with unparseable timestamps just to be safe
        keptImportSetsCount++;
      }
    }

    return removedCount;
  }
}
