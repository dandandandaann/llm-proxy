/**
 * Utility for extracting content snippets and usage from streaming responses
 * for logging purposes.
 */

import { logger } from "../index.js";

// Maximum characters to log from response content
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
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const partial: AnthropicPartialResponse = {
    content: "",
    inputTokens: null,
    outputTokens: null,
  };

  const lines = buffer.split("\n");
  for (const line of lines) {
    const data = parseSSEData(line);
    if (!data) continue;

    const type = data.type as string;

    if (type === "message_start") {
      const msg = data.message as Record<string, unknown>;
      const usage = msg.usage as Record<string, number> | undefined;
      if (usage) {
        partial.inputTokens = usage.input_tokens ?? null;
      }
    }

    if (type === "content_block_delta") {
      const delta = data.delta as Record<string, unknown>;
      if (delta.type === "text_delta") {
        partial.content += delta.text as string;
      }
    }

    if (type === "message_delta") {
      const usage = data.usage as Record<string, number> | undefined;
      if (usage) {
        partial.outputTokens = usage.output_tokens ?? null;
      }
    }
  }

  // Get last 500 chars
  const contentSnippet = partial.content.slice(-MAX_CONTENT_LOG);

  return {
    contentSnippet,
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
} {
  let content = "";
  let finishReason: string | null = null;
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

      // Accumulate content
      const delta = choice.delta;
      if (delta && typeof delta === "object" && delta.content) {
        content += delta.content;
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
    contentSnippet: content.slice(-MAX_CONTENT_LOG),
    finishReason,
    usage,
  };
}

/**
 * Log streaming response info (last 500 chars of content + usage)
 */
export function logStreamingResponse(
  endpoint: string,
  responseInfo: {
    contentSnippet: string;
    finishReason?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    } | null;
  },
) {
  const logData = {
    endpoint,
    contentLength: responseInfo.contentSnippet.length,
    contentLastChars: responseInfo.contentSnippet || "[empty]",
    finishReason: responseInfo.finishReason,
    usage: responseInfo.usage ?? {
      inputTokens: responseInfo.inputTokens,
      outputTokens: responseInfo.outputTokens,
    },
  };

  logger.info(logData, "Streaming response logged");
}
