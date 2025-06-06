"use client";

import { useEffect, useState } from "react";
import { ConfigType } from "../../types";
import { DiffEditor } from "@monaco-editor/react";
import EmptyState from "../EmptyState";
import { useTheme } from "../ThemeContext";

interface ImportDiffViewerProps {
  type: ConfigType | null;
}

interface ImportDiffSet {
  timestamp: string;
  data: {
    local?: Record<string, unknown>;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

/**
 * Component for viewing import differences (what will change).
 */
export default function ImportDiffViewer({ type }: ImportDiffViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<ImportDiffSet | null>(null);
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

  useEffect(() => {
    const fetchImportDiffs = async () => {
      if (!type) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/snapshots/${type}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch snapshots for ${type}`);
        }
        const files = await response.json();

        // Group by timestamp like in CLI
        const importSets: Record<
          string,
          { local?: string; before?: string; after?: string }
        > = {};

        for (const file of files) {
          // Update regex to handle .json extension and extract base timestamp
          const match = file.id.match(
            /^(.+?)(?:_import_(local|remote_before|remote_after))?\.json$/
          );
          if (!match) continue;

          // Extract the timestamp and type (if it's an import file)
          const [, ts, snapType] = match;

          // Skip if this is a regular snapshot (doesn't have _import_ in the name)
          if (!snapType) continue;

          if (!importSets[ts]) importSets[ts] = {};
          if (snapType === "local") importSets[ts].local = file.id;
          if (snapType === "remote_before") importSets[ts].before = file.id;
          if (snapType === "remote_after") importSets[ts].after = file.id;
        }

        // Get the latest timestamp
        const timestamps = Object.keys(importSets).sort().reverse(); // Sort in descending order
        if (timestamps.length === 0) {
          setDiffData(null);
          return;
        }

        const latestTs = timestamps[0]; // Get first item since we sorted in reverse
        const set = importSets[latestTs];

        // Fetch data for each snapshot in the set
        const diffSet: ImportDiffSet = {
          timestamp: latestTs,
          data: {},
        };

        if (set.local) {
          const localResp = await fetch(`/api/snapshots/${type}/${set.local}`);
          if (localResp.ok) diffSet.data.local = await localResp.json();
        }

        if (set.before) {
          const beforeResp = await fetch(
            `/api/snapshots/${type}/${set.before}`
          );
          if (beforeResp.ok) diffSet.data.before = await beforeResp.json();
        }

        if (set.after) {
          const afterResp = await fetch(`/api/snapshots/${type}/${set.after}`);
          if (afterResp.ok) diffSet.data.after = await afterResp.json();
        }

        setDiffData(diffSet);
      } catch (err) {
        console.error(`Error fetching import diffs for ${type}:`, err);
        setError(
          err instanceof Error ? err.message : "Failed to load import diffs"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchImportDiffs();
  }, [type]);

  if (!type) {
    return (
      <EmptyState
        type="empty"
        message="Select a configuration type from the left panel to view import differences."
      />
    );
  }

  if (loading) {
    return (
      <EmptyState type="loading" message="Loading import differences..." />
    );
  }

  if (error) {
    return <EmptyState type="error" message={error} />;
  }

  if (!diffData) {
    return (
      <EmptyState
        type="empty"
        message={`No import diffs found for ${type}. Import diffs are created when you preview or perform imports.`}
      />
    );
  }

  const hasPreview = diffData.data.before && diffData.data.local;
  const hasActual = diffData.data.before && diffData.data.after;

  const getDiffContent = () => {
    if (hasPreview) {
      return {
        original: JSON.stringify(diffData.data.before, null, 2),
        modified: JSON.stringify(diffData.data.local, null, 2),
        title: "Preview: Remote → Local (What Would Change)",
      };
    } else if (hasActual) {
      return {
        original: JSON.stringify(diffData.data.before, null, 2),
        modified: JSON.stringify(diffData.data.after, null, 2),
        title: "Actual: Remote Before → Remote After (What Changed)",
      };
    }
    return null;
  };

  const content = getDiffContent();

  return (
    <div className="h-full">
      <h2 className="text-xl font-semibold mb-4">
        {type.charAt(0).toUpperCase() + type.slice(1)} Import Differences
      </h2>

      {content ? (
        <div className="h-[calc(100%-11rem)]">
          <h3 className="font-medium text-md mb-2">{content.title}</h3>
          <div className="border border-gray-200 dark:border-[#3b2d27] rounded-lg h-full">
            <DiffEditor
              height="100%"
              original={content.original}
              modified={content.modified}
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
      ) : (
        <EmptyState
          type="empty"
          message={`No import differences available for ${type}. Ensure you have performed an import or previewed changes with (--dry-run) to generate diffs.`}
        />
      )}
    </div>
  );
}
