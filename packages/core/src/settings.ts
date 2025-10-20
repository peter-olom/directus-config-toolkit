import { readSettings, updateSettings, readRoles } from "@directus/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import _ from "lodash";
import { client, ensureConfigDirs } from "./helper";
import { findPublicRole } from "./roles";
import { BaseConfigManager, FieldExclusionConfig } from "./base-config-manager";

interface Role {
  id: string;
  name?: string;
  icon?: string;
}

interface DirectusSettings {
  id?: string;
  project_name?: string;
  project_url?: string;
  project_color?: string;
  project_logo?: string;
  public_foreground?: string;
  public_background?: string;
  public_note?: string;
  auth_login_attempts?: number;
  auth_password_policy?: string;
  storage_asset_transform?: string;
  storage_asset_presets?: any;
  custom_css?: string;
  basemaps?: any;
  module_bar?: any;
  custom_aspect_ratios?: any;
  storage_default_folder?: string;
  mapbox_key?: string;
  project_descriptor?: string;
  default_language?: string;
  public_favicon?: string;
  default_appearance?: string;
  default_theme_light?: string;
  theme_light_overrides?: any;
  default_theme_dark?: string;
  theme_dark_overrides?: any;
  report_error_url?: string;
  report_bug_url?: string;
  report_feature_url?: string;
  public_registration?: boolean;
  public_registration_role?: string;
  public_registration_verify_email?: boolean;
  public_registration_email_filter?: any;
  visual_editor_urls?: any;
  [key: string]: any;
}

const SDK_SUPPORTED_FIELDS = [
  "project_name",
  "project_url",
  "project_color",
  "project_logo",
  "public_foreground",
  "public_background",
  "public_note",
  "auth_login_attempts",
  "auth_password_policy",
  "storage_asset_transform",
  "storage_asset_presets",
  "custom_css",
  "basemaps",
  "module_bar",
  "custom_aspect_ratios",
  "storage_default_folder",
  "mapbox_key",
  "project_descriptor",
  "default_language",
  "public_favicon",
  "default_appearance",
  "default_theme_light",
  "theme_light_overrides",
  "default_theme_dark",
  "theme_dark_overrides",
  "report_error_url",
  "report_bug_url",
  "report_feature_url",
];

const FOREIGN_KEY_FIELDS = [
  "project_logo",
  "public_foreground",
  "public_background",
  "storage_default_folder",
  "public_favicon",
];

const UNSUPPORTED_FIELDS = [
  "public_registration",
  "public_registration_role",
  "public_registration_verify_email",
  "public_registration_email_filter",
  "visual_editor_urls",
];

interface ValidationContext {
  roles?: Role[];
  files?: Array<{ id: string }>;
  folders?: Array<{ id: string }>;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

interface CategorizedSettings {
  safe: Record<string, any>;
  foreignKey: Record<string, any>;
  extended: Record<string, any>;
  invalid: string[];
}

interface SettingsDiff {
  changed: string[];
  added: string[];
  removed: string[];
}

export class SettingsManager extends BaseConfigManager<DirectusSettings> {
  protected readonly configType = "settings";
  protected readonly defaultFilename = "settings.json";

  constructor() {
    const fieldConfig: FieldExclusionConfig = {
      excludeFields: ["id"],
    };

    super(fieldConfig);
    this.initializeConfigPath();
  }

  protected async fetchRemoteData(): Promise<DirectusSettings[]> {
    const settings = await client.request(readSettings());
    return [settings];
  }

  private async fetchRemoteSettings() {
    const settings = await client.request(readSettings());
    return this.normalizeSettings(settings);
  }

  private loadLocalSettings(): DirectusSettings {
    try {
      return JSON.parse(readFileSync(this.configPath, "utf8"));
    } catch (error: any) {
      throw new Error(
        `Failed to read local settings configuration: ${error?.message || error}`
      );
    }
  }

  private readOptionalConfig<T>(filename: string): T | undefined {
    const targetPath = this.configPath.replace("settings.json", filename);
    if (!existsSync(targetPath)) {
      return undefined;
    }

    try {
      return JSON.parse(readFileSync(targetPath, "utf8")) as T;
    } catch (error: any) {
      console.warn(
        `Failed to parse ${filename}: ${error?.message || error}. Skipping validation for this reference.`
      );
      return undefined;
    }
  }

  private loadValidationContext(): ValidationContext {
    return {
      roles: this.readOptionalConfig<Role[]>("roles.json"),
      files: this.readOptionalConfig<Array<{ id: string }>>("files.json"),
      folders: this.readOptionalConfig<Array<{ id: string }>>("folders.json"),
    };
  }

  protected validateLocalConfig(
    settings: any,
    context: ValidationContext
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      errors.push("settings.json must contain an object.");
      return { errors, warnings };
    }

    const categorized = this.categorizeSettings(settings as DirectusSettings);
    if (categorized.invalid.length > 0) {
      warnings.push(
        `Ignoring ${categorized.invalid.length} unsupported setting field(s): ${categorized.invalid.join(
          ", "
        )}`
      );
    }

    const numericFields = ["auth_login_attempts"];
    numericFields.forEach((field) => {
      if (
        Object.prototype.hasOwnProperty.call(settings, field) &&
        settings[field] !== null &&
        typeof settings[field] !== "number"
      ) {
        errors.push(`Setting "${field}" must be a number when provided.`);
      }
    });

    const booleanFields = [
      "public_registration",
      "public_registration_verify_email",
    ];
    booleanFields.forEach((field) => {
      if (
        Object.prototype.hasOwnProperty.call(settings, field) &&
        settings[field] !== null &&
        typeof settings[field] !== "boolean"
      ) {
        errors.push(`Setting "${field}" must be a boolean when provided.`);
      }
    });

    if (
      Object.prototype.hasOwnProperty.call(settings, "default_language") &&
      settings.default_language !== null &&
      typeof settings.default_language !== "string"
    ) {
      errors.push(`Setting "default_language" must be a string when provided.`);
    }

    const fileReferenceFields = [
      "project_logo",
      "public_foreground",
      "public_background",
      "public_favicon",
    ];

    const fileContext = context.files;
    fileReferenceFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(settings, field)) {
        return;
      }
      const value = settings[field];
      if (value === null || value === undefined) {
        return;
      }
      if (typeof value !== "string") {
        errors.push(`Setting "${field}" must reference a file identifier.`);
        return;
      }
      if (!fileContext) {
        warnings.push(
          `Cannot validate "${field}" because files.json is missing or unreadable.`
        );
        return;
      }
      const exists = fileContext.some((file) => file.id === value);
      if (!exists) {
        warnings.push(
          `Setting "${field}" references unknown file "${value}".`
        );
      }
    });

    if (
      Object.prototype.hasOwnProperty.call(settings, "storage_default_folder")
    ) {
      const folderValue = settings.storage_default_folder;
      if (folderValue !== null && folderValue !== undefined) {
        if (typeof folderValue !== "string") {
          errors.push(
            `Setting "storage_default_folder" must reference a folder identifier.`
          );
        } else if (!context.folders) {
          warnings.push(
            `Cannot validate "storage_default_folder" because folders.json is missing or unreadable.`
          );
        } else if (
          !context.folders.some((folder) => folder.id === folderValue)
        ) {
          warnings.push(
            `Setting "storage_default_folder" references unknown folder "${folderValue}".`
          );
        }
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(settings, "public_registration_role")
    ) {
      const roleId = settings.public_registration_role;
      if (roleId !== null && roleId !== undefined) {
        if (typeof roleId !== "string") {
          errors.push(
            `Setting "public_registration_role" must reference a role identifier.`
          );
        } else if (!context.roles) {
          warnings.push(
            `Cannot validate "public_registration_role" because roles.json is missing or unreadable.`
          );
        } else if (!context.roles.some((role) => role.id === roleId)) {
          warnings.push(
            `Setting "public_registration_role" references unknown role "${roleId}".`
          );
        }
      }
    }

    return { errors, warnings };
  }

  private categorizeSettings(settings: DirectusSettings): CategorizedSettings {
    const safe: Record<string, any> = {};
    const foreignKey: Record<string, any> = {};
    const extended: Record<string, any> = {};
    const invalid: string[] = [];

    Object.entries(settings).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      if (SDK_SUPPORTED_FIELDS.includes(key)) {
        if (FOREIGN_KEY_FIELDS.includes(key)) {
          foreignKey[key] = value;
        } else {
          safe[key] = value;
        }
        return;
      }

      if (UNSUPPORTED_FIELDS.includes(key)) {
        extended[key] = value;
        return;
      }

      invalid.push(key);
    });

    return { safe, foreignKey, extended, invalid };
  }

  private diffSettings(
    local: Record<string, any>,
    remote: Record<string, any>
  ): SettingsDiff {
    const changed: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];

    const allKeys = new Set([
      ...Object.keys(local),
      ...Object.keys(remote ?? {}),
    ]);

    for (const key of allKeys) {
      const localValue = local[key];
      const remoteValue = remote ? remote[key] : undefined;

      if (localValue === undefined && remoteValue !== undefined) {
        removed.push(key);
        continue;
      }

      if (localValue !== undefined && remoteValue === undefined) {
        added.push(key);
        continue;
      }

      if (!_.isEqual(localValue, remoteValue)) {
        changed.push(key);
      }
    }

    return { changed, added, removed };
  }

  private printDiffPreview(diff: SettingsDiff) {
    if (
      diff.changed.length === 0 &&
      diff.added.length === 0 &&
      diff.removed.length === 0
    ) {
      console.log("Settings already match the target configuration.");
      return;
    }

    if (diff.changed.length > 0) {
      console.log(
        `Will update ${diff.changed.length} field(s): ${diff.changed.join(", ")}`
      );
    }
    if (diff.added.length > 0) {
      console.log(
        `Will add ${diff.added.length} field(s) missing in destination: ${diff.added.join(", ")}`
      );
    }
    if (diff.removed.length > 0) {
      console.warn(
        `Destination has ${diff.removed.length} extra field(s) not present locally: ${diff.removed.join(
          ", "
        )}. They will be left untouched.`
      );
    }
  }

  private pickChangedFields(
    desired: Record<string, any>,
    remote: Record<string, any>
  ) {
    return Object.fromEntries(
      Object.entries(desired).filter(([key, value]) => {
        const remoteValue = remote ? remote[key] : undefined;
        return !_.isEqual(remoteValue, value);
      })
    );
  }

  private async applyPublicRegistrationRole(
    desiredRoleId: string,
    context: ValidationContext
  ): Promise<boolean> {
    let roleId = desiredRoleId;
    let roleExists = await this.roleExists(roleId);

    if (!roleExists) {
      try {
        const destinationRoles = await client.request(readRoles());

        if (context.roles) {
          const sourceRole = context.roles.find((role) => role.id === roleId);
          if (sourceRole) {
            const isPublic =
              sourceRole.name?.toLowerCase().includes("public") ||
              sourceRole.name?.startsWith("$t:public") ||
              sourceRole.icon === "public";

            if (isPublic) {
              const destPublicRole = findPublicRole(destinationRoles);
              if (destPublicRole) {
                console.log(
                  `Resolved public role mapping ${roleId} → ${destPublicRole.id}`
                );
                roleId = destPublicRole.id;
                roleExists = true;
              }
            }
          }
        }
      } catch (error) {
        console.warn(
          "Failed to resolve public role mapping from destination roles:",
          (error as Error).message || error
        );
      }
    }

    if (!roleExists) {
      console.warn(
        `Role ${desiredRoleId} not found in destination. Skipping public_registration_role update.`
      );
      return false;
    }

    await client.request({
      method: "PATCH",
      path: "/settings",
      body: {
        public_registration_role: roleId,
      },
    } as any);

    return true;
  }

  private async applyExtendedSettings(
    extended: Record<string, any>,
    remote: Record<string, any>,
    context: ValidationContext
  ): Promise<number> {
    const payload: Record<string, any> = {};
    let patchedCount = 0;

    for (const [field, value] of Object.entries(extended)) {
      const remoteValue = remote ? remote[field] : undefined;
      if (_.isEqual(remoteValue, value)) {
        continue;
      }

      if (field === "public_registration_role" && typeof value === "string") {
        const updated = await this.applyPublicRegistrationRole(value, context);
        if (updated) {
          patchedCount += 1;
        }
        continue;
      }

      payload[field] = value;
    }

    if (Object.keys(payload).length > 0) {
      await client.request({
        method: "PATCH",
        path: "/settings",
        body: payload,
      } as any);
      patchedCount += Object.keys(payload).length;
    }

    return patchedCount;
  }

  private async applySettings(
    desiredSettings: DirectusSettings,
    context: ValidationContext
  ): Promise<string> {
    const remoteSettings = await this.fetchRemoteSettings();
    const diff = this.diffSettings(desiredSettings, remoteSettings);

    if (
      diff.changed.length === 0 &&
      diff.added.length === 0 &&
      diff.removed.length === 0
    ) {
      return "Settings already synchronized.";
    }

    const { safe, foreignKey, extended } =
      this.categorizeSettings(desiredSettings);

    const summaryParts: string[] = [];

    const basePayload = this.pickChangedFields(safe, remoteSettings);
    if (Object.keys(basePayload).length > 0) {
      await client.request(updateSettings(basePayload));
      summaryParts.push(
        `updated ${Object.keys(basePayload).length} base field(s)`
      );
    }

    const foreignEntries = Object.entries(foreignKey).filter(
      ([key, value]) => !_.isEqual(remoteSettings[key], value)
    );
    for (const [field, value] of foreignEntries) {
      try {
        await client.request(updateSettings({ [field]: value } as any));
        summaryParts.push(`patched relation field "${field}"`);
      } catch (error: any) {
        console.warn(
          `Failed to update relation field "${field}": ${
            error?.message || error
          }`
        );
      }
    }

    const extendedCount = await this.applyExtendedSettings(
      extended,
      remoteSettings,
      context
    );
    if (extendedCount > 0) {
      summaryParts.push(`patched ${extendedCount} extended field(s)`);
    }

    if (diff.removed.length > 0) {
      summaryParts.push(
        `${diff.removed.length} destination-only field(s) left untouched`
      );
    }

    return summaryParts.join("; ") || "Settings import completed.";
  }

  public async exportConfig(): Promise<void> {
    ensureConfigDirs();

    try {
      const settingsArray = await this.fetchRemoteData();
      const settings = settingsArray[0];

      if (settings.id === null) {
        console.log("No settings found.");
        return;
      }

      const normalizedSettings = this.normalizeItem(settings);

      writeFileSync(
        this.configPath,
        JSON.stringify(normalizedSettings, null, 2)
      );
      await this.auditManager.log({
        operation: "export",
        manager: "SettingsManager",
        itemType: "settings",
        status: "success",
        message: "Exported settings successfully",
        snapshotFile: await this.storeEnhancedSnapshot([normalizedSettings]),
      });

      console.log(`Settings exported to ${this.configPath}`);
    } catch (error) {
      console.error("Error exporting settings:", error);
      throw error;
    }
  }

  exportSettings = () => this.exportConfig();

  private async roleExists(roleId: string): Promise<boolean> {
    if (!roleId) return false;

    try {
      const role = await client.request(readRoles({ filter: { id: { _eq: roleId } } }));
      return Array.isArray(role) ? role.some((r: any) => r.id === roleId) : !!role;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      console.error(
        `Error checking if role ${roleId} exists:`,
        error.message || error
      );
      return false;
    }
  }

  public async importConfig(
    dryRun = false
  ): Promise<{ status: "success" | "failure"; message?: string }> {
    try {
      const localSettings = this.loadLocalSettings();
      const context = this.loadValidationContext();
      const validation = this.validateLocalConfig(localSettings, context);

      if (validation.errors.length > 0) {
        validation.errors.forEach((err) => console.error(`❌ ${err}`));
        return {
          status: "failure",
          message: `Validation failed with ${validation.errors.length} error(s).`,
        };
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warn) => console.warn(`⚠️ ${warn}`));
      }

      const remoteSettings = await this.fetchRemoteSettings();
      const diff = this.diffSettings(localSettings, remoteSettings);
      this.printDiffPreview(diff);

      if (dryRun) {
        return {
          status: "success",
          message: "Dry run completed - no changes applied",
        };
      }

      let outcome: { status: "success" | "failure"; message?: string } = {
        status: "success",
      };

      await this.auditManager.auditImportOperation(
        "settings",
        "SettingsManager",
        localSettings,
        () => this.fetchRemoteSettings(),
        async () => {
          try {
            const summary = await this.applySettings(localSettings, context);
            outcome = { status: "success", message: summary };
            return outcome;
          } catch (error: any) {
            outcome = { status: "failure", message: error.message };
            throw error;
          }
        },
        false
      );

      return outcome;
    } catch (error: any) {
      console.error("Error importing settings:", error.message || error);
      return { status: "failure", message: error.message || String(error) };
    }
  }

  importSettings = (dryRun?: boolean) => this.importConfig(dryRun);

  normalizeSettings(settings: any) {
    const { id, user_created, ...normalizedSettings } = settings;
    return normalizedSettings;
  }
}
