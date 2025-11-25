# robox-clearing

A clearing layer for machine-to-machine (robot-to-robot) interactions with micropayments support.

## Features

- **Robot Account Management** - Create, update, and delete robot accounts with custom metadata
- **Balance Operations** - Credit and debit operations with authorization controls
- **Micropayments** - Transfer funds between robots for tasks, energy, parts, or custom payment types
- **Transaction History** - Full transaction logging with filtering and pagination
- **Role-Based Authorization** - Built-in roles (consumer, provider, admin) with customizable policies
- **403 Forbidden Errors** - Proper error handling for unauthorized operations
- **Pluggable Storage** - Default in-memory storage with support for custom adapters

## Installation

```bash
npm install robox-clearing
```

## Quick Start

```typescript
import { RoboxLayer, InMemoryStorage, RobotRole, TransactionType } from 'robox-clearing';

// Initialize the layer
const robox = new RoboxLayer({
  storage: new InMemoryStorage(),
});

// Create robot accounts
const worker = await robox.createRobotAccount({
  id: 'worker-001',
  name: 'Worker Bot',
  initialBalance: 1000,
  roles: [RobotRole.CONSUMER],
});

const service = await robox.createRobotAccount({
  id: 'service-001',
  name: 'Service Bot',
  roles: [RobotRole.PROVIDER],
});

// Make a payment
const tx = await robox.transfer({
  from: 'worker-001',
  to: 'service-001',
  amount: 100,
  type: TransactionType.TASK_PAYMENT,
  meta: { taskId: 'task-123' },
});

console.log(`Transaction ${tx.id} completed`);
```

## API Reference

### RoboxLayer

Main class for the clearing layer.

```typescript
const robox = new RoboxLayer({
  storage: StorageAdapter,    // Required: storage adapter
  auth?: AuthPolicy,          // Optional: custom auth policies
  logger?: Logger,            // Optional: logging interface
});
```

### Account Management

```typescript
// Create account
const account = await robox.createRobotAccount({
  id?: string,                // Auto-generated if not provided
  name?: string,
  initialBalance?: number,    // Default: 0
  roles?: string[],           // Default: ['consumer']
  metadata?: Record<string, any>,
});

// Get account
const account = await robox.getRobotAccount(id);

// Update account
const updated = await robox.updateRobotAccount(id, {
  name?: string,
  metadata?: Record<string, any>,
  roles?: string[],           // Requires admin privileges
}, initiatedBy?);

// Delete account (balance must be 0)
await robox.deleteRobotAccount(id);
```

### Balance Operations

```typescript
// Get balance
const balance = await robox.getBalance(robotId);

// Credit (add funds)
const op = await robox.credit(robotId, amount, {
  reason?: string,
  meta?: Record<string, any>,
  initiatedBy?: string,       // Self or admin required
});

// Debit (remove funds) - Admin only
const op = await robox.debit(robotId, amount, {
  reason?: string,
  meta?: Record<string, any>,
  initiatedBy: adminId,       // Admin required
});
```

### Transfers

```typescript
const tx = await robox.transfer({
  from: string,               // Must have 'consumer' role
  to: string,                 // Must have 'provider' role
  amount: number,             // Must be > 0
  type: TransactionType | string,
  meta?: Record<string, any>,
  initiatedBy?: string,       // Default: from
});
```

Built-in transaction types:
- `TransactionType.TASK_PAYMENT`
- `TransactionType.ENERGY_PAYMENT`
- `TransactionType.PARTS_PAYMENT`

### Transaction History

```typescript
// List transactions
const transactions = await robox.listTransactions({
  robotId?: string,           // Filter by participant
  type?: string,              // Filter by type
  fromDate?: Date,
  toDate?: Date,
  limit?: number,
  offset?: number,
});

// Get single transaction
const tx = await robox.getTransaction(id);
```

## Roles and Authorization

### Built-in Roles

| Role | Permissions |
|------|-------------|
| `consumer` | Can initiate transfers (as sender) |
| `provider` | Can receive transfers |
| `admin` | Can credit/debit any account, change roles, initiate any transfer |

### Custom Authorization

```typescript
const robox = new RoboxLayer({
  storage: new InMemoryStorage(),
  auth: {
    canTransfer: async (ctx) => {
      // Custom transfer logic
      return ctx.amount <= 1000; // Max transfer limit
    },
    canChangeRoles: async (ctx) => {
      // Custom role change logic
      return ctx.initiator?.roles.includes('superadmin');
    },
    canCredit: async (ctx) => {
      // Custom credit logic
      return true;
    },
    canDebit: async (ctx) => {
      // Custom debit logic
      return ctx.initiator?.roles.includes('admin');
    },
  },
});
```

## Error Handling

All errors extend `RoboxError` with a `code` property for HTTP mapping:

```typescript
import {
  RoboxError,              // Base error
  RoboxForbiddenError,     // 403 - Authorization failed
  RoboxNotFoundError,      // 404 - Resource not found
  RoboxValidationError,    // 400 - Invalid input
  RoboxInsufficientFundsError, // 402 - Not enough balance
} from 'robox-clearing';

try {
  await robox.transfer({ ... });
} catch (error) {
  if (error instanceof RoboxForbiddenError) {
    console.error(`Forbidden (${error.code}): ${error.reason}`);
    // error.reason: 'INSUFFICIENT_ROLE', etc.
  }
}
```

## Custom Storage Adapter

Implement the `StorageAdapter` interface:

```typescript
import { StorageAdapter, RobotAccount, Transaction } from 'robox-clearing';

class PostgresStorage implements StorageAdapter {
  async createAccount(account: RobotAccount): Promise<RobotAccount> {
    // Your implementation
  }
  
  async getAccount(id: string): Promise<RobotAccount | null> {
    // Your implementation
  }
  
  // ... implement all methods
}
```

## Logging

```typescript
const robox = new RoboxLayer({
  storage: new InMemoryStorage(),
  logger: {
    info: (msg, meta) => console.log(msg, meta),
    warn: (msg, meta) => console.warn(msg, meta),
    error: (msg, meta) => console.error(msg, meta),
  },
});
```

## Use Cases

### Task Payment

```typescript
// Robot A pays Robot B for completing a task
await robox.transfer({
  from: 'robot-a',
  to: 'robot-b',
  amount: 50,
  type: TransactionType.TASK_PAYMENT,
  meta: {
    taskId: 'compute-job-123',
    duration: 3600,
  },
});
```

### Energy Payment

```typescript
// Robot A pays charging station for energy
await robox.transfer({
  from: 'robot-a',
  to: 'charging-station-1',
  amount: 200,
  type: TransactionType.ENERGY_PAYMENT,
  meta: {
    kwh: 10,
    duration: 1800,
  },
});
```

### Parts Payment

```typescript
// Robot A buys a part from Robot B
await robox.transfer({
  from: 'robot-a',
  to: 'robot-b',
  amount: 500,
  type: TransactionType.PARTS_PAYMENT,
  meta: {
    partId: 'servo-motor-x1',
    quantity: 1,
  },
});
```

## License

MIT
