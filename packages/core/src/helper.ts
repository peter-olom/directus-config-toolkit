import { createDirectus, rest, staticToken } from "@directus/sdk";
import axios from "axios";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";

const API_URL = process.env.DCT_API_URL ?? "http://localhost:8055";
const TOKEN = process.env.DCT_TOKEN ?? "admin";

export const CONFIG_PATH = process.env.DCT_CONFIG_PATH ?? "./config";

export const client = createDirectus(API_URL)
  .with(staticToken(TOKEN))
  .with(rest());

// Utility function for REST calls using Axios
export const callDirectusAPI = async <T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  data?: any,
  retries = 3
) => {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data: res } = await axios({
        url: `${API_URL}/${endpoint}`,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        data,
      });
      return res?.data as T;
    } catch (error: any) {
      lastError = error;

      // Log the error details for debugging
      console.error(
        `API call failed (attempt ${attempt}/${retries}):`,
        error.response?.data?.errors || error.message || error
      );

      // Some errors shouldn't be retried
      if (
        error.response?.status === 403 ||
        error.response?.status === 400 ||
        error.response?.status === 422
      ) {
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

export const ensureConfigDirs = () => {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(CONFIG_PATH, { recursive: true });
  }
  const assetsPath = join(CONFIG_PATH, "assets");
  if (!existsSync(assetsPath)) {
    mkdirSync(assetsPath, { recursive: true });
  }
};

export const downloadFile = async (file: Record<string, any>, retries = 3) => {
  const url = `${API_URL}/assets/${file.id}?download`;
  const filePath = join(CONFIG_PATH, "assets", file.filename_disk);

  // Ensure the filename is valid for the filesystem
  const safeDiskName = file.filename_disk.replace(/[<>:"/\\|?*]/g, "_");
  const safeFilePath = join(CONFIG_PATH, "assets", safeDiskName);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `Downloading file: ${file.filename_download} (${file.id}) - attempt ${attempt}/${retries}`
      );

      const response = await axios.get(url, {
        responseType: "stream",
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 30000, // 30 seconds timeout
      });

      const writer = response.data.pipe(createWriteStream(safeFilePath));

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", (err: Error) => {
          console.error(`Error writing file ${safeDiskName}:`, err);
          reject(err);
        });
      });

      console.log(`Successfully downloaded: ${file.filename_download}`);
      return;
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.errors || error.message || JSON.stringify(error);
      console.error(
        `Failed to download file ${file.id} (attempt ${attempt}/${retries}):`,
        errorMsg
      );

      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `All attempts failed for file ${file.id} (${file.filename_download})`
        );
      }
    }
  }
};

/**
 * Print configuration details including environment variables
 * and connection information for debugging
 */
export function printConfig() {
  console.log("=== Directus Config Toolkit Configuration ===");
  console.log(`API URL: ${API_URL}`);
  console.log(
    `Token: ${TOKEN.substring(0, 4)}...${TOKEN.substring(TOKEN.length - 4)}`
  );
  console.log(`Config path: ${CONFIG_PATH}`);

  // Show environment variables
  console.log("\nEnvironment Variables:");
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

  // Debug information about Node.js
  console.log("\nNode.js Environment:");
  console.log(`Node version: ${process.version}`);
  console.log(`Process CWD: ${process.cwd()}`);

  // Test connection
  console.log("\nTesting connection...");
  axios({
    url: `${API_URL}/server/ping`,
    method: "GET",
    timeout: 5000, // 5 second timeout
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  })
    .then(() => {
      console.log("✅ Connection successful");
    })
    .catch((error) => {
      console.log("❌ Connection failed");
      console.log(`Status: ${error.response?.status || "Unknown"}`);
      console.log(`Message: ${error.message || "Unknown error"}`);
      if (error.response?.data) {
        console.log("Response data:", error.response.data);
      }
    });
}

export const restFileUpload = async (
  formData: FormData,
  update?: string,
  retries = 3
) => {
  const method = update ? "patch" : "post";
  const url = update ? `${API_URL}/files/${update}` : `${API_URL}/files`;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `${update ? "Updating" : "Uploading"} file${
          update ? " " + update : ""
        } - attempt ${attempt}/${retries}`
      );

      const { data } = await axios[method](url, formData, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000, // 60 seconds timeout
        maxBodyLength: Infinity, // Handle large files
        maxContentLength: Infinity,
      });

      console.log(
        `File ${update ? "update" : "upload"} successful${
          update ? " for " + update : ""
        }`
      );
      return data;
    } catch (error: any) {
      lastError = error;

      // Format error message for better debugging
      const errorMsg = error.response?.data?.errors
        ? JSON.stringify(error.response.data.errors)
        : error.message || JSON.stringify(error);

      console.error(
        `File ${
          update ? "update" : "upload"
        } failed (attempt ${attempt}/${retries}):`,
        errorMsg
      );

      // Some errors shouldn't be retried
      if (
        error.response?.status === 400 ||
        error.response?.status === 422 ||
        error.response?.data?.errors?.[0]?.extensions?.code ===
          "RECORD_NOT_UNIQUE"
      ) {
        console.error(`Non-retriable error encountered. Stopping retries.`);
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Extract a meaningful error message from various error types
 * @param error Any error that might be thrown during API calls
 * @returns A clean, readable error message
 */
export function extractErrorMessage(error: any): string {
  if (!error) return "Unknown error";

  // Handle Directus API error responses
  if (error.response && error.response.data) {
    const { errors } = error.response.data;

    if (Array.isArray(errors) && errors.length > 0) {
      // Format Directus API error
      return errors
        .map((e) => e.message || e.extensions?.code || JSON.stringify(e))
        .join(", ");
    }

    // Handle SQL error messages that might be in the response
    if (
      error.response.data.message &&
      error.response.data.message.includes("FOREIGN KEY constraint")
    ) {
      return `Foreign key constraint error: ${extractConstraintName(
        error.response.data.message
      )}`;
    }

    // Other response data
    if (error.response.data.message) {
      return error.response.data.message;
    }

    return JSON.stringify(error.response.data);
  }

  // Handle standard error objects
  if (error.message) {
    return error.message;
  }

  // As a fallback, stringify the error
  return typeof error === "string" ? error : JSON.stringify(error);
}

/**
 * Extract constraint name from SQL error messages
 */
function extractConstraintName(message: string): string {
  // Match patterns like "The constraint 'xyz_constraint' was violated"
  const constraintMatch = message.match(/constraint ['"]([^'"]+)['"]/i);

  if (constraintMatch && constraintMatch[1]) {
    return constraintMatch[1];
  }

  // Return the original message if no match found
  return message;
}

/**
 * Retry a function call with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000,
  verbose = false
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }

    if (verbose) {
      console.log(
        `Operation failed, retrying in ${delay}ms... (${retries} retries left)`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delay));

    return retryOperation(operation, retries - 1, delay * 2, verbose);
  }
}
