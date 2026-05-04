import cors from 'cors';

const corsMiddleware = cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'anthropic-version', 'anthropic-beta'],
});

export { corsMiddleware };