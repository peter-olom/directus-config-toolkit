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
} from "./helper";

interface Defaults {
  defaultRole: any;
  defaultAccess: any[];
  defaultPolicy: any[];
}

export class RolesManager {
  private rolePath: string = join(CONFIG_PATH, "roles.json");
  private policiesPath: string = join(CONFIG_PATH, "policies.json");
  private accessPath: string = join(CONFIG_PATH, "access.json");
  private permissionsPath: string = join(CONFIG_PATH, "permissions.json");
  constructor() {}

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
    const filteredRoles = roles.filter((r) => r.id != defaults.defaultRole);
    const preparedRoles = this.prepareRoles(filteredRoles);

    writeFileSync(this.rolePath, JSON.stringify(preparedRoles, null, 2));
    console.log(`Roles exported to ${this.rolePath}`);
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
    const defaults = await this.retrieveDefaults();

    await this.exportRolesData(defaults);
    await this.exportPoliciesData(defaults);
    await this.exportAccessData(defaults);
    await this.exportPermissionsData();
  };

  private async handleImportRoles() {
    const defaults = await this.retrieveDefaults();
    const incomingRoles = JSON.parse(readFileSync(this.rolePath, "utf8"));
    const existingRoles = await client.request(readRoles());

    // Prepare roles like during export
    const preparedIncomingRoles = this.prepareRoles(incomingRoles);
    const preparedExistingRoles = this.prepareRoles(
      existingRoles.filter((r) => r.id !== defaults.defaultRole)
    );

    for (const role of incomingRoles) {
      const existingRole = existingRoles.find((r) => r.id === role.id);
      if (existingRole) {
        // Compare prepared versions
        const preparedExisting = preparedExistingRoles.find(
          (r) => r.id === role.id
        );
        const preparedIncoming = preparedIncomingRoles.find(
          (r) => r.id === role.id
        );

        if (!_.isEqual(preparedExisting, preparedIncoming)) {
          await client.request(updateRole(role.id, role));
        }
      } else {
        await client.request(createRole(role));
      }
    }

    // delete roles that are not in the source (excluding the default role)
    const diffRoles = _.differenceBy(existingRoles, incomingRoles, "id").filter(
      (r) => r.id !== defaults.defaultRole
    );
    if (diffRoles.length) {
      await client.request(deleteRoles(diffRoles.map((r) => r.id)));
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

    for (const policy of incomingPolicies) {
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
          console.log("Updating policy", policy.id);
          await client.request(updatePolicy(policy.id, policy));
        }
      } else {
        await client.request(createPolicy(policy));
      }
    }

    // delete policies that are not in the source (excluding the default policies)
    const diffPolicies = _.differenceBy(
      existingPolicies,
      incomingPolicies,
      "id"
    ).filter((p) => !defaults.defaultPolicy.includes(p.id));
    if (diffPolicies.length) {
      await client.request(deletePolicies(diffPolicies.map((p) => p.id)));
    }
  }

  private async handleImportAccess() {
    const defaults = await this.retrieveDefaults();
    const incomingAccess = JSON.parse(readFileSync(this.accessPath, "utf8"));
    const existingAccess = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );

    // Prepare access entries like during export
    const preparedIncomingAccess = this.prepareAccess(incomingAccess);
    const preparedExistingAccess = this.prepareAccess(
      existingAccess.filter((a) => !defaults.defaultAccess.includes(a.id))
    );

    for (const access of incomingAccess) {
      const existingEntry = existingAccess.find((a) => a.id === access.id);
      if (existingEntry) {
        // Compare prepared versions from the arrays
        const preparedExisting = preparedExistingAccess.find(
          (a) => a.id === access.id
        );
        const preparedIncoming = preparedIncomingAccess.find(
          (a) => a.id === access.id
        );

        if (!_.isEqual(preparedExisting, preparedIncoming)) {
          await callDirectusAPI(`access/${access.id}`, "PATCH", access);
        }
      } else {
        await callDirectusAPI("access", "POST", access);
      }
    }

    // delete access that are not in the source (excluding the default access and those with users)
    const diffAccess = _.differenceBy(
      existingAccess,
      incomingAccess,
      "id"
    ).filter((a) => !defaults.defaultAccess.includes(a.id) && !a.user);

    if (diffAccess.length) {
      await callDirectusAPI(
        "access",
        "DELETE",
        diffAccess.map((a) => a.id)
      );
    }
  }

  private async handleImportPermissions() {
    const sourcePermissions: Record<string, any>[] = JSON.parse(
      readFileSync(this.permissionsPath, "utf8")
    );
    const incomingPermissions = await this.retrievePermissions(false);

    // for permissions, id is AUTO_INCREMENT IDENTITY_INSERT,
    // so we need to create new permissions and delete obsolete ones on the destination (no updates)

    // what exists in destination but not in source (delete)
    const diffPermissions = _.differenceWith(
      incomingPermissions,
      sourcePermissions,
      (a, b) => _.isEqual(_.omit(a, ["id"]), _.omit(b, ["id"]))
    ).map((p) => p.id);
    if (diffPermissions.length) {
      await client.request(deletePermissions(diffPermissions));
    }

    // what exists in source but not in destination (create)
    const newPermissions = _.differenceWith(
      sourcePermissions,
      incomingPermissions,
      (a, b) => _.isEqual(_.omit(a, ["id"]), _.omit(b, ["id"]))
    );
    for (const permission of newPermissions) {
      await client.request(createPermission(permission));
    }
  }

  private retrieveDefaults = async () => {
    // start by getting current user (expected to be admin)
    const user = await client.request(readMe());

    // get default role
    const defaultRole = await client.request(readRole(user.role));

    // get the policies associated with the default role (the api actually returns entities from directus_access as role.policies)
    const defaultAccess = await callDirectusAPI<Record<string, any>[]>(
      `access?filter=${encodeURIComponent(
        JSON.stringify({ id: { _in: defaultRole.policies } })
      )}`,
      "GET"
    );

    return {
      defaultRole: defaultRole.id,
      defaultAccess: defaultAccess.map((p) => p.id),
      defaultPolicy: defaultAccess.map((p) => p.policy),
    };
  };

  private retrievePermissions = async (omitId = true) => {
    const permissions = await client.request(
      readPermissions({ filter: { id: { _nnull: true } } })
    );
    if (omitId === false) return permissions.filter((p) => !!p.id);
    else return permissions.filter((p) => !!p.id).map((p) => _.omit(p, ["id"]));
  };

  importRoles = async () => {
    await this.handleImportRoles();
    await this.handleImportPolicies();
    await this.handleImportAccess();
    await this.handleImportPermissions();
    console.log(
      "Roles, policies, access and permissions imported successfully."
    );
  };
}
