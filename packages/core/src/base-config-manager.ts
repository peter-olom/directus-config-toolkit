import fs from "fs-extra";
import path from "path";
import { CONFIG_PATH } from "./helper";
import { AuditManager } from "./audit";

/**
 * Configuration for field exclusion patterns
 */
export interface FieldExclusionConfig {
  /** Fields to always exclude from export/import */
  excludeFields?: string[];
  /** Fields to set to null during normalization */
  nullifyFields?: string[];
  /** Many-to-many relationship fields to empty during export */
  emptyRelationFields?: string[];
  /** Fields that should be preserved exactly as-is */
  immutableFields?: string[];
}

/**
 * Metadata included with every snapshot
 */
export interface SnapshotMetadata {
  /** SHA-256 checksum of the normalized data */
  checksum: string;
  /** Timestamp when snapshot was created */
  timestamp: string;
  /** Version of the Directus Config Toolkit */
  dctVersion: string;
  /** Version of the Directus instance (if available) */
  directusVersion?: string;
  /** Configuration type (flows, roles, etc.) */
  configType: string;
  /** Number of items in the snapshot */
  itemCount: number;
  /** Dependencies identified in this snapshot */
  dependencies?: DependencyInfo[];
}

/**
 * Dependency information for configuration items
 */
export interface DependencyInfo {
  /** Type of dependency (flows->operations, roles->policies, etc.) */
  type: string;
  /** Source item ID */
  sourceId: string;
  /** Target item ID */
  targetId: string;
  /** Dependency relationship description */
  relationship: string;
}

/**
 * Enhanced snapshot structure with metadata
 */
export interface EnhancedSnapshot<T = any> {
  /** Snapshot metadata */
  metadata: SnapshotMetadata;
  /** The actual configuration data */
  data: T[];
}

/**
 * Abstract base class for all configuration managers
 * Provides standardized normalization, validation, and audit patterns
 */
export abstract class BaseConfigManager<T = Record<string, any>> {
  protected auditManager: AuditManager;
  protected configPath: string;
  protected fieldConfig: FieldExclusionConfig;

  /** Configuration type identifier (flows, roles, etc.) */
  protected abstract readonly configType: string;

  /** Default filename for this configuration type */
  protected abstract readonly defaultFilename: string;

  constructor(fieldConfig: FieldExclusionConfig = {}) {
    this.auditManager = new AuditManager();
    this.configPath = ""; // Will be set by subclass
    this.fieldConfig = {
      excludeFields: [],
      nullifyFields: [],
      emptyRelationFields: [],
      immutableFields: [],
      ...fieldConfig,
    };
  }

  /**
   * Initialize the config path - must be called by subclass constructor
   */
  protected initializeConfigPath() {
    this.configPath = path.join(CONFIG_PATH, this.defaultFilename);
  }

  /**
   * Normalize a single configuration item according to the field exclusion rules
   * Made public so it can be used by related managers
   */
  public normalizeItem(item: T): T {
    if (!item || typeof item !== "object") {
      return item;
    }

    const normalized = { ...item } as any;

    // Remove excluded fields
    this.fieldConfig.excludeFields?.forEach((field) => {
      delete normalized[field];
    });

    // Set specified fields to null
    this.fieldConfig.nullifyFields?.forEach((field) => {
      if (field in normalized) {
        normalized[field] = null;
      }
    });

    // Empty relationship fields (for many-to-many relationships)
    this.fieldConfig.emptyRelationFields?.forEach((field) => {
      if (field in normalized) {
        normalized[field] = [];
      }
    });

    return normalized;
  }

  /**
   * Normalize an array of configuration items
   * Made public so it can be used by related managers
   */
  public normalizeItems(items: T[]): T[] {
    return items.map((item) => this.normalizeItem(item));
  }

  /**
   * Generate SHA-256 checksum for data integrity verification
   */
  protected generateChecksum(data: any): string {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify(data, null, 0));
    return hash.digest("hex");
  }

  /**
   * Get current DCT version from package.json
   */
  protected getDctVersion(): string {
    try {
      const packageJson = require("../../package.json");
      return packageJson.version || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Detect dependencies within the configuration data
   * Override in subclasses to implement specific dependency detection logic
   */
  protected detectDependencies(items: T[]): DependencyInfo[] {
    // Base implementation returns empty array
    // Subclasses should override this to implement specific dependency detection
    return [];
  }

  /**
   * Create an enhanced snapshot with metadata
   */
  protected createEnhancedSnapshot(
    items: T[],
    directusVersion?: string
  ): EnhancedSnapshot<T> {
    const normalizedItems = this.normalizeItems(items);
    const dependencies = this.detectDependencies(normalizedItems);

    const metadata: SnapshotMetadata = {
      checksum: this.generateChecksum(normalizedItems),
      timestamp: new Date().toISOString(),
      dctVersion: this.getDctVersion(),
      directusVersion,
      configType: this.configType,
      itemCount: normalizedItems.length,
      dependencies,
    };

    return {
      metadata,
      data: normalizedItems,
    };
  }

  /**
   * Validate snapshot integrity by checking metadata and checksums
   */
  protected validateSnapshot(snapshot: EnhancedSnapshot<T>): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check if snapshot has required metadata
    if (!snapshot.metadata) {
      issues.push("Missing snapshot metadata");
      return { isValid: false, issues };
    }

    // Verify data checksum
    const calculatedChecksum = this.generateChecksum(snapshot.data);
    if (calculatedChecksum !== snapshot.metadata.checksum) {
      issues.push(
        `Checksum mismatch: expected ${snapshot.metadata.checksum}, got ${calculatedChecksum}`
      );
    }

    // Verify config type matches
    if (snapshot.metadata.configType !== this.configType) {
      issues.push(
        `Config type mismatch: expected ${this.configType}, got ${snapshot.metadata.configType}`
      );
    }

    // Verify item count matches
    if (snapshot.metadata.itemCount !== snapshot.data.length) {
      issues.push(
        `Item count mismatch: expected ${snapshot.metadata.itemCount}, got ${snapshot.data.length}`
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Store an enhanced snapshot with full metadata
   * Made public so it can be used by related managers
   */
  public async storeEnhancedSnapshot(
    items: T[],
    identifier?: string,
    directusVersion?: string
  ): Promise<string> {
    const snapshot = this.createEnhancedSnapshot(items, directusVersion);
    return await this.auditManager.storeSnapshot(
      this.configType,
      snapshot,
      identifier
    );
  }

  /**
   * Load and validate an enhanced snapshot
   */
  protected async loadEnhancedSnapshot(snapshotPath: string): Promise<{
    snapshot: EnhancedSnapshot<T> | null;
    validation: { isValid: boolean; issues: string[] };
  }> {
    try {
      const data = await fs.readJson(snapshotPath);

      // Check if this is an enhanced snapshot or legacy format
      if (data.metadata && data.data) {
        // Enhanced snapshot format
        const snapshot = data as EnhancedSnapshot<T>;
        const validation = this.validateSnapshot(snapshot);
        return { snapshot, validation };
      } else {
        // Legacy format - treat as raw data
        console.warn(`Legacy snapshot format detected at ${snapshotPath}`);
        const legacySnapshot: EnhancedSnapshot<T> = {
          metadata: {
            checksum: this.generateChecksum(data),
            timestamp: new Date().toISOString(),
            dctVersion: "legacy",
            configType: this.configType,
            itemCount: Array.isArray(data) ? data.length : 1,
          },
          data: Array.isArray(data) ? data : [data],
        };
        return {
          snapshot: legacySnapshot,
          validation: { isValid: true, issues: ["Legacy format"] },
        };
      }
    } catch (error: any) {
      return {
        snapshot: null,
        validation: {
          isValid: false,
          issues: [`Failed to load snapshot: ${error.message}`],
        },
      };
    }
  }

  /**
   * Compare normalized export data with audit snapshot data
   * Returns differences found between export and audit operations
   */
  protected async validateExportAuditConsistency(exportedItems: T[]): Promise<{
    isConsistent: boolean;
    differences: string[];
  }> {
    const differences: string[] = [];

    // Get the latest audit snapshot for this config type
    const snapshots = await this.auditManager.getSnapshots(this.configType);
    if (snapshots.length === 0) {
      return {
        isConsistent: false,
        differences: ["No audit snapshots found for comparison"],
      };
    }

    const latestSnapshot = snapshots[snapshots.length - 1];
    const { snapshot, validation } = await this.loadEnhancedSnapshot(
      latestSnapshot.path
    );

    if (!snapshot || !validation.isValid) {
      return {
        isConsistent: false,
        differences: [
          `Cannot validate latest snapshot: ${validation.issues.join(", ")}`,
        ],
      };
    }

    // Normalize both datasets for comparison
    const normalizedExport = this.normalizeItems(exportedItems);
    const normalizedAudit = snapshot.data;

    // Compare checksums first
    const exportChecksum = this.generateChecksum(normalizedExport);
    const auditChecksum = snapshot.metadata.checksum;

    if (exportChecksum !== auditChecksum) {
      differences.push(
        `Data checksum mismatch between export and audit snapshot`
      );
    }

    // Compare item counts
    if (normalizedExport.length !== normalizedAudit.length) {
      differences.push(
        `Item count differs: export has ${normalizedExport.length}, audit has ${normalizedAudit.length}`
      );
    }

    return {
      isConsistent: differences.length === 0,
      differences,
    };
  }

  /**
   * Abstract methods that subclasses must implement
   */

  /** Fetch remote configuration data */
  protected abstract fetchRemoteData(): Promise<T[]>;

  /** Export configuration to file */
  public abstract exportConfig(): Promise<void>;

  /** Import configuration from file */
  public abstract importConfig(
    dryRun?: boolean
  ): Promise<{ status: "success" | "failure"; message?: string }>;
}
