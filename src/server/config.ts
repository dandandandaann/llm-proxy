import 'dotenv/config';

const PORT = parseInt(process.env.PORT || '7331', 10);
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = 'https://api.minimax.io/anthropic';

export { PORT, MINIMAX_API_KEY, MINIMAX_BASE_URL };