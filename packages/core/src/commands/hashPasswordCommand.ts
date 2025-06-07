// Hash password CLI command
import { Command } from "commander";
import * as bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

export function registerHashPasswordCommand(program: Command) {
  program
    .command("hash-password")
    .description("Generate a secure hash for DCT_UI_PASSWORD")
    .option(
      "-p, --password <password>",
      "Password to hash (if not provided, will prompt)"
    )
    .option(
      "-o, --output <file>",
      "Output .env file to update with DCT_UI_PASSWORD"
    )
    .action(async (options) => {
      try {
        let password = options.password;
        if (!password) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          password = await new Promise((resolve) => {
            rl.question("Enter password to hash: ", (answer) => {
              rl.close();
              resolve(answer);
            });
          });
        }
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);
        console.log("\nHashed password:");
        console.log(hash);
        const escapedHash = hash.replace(/\$/g, "\\$");
        console.log("\nEscaped hash for .env files:");
        console.log(escapedHash);
        if (options.output) {
          const filePath = path.resolve(options.output);
          let content = "";
          if (fs.existsSync(filePath)) {
            content = fs.readFileSync(filePath, "utf8");
            if (content.includes("DCT_UI_PASSWORD=")) {
              content = content.replace(
                /DCT_UI_PASSWORD=.*/g,
                `DCT_UI_PASSWORD=${escapedHash}`
              );
            } else {
              content += `\nDCT_UI_PASSWORD=${escapedHash}`;
            }
          } else {
            content = `DCT_UI_PASSWORD=${escapedHash}`;
          }
          fs.writeFileSync(filePath, content);
          console.log(
            `\nUpdated ${filePath} with hashed password (with $ escaped)`
          );
        }
      } catch (error) {
        console.error("Password hashing failed:", error);
        process.exit(1);
      }
    });
}
