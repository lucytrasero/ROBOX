import { createHmac } from 'crypto';
import { EventType, RoboxEvent, Logger } from '../types';
import { generateId } from '../utils';
import {
  WebhookConfig,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookPayload,
  CreateWebhookOptions,
  UpdateWebhookOptions,
  WebhookDeliveryFilter,
} from './types';

/**
 * Default webhook configuration
 */
const DEFAULT_CONFIG = {
  retryAttempts: 3,
  retryDelayMs: 5000,
  timeoutMs: 10000,
  enabled: true,
};

/**
 * Webhook Manager - handles webhook registration and delivery
 */
export class WebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  // ============================================
  // Webhook Management
  // ============================================

  /**
   * Register a new webhook
   */
  create(options: CreateWebhookOptions): WebhookConfig {
    const now = new Date();

    const webhook: WebhookConfig = {
      id: generateId(),
      url: options.url,
      events: options.events,
      secret: options.secret,
      enabled: options.enabled ?? DEFAULT_CONFIG.enabled,
      retryAttempts: options.retryAttempts ?? DEFAULT_CONFIG.retryAttempts,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_CONFIG.retryDelayMs,
      timeoutMs: options.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
      headers: options.headers,
      createdAt: now,
      updatedAt: now,
    };

    this.webhooks.set(webhook.id, webhook);
    this.logger?.info('Webhook created', { id: webhook.id, url: webhook.url });

    return { ...webhook };
  }

  /**
   * Get webhook by ID
   */
  get(id: string): WebhookConfig | null {
    const webhook = this.webhooks.get(id);
    return webhook ? { ...webhook } : null;
  }

  /**
   * List all webhooks
   */
  list(): WebhookConfig[] {
    return Array.from(this.webhooks.values()).map(w => ({ ...w }));
  }

  /**
   * Update webhook
   */
  update(id: string, options: UpdateWebhookOptions): WebhookConfig | null {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    const updated: WebhookConfig = {
      ...webhook,
      ...options,
      id: webhook.id,
      createdAt: webhook.createdAt,
      updatedAt: new Date(),
    };

    this.webhooks.set(id, updated);
    this.logger?.info('Webhook updated', { id });

    return { ...updated };
  }

  /**
   * Delete webhook
   */
  delete(id: string): boolean {
    const deleted = this.webhooks.delete(id);
    if (deleted) {
      // Cancel any pending retries
      const retryTimeout = this.retryQueue.get(id);
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        this.retryQueue.delete(id);
      }
      this.logger?.info('Webhook deleted', { id });
    }
    return deleted;
  }

  /**
   * Enable webhook
   */
  enable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;

    webhook.enabled = true;
    webhook.updatedAt = new Date();
    return true;
  }

  /**
   * Disable webhook
   */
  disable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;

    webhook.enabled = false;
    webhook.updatedAt = new Date();
    return true;
  }

  // ============================================
  // Event Dispatching
  // ============================================

  /**
   * Dispatch event to all matching webhooks
   */
  async dispatch(event: RoboxEvent): Promise<void> {
    const matchingWebhooks = this.getMatchingWebhooks(event.type);

    await Promise.all(
      matchingWebhooks.map(webhook => this.deliver(webhook, event))
    );
  }

  /**
   * Get webhooks that match an event type
   */
  private getMatchingWebhooks(eventType: EventType): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(webhook => {
      if (!webhook.enabled) return false;
      return webhook.events.includes('*') || webhook.events.includes(eventType);
    });
  }

  /**
   * Deliver event to a specific webhook
   */
  private async deliver(webhook: WebhookConfig, event: RoboxEvent): Promise<void> {
    const delivery: WebhookDelivery = {
      id: generateId(),
      webhookId: webhook.id,
      event: event.type,
      payload: event.data,
      status: WebhookDeliveryStatus.PENDING,
      attempts: 0,
      createdAt: new Date(),
    };

    this.deliveries.set(delivery.id, delivery);

    await this.attemptDelivery(webhook, delivery, event);
  }

  /**
   * Attempt to deliver webhook
   */
  private async attemptDelivery(
    webhook: WebhookConfig,
    delivery: WebhookDelivery,
    event: RoboxEvent
  ): Promise<void> {
    delivery.attempts++;

    const payload = this.buildPayload(webhook, event);

    try {
      const response = await this.sendRequest(webhook, payload);

      delivery.status = WebhookDeliveryStatus.SUCCESS;
      delivery.statusCode = response.status;
      delivery.response = response.body;
      delivery.completedAt = new Date();

      this.logger?.info('Webhook delivered', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        status: response.status,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger?.warn('Webhook delivery failed', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        attempt: delivery.attempts,
        error: errorMessage,
      });

      if (delivery.attempts < webhook.retryAttempts) {
        // Schedule retry
        delivery.status = WebhookDeliveryStatus.RETRYING;
        delivery.error = errorMessage;
        delivery.nextRetryAt = new Date(Date.now() + webhook.retryDelayMs * delivery.attempts);

        const timeout = setTimeout(
          () => this.attemptDelivery(webhook, delivery, event),
          webhook.retryDelayMs * delivery.attempts
        );

        this.retryQueue.set(delivery.id, timeout);
      } else {
        // Max retries reached
        delivery.status = WebhookDeliveryStatus.FAILED;
        delivery.error = errorMessage;
        delivery.completedAt = new Date();

        this.logger?.error('Webhook delivery permanently failed', {
          deliveryId: delivery.id,
          webhookId: webhook.id,
          attempts: delivery.attempts,
        });
      }
    }
  }

  /**
   * Build webhook payload
   */
  private buildPayload(webhook: WebhookConfig, event: RoboxEvent): WebhookPayload {
    const payload: WebhookPayload = {
      id: generateId(),
      event: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
    };

    if (webhook.secret) {
      payload.signature = this.signPayload(payload, webhook.secret);
    }

    return payload;
  }

  /**
   * Sign payload with HMAC-SHA256
   */
  private signPayload(payload: WebhookPayload, secret: string): string {
    const data = JSON.stringify({
      id: payload.id,
      event: payload.event,
      data: payload.data,
      timestamp: payload.timestamp,
    });

    return createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Send HTTP request to webhook URL
   */
  private async sendRequest(
    webhook: WebhookConfig,
    payload: WebhookPayload
  ): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RoboxClearing/1.0',
          'X-Webhook-ID': webhook.id,
          'X-Delivery-ID': payload.id,
          'X-Event-Type': payload.event,
          ...(payload.signature && { 'X-Signature': payload.signature }),
          ...webhook.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      return { status: response.status, body };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ============================================
  // Delivery History
  // ============================================

  /**
   * Get delivery by ID
   */
  getDelivery(id: string): WebhookDelivery | null {
    const delivery = this.deliveries.get(id);
    return delivery ? { ...delivery } : null;
  }

  /**
   * List deliveries with filter
   */
  listDeliveries(filter?: WebhookDeliveryFilter): WebhookDelivery[] {
    let results = Array.from(this.deliveries.values());

    if (filter) {
      if (filter.webhookId) {
        results = results.filter(d => d.webhookId === filter.webhookId);
      }
      if (filter.status) {
        results = results.filter(d => d.status === filter.status);
      }
      if (filter.event) {
        results = results.filter(d => d.event === filter.event);
      }
      if (filter.fromDate) {
        results = results.filter(d => d.createdAt >= filter.fromDate!);
      }
      if (filter.toDate) {
        results = results.filter(d => d.createdAt <= filter.toDate!);
      }

      // Sort by date descending
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map(d => ({ ...d }));
  }

  /**
   * Retry a failed delivery manually
   */
  async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.status !== WebhookDeliveryStatus.FAILED) {
      return false;
    }

    const webhook = this.webhooks.get(delivery.webhookId);
    if (!webhook) {
      return false;
    }

    // Reset delivery for retry
    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.attempts = 0;
    delivery.error = undefined;
    delivery.completedAt = undefined;

    const event: RoboxEvent = {
      type: delivery.event,
      data: delivery.payload,
      timestamp: new Date(),
    };

    await this.attemptDelivery(webhook, delivery, event);
    return true;
  }

  // ============================================
  // Utility
  // ============================================

  /**
   * Get statistics
   */
  getStats(): {
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
  } {
    const deliveries = Array.from(this.deliveries.values());

    return {
      totalWebhooks: this.webhooks.size,
      activeWebhooks: Array.from(this.webhooks.values()).filter(w => w.enabled).length,
      totalDeliveries: deliveries.length,
      successfulDeliveries: deliveries.filter(d => d.status === WebhookDeliveryStatus.SUCCESS).length,
      failedDeliveries: deliveries.filter(d => d.status === WebhookDeliveryStatus.FAILED).length,
      pendingDeliveries: deliveries.filter(
        d => d.status === WebhookDeliveryStatus.PENDING || d.status === WebhookDeliveryStatus.RETRYING
      ).length,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    // Clear retry timers
    for (const timeout of this.retryQueue.values()) {
      clearTimeout(timeout);
    }

    this.webhooks.clear();
    this.deliveries.clear();
    this.retryQueue.clear();
  }

  /**
   * Verify webhook signature (for receiving webhooks)
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
  }
}