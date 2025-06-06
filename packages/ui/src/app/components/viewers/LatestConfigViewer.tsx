"use client";

import { useEffect, useState } from "react";
import { ConfigType } from "../../types";
import Editor from "@monaco-editor/react";
import EmptyState from "../EmptyState";
import { useTheme } from "../ThemeContext";

interface LatestConfigViewerProps {
  type: ConfigType | null;
}

/**
 * Component for viewing the latest configuration of a selected item type.
 */
export default function LatestConfigViewer({ type }: LatestConfigViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
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
    const fetchConfig = async () => {
      if (!type) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/config/${type}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} config`);
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        console.error(`Error fetching ${type} config:`, err);
        setError(err instanceof Error ? err.message : "Failed to load config");
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [type]);

  if (!type) {
    return (
      <EmptyState
        type="empty"
        message="Select a configuration type from the left panel to view its content."
      />
    );
  }

  if (loading) {
    return <EmptyState type="loading" message="Loading configuration..." />;
  }

  if (error) {
    return <EmptyState type="error" message={error} />;
  }

  return (
    <div className="h-full">
      <h2 className="text-xl font-semibold mb-4">
        {type.charAt(0).toUpperCase() + type.slice(1)} Configuration
      </h2>
      <div className="border border-gray-200 dark:border-gray-700 rounded-md h-[calc(100%-3rem)]">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={config ? JSON.stringify(config, null, 2) : ""}
          options={{
            readOnly: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
          }}
          theme={editorTheme}
        />
      </div>
    </div>
  );
}
