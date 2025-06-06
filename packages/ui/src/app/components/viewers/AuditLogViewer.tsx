"use client";

import { useEffect, useState } from "react";
import { AuditLogEntry, ConfigType } from "../../types";
import EmptyState from "../EmptyState";

interface AuditLogViewerProps {
  type: ConfigType | null;
}

/**
 * Component for viewing audit logs for a configuration type.
 */
export default function AuditLogViewer({ type }: AuditLogViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Fetch audit logs when type changes
  useEffect(() => {
    const fetchAuditLogs = async () => {
      if (!type) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/audit/${type}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} audit logs`);
        }
        const data = await response.json();
        setAuditLogs(data);
      } catch (err) {
        console.error(`Error fetching ${type} audit logs:`, err);
        setError(
          err instanceof Error ? err.message : "Failed to load audit logs"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, [type]);

  // Format date for display
  const formatDate = (timestamp: string): string => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch (e) {
      return timestamp;
    }
  };

  // Get appropriate status badge styling
  const getStatusBadgeClass = (status: "success" | "failure") => {
    return status === "success"
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
  };

  // Get appropriate operation badge styling
  const getOperationBadgeClass = (operation: "import" | "export") => {
    return operation === "import"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
      : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
  };

  if (!type) {
    return (
      <EmptyState
        type="info"
        message="Select a configuration type from the left panel to view its audit logs."
      />
    );
  }

  if (loading && auditLogs.length === 0) {
    return <EmptyState type="loading" message="Loading audit logs..." />;
  }

  if (error && auditLogs.length === 0) {
    return <EmptyState type="error" message={error} />;
  }

  if (auditLogs.length === 0) {
    return (
      <EmptyState
        type="info"
        message={`No audit logs found for ${type}. Audit logs are created when configurations are imported or exported.`}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <h2 className="text-xl font-semibold mb-4">
        {type.charAt(0).toUpperCase() + type.slice(1)} Audit Log
      </h2>

      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {auditLogs.length} audit log entries for {type}
        </p>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Timestamp
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Operation
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Manager
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {auditLogs.map((log, index) => (
              <tr
                key={index}
                className={
                  index % 2 === 0
                    ? "bg-white dark:bg-gray-900"
                    : "bg-gray-50 dark:bg-gray-800"
                }
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(log.timestamp)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getOperationBadgeClass(
                      log.operation
                    )}`}
                  >
                    {log.operation}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {log.manager}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(
                      log.status
                    )}`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {log.message || "-"}
                  {log.snapshotFile && (
                    <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                      Snapshot: {log.snapshotFile.split("/").pop()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
