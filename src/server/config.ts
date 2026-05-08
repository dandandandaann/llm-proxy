import 'dotenv/config';

if (!process.env.MINIMAX_API_KEY) {
  console.error('FATAL: MINIMAX_API_KEY environment variable is required');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '7331', 10);
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';

const ALLOWED_HEADERS = ['content-type'];
const ANTHROPIC_ALLOWED_HEADERS = ['content-type', 'anthropic-version', 'anthropic-beta', 'x-api-key'];
const TIMEOUT_MS = 60000;
const KEY_PREFIX = 'sk-cp';

export { PORT, MINIMAX_API_KEY, MINIMAX_BASE_URL, ALLOWED_HEADERS, ANTHROPIC_ALLOWED_HEADERS, TIMEOUT_MS, KEY_PREFIX };