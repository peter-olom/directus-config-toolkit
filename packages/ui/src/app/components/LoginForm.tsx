"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";
import Image from "next/image";

interface LoginFormProps {
  corePackageVersion?: string;
  uiPackageVersion?: string;
}

export default function LoginForm({
  corePackageVersion,
  uiPackageVersion,
}: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(result.error || "Invalid credentials");
      } else if (result?.ok) {
        router.push("/");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to login. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/dct-logo.png"
            alt="Directus Config Toolkit"
            className="mb-2"
            width={164}
            height={164}
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.07))" }}
          />
        </div>
        <div className="bg-card shadow-md rounded-lg px-8 pt-6 pb-8 mb-4 border border-card-border">
          <div className="text-center mb-6">
            <p className="text-[#7d6957] dark:text-amber-300/80 mt-2">
              Sign in to continue
            </p>
          </div>
          {error && (
            <div className="mb-4 p-3 bg-error-light/70 text-error-dark border border-error/30 rounded-md dark:bg-error-light/30 dark:text-error dark:border-error/40">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label
                className="block text-[#7d6957] dark:text-amber-300/80 text-sm font-bold mb-2"
                htmlFor="username"
              >
                Username
              </label>
              <input
                className="shadow appearance-none border border-[#e6ddd1]/80 rounded w-full py-2 px-3 text-[#7d6957] dark:text-amber-100 leading-tight focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-[#2a201c] dark:border-[#3b2d27]"
                id="username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="mb-6">
              <label
                className="block text-[#7d6957] dark:text-amber-300/80 text-sm font-bold mb-2"
                htmlFor="password"
              >
                Password
              </label>
              <input
                className="shadow appearance-none border border-[#e6ddd1]/80 rounded w-full py-2 px-3 text-[#7d6957] dark:text-amber-100 leading-tight focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-[#2a201c] dark:border-[#3b2d27]"
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-center">
              <button
                className="w-full bg-[#7d6957] hover:bg-[#63513f] text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 transition-colors"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </div>
          </form>
        </div>
        {uiPackageVersion && corePackageVersion && (
          <div className="text-center text-xs text-[#7d6957]/70 dark:text-amber-300/50 mt-2">
            UI v{uiPackageVersion} | Core v{corePackageVersion}
          </div>
        )}
      </div>
    </div>
  );
}
