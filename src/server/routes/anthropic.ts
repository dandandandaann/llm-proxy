import { Router } from "express";
import { MINIMAX_API_KEY, MINIMAX_BASE_URL } from "../config.js";
import { ANTHROPIC_ALLOWED_HEADERS } from "../utils/proxyUtils.js";
import { extractAnthropicStreamingInfo } from "../utils/streamLogger.js";
import { createProxyHandler } from "../utils/proxyLogger.js";

export const anthropicRouter = Router();

// Shared auth logic
function getAuthHeader(
  authHeader: string | undefined,
  xApiKey: string | undefined,
): string | null {
  let providedKey: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedKey = authHeader.substring(7);
  } else if (xApiKey) {
    providedKey = xApiKey;
  }

  if (providedKey && providedKey.startsWith("sk-cp")) {
    return `Bearer ${providedKey}`;
  }

  if (MINIMAX_API_KEY) {
    return `Bearer ${MINIMAX_API_KEY}`;
  }

  return null;
}

// Anthropic /v1/messages
anthropicRouter.post("/v1/messages", async (req, res) => {
  const authHeader = getAuthHeader(
    req.headers.authorization,
    req.headers["x-api-key"] as string,
  );

  if (!authHeader) {
    res.status(401).json({
      error: {
        message: "Unauthorized: No API key provided",
        type: "invalid_request_error",
        status: 401,
      },
    });
    return;
  }

  const handler = createProxyHandler({
    targetUrl: `${MINIMAX_BASE_URL}/v1/messages`,
    allowedHeaders: ANTHROPIC_ALLOWED_HEADERS,
    authHeader,
    endpoint: "/anthropic/v1/messages",
    extractStreamingInfo: (chunks: string[], reqBody?: Record<string, unknown>) => {
      const buffer = chunks.join("");
      const info = extractAnthropicStreamingInfo(buffer);

      // Extract user prompt from messages array
      // Anthropic content is an array of content blocks: [{type: "text", text: "..."}]
      let input: string | undefined;
      if (reqBody && Array.isArray(reqBody.messages)) {
        const messages = reqBody.messages as Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
        // Find last user message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "user") {
            const content = messages[i].content;
            if (typeof content === "string") {
              input = content;
            } else if (Array.isArray(content)) {
              // Extract text from content blocks
              input = content
                .filter((block) => block.type === "text")
                .map((block) => block.text as string)
                .join("");
            }
            break;
          }
        }
      }

      return {
        input,
        text: info.text,
        contentSnippet: info.contentSnippet,
        id: info.messageId,
        model: info.model,
        contentBlockType: info.contentBlockType,
        stopReason: info.stopReason,
        usage:
          info.inputTokens != null || info.outputTokens != null
            ? { inputTokens: info.inputTokens, outputTokens: info.outputTokens }
            : undefined,
      };
    },
  });

  await handler(req, res);
});

// Models endpoints
anthropicRouter.get("/v1/models", (_req, res) => {
  res.json({
    type: "list",
    data: [
      {
        type: "model",
        id: "MiniMax-M2.7",
        created_at: "2024-05-10T18:56:40Z",
        display_name: "MiniMax-M2.7",
      },
    ],
  });
});
