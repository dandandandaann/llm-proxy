/**
 * Utility for extracting content snippets and usage from streaming responses
 * for logging purposes.
 */

// Maximum characters to log from response content
const MAX_CONTENT_LOG = 1000;

// OpenAI completion tracking
interface OpenAIPartialResponse {
  id: string | null;
  object: string | null;
  created: number | null;
  model: string | null;
  content: string;
  finishReason: string | null;
  stopSequence: string | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

// Anthropic event tracking
interface AnthropicPartialResponse {
  messageId: string | null;
  model: string | null;
  content: string;
  contentBlockType: string | null; // "text" | "thinking" | "tool_use"
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
 * Parse an SSE data line (for OpenAI) and return the JSON object
 * Handles both plain JSON and SSE format (data: {...})
 */
function parseSSEDataLine(line: string): Record<string, unknown> | null {
  let data = line.trim();
  if (!data) return null;
  if (data.startsWith("data: ")) {
    data = data.slice(6);
  }
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
  text: string;
  contentSnippet: string;
  messageId: string | null;
  model: string | null;
  contentBlockType: string | null;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const partial: AnthropicPartialResponse = {
    messageId: null,
    model: null,
    content: "",
    contentBlockType: null,
    stopReason: null,
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
      partial.messageId = (msg.id as string) ?? null;
      partial.model = (msg.model as string) ?? null;
      const usage = msg.usage as Record<string, number> | undefined;
      if (usage) {
        partial.inputTokens = usage.input_tokens ?? null;
      }
    }

    if (type === "content_block_start") {
      const block = data.content_block as Record<string, unknown>;
      partial.contentBlockType = (block.type as string) ?? null;
    }

    if (type === "content_block_delta") {
      const delta = data.delta as Record<string, unknown>;
      if (delta.type === "text_delta") {
        partial.content += delta.text as string;
      }
      // Tool use: accumulate partial_json
      if (delta.type === "input_json_delta") {
        partial.content += delta.partial_json as string;
      }
    }

    if (type === "message_delta") {
      partial.stopReason = (data.stop_reason as string) ?? null;
      const usage = data.usage as Record<string, number> | undefined;
      if (usage) {
        partial.outputTokens = usage.output_tokens ?? null;
      }
    }
  }

  return {
    text: partial.content,
    contentSnippet: partial.content.slice(-MAX_CONTENT_LOG),
    messageId: partial.messageId,
    model: partial.model,
    contentBlockType: partial.contentBlockType,
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
  content: string;
  contentSnippet: string;
  id: string | null;
  object: string | null;
  created: number | null;
  model: string | null;
  finishReason: string | null;
  stopSequence: string | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
} {
  const partial: OpenAIPartialResponse = {
    id: null,
    object: null,
    created: null,
    model: null,
    content: "",
    finishReason: null,
    stopSequence: null,
    usage: null,
  };

  for (const chunkStr of chunks) {
    try {
      const chunk = JSON.parse(chunkStr);
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      // Capture metadata from first chunk
      if (!partial.id) {
        partial.id = chunk.id ?? null;
        partial.object = chunk.object ?? null;
        partial.created = chunk.created ?? null;
        partial.model = chunk.model ?? null;
      }

      // Accumulate content
      const delta = choice.delta;
      if (delta && typeof delta === "object" && delta.content) {
        partial.content += delta.content;
      }

      // Track finish reason
      if (choice.finish_reason) {
        partial.finishReason = choice.finish_reason;
      }

      // Track stop sequence
      if (choice.stop_sequence) {
        partial.stopSequence = choice.stop_sequence;
      }

      // Extract usage from final chunk (when include_usage is set)
      if (chunk.usage) {
        partial.usage = {
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
    content: partial.content,
    contentSnippet: partial.content.slice(-MAX_CONTENT_LOG),
    id: partial.id,
    object: partial.object,
    created: partial.created,
    model: partial.model,
    finishReason: partial.finishReason,
    stopSequence: partial.stopSequence,
    usage: partial.usage,
  };
}
