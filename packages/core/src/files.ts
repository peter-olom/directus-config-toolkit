import {
  createFolder,
  deleteFiles,
  deleteFolders,
  readFieldsByCollection,
  readFiles,
  readFolders,
  updateFolder,
} from "@directus/sdk";
import { writeFileSync, readFileSync, createReadStream } from "fs";
import { join } from "path";
import {
  client,
  CONFIG_PATH,
  downloadFile,
  ensureConfigDirs,
  restFileUpload,
} from "./helper";
import _ from "lodash";
import FormData from "form-data";
import { MetadataManager } from "./metadata";
import { v4 as uuidv4 } from "uuid";

// Import ConfigType from the same place it's defined in flows.ts
type ConfigType = "flows" | "roles" | "settings" | "files" | "schema";

export class FilesManager {
  private filePath: string = join(CONFIG_PATH, "files.json");
  private folderPath: string = join(CONFIG_PATH, "folders.json");
  private assetPath: string = join(CONFIG_PATH, "assets");
  private immutableFields = ["filename_disk", "filename_download"];
  private backupField: string | null = null;
  private metadataManager: MetadataManager;

  constructor() {
    this.metadataManager = new MetadataManager();
  }

  public getBackupField = async (
    collection: "directus_files" | "directus_folders"
  ) => {
    const result = await client.request(readFieldsByCollection(collection));
    const backupField = result.find(({ field }) => {
      return field === "shouldBackup" || field === "should_backup";
    });
    this.backupField = backupField ? backupField.field : null;
  };

  public getBackupFilter = () => {
    return this.backupField ? { [this.backupField]: { _eq: true } } : {};
  };

  private untrackIgnoredFields = (record: Record<string, any>) => {
    const baseFields = ["id", "title", "type", "folder"];

    return _.pick(record, [
      ...baseFields,
      ...(this.backupField ? [this.backupField] : []),
      ...this.immutableFields,
    ]);
  };

  private async handleFieldPermissionError(error: any, context: string) {
    if (
      JSON.stringify(error).includes(
        "You don't have permission to access field"
      )
    ) {
      console.warn(`Warning: ${context} - ${error.message}`);
      return [];
    }
    throw error;
  }

  private handleImportFolders = async () => {
    const sourceFolders: Record<string, any>[] = JSON.parse(
      readFileSync(this.folderPath, "utf8")
    );
    const destinationFolders = await this.getRemoteFolders();

    // Create mapping of existing folder IDs for quick lookup
    const existingFolderMap = new Map();
    for (const folder of destinationFolders) {
      existingFolderMap.set(folder.id, folder);
    }

    // Sort folders by hierarchy level (root first, then children)
    const sortedFolders = _.sortBy(sourceFolders, (folder) => {
      let level = 0;
      let current = folder;
      while (current.parent) {
        const parent = sourceFolders.find((f) => f.id === current.parent);
        if (parent) {
          level++;
          current = parent;
        } else {
          break;
        }
      }
      return level;
    });

    // Process each folder with enhanced error handling
    for (const folder of sortedFolders) {
      try {
        const existingFolder = existingFolderMap.get(folder.id);
        if (existingFolder) {
          if (!_.isEqual(existingFolder, folder)) {
            await client.request(updateFolder(folder.id, folder));
            console.log(`Updated folder: ${folder.name} (${folder.id})`);
          }
        } else {
          await client.request(createFolder(folder));
          console.log(`Created folder: ${folder.name} (${folder.id})`);
        }
      } catch (error: any) {
        // Handle duplication errors specifically
        if (error?.errors?.[0]?.extensions?.code === "RECORD_NOT_UNIQUE") {
          console.warn(
            `Folder with ID ${folder.id} already exists but wasn't detected. Attempting to update instead.`
          );
          try {
            await client.request(updateFolder(folder.id, folder));
            console.log(
              `Updated previously undetected folder: ${folder.name} (${folder.id})`
            );
          } catch (updateError) {
            console.error(`Failed to update folder ${folder.id}:`, updateError);
          }
        } else {
          console.error(`Error processing folder ${folder.id}:`, error);
        }
      }
    }

    // Delete folders that are not in the source
    const diff = _.differenceBy(destinationFolders, sourceFolders, "id");
    if (diff.length) {
      await client.request(deleteFolders(diff.map((f) => f.id)));
    }
  };

  private handleImportFiles = async () => {
    const sourceFiles: Record<string, any>[] = JSON.parse(
      readFileSync(this.filePath, "utf8")
    );
    const destinationFiles = await client.request(
      readFiles({ filter: this.getBackupFilter() })
    );

    // Create a map of existing files by ID for faster lookups
    const existingFileMap = new Map();
    destinationFiles
      .map(this.untrackIgnoredFields)
      .forEach((file) => existingFileMap.set(file.id, file));

    console.log(`Importing ${sourceFiles.length} files...`);

    // Process files sequentially to avoid overwhelming the server
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const file of sourceFiles) {
      try {
        const existingFile = existingFileMap.get(file.id);
        const formData = this.createFormData(file);

        if (existingFile) {
          if (!_.isEqual(existingFile, file)) {
            console.log(
              `Updating file: ${file.filename_download} (${file.id})`
            );
            await restFileUpload(formData as any, file.id);
            successCount++;
          } else {
            console.log(
              `Skipping unchanged file: ${file.filename_download} (${file.id})`
            );
            skipCount++;
          }
        } else {
          // use axios to upload the file
          console.log(
            `Creating new file: ${file.filename_download} (${file.id})`
          );
          await restFileUpload(formData as any);
          successCount++;
        }
      } catch (error: any) {
        console.error(
          `Error processing file ${file.id} (${file.filename_download}):`,
          error.message || JSON.stringify(error)
        );
        errorCount++;
      }
    }

    console.log(
      `File import summary: ${successCount} updated/created, ${skipCount} unchanged, ${errorCount} errors`
    );

    // Clean up orphaned files - but ask for confirmation if there are many
    const diffFiles = _.differenceBy(destinationFiles, sourceFiles, "id");
    if (diffFiles.length) {
      if (diffFiles.length > 5) {
        console.log(
          `Will remove ${diffFiles.length} files that are not in the source:`
        );
        diffFiles.forEach((file) =>
          console.log(`- ${file.filename_download} (${file.id})`)
        );
      }

      try {
        await client.request(deleteFiles(diffFiles.map((f) => f.id)));
        console.log(
          `Removed ${diffFiles.length} files that were not in the source`
        );
      } catch (error) {
        console.error(`Failed to remove orphaned files:`, error);
      }
    }
  };

  private createFormData = (file: Record<string, any>) => {
    const formData = new FormData();
    const filePath = join(this.assetPath, file.filename_disk);
    const fileStream = createReadStream(filePath);

    // Append file metadata first
    _.toPairs(file)
      .filter(([key, value]) => !this.immutableFields.includes(key) && value)
      .forEach(([key, value]) => {
        // Convert non-primitive values to strings
        if (typeof value === "object") {
          value = JSON.stringify(value); // Serialize objects
        } else if (typeof value === "boolean") {
          value = value.toString(); // Convert booleans to strings
        }
        formData.append(key, value);
      });

    // Append file as stream with proper metadata
    formData.append("file", fileStream as any, {
      filename: file.filename_download,
    });

    return formData;
  };

  private async getParentFolders(folderIds: string[]) {
    const parentFolders: Record<string, any>[] = [];
    let currentFolders = await client.request(
      readFolders({
        filter: {
          id: { _in: folderIds },
        },
      })
    );

    while (currentFolders.length > 0) {
      const parentIds = currentFolders
        .map((f) => f.parent)
        .filter((id) => id) as string[];

      if (parentIds.length > 0) {
        const parents = await client.request(
          readFolders({
            filter: {
              id: { _in: parentIds },
            },
          })
        );
        parentFolders.push(...parents);
        currentFolders = parents;
      } else {
        break;
      }
    }

    return _.uniqBy(parentFolders, "id");
  }

  private async getRemoteFolders() {
    let markedFolders: Record<string, any>[] = [];
    let fileFolders: Record<string, any>[] = [];

    // Step 1: Get folders explicitly marked for backup
    try {
      console.log("Fetching folders marked for backup...");
      markedFolders = await client.request(
        readFolders({
          filter: this.getBackupFilter(),
        })
      );
      console.log(`Found ${markedFolders.length} marked folders`);
    } catch (error) {
      console.warn("Error reading folders with backup filter:", error);
      markedFolders = await this.handleFieldPermissionError(
        error,
        "Error reading folders with backup filter"
      );
    }

    // Step 2: Get all parent folders of marked folders
    if (markedFolders.length > 0) {
      try {
        console.log("Fetching parent folders...");
        const parentFolders = await this.getParentFolders(
          markedFolders.map((f) => f.id)
        );
        console.log(`Found ${parentFolders.length} parent folders`);
        markedFolders = _.uniqBy([...markedFolders, ...parentFolders], "id");
      } catch (error) {
        console.warn("Error getting parent folders:", error);
      }
    }

    // Step 3: Get folders from files that are marked for backup
    try {
      console.log("Fetching folders from backed-up files...");
      // Get files marked for backup that have folders
      const files = await client.request(
        readFiles({
          filter: {
            _and: [this.getBackupFilter(), { folder: { _nnull: true } }],
          },
        })
      );
      console.log(`Found ${files.length} files with folders`);

      // Get unique folder IDs from marked files
      const folderIds = _.uniq(
        files.map((file) => file.folder).filter((id): id is string => !!id)
      );

      if (folderIds.length > 0) {
        console.log(`Found ${folderIds.length} unique folder IDs from files`);

        // Process folder IDs in batches to avoid URL length limits
        const batchSize = 20;
        for (let i = 0; i < folderIds.length; i += batchSize) {
          const batch = folderIds.slice(i, i + batchSize);
          try {
            const batchFolders = await client.request(
              readFolders({
                filter: {
                  id: { _in: batch },
                },
              })
            );
            fileFolders = [...fileFolders, ...batchFolders];
          } catch (error) {
            console.warn(
              `Error getting folders batch ${i / batchSize + 1}:`,
              error
            );
          }
        }
      }

      // Combine and deduplicate:
      // 1. Folders explicitly marked for backup
      // 2. Their parent folders
      // 3. Folders containing marked files
      const allFolders = _.uniqBy([...markedFolders, ...fileFolders], "id");
      console.log(`Total unique folders: ${allFolders.length}`);
      return allFolders;
    } catch (error) {
      console.warn("Error getting folders for marked files:", error);
      return _.uniqBy([...markedFolders], "id");
    }
  }

  exportFiles = async () => {
    ensureConfigDirs();

    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "files";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "export",
      status: "running",
      createdAt: now,
    });

    try {
      // backup folders first - only those with should backup set to true
      await this.getBackupField("directus_folders");
      const folders = await this.getRemoteFolders();
      writeFileSync(this.folderPath, JSON.stringify(folders, null, 2));

      // backup files next - only those with should backup set to true
      await this.getBackupField("directus_files");
      let files: Record<string, any>[] = [];
      try {
        files = await client.request(
          readFiles({
            filter: this.getBackupFilter(),
            fields: ["*"], // Ensure all fields are returned for filtering
          })
        );

        // Double-check backup flag in case filter didn't work
        if (this.backupField && files.length > 0) {
          files = files.filter(
            (file) =>
              file.hasOwnProperty(this.backupField!) &&
              file[this.backupField!] === true
          );
        }
      } catch (error) {
        files = await this.handleFieldPermissionError(
          error,
          "Error reading files with backup filter"
        );
      }

      writeFileSync(
        this.filePath,
        JSON.stringify(files.map(this.untrackIgnoredFields), null, 2)
      );

      // Download and backup files concurrently with retries
      const downloadPromises = files.map((file) => downloadFile(file));
      await Promise.all(downloadPromises);

      // Count the total number of items exported
      const totalItems = folders.length + files.length;

      // Track the number of items exported
      this.metadataManager.updateItemsCount(jobType, totalItems);

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log(`Files exported to ${this.filePath}`);
      console.log(`Folders exported to ${this.folderPath}`);
      console.log(`Assets exported to ${this.assetPath}`);
    } catch (error) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error("Error exporting files:", error);
      throw error;
    }
  };

  importFiles = async () => {
    // Create a new sync job
    const jobId = uuidv4();
    const jobType: ConfigType = "files";
    const now = new Date().toISOString();

    this.metadataManager.addSyncJob({
      id: jobId,
      type: jobType,
      direction: "import",
      status: "running",
      createdAt: now,
    });

    try {
      // import folders first
      await this.getBackupField("directus_folders");
      await this.handleImportFolders();
      console.log("Folders imported successfully.");

      // import files next
      await this.getBackupField("directus_files");
      await this.handleImportFiles();

      // Count the total number of items imported
      const folders = JSON.parse(readFileSync(this.folderPath, "utf8")).length;
      const files = JSON.parse(readFileSync(this.filePath, "utf8")).length;
      const totalItems = folders + files;

      // Track the number of items imported
      this.metadataManager.updateItemsCount(jobType, totalItems);

      // Update sync status to synced
      this.metadataManager.updateSyncStatus(jobType, "synced", now);

      // Complete the sync job successfully
      this.metadataManager.completeSyncJob(jobId, true);

      console.log("Files imported successfully.");
    } catch (error) {
      // Update sync status to conflict if there was an error
      this.metadataManager.updateSyncStatus(jobType, "conflict");

      // Complete the sync job with error
      this.metadataManager.completeSyncJob(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );

      console.error("Error importing files:", error);
      throw error;
    }
  };
}
