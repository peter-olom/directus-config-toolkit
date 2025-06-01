"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Helper function to get the initial theme.
// This function will run on the client side.
const getInitialTheme = (): Theme => {
  // Check if localStorage is available (client-side)
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const savedTheme = localStorage.getItem("theme") as Theme | null;
      if (savedTheme && ["light", "dark", "system"].includes(savedTheme)) {
        return savedTheme;
      }
    } catch (error) {
      console.warn("Could not access localStorage for initial theme", error);
      // Fallback to "system" in case of error
      return "system";
    }
  }
  // Default for SSR or if localStorage is not available/empty.
  // The script in layout.tsx handles the very first paint.
  // ThemeClassManager will sync with this state.
  return "system";
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize theme state using the value from localStorage or system preference.
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Update localStorage when theme changes.
  useEffect(() => {
    try {
      localStorage.setItem("theme", theme);
    } catch (error) {
      console.warn("Could not save theme to localStorage", error);
    }
  }, [theme]);

  // The actual setTheme function passed to context consumers.
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
