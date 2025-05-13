# directus-config-toolkit

`directus-config-toolkit` is a simple command-line utility designed to facilitate the export and import of Directus configurations, including flows, roles, settings, and files. This tool enables efficient management and version control of Directus configurations, ensuring consistency across different environments.

## Features

- **Export Configurations**: Backup your Directus configurations for version control and disaster recovery.
- **Import Configurations**: Apply version-controlled configurations to new or existing Directus instances.
- **Environment Variable Support**: Configure the tool using environment variables for flexibility and security.
- **CI/CD Integration**: Seamlessly integrate with CI/CD pipelines to automate configuration management.
- **Validation & Troubleshooting**: Identify potential conflicts and issues before importing configurations.
- **Snapshots**: Create and compare snapshots to track changes between environments.

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
- `validate`: Check configuration files for potential import issues like duplicate IDs.

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

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Special thanks to the Directus community for the great work they're doing.
