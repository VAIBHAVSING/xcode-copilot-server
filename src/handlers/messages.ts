import type { FastifyRequest, FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { AppContext } from "../context.js";
import {
  AnthropicMessagesRequestSchema,
  extractAnthropicSystem,
} from "../schemas/anthropic.js";
import { formatAnthropicPrompt } from "../utils/anthropic-prompt.js";
import { resolveModel } from "../utils/model-resolver.js";
import { createSessionConfig } from "./session-config.js";
import type { PassthroughState } from "../passthrough/state.js";
import { resolveToolResults } from "./messages/tool-result-handler.js";
import { handleAnthropicStreaming, startReply } from "./messages/streaming.js";

function sendError(
  reply: FastifyReply,
  status: number,
  type: "invalid_request_error" | "api_error",
  message: string,
): void {
  reply.status(status).send({
    type: "error",
    error: { type, message },
  });
}

export function createMessagesHandler(
  { service, logger, config, port }: AppContext,
  state: PassthroughState,
) {
  let sentMessageCount = 0;

  return async function handleMessages(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parseResult = AnthropicMessagesRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      sendError(
        reply,
        400,
        "invalid_request_error",
        firstIssue?.message ?? "Invalid request body",
      );
      return;
    }
    const req = parseResult.data;

    // If tool results are pending or the session is still active (e.g. the model
    // retried a tool after an internal CLI failure), this is a continuation so
    // we just resolve tool results and wait for the SDK to keep going.
    if (state.hasPending || state.sessionActive) {
      logger.info(`Continuation request (hasPending=${String(state.hasPending)}, sessionActive=${String(state.sessionActive)}), resolving tool results`);
      state.setReply(reply);
      startReply(reply, req.model);

      reply.raw.on("close", () => {
        if (state.currentReply === reply) {
          logger.info("Client disconnected during continuation");
          state.cleanup();
          state.notifyStreamingDone();
        }
      });

      resolveToolResults(req.messages, state, logger);
      await state.waitForStreamingDone();
      sentMessageCount = req.messages.length;
      return;
    }

    const systemMessage = extractAnthropicSystem(req.system);
    const tools = req.tools;
    const hasTools = !!tools?.length;

    logger.debug(`System message length: ${String(systemMessage?.length ?? 0)} chars`);
    logger.debug(`System message: ${systemMessage ?? "(none)"}`);
    logger.debug(`Tools in request: ${tools ? String(tools.length) : "0"}`);
    if (tools) {
      logger.debug(`Tool names: ${tools.map((t) => t.name).join(", ")}`);
    }

    // The MCP shim's /internal/tools endpoint serves these back to the CLI.
    if (tools?.length) {
      state.cacheTools(tools);
    }

    let prompt: string;
    try {
      prompt = formatAnthropicPrompt(req.messages.slice(sentMessageCount), config.excludedFilePatterns);
    } catch (err) {
      sendError(
        reply,
        400,
        "invalid_request_error",
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    logger.debug(`Final prompt length: ${String(prompt.length)} chars`);
    logger.debug(`Final prompt: ${prompt}`);

    let copilotModel = req.model;
    let supportsReasoningEffort = false;
    try {
      const models = await service.listModels();
      const resolved = resolveModel(req.model, models, logger);
      if (!resolved) {
        sendError(
          reply,
          400,
          "invalid_request_error",
          `Model "${req.model}" is not available. Available models: ${models.map((m) => m.id).join(", ")}`,
        );
        return;
      }
      copilotModel = resolved;

      if (config.reasoningEffort) {
        const modelInfo = models.find((m) => m.id === copilotModel);
        supportsReasoningEffort =
          modelInfo?.capabilities.supports.reasoningEffort ?? false;
        if (!supportsReasoningEffort) {
          logger.debug(
            `Model "${copilotModel}" does not support reasoning effort, ignoring config`,
          );
        }
      }
    } catch (err) {
      logger.warn("Failed to list models, passing model through as-is:", err);
    }

    const mcpPassthroughServer = hasTools ? config.passthroughMcpServer : undefined;

    if (mcpPassthroughServer) {
      logger.info(`MCP passthrough server: ${mcpPassthroughServer.command} ${mcpPassthroughServer.args.join(" ")}`);
    }

    const sessionConfig = createSessionConfig({
      model: copilotModel,
      systemMessage,
      logger,
      config,
      supportsReasoningEffort,
      cwd: service.cwd,
      mcpPassthroughServer,
      port,
    });

    let session: CopilotSession;
    try {
      session = await service.getSession(sessionConfig);
    } catch (err) {
      logger.error("Getting session failed:", err);
      sendError(reply, 500, "api_error", "Failed to create session");
      return;
    }

    state.setReply(reply);

    try {
      logger.info("Streaming response");
      await handleAnthropicStreaming(state, session, prompt, req.model, logger, hasTools);
      sentMessageCount = req.messages.length;
    } catch (err) {
      logger.error("Request failed:", err);
      if (!reply.sent) {
        sendError(
          reply,
          500,
          "api_error",
          err instanceof Error ? err.message : "Internal error",
        );
      }
    }
  };
}
