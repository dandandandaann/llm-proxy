/**
 * Utility for extracting content snippets and usage from streaming responses
 * for logging purposes.
 */

import { logger } from "./logger.js";

// Maximum characters to log from response content (for fallback/trimming)
const MAX_CONTENT_LOG = 500;

// Sensitive fields to redact from user input
const SENSITIVE_FIELDS = [
  "password",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "system", // System prompts can be large and repetitive
  "tools", // Tool definitions are verbose
  "top_k",
  "top_p",
];

/**
 * Extract the last user message from messages array.
 * Returns only the content of the last message with role === "user".
 */
function extractLastUserMessage(
  messages: Array<{ role?: string; content?: unknown }>,
): string | undefined {
  // Find last message where role is "user"
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return msg.content;
      }
      if (Array.isArray(msg.content)) {
        // For Anthropic format: [{type: "text", text: "..."}]
        const textParts = msg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { text?: string }).text)
          .filter(Boolean);
        return textParts.join("\n");
      }
    }
  }
  return undefined;
}

/**
 * Sanitize an object by redacting sensitive fields.
 * Recursively handles nested objects.
 */
function sanitizeInput(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeInput);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// OpenAI completion tracking
interface OpenAIPartialResponse {
  content: string;
  finishReason: string | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

// Anthropic event tracking
interface AnthropicPartialResponse {
  content: string;
  model: string | null;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Parse an SSE data line and return the JSON object
 */
function parseSSEData(line: string): Record<string, unknown> | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6);
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Process an SSE buffer and extract content snippet + usage
 * Returns the last 500 chars of text content and any usage found
 */
export function extractAnthropicStreamingInfo(buffer: string): {
  contentSnippet: string;
  model: string | null;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const partial: {
    content: string;
    model: string | null;
    stopReason: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
  } = {
    content: "",
    model: null,
    stopReason: null,
    inputTokens: null,
    outputTokens: null,
  };

  const lines = buffer.split("\n");
  for (const line of lines) {
    const data = parseSSEData(line);
    if (!data) continue;

    const type = data.type as string;

    // Capture model from message_start
    if (type === "message_start") {
      const msg = data.message as Record<string, unknown>;
      if (msg.model && !partial.model) {
        partial.model = msg.model as string;
      }
    }

    if (type === "content_block_delta") {
      const delta = data.delta as Record<string, unknown>;
      if (delta.type === "text_delta") {
        partial.content += delta.text as string;
      }
    }

    if (type === "message_delta") {
      const msg = data.message as Record<string, unknown>;
      const usage = msg.usage as Record<string, number> | undefined;
      const stopReason = msg.stop_reason as string | undefined;

      // Capture stop reason
      if (stopReason && !partial.stopReason) {
        partial.stopReason = stopReason;
      }

      // Capture usage
      if (usage) {
        if (partial.inputTokens === null && usage.input_tokens !== undefined) {
          partial.inputTokens = usage.input_tokens;
        }
        partial.outputTokens = usage.output_tokens ?? null;
      }
    }
  }

  return {
    contentSnippet: partial.content,
    model: partial.model,
    stopReason: partial.stopReason,
    inputTokens: partial.inputTokens,
    outputTokens: partial.outputTokens,
  };
}

/**
 * Parse accumulated OpenAI streaming chunks and extract info
 * Chunks look like: {"id":"...","choices":[{"delta":{"content":"..."}}]}
 */
export function extractOpenAIStreamingInfo(chunks: string[]): {
  contentSnippet: string;
  finishReason: string | null;
  model: string | null;
  toolCalls: Array<{
    index: number;
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
} {
  let content = "";
  let finishReason: string | null = null;
  let model: string | null = null;
  const toolCalls: Array<{
    index: number;
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];
  let usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null = null;

  for (const chunkStr of chunks) {
    try {
      const chunk = JSON.parse(chunkStr);
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      // Capture model from first chunk
      if (!model && chunk.model) {
        model = chunk.model;
      }

      // Accumulate content
      const delta = choice.delta;
      if (delta && typeof delta === "object") {
        if (typeof delta.content === "string") {
          content += delta.content;
        }

        // Extract tool calls
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            toolCalls.push({
              index: tc.index ?? 0,
              id: tc.id ?? "",
              type: tc.type ?? "function",
              function: {
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              },
            });
          }
        }
      }

      // Track finish reason
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      // Extract usage from final chunk
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens ?? 0,
          completion_tokens: chunk.usage.completion_tokens ?? 0,
          total_tokens: chunk.usage.total_tokens ?? 0,
        };
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return {
    contentSnippet: content,
    finishReason,
    model,
    toolCalls,
    usage,
  };
}

/**
 * Log streaming response info combined with HTTP details.
 * Single log entry per request with all data.
 */
export function logStreamingResponse(
  status: number,
  statusText: string,
  method: string,
  endpoint: string,
  responseTime: number,
  responseInfo: {
    contentSnippet: string;
    model?: string | null;
    finishReason?: string | null;
    toolCalls?: Array<{
      index: number;
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
    stopReason?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    } | null;
    reqHeaders?: Record<string, string | undefined>;
    userInput?: unknown;
  },
) {
  const logLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  const logTime = new Date().toISOString();

  // Extract last user message from userInput.messages if available
  let lastUserMessage: string | undefined;
  const userInput = responseInfo.userInput as {
    messages?: Array<{ role?: string; content?: unknown }>;
    model?: string;
    max_tokens?: number;
    [key: string]: unknown;
  } | null;
  if (userInput?.messages) {
    lastUserMessage = extractLastUserMessage(userInput.messages);
  }

  const logData = {
    // id and level are auto-generated by pino/pino-http
    model: userInput?.model,
    logTime,
    event_message: `${status} - ${method} ${endpoint}`,
    request: {
      headers: responseInfo.reqHeaders,
      method,
      endpoint,
    },
    userInput: lastUserMessage ? { message: lastUserMessage } : undefined,
    response: {
      statusCode: status,
      statusMessage: statusText,
      contentSnippet:
        responseInfo.contentSnippet.length > MAX_CONTENT_LOG
          ? responseInfo.contentSnippet.slice(-MAX_CONTENT_LOG)
          : responseInfo.contentSnippet,
      toolCalls: responseInfo.toolCalls?.length
        ? responseInfo.toolCalls
        : undefined,
    },
    usage: responseInfo.usage ?? {
      model: responseInfo.model ?? "null",
      finishReason:
        responseInfo.finishReason ?? responseInfo.stopReason ?? "null",
      inputTokens: responseInfo.inputTokens ?? "null",
      outputTokens: responseInfo.outputTokens ?? "null",
    },
  };

  logger[logLevel](logData, logData.event_message);
}
