#!/usr/bin/env node
import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Command } from "commander";
import { CopilotService } from "./copilot-service.js";
import { loadConfig, resolveConfigPath } from "./config.js";
import { createServer } from "./server.js";
import { Logger } from "./logger.js";
import { providers } from "./providers/index.js";
import type { AppContext } from "./context.js";
import { patchSettings, restoreSettings } from "./settings-patcher.js";
import {
  parsePort,
  parseLogLevel,
  parseProxy,
  validateAutoPatch,
} from "./cli-validators.js";
import { bold, dim, createSpinner, printBanner } from "./ui.js";

const PACKAGE_ROOT = dirname(import.meta.dirname);
const DEFAULT_CONFIG_PATH = join(PACKAGE_ROOT, "config.json5");

interface StartOptions {
  port: string;
  proxy: string;
  logLevel: string;
  config?: string;
  cwd?: string;
  autoPatch?: true;
}

async function startServer(options: StartOptions): Promise<void> {
  const logLevel = parseLogLevel(options.logLevel);
  const logger = new Logger(logLevel);
  const port = parsePort(options.port);
  const proxy = parseProxy(options.proxy);

  const autoPatch = options.autoPatch === true;
  validateAutoPatch(proxy, autoPatch);

  const provider = providers[proxy];

  const configPath = options.config ?? resolveConfigPath(options.cwd, process.cwd(), DEFAULT_CONFIG_PATH);
  const config = await loadConfig(configPath, logger, proxy);
  const cwd = options.cwd;

  const service = new CopilotService({
    logLevel,
    logger,
    cwd,
  });

  const quiet = logLevel === "none";

  if (!quiet) {
    console.log();
    console.log(`  ${bold("xcode-copilot-server")} ${dim(`v${version}`)}`);
    console.log();
  }

  const bootSpinner = quiet ? null : createSpinner("Starting Copilot SDK...");
  await service.start();
  bootSpinner?.succeed("Copilot SDK started");

  const authSpinner = quiet ? null : createSpinner("Authenticating...");
  const auth = await service.getAuthStatus();
  if (!auth.isAuthenticated) {
    authSpinner?.fail("Not authenticated");
    logger.error(
      "Sign in with the Copilot CLI (copilot login) or GitHub CLI (gh auth login), or set a GITHUB_TOKEN environment variable.",
    );
    await service.stop();
    process.exit(1);
  }
  const login = auth.login ?? "unknown";
  const authType = auth.authType ?? "unknown";
  authSpinner?.succeed(`Authenticated as ${bold(login)} ${dim(`(${authType})`)}`);

  if (autoPatch) {
    await patchSettings({ port, logger });
  }

  const ctx: AppContext = { service, logger, config, port };
  const app = await createServer(ctx, provider);
  const listenSpinner = quiet ? null : createSpinner(`Starting server on port ${String(port)}...`);
  const prevPinoLevel = app.log.level;
  app.log.level = "silent";
  await app.listen({ port, host: "127.0.0.1" });
  app.log.level = prevPinoLevel;
  listenSpinner?.succeed(`Listening on ${bold(`http://localhost:${String(port)}`)}`);

  if (!quiet) {
    printBanner({
      port,
      proxy,
      providerName: provider.name,
      routes: provider.routes,
      cwd: service.cwd,
      autoPatch,
    });
  }

  logger.debug(`Config loaded from ${configPath}`);
  const mcpCount = Object.keys(config.mcpServers).length;
  const cliToolsSummary = config.allowedCliTools.includes("*")
    ? "all CLI tools allowed"
    : `${String(config.allowedCliTools.length)} allowed CLI tool(s)`;
  logger.debug(`${String(mcpCount)} MCP server(s), ${cliToolsSummary}`);

  const shutdown = async (signal: string) => {
    logger.info(`Got ${signal}, shutting down...`);

    if (autoPatch) {
      try {
        await restoreSettings({ logger });
      } catch (err) {
        logger.error(`Failed to restore settings.json: ${String(err)}`);
      }
    }

    await app.close();

    const stopPromise = service.stop().then(() => {
      logger.info("Clean shutdown complete");
    });
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.warn("Copilot client didn't stop in time, forcing exit");
        resolve();
      }, 3000),
    );

    await Promise.race([stopPromise, timeoutPromise]);
    process.exit(0);
  };

  const onSignal = (signal: string) => {
    shutdown(signal).catch((err: unknown) => {
      console.error("Shutdown error:", err);
      process.exit(1);
    });
  };
  process.on("SIGINT", () => { onSignal("SIGINT"); });
  process.on("SIGTERM", () => { onSignal("SIGTERM"); });
}

interface PatchOptions {
  port: string;
  logLevel: string;
}

async function patchSettingsCommand(options: PatchOptions): Promise<void> {
  const logLevel = parseLogLevel(options.logLevel);
  const logger = new Logger(logLevel);
  const port = parsePort(options.port);

  await patchSettings({ port, logger });
}

interface RestoreOptions {
  logLevel: string;
}

async function restoreSettingsCommand(options: RestoreOptions): Promise<void> {
  const logLevel = parseLogLevel(options.logLevel);
  const logger = new Logger(logLevel);

  await restoreSettings({ logger });
}

// Can't use JSON import because rootDir is src/ and package.json is at the project root.
const { version } = z.object({ version: z.string() }).parse(
  JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf-8")),
);

const program = new Command()
  .name("xcode-copilot-server")
  .description("Proxy API server for Xcode, powered by GitHub Copilot")
  .version(version, "-v, --version");

program
  .option("-p, --port <number>", "port to listen on", "8080")
  .option("--proxy <provider>", "API format: openai, anthropic", "openai")
  .option("-l, --log-level <level>", "log verbosity", "info")
  .option("-c, --config <path>", "path to config file")
  .option("--cwd <path>", "working directory for Copilot sessions")
  .option("--auto-patch", "auto-patch settings.json on start, restore on exit")
  .action((options: StartOptions) => startServer(options));

program
  .command("patch-settings")
  .description("Patch settings.json to point to this server, then exit")
  .option("-p, --port <number>", "port to write into settings.json", "8080")
  .option("-l, --log-level <level>", "log verbosity", "info")
  .action((options: PatchOptions) => patchSettingsCommand(options));

program
  .command("restore-settings")
  .description("Restore settings.json from backup, then exit")
  .option("-l, --log-level <level>", "log verbosity", "info")
  .action((options: RestoreOptions) => restoreSettingsCommand(options));

program.parseAsync().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
