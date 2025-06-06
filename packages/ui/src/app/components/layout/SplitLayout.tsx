"use client";

import { ReactNode } from "react";

interface SplitLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

/**
 * A responsive split layout with a 40/60 ratio on larger screens
 * and stacked layout on smaller screens.
 */
export default function SplitLayout({
  leftPanel,
  rightPanel,
}: SplitLayoutProps) {
  return (
    <div className="flex flex-col lg:flex-row w-full h-full flex-1">
      {/* Left panel - 40% on large screens, full width on small screens */}
      <div className="flex-shrink-0 w-full lg:w-2/6 border-r border-gray-200 dark:border-[#3b2d27] overflow-y-auto">
        {leftPanel}
      </div>

      {/* Right panel - 60% on large screens, full width on small screens */}
      <div className="flex-1 w-full lg:w-4/6 overflow-y-auto">{rightPanel}</div>
    </div>
  );
}
