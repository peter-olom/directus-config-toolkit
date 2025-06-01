import { NextResponse } from "next/server";
import { requireSession } from "../_lib/auth";
import { MetadataManager } from "@devrue/directus-config-toolkit";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const metadataManager = new MetadataManager();
    const statuses = metadataManager.getConfigStatuses();
    return NextResponse.json(statuses);
  } catch (error) {
    console.error("Failed to get config statuses:", error);
    return NextResponse.json(
      {
        error: "Failed to get config statuses",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
