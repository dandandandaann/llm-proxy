import { Router } from "express";
import { MINIMAX_BASE_URL } from "../config.js";
import {
  filterHeaders,
  ANTHROPIC_ALLOWED_HEADERS,
  forwardRateLimitHeaders,
  TIMEOUT_MS,
} from "../utils/proxyUtils.js";
import { getAuthHeader } from "../utils/authUtils.js";
import {
  extractAnthropicStreamingInfo,
  logStreamingResponse,
} from "../utils/streamLogger.js";
import { logger } from "../utils/logger.js";

export const anthropicRouter = Router();

anthropicRouter.post("/v1/messages", async (req, res) => {
  const authHeader = getAuthHeader({
    authHeader: req.headers.authorization,
    xApiKey: req.headers["x-api-key"] as string,
  });

  // No auth and no default key
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

  const targetUrl = `${MINIMAX_BASE_URL}/v1/messages`;

  // Build headers - only allowed ones
  const headers = filterHeaders(req.headers, ANTHROPIC_ALLOWED_HEADERS);
  headers["Authorization"] = authHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const fetchRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    res.status(fetchRes.status);

    forwardRateLimitHeaders(fetchRes, res);

    // Stream response back
    if (fetchRes.body) {
      let buffer = "";
      const body = fetchRes.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        res.write(chunk);
      }
      res.end();

      const info = extractAnthropicStreamingInfo(buffer);
      logStreamingResponse(
        fetchRes.status,
        fetchRes.statusText,
        req.method,
        "/anthropic/v1/messages",
        Date.now() - (req.startTime ?? Date.now()),
        {
          contentSnippet: info.contentSnippet,
          model: info.model,
          stopReason: info.stopReason,
          inputTokens: info.inputTokens,
          outputTokens: info.outputTokens,
          reqHeaders: {
            "x-correlation-id": req.headers["x-correlation-id"] as
              | string
              | undefined,
            "content-type": req.headers["content-type"] as string | undefined,
            "user-agent": req.headers["user-agent"] as string | undefined,
          },
          userInput: req.body,
        },
      );
    } else {
      res.end();
      logStreamingResponse(
        fetchRes.status,
        fetchRes.statusText,
        req.method,
        "/anthropic/v1/messages",
        Date.now() - (req.startTime ?? Date.now()),
        {
          contentSnippet: "",
          reqHeaders: {
            "x-correlation-id": req.headers["x-correlation-id"] as
              | string
              | undefined,
            "content-type": req.headers["content-type"] as string | undefined,
            "user-agent": req.headers["user-agent"] as string | undefined,
          },
          userInput: req.body,
        },
      );
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const responseTime = Date.now() - (req.startTime ?? Date.now());
    logger.error({
      event_message: `500 - ${req.method} /anthropic/v1/messages`,
      responseTime,
      err,
    });
  }
});

anthropicRouter.get("/v1/models", (req, res) => {
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
