import "dotenv/config";
import pkg from "../package.json";

// Export all Manager classes for direct import in other packages
export { FlowsManager } from "./flows";
export { RolesManager } from "./roles";
export { SettingsManager } from "./settings";
export { FilesManager } from "./files";
export { SchemaManager } from "./schema";
export { AuditManager } from "./audit";

export function getVersion() {
  return pkg.version;
}
