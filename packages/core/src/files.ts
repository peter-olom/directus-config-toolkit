import { readFieldsByCollection, readFiles, readFolders } from "@directus/sdk";
import {
  writeFileSync,
  readFileSync,
  createReadStream,
  existsSync,
  statSync,
} from "fs";
import { join } from "path";
import {
  client,
  downloadFile,
  ensureConfigDirs,
  restFileUpload,
  callDirectusAPI,
  retryOperation,
} from "./helper";
import _ from "lodash";
import FormData from "form-data";
import { createHash } from "crypto";
import { BaseConfigManager, FieldExclusionConfig } from "./base-config-manager";

interface DirectusFile {
  id: string;
  title?: string;
  description?: string;
  filename_disk: string;
  filename_download: string;
  type: string;
  folder?: string | null;
  shouldBackup?: boolean;
  should_backup?: boolean;
  checksum?: string | null;
  filesize?: number | null;
  [key: string]: any;
}

interface DirectusFolder {
  id: string;
  name: string;
  parent?: string | null;
  shouldBackup?: boolean;
  should_backup?: boolean;
  [key: string]: any;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
  pendingDelete: number;
}

interface SyncResult<T> {
  stats: SyncStats;
  pendingDeletion: T[];
}

interface FileSyncResult extends SyncResult<DirectusFile> {
  missingAssets: string[];
  errors: string[];
}

export class FilesManager extends BaseConfigManager<DirectusFile> {
  protected readonly configType = "files";
  protected readonly defaultFilename = "files.json";

  private folderPath: string;
  private assetPath: string;
  private immutableFields = ["filename_disk", "filename_download"];
  private backupFields: { files: string | null; folders: string | null } = {
    files: null,
    folders: null,
  };

  constructor() {
    // Files have specific field handling requirements
    const fieldConfig: FieldExclusionConfig = {
      immutableFields: ["filename_disk", "filename_download"],
    };

    super(fieldConfig);
    this.initializeConfigPath();
    this.folderPath = this.configPath.replace("files.json", "folders.json");
    this.assetPath = this.configPath.replace("files.json", "assets");
  }

  private async resolveBackupField(
    collection: "directus_files" | "directus_folders",
    target: "files" | "folders"
  ): Promise<string | null> {
    const result = await client.request(readFieldsByCollection(collection));
    const backupField =
      result.find(
        ({ field }) => field === "shouldBackup" || field === "should_backup"
      )?.field ?? null;

    this.backupFields[target] = backupField;
    return backupField;
  }

  private getBackupFilter(target: "files" | "folders") {
    const field = this.backupFields[target];
    return field ? { [field]: { _eq: true } } : {};
  }

  private safeDiskName(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, "_");
  }

  private getAssetFilePath(file: DirectusFile): string {
    return join(this.assetPath, this.safeDiskName(file.filename_disk));
  }

  private getBackupValue(record: Record<string, any>): boolean | undefined {
    if (record.shouldBackup !== undefined) {
      return record.shouldBackup;
    }
    if (record.should_backup !== undefined) {
      return record.should_backup;
    }
    return undefined;
  }

  private getEffectiveBackupField(
    record: Record<string, any>,
    target: "files" | "folders"
  ): string | null {
    if ("shouldBackup" in record) {
      return "shouldBackup";
    }
    if ("should_backup" in record) {
      return "should_backup";
    }
    return this.backupFields[target];
  }

  private sanitizeFolderForWrite(
    folder: DirectusFolder,
    options: { includeId?: boolean } = {}
  ): Record<string, any> {
    const { includeId = false } = options;
    const payload: Record<string, any> = {
      name: folder.name,
      parent: folder.parent ?? null,
    };

    const backupField = this.backupFields.folders;
    const backupValue = this.getBackupValue(folder);
    if (backupField && typeof backupValue === "boolean") {
      payload[backupField] = backupValue;
    }

    if (includeId) {
      payload.id = folder.id;
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    return payload;
  }

  private sanitizeFileForWrite(file: DirectusFile): Record<string, any> {
    const payload: Record<string, any> = {};

    if (Object.prototype.hasOwnProperty.call(file, "title")) {
      payload.title = file.title ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(file, "description")) {
      payload.description = file.description ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(file, "type")) {
      payload.type = file.type ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(file, "folder")) {
      payload.folder = file.folder ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(file, "filename_download")) {
      payload.filename_download = file.filename_download;
    }

    const backupField = this.backupFields.files;
    const backupValue = this.getBackupValue(file);
    if (backupField && typeof backupValue === "boolean") {
      payload[backupField] = backupValue;
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    return payload;
  }

  private normalizeFolderForComparison(
    folder: DirectusFolder
  ): Record<string, any> {
    const payload: Record<string, any> = {
      id: folder.id,
      name: folder.name,
      parent: folder.parent ?? null,
    };

    const backupField = this.getEffectiveBackupField(folder, "folders");
    const backupValue = this.getBackupValue(folder);
    if (backupField && typeof backupValue === "boolean") {
      payload[backupField] = backupValue;
    }

    return payload;
  }

  private async normalizeFileForComparison(
    file: DirectusFile,
    options: { assetPath?: string } = {}
  ): Promise<Record<string, any>> {
    const normalized = this.normalizeItem(file) as Record<string, any>;

    const backupField = this.backupFields.files;
    const backupValue = this.getBackupValue(file);
    if (backupField && typeof backupValue === "boolean") {
      normalized[backupField] = backupValue;
    }

    if (options.assetPath && existsSync(options.assetPath)) {
      const checksum = await this.calculateChecksum(options.assetPath);
      if (checksum) {
        normalized.checksum = checksum;
      }
      try {
        normalized.filesize = statSync(options.assetPath).size;
      } catch {
        // ignore errors reading file size
      }
    } else {
      if (file.checksum) {
        normalized.checksum = file.checksum;
      }
      if (file.filesize) {
        normalized.filesize = file.filesize;
      }
    }

    return normalized;
  }

  private async calculateChecksum(assetPath: string): Promise<string | null> {
    return await new Promise((resolve, reject) => {
      if (!existsSync(assetPath)) {
        resolve(null);
        return;
      }

      const hash = createHash("md5");
      const stream = createReadStream(assetPath);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (error) => reject(error));
    });
  }

  private sortFoldersByHierarchy(folders: DirectusFolder[]): DirectusFolder[] {
    const lookup = new Map(folders.map((folder) => [folder.id, folder]));
    const memo = new Map<string, number>();

    const depthFor = (
      folder: DirectusFolder,
      stack: Set<string> = new Set()
    ): number => {
      if (memo.has(folder.id)) {
        return memo.get(folder.id)!;
      }

      if (!folder.parent) {
        memo.set(folder.id, 0);
        return 0;
      }

      if (stack.has(folder.id)) {
        memo.set(folder.id, 0);
        return 0;
      }

      const parent = lookup.get(folder.parent);
      if (!parent) {
        memo.set(folder.id, 1);
        return 1;
      }

      stack.add(folder.id);
      const depth = depthFor(parent, stack) + 1;
      stack.delete(folder.id);
      memo.set(folder.id, depth);
      return depth;
    };

    return [...folders].sort((a, b) => {
      const depthA = depthFor(a);
      const depthB = depthFor(b);
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      return a.id.localeCompare(b.id);
    });
  }

  protected async fetchRemoteData(): Promise<DirectusFile[]> {
    await this.resolveBackupField("directus_files", "files");

    const files = await client.request(
      readFiles({
        filter: this.getBackupFilter("files"),
        fields: ["*"],
      })
    );

    let filteredFiles = files;
    const backupField = this.backupFields.files;
    if (backupField && files.length > 0) {
      filteredFiles = files.filter(
        (file) =>
          file.hasOwnProperty(backupField) &&
          file[backupField as keyof DirectusFile] === true
      );
    }

    return filteredFiles.map((file) =>
      this.untrackIgnoredFields(file, "file")
    ) as DirectusFile[];
  }

  private async fetchRemoteFolders(): Promise<DirectusFolder[]> {
    await this.resolveBackupField("directus_folders", "folders");

    const folders = await client.request(
      readFolders({ filter: this.getBackupFilter("folders") })
    );

    return folders.map((folder) =>
      this.untrackIgnoredFields(
        folder,
        "folder",
        this.backupFields.folders ?? undefined
      )
    ) as DirectusFolder[];
  }

  private untrackIgnoredFields(
    record: Record<string, any>,
    type: "file" | "folder" = "file",
    backupFieldOverride?: string
  ) {
    if (type === "folder") {
      const baseFields = ["id", "name", "parent"];
      const backupField =
        backupFieldOverride ?? this.backupFields.folders ?? undefined;
      return _.pick(record, [
        ...baseFields,
        ...(backupField ? [backupField] : []),
      ]);
    }

    const baseFields = [
      "id",
      "title",
      "description",
      "type",
      "folder",
      "checksum",
      "filesize",
    ];

    const backupField = this.backupFields.files ?? undefined;

    return _.pick(record, [
      ...baseFields,
      ...(backupField ? [backupField] : []),
      ...this.immutableFields,
    ]);
  }

  public normalizeItem(item: DirectusFile): DirectusFile {
    const normalized = super.normalizeItem(item);
    const baseFields = [
      "id",
      "title",
      "description",
      "type",
      "folder",
      "checksum",
      "filesize",
    ];
    const backupField = this.backupFields.files ?? undefined;

    return _.pick(normalized, [
      ...baseFields,
      ...(backupField ? [backupField] : []),
      ...this.immutableFields,
    ]) as DirectusFile;
  }

  private loadLocalConfig() {
    try {
      const files = JSON.parse(readFileSync(this.configPath, "utf8"));
      const folders = JSON.parse(readFileSync(this.folderPath, "utf8"));
      return { files, folders };
    } catch (error: any) {
      throw new Error(
        `Failed to read local files configuration: ${error?.message || error}`
      );
    }
  }

  protected validateLocalConfig(files: any, folders: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(files)) {
      errors.push("files.json must contain an array.");
    }
    if (!Array.isArray(folders)) {
      errors.push("folders.json must contain an array.");
    }

    if (!Array.isArray(files) || !Array.isArray(folders)) {
      return { errors, warnings };
    }

    const folderIds = new Set<string>();
    const duplicateFolderIds = new Set<string>();

    folders.forEach((folder: any, index: number) => {
      if (!folder.id || typeof folder.id !== "string") {
        errors.push(`Folder at index ${index} is missing a valid "id".`);
      } else if (folderIds.has(folder.id)) {
        duplicateFolderIds.add(folder.id);
      } else {
        folderIds.add(folder.id);
      }

      if (!folder.name) {
        warnings.push(`Folder ${folder.id || index} is missing a name.`);
      }

      if (
        folder.parent &&
        typeof folder.parent === "string" &&
        folder.parent === folder.id
      ) {
        errors.push(`Folder ${folder.id} cannot reference itself as a parent.`);
      }

      if (
        folder.parent &&
        typeof folder.parent === "string" &&
        !folderIds.has(folder.parent)
      ) {
        warnings.push(
          `Folder ${folder.id} references unknown parent "${folder.parent}".`
        );
      }
    });

    duplicateFolderIds.forEach((id) =>
      errors.push(`Duplicate folder id detected: ${id}`)
    );

    const fileIds = new Set<string>();
    const duplicateFileIds = new Set<string>();
    const diskNames = new Set<string>();
    const duplicateDisks = new Set<string>();

    files.forEach((file: any, index: number) => {
      if (!file.id || typeof file.id !== "string") {
        errors.push(`File at index ${index} is missing a valid "id".`);
      } else if (fileIds.has(file.id)) {
        duplicateFileIds.add(file.id);
      } else {
        fileIds.add(file.id);
      }

      if (!file.filename_disk || typeof file.filename_disk !== "string") {
        errors.push(`File ${file.id || index} is missing "filename_disk".`);
      } else if (diskNames.has(file.filename_disk)) {
        duplicateDisks.add(file.filename_disk);
      } else {
        diskNames.add(file.filename_disk);
      }

      if (
        !file.filename_download ||
        typeof file.filename_download !== "string"
      ) {
        warnings.push(
          `File ${file.id || index} is missing "filename_download".`
        );
      }

      if (
        file.folder &&
        typeof file.folder === "string" &&
        !folderIds.has(file.folder)
      ) {
        warnings.push(
          `File ${file.id || index} references unknown folder "${file.folder}".`
        );
      }

      const assetPath = this.getAssetFilePath(file);
      if (!existsSync(assetPath)) {
        warnings.push(
          `Asset for ${file.id || file.filename_disk} not found at ${assetPath}.`
        );
      }
    });

    duplicateFileIds.forEach((id) =>
      errors.push(`Duplicate file id detected: ${id}`)
    );
    duplicateDisks.forEach((name) =>
      warnings.push(`Duplicate filename_disk detected: ${name}`)
    );

    return { errors, warnings };
  }

  private logSyncPreview(label: string, result: SyncResult<any>) {
    const { stats, pendingDeletion } = result;
    const summaryParts = [
      `${stats.created} create`,
      `${stats.updated} update`,
      `${stats.skipped} unchanged`,
    ];
    if (stats.pendingDelete > 0) {
      summaryParts.push(`${stats.pendingDelete} pending manual removal`);
    }

    console.log(`${label}: ${summaryParts.join(", ")}`);

    if (pendingDeletion.length > 0) {
      const sample = pendingDeletion
        .slice(0, 5)
        .map((item) => item.id || "<unknown>")
        .join(", ");
      console.warn(
        `⚠️ ${label} not present in snapshot (${pendingDeletion.length}). Manual removal recommended. Sample: ${sample}${
          pendingDeletion.length > 5 ? "…" : ""
        }`
      );
    }

    const fileResult = result as FileSyncResult;
    if (
      Array.isArray(fileResult.missingAssets) &&
      fileResult.missingAssets.length > 0
    ) {
      const sample = fileResult.missingAssets.slice(0, 5).join(", ");
      console.warn(
        `⚠️ Missing assets detected for ${fileResult.missingAssets.length} file(s). Sample: ${sample}${
          fileResult.missingAssets.length > 5 ? "…" : ""
        }`
      );
    }
  }

  private buildImportSummary(
    folderStats: SyncStats,
    fileStats: SyncStats,
    missingAssets: number
  ): string {
    const folderSummary = [
      `Folders → ${folderStats.created} created`,
      `${folderStats.updated} updated`,
      `${folderStats.skipped} unchanged`,
    ];
    if (folderStats.pendingDelete > 0) {
      folderSummary.push(`${folderStats.pendingDelete} pending manual removal`);
    }

    const fileSummary = [
      `Files → ${fileStats.created} created`,
      `${fileStats.updated} updated`,
      `${fileStats.skipped} unchanged`,
    ];
    if (fileStats.pendingDelete > 0) {
      fileSummary.push(`${fileStats.pendingDelete} pending manual removal`);
    }
    if (missingAssets > 0) {
      fileSummary.push(`${missingAssets} missing asset(s)`);
    }

    return `${folderSummary.join(", ")}; ${fileSummary.join(", ")}`;
  }

  private async syncFolders(
    localFolders: DirectusFolder[],
    existingFolders: DirectusFolder[],
    options: { simulate?: boolean } = {}
  ): Promise<SyncResult<DirectusFolder>> {
    const { simulate = false } = options;

    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
    };

    const existingMap = new Map(
      existingFolders.map((folder) => [folder.id, folder])
    );
    const managedIds = new Set<string>();
    const sortedFolders = this.sortFoldersByHierarchy(localFolders);

    for (const folder of sortedFolders) {
      managedIds.add(folder.id);
      const desired = this.normalizeFolderForComparison(folder);
      const existing = existingMap.get(folder.id);

      if (existing) {
        const current = this.normalizeFolderForComparison(existing);
        if (!_.isEqual(current, desired)) {
          stats.updated++;
          if (!simulate) {
            const payload = this.sanitizeFolderForWrite(folder);
            await retryOperation(() =>
              callDirectusAPI(`folders/${folder.id}`, "PATCH", payload)
            );
          }
        } else {
          stats.skipped++;
        }
      } else {
        stats.created++;
        if (!simulate) {
          const payload = this.sanitizeFolderForWrite(folder, {
            includeId: true,
          });
          await retryOperation(() =>
            callDirectusAPI("folders", "POST", payload)
          );
        }
      }
    }

    const pendingDeletion = existingFolders.filter(
      (folder) => !managedIds.has(folder.id)
    );
    stats.pendingDelete = pendingDeletion.length;

    return { stats, pendingDeletion };
  }

  private async syncFiles(
    localFiles: DirectusFile[],
    existingFiles: DirectusFile[],
    options: { simulate?: boolean } = {}
  ): Promise<FileSyncResult> {
    const { simulate = false } = options;

    const stats: SyncStats = {
      created: 0,
      updated: 0,
      skipped: 0,
      pendingDelete: 0,
    };

    const existingMap = new Map(
      existingFiles.map((file) => [file.id, file])
    );
    const managedIds = new Set<string>();
    const missingAssets: string[] = [];
    const errors: string[] = [];

    for (const file of localFiles) {
      managedIds.add(file.id);
      const assetPath = this.getAssetFilePath(file);
      const assetExists = existsSync(assetPath);
      if (!assetExists) {
        missingAssets.push(`${file.id} → ${assetPath}`);
      }

      const existing = existingMap.get(file.id);
      if (!existing) {
        stats.created++;
        if (simulate) {
          continue;
        }
        if (!assetExists) {
          errors.push(
            `Asset missing for new file ${file.id} (${file.filename_disk}). Expected at ${assetPath}`
          );
          continue;
        }
        await this.createFileFromConfig(file, assetPath);
        continue;
      }

      const desiredComparable = await this.normalizeFileForComparison(file, {
        assetPath,
      });
      const currentComparable = await this.normalizeFileForComparison(existing);

      const {
        checksum: desiredChecksum,
        filesize: desiredSize,
        ...desiredMeta
      } = desiredComparable;
      const {
        checksum: currentChecksum,
        filesize: currentSize,
        ...currentMeta
      } = currentComparable;

      const metadataChanged = !_.isEqual(currentMeta, desiredMeta);
      const checksumChanged =
        typeof desiredChecksum === "string" &&
        typeof currentChecksum === "string" &&
        desiredChecksum.length > 0 &&
        currentChecksum.length > 0 &&
        desiredChecksum !== currentChecksum;
      const sizeChanged =
        typeof desiredSize === "number" &&
        typeof currentSize === "number" &&
        desiredSize !== currentSize;

      if (!metadataChanged && !checksumChanged && !sizeChanged) {
        stats.skipped++;
        continue;
      }

      stats.updated++;
      if (simulate) {
        continue;
      }

      if ((checksumChanged || sizeChanged) && !assetExists) {
        errors.push(
          `Cannot update binary for file ${file.id} – asset missing at ${assetPath}`
        );
      }

      if ((checksumChanged || sizeChanged) && assetExists) {
        await this.uploadFileAsset(file, assetPath);
      }

      if (metadataChanged || checksumChanged || sizeChanged) {
        await this.updateFileMetadata(file);
      }
    }

    const pendingDeletion = existingFiles.filter(
      (file) => !managedIds.has(file.id)
    );
    stats.pendingDelete = pendingDeletion.length;

    if (!simulate && errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    return { stats, pendingDeletion, missingAssets, errors };
  }

  private async createFileFromConfig(
    file: DirectusFile,
    assetPath: string
  ): Promise<void> {
    const form = new FormData();
    form.append("id", file.id);
    form.append(
      "file",
      createReadStream(assetPath),
      file.filename_download || file.filename_disk
    );

    if (file.title) {
      form.append("title", file.title);
    }
    if (file.description) {
      form.append("description", file.description);
    }
    if (file.type) {
      form.append("type", file.type);
    }
    if (file.folder) {
      form.append("folder", file.folder);
    }
    if (file.filename_download) {
      form.append("filename_download", file.filename_download);
    }

    await retryOperation(() => restFileUpload(form as any));
    await this.updateFileMetadata(file);
  }

  private async uploadFileAsset(
    file: DirectusFile,
    assetPath: string
  ): Promise<void> {
    const form = new FormData();
    form.append(
      "file",
      createReadStream(assetPath),
      file.filename_download || file.filename_disk
    );

    await retryOperation(() => restFileUpload(form as any, file.id));
  }

  private async updateFileMetadata(file: DirectusFile): Promise<void> {
    const payload = this.sanitizeFileForWrite(file);
    if (Object.keys(payload).length === 0) {
      return;
    }

    await retryOperation(() =>
      callDirectusAPI(`files/${file.id}`, "PATCH", payload)
    );
  }

  public async exportConfig(): Promise<void> {
    ensureConfigDirs();

    try {
      const files = await this.fetchRemoteData();
      const fileBackupField = this.backupFields.files;
      const folders = await this.fetchRemoteFolders();
      const folderBackupField = this.backupFields.folders;

      writeFileSync(this.configPath, JSON.stringify(files, null, 2));
      writeFileSync(this.folderPath, JSON.stringify(folders, null, 2));

      this.backupFields.files = fileBackupField ?? null;
      await this.storeEnhancedSnapshot(files);
      this.backupFields.folders = folderBackupField ?? null;

      const downloadPromises = files.map((file) => downloadFile(file));
      await Promise.all(downloadPromises);

      console.log(`Files exported to ${this.configPath}`);
      console.log(`Folders exported to ${this.folderPath}`);
      console.log(
        `Exported ${files.length} files and ${folders.length} folders`
      );
    } catch (error: any) {
      console.error("Error exporting files:", error);
      throw error;
    }
  }

  public async importConfig(
    dryRun = false
  ): Promise<{ status: "success" | "failure"; message?: string }> {
    try {
      const { files: localFiles, folders: localFolders } =
        this.loadLocalConfig();

      const validation = this.validateLocalConfig(localFiles, localFolders);
      if (validation.errors.length > 0) {
        validation.errors.forEach((error) => console.error(`❌ ${error}`));
        return {
          status: "failure",
          message: `Validation failed with ${validation.errors.length} error(s).`,
        };
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning) =>
          console.warn(`⚠️ ${warning}`)
        );
      }

      const fetchRemoteState = async () => {
        const [files, folders] = await Promise.all([
          this.fetchRemoteData(),
          this.fetchRemoteFolders(),
        ]);
        return { files, folders };
      };

      if (dryRun) {
        const remote = await fetchRemoteState();
        const folderPreview = await this.syncFolders(
          localFolders,
          remote.folders,
          { simulate: true }
        );
        const filePreview = await this.syncFiles(localFiles, remote.files, {
          simulate: true,
        });

        this.logSyncPreview("Folders", folderPreview);
        this.logSyncPreview("Files", filePreview);

        return {
          status: "success",
          message: "Dry run completed - no changes applied",
        };
      }

      let outcome: { status: "success" | "failure"; message?: string } = {
        status: "success",
      };

      await this.auditManager.auditImportOperation(
        "files",
        "FilesManager",
        { files: localFiles, folders: localFolders },
        fetchRemoteState,
        async () => {
          const { files: remoteFiles, folders: remoteFolders } =
            await fetchRemoteState();
          const folderResult = await this.syncFolders(
            localFolders,
            remoteFolders
          );
          const fileResult = await this.syncFiles(localFiles, remoteFiles);

          this.logSyncPreview("Folders", folderResult);
          this.logSyncPreview("Files", fileResult);

          const summary = this.buildImportSummary(
            folderResult.stats,
            fileResult.stats,
            fileResult.missingAssets.length
          );
          outcome = { status: "success", message: summary };
          return outcome;
        },
        false
      );

      return outcome;
    } catch (error: any) {
      console.error("Error importing files:", error.message || error);
      return { status: "failure", message: error.message || String(error) };
    }
  }

  exportFiles = async () => {
    return this.exportConfig();
  };

  importFiles = async (dryRun = false) => {
    return this.importConfig(dryRun);
  };
}
