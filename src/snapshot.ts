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
      (file) => !existsSync(join(this.snapshotPath, file))
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

  /**
   * Check role identities between two environments by name and properties
   * This helps identify roles that should be mapped between environments
   */
  checkRoleIdentities = async () => {
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
  };

  /**
   * Check for Public policy identities between two environments
   * This helps identify the public policy that should be consistent between environments
   */
  checkPublicPolicyIdentities = async () => {
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
  };
}
