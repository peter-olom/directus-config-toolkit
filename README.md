# directus-config-toolkit

`directus-config-toolkit` is a simple command-line utility designed to facilitate the export and import of Directus configurations, including flows, roles, settings, and files. This tool enables efficient management and version control of Directus configurations, ensuring consistency across different environments.

## Features

- **Export Configurations**: Backup your Directus configurations for version control and disaster recovery.
- **Import Configurations**: Apply version-controlled configurations to new or existing Directus instances.
- **Environment Variable Support**: Configure the tool using environment variables for flexibility and security.
- **CI/CD Integration**: Seamlessly integrate with CI/CD pipelines to automate configuration management.

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
- `import-all`: Imports all the configuration managed by this toolkit. It does this in a sequence that reduces chance of errors. This should be the goto choice when restoring on a new environment or in CI.

Replace `<type>` with one of the following configuration types:

- `flows`: Includes flows and operations.
- `roles`: Includes roles, policies, permissions, and access.
- `settings`: Includes global settings.
- `files`: Includes files and folders. Only items with the `shouldBackup` field set to `true` are backed up; ensure this field is added to the collection.
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

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

Special thanks to the Directus community for the great work they're doing.
