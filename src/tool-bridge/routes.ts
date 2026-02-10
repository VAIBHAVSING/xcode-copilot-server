import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ToolBridgeState } from "./state.js";
import type { Logger } from "../logger.js";

const ToolCallBodySchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export function registerRoutes(
  app: FastifyInstance,
  state: ToolBridgeState,
  logger: Logger,
): void {
  app.get("/internal/tools", (_request: FastifyRequest, reply: FastifyReply) => {
    const tools = state.getCachedTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    }));
    logger.debug(`/internal/tools: returning ${String(tools.length)} tools: ${tools.map((t) => t.name).join(", ")}`);
    return reply.send(tools);
  });

  app.post(
    "/internal/tool-call",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ToolCallBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues[0]?.message ?? "Invalid request",
        });
      }
      const { name, arguments: args } = parsed.data;

      logger.info(`/internal/tool-call: name="${name}", args=${JSON.stringify(args)}`);

      const result = await new Promise<string>((resolve, reject) => {
        state.registerMCPRequest(name, resolve, reject);
      });

      logger.debug(`/internal/tool-call resolved: name="${name}", result=${result}`);
      return reply.send({ content: result });
    },
  );
}
