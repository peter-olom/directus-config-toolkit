import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { FilesManager } from "../../src/files";

class TestableFilesManager extends FilesManager {
  public validate(files: any, folders: any) {
    return this.validateLocalConfig(files, folders);
  }

  public setAssetDirectory(dir: string) {
    (this as any).assetPath = dir;
  }
}

describe("FilesManager validateLocalConfig", () => {
  let manager: TestableFilesManager;
  let tempAssetsDir: string;

  beforeEach(() => {
    manager = new TestableFilesManager();
    tempAssetsDir = mkdtempSync(path.join(os.tmpdir(), "files-manager-"));
    manager.setAssetDirectory(tempAssetsDir);
  });

  afterEach(() => {
    rmSync(tempAssetsDir, { recursive: true, force: true });
  });

  it("flags structural issues and missing assets", () => {
    const folders = [
      { id: "folder-1", name: "Root Folder" },
      { id: "folder-1", name: "Duplicate Folder" },
    ];
    const files = [
      {
        id: "",
        filename_disk: "example.svg",
        filename_download: "example.svg",
        type: "image/svg+xml",
        folder: "unknown-folder",
      },
    ];

    const result = manager.validate(files as any, folders as any);

    expect(
      result.errors.some((msg) => msg.includes('missing a valid "id"'))
    ).toBe(true);
    expect(
      result.errors.some((msg) => msg.includes("Duplicate folder id"))
    ).toBe(true);
    expect(
      result.warnings.some((msg) => msg.includes("Asset for"))
    ).toBe(true);
  });

  it("accepts consistent configuration with available assets", () => {
    const assetPath = path.join(tempAssetsDir, "example.svg");
    writeFileSync(assetPath, "<svg/>");

    const folders = [{ id: "folder-1", name: "Root Folder" }];
    const files = [
      {
        id: "file-1",
        filename_disk: "example.svg",
        filename_download: "example.svg",
        type: "image/svg+xml",
        folder: "folder-1",
        shouldBackup: true,
      },
    ];

    const result = manager.validate(files as any, folders as any);

    expect(result.errors).toHaveLength(0);
    expect(
      result.warnings.some((msg) => msg.includes("Asset for"))
    ).toBe(false);
  });
});
