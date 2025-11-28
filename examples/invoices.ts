/**
 * Invoice System Example
 *
 * Demonstrates the full invoice workflow including:
 * - Creating invoices with line items
 * - Invoice templates for recurring billing
 * - Partial payments
 * - Automatic reminders
 * - Overdue detection
 * - Statistics and reporting
 */

import {
  RoboxLayer,
  InMemoryStorage,
  InvoiceManager,
  InvoiceStatus,
  ReminderType,
  InvoiceEventType,
  TransactionType,
} from '../src';

async function main() {
  // ============================================
  // Setup
  // ============================================

  const storage = new InMemoryStorage();
  const robox = new RoboxLayer({ storage });

  // Create robot accounts
  const serviceProvider = await robox.createRobotAccount({
    name: 'Charging Station Alpha',
    initialBalance: 0,
  });

  const customer1 = await robox.createRobotAccount({
    name: 'Delivery Bot 1',
    initialBalance: 1000,
  });

  const customer2 = await robox.createRobotAccount({
    name: 'Cleaning Bot 2',
    initialBalance: 500,
  });

  console.log('Created accounts:');
  console.log(`  Provider: ${serviceProvider.name} (${serviceProvider.id})`);
  console.log(`  Customer 1: ${customer1.name} (${customer1.id})`);
  console.log(`  Customer 2: ${customer2.name} (${customer2.id})`);

  // Create invoice manager with payment executor
  const invoices = new InvoiceManager({
    config: {
      defaultCurrency: 'CREDITS',
      defaultPaymentTermsDays: 14,
      defaultTaxRate: 0,
      autoReminders: true,
      defaultReminderDaysBefore: [7, 3, 1],
      defaultReminderDaysAfter: [1, 3, 7],
      invoiceNumberPrefix: 'INV',
    },
    executor: async (params) => {
      const tx = await robox.transfer({
        from: params.from,
        to: params.to,
        amount: params.amount,
        type: TransactionType.TASK_PAYMENT,
        meta: {
          invoiceId: params.invoiceId,
          invoiceNumber: params.invoiceNumber,
        },
      });
      return { transactionId: tx.id };
    },
    reminderSender: async (params) => {
      console.log(`\n📧 REMINDER SENT:`);
      console.log(`   Invoice: ${params.invoiceNumber}`);
      console.log(`   To: ${params.recipientId}`);
      console.log(`   Amount: ${params.amount} CREDITS`);
      console.log(`   Type: ${params.reminderType}`);
      if (params.daysUntilDue) {
        console.log(`   Days until due: ${params.daysUntilDue}`);
      }
      if (params.daysOverdue) {
        console.log(`   Days overdue: ${params.daysOverdue}`);
      }
    },
  });

  // Subscribe to events
  invoices.on(InvoiceEventType.INVOICE_CREATED, (event) => {
    const data = event.data as { invoice: { number: string; total: number } };
    console.log(`\n✅ Invoice created: ${data.invoice.number} for ${data.invoice.total} CREDITS`);
  });

  invoices.on(InvoiceEventType.INVOICE_PAID, (event) => {
    const data = event.data as { invoice: { number: string } };
    console.log(`\n💰 Invoice paid: ${data.invoice.number}`);
  });

  invoices.on(InvoiceEventType.INVOICE_PARTIALLY_PAID, (event) => {
    const data = event.data as { invoice: { number: string; amountDue: number }; payment: { amount: number } };
    console.log(`\n💵 Partial payment received: ${data.payment.amount} CREDITS`);
    console.log(`   Remaining: ${data.invoice.amountDue} CREDITS`);
  });

  // ============================================
  // Example 1: Simple Invoice
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 1: Simple Invoice');
  console.log('========================================');

  const invoice1 = await invoices.create({
    issuerId: serviceProvider.id,
    recipientId: customer1.id,
    lineItems: [
      { description: 'Fast charging session (2 hours)', quantity: 1, unitPrice: 50 },
      { description: 'Battery health check', quantity: 1, unitPrice: 25 },
    ],
    dueDays: 7,
    notes: 'Thank you for choosing our services!',
    paymentInstructions: 'Pay directly through the Robox network',
  });

  console.log(`\nInvoice Details:`);
  console.log(`  Number: ${invoice1.number}`);
  console.log(`  Subtotal: ${invoice1.subtotal} CREDITS`);
  console.log(`  Total: ${invoice1.total} CREDITS`);
  console.log(`  Due: ${invoice1.dueAt.toISOString().split('T')[0]}`);
  console.log(`  Status: ${invoice1.status}`);

  // Pay the invoice
  console.log('\nPaying invoice...');
  await invoices.pay({ invoiceId: invoice1.id });

  const paidInvoice = invoices.get(invoice1.id)!;
  console.log(`Status after payment: ${paidInvoice.status}`);

  // Check balances
  const providerAfter = await robox.getRobotAccount(serviceProvider.id);
  const customer1After = await robox.getRobotAccount(customer1.id);
  console.log(`\nBalances after payment:`);
  console.log(`  Provider: ${providerAfter?.balance} CREDITS`);
  console.log(`  Customer: ${customer1After?.balance} CREDITS`);

  // ============================================
  // Example 2: Partial Payments
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 2: Partial Payments');
  console.log('========================================');

  const invoice2 = await invoices.create({
    issuerId: serviceProvider.id,
    recipientId: customer2.id,
    lineItems: [
      { description: 'Monthly maintenance package', quantity: 1, unitPrice: 200 },
      { description: 'Software update', quantity: 1, unitPrice: 50 },
      { description: 'Emergency repair', quantity: 2, unitPrice: 75 },
    ],
    dueDays: 30,
    allowPartialPayment: true,
    minPartialPayment: 50,
  });

  console.log(`\nInvoice Details:`);
  console.log(`  Number: ${invoice2.number}`);
  console.log(`  Total: ${invoice2.total} CREDITS`);
  console.log(`  Partial payments allowed: Yes (min: 50 CREDITS)`);

  // First partial payment
  console.log('\nMaking first partial payment of 200 CREDITS...');
  await invoices.pay({ invoiceId: invoice2.id, amount: 200 });

  let invoice2Status = invoices.get(invoice2.id)!;
  console.log(`Status: ${invoice2Status.status}`);
  console.log(`Amount paid: ${invoice2Status.amountPaid} CREDITS`);
  console.log(`Amount due: ${invoice2Status.amountDue} CREDITS`);

  // Second partial payment
  console.log('\nMaking second partial payment of 200 CREDITS...');
  await invoices.pay({ invoiceId: invoice2.id, amount: 200 });

  invoice2Status = invoices.get(invoice2.id)!;
  console.log(`Status: ${invoice2Status.status}`);
  console.log(`Amount paid: ${invoice2Status.amountPaid} CREDITS`);
  console.log(`Amount due: ${invoice2Status.amountDue} CREDITS`);

  // Payment history
  console.log('\nPayment History:');
  const payments = invoices.getPayments(invoice2.id);
  payments.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.amount} CREDITS at ${p.paidAt.toISOString()}`);
  });

  // ============================================
  // Example 3: Invoice Templates
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 3: Invoice Templates');
  console.log('========================================');

  // Create a template for recurring billing
  const template = await invoices.createTemplate({
    issuerId: serviceProvider.id,
    name: 'Monthly Maintenance Plan',
    description: 'Standard monthly maintenance package for robots',
    lineItems: [
      { description: 'Monthly diagnostic scan', quantity: 1, unitPrice: 30 },
      { description: 'Lubricant replacement', quantity: 1, unitPrice: 20 },
      { description: 'Firmware updates', quantity: 1, unitPrice: 25 },
    ],
    paymentTermsDays: 14,
    autoReminders: true,
    notes: 'Thank you for subscribing to our maintenance plan!',
  });

  console.log(`\nTemplate created: ${template.name}`);
  console.log(`  ID: ${template.id}`);
  console.log(`  Line items: ${template.lineItems.length}`);
  console.log(`  Payment terms: ${template.paymentTermsDays} days`);

  // Give customer more credits
  await robox.credit(customer1.id, 500, { reason: 'Top up' });

  // Create invoices from template
  console.log('\nCreating invoices from template...');

  const monthlyInvoice1 = await invoices.createFromTemplate({
    templateId: template.id,
    recipientId: customer1.id,
    overrides: {
      notes: 'Invoice for January maintenance',
    },
  });

  console.log(`\nCreated invoice ${monthlyInvoice1.number}:`);
  console.log(`  Total: ${monthlyInvoice1.total} CREDITS`);
  console.log(`  Line items:`);
  monthlyInvoice1.lineItems.forEach((item) => {
    console.log(`    - ${item.description}: ${item.totalPrice} CREDITS`);
  });

  // ============================================
  // Example 4: Draft and Send Workflow
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 4: Draft and Send Workflow');
  console.log('========================================');

  // Create as draft
  const draftInvoice = await invoices.create({
    issuerId: serviceProvider.id,
    recipientId: customer1.id,
    lineItems: [{ description: 'Consulting services', quantity: 3, unitPrice: 100 }],
    asDraft: true,
  });

  console.log(`\nDraft invoice created: ${draftInvoice.number}`);
  console.log(`  Status: ${draftInvoice.status}`);

  // Modify the draft
  const updatedDraft = await invoices.update(draftInvoice.id, {
    lineItems: [
      { description: 'Consulting services', quantity: 3, unitPrice: 100 },
      { description: 'Documentation', quantity: 1, unitPrice: 50 },
    ],
    taxRate: 10,
    notes: 'Updated with documentation fee',
  });

  console.log(`\nUpdated draft:`);
  console.log(`  Subtotal: ${updatedDraft?.subtotal} CREDITS`);
  console.log(`  Tax (10%): ${updatedDraft?.tax} CREDITS`);
  console.log(`  Total: ${updatedDraft?.total} CREDITS`);

  // Send the invoice
  const sentInvoice = await invoices.send(draftInvoice.id);
  console.log(`\nInvoice sent! Status: ${sentInvoice?.status}`);

  // ============================================
  // Example 5: Reminders
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 5: Sending Reminders');
  console.log('========================================');

  // Create an invoice that's almost due
  const urgentInvoice = await invoices.create({
    issuerId: serviceProvider.id,
    recipientId: customer1.id,
    lineItems: [{ description: 'Urgent repair', quantity: 1, unitPrice: 150 }],
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    autoReminders: true,
  });

  console.log(`\nCreated urgent invoice: ${urgentInvoice.number}`);
  console.log(`  Due in 2 days`);

  // Manually send a reminder
  await invoices.sendReminder(urgentInvoice.id, ReminderType.UPCOMING_DUE);

  // Check reminders
  const reminders = invoices.getReminders(urgentInvoice.id);
  console.log(`\nReminders sent: ${reminders.length}`);

  // ============================================
  // Example 6: Invoice Operations
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 6: Invoice Operations');
  console.log('========================================');

  // Cancel an invoice
  const cancelledInvoice = await invoices.cancel(urgentInvoice.id, 'Customer requested cancellation');
  console.log(`\nInvoice ${cancelledInvoice?.number} cancelled`);
  console.log(`  Status: ${cancelledInvoice?.status}`);

  // Create and dispute an invoice
  const disputedInvoice = await invoices.create({
    issuerId: serviceProvider.id,
    recipientId: customer2.id,
    lineItems: [{ description: 'Disputed service', quantity: 1, unitPrice: 500 }],
    dueDays: 7,
  });

  await invoices.dispute(disputedInvoice.id, 'Service was not delivered as specified');
  const disputed = invoices.get(disputedInvoice.id)!;
  console.log(`\nInvoice ${disputed.number} disputed`);
  console.log(`  Status: ${disputed.status}`);
  console.log(`  Reason: ${disputed.meta?.disputeReason}`);

  // ============================================
  // Example 7: Statistics
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 7: Statistics');
  console.log('========================================');

  const stats = invoices.getStats();

  console.log('\nInvoice Statistics:');
  console.log(`  Total invoices: ${stats.totalInvoices}`);
  console.log(`  Draft: ${stats.draftInvoices}`);
  console.log(`  Pending: ${stats.pendingInvoices}`);
  console.log(`  Paid: ${stats.paidInvoices}`);
  console.log(`  Overdue: ${stats.overdueInvoices}`);
  console.log(`  Cancelled: ${stats.cancelledInvoices}`);
  console.log(`\n  Total revenue: ${stats.totalRevenue} CREDITS`);
  console.log(`  Total outstanding: ${stats.totalOutstanding} CREDITS`);
  console.log(`  Total overdue: ${stats.totalOverdue} CREDITS`);
  console.log(`  Average payment time: ${stats.averagePaymentTime.toFixed(2)} days`);

  console.log('\nBy Currency:');
  Object.entries(stats.byCurrency).forEach(([currency, data]) => {
    console.log(`  ${currency}: ${data.count} invoices, ${data.total} total`);
  });

  // Provider statistics
  const providerStats = invoices.getStats({ issuerId: serviceProvider.id });
  console.log(`\nProvider Stats:`);
  console.log(`  Issued invoices: ${providerStats.totalInvoices}`);
  console.log(`  Revenue: ${providerStats.totalRevenue} CREDITS`);

  // ============================================
  // Example 8: Listing and Filtering
  // ============================================

  console.log('\n\n========================================');
  console.log('Example 8: Listing and Filtering');
  console.log('========================================');

  // All invoices issued by provider
  const providerInvoices = invoices.getIssuedBy(serviceProvider.id);
  console.log(`\nInvoices issued by provider: ${providerInvoices.length}`);

  // All invoices received by customer
  const customerInvoices = invoices.getReceivedBy(customer1.id);
  console.log(`Invoices received by customer 1: ${customerInvoices.length}`);

  // Paid invoices
  const paidInvoices = invoices.list({ status: InvoiceStatus.PAID });
  console.log(`\nPaid invoices: ${paidInvoices.length}`);

  // High value invoices
  const highValueInvoices = invoices.list({ minAmount: 200 });
  console.log(`Invoices >= 200 CREDITS: ${highValueInvoices.length}`);

  // List all templates
  const templates = invoices.listTemplates({ issuerId: serviceProvider.id });
  console.log(`\nTemplates by provider: ${templates.length}`);
  templates.forEach((t) => {
    console.log(`  - ${t.name}: ${t.lineItems.length} items`);
  });

  // ============================================
  // Final Summary
  // ============================================

  console.log('\n\n========================================');
  console.log('Final Account Balances');
  console.log('========================================');

  const finalProvider = await robox.getRobotAccount(serviceProvider.id);
  const finalCustomer1 = await robox.getRobotAccount(customer1.id);
  const finalCustomer2 = await robox.getRobotAccount(customer2.id);

  console.log(`\n  ${finalProvider?.name}: ${finalProvider?.balance} CREDITS`);
  console.log(`  ${finalCustomer1?.name}: ${finalCustomer1?.balance} CREDITS`);
  console.log(`  ${finalCustomer2?.name}: ${finalCustomer2?.balance} CREDITS`);

  // Cleanup
  invoices.clear();

  console.log('\n\n✅ Invoice example completed!');
}

main().catch(console.error);
