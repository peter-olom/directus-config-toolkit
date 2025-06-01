"use client";

import { useState } from "react";
import { ConfigType } from "../types";
import { useConfig } from "../components/ConfigContext";
import ConfigList from "../components/ConfigList";
import DiffViewer from "../components/DiffViewer";
import JobHistory from "../components/JobHistory";
import Navbar from "../components/Navbar";
import SnapshotManagement from "../components/SnapshotManagement";
import EmptyState from "../components/EmptyState";

export default function DashboardClient() {
  const [selectedConfig, setSelectedConfig] = useState<ConfigType | null>(null);
  const { diffResults, configStatuses, loading, error, getDiff } = useConfig();

  const handleViewDiff = async (type: ConfigType) => {
    await getDiff(type);
    setSelectedConfig(type);
  };

  const handleCloseDiff = () => {
    setSelectedConfig(null);
  };

  // Show loading state when initializing
  if (loading && configStatuses.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <EmptyState type="loading" message="Loading configuration data..." />
        </main>
      </div>
    );
  }

  // Show error state if there's an error and no data
  if (error && configStatuses.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <EmptyState type="error" message={`Error loading data: ${error}`} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="text-sm text-muted-foreground mb-2">
            Refreshing data...
          </div>
        )}
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">
              Configuration Dashboard
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage and synchronize your Directus configurations
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="mb-6">
                <ConfigList onViewDiff={handleViewDiff} />
              </div>
              <div className="mb-6">
                <JobHistory />
              </div>
            </div>
            <div>
              <SnapshotManagement />
            </div>
          </div>
        </div>
      </main>
      {selectedConfig && (
        <DiffViewer
          differences={diffResults[selectedConfig].differences}
          onClose={handleCloseDiff}
        />
      )}
    </div>
  );
}
