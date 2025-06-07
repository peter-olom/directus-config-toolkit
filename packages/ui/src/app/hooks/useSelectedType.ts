import { useEffect, useCallback } from "react";
import { ConfigType } from "@/app/types";
import { useLocalStorage } from "./useLocalStorage";

interface ConfigTypeOption {
  type: string;
  label: string;
  description: string;
}

/**
 * A custom hook for managing selected configuration type with localStorage persistence.
 *
 * @param configOptions - Array of available configuration options
 * @param syncSupportedTypes - Optional array of types that support sync operations
 * @returns An object with the selected type, setter function, and utility methods
 */
export function useSelectedType(
  configOptions: ConfigTypeOption[],
  syncSupportedTypes?: string[]
) {
  const [selectedType, setSelectedType] = useLocalStorage<ConfigType | null>(
    "selectedConfigType",
    null,
    (value) =>
      value !== null && configOptions.some((config) => config.type === value)
  );

  // Checks if a config type supports import/export
  const supportsSync = useCallback(
    (type: string): boolean => {
      if (!syncSupportedTypes) return false;
      return syncSupportedTypes.includes(type);
    },
    [syncSupportedTypes]
  );

  // Select default type when no type is selected
  useEffect(() => {
    if (selectedType === null && configOptions.length > 0) {
      // First try to select a type that supports sync
      const firstSyncType = configOptions.find((config) =>
        supportsSync(config.type)
      )?.type;

      if (firstSyncType) {
        setSelectedType(firstSyncType as ConfigType);
      } else if (configOptions.length > 0) {
        // If no sync-supporting type exists, select the first type
        setSelectedType(configOptions[0].type as ConfigType);
      }
    }
  }, [selectedType, configOptions, setSelectedType, supportsSync]);

  // Helper function to handle type selection
  const selectType = (type: ConfigType) => {
    setSelectedType(type);
  };

  return {
    selectedType,
    setSelectedType: selectType,
    supportsSync,
  };
}
