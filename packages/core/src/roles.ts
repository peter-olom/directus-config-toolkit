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
import _ from "lodash";
import {
  callDirectusAPI,
  client,
  ensureConfigDirs,
  retryOperation,
} from "./helper";
import { BaseConfigManager, FieldExclusionConfig } from "./base-config-manager";

interface DirectusRole {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  ip_access?: string[];
  enforce_tfa?: boolean;
  admin_access?: boolean;
  app_access?: boolean;
  policies?: any[];
  users?: any[];
  [key: string]: any;
}

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

export class RolesManager extends BaseConfigManager<DirectusRole> {
  protected readonly configType = "roles";
  protected readonly defaultFilename = "roles.json";

  private policiesPath: string;
  private accessPath: string;
  private permissionsPath: string;

  constructor() {
    // Roles have specific field handling requirements
    const fieldConfig: FieldExclusionConfig = {
      emptyRelationFields: ["policies", "users"], // Many-to-many relationships
    };

    super(fieldConfig);
    this.initializeConfigPath();
    this.policiesPath = this.configPath.replace("roles.json", "policies.json");
    this.accessPath = this.configPath.replace("roles.json", "access.json");
    this.permissionsPath = this.configPath.replace(
      "roles.json",
      "permissions.json"
    );
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

    writeFileSync(this.configPath, JSON.stringify(preparedRoles, null, 2));
    console.log(`${filteredRoles.length} roles exported to ${this.configPath}`);
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

  private async auditExport(
    roles: any[],
    policies: any[],
    access: any[],
    permissions: any[]
  ) {
    // Apply the same normalization and field picking as during export
    const normalizedRoles = Array.isArray(roles)
      ? this.prepareRoles(roles.map((r) => this.normalizeRole(r)))
      : [];

    const normalizedPolicies = Array.isArray(policies)
      ? this.preparePolicies(policies.map((p) => this.normalizePolicy(p)))
      : [];

    const normalizedAccess = Array.isArray(access)
      ? this.prepareAccess(access.map((a) => this.normalizeAccess(a)))
      : [];

    // No need to normalize permissions as they are already normalized during export
    const normalizedPermissions = Array.isArray(permissions) ? permissions : [];

    const rolesSnapshotPath = await this.auditManager.storeSnapshot(
      "roles",
      normalizedRoles
    );
    const policiesSnapshotPath = await this.auditManager.storeSnapshot(
      "policies",
      normalizedPolicies
    );
    const accessSnapshotPath = await this.auditManager.storeSnapshot(
      "access",
      normalizedAccess
    );
    const permissionsSnapshotPath = await this.auditManager.storeSnapshot(
      "permissions",
      normalizedPermissions
    );
    await this.auditManager.log({
      operation: "export",
      manager: "RolesManager",
      itemType: "roles",
      status: "success",
      message: `Exported ${normalizedRoles.length} roles, ${normalizedPolicies.length} policies, ${normalizedAccess.length} access entries, ${normalizedPermissions.length} permissions`,
      snapshotFile: rolesSnapshotPath,
    });
    await this.auditManager.log({
      operation: "export",
      manager: "RolesManager",
      itemType: "policies",
      status: "success",
      message: `Exported ${normalizedPolicies.length} policies`,
      snapshotFile: policiesSnapshotPath,
    });
    await this.auditManager.log({
      operation: "export",
      manager: "RolesManager",
      itemType: "access",
      status: "success",
      message: `Exported ${normalizedAccess.length} access entries`,
      snapshotFile: accessSnapshotPath,
    });
    await this.auditManager.log({
      operation: "export",
      manager: "RolesManager",
      itemType: "permissions",
      status: "success",
      message: `Exported ${normalizedPermissions.length} permissions`,
      snapshotFile: permissionsSnapshotPath,
    });
  }

  exportRoles = async () => {
    ensureConfigDirs();
    try {
      const defaults = await this.retrieveDefaults();
      await this.exportRolesData(defaults);
      await this.exportPoliciesData(defaults);
      await this.exportAccessData(defaults);
      await this.exportPermissionsData();
      const roles = JSON.parse(readFileSync(this.configPath, "utf8"));
      const policies = JSON.parse(readFileSync(this.policiesPath, "utf8"));
      const access = JSON.parse(readFileSync(this.accessPath, "utf8"));
      const permissions = JSON.parse(
        readFileSync(this.permissionsPath, "utf8")
      );
      await this.auditExport(roles, policies, access, permissions);
      console.log("Roles export completed successfully");
    } catch (error) {
      console.error("Error exporting roles:", error);
      throw error;
    }
  };

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
    const incomingRoles = JSON.parse(readFileSync(this.configPath, "utf8"));
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
    const incomingRoles = JSON.parse(readFileSync(this.configPath, "utf8"));
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
    const incomingRoles = JSON.parse(readFileSync(this.configPath, "utf8"));
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

  normalizeRole(role: any) {
    // Normalize a role for consistent comparison:
    // 1. Nullify user_created field
    // 2. Empty nested arrays (policies, permissions, roles)
    // 3. Remove users array
    const r = { ...role };
    if (r["user_created"]) r["user_created"] = null;
    if (r["policies"]) r["policies"] = [];
    if (r["permissions"]) r["permissions"] = [];
    if (r["roles"]) r["roles"] = [];
    if (r["users"]) delete r["users"]; // Remove users array
    return r;
  }

  normalizePolicy(policy: any) {
    // Normalize a policy for consistent comparison:
    // 1. Nullify user_created field
    // 2. Empty nested arrays (roles, permissions)
    // 3. Remove users array
    const p = { ...policy };
    if (p["user_created"]) p["user_created"] = null;
    if (p["roles"]) p["roles"] = [];
    if (p["permissions"]) p["permissions"] = [];
    if (p["users"]) delete p["users"]; // Remove users array
    return p;
  }

  normalizeAccess(access: any) {
    // Nullify user_created for consistency
    const a = { ...access };
    if (a["user_created"]) a["user_created"] = null;
    return a;
  }

  normalizePermission(permission: any) {
    // Nullify user_created for consistency
    const p = { ...permission };
    if (p["user_created"]) p["user_created"] = null;
    return p;
  }

  /**
   * Fetches and filters remote roles, policies, access and permissions data
   * IMPORTANT: This method applies the same filtering and transformations as the export methods to ensure
   * that the diff/comparison only shows differences in the data that would actually
   * be exported. It:
   *
   * 1. Excludes admin roles, default policies, and default access entries
   * 2. Removes IDs from permissions for cross-environment portability
   * 3. Removes user arrays from roles and policies
   * 4. Empties nested arrays (permissions, roles, policies) to avoid circular references
   * 5. Normalizes metadata fields like user_created
   */
  private async fetchRemoteRolesAndRelated() {
    // Get defaults to apply consistent filtering (same as in export methods)
    const defaults = await this.retrieveDefaults();

    // Get and filter roles the same way as in exportRolesData()
    const allRoles = await client.request(readRoles());
    const rolesToExclude = [...defaults.adminRoleIds];
    if (defaults.defaultRole) {
      rolesToExclude.push(defaults.defaultRole);
    }
    const normalizedRoles = allRoles
      .filter((r) => !rolesToExclude.includes(r.id))
      .map((r) => this.normalizeRole(r));
    // Apply the same preparations as in export to ensure consistency
    const filteredRoles = this.prepareRoles(normalizedRoles);

    // Get and filter policies the same way as in exportPoliciesData()
    const allPolicies = await client.request(readPolicies());
    const normalizedPolicies = allPolicies
      .filter((p) => !defaults.defaultPolicy.includes(p.id))
      .map((p) => this.normalizePolicy(p));
    // Apply the same preparations as in export to ensure consistency
    const filteredPolicies = this.preparePolicies(normalizedPolicies);

    // Get and filter access the same way as in exportAccessData()
    const allAccess = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );
    const filteredAccess = Array.isArray(allAccess)
      ? allAccess
          .filter((a) => !defaults.defaultAccess.includes(a.id))
          .map((a) => this.normalizeAccess(a))
      : [];

    // Get permissions the same way as in exportPermissionsData()
    const permissions = await this.retrievePermissions();

    return {
      roles: filteredRoles,
      policies: filteredPolicies,
      access: filteredAccess,
      permissions: permissions,
    };
  }

  private async auditImport(dryRun = false) {
    // Read local data
    const localRolesRaw = JSON.parse(readFileSync(this.configPath, "utf8"));
    const localPoliciesRaw = JSON.parse(
      readFileSync(this.policiesPath, "utf8")
    );
    const localAccessRaw = JSON.parse(readFileSync(this.accessPath, "utf8"));
    const localPermissionsRaw = JSON.parse(
      readFileSync(this.permissionsPath, "utf8")
    );

    // Normalize local data using the same transformations as during export
    const localRoles = Array.isArray(localRolesRaw)
      ? this.prepareRoles(localRolesRaw.map((r) => this.normalizeRole(r)))
      : [];

    const localPolicies = Array.isArray(localPoliciesRaw)
      ? this.preparePolicies(
          localPoliciesRaw.map((p) => this.normalizePolicy(p))
        )
      : [];

    const localAccess = Array.isArray(localAccessRaw)
      ? this.prepareAccess(localAccessRaw.map((a) => this.normalizeAccess(a)))
      : [];

    // No additional normalization needed for permissions
    const localPermissions = Array.isArray(localPermissionsRaw)
      ? localPermissionsRaw
      : [];

    // Create a normalized local data object
    const normalizedLocalData = {
      roles: localRoles,
      policies: localPolicies,
      access: localAccess,
      permissions: localPermissions,
    };

    // Wrap remote fetch to normalize remote data the same way
    const fetchAndNormalizeRemote = async () => {
      const remote = await this.fetchRemoteRolesAndRelated();
      // No additional preparation needed since filtering is now done in fetchRemoteRolesAndRelated
      return {
        roles: remote.roles,
        policies: remote.policies,
        access: remote.access,
        permissions: remote.permissions,
      };
    };

    await this.auditManager.auditImportOperation(
      "roles",
      "RolesManager",
      normalizedLocalData,
      fetchAndNormalizeRemote,
      async () => {
        await this.handleImportRoles();
        await this.handleImportPolicies();
        await this.handleImportAccess();
        await this.handleImportPermissions();
        return {
          status: "success",
          message:
            "Roles, policies, access, and permissions imported successfully.",
        };
      },
      dryRun
    );
  }

  importRoles = async (dryRun = false) => {
    await this.auditImport(dryRun);
    if (!dryRun) {
      console.log(
        "Roles, policies, access and permissions imported successfully."
      );
    } else {
      console.log("[Dry Run] Import preview complete. No changes applied.");
    }
  };

  // --- Add/restore retrieveDefaults and retrievePermissions as arrow functions ---
  private retrieveDefaults = async () => {
    const user = await client.request(readMe());
    const defaultRole = await client.request(readRole(user.role));
    const rolesList = await client.request(readRoles());
    const adminPolicyList = await client.request(
      readPolicies({ filter: { admin_access: { _eq: true } } })
    );
    const accessEntries = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );
    let adminRoleIds = new Set<string>();
    accessEntries.forEach((access) => {
      if (access.role && access.policy) {
        if (adminPolicyList.some((p) => p.id === access.policy)) {
          adminRoleIds.add(access.role);
        }
      }
    });
    adminRoleIds.add(defaultRole.id);
    rolesList.forEach((role) => {
      if (role.name?.toLowerCase().includes("admin")) {
        adminRoleIds.add(role.id);
      }
    });
    let adminRoles = rolesList.filter((r) => adminRoleIds.has(r.id));
    const defaultAccess = await callDirectusAPI<Record<string, any>[]>(
      `access?filter=${encodeURIComponent(
        JSON.stringify({ id: { _in: defaultRole.policies } })
      )}`,
      "GET"
    );
    const systemPolicies = await client.request(
      readPolicies({ filter: { name: { _starts_with: "$" } } })
    );
    const allDefaultPolicies = [
      ...defaultAccess.map((p) => p.policy),
      ...adminPolicyList.map((p) => p.id),
      ...systemPolicies.map((p) => p.id),
    ];
    const uniqueDefaultPolicies = [...new Set(allDefaultPolicies)];
    const allPolicies = await client.request(readPolicies());
    const publicPolicy = findPublicPolicy(allPolicies);
    const publicRole = findPublicRole(rolesList);
    return {
      defaultRole: defaultRole.id,
      adminRoleIds: adminRoles.map((r) => r.id),
      defaultAccess: defaultAccess.map((p) => p.id),
      defaultPolicy: uniqueDefaultPolicies,
      publicRoleId: publicRole?.id,
      publicPolicyId: publicPolicy?.id,
    };
  };

  private retrievePermissions = async (omitId = true) => {
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

  protected async fetchRemoteData(): Promise<DirectusRole[]> {
    const roles = await client.request(readRoles());
    return roles.map((role) => this.normalizeItem(role as DirectusRole));
  }

  public async exportConfig(): Promise<void> {
    return this.exportRoles();
  }

  public async importConfig(
    dryRun = false
  ): Promise<{ status: "success" | "failure"; message?: string }> {
    try {
      await this.importRoles(dryRun);
      return { status: "success", message: "Roles imported successfully." };
    } catch (error: any) {
      return { status: "failure", message: error.message };
    }
  }
}
