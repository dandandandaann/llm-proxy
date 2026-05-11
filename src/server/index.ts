import express from "express";
import pinoHttp from "pino-http";
import pino from "pino";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { PORT } from "./config.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { anthropicRouter } from "./routes/anthropic.js";
import { openaiRouter } from "./routes/openai.js";

// Create logger - defaults to stdout JSON, or Logflare if configured
const logflareApiKey = process.env.LOGFLARE_API_KEY;
const logflareSourceToken = process.env.LOGFLARE_SOURCE_TOKEN;

let logger: pino.Logger;

if (logflareApiKey && logflareSourceToken) {
  const transport = pino.transport({
    target: "pino-logflare",
    options: {
      apiKey: logflareApiKey,
      sourceToken: logflareSourceToken,
    },
  });
  logger = pino({ level: "info" }, transport);
} else {
  logger = pino({ level: "info" });
}

export { logger };

// Rate limiter middleware
console.log(parseInt(process.env.RATE_LIMIT_MAX || "100", 10));
console.log(parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10));
const rateLimiter = rateLimit({
  max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      { req: { method: req.method, url: req.path } },
      "Rate limit exceeded",
    );
    res.status(429).json({
      error: {
        message: "Too many requests",
        type: "rate_limit_error",
        status: 429,
      },
    });
  },
});

const app = express();

// Trust first proxy (for X-Forwarded-For behind reverse proxy)
app.set("trust proxy", 1);

// Correlation ID middleware
app.use((req, res, next) => {
  const correlationId =
    (req.headers["x-correlation-id"] as string) || crypto.randomUUID();
  res.setHeader("X-Correlation-ID", correlationId);
  req.headers["x-correlation-id"] = correlationId;
  next();
});

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);
app.use(helmet());
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: (_req, res, _responseTime) => {
      return `${res.statusCode} - ${res.req.method} ${res.req.url}`;
    },
    customErrorMessage: (_req, res, _err) => {
      return `${res.statusCode} - ${res.req.method} ${res.req.url}`;
    },
    customProps: () => ({
      pid: process.pid,
    }),
    serializers: {
      req: (req: {
        id: number;
        method: string;
        url: string;
        remoteAddress: string;
        remotePort: number;
        headers: Record<string, unknown>;
      }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
        headers: {
          "x-correlation-id": req.headers["x-correlation-id"] as
            | string
            | undefined,
          "content-type": req.headers["content-type"] as string | undefined,
          "user-agent": req.headers["user-agent"] as string | undefined,
          host: req.headers.host as string | undefined,
        },
      }),
      res: (res: { statusCode: number; headers: Record<string, unknown> }) => ({
        statusCode: res.statusCode,
        headers: {
          "ratelimit-limit": res.headers["x-ratelimit-limit"] as
            | string
            | undefined,
          "ratelimit-remaining": res.headers["x-ratelimit-remaining"] as
            | string
            | undefined,
          "ratelimit-reset": res.headers["x-ratelimit-reset"] as
            | string
            | undefined,
          "strict-transport-security": res.headers[
            "strict-transport-security"
          ] as string | undefined,
          "x-correlation-id": res.headers["x-correlation-id"] as
            | string
            | undefined,
        },
      }),
    },
  }),
);
app.use(rateLimiter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proxy routes
app.use("/anthropic", anthropicRouter);
app.use("/openai", openaiRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Minimax Proxy running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown handler
const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

// Register shutdown handlers
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
