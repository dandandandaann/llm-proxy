/**
 * Shared authentication utilities for proxy routes
 */

import { MINIMAX_API_KEY } from "../config.js";

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

  // If a key is provided, use it (whether or not it has the expected prefix)
  // The upstream API will validate if it's actually valid
  if (providedKey) {
    return `Bearer ${providedKey}`;
  }

  // Fall back to configured key
  if (MINIMAX_API_KEY) {
    return `Bearer ${MINIMAX_API_KEY}`;
  }

  return null;
}