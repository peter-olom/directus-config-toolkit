"use client";

import { useState } from "react";
import { ConfigType } from "../types";
import { useConfig } from "../components/ConfigContext";
import Navbar from "../components/Navbar";
import EmptyState from "../components/EmptyState";
import SplitLayout from "../components/layout/SplitLayout";
import ItemTypeNavigator from "../components/layout/ItemTypeNavigator";
import TabView from "../components/layout/TabView";
import LatestConfigViewer from "../components/viewers/LatestConfigViewer";
import TimeMachineViewer from "../components/viewers/TimeMachineViewer";
import ImportDiffViewer from "../components/viewers/ImportDiffViewer";
import AuditLogViewer from "../components/viewers/AuditLogViewer";

export default function NewDashboardClient() {
  const [selectedType, setSelectedType] = useState<ConfigType | null>(null);
  const { configStatuses, loading, error } = useConfig();

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
    <div className="flex flex-col h-screen">
      <Navbar />
      <main className="flex-1 flex min-h-0">
        <SplitLayout
          leftPanel={
            <ItemTypeNavigator
              selectedType={selectedType}
              onSelectType={setSelectedType}
            />
          }
          rightPanel={
            <TabView
              tabs={[
                {
                  id: "latest",
                  label: "Latest Config",
                  content: <LatestConfigViewer type={selectedType} />,
                },
                {
                  id: "timeMachine",
                  label: "Time Machine",
                  content: <TimeMachineViewer type={selectedType} />,
                },
                {
                  id: "auditLog",
                  label: "Audit Log",
                  content: <AuditLogViewer type={selectedType} />,
                },
                {
                  id: "importDiff",
                  label: "Import Diff",
                  content: <ImportDiffViewer type={selectedType} />,
                },
              ]}
              defaultTabId="latest"
            />
          }
        />
      </main>
    </div>
  );
}
