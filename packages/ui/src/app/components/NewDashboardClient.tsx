"use client";

import Navbar from "../components/Navbar";
import SplitLayout from "../components/layout/SplitLayout";
import ItemTypeNavigator from "../components/layout/ItemTypeNavigator";
import TabView from "../components/layout/TabView";
import LatestConfigViewer from "../components/viewers/LatestConfigViewer";
import TimeMachineViewer from "../components/viewers/TimeMachineViewer";
import ImportDiffViewer from "../components/viewers/ImportDiffViewer";
import AuditLogViewer from "../components/viewers/AuditLogViewer";
import { useSelectedType } from "../hooks";

// Define the config types that support sync operations
const SYNC_SUPPORTED_TYPES = ["flows", "roles", "settings", "files", "schema"];

// Define all config types
const CONFIG_TYPES = [
  {
    type: "roles",
    label: "Roles",
    description: "User roles and permissions groups",
  },
  {
    type: "access",
    label: "Access",
    description: "Access control settings",
  },
  {
    type: "permissions",
    label: "Permissions",
    description: "Detailed permissions configuration",
  },
  {
    type: "policies",
    label: "Policies",
    description: "Security policies",
  },
  {
    type: "schema",
    label: "Schema",
    description: "Database schema configuration",
  },
  {
    type: "files",
    label: "Files",
    description: "File storage settings",
  },
  {
    type: "folders",
    label: "Folders",
    description: "File organization structure",
  },
  {
    type: "flows",
    label: "Flows",
    description: "Automation workflows",
  },
  {
    type: "operations",
    label: "Operations",
    description: "Operations within flows",
  },
  {
    type: "settings",
    label: "Settings",
    description: "System settings",
  },
];

export default function NewDashboardClient() {
  // Use the custom hook for selected type management
  const { selectedType, setSelectedType } = useSelectedType(
    CONFIG_TYPES,
    SYNC_SUPPORTED_TYPES
  );

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <main className="flex-1 flex min-h-0">
        <SplitLayout
          leftPanel={
            <ItemTypeNavigator
              selectedType={selectedType}
              onSelectType={setSelectedType}
              supportsSync={(type) => SYNC_SUPPORTED_TYPES.includes(type)}
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
              storageKey="selectedConfigTab"
            />
          }
        />
      </main>
    </div>
  );
}
