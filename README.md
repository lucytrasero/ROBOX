# robox-clearing

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful clearing layer for machine-to-machine (robot-to-robot) interactions with micropayments, escrow, batch transfers, webhooks, and event system.

## Features

- 🤖 **Robot Account Management** - Create, update, freeze, and manage robot accounts
- 💰 **Balance Operations** - Credit, debit with full audit trail
- 💸 **Micropayments** - Fast transfers with fee support
- 🔒 **Escrow** - Conditional payments with expiration
- 📦 **Batch Transfers** - Process multiple payments at once
- 🪝 **Webhooks** - HTTP callbacks for external integrations
- 📊 **Statistics** - Transaction analytics and reporting
- 🔐 **Role-Based Authorization** - Consumer, Provider, Admin, Operator, Auditor
- 📝 **Audit Log** - Complete operation history
- 🎯 **Event System** - Subscribe to all operations
- 🔌 **Middleware Support** - Extend functionality
- ⚡ **Idempotency** - Safe retries with idempotency keys
- 🚫 **403 Errors** - Proper authorization error handling

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
  RobotAccount,
  Transaction,
  Escrow,
  BatchTransfer,
  Statistics,
  TransferOptions,
  StorageAdapter,
  WebhookConfig,
  WebhookDelivery,
} from 'robox-clearing';
```

## License

MIT

## CA

EigAfZW1sYAocChRJXV3FzT8JuhjaSYNWW5CkKdpump