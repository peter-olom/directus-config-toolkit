"use client";

import { useEffect, useState, useCallback } from "react";
import { ConfigType, SnapshotInfo } from "../../types";

interface SnapshotHistoryStatsProps {
  type: ConfigType;
}

interface SnapshotStats {
  total: number;
  imports: number;
  regular: number;
  lastSnapshot: string | null;
  lastImport: string | null;
  dailyAverage: number;
  weeklyTotal: number;
}

/**
 * Component to display snapshot history statistics for an item type
 */
export default function SnapshotHistoryStats({
  type,
}: SnapshotHistoryStatsProps) {
  const [stats, setStats] = useState<SnapshotStats>({
    total: 0,
    imports: 0,
    regular: 0,
    lastSnapshot: null,
    lastImport: null,
    dailyAverage: 0,
    weeklyTotal: 0,
  });
  const [loading, setLoading] = useState(true);

  // Helper function to extract a Date object from a snapshot ID
  const extractDateFromSnapshotId = useCallback(
    (snapshotId: string): Date | null => {
      const match = snapshotId.match(/^([\d-]+)T([\d-]+)/);
      if (!match) return null;

      try {
        const dateStr = `${match[1]}T${match[2].replace(/-/g, ":")}`;
        return new Date(dateStr);
      } catch {
        // Silently fail if date parsing fails
        return null;
      }
    },
    []
  );

  // Format snapshot date from ID
  const formatSnapshotDate = useCallback(
    (snapshotId: string): string | null => {
      const date = extractDateFromSnapshotId(snapshotId);
      if (!date) return null;
      return date.toLocaleDateString();
    },
    [extractDateFromSnapshotId]
  );

  useEffect(() => {
    const fetchSnapshotStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/snapshots/${type}`);
        if (response.ok) {
          const snapshots: SnapshotInfo[] = await response.json();

          // Calculate stats
          const importSnapshots = snapshots.filter((s) =>
            s.id.includes("_import_")
          );
          const regularSnapshots = snapshots.filter(
            (s) => !s.id.includes("_import_")
          );

          // Find the latest snapshot timestamp
          let lastSnapshot = null;
          let lastImport = null;

          // Calculate timestamps for regular snapshots
          if (regularSnapshots.length > 0) {
            const latestRegularSnapshot =
              regularSnapshots[regularSnapshots.length - 1];
            lastSnapshot = formatSnapshotDate(latestRegularSnapshot.id);
          }

          // Calculate timestamps for import snapshots
          if (importSnapshots.length > 0) {
            const latestImportSnapshot =
              importSnapshots[importSnapshots.length - 1];
            lastImport = formatSnapshotDate(latestImportSnapshot.id);
          }

          // Calculate weekly statistics
          const now = new Date();
          const oneWeekAgo = new Date(now);
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

          // Count snapshots from the last week
          const lastWeekSnapshots = snapshots.filter((s) => {
            const snapshotDate = extractDateFromSnapshotId(s.id);
            return snapshotDate && snapshotDate >= oneWeekAgo;
          });

          const weeklyTotal = lastWeekSnapshots.length;
          const dailyAverage = Math.round((weeklyTotal / 7) * 10) / 10; // Round to 1 decimal place

          setStats({
            total: snapshots.length,
            imports: importSnapshots.length,
            regular: regularSnapshots.length,
            lastSnapshot,
            lastImport,
            weeklyTotal,
            dailyAverage,
          });
        }
      } catch (error) {
        console.error(`Error fetching snapshot stats for ${type}:`, error);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshotStats();
  }, [type, formatSnapshotDate, extractDateFromSnapshotId]);

  if (loading) {
    return (
      <div className="text-xs text-gray-500 dark:text-amber-300/70">
        Loading history...
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-amber-300/70">
        No history available
      </div>
    );
  }

  return (
    <div className="text-xs text-gray-500 dark:text-amber-300/70 mt-1">
      <div className="flex justify-between items-center">
        <span className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          History: {stats.regular} snapshots
        </span>
        {stats.imports > 0 && (
          <span className="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            {stats.imports} imports
          </span>
        )}
      </div>

      {/* Show last update and weekly activity */}
      <div className="mt-0.5 flex justify-between">
        <span className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {stats.lastSnapshot ? `Last: ${stats.lastSnapshot}` : "No updates"}
        </span>

        <span className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          {stats.weeklyTotal} this week
        </span>
      </div>
    </div>
  );
}
