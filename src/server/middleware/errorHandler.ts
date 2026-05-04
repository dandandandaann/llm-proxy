import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

function redactAuthHeader(header: string | undefined): string {
  if (!header) return 'none';
  if (header.startsWith('Bearer ')) {
    return 'Bearer ***';
  }
  return '***';
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? 'Internal Server Error' : err.message;

  // Log error with redacted auth header
  const authHeader = req.headers.authorization;
  console.error(`[ERROR] ${req.method} ${req.path} - ${statusCode} - ${message}`);
  console.error(`[ERROR] Auth: ${redactAuthHeader(authHeader)}`);

  res.status(statusCode).json({
    error: message,
    status: statusCode,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    status: 404,
  });
}