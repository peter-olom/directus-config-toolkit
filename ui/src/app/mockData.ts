// Mock data for the UI development until we connect to the API
import {
  ConfigStatus,
  ConfigType,
  DiffItem,
  DiffResult,
  SyncJob,
} from "./types";

// Mock configuration status data
export const mockConfigStatuses: ConfigStatus[] = [
  {
    type: "schema",
    filesCount: 12,
    lastSync: new Date(Date.now() - 86400000).toISOString(),
    status: "synced",
  },
  {
    type: "roles",
    filesCount: 5,
    lastSync: new Date(Date.now() - 172800000).toISOString(),
    status: "pending",
  },
  {
    type: "settings",
    filesCount: 8,
    lastSync: new Date(Date.now() - 259200000).toISOString(),
    status: "conflict",
  },
  {
    type: "files",
    filesCount: 24,
    lastSync: new Date(Date.now() - 345600000).toISOString(),
    status: "synced",
  },
  {
    type: "flows",
    filesCount: 7,
    lastSync: new Date(Date.now() - 432000000).toISOString(),
    status: "pending",
  },
];

// Mock diff items for schema changes
const schemaDiffItems: DiffItem[] = [
  {
    path: "schema.collections.users.fields.avatar",
    type: "modified",
    oldValue: { type: "string", max_length: 255 },
    newValue: { type: "string", max_length: 512 },
  },
  {
    path: "schema.collections.products.fields.price",
    type: "modified",
    oldValue: { type: "float" },
    newValue: { type: "decimal", precision: 10, scale: 2 },
  },
  {
    path: "schema.collections.orders",
    type: "added",
    newValue: {
      name: "orders",
      fields: {
        id: { type: "uuid", primary: true },
        user_id: { type: "uuid", references: "users.id" },
        total: { type: "decimal", precision: 10, scale: 2 },
        created_at: { type: "timestamp" },
      },
    },
  },
];

// Mock diff items for roles changes
const rolesDiffItems: DiffItem[] = [
  {
    path: "roles.admin.permissions.collections.users",
    type: "modified",
    oldValue: { create: true, read: true, update: true, delete: false },
    newValue: { create: true, read: true, update: true, delete: true },
  },
  {
    path: "roles.editor",
    type: "added",
    newValue: {
      name: "Editor",
      description: "Can edit content but not delete",
      permissions: {
        collections: {
          users: { create: false, read: true, update: true, delete: false },
          products: { create: true, read: true, update: true, delete: false },
        },
      },
    },
  },
];

// Mock diff results by config type
export const mockDiffResults: Record<ConfigType, DiffResult> = {
  schema: {
    type: "schema",
    differences: schemaDiffItems,
    timestamp: new Date().toISOString(),
  },
  roles: {
    type: "roles",
    differences: rolesDiffItems,
    timestamp: new Date().toISOString(),
  },
  settings: {
    type: "settings",
    differences: [
      {
        path: "settings.project_name",
        type: "modified",
        oldValue: "Directus Project",
        newValue: "My Directus Project",
      },
      {
        path: "settings.project_url",
        type: "modified",
        oldValue: "https://example.com",
        newValue: "https://myproject.com",
      },
    ],
    timestamp: new Date().toISOString(),
  },
  files: {
    type: "files",
    differences: [
      {
        path: "files.asset_123.metadata",
        type: "modified",
        oldValue: { width: 800, height: 600 },
        newValue: { width: 1200, height: 900 },
      },
      {
        path: "files.asset_456",
        type: "added",
        newValue: {
          id: "asset_456",
          filename: "new_image.jpg",
          type: "image/jpeg",
          filesize: 1024000,
        },
      },
    ],
    timestamp: new Date().toISOString(),
  },
  flows: {
    type: "flows",
    differences: [
      {
        path: "flows.notification_flow.triggers",
        type: "modified",
        oldValue: ["create.users"],
        newValue: ["create.users", "update.users"],
      },
      {
        path: "flows.import_data",
        type: "removed",
        oldValue: {
          id: "import_data",
          name: "Import CSV Data",
          triggers: ["manual"],
          operations: ["parse_csv", "insert_records"],
        },
      },
    ],
    timestamp: new Date().toISOString(),
  },
};

// Mock sync jobs
export const mockSyncJobs: SyncJob[] = [
  {
    id: "job-123",
    type: "schema",
    direction: "export",
    status: "completed",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3590000).toISOString(),
  },
  {
    id: "job-456",
    type: "roles",
    direction: "import",
    status: "running",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "job-789",
    type: "settings",
    direction: "import",
    status: "failed",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    completedAt: new Date(Date.now() - 7195000).toISOString(),
    error: "Access denied for setting project_url",
  },
  {
    id: "job-101",
    type: "files",
    direction: "export",
    status: "pending",
    createdAt: new Date().toISOString(),
  },
];

// Function to simulate API delay
export const simulateApiDelay = async (ms: number = 500) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
