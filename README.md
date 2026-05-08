# Minimax Token Plan Proxy

A local proxy server that enables AI coding tools to use the Minimax Token Plan API from any network via OpenAI or Anthropic-compatible endpoints.

## Features

- **Dual API compatibility** - OpenAI (`/v1/chat/completions`) and Anthropic (`/anthropic/v1/messages`) endpoints
- **Transparent proxy** - Pass-through requests with header filtering
- **Security** - Helmet security headers, configurable CORS, rate limiting
- **Observability** - Structured logging with Logflare support, request correlation IDs
- **Streaming support** - Pass-through streaming for real-time responses
- **Graceful shutdown** - Clean SIGTERM/SIGINT handling
- **Status page** - Browser UI with visibility-aware polling

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Configure environment variables in `.env`:
   ```
   MINIMAX_API_KEY=your_minimax_token_plan_key
   LOGFLARE_API_KEY=your_logflare_api_key        # optional
   LOGFLARE_SOURCE_TOKEN=your_logflare_source_token  # optional
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the server:
   ```bash
   npm run dev
   ```

## Usage

### Start Server

```bash
npm run dev
```

The server starts on `http://localhost:7331` by default.

### Configure AI Tools

**Anthropic-compatible (Claude Desktop, etc.):**
```
API Endpoint: http://localhost:7331/anthropic/v1/messages
API Key: sk-cp:your_minimax_key
```

**OpenAI-compatible (Cursor, Windsurf, etc.):**
```
API Endpoint: http://localhost:7331/v1/chat/completions
API Key: sk-cp:your_minimax_key
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/v1/chat/completions` | OpenAI-compatible proxy |
| `POST` | `/anthropic/v1/messages` | Anthropic-compatible proxy |

### Status Page

Open `http://localhost:7331` in your browser to see the status page. Polling automatically pauses when the tab is hidden.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7331 | Server port |
| `MINIMAX_API_KEY` | (required) | Minimax API key - fails startup if missing |
| `CORS_ORIGIN` | `*` | CORS origins (comma-separated or `null` to disable) |
| `RATE_LIMIT_MAX` | 100 | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Rate limit window (15 min default) |
| `LOGFLARE_API_KEY` | - | Logflare API key for log streaming |
| `LOGFLARE_SOURCE_TOKEN` | - | Logflare source token |

## Security Notes

- API keys must use `sk-cp:` prefix
- CORS is wildcard by default; restrict with `CORS_ORIGIN` for production
- Rate limiting enabled by default (100 req/15min per IP)
- Helmet security headers applied to all responses