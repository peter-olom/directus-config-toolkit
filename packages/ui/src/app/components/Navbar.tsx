"use client";

import ThemeToggle from "./ThemeToggle";
import Image from "next/image";
import { signOut } from "next-auth/react";

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
                width={44}
                height={64}
              />
              <h1 className="text-xl font-bold text-foreground">
                Directus Config Toolkit
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={async () => await signOut()}
              className="px-3 py-1 rounded-md text-sm text-[#7d6957] hover:text-[#63513f] dark:text-amber-300 dark:hover:text-amber-100 hover:bg-[#f5f0e8]/70 dark:hover:bg-[#2a201c]"
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
