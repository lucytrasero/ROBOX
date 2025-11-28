import { generateId } from '../utils';
import type { Logger, EventHandler, RoboxEvent, EventType } from '../types';
import {
  Invoice,
  InvoiceStatus,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceReminder,
  InvoiceTemplate,
  ReminderType,
  InvoiceEventType,
  InvoiceStats,
  CreateInvoiceOptions,
  CreateFromTemplateOptions,
  UpdateInvoiceOptions,
  CreateTemplateOptions,
  UpdateTemplateOptions,
  PayInvoiceOptions,
  InvoiceFilter,
  TemplateFilter,
  InvoiceManagerConfig,
  InvoicePaymentExecutor,
  ReminderSender,
} from './types';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<InvoiceManagerConfig> = {
  defaultCurrency: 'CREDITS',
  defaultPaymentTermsDays: 30,
  defaultTaxRate: 0,
  defaultAllowPartialPayment: true,
  defaultMinPartialPayment: 0,
  autoReminders: true,
  defaultReminderDaysBefore: [7, 3, 1],
  defaultReminderDaysAfter: [1, 3, 7, 14],
  invoiceNumberPrefix: 'INV',
  invoiceNumberPadding: 6,
};

/**
 * InvoiceManager - manages invoices, payments, reminders, and templates
 *
 * Features:
 * - Create and manage invoices with line items
 * - Partial payments support
 * - Automatic overdue detection
 * - Customizable reminders (before and after due date)
 * - Invoice templates for recurring billing
 * - Payment tracking and history
 * - Statistics and reporting
 *
 * @example
 * ```typescript
 * import { RoboxLayer, InMemoryStorage, InvoiceManager } from 'robox-clearing';
 *
 * const robox = new RoboxLayer({ storage: new InMemoryStorage() });
 * const invoices = new InvoiceManager({
 *   executor: async (params) => {
 *     const tx = await robox.transfer({
 *       from: params.from,
 *       to: params.to,
 *       amount: params.amount,
 *       type: 'INVOICE_PAYMENT',
 *       meta: { invoiceId: params.invoiceId },
 *     });
 *     return { transactionId: tx.id };
 *   },
 * });
 *
 * // Create an invoice
 * const invoice = await invoices.create({
 *   issuerId: 'robot-1',
 *   recipientId: 'robot-2',
 *   lineItems: [
 *     { description: 'Charging service', quantity: 2, unitPrice: 50 },
 *     { description: 'Data sync', quantity: 1, unitPrice: 25 },
 *   ],
 *   dueDays: 14,
 * });
 *
 * // Pay the invoice
 * await invoices.pay({ invoiceId: invoice.id });
 * ```
 */
export class InvoiceManager {
  private invoices: Map<string, Invoice> = new Map();
  private templates: Map<string, InvoiceTemplate> = new Map();
  private config: Required<InvoiceManagerConfig>;
  private invoiceCounter: number = 0;
  private checkInterval?: NodeJS.Timeout;
  private executor?: InvoicePaymentExecutor;
  private reminderSender?: ReminderSender;
  private logger?: Logger;
  private running: boolean = false;
  private eventHandlers: Map<InvoiceEventType | '*', Set<EventHandler>> = new Map();

  constructor(options: {
    config?: InvoiceManagerConfig;
    executor?: InvoicePaymentExecutor;
    reminderSender?: ReminderSender;
    logger?: Logger;
  } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.executor = options.executor;
    this.reminderSender = options.reminderSender;
    this.logger = options.logger;
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Start the invoice processor (checks for overdue invoices and sends reminders)
   */
  start(checkIntervalMs: number = 3600000): void {
    if (this.running) return;

    this.running = true;
    this.checkInterval = setInterval(() => this.processInvoices(), checkIntervalMs);
    this.logger?.info('Invoice manager started', { checkIntervalMs });

    // Initial check
    this.processInvoices();
  }

  /**
   * Stop the invoice processor
   */
  stop(): void {
    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.logger?.info('Invoice manager stopped');
  }

  /**
   * Check if manager is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Set payment executor
   */
  setExecutor(executor: InvoicePaymentExecutor): void {
    this.executor = executor;
  }

  /**
   * Set reminder sender
   */
  setReminderSender(sender: ReminderSender): void {
    this.reminderSender = sender;
  }

  // ============================================
  // Invoice Management
  // ============================================

  /**
   * Create a new invoice
   */
  async create(options: CreateInvoiceOptions): Promise<Invoice> {
    const now = new Date();

    // Calculate due date
    let dueAt: Date;
    if (options.dueAt) {
      dueAt = new Date(options.dueAt);
    } else {
      const dueDays = options.dueDays ?? this.config.defaultPaymentTermsDays;
      dueAt = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);
    }

    // Build line items
    const lineItems: InvoiceLineItem[] = options.lineItems.map((item) => ({
      id: generateId(),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
      meta: item.meta,
    }));

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const taxRate = options.taxRate ?? this.config.defaultTaxRate;
    const tax = subtotal * (taxRate / 100);
    const discountRate = options.discountRate ?? 0;
    const discountAmount = options.discount ?? subtotal * (discountRate / 100);
    const total = subtotal + tax - discountAmount;

    const invoice: Invoice = {
      id: generateId(),
      number: this.generateInvoiceNumber(),
      templateId: options.templateId,
      issuerId: options.issuerId,
      recipientId: options.recipientId,
      status: options.asDraft ? InvoiceStatus.DRAFT : InvoiceStatus.PENDING,
      lineItems,
      subtotal,
      tax,
      taxRate,
      discount: discountAmount,
      discountRate,
      total,
      amountPaid: 0,
      amountDue: total,
      currency: options.currency ?? this.config.defaultCurrency,
      issuedAt: now,
      dueAt,
      notes: options.notes,
      paymentInstructions: options.paymentInstructions,
      allowPartialPayment: options.allowPartialPayment ?? this.config.defaultAllowPartialPayment,
      minPartialPayment: options.minPartialPayment ?? this.config.defaultMinPartialPayment,
      autoReminders: options.autoReminders ?? this.config.autoReminders,
      reminderDaysBefore: options.reminderDaysBefore ?? this.config.defaultReminderDaysBefore,
      reminderDaysAfter: options.reminderDaysAfter ?? this.config.defaultReminderDaysAfter,
      reminderCount: 0,
      payments: [],
      reminders: [],
      meta: options.meta,
      createdAt: now,
      updatedAt: now,
    };

    this.invoices.set(invoice.id, invoice);
    await this.emit(InvoiceEventType.INVOICE_CREATED, { invoice });

    this.logger?.info('Invoice created', {
      id: invoice.id,
      number: invoice.number,
      total: invoice.total,
      dueAt: invoice.dueAt,
    });

    return this.cloneInvoice(invoice);
  }

  /**
   * Create invoice from template
   */
  async createFromTemplate(options: CreateFromTemplateOptions): Promise<Invoice> {
    const template = this.templates.get(options.templateId);
    if (!template) {
      throw new Error(`Template not found: ${options.templateId}`);
    }

    const createOptions: CreateInvoiceOptions = {
      issuerId: template.issuerId,
      recipientId: options.recipientId,
      lineItems: template.lineItems,
      notes: template.notes,
      dueDays: template.paymentTermsDays,
      currency: template.currency,
      allowPartialPayment: template.allowPartialPayment,
      autoReminders: template.autoReminders,
      reminderDaysBefore: template.reminderDaysBefore,
      reminderDaysAfter: template.reminderDaysAfter,
      templateId: template.id,
      meta: template.meta,
      ...options.overrides,
    };

    return this.create(createOptions);
  }

  /**
   * Get invoice by ID
   */
  get(id: string): Invoice | null {
    const invoice = this.invoices.get(id);
    return invoice ? this.cloneInvoice(invoice) : null;
  }

  /**
   * Get invoice by number
   */
  getByNumber(number: string): Invoice | null {
    for (const invoice of this.invoices.values()) {
      if (invoice.number === number) {
        return this.cloneInvoice(invoice);
      }
    }
    return null;
  }

  /**
   * List invoices with filter
   */
  list(filter?: InvoiceFilter): Invoice[] {
    let results = Array.from(this.invoices.values());

    if (filter) {
      if (filter.issuerId) {
        results = results.filter((i) => i.issuerId === filter.issuerId);
      }
      if (filter.recipientId) {
        results = results.filter((i) => i.recipientId === filter.recipientId);
      }
      if (filter.status) {
        results = results.filter((i) => i.status === filter.status);
      }
      if (filter.statuses && filter.statuses.length > 0) {
        results = results.filter((i) => filter.statuses!.includes(i.status));
      }
      if (filter.minAmount !== undefined) {
        results = results.filter((i) => i.total >= filter.minAmount!);
      }
      if (filter.maxAmount !== undefined) {
        results = results.filter((i) => i.total <= filter.maxAmount!);
      }
      if (filter.issuedAfter) {
        results = results.filter((i) => i.issuedAt >= filter.issuedAfter!);
      }
      if (filter.issuedBefore) {
        results = results.filter((i) => i.issuedAt <= filter.issuedBefore!);
      }
      if (filter.dueAfter) {
        results = results.filter((i) => i.dueAt >= filter.dueAfter!);
      }
      if (filter.dueBefore) {
        results = results.filter((i) => i.dueAt <= filter.dueBefore!);
      }
      if (filter.overdue === true) {
        const now = new Date();
        results = results.filter(
          (i) =>
            i.dueAt < now &&
            i.status !== InvoiceStatus.PAID &&
            i.status !== InvoiceStatus.CANCELLED &&
            i.status !== InvoiceStatus.REFUNDED
        );
      }
      if (filter.currency) {
        results = results.filter((i) => i.currency === filter.currency);
      }

      // Sort by issued date descending
      results.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map((i) => this.cloneInvoice(i));
  }

  /**
   * Get invoices issued by a robot
   */
  getIssuedBy(issuerId: string): Invoice[] {
    return this.list({ issuerId });
  }

  /**
   * Get invoices received by a robot
   */
  getReceivedBy(recipientId: string): Invoice[] {
    return this.list({ recipientId });
  }

  /**
   * Get overdue invoices
   */
  getOverdue(): Invoice[] {
    return this.list({ overdue: true });
  }

  /**
   * Get pending invoices
   */
  getPending(): Invoice[] {
    return this.list({
      statuses: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID],
    });
  }

  /**
   * Update invoice (only draft or pending)
   */
  async update(id: string, options: UpdateInvoiceOptions): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (!invoice) return null;

    // Can only update draft or pending invoices
    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.PENDING) {
      throw new Error(`Cannot update invoice with status: ${invoice.status}`);
    }

    // Update line items if provided
    if (options.lineItems) {
      invoice.lineItems = options.lineItems.map((item) => ({
        id: generateId(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        meta: item.meta,
      }));

      // Recalculate totals
      invoice.subtotal = invoice.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    }

    // Update other fields
    if (options.dueAt !== undefined) invoice.dueAt = new Date(options.dueAt);
    if (options.notes !== undefined) invoice.notes = options.notes;
    if (options.paymentInstructions !== undefined) invoice.paymentInstructions = options.paymentInstructions;
    if (options.allowPartialPayment !== undefined) invoice.allowPartialPayment = options.allowPartialPayment;
    if (options.minPartialPayment !== undefined) invoice.minPartialPayment = options.minPartialPayment;
    if (options.autoReminders !== undefined) invoice.autoReminders = options.autoReminders;
    if (options.reminderDaysBefore !== undefined) invoice.reminderDaysBefore = options.reminderDaysBefore;
    if (options.reminderDaysAfter !== undefined) invoice.reminderDaysAfter = options.reminderDaysAfter;
    if (options.meta !== undefined) invoice.meta = options.meta;

    // Update tax and discount if provided
    if (options.taxRate !== undefined) {
      invoice.taxRate = options.taxRate;
      invoice.tax = invoice.subtotal * (options.taxRate / 100);
    }
    if (options.discountRate !== undefined) {
      invoice.discountRate = options.discountRate;
      invoice.discount = invoice.subtotal * (options.discountRate / 100);
    }
    if (options.discount !== undefined) {
      invoice.discount = options.discount;
    }

    // Recalculate total
    invoice.total = invoice.subtotal + invoice.tax - invoice.discount;
    invoice.amountDue = invoice.total - invoice.amountPaid;
    invoice.updatedAt = new Date();

    await this.emit(InvoiceEventType.INVOICE_UPDATED, { invoice });

    this.logger?.info('Invoice updated', { id: invoice.id });

    return this.cloneInvoice(invoice);
  }

  /**
   * Send/publish a draft invoice
   */
  async send(id: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (!invoice) return null;

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new Error(`Cannot send invoice with status: ${invoice.status}`);
    }

    invoice.status = InvoiceStatus.PENDING;
    invoice.issuedAt = new Date();
    invoice.updatedAt = new Date();

    await this.emit(InvoiceEventType.INVOICE_SENT, { invoice });

    this.logger?.info('Invoice sent', { id: invoice.id, number: invoice.number });

    return this.cloneInvoice(invoice);
  }

  /**
   * Mark invoice as viewed
   */
  async markViewed(id: string): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice) return false;

    await this.emit(InvoiceEventType.INVOICE_VIEWED, { invoice });

    return true;
  }

  /**
   * Cancel an invoice
   */
  async cancel(id: string, reason?: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (!invoice) return null;

    // Cannot cancel paid or already cancelled invoices
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error(`Cannot cancel invoice with status: ${invoice.status}`);
    }

    const previousStatus = invoice.status;
    invoice.status = InvoiceStatus.CANCELLED;
    invoice.cancelledAt = new Date();
    invoice.updatedAt = new Date();
    if (reason) {
      invoice.meta = { ...invoice.meta, cancellationReason: reason };
    }

    await this.emit(InvoiceEventType.INVOICE_CANCELLED, { invoice, previousStatus, reason });

    this.logger?.info('Invoice cancelled', { id: invoice.id, reason });

    return this.cloneInvoice(invoice);
  }

  /**
   * Dispute an invoice
   */
  async dispute(id: string, reason: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(id);
    if (!invoice) return null;

    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error(`Cannot dispute invoice with status: ${invoice.status}`);
    }

    const previousStatus = invoice.status;
    invoice.status = InvoiceStatus.DISPUTED;
    invoice.updatedAt = new Date();
    invoice.meta = { ...invoice.meta, disputeReason: reason, disputedAt: new Date() };

    await this.emit(InvoiceEventType.INVOICE_DISPUTED, { invoice, previousStatus, reason });

    this.logger?.info('Invoice disputed', { id: invoice.id, reason });

    return this.cloneInvoice(invoice);
  }

  /**
   * Delete an invoice (only drafts)
   */
  delete(id: string): boolean {
    const invoice = this.invoices.get(id);
    if (!invoice) return false;

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new Error(`Cannot delete invoice with status: ${invoice.status}`);
    }

    return this.invoices.delete(id);
  }

  // ============================================
  // Payments
  // ============================================

  /**
   * Pay an invoice (full or partial)
   */
  async pay(options: PayInvoiceOptions): Promise<InvoicePayment> {
    const invoice = this.invoices.get(options.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${options.invoiceId}`);
    }

    // Check if payable
    if (
      invoice.status !== InvoiceStatus.PENDING &&
      invoice.status !== InvoiceStatus.PARTIALLY_PAID &&
      invoice.status !== InvoiceStatus.OVERDUE
    ) {
      throw new Error(`Cannot pay invoice with status: ${invoice.status}`);
    }

    // Determine payment amount
    const paymentAmount = options.amount ?? invoice.amountDue;

    // Validate payment amount
    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    if (paymentAmount > invoice.amountDue) {
      throw new Error(`Payment amount (${paymentAmount}) exceeds amount due (${invoice.amountDue})`);
    }

    // Check partial payment rules
    if (paymentAmount < invoice.amountDue) {
      if (!invoice.allowPartialPayment) {
        throw new Error('Partial payments are not allowed for this invoice');
      }
      if (invoice.minPartialPayment && paymentAmount < invoice.minPartialPayment) {
        throw new Error(`Minimum partial payment is ${invoice.minPartialPayment}`);
      }
    }

    // Execute payment if executor is set
    let transactionId = options.transactionId;
    if (this.executor && !transactionId) {
      const result = await this.executor({
        from: invoice.recipientId,
        to: invoice.issuerId,
        amount: paymentAmount,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        meta: options.meta,
      });
      transactionId = result.transactionId;
    }

    // Create payment record
    const payment: InvoicePayment = {
      id: generateId(),
      invoiceId: invoice.id,
      amount: paymentAmount,
      transactionId,
      paidAt: new Date(),
      method: options.method,
      meta: options.meta,
    };

    // Update invoice
    invoice.payments.push(payment);
    invoice.amountPaid += paymentAmount;
    invoice.amountDue -= paymentAmount;
    invoice.updatedAt = new Date();

    // Update status
    if (invoice.amountDue <= 0) {
      invoice.status = InvoiceStatus.PAID;
      invoice.paidAt = new Date();
      await this.emit(InvoiceEventType.INVOICE_PAID, { invoice, payment });
      this.logger?.info('Invoice paid in full', { id: invoice.id, total: invoice.total });
    } else {
      invoice.status = InvoiceStatus.PARTIALLY_PAID;
      await this.emit(InvoiceEventType.INVOICE_PARTIALLY_PAID, { invoice, payment });
      this.logger?.info('Invoice partially paid', {
        id: invoice.id,
        paid: invoice.amountPaid,
        due: invoice.amountDue,
      });
    }

    return { ...payment };
  }

  /**
   * Refund an invoice payment
   */
  async refund(invoiceId: string, amount?: number, reason?: string): Promise<Invoice | null> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return null;

    if (invoice.amountPaid <= 0) {
      throw new Error('No payments to refund');
    }

    const refundAmount = amount ?? invoice.amountPaid;
    if (refundAmount > invoice.amountPaid) {
      throw new Error(`Refund amount (${refundAmount}) exceeds amount paid (${invoice.amountPaid})`);
    }

    invoice.amountPaid -= refundAmount;
    invoice.amountDue += refundAmount;
    invoice.status = InvoiceStatus.REFUNDED;
    invoice.updatedAt = new Date();
    invoice.meta = {
      ...invoice.meta,
      refundAmount,
      refundReason: reason,
      refundedAt: new Date(),
    };

    await this.emit(InvoiceEventType.INVOICE_REFUNDED, { invoice, refundAmount, reason });

    this.logger?.info('Invoice refunded', { id: invoice.id, refundAmount });

    return this.cloneInvoice(invoice);
  }

  /**
   * Get payment history for an invoice
   */
  getPayments(invoiceId: string): InvoicePayment[] {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return [];
    return invoice.payments.map((p) => ({ ...p }));
  }

  // ============================================
  // Reminders
  // ============================================

  /**
   * Send a reminder for an invoice
   */
  async sendReminder(invoiceId: string, type?: ReminderType): Promise<InvoiceReminder | null> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return null;

    if (
      invoice.status !== InvoiceStatus.PENDING &&
      invoice.status !== InvoiceStatus.PARTIALLY_PAID &&
      invoice.status !== InvoiceStatus.OVERDUE
    ) {
      return null;
    }

    const now = new Date();
    const daysUntilDue = Math.ceil((invoice.dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const reminderType = type ?? this.determineReminderType(daysUntilDue);

    // Send reminder if sender is configured
    if (this.reminderSender) {
      await this.reminderSender({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        recipientId: invoice.recipientId,
        issuerId: invoice.issuerId,
        amount: invoice.amountDue,
        dueAt: invoice.dueAt,
        reminderType,
        daysUntilDue: daysUntilDue > 0 ? daysUntilDue : undefined,
        daysOverdue: daysUntilDue < 0 ? Math.abs(daysUntilDue) : undefined,
      });
    }

    const reminder: InvoiceReminder = {
      id: generateId(),
      invoiceId: invoice.id,
      type: reminderType,
      sentAt: now,
    };

    invoice.reminders.push(reminder);
    invoice.lastReminderAt = now;
    invoice.reminderCount++;
    invoice.updatedAt = now;

    await this.emit(InvoiceEventType.REMINDER_SENT, { invoice, reminder });

    this.logger?.info('Reminder sent', {
      invoiceId: invoice.id,
      type: reminderType,
      count: invoice.reminderCount,
    });

    return { ...reminder };
  }

  /**
   * Get reminders for an invoice
   */
  getReminders(invoiceId: string): InvoiceReminder[] {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return [];
    return invoice.reminders.map((r) => ({ ...r }));
  }

  /**
   * Determine reminder type based on days until due
   */
  private determineReminderType(daysUntilDue: number): ReminderType {
    if (daysUntilDue > 1) return ReminderType.UPCOMING_DUE;
    if (daysUntilDue === 0 || daysUntilDue === 1) return ReminderType.DUE_TODAY;
    if (daysUntilDue > -14) return ReminderType.OVERDUE;
    return ReminderType.FINAL_NOTICE;
  }

  // ============================================
  // Templates
  // ============================================

  /**
   * Create an invoice template
   */
  async createTemplate(options: CreateTemplateOptions): Promise<InvoiceTemplate> {
    const now = new Date();

    const template: InvoiceTemplate = {
      id: generateId(),
      name: options.name,
      description: options.description,
      issuerId: options.issuerId,
      lineItems: options.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        meta: item.meta,
      })),
      notes: options.notes,
      paymentTermsDays: options.paymentTermsDays ?? this.config.defaultPaymentTermsDays,
      currency: options.currency ?? this.config.defaultCurrency,
      allowPartialPayment: options.allowPartialPayment ?? this.config.defaultAllowPartialPayment,
      autoReminders: options.autoReminders ?? this.config.autoReminders,
      reminderDaysBefore: options.reminderDaysBefore ?? this.config.defaultReminderDaysBefore,
      reminderDaysAfter: options.reminderDaysAfter ?? this.config.defaultReminderDaysAfter,
      meta: options.meta,
      createdAt: now,
      updatedAt: now,
    };

    this.templates.set(template.id, template);
    await this.emit(InvoiceEventType.TEMPLATE_CREATED, { template });

    this.logger?.info('Template created', { id: template.id, name: template.name });

    return { ...template, lineItems: [...template.lineItems] };
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): InvoiceTemplate | null {
    const template = this.templates.get(id);
    return template ? { ...template, lineItems: [...template.lineItems] } : null;
  }

  /**
   * List templates with filter
   */
  listTemplates(filter?: TemplateFilter): InvoiceTemplate[] {
    let results = Array.from(this.templates.values());

    if (filter) {
      if (filter.issuerId) {
        results = results.filter((t) => t.issuerId === filter.issuerId);
      }
      if (filter.nameContains) {
        const search = filter.nameContains.toLowerCase();
        results = results.filter((t) => t.name.toLowerCase().includes(search));
      }

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map((t) => ({ ...t, lineItems: [...t.lineItems] }));
  }

  /**
   * Update template
   */
  async updateTemplate(id: string, options: UpdateTemplateOptions): Promise<InvoiceTemplate | null> {
    const template = this.templates.get(id);
    if (!template) return null;

    if (options.name !== undefined) template.name = options.name;
    if (options.description !== undefined) template.description = options.description;
    if (options.notes !== undefined) template.notes = options.notes;
    if (options.paymentTermsDays !== undefined) template.paymentTermsDays = options.paymentTermsDays;
    if (options.currency !== undefined) template.currency = options.currency;
    if (options.allowPartialPayment !== undefined) template.allowPartialPayment = options.allowPartialPayment;
    if (options.autoReminders !== undefined) template.autoReminders = options.autoReminders;
    if (options.reminderDaysBefore !== undefined) template.reminderDaysBefore = options.reminderDaysBefore;
    if (options.reminderDaysAfter !== undefined) template.reminderDaysAfter = options.reminderDaysAfter;
    if (options.meta !== undefined) template.meta = options.meta;

    if (options.lineItems) {
      template.lineItems = options.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        meta: item.meta,
      }));
    }

    template.updatedAt = new Date();

    await this.emit(InvoiceEventType.TEMPLATE_UPDATED, { template });

    this.logger?.info('Template updated', { id: template.id });

    return { ...template, lineItems: [...template.lineItems] };
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const template = this.templates.get(id);
    if (!template) return false;

    this.templates.delete(id);
    await this.emit(InvoiceEventType.TEMPLATE_DELETED, { templateId: id });

    this.logger?.info('Template deleted', { id });

    return true;
  }

  // ============================================
  // Processing
  // ============================================

  /**
   * Process all invoices (check overdue, send reminders)
   */
  async processInvoices(): Promise<void> {
    const now = new Date();

    for (const invoice of this.invoices.values()) {
      // Skip non-active invoices
      if (
        invoice.status !== InvoiceStatus.PENDING &&
        invoice.status !== InvoiceStatus.PARTIALLY_PAID &&
        invoice.status !== InvoiceStatus.OVERDUE
      ) {
        continue;
      }

      // Check if overdue
      if (now > invoice.dueAt && invoice.status !== InvoiceStatus.OVERDUE) {
        invoice.status = InvoiceStatus.OVERDUE;
        invoice.updatedAt = now;
        await this.emit(InvoiceEventType.INVOICE_OVERDUE, { invoice });
        this.logger?.warn('Invoice overdue', { id: invoice.id, dueAt: invoice.dueAt });
      }

      // Send reminders if enabled
      if (invoice.autoReminders) {
        await this.checkAndSendReminder(invoice, now);
      }
    }
  }

  /**
   * Check if reminder should be sent and send it
   */
  private async checkAndSendReminder(invoice: Invoice, now: Date): Promise<void> {
    const daysUntilDue = Math.ceil((invoice.dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const daysSinceLastReminder = invoice.lastReminderAt
      ? Math.floor((now.getTime() - invoice.lastReminderAt.getTime()) / (24 * 60 * 60 * 1000))
      : Infinity;

    // Don't send reminders too frequently
    if (daysSinceLastReminder < 1) return;

    // Check before due date reminders
    if (daysUntilDue > 0 && invoice.reminderDaysBefore.includes(daysUntilDue)) {
      await this.sendReminder(invoice.id, ReminderType.UPCOMING_DUE);
      return;
    }

    // Check due today
    if (daysUntilDue === 0) {
      await this.sendReminder(invoice.id, ReminderType.DUE_TODAY);
      return;
    }

    // Check after due date reminders
    const daysOverdue = Math.abs(daysUntilDue);
    if (daysUntilDue < 0 && invoice.reminderDaysAfter.includes(daysOverdue)) {
      const reminderType = daysOverdue >= 14 ? ReminderType.FINAL_NOTICE : ReminderType.OVERDUE;
      await this.sendReminder(invoice.id, reminderType);
    }
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get invoice statistics
   */
  getStats(filter?: { issuerId?: string; recipientId?: string; fromDate?: Date; toDate?: Date }): InvoiceStats {
    let invoices = Array.from(this.invoices.values());

    // Apply filters
    if (filter?.issuerId) {
      invoices = invoices.filter((i) => i.issuerId === filter.issuerId);
    }
    if (filter?.recipientId) {
      invoices = invoices.filter((i) => i.recipientId === filter.recipientId);
    }
    if (filter?.fromDate) {
      invoices = invoices.filter((i) => i.issuedAt >= filter.fromDate!);
    }
    if (filter?.toDate) {
      invoices = invoices.filter((i) => i.issuedAt <= filter.toDate!);
    }

    const now = new Date();
    const byStatus: Record<InvoiceStatus, number> = {
      [InvoiceStatus.DRAFT]: 0,
      [InvoiceStatus.PENDING]: 0,
      [InvoiceStatus.PARTIALLY_PAID]: 0,
      [InvoiceStatus.PAID]: 0,
      [InvoiceStatus.OVERDUE]: 0,
      [InvoiceStatus.CANCELLED]: 0,
      [InvoiceStatus.REFUNDED]: 0,
      [InvoiceStatus.DISPUTED]: 0,
    };

    const byCurrency: Record<string, { count: number; total: number }> = {};
    let totalRevenue = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalPaymentTime = 0;
    let paidCount = 0;

    for (const invoice of invoices) {
      byStatus[invoice.status]++;

      // Currency stats
      if (!byCurrency[invoice.currency]) {
        byCurrency[invoice.currency] = { count: 0, total: 0 };
      }
      byCurrency[invoice.currency].count++;
      byCurrency[invoice.currency].total += invoice.total;

      // Revenue and outstanding
      totalRevenue += invoice.amountPaid;

      if (
        invoice.status === InvoiceStatus.PENDING ||
        invoice.status === InvoiceStatus.PARTIALLY_PAID ||
        invoice.status === InvoiceStatus.OVERDUE
      ) {
        totalOutstanding += invoice.amountDue;
      }

      if (invoice.status === InvoiceStatus.OVERDUE || (invoice.dueAt < now && invoice.amountDue > 0)) {
        totalOverdue += invoice.amountDue;
      }

      // Average payment time
      if (invoice.status === InvoiceStatus.PAID && invoice.paidAt) {
        totalPaymentTime += invoice.paidAt.getTime() - invoice.issuedAt.getTime();
        paidCount++;
      }
    }

    const averagePaymentTime = paidCount > 0 ? totalPaymentTime / paidCount / (24 * 60 * 60 * 1000) : 0;

    return {
      totalInvoices: invoices.length,
      draftInvoices: byStatus[InvoiceStatus.DRAFT],
      pendingInvoices: byStatus[InvoiceStatus.PENDING] + byStatus[InvoiceStatus.PARTIALLY_PAID],
      paidInvoices: byStatus[InvoiceStatus.PAID],
      overdueInvoices: byStatus[InvoiceStatus.OVERDUE],
      cancelledInvoices: byStatus[InvoiceStatus.CANCELLED],
      totalRevenue,
      totalOutstanding,
      totalOverdue,
      averagePaymentTime,
      byStatus,
      byCurrency,
    };
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Subscribe to invoice events
   */
  on<T = unknown>(event: InvoiceEventType | '*', handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.eventHandlers.get(event)!.add(handler as any);
    return () => this.off(event, handler as EventHandler);
  }

  /**
   * Unsubscribe from invoice events
   */
  off(event: InvoiceEventType | '*', handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private async emit(event: InvoiceEventType, data: unknown): Promise<void> {
    const roboxEvent: RoboxEvent = {
      type: event as unknown as EventType,
      data,
      timestamp: new Date(),
    };

    // Emit to specific handlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(roboxEvent);
        } catch {
          // Ignore handler errors
        }
      }
    }

    // Emit to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          await handler(roboxEvent);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Generate unique invoice number
   */
  private generateInvoiceNumber(): string {
    this.invoiceCounter++;
    const paddedNumber = this.invoiceCounter.toString().padStart(this.config.invoiceNumberPadding, '0');
    return `${this.config.invoiceNumberPrefix}-${paddedNumber}`;
  }

  /**
   * Clone invoice for returning
   */
  private cloneInvoice(invoice: Invoice): Invoice {
    return {
      ...invoice,
      lineItems: invoice.lineItems.map((item) => ({ ...item })),
      payments: invoice.payments.map((p) => ({ ...p })),
      reminders: invoice.reminders.map((r) => ({ ...r })),
      meta: invoice.meta ? { ...invoice.meta } : undefined,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stop();
    this.invoices.clear();
    this.templates.clear();
    this.invoiceCounter = 0;
  }

  /**
   * Set starting invoice counter (for persistence)
   */
  setInvoiceCounter(value: number): void {
    this.invoiceCounter = value;
  }

  /**
   * Get current invoice counter
   */
  getInvoiceCounter(): number {
    return this.invoiceCounter;
  }

  /**
   * Import invoices (for persistence/migration)
   */
  import(invoices: Invoice[]): number {
    let imported = 0;
    for (const invoice of invoices) {
      if (!this.invoices.has(invoice.id)) {
        this.invoices.set(invoice.id, invoice);
        imported++;

        // Update counter if needed
        const match = invoice.number.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > this.invoiceCounter) {
            this.invoiceCounter = num;
          }
        }
      }
    }
    return imported;
  }

  /**
   * Export all invoices
   */
  export(): Invoice[] {
    return Array.from(this.invoices.values()).map((i) => this.cloneInvoice(i));
  }
}
