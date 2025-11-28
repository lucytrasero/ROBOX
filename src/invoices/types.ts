/**
 * Invoice status
 */
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
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
  paidAt: Date;
  method?: string;
  meta?: Record<string, unknown>;
}

/**
 * Invoice reminder
 */
export interface InvoiceReminder {
  id: string;
  invoiceId: string;
  type: ReminderType;
  sentAt: Date;
  message?: string;
}

/**
 * Reminder type
 */
export enum ReminderType {
  UPCOMING_DUE = 'UPCOMING_DUE',
  DUE_TODAY = 'DUE_TODAY',
  OVERDUE = 'OVERDUE',
  FINAL_NOTICE = 'FINAL_NOTICE',
}

/**
 * Invoice template
 */
export interface InvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  issuerId: string;
  lineItems: Omit<InvoiceLineItem, 'id'>[];
  notes?: string;
  paymentTermsDays: number;
  currency: string;
  allowPartialPayment: boolean;
  autoReminders: boolean;
  reminderDaysBefore: number[];
  reminderDaysAfter: number[];
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Invoice
 */
export interface Invoice {
  id: string;
  number: string;
  templateId?: string;
  issuerId: string;
  recipientId: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  discountRate: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  issuedAt: Date;
  dueAt: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  notes?: string;
  paymentInstructions?: string;
  allowPartialPayment: boolean;
  minPartialPayment?: number;
  autoReminders: boolean;
  reminderDaysBefore: number[];
  reminderDaysAfter: number[];
  lastReminderAt?: Date;
  reminderCount: number;
  payments: InvoicePayment[];
  reminders: InvoiceReminder[];
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create invoice options
 */
export interface CreateInvoiceOptions {
  issuerId: string;
  recipientId: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    meta?: Record<string, unknown>;
  }>;
  dueAt?: Date;
  dueDays?: number;
  notes?: string;
  paymentInstructions?: string;
  currency?: string;
  taxRate?: number;
  discountRate?: number;
  discount?: number;
  allowPartialPayment?: boolean;
  minPartialPayment?: number;
  autoReminders?: boolean;
  reminderDaysBefore?: number[];
  reminderDaysAfter?: number[];
  meta?: Record<string, unknown>;
  templateId?: string;
  asDraft?: boolean;
}

/**
 * Create invoice from template options
 */
export interface CreateFromTemplateOptions {
  templateId: string;
  recipientId: string;
  overrides?: Partial<CreateInvoiceOptions>;
}

/**
 * Update invoice options
 */
export interface UpdateInvoiceOptions {
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    meta?: Record<string, unknown>;
  }>;
  dueAt?: Date;
  notes?: string;
  paymentInstructions?: string;
  taxRate?: number;
  discountRate?: number;
  discount?: number;
  allowPartialPayment?: boolean;
  minPartialPayment?: number;
  autoReminders?: boolean;
  reminderDaysBefore?: number[];
  reminderDaysAfter?: number[];
  meta?: Record<string, unknown>;
}

/**
 * Create template options
 */
export interface CreateTemplateOptions {
  issuerId: string;
  name: string;
  description?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    meta?: Record<string, unknown>;
  }>;
  notes?: string;
  paymentTermsDays?: number;
  currency?: string;
  allowPartialPayment?: boolean;
  autoReminders?: boolean;
  reminderDaysBefore?: number[];
  reminderDaysAfter?: number[];
  meta?: Record<string, unknown>;
}

/**
 * Update template options
 */
export interface UpdateTemplateOptions {
  name?: string;
  description?: string;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    meta?: Record<string, unknown>;
  }>;
  notes?: string;
  paymentTermsDays?: number;
  currency?: string;
  allowPartialPayment?: boolean;
  autoReminders?: boolean;
  reminderDaysBefore?: number[];
  reminderDaysAfter?: number[];
  meta?: Record<string, unknown>;
}

/**
 * Pay invoice options
 */
export interface PayInvoiceOptions {
  invoiceId: string;
  amount?: number;
  transactionId?: string;
  method?: string;
  meta?: Record<string, unknown>;
}

/**
 * Invoice filter
 */
export interface InvoiceFilter {
  issuerId?: string;
  recipientId?: string;
  status?: InvoiceStatus;
  statuses?: InvoiceStatus[];
  minAmount?: number;
  maxAmount?: number;
  issuedAfter?: Date;
  issuedBefore?: Date;
  dueAfter?: Date;
  dueBefore?: Date;
  overdue?: boolean;
  currency?: string;
  limit?: number;
  offset?: number;
}

/**
 * Template filter
 */
export interface TemplateFilter {
  issuerId?: string;
  nameContains?: string;
  limit?: number;
  offset?: number;
}

/**
 * Invoice event types
 */
export enum InvoiceEventType {
  INVOICE_CREATED = 'invoice.created',
  INVOICE_UPDATED = 'invoice.updated',
  INVOICE_SENT = 'invoice.sent',
  INVOICE_VIEWED = 'invoice.viewed',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PARTIALLY_PAID = 'invoice.partially_paid',
  INVOICE_OVERDUE = 'invoice.overdue',
  INVOICE_CANCELLED = 'invoice.cancelled',
  INVOICE_REFUNDED = 'invoice.refunded',
  INVOICE_DISPUTED = 'invoice.disputed',
  REMINDER_SENT = 'invoice.reminder_sent',
  TEMPLATE_CREATED = 'template.created',
  TEMPLATE_UPDATED = 'template.updated',
  TEMPLATE_DELETED = 'template.deleted',
}

/**
 * Invoice statistics
 */
export interface InvoiceStats {
  totalInvoices: number;
  draftInvoices: number;
  pendingInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  cancelledInvoices: number;
  totalRevenue: number;
  totalOutstanding: number;
  totalOverdue: number;
  averagePaymentTime: number;
  byStatus: Record<InvoiceStatus, number>;
  byCurrency: Record<string, { count: number; total: number }>;
}

/**
 * Reminder configuration
 */
export interface ReminderConfig {
  enabled: boolean;
  daysBefore: number[];
  daysAfter: number[];
  maxReminders?: number;
}

/**
 * Invoice manager configuration
 */
export interface InvoiceManagerConfig {
  defaultCurrency?: string;
  defaultPaymentTermsDays?: number;
  defaultTaxRate?: number;
  defaultAllowPartialPayment?: boolean;
  defaultMinPartialPayment?: number;
  autoReminders?: boolean;
  defaultReminderDaysBefore?: number[];
  defaultReminderDaysAfter?: number[];
  invoiceNumberPrefix?: string;
  invoiceNumberPadding?: number;
}

/**
 * Payment executor function
 */
export type InvoicePaymentExecutor = (params: {
  from: string;
  to: string;
  amount: number;
  invoiceId: string;
  invoiceNumber: string;
  meta?: Record<string, unknown>;
}) => Promise<{ transactionId: string }>;

/**
 * Reminder sender function
 */
export type ReminderSender = (params: {
  invoiceId: string;
  invoiceNumber: string;
  recipientId: string;
  issuerId: string;
  amount: number;
  dueAt: Date;
  reminderType: ReminderType;
  daysUntilDue?: number;
  daysOverdue?: number;
}) => Promise<void>;
