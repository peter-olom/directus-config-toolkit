import express from "express";
import cors from "cors";
import { MetadataManager } from "./metadata";
import { SnapshotManager } from "./snapshot";
import { FlowsManager } from "./flows";
import { RolesManager } from "./roles";
import { SettingsManager } from "./settings";
import { FilesManager } from "./files";
import { SchemaManager } from "./schema";

// Define DiffItem type if not imported from elsewhere
type DiffItem = {
  id?: string;
  name?: string;
  [key: string]: any;
};

/**
 * Simple API server to handle dashboard requests
 */
export class ApiServer {
  private app = express();
  private port = process.env.DIRECTUS_CT_API_PORT || 3001;
  private metadataManager = new MetadataManager();
  private snapshotManager = new SnapshotManager();
  private flowsManager = new FlowsManager();
  private rolesManager = new RolesManager();
  private settingsManager = new SettingsManager();
  private filesManager = new FilesManager();
  private schemaManager = new SchemaManager();

  constructor() {
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Get config statuses
    this.app.get("/status", (req, res) => {
      try {
        const statuses = this.metadataManager.getConfigStatuses();
        res.json(statuses);
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to get config statuses",
          message: error.message,
        });
      }
    });

    // Diff endpoint
    this.app.get("/diff/:type", async (req, res) => {
      try {
        // Create a snapshot first
        await this.snapshotManager.createSnapshot();

        // Then compare
        const comparisonResult = await this.snapshotManager.compareWithConfig();

        // Find diffs for the requested type
        const type = req.params.type;
        const diffResults =
          comparisonResult.diffResults[type] ||
          (type === "schema"
            ? comparisonResult.diffResults["collections"]
            : null);

        // Handle schema diffs specially since they're split across collections and fields
        const differences = [];
        if (diffResults) {
          // Convert to the UI expected format
          if (
            diffResults.inInstanceOnly &&
            diffResults.inInstanceOnly.length > 0
          ) {
            differences.push(
              ...diffResults.inInstanceOnly.map((item: DiffItem) => ({
                path: `${type}.${item.id || item.name}`,
                type: "added",
                newValue: item,
              }))
            );
          }

          if (diffResults.inConfigOnly && diffResults.inConfigOnly.length > 0) {
            differences.push(
              ...diffResults.inConfigOnly.map((item: DiffItem) => ({
                path: `${type}.${item.id || item.name}`,
                type: "removed",
                oldValue: item,
              }))
            );
          }
        }

        res.json({
          type,
          differences,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        res.status(500).json({
          error: `Failed to get diff for ${req.params.type}`,
          message: error.message,
        });
      }
    });

    // Sync endpoint for import/export
    this.app.post("/sync", async (req, res, next) => {
      try {
        const { type, direction } = req.body as {
          type: string;
          direction: string;
        };
        if (!type || !direction) {
          res.status(400).json({ error: "Missing type or direction" });
          return;
        }

        // Execute the appropriate sync operation
        if (direction === "import") {
          switch (type) {
            case "flows":
              await this.flowsManager.importFlows();
              break;
            case "roles":
              await this.rolesManager.importRoles();
              break;
            case "settings":
              await this.settingsManager.importSettings();
              break;
            case "files":
              await this.filesManager.importFiles();
              break;
            case "schema":
              await this.schemaManager.importSchema();
              break;
            default:
              throw new Error(`Unsupported type: ${type}`);
          }
        } else {
          // Export
          switch (type) {
            case "flows":
              await this.flowsManager.exportFlows();
              break;
            case "roles":
              await this.rolesManager.exportRoles();
              break;
            case "settings":
              await this.settingsManager.exportSettings();
              break;
            case "files":
              await this.filesManager.exportFiles();
              break;
            case "schema":
              await this.schemaManager.exportSchema();
              break;
            default:
              throw new Error(`Unsupported type: ${type}`);
          }
        }

        res.json({ okay: true });
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to sync",
          message: error.message,
        });
      }
    });

    // Jobs history endpoint
    this.app.get("/jobs", (req, res) => {
      try {
        const jobs = this.metadataManager.getSyncJobs();
        res.json(jobs);
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to get jobs history",
          message: error.message,
        });
      }
    });

    // Connection check endpoint
    this.app.get("/connection", async (req, res) => {
      try {
        // Try to create a snapshot as a way to check connection
        const result = await this.snapshotManager.createSnapshot();
        res.json({
          success: result.success,
          message: result.success
            ? "Successfully connected to Directus instance"
            : result.message,
        });
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to connect to Directus",
          message: error.message,
        });
      }
    });

    // Check for snapshots endpoint
    this.app.get("/snapshots/check", async (req, res) => {
      try {
        await this.metadataManager.checkForSnapshots();
        const status = this.metadataManager.getConfigStatus("snapshots");
        res.json({
          hasSnapshots: status.itemsCount > 0,
          lastSnapshot: status.lastSync,
        });
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to check snapshots",
          message: error.message,
        });
      }
    });

    // Create snapshot endpoint
    this.app.post("/snapshot", async (req, res) => {
      try {
        const result = await this.snapshotManager.createSnapshot();
        res.json({
          success: result.success,
          message: result.message,
        });
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to create snapshot",
          message: error.message,
        });
      }
    });

    // Compare snapshot endpoint
    this.app.get("/snapshot/compare", async (req, res) => {
      try {
        const result = await this.snapshotManager.compareWithConfig();
        res.json({
          success: true,
          message: "Comparison completed successfully",
          diffResults: result.diffResults,
        });
      } catch (error: any) {
        res.status(500).json({
          error: "Failed to compare snapshot",
          message: error.message,
        });
      }
    });
  }

  /**
   * Start the API server
   */
  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`API server running at http://localhost:${this.port}`);
    });
  }
}
