"use client";

import { ReactNode } from "react";
import { useTabState } from "@/app/hooks";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabViewProps {
  tabs: Tab[];
  defaultTabId?: string;
  storageKey?: string;
}

/**
 * TabView component for showing different views in the right panel.
 * Can persist the active tab state to localStorage if storageKey is provided.
 */
export default function TabView({
  tabs,
  defaultTabId,
  storageKey,
}: TabViewProps) {
  // Use our custom hook for tab state management with localStorage persistence
  const [activeTab, setActiveTab] = useTabState(tabs, defaultTabId, storageKey);

  return (
    <div className="flex flex-col h-full">
      {/* Tab header */}
      <div className="flex border-b border-gray-200 dark:border-[#3b2d27]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-primary"
                : "text-gray-700 dark:text-amber-300 hover:text-gray-900 dark:hover:text-amber-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}
