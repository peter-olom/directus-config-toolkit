import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { auth } from "@/auth";
import { AuditLogEntry } from "@/app/types";

export async function GET(request: Request, props: { params: Promise<{ type: string }> }) {
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

    const auditLogPath = path.join(auditPath, "audit.ndjson");

    // Check if file exists
    if (!(await fs.pathExists(auditLogPath))) {
      return NextResponse.json([]);
    }

    // Read and parse the NDJSON file
    const auditLogContent = await fs.readFile(auditLogPath, "utf8");
    const lines = auditLogContent.trim().split("\n").filter(Boolean);

    // Parse each line as JSON and filter by itemType
    const auditEntries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as AuditLogEntry;
        } catch (e) {
          console.error("Failed to parse audit log entry:", e);
          return null;
        }
      })
      .filter((entry) => entry !== null && entry.itemType === type);

    return NextResponse.json(auditEntries);
  } catch (error) {
    console.error(`Error reading audit logs for ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to read audit logs` },
      { status: 500 }
    );
  }
}
