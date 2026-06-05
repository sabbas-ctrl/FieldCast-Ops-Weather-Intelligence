import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function notFoundHandler(request: Request, _response: Response, next: NextFunction) {
  next(new HttpError(404, `Route not found: ${request.method} ${request.path}`));
}

export function routeParam(value: string | string[] | undefined, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `Missing route parameter: ${name}`);
  }

  return value;
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
) {
  if (error instanceof HttpError) {
    return response.status(error.statusCode).json({
      error: error.message,
      details: error.details
    });
  }

  if (error instanceof ZodError) {
    return response.status(400).json({
      error: "Invalid request input",
      details: error.flatten()
    });
  }

  const message = error instanceof Error ? error.message : "Unknown server error";
  return response.status(500).json({
    error: "Internal server error",
    details: process.env.NODE_ENV === "production" ? undefined : message
  });
}
