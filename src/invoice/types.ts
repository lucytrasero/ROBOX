import type { TransactionType } from '../types';

/**
 * Invoice status
 */
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
}

/**
 * Reminder status
 */
export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Reminder type
 */
export enum ReminderType {
  BEFORE_DUE = 'BEFORE_DUE',
  ON_DUE = 'ON_DUE',
  AFTER_DUE = 'AFTER_DUE',
  FINAL_NOTICE = 'FINAL_NOTICE',
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
  taxAmount?: number;
  discount?: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  meta?: Record<string, unknown>;
}

/**
 * Invoice payment record
 */
export interface InvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  transactionId?: string;
  payerId: string;
  paidAt: Date;
  method?: string;
  reference?: string;
  meta?: Record<string, unknown>;
}

/**
 * Invoice reminder
 */
export interface InvoiceReminder {
  id: string;
  invoiceId: string;
  type: ReminderType;
  scheduledAt: Date;
  sentAt?: Date;
  status: ReminderStatus;
  message?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

/**
 * Invoice template
 */
export interface InvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  lineItems: Omit<InvoiceLineItem, 'id' | 'amount'>[];
  currency: string;
  taxRate?: number;
  terms?: string;
  notes?: string;
  dueDays: number;
  reminderSchedule?: ReminderScheduleConfig[];
  meta?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reminder schedule configuration
 */
export interface ReminderScheduleConfig {
  type: ReminderType;
  daysBefore?: number;
  daysAfter?: number;
  message?: string;
}

/**
 * Invoice
 */
export interface Invoice {
  id: string;
  number: string;
  fromId: string;
  toId: string;
  templateId?: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  transactionType: TransactionType | string;
  issuedAt: Date;
  dueAt: Date;
  viewedAt?: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  terms?: string;
  notes?: string;
  reference?: string;
  payments: InvoicePayment[];
  reminders: InvoiceReminder[];
  reminderSchedule?: ReminderScheduleConfig[];
  allowPartialPayment: boolean;
  minPartialAmount?: number;
  autoRemind: boolean;
  autoPenalty: boolean;
  penaltyRate?: number;
  penaltyAmount?: number;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create invoice options
 */
export interface CreateInvoiceOptions {
  fromId: string;
  toId: string;
  templateId?: string;
  lineItems?: CreateLineItemOptions[];
  currency?: string;
  transactionType?: TransactionType | string;
  dueAt?: Date;
  dueDays?: number;
  terms?: string;
  notes?: string;
  reference?: string;
  allowPartialPayment?: boolean;
  minPartialAmount?: number;
  autoRemind?: boolean;
  autoPenalty?: boolean;
  penaltyRate?: number;
  reminderSchedule?: ReminderScheduleConfig[];
  meta?: Record<string, unknown>;
  sendImmediately?: boolean;
}

/**
 * Create line item options
 */
export interface CreateLineItemOptions {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discount?: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  meta?: Record<string, unknown>;
}

/**
 * Update invoice options
 */
export interface UpdateInvoiceOptions {
  lineItems?: CreateLineItemOptions[];
  dueAt?: Date;
  terms?: string;
  notes?: string;
  reference?: string;
  allowPartialPayment?: boolean;
  minPartialAmount?: number;
  autoRemind?: boolean;
  autoPenalty?: boolean;
  penaltyRate?: number;
  reminderSchedule?: ReminderScheduleConfig[];
  meta?: Record<string, unknown>;
}

/**
 * Pay invoice options
 */
export interface PayInvoiceOptions {
  invoiceId: string;
  payerId: string;
  amount?: number;
  method?: string;
  reference?: string;
  meta?: Record<string, unknown>;
}

/**
 * Create template options
 */
export interface CreateTemplateOptions {
  name: string;
  description?: string;
  creatorId: string;
  lineItems: Omit<CreateLineItemOptions, 'id'>[];
  currency?: string;
  taxRate?: number;
  terms?: string;
  notes?: string;
  dueDays?: number;
  reminderSchedule?: ReminderScheduleConfig[];
  meta?: Record<string, unknown>;
}

/**
 * Update template options
 */
export interface UpdateTemplateOptions {
  name?: string;
  description?: string;
  lineItems?: Omit<CreateLineItemOptions, 'id'>[];
  currency?: string;
  taxRate?: number;
  terms?: string;
  notes?: string;
  dueDays?: number;
  reminderSchedule?: ReminderScheduleConfig[];
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

/**
 * Invoice filter options
 */
export interface InvoiceFilter {
  fromId?: string;
  toId?: string;
  status?: InvoiceStatus | InvoiceStatus[];
  minAmount?: number;
  maxAmount?: number;
  fromDate?: Date;
  toDate?: Date;
  dueFromDate?: Date;
  dueToDate?: Date;
  isOverdue?: boolean;
  templateId?: string;
  reference?: string;
  limit?: number;
  offset?: number;
}

/**
 * Template filter options
 */
export interface TemplateFilter {
  creatorId?: string;
  isActive?: boolean;
  nameContains?: string;
  limit?: number;
  offset?: number;
}

/**
 * Invoice statistics
 */
export interface InvoiceStats {
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  overdueCount: number;
  averagePaymentDays: number;
  byStatus: Record<InvoiceStatus, number>;
  periodStart?: Date;
  periodEnd?: Date;
}

/**
 * Invoice event types
 */
export enum InvoiceEventType {
  INVOICE_CREATED = 'invoice.created',
  INVOICE_SENT = 'invoice.sent',
  INVOICE_VIEWED = 'invoice.viewed',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PARTIALLY_PAID = 'invoice.partially_paid',
  INVOICE_OVERDUE = 'invoice.overdue',
  INVOICE_CANCELLED = 'invoice.cancelled',
  INVOICE_REFUNDED = 'invoice.refunded',
  INVOICE_DISPUTED = 'invoice.disputed',
  REMINDER_SENT = 'invoice.reminder_sent',
  PENALTY_APPLIED = 'invoice.penalty_applied',
  TEMPLATE_CREATED = 'template.created',
  TEMPLATE_UPDATED = 'template.updated',
  TEMPLATE_DELETED = 'template.deleted',
}

/**
 * Invoice manager configuration
 */
export interface InvoiceManagerConfig {
  defaultCurrency?: string;
  defaultDueDays?: number;
  defaultReminderSchedule?: ReminderScheduleConfig[];
  invoiceNumberPrefix?: string;
  invoiceNumberPadding?: number;
  autoCheckOverdue?: boolean;
  overdueCheckIntervalMs?: number;
  defaultPenaltyRate?: number;
  maxPaymentRetries?: number;
}

/**
 * Reminder handler function
 */
export type ReminderHandler = (
  invoice: Invoice,
  reminder: InvoiceReminder
) => Promise<void>;

/**
 * Payment executor function
 */
export type PaymentExecutor = (params: {
  from: string;
  to: string;
  amount: number;
  type: string;
  meta?: Record<string, unknown>;
}) => Promise<{ id: string }>;
