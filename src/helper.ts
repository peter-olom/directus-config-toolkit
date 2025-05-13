import { createDirectus, rest, staticToken } from "@directus/sdk";
import axios from "axios";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";

const API_URL = process.env.DIRECTUS_CT_URL ?? "http://localhost:8055";
const TOKEN = process.env.DIRECTUS_CT_TOKEN ?? "admin";

export const CONFIG_PATH = process.env.DIRECTUS_CT_CONFIG_PATH ?? "./config";

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

export const printConfig = () => {
  console.log(`API URL: ${API_URL}`);
  console.log(`API Token: ${TOKEN}`);
  console.log(`Config Path: ${CONFIG_PATH}`);
};

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
