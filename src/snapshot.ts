import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import {
  readRoles,
  readSettings,
  readCollections,
  readFields,
  readOperations,
  readFlows,
  readFiles,
  readFolders,
} from "@directus/sdk";
import _ from "lodash";
import { FlowsManager } from "./flows";
import { RolesManager } from "./roles";
import { SettingsManager } from "./settings";
import { FilesManager } from "./files";
import { SchemaManager } from "./schema";

/**
 * The SnapshotManager provides utilities to compare the current state of a Directus instance
 * with the configuration files, helping users debug differences and identify issues.
 */
export class SnapshotManager {
  private snapshotPath: string = join(CONFIG_PATH, "snapshot");
  private flowsManager = new FlowsManager();
  private rolesManager = new RolesManager();
  private settingsManager = new SettingsManager();
  private filesManager = new FilesManager();
  private schemaManager = new SchemaManager();

  constructor() {}

  /**
   * Creates a snapshot of the current Directus instance state to compare with config files
   */
  createSnapshot = async () => {
    console.log("Creating snapshot of current Directus instance state...");
    ensureConfigDirs();

    // Create snapshot directory if it doesn't exist
    if (!require("fs").existsSync(this.snapshotPath)) {
      require("fs").mkdirSync(this.snapshotPath, { recursive: true });
    }

    try {
      // Snapshot roles
      const roles = await client.request(readRoles());
      writeFileSync(
        join(this.snapshotPath, "roles.snapshot.json"),
        JSON.stringify(roles, null, 2)
      );

      // Snapshot settings
      const settings = await client.request(readSettings());
      writeFileSync(
        join(this.snapshotPath, "settings.snapshot.json"),
        JSON.stringify(settings, null, 2)
      );

      // Snapshot collections
      const collections = await client.request(readCollections());
      writeFileSync(
        join(this.snapshotPath, "collections.snapshot.json"),
        JSON.stringify(collections, null, 2)
      );

      // Snapshot fields
      const fields = await client.request(readFields());
      writeFileSync(
        join(this.snapshotPath, "fields.snapshot.json"),
        JSON.stringify(fields, null, 2)
      );

      // Snapshot flows and operations
      const flows = await client.request(readFlows());
      writeFileSync(
        join(this.snapshotPath, "flows.snapshot.json"),
        JSON.stringify(flows, null, 2)
      );

      const operations = await client.request(readOperations());
      writeFileSync(
        join(this.snapshotPath, "operations.snapshot.json"),
        JSON.stringify(operations, null, 2)
      );

      // Snapshot files
      const files = await client.request(
        readFiles({
          filter: { id: { _nnull: true } },
          limit: 1000,
        })
      );
      writeFileSync(
        join(this.snapshotPath, "files.snapshot.json"),
        JSON.stringify(files, null, 2)
      );

      // Snapshot folders
      const folders = await client.request(readFolders());
      writeFileSync(
        join(this.snapshotPath, "folders.snapshot.json"),
        JSON.stringify(folders, null, 2)
      );

      console.log(`Snapshot created successfully at ${this.snapshotPath}`);
    } catch (error) {
      console.error("Error creating snapshot:", error);
    }
  };

  /**
   * Compares snapshot with config files to identify differences
   */
  compareWithConfig = async () => {
    console.log("Comparing snapshot with configuration files...");

    // Check if snapshot exists
    const files = [
      "roles.snapshot.json",
      "settings.snapshot.json",
      "collections.snapshot.json",
      "fields.snapshot.json",
      "flows.snapshot.json",
      "operations.snapshot.json",
      "files.snapshot.json",
      "folders.snapshot.json",
    ];

    const missingFiles = files.filter(
      (file) => !require("fs").existsSync(join(this.snapshotPath, file))
    );

    if (missingFiles.length > 0) {
      console.warn(`Missing snapshot files: ${missingFiles.join(", ")}`);
      console.warn("Run 'snapshot create' first to generate snapshot files.");
      return;
    }

    // Compare roles
    this.compareFiles(
      join(this.snapshotPath, "roles.snapshot.json"),
      join(CONFIG_PATH, "roles.json"),
      "roles",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );

    // Compare settings
    this.compareFiles(
      join(this.snapshotPath, "settings.snapshot.json"),
      join(CONFIG_PATH, "settings.json"),
      "settings"
    );

    // Compare flows
    this.compareFiles(
      join(this.snapshotPath, "flows.snapshot.json"),
      join(CONFIG_PATH, "flows.json"),
      "flows",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );

    // Compare folders
    this.compareFiles(
      join(this.snapshotPath, "folders.snapshot.json"),
      join(CONFIG_PATH, "folders.json"),
      "folders",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );

    console.log("Comparison complete. Check output above for differences.");
  };

  /**
   * Helper to compare two JSON files
   */
  private compareFiles(
    snapshotPath: string,
    configPath: string,
    name: string,
    diffFn: (a: any[], b: any[]) => any[] = (a, b) => _.difference(a, b)
  ) {
    try {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
      const config = JSON.parse(readFileSync(configPath, "utf8"));

      console.log(`\nComparing ${name}...`);

      // Check for items in snapshot but not in config
      const inSnapshotOnly = diffFn(snapshot, config);
      if (inSnapshotOnly.length > 0) {
        console.log(
          `Items in instance but not in config (${inSnapshotOnly.length}):`
        );
        inSnapshotOnly.forEach((item) => {
          console.log(
            `- ${item.id || item.name || JSON.stringify(item).substring(0, 50)}`
          );
        });
      } else {
        console.log(`All ${name} in instance are in config.`);
      }

      // Check for items in config but not in snapshot
      const inConfigOnly = diffFn(config, snapshot);
      if (inConfigOnly.length > 0) {
        console.log(
          `Items in config but not in instance (${inConfigOnly.length}):`
        );
        inConfigOnly.forEach((item) => {
          console.log(
            `- ${item.id || item.name || JSON.stringify(item).substring(0, 50)}`
          );
        });
      } else {
        console.log(`All ${name} in config are in instance.`);
      }

      // Write differences to file for further inspection
      const differences = {
        inInstanceOnly: inSnapshotOnly,
        inConfigOnly: inConfigOnly,
      };

      writeFileSync(
        join(this.snapshotPath, `${name}.diff.json`),
        JSON.stringify(differences, null, 2)
      );
    } catch (error) {
      console.error(`Error comparing ${name}:`, error);
    }
  }

  /**
   * Find duplicate IDs in folders that could cause conflicts
   */
  findDuplicateIds = async () => {
    console.log("Checking for duplicate IDs that might cause conflicts...");

    try {
      // Check folders
      const folders = JSON.parse(
        readFileSync(join(CONFIG_PATH, "folders.json"), "utf8")
      );
      const folderIds = folders.map((f: any) => f.id);
      const duplicateFolderIds = folderIds.filter(
        (id: string, index: number) => folderIds.indexOf(id) !== index
      );

      if (duplicateFolderIds.length > 0) {
        console.error("Found duplicate folder IDs:");
        duplicateFolderIds.forEach((id: string) => {
          const dupes = folders.filter((f: any) => f.id === id);
          console.error(`- ID: ${id}`);
          dupes.forEach((f: any, i: number) => {
            console.error(
              `  [${i + 1}] Name: ${f.name}, Parent: ${f.parent || "none"}`
            );
          });
        });
      } else {
        console.log("No duplicate folder IDs found.");
      }

      // Check files
      const files = JSON.parse(
        readFileSync(join(CONFIG_PATH, "files.json"), "utf8")
      );
      const fileIds = files.map((f: any) => f.id);
      const duplicateFileIds = fileIds.filter(
        (id: string, index: number) => fileIds.indexOf(id) !== index
      );

      if (duplicateFileIds.length > 0) {
        console.error("Found duplicate file IDs:");
        duplicateFileIds.forEach((id: string) => {
          const dupes = files.filter((f: any) => f.id === id);
          console.error(`- ID: ${id}`);
          dupes.forEach((f: any, i: number) => {
            console.error(
              `  [${i + 1}] Filename: ${f.filename_download}, Type: ${f.type}`
            );
          });
        });
      } else {
        console.log("No duplicate file IDs found.");
      }

      // Check roles for public_registration_role issue
      const settings = JSON.parse(
        readFileSync(join(CONFIG_PATH, "settings.json"), "utf8")
      );
      if (settings.public_registration_role) {
        const roles = JSON.parse(
          readFileSync(join(CONFIG_PATH, "roles.json"), "utf8")
        );
        const roleExists = roles.some(
          (r: any) => r.id === settings.public_registration_role
        );

        if (!roleExists) {
          console.error(
            `Foreign key constraint risk: settings.public_registration_role references role ID "${settings.public_registration_role}" which doesn't exist in roles.json`
          );
        } else {
          console.log("Public registration role reference is valid.");
        }
      }
    } catch (error) {
      console.error("Error checking for duplicate IDs:", error);
    }
  };
}
