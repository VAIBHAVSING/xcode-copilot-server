import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer } from "../../src/server.js";
import { anthropicProvider } from "../../src/providers/anthropic.js";
import { Logger } from "../../src/logger.js";
import type { AppContext } from "../../src/context.js";
import type { ServerConfig } from "../../src/config.js";
import type { FastifyInstance } from "fastify";

const logger = new Logger("none");

const config: ServerConfig = {
  toolBridge: null,
  mcpServers: {},
  allowedCliTools: [],
  excludedFilePatterns: [],
  bodyLimit: 4 * 1024 * 1024,
  autoApprovePermissions: true,
};

const claudeCliHeaders = { "user-agent": "claude-cli/2.1.14 (external, sdk-cli)" };

function makePayload(model = "claude-sonnet-4-20250514") {
  return {
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  };
}

describe("Concurrent request handling", () => {
  let app: FastifyInstance;
  let createSessionSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const createMockSession = () => ({
      on: (callback: (event: { type: string; data: unknown }) => void) => {
        queueMicrotask(() => {
          callback({ type: "session.idle", data: {} });
        });
        return () => {};
      },
      send: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    });

    createSessionSpy = vi.fn().mockImplementation(async () => {
      // Both requests must be in-flight at the same time to test concurrency.
      await new Promise((r) => setTimeout(r, 10));
      return createMockSession();
    });

    const mockService = {
      cwd: "/test",
      listModels: vi.fn().mockResolvedValue([
        {
          id: "claude-sonnet-4-20250514",
          name: "claude-sonnet-4-20250514",
          capabilities: {
            supports: { vision: false, reasoningEffort: false },
            limits: { max_context_window_tokens: 200000 },
          },
        },
      ]),
      createSession: createSessionSpy,
    };

    const ctx: AppContext = {
      service: mockService as unknown as AppContext["service"],
      logger,
      config,
      port: 8080,
    };

    app = await createServer(ctx, anthropicProvider);
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates separate sessions for concurrent requests", async () => {
    // For example if Xcode sends the main prompt and background git analysis 
    // concurrently.
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/messages",
        headers: claudeCliHeaders,
        payload: makePayload(),
      }),
      app.inject({
        method: "POST",
        url: "/v1/messages",
        headers: claudeCliHeaders,
        payload: makePayload(),
      }),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.body).toContain("event: message_start");
    expect(res2.body).toContain("event: message_start");

    expect(createSessionSpy).toHaveBeenCalledTimes(2);

    const config1 = createSessionSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const config2 = createSessionSpy.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(config1).toBeDefined();
    expect(config2).toBeDefined();
  });

  it("does not misroute a new request as a continuation", async () => {
    createSessionSpy.mockClear();

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/messages",
        headers: claudeCliHeaders,
        payload: makePayload(),
      }),
      app.inject({
        method: "POST",
        url: "/v1/messages",
        headers: claudeCliHeaders,
        payload: makePayload(),
      }),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(createSessionSpy).toHaveBeenCalledTimes(2);
  });
});
