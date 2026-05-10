import { Router } from "express";
import { MINIMAX_API_KEY } from "../config.js";
import { ALLOWED_HEADERS } from "../utils/proxyUtils.js";
import { extractOpenAIStreamingInfo } from "../utils/streamLogger.js";
import { createProxyHandler } from "../utils/proxyLogger.js";

export const openaiRouter = Router();

function getAuthHeader(authHeader: string | undefined): string | null {
  let providedKey: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedKey = authHeader.substring(7);
  }

  if (providedKey && providedKey.startsWith("sk-cp")) {
    return `Bearer ${providedKey}`;
  }

  if (MINIMAX_API_KEY) {
    return `Bearer ${MINIMAX_API_KEY}`;
  }

  return null;
}

openaiRouter.post("/v1/chat/completions", async (req, res) => {
  const authHeader = getAuthHeader(req.headers.authorization);

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
    targetUrl: "https://api.minimax.io/v1/chat/completions",
    allowedHeaders: ALLOWED_HEADERS,
    authHeader,
    endpoint: "/v1/chat/completions",
    extractStreamingInfo: (chunks: string[], reqBody?: Record<string, unknown>) => {
      const info = extractOpenAIStreamingInfo(chunks);

      // Extract user prompt from messages array
      let input: string | undefined;
      if (reqBody && Array.isArray(reqBody.messages)) {
        const messages = reqBody.messages as Array<{ role: string; content: string }>;
        // Find last user message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "user") {
            input = messages[i].content;
            break;
          }
        }
      }

      return {
        input,
        content: info.content,
        contentSnippet: info.contentSnippet,
        id: info.id,
        object: info.object,
        created: info.created,
        model: info.model,
        finishReason: info.finishReason,
        stopSequence: info.stopSequence,
        usage: info.usage,
      };
    },
  });

  await handler(req, res);
});

openaiRouter.get("/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: "MiniMax-M2.7",
        object: "model",
        created: 1715367400,
        owned_by: "minimax",
      },
    ],
  });
});
