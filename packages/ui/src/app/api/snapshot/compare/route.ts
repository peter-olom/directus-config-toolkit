import { NextResponse } from "next/server";
import { requireSession } from "../../_lib/auth";
import { SnapshotManager } from "@devrue/directus-config-toolkit";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const snapshotManager = new SnapshotManager();
    const result = await snapshotManager.compareWithConfig();
    return NextResponse.json({
      success: true,
      message: "Comparison completed successfully",
      diffResults: result.diffResults,
    });
  } catch (error) {
    console.error("Failed to compare snapshot:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to compare snapshot",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
