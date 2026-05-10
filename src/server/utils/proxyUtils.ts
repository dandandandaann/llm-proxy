/**
 * Shared proxy utility functions and constants
 */

import { ALLOWED_HEADERS, ANTHROPIC_ALLOWED_HEADERS, TIMEOUT_MS, KEY_PREFIX } from '../config.js';

// Re-export for backwards compatibility
export { ALLOWED_HEADERS, ANTHROPIC_ALLOWED_HEADERS, TIMEOUT_MS, KEY_PREFIX };

/**
 * Filter request headers based on an allowed list.
 * Handles headers values that may be string, string[], or undefined
 * (from Express Request type).
 */
export function filterHeaders(
  headers: Record<string, string | string[] | undefined>,
  allowed: string[]
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
