/**
 * Shared authentication utilities for proxy routes
 */

import { MINIMAX_API_KEY } from "../config.js";
import { KEY_PREFIX } from "./proxyUtils.js";

export interface AuthHeaderOptions {
  authHeader?: string;
  xApiKey?: string;
}

/**
 * Extract and validate API key from request headers.
 * Supports both Bearer token and x-api-key header formats.
 * Falls back to MINIMAX_API_KEY environment configuration.
 */
export function getAuthHeader(options: AuthHeaderOptions): string | null {
  let providedKey: string | null = null;

  if (options.authHeader?.startsWith("Bearer ")) {
    providedKey = options.authHeader.substring(7);
  } else if (options.xApiKey) {
    providedKey = options.xApiKey;
  }

  if (providedKey?.startsWith(KEY_PREFIX)) {
    return `Bearer ${providedKey}`;
  }

  if (MINIMAX_API_KEY) {
    return `Bearer ${MINIMAX_API_KEY}`;
  }

  return null;
}