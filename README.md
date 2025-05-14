# directus-config-toolkit

`directus-config-toolkit` is a simple command-line utility designed to facilitate the export and import of Directus configurations, including flows, roles, settings, and files. This tool enables efficient management and version control of Directus configurations, ensuring consistency across different environments.

## Features

- **Export Configurations**: Backup your Directus configurations for version control and disaster recovery.
- **Import Configurations**: Apply version-controlled configurations to new or existing Directus instances.
- **Environment Variable Support**: Configure the tool using environment variables for flexibility and security.
- **CI/CD Integration**: Seamlessly integrate with CI/CD pipelines to automate configuration management.
- **Validation & Troubleshooting**: Identify potential conflicts and issues before importing configurations.
- **Snapshots**: Create and compare snapshots to track changes between environments.
- **Dashboard UI**: A web interface for managing and monitoring your Directus configurations.

## Installation

You can install `directus-config-toolkit` globally using npm:

```bash
npm install -g directus-config-toolkit
```

Alternatively, add it to your project's dependencies:

```bash
npm install directus-config-toolkit --save-dev
```

## Usage

After installation, the tool provides several commands to manage your Directus configurations.

### Environment Variables

Set the following environment variables to configure the tool:

- `DIRECTUS_CT_URL`: The URL of your Directus instance.
- `DIRECTUS_CT_TOKEN`: The API token for authentication.
- `DIRECTUS_CT_CONFIG_PATH`: The path to your configuration files (defaults to `./config`).
- `DIRECTUS_CT_API_PORT`: The port for the dashboard API server (defaults to `3001`).

You can set these variables in your shell or define them in a `.env` file in your project root.

### Commands

The toolkit supports the following commands:

- `export <type>`: Export the specified configuration type.
- `import <type>`: Import the specified configuration type.
- `config`: Display the current API token and URL from the environment variables.
- `export-all`: Exports all the configuration managed by this toolkit.
- `import-all`: Imports all the configuration managed by this toolkit. It does this in a sequence that reduces chance of errors.
  - Use `--continue-on-error` flag to continue the import sequence even if one type fails.
- `snapshot create`: Create a snapshot of the current Directus instance state.
- `snapshot compare`: Compare the current snapshot with configuration files to identify differences.
- `snapshot roles`: Check role identities between environments to identify roles that need mapping.
- `validate`: Check configuration files for potential import issues like duplicate IDs.
- `dashboard`: Start the dashboard web interface for managing configurations.

Replace `<type>` with one of the following configuration types:

- `flows`: Includes flows and operations.
- `roles`: Includes roles, policies, permissions, and access.
- `settings`: Includes global settings.
- `files`: Includes files and folders. Only items with the `shouldBackup` or `should_backup` field set to `true` are backed up; ensure this field is added to the collection.
- `schema`: Includes collects and all their fields

### Examples

Export flows configuration:

```bash
directus-ct export flows
```

Import roles configuration:

```bash
directus-ct import roles
```

Display current configuration:

```bash
directus-ct config
```

## Dashboard

The dashboard provides a web interface for managing and monitoring your Directus configurations. It offers:

- Visual representation of configuration status
- Diff viewer to see changes before importing/exporting
- Job history tracking
- Easy import/export functionality

### Starting the Dashboard

To start the dashboard, run:

```bash
npx directus-ct dashboard
```

Or if installed globally:

```bash
directus-ct dashboard
```

The dashboard will be available at `http://localhost:3001` by default.

### Docker

You can also run the dashboard in Docker:

```bash
docker run -p 3001:3001 \
  -e DIRECTUS_CT_URL=http://your-directus-url \
  -e DIRECTUS_CT_TOKEN=your_token \
  -v /path/to/config:/app/config \
  devrue/directus-config-toolkit:latest dashboard
```

### Dashboard Environment Variables

- `DIRECTUS_CT_API_PORT`: Port for the dashboard API server (default: 3001)
- `DIRECTUS_CT_URL`: URL of your Directus instance
- `DIRECTUS_CT_TOKEN`: API token for authentication
- `DIRECTUS_CT_CONFIG_PATH`: Path to your configuration files

## Troubleshooting

If you encounter issues during the import process, try the following steps:

### Duplicate ID Errors

If you see errors like:

```
Value for field "id" in collection "directus_folders" has to be unique.
```

Run the validation command to identify duplicate IDs:

```bash
directus-ct validate
```

Fix any duplicate IDs in your configuration files before importing again.

### Foreign Key Constraint Issues

If you see errors related to foreign key constraints like:

```
The UPDATE statement conflicted with the FOREIGN KEY constraint "directus_settings_public_registration_role_foreign"
```

This usually means you're trying to import settings that reference roles or other entities that don't exist yet. Try:

1. Make sure to import roles before settings: The tool now imports in a sequence that should prevent this issue.
2. Check that all referenced roles actually exist in your roles.json file.
3. Use the snapshot and compare features to identify discrepancies:

```bash
directus-ct snapshot create
directus-ct snapshot compare
```

### Special Role Handling

The toolkit has enhanced handling for special roles:

#### Administrator Roles

- Administrator roles (with `admin_access: true`) are automatically excluded from backup/import process
- This prevents accidentally overwriting critical admin roles between environments
- The toolkit identifies admin roles during export and skips them during import

#### Public Role

- The Public role often has different IDs between environments but needs to be treated as the same role
- The toolkit automatically identifies Public roles by name and icon properties
- During import, it maps Public roles between environments by these characteristics, not by ID
- This ensures permissions and settings referencing the Public role are correctly preserved between environments

#### Role Import Safety

- Only non-admin roles from the source environment are imported
- Admin roles in the target environment are never deleted
- Duplicate detection ensures roles don't get created redundantly
- Detailed logging shows which roles are being processed, updated, or skipped

### Order of Import

The tool imports configurations in the following sequence to minimize dependency issues:

1. Schema
2. Roles (and related permissions/policies)
3. Files (and folders)
4. Settings
5. Flows

### Advanced Troubleshooting

For more detailed debugging:

1. Enable verbose logging by setting `DEBUG=1` in your environment variables
2. Use the snapshot comparison feature to identify differences between environments
3. Check the snapshot diff files in the `config/snapshot` directory for detailed information

### Error Handling Improvements

The toolkit now includes enhanced error handling mechanisms:

- **Detailed Error Messages**: Each component provides specific error information rather than generic failure messages
- **Role Identity Validation**: Use `snapshot roles` to check for role identity issues between environments
- **Import Component Isolation**: Each part of the import process (roles, policies, access, permissions) runs separately, showing specific success/failure for each
- **Retry Mechanism**: Critical operations include automatic retries with exponential backoff for better resilience
- **Foreign Key Detection**: The tool detects and reports foreign key constraint issues with helpful suggestions

Example of improved error reporting:

```
=== Role Import Summary ===
✅ roles: Roles imported successfully
✅ policies: Policies imported successfully
✅ access: Access entries imported successfully
❌ permissions: Foreign key constraint error: directus_permissions_role_foreign
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Special thanks to the Directus community for the great work they're doing.
