/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useState,
  useEffect,
} from "react";
import { ConfigStatus, ConfigType, DiffResult, SyncJob } from "../types";

interface ConfigContextType {
  configStatuses: ConfigStatus[];
  diffResults: Record<ConfigType, DiffResult>;
  syncJobs: SyncJob[];
  loading: boolean;
  error: string | null;
  syncConfig: (
    type: ConfigType,
    direction: "import" | "export"
  ) => Promise<void>;
  getDiff: (type: ConfigType) => Promise<DiffResult>;
  refreshStatus: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const [configStatuses, setConfigStatuses] = useState<ConfigStatus[]>([]);
  const [diffResults, setDiffResults] = useState<
    Record<ConfigType, DiffResult>
  >({} as Record<ConfigType, DiffResult>);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial data fetch
  useEffect(() => {
    // Set initial loading state
    setLoading(true);

    // Load data in parallel
    const loadInitialData = async () => {
      try {
        // Using Promise.all to load data in parallel
        await Promise.all([refreshStatus(), loadSyncJobs()]);
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setError(
          "Failed to load initial data. Please check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Load sync jobs history
  const loadSyncJobs = async () => {
    try {
      setSyncJobs([]);
    } catch (error: any) {
      setError(`Failed to load sync jobs: ${error.message}`);
      console.error("Failed to load sync jobs:", error);
    }
  };

  const syncConfig = async (
    type: ConfigType,
    direction: "import" | "export"
  ) => {
    setLoading(true);
    try {
      // Refresh the data after successful sync
      await refreshStatus();
      await loadSyncJobs();
    } catch (error: any) {
      console.error(`Failed to ${direction} ${type}:`, error);
    } finally {
      setLoading(false);
    }
  };
  const getDiff = async (type: ConfigType): Promise<DiffResult> => {
    setLoading(true);
    try {
      // Get diffs from API

      // Store the result in our local state
      setDiffResults((prev) => ({
        ...prev,
        [type]: [],
      }));

      return {} as DiffResult;
    } catch (error: any) {
      console.error(`Failed to get diff for ${type}:`, error);
      // Create an empty diff result if we don't have one cached
      const emptyResult: DiffResult = {
        type,
        differences: [],
        timestamp: new Date().toISOString(),
      };
      return diffResults[type] || emptyResult;
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Get actual status from API
      setConfigStatuses([]);
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
        error,
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
