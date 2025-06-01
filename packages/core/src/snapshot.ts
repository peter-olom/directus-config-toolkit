import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import { findPublicRole, findPublicPolicy } from "./roles";
import {
  readRoles,
  readSettings,
  readCollections,
  readFields,
  readOperations,
  readFlows,
  readFiles,
  readFolders,
  readPolicies,
} from "@directus/sdk";
import _ from "lodash";
import { FlowsManager } from "./flows";
import { RolesManager } from "./roles";
import { SettingsManager } from "./settings";
import { FilesManager } from "./files";
import { SchemaManager } from "./schema";
import { MetadataManager } from "./metadata";

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
  private metadataManager = new MetadataManager();

  constructor() {}

  /**
   * Creates a snapshot of the current Directus instance state to compare with config files
   */
  public async createSnapshot(): Promise<{
    success: boolean;
    message: string;
  }> {
    console.log("Creating snapshot of current Directus instance state...");
    ensureConfigDirs();

    // Create snapshot directory if it doesn't exist
    if (!existsSync(this.snapshotPath)) {
      mkdirSync(this.snapshotPath, { recursive: true });
    }

    try {
      // Snapshot roles
      const roles = await client.request(readRoles());
      writeFileSync(
        join(this.snapshotPath, "roles.snapshot.json"),
        JSON.stringify(roles, null, 2)
      );
      this.metadataManager.updateItemsCount("roles", roles.length);

      // Snapshot settings
      const settings = await client.request(readSettings());
      writeFileSync(
        join(this.snapshotPath, "settings.snapshot.json"),
        JSON.stringify(settings, null, 2)
      );
      this.metadataManager.updateItemsCount(
        "settings",
        Object.keys(settings).length
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

      // Update schema items count (collections + fields)
      this.metadataManager.updateItemsCount(
        "schema",
        collections.length + fields.length
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
      this.metadataManager.updateItemsCount(
        "flows",
        flows.length + operations.length
      );

      // Snapshot files
      await this.filesManager.getBackupField("directus_files");
      const filesFilter = this.filesManager.getBackupFilter();
      const files = await client.request(
        readFiles({
          filter: filesFilter,
          fields: ["*"],
        })
      );
      writeFileSync(
        join(this.snapshotPath, "files.snapshot.json"),
        JSON.stringify(files, null, 2)
      );

      // Snapshot folders
      await this.filesManager.getBackupField("directus_folders");
      const foldersFilter = this.filesManager.getBackupFilter();
      const folders = await client.request(
        readFolders({
          filter: foldersFilter,
          fields: ["*"],
        })
      );
      writeFileSync(
        join(this.snapshotPath, "folders.snapshot.json"),
        JSON.stringify(folders, null, 2)
      );
      this.metadataManager.updateItemsCount(
        "files",
        files.length + folders.length
      );

      console.log(`Snapshot created successfully at ${this.snapshotPath}`);
      return {
        success: true,
        message: `Snapshot created successfully at ${this.snapshotPath}`,
      };
    } catch (error) {
      console.error("Error creating snapshot:", error);
      return {
        success: false,
        message: `Error creating snapshot: ${error}`,
      };
    }
  }

  /**
   * Compares snapshot with config files to identify differences
   */
  public async compareWithConfig(): Promise<{
    success: boolean;
    message: string;
    diffResults: Record<string, any>;
  }> {
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
      (file) => !existsSync(join(this.snapshotPath, file))
    );

    if (missingFiles.length > 0) {
      console.warn(`Missing snapshot files: ${missingFiles.join(", ")}`);
      console.warn("Run 'snapshot create' first to generate snapshot files.");
      return {
        success: false,
        message: "Missing snapshot files. Run 'snapshot create' first.",
        diffResults: {},
      };
    }

    let hasConflicts = false;
    const diffResults: Record<
      string,
      any // Changed to 'any' to accommodate the total count
    > = {};
    let totalInSnapshotOnly = 0;

    // Compare roles
    const rolesDiff = this.compareFiles(
      join(this.snapshotPath, "roles.snapshot.json"),
      join(CONFIG_PATH, "roles.json"),
      "roles",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );
    diffResults["roles"] = rolesDiff;
    totalInSnapshotOnly += rolesDiff.inSnapshotOnly.length;
    if (
      rolesDiff.inSnapshotOnly.length > 0 ||
      rolesDiff.inConfigOnly.length > 0
    ) {
      this.metadataManager.updateSyncStatus("roles", "conflict");
      hasConflicts = true;
    } else {
      this.metadataManager.updateSyncStatus("roles", "synced");
    }

    // Compare settings
    const settingsDiff = this.compareFiles(
      join(this.snapshotPath, "settings.snapshot.json"),
      join(CONFIG_PATH, "settings.json"),
      "settings"
    );
    diffResults["settings"] = settingsDiff;
    totalInSnapshotOnly += settingsDiff.inSnapshotOnly.length;
    if (
      settingsDiff.inSnapshotOnly.length > 0 ||
      settingsDiff.inConfigOnly.length > 0
    ) {
      this.metadataManager.updateSyncStatus("settings", "conflict");
      hasConflicts = true;
    } else {
      this.metadataManager.updateSyncStatus("settings", "synced");
    }

    // Compare flows
    const flowsDiff = this.compareFiles(
      join(this.snapshotPath, "flows.snapshot.json"),
      join(CONFIG_PATH, "flows.json"),
      "flows",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );
    diffResults["flows"] = flowsDiff;
    totalInSnapshotOnly += flowsDiff.inSnapshotOnly.length;
    if (
      flowsDiff.inSnapshotOnly.length > 0 ||
      flowsDiff.inConfigOnly.length > 0
    ) {
      this.metadataManager.updateSyncStatus("flows", "conflict");
      hasConflicts = true;
    } else {
      this.metadataManager.updateSyncStatus("flows", "synced");
    }

    // Compare folders (part of files)
    const foldersDiff = this.compareFiles(
      join(this.snapshotPath, "folders.snapshot.json"),
      join(CONFIG_PATH, "folders.json"),
      "folders",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );
    diffResults["folders"] = foldersDiff;
    totalInSnapshotOnly += foldersDiff.inSnapshotOnly.length;

    // Compare files
    const filesDiff = this.compareFiles(
      join(this.snapshotPath, "files.snapshot.json"),
      join(CONFIG_PATH, "files.json"),
      "files",
      (a, b) => _.differenceWith(a, b, (x, y) => x.id === y.id)
    );
    diffResults["files"] = filesDiff;
    totalInSnapshotOnly += filesDiff.inSnapshotOnly.length;

    // Update files status based on both folders and files differences
    if (
      foldersDiff.inSnapshotOnly.length > 0 ||
      foldersDiff.inConfigOnly.length > 0 ||
      filesDiff.inSnapshotOnly.length > 0 ||
      filesDiff.inConfigOnly.length > 0
    ) {
      this.metadataManager.updateSyncStatus("files", "conflict");
      hasConflicts = true;
    } else {
      this.metadataManager.updateSyncStatus("files", "synced");
    }

    diffResults["totalInSnapshotOnly"] = totalInSnapshotOnly;
    console.log(
      `\nTotal items in instance but not in config: ${totalInSnapshotOnly}`
    );
    console.log("Comparison complete. Check output above for differences.");

    return {
      success: true,
      message: hasConflicts
        ? `Comparison complete. Conflicts detected. Total items in instance but not in config: ${totalInSnapshotOnly}.`
        : `Comparison complete. No conflicts detected. Total items in instance but not in config: ${totalInSnapshotOnly}.`,
      diffResults,
    };
  }

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
        inSnapshotOnly,
        inConfigOnly,
      };

      writeFileSync(
        join(this.snapshotPath, `${name}.diff.json`),
        JSON.stringify(differences, null, 2)
      );

      return differences;
    } catch (error) {
      console.error(`Error comparing ${name}:`, error);
      return {
        inSnapshotOnly: [],
        inConfigOnly: [],
      };
    }
  }

  /**
   * Find duplicate IDs in folders that could cause conflicts
   */
  public async findDuplicateIds(): Promise<void> {
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
  }

  /**
   * Check role identities between two environments by name and properties
   * This helps identify roles that should be mapped between environments
   */
  public async checkRoleIdentities(): Promise<void> {
    console.log(
      "Checking role identities between config and current instance..."
    );

    try {
      // findPublicRole is now imported at the top of the file

      // Load roles from config files
      const configRoles = JSON.parse(
        readFileSync(join(CONFIG_PATH, "roles.json"), "utf8")
      );

      // Get current roles from the Directus instance
      const instanceRoles = await client.request(readRoles());

      console.log(
        `Found ${configRoles.length} roles in config and ${instanceRoles.length} roles in instance`
      );

      // Create mapping tables by name and ID
      const nameMapping = new Map<
        string,
        { configRole: any; instanceRole: any }
      >();
      const rolesToMap = [];

      // Track special roles
      const configPublicRole = findPublicRole(configRoles);
      const instancePublicRole = findPublicRole(instanceRoles);

      if (configPublicRole && instancePublicRole) {
        console.log(
          `Public role in config: "${configPublicRole.name}" (${configPublicRole.id})`
        );
        console.log(
          `Public role in instance: "${instancePublicRole.name}" (${instancePublicRole.id})`
        );

        if (configPublicRole.id !== instancePublicRole.id) {
          console.log(
            `⚠️  PUBLIC ROLE ID MISMATCH - Will require mapping during import`
          );
          rolesToMap.push({
            configId: configPublicRole.id,
            instanceId: instancePublicRole.id,
            name: configPublicRole.name,
            reason: "Public role",
          });
        }
      }

      // Check for roles with the same name but different IDs
      for (const configRole of configRoles) {
        // Skip admin roles (check by name as a proxy since admin_access is in policies table)
        if (configRole.name?.toLowerCase().includes("admin")) continue;

        const matchByName = instanceRoles.find(
          (r) => r.name === configRole.name && r.id !== configRole.id
        );

        if (matchByName) {
          console.log(`Role name "${configRole.name}" has different IDs:`);
          console.log(`  - Config: ${configRole.id}`);
          console.log(`  - Instance: ${matchByName.id}`);

          rolesToMap.push({
            configId: configRole.id,
            instanceId: matchByName.id,
            name: configRole.name,
            reason: "Same name, different ID",
          });
        }
      }

      // Write mapping suggestions to a file if we found any
      if (rolesToMap.length > 0) {
        console.log(
          `\nFound ${rolesToMap.length} roles that need mapping during import`
        );
        writeFileSync(
          join(this.snapshotPath, "role_mapping.json"),
          JSON.stringify(rolesToMap, null, 2)
        );
        console.log(
          `Role mapping suggestions saved to ${join(
            this.snapshotPath,
            "role_mapping.json"
          )}`
        );

        // Generate sample code for applying these mappings
        const sampleCode = `
// Sample code to handle role mapping during import:
const roleMapping = new Map([
${rolesToMap
  .map(
    (r) => `  ["${r.configId}", "${r.instanceId}"], // ${r.name} - ${r.reason}`
  )
  .join("\n")}
]);

// Then when processing permissions or settings:
if (item.role && roleMapping.has(item.role)) {
  item.role = roleMapping.get(item.role);
}`;

        writeFileSync(
          join(this.snapshotPath, "role_mapping_sample.js"),
          sampleCode
        );
        console.log(
          `Sample code for applying mappings saved to ${join(
            this.snapshotPath,
            "role_mapping_sample.js"
          )}`
        );
      } else {
        console.log(
          "✅ All roles have consistent identifiers between environments"
        );
      }
    } catch (error: any) {
      console.error("Error checking role identities:", error.message);
    }
  }

  /**
   * Check for Public policy identities between two environments
   * This helps identify the public policy that should be consistent between environments
   */
  public async checkPublicPolicyIdentities(): Promise<void> {
    console.log(
      "Checking public policy identities between config and current instance..."
    );

    try {
      // Load policies from config files
      const configPolicies = JSON.parse(
        readFileSync(join(CONFIG_PATH, "policies.json"), "utf8")
      );

      // Get current policies from the Directus instance
      const instancePolicies = await client.request(readPolicies());

      console.log(
        `Found ${configPolicies.length} policies in config and ${instancePolicies.length} policies in instance`
      );

      // Find public policies in both environments
      const configPublicPolicy = findPublicPolicy(configPolicies);
      const instancePublicPolicy = findPublicPolicy(instancePolicies);

      if (configPublicPolicy && instancePublicPolicy) {
        console.log("Public policy found in both environments:");
        console.log(
          `  - Config: ${configPublicPolicy.name} (${configPublicPolicy.id})`
        );
        console.log(
          `  - Instance: ${instancePublicPolicy.name} (${instancePublicPolicy.id})`
        );

        if (configPublicPolicy.id !== instancePublicPolicy.id) {
          console.log(
            "\n⚠️ Public policy has different IDs in the two environments!"
          );
          console.log(
            "This may cause issues with permissions. Consider mapping these IDs."
          );
        } else {
          console.log(
            "✅ Public policy has consistent ID across environments."
          );
        }
      } else if (configPublicPolicy) {
        console.log("⚠️ Public policy found only in config:");
        console.log(
          `  - Config: ${configPublicPolicy.name} (${configPublicPolicy.id})`
        );
        console.log("No matching public policy found in the current instance.");
      } else if (instancePublicPolicy) {
        console.log("⚠️ Public policy found only in current instance:");
        console.log(
          `  - Instance: ${instancePublicPolicy.name} (${instancePublicPolicy.id})`
        );
        console.log("No matching public policy found in the config files.");
      } else {
        console.log("ℹ️ No public policy found in either environment.");
      }
    } catch (error) {
      console.error("Error checking public policy identities:", error);
    }
  }
}
