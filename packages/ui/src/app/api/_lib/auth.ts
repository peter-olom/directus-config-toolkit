import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Validates the NextAuth session for API endpoints.
 * Returns the session object if valid, otherwise a NextResponse with 401.
 */
export async function requireSession() {
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", message: "You must be signed in." },
      { status: 401 }
    );
  }
  return session;
}
