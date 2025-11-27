import type { Request, Response, NextFunction, Router } from 'express';
import type { RoboxLayer } from '../RoboxLayer';
import type { RobotAccount } from '../types';

/**
 * Extended Express Request with robot account
 */
export interface RoboxRequest extends Request {
  robot?: RobotAccount;
  robox?: RoboxLayer;
}

/**
 * API Router configuration
 */
export interface RoboxRouterOptions {
  robox: RoboxLayer;
  apiKeyHeader?: string;
  apiKeyQuery?: string;
  enableCors?: boolean;
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp: string;
}

/**
 * Middleware function type
 */
export type RoboxMiddleware = (
  req: RoboxRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;
