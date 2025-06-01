import { NextResponse } from "next/server";
import { requireSession } from "../_lib/auth";
import { SnapshotManager } from "../../../../../src/snapshot";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const snapshotManager = new SnapshotManager();
    const result = await snapshotManager.createSnapshot();
    return NextResponse.json({
      success: result.success,
      message: result.success
        ? "Successfully connected to Directus instance"
        : result.message,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Connection check failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Connection check failed",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
