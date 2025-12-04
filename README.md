# robox-clearing

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/robox-clearing.svg)](https://www.npmjs.com/package/robox-clearing)

A powerful clearing layer for machine-to-machine (robot-to-robot) interactions with micropayments, escrow, marketplace, analytics, and PostgreSQL storage.

## Features

- 🤖 **Robot Account Management** - Create, update, freeze, and manage robot accounts
- 💰 **Balance Operations** - Credit, debit with full audit trail
- 💸 **Micropayments** - Fast transfers with fee support
- 🔒 **Escrow** - Conditional payments with expiration
- 📦 **Batch Transfers** - Process multiple payments at once
- 🏪 **Marketplace** - Service listings, orders, and reviews *(v1.1)*
- 📊 **Analytics** - Statistics, reports, and data export *(v1.1)*
- 🧾 **Invoices** - Templates, partial payments, reminders *(v1.2)*
- 📶 **Bluetooth** - BLE/Classic robot-to-robot communication *(NEW in v2.0)*
- 🗄️ **PostgreSQL Storage** - Production-ready persistent storage
- 🪝 **Webhooks** - HTTP callbacks for external integrations
- 🔐 **Role-Based Authorization** - Consumer, Provider, Admin, Operator, Auditor
- 📝 **Audit Log** - Complete operation history
- 🎯 **Event System** - Subscribe to all operations
- 🔌 **Middleware Support** - Extend functionality
- ⚡ **Idempotency** - Safe retries with idempotency keys

## Installation

```bash
npm install robox-clearing
```

## Quick Start

```typescript
import {
  RoboxLayer,
  InMemoryStorage,
  RobotRole,
  TransactionType,
  EventType,
} from 'robox-clearing';

// Initialize
const robox = new RoboxLayer({
  storage: new InMemoryStorage(),
  enableAuditLog: true,
});

// Subscribe to events
robox.on(EventType.TRANSFER_COMPLETED, (event) => {
  console.log('Transfer completed:', event.data);
});

// Create accounts
const worker = await robox.createRobotAccount({
  id: 'worker-001',
  name: 'Worker Bot',
  initialBalance: 1000,
  roles: [RobotRole.CONSUMER],
  tags: ['production'],
});

const service = await robox.createRobotAccount({
  id: 'service-001',
  name: 'Charging Station',
  roles: [RobotRole.PROVIDER],
});

// Transfer funds
const tx = await robox.transfer({
  from: 'worker-001',
  to: 'service-001',
  amount: 100,
  type: TransactionType.ENERGY_PAYMENT,
  meta: { kwh: 5 },
});

console.log(`Transaction ${tx.id} completed!`);
```

## Account Management

```typescript
// Create with limits
const account = await robox.createRobotAccount({
  id: 'robot-001',
  name: 'Worker',
  initialBalance: 1000,
  roles: [RobotRole.CONSUMER, RobotRole.PROVIDER],
  limits: {
    maxTransferAmount: 500,
    dailyTransferLimit: 2000,
    minBalance: 100,
  },
  tags: ['warehouse-a', 'priority'],
});

// List with filters
const consumers = await robox.listRobotAccounts({
  role: RobotRole.CONSUMER,
  tag: 'warehouse-a',
  minBalance: 500,
});

// Freeze/unfreeze
await robox.freezeAccount('robot-001');
await robox.unfreezeAccount('robot-001');

// Get balance info
const balance = await robox.getTotalBalance('robot-001');
// { available: 700, frozen: 300, total: 1000 }
```

## Transfers

```typescript
// Simple transfer
const tx = await robox.transfer({
  from: 'buyer',
  to: 'seller',
  amount: 100,
  type: TransactionType.PARTS_PAYMENT,
});

// With idempotency (safe retries)
const tx = await robox.transfer({
  from: 'buyer',
  to: 'seller',
  amount: 100,
  type: TransactionType.TASK_PAYMENT,
  idempotencyKey: 'order-12345',
});

// With custom fee
const tx = await robox.transfer({
  from: 'buyer',
  to: 'seller',
  amount: 100,
  fee: 2, // Platform fee
  type: TransactionType.COMPUTE_PAYMENT,
});

// Refund
const refund = await robox.refund(tx.id, 'admin');
```

### Transaction Types

```typescript
enum TransactionType {
  TASK_PAYMENT = 'TASK_PAYMENT',
  ENERGY_PAYMENT = 'ENERGY_PAYMENT',
  PARTS_PAYMENT = 'PARTS_PAYMENT',
  DATA_PAYMENT = 'DATA_PAYMENT',
  COMPUTE_PAYMENT = 'COMPUTE_PAYMENT',
  STORAGE_PAYMENT = 'STORAGE_PAYMENT',
  BANDWIDTH_PAYMENT = 'BANDWIDTH_PAYMENT',
  LICENSE_PAYMENT = 'LICENSE_PAYMENT',
  SUBSCRIPTION = 'SUBSCRIPTION',
  REFUND = 'REFUND',
  FEE = 'FEE',
  REWARD = 'REWARD',
  PENALTY = 'PENALTY',
}
```

## Escrow

```typescript
// Create escrow (funds are frozen)
const escrow = await robox.createEscrow({
  from: 'buyer',
  to: 'seller',
  amount: 500,
  condition: 'delivery_confirmed',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
});

// Release escrow (transfer funds to seller)
const tx = await robox.releaseEscrow(escrow.id);

// Or refund (return funds to buyer)
await robox.refundEscrow(escrow.id);

// List escrows
const pending = await robox.listEscrows({
  robotId: 'buyer',
  status: EscrowStatus.PENDING,
});
```

## Batch Transfers

```typescript
// Process multiple transfers at once
const batch = await robox.batchTransfer({
  transfers: [
    { from: 'payer', to: 'worker-1', amount: 100, type: TransactionType.REWARD },
    { from: 'payer', to: 'worker-2', amount: 150, type: TransactionType.REWARD },
    { from: 'payer', to: 'worker-3', amount: 200, type: TransactionType.REWARD },
  ],
  stopOnError: false, // Continue on failures
});

console.log(`Success: ${batch.successCount}, Failed: ${batch.failedCount}`);
// batch.status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
```

## Webhooks

Send HTTP callbacks to external services when events occur. Features include event filtering, rate limiting, auto-disable on failures, health monitoring, and more.

```typescript
import { WebhookManager, EventType } from 'robox-clearing';

const webhooks = new WebhookManager();

// Register a webhook with advanced options
const hook = webhooks.create({
  name: 'Payment Notifications',
  url: 'https://your-server.com/webhook',
  events: [EventType.TRANSFER_COMPLETED, EventType.ESCROW_RELEASED],
  secret: 'your-secret-key',  // For signature verification
  retryAttempts: 3,
  timeoutMs: 10000,
  robotId: 'robot-001',  // Owner robot
  // Advanced filtering
  filterRobotIds: ['vip-robot-1', 'vip-robot-2'],  // Only these robots
  minAmountThreshold: 1000,  // Only transfers >= 1000
  maxAmountThreshold: 100000,  // Only transfers <= 100000
  transactionTypes: ['TASK_PAYMENT', 'ENERGY_PAYMENT'],
  // Rate limiting & auto-disable
  rateLimitPerMinute: 60,
  autoDisableAfterFailures: 10,
  metadata: { environment: 'production' },
});

// Register webhook for all events
const allEventsHook = webhooks.create({
  url: 'https://your-server.com/all-events',
  events: ['*'],
  secret: 'another-secret',
});

// Dispatch event with context (for filtering)
await webhooks.dispatch(
  {
    type: EventType.TRANSFER_COMPLETED,
    data: { from: 'vip-robot-1', to: 'robot-2', amount: 5000 },
    timestamp: new Date(),
  },
  {
    fromRobotId: 'vip-robot-1',
    toRobotId: 'robot-2',
    amount: 5000,
    transactionType: 'TASK_PAYMENT',
  }
);

// Test a webhook
const testResult = await webhooks.test(hook.id, {
  data: { message: 'Test payload' },
});
console.log(`Test: ${testResult.success ? 'OK' : 'FAILED'} (${testResult.durationMs}ms)`);

// Validate webhook URL
const validation = await webhooks.validateUrl('https://example.com/webhook');
console.log(`Reachable: ${validation.reachable}, Response time: ${validation.responseTime}ms`);

// Manage webhooks
webhooks.disable(hook.id);
webhooks.enable(hook.id);
webhooks.rotateSecret(hook.id, 'new-secret-key');
webhooks.delete(hook.id);

// Batch operations
webhooks.createBatch([
  { url: 'https://server1.com/hook', events: ['*'] },
  { url: 'https://server2.com/hook', events: ['*'] },
]);
webhooks.disableBatch(['hook-1', 'hook-2']);
webhooks.deleteBatch(['hook-1', 'hook-2']);
webhooks.deleteByRobot('robot-001');  // Delete all webhooks for a robot

// List with filters
const allHooks = webhooks.list();
const robotHooks = webhooks.list({ robotId: 'robot-001' });
const enabledHooks = webhooks.list({ enabled: true });
const transferHooks = webhooks.list({ event: EventType.TRANSFER_COMPLETED });

// Get delivery history
const deliveries = webhooks.listDeliveries({
  webhookId: hook.id,
  status: WebhookDeliveryStatus.FAILED,
  fromDate: new Date('2024-01-01'),
  minDurationMs: 1000,  // Slow deliveries
});

// Retry failed deliveries
await webhooks.retryDelivery(deliveryId);
const retriedCount = await webhooks.retryAllFailed(hook.id);

// Health monitoring
const health = webhooks.getHealth(hook.id);
console.log(`Healthy: ${health.healthy}, Success rate: ${health.successRate * 100}%`);

const allHealth = webhooks.getAllHealth();
const unhealthy = webhooks.getUnhealthyWebhooks();

// Rate limit status
const rateLimit = webhooks.getRateLimitStatus(hook.id);
console.log(`Remaining: ${rateLimit.remaining}, Resets: ${rateLimit.resetAt}`);

// Comprehensive statistics
const stats = webhooks.getStats();
// {
//   totalWebhooks: 5,
//   activeWebhooks: 4,
//   totalDeliveries: 150,
//   successfulDeliveries: 145,
//   failedDeliveries: 5,
//   pendingDeliveries: 0,
//   averageResponseTime: 234,
//   deliveriesByEvent: { 'transfer.completed': 100, 'escrow.created': 50 },
//   deliveriesByStatus: { SUCCESS: 145, FAILED: 5, ... }
// }

// Export/Import (for backup)
const backup = webhooks.export();
webhooks.import(backup);

// Cleanup
webhooks.clearOldDeliveries(new Date(Date.now() - 7 * 24 * 3600000));  // Clear week-old
```

### Webhook Payload

Your endpoint will receive POST requests with this payload:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "transfer.completed",
  "data": {
    "id": "tx-123",
    "from": "robot-1",
    "to": "robot-2",
    "amount": 100,
    "type": "TASK_PAYMENT"
  },
  "timestamp": "2025-11-26T12:00:00.000Z",
  "signature": "a1c3b2f1e4d5...",
  "webhookId": "hook-123",
  "attemptNumber": 0
}
```

### Webhook Headers

```
Content-Type: application/json
User-Agent: RoboxClearing/1.1
X-Webhook-ID: hook-id
X-Delivery-ID: delivery-id
X-Event-Type: transfer.completed
X-Timestamp: 2025-11-26T12:00:00.000Z
X-Signature: hmac-sha256-signature
X-Attempt-Number: 0
```

### Verify Webhook Signature

```typescript
import { WebhookManager } from 'robox-clearing';

// On your server receiving webhooks
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-signature'];
  const payload = JSON.stringify(req.body);
  const secret = 'your-secret-key';

  // Timing-safe signature verification
  const isValid = WebhookManager.verifySignature(payload, signature, secret);
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Parse and process webhook
  const webhookPayload = WebhookManager.parsePayload(payload);
  console.log('Event:', webhookPayload.event);
  console.log('Data:', webhookPayload.data);
  console.log('Attempt:', webhookPayload.attemptNumber);
  
  res.status(200).send('OK');
});

// Create signature (for testing)
const testSignature = WebhookManager.createSignature(payload, secret);
```

## Events

```typescript
import { EventType } from 'robox-clearing';

// Subscribe to specific events
robox.on(EventType.TRANSFER_COMPLETED, (event) => {
  console.log('Transfer:', event.data);
});

robox.on(EventType.ESCROW_CREATED, (event) => {
  console.log('Escrow created:', event.data);
});

// Subscribe to all events
robox.on('*', (event) => {
  console.log(`[${event.type}]`, event.data);
});

// Unsubscribe
const unsubscribe = robox.on(EventType.ACCOUNT_CREATED, handler);
unsubscribe();
```

### Available Events

| Event | Description |
|-------|-------------|
| `account.created` | New account created |
| `account.updated` | Account updated |
| `account.deleted` | Account deleted |
| `account.frozen` | Account frozen |
| `account.unfrozen` | Account unfrozen |
| `balance.credited` | Balance credited |
| `balance.debited` | Balance debited |
| `transfer.initiated` | Transfer started |
| `transfer.completed` | Transfer succeeded |
| `transfer.failed` | Transfer failed |
| `escrow.created` | Escrow created |
| `escrow.released` | Escrow released |
| `escrow.refunded` | Escrow refunded |
| `batch.started` | Batch processing started |
| `batch.completed` | Batch processing finished |

## Fee Calculator

```typescript
const robox = new RoboxLayer({
  storage: new InMemoryStorage(),
  feeCalculator: {
    calculate: (amount, type, from, to) => {
      // 1% fee for all transfers
      return Math.floor(amount * 0.01);
    },
  },
});
```

## Middleware

```typescript
import { loggingMiddleware, rateLimitMiddleware } from 'robox-clearing';

// Add logging
robox.use(loggingMiddleware({
  info: console.log,
  warn: console.warn,
  error: console.error,
}));

// Add rate limiting
robox.use(rateLimitMiddleware(100, 60000)); // 100 requests per minute

// Custom middleware
robox.use(async (ctx, next) => {
  console.log(`Action: ${ctx.action}`);
  await next();
  console.log('Done');
});
```

## Statistics

```typescript
const stats = await robox.getStatistics();

// {
//   totalAccounts: 150,
//   activeAccounts: 142,
//   totalTransactions: 10523,
//   totalVolume: 1250000,
//   totalFees: 12500,
//   averageTransactionAmount: 118.78,
//   transactionsByType: {
//     TASK_PAYMENT: 5000,
//     ENERGY_PAYMENT: 3000,
//     PARTS_PAYMENT: 2523
//   }
// }

// With date range
const monthlyStats = await robox.getStatistics(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);
```

## Roles & Authorization

| Role | Permissions |
|------|-------------|
| `consumer` | Can send payments |
| `provider` | Can receive payments |
| `operator` | Can transfer, credit, manage escrow |
| `auditor` | Can view audit logs |
| `admin` | Full access |

```typescript
// Custom auth policy
const robox = new RoboxLayer({
  storage: new InMemoryStorage(),
  auth: {
    canTransfer: async (ctx) => {
      // Custom logic
      if (ctx.amount > 10000) {
        return ctx.initiator?.roles.includes('admin');
      }
      return true;
    },
  },
});
```

## Error Handling

```typescript
import {
  RoboxForbiddenError,      // 403
  RoboxNotFoundError,        // 404
  RoboxValidationError,      // 400
  RoboxInsufficientFundsError, // 402
  RoboxAccountFrozenError,   // 403
  RoboxLimitExceededError,   // 429
  RoboxEscrowError,          // 400
  RoboxIdempotencyError,     // 409
} from 'robox-clearing';

try {
  await robox.transfer({ ... });
} catch (error) {
  if (error instanceof RoboxForbiddenError) {
    // HTTP 403
    console.error(`Forbidden: ${error.reason}`);
  }
  
  if (error instanceof RoboxInsufficientFundsError) {
    // HTTP 402
    console.error(`Need ${error.required}, have ${error.available}`);
  }
  
  // All errors have toJSON()
  res.status(error.code).json(error.toJSON());
}
```

## PostgreSQL Storage

Production-ready persistent storage with connection pooling and transactions.

```bash
# Install PostgreSQL driver (optional dependency)
npm install pg
```

```typescript
import { RoboxLayer, PostgresStorage } from 'robox-clearing';

// Create storage with connection string
const storage = new PostgresStorage({
  connectionString: 'postgres://user:pass@localhost:5432/robox',
  poolSize: 10,
  schema: 'public',
  autoMigrate: true, // Auto-run migrations
});

// Connect (runs migrations automatically)
await storage.connect();

// Use with RoboxLayer
const robox = new RoboxLayer({ storage });

// Use transactions for atomic operations
await storage.transaction(async (client) => {
  // All operations in this block are atomic
  await client.query('UPDATE accounts SET balance = balance - 100 WHERE id = $1', ['robot-1']);
  await client.query('UPDATE accounts SET balance = balance + 100 WHERE id = $1', ['robot-2']);
});

// Disconnect when done
await storage.disconnect();
```

### Configuration Options

```typescript
const storage = new PostgresStorage({
  // Connection (use either connectionString OR individual fields)
  connectionString: 'postgres://...',
  // OR
  host: 'localhost',
  port: 5432,
  database: 'robox',
  user: 'postgres',
  password: 'secret',

  // Pool settings
  poolSize: 10,           // Max connections (default: 10)
  idleTimeout: 30000,     // Idle timeout in ms (default: 30000)
  connectionTimeout: 10000, // Connection timeout in ms

  // Schema settings
  schema: 'robox',        // Database schema (default: 'public')
  tablePrefix: 'app_',    // Table prefix (default: '')
  autoMigrate: true,      // Run migrations on connect (default: true)

  // SSL
  ssl: true,              // Enable SSL
  // OR detailed SSL config
  ssl: {
    rejectUnauthorized: false,
    ca: '...',
    cert: '...',
    key: '...',
  },
});
```

## Marketplace

Enable robots to publish, discover, and purchase services with automatic escrow payments.

```typescript
import {
  RoboxLayer,
  InMemoryStorage,
  MarketplaceManager,
  ServiceCategory,
  MarketplaceEventType,
} from 'robox-clearing';

const robox = new RoboxLayer({ storage: new InMemoryStorage() });
const marketplace = new MarketplaceManager(robox, {
  feePercentage: 2.5,     // Platform fee
  escrowExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// Subscribe to events
marketplace.on(MarketplaceEventType.ORDER_COMPLETED, (event) => {
  console.log('Order completed:', event.data);
});

// List a service
const service = await marketplace.listService({
  providerId: 'charger-1',
  name: 'Fast Charging',
  description: 'Quick battery charging in 30 minutes',
  price: 25,
  category: ServiceCategory.ENERGY,
  availability: {
    totalSlots: 5,
    schedule: '24/7',
    location: { lat: 52.52, lng: 13.405, radius: 5000 },
  },
  duration: 30,
  tags: ['fast', 'reliable'],
});

// Search services
const results = await marketplace.search({
  category: ServiceCategory.ENERGY,
  maxPrice: 30,
  minRating: 4,
  tags: ['fast'],
  sortBy: 'rating',
  sortOrder: 'desc',
  limit: 10,
});

// Purchase service (creates escrow automatically)
const order = await marketplace.purchase({
  serviceId: service.id,
  buyerId: 'vacuum-1',
  quantity: 1,
  notes: 'Please charge to 100%',
});

// Provider workflow
await marketplace.startOrder(order.id);     // Start working
await marketplace.completeOrder(order.id);  // Complete & release escrow

// Buyer reviews
const review = await marketplace.createReview({
  orderId: order.id,
  reviewerId: 'vacuum-1',
  rating: 5,
  comment: 'Excellent service!',
});

// Provider responds
await marketplace.respondToReview(review.id, 'Thank you!');

// Get marketplace statistics
const stats = await marketplace.getStats();
console.log(`Total volume: ${stats.totalVolume} credits`);
```

### Service Categories

```typescript
enum ServiceCategory {
  ENERGY = 'ENERGY',
  COMPUTE = 'COMPUTE',
  STORAGE = 'STORAGE',
  BANDWIDTH = 'BANDWIDTH',
  DATA = 'DATA',
  MAINTENANCE = 'MAINTENANCE',
  LOGISTICS = 'LOGISTICS',
  CUSTOM = 'CUSTOM',
}
```

### Order Lifecycle

```
PENDING → PAID → IN_PROGRESS → COMPLETED
                     ↓
                 CANCELLED / DISPUTED / REFUNDED
```

## Analytics

Comprehensive statistics, reporting, and data export.

```typescript
import {
  RoboxLayer,
  InMemoryStorage,
  AnalyticsManager,
  TimePeriod,
  ReportType,
  ExportFormat,
} from 'robox-clearing';

const robox = new RoboxLayer({ storage: new InMemoryStorage() });
const analytics = new AnalyticsManager(robox);

// Get aggregated statistics
const stats = await analytics.getStats({
  from: '2025-01-01',
  to: '2025-01-31',
  groupBy: TimePeriod.DAY,
  types: ['TASK_PAYMENT', 'ENERGY_PAYMENT'],
});

console.log(`Total volume: ${stats.totalVolume}`);
console.log(`Average: ${stats.averageAmount}`);
console.log(`Median: ${stats.medianAmount}`);
console.log(`By type:`, stats.byType);
console.log(`Time series:`, stats.timeSeries);

// Top spenders / receivers
const topSpenders = await analytics.topSpenders({ limit: 10 });
const topReceivers = await analytics.topReceivers({ limit: 10 });
const mostActive = await analytics.topActive({ limit: 10 });

// Account activity
const activity = await analytics.getAccountActivity('robot-1');
console.log(`Net flow: ${activity.netFlow}`);
console.log(`Most common type: ${activity.mostCommonType}`);

// Money flow analysis
const flow = await analytics.moneyFlow({
  from: 'hub',
  depth: 3,
  minAmount: 100,
});
// Returns tree: hub → factory → robot → charger

// Trend analysis
const trend = await analytics.analyzeTrend('volume', {
  groupBy: TimePeriod.DAY,
});
console.log(`Trend: ${trend.trend}`);      // 'increasing' | 'decreasing' | 'stable'
console.log(`Change: ${trend.changePercent}%`);
console.log(`Anomalies: ${trend.anomalies?.length || 0}`);

// Export to CSV
await analytics.exportCSV({
  path: './transactions.csv',
  from: '2025-01-01',
  accountIds: ['robot-1', 'robot-2'],
  delimiter: ',',
});

// Export to JSON
await analytics.exportJSON({
  path: './full-export.json',
  includeAccounts: true,
  includeEscrows: true,
});

// Generate reports
const report = await analytics.generateReport({
  type: ReportType.SUMMARY,
  title: 'Monthly Summary',
  from: '2025-01-01',
  to: '2025-01-31',
});

// Comparison report
const comparison = await analytics.generateReport({
  type: ReportType.COMPARISON,
  from: '2025-01-01',
  to: '2025-01-31',
  compareTo: {
    from: '2024-12-01',
    to: '2024-12-31',
  },
});
console.log(`Volume change: ${comparison.comparison?.changes.volumeChange}%`);
```

### Report Types

```typescript
enum ReportType {
  SUMMARY = 'summary',           // Basic stats + top 5
  DETAILED = 'detailed',         // Full breakdown + activities
  ACCOUNT_ACTIVITY = 'account_activity', // All account activities
  FLOW_ANALYSIS = 'flow_analysis',       // Money flow trees
  COMPARISON = 'comparison',     // Period comparison
}
```

### Time Periods

```typescript
enum TimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}
```

## Invoices *(NEW in v1.2)*

Complete invoice management with templates, partial payments, and automatic reminders.

```typescript
import {
  RoboxLayer,
  InMemoryStorage,
  InvoiceManager,
  InvoiceStatus,
  InvoiceEventType,
  TransactionType,
} from 'robox-clearing';

const robox = new RoboxLayer({ storage: new InMemoryStorage() });

// Create invoice manager with payment integration
const invoices = new InvoiceManager({
  config: {
    defaultCurrency: 'CREDITS',
    defaultPaymentTermsDays: 30,
    autoReminders: true,
    defaultReminderDaysBefore: [7, 3, 1],
    defaultReminderDaysAfter: [1, 3, 7, 14],
    invoiceNumberPrefix: 'INV',
  },
  executor: async (params) => {
    const tx = await robox.transfer({
      from: params.from,
      to: params.to,
      amount: params.amount,
      type: TransactionType.TASK_PAYMENT,
      meta: { invoiceId: params.invoiceId },
    });
    return { transactionId: tx.id };
  },
  reminderSender: async (params) => {
    console.log(`Reminder: Invoice ${params.invoiceNumber} due in ${params.daysUntilDue} days`);
  },
});

// Start background processor (overdue detection, reminders)
invoices.start();

// Create invoice with line items
const invoice = await invoices.create({
  issuerId: 'provider-1',
  recipientId: 'customer-1',
  lineItems: [
    { description: 'Charging service (2 hours)', quantity: 2, unitPrice: 50 },
    { description: 'Battery diagnostics', quantity: 1, unitPrice: 30 },
  ],
  dueDays: 14,
  taxRate: 10,
  allowPartialPayment: true,
  minPartialPayment: 25,
  notes: 'Thank you for your business!',
});

console.log(`Invoice ${invoice.number}: ${invoice.total} CREDITS`);

// Pay invoice in full
await invoices.pay({ invoiceId: invoice.id });

// Or make partial payment
await invoices.pay({ invoiceId: invoice.id, amount: 50 });
await invoices.pay({ invoiceId: invoice.id, amount: 80 });

// Check payment history
const payments = invoices.getPayments(invoice.id);
payments.forEach(p => console.log(`Paid: ${p.amount} at ${p.paidAt}`));
```

### Invoice Templates

```typescript
// Create reusable template
const template = await invoices.createTemplate({
  issuerId: 'provider-1',
  name: 'Monthly Maintenance',
  lineItems: [
    { description: 'Diagnostic scan', quantity: 1, unitPrice: 30 },
    { description: 'Lubrication', quantity: 1, unitPrice: 20 },
    { description: 'Software update', quantity: 1, unitPrice: 25 },
  ],
  paymentTermsDays: 14,
  autoReminders: true,
});

// Create invoices from template
const jan = await invoices.createFromTemplate({
  templateId: template.id,
  recipientId: 'customer-1',
  overrides: { notes: 'January maintenance' },
});

const feb = await invoices.createFromTemplate({
  templateId: template.id,
  recipientId: 'customer-1',
  overrides: { notes: 'February maintenance' },
});
```

### Draft Workflow

```typescript
// Create as draft
const draft = await invoices.create({
  issuerId: 'provider-1',
  recipientId: 'customer-1',
  lineItems: [{ description: 'Consulting', quantity: 2, unitPrice: 100 }],
  asDraft: true,
});

// Update draft
await invoices.update(draft.id, {
  lineItems: [
    { description: 'Consulting', quantity: 2, unitPrice: 100 },
    { description: 'Documentation', quantity: 1, unitPrice: 50 },
  ],
  discount: 25,
});

// Send to customer
await invoices.send(draft.id);
```

### Invoice Operations

```typescript
// Cancel invoice
await invoices.cancel(invoice.id, 'Customer requested cancellation');

// Dispute invoice
await invoices.dispute(invoice.id, 'Service not delivered as specified');

// Refund paid invoice
await invoices.refund(invoice.id, 100, 'Partial refund for service issue');

// Send manual reminder
await invoices.sendReminder(invoice.id, ReminderType.OVERDUE);
```

### Statistics

```typescript
const stats = invoices.getStats({ issuerId: 'provider-1' });

console.log(`Total invoices: ${stats.totalInvoices}`);
console.log(`Pending: ${stats.pendingInvoices}`);
console.log(`Paid: ${stats.paidInvoices}`);
console.log(`Overdue: ${stats.overdueInvoices}`);
console.log(`Revenue: ${stats.totalRevenue} CREDITS`);
console.log(`Outstanding: ${stats.totalOutstanding} CREDITS`);
console.log(`Avg payment time: ${stats.averagePaymentTime} days`);
```

### Invoice Events

```typescript
invoices.on(InvoiceEventType.INVOICE_CREATED, (event) => {
  console.log('New invoice:', event.data.invoice.number);
});

invoices.on(InvoiceEventType.INVOICE_PAID, (event) => {
  console.log('Invoice paid:', event.data.invoice.number);
});

invoices.on(InvoiceEventType.INVOICE_OVERDUE, (event) => {
  console.log('Invoice overdue:', event.data.invoice.number);
});

invoices.on(InvoiceEventType.REMINDER_SENT, (event) => {
  console.log('Reminder sent:', event.data.reminder.type);
});
```

### Invoice Status Lifecycle

```
DRAFT → PENDING → PARTIALLY_PAID → PAID
              ↓         ↓
          OVERDUE   OVERDUE
              ↓         ↓
          CANCELLED / DISPUTED / REFUNDED
```

## Bluetooth Communication *(NEW in v2.0)*

Robot-to-robot communication over Bluetooth Low Energy (BLE) and Classic Bluetooth.

### Setup

```typescript
import {
  BluetoothManager,
  BluetoothMode,
  BluetoothMessageType,
  BluetoothEventType,
  MessagePriority,
} from 'robox-clearing';

const bluetooth = new BluetoothManager({
  robotId: 'robot-001',
  deviceName: 'Worker Bot',
  mode: BluetoothMode.BLE,
  maxConnections: 10,
  onMessage: (msg) => console.log('Received:', msg.type),
  onDeviceDiscovered: (device) => console.log('Found:', device.name),
});

await bluetooth.initialize();
```

### Device Discovery

```typescript
// Start scanning for nearby robots
await bluetooth.startScan();

// Or perform a timed scan
const result = await bluetooth.scan({
  duration: 5000,
  rssiThreshold: -70,
  serviceUUIDs: ['00001800-0000-1000-8000-00805f9b34fb'],
});

console.log(`Found ${result.devices.length} devices`);

// Get all discovered devices
const devices = bluetooth.getDiscoveredDevices();
```

### Connection & Messaging

```typescript
// Connect to another robot
const connection = await bluetooth.connect({
  deviceId: 'device-001',
  robotId: 'robot-002',
  mode: BluetoothMode.BLE,
  timeout: 5000,
});

if (connection.success) {
  // Send a message
  await bluetooth.sendMessage('robot-002', {
    type: BluetoothMessageType.DATA,
    payload: { command: 'status' },
  }, {
    priority: MessagePriority.HIGH,
    reliable: true,
  });

  // Broadcast to all connected robots
  await bluetooth.broadcast({
    type: BluetoothMessageType.ANNOUNCE,
    payload: { message: 'Hello everyone!' },
  });
}

// Listen for specific message types
bluetooth.onMessage(BluetoothMessageType.COMMAND, (msg) => {
  console.log('Command received:', msg.payload);
});
```

### Transaction Over Bluetooth

```typescript
// Request a transaction
const result = await bluetooth.requestTransaction('robot-002', {
  from: 'robot-001',
  to: 'robot-002',
  amount: 50,
  type: 'SERVICE_PAYMENT',
  meta: { service: 'charging' },
});

if (result.accepted) {
  console.log('Transaction accepted:', result.transactionId);
}

// Confirm or reject incoming transactions
await bluetooth.confirmTransaction('robot-001', 'tx-001');
await bluetooth.rejectTransaction('robot-001', 'tx-001', 'Insufficient balance');
```

### Service Advertisement

```typescript
// Start advertising
await bluetooth.startAdvertising();

// Advertise a service
bluetooth.advertiseService({
  robotId: 'robot-001',
  serviceId: 'svc-001',
  serviceType: 'CHARGING',
  name: 'Fast Charging Station',
  price: 10,
  currency: 'TOKEN',
  available: true,
});

// Query services from another robot
const services = await bluetooth.queryServices('robot-002');
```

### Proximity Detection

```typescript
// Estimate distance to a device
const distance = bluetooth.estimateDistance('device-001');
console.log(`Distance: ~${distance?.distance}m (${distance?.accuracy})`);

// Get proximity zone
const zone = bluetooth.getProximityZone('device-001');
// zone: 'IMMEDIATE' (<0.5m), 'NEAR' (0.5-3m), 'FAR' (3-10m), 'UNKNOWN'

// Find devices in a zone
const nearbyDevices = bluetooth.findDevicesInZone(ProximityZone.NEAR);
```

### Mesh Networking

```typescript
// Create a mesh network
const mesh = await bluetooth.createMesh('RobotSwarm');

// Or join an existing mesh
await bluetooth.joinMesh(meshId, 'robot-002');

// Broadcast through the mesh
await bluetooth.meshBroadcast({
  type: BluetoothMessageType.ANNOUNCE,
  payload: { alert: 'Low battery' },
});

// Leave mesh
await bluetooth.leaveMesh();
```

### Events

```typescript
bluetooth.onEvent(BluetoothEventType.DEVICE_DISCOVERED, (event) => {
  console.log('New device:', event.data.name);
});

bluetooth.onEvent(BluetoothEventType.DEVICE_CONNECTED, (event) => {
  console.log('Connected to:', event.data.robotId);
});

bluetooth.onEvent(BluetoothEventType.MESSAGE_RECEIVED, (event) => {
  console.log('Message from:', event.data.from);
});

// Subscribe to all events
bluetooth.onEvent('*', (event) => {
  console.log(`[${event.type}]`, event.data);
});
```

### Statistics

```typescript
const stats = bluetooth.getStats();
console.log(`Messages sent: ${stats.messagesSent}`);
console.log(`Messages received: ${stats.messagesReceived}`);
console.log(`Connections active: ${stats.connectionsActive}`);
console.log(`Average latency: ${stats.avgLatency}ms`);
console.log(`Errors: ${stats.errors}`);

// Reset stats
bluetooth.resetStats();
```

## Custom Storage

```typescript
import { StorageAdapter } from 'robox-clearing';

class PostgresStorage implements StorageAdapter {
  async createAccount(account) { /* ... */ }
  async getAccount(id) { /* ... */ }
  // ... implement all methods
}

const robox = new RoboxLayer({
  storage: new PostgresStorage(),
});
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  // Core types
  RobotAccount,
  Transaction,
  Escrow,
  BatchTransfer,
  Statistics,
  TransferOptions,
  StorageAdapter,

  // Webhooks
  WebhookConfig,
  WebhookDelivery,

  // PostgreSQL
  PostgresConfig,
  TransactionCallback,

  // Marketplace
  ServiceListing,
  ServiceOrder,
  ServiceReview,
  MarketplaceConfig,
  PurchaseOptions,

  // Analytics
  AggregatedStats,
  AccountActivity,
  TopAccountResult,
  MoneyFlowNode,
  Report,
  ExportOptions,

  // Invoices
  Invoice,
  InvoiceTemplate,
  InvoicePayment,
  InvoiceStats,
  CreateInvoiceOptions,
  PayInvoiceOptions,

  // Bluetooth
  BluetoothDevice,
  BluetoothConfig,
  BluetoothMessage,
  BluetoothStats,
  BluetoothServiceAd,
  ConnectionRequest,
  ConnectionResult,
  ScanOptions,
  ScanResult,
  MeshNetwork,
  MeshNode,
} from 'robox-clearing';
```
## Examples

```bash
# Run basic example
npm run example

# Run marketplace example
npm run example:marketplace

# Run analytics example
npm run example:analytics

# Run invoices example
npm run example:invoices

# Run bluetooth example
npm run example:bluetooth
```

## License

MIT

## CA

EigAfZW1sYAocChRJXV3FzT8JuhjaSYNWW5CkKdpump