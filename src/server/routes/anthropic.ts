import { Router } from 'express';
import { MINIMAX_API_KEY, MINIMAX_BASE_URL } from '../config.js';
import { ProxyError } from '../types.js';
import { filterHeaders, ALLOWED_HEADERS, ANTHROPIC_ALLOWED_HEADERS, TIMEOUT_MS } from '../utils/proxyUtils.js';
import { logger } from '../index.js';

export const anthropicRouter = Router();

function getAuthHeader(authHeader: string | undefined, xApiKey: string | undefined): string | null {
  let providedKey: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.substring(7);
  } else if (xApiKey) {
    providedKey = xApiKey;
  }

  // Use the provided key only if it looks like a valid Minimax key
  if (providedKey && providedKey.startsWith('sk-cp')) {
    return `Bearer ${providedKey}`;
  }

  // Fallback to the environment configuration
  if (MINIMAX_API_KEY) {
    return `Bearer ${MINIMAX_API_KEY}`;
  }

  return null;
}

anthropicRouter.post('/v1/messages', async (req, res) => {
  const authHeader = getAuthHeader(req.headers.authorization, req.headers['x-api-key'] as string);

  // No auth and no default key
  if (!authHeader) {
    res.status(401).json({ error: { message: 'Unauthorized: No API key provided', type: 'invalid_request_error', status: 401 } });
    return;
  }

  const targetUrl = `${MINIMAX_BASE_URL}/v1/messages`;

  // Build headers - only allowed ones
  const headers = filterHeaders(req.headers, ANTHROPIC_ALLOWED_HEADERS);
  headers['Authorization'] = authHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const fetchRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Pass through status
    res.status(fetchRes.status);

    // Forward rate-limit headers from upstream
    const ratelimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
    for (const header of ratelimitHeaders) {
      const value = fetchRes.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    }

    // Stream response back
    if (fetchRes.body) {
      const body = fetchRes.body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error({ err }, 'Upstream timeout');
      res.status(504).json({ error: { message: 'Gateway Timeout: Minimax API did not respond', type: 'timeout_error', status: 504 } });
    } else {
      logger.error({ err }, 'Upstream connection failed');
      res.status(502).json({ error: { message: 'Bad Gateway: Could not connect to Minimax', type: 'upstream_error', status: 502 } });
    }
  }
});

anthropicRouter.get('/v1/models', (req, res) => {
  res.json({
    type: 'list',
    data: [
      {
        type: 'model',
        id: 'MiniMax-M2.7',
        created_at: '2024-05-10T18:56:40Z',
        display_name: 'MiniMax-M2.7',
      }
    ]
  });
});