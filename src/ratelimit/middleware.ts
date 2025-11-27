import type { Middleware, MiddlewareContext } from '../types';
import type { RateLimitConfig } from './types';
import { RateLimiter } from './RateLimiter';

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends Error {
  public readonly code = 'RATE_LIMIT_EXCEEDED';
  public readonly remaining: number;
  public readonly resetAt: Date;
  public readonly limit: number;

  constructor(result: { remaining: number; resetAt: Date; limit: number }) {
    super(`Rate limit exceeded. Retry after ${result.resetAt.toISOString()}`);
    this.name = 'RateLimitExceededError';
    this.remaining = result.remaining;
    this.resetAt = result.resetAt;
    this.limit = result.limit;
  }
}

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions extends RateLimitConfig {
  /** Actions to apply rate limiting (empty = all) */
  actions?: string[];
  /** Skip rate limiting for these robot IDs */
  whitelist?: string[];
  /** Custom error handler */
  onLimitExceeded?: (ctx: MiddlewareContext, result: { remaining: number; resetAt: Date }) => void;
}

/**
 * Creates rate limiting middleware
 */
export function rateLimitMiddleware(options: RateLimitMiddlewareOptions): Middleware {
  const limiter = new RateLimiter(options);
  const actions = options.actions ? new Set(options.actions) : null;
  const whitelist = options.whitelist ? new Set(options.whitelist) : null;

  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    // Skip if action not in list
    if (actions && !actions.has(ctx.action)) {
      return next();
    }

    // Skip whitelisted robots
    const robotId = (ctx.params.from as string) ?? (ctx.params.robotId as string) ?? ctx.actor?.id;
    if (whitelist && robotId && whitelist.has(robotId)) {
      return next();
    }

    const result = await limiter.check({
      robotId,
      action: ctx.action,
    });

    if (!result.allowed) {
      if (options.onLimitExceeded) {
        options.onLimitExceeded(ctx, result);
      }
      throw new RateLimitExceededError(result);
    }

    return next();
  };
}

/**
 * Per-action rate limit middleware
 */
export function perActionRateLimit(
  limits: Record<string, RateLimitConfig>
): Middleware {
  const limiters = new Map<string, RateLimiter>();

  for (const [action, config] of Object.entries(limits)) {
    limiters.set(action, new RateLimiter({ ...config, keyBy: 'robotId' }));
  }

  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    const limiter = limiters.get(ctx.action);
    if (!limiter) {
      return next();
    }

    const robotId = (ctx.params.from as string) ?? (ctx.params.robotId as string) ?? ctx.actor?.id;
    const result = await limiter.check({ robotId, action: ctx.action });

    if (!result.allowed) {
      throw new RateLimitExceededError(result);
    }

    return next();
  };
}
