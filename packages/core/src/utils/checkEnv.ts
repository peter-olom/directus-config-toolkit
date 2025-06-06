import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

/**
 * Helper script to diagnose environment and connection issues
 */
export default async function checkEnvironment(): Promise<void> {
  console.log("=== Directus Config Toolkit Environment Check ===");

  // Check .env file existence
  const envPath = path.join(process.cwd(), ".env");
  console.log(`Looking for .env file at: ${envPath}`);

  if (fs.existsSync(envPath)) {
    console.log("✅ .env file found");

    // Parse the .env file
    try {
      const envContent = fs.readFileSync(envPath, "utf8");
      const parsedEnv = dotenv.parse(envContent);

      console.log("\nEnvironment Variables in .env:");
      for (const [key, value] of Object.entries(parsedEnv)) {
        if (key === "DCT_TOKEN") {
          console.log(
            `DCT_TOKEN: ${value.substring(0, 4)}...${value.substring(
              value.length - 4
            )}`
          );
        } else if (
          key === "DCT_API_URL" ||
          key === "DCT_CONFIG_PATH"
        ) {
          console.log(`${key}: ${value}`);
        }
      }

      // Check for required variables
      if (!parsedEnv.DCT_API_URL) {
        console.log("❌ DCT_API_URL is missing in .env file");
      }
      if (!parsedEnv.DCT_TOKEN) {
        console.log("❌ DCT_TOKEN is missing in .env file");
      }
    } catch (error: any) {
      console.error(`Error reading .env file: ${error.message}`);
    }
  } else {
    console.log(
      "❌ No .env file found. Make sure it exists in your current directory."
    );
  }

  // Check actual environment variables
  console.log("\nActive Environment Variables:");
  console.log(`DCT_API_URL: ${process.env.DCT_API_URL || "(not set)"}`);
  console.log(
    `DCT_TOKEN: ${
      process.env.DCT_TOKEN ? "(set)" : "(not set)"
    }`
  );
  console.log(
    `DCT_CONFIG_PATH: ${
      process.env.DCT_CONFIG_PATH || "(not set)"
    }`
  );

  // Test connection
  const apiUrl = process.env.DCT_API_URL || "http://localhost:8055";
  console.log(`\nTesting connection to ${apiUrl}...`);

  try {
    await axios.get(`${apiUrl}/server/ping`, { timeout: 5000 });
    console.log("✅ Server is reachable");

    // Test authentication
    if (process.env.DCT_TOKEN) {
      try {
        await axios.get(`${apiUrl}/users/me`, {
          headers: {
            Authorization: `Bearer ${process.env.DCT_TOKEN}`,
          },
          timeout: 5000,
        });
        console.log("✅ Authentication successful");
      } catch (error: any) {
        console.log("❌ Authentication failed");
        console.log(`Status: ${error.response?.status || "Unknown"}`);
        console.log(`Message: ${error.message || "Unknown error"}`);
      }
    } else {
      console.log("⚠️ Cannot test authentication without DCT_TOKEN");
    }
  } catch (error: any) {
    console.log("❌ Server is not reachable");
    console.log(`Error: ${error.message}`);
  }

  console.log("\nTroubleshooting Tips:");
  console.log("1. Ensure your .env file is in the correct directory");
  console.log("2. Check that the Directus server is running and accessible");
  console.log(
    "3. Verify your token has not expired and has correct permissions"
  );
  console.log("4. Try running with explicit environment variables:");
  console.log(
    "   DCT_API_URL=http://localhost:8055 DCT_TOKEN=your_token npx directus-ct export roles"
  );
}
