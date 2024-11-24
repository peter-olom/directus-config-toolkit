import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import { readSettings, updateSettings } from "@directus/sdk";
import { readFileSync, writeFileSync } from "fs";

export class SettingsManager {
  private outputPath: string = join(CONFIG_PATH, "settings.json");
  constructor() {}

  exportSettings = async () => {
    ensureConfigDirs();
    const settings = await client.request(readSettings());
    writeFileSync(this.outputPath, JSON.stringify(settings, null, 2));

    console.log(`Settings exported to ${this.outputPath}`);
  };

  importSettings = async () => {
    const settings = JSON.parse(readFileSync(this.outputPath, "utf8"));
    await client.request(updateSettings(settings));

    console.log("Settings updated successfully.");
  };
}
