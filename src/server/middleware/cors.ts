import cors from 'cors';

const envOrigin = process.env.CORS_ORIGIN;

let origin: string | string[] | false = '*';
if (envOrigin !== undefined) {
  if (envOrigin === 'null') {
    origin = false;
  } else if (envOrigin.includes(',')) {
    origin = envOrigin.split(',').map(s => s.trim());
  } else {
    origin = envOrigin;
  }
}

const corsMiddleware = cors({
  origin,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'anthropic-version', 'anthropic-beta'],
});

export { corsMiddleware };