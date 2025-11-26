import { generateId } from '../utils';
import type { Logger, TransactionType } from '../types';
import {
  ScheduledPayment,
  ScheduledPaymentStatus,
  ScheduleType,
  ScheduleConfig,
  CreateScheduledPaymentOptions,
  UpdateScheduledPaymentOptions,
  ScheduledPaymentFilter,
  ExecutionResult,
} from './types';

/**
 * Transfer executor function type
 */
export type TransferExecutor = (params: {
  from: string;
  to: string;
  amount: number;
  type: TransactionType;
  meta?: Record<string, unknown>;
}) => Promise<{ id: string }>;

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  executor: TransferExecutor;
  checkIntervalMs?: number;
  maxFailures?: number;
  logger?: Logger;
}

/**
 * Scheduler - manages scheduled and recurring payments
 */
export class Scheduler {
  private payments: Map<string, ScheduledPayment> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private executor: TransferExecutor;
  private checkIntervalMs: number;
  private maxFailures: number;
  private logger?: Logger;
  private running: boolean = false;

  constructor(config: SchedulerConfig) {
    this.executor = config.executor;
    this.checkIntervalMs = config.checkIntervalMs ?? 60000; // 1 minute default
    this.maxFailures = config.maxFailures ?? 3;
    this.logger = config.logger;
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;
    
    this.running = true;
    this.checkInterval = setInterval(() => this.checkAndExecute(), this.checkIntervalMs);
    this.logger?.info('Scheduler started', { checkIntervalMs: this.checkIntervalMs });
    
    // Initial check
    this.checkAndExecute();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.running = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    this.logger?.info('Scheduler stopped');
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ============================================
  // Payment Management
  // ============================================

  /**
   * Create a scheduled payment
   */
  create(options: CreateScheduledPaymentOptions): ScheduledPayment {
    const now = new Date();
    const nextExecuteAt = this.calculateNextExecution(options.schedule, now);

    const payment: ScheduledPayment = {
      id: generateId(),
      from: options.from,
      to: options.to,
      amount: options.amount,
      type: options.type,
      meta: options.meta,
      schedule: options.schedule,
      status: ScheduledPaymentStatus.PENDING,
      enabled: options.enabled ?? true,
      nextExecuteAt,
      executionCount: 0,
      failureCount: 0,
      maxExecutions: options.maxExecutions,
      expiresAt: options.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    this.payments.set(payment.id, payment);
    this.logger?.info('Scheduled payment created', { id: payment.id, nextExecuteAt });

    // Schedule if running
    if (this.running && payment.enabled) {
      this.schedulePayment(payment);
    }

    return { ...payment };
  }

  /**
   * Get payment by ID
   */
  get(id: string): ScheduledPayment | null {
    const payment = this.payments.get(id);
    return payment ? { ...payment } : null;
  }

  /**
   * List payments with filter
   */
  list(filter?: ScheduledPaymentFilter): ScheduledPayment[] {
    let results = Array.from(this.payments.values());

    if (filter) {
      if (filter.from) results = results.filter(p => p.from === filter.from);
      if (filter.to) results = results.filter(p => p.to === filter.to);
      if (filter.status) results = results.filter(p => p.status === filter.status);
      if (filter.type) results = results.filter(p => p.type === filter.type);
      if (filter.enabled !== undefined) results = results.filter(p => p.enabled === filter.enabled);

      // Sort by next execution
      results.sort((a, b) => a.nextExecuteAt.getTime() - b.nextExecuteAt.getTime());

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map(p => ({ ...p }));
  }

  /**
   * Update payment
   */
  update(id: string, options: UpdateScheduledPaymentOptions): ScheduledPayment | null {
    const payment = this.payments.get(id);
    if (!payment) return null;

    // Cancel existing timer
    this.cancelTimer(id);

    // Update fields
    if (options.amount !== undefined) payment.amount = options.amount;
    if (options.meta !== undefined) payment.meta = options.meta;
    if (options.maxExecutions !== undefined) payment.maxExecutions = options.maxExecutions;
    if (options.expiresAt !== undefined) payment.expiresAt = options.expiresAt;
    if (options.enabled !== undefined) payment.enabled = options.enabled;
    
    if (options.schedule) {
      payment.schedule = options.schedule;
      payment.nextExecuteAt = this.calculateNextExecution(options.schedule, new Date());
    }

    payment.updatedAt = new Date();

    // Reschedule if running and enabled
    if (this.running && payment.enabled && payment.status !== ScheduledPaymentStatus.COMPLETED) {
      this.schedulePayment(payment);
    }

    this.logger?.info('Scheduled payment updated', { id });
    return { ...payment };
  }

  /**
   * Delete payment
   */
  delete(id: string): boolean {
    this.cancelTimer(id);
    const deleted = this.payments.delete(id);
    if (deleted) {
      this.logger?.info('Scheduled payment deleted', { id });
    }
    return deleted;
  }

  /**
   * Pause payment
   */
  pause(id: string): boolean {
    const payment = this.payments.get(id);
    if (!payment) return false;

    payment.status = ScheduledPaymentStatus.PAUSED;
    payment.enabled = false;
    payment.updatedAt = new Date();
    this.cancelTimer(id);

    this.logger?.info('Scheduled payment paused', { id });
    return true;
  }

  /**
   * Resume payment
   */
  resume(id: string): boolean {
    const payment = this.payments.get(id);
    if (!payment || payment.status === ScheduledPaymentStatus.COMPLETED) return false;

    payment.status = ScheduledPaymentStatus.ACTIVE;
    payment.enabled = true;
    payment.failureCount = 0;
    payment.lastError = undefined;
    payment.nextExecuteAt = this.calculateNextExecution(payment.schedule, new Date());
    payment.updatedAt = new Date();

    if (this.running) {
      this.schedulePayment(payment);
    }

    this.logger?.info('Scheduled payment resumed', { id });
    return true;
  }

  /**
   * Cancel payment
   */
  cancel(id: string): boolean {
    const payment = this.payments.get(id);
    if (!payment) return false;

    payment.status = ScheduledPaymentStatus.CANCELLED;
    payment.enabled = false;
    payment.updatedAt = new Date();
    this.cancelTimer(id);

    this.logger?.info('Scheduled payment cancelled', { id });
    return true;
  }

  /**
   * Execute payment manually (for testing or manual trigger)
   */
  async executeNow(id: string): Promise<ExecutionResult> {
    const payment = this.payments.get(id);
    if (!payment) {
      return {
        paymentId: id,
        success: false,
        error: 'Payment not found',
        executedAt: new Date(),
      };
    }

    return this.executePayment(payment);
  }

  // ============================================
  // Internal Methods
  // ============================================

  /**
   * Check all payments and execute due ones
   */
  private async checkAndExecute(): Promise<void> {
    const now = new Date();

    for (const payment of this.payments.values()) {
      // Skip disabled or completed
      if (!payment.enabled) continue;
      if (payment.status === ScheduledPaymentStatus.COMPLETED) continue;
      if (payment.status === ScheduledPaymentStatus.CANCELLED) continue;
      if (payment.status === ScheduledPaymentStatus.FAILED) continue;

      // Check expiration
      if (payment.expiresAt && now >= payment.expiresAt) {
        payment.status = ScheduledPaymentStatus.EXPIRED;
        payment.enabled = false;
        this.cancelTimer(payment.id);
        continue;
      }

      // Check if due
      if (now >= payment.nextExecuteAt) {
        await this.executePayment(payment);
      }
    }
  }

  /**
   * Execute a single payment
   */
  private async executePayment(payment: ScheduledPayment): Promise<ExecutionResult> {
    const executedAt = new Date();

    try {
      const result = await this.executor({
        from: payment.from,
        to: payment.to,
        amount: payment.amount,
        type: payment.type,
        meta: {
          ...payment.meta,
          scheduledPaymentId: payment.id,
          executionNumber: payment.executionCount + 1,
        },
      });

      // Success
      payment.executionCount++;
      payment.lastExecutedAt = executedAt;
      payment.failureCount = 0;
      payment.lastError = undefined;
      payment.status = ScheduledPaymentStatus.ACTIVE;
      payment.updatedAt = new Date();

      // Check if completed
      if (payment.schedule.type === ScheduleType.ONE_TIME) {
        payment.status = ScheduledPaymentStatus.COMPLETED;
        payment.enabled = false;
      } else if (payment.maxExecutions && payment.executionCount >= payment.maxExecutions) {
        payment.status = ScheduledPaymentStatus.COMPLETED;
        payment.enabled = false;
      } else {
        // Schedule next
        payment.nextExecuteAt = this.calculateNextExecution(payment.schedule, executedAt);
        if (this.running) {
          this.schedulePayment(payment);
        }
      }

      this.logger?.info('Scheduled payment executed', {
        id: payment.id,
        transactionId: result.id,
        executionCount: payment.executionCount,
      });

      return {
        paymentId: payment.id,
        transactionId: result.id,
        success: true,
        executedAt,
      };

    } catch (error) {
      // Failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      payment.failureCount++;
      payment.lastError = errorMessage;
      payment.updatedAt = new Date();

      if (payment.failureCount >= this.maxFailures) {
        payment.status = ScheduledPaymentStatus.FAILED;
        payment.enabled = false;
        this.logger?.error('Scheduled payment failed permanently', {
          id: payment.id,
          failures: payment.failureCount,
          error: errorMessage,
        });
      } else {
        // Retry later
        payment.nextExecuteAt = new Date(Date.now() + 60000 * payment.failureCount); // Backoff
        if (this.running) {
          this.schedulePayment(payment);
        }
        this.logger?.warn('Scheduled payment failed, will retry', {
          id: payment.id,
          failures: payment.failureCount,
          error: errorMessage,
        });
      }

      return {
        paymentId: payment.id,
        success: false,
        error: errorMessage,
        executedAt,
      };
    }
  }

  /**
   * Schedule a payment timer
   */
  private schedulePayment(payment: ScheduledPayment): void {
    this.cancelTimer(payment.id);

    const delay = Math.max(0, payment.nextExecuteAt.getTime() - Date.now());
    
    const timer = setTimeout(() => {
      this.executePayment(payment);
    }, delay);

    this.timers.set(payment.id, timer);
  }

  /**
   * Cancel payment timer
   */
  private cancelTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * Calculate next execution time
   */
  private calculateNextExecution(schedule: ScheduleConfig, from: Date): Date {
    const now = new Date(from);

    switch (schedule.type) {
      case ScheduleType.ONE_TIME:
        return schedule.executeAt ?? now;

      case ScheduleType.INTERVAL:
        return new Date(now.getTime() + (schedule.intervalMs ?? 60000));

      case ScheduleType.DAILY: {
        const next = new Date(now);
        next.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next;
      }

      case ScheduleType.WEEKLY: {
        const next = new Date(now);
        next.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
        const targetDay = schedule.dayOfWeek ?? 0;
        const currentDay = next.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0 || (daysToAdd === 0 && next <= now)) {
          daysToAdd += 7;
        }
        next.setDate(next.getDate() + daysToAdd);
        return next;
      }

      case ScheduleType.MONTHLY: {
        const next = new Date(now);
        next.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
        next.setDate(schedule.dayOfMonth ?? 1);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        return next;
      }

      default:
        return now;
    }
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get scheduler statistics
   */
  getStats(): {
    total: number;
    active: number;
    paused: number;
    completed: number;
    failed: number;
    totalExecutions: number;
  } {
    const payments = Array.from(this.payments.values());

    return {
      total: payments.length,
      active: payments.filter(p => p.status === ScheduledPaymentStatus.ACTIVE).length,
      paused: payments.filter(p => p.status === ScheduledPaymentStatus.PAUSED).length,
      completed: payments.filter(p => p.status === ScheduledPaymentStatus.COMPLETED).length,
      failed: payments.filter(p => p.status === ScheduledPaymentStatus.FAILED).length,
      totalExecutions: payments.reduce((sum, p) => sum + p.executionCount, 0),
    };
  }

  /**
   * Clear all payments
   */
  clear(): void {
    this.stop();
    this.payments.clear();
  }
}
