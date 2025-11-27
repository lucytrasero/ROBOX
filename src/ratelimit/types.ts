/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in milliseconds */
  window: number;
  /** Key extractor (default: by robotId) */
  keyBy?: 'robotId' | 'ip' | 'action' | ((ctx: RateLimitContext) => string);
}

/**
 * Rate limit context
 */
export interface RateLimitContext {
  robotId?: string;
  action: string;
  ip?: string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * Rate limit storage interface
 */
export interface RateLimitStorage {
  increment(key: string, window: number): Promise<{ count: number; resetAt: Date }>;
  get(key: string): Promise<{ count: number; resetAt: Date } | null>;
  reset(key: string): Promise<void>;
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  /** 100 requests per minute */
  standard: { limit: 100, window: 60_000 },
  /** 10 requests per minute */
  strict: { limit: 10, window: 60_000 },
  /** 1000 requests per minute */
  relaxed: { limit: 1000, window: 60_000 },
  /** 5 requests per second */
  burst: { limit: 5, window: 1_000 },
} as const;
