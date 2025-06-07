"use client";

import { ConfigType } from "@/app/types";
import React, { useState, useEffect, useCallback } from "react";
import { IconType } from "react-icons";
import {
  FaUserShield,
  FaLock,
  FaShieldAlt,
  FaClipboardList,
  FaDatabase,
  FaFile,
  FaFolder,
  FaRobot,
  FaCogs,
  FaWrench,
  FaDownload,
  FaUpload,
} from "react-icons/fa";
import { syncConfig } from "@/app/services/api";
import { toast } from "react-hot-toast";

interface ItemTypeNavigatorProps {
  selectedType: ConfigType | null;
  onSelectType: (type: ConfigType) => void;
  supportsSync?: (type: string) => boolean;
}

const STATIC_CONFIGS: Array<{
  type: string;
  label: string;
  icon: IconType;
  description: string;
}> = [
  {
    type: "roles",
    label: "Roles",
    icon: FaUserShield,
    description: "User roles and permissions groups",
  },
  {
    type: "access",
    label: "Access",
    icon: FaLock,
    description: "Access control settings",
  },
  {
    type: "permissions",
    label: "Permissions",
    icon: FaShieldAlt,
    description: "Detailed permissions configuration",
  },
  {
    type: "policies",
    label: "Policies",
    icon: FaClipboardList,
    description: "Security policies",
  },
  {
    type: "schema",
    label: "Schema",
    icon: FaDatabase,
    description: "Database schema configuration",
  },
  {
    type: "files",
    label: "Files",
    icon: FaFile,
    description: "File storage settings",
  },
  {
    type: "folders",
    label: "Folders",
    icon: FaFolder,
    description: "File organization structure",
  },
  {
    type: "flows",
    label: "Flows",
    icon: FaRobot,
    description: "Automation workflows",
  },
  {
    type: "operations",
    label: "Operations",
    icon: FaCogs,
    description: "Operations within flows",
  },
  {
    type: "settings",
    label: "Settings",
    icon: FaWrench,
    description: "System settings",
  },
];

interface Snapshot {
  id: string;
  path: string;
}

interface SnapshotCounts {
  exports: number;
  imports: number;
}

export default function ItemTypeNavigator({
  selectedType,
  onSelectType,
  supportsSync: propSupportsSync,
}: ItemTypeNavigatorProps) {
  const [snapshotCounts, setSnapshotCounts] = useState<
    Record<string, SnapshotCounts>
  >({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});

  // Function to determine if a config type supports import/export
  const supportsSync = useCallback(
    (type: string): boolean => {
      if (propSupportsSync) return propSupportsSync(type);
      // Default implementation as fallback
      return ["flows", "roles", "settings", "files", "schema"].includes(type);
    },
    [propSupportsSync]
  );

  // Function to handle import/export operations
  const handleSync = async (
    type: ConfigType,
    direction: "import" | "export",
    dryRun: boolean = false
  ) => {
    if (!supportsSync(type)) return;

    // For imports (not dry-run), show a confirmation toast
    if (direction === "import" && !dryRun) {
      toast((t) => (
        <div className="flex flex-col">
          <p className="mb-2">Are you sure you want to import {type}?</p>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                toast.dismiss(t.id);
                handleSyncConfirmed(type, direction, dryRun);
              }}
              className="px-3 py-1 bg-green-800 text-white rounded hover:bg-primary/90"
            >
              Yes
            </button>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="px-3 py-1 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ));
      return;
    }

    // For export or dry-run, proceed directly
    handleSyncConfirmed(type, direction, dryRun);
  };

  // Function to handle the actual sync operation after confirmation
  const handleSyncConfirmed = async (
    type: ConfigType,
    direction: "import" | "export",
    dryRun: boolean = false
  ) => {
    try {
      setIsSyncing((prev) => ({ ...prev, [type]: true }));

      // Clear any previous errors
      setError((prev) => ({ ...prev, [type]: "" }));

      await syncConfig(type, direction, dryRun);

      // Refresh the snapshot counts after successful operation
      const response = await fetch(`/api/snapshots/${type}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSnapshotCounts((prev) => ({
        ...prev,
        [type]: categorizeSnapshots(data),
      }));

      let successMessage = `Successfully ${
        direction === "import" ? "imported" : "exported"
      } ${type}`;

      if (dryRun) {
        successMessage = `Peek completed for ${type}. Check snapshots for results.`;
      }

      toast.success(successMessage);
    } catch (err) {
      console.error(`Error during ${direction} for ${type}:`, err);
      setError((prev) => ({
        ...prev,
        [type]: (err as Error).message,
      }));
      toast.error(`Failed to ${direction} ${type}: ${(err as Error).message}`);
    } finally {
      setIsSyncing((prev) => ({ ...prev, [type]: false }));
    }
  };

  // Function to categorize snapshots
  const categorizeSnapshots = (snaps: Snapshot[]): SnapshotCounts => {
    return snaps.reduce(
      (acc, snap) => {
        if (snap.id.includes("import")) {
          acc.imports++;
        } else {
          acc.exports++;
        }
        return acc;
      },
      { exports: 0, imports: 0 }
    );
  };

  // We no longer need the localStorage persistence logic here
  // as it's handled by the useSelectedType hook in the parent component

  useEffect(() => {
    // Fetch snapshots for all config types when component mounts
    STATIC_CONFIGS.forEach(async (config) => {
      try {
        setIsLoading((prev: Record<string, boolean>) => ({
          ...prev,
          [config.type]: true,
        }));
        const response = await fetch(`/api/snapshots/${config.type}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSnapshotCounts((prev: Record<string, SnapshotCounts>) => ({
          ...prev,
          [config.type]: categorizeSnapshots(data),
        }));
      } catch (err) {
        console.error(`Error fetching snapshots for ${config.type}:`, err);
        setError((prev) => ({
          ...prev,
          [config.type]: (err as Error).message,
        }));
      } finally {
        setIsLoading((prev: Record<string, boolean>) => ({
          ...prev,
          [config.type]: false,
        }));
      }
    });
  }, []);

  // Helper function to format snapshot counts
  const formatSnapshotCount = (counts: SnapshotCounts | undefined) => {
    if (!counts) return "No snapshots";
    const parts = [];
    if (counts.exports > 0)
      parts.push(`${counts.exports} Export${counts.exports !== 1 ? "s" : ""}`);
    if (counts.imports > 0)
      parts.push(`${counts.imports} Import${counts.imports !== 1 ? "s" : ""}`);
    return parts.length ? parts.join(" / ") : "No snapshots";
  };

  return (
    <div className="h-full p-4 overflow-auto bg-[#f5f0e8]/80 dark:bg-[#1a1310]">
      <h2 className="text-xl font-semibold mb-6 text-[#7d6957] dark:text-amber-100 flex items-center space-x-2">
        <FaWrench className="text-primary" />
        <span>Configuration Types</span>
      </h2>

      <div className="space-y-6">
        {STATIC_CONFIGS.map((config) => (
          // Item Navigators
          <div
            key={config.type}
            className="group rounded-lg bg-[#f9f6f2]/70 dark:bg-[#211916]/70 hover:bg-[#f9f6f2]/90 dark:hover:bg-[#211916]/90 shadow-sm mb-5"
          >
            <div
              role="button"
              onClick={() => onSelectType(config.type as ConfigType)}
              className={`w-full text-left p-4 flex items-start space-x-3 transition-all duration-200 relative ${
                selectedType === config.type
                  ? "bg-primary/5 dark:bg-primary/10 border-l-4 border-primary"
                  : "hover:bg-[#f5f0e8]/70 dark:hover:bg-[#2a201c]/50 border-l-4 border-transparent"
              } rounded-t-lg ${supportsSync(config.type) ? "pb-3" : "pb-4"}`}
            >
              <div className="flex-shrink-0">
                <config.icon
                  className={`w-5 h-5 mt-0.5 transition-colors duration-200 ${
                    selectedType === config.type
                      ? "text-primary"
                      : "text-[#96816f] group-hover:text-[#7d6957] dark:text-amber-300/70 dark:group-hover:text-amber-300"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div>
                    <h3
                      className={`font-medium transition-colors duration-200 ${
                        selectedType === config.type
                          ? "text-primary"
                          : "text-[#7d6957] dark:text-amber-100 group-hover:text-[#63513f] dark:group-hover:text-amber-200"
                      }`}
                    >
                      {config.label}
                    </h3>
                    <p className="text-sm text-[#96816f] dark:text-amber-300/80 mt-0.5 transition-colors duration-200 group-hover:text-[#7d6957] dark:group-hover:text-amber-300">
                      {config.description}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${
                      isLoading[config.type]
                        ? "bg-[#e6ddd1]/70 dark:bg-[#2a201c]/80 text-[#7d6957] dark:text-amber-300"
                        : snapshotCounts[config.type]?.exports ||
                          snapshotCounts[config.type]?.imports
                        ? "bg-primary/10 text-primary dark:text-primary"
                        : "bg-[#e6ddd1]/70 dark:bg-[#2a201c]/80 text-[#7d6957] dark:text-amber-300"
                    }`}
                  >
                    {isLoading[config.type]
                      ? "Loading..."
                      : formatSnapshotCount(snapshotCounts[config.type])}
                  </span>
                </div>

                {/* Add import/export buttons for supported config types */}
                {supportsSync(config.type) && (
                  <div className="mt-3 pt-2 border-t border-[#e6ddd1] dark:border-[#2a201c]">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-[#96816f] dark:text-amber-300/70 mb-1.5 font-medium">
                          Export actions:
                        </p>
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSync(config.type as ConfigType, "export");
                            }}
                            disabled={isSyncing[config.type]}
                            className={`flex items-center space-x-1 px-2 py-1 text-xs rounded ${
                              isSyncing[config.type]
                                ? "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed"
                                : "bg-primary/10 text-primary hover:bg-primary/20 dark:hover:bg-primary/30 transition-colors"
                            }`}
                          >
                            <FaDownload className="w-3 h-3" />
                            <span>
                              {isSyncing[config.type] &&
                              config.type === selectedType
                                ? "Exporting..."
                                : "Export"}
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-[#96816f] dark:text-amber-300/70 mb-1.5 font-medium">
                          Import actions:
                        </p>
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSync(
                                config.type as ConfigType,
                                "import",
                                true
                              );
                            }}
                            disabled={isSyncing[config.type]}
                            className={`flex items-center space-x-1 px-2 py-1 text-xs rounded ${
                              isSyncing[config.type]
                                ? "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 dark:hover:bg-amber-500/30 transition-colors"
                            }`}
                          >
                            <FaDownload className="w-3 h-3" />
                            <span>
                              {isSyncing[config.type] &&
                              config.type === selectedType
                                ? "Peeking..."
                                : "Peek"}
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSync(config.type as ConfigType, "import");
                            }}
                            disabled={isSyncing[config.type]}
                            className={`flex items-center space-x-1 px-2 py-1 text-xs rounded ${
                              isSyncing[config.type]
                                ? "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed"
                                : "bg-primary/10 text-primary hover:bg-primary/20 dark:hover:bg-primary/30 transition-colors"
                            }`}
                          >
                            <FaUpload className="w-3 h-3" />
                            <span>
                              {isSyncing[config.type] &&
                              config.type === selectedType
                                ? "Importing..."
                                : "Import"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Show error if exists */}
            {selectedType === config.type && error && error[config.type] && (
              <div className="px-4 py-3 border-t border-[#e6ddd1] dark:border-[#2a201c]">
                <div className="text-sm text-error-dark dark:text-error p-3 rounded bg-error-light/30 dark:bg-error-light/10 border border-error-light/50 dark:border-error/20">
                  <div className="flex items-start">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-2 flex-shrink-0 text-error"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Error: {error[config.type]}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Show syncing status for the selected type */}
            {selectedType === config.type &&
              isSyncing &&
              isSyncing[config.type] && (
                <div className="px-4 py-3 border-t border-[#e6ddd1] dark:border-[#2a201c]">
                  <div className="text-sm text-primary p-3 rounded bg-primary/10 border border-primary/20 animate-pulse">
                    <div className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-4 w-4 text-primary"
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
                      Processing... This may take a moment.
                    </div>
                  </div>
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
