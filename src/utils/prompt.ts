import { extractContentText } from "../schemas.js";
import type { Message } from "../types.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips fenced code blocks whose filename matches any pattern.
 *
 * Xcode search dumps full file contents for every match — excluded files
 * can be thousands of lines and add nothing useful to the prompt.
 */
export function filterExcludedFiles(s: string, patterns: string[]): string {
  if (patterns.length === 0) return s;

  const joined = patterns.map(escapeRegex).join("|");
  const re = new RegExp(
    "```\\w*:[^\\n]*(?:" + joined + ")[^\\n]*\\n.*?\\n```\\n?",
    "gis",
  );
  return s.replace(re, "");
}

/** System/developer messages are skipped — they're passed via `SessionConfig.systemMessage`. */
export function formatPrompt(
  messages: Message[],
  excludedFilePatterns: string[],
): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const content = extractContentText(msg.content);

    switch (msg.role) {
      case "system":
      case "developer":
        // Handled via SessionConfig.systemMessage
        continue;

      case "user":
        parts.push(`[User]: ${filterExcludedFiles(content, excludedFilePatterns)}`);
        break;

      case "assistant":
        if (content) {
          parts.push(`[Assistant]: ${content}`);
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push(
              `[Assistant called tool ${tc.function.name} with args: ${tc.function.arguments}]`,
            );
          }
        }
        break;

      case "tool":
        parts.push(`[Tool result for ${msg.tool_call_id ?? "unknown"}]: ${content}`);
        break;
    }
  }

  return parts.join("\n\n");
}
