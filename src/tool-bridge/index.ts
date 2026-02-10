import type { FastifyInstance } from "fastify";
import type { Logger } from "../logger.js";
import { ToolBridgeState } from "./state.js";
import { registerRoutes } from "./routes.js";

export { ToolBridgeState } from "./state.js";

export function registerToolBridge(app: FastifyInstance, logger: Logger): ToolBridgeState {
  const state = new ToolBridgeState();
  registerRoutes(app, state, logger);
  return state;
}
