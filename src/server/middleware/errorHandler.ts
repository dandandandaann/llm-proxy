import { Request, Response, NextFunction } from "express";
// import { logger } from "../index.js";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

function redactAuthHeader(header: string | undefined): string {
  if (!header) return "none";
  if (header.startsWith("Bearer ")) {
    return "Bearer ***";
  }
  return "***";
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.headers["x-correlation-id"] as string | undefined;
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Server Error" : err.message;

  res.status(statusCode).json({
    error: message,
    status: statusCode,
    ...(correlationId && { correlationId }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: "Not Found",
    status: 404,
  });
}
