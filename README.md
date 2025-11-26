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
- 🏪 **Marketplace** - Service listings, orders, and reviews *(NEW in v1.1)*
- 📊 **Analytics** - Statistics, reports, and data export *(NEW in v1.1)*
- 🗄️ **PostgreSQL Storage** - Production-ready persistent storage *(NEW in v1.1)*
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

Send HTTP callbacks to external services when events occur.

```typescript
import { WebhookManager, EventType } from 'robox-clearing';

const webhooks = new WebhookManager();

// Register a webhook
const hook = webhooks.create({
  url: 'https://your-server.com/webhook',
  events: [EventType.TRANSFER_COMPLETED, EventType.ESCROW_RELEASED],
  secret: 'your-secret-key',  // For signature verification
  retryAttempts: 3,
  timeoutMs: 10000,
});

// Register webhook for all events
const allEventsHook = webhooks.create({
  url: 'https://your-server.com/all-events',
  events: ['*'],
  secret: 'another-secret',
});

// Dispatch event to all matching webhooks
await webhooks.dispatch({
  type: EventType.TRANSFER_COMPLETED,
  data: { from: 'robot-1', to: 'robot-2', amount: 100 },
  timestamp: new Date(),
});

// Manage webhooks
webhooks.disable(hook.id);
webhooks.enable(hook.id);
webhooks.delete(hook.id);

// List all webhooks
const allHooks = webhooks.list();

// Get delivery history
const deliveries = webhooks.listDeliveries({
  webhookId: hook.id,
  status: WebhookDeliveryStatus.FAILED,
});

// Retry failed delivery
await webhooks.retryDelivery(deliveryId);

// Get statistics
const stats = webhooks.getStats();
// { totalWebhooks: 2, activeWebhooks: 1, totalDeliveries: 50, ... }
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
  "signature": "a1c3b2f1e4d5..."
}
```

### Webhook Headers

```
Content-Type: application/json
User-Agent: RoboxClearing/1.0
X-Webhook-ID: hook-id
X-Delivery-ID: delivery-id
X-Event-Type: transfer.completed
X-Signature: hmac-sha256-signature
```

### Verify Webhook Signature

```typescript
import { WebhookManager } from 'robox-clearing';

// On your server receiving webhooks
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-signature'];
  const payload = JSON.stringify(req.body);
  const secret = 'your-secret-key';

  const isValid = WebhookManager.verifySignature(payload, signature, secret);
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook
  console.log('Event:', req.body.event);
  console.log('Data:', req.body.data);
  
  res.status(200).send('OK');
});
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
```

## License

MIT

## CA

EigAfZW1sYAocChRJXV3FzT8JuhjaSYNWW5CkKdpump