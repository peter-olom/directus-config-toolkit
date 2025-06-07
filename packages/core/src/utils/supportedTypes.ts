// Utility for supported config types and type validation
import { ConfigType } from "../types/generic";
import { FlowsManager } from "../flows";
import { RolesManager } from "../roles";
import { SettingsManager } from "../settings";
import { FilesManager } from "../files";
import { SchemaManager } from "../schema";

export interface BaseManager {
  exportFlows?: () => Promise<void>;
  exportRoles?: () => Promise<void>;
  exportSettings?: () => Promise<void>;
  exportFiles?: () => Promise<void>;
  exportSchema?: () => Promise<void>;
  importFlows?: (dryRun?: boolean) => Promise<void>;
  importRoles?: (dryRun?: boolean) => Promise<void>;
  importSettings?: (dryRun?: boolean) => Promise<void>;
  importFiles?: (dryRun?: boolean) => Promise<void>;
  importSchema?: (dryRun?: boolean) => Promise<void>;
}

export const managers: Record<ConfigType, BaseManager> = {
  flows: new FlowsManager(),
  roles: new RolesManager(),
  settings: new SettingsManager(),
  files: new FilesManager(),
  schema: new SchemaManager(),
};

export const supportedTypes = Object.keys(managers) as ConfigType[];

export function validateType(value: string): ConfigType {
  if (supportedTypes.includes(value as ConfigType)) {
    return value as ConfigType;
  } else {
    console.error(
      `Invalid type: ${value}. Supported types are: ${supportedTypes.join(
        ", "
      )}`
    );
    process.exit(1);
  }
}
