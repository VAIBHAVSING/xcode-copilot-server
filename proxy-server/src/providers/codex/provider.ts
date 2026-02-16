import type { Provider } from "../types.js";
import { registerToolBridge } from "../../tool-bridge/index.js";
import { createResponsesHandler } from "./handler.js";

export const codexProvider = {
  name: "Codex",
  routes: ["POST /v1/responses"],

  register(app, ctx) {
    const manager = registerToolBridge(app, ctx.logger);
    app.post("/v1/responses", createResponsesHandler(ctx, manager));
  },
} satisfies Provider;
