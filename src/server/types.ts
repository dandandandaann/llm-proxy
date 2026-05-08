/**
 * Error response types compatible with both OpenAI and Anthropic formats.
 *
 * OpenAI format: { error: { message, type } }
 * Anthropic format: { error: 'message' } or { error: { message, type, status } }
 */
export interface ErrorResponse {
  message: string;
  type?: string;
  status?: number;
}

export class ProxyError extends Error implements ErrorResponse {
  type: string;
  status: number;
  constructor(message: string, type: string, status: number) {
    super(message);
    this.type = type;
    this.status = status;
  }
}