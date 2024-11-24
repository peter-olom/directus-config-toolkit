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
  data?: any
) => {
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
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
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
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "stream",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const writer = response.data.pipe(createWriteStream(filePath));
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      break;
    } catch (error) {
      if (attempt === retries) {
        console.error(`Failed to download file ${file.id}`);
      }
    }
  }
};

export const printConfig = () => {
  console.log(`API URL: ${API_URL}`);
  console.log(`API Token: ${TOKEN}`);
  console.log(`Config Path: ${CONFIG_PATH}`);
};

export const restFileUpload = async (formData: FormData, update?: string) => {
  const method = update ? "patch" : "post";
  const url = update ? `${API_URL}/files/${update}` : `${API_URL}/files`;
  try {
    const { data } = await axios[method](url, formData, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  } catch (error) {
    console.error("File upload failed:", error);
    throw error;
  }
};
