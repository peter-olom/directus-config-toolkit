"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfigType } from "../../types";
import { DiffEditor } from "@monaco-editor/react";
import EmptyState from "../EmptyState";
import { useTheme } from "../ThemeContext";
import { format as formatDate } from "date-fns";

interface TimeMachineViewerProps {
  type: ConfigType | null;
}

interface SnapshotInfo {
  id: string;
  path: string;
}

interface SnapshotPair {
  newer: SnapshotInfo;
  older: SnapshotInfo;
  newerData: unknown;
  olderData: unknown;
}

export default function TimeMachineViewer({ type }: TimeMachineViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [diffPairs, setDiffPairs] = useState<SnapshotPair[]>([]);
  const { theme } = useTheme();

  // Use the theme context value to determine the editor theme
  const editorTheme =
    theme === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "vs-dark"
        : "vs-light"
      : theme === "dark"
      ? "vs-dark"
      : "vs-light";

  const createDiffPairs = useCallback(
    async (sortedSnapshots: SnapshotInfo[]) => {
      const pairs: SnapshotPair[] = [];

      for (let i = 0; i < sortedSnapshots.length - 1; i++) {
        const newer = sortedSnapshots[i];
        const older = sortedSnapshots[i + 1];

        try {
          const [newerResponse, olderResponse] = await Promise.all([
            fetch(`/api/snapshots/${type}/${newer.id}`),
            fetch(`/api/snapshots/${type}/${older.id}`),
          ]);

          if (!newerResponse.ok || !olderResponse.ok) {
            throw new Error("Failed to fetch snapshot content");
          }

          const [newerData, olderData] = await Promise.all([
            newerResponse.json(),
            olderResponse.json(),
          ]);

          pairs.push({
            newer,
            older,
            newerData,
            olderData,
          });
        } catch (err) {
          console.error(`Error fetching diff pair data:`, err);
        }
      }

      setDiffPairs(pairs);
    },
    [type]
  );

  useEffect(() => {
    const fetchSnapshots = async () => {
      if (!type) return;

      setLoading(true);
      setError(null);
      setDiffPairs([]);

      try {
        const response = await fetch(`/api/snapshots/${type}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} snapshots`);
        }
        const data = await response.json();

        // Filter out import snapshots and sort by date
        // First, check if there are any snapshots at all
        if (data.length === 0) {
          setSnapshots([]);
          return;
        }

        // Separate import and non-import snapshots
        const nonImportSnapshots = data
          .filter((snap: SnapshotInfo) => !snap.id.includes("_import_"))
          .sort((a: SnapshotInfo, b: SnapshotInfo) => b.id.localeCompare(a.id));

        setSnapshots(nonImportSnapshots);

        // We'll show a specific message in the render phase based on snapshots.length
        if (nonImportSnapshots.length < 2) {
          return;
        }

        // Create pairs for diffing
        await createDiffPairs(nonImportSnapshots);
      } catch (err) {
        console.error(`Error fetching ${type} snapshots:`, err);
        setError(
          err instanceof Error ? err.message : "Failed to load snapshots"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshots();
  }, [type, createDiffPairs]);

  const formatSnapshotDate = (snapshotId: string): string => {
    try {
      const fileSafeDate = snapshotId.split("_")[0]; // e.g. "2025-06-06T12-31-15-783Z"
      // Split into date and time parts at "T"
      const [datePart, timePart] = fileSafeDate.split("T");
      if (!timePart) throw new Error("Invalid date format");

      // Match the time part pattern: HH-mm-ss-mmmZ
      const match = timePart.match(/^(\d{2})-(\d{2})-(\d{2})-?(\d{3})Z$/);
      if (!match) throw new Error("Invalid time format");

      const [, hours, minutes, seconds, millis] = match;
      // Reconstitute the valid ISO date string: YYYY-MM-DDTHH:mm:ss.mmmZ
      const reconstituted = `${datePart}T${hours}:${minutes}:${seconds}.${millis}Z`;

      return formatDate(new Date(reconstituted), "yyyy-MM-dd HH:mm:ss");
    } catch {
      return snapshotId;
    }
  };

  if (!type) {
    return (
      <EmptyState
        type="empty"
        message="Select a configuration type from the left panel to view its history."
      />
    );
  }

  if (loading && snapshots.length === 0) {
    return <EmptyState type="loading" message="Loading snapshots..." />;
  }

  if (error) {
    return <EmptyState type="error" message={error} />;
  }

  // Early return if we don't have enough non-import snapshots
  if (snapshots.length < 2) {
    const hasImports = diffPairs.length === 0 && !loading && !error;
    return (
      <EmptyState
        type="empty"
        message={
          hasImports
            ? `${
                type.charAt(0).toUpperCase() + type.slice(1)
              } has import snapshots but needs at least 2 regular snapshots to show history. 
               \nTry exporting the configuration a couple of times to create regular snapshots.`
            : `${
                type.charAt(0).toUpperCase() + type.slice(1)
              } needs at least 2 regular snapshots to show history. 
               \nSnapshots are created when you export configurations.`
        }
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <h2 className="text-xl font-semibold sticky top-0 bg-background z-10 py-4 mb-4">
        {type.charAt(0).toUpperCase() + type.slice(1)} History Timeline
      </h2>

      <div className="text-sm text-gray-500 dark:text-amber-300/80 mb-4">
        Showing changes between {snapshots.length} regular snapshots (excluding
        imports)
      </div>

      <div className="space-y-8">
        {diffPairs.map((pair) => (
          <div
            key={`${pair.newer.id}-${pair.older.id}`}
            className="border border-gray-200 dark:border-[#3b2d27] rounded-lg"
          >
            <div className="p-3 bg-gray-50 dark:bg-[#2a201c] border-b border-gray-200 dark:border-[#3b2d27] rounded-t-lg">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium">Changes from:</h3>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono bg-gray-100 dark:bg-[#3b2d27] px-2 py-1 rounded">
                  {formatSnapshotDate(pair.older.id)}
                </span>
                <span>→</span>
                <span className="font-mono bg-gray-100 dark:bg-[#3b2d27] px-2 py-1 rounded">
                  {formatSnapshotDate(pair.newer.id)}
                </span>
              </div>
            </div>

            <div className="h-[400px]">
              <DiffEditor
                height="100%"
                original={JSON.stringify(pair.olderData, null, 2)}
                modified={JSON.stringify(pair.newerData, null, 2)}
                language="json"
                theme={editorTheme}
                options={{
                  renderSideBySide: true,
                  readOnly: true,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
