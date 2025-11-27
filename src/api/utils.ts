import * as crypto from 'crypto';

/**
 * Generate a secure API key for robot
 * Format: rbx_<48 hex chars>
 */
export function generateApiKey(prefix: string = 'rbx'): string {
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Validate API key format
 */
export function isValidApiKey(apiKey: string, prefix: string = 'rbx'): boolean {
  const regex = new RegExp(`^${prefix}_[a-f0-9]{48}$`);
  return regex.test(apiKey);
}

/**
 * Hash API key for secure storage (optional)
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate robot ID
 */
export function generateRobotId(): string {
  return `bot_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Generate transaction ID
 */
export function generateTransactionId(): string {
  return `tx_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Generate escrow ID
 */
export function generateEscrowId(): string {
  return `esc_${crypto.randomBytes(10).toString('hex')}`;
}
