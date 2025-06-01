import { NextResponse } from "next/server";
import { requireSession } from "../_lib/auth";
import { SnapshotManager } from "@devrue/directus-config-toolkit";

export async function POST() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const snapshotManager = new SnapshotManager();
    const result = await snapshotManager.createSnapshot();
    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error("Failed to create snapshot:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create snapshot",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
