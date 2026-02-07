export interface ContentPart {
  type: string;
  text?: string | undefined;
}

export type MessageContent = string | ContentPart[] | null;

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  index?: number | undefined;
  id?: string | undefined;
  type?: string | undefined;
  function: ToolCallFunction;
}

export interface Message {
  role?: "system" | "developer" | "user" | "assistant" | "tool" | undefined;
  content?: MessageContent | undefined;
  name?: string | undefined;
  tool_calls?: ToolCall[] | undefined;
  tool_call_id?: string | undefined;
}

export interface ToolFunction {
  name: string;
  description?: string | undefined;
  parameters?: Record<string, unknown> | undefined;
}

export interface Tool {
  type: string;
  function: ToolFunction;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number | undefined;
  top_p?: number | undefined;
  n?: number | undefined;
  stop?: string | string[] | undefined;
  max_tokens?: number | undefined;
  presence_penalty?: number | undefined;
  frequency_penalty?: number | undefined;
  tools?: Tool[] | undefined;
  tool_choice?: unknown;
  user?: string | undefined;
}

export interface Choice {
  index: number;
  message?: Message | undefined;
  delta?: Partial<Message> | undefined;
  finish_reason: string | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Choice[];
  system_fingerprint?: string | undefined;
}

export interface Model {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: "list";
  data: Model[];
}

export interface ErrorDetail {
  message: string;
  type: "invalid_request_error" | "api_error";
  param?: string | null | undefined;
  code?: string | null | undefined;
}

export interface ErrorResponse {
  error: ErrorDetail;
}
