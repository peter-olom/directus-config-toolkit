"use client";

import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { getVersions } from "../utils/versions";
import { FaSignOutAlt } from "react-icons/fa";

export default function Navbar() {
  const [versions, setVersions] =
    useState<Partial<Record<"core" | "ui", string>>>();

  useEffect(() => {
    getVersions().then(setVersions);
  }, []);

  return (
    <header className="bg-[#f5f0e8] dark:bg-[#1a1310] border-b border-card-border shadow sticky top-0 z-[100] transition-all duration-200">
      <div className="w-full px-4 sm:px-6">
        <div className="flex flex-row justify-between items-center h-auto sm:h-16 py-2 sm:py-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <Image
                src="/dct-logo-web.png"
                alt="Directus Config Toolkit"
                width={44}
                height={64}
              />
              <div className="flex flex-col">
                <h1 className="text-lg sm:text-xl font-bold text-foreground leading-tight">
                  Directus Config Toolkit
                </h1>
                {versions && (
                  <div className="text-[10px] sm:text-xs text-[#7d6957] dark:text-amber-300/60 leading-tight mt-0.5">
                    UI v{versions?.ui} | Core v{versions?.core}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-row items-center gap-1 sm:gap-4">
            <button
              onClick={async () => await signOut()}
              className={`rounded-md text-[#7d6957] hover:text-[#63513f] dark:text-amber-300 dark:hover:text-amber-100 hover:bg-[#f5f0e8]/70 dark:hover:bg-[#2a201c] p-2 lg:px-3 lg:py-1 lg:text-sm `}
              aria-label="Logout"
            >
              <FaSignOutAlt size={22} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
