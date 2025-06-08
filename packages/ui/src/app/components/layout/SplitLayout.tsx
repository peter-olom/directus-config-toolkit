"use client";

import { ReactNode } from "react";

interface SplitLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

/**
 * A responsive split layout with a flex-column that scrolls vertically
 * from leftPanel into rightPanel on lg screens and down.
 * On lg screens, it maintains a 40/60 horizontal split.
 */
export default function SplitLayout({
  leftPanel,
  rightPanel,
}: SplitLayoutProps) {
  return (
    <div className="flex flex-col lg:flex-row w-full min-h-full flex-1">
      {/* Left panel - 40% on lg screens, full width stacked on lg and down */}
      <div className="flex-shrink-0 w-full lg:w-2/6 lg:border-r border-gray-200 dark:border-[#3b2d27] lg:overflow-y-auto lg:h-full">
        {leftPanel}
      </div>

      {/* Right panel - 60% on lg screens, full width stacked on lg and down */}
      <div className="flex-1 w-full lg:w-4/6 lg:overflow-y-auto lg:h-full">
        {rightPanel}
      </div>
    </div>
  );
}
