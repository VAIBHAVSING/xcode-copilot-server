#!/usr/bin/env node

/**
 * MCP stdio server that proxies Xcode's tool definitions and tool calls
 * through the Fastify server's internal endpoints.
 *
 * The Copilot CLI spawns this process as an MCP server. When the model
 * requests a tool call, the CLI routes it here. We forward the call to
 * the Fastify server (which holds the connection open until Xcode
 * provides the result), then return the result to the CLI.
 */

import { createInterface } from "node:readline";

const PORT = process.env.MCP_SERVER_PORT ?? "8080";
const BASE = `http://127.0.0.1:${PORT}`;

function log(msg) {
  process.stderr.write(`[mcp-passthrough] ${msg}\n`);
}

log(`Starting, port=${PORT}`);

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleInitialize(id) {
  log("initialize");
  respond(id, {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "xcode-passthrough", version: "1.0.0" },
  });
}

async function handleToolsList(id) {
  log("tools/list requested");
  try {
    const res = await fetch(`${BASE}/internal/tools`);
    if (!res.ok) {
      log(`tools/list failed: ${res.status}`);
      respondError(id, -32603, `Failed to fetch tools: ${res.status}`);
      return;
    }
    const tools = await res.json();
    log(`tools/list returning ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
    respond(id, { tools });
  } catch (err) {
    log(`tools/list error: ${err.message}`);
    respondError(id, -32603, `Failed to fetch tools: ${err.message}`);
  }
}

async function handleToolsCall(id, params) {
  const argsPreview = JSON.stringify(params.arguments ?? {}).slice(0, 200);
  log(`tools/call: name="${params.name}", args=${argsPreview}`);
  try {
    const res = await fetch(`${BASE}/internal/tool-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        arguments: params.arguments ?? {},
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      log(`tools/call failed: ${res.status} ${text}`);
      respondError(id, -32603, `Tool call failed: ${res.status} ${text}`);
      return;
    }

    const result = await res.json();
    const contentPreview = (result.content ?? "").slice(0, 200);
    log(`tools/call result for "${params.name}": ${contentPreview}`);
    respond(id, {
      content: [{ type: "text", text: result.content ?? "" }],
    });
  } catch (err) {
    log(`tools/call error for "${params.name}": ${err.message}`);
    respondError(id, -32603, `Tool call failed: ${err.message}`);
  }
}

const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });

reader.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log(`Failed to parse line: ${line.slice(0, 200)}`);
    return;
  }

  const { id, method, params } = msg;
  log(`<-- method="${method}", id=${id}`);

  switch (method) {
    case "initialize":
      handleInitialize(id);
      break;
    case "notifications/initialized":
      // Notification — no response needed
      break;
    case "tools/list":
      handleToolsList(id);
      break;
    case "tools/call":
      handleToolsCall(id, params ?? {});
      break;
    default:
      if (id !== undefined) {
        respondError(id, -32601, `Method not found: ${method}`);
      }
      break;
  }
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
