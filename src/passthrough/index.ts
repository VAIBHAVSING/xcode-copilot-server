import type { FastifyInstance } from "fastify";
import type { Logger } from "../logger.js";
import { PassthroughState } from "./state.js";
import { registerRoutes } from "./routes.js";

export { PassthroughState } from "./state.js";

export function registerPassthrough(app: FastifyInstance, logger: Logger): PassthroughState {
  const state = new PassthroughState();
  registerRoutes(app, state, logger);
  return state;
}
