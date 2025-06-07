import { useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

interface Tab {
  id: string;
  label: string;
}

/**
 * A custom hook for managing tab selection state with localStorage persistence.
 *
 * @param tabs - Array of available tabs
 * @param defaultTabId - Optional default tab ID to select if nothing is stored
 * @param storageKey - Optional localStorage key to use for persistence
 * @returns The active tab ID and a setter function
 */
export function useTabState(
  tabs: Tab[] | { id: string }[],
  defaultTabId?: string,
  storageKey?: string
): [string, (tabId: string) => void] {
  // Determine storage key with a fallback
  const actualStorageKey = storageKey || "activeTabId";

  // Create validating function to ensure saved tab ID is still valid
  const validateTabId = useCallback(
    (tabId: string): boolean => {
      return tabs.some((tab) => tab.id === tabId);
    },
    [tabs]
  );

  // Use localStorage hook with validation
  const [activeTab, setActiveTab] = useLocalStorage<string>(
    actualStorageKey,
    defaultTabId || (tabs.length > 0 ? tabs[0].id : ""),
    validateTabId
  );

  // If active tab is not valid (maybe tabs changed), set to first available tab
  useEffect(() => {
    if (tabs.length > 0 && !validateTabId(activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab, setActiveTab, validateTabId]);

  return [activeTab, setActiveTab];
}
