import type {
  StorageAdapter,
  RobotAccount,
  Transaction,
  BalanceOperation,
  TransactionFilter,
} from '../types';

/**
 * In-memory storage adapter for testing and prototyping
 */
export class InMemoryStorage implements StorageAdapter {
  private accounts: Map<string, RobotAccount> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private balanceOperations: Map<string, BalanceOperation> = new Map();

  // === Account operations ===

  async createAccount(account: RobotAccount): Promise<RobotAccount> {
    const stored = { ...account };
    this.accounts.set(account.id, stored);
    return stored;
  }

  async getAccount(id: string): Promise<RobotAccount | null> {
    const account = this.accounts.get(id);
    return account ? { ...account } : null;
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
      id: existing.id, // Prevent id change
      createdAt: existing.createdAt, // Prevent createdAt change
      updatedAt: new Date(),
    };

    this.accounts.set(id, updated);
    return { ...updated };
  }

  async deleteAccount(id: string): Promise<boolean> {
    return this.accounts.delete(id);
  }

  // === Transaction operations ===

  async createTransaction(transaction: Transaction): Promise<Transaction> {
    const stored = { ...transaction };
    this.transactions.set(transaction.id, stored);
    return stored;
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const tx = this.transactions.get(id);
    return tx ? { ...tx } : null;
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    let results = Array.from(this.transactions.values());

    if (filter) {
      // Filter by robotId (either sender or receiver)
      if (filter.robotId) {
        results = results.filter(
          (tx) => tx.from === filter.robotId || tx.to === filter.robotId
        );
      }

      // Filter by type
      if (filter.type) {
        results = results.filter((tx) => tx.type === filter.type);
      }

      // Filter by date range
      if (filter.fromDate) {
        results = results.filter((tx) => tx.createdAt >= filter.fromDate!);
      }
      if (filter.toDate) {
        results = results.filter((tx) => tx.createdAt <= filter.toDate!);
      }

      // Sort by date descending (newest first)
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map((tx) => ({ ...tx }));
  }

  // === Balance operations ===

  async createBalanceOperation(
    operation: BalanceOperation
  ): Promise<BalanceOperation> {
    const stored = { ...operation };
    this.balanceOperations.set(operation.id, stored);
    return stored;
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

  // === Utility methods ===

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.accounts.clear();
    this.transactions.clear();
    this.balanceOperations.clear();
  }

  /**
   * Get storage stats
   */
  getStats(): { accounts: number; transactions: number; operations: number } {
    return {
      accounts: this.accounts.size,
      transactions: this.transactions.size,
      operations: this.balanceOperations.size,
    };
  }
}
