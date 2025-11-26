import type { TransactionType } from '../types';

/**
 * Scheduled payment configuration
 */
export interface ScheduledPayment {
  id: string;
  from: string;
  to: string;
  amount: number;
  type: TransactionType;
  meta?: Record<string, unknown>;
  
  // Schedule config
  schedule: ScheduleConfig;
  
  // Status
  status: ScheduledPaymentStatus;
  enabled: boolean;
  
  // Execution tracking
  lastExecutedAt?: Date;
  nextExecuteAt: Date;
  executionCount: number;
  failureCount: number;
  lastError?: string;
  
  // Limits
  maxExecutions?: number;
  expiresAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schedule configuration
 */
export interface ScheduleConfig {
  type: ScheduleType;
  
  // For ONE_TIME
  executeAt?: Date;
  
  // For INTERVAL
  intervalMs?: number;
  
  // For CRON-like
  hour?: number;      // 0-23
  minute?: number;    // 0-59
  dayOfWeek?: number; // 0-6 (Sunday = 0)
  dayOfMonth?: number; // 1-31
}

/**
 * Schedule types
 */
export enum ScheduleType {
  ONE_TIME = 'ONE_TIME',       // Execute once at specific time
  INTERVAL = 'INTERVAL',       // Execute every N milliseconds
  DAILY = 'DAILY',             // Execute daily at specific time
  WEEKLY = 'WEEKLY',           // Execute weekly on specific day
  MONTHLY = 'MONTHLY',         // Execute monthly on specific day
}

/**
 * Scheduled payment status
 */
export enum ScheduledPaymentStatus {
  PENDING = 'PENDING',         // Waiting for first execution
  ACTIVE = 'ACTIVE',           // Running normally
  PAUSED = 'PAUSED',           // Temporarily paused
  COMPLETED = 'COMPLETED',     // All executions done (for ONE_TIME or maxExecutions reached)
  EXPIRED = 'EXPIRED',         // Past expiresAt date
  FAILED = 'FAILED',           // Too many failures
  CANCELLED = 'CANCELLED',     // Manually cancelled
}

/**
 * Options for creating scheduled payment
 */
export interface CreateScheduledPaymentOptions {
  from: string;
  to: string;
  amount: number;
  type: TransactionType;
  meta?: Record<string, unknown>;
  schedule: ScheduleConfig;
  maxExecutions?: number;
  expiresAt?: Date;
  enabled?: boolean;
}

/**
 * Options for updating scheduled payment
 */
export interface UpdateScheduledPaymentOptions {
  amount?: number;
  meta?: Record<string, unknown>;
  schedule?: ScheduleConfig;
  maxExecutions?: number;
  expiresAt?: Date;
  enabled?: boolean;
}

/**
 * Scheduled payment filter
 */
export interface ScheduledPaymentFilter {
  from?: string;
  to?: string;
  status?: ScheduledPaymentStatus;
  type?: TransactionType;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  paymentId: string;
  transactionId?: string;
  success: boolean;
  error?: string;
  executedAt: Date;
}
