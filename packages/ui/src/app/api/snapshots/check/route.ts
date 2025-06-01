import { NextResponse } from "next/server";
import { requireSession } from "../../_lib/auth";
import { MetadataManager } from "@devrue/directus-config-toolkit";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const metadataManager = new MetadataManager();
    await metadataManager.checkForSnapshots();
    const status = metadataManager.getConfigStatus("snapshots");
    return NextResponse.json({
      hasSnapshots: status.itemsCount > 0,
      lastSnapshot: status.lastSync,
    });
  } catch (error) {
    console.error("Failed to check for snapshots:", error);
    return NextResponse.json(
      {
        error: "Failed to check for snapshots",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
