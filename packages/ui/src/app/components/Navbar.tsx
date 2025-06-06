"use client";

import { signOut } from "@/auth";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="bg-card border-b border-card-border dark:bg-card shadow sticky top-0 z-10">
      <div className="w-full px-4 sm:px-6">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-3">
              <Image
                src="/dct-logo-web.png"
                alt="Directus Config Toolkit"
                width={64}
                height={64}
                className="transition-all duration-200 dark:invert dark:brightness-[0.87] dark:contrast-[1.5] dark:saturate-0"
              />
              <h1 className="text-xl font-bold text-foreground">
                Directus Config Toolkit
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => signOut()}
              className="px-3 py-1 rounded-md text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Logout
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
