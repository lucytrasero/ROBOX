import { generateId } from '../utils';
import type { Logger, TransactionType } from '../types';

/**
 * Subscription status
 */
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

/**
 * Billing period
 */
export enum BillingPeriod {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

/**
 * Subscription plan
 */
export interface SubscriptionPlan {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  price: number;
  billingPeriod: BillingPeriod;
  features?: string[];
  maxSubscribers?: number;
  currentSubscribers: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Active subscription
 */
export interface Subscription {
  id: string;
  planId: string;
  subscriberId: string;    // Robot paying
  providerId: string;      // Robot receiving
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date;
  totalPaid: number;
  paymentCount: number;
  failedPayments: number;
  lastPaymentAt?: Date;
  lastPaymentError?: string;
  cancelledAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create plan options
 */
export interface CreatePlanOptions {
  providerId: string;
  name: string;
  description?: string;
  price: number;
  billingPeriod: BillingPeriod;
  features?: string[];
  maxSubscribers?: number;
}

/**
 * Subscribe options
 */
export interface SubscribeOptions {
  planId: string;
  subscriberId: string;
  expiresAt?: Date;
}

/**
 * Transfer executor
 */
export type SubscriptionTransferExecutor = (params: {
  from: string;
  to: string;
  amount: number;
  type: TransactionType;
  meta?: Record<string, unknown>;
}) => Promise<{ id: string }>;

/**
 * SubscriptionManager - manages subscription plans and billing
 */
export class SubscriptionManager {
  private plans: Map<string, SubscriptionPlan> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private executor?: SubscriptionTransferExecutor;
  private transactionType: TransactionType;
  private logger?: Logger;
  private running: boolean = false;

  constructor(options: {
    executor?: SubscriptionTransferExecutor;
    transactionType?: TransactionType;
    logger?: Logger;
  } = {}) {
    this.executor = options.executor;
    this.transactionType = options.transactionType ?? ('SUBSCRIPTION' as TransactionType);
    this.logger = options.logger;
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Start subscription processor
   */
  start(checkIntervalMs: number = 60000): void {
    if (this.running) return;

    this.running = true;
    this.checkInterval = setInterval(() => this.processSubscriptions(), checkIntervalMs);
    this.logger?.info('Subscription manager started');
  }

  /**
   * Stop subscription processor
   */
  stop(): void {
    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.logger?.info('Subscription manager stopped');
  }

  /**
   * Set executor
   */
  setExecutor(executor: SubscriptionTransferExecutor): void {
    this.executor = executor;
  }

  // ============================================
  // Plan Management
  // ============================================

  /**
   * Create a subscription plan
   */
  createPlan(options: CreatePlanOptions): SubscriptionPlan {
    const now = new Date();

    const plan: SubscriptionPlan = {
      id: generateId(),
      providerId: options.providerId,
      name: options.name,
      description: options.description,
      price: options.price,
      billingPeriod: options.billingPeriod,
      features: options.features,
      maxSubscribers: options.maxSubscribers,
      currentSubscribers: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(plan.id, plan);

    this.logger?.info('Plan created', { planId: plan.id, name: plan.name });

    return { ...plan };
  }

  /**
   * Get plan by ID
   */
  getPlan(id: string): SubscriptionPlan | null {
    const plan = this.plans.get(id);
    return plan ? { ...plan } : null;
  }

  /**
   * List plans by provider
   */
  getProviderPlans(providerId: string): SubscriptionPlan[] {
    return Array.from(this.plans.values())
      .filter(p => p.providerId === providerId)
      .map(p => ({ ...p }));
  }

  /**
   * List all active plans
   */
  listActivePlans(): SubscriptionPlan[] {
    return Array.from(this.plans.values())
      .filter(p => p.active)
      .map(p => ({ ...p }));
  }

  /**
   * Deactivate plan
   */
  deactivatePlan(id: string): boolean {
    const plan = this.plans.get(id);
    if (!plan) return false;

    plan.active = false;
    plan.updatedAt = new Date();
    return true;
  }

  // ============================================
  // Subscription Management
  // ============================================

  /**
   * Subscribe to a plan
   */
  subscribe(options: SubscribeOptions): Subscription | null {
    const plan = this.plans.get(options.planId);
    if (!plan || !plan.active) {
      this.logger?.warn('Cannot subscribe to inactive/missing plan', { planId: options.planId });
      return null;
    }

    // Check max subscribers
    if (plan.maxSubscribers && plan.currentSubscribers >= plan.maxSubscribers) {
      this.logger?.warn('Plan at max capacity', { planId: options.planId });
      return null;
    }

    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(now, plan.billingPeriod);

    const subscription: Subscription = {
      id: generateId(),
      planId: options.planId,
      subscriberId: options.subscriberId,
      providerId: plan.providerId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextBillingAt: now, // Bill immediately
      totalPaid: 0,
      paymentCount: 0,
      failedPayments: 0,
      expiresAt: options.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    plan.currentSubscribers++;

    this.logger?.info('Subscription created', {
      subscriptionId: subscription.id,
      planId: plan.id,
      subscriberId: options.subscriberId,
    });

    return { ...subscription };
  }

  /**
   * Get subscription by ID
   */
  getSubscription(id: string): Subscription | null {
    const sub = this.subscriptions.get(id);
    return sub ? { ...sub } : null;
  }

  /**
   * Get subscriptions for subscriber
   */
  getSubscriberSubscriptions(subscriberId: string): Subscription[] {
    return Array.from(this.subscriptions.values())
      .filter(s => s.subscriberId === subscriberId)
      .map(s => ({ ...s }));
  }

  /**
   * Get subscriptions for provider
   */
  getProviderSubscriptions(providerId: string): Subscription[] {
    return Array.from(this.subscriptions.values())
      .filter(s => s.providerId === providerId)
      .map(s => ({ ...s }));
  }

  /**
   * Pause subscription
   */
  pause(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.status !== SubscriptionStatus.ACTIVE) return false;

    sub.status = SubscriptionStatus.PAUSED;
    sub.updatedAt = new Date();

    this.logger?.info('Subscription paused', { subscriptionId: id });
    return true;
  }

  /**
   * Resume subscription
   */
  resume(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub || sub.status !== SubscriptionStatus.PAUSED) return false;

    sub.status = SubscriptionStatus.ACTIVE;
    sub.failedPayments = 0;
    sub.lastPaymentError = undefined;
    sub.nextBillingAt = new Date();
    sub.updatedAt = new Date();

    this.logger?.info('Subscription resumed', { subscriptionId: id });
    return true;
  }

  /**
   * Cancel subscription
   */
  cancel(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub) return false;

    sub.status = SubscriptionStatus.CANCELLED;
    sub.cancelledAt = new Date();
    sub.updatedAt = new Date();

    // Update plan subscriber count
    const plan = this.plans.get(sub.planId);
    if (plan) {
      plan.currentSubscribers = Math.max(0, plan.currentSubscribers - 1);
    }

    this.logger?.info('Subscription cancelled', { subscriptionId: id });
    return true;
  }

  // ============================================
  // Billing
  // ============================================

  /**
   * Process all due subscriptions
   */
  async processSubscriptions(): Promise<void> {
    if (!this.executor) return;

    const now = new Date();

    for (const sub of this.subscriptions.values()) {
      if (sub.status !== SubscriptionStatus.ACTIVE) continue;
      if (sub.nextBillingAt > now) continue;

      // Check expiration
      if (sub.expiresAt && now >= sub.expiresAt) {
        sub.status = SubscriptionStatus.EXPIRED;
        sub.updatedAt = now;
        continue;
      }

      const plan = this.plans.get(sub.planId);
      if (!plan) continue;

      await this.processBilling(sub, plan);
    }
  }

  /**
   * Process single subscription billing
   */
  private async processBilling(sub: Subscription, plan: SubscriptionPlan): Promise<void> {
    try {
      await this.executor!({
        from: sub.subscriberId,
        to: sub.providerId,
        amount: plan.price,
        type: this.transactionType,
        meta: {
          subscriptionId: sub.id,
          planId: plan.id,
          planName: plan.name,
          billingPeriod: plan.billingPeriod,
          paymentNumber: sub.paymentCount + 1,
        },
      });

      // Success
      sub.paymentCount++;
      sub.totalPaid += plan.price;
      sub.lastPaymentAt = new Date();
      sub.failedPayments = 0;
      sub.lastPaymentError = undefined;
      sub.currentPeriodStart = new Date();
      sub.currentPeriodEnd = this.calculatePeriodEnd(new Date(), plan.billingPeriod);
      sub.nextBillingAt = sub.currentPeriodEnd;
      sub.updatedAt = new Date();

      this.logger?.info('Subscription payment processed', {
        subscriptionId: sub.id,
        amount: plan.price,
        paymentCount: sub.paymentCount,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      sub.failedPayments++;
      sub.lastPaymentError = errorMessage;
      sub.updatedAt = new Date();

      if (sub.failedPayments >= 3) {
        sub.status = SubscriptionStatus.PAYMENT_FAILED;
        this.logger?.error('Subscription payment failed permanently', {
          subscriptionId: sub.id,
          failures: sub.failedPayments,
        });
      } else {
        // Retry in 1 hour * failure count
        sub.nextBillingAt = new Date(Date.now() + 3600000 * sub.failedPayments);
        this.logger?.warn('Subscription payment failed, will retry', {
          subscriptionId: sub.id,
          failures: sub.failedPayments,
        });
      }
    }
  }

  /**
   * Calculate period end date
   */
  private calculatePeriodEnd(start: Date, period: BillingPeriod): Date {
    const end = new Date(start);

    switch (period) {
      case BillingPeriod.HOURLY:
        end.setHours(end.getHours() + 1);
        break;
      case BillingPeriod.DAILY:
        end.setDate(end.getDate() + 1);
        break;
      case BillingPeriod.WEEKLY:
        end.setDate(end.getDate() + 7);
        break;
      case BillingPeriod.MONTHLY:
        end.setMonth(end.getMonth() + 1);
        break;
    }

    return end;
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get statistics
   */
  getStats(): {
    totalPlans: number;
    activePlans: number;
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalRevenue: number;
  } {
    const subs = Array.from(this.subscriptions.values());

    return {
      totalPlans: this.plans.size,
      activePlans: Array.from(this.plans.values()).filter(p => p.active).length,
      totalSubscriptions: subs.length,
      activeSubscriptions: subs.filter(s => s.status === SubscriptionStatus.ACTIVE).length,
      totalRevenue: subs.reduce((sum, s) => sum + s.totalPaid, 0),
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stop();
    this.plans.clear();
    this.subscriptions.clear();
  }
}
