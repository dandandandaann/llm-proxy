# Minimax Token Plan Proxy

A local proxy server that enables AI coding tools to use the Minimax Token Plan API from any network.

## Features

- Transparent proxy for Anthropic-compatible API requests
- Optional default API key fallback from environment
- Simple status page
- CORS enabled for AI tool compatibility
- Streaming support

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Add your Minimax API key to `.env` (optional):
   ```
   MINIMAX_API_KEY=your_minimax_token_plan_key
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

Point your AI coding tool to the proxy:

```
API Endpoint: http://localhost:7331/anthropic/v1/messages
API Key: your_minimax_token_plan_key
```

### Endpoints

- `GET /health` - Health check
- `POST /anthropic/v1/messages` - Proxy to Minimax API

### Status Page

Open `http://localhost:7331` in your browser to see the status page.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7331 | Server port |
| `MINIMAX_API_KEY` | (none) | Optional default API key |