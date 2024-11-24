import {
  createPolicy,
  createRole,
  deletePolicies,
  deleteRoles,
  readPolicies,
  readRoles,
  updatePolicy,
  updateRole,
} from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import _ from "lodash";
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
  constructor() {}

  emptyPolicies(record: Record<string, any>) {
    if (record["policies"]) {
      record["policies"] = [];
    }
    return record;
  }

  emptyUsers(record: Record<string, any>) {
    if (record["users"]) {
      record["users"] = [];
    }
    return record;
  }

  emptyRoles(record: Record<string, any>) {
    if (record["roles"]) {
      record["roles"] = [];
    }
    return record;
  }

  exportRoles = async () => {
    ensureConfigDirs();
    // backup roles first
    const roles = await client.request(readRoles());
    writeFileSync(
      this.rolePath,
      JSON.stringify(
        roles.map(this.emptyPolicies).map(this.emptyUsers),
        null,
        2
      )
    );

    // backup policies next
    const policies = await client.request(readPolicies());
    writeFileSync(
      this.policiesPath,
      JSON.stringify(
        policies.map(this.emptyRoles).map(this.emptyUsers),
        null,
        2
      )
    );

    // backup none-user access entries - use REST API
    const access = await callDirectusAPI(
      "access?filter[user][_null]=true",
      "GET"
    );
    writeFileSync(this.accessPath, JSON.stringify(access, null, 2));

    console.log(`Roles exported to ${this.rolePath}`);
    console.log(`Policies exported to ${this.policiesPath}`);
    console.log(`Access exported to ${this.accessPath}`);
  };

  importRoles = async () => {
    await this.handleImportRoles();
    await this.handleImportPolicies();
    await this.handleImportAccess();
    console.log("Roles, policies and access imported successfully.");
  };

  private async handleImportRoles() {
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

    const diffRoles = _.differenceBy(destinationRoles, sourceRoles, "id");
    if (diffRoles.length) {
      await client.request(deleteRoles(diffRoles.map((r) => r.id)));
    }
  }

  private async handleImportPolicies() {
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

    const diffPolicies = _.differenceBy(
      destinationPolicies,
      sourcePolicies,
      "id"
    );
    if (diffPolicies.length) {
      await client.request(deletePolicies(diffPolicies.map((p) => p.id)));
    }
  }

  private async handleImportAccess() {
    const sourceAccess = JSON.parse(readFileSync(this.accessPath, "utf8"));
    const destinationAccess = await callDirectusAPI(
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

    const diffAccess = _.differenceBy(destinationAccess, sourceAccess, "id");
    if (diffAccess.length) {
      await callDirectusAPI(
        "access",
        "DELETE",
        diffAccess.map((a) => a.id)
      );
    }
  }

  private async clearRoles() {
    // delete access first
    const access = await callDirectusAPI(
      "access?filter[user][_null]=true",
      "GET"
    );
    await callDirectusAPI(
      "access",
      "DELETE",
      access.map((a) => a.id)
    );

    // policies next
    const policies = await client.request(readPolicies());
    await client.request(deletePolicies(policies.map((policy) => policy.id)));

    // roles last
    const roles = await client.request(readRoles());
    await client.request(deleteRoles(roles.map((role) => role.id)));

    console.log("Roles, policies and access cleared successfully.");
  }
}
