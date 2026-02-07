import { describe, it, expect } from "vitest";
import { createSessionConfig } from "../../../src/handlers/completions/session-config.js";
import { Logger } from "../../../src/logger.js";
import type { ServerConfig } from "../../../src/config.js";

const baseConfig: ServerConfig = {
  mcpServers: {},
  allowedCliTools: [],
  excludedFilePatterns: [],
  bodyLimit: 4 * 1024 * 1024,
  autoApprovePermissions: true,
};

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return { ...baseConfig, ...overrides };
}

const logger = new Logger("none");

describe("createSessionConfig", () => {
  it("sets model and streaming options", () => {
    const config = createSessionConfig({
      model: "claude-sonnet-4-5-20250929",
      logger,
      config: makeConfig(),
      supportsReasoningEffort: false,
    });
    expect(config.model).toBe("claude-sonnet-4-5-20250929");
    expect(config.streaming).toBe(true);
    expect(config.infiniteSessions).toEqual({ enabled: true });
  });

  it("includes systemMessage when provided", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      systemMessage: "You are helpful",
      logger,
      config: makeConfig(),
      supportsReasoningEffort: false,
    });
    expect(config.systemMessage).toEqual({
      mode: "replace",
      content: "You are helpful",
    });
  });

  it("omits systemMessage when not provided", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig(),
      supportsReasoningEffort: false,
    });
    expect(config.systemMessage).toBeUndefined();
  });

  it("transforms mcpServers to always use tools: ['*']", () => {
    const mcpServers = {
      test: { command: "node", args: ["server.js"], allowedTools: ["tool1"] },
    };
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ mcpServers }),
      supportsReasoningEffort: false,
    });
    expect(config.mcpServers).toEqual({
      test: { command: "node", args: ["server.js"], allowedTools: ["tool1"], tools: ["*"] },
    });
  });
});

describe("permission callbacks", () => {
  it("approves all permissions when rule is true", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ autoApprovePermissions: true }),
      supportsReasoningEffort: false,
    });
    const result = await config.onPermissionRequest!({ kind: "shell" } as any, { sessionId: "test" });
    expect(result).toEqual({ kind: "approved" });
  });

  it("denies all permissions when rule is false", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ autoApprovePermissions: false }),
      supportsReasoningEffort: false,
    });
    const result = await config.onPermissionRequest!({ kind: "read" } as any, { sessionId: "test" });
    expect(result).toEqual({ kind: "denied-by-rules" });
  });

  it("approves matching permission from string array", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ autoApprovePermissions: ["read", "write"] }),
      supportsReasoningEffort: false,
    });
    const result = await config.onPermissionRequest!({ kind: "read" } as any, { sessionId: "test" });
    expect(result).toEqual({ kind: "approved" });
  });

  it("denies non-matching permission from string array", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ autoApprovePermissions: ["read"] }),
      supportsReasoningEffort: false,
    });
    const result = await config.onPermissionRequest!({ kind: "shell" } as any, { sessionId: "test" });
    expect(result).toEqual({ kind: "denied-by-rules" });
  });
});

describe("tool filtering", () => {
  it("denies all tools when both allowlists are empty", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ allowedCliTools: [], mcpServers: {} }),
      supportsReasoningEffort: false,
    });
    const result = await config.hooks!.onPreToolUse!({ toolName: "anything" } as any, { sessionId: "test" });
    expect(result).toEqual({ permissionDecision: "deny" });
  });

  it("allows CLI tools from allowedCliTools", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ allowedCliTools: ["glob", "grep"] }),
      supportsReasoningEffort: false,
    });
    const allowed = await config.hooks!.onPreToolUse!({ toolName: "glob" } as any, { sessionId: "test" });
    expect(allowed).toEqual({ permissionDecision: "allow" });
    const denied = await config.hooks!.onPreToolUse!({ toolName: "bash" } as any, { sessionId: "test" });
    expect(denied).toEqual({ permissionDecision: "deny" });
  });

  it("allows MCP tools from server allowedTools", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({
        allowedCliTools: [],
        mcpServers: {
          xcode: { command: "node", args: [], allowedTools: ["XcodeBuild"] },
        },
      }),
      supportsReasoningEffort: false,
    });
    const allowed = await config.hooks!.onPreToolUse!({ toolName: "XcodeBuild" } as any, { sessionId: "test" });
    expect(allowed).toEqual({ permissionDecision: "allow" });
    const denied = await config.hooks!.onPreToolUse!({ toolName: "XcodeTest" } as any, { sessionId: "test" });
    expect(denied).toEqual({ permissionDecision: "deny" });
  });

  it("allows tools with wildcard in allowedCliTools", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ allowedCliTools: ["*"] }),
      supportsReasoningEffort: false,
    });
    const result = await config.hooks!.onPreToolUse!({ toolName: "anything" } as any, { sessionId: "test" });
    expect(result).toEqual({ permissionDecision: "allow" });
  });

  it("allows tools with wildcard in server allowedTools", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({
        allowedCliTools: [],
        mcpServers: {
          xcode: { command: "node", args: [], allowedTools: ["*"] },
        },
      }),
      supportsReasoningEffort: false,
    });
    const result = await config.hooks!.onPreToolUse!({ toolName: "anything" } as any, { sessionId: "test" });
    expect(result).toEqual({ permissionDecision: "allow" });
  });

  it("checks all allowlists across CLI and MCP servers", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({
        allowedCliTools: ["glob"],
        mcpServers: {
          xcode: { command: "node", args: [], allowedTools: ["XcodeBuild"] },
          other: { command: "node", args: [], allowedTools: ["CustomTool"] },
        },
      }),
      supportsReasoningEffort: false,
    });
    const cliAllowed = await config.hooks!.onPreToolUse!({ toolName: "glob" } as any, { sessionId: "test" });
    expect(cliAllowed).toEqual({ permissionDecision: "allow" });
    const mcp1Allowed = await config.hooks!.onPreToolUse!({ toolName: "XcodeBuild" } as any, { sessionId: "test" });
    expect(mcp1Allowed).toEqual({ permissionDecision: "allow" });
    const mcp2Allowed = await config.hooks!.onPreToolUse!({ toolName: "CustomTool" } as any, { sessionId: "test" });
    expect(mcp2Allowed).toEqual({ permissionDecision: "allow" });
    const denied = await config.hooks!.onPreToolUse!({ toolName: "NotAllowed" } as any, { sessionId: "test" });
    expect(denied).toEqual({ permissionDecision: "deny" });
  });

  it("passes allowedCliTools as availableTools when non-empty", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ allowedCliTools: ["glob", "grep"] }),
      supportsReasoningEffort: false,
    });
    expect(config.availableTools).toEqual(["glob", "grep"]);
  });

  it("omits availableTools when allowedCliTools is empty", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ allowedCliTools: [] }),
      supportsReasoningEffort: false,
    });
    expect(config.availableTools).toBeUndefined();
  });
});

describe("onUserInputRequest", () => {
  it("returns a fallback answer for user input requests", async () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig(),
      supportsReasoningEffort: false,
    });
    const result = await config.onUserInputRequest!(
      { question: "Which file?" } as any,
      { sessionId: "test" },
    );
    expect(result.answer).toContain("not available");
    expect(result.wasFreeform).toBe(true);
  });
});

describe("reasoningEffort", () => {
  it("passes reasoningEffort when set and model supports it", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ reasoningEffort: "high" }),
      supportsReasoningEffort: true,
    });
    expect(config.reasoningEffort).toBe("high");
  });

  it("omits reasoningEffort when set but model does not support it", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig({ reasoningEffort: "high" }),
      supportsReasoningEffort: false,
    });
    expect(config.reasoningEffort).toBeUndefined();
  });

  it("omits reasoningEffort when not set", () => {
    const config = createSessionConfig({
      model: "gpt-4",
      logger,
      config: makeConfig(),
      supportsReasoningEffort: false,
    });
    expect(config.reasoningEffort).toBeUndefined();
  });
});

