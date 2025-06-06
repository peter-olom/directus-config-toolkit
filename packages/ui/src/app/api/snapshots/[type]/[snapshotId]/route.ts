import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { auth } from "@/auth";

export async function GET(
  request: Request,
  props: { params: Promise<{ type: string; snapshotId: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  const { type, snapshotId } = params;

  // Validate parameters to prevent directory traversal
  if (
    !type.match(/^[a-z]+$/) ||
    !snapshotId.match(/^[a-zA-Z0-9_\-:.]+\.json$/)
  ) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
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

    const snapshotPath = path.join(auditPath, "snapshots", type, snapshotId);

    // Check if file exists
    if (!(await fs.pathExists(snapshotPath))) {
      return NextResponse.json(
        { error: `Snapshot ${snapshotId} not found` },
        { status: 404 }
      );
    }

    // Read and parse the JSON file
    const fileContent = await fs.readFile(snapshotPath, "utf8");
    const snapshotData = JSON.parse(fileContent);

    return NextResponse.json(snapshotData);
  } catch (error) {
    console.error(`Error reading snapshot ${snapshotId}:`, error);
    return NextResponse.json(
      { error: `Failed to read snapshot` },
      { status: 500 }
    );
  }
}
