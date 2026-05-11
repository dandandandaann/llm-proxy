import "dotenv/config";
import pino from "pino";
import { createWriteStream, defaultPreparePayload } from "pino-logflare";

// Create logger - defaults to stdout JSON, or Logflare if configured
const logflareApiKey = process.env.LOGFLARE_API_KEY;
const logflareSourceToken = process.env.LOGFLARE_SOURCE_TOKEN;

let logger: ReturnType<typeof pino>;

if (logflareApiKey && logflareSourceToken) {
  // Use pino-logflare with custom payload transformation
  const stream = createWriteStream({
    apiKey: logflareApiKey,
    sourceToken: logflareSourceToken,
    onPreparePayload: (payload, meta) => {
      const item = defaultPreparePayload(payload, meta) as {
        message?: string;
        metadata: {
          context?: { host?: string; pid?: string };
          level?: string;
          logTime?: string;
          [key: string]: unknown;
        };
      };
      const { context, time: _time, ...restMetadata } = item.metadata;
      return {
        ...restMetadata,
        event_message: item.message,
        logTime: item.metadata.logTime,
        host_info: {
          host: context?.host,
          pid: context?.pid ? Number(context.pid) : undefined,
        },
      };
    },
  });
  logger = pino(stream);
} else {
  // Default stdout JSON logger
  logger = pino();
}

export { logger };
