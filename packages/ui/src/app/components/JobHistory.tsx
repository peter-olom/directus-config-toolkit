"use client";

import { useState } from "react";
import { useConfig } from "./ConfigContext";
import { SyncJob } from "../types";

export default function JobHistory() {
  const { syncJobs } = useConfig();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getStatusBadge = (status: SyncJob["status"]) => {
    const styles = {
      pending:
        "bg-primary-light/30 text-primary-dark dark:bg-primary-light/20 dark:text-primary",
      running:
        "bg-warning-light text-warning-dark dark:bg-warning-light/20 dark:text-warning",
      completed:
        "bg-success-light text-success-dark dark:bg-success-light/20 dark:text-success",
      failed:
        "bg-error-light text-error-dark dark:bg-error-light/20 dark:text-error",
    };

    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
      >
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculateDuration = (
    startDate: string,
    endDate: string | undefined
  ) => {
    if (!endDate) return "In progress";
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const durationMs = end - start;

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${Math.floor(durationMs / 1000)}s`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  };

  if (syncJobs.length === 0) {
    return (
      <div className="border border-card-border rounded-md p-8 text-center text-gray-600 dark:text-gray-300 bg-card shadow-sm">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          ></path>
        </svg>
        <p className="font-medium">No sync jobs found</p>
      </div>
    );
  }

  return (
    <div className="border border-card-border rounded-md overflow-hidden shadow-sm bg-card">
      <div className="p-4 bg-card-header border-b border-card-border">
        <h2 className="font-semibold text-foreground">Recent Sync Jobs</h2>
      </div>
      <div className="divide-y divide-card-border">
        {syncJobs.map((job) => (
          <div
            key={job.id}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize text-foreground">
                    {job.type}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md ${
                      job.direction === "import"
                        ? "bg-primary-light/30 text-primary-dark dark:bg-primary-light/10 dark:text-primary"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {job.direction === "import" ? "Import" : "Export"}
                  </span>
                  {getStatusBadge(job.status)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <span className="inline-flex items-center">
                    <svg
                      className="w-3.5 h-3.5 mr-1 text-gray-500 dark:text-gray-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      ></path>
                    </svg>
                    {formatDate(job.createdAt)}
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    {job.completedAt
                      ? calculateDuration(job.createdAt, job.completedAt)
                      : "In progress"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => toggleExpand(job.id)}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-5 w-5 transition-transform ${
                    expanded[job.id] ? "transform rotate-180" : ""
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
              </button>
            </div>

            {expanded[job.id] && (
              <div className="mt-3 pt-3 border-t border-card-border text-sm text-foreground bg-background rounded-md p-4 shadow-inner">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Job ID:</span> {job.id}
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Type:</span>{" "}
                    <span className="capitalize">{job.type}</span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Direction:</span>{" "}
                    <span className="capitalize">{job.direction}</span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Status:</span>{" "}
                    <span className="capitalize">{job.status}</span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Started:</span>{" "}
                    {formatDate(job.createdAt)}
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Completed:</span>{" "}
                    {job.completedAt ? formatDate(job.completedAt) : "N/A"}
                  </div>
                  <div className="col-span-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-card-border">
                    <span className="font-semibold">Duration:</span>{" "}
                    {job.completedAt
                      ? calculateDuration(job.createdAt, job.completedAt)
                      : "In progress"}
                  </div>
                  {job.error && (
                    <div className="col-span-2 mt-2 p-3 bg-error-light/50 border border-error/30 rounded-md dark:bg-error-light/20 dark:border-error/20">
                      <div className="flex items-center mb-1">
                        <svg
                          className="w-4 h-4 mr-1 text-error"
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
                        <span className="font-semibold text-error dark:text-error">
                          Error:
                        </span>
                      </div>
                      <div className="text-error dark:text-error pl-5">
                        {job.error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
