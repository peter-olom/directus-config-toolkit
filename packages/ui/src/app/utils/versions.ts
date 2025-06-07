"use server";
// This utility provides the version information for UI and Core packages
// The versions are read at build time from package.json files

// Import the package.json files
// These imports are resolved at build time by Next.js
import { getVersion as getCoreVersion } from "@devrue/directus-config-toolkit";
import uiPackageJson from "../../../package.json";

// Export the versions
const CORE_VERSION = getCoreVersion();

// Function to get both versions as an object
export async function getVersions() {
  return {
    ui: uiPackageJson.version,
    core: CORE_VERSION,
  };
}
