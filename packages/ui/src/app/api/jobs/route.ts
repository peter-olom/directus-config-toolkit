import { NextResponse } from "next/server";
import { requireSession } from "../_lib/auth";
import { MetadataManager } from "@devrue/directus-config-toolkit";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const metadataManager = new MetadataManager();
    const jobs = metadataManager.getSyncJobs();
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Failed to get jobs history:", error);
    return NextResponse.json(
      {
        error: "Failed to get jobs history",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
