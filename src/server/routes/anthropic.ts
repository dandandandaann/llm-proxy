import { Router } from 'express';
import { MINIMAX_API_KEY, MINIMAX_BASE_URL } from '../config.js';

export const anthropicRouter = Router();

const ALLOWED_HEADERS = [
  'content-type',
  'anthropic-version',
  'anthropic-beta',
  'x-api-key',
];

const TIMEOUT_MS = 60000;

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
    res.status(401).json({ error: 'Unauthorized: No API key provided' });
    return;
  }

  const targetUrl = `${MINIMAX_BASE_URL}/v1/messages`;

  // Build headers - only allowed ones
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

    // Pass through status
    res.status(fetchRes.status);

    // Stream response back
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
      res.status(504).json({ error: 'Gateway Timeout: Minimax API did not respond' });
    } else {
      res.status(502).json({ error: 'Bad Gateway: Could not connect to Minimax' });
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