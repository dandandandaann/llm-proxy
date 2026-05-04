import { Router } from 'express';
import { MINIMAX_API_KEY } from '../config.js';

export const openaiRouter = Router();

const ALLOWED_HEADERS = [
  'content-type',
];

const TIMEOUT_MS = 60000;

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
    res.status(401).json({ error: { message: 'Unauthorized: No API key provided', type: 'invalid_request_error' } });
    return;
  }

  const targetUrl = 'https://api.minimax.io/v1/chat/completions';

  const headers: Record<string, string> = {};
  for (const key of ALLOWED_HEADERS) {
    const value = req.headers[key.toLowerCase()];
    if (value) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }
  }
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

    if (fetchRes.body) {
      for await (const chunk of fetchRes.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      res.status(504).json({ error: { message: 'Gateway Timeout: Minimax API did not respond' } });
    } else {
      res.status(502).json({ error: { message: 'Bad Gateway: Could not connect to Minimax' } });
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
