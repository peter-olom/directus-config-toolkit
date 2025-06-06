import { NextResponse } from "next/server";
import fs from "fs-extra";
import path from "path";
import { auth } from "@/auth";

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
    // Get config path from environment variable
    const configPath = process.env.DCT_CONFIG_PATH;
    if (!configPath) {
      return NextResponse.json(
        { error: "DCT_CONFIG_PATH environment variable not set" },
        { status: 500 }
      );
    }

    const filePath = path.join(configPath, `${type}.json`);

    // Check if file exists
    if (!(await fs.pathExists(filePath))) {
      return NextResponse.json(
        { error: `Configuration file for ${type} not found` },
        { status: 404 }
      );
    }

    // Read and parse the JSON file
    const fileContent = await fs.readFile(filePath, "utf8");
    const configData = JSON.parse(fileContent);

    return NextResponse.json(configData);
  } catch (error) {
    console.error(`Error reading config for ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to read ${type} configuration` },
      { status: 500 }
    );
  }
}
