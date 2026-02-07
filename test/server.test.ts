import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server.js";
import { Logger } from "../src/logger.js";
import type { AppContext } from "../src/context.js";
import type { ServerConfig } from "../src/config.js";
import type { FastifyInstance } from "fastify";

const logger = new Logger("none");

const config: ServerConfig = {
  mcpServers: {},
  allowedCliTools: [],
  excludedFilePatterns: [],
  bodyLimit: 4 * 1024 * 1024,
  autoApprovePermissions: ["read", "mcp"],
};

const ctx: AppContext = {
  service: {} as AppContext["service"],
  logger,
  config,
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await createServer(ctx);
});

afterAll(async () => {
  await app.close();
});

describe("user-agent check", () => {
  it("allows requests with Xcode user-agent past the hook", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { "user-agent": "Xcode/24577 CFNetwork/3860.300.31 Darwin/25.2.0" },
    });
    expect(res.statusCode).not.toBe(403);
  });

  it("rejects requests without user-agent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects requests with non-Xcode user-agent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: { "user-agent": "curl/8.0" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Forbidden" });
  });
});
