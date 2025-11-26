import { v4 as uuidv4 } from 'uuid';

/**
 * Generate unique ID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Validate amount (must be positive number)
 */
export function validateAmount(amount: number, fieldName: string = 'amount'): void {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (amount <= 0) {
    throw new Error(`${fieldName} must be positive`);
  }
  if (!Number.isFinite(amount)) {
    throw new Error(`${fieldName} must be finite`);
  }
}

/**
 * Validate string ID
 */
export function validateId(id: string, fieldName: string = 'id'): void {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Format currency amount
 */
export function formatAmount(amount: number, decimals: number = 2): string {
  return amount.toFixed(decimals);
}

/**
 * Calculate percentage
 */
export function calculatePercentage(amount: number, percentage: number): number {
  return Math.round(amount * percentage / 100);
}

/**
 * Check if date is expired
 */
export function isExpired(date: Date): boolean {
  return new Date() > date;
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a rate limiter
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests: Map<string, number[]> = new Map();

  return {
    check(key: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      let timestamps = requests.get(key) || [];
      timestamps = timestamps.filter(t => t > windowStart);

      if (timestamps.length >= maxRequests) {
        return false;
      }

      timestamps.push(now);
      requests.set(key, timestamps);
      return true;
    },

    reset(key: string): void {
      requests.delete(key);
    },

    clear(): void {
      requests.clear();
    },
  };
}

/**
 * Mask sensitive data for logging
 */
export function maskId(id: string): string {
  if (id.length <= 8) {
    return '***';
  }
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

/**
 * Create hash from string (simple, non-cryptographic)
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
