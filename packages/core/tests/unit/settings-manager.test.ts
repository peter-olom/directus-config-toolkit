import { SettingsManager } from "../../src/settings";

class TestableSettingsManager extends SettingsManager {
  public validate(
    settings: any,
    context: {
      roles?: Array<{ id: string; name?: string; icon?: string }>;
      files?: Array<{ id: string }>;
      folders?: Array<{ id: string }>;
    }
  ) {
    return this.validateLocalConfig(settings, context);
  }
}

describe("SettingsManager validateLocalConfig", () => {
  const manager = new TestableSettingsManager();

  it("flags structural issues when configuration is not an object", () => {
    const result = manager.validate(null, {});

    expect(
      result.errors.some((msg) => msg.includes("settings.json must contain an object"))
    ).toBe(true);
  });

  it("detects missing references and invalid field types", () => {
    const settings = {
      public_registration_role: "role-unknown",
      project_logo: "file-1",
      storage_default_folder: "folder-1",
      auth_login_attempts: "three",
      custom_field_that_should_be_ignored: true,
    };

    const context = {
      roles: [{ id: "role-1", name: "Admin" }],
      files: [{ id: "file-2" }],
      folders: [{ id: "folder-2" }],
    };

    const result = manager.validate(settings, context);

    expect(
      result.errors.some((msg) => msg.includes("auth_login_attempts"))
    ).toBe(true);
    expect(
      result.warnings.some((msg) =>
        msg.includes('public_registration_role" references unknown role "role-unknown"')
      )
    ).toBe(true);
    expect(
      result.warnings.some((msg) =>
        msg.includes('project_logo" references unknown file "file-1"')
      )
    ).toBe(true);
    expect(
      result.warnings.some((msg) => msg.includes("unsupported setting field"))
    ).toBe(true);
  });

  it("passes for consistent configuration", () => {
    const settings = {
      project_name: "Toolkit",
      auth_login_attempts: 5,
      public_registration: true,
      public_registration_role: "role-1",
      project_logo: "file-1",
    };

    const context = {
      roles: [{ id: "role-1", name: "Members" }],
      files: [{ id: "file-1" }],
      folders: [],
    };

    const result = manager.validate(settings, context);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
