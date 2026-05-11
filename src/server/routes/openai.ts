import { Router } from "express";
import {
  filterHeaders,
  ALLOWED_HEADERS,
  forwardRateLimitHeaders,
  TIMEOUT_MS,
} from "../utils/proxyUtils.js";
import { getAuthHeader } from "../utils/authUtils.js";
import {
  extractOpenAIStreamingInfo,
  logStreamingResponse,
} from "../utils/streamLogger.js";
import { logger } from "../utils/logger.js";

export const openaiRouter = Router();

openaiRouter.post("/v1/chat/completions", async (req, res) => {
  const authHeader = getAuthHeader({ authHeader: req.headers.authorization });

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

  const targetUrl = "https://api.minimax.io/v1/chat/completions";

  const headers = filterHeaders(req.headers, ALLOWED_HEADERS);
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

    if (fetchRes.body) {
      const chunks: string[] = [];
      const body = fetchRes.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        const text = new TextDecoder().decode(chunk);
        chunks.push(text);
        res.write(chunk);
      }
      res.end();

      const info = extractOpenAIStreamingInfo(chunks);
      logStreamingResponse(
        fetchRes.status,
        req.method,
        "/v1/chat/completions",
        Date.now() - (req.startTime ?? Date.now()),
        {
          ...info,
          reqHeaders: {
            "x-correlation-id": req.headers["x-correlation-id"] as
              | string
              | undefined,
            "content-type": req.headers["content-type"] as string | undefined,
            "user-agent": req.headers["user-agent"] as string | undefined,
          },
        },
      );
    } else {
      res.end();
      logStreamingResponse(
        fetchRes.status,
        req.method,
        "/v1/chat/completions",
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
        },
      );
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const responseTime = Date.now() - (req.startTime ?? Date.now());
    logger.error({
      event_message: `500 - ${req.method} /v1/chat/completions`,
      responseTime,
      err,
    });
  }
});

openaiRouter.get("/v1/models", (req, res) => {
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
