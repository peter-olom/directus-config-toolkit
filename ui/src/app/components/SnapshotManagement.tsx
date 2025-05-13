"use client";

import { useState } from "react";
import { createSnapshot, compareSnapshot } from "../services/api";

export default function SnapshotManagement() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const handleCreateSnapshot = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await createSnapshot();
      setResult({
        message: response.message,
        type: response.success ? "success" : "error",
      });
    } catch (error) {
      setResult({
        message:
          error instanceof Error ? error.message : "Failed to create snapshot",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCompareSnapshot = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await compareSnapshot();
      setResult({
        message: response.message,
        type: response.success ? "success" : "error",
      });
    } catch (error) {
      setResult({
        message:
          error instanceof Error ? error.message : "Failed to compare snapshot",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-card-border rounded-md overflow-hidden shadow-sm bg-card">
      <div className="p-4 bg-card-header border-b border-card-border">
        <h2 className="font-semibold text-foreground">Snapshot Management</h2>
      </div>

      <div className="p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Snapshots allow you to capture the current state of your Directus
          instance and compare it with your configuration files.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleCreateSnapshot}
            disabled={loading}
            className="px-5 py-2 bg-primary/20 text-primary border border-primary/30 rounded-md hover:bg-primary/30 disabled:opacity-50 dark:bg-primary-light/20 dark:text-primary dark:border-primary/20 dark:hover:bg-primary-light/30 font-medium transition-colors shadow-sm"
          >
            {loading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Creating...
              </span>
            ) : (
              "Create Snapshot"
            )}
          </button>

          <button
            onClick={handleCompareSnapshot}
            disabled={loading}
            className="px-5 py-2 bg-background border border-card-border text-foreground rounded-md hover:bg-gray-100 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 font-medium transition-colors shadow-sm"
          >
            {loading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-foreground"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Comparing...
              </span>
            ) : (
              "Compare Snapshot"
            )}
          </button>
        </div>

        {result && (
          <div
            className={`mt-4 p-4 rounded-md border shadow-sm ${
              result.type === "success"
                ? "bg-success-light/70 text-success-dark border-success/30 dark:bg-success-light/30 dark:text-success dark:border-success/40"
                : "bg-error-light/70 text-error-dark border-error/30 dark:bg-error-light/30 dark:text-error dark:border-error/40"
            }`}
          >
            <div className="flex items-center">
              {result.type === "success" ? (
                <svg
                  className="w-5 h-5 mr-2 text-success"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  ></path>
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 mr-2 text-error"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  ></path>
                </svg>
              )}
              <span className="font-medium">{result.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
