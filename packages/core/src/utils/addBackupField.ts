import { createField, readFieldsByCollection } from "@directus/sdk";
import { client } from "../helper";

export interface AddBackupFieldOptions {
  fieldName?: string;
  dryRun?: boolean;
}

export async function addBackupFieldToCollections({
  fieldName = "should_backup",
  dryRun = false,
}: AddBackupFieldOptions = {}) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
    throw new Error(
      "Invalid field name. Field name must start with a letter and contain only letters, numbers, and underscores."
    );
  }

  const collections = ["directus_files", "directus_folders"];
  let successCount = 0;
  let skipCount = 0;

  for (const collection of collections) {
    console.log(
      `\n${dryRun ? "[DRY RUN] " : ""}Processing collection: ${collection}`
    );
    // Use SDK to get fields for the collection
    const result = await client.request(readFieldsByCollection(collection));
    const existingField = result.find(
      ({ field }) =>
        field === fieldName ||
        field === "shouldBackup" ||
        field === "should_backup"
    );
    if (existingField) {
      console.log(
        `  ✓ Backup field already exists: '${
          existingField.field || existingField
        }' in ${collection}`
      );
      skipCount++;
      continue;
    }
    if (dryRun) {
      console.log(`  → Would create field '${fieldName}' in ${collection}`);
      continue;
    }
    try {
      await client.request(
        createField(collection, {
          field: fieldName,
          type: "boolean",
          schema: {
            name: fieldName,
            table: collection,
            data_type: "boolean",
            default_value: false,
            is_nullable: true,
            comment: "Mark for backup/export with DCT",
          },
          meta: {
            field: fieldName,
            collection,
            interface: "boolean",
            options: { label: "Should Backup" },
            display: "boolean",
            display_options: {},
            readonly: false,
            hidden: false,
            sort: null,
            width: "half",
            translations: [],
            note: "Check this box to include this item in DCT backups",
            conditions: [],
            required: false,
            group: null,
            validation: null,
            validation_message: null,
          },
        })
      );
      console.log(`  ✓ Created field '${fieldName}' in ${collection}`);
      successCount++;
    } catch (error: any) {
      console.error(
        `  ✗ Failed to create field in ${collection}:`,
        error.response?.data?.errors || error.message
      );
      if (error.response?.status === 403) {
        console.error(
          "    Make sure your API token has permission to modify collection fields."
        );
      }
    }
  }

  if (dryRun) {
    console.log(
      "\n[DRY RUN] No changes were made. Run without --dry-run to apply changes."
    );
  } else if (successCount > 0) {
    console.log(
      `\n✅ Backup field setup complete! (${successCount} created, ${skipCount} already existed)`
    );
    console.log(
      `You can now use 'dct export files' and 'dct import files' with the '${fieldName}' field.`
    );
    console.log("\nNext steps:");
    console.log("1. Go to your Directus admin panel");
    console.log("2. Navigate to Files & Folders");
    console.log(
      `3. Check the '${fieldName}' field for items you want to backup`
    );
    console.log("4. Run 'dct export files' to backup marked items");
  } else if (skipCount === collections.length) {
    console.log("\n✅ Backup fields already exist in all collections!");
  } else {
    console.log("\n⚠️  No fields were created. Check the errors above.");
  }
}
