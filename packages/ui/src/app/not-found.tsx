"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8">
        <h2 className="text-4xl font-bold text-error mb-4">404</h2>
        <h1 className="text-2xl font-semibold mb-2 text-foreground">
          Page Not Found
        </h1>
        <p className="text-gray-700 dark:text-amber-300/80 mb-6">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-primary text-amber-900 rounded hover:bg-primary-dark dark:hover:bg-primary-light"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
