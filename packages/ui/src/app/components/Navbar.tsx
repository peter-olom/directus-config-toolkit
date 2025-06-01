"use client";

import { signOut } from "@/auth";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="bg-card border-b border-card-border dark:bg-card shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-foreground">
                Directus Config Toolkit
              </h1>
            </div>
            <nav className="ml-6 flex space-x-8">
              <Link href="/" passHref>
                <span className="border-primary text-foreground inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                  Dashboard
                </span>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full text-xs bg-success-light text-success-dark dark:bg-success-light/20 dark:text-success">
              Connected
            </span>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
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
