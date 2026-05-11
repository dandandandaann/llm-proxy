/**
 * Shared proxy utility functions and constants
 */

// import { logger } from "../index.js";

// Allowed headers for OpenAI route
export const ALLOWED_HEADERS = ["content-type"];

// Allowed headers for Anthropic route
export const ANTHROPIC_ALLOWED_HEADERS = [
  "content-type",
  "anthropic-version",
  "anthropic-beta",
  "x-api-key",
];

// Request timeout in milliseconds
export const TIMEOUT_MS = 60000;

// Key prefix for valid API keys
export const KEY_PREFIX = "sk-cp";

/**
 * Forward rate-limit headers from upstream response to client.
 */
export function forwardRateLimitHeaders(
  upstreamRes: Response,
  clientRes: { setHeader: (key: string, value: string) => void },
): void {
  const ratelimitHeaders = [
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ];
  for (const header of ratelimitHeaders) {
    const value = upstreamRes.headers.get(header);
    if (value) {
      clientRes.setHeader(header, value);
    }
  }
}

/**
 * Log proxy response based on status code (info/warn/error).
 * Uses root logger for flat structure.
 */
export function logProxyResponse(
  endpoint: string,
  status: number,
  statusText: string,
): void {
  const logLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const logData = {
    event_message: `${status} - ${statusText}`,
    status,
    statusText,
  };
  //   logger[logLevel](logData);
}

/**
 * Filter request headers based on an allowed list.
 * Handles headers values that may be string, string[], or undefined
 * (from Express Request type).
 */
export function filterHeaders(
  headers: Record<string, string | string[] | undefined>,
  allowed: string[],
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const key of allowed) {
    const value = headers[key.toLowerCase()];
    if (value) {
      filtered[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  return filtered;
}
