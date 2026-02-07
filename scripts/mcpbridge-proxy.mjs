#!/usr/bin/env node

/**
 * MCP stdio proxy for Apple's `xcrun mcpbridge`.
 *
 * mcpbridge declares output schemas on its tools but returns
 * results via the `content` field (text array) without the corresponding
 * `structuredContent` field that the MCP spec requires. The Copilot CLI
 * enforces this strictly and rejects the response with error -32600.
 *
 * So, intercept every JSON-RPC response from mcpbridge. When a response
 * carries `content` but no `structuredContent`, synthesise it from the
 * first text content item — parsing as JSON when possible, falling back
 * to a `{ text }` wrapper otherwise.
 * 
 * Source: https://rudrank.com/exploring-xcode-using-mcp-tools-cursor-external-clients
 */

import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function patchIfNeeded(msg) {
  const result = msg.result;
  if (!result || typeof result !== "object") return;
  if (!Array.isArray(result.content) || result.content.length === 0) return;
  if (result.structuredContent !== undefined) return;

  const textItem = result.content.find((c) => c.type === "text");
  if (!textItem?.text) return;

  try {
    result.structuredContent = JSON.parse(textItem.text);
  } catch {
    result.structuredContent = { text: textItem.text };
  }
}

try {
  await execFileAsync("xcrun", ["--find", "mcpbridge"]);
} catch (err) {
  console.error(
    "Error: xcrun mcpbridge not found. This requires Xcode 26.3 or later."
  );
  console.error(
    "Please install Xcode 26.3+ or remove the 'xcode' MCP server from config.json5"
  );
  process.exit(1);
}

const bridge = spawn("xcrun", ["mcpbridge", ...process.argv.slice(2)], {
  stdio: ["pipe", "pipe", "inherit"],
});

process.stdin.pipe(bridge.stdin);

const reader = createInterface({ input: bridge.stdout, crlfDelay: Infinity });

reader.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    patchIfNeeded(msg);
    process.stdout.write(JSON.stringify(msg) + "\n");
  } catch {
    process.stdout.write(line + "\n");
  }
});

bridge.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => bridge.kill("SIGTERM"));
process.on("SIGINT", () => bridge.kill("SIGINT"));
