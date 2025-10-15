import { RolesManager } from "../../src/roles";

class TestableRolesManager extends RolesManager {
  public validate(
    roles: any[],
    policies: any[],
    access: any[],
    permissions: any[]
  ) {
    return this.validateLocalConfig(roles, policies, access, permissions);
  }
}

describe("RolesManager validateLocalConfig", () => {
  const manager = new TestableRolesManager();

  it("flags duplicate ids and missing references", () => {
    const roles = [
      { id: "role-1", name: "Role" },
      { id: "role-1", name: "Duplicate" },
    ];
    const policies = [{ id: "policy-1", name: "Policy" }];
    const access = [
      { id: "access-1", role: "missing-role", policy: "policy-1" },
    ];
    const permissions = [
      {
        id: 1,
        collection: "directus_users",
        action: "read",
        role: "missing-role",
      },
    ];

    const result = manager.validate(
      roles as any,
      policies as any,
      access as any,
      permissions as any
    );

    expect(
      result.errors.some((msg) => msg.includes("Duplicate role id"))
    ).toBe(true);
    expect(
      result.warnings.some((msg) => msg.includes("unknown role \"missing-role\""))
    ).toBe(true);
  });

  it("passes for well-formed configuration", () => {
    const roles = [{ id: "role-1", name: "Role" }];
    const policies = [{ id: "policy-1", name: "Policy" }];
    const access = [
      { id: "access-1", role: "role-1", policy: "policy-1" },
    ];
    const permissions = [
      {
        id: 1,
        collection: "directus_users",
        action: "read",
        role: "role-1",
        policy: "policy-1",
      },
    ];

    const result = manager.validate(
      roles as any,
      policies as any,
      access as any,
      permissions as any
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
