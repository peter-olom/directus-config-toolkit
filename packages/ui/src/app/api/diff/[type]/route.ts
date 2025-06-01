/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../_lib/auth";
import { SnapshotManager } from "@devrue/directus-config-toolkit";

// Define DiffItem type or import from a shared location
type DiffItem = {
  id?: string;
  name?: string;
  [key: string]: any;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { type: string } }
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const type = params.type;

  try {
    const snapshotManager = new SnapshotManager();

    await snapshotManager.createSnapshot();
    const comparisonResult = await snapshotManager.compareWithConfig();

    const diffResults =
      comparisonResult.diffResults[type] ||
      (type === "schema" ? comparisonResult.diffResults["collections"] : null);

    const differences = [];
    if (diffResults) {
      if (diffResults.inInstanceOnly?.length > 0) {
        differences.push(
          ...diffResults.inInstanceOnly.map((item: DiffItem) => ({
            path: `${type}.${item.id || item.name}`,
            type: "added",
            newValue: item,
          }))
        );
      }
      if (diffResults.inConfigOnly?.length > 0) {
        differences.push(
          ...diffResults.inConfigOnly.map((item: DiffItem) => ({
            path: `${type}.${item.id || item.name}`,
            type: "removed",
            oldValue: item,
          }))
        );
      }
    }

    return NextResponse.json({
      type,
      differences,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`Failed to get diff for ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to get diff for ${type}`, message: error.message },
      { status: 500 }
    );
  }
}
