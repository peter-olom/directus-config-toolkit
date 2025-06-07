"use client";

export default function EmptyState({
  type,
  message,
  children,
}: {
  type: "loading" | "error" | "empty";
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center h-full w-full">
      {type === "loading" && (
        <div className="w-8 h-8 border-4 border-gray-300/40 dark:border-[#3b2d27] border-t-amber-500 dark:border-t-amber-500 rounded-full animate-spin mb-4" />
      )}

      {type === "error" && (
        <div className="w-12 h-12 bg-red-100/80 text-red-600 rounded-full flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
      )}

      {type === "empty" && (
        <div className="w-12 h-12 bg-gray-200/40 dark:bg-[#3b2d27] text-gray-700 dark:text-amber-300/80 rounded-full flex items-center justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
      )}

      <p className="text-lg font-medium mb-2 text-gray-700 dark:text-amber-100">
        {message}
      </p>

      {children}
    </div>
  );
}
