import 'dotenv/config';

if (!process.env.MINIMAX_API_KEY) {
  console.error('FATAL: MINIMAX_API_KEY environment variable is required');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '7331', 10);
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';
const OPENAI_BASE_URL = 'https://api.minimax.io/v1';

export { PORT, MINIMAX_API_KEY, MINIMAX_BASE_URL, OPENAI_BASE_URL };
export { ALLOWED_HEADERS, ANTHROPIC_ALLOWED_HEADERS, TIMEOUT_MS } from "./utils/proxyUtils.js";