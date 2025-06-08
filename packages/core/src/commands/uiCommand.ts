import { Command } from "commander";
import { exec, spawn } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { CONFIG_PATH } from "../helper";

export function registerUICommand(program: Command) {
  const uiCommand = program
    .command("ui")
    .description("Launch the Directus Config Toolkit UI using Docker");

  // UI launch command
  uiCommand
    .command("start")
    .description("Start the Directus Config Toolkit UI")
    .option("-p, --port <port>", "Port to run the UI on", "3000")
    .option("-t, --tag <tag>", "Docker image tag to use", "latest")
    .option("-n, --name <name>", "Container name", "dct-ui")
    .option("--no-pull", "Skip pulling the latest image")
    .action(async (options) => {
      try {
        console.log("Starting Directus Config Toolkit UI...");

        // Check if Docker is installed
        try {
          await execPromise("docker --version");
        } catch (error) {
          console.error("Docker is not installed or not in your PATH.");
          console.error(
            "Please install Docker to use the UI feature: https://docs.docker.com/get-docker/"
          );
          process.exit(1);
        }

        // Pull the latest image if not skipped
        if (options.pull) {
          console.log(`Pulling directus-config-toolkit-ui:${options.tag}...`);
          try {
            await execPromise(
              `docker pull ghcr.io/peter-olom/directus-config-toolkit-ui:${options.tag}`
            );
          } catch (error) {
            console.warn(
              "Failed to pull the latest image, will use local image if available."
            );
          }
        }

        // Stop existing container if running
        try {
          await execPromise(`docker stop ${options.name}`);
          await execPromise(`docker rm ${options.name}`);
        } catch (error) {
          // Container might not exist, that's fine
        }

        // Set up volume mounts for config and audit directories
        const configPath = CONFIG_PATH;
        const auditPath = process.env.DCT_AUDIT_PATH ?? "./audit";

        // Ensure directories exist
        if (!existsSync(configPath)) {
          console.warn(
            `Config directory ${configPath} does not exist. It will be created.`
          );
        }

        if (!existsSync(auditPath)) {
          console.warn(
            `Audit directory ${auditPath} does not exist. It will be created.`
          );
        }

        // Get environment variables
        const API_URL = process.env.DCT_API_URL ?? "http://localhost:8055";
        const TOKEN = process.env.DCT_TOKEN ?? "admin";
        const AUTH_SECRET =
          process.env.DCT_UI_AUTH_SECRET ??
          Buffer.from(
            Math.random().toString(36) + Date.now().toString(36)
          ).toString("base64");
        const UI_URL = `http://localhost:${options.port}`;
        const UI_USERNAME = process.env.DCT_UI_USERNAME ?? "admin";
        const UI_PASSWORD = process.env.DCT_UI_PASSWORD ?? "admin";

        // Start the container
        const dockerArgs = [
          "run",
          "--name",
          options.name,
          "-d",
          "-p",
          `${options.port}:3000`,
          // Environment variables
          "-e",
          `AUTH_SECRET="${AUTH_SECRET}"`,
          "-e",
          `DCT_UI_URL="${UI_URL}"`,
          "-e",
          `DCT_UI_USERNAME="${UI_USERNAME}"`,
          "-e",
          `DCT_UI_PASSWORD="${UI_PASSWORD}"`,
          "-e",
          `DCT_API_URL="${API_URL}"`,
          "-e",
          `DCT_TOKEN="${TOKEN}"`,
          "-e",
          "DCT_CONFIG_PATH=/app/config",
          "-e",
          "DCT_AUDIT_PATH=/app/audit",
          // Volume mounts
          "-v",
          `${resolve(configPath)}:/app/config`,
          "-v",
          `${resolve(auditPath)}:/app/audit`,
          `ghcr.io/peter-olom/directus-config-toolkit-ui:${options.tag}`,
        ];

        const dockerProcess = spawn("docker", dockerArgs, { stdio: "inherit" });

        dockerProcess.on("close", (code) => {
          if (code === 0) {
            console.log(
              `\n✅ UI started successfully! Access it at http://localhost:${options.port}`
            );
            console.log(`Container name: ${options.name}`);
            console.log(
              `To check status: dct ui status --name ${options.name}`
            );
            console.log(`To stop: dct ui stop --name ${options.name}`);
          } else {
            console.error(`Failed to start UI container (exit code: ${code})`);
          }
        });
      } catch (error) {
        console.error("Failed to start UI:", error);
        process.exit(1);
      }
    });

  // UI status command
  uiCommand
    .command("status")
    .description("Check the status of the Directus Config Toolkit UI container")
    .option("-n, --name <name>", "Container name", "dct-ui")
    .action(async (options) => {
      try {
        // Check if Docker is installed
        try {
          await execPromise("docker --version");
        } catch (error) {
          console.error("Docker is not installed or not in your PATH.");
          console.error(
            "Please install Docker to use the UI feature: https://docs.docker.com/get-docker/"
          );
          process.exit(1);
        }

        // Check container status
        try {
          const status = await execPromise(
            `docker inspect --format='{{.State.Status}}' ${options.name}`
          );
          const port = await execPromise(
            `docker inspect --format='{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}' ${options.name}`
          );

          console.log(`Container ${options.name} is ${status}`);

          if (status === "running") {
            console.log(`UI is accessible at http://localhost:${port}`);
            console.log(`To stop: dct ui stop --name ${options.name}`);
          } else {
            console.log(`To start: dct ui start --name ${options.name}`);
          }
        } catch (error) {
          console.log(`Container ${options.name} is not found.`);
          console.log(`To start: dct ui start --name ${options.name}`);
        }
      } catch (error) {
        console.error("Failed to check UI status:", error);
        process.exit(1);
      }
    });

  // UI stop command
  uiCommand
    .command("stop")
    .description("Stop the Directus Config Toolkit UI container")
    .option("-n, --name <name>", "Container name", "dct-ui")
    .action(async (options) => {
      try {
        // Check if Docker is installed
        try {
          await execPromise("docker --version");
        } catch (error) {
          console.error("Docker is not installed or not in your PATH.");
          console.error(
            "Please install Docker to use the UI feature: https://docs.docker.com/get-docker/"
          );
          process.exit(1);
        }

        // Stop container
        try {
          await execPromise(`docker stop ${options.name}`);
          console.log(`✅ Stopped UI container ${options.name}`);
        } catch (error) {
          console.log(
            `Container ${options.name} is not running or does not exist.`
          );
        }
      } catch (error) {
        console.error("Failed to stop UI:", error);
        process.exit(1);
      }
    });

  // UI logs command
  uiCommand
    .command("logs")
    .description("View logs from the Directus Config Toolkit UI container")
    .option("-n, --name <name>", "Container name", "dct-ui")
    .option("-f, --follow", "Follow log output", false)
    .action(async (options) => {
      try {
        // Check if Docker is installed
        try {
          await execPromise("docker --version");
        } catch (error) {
          console.error("Docker is not installed or not in your PATH.");
          console.error(
            "Please install Docker to use the UI feature: https://docs.docker.com/get-docker/"
          );
          process.exit(1);
        }

        // View logs
        const args = ["logs"];
        if (options.follow) args.push("-f");
        args.push(options.name);

        const dockerProcess = spawn("docker", args, { stdio: "inherit" });

        if (!options.follow) {
          dockerProcess.on("close", (code) => {
            if (code !== 0) {
              console.error(`Failed to get logs (exit code: ${code})`);
            }
          });
        }
      } catch (error) {
        console.error("Failed to get UI logs:", error);
        process.exit(1);
      }
    });

  return uiCommand;
}

function execPromise(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}
