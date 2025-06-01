"use client";

import { useEffect } from "react";
import { useTheme } from "./ThemeContext";

export default function ThemeClassManager() {
  const { theme } = useTheme();

  useEffect(() => {
    // Apply theme class to html element
    const htmlElement = document.documentElement;
    const applyTheme = () => {
      // Remove existing theme classes
      htmlElement.classList.remove("light", "dark");

      // If system theme, detect and apply the right theme
      if (theme === "system") {
        const isSystemDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        htmlElement.classList.add(isSystemDark ? "dark" : "light");
      } else {
        // Apply theme directly
        htmlElement.classList.add(theme);
      }
    };

    // Apply theme immediately
    applyTheme();

    // Set up listener for system preference changes
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme();

      // Use the appropriate event listener based on browser support
      mediaQuery.addEventListener("change", handleChange);

      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  // This component does not render anything
  return null;
}
