import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../_lib/auth";
import {
  FilesManager,
  FlowsManager,
  RolesManager,
  SchemaManager,
  SettingsManager,
} from "@devrue/directus-config-toolkit";

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const { type, direction } = await request.json();

    if (!type || !direction) {
      return NextResponse.json(
        { error: "Missing type or direction" },
        { status: 400 }
      );
    }

    const flowsManager = new FlowsManager();
    const rolesManager = new RolesManager();
    const settingsManager = new SettingsManager();
    const filesManager = new FilesManager();
    const schemaManager = new SchemaManager();

    if (direction === "import") {
      switch (type) {
        case "flows":
          await flowsManager.importFlows();
          break;
        case "roles":
          await rolesManager.importRoles();
          break;
        case "settings":
          await settingsManager.importSettings();
          break;
        case "files":
          await filesManager.importFiles();
          break;
        case "schema":
          await schemaManager.importSchema();
          break;
        default:
          throw new Error(`Unsupported type for import: ${type}`);
      }
    } else if (direction === "export") {
      switch (type) {
        case "flows":
          await flowsManager.exportFlows();
          break;
        case "roles":
          await rolesManager.exportRoles();
          break;
        case "settings":
          await settingsManager.exportSettings();
          break;
        case "files":
          await filesManager.exportFiles();
          break;
        case "schema":
          await schemaManager.exportSchema();
          break;
        default:
          throw new Error(`Unsupported type for export: ${type}`);
      }
    } else {
      throw new Error(`Unsupported direction: ${direction}`);
    }

    return NextResponse.json({ okay: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Sync operation failed:", error);
    return NextResponse.json(
      { error: "Sync operation failed", message: error.message },
      { status: 500 }
    );
  }
}
