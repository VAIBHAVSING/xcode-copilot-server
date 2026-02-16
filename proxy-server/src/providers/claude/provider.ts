import type { Provider } from "../types.js";
import { registerToolBridge } from "../../tool-bridge/index.js";
import { createMessagesHandler } from "./handler.js";
import { createCountTokensHandler } from "./count-tokens.js";

export const claudeProvider = {
  name: "Claude",
  routes: ["POST /v1/messages", "POST /v1/messages/count_tokens"],

  register(app, ctx) {
    const manager = registerToolBridge(app, ctx.logger);
    app.post("/v1/messages", createMessagesHandler(ctx, manager));
    app.post("/v1/messages/count_tokens", createCountTokensHandler(ctx));
  },
} satisfies Provider;
