import { Router } from 'express';
import { MINIMAX_API_KEY } from '../config.js';
import { ProxyError } from '../types.js';
import { filterHeaders, ALLOWED_HEADERS, ANTHROPIC_ALLOWED_HEADERS, TIMEOUT_MS } from '../utils/proxyUtils.js';
import { logger } from '../index.js';

export const openaiRouter = Router();

function getAuthHeader(authHeader: string | undefined): string | null {
  let providedKey: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.substring(7);
  }

  // Use the provided key if it looks like a valid Minimax key
  if (providedKey && providedKey.startsWith('sk-cp')) {
    return `Bearer ${providedKey}`;
  }

  // Fallback to the environment configuration
  if (MINIMAX_API_KEY) {
    return `Bearer ${MINIMAX_API_KEY}`;
  }

  return null;
}

openaiRouter.post('/v1/chat/completions', async (req, res) => {
  const authHeader = getAuthHeader(req.headers.authorization);

  if (!authHeader) {
    res.status(401).json({ error: { message: 'Unauthorized: No API key provided', type: 'invalid_request_error', status: 401 } });
    return;
  }

  const targetUrl = 'https://api.minimax.io/v1/chat/completions';

  const headers = filterHeaders(req.headers, ALLOWED_HEADERS);
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
    res.status(fetchRes.status);

    // Forward rate-limit headers from upstream
    const ratelimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
    for (const header of ratelimitHeaders) {
      const value = fetchRes.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    }

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

openaiRouter.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'MiniMax-M2.7',
        object: 'model',
        created: 1715367400,
        owned_by: 'minimax',
      }
    ]
  });
});
