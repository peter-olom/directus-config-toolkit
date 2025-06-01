"use client";

import { useState } from "react";
import { DiffItem } from "../types";

interface DiffViewerProps {
  differences: DiffItem[];
  onClose: () => void;
}

export default function DiffViewer({ differences, onClose }: DiffViewerProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {}
  );

  const toggleItem = (path: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const getStatusColor = (type: DiffItem["type"]) => {
    switch (type) {
      case "added":
        return "border-success bg-success-light/50 dark:bg-success-light/10";
      case "removed":
        return "border-error bg-error-light/50 dark:bg-error-light/10";
      case "modified":
        return "border-warning bg-warning-light/50 dark:bg-warning-light/10";
      default:
        return "border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800";
    }
  };

  const getStatusText = (type: DiffItem["type"]) => {
    switch (type) {
      case "added":
        return "Added";
      case "removed":
        return "Removed";
      case "modified":
        return "Modified";
      default:
        return "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 dark:bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 border border-card-border rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-card-header">
          <h2 className="font-semibold text-lg text-foreground">
            Configuration Differences
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 bg-card">
          {differences.length === 0 ? (
            <div className="text-center py-8 px-4 bg-background rounded-md border border-card-border text-gray-600 dark:text-gray-300">
              No differences found. Configurations are in sync.
            </div>
          ) : (
            <div className="space-y-4">
              {differences.map((diff, index) => (
                <div
                  key={index}
                  className={`border-l-4 rounded p-3 shadow-sm ${getStatusColor(
                    diff.type
                  )}`}
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleItem(diff.path)}
                  >
                    <div>
                      <div className="font-mono text-sm text-foreground">
                        {diff.path}
                      </div>
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">
                        {getStatusText(diff.type)}
                      </div>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 transition-transform ${
                        expandedItems[diff.path] ? "transform rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>

                  {expandedItems[diff.path] && (
                    <div className="mt-3 pt-3 border-t border-card-border bg-background rounded-b-lg shadow-inner p-3">
                      {diff.type !== "added" && (
                        <div>
                          <div className="text-xs font-semibold mb-1 text-error dark:text-error">
                            Old Value:
                          </div>
                          <pre className="bg-error-light/60 dark:bg-error-light/20 p-3 rounded-md border border-error/30 text-xs overflow-x-auto text-gray-800 dark:text-gray-200 shadow-sm">
                            {JSON.stringify(diff.oldValue, null, 2)}
                          </pre>
                        </div>
                      )}

                      {diff.type !== "removed" && (
                        <div className="mt-4">
                          <div className="text-xs font-semibold mb-1 text-success dark:text-success">
                            New Value:
                          </div>
                          <pre className="bg-success-light/60 dark:bg-success-light/20 p-3 rounded-md border border-success/30 text-xs overflow-x-auto text-gray-800 dark:text-gray-200 shadow-sm">
                            {JSON.stringify(diff.newValue, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-card-border p-4 flex justify-end bg-card-header">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 dark:bg-primary-light/10 dark:text-primary dark:border-primary-light/20 dark:hover:bg-primary-light/20 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
