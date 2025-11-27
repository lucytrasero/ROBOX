import { createHmac, timingSafeEqual } from 'crypto';
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
  WebhookFilter,
  TestWebhookOptions,
  TestWebhookResult,
  WebhookHealth,
  BatchWebhookResult,
  WebhookEventContext,
  WebhookStats,
  WebhookValidationResult,
} from './types';

/**
 * Default webhook configuration
 */
const DEFAULT_CONFIG = {
  retryAttempts: 3,
  retryDelayMs: 5000,
  timeoutMs: 10000,
  enabled: true,
  rateLimitPerMinute: 60,
  autoDisableAfterFailures: 10,
};

/**
 * Rate limit tracking
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Webhook Manager - handles webhook registration and delivery
 * 
 * Features:
 * - Create, read, update, delete webhooks
 * - Event filtering by type, robot ID, amount thresholds
 * - Automatic retries with exponential backoff
 * - Rate limiting per webhook
 * - Auto-disable on consecutive failures
 * - Delivery history and statistics
 * - Signature verification (HMAC-SHA256)
 * - Batch operations
 * - Health monitoring
 */
export class WebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private deliveryTimes: Map<string, number[]> = new Map();
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
    // Validate URL
    this.validateUrl(options.url);

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
      name: options.name,
      metadata: options.metadata,
      robotId: options.robotId,
      filterRobotIds: options.filterRobotIds,
      minAmountThreshold: options.minAmountThreshold,
      maxAmountThreshold: options.maxAmountThreshold,
      transactionTypes: options.transactionTypes,
      rateLimitPerMinute: options.rateLimitPerMinute ?? DEFAULT_CONFIG.rateLimitPerMinute,
      autoDisableAfterFailures: options.autoDisableAfterFailures ?? DEFAULT_CONFIG.autoDisableAfterFailures,
      consecutiveFailures: 0,
      totalSuccessCount: 0,
      totalFailureCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.webhooks.set(webhook.id, webhook);
    this.logger?.info('Webhook created', { id: webhook.id, url: webhook.url, name: webhook.name });

    return { ...webhook };
  }

  /**
   * Create multiple webhooks at once
   */
  createBatch(options: CreateWebhookOptions[]): WebhookConfig[] {
    return options.map(opt => this.create(opt));
  }

  /**
   * Get webhook by ID
   */
  get(id: string): WebhookConfig | null {
    const webhook = this.webhooks.get(id);
    return webhook ? { ...webhook } : null;
  }

  /**
   * Get webhook by URL (useful for checking duplicates)
   */
  getByUrl(url: string): WebhookConfig | null {
    for (const webhook of this.webhooks.values()) {
      if (webhook.url === url) {
        return { ...webhook };
      }
    }
    return null;
  }

  /**
   * List all webhooks
   */
  list(filter?: WebhookFilter): WebhookConfig[] {
    let results = Array.from(this.webhooks.values());

    if (filter) {
      if (filter.robotId !== undefined) {
        results = results.filter(w => w.robotId === filter.robotId);
      }
      if (filter.enabled !== undefined) {
        results = results.filter(w => w.enabled === filter.enabled);
      }
      if (filter.event !== undefined) {
        results = results.filter(w => 
          w.events.includes('*') || w.events.includes(filter.event!)
        );
      }
      if (filter.nameContains) {
        const searchLower = filter.nameContains.toLowerCase();
        results = results.filter(w => 
          w.name?.toLowerCase().includes(searchLower)
        );
      }

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map(w => ({ ...w }));
  }

  /**
   * List webhooks by robot owner
   */
  listByRobot(robotId: string): WebhookConfig[] {
    return this.list({ robotId });
  }

  /**
   * Update webhook
   */
  update(id: string, options: UpdateWebhookOptions): WebhookConfig | null {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    // Validate URL if provided
    if (options.url) {
      this.validateUrl(options.url);
    }

    const updated: WebhookConfig = {
      ...webhook,
      ...options,
      id: webhook.id,
      robotId: webhook.robotId, // Cannot change owner
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
      // Clean up rate limit and timing data
      this.rateLimits.delete(id);
      this.deliveryTimes.delete(id);
      this.logger?.info('Webhook deleted', { id });
    }
    return deleted;
  }

  /**
   * Delete multiple webhooks
   */
  deleteBatch(ids: string[]): BatchWebhookResult[] {
    return ids.map(id => ({
      webhookId: id,
      success: this.delete(id),
    }));
  }

  /**
   * Delete all webhooks for a robot
   */
  deleteByRobot(robotId: string): number {
    const toDelete = this.list({ robotId }).map(w => w.id);
    toDelete.forEach(id => this.delete(id));
    return toDelete.length;
  }

  /**
   * Enable webhook
   */
  enable(id: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;

    webhook.enabled = true;
    webhook.consecutiveFailures = 0; // Reset failures
    webhook.updatedAt = new Date();
    return true;
  }

  /**
   * Enable multiple webhooks
   */
  enableBatch(ids: string[]): BatchWebhookResult[] {
    return ids.map(id => ({
      webhookId: id,
      success: this.enable(id),
    }));
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

  /**
   * Disable multiple webhooks
   */
  disableBatch(ids: string[]): BatchWebhookResult[] {
    return ids.map(id => ({
      webhookId: id,
      success: this.disable(id),
    }));
  }

  /**
   * Rotate webhook secret
   */
  rotateSecret(id: string, newSecret: string): boolean {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;

    webhook.secret = newSecret;
    webhook.updatedAt = new Date();
    this.logger?.info('Webhook secret rotated', { id });
    return true;
  }

  // ============================================
  // Event Dispatching
  // ============================================

  /**
   * Dispatch event to all matching webhooks
   */
  async dispatch(event: RoboxEvent, context?: WebhookEventContext): Promise<void> {
    const matchingWebhooks = this.getMatchingWebhooks(event.type, context);

    await Promise.all(
      matchingWebhooks.map(webhook => this.deliver(webhook, event))
    );
  }

  /**
   * Dispatch event to a specific webhook (bypass filters)
   */
  async dispatchTo(webhookId: string, event: RoboxEvent): Promise<boolean> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || !webhook.enabled) {
      return false;
    }

    await this.deliver(webhook, event);
    return true;
  }

  /**
   * Get webhooks that match an event type and context
   */
  private getMatchingWebhooks(eventType: EventType, context?: WebhookEventContext): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(webhook => {
      // Must be enabled
      if (!webhook.enabled) return false;

      // Must match event type
      if (!webhook.events.includes('*') && !webhook.events.includes(eventType)) {
        return false;
      }

      // Apply context filters if provided
      if (context) {
        // Robot ID filter
        if (webhook.filterRobotIds && webhook.filterRobotIds.length > 0) {
          const matchesRobot = 
            (context.robotId && webhook.filterRobotIds.includes(context.robotId)) ||
            (context.fromRobotId && webhook.filterRobotIds.includes(context.fromRobotId)) ||
            (context.toRobotId && webhook.filterRobotIds.includes(context.toRobotId));
          if (!matchesRobot) return false;
        }

        // Amount threshold filters
        if (context.amount !== undefined) {
          if (webhook.minAmountThreshold !== undefined && context.amount < webhook.minAmountThreshold) {
            return false;
          }
          if (webhook.maxAmountThreshold !== undefined && context.amount > webhook.maxAmountThreshold) {
            return false;
          }
        }

        // Transaction type filter
        if (webhook.transactionTypes && webhook.transactionTypes.length > 0) {
          if (context.transactionType && !webhook.transactionTypes.includes(context.transactionType)) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Deliver event to a specific webhook
   */
  private async deliver(webhook: WebhookConfig, event: RoboxEvent): Promise<void> {
    // Check rate limit
    if (!this.checkRateLimit(webhook)) {
      const delivery: WebhookDelivery = {
        id: generateId(),
        webhookId: webhook.id,
        event: event.type,
        payload: event.data,
        status: WebhookDeliveryStatus.RATE_LIMITED,
        attempts: 0,
        createdAt: new Date(),
        completedAt: new Date(),
        error: 'Rate limit exceeded',
      };
      this.deliveries.set(delivery.id, delivery);
      this.logger?.warn('Webhook rate limited', { webhookId: webhook.id });
      return;
    }

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
    this.incrementRateLimit(webhook.id);

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

    const payload = this.buildPayload(webhook, event, delivery.attempts - 1);
    const startTime = Date.now();

    try {
      const response = await this.sendRequest(webhook, payload);
      const durationMs = Date.now() - startTime;

      delivery.status = WebhookDeliveryStatus.SUCCESS;
      delivery.statusCode = response.status;
      delivery.response = response.body;
      delivery.completedAt = new Date();
      delivery.durationMs = durationMs;
      delivery.requestSize = JSON.stringify(payload).length;
      delivery.responseSize = response.body.length;

      // Update webhook stats
      this.recordDeliverySuccess(webhook, durationMs);

      this.logger?.info('Webhook delivered', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        status: response.status,
        durationMs,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const durationMs = Date.now() - startTime;
      delivery.durationMs = durationMs;

      this.logger?.warn('Webhook delivery failed', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        attempt: delivery.attempts,
        error: errorMessage,
      });

      if (delivery.attempts < webhook.retryAttempts) {
        // Schedule retry with exponential backoff
        delivery.status = WebhookDeliveryStatus.RETRYING;
        delivery.error = errorMessage;
        const backoffMultiplier = Math.pow(2, delivery.attempts - 1);
        const delay = webhook.retryDelayMs * backoffMultiplier;
        delivery.nextRetryAt = new Date(Date.now() + delay);

        const timeout = setTimeout(
          () => this.attemptDelivery(webhook, delivery, event),
          delay
        );

        this.retryQueue.set(delivery.id, timeout);
      } else {
        // Max retries reached
        delivery.status = WebhookDeliveryStatus.FAILED;
        delivery.error = errorMessage;
        delivery.completedAt = new Date();

        // Record failure and potentially auto-disable
        this.recordDeliveryFailure(webhook);

        this.logger?.error('Webhook delivery permanently failed', {
          deliveryId: delivery.id,
          webhookId: webhook.id,
          attempts: delivery.attempts,
        });
      }
    }
  }

  /**
   * Record successful delivery
   */
  private recordDeliverySuccess(webhook: WebhookConfig, durationMs: number): void {
    webhook.consecutiveFailures = 0;
    webhook.lastSuccessAt = new Date();
    webhook.totalSuccessCount = (webhook.totalSuccessCount ?? 0) + 1;

    // Track response times for average calculation
    let times = this.deliveryTimes.get(webhook.id) ?? [];
    times.push(durationMs);
    // Keep last 100 measurements
    if (times.length > 100) {
      times = times.slice(-100);
    }
    this.deliveryTimes.set(webhook.id, times);
  }

  /**
   * Record failed delivery and check auto-disable
   */
  private recordDeliveryFailure(webhook: WebhookConfig): void {
    webhook.consecutiveFailures = (webhook.consecutiveFailures ?? 0) + 1;
    webhook.lastFailureAt = new Date();
    webhook.totalFailureCount = (webhook.totalFailureCount ?? 0) + 1;

    // Auto-disable if too many consecutive failures
    if (
      webhook.autoDisableAfterFailures &&
      webhook.consecutiveFailures >= webhook.autoDisableAfterFailures
    ) {
      webhook.enabled = false;
      webhook.updatedAt = new Date();
      this.logger?.warn('Webhook auto-disabled due to consecutive failures', {
        webhookId: webhook.id,
        failures: webhook.consecutiveFailures,
      });
    }
  }

  /**
   * Build webhook payload
   */
  private buildPayload(webhook: WebhookConfig, event: RoboxEvent, attemptNumber: number): WebhookPayload {
    const payload: WebhookPayload = {
      id: generateId(),
      event: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
      attemptNumber,
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
      const body = JSON.stringify(payload);
      
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RoboxClearing/1.1',
          'X-Webhook-ID': webhook.id,
          'X-Delivery-ID': payload.id,
          'X-Event-Type': payload.event,
          'X-Timestamp': payload.timestamp,
          ...(payload.signature && { 'X-Signature': payload.signature }),
          ...(payload.attemptNumber !== undefined && { 'X-Attempt-Number': String(payload.attemptNumber) }),
          ...webhook.headers,
        },
        body,
        signal: controller.signal,
      });

      const responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      }

      return { status: response.status, body: responseBody };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Check if webhook is within rate limit
   */
  private checkRateLimit(webhook: WebhookConfig): boolean {
    if (!webhook.rateLimitPerMinute) return true;

    const entry = this.rateLimits.get(webhook.id);
    const now = Date.now();

    if (!entry || now >= entry.resetAt) {
      return true;
    }

    return entry.count < webhook.rateLimitPerMinute;
  }

  /**
   * Increment rate limit counter
   */
  private incrementRateLimit(webhookId: string): void {
    const now = Date.now();
    const resetAt = now + 60000; // 1 minute window

    const entry = this.rateLimits.get(webhookId);
    
    if (!entry || now >= entry.resetAt) {
      this.rateLimits.set(webhookId, { count: 1, resetAt });
    } else {
      entry.count++;
    }
  }

  /**
   * Get current rate limit status for a webhook
   */
  getRateLimitStatus(webhookId: string): { remaining: number; resetAt: Date } | null {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || !webhook.rateLimitPerMinute) return null;

    const entry = this.rateLimits.get(webhookId);
    const now = Date.now();

    if (!entry || now >= entry.resetAt) {
      return {
        remaining: webhook.rateLimitPerMinute,
        resetAt: new Date(now + 60000),
      };
    }

    return {
      remaining: Math.max(0, webhook.rateLimitPerMinute - entry.count),
      resetAt: new Date(entry.resetAt),
    };
  }

  // ============================================
  // Testing & Validation
  // ============================================

  /**
   * Test a webhook by sending a test event
   */
  async test(webhookId: string, options?: TestWebhookOptions): Promise<TestWebhookResult> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      return {
        success: false,
        error: 'Webhook not found',
        durationMs: 0,
      };
    }

    const testEvent: RoboxEvent = {
      type: options?.event ?? EventType.ACCOUNT_CREATED,
      data: options?.data ?? {
        test: true,
        message: 'This is a test webhook delivery',
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
    };

    const payload = this.buildPayload(webhook, testEvent, 0);
    const startTime = Date.now();

    try {
      const response = await this.sendRequest(webhook, payload);
      return {
        success: true,
        statusCode: response.status,
        response: response.body,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate a webhook URL (check if reachable)
   */
  async validateUrl(url: string): Promise<WebhookValidationResult> {
    // Basic URL validation
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          valid: false,
          reachable: false,
          error: 'URL must use HTTP or HTTPS protocol',
        };
      }
    } catch {
      return {
        valid: false,
        reachable: false,
        error: 'Invalid URL format',
      };
    }

    // Try to reach the URL
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      return {
        valid: true,
        reachable: true,
        statusCode: response.status,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        valid: true,
        reachable: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
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
      if (filter.minDurationMs !== undefined) {
        results = results.filter(d => (d.durationMs ?? 0) >= filter.minDurationMs!);
      }
      if (filter.robotId) {
        const webhookIds = this.list({ robotId: filter.robotId }).map(w => w.id);
        results = results.filter(d => webhookIds.includes(d.webhookId));
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
   * Get recent deliveries for a webhook
   */
  getRecentDeliveries(webhookId: string, limit: number = 10): WebhookDelivery[] {
    return this.listDeliveries({ webhookId, limit });
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
    delivery.durationMs = undefined;

    const event: RoboxEvent = {
      type: delivery.event,
      data: delivery.payload,
      timestamp: new Date(),
    };

    await this.attemptDelivery(webhook, delivery, event);
    return true;
  }

  /**
   * Retry all failed deliveries for a webhook
   */
  async retryAllFailed(webhookId: string): Promise<number> {
    const failedDeliveries = this.listDeliveries({
      webhookId,
      status: WebhookDeliveryStatus.FAILED,
    });

    let retried = 0;
    for (const delivery of failedDeliveries) {
      if (await this.retryDelivery(delivery.id)) {
        retried++;
      }
    }

    return retried;
  }

  /**
   * Clear old deliveries
   */
  clearOldDeliveries(olderThan: Date): number {
    let cleared = 0;
    for (const [id, delivery] of this.deliveries) {
      if (delivery.createdAt < olderThan) {
        this.deliveries.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  // ============================================
  // Health & Monitoring
  // ============================================

  /**
   * Get health status for a webhook
   */
  getHealth(webhookId: string): WebhookHealth | null {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return null;

    const totalDeliveries = (webhook.totalSuccessCount ?? 0) + (webhook.totalFailureCount ?? 0);
    const successRate = totalDeliveries > 0
      ? (webhook.totalSuccessCount ?? 0) / totalDeliveries
      : 1;

    const times = this.deliveryTimes.get(webhookId) ?? [];
    const averageResponseTime = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : undefined;

    return {
      id: webhook.id,
      url: webhook.url,
      name: webhook.name,
      enabled: webhook.enabled,
      healthy: webhook.enabled && (webhook.consecutiveFailures ?? 0) < 3,
      consecutiveFailures: webhook.consecutiveFailures ?? 0,
      lastSuccessAt: webhook.lastSuccessAt,
      lastFailureAt: webhook.lastFailureAt,
      successRate,
      averageResponseTime,
    };
  }

  /**
   * Get health status for all webhooks
   */
  getAllHealth(): WebhookHealth[] {
    return Array.from(this.webhooks.keys())
      .map(id => this.getHealth(id))
      .filter((h): h is WebhookHealth => h !== null);
  }

  /**
   * Get unhealthy webhooks
   */
  getUnhealthyWebhooks(): WebhookHealth[] {
    return this.getAllHealth().filter(h => !h.healthy);
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get comprehensive statistics
   */
  getStats(): WebhookStats {
    const deliveries = Array.from(this.deliveries.values());
    const webhooks = Array.from(this.webhooks.values());

    // Calculate deliveries by event
    const deliveriesByEvent: Record<string, number> = {};
    for (const d of deliveries) {
      deliveriesByEvent[d.event] = (deliveriesByEvent[d.event] ?? 0) + 1;
    }

    // Calculate deliveries by status
    const deliveriesByStatus: Record<WebhookDeliveryStatus, number> = {
      [WebhookDeliveryStatus.PENDING]: 0,
      [WebhookDeliveryStatus.SUCCESS]: 0,
      [WebhookDeliveryStatus.FAILED]: 0,
      [WebhookDeliveryStatus.RETRYING]: 0,
      [WebhookDeliveryStatus.SKIPPED]: 0,
      [WebhookDeliveryStatus.RATE_LIMITED]: 0,
    };
    for (const d of deliveries) {
      deliveriesByStatus[d.status]++;
    }

    // Calculate average response time
    const allTimes: number[] = [];
    for (const times of this.deliveryTimes.values()) {
      allTimes.push(...times);
    }
    const averageResponseTime = allTimes.length > 0
      ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length
      : undefined;

    return {
      totalWebhooks: webhooks.length,
      activeWebhooks: webhooks.filter(w => w.enabled).length,
      totalDeliveries: deliveries.length,
      successfulDeliveries: deliveriesByStatus[WebhookDeliveryStatus.SUCCESS],
      failedDeliveries: deliveriesByStatus[WebhookDeliveryStatus.FAILED],
      pendingDeliveries: deliveriesByStatus[WebhookDeliveryStatus.PENDING] + deliveriesByStatus[WebhookDeliveryStatus.RETRYING],
      averageResponseTime,
      deliveriesByEvent,
      deliveriesByStatus,
    };
  }

  // ============================================
  // Utility
  // ============================================

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
    this.rateLimits.clear();
    this.deliveryTimes.clear();
  }

  /**
   * Export all webhooks (for backup)
   */
  export(): WebhookConfig[] {
    return Array.from(this.webhooks.values()).map(w => ({ ...w }));
  }

  /**
   * Import webhooks (from backup)
   */
  import(webhooks: WebhookConfig[]): number {
    let imported = 0;
    for (const webhook of webhooks) {
      if (!this.webhooks.has(webhook.id)) {
        this.webhooks.set(webhook.id, { ...webhook });
        imported++;
      }
    }
    return imported;
  }

  /**
   * Verify webhook signature (static utility for receiving webhooks)
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    
    // Use timing-safe comparison
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  /**
   * Create signature for a payload (static utility)
   */
  static createSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Parse webhook payload from request body
   */
  static parsePayload(body: string | Buffer): WebhookPayload {
    const str = Buffer.isBuffer(body) ? body.toString('utf-8') : body;
    return JSON.parse(str) as WebhookPayload;
  }
}
