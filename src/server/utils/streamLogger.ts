/**
 * Utility for extracting content snippets and usage from streaming responses
 * for logging purposes.
 */

import { logger } from "./logger.js";

// Maximum characters to log from response content (for fallback/trimming)
const MAX_CONTENT_LOG = 500;

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
  },
) {
  const logLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  const timestamp = new Date().toLocaleTimeString();

  const logData = {
    event_message: `${status} - ${method} ${endpoint}`,
    timestamp,
    request: {
      method,
      endpoint,
      headers: responseInfo.reqHeaders,
    },
    response: {
      statusCode: status,
      model: responseInfo.model ?? "null",
      finishReason:
        responseInfo.finishReason ?? responseInfo.stopReason ?? "null",
      toolCalls: responseInfo.toolCalls?.length ? responseInfo.toolCalls : [],
    },
    usage: responseInfo.usage ?? {
      inputTokens: responseInfo.inputTokens ?? "null",
      outputTokens: responseInfo.outputTokens ?? "null",
    },
  };

  logger[logLevel](logData, logData.event_message);
}
