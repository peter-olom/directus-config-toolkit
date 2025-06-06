"use client";

import { useTheme } from "./ThemeContext";
import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center justify-center p-2 rounded-md hover:bg-[#f5f0e8]/70 dark:hover:bg-[#2a201c] transition-colors border border-transparent hover:border-[#e6ddd1] dark:hover:border-[#3b2d27]"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <svg
          className="h-5 w-5 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
            fill="currentColor"
          />
        </svg>
      ) : theme === "system" ? (
        <svg
          className="h-5 w-5 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 6a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 15c0 3 2 5 2 5H8s2-2 2-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          className="h-5 w-5 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM12 21.75a.75.75 0 01-.75-.75v-2.25a.75.75 0 011.5 0V21a.75.75 0 01-.75.75zM2.25 12a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H3a.75.75 0 01-.75-.75zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM5.636 5.636a.75.75 0 011.06 0l1.592 1.592a.75.75 0 11-1.061 1.06L5.636 6.697a.75.75 0 010-1.061zM19.364 5.636a.75.75 0 010 1.06l-1.591 1.592a.75.75 0 01-1.06-1.06l1.59-1.592a.75.75 0 011.061 0zM16.713 18.364a.75.75 0 011.06 0l1.592 1.591a.75.75 0 11-1.061 1.06l-1.591-1.59a.75.75 0 010-1.061zM7.287 18.364a.75.75 0 010 1.06l-1.592 1.592a.75.75 0 01-1.06-1.061l1.591-1.591a.75.75 0 011.06 0z"
            fill="currentColor"
          />
        </svg>
      )}
      <span className="sr-only">
        {theme === "dark"
          ? "Dark mode"
          : theme === "system"
          ? "System preference"
          : "Light mode"}
      </span>
    </button>
  );
}
