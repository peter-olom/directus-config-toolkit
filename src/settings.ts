import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import {
  readRole,
  readSettings,
  updateSettings,
  readRoles,
} from "@directus/sdk";
import { readFileSync, writeFileSync } from "fs";
import { findPublicRole } from "./roles";

interface Role {
  id: string;
  name?: string;
  icon?: string;
}

export class SettingsManager {
  private outputPath: string = join(CONFIG_PATH, "settings.json");
  constructor() {}

  exportSettings = async () => {
    ensureConfigDirs();
    const settings = await client.request(readSettings());
    if (settings.id === null) {
      return console.log("No settings found.");
    }

    writeFileSync(this.outputPath, JSON.stringify(settings, null, 2));
    console.log(`Settings exported to ${this.outputPath}`);
  };

  // Check if a role exists by ID
  private async roleExists(roleId: string): Promise<boolean> {
    if (!roleId) return false;

    try {
      // Use callDirectusAPI to check if role exists
      const role = await client.request(readRole(roleId));

      return !!role;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }

      // For other errors, log and assume role doesn't exist to be safe
      console.error(
        `Error checking if role ${roleId} exists:`,
        error.message || error
      );
      return false;
    }
  }

  // Define fields that are supported by the SDK
  private getSdkSupportedFields(): string[] {
    return [
      "id",
      "project_name",
      "project_url",
      "project_color",
      "project_logo",
      "public_foreground",
      "public_background",
      "public_note",
      "auth_login_attempts",
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
  }

  // Define fields that might cause foreign key constraints
  private getForeignKeyFields(): string[] {
    return [
      "project_logo",
      "public_foreground",
      "public_background",
      "storage_default_folder",
      "public_favicon",
    ];
  }

  // Define additional fields supported by the API but not in the SDK types
  private getUnsupportedFields(): string[] {
    return [
      "public_registration",
      "public_registration_role",
      "public_registration_verify_email",
      "public_registration_email_filter",
      "visual_editor_urls",
    ];
  }

  importSettings = async () => {
    console.log("Importing settings...");
    const destinationSettings = await client.request(readSettings());
    if (destinationSettings.id === null) {
      return console.warn(
        "Settings have not been initialized yet. Save settings in the Directus admin panel first."
      );
    }

    console.log("Reading settings from file...");
    const settings = JSON.parse(readFileSync(this.outputPath, "utf8"));

    // Check for references that might cause foreign key constraints
    try {
      // Get field lists
      const supportedFields = this.getSdkSupportedFields();
      const foreignKeyFields = this.getForeignKeyFields();
      const unsupportedFields = this.getUnsupportedFields();
      const validFields = [...supportedFields, ...unsupportedFields];

      // Filter and validate settings
      const safeSettings: Record<string, any> = {};
      const foreignKeySettings: Record<string, any> = {};
      const extendedSettings: Record<string, any> = {};
      const invalidFields: string[] = [];

      // Sort settings into categories
      Object.entries(settings).forEach(([key, value]) => {
        if (!validFields.includes(key)) {
          invalidFields.push(key);
          return;
        }

        if (unsupportedFields.includes(key)) {
          extendedSettings[key] = value;
        } else if (foreignKeyFields.includes(key)) {
          foreignKeySettings[key] = value;
        } else {
          safeSettings[key] = value;
        }
      });

      // Log any invalid fields found
      if (invalidFields.length > 0) {
        console.warn(
          `Found ${invalidFields.length} invalid settings fields that will be ignored:`,
          invalidFields.join(", ")
        );
      }

      // First update all safe settings that don't have foreign key references
      console.log("Updating base settings...");
      await client.request(updateSettings(safeSettings));
      console.log("Base settings updated successfully.");

      // Handle each foreign key field separately to avoid constraint issues
      if (Object.keys(foreignKeySettings).length > 0) {
        console.log(
          "Processing fields that might have foreign key constraints..."
        );

        for (const [field, value] of Object.entries(foreignKeySettings)) {
          try {
            // Safe cast since we've confirmed these fields are in the SDK
            const updateData = { [field]: value } as any;
            await client.request(updateSettings(updateData));
            console.log(`Successfully updated ${field}`);
          } catch (error: any) {
            console.warn(`Failed to update ${field}: ${error.message}`);
          }
        }
      }

      // Handle special case for public_registration_role
      if (extendedSettings.public_registration_role) {
        console.log("Processing public_registration_role via direct API...");
        let roleId = extendedSettings.public_registration_role;

        try {
          // First check direct ID match
          let roleExists = await this.roleExists(roleId);

          // If role doesn't exist by direct ID, check if it might be the Public role with a different ID
          if (!roleExists) {
            console.log(
              `Role ${roleId} not found directly. Checking if this is a Public role...`
            );

            // Read the source and destination roles to look for Public role mapping
            try {
              // Get existing roles in destination
              const existingRoles = await client.request(readRoles());

              // Read the source roles from file
              const rolePath = join(CONFIG_PATH, "roles.json");
              const incomingRoles = JSON.parse(readFileSync(rolePath, "utf8"));

              // Find the source role that was referenced
              const sourceRole: Role | undefined = (
                incomingRoles as Role[]
              ).find((r: Role) => r.id === roleId);

              if (sourceRole) {
                // Check if this is a Public role
                if (
                  sourceRole.name?.toLowerCase().includes("public") ||
                  sourceRole.name?.startsWith("$t:public") ||
                  sourceRole.icon === "public"
                ) {
                  // Find equivalent Public role in destination
                  const destPublicRole = findPublicRole(existingRoles);

                  if (destPublicRole) {
                    console.log(
                      `Found matching Public role in destination: ${destPublicRole.name} (${destPublicRole.id})`
                    );
                    roleId = destPublicRole.id;
                    roleExists = true;
                  }
                }
              }
            } catch (e) {
              console.warn("Failed to perform advanced role mapping:", e);
              // Continue with original roleId
            }
          }

          if (roleExists) {
            // Use direct API call instead of SDK for unsupported fields
            await client.request({
              method: "PATCH",
              path: "/settings",
              body: {
                public_registration_role: roleId,
              },
            } as any);
            console.log(
              `Successfully updated public_registration_role to ${roleId}`
            );
          } else {
            console.warn(
              `Role ${roleId} not found. Public registration role will not be set.`
            );
          }
        } catch (error: any) {
          console.warn(
            `Failed to update public_registration_role: ${error.message}`
          );
        }
      }

      // Handle other extended fields with direct API calls
      const otherExtendedFields = { ...extendedSettings };
      delete otherExtendedFields.public_registration_role;

      if (Object.keys(otherExtendedFields).length > 0) {
        console.log("Processing other extended fields via direct API...");

        try {
          await client.request({
            method: "PATCH",
            path: "/settings",
            body: otherExtendedFields,
          } as any);
          console.log("Successfully updated extended fields");
        } catch (error: any) {
          console.warn(`Failed to update extended fields: ${error.message}`);
        }
      }

      console.log("Settings import completed successfully.");
    } catch (error: any) {
      console.error("Settings import failed:", error.message || error);
      throw error;
    }
  };
}
