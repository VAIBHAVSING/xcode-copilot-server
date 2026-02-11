import type { FastifyReply } from "fastify";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const satisfies Record<string, string>;

export function sendSSEEvent(reply: FastifyReply, type: string, data: unknown): void {
  reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function formatCompaction(data: unknown): string {
  if (!data || typeof data !== "object") return "compaction data unavailable";
  const cd = data as Record<string, unknown>;
  return `${String(cd["preCompactionTokens"])} to ${String(cd["postCompactionTokens"])} tokens`;
}
