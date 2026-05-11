# Minimax Token Plan Proxy

A local proxy server that enables AI coding tools to use the Minimax Token Plan API from any network via OpenAI or Anthropic-compatible endpoints.

## Features

- **Dual API compatibility** - OpenAI (`/openai/v1/chat/completions`) and Anthropic (`/anthropic/v1/messages`) endpoints
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
API Endpoint: http://localhost:7331/openai/v1/chat/completions
API Key: sk-cp:your_minimax_key
```

### Endpoints

| Method | Path                          | Description                |
| ------ | ----------------------------- | -------------------------- |
| `GET`  | `/health`                     | Health check               |
| `POST` | `/openai/v1/chat/completions` | OpenAI-compatible proxy    |
| `POST` | `/anthropic/v1/messages`      | Anthropic-compatible proxy |

### Status Page

Open `http://localhost:7331` in your browser to see the status page. Polling automatically pauses when the tab is hidden.

## Configuration

| Variable                | Default    | Description                                         |
| ----------------------- | ---------- | --------------------------------------------------- |
| `PORT`                  | 7331       | Server port                                         |
| `MINIMAX_API_KEY`       | (required) | Minimax API key - fails startup if missing          |
| `CORS_ORIGIN`           | `*`        | CORS origins (comma-separated or `null` to disable) |
| `RATE_LIMIT_MAX`        | 100        | Max requests per window per IP                      |
| `RATE_LIMIT_WINDOW_MS`  | 900000     | Rate limit window (15 min default)                  |
| `LOGFLARE_API_KEY`      | -          | Logflare API key for log streaming                  |
| `LOGFLARE_SOURCE_TOKEN` | -          | Logflare source token                               |

## Security Notes

- API keys must use `sk-cp:` prefix
- CORS is wildcard by default; restrict with `CORS_ORIGIN` for production
- Rate limiting enabled by default (100 req/15min per IP)
- Helmet security headers applied to all responses

## Termux (Android)

### Prerequisites

```bash
pkg update && pkg upgrade -y
pkg install nodejs git
```

### Clone and Setup

```bash
git clone https://github.com/your-user/llm-proxy.git
cd llm-proxy
npm install
```

### Cloudflare Tunnel Setup

```bash
# Install cloudflared
pkg install cloudflared

# Authenticate (opens browser to authorize)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create <tunnel-name>

# Create config file
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
ingress:
  - hostname: proxy.example.com
    service: http://localhost:7331
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns <tunnel-name> proxy.example.com

# Run tunnel in background
nohup cloudflared tunnel run <tunnel-name> > cloudflared.log 2>&1 &
```

### Build and Run

```bash
# Create production script if needed (add to package.json)
# "prod": "tsx src/server/index.ts"

# Run proxy (from ~/llm-proxy directory)
pm2 start npm --name "llm-proxy" -- run prod
```

### Useful Commands

```bash
# Health check
curl https://proxy.example.com/health

# Test POST
curl -X POST https://proxy.example.com/anthropic/v1/messages -H "Content-Type: application/json" -H "x-api-key: sk-cp-test" -H "anthropic-version: 2023-06-01" -d '{"model":"MiniMax-M2.7","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'

# PM2 status and logs
pm2 list
pm2 logs llm-proxy --lines 20
pm2 flush

# Stop cloudflared
pkill cloudflared

# Start everything after phone reboot
cd ~/llm-proxy
nohup cloudflared tunnel run <tunnel-name> > cloudflared.log 2>&1 &
pm2 start npm --name "llm-proxy" -- run prod
```
