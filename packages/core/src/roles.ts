import {
  createPermission,
  createPolicy,
  createRole,
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

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
  pendingDelete: number;
  errors: number;
}

interface SyncResult<T = any> {
  stats: SyncStats;
  pendingDeletion: T[];
}

interface RolesSyncResult extends SyncResult<DirectusRole> {
  roleIdMap: Map<string, string>;
}

interface AccessSyncResult extends SyncResult<Record<string, any>> {
  warnings: string[];
}

interface PermissionsSyncResult extends SyncResult<Record<string, any>> {
  warnings: string[];
}

interface ImportResults {
  roles: RolesSyncResult;
  policies: SyncResult<Record<string, any>>;
  access: AccessSyncResult;
  permissions: PermissionsSyncResult;
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

  private loadLocalConfig() {
    try {
      const roles = JSON.parse(readFileSync(this.configPath, "utf8"));
      const policies = JSON.parse(readFileSync(this.policiesPath, "utf8"));
      const access = JSON.parse(readFileSync(this.accessPath, "utf8"));
      const permissions = JSON.parse(
        readFileSync(this.permissionsPath, "utf8")
      );
      return { roles, policies, access, permissions };
    } catch (error: any) {
      throw new Error(
        `Failed to read local configuration: ${error?.message || error}`
      );
    }
  }

  protected validateLocalConfig(
    roles: any,
    policies: any,
    access: any,
    permissions: any
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(roles)) {
      errors.push("roles.json must contain an array");
    }
    if (!Array.isArray(policies)) {
      errors.push("policies.json must contain an array");
    }
    if (!Array.isArray(access)) {
      errors.push("access.json must contain an array");
    }
    if (!Array.isArray(permissions)) {
      errors.push("permissions.json must contain an array");
    }

    if (
      !Array.isArray(roles) ||
      !Array.isArray(policies) ||
      !Array.isArray(access) ||
      !Array.isArray(permissions)
    ) {
      return { errors, warnings };
    }

    const roleIds = new Set<string>();
    const policyIds = new Set<string>();

    roles.forEach((role: any, index: number) => {
      if (!role.id || typeof role.id !== "string") {
        errors.push(`Role at index ${index} is missing a valid "id".`);
      } else if (roleIds.has(role.id)) {
        errors.push(`Duplicate role id detected: ${role.id}`);
      } else {
        roleIds.add(role.id);
      }

      if (!role.name) {
        warnings.push(`Role ${role.id || index} is missing a name.`);
      }
    });

    policies.forEach((policy: any, index: number) => {
      if (!policy.id || typeof policy.id !== "string") {
        errors.push(`Policy at index ${index} is missing a valid "id".`);
      } else if (policyIds.has(policy.id)) {
        errors.push(`Duplicate policy id detected: ${policy.id}`);
      } else {
        policyIds.add(policy.id);
      }

      if (!policy.name) {
        warnings.push(`Policy ${policy.id || index} is missing a name.`);
      }
    });

    access.forEach((entry: any, index: number) => {
      if (!entry.id || typeof entry.id !== "string") {
        errors.push(
          `Access entry at index ${index} is missing a valid "id".`
        );
      }
      if (entry.role && !roleIds.has(entry.role)) {
        warnings.push(
          `Access entry ${entry.id} references unknown role "${entry.role}".`
        );
      }
      if (entry.policy && !policyIds.has(entry.policy)) {
        warnings.push(
          `Access entry ${entry.id} references unknown policy "${entry.policy}".`
        );
      }
    });

    permissions.forEach((permission: any, index: number) => {
      if (!permission.collection || !permission.action) {
        errors.push(
          `Permission at index ${index} must include "collection" and "action".`
        );
      }
      if (permission.role && !roleIds.has(permission.role)) {
        warnings.push(
          `Permission ${permission.id ?? index} references unknown role "${permission.role}".`
        );
      }
      if (permission.policy && !policyIds.has(permission.policy)) {
        warnings.push(
          `Permission ${permission.id ?? index} references unknown policy "${permission.policy}".`
        );
      }
    });

    return { errors, warnings };
  }

  private sanitizeRoleForWrite(
    role: Record<string, any>,
    options: { includeId?: boolean } = {}
  ) {
    const { includeId = false } = options;
    const {
      id,
      name,
      icon,
      description,
      ip_access,
      enforce_tfa,
      admin_access,
      app_access,
    } = role;
    const payload: Record<string, any> = {
      name,
      icon,
      description,
      ip_access,
      enforce_tfa,
      admin_access,
      app_access,
    };
    if (includeId) payload.id = id;
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    return payload;
  }

  private sanitizePolicyForWrite(
    policy: Record<string, any>,
    options: { includeId?: boolean } = {}
  ) {
    const { includeId = false } = options;
    const {
      id,
      name,
      description,
      icon,
      ip_access,
      enforce_tfa,
      admin_access,
      app_access,
      roles,
      permissions,
      users,
      ...rest
    } = policy;
    const payload: Record<string, any> = {
      name,
      description,
      icon,
      ip_access,
      enforce_tfa,
      admin_access,
      app_access,
      ...rest,
    };
    if (includeId) payload.id = id;
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    return payload;
  }

  private sanitizeAccessForWrite(entry: Record<string, any>) {
    const payload: Record<string, any> = { ...entry };
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    return payload;
  }

  private sanitizePermissionForWrite(
    permission: Record<string, any>,
    options: { includeId?: boolean } = {}
  ) {
    const { includeId = false } = options;
    const payload: Record<string, any> = {
      collection: permission.collection,
      action: permission.action,
      role: permission.role ?? null,
      policy: permission.policy ?? null,
      permissions: permission.permissions ?? null,
      validation: permission.validation ?? null,
      presets: permission.presets ?? null,
      fields: permission.fields ?? null,
    };
    if (includeId && permission.id) {
      payload.id = permission.id;
    }
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    return payload;
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

  private normalizeRole(role: any) {
    const r = { ...role };
    if (r["user_created"]) r["user_created"] = null;
    if (r["policies"]) r["policies"] = [];
    if (r["permissions"]) r["permissions"] = [];
    if (r["roles"]) r["roles"] = [];
    if (r["users"]) delete r["users"];
    return r;
  }

  private normalizePolicy(policy: any) {
    const p = { ...policy };
    if (p["user_created"]) p["user_created"] = null;
    if (p["roles"]) p["roles"] = [];
    if (p["permissions"]) p["permissions"] = [];
    if (p["users"]) delete p["users"];
    return p;
  }

  private normalizeAccess(access: any) {
    const a = { ...access };
    if (a["user_created"]) a["user_created"] = null;
    return a;
  }

  private normalizePermission(permission: any) {
    const p = { ...permission };
    if (p["user_created"]) p["user_created"] = null;
    return p;
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

  private logSyncPreview(
    label: string,
    result: SyncResult,
    warnings: string[] = []
  ) {
    const { stats, pendingDeletion } = result;
    const summaryParts = [
      `${stats.created} create`,
      `${stats.updated} update`,
      `${stats.skipped} unchanged`,
    ];
    if (stats.pendingDelete > 0) {
      summaryParts.push(`${stats.pendingDelete} pending manual removal`);
    }
    if (stats.errors > 0) {
      summaryParts.push(`${stats.errors} errors`);
    }
    console.log(`${label}: ${summaryParts.join(", ")}`);

    warnings.forEach((warning) => console.warn(`⚠️ ${warning}`));

    if (pendingDeletion.length > 0) {
      const sampleIds = pendingDeletion
        .slice(0, 5)
        .map((item: any) => item.id || "<unknown>")
        .join(", ");
      console.warn(
        `⚠️ ${label} not present in snapshot (${pendingDeletion.length}). Manual removal recommended. Sample: ${sampleIds}${
          pendingDeletion.length > 5 ? "…" : ""
        }`
      );
    }
  }

  private buildImportSummary(results: ImportResults) {
    const roleSummary = [
      `Roles → ${results.roles.stats.created} created`,
      `${results.roles.stats.updated} updated`,
      `${results.roles.stats.skipped} unchanged`,
    ];
    if (results.roles.stats.pendingDelete > 0) {
      roleSummary.push(
        `${results.roles.stats.pendingDelete} pending manual removal`
      );
    }

    const policySummary = [
      `Policies → ${results.policies.stats.created} created`,
      `${results.policies.stats.updated} updated`,
      `${results.policies.stats.skipped} unchanged`,
    ];
    if (results.policies.stats.pendingDelete > 0) {
      policySummary.push(
        `${results.policies.stats.pendingDelete} pending manual removal`
      );
    }

    const accessSummary = [
      `Access → ${results.access.stats.created} created`,
      `${results.access.stats.updated} updated`,
      `${results.access.stats.skipped} unchanged`,
    ];
    if (results.access.stats.pendingDelete > 0) {
      accessSummary.push(
        `${results.access.stats.pendingDelete} pending manual removal`
      );
    }

    const permissionSummary = [
      `Permissions → ${results.permissions.stats.created} created`,
      `${results.permissions.stats.updated} updated`,
      `${results.permissions.stats.skipped} unchanged`,
    ];
    if (results.permissions.stats.pendingDelete > 0) {
      permissionSummary.push(
        `${results.permissions.stats.pendingDelete} pending manual removal`
      );
    }

    return `${roleSummary.join(", ")}; ${policySummary.join(", ")}; ${accessSummary.join(", ")}; ${permissionSummary.join(", ")}`;
  }

  private async fetchExistingData(): Promise<{
    roles: DirectusRole[];
    policies: Record<string, any>[];
    access: Record<string, any>[];
    permissions: Record<string, any>[];
  }> {
    const [roles, policies, access, permissions] = await Promise.all([
      client.request(readRoles()) as Promise<DirectusRole[]>,
      client.request(readPolicies()) as Promise<Record<string, any>[]>,
      callDirectusAPI<Record<string, any>[]>(
        "access?filter[user][_null]=true",
        "GET"
      ),
      this.retrievePermissions(false) as Promise<Record<string, any>[]>,
    ]);

    return {
      roles,
      policies,
      access: Array.isArray(access) ? access : [],
      permissions,
    };
  }

  private async syncRoles(
    localRoles: Record<string, any>[],
    existingRoles: DirectusRole[],
    defaults: Defaults,
    options: { simulate?: boolean } = {}
  ): Promise<RolesSyncResult> {
    const { simulate = false } = options;
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
      errors: 0,
    };
    const roleIdMap = this.mapSpecialRoles(localRoles, existingRoles);
    const managedRoleIds = new Set<string>();

    const rolesToExclude = new Set<string>(defaults.adminRoleIds);
    if (defaults.defaultRole) {
      rolesToExclude.add(defaults.defaultRole);
    }

    const filteredExistingRoles = existingRoles.filter(
      (role) => !rolesToExclude.has(role.id)
    );
    const existingRoleMap = new Map(
      filteredExistingRoles.map((role) => [role.id, role])
    );

    for (const role of localRoles) {
      const mappedId = roleIdMap.get(role.id) || role.id;
      roleIdMap.set(role.id, mappedId);

      if (rolesToExclude.has(mappedId)) {
        console.log(
          `Skipping managed role ${role.name} (${role.id}) due to admin/default exclusion.`
        );
        continue;
      }

      managedRoleIds.add(mappedId);
      const existing = existingRoleMap.get(mappedId);
      const desiredNormalized = this.normalizeRole({ ...role, id: mappedId });

      if (existing) {
        const currentNormalized = this.normalizeRole(existing);
        if (!_.isEqual(currentNormalized, desiredNormalized)) {
          stats.updated++;
          if (!simulate) {
            try {
              await client.request(
                updateRole(mappedId, this.sanitizeRoleForWrite(role))
              );
            } catch (error: any) {
              stats.errors++;
              console.error(
                `Error updating role ${role.name} (${mappedId}): ${
                  error.message || error
                }`
              );
            }
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          try {
            await client.request(
              createRole(
                this.sanitizeRoleForWrite(role, { includeId: true })
              )
            );
          } catch (error: any) {
            stats.errors++;
            console.error(
              `Error creating role ${role.name} (${role.id}): ${
                error.message || error
              }`
            );
          }
        }
      }
    }

    const pendingDeletion = filteredExistingRoles.filter(
      (role) => !managedRoleIds.has(role.id)
    );
    stats.pendingDelete = pendingDeletion.length;

    return { stats, pendingDeletion, roleIdMap };
  }

  private async syncPolicies(
    localPolicies: Record<string, any>[],
    existingPolicies: Record<string, any>[],
    defaults: Defaults,
    options: { simulate?: boolean } = {}
  ): Promise<SyncResult<Record<string, any>>> {
    const { simulate = false } = options;
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
      errors: 0,
    };

    const excludedPolicies = new Set<string>(defaults.defaultPolicy);
    const systemPolicyIds = existingPolicies
      .filter((p) => p.name?.startsWith("$t:"))
      .map((p) => p.id);
    systemPolicyIds.forEach((id) => excludedPolicies.add(id));

    const filteredExistingPolicies = existingPolicies.filter(
      (policy) => !excludedPolicies.has(policy.id) && !policy.admin_access
    );
    const existingPolicyMap = new Map(
      filteredExistingPolicies.map((policy) => [policy.id, policy])
    );

    for (const policy of localPolicies) {
      if (!policy.id || excludedPolicies.has(policy.id)) {
        stats.skipped++;
        continue;
      }

      const existing = existingPolicyMap.get(policy.id);
      const desiredNormalized = this.normalizePolicy(policy);

      if (existing) {
        const currentNormalized = this.normalizePolicy(existing);
        if (!_.isEqual(currentNormalized, desiredNormalized)) {
          stats.updated++;
          if (!simulate) {
            try {
              await client.request(
                updatePolicy(policy.id, this.sanitizePolicyForWrite(policy))
              );
            } catch (error: any) {
              stats.errors++;
              console.error(
                `Error updating policy ${policy.name} (${policy.id}): ${
                  error.message || error
                }`
              );
            }
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          try {
            await client.request(
              createPolicy(
                this.sanitizePolicyForWrite(policy, { includeId: true })
              )
            );
          } catch (error: any) {
            stats.errors++;
            console.error(
              `Error creating policy ${policy.name} (${policy.id}): ${
                error.message || error
              }`
            );
          }
        }
      }
    }

    const pendingDeletion = filteredExistingPolicies.filter(
      (policy) =>
        !localPolicies.some((local) => local.id === policy.id) &&
        !excludedPolicies.has(policy.id)
    );
    stats.pendingDelete = pendingDeletion.length;

    return { stats, pendingDeletion };
  }

  private async syncAccess(
    localAccess: Record<string, any>[],
    existingAccess: Record<string, any>[],
    defaults: Defaults,
    options: { simulate?: boolean; roleIdMap: Map<string, string> }
  ): Promise<AccessSyncResult> {
    const { simulate = false, roleIdMap } = options;
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
      errors: 0,
    };
    const warnings: string[] = [];

    const excludedAccessIds = new Set<string>(defaults.defaultAccess);
    const existingAccessMap = new Map(
      existingAccess.map((entry) => [entry.id, entry])
    );
    const processedLocalAccess: Record<string, any>[] = localAccess.map((entry) => {
      let mappedRole = entry.role;
      if (mappedRole && roleIdMap.has(mappedRole)) {
        mappedRole = roleIdMap.get(mappedRole)!;
      } else if (mappedRole && !roleIdMap.has(mappedRole)) {
        warnings.push(
          `Access entry ${entry.id} references unknown role "${mappedRole}"`
        );
      }
      return { ...entry, role: mappedRole };
    });

    const managedAccessIds = new Set<string>();

    for (const entry of processedLocalAccess) {
      if (!entry.id) {
        warnings.push("Encountered access entry without an id; skipping.");
        continue;
      }

      managedAccessIds.add(entry.id);

      if (excludedAccessIds.has(entry.id)) {
        stats.skipped++;
        continue;
      }

      const existing = existingAccessMap.get(entry.id);
      const desiredNormalized = this.normalizeAccess(entry);

      if (existing) {
        const currentNormalized = this.normalizeAccess(existing);
        if (!_.isEqual(currentNormalized, desiredNormalized)) {
          stats.updated++;
          if (!simulate) {
            try {
              await callDirectusAPI(
                `access/${entry.id}`,
                "PATCH",
                this.sanitizeAccessForWrite(entry)
              );
            } catch (error: any) {
              stats.errors++;
              console.error(
                `Error updating access entry ${entry.id}: ${
                  error.message || error
                }`
              );
            }
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          try {
            await callDirectusAPI(
              "access",
              "POST",
              this.sanitizeAccessForWrite(entry)
            );
          } catch (error: any) {
            stats.errors++;
            console.error(
              `Error creating access entry ${entry.id}: ${
                error.message || error
              }`
            );
          }
        }
      }
    }

    const pendingDeletion = existingAccess.filter((entry) => {
      if (excludedAccessIds.has(entry.id)) return false;
      if (entry.user) return false;
      return !managedAccessIds.has(entry.id);
    });
    stats.pendingDelete = pendingDeletion.length;

    return { stats, pendingDeletion, warnings };
  }

  private async syncPermissions(
    localPermissions: Record<string, any>[],
    existingPermissions: Record<string, any>[],
    options: { simulate?: boolean; roleIdMap: Map<string, string> } = {
      roleIdMap: new Map(),
    }
  ): Promise<PermissionsSyncResult> {
    const { simulate = false, roleIdMap } = options;
    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
      errors: 0,
    };
    const warnings: string[] = [];

    const processedLocalPermissions: Record<string, any>[] = localPermissions.map((permission) => {
      if (permission.role && roleIdMap.has(permission.role)) {
        return { ...permission, role: roleIdMap.get(permission.role) };
      }
      if (permission.role && !roleIdMap.has(permission.role)) {
        warnings.push(
          `Permission entry ${permission.id ?? "<no-id>"} references unknown role "${permission.role}".`
        );
      }
      return permission;
    });

    const localByKey = new Map<string, Record<string, any>>();
    processedLocalPermissions.forEach((permission) => {
      localByKey.set(this.getPermissionKey(permission), permission);
    });

    const existingByKey = new Map<string, Record<string, any>>();
    existingPermissions.forEach((permission) => {
      existingByKey.set(this.getPermissionKey(permission), permission);
    });

    const pendingDeletion: Record<string, any>[] = [];
    for (const [key, remote] of existingByKey.entries()) {
      if (!localByKey.has(key)) {
        pendingDeletion.push(remote);
      }
    }
    stats.pendingDelete = pendingDeletion.length;

    for (const [key, desired] of localByKey.entries()) {
      const existing = existingByKey.get(key);
      if (existing) {
        const currentNormalized = this.normalizePermission(existing);
        const desiredNormalized = this.normalizePermission(desired);
        if (!_.isEqual(currentNormalized, desiredNormalized)) {
          stats.updated++;
          if (!simulate) {
            try {
              await callDirectusAPI(
                `permissions/${existing.id}`,
                "PATCH",
                this.sanitizePermissionForWrite(desired)
              );
            } catch (error: any) {
              stats.errors++;
              console.error(
                `Error updating permission ${existing.id}: ${
                  error.message || error
                }`
              );
            }
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          try {
            await client.request(
              createPermission(
                this.sanitizePermissionForWrite(desired, { includeId: false })
              )
            );
          } catch (error: any) {
            stats.errors++;
            console.error(
              `Error creating permission for ${desired.collection}/${desired.action}: ${
                error.message || error
              }`
            );
          }
        }
      }
    }

    return { stats, pendingDeletion, warnings };
  }

  private async performSync(
    local: {
      roles: Record<string, any>[];
      policies: Record<string, any>[];
      access: Record<string, any>[];
      permissions: Record<string, any>[];
    },
    defaults: Defaults,
    existing: {
      roles: DirectusRole[];
      policies: Record<string, any>[];
      access: Record<string, any>[];
      permissions: Record<string, any>[];
    },
    options: { simulate?: boolean } = {}
  ): Promise<ImportResults> {
    const rolesResult = await this.syncRoles(
      local.roles,
      existing.roles,
      defaults,
      options
    );
    const policiesResult = await this.syncPolicies(
      local.policies,
      existing.policies,
      defaults,
      options
    );
    const accessResult = await this.syncAccess(
      local.access,
      existing.access,
      defaults,
      { ...options, roleIdMap: rolesResult.roleIdMap }
    );
    const permissionsResult = await this.syncPermissions(
      local.permissions,
      existing.permissions,
      { ...options, roleIdMap: rolesResult.roleIdMap }
    );

    return {
      roles: rolesResult,
      policies: policiesResult,
      access: accessResult,
      permissions: permissionsResult,
    };
  }

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

  
  private async auditImport(dryRun = false): Promise<{
    status: "success" | "failure";
    message?: string;
  }> {
    const local = this.loadLocalConfig();
    const validation = this.validateLocalConfig(
      local.roles,
      local.policies,
      local.access,
      local.permissions
    );

    validation.errors.forEach((error) => console.error(`❌ ${error}`));
    validation.warnings.forEach((warning) => console.warn(`⚠️ ${warning}`));

    if (validation.errors.length > 0) {
      return {
        status: "failure",
        message: `Validation failed with ${validation.errors.length} error(s).`,
      };
    }

    const defaults = await this.retrieveDefaults();
    const existing = await this.fetchExistingData();

    const normalizedLocalData = {
      roles: Array.isArray(local.roles)
        ? this.prepareRoles(local.roles.map((r) => this.normalizeRole(r)))
        : [],
      policies: Array.isArray(local.policies)
        ? this.preparePolicies(
            local.policies.map((p) => this.normalizePolicy(p))
          )
        : [],
      access: Array.isArray(local.access)
        ? this.prepareAccess(local.access.map((a) => this.normalizeAccess(a)))
        : [],
      permissions: Array.isArray(local.permissions)
        ? local.permissions.map((p) => this.normalizePermission(p))
        : [],
    };

    const fetchAndNormalizeRemote = async () => {
      const latest = await this.fetchExistingData();
      const filteredDefaults = await this.retrieveDefaults();
      return {
        roles: this.prepareRoles(
          latest.roles
            .filter((r) => !filteredDefaults.adminRoleIds.includes(r.id))
            .map((r) => this.normalizeRole(r))
        ),
        policies: this.preparePolicies(
          latest.policies
            .filter((p) => !filteredDefaults.defaultPolicy.includes(p.id))
            .map((p) => this.normalizePolicy(p))
        ),
        access: this.prepareAccess(
          latest.access
            .filter((a) => !filteredDefaults.defaultAccess.includes(a.id))
            .map((a) => this.normalizeAccess(a))
        ),
        permissions: latest.permissions.map((p) =>
          this.normalizePermission(p)
        ),
      };
    };

    if (dryRun) {
      const results = await this.performSync(local, defaults, existing, {
        simulate: true,
      });
      this.logSyncPreview("Roles", results.roles);
      this.logSyncPreview("Policies", results.policies);
      this.logSyncPreview("Access", results.access, results.access.warnings);
      this.logSyncPreview(
        "Permissions",
        results.permissions,
        results.permissions.warnings
      );
      return {
        status: "success",
        message: "Dry run completed - no changes applied",
      };
    }

    let outcome: { status: "success" | "failure"; message?: string } = {
      status: "success",
    };

    await this.auditManager.auditImportOperation(
      "roles",
      "RolesManager",
      normalizedLocalData,
      fetchAndNormalizeRemote,
      async () => {
        const results = await this.performSync(local, defaults, existing, {
          simulate: false,
        });
        const summary = this.buildImportSummary(results);
        outcome = { status: "success", message: summary };
        return outcome;
      },
      false
    );

    return outcome;
  }

  importRoles = async (dryRun = false) => {
    const result = await this.auditImport(dryRun);
    if (result.status === "failure") {
      throw new Error(result.message || "Import failed");
    }
    if (result.message) {
      console.log(result.message);
    }
    return result;
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
      const result = await this.importRoles(dryRun);
      return {
        status: "success",
        message: result.message || "Roles imported successfully.",
      };
    } catch (error: any) {
      return { status: "failure", message: error.message };
    }
  }
}
