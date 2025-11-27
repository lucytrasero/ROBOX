import type { EventType } from '../types';

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  id: string;
  url: string;
  events: (EventType | '*')[];
  secret?: string;
  enabled: boolean;
  retryAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
  headers?: Record<string, string>;
  /** Optional name/description for the webhook */
  name?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Robot ID that owns this webhook (for filtering) */
  robotId?: string;
  /** Filter events by specific robot IDs */
  filterRobotIds?: string[];
  /** Minimum amount threshold for transfer events */
  minAmountThreshold?: number;
  /** Maximum amount threshold for transfer events */
  maxAmountThreshold?: number;
  /** Only trigger for specific transaction types */
  transactionTypes?: string[];
  /** Rate limit: max deliveries per minute */
  rateLimitPerMinute?: number;
  /** Auto-disable after N consecutive failures */
  autoDisableAfterFailures?: number;
  /** Current consecutive failure count */
  consecutiveFailures?: number;
  /** Last successful delivery timestamp */
  lastSuccessAt?: Date;
  /** Last failure timestamp */
  lastFailureAt?: Date;
  /** Total successful deliveries */
  totalSuccessCount?: number;
  /** Total failed deliveries */
  totalFailureCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: EventType;
  payload: unknown;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  nextRetryAt?: Date;
  /** Request duration in milliseconds */
  durationMs?: number;
  /** Request size in bytes */
  requestSize?: number;
  /** Response size in bytes */
  responseSize?: number;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Delivery status
 */
export enum WebhookDeliveryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
  SKIPPED = 'SKIPPED',
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * Options for creating webhook
 */
export interface CreateWebhookOptions {
  url: string;
  events: (EventType | '*')[];
  secret?: string;
  enabled?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Optional name/description */
  name?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Robot ID that owns this webhook */
  robotId?: string;
  /** Filter events by specific robot IDs */
  filterRobotIds?: string[];
  /** Minimum amount threshold for transfer events */
  minAmountThreshold?: number;
  /** Maximum amount threshold for transfer events */
  maxAmountThreshold?: number;
  /** Only trigger for specific transaction types */
  transactionTypes?: string[];
  /** Rate limit: max deliveries per minute */
  rateLimitPerMinute?: number;
  /** Auto-disable after N consecutive failures */
  autoDisableAfterFailures?: number;
}

/**
 * Options for updating webhook
 */
export interface UpdateWebhookOptions {
  url?: string;
  events?: (EventType | '*')[];
  secret?: string;
  enabled?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  name?: string;
  metadata?: Record<string, unknown>;
  filterRobotIds?: string[];
  minAmountThreshold?: number;
  maxAmountThreshold?: number;
  transactionTypes?: string[];
  rateLimitPerMinute?: number;
  autoDisableAfterFailures?: number;
}

/**
 * Webhook payload sent to URL
 */
export interface WebhookPayload {
  id: string;
  event: EventType;
  data: unknown;
  timestamp: string;
  signature?: string;
  /** Webhook ID for reference */
  webhookId?: string;
  /** Retry attempt number (0 = first attempt) */
  attemptNumber?: number;
}

/**
 * Webhook delivery filter
 */
export interface WebhookDeliveryFilter {
  webhookId?: string;
  status?: WebhookDeliveryStatus;
  event?: EventType;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
  /** Filter by minimum duration */
  minDurationMs?: number;
  /** Filter by robot ID */
  robotId?: string;
}

/**
 * Webhook filter for listing webhooks
 */
export interface WebhookFilter {
  /** Filter by robot owner */
  robotId?: string;
  /** Filter by enabled status */
  enabled?: boolean;
  /** Filter by event type */
  event?: EventType | '*';
  /** Filter by name (partial match) */
  nameContains?: string;
  limit?: number;
  offset?: number;
}

/**
 * Test webhook options
 */
export interface TestWebhookOptions {
  /** Custom test payload data */
  data?: unknown;
  /** Custom event type for testing */
  event?: EventType;
}

/**
 * Test webhook result
 */
export interface TestWebhookResult {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
  durationMs: number;
}

/**
 * Webhook health status
 */
export interface WebhookHealth {
  id: string;
  url: string;
  name?: string;
  enabled: boolean;
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  successRate: number;
  averageResponseTime?: number;
}

/**
 * Batch webhook operation result
 */
export interface BatchWebhookResult {
  webhookId: string;
  success: boolean;
  error?: string;
}

/**
 * Webhook event context for filtering
 */
export interface WebhookEventContext {
  robotId?: string;
  amount?: number;
  transactionType?: string;
  fromRobotId?: string;
  toRobotId?: string;
}

/**
 * Webhook statistics
 */
export interface WebhookStats {
  totalWebhooks: number;
  activeWebhooks: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  averageResponseTime?: number;
  deliveriesByEvent: Record<string, number>;
  deliveriesByStatus: Record<WebhookDeliveryStatus, number>;
}

/**
 * Webhook endpoint validation result
 */
export interface WebhookValidationResult {
  valid: boolean;
  reachable: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  sslValid?: boolean;
  sslExpiresAt?: Date;
}
