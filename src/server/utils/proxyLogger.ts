/**
 * Shared proxy logging utilities
 */

import os from "os";
import { Request, Response, Router } from "express";
import { logger } from "../index.js";
import { filterHeaders, TIMEOUT_MS } from "./proxyUtils.js";

/**
 * Headers to forward from upstream API responses
 */
const RATE_LIMIT_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
] as const;

/**
 * Loggable request headers
 */
export const LOG_HEADERS = [
  "x-correlation-id",
  "content-type",
  "user-agent",
  "host",
] as const;

/**
 * Build the shared req object for logging
 */
export function buildReqLogObject(req: Request): Record<string, unknown> {
  return {
    id: req.id,
    method: req.method,
    remoteAddress: req.socket.remoteAddress,
    remotePort: req.socket.remotePort,
    headers: Object.fromEntries(LOG_HEADERS.map((h) => [h, req.headers[h]])),
  };
}

/**
 * Forward rate-limit headers from upstream to downstream
 */
export function forwardRateLimitHeaders(
  upstreamHeaders: Headers,
  res: Response,
): void {
  for (const header of RATE_LIMIT_HEADERS) {
    const value = upstreamHeaders.get(header);
    if (value) {
      res.setHeader(header, value);
    }
  }
}

/**
 * Get log level based on response status code
 */
export function getLogLevel(status: number): "error" | "warn" | "info" {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

/**
 * Options for logging a proxy response
 */
export interface ProxyLogOptions {
  req: Request;
  res: Response;
  fetchRes: globalThis.Response;
  endpoint: string;
  streamingInfo?: {
    input?: string;
    text?: string;
    content?: string;
    contentSnippet: string;
    id?: string | null;
    object?: string | null;
    created?: number | null;
    model?: string | null;
    contentBlockType?: string | null;
    stopReason?: string | null;
    stopSequence?: string | null;
    finishReason?: string | null;
    usage?: {
      inputTokens?: number | null;
      outputTokens?: number | null;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
  };
}

/**
 * Build proxy headers: filter allowed headers and inject auth
 */
export function buildProxyHeaders(
  req: Request,
  allowedHeaders: string[],
  authHeader: string,
): Record<string, string> {
  const headers = filterHeaders(req.headers, allowedHeaders);
  headers["Authorization"] = authHeader;
  return headers;
}

/**
 * Stream the upstream response to the downstream client,
 * accumulating chunks for logging.
 */
export async function streamResponse(
  fetchRes: globalThis.Response,
  res: Response,
): Promise<{ chunks: string[] }> {
  const chunks: string[] = [];
  const body = fetchRes.body as unknown as AsyncIterable<Uint8Array>;
  for await (const chunk of body) {
    const text = new TextDecoder().decode(chunk);
    chunks.push(text);
    res.write(chunk);
  }
  res.end();
  return { chunks };
}

/**
 * Log a proxy response (request + status + streaming info merged into one payload)
 */
export function logProxyResponse({
  req,
  res,
  fetchRes,
  endpoint,
  streamingInfo,
}: ProxyLogOptions): void {
  const logLevel = getLogLevel(fetchRes.status);
  const time = new Date().toISOString(); // ISO timestamp for Logflare

  const reqLogObj = buildReqLogObject(req);

  // event_message for Logflare ( Pino uses msg as message key)
  const event_message = `${fetchRes.status} - ${req.method} ${req.baseUrl}${req.url}`;

  // Build payload with grouped objects
  const payload: Record<string, unknown> = {
    // Event info (at root level)
    event_message,
    time,
    level: logLevel,

    // Request info
    request: {
      requestId: reqLogObj.id,
      id: streamingInfo?.id ?? null,
      status: fetchRes.status,
      method: req.method,
      endpoint,
    },

    // Remote info
    remote: {
      remoteAddress: reqLogObj.remoteAddress,
      remotePort: reqLogObj.remotePort,
    },

    // Content info
    content: {
      input: streamingInfo?.input ?? null,
      output: streamingInfo?.contentSnippet || "empty",
      model: streamingInfo?.model ?? null,
    },

    // Usage info
    usage: streamingInfo?.usage ?? null,
  };

  // Add headers at end
  payload.headers = reqLogObj.headers;

  // Use child logger to override pino's numeric level with string level
  logger.child({ level: logLevel }).info(payload, event_message);
}

export interface ProxyRouteConfig {
  /** Target upstream URL */
  targetUrl: string;
  /** Headers to allow through (from config) */
  allowedHeaders: string[];
  /** Auth header value to inject */
  authHeader: string;
  /** Endpoint path for logging */
  endpoint: string;
  /** Extract streaming info from response chunks */
  extractStreamingInfo?: (chunks: string[], reqBody?: Record<string, unknown>) => {
    contentSnippet: string;
    input?: string;
    usage?: Record<string, unknown> | null;
  };
}

/**
 * Factory: create a proxy POST handler for a given route config
 */
export function createProxyHandler(config: ProxyRouteConfig) {
  return async function proxyHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    // Validate body
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      res.status(400).json({
        error: {
          message: "Invalid request body",
          type: "invalid_request_error",
          status: 400,
        },
      });
      return;
    }

    const headers = buildProxyHeaders(
      req,
      config.allowedHeaders,
      config.authHeader,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const fetchRes = await fetch(config.targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      res.status(fetchRes.status);
      forwardRateLimitHeaders(fetchRes.headers, res);

      if (fetchRes.body) {
        const { chunks } = await streamResponse(fetchRes, res);
        const info = config.extractStreamingInfo
          ? config.extractStreamingInfo(chunks, req.body)
          : { contentSnippet: "" };

        logProxyResponse({
          req,
          res,
          fetchRes,
          endpoint: config.endpoint,
          streamingInfo: {
            input: info.input,
            contentSnippet: info.contentSnippet,
            usage: info.usage,
          },
        });
      } else {
        res.end();
        logProxyResponse({
          req,
          res,
          fetchRes,
          endpoint: config.endpoint,
        });
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      logger.error({ err }, "Runtime error");
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: "Internal server error",
            type: "internal_error",
            status: 500,
          },
        });
      }
    }
  };
}
