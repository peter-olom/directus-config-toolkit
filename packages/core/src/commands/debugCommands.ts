// Debug and environment check CLI commands
import { Command } from "commander";
import { printConfig, client } from "../helper";
import { readMe } from "@directus/sdk";
import checkEnvironment from "../utils/checkEnv";

export function registerDebugCommands(program: Command) {
  program
    .command("debug")
    .description("Debug connection and authentication issues")
    .action(async () => {
      try {
        printConfig();
        console.log("Performing additional diagnostics...");
        try {
          const response = await fetch(
            `${process.env.DCT_API_URL}/server/ping`
          );
          if (response.ok) {
            console.log("✅ Connection successful");
          } else {
            console.log(`❌ Connection failed with status: ${response.status}`);
          }
        } catch (error: any) {
          console.log(`❌ Connection failed: ${error.message}`);
          console.log(
            "Please check that the Directus server is running at the specified URL."
          );
          return;
        }
        try {
          await client.request(readMe());
          console.log(
            "✅ Authentication works - successfully retrieved current user"
          );
        } catch (error: any) {
          console.log("\n❌ Authentication test failed");
          console.log(`Error: ${error.message || "Unknown error"}`);
          if (error.response?.data) {
            console.log(
              "\nResponse data:",
              JSON.stringify(error.response.data, null, 2)
            );
          }
          console.log("\nTips:");
          console.log("1. Check that your token is valid and has not expired");
          console.log("2. Verify the API URL is correct and accessible");
          console.log("3. Make sure the token has sufficient permissions");
          console.log(
            "\nIf using a .env file, check that it's being loaded correctly:"
          );
          console.log("- File should be in the current working directory");
          console.log("- File should be named .env");
          console.log("- Variables should be in format: DCT_TOKEN=your_token");
        }
      } catch (error) {
        console.error("Debug check failed:", error);
        process.exit(1);
      }
    });

  program
    .command("debug-env")
    .description(
      "Run detailed environment checks to diagnose configuration issues"
    )
    .action(async () => {
      try {
        await checkEnvironment();
      } catch (error) {
        console.error("Environment check failed:", error);
        process.exit(1);
      }
    });
}
