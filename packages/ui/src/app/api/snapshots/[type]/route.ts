import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { auth } from "@/auth";

export async function GET(
  request: Request,
  { params }: { params: { type: string } }
) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const { type } = params;

  // Validate type parameter to prevent directory traversal
  if (!type.match(/^[a-z]+$/)) {
    return NextResponse.json(
      { error: "Invalid type parameter" },
      { status: 400 }
    );
  }

  try {
    // Get audit path from environment variable
    const auditPath =
      process.env.DCT_AUDIT_PATH ||
      (process.env.DCT_CONFIG_PATH
        ? path.join(process.env.DCT_CONFIG_PATH, "audit")
        : null);

    if (!auditPath) {
      return NextResponse.json(
        { error: "Audit path not configured" },
        { status: 500 }
      );
    }

    const snapshotsDir = path.join(auditPath, "snapshots", type);

    // Check if directory exists
    if (!(await fs.pathExists(snapshotsDir))) {
      // Return empty array if no snapshots yet
      return NextResponse.json([]);
    }

    // Read directory contents
    const files = await fs.readdir(snapshotsDir);

    // Filter for JSON files and create snapshot info objects
    const snapshots = files
      .filter((file) => file.endsWith(".json"))
      .map((fileName) => ({
        id: fileName,
        path: path.join(snapshotsDir, fileName),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json(snapshots);
  } catch (error) {
    console.error(`Error reading snapshots for ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to read ${type} snapshots` },
      { status: 500 }
    );
  }
}
