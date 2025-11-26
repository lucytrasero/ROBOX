import type {
  StorageAdapter,
  RobotAccount,
  Transaction,
  BalanceOperation,
  TransactionFilter,
  AccountFilter,
  Escrow,
  EscrowStatus,
  BatchTransfer,
  AuditLogEntry,
  AuditAction,
  Statistics,
} from '../types';
import { TransactionStatus } from '../types';
import { deepClone } from '../utils';

/**
 * In-memory storage adapter for testing and prototyping
 */
export class InMemoryStorage implements StorageAdapter {
  private accounts: Map<string, RobotAccount> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private balanceOperations: Map<string, BalanceOperation> = new Map();
  private escrows: Map<string, Escrow> = new Map();
  private batchTransfers: Map<string, BatchTransfer> = new Map();
  private auditLogs: AuditLogEntry[] = [];
  private idempotencyKeys: Map<string, string> = new Map(); // key -> transactionId

  // === Account operations ===

  async createAccount(account: RobotAccount): Promise<RobotAccount> {
    const stored = deepClone(account);
    this.accounts.set(account.id, stored);
    return deepClone(stored);
  }

  async getAccount(id: string): Promise<RobotAccount | null> {
    const account = this.accounts.get(id);
    return account ? deepClone(account) : null;
  }

  async updateAccount(
    id: string,
    updates: Partial<RobotAccount>
  ): Promise<RobotAccount | null> {
    const existing = this.accounts.get(id);
    if (!existing) return null;

    const updated: RobotAccount = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    this.accounts.set(id, updated);
    return deepClone(updated);
  }

  async deleteAccount(id: string): Promise<boolean> {
    return this.accounts.delete(id);
  }

  async listAccounts(filter?: AccountFilter): Promise<RobotAccount[]> {
    let results = Array.from(this.accounts.values());

    if (filter) {
      if (filter.status) {
        results = results.filter(a => a.status === filter.status);
      }
      if (filter.role) {
        results = results.filter(a => a.roles.includes(filter.role!));
      }
      if (filter.tag) {
        results = results.filter(a => a.tags?.includes(filter.tag!));
      }
      if (filter.minBalance !== undefined) {
        results = results.filter(a => a.balance >= filter.minBalance!);
      }
      if (filter.maxBalance !== undefined) {
        results = results.filter(a => a.balance <= filter.maxBalance!);
      }

      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map(a => deepClone(a));
  }

  async countAccounts(filter?: AccountFilter): Promise<number> {
    const accounts = await this.listAccounts({ ...filter, limit: 999999, offset: 0 });
    return accounts.length;
  }

  // === Transaction operations ===

  async createTransaction(transaction: Transaction): Promise<Transaction> {
    const stored = deepClone(transaction);
    this.transactions.set(transaction.id, stored);
    
    // Store idempotency key if present
    if ((transaction as unknown as Record<string, unknown>).idempotencyKey) {
      this.idempotencyKeys.set(
        (transaction as unknown as Record<string, unknown>).idempotencyKey as string,
        transaction.id
      );
    }
    
    return deepClone(stored);
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const tx = this.transactions.get(id);
    return tx ? deepClone(tx) : null;
  }

  async updateTransaction(
    id: string,
    updates: Partial<Transaction>
  ): Promise<Transaction | null> {
    const existing = this.transactions.get(id);
    if (!existing) return null;

    const updated: Transaction = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    this.transactions.set(id, updated);
    return deepClone(updated);
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    let results = Array.from(this.transactions.values());

    if (filter) {
      if (filter.robotId) {
        results = results.filter(
          tx => tx.from === filter.robotId || tx.to === filter.robotId
        );
      }
      if (filter.type) {
        results = results.filter(tx => tx.type === filter.type);
      }
      if (filter.status) {
        results = results.filter(tx => tx.status === filter.status);
      }
      if (filter.fromDate) {
        results = results.filter(tx => tx.createdAt >= filter.fromDate!);
      }
      if (filter.toDate) {
        results = results.filter(tx => tx.createdAt <= filter.toDate!);
      }
      if (filter.minAmount !== undefined) {
        results = results.filter(tx => tx.amount >= filter.minAmount!);
      }
      if (filter.maxAmount !== undefined) {
        results = results.filter(tx => tx.amount <= filter.maxAmount!);
      }

      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map(tx => deepClone(tx));
  }

  async countTransactions(filter?: TransactionFilter): Promise<number> {
    const transactions = await this.listTransactions({ ...filter, limit: 999999, offset: 0 });
    return transactions.length;
  }

  // === Balance operations ===

  async createBalanceOperation(operation: BalanceOperation): Promise<BalanceOperation> {
    const stored = deepClone(operation);
    this.balanceOperations.set(operation.id, stored);
    return deepClone(stored);
  }

  async updateBalance(id: string, delta: number): Promise<number> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Account not found: ${id}`);
    }

    account.balance += delta;
    account.updatedAt = new Date();
    return account.balance;
  }

  async freezeBalance(id: string, amount: number): Promise<void> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Account not found: ${id}`);
    }

    account.balance -= amount;
    account.frozenBalance += amount;
    account.updatedAt = new Date();
  }

  async unfreezeBalance(id: string, amount: number): Promise<void> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Account not found: ${id}`);
    }

    account.frozenBalance -= amount;
    account.balance += amount;
    account.updatedAt = new Date();
  }

  // === Escrow operations ===

  async createEscrow(escrow: Escrow): Promise<Escrow> {
    const stored = deepClone(escrow);
    this.escrows.set(escrow.id, stored);
    return deepClone(stored);
  }

  async getEscrow(id: string): Promise<Escrow | null> {
    const escrow = this.escrows.get(id);
    return escrow ? deepClone(escrow) : null;
  }

  async updateEscrow(id: string, updates: Partial<Escrow>): Promise<Escrow | null> {
    const existing = this.escrows.get(id);
    if (!existing) return null;

    const updated: Escrow = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    this.escrows.set(id, updated);
    return deepClone(updated);
  }

  async listEscrows(filter?: { robotId?: string; status?: EscrowStatus }): Promise<Escrow[]> {
    let results = Array.from(this.escrows.values());

    if (filter) {
      if (filter.robotId) {
        results = results.filter(
          e => e.from === filter.robotId || e.to === filter.robotId
        );
      }
      if (filter.status) {
        results = results.filter(e => e.status === filter.status);
      }
    }

    return results.map(e => deepClone(e));
  }

  // === Batch operations ===

  async createBatchTransfer(batch: BatchTransfer): Promise<BatchTransfer> {
    const stored = deepClone(batch);
    this.batchTransfers.set(batch.id, stored);
    return deepClone(stored);
  }

  async getBatchTransfer(id: string): Promise<BatchTransfer | null> {
    const batch = this.batchTransfers.get(id);
    return batch ? deepClone(batch) : null;
  }

  async updateBatchTransfer(
    id: string,
    updates: Partial<BatchTransfer>
  ): Promise<BatchTransfer | null> {
    const existing = this.batchTransfers.get(id);
    if (!existing) return null;

    const updated: BatchTransfer = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    this.batchTransfers.set(id, updated);
    return deepClone(updated);
  }

  // === Audit log ===

  async createAuditLog(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const stored = deepClone(entry);
    this.auditLogs.push(stored);
    return deepClone(stored);
  }

  async listAuditLogs(filter?: {
    entityId?: string;
    action?: AuditAction;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    let results = [...this.auditLogs];

    if (filter) {
      if (filter.entityId) {
        results = results.filter(e => e.entityId === filter.entityId);
      }
      if (filter.action) {
        results = results.filter(e => e.action === filter.action);
      }
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results.map(e => deepClone(e));
  }

  // === Idempotency ===

  async getByIdempotencyKey(key: string): Promise<Transaction | null> {
    const transactionId = this.idempotencyKeys.get(key);
    if (!transactionId) return null;
    return this.getTransaction(transactionId);
  }

  // === Statistics ===

  async getStatistics(fromDate?: Date, toDate?: Date): Promise<Statistics> {
    const accounts = Array.from(this.accounts.values());
    let transactions = Array.from(this.transactions.values());

    if (fromDate) {
      transactions = transactions.filter(tx => tx.createdAt >= fromDate);
    }
    if (toDate) {
      transactions = transactions.filter(tx => tx.createdAt <= toDate);
    }

    const completedTx = transactions.filter(tx => tx.status === TransactionStatus.COMPLETED);
    const totalVolume = completedTx.reduce((sum, tx) => sum + tx.amount, 0);
    const totalFees = completedTx.reduce((sum, tx) => sum + (tx.fee || 0), 0);

    const transactionsByType: Record<string, number> = {};
    for (const tx of completedTx) {
      transactionsByType[tx.type] = (transactionsByType[tx.type] || 0) + 1;
    }

    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.status === 'ACTIVE').length,
      totalTransactions: completedTx.length,
      totalVolume,
      totalFees,
      averageTransactionAmount: completedTx.length > 0 ? totalVolume / completedTx.length : 0,
      transactionsByType,
      periodStart: fromDate,
      periodEnd: toDate,
    };
  }

  // === Utility methods ===

  clear(): void {
    this.accounts.clear();
    this.transactions.clear();
    this.balanceOperations.clear();
    this.escrows.clear();
    this.batchTransfers.clear();
    this.auditLogs = [];
    this.idempotencyKeys.clear();
  }

  getStats(): {
    accounts: number;
    transactions: number;
    escrows: number;
    batches: number;
    auditLogs: number;
  } {
    return {
      accounts: this.accounts.size,
      transactions: this.transactions.size,
      escrows: this.escrows.size,
      batches: this.batchTransfers.size,
      auditLogs: this.auditLogs.length,
    };
  }
}
