import {
  createPermission,
  createPolicy,
  createRole,
  deletePermissions,
  deletePolicies,
  deleteRoles,
  readMe,
  readPermissions,
  readPolicies,
  readRole,
  readRoles,
  updatePolicy,
  updateRole,
} from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import _, { filter } from "lodash";
import {
  callDirectusAPI,
  client,
  CONFIG_PATH,
  ensureConfigDirs,
  extractErrorMessage,
  retryOperation,
} from "./helper";
import { MetadataManager } from "./metadata";
import { v4 as uuidv4 } from "uuid";

// Import ConfigType from the same place it's defined in flows.ts
type ConfigType = "flows" | "roles" | "settings" | "files" | "schema";

/**
 * Find the Public policy in a list of policies
 * In Directus, the Public policy has special translation key '$t:public_label'
 */
export function findPublicPolicy(policies: any[]): any | undefined {
  return policies.find((policy) => policy.name === "$t:public_label");
}

/**
 * Find the Public role in a list of roles
 * In Directus, while Public is mainly a policy, there might still be a role named "Public"
 * This is for backward compatibility with existing code
 */
export function findPublicRole(
  roles: Record<string, any>[]
): Record<string, any> | undefined {
  // Look for role with public characteristics
  return roles.find((role) => {
    // Check if name contains "Public" (case insensitive) or has special translation key
    const isPublicName =
      role.name?.toLowerCase().includes("public") ||
      role.name?.startsWith("$t:public");

    // Public role often has specific characteristics, like an icon "public"
    const hasPublicIcon = role.icon === "public";

    return isPublicName || hasPublicIcon;
  });
}

interface Defaults {
  defaultRole: string;
  adminRoleIds: string[];
  defaultAccess: string[];
  defaultPolicy: string[];
  publicRoleId?: string;
  publicPolicyId?: string;
}

export class RolesManager {
  private rolePath: string = join(CONFIG_PATH, "roles.json");
  private policiesPath: string = join(CONFIG_PATH, "policies.json");
  private accessPath: string = join(CONFIG_PATH, "access.json");
  private permissionsPath: string = join(CONFIG_PATH, "permissions.json");
  private metadataManager: MetadataManager;

  constructor() {
    this.metadataManager = new MetadataManager();
  }

  private emptyPolicies(record: Record<string, any>) {
    if (record["policies"]) {
      record["policies"] = [];
    }
    return record;
  }

  private untrackUsers(record: Record<string, any>) {
    if (record["users"]) {
      delete record["users"];
    }
    return record;
  }

  private emptyRoles(record: Record<string, any>) {
    if (record["roles"]) {
      record["roles"] = [];
    }
    return record;
  }

  private emptyPermissions(record: Record<string, any>) {
    if (record["permissions"]) {
      record["permissions"] = [];
    }
    return record;
  }

  /**
   * Prepares an array of policies
   */
  private preparePolicies(
    policies: Record<string, any>[]
  ): Record<string, any>[] {
    return policies.map((policy) =>
      this.emptyPermissions(this.emptyRoles(this.untrackUsers({ ...policy })))
    );
  }

  /**
   * Prepares an array of roles
   */
  private prepareRoles(roles: Record<string, any>[]): Record<string, any>[] {
    return roles.map((role) =>
      this.emptyPolicies(this.untrackUsers({ ...role }))
    );
  }

  /**
   * Prepares access entries
   */
  private prepareAccess(access: Record<string, any>[]): Record<string, any>[] {
    // Deep clone to avoid modifying original objects
    return access.map((entry) => ({ ...entry }));
  }

  private async exportRolesData(defaults: Defaults) {
    const roles = await client.request(readRoles());

    // Filter out admin roles and default role
    const rolesToExclude = [...defaults.adminRoleIds];
    if (defaults.defaultRole) {
      rolesToExclude.push(defaults.defaultRole);
    }

    const filteredRoles = roles.filter((r) => !rolesToExclude.includes(r.id));

    // Log which roles are being excluded
    const excludedRoles = roles.filter((r) => rolesToExclude.includes(r.id));
    if (excludedRoles.length > 0) {
      console.log("Excluding the following roles from export:");
      excludedRoles.forEach((r) => {
        const isDefault = r.id === defaults.defaultRole;
        const isAdmin = defaults.adminRoleIds.includes(r.id);
        console.log(
          `- ${r.name} (${r.id}) [${
            isAdmin ? "Admin" : isDefault ? "Default" : "Other"
          }]`
        );
      });
    }

    // Prepare roles and export
    const preparedRoles = this.prepareRoles(filteredRoles);

    writeFileSync(this.rolePath, JSON.stringify(preparedRoles, null, 2));
    console.log(`${filteredRoles.length} roles exported to ${this.rolePath}`);
  }

  private async exportPoliciesData(defaults: Defaults) {
    const policies = await client.request(readPolicies());
    const filteredPolicies = policies.filter(
      (p) => !defaults.defaultPolicy.includes(p.id)
    );
    const preparedPolicies = this.preparePolicies(filteredPolicies);

    writeFileSync(this.policiesPath, JSON.stringify(preparedPolicies, null, 2));
    console.log(`Policies exported to ${this.policiesPath}`);
  }

  private async exportAccessData(defaults: Defaults) {
    const access = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );
    const filteredAccess = access.filter(
      (a) => !defaults.defaultAccess.includes(a.id)
    );
    const preparedAccess = this.prepareAccess(filteredAccess);

    writeFileSync(this.accessPath, JSON.stringify(preparedAccess, null, 2));
    console.log(`Access exported to ${this.accessPath}`);
  }

  private async exportPermissionsData() {
    const permissions = await this.retrievePermissions();
    writeFileSync(this.permissionsPath, JSON.stringify(permissions, null, 2));
    console.log(`Permissions exported to ${this.permissionsPath}`);
  }

  exportRoles = async () => {
    ensureConfigDirs();

    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "roles";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "export",
      status: "running",
      createdAt: now,
    });

    try {
      // Get default admin roles that should be excluded
      const defaults = await this.retrieveDefaults();

      // Export roles
      await this.exportRolesData(defaults);

      // Export policies
      await this.exportPoliciesData(defaults);

      // Export access entries
      await this.exportAccessData(defaults);

      // Export permissions
      await this.exportPermissionsData();

      // Count the total number of items exported
      const roles = JSON.parse(readFileSync(this.rolePath, "utf8")).length;
      const policies = JSON.parse(
        readFileSync(this.policiesPath, "utf8")
      ).length;
      const access = JSON.parse(readFileSync(this.accessPath, "utf8")).length;
      const permissions = JSON.parse(
        readFileSync(this.permissionsPath, "utf8")
      ).length;

      const totalItems = roles + policies + access + permissions;

      // Track the number of items exported
      this.metadataManager.updateItemsCount(jobType, totalItems);

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log("Roles export completed successfully");
    } catch (error) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error("Error exporting roles:", error);
      throw error;
    }
  };

  // Using the exported findPublicRole function

  /**
   * Handle role mapping specially for roles like Public that may have different IDs
   * between environments but need to be treated as the same role
   */
  private mapSpecialRoles(
    incomingRoles: Record<string, any>[],
    existingRoles: Record<string, any>[]
  ): Map<string, string> {
    const roleMap = new Map<string, string>();

    // Handle Public role mapping
    const incomingPublicRole = findPublicRole(incomingRoles);
    const existingPublicRole = findPublicRole(existingRoles);

    if (
      incomingPublicRole &&
      existingPublicRole &&
      incomingPublicRole.id !== existingPublicRole.id
    ) {
      console.log(
        `Mapping Public role: ${incomingPublicRole.id} -> ${existingPublicRole.id}`
      );
      roleMap.set(incomingPublicRole.id, existingPublicRole.id);
    }

    return roleMap;
  }

  private async handleImportRoles() {
    const defaults = await this.retrieveDefaults();
    const incomingRoles = JSON.parse(readFileSync(this.rolePath, "utf8"));
    const existingRoles = await client.request(readRoles());

    // Map special roles (like Public) that may have different IDs between environments
    const roleIdMap = this.mapSpecialRoles(incomingRoles, existingRoles);

    // Prepare roles like during export
    const preparedIncomingRoles = this.prepareRoles(incomingRoles);
    const preparedExistingRoles = this.prepareRoles(
      existingRoles.filter((r) => !defaults.adminRoleIds.includes(r.id))
    );

    // Log which roles are being processed
    console.log(`Processing ${incomingRoles.length} roles for import`);

    // Track processed roles for analytics
    const stats = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };

    for (const role of incomingRoles) {
      try {
        // Check if this role is mapped to an existing role with a different ID
        const targetRoleId = roleIdMap.get(role.id) || role.id;

        // Skip if this is an admin role we're trying to import
        const isAdminRole = defaults.adminRoleIds.includes(role.id);
        if (isAdminRole) {
          console.log(`Skipping admin role: ${role.name} (${role.id})`);
          stats.skipped++;
          continue;
        }

        // Look for existing role by target ID
        const existingRole = existingRoles.find((r) => r.id === targetRoleId);

        if (existingRole) {
          // Compare prepared versions
          const preparedExisting = preparedExistingRoles.find(
            (r) => r.id === existingRole.id
          );
          const preparedIncoming = preparedIncomingRoles.find(
            (r) => r.id === role.id
          );

          if (!_.isEqual(preparedExisting, preparedIncoming)) {
            console.log(`Updating role: ${role.name} (${role.id})`);
            await client.request(
              updateRole(targetRoleId, {
                ...role,
                id: targetRoleId, // Ensure we're updating with the mapped ID if applicable
              })
            );
            stats.updated++;
          } else {
            console.log(`Role unchanged, skipping: ${role.name} (${role.id})`);
            stats.skipped++;
          }
        } else {
          console.log(`Creating new role: ${role.name} (${role.id})`);
          await client.request(createRole(role));
          stats.created++;
        }
      } catch (error: any) {
        console.error(
          `Error processing role ${role.name} (${role.id}): ${error.message}`
        );
        stats.errors++;
      }
    }

    console.log(
      `Role import complete: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
    );

    // Be more conservative about deleting roles - only delete non-admin roles that aren't in the source
    const rolesToDelete = _.differenceBy(
      existingRoles,
      incomingRoles,
      "id"
    ).filter((r) => {
      // Skip admin roles and default roles
      const isAdmin = defaults.adminRoleIds.includes(r.id);
      const isDefault = r.id === defaults.defaultRole;
      // Skip roles that are targets in the mapping
      const isMappedRole = Array.from(roleIdMap.values()).includes(r.id);

      return !isAdmin && !isDefault && !isMappedRole;
    });

    if (rolesToDelete.length) {
      console.log(
        `Removing ${rolesToDelete.length} roles that are not in source:`
      );
      rolesToDelete.forEach((r) => console.log(`- ${r.name} (${r.id})`));

      await client.request(deleteRoles(rolesToDelete.map((r) => r.id)));
    } else {
      console.log("No roles to delete");
    }
  }

  private async handleImportPolicies() {
    const defaults = await this.retrieveDefaults();
    const incomingPolicies = JSON.parse(
      readFileSync(this.policiesPath, "utf8")
    );
    const existingPolicies = await client.request(readPolicies());

    // Filter and prepare policies using the same transformations as in export
    const preparedIncomingPolicies = this.preparePolicies(incomingPolicies);
    const preparedExistingPolicies = this.preparePolicies(
      existingPolicies.filter((p) => !defaults.defaultPolicy.includes(p.id))
    );

    // Log the policies being processed
    console.log(`Processing ${incomingPolicies.length} policies for import`);

    // Track processed policies for analytics
    const stats = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };

    // Determine which policies are system-managed
    const systemPolicyIds = existingPolicies
      .filter((p) => p.name?.startsWith("$t:"))
      .map((p) => p.id);

    for (const policy of incomingPolicies) {
      try {
        // Skip system policies
        if (
          systemPolicyIds.includes(policy.id) ||
          defaults.defaultPolicy.includes(policy.id) ||
          policy.admin_access === true
        ) {
          console.log(
            `Skipping system/admin policy: ${policy.name} (${policy.id})`
          );
          stats.skipped++;
          continue;
        }

        const existingPolicy = existingPolicies.find((p) => p.id === policy.id);

        if (existingPolicy) {
          // Compare prepared versions from the arrays
          const preparedExisting = preparedExistingPolicies.find(
            (p) => p.id === policy.id
          );
          const preparedIncoming = preparedIncomingPolicies.find(
            (p) => p.id === policy.id
          );

          if (!_.isEqual(preparedExisting, preparedIncoming)) {
            console.log(`Updating policy: ${policy.name} (${policy.id})`);
            await client.request(updatePolicy(policy.id, policy));
            stats.updated++;
          } else {
            console.log(
              `Policy unchanged, skipping: ${policy.name} (${policy.id})`
            );
            stats.skipped++;
          }
        } else {
          console.log(`Creating new policy: ${policy.name} (${policy.id})`);
          await client.request(createPolicy(policy));
          stats.created++;
        }
      } catch (error: any) {
        console.error(
          `Error processing policy ${policy.name} (${policy.id}): ${error.message}`
        );
        stats.errors++;
      }
    }

    console.log(
      `Policy import complete: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
    );

    // Be more conservative about deleting policies - only delete non-system policies
    const policiesToDelete = _.differenceBy(
      existingPolicies,
      incomingPolicies,
      "id"
    ).filter((p) => {
      // Skip default, system, and admin policies
      const isDefault = defaults.defaultPolicy.includes(p.id);
      const isSystem = p.name?.startsWith("$t:") || false;
      const isAdmin = p.admin_access === true;

      return !isDefault && !isSystem && !isAdmin;
    });

    if (policiesToDelete.length) {
      console.log(
        `Removing ${policiesToDelete.length} policies that are not in source:`
      );
      policiesToDelete.forEach((p) => console.log(`- ${p.name} (${p.id})`));

      try {
        await client.request(deletePolicies(policiesToDelete.map((p) => p.id)));
      } catch (error) {
        console.error("Error deleting policies:", error);
        stats.errors++;
      }
    } else {
      console.log("No policies to delete");
    }
  }

  private async handleImportAccess() {
    const defaults = await this.retrieveDefaults();
    const incomingAccess = JSON.parse(readFileSync(this.accessPath, "utf8"));
    const existingAccess = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );

    // Get role ID mappings (for Public role etc.)
    const existingRoles = await client.request(readRoles());
    const incomingRoles = JSON.parse(readFileSync(this.rolePath, "utf8"));
    const roleIdMap = this.mapSpecialRoles(incomingRoles, existingRoles);

    console.log(
      `Processing ${incomingAccess.length} access entries for import`
    );

    // Track stats for reporting
    const stats = {
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: 0,
    };

    // Process each access entry with role mapping if needed
    const processedIncomingAccess = incomingAccess.map(
      (access: Record<string, any>) => {
        if (access.role && roleIdMap.has(access.role)) {
          const mappedRoleId = roleIdMap.get(access.role);
          console.log(
            `Mapping access entry role ID: ${access.role} -> ${mappedRoleId}`
          );
          return {
            ...access,
            role: mappedRoleId,
          };
        }
        return access;
      }
    );

    // Prepare access entries like during export
    const preparedProcessedAccess = this.prepareAccess(processedIncomingAccess);
    const preparedExistingAccess = this.prepareAccess(
      existingAccess.filter((a) => !defaults.defaultAccess.includes(a.id))
    );

    // Create lookup map for quicker access
    const existingAccessMap = new Map(existingAccess.map((a) => [a.id, a]));

    // Process each access entry
    for (const access of processedIncomingAccess) {
      try {
        // Skip default access entries
        if (defaults.defaultAccess.includes(access.id)) {
          console.log(`Skipping default access entry: ${access.id}`);
          stats.skipped++;
          continue;
        }

        const existingEntry = existingAccessMap.get(access.id);

        if (existingEntry) {
          // Compare prepared versions
          const preparedExisting = preparedExistingAccess.find(
            (a) => a.id === access.id
          );
          const preparedIncoming = preparedProcessedAccess.find(
            (a) => a.id === access.id
          );

          if (!_.isEqual(preparedExisting, preparedIncoming)) {
            console.log(`Updating access entry: ${access.id}`);
            await callDirectusAPI(`access/${access.id}`, "PATCH", access);
            stats.updated++;
          } else {
            console.log(`Access entry unchanged, skipping: ${access.id}`);
            stats.skipped++;
          }
        } else {
          console.log(`Creating new access entry: ${access.id}`);
          await callDirectusAPI("access", "POST", access);
          stats.created++;
        }
      } catch (error: any) {
        console.error(
          `Error processing access entry ${access.id}: ${error.message}`
        );
        stats.errors++;
      }
    }

    console.log(
      `Access import in progress: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
    );

    // Delete access entries that are not in the source (excluding defaults and user-specific entries)
    const accessToDelete = _.differenceBy(
      existingAccess,
      processedIncomingAccess,
      "id"
    ).filter((a) => {
      // Don't delete default access entries or those with user associations
      const isDefault = defaults.defaultAccess.includes(a.id);
      const hasUser = !!a.user;

      // Also don't delete system-critical entries (additional safety check)
      const isSystemRole =
        a.role &&
        existingRoles.some(
          (r) => r.id === a.role && defaults.adminRoleIds.includes(r.id)
        );

      return !isDefault && !hasUser && !isSystemRole;
    });

    if (accessToDelete.length) {
      console.log(
        `Removing ${accessToDelete.length} access entries that are not in source`
      );
      accessToDelete.forEach((a) => {
        // Format a readable description of what's being deleted
        const roleInfo = a.role
          ? `role ${existingRoles.find((r) => r.id === a.role)?.name || a.role}`
          : "no role";
        const policyInfo = a.policy ? ` with policy ${a.policy}` : "";
        console.log(`- Access entry ${a.id}: ${roleInfo}${policyInfo}`);
      });

      try {
        await callDirectusAPI(
          "access",
          "DELETE",
          accessToDelete.map((a) => a.id)
        );
        stats.deleted = accessToDelete.length;
      } catch (error: any) {
        console.error(`Error deleting access entries: ${error.message}`);
        stats.errors++;
      }
    } else {
      console.log("No access entries to delete");
    }

    console.log(
      `Access import complete: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.deleted} deleted, ${stats.errors} errors`
    );
  }

  /**
   * Create a unique key for a permission that can be used for comparison
   * instead of the auto-incremented ID
   */
  private getPermissionKey(permission: Record<string, any>): string {
    const { collection, action, policy, role } = permission;
    let identifier = [
      collection || "null",
      action || "null",
      policy || "null",
      role || "null",
    ].join("_");

    // Add hash of permissions object if it exists for more accuracy
    if (permission.permissions) {
      const permissionsStr = JSON.stringify(permission.permissions);
      identifier += "_" + this.hashString(permissionsStr);
    }

    return identifier;
  }

  /**
   * Simple hash function for strings
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16); // Convert to hex
  }

  private async handleImportPermissions() {
    // Get role ID mappings in case we have special roles
    const existingRoles = await client.request(readRoles());
    const incomingRoles = JSON.parse(readFileSync(this.rolePath, "utf8"));
    const roleIdMap = this.mapSpecialRoles(incomingRoles, existingRoles);

    const sourcePermissions: Record<string, any>[] = JSON.parse(
      readFileSync(this.permissionsPath, "utf8")
    );
    const incomingPermissions = await this.retrievePermissions(false);

    console.log(
      `Processing ${sourcePermissions.length} permissions for import`
    );

    // Map permissions by our custom key for better comparison
    const sourcePermissionsByKey = new Map<string, Record<string, any>>();
    const incomingPermissionsByKey = new Map<string, Record<string, any>>();

    // Process source permissions and map role IDs if needed
    const processedSourcePermissions = sourcePermissions.map((permission) => {
      // Check if this permission references a role that's been mapped
      if (permission.role && roleIdMap.has(permission.role)) {
        return {
          ...permission,
          role: roleIdMap.get(permission.role),
        };
      }
      return permission;
    });

    // Build lookup maps
    processedSourcePermissions.forEach((p) => {
      sourcePermissionsByKey.set(this.getPermissionKey(p), p);
    });

    incomingPermissions.forEach((p) => {
      incomingPermissionsByKey.set(this.getPermissionKey(p), p);
    });

    // Track stats for reporting
    const stats = {
      created: 0,
      deleted: 0,
      errors: 0,
    };

    // Delete permissions that exist in destination but not in source
    const permissionsToDelete = [];

    for (const [key, permission] of incomingPermissionsByKey.entries()) {
      if (!sourcePermissionsByKey.has(key)) {
        permissionsToDelete.push(permission.id);
      }
    }

    if (permissionsToDelete.length) {
      console.log(
        `Deleting ${permissionsToDelete.length} permissions that are not in source`
      );
      try {
        await client.request(deletePermissions(permissionsToDelete));
        stats.deleted = permissionsToDelete.length;
      } catch (error) {
        console.error("Error deleting permissions:", error);
        stats.errors++;
      }
    }

    // Create permissions that exist in source but not in destination
    for (const [key, permission] of sourcePermissionsByKey.entries()) {
      if (!incomingPermissionsByKey.has(key)) {
        try {
          // Omit ID when creating new permissions as they are auto-incremented
          const permissionToCreate = _.omit(permission, ["id"]);
          await client.request(createPermission(permissionToCreate));
          stats.created++;
        } catch (error: any) {
          console.error(
            `Error creating permission for ${permission.collection}/${permission.action}: ${error.message}`
          );
          stats.errors++;
        }
      }
    }

    console.log(
      `Permission import complete: ${stats.created} created, ${stats.deleted} deleted, ${stats.errors} errors`
    );
  }

  private retrieveDefaults = async () => {
    // start by getting current user (expected to be admin)
    const user = await client.request(readMe());

    // get default role
    const defaultRole = await client.request(readRole(user.role));

    // Get all roles
    const rolesList = await client.request(readRoles());

    // Get admin policies (these have admin_access=true in directus_policies)
    const adminPolicyList = await client.request(
      readPolicies({
        filter: {
          admin_access: { _eq: true },
        },
      })
    );

    // Get access entries to map roles to policies
    const accessEntries = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );

    // Find admin roles by identifying roles associated with admin policies
    let adminRoleIds = new Set<string>();

    // Add roles that have access entries connected to admin policies
    accessEntries.forEach((access) => {
      if (access.role && access.policy) {
        if (adminPolicyList.some((p) => p.id === access.policy)) {
          adminRoleIds.add(access.role);
        }
      }
    });

    // Add the default role (current user's role) if it's not already included
    adminRoleIds.add(defaultRole.id);

    // Also add roles with "admin" in the name as a fallback
    rolesList.forEach((role) => {
      if (role.name?.toLowerCase().includes("admin")) {
        adminRoleIds.add(role.id);
      }
    });

    // Get the actual admin role objects
    let adminRoles = rolesList.filter((r) => adminRoleIds.has(r.id));

    console.log(
      `Identified ${adminRoles.length} admin roles by policy associations and naming`
    );

    // Optional: Log admin roles for visibility
    if (adminRoles.length > 0) {
      console.log(
        `Found ${adminRoles.length} admin role(s) that will be excluded from backup/restore:`,
        adminRoles.map((r) => `${r.name} (${r.id})`).join(", ")
      );
    }

    // get the policies associated with the default role (the api actually returns entities from directus_access as role.policies)
    const defaultAccess = await callDirectusAPI<Record<string, any>[]>(
      `access?filter=${encodeURIComponent(
        JSON.stringify({ id: { _in: defaultRole.policies } })
      )}`,
      "GET"
    );

    // Get system-managed policies (use the existing admin policies list)
    const systemPolicies = await client.request(
      readPolicies({
        filter: {
          name: { _starts_with: "$" },
        },
      })
    );

    const allDefaultPolicies = [
      ...defaultAccess.map((p) => p.policy),
      ...adminPolicyList.map((p) => p.id),
      ...systemPolicies.map((p) => p.id),
    ];

    // Remove duplicates
    const uniqueDefaultPolicies = [...new Set(allDefaultPolicies)];

    // Find Public policy (a system policy with special name $t:public_label)
    // First try to find the policy directly
    const allPolicies = await client.request(readPolicies());
    const publicPolicy = findPublicPolicy(allPolicies);

    // Also check for Public role as a fallback (for backward compatibility)
    const publicRole = findPublicRole(rolesList);

    if (publicPolicy) {
      console.log(
        `Found Public policy: ${publicPolicy.name} (${publicPolicy.id})`
      );
    } else if (publicRole) {
      console.log(`Found Public role: ${publicRole.name} (${publicRole.id})`);
    } else {
      console.log("No Public policy or role found in this environment");
    }

    return {
      defaultRole: defaultRole.id,
      // Store all admin role IDs
      adminRoleIds: adminRoles.map((r) => r.id),
      defaultAccess: defaultAccess.map((p) => p.id),
      defaultPolicy: uniqueDefaultPolicies,
      // Include public role ID if found
      publicRoleId: publicRole?.id,
      // Include public policy ID if found
      publicPolicyId: publicPolicy?.id,
    };
  };

  private retrievePermissions = async (omitId = true) => {
    // Use retry operation for better resilience against network issues
    const permissions = await retryOperation(
      async () => {
        return client.request(
          readPermissions({ filter: { id: { _nnull: true } } })
        );
      },
      3,
      1000,
      true
    );

    if (omitId === false) return permissions.filter((p) => !!p.id);
    else return permissions.filter((p) => !!p.id).map((p) => _.omit(p, ["id"]));
  };

  importRoles = async () => {
    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "roles";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "import",
      status: "running",
      createdAt: now,
    });

    const results = {
      roles: { success: true, message: "" },
      policies: { success: true, message: "" },
      access: { success: true, message: "" },
      permissions: { success: true, message: "" },
    };

    try {
      // Step 1: Import roles
      await this.handleImportRoles();
      results.roles.message = "Roles imported successfully";
    } catch (error: any) {
      results.roles.success = false;
      results.roles.message = extractErrorMessage(error);
      console.error(`Role import failed: ${results.roles.message}`);
    }

    try {
      // Step 2: Import policies
      await this.handleImportPolicies();
      results.policies.message = "Policies imported successfully";
    } catch (error: any) {
      results.policies.success = false;
      results.policies.message = extractErrorMessage(error);
      console.error(`Policy import failed: ${results.policies.message}`);
    }

    try {
      // Step 3: Import access entries
      await this.handleImportAccess();
      results.access.message = "Access entries imported successfully";
    } catch (error: any) {
      results.access.success = false;
      results.access.message = extractErrorMessage(error);
      console.error(`Access import failed: ${results.access.message}`);
    }

    try {
      // Step 4: Import permissions
      await this.handleImportPermissions();
      results.permissions.message = "Permissions imported successfully";
    } catch (error: any) {
      results.permissions.success = false;
      results.permissions.message = extractErrorMessage(error);
      console.error(
        `Permissions import failed: ${results.permissions.message}`
      );
    }

    // Count the total number of items imported
    const roles = JSON.parse(readFileSync(this.rolePath, "utf8")).length;
    const policies = JSON.parse(readFileSync(this.policiesPath, "utf8")).length;
    const access = JSON.parse(readFileSync(this.accessPath, "utf8")).length;
    const permissions = JSON.parse(
      readFileSync(this.permissionsPath, "utf8")
    ).length;

    const totalItems = roles + policies + access + permissions;

    // Track the number of items imported
    this.metadataManager.updateItemsCount(jobType, totalItems);

    // Print summary
    console.log("\n=== Role Import Summary ===");
    let hasFailures = false;

    for (const [type, result] of Object.entries(results)) {
      if (result.success) {
        console.log(`✅ ${type}: ${result.message}`);
      } else {
        console.log(`❌ ${type}: ${result.message}`);
        hasFailures = true;
      }
    }

    if (hasFailures) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        "Some role-related components failed to import"
      );

      throw new Error("Some role-related components failed to import");
    } else {
      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log(
        "\nRoles, policies, access and permissions imported successfully."
      );
    }
  };
}
