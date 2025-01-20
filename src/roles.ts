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

  exportRoles = async () => {
    ensureConfigDirs();
    const defaults = await this.retrieveDefaults();

    // backup roles first (excluding the default role)
    const roles = await client.request(readRoles());
    writeFileSync(
      this.rolePath,
      JSON.stringify(
        roles
          .filter((r) => r.id != defaults.defaultRole)
          .map(this.untrackUsers)
          .map(this.emptyPolicies),
        null,
        2
      )
    );

    // backup policies next (excluding the default policies)
    // drain all relations to policies. They're created by access and permissions
    const policies = await client.request(readPolicies());
    writeFileSync(
      this.policiesPath,
      JSON.stringify(
        policies
          .filter((p) => !defaults.defaultPolicy.includes(p.id))
          .map(this.untrackUsers)
          .map(this.emptyRoles)
          .map(this.emptyPermissions),
        null,
        2
      )
    );

    // backup none-user access entries (excluding the default access)
    const access = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );
    writeFileSync(
      this.accessPath,
      JSON.stringify(
        access.filter((a) => !defaults.defaultAccess.includes(a.id)),
        null,
        2
      )
    );

    // backup permissions - only permissions where id is set
    const permissions = await this.retrievePermissions();
    writeFileSync(this.permissionsPath, JSON.stringify(permissions, null, 2));

    console.log(`Roles exported to ${this.rolePath}`);
    console.log(`Policies exported to ${this.policiesPath}`);
    console.log(`Access exported to ${this.accessPath}`);
    console.log(`Permissions exported to ${this.permissionsPath}`);
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

  private async handleImportRoles() {
    const defaults = await this.retrieveDefaults();
    const sourceRoles = JSON.parse(readFileSync(this.rolePath, "utf8"));
    const destinationRoles = await client.request(readRoles());

    for (const role of sourceRoles) {
      const existingRole = destinationRoles.find((r) => r.id === role.id);
      if (existingRole) {
        if (!_.isEqual(existingRole, role)) {
          await client.request(updateRole(role.id, role));
        }
      } else {
        await client.request(createRole(role));
      }
    }

    // delete roles that are not in the source (excluding the default role)
    const diffRoles = _.differenceBy(
      destinationRoles,
      sourceRoles,
      "id"
    ).filter((r) => r.id !== defaults.defaultRole);
    if (diffRoles.length) {
      await client.request(deleteRoles(diffRoles.map((r) => r.id)));
    }
  }

  private async handleImportPolicies() {
    const defaults = await this.retrieveDefaults();
    const sourcePolicies = JSON.parse(readFileSync(this.policiesPath, "utf8"));
    const destinationPolicies = await client.request(readPolicies());

    for (const policy of sourcePolicies) {
      const existingPolicy = destinationPolicies.find(
        (p) => p.id === policy.id
      );
      if (existingPolicy) {
        if (!_.isEqual(existingPolicy, policy)) {
          await client.request(updatePolicy(policy.id, policy));
        }
      } else {
        await client.request(createPolicy(policy));
      }
    }

    // delete policies that are not in the source (excluding the default policies)
    const diffPolicies = _.differenceBy(
      destinationPolicies,
      sourcePolicies,
      "id"
    ).filter((p) => !defaults.defaultPolicy.includes(p.id));
    if (diffPolicies.length) {
      await client.request(deletePolicies(diffPolicies.map((p) => p.id)));
    }
  }

  private async handleImportAccess() {
    const defaults = await this.retrieveDefaults();
    const sourceAccess = JSON.parse(readFileSync(this.accessPath, "utf8"));
    const destinationAccess = await callDirectusAPI<Record<string, any>[]>(
      "access?filter[user][_null]=true",
      "GET"
    );

    for (const access of sourceAccess) {
      const existingAccess = destinationAccess.find((a) => a.id === access.id);
      if (existingAccess) {
        if (!_.isEqual(existingAccess, access)) {
          await callDirectusAPI(`access/${access.id}`, "PATCH", access);
        }
      } else {
        await callDirectusAPI("access", "POST", access);
      }
    }

    // delete access that are not in the source (excluding the default access)
    const diffAccess = _.differenceBy(
      destinationAccess,
      sourceAccess,
      "id"
    ).filter((a) => !defaults.defaultAccess.includes(a.id));
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
    const destinationPermissions = await this.retrievePermissions(false);

    // for permissions, id is AUTO_INCREMENT IDENTITY_INSERT,
    // so we need to create new permissions and delete obsolete ones on the destination (no updates)

    // what exists in destination but not in source (delete)
    const diffPermissions = _.differenceWith(
      destinationPermissions,
      sourcePermissions,
      (a, b) => _.isEqual(_.omit(a, ["id"]), _.omit(b, ["id"]))
    ).map((p) => p.id);
    if (diffPermissions.length) {
      await client.request(deletePermissions(diffPermissions));
    }

    // what exists in source but not in destination (create)
    const newPermissions = _.differenceWith(
      sourcePermissions,
      destinationPermissions,
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
}
