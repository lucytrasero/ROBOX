import type {
  RateLimitConfig,
  RateLimitContext,
  RateLimitResult,
  RateLimitStorage,
} from './types';

/**
 * In-memory rate limit storage
 */
class InMemoryRateLimitStorage implements RateLimitStorage {
  private store = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, window: number): Promise<{ count: number; resetAt: Date }> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + window;
      this.store.set(key, { count: 1, resetAt });
      return { count: 1, resetAt: new Date(resetAt) };
    }

    existing.count++;
    return { count: existing.count, resetAt: new Date(existing.resetAt) };
  }

  async get(key: string): Promise<{ count: number; resetAt: Date } | null> {
    const entry = this.store.get(key);
    if (!entry || entry.resetAt <= Date.now()) {
      return null;
    }
    return { count: entry.count, resetAt: new Date(entry.resetAt) };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Clean expired entries */
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store) {
      if (value.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Rate limiter with sliding window
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private storage: RateLimitStorage;

  constructor(config: RateLimitConfig, storage?: RateLimitStorage) {
    this.config = {
      limit: config.limit,
      window: config.window,
      keyBy: config.keyBy ?? 'robotId',
    };
    this.storage = storage ?? new InMemoryRateLimitStorage();
  }

  /**
   * Extract key from context
   */
  private getKey(ctx: RateLimitContext): string {
    const { keyBy } = this.config;
    
    if (typeof keyBy === 'function') {
      return keyBy(ctx);
    }

    switch (keyBy) {
      case 'robotId':
        return `rl:robot:${ctx.robotId ?? 'anonymous'}`;
      case 'ip':
        return `rl:ip:${ctx.ip ?? 'unknown'}`;
      case 'action':
        return `rl:action:${ctx.action}`;
      default:
        return `rl:${ctx.robotId ?? 'anonymous'}`;
    }
  }

  /**
   * Check if request is allowed
   */
  async check(ctx: RateLimitContext): Promise<RateLimitResult> {
    const key = this.getKey(ctx);
    const { count, resetAt } = await this.storage.increment(key, this.config.window);
    const remaining = Math.max(0, this.config.limit - count);

    return {
      allowed: count <= this.config.limit,
      remaining,
      resetAt,
      limit: this.config.limit,
    };
  }

  /**
   * Get current limit status without incrementing
   */
  async status(ctx: RateLimitContext): Promise<RateLimitResult> {
    const key = this.getKey(ctx);
    const entry = await this.storage.get(key);

    if (!entry) {
      return {
        allowed: true,
        remaining: this.config.limit,
        resetAt: new Date(Date.now() + this.config.window),
        limit: this.config.limit,
      };
    }

    const remaining = Math.max(0, this.config.limit - entry.count);
    return {
      allowed: remaining > 0,
      remaining,
      resetAt: entry.resetAt,
      limit: this.config.limit,
    };
  }

  /**
   * Reset limit for context
   */
  async reset(ctx: RateLimitContext): Promise<void> {
    const key = this.getKey(ctx);
    await this.storage.reset(key);
  }
}

// Export default in-memory storage for external use
export { InMemoryRateLimitStorage };
