"use client";

import { useState } from "react";
import { ConfigType } from "../types";
import { useConfig } from "./ConfigContext";
import EmptyState from "./EmptyState";

interface StatusBadgeProps {
  status: "synced" | "pending" | "conflict";
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
  const colors = {
    synced:
      "bg-success-light text-success-dark border-success-light dark:bg-success-light/20 dark:text-success dark:border-success/30",
    pending:
      "bg-warning-light text-warning-dark border-warning-light dark:bg-warning-light/20 dark:text-warning dark:border-warning/30",
    conflict:
      "bg-error-light text-error-dark border-error-light dark:bg-error-light/20 dark:text-error dark:border-error/30",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium border ${colors[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

interface ConfigItemProps {
  type: ConfigType;
  itemsCount: number;
  lastSync: string;
  status: "synced" | "pending" | "conflict";
  onViewDiff: (type: ConfigType) => void;
}

const ConfigItem = ({
  type,
  itemsCount,
  lastSync,
  status,
  onViewDiff,
}: ConfigItemProps) => {
  const { syncConfig, loading } = useConfig();
  const [isLoading, setIsLoading] = useState(false);

  const formattedLastSync = !!lastSync
    ? new Date(lastSync).toLocaleString()
    : "N/A";

  const handleExport = async () => {
    setIsLoading(true);
    await syncConfig(type, "export");
    setIsLoading(false);
  };

  const handleImport = async () => {
    setIsLoading(true);
    await syncConfig(type, "import");
    setIsLoading(false);
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-card-border">
      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium capitalize text-foreground">
            {type}
          </h3>
          <StatusBadge status={status} />
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {itemsCount} Items • Last sync: {formattedLastSync}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={isLoading || loading}
          className="px-3 py-1 text-sm bg-primary/20 text-primary border border-primary/30 rounded-md hover:bg-primary/30 disabled:opacity-50 dark:bg-primary-light/20 dark:text-primary dark:border-primary/20 dark:hover:bg-primary-light/30 transition-colors shadow-sm"
        >
          Export
        </button>
        <button
          onClick={handleImport}
          disabled={isLoading || loading}
          className="px-3 py-1 text-sm bg-primary/20 text-primary border border-primary/30 rounded-md hover:bg-primary/30 disabled:opacity-50 dark:bg-primary-light/20 dark:text-primary dark:border-primary/20 dark:hover:bg-primary-light/30 transition-colors shadow-sm"
        >
          Import
        </button>
        <button
          onClick={() => onViewDiff(type)}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 border border-gray-200 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600 transition-colors shadow-sm"
        >
          View Diff
        </button>
      </div>
    </div>
  );
};

interface ConfigListProps {
  onViewDiff: (type: ConfigType) => void;
}

export default function ConfigList({ onViewDiff }: ConfigListProps) {
  const { configStatuses, refreshStatus, loading } = useConfig();

  return (
    <div className="border border-card-border rounded-md overflow-hidden shadow-sm bg-card">
      <div className="flex justify-between items-center p-4 bg-card-header border-b border-card-border">
        <h2 className="font-semibold text-foreground">Configuration Items</h2>
        <button
          onClick={refreshStatus}
          disabled={loading}
          className="px-3 py-1 text-sm bg-background border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm flex items-center"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin -ml-0.5 mr-1.5 h-4 w-4 text-foreground"
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
              Refreshing...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                ></path>
              </svg>
              Refresh
            </>
          )}
        </button>
      </div>
      <div>
        {configStatuses.length === 0 ? (
          <EmptyState type="empty" message="No configurations available." />
        ) : (
          configStatuses
            .filter((item) => !!item.type)
            .map((config, index) => (
              <ConfigItem
                key={config.type + index}
                type={config.type}
                itemsCount={config.itemsCount}
                lastSync={config.lastSync}
                status={config.status}
                onViewDiff={onViewDiff}
              />
            ))
        )}
      </div>
    </div>
  );
}
