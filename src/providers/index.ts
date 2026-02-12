import { openaiProvider } from "./openai.js";
import { anthropicProvider } from "./anthropic.js";
import type { Provider } from "./types.js";

export type { Provider };

export const providers = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
} satisfies Record<string, Provider>;

export type ProxyName = keyof typeof providers;
