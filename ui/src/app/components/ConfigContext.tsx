"use client";

import { createContext, ReactNode, useContext, useState } from "react";
import {
  mockConfigStatuses,
  mockDiffResults,
  mockSyncJobs,
  simulateApiDelay,
} from "../mockData";
import {
  ConfigStatus,
  ConfigType,
  DiffResult,
  SyncJob,
  ActionResult,
} from "../types";

interface ConfigContextType {
  configStatuses: ConfigStatus[];
  diffResults: Record<ConfigType, DiffResult>;
  syncJobs: SyncJob[];
  loading: boolean;
  syncConfig: (
    type: ConfigType,
    direction: "import" | "export"
  ) => Promise<ActionResult>;
  getDiff: (type: ConfigType) => Promise<DiffResult>;
  refreshStatus: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const [configStatuses, setConfigStatuses] =
    useState<ConfigStatus[]>(mockConfigStatuses);
  const [diffResults, setDiffResults] =
    useState<Record<ConfigType, DiffResult>>(mockDiffResults);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>(mockSyncJobs);
  const [loading, setLoading] = useState(false);

  const syncConfig = async (
    type: ConfigType,
    direction: "import" | "export"
  ): Promise<ActionResult> => {
    setLoading(true);
    try {
      // Mock API call
      await simulateApiDelay(1500);

      // Create a new job
      const newJob: SyncJob = {
        id: `job-${Date.now()}`,
        type,
        direction,
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      setSyncJobs([newJob, ...syncJobs]);

      // Update the status
      const updatedStatuses = configStatuses.map((status) =>
        status.type === type
          ? {
              ...status,
              lastSync: new Date().toISOString(),
              status: "synced" as const,
            }
          : status
      );

      setConfigStatuses(updatedStatuses);

      return {
        success: true,
        message: `Successfully ${direction}ed ${type} configuration`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to ${direction} ${type} configuration`,
      };
    } finally {
      setLoading(false);
    }
  };

  const getDiff = async (type: ConfigType): Promise<DiffResult> => {
    setLoading(true);
    try {
      // Mock API call
      await simulateApiDelay(1000);
      return diffResults[type];
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async (): Promise<void> => {
    setLoading(true);
    try {
      // Mock API call
      await simulateApiDelay(800);

      // Create updated statuses with new timestamps
      const updatedStatuses = configStatuses.map((status) => ({
        ...status,
        lastSync: new Date().toISOString(),
      }));

      setConfigStatuses(updatedStatuses);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigContext.Provider
      value={{
        configStatuses,
        diffResults,
        syncJobs,
        loading,
        syncConfig,
        getDiff,
        refreshStatus,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};
