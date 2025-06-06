/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const API_URL = process.env.DCT_API_URL || "http://localhost:8055";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        {
          error: "Missing credentials",
          message: "Email and password are required",
        },
        { status: 400 }
      );
    }

    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password,
    });

    return NextResponse.json({ data: response.data.data });
  } catch (error: any) {
    console.error("Login error:", error);
    // Axios errors might have a response object
    if (error.response) {
      return NextResponse.json(
        {
          error: "Login failed",
          message: error.response.data?.errors?.[0]?.message || error.message,
        },
        { status: error.response.status || 500 }
      );
    }
    return NextResponse.json(
      {
        error: "Login failed",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
