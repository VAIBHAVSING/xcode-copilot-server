import { describe, it, expect } from "vitest";
import { ConversationManager } from "../src/conversation-manager.js";
import { Logger } from "../src/logger.js";

const logger = new Logger("none");

function createManager(): ConversationManager {
  return new ConversationManager(logger);
}

describe("ConversationManager", () => {
  describe("create", () => {
    it("returns a conversation with a unique id", () => {
      const manager = createManager();
      const a = manager.create();
      const b = manager.create();
      expect(a.id).toBeTruthy();
      expect(b.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
    });

    it("initialises conversation fields", () => {
      const conv = createManager().create();
      expect(conv.session).toBeNull();
      expect(conv.sentMessageCount).toBe(0);
      expect(conv.state).toBeDefined();
    });

    it("increments size", () => {
      const manager = createManager();
      expect(manager.size).toBe(0);
      manager.create();
      expect(manager.size).toBe(1);
      manager.create();
      expect(manager.size).toBe(2);
    });
  });

  describe("getState", () => {
    it("returns state for an existing conversation", () => {
      const manager = createManager();
      const conv = manager.create();
      expect(manager.getState(conv.id)).toBe(conv.state);
    });

    it("returns undefined for unknown id", () => {
      expect(createManager().getState("no-such-id")).toBeUndefined();
    });
  });

  describe("remove", () => {
    it("removes conversation and decrements size", () => {
      const manager = createManager();
      const conv = manager.create();
      expect(manager.size).toBe(1);
      manager.remove(conv.id);
      expect(manager.size).toBe(0);
      expect(manager.getState(conv.id)).toBeUndefined();
    });

    it("is a no-op for unknown id", () => {
      const manager = createManager();
      manager.create();
      manager.remove("unknown");
      expect(manager.size).toBe(1);
    });

    it("calls cleanup on the state (rejects pending tool calls)", async () => {
      const manager = createManager();
      const conv = manager.create();

      conv.state.registerExpected("call-1", "Read");
      const resultPromise = new Promise<string>((resolve, reject) => {
        conv.state.registerMCPRequest("Read", resolve, reject);
      });

      manager.remove(conv.id);

      await expect(resultPromise).rejects.toThrow("Session cleanup");
    });
  });

  describe("findByContinuation", () => {
    it("returns undefined for empty messages", () => {
      expect(createManager().findByContinuation([])).toBeUndefined();
    });

    it("returns undefined when last message is from assistant", () => {
      const result = createManager().findByContinuation([
        { role: "assistant", content: "Hello" },
      ]);
      expect(result).toBeUndefined();
    });

    it("returns undefined when last user message is a plain string", () => {
      const result = createManager().findByContinuation([
        { role: "user", content: "Hello" },
      ]);
      expect(result).toBeUndefined();
    });

    it("returns undefined when last user message has no tool_result blocks", () => {
      const result = createManager().findByContinuation([
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ]);
      expect(result).toBeUndefined();
    });

    it("matches conversation by pending tool_use_id", () => {
      const manager = createManager();
      const conv = manager.create();

      conv.state.registerExpected("tc-123", "Read");
      conv.state.registerMCPRequest("Read", () => {}, () => {});

      const result = manager.findByContinuation([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tc-123", content: "file contents" },
          ],
        },
      ]);

      expect(result).toBe(conv);
    });

    it("matches conversation by expected (not yet pending) tool_use_id", () => {
      const manager = createManager();
      const conv = manager.create();

      conv.state.registerExpected("tc-456", "Write");

      const result = manager.findByContinuation([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tc-456", content: "ok" },
          ],
        },
      ]);

      expect(result).toBe(conv);
    });

    it("matches the correct conversation among multiple", () => {
      const manager = createManager();
      const conv1 = manager.create();
      const conv2 = manager.create();

      conv1.state.registerExpected("tc-aaa", "Read");
      conv2.state.registerExpected("tc-bbb", "Write");

      const result = manager.findByContinuation([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tc-bbb", content: "done" },
          ],
        },
      ]);

      expect(result).toBe(conv2);
    });

    it("falls back to sessionActive when tool_result does not match any pending", () => {
      const manager = createManager();
      const conv = manager.create();
      conv.state.markSessionActive();

      const result = manager.findByContinuation([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tc-unknown", content: "" },
          ],
        },
      ]);

      expect(result).toBe(conv);
    });

    it("returns undefined when tool_result does not match and no session is active", () => {
      const manager = createManager();
      manager.create(); // inactive session

      const result = manager.findByContinuation([
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tc-unknown", content: "" },
          ],
        },
      ]);

      expect(result).toBeUndefined();
    });
  });

  describe("findByExpectedTool", () => {
    it("finds state with expected tool", () => {
      const manager = createManager();
      const conv = manager.create();
      conv.state.registerExpected("tc-1", "Bash");

      expect(manager.findByExpectedTool("Bash")).toBe(conv.state);
    });

    it("returns undefined when no conversation expects the tool", () => {
      const manager = createManager();
      manager.create();
      expect(manager.findByExpectedTool("Bash")).toBeUndefined();
    });
  });

  describe("auto-removal via onSessionEnd", () => {
    it("removes conversation when session becomes inactive", () => {
      const manager = createManager();
      const conv = manager.create();
      conv.state.markSessionActive();

      expect(manager.size).toBe(1);
      conv.state.markSessionInactive();
      expect(manager.size).toBe(0);
      expect(manager.getState(conv.id)).toBeUndefined();
    });

    it("removes conversation on cleanup", () => {
      const manager = createManager();
      const conv = manager.create();

      expect(manager.size).toBe(1);
      conv.state.cleanup();
      expect(manager.size).toBe(0);
    });
  });
});
