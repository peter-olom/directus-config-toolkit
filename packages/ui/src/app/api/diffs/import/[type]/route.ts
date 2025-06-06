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
      return NextResponse.json(null);
    }

    // Read directory contents and filter for import snapshots
    const files = await fs.readdir(snapshotsDir);
    const importFiles = files.filter((file) => file.includes("_import_"));

    if (importFiles.length === 0) {
      return NextResponse.json(null);
    }

    // Group by timestamp
    const importSets: Record<
      string,
      { local?: string; before?: string; after?: string }
    > = {};

    for (const file of importFiles) {
      const match = file.match(
        /^(.+)_import_(local|remote_before|remote_after)\.json$/
      );
      if (!match) continue;

      const [, ts, fileType] = match;
      if (!importSets[ts]) importSets[ts] = {};

      if (fileType === "local") {
        importSets[ts].local = path.join(snapshotsDir, file);
      } else if (fileType === "remote_before") {
        importSets[ts].before = path.join(snapshotsDir, file);
      } else if (fileType === "remote_after") {
        importSets[ts].after = path.join(snapshotsDir, file);
      }
    }

    // Get timestamps and sort them
    const timestamps = Object.keys(importSets).sort();

    if (timestamps.length === 0) {
      return NextResponse.json(null);
    }

    // Get the latest timestamp
    const latestTs = timestamps[timestamps.length - 1];
    const set = importSets[latestTs];

    // Prepare the result
    const result: any = {
      timestamp: latestTs,
    };

    // Add preview data if available
    if (set.before && set.local) {
      const beforeData = await fs.readJson(set.before);
      const localData = await fs.readJson(set.local);

      result.preview = {
        before: beforeData,
        local: localData,
      };
    }

    // Add actual data if available
    if (set.before && set.after) {
      const beforeData = await fs.readJson(set.before);
      const afterData = await fs.readJson(set.after);

      result.actual = {
        before: beforeData,
        after: afterData,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(`Error reading import diffs for ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to read import diffs` },
      { status: 500 }
    );
  }
}
