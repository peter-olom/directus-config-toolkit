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

export class FilesManager {
  private filePath: string = join(CONFIG_PATH, "files.json");
  private folderPath: string = join(CONFIG_PATH, "folders.json");
  private assetPath: string = join(CONFIG_PATH, "assets");
  private immutableFields = ["filename_disk", "filename_download"];
  private backupField: string | null = null;

  constructor() {}

  private getBackupField = async (
    collection: "directus_files" | "directus_folders"
  ) => {
    const result = await client.request(readFieldsByCollection(collection));
    const backupField = result.find(({ field }) => {
      return field === "shouldBackup" || field === "should_backup";
    });
    this.backupField = backupField ? backupField.field : null;
  };

  private getBackupFilter = () => {
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

    for (const folder of sortedFolders) {
      const existingFolder = destinationFolders.find((f) => f.id === folder.id);
      if (existingFolder) {
        if (!_.isEqual(existingFolder, folder)) {
          await client.request(updateFolder(folder.id, folder));
        }
      } else {
        await client.request(createFolder(folder));
      }
    }
    // delete folders that are not in the source
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

    const filePromises = sourceFiles.map(async (file) => {
      const existingFile = destinationFiles
        .map(this.untrackIgnoredFields)
        .find((f) => f.id === file.id);
      const formData = this.createFormData(file);

      if (existingFile) {
        if (!_.isEqual(existingFile, file)) {
          return restFileUpload(formData as any, file.id);
        }
      } else {
        // use axios to upload the file
        return restFileUpload(formData as any);
      }
    });

    if (filePromises.length) {
      await Promise.all(filePromises);
    } else {
      console.log("All files are in sync. No files to import.");
    }

    // Clean up orphaned files
    const diffFiles = _.differenceBy(destinationFiles, sourceFiles, "id");
    if (diffFiles.length) {
      await client.request(deleteFiles(diffFiles.map((f) => f.id)));
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
    let files: Record<string, any>[] = [];

    try {
      // Get folders explicitly marked for backup
      markedFolders = await client.request(
        readFolders({
          filter: this.getBackupFilter(),
        })
      );
    } catch (error) {
      markedFolders = await this.handleFieldPermissionError(
        error,
        "Error reading folders with backup filter"
      );
    }

    // Get all parent folders of marked folders
    if (markedFolders.length > 0) {
      const parentFolders = await this.getParentFolders(
        markedFolders.map((f) => f.id)
      );
      markedFolders = _.uniqBy([...markedFolders, ...parentFolders], "id");
    }

    try {
      // Get files marked for backup that have folders
      const files = await client.request(
        readFiles({
          filter: {
            _and: [this.getBackupFilter(), { folder: { _nnull: true } }],
          },
        })
      );

      // Get unique folder IDs from marked files
      const folderIds = files
        .map((file) => file.folder)
        .filter((id): id is string => !!id);

      let fileFolders: Record<string, any>[] = [];
      if (folderIds.length > 0) {
        fileFolders = await client.request(
          readFolders({
            filter: {
              id: { _in: folderIds },
            },
          })
        );
      }

      // Combine and deduplicate:
      // 1. Folders explicitly marked for backup
      // 2. Their parent folders
      // 3. Folders containing marked files
      return _.uniqBy([...markedFolders, ...fileFolders], "id");
    } catch (error) {
      console.warn("Error getting folders for marked files:", error);
      return _.uniqBy([...markedFolders], "id");
    }
  }

  exportFiles = async () => {
    ensureConfigDirs();

    // backup folders first - only those with should backup set to true
    await this.getBackupField("directus_folders");
    const folders = await this.getRemoteFolders();
    writeFileSync(this.folderPath, JSON.stringify(folders, null, 2));

    // backup files next
    await this.getBackupField("directus_files");
    // backup files next
    let files: Record<string, any>[] = [];
    try {
      files = await client.request(
        readFiles({ filter: this.getBackupFilter() })
      );
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

    console.log(`Files exported to ${this.filePath}`);
    console.log(`Folders exported to ${this.folderPath}`);
    console.log(`Assets exported to ${this.assetPath}`);
  };

  importFiles = async () => {
    // import folders first
    await this.getBackupField("directus_folders");
    await this.handleImportFolders();
    console.log("Folders imported successfully.");

    // import files next
    await this.getBackupField("directus_files");
    await this.handleImportFiles();
    console.log("Files imported successfully.");
  };
}
