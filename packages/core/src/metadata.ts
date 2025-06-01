import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { CONFIG_PATH } from "./helper";

export type ConfigType =
  | "flows"
  | "roles"
  | "settings"
  | "files"
  | "schema"
  | "snapshots";

/**
 * Interface for metadata entry
 */
export interface MetadataEntry {
  type: ConfigType;
  itemsCount: number;
  lastSync: string;
  status: "synced" | "pending" | "conflict";
}

/**
 * Interface for sync job entry
 */
export interface SyncJobEntry {
  id: string;
  type: ConfigType;
  direction: "import" | "export";
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * Interface for the metadata file structure
 */
export interface Metadata {
  configs: Record<ConfigType, MetadataEntry>;
  jobs: SyncJobEntry[];
}

/**
 * Class for managing metadata including history and item counts
 */
export class MetadataManager {
  private metadataPath: string = join(CONFIG_PATH, "metadata.json");
  private metadata: Metadata = {
    configs: {
      flows: { type: "flows", itemsCount: 0, lastSync: "", status: "pending" },
      roles: { type: "roles", itemsCount: 0, lastSync: "", status: "pending" },
      settings: {
        type: "settings",
        itemsCount: 0,
        lastSync: "",
        status: "pending",
      },
      files: { type: "files", itemsCount: 0, lastSync: "", status: "pending" },
      schema: {
        type: "schema",
        itemsCount: 0,
        lastSync: "",
        status: "pending",
      },
      snapshots: {
        type: "snapshots",
        itemsCount: 0,
        lastSync: "",
        status: "pending",
      },
    },
    jobs: [],
  };

  constructor() {
    this.loadMetadata();
  }

  /**
   * Load metadata from file or create if doesn't exist
   */
  private loadMetadata(): void {
    if (existsSync(this.metadataPath)) {
      try {
        const data = readFileSync(this.metadataPath, "utf8");
        this.metadata = JSON.parse(data);
      } catch (error) {
        console.error("Error reading metadata file:", error);
        this.saveMetadata(); // Create the file if it can't be parsed
      }
    } else {
      this.saveMetadata(); // Create the file if it doesn't exist
    }
  }

  /**
   * Save metadata to file
   */
  private saveMetadata(): void {
    try {
      writeFileSync(this.metadataPath, JSON.stringify(this.metadata, null, 2));
    } catch (error) {
      console.error("Error saving metadata file:", error);
    }
  }

  /**
   * Get all config statuses
   */
  public getConfigStatuses(): MetadataEntry[] {
    this.loadMetadata();
    return Object.values(this.metadata.configs);
  }

  /**
   * Get config status for a specific type
   */
  public getConfigStatus(type: ConfigType): MetadataEntry {
    this.loadMetadata();
    return this.metadata.configs[type];
  }

  /**
   * Update config status
   */
  public updateConfigStatus(
    type: ConfigType,
    updates: Partial<MetadataEntry>
  ): void {
    this.metadata.configs[type] = {
      ...this.metadata.configs[type],
      ...updates,
    };
    this.saveMetadata();
  }

  /**
   * Update items count for a specific type
   */
  public updateItemsCount(type: ConfigType, count: number): void {
    this.updateConfigStatus(type, { itemsCount: count });
  }

  /**
   * Update sync status for a specific type
   */
  public updateSyncStatus(
    type: ConfigType,
    status: "synced" | "pending" | "conflict",
    timestamp: string = new Date().toISOString()
  ): void {
    this.updateConfigStatus(type, { status, lastSync: timestamp });
  }

  /**
   * Get all sync jobs
   */
  public getSyncJobs(): SyncJobEntry[] {
    this.loadMetadata();
    return this.metadata.jobs;
  }

  /**
   * Add a new sync job
   */
  public addSyncJob(job: SyncJobEntry): void {
    this.metadata.jobs.unshift(job);
    // Limit history to 100 entries
    if (this.metadata.jobs.length > 100) {
      this.metadata.jobs = this.metadata.jobs.slice(0, 100);
    }
    this.saveMetadata();
  }

  /**
   * Update sync job status
   */
  public updateSyncJob(jobId: string, updates: Partial<SyncJobEntry>): void {
    const index = this.metadata.jobs.findIndex((job) => job.id === jobId);
    if (index !== -1) {
      this.metadata.jobs[index] = {
        ...this.metadata.jobs[index],
        ...updates,
      };
      this.saveMetadata();
    }
  }

  /**
   * Complete a sync job
   */
  public completeSyncJob(
    jobId: string,
    success: boolean,
    error?: string
  ): void {
    this.updateSyncJob(jobId, {
      status: success ? "completed" : "failed",
      completedAt: new Date().toISOString(),
      error: error,
    });
  }

  /**
   * Check for snapshots and update metadata
   */
  public async checkForSnapshots(): Promise<void> {
    const snapshotDir = join(CONFIG_PATH, "snapshot");
    console.log("Checking for snapshots in:", snapshotDir);
    try {
      if (existsSync(snapshotDir)) {
        const files = readdirSync(snapshotDir);
        const snapshotCount = files.filter((f) => f.endsWith(".json")).length;
        this.updateConfigStatus("snapshots", {
          itemsCount: snapshotCount,
          lastSync: new Date().toISOString(),
          status: snapshotCount > 0 ? "synced" : "pending",
        });
      } else {
        this.updateConfigStatus("snapshots", {
          itemsCount: 0,
          lastSync: "",
          status: "pending",
        });
      }
    } catch (error) {
      console.error("Error checking snapshots:", error);
      this.updateConfigStatus("snapshots", {
        itemsCount: 0,
        lastSync: "",
        status: "pending",
      });
    }
  }
}
