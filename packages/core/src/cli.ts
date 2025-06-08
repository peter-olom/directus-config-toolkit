#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { registerConfigCommands } from "./commands/configCommands";
import { registerAuditCommands } from "./commands/auditCommands";
import { registerDebugCommands } from "./commands/debugCommands";
import { registerHashPasswordCommand } from "./commands/hashPasswordCommand";
import { registerUICommand } from "./commands/uiCommand";
import pkg from "../package.json";

const program = new Command();

program
  .name("directus-config-toolkit")
  .description("CLI tool for managing Directus configurations")
  .version(pkg.version);

// Register command groups
registerConfigCommands(program);
registerAuditCommands(program);
registerDebugCommands(program);
registerHashPasswordCommand(program);
registerUICommand(program);

program.parse();
