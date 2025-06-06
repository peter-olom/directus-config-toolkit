"use client";

import { ConfigType } from "@/app/types";
import React, { useState, useEffect } from "react";
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
} from "react-icons/fa";

interface ItemTypeNavigatorProps {
  selectedType: string | null;
  onSelectType: (type: ConfigType) => void;
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
    description: "Operation settings",
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
}: ItemTypeNavigatorProps) {
  const [snapshotCounts, setSnapshotCounts] = useState<
    Record<string, SnapshotCounts>
  >({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});

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
    <div className="h-full p-4 overflow-auto bg-gray-50 dark:bg-gray-900">
      <h2 className="text-xl font-semibold mb-6 text-foreground flex items-center space-x-2">
        <FaWrench className="text-primary" />
        <span>Configuration Types</span>
      </h2>

      <div className="space-y-4">
        {STATIC_CONFIGS.map((config) => (
          <div key={config.type} className="group">
            <button
              onClick={() => onSelectType(config.type as ConfigType)}
              className={`w-full text-left p-4 rounded-lg flex items-start space-x-3 transition-all duration-200 relative ${
                selectedType === config.type
                  ? "bg-primary/5 dark:bg-primary/10 border-l-4 border-primary shadow-sm"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 border-transparent"
              }`}
            >
              <div className="flex-shrink-0">
                <config.icon
                  className={`w-5 h-5 mt-0.5 transition-colors duration-200 ${
                    selectedType === config.type
                      ? "text-primary"
                      : "text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400"
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
                          : "text-gray-900 dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-gray-300"
                      }`}
                    >
                      {config.label}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 transition-colors duration-200 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                      {config.description}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${
                      isLoading[config.type]
                        ? "bg-gray-100 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400"
                        : snapshotCounts[config.type]?.exports ||
                          snapshotCounts[config.type]?.imports
                        ? "bg-primary/10 text-primary"
                        : "bg-gray-100 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {isLoading[config.type]
                      ? "Loading..."
                      : formatSnapshotCount(snapshotCounts[config.type])}
                  </span>
                </div>
              </div>
            </button>

            {/* Show error if exists */}
            {selectedType === config.type && error && error[config.type] && (
              <div className="mt-2 ml-12">
                <div className="text-sm text-red-600 dark:text-red-400 p-2 rounded bg-red-50 dark:bg-red-900/20">
                  Error: {error[config.type]}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
