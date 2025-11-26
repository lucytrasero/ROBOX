import type { Middleware, MiddlewareContext, Logger } from '../types';

/**
 * Compose multiple middleware into one
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async (ctx: MiddlewareContext, next: () => Promise<void>) => {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const middleware = middlewares[i];
      if (i === middlewares.length) {
        await next();
      } else if (middleware) {
        await middleware(ctx, () => dispatch(i + 1));
      }
    };

    await dispatch(0);
  };
}

/**
 * Logging middleware
 */
export function loggingMiddleware(logger: Logger): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    logger.info(`[START] ${ctx.action}`, { params: ctx.params });

    try {
      await next();
      const duration = Date.now() - start;
      logger.info(`[END] ${ctx.action}`, { duration: `${duration}ms` });
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`[ERROR] ${ctx.action}`, {
        duration: `${duration}ms`,
        error: (error as Error).message,
      });
      throw error;
    }
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(
  maxRequests: number,
  windowMs: number
): Middleware {
  const requests: Map<string, number[]> = new Map();

  return async (ctx, next) => {
    const key = ctx.actor?.id || 'anonymous';
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = requests.get(key) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= maxRequests) {
      throw new Error('Rate limit exceeded');
    }

    timestamps.push(now);
    requests.set(key, timestamps);

    await next();
  };
}

/**
 * Validation middleware
 */
export function validationMiddleware(
  validators: Record<string, (params: Record<string, unknown>) => void>
): Middleware {
  return async (ctx, next) => {
    const validator = validators[ctx.action];
    if (validator) {
      validator(ctx.params);
    }
    await next();
  };
}

/**
 * Timing middleware (adds timing info to context)
 */
export function timingMiddleware(): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    (ctx as unknown as Record<string, unknown>).startTime = start;

    await next();

    (ctx as unknown as Record<string, unknown>).duration = Date.now() - start;
  };
}

/**
 * Error handling middleware
 */
export function errorMiddleware(
  handler: (error: Error, ctx: MiddlewareContext) => void | Promise<void>
): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      await handler(error as Error, ctx);
      throw error;
    }
  };
}

/**
 * Conditional middleware - only runs if condition is true
 */
export function conditionalMiddleware(
  condition: (ctx: MiddlewareContext) => boolean,
  middleware: Middleware
): Middleware {
  return async (ctx, next) => {
    if (condition(ctx)) {
      await middleware(ctx, next);
    } else {
      await next();
    }
  };
}
