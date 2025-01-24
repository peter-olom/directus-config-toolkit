import {
  createFolder,
  deleteFiles,
  deleteFolders,
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
  private shouldBackupFilter = {
    _or: [{ shouldBackup: { _eq: true } }, { should_backup: { _eq: true } }],
  };

  private isMarkedForBackup = (item: Record<string, any>) => {
    return item.shouldBackup === true || item.should_backup === true;
  };

  constructor() {}

  untrackIgnoredFields = (record: Record<string, any>) => {
    const baseFields = ["id", "title", "type", "folder"];
    const backupField =
      "shouldBackup" in record
        ? "shouldBackup"
        : "should_backup" in record
        ? "should_backup"
        : null;

    return _.pick(record, [
      ...baseFields,
      ...(backupField ? [backupField] : []),
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

  exportFiles = async () => {
    ensureConfigDirs();
    // backup folders first - only those with shouldBackup set to true
    const folders = await this.getRemoteFolders();
    writeFileSync(this.folderPath, JSON.stringify(folders, null, 2));

    // backup files next
    let files: Record<string, any>[] = [];
    try {
      files = await client.request(
        readFiles({ filter: this.shouldBackupFilter })
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
    await this.handleImportFolders();
    console.log("Folders imported successfully.");

    // import files next
    await this.handleImportFiles();
    console.log("Files imported successfully.");
  };

  private handleImportFolders = async () => {
    const sourceFolders: Record<string, any>[] = JSON.parse(
      readFileSync(this.folderPath, "utf8")
    );
    const destinationFolders = await this.getRemoteFolders();

    for (const folder of sourceFolders) {
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
      readFiles({ filter: this.shouldBackupFilter })
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

  private async getRemoteFolders() {
    let markedFolders: Record<string, any>[] = [];
    let files: Record<string, any>[] = [];

    try {
      // Get folders explicitly marked for backup
      markedFolders = await client.request(
        readFolders({
          filter: this.shouldBackupFilter,
        })
      );
    } catch (error) {
      markedFolders = await this.handleFieldPermissionError(
        error,
        "Error reading folders with backup filter"
      );
    }

    try {
      // Get folders containing files marked for backup
      files = await client.request(
        readFiles({
          filter: {
            _and: [this.shouldBackupFilter, { folder: { _nnull: true } }],
          },
        })
      );
    } catch (error) {
      files = await this.handleFieldPermissionError(
        error,
        "Error reading files with folder filter"
      );
    }

    const folderIds = files
      .map((file) => file.folder)
      .filter((id): id is string => !!id);

    console.log("Related folderIds", folderIds);

    let relatedFolders: Record<string, any>[] = [];
    if (folderIds.length > 0) {
      try {
        relatedFolders = await client.request(
          readFolders({
            filter: {
              id: { _in: folderIds },
            },
          })
        );
      } catch {
        console.warn(`Warning: Error reading related folders`);
      }
    }

    // Combine and deduplicate folders
    return _.uniqBy([...markedFolders, ...relatedFolders], "id");
  }
}
