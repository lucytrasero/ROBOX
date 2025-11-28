import {
  InvoiceManager,
  InvoiceStatus,
  ReminderType,
  InvoiceEventType,
} from '../src/invoices';

describe('InvoiceManager', () => {
  let manager: InvoiceManager;
  const issuerId = 'issuer-1';
  const recipientId = 'recipient-1';

  beforeEach(() => {
    manager = new InvoiceManager({
      config: {
        defaultCurrency: 'CREDITS',
        defaultPaymentTermsDays: 30,
        invoiceNumberPrefix: 'TEST',
      },
    });
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Invoice Creation', () => {
    it('should create an invoice with line items', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [
          { description: 'Service A', quantity: 2, unitPrice: 100 },
          { description: 'Service B', quantity: 1, unitPrice: 50 },
        ],
      });

      expect(invoice.id).toBeDefined();
      expect(invoice.number).toMatch(/^TEST-\d+$/);
      expect(invoice.issuerId).toBe(issuerId);
      expect(invoice.recipientId).toBe(recipientId);
      expect(invoice.status).toBe(InvoiceStatus.PENDING);
      expect(invoice.lineItems.length).toBe(2);
      expect(invoice.subtotal).toBe(250);
      expect(invoice.total).toBe(250);
      expect(invoice.amountDue).toBe(250);
      expect(invoice.amountPaid).toBe(0);
    });

    it('should create invoice as draft', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        asDraft: true,
      });

      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    });

    it('should calculate tax correctly', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        taxRate: 10,
      });

      expect(invoice.subtotal).toBe(100);
      expect(invoice.tax).toBe(10);
      expect(invoice.total).toBe(110);
    });

    it('should apply discount correctly', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        discount: 20,
      });

      expect(invoice.subtotal).toBe(100);
      expect(invoice.discount).toBe(20);
      expect(invoice.total).toBe(80);
    });

    it('should set due date correctly', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        dueDays: 7,
      });

      const expectedDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const daysDiff = Math.abs(invoice.dueAt.getTime() - expectedDue.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeLessThan(1);
    });
  });

  describe('Invoice Retrieval', () => {
    it('should get invoice by ID', async () => {
      const created = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const retrieved = manager.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should get invoice by number', async () => {
      const created = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const retrieved = manager.getByNumber(created.number);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should list invoices with filters', async () => {
      await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      await manager.create({
        issuerId,
        recipientId: 'recipient-2',
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 200 }],
      });

      const byRecipient = manager.list({ recipientId });
      expect(byRecipient.length).toBe(1);

      const byAmount = manager.list({ minAmount: 150 });
      expect(byAmount.length).toBe(1);
    });
  });

  describe('Invoice Updates', () => {
    it('should update draft invoice', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        asDraft: true,
      });

      const updated = await manager.update(invoice.id, {
        lineItems: [{ description: 'Updated Service', quantity: 2, unitPrice: 150 }],
        notes: 'Updated notes',
      });

      expect(updated).not.toBeNull();
      expect(updated!.subtotal).toBe(300);
      expect(updated!.notes).toBe('Updated notes');
    });

    it('should not update paid invoice', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      // Simulate payment
      await manager.pay({ invoiceId: invoice.id });

      await expect(manager.update(invoice.id, { notes: 'Updated' }))
        .rejects.toThrow('Cannot update invoice with status: PAID');
    });

    it('should send draft invoice', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        asDraft: true,
      });

      const sent = await manager.send(invoice.id);
      expect(sent).not.toBeNull();
      expect(sent!.status).toBe(InvoiceStatus.PENDING);
    });
  });

  describe('Payments', () => {
    it('should pay invoice in full', async () => {
      let paymentExecuted = false;
      const managerWithExecutor = new InvoiceManager({
        executor: async () => {
          paymentExecuted = true;
          return { transactionId: 'tx-123' };
        },
      });

      const invoice = await managerWithExecutor.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const payment = await managerWithExecutor.pay({ invoiceId: invoice.id });

      expect(payment.amount).toBe(100);
      expect(payment.transactionId).toBe('tx-123');
      expect(paymentExecuted).toBe(true);

      const paid = managerWithExecutor.get(invoice.id)!;
      expect(paid.status).toBe(InvoiceStatus.PAID);
      expect(paid.amountPaid).toBe(100);
      expect(paid.amountDue).toBe(0);
    });

    it('should support partial payments', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        allowPartialPayment: true,
      });

      await manager.pay({ invoiceId: invoice.id, amount: 40 });

      const partial = manager.get(invoice.id)!;
      expect(partial.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(partial.amountPaid).toBe(40);
      expect(partial.amountDue).toBe(60);

      await manager.pay({ invoiceId: invoice.id, amount: 60 });

      const paid = manager.get(invoice.id)!;
      expect(paid.status).toBe(InvoiceStatus.PAID);
    });

    it('should reject partial payment when not allowed', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        allowPartialPayment: false,
      });

      await expect(manager.pay({ invoiceId: invoice.id, amount: 50 }))
        .rejects.toThrow('Partial payments are not allowed');
    });

    it('should enforce minimum partial payment', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        allowPartialPayment: true,
        minPartialPayment: 25,
      });

      await expect(manager.pay({ invoiceId: invoice.id, amount: 10 }))
        .rejects.toThrow('Minimum partial payment is 25');
    });

    it('should track payment history', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
        allowPartialPayment: true,
      });

      await manager.pay({ invoiceId: invoice.id, amount: 30 });
      await manager.pay({ invoiceId: invoice.id, amount: 30 });
      await manager.pay({ invoiceId: invoice.id, amount: 40 });

      const payments = manager.getPayments(invoice.id);
      expect(payments.length).toBe(3);
      expect(payments[0].amount).toBe(30);
      expect(payments[1].amount).toBe(30);
      expect(payments[2].amount).toBe(40);
    });
  });

  describe('Invoice Status Operations', () => {
    it('should cancel invoice', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const cancelled = await manager.cancel(invoice.id, 'Customer request');
      expect(cancelled).not.toBeNull();
      expect(cancelled!.status).toBe(InvoiceStatus.CANCELLED);
      expect(cancelled!.meta?.cancellationReason).toBe('Customer request');
    });

    it('should dispute invoice', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const disputed = await manager.dispute(invoice.id, 'Service not delivered');
      expect(disputed).not.toBeNull();
      expect(disputed!.status).toBe(InvoiceStatus.DISPUTED);
      expect(disputed!.meta?.disputeReason).toBe('Service not delivered');
    });

    it('should refund paid invoice', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      await manager.pay({ invoiceId: invoice.id });
      const refunded = await manager.refund(invoice.id, 100, 'Service cancelled');

      expect(refunded).not.toBeNull();
      expect(refunded!.status).toBe(InvoiceStatus.REFUNDED);
      expect(refunded!.amountPaid).toBe(0);
    });
  });

  describe('Templates', () => {
    it('should create template', async () => {
      const template = await manager.createTemplate({
        issuerId,
        name: 'Monthly Service',
        lineItems: [
          { description: 'Monthly fee', quantity: 1, unitPrice: 50 },
        ],
        paymentTermsDays: 14,
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Monthly Service');
      expect(template.lineItems.length).toBe(1);
    });

    it('should create invoice from template', async () => {
      const template = await manager.createTemplate({
        issuerId,
        name: 'Monthly Service',
        lineItems: [
          { description: 'Monthly fee', quantity: 1, unitPrice: 50 },
        ],
        paymentTermsDays: 14,
      });

      const invoice = await manager.createFromTemplate({
        templateId: template.id,
        recipientId,
      });

      expect(invoice.templateId).toBe(template.id);
      expect(invoice.lineItems[0].description).toBe('Monthly fee');
      expect(invoice.total).toBe(50);
    });

    it('should allow overrides when creating from template', async () => {
      const template = await manager.createTemplate({
        issuerId,
        name: 'Monthly Service',
        lineItems: [
          { description: 'Monthly fee', quantity: 1, unitPrice: 50 },
        ],
        notes: 'Default notes',
      });

      const invoice = await manager.createFromTemplate({
        templateId: template.id,
        recipientId,
        overrides: {
          notes: 'Custom notes',
          taxRate: 10,
        },
      });

      expect(invoice.notes).toBe('Custom notes');
      expect(invoice.tax).toBe(5);
    });

    it('should update template', async () => {
      const template = await manager.createTemplate({
        issuerId,
        name: 'Original Name',
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 50 }],
      });

      const updated = await manager.updateTemplate(template.id, {
        name: 'Updated Name',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
    });

    it('should delete template', async () => {
      const template = await manager.createTemplate({
        issuerId,
        name: 'To Delete',
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 50 }],
      });

      const deleted = await manager.deleteTemplate(template.id);
      expect(deleted).toBe(true);

      const retrieved = manager.getTemplate(template.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Reminders', () => {
    it('should send reminder', async () => {
      let reminderSent = false;
      const managerWithReminder = new InvoiceManager({
        reminderSender: async () => {
          reminderSent = true;
        },
      });

      const invoice = await managerWithReminder.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const reminder = await managerWithReminder.sendReminder(invoice.id, ReminderType.UPCOMING_DUE);

      expect(reminder).not.toBeNull();
      expect(reminder!.type).toBe(ReminderType.UPCOMING_DUE);
      expect(reminderSent).toBe(true);

      const invoiceWithReminder = managerWithReminder.get(invoice.id)!;
      expect(invoiceWithReminder.reminderCount).toBe(1);
    });

    it('should track reminder history', async () => {
      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      await manager.sendReminder(invoice.id, ReminderType.UPCOMING_DUE);
      await manager.sendReminder(invoice.id, ReminderType.DUE_TODAY);

      const reminders = manager.getReminders(invoice.id);
      expect(reminders.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics', async () => {
      await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const invoice2 = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 200 }],
      });

      await manager.pay({ invoiceId: invoice2.id });

      const stats = manager.getStats();

      expect(stats.totalInvoices).toBe(2);
      expect(stats.pendingInvoices).toBe(1);
      expect(stats.paidInvoices).toBe(1);
      expect(stats.totalRevenue).toBe(200);
      expect(stats.totalOutstanding).toBe(100);
    });

    it('should filter statistics by issuer', async () => {
      await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      await manager.create({
        issuerId: 'issuer-2',
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 200 }],
      });

      const stats = manager.getStats({ issuerId });
      expect(stats.totalInvoices).toBe(1);
    });
  });

  describe('Events', () => {
    it('should emit events', async () => {
      const events: string[] = [];

      manager.on(InvoiceEventType.INVOICE_CREATED, () => {
        events.push('created');
      });

      manager.on(InvoiceEventType.INVOICE_PAID, () => {
        events.push('paid');
      });

      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      await manager.pay({ invoiceId: invoice.id });

      expect(events).toContain('created');
      expect(events).toContain('paid');
    });

    it('should support wildcard event handler', async () => {
      const events: string[] = [];

      manager.on('*', (event) => {
        events.push(event.type as unknown as string);
      });

      const invoice = await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      await manager.cancel(invoice.id);

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Import/Export', () => {
    it('should export and import invoices', async () => {
      await manager.create({
        issuerId,
        recipientId,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      const exported = manager.export();
      expect(exported.length).toBe(1);

      const newManager = new InvoiceManager();
      const imported = newManager.import(exported);
      expect(imported).toBe(1);

      const invoices = newManager.list();
      expect(invoices.length).toBe(1);
    });
  });
});
