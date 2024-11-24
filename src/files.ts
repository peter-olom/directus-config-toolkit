import {
  createFolder,
  deleteFiles,
  deleteFolders,
  readFiles,
  readFolders,
  updateFile,
  uploadFiles,
  updateFolder,
} from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, downloadFile, ensureConfigDirs } from "./helper";
import _ from "lodash";
import FormData from "form-data";

export class FilesManager {
  private filePath: string = join(CONFIG_PATH, "files.json");
  private folderPath: string = join(CONFIG_PATH, "folders.json");
  private assetPath: string = join(CONFIG_PATH, "assets");
  private immutableFields = ["filename_disk", "filename_download"];
  constructor() {}

  untrackIgnoredFields(record: Record<string, any>) {
    return _.omit(record, ["storage", "uploaded_by", "modified_by"]);
  }

  exportFiles = async () => {
    ensureConfigDirs();
    // backup folders first - only those with shouldBackup set to true
    const folders = await client.request(
      readFolders({
        filter: {
          shouldBackup: { _eq: true },
        },
      })
    );
    writeFileSync(this.folderPath, JSON.stringify(folders, null, 2));

    // backup files next
    const files = await client.request(
      readFiles({ filter: { shouldBackup: { _eq: true } } })
    );
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
    // import files next
    await this.handleImportFiles();

    console.log("Files imported successfully.");
  };

  private handleImportFolders = async () => {
    const sourceFolders: Record<string, any>[] = JSON.parse(
      readFileSync(this.folderPath, "utf8")
    );
    const destinationFolders = await client.request(
      readFolders({ filter: { shouldBackup: { _eq: true } } })
    );

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
      readFiles({ filter: { shouldBackup: { _eq: true } } })
    );

    const createFormData = (file: Record<string, any>) => {
      const formData = new FormData();
      Object.entries(file)
        .filter(([key]) => !this.immutableFields.includes(key))
        .forEach(([key, value]) => formData.append(key, value));

      formData.append(
        "file",
        readFileSync(join(this.assetPath, file.filename_disk))
      );
      return formData;
    };

    // Process files
    const filePromises = sourceFiles.map(async (file) => {
      const existingFile = destinationFiles.find((f) => f.id === file.id);
      const formData = createFormData(file);

      if (existingFile) {
        if (!_.isEqual(existingFile, file)) {
          return client.request(updateFile(file.id, formData as any));
        }
      }
      return client.request(uploadFiles(formData as any));
    });

    await Promise.all(filePromises);

    // Clean up orphaned files
    const diffFiles = _.differenceBy(destinationFiles, sourceFiles, "id");
    if (diffFiles.length) {
      await client.request(deleteFiles(diffFiles.map((f) => f.id)));
    }
  };
}
