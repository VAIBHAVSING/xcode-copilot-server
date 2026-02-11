import type { FastifyReply } from "fastify";
import type { AnthropicToolDefinition } from "../schemas/anthropic.js";

const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingMCPRequest {
  toolCallId: string;
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class ToolBridgeState {
  private cachedTools: AnthropicToolDefinition[] = [];

  private readonly expectedByName = new Map<string, string[]>();
  private readonly pendingByCallId = new Map<string, PendingMCPRequest>();

  private reply: FastifyReply | null = null;
  private streamingDone: (() => void) | null = null;
  private _onSessionEnd: (() => void) | null = null;

  private _sessionActive = false;
  private _hadError = false;

  get currentReply(): FastifyReply | null {
    return this.reply;
  }

  setReply(reply: FastifyReply): void {
    this.reply = reply;
  }

  clearReply(): void {
    this.reply = null;
  }

  cacheTools(tools: AnthropicToolDefinition[]): void {
    this.cachedTools = tools;
  }

  getCachedTools(): AnthropicToolDefinition[] {
    return this.cachedTools;
  }

  // the model sometimes hallucinates shortened tool names like "XcodeRead"
  // so we resolve them against the cached list to match what Xcode sent
  resolveToolName(name: string): string {
    if (this.cachedTools.some((t) => t.name === name)) return name;

    const suffix = `__${name}`;
    const matches = this.cachedTools.filter((t) => t.name.endsWith(suffix));
    if (matches.length === 1) return matches[0]!.name;

    return name;
  }

  onSessionEnd(callback: () => void): void {
    this._onSessionEnd = callback;
  }

  hasPendingToolCall(toolCallId: string): boolean {
    if (this.pendingByCallId.has(toolCallId)) return true;
    for (const [, queue] of this.expectedByName) {
      if (queue.includes(toolCallId)) return true;
    }
    return false;
  }

  hasExpectedTool(name: string): boolean {
    const queue = this.expectedByName.get(name);
    return !!queue && queue.length > 0;
  }

  registerExpected(toolCallId: string, toolName: string): void {
    const queue = this.expectedByName.get(toolName);
    if (queue) {
      queue.push(toolCallId);
    } else {
      this.expectedByName.set(toolName, [toolCallId]);
    }
  }

  registerMCPRequest(
    name: string,
    resolve: (result: string) => void,
    reject: (err: Error) => void,
  ): void {
    const queue = this.expectedByName.get(name);
    if (!queue?.length) {
      reject(new Error(`No expected tool call for "${name}"`));
      return;
    }
    const toolCallId = queue.shift();
    if (queue.length === 0) this.expectedByName.delete(name);
    if (!toolCallId) return;
    this.addPending(toolCallId, resolve, reject);
  }

  private addPending(
    toolCallId: string,
    resolve: (result: string) => void,
    reject: (err: Error) => void,
  ): void {
    const timeout = setTimeout(() => {
      this.pendingByCallId.delete(toolCallId);
      reject(new Error(`Tool call ${toolCallId} timed out`));
    }, TOOL_TIMEOUT_MS);

    this.pendingByCallId.set(toolCallId, { toolCallId, resolve, reject, timeout });
  }

  resolveToolCall(toolCallId: string, result: string): boolean {
    const pending = this.pendingByCallId.get(toolCallId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    this.pendingByCallId.delete(toolCallId);
    pending.resolve(result);
    return true;
  }

  get hasPending(): boolean {
    return this.pendingByCallId.size > 0 || this.expectedByName.size > 0;
  }

  get sessionActive(): boolean {
    return this._sessionActive;
  }

  get hadError(): boolean {
    return this._hadError;
  }

  markSessionErrored(): void {
    this._hadError = true;
  }

  markSessionActive(): void {
    this._sessionActive = true;
  }

  markSessionInactive(): void {
    this._sessionActive = false;

    // stale entries from tool calls that never went through the bridge
    // (denied or handled internally) would hang the next continuation
    this.expectedByName.clear();
    for (const [, pending] of this.pendingByCallId) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Session ended"));
    }
    this.pendingByCallId.clear();

    if (this._onSessionEnd) {
      this._onSessionEnd();
      this._onSessionEnd = null;
    }
  }

  notifyStreamingDone(): void {
    if (this.streamingDone) {
      this.streamingDone();
      this.streamingDone = null;
    }
  }

  waitForStreamingDone(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.streamingDone = resolve;
    });
  }

  cleanup(): void {
    this._sessionActive = false;

    for (const [, pending] of this.pendingByCallId) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Session cleanup"));
    }
    this.pendingByCallId.clear();
    this.expectedByName.clear();

    if (this._onSessionEnd) {
      this._onSessionEnd();
      this._onSessionEnd = null;
    }
  }
}
