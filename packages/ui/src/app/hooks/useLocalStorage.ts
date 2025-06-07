import { useState, useEffect } from "react";

/**
 * A custom hook for persisting state in localStorage.
 *
 * @param key - The localStorage key to store the value under
 * @param initialValue - The initial value to use if nothing exists in localStorage
 * @param validationFn - Optional function to validate the stored value
 * @returns A stateful value and a function to update it, like useState
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  validationFn?: (value: T) => boolean
): [T, React.Dispatch<React.SetStateAction<T>>] {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);

      // Parse stored json or if none return initialValue
      const value = item ? JSON.parse(item) : initialValue;

      // If validation function provided, check if value is valid
      if (validationFn && !validationFn(value)) {
        return initialValue;
      }

      return value;
    } catch (error) {
      // If error also return initialValue
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage.
  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;

      // Save state
      setStoredValue(valueToStore);

      // Save to local storage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  // Listen for changes to this localStorage key from other components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const newValue = JSON.parse(e.newValue);

          // If validation function provided, check if value is valid
          if (!validationFn || validationFn(newValue)) {
            setStoredValue(newValue);
          }
        } catch (error) {
          console.error(
            `Error parsing localStorage change for key "${key}":`,
            error
          );
        }
      }
    };

    // Listen for storage events to keep different tabs in sync
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [key, validationFn]);

  return [storedValue, setValue];
}
