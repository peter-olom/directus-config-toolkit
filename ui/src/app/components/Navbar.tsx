"use client";

import ThemeToggle from "./ThemeToggle";

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
              <a
                href="/"
                className="border-primary text-foreground inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Dashboard
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full text-xs bg-success-light text-success-dark dark:bg-success-light/20 dark:text-success">
              Connected
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
