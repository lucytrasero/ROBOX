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
}