import { v4 as uuidv4 } from 'uuid';
import type {
  RoboxLayerOptions,
  StorageAdapter,
  AuthPolicy,
  Logger,
  RobotAccount,
  Transaction,
  BalanceOperation,
  CreateRobotAccountOptions,
  UpdateRobotAccountOptions,
  BalanceOperationOptions,
  TransferOptions,
  TransactionFilter,
} from './types';
import { RobotRole } from './types';
import {
  RoboxForbiddenError,
  RoboxNotFoundError,
  RoboxValidationError,
  RoboxInsufficientFundsError,
} from './errors';
import { createAuthPolicy } from './auth';

/**
 * Main clearing layer class for robot-to-robot interactions
 */
export class RoboxLayer {
  private storage: StorageAdapter;
  private auth: Required<AuthPolicy>;
  private logger?: Logger;

  constructor(options: RoboxLayerOptions) {
    this.storage = options.storage;
    this.auth = createAuthPolicy(options.auth);
    this.logger = options.logger;
  }

  // ============================================
  // Account Management
  // ============================================

  /**
   * Create a new robot account
   */
  async createRobotAccount(
    options: CreateRobotAccountOptions = {}
  ): Promise<RobotAccount> {
    const now = new Date();

    const account: RobotAccount = {
      id: options.id ?? uuidv4(),
      name: options.name,
      balance: options.initialBalance ?? 0,
      roles: options.roles ?? [RobotRole.CONSUMER],
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.storage.createAccount(account);
    
    this.logger?.info('Robot account created', { id: created.id, name: created.name });
    
    return created;
  }

  /**
   * Get robot account by ID
   */
  async getRobotAccount(id: string): Promise<RobotAccount | null> {
    return this.storage.getAccount(id);
  }

  /**
   * Update robot account
   */
  async updateRobotAccount(
    id: string,
    updates: UpdateRobotAccountOptions,
    initiatedBy?: string
  ): Promise<RobotAccount> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    // Check role change permissions
    if (updates.roles) {
      const initiator = initiatedBy
        ? await this.storage.getAccount(initiatedBy)
        : null;

      const canChange = await this.auth.canChangeRoles({
        target: account,
        newRoles: updates.roles,
        initiator: initiator ?? undefined,
      });

      if (!canChange) {
        this.logger?.warn('Role change forbidden', { id, initiatedBy });
        throw new RoboxForbiddenError('INSUFFICIENT_ROLE', {
          action: 'changeRoles',
          targetId: id,
          initiatedBy,
        });
      }
    }

    const updated = await this.storage.updateAccount(id, {
      name: updates.name,
      metadata: updates.metadata,
      roles: updates.roles,
    });

    if (!updated) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    this.logger?.info('Robot account updated', { id, updates: Object.keys(updates) });

    return updated;
  }

  /**
   * Delete robot account
   */
  async deleteRobotAccount(id: string): Promise<void> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    // Prevent deletion if balance is not zero
    if (account.balance !== 0) {
      throw new RoboxValidationError(
        `Cannot delete account with non-zero balance: ${account.balance}`,
        'balance'
      );
    }

    await this.storage.deleteAccount(id);
    this.logger?.info('Robot account deleted', { id });
  }

  // ============================================
  // Balance Operations
  // ============================================

  /**
   * Get current balance
   */
  async getBalance(robotId: string): Promise<number> {
    const account = await this.storage.getAccount(robotId);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }
    return account.balance;
  }

  /**
   * Credit (add funds to) an account
   */
  async credit(
    robotId: string,
    amount: number,
    options: BalanceOperationOptions = {}
  ): Promise<BalanceOperation> {
    if (amount <= 0) {
      throw new RoboxValidationError('Amount must be positive', 'amount');
    }

    const target = await this.storage.getAccount(robotId);
    if (!target) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }

    // Check permissions
    const initiator = options.initiatedBy
      ? await this.storage.getAccount(options.initiatedBy)
      : null;

    const canCredit = await this.auth.canCredit({
      target,
      amount,
      initiator: initiator ?? undefined,
    });

    if (!canCredit) {
      this.logger?.warn('Credit operation forbidden', { robotId, initiatedBy: options.initiatedBy });
      throw new RoboxForbiddenError('INSUFFICIENT_ROLE', {
        action: 'credit',
        targetId: robotId,
        initiatedBy: options.initiatedBy,
      });
    }

    // Perform credit
    await this.storage.updateBalance(robotId, amount);

    const operation: BalanceOperation = {
      id: uuidv4(),
      robotId,
      direction: 'CREDIT',
      amount,
      reason: options.reason,
      meta: options.meta,
      initiatedBy: options.initiatedBy,
      createdAt: new Date(),
    };

    await this.storage.createBalanceOperation(operation);
    this.logger?.info('Credit operation completed', { robotId, amount });

    return operation;
  }

  /**
   * Debit (remove funds from) an account
   */
  async debit(
    robotId: string,
    amount: number,
    options: BalanceOperationOptions = {}
  ): Promise<BalanceOperation> {
    if (amount <= 0) {
      throw new RoboxValidationError('Amount must be positive', 'amount');
    }

    const target = await this.storage.getAccount(robotId);
    if (!target) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }

    // Check permissions
    const initiator = options.initiatedBy
      ? await this.storage.getAccount(options.initiatedBy)
      : null;

    const canDebit = await this.auth.canDebit({
      target,
      amount,
      initiator: initiator ?? undefined,
    });

    if (!canDebit) {
      this.logger?.warn('Debit operation forbidden', { robotId, initiatedBy: options.initiatedBy });
      throw new RoboxForbiddenError('INSUFFICIENT_ROLE', {
        action: 'debit',
        targetId: robotId,
        initiatedBy: options.initiatedBy,
      });
    }

    // Check sufficient funds
    if (target.balance < amount) {
      throw new RoboxInsufficientFundsError(amount, target.balance);
    }

    // Perform debit
    await this.storage.updateBalance(robotId, -amount);

    const operation: BalanceOperation = {
      id: uuidv4(),
      robotId,
      direction: 'DEBIT',
      amount,
      reason: options.reason,
      meta: options.meta,
      initiatedBy: options.initiatedBy,
      createdAt: new Date(),
    };

    await this.storage.createBalanceOperation(operation);
    this.logger?.info('Debit operation completed', { robotId, amount });

    return operation;
  }

  // ============================================
  // Transfers (Micropayments)
  // ============================================

  /**
   * Transfer funds between robots
   */
  async transfer(options: TransferOptions): Promise<Transaction> {
    const { from, to, amount, type, meta, initiatedBy } = options;

    // Validate amount
    if (amount <= 0) {
      throw new RoboxValidationError('Amount must be positive', 'amount');
    }

    // Get accounts
    const fromAccount = await this.storage.getAccount(from);
    if (!fromAccount) {
      throw new RoboxNotFoundError('RobotAccount', from);
    }

    const toAccount = await this.storage.getAccount(to);
    if (!toAccount) {
      throw new RoboxNotFoundError('RobotAccount', to);
    }

    // Get initiator account
    const initiator = initiatedBy
      ? await this.storage.getAccount(initiatedBy)
      : fromAccount;

    if (initiatedBy && !initiator) {
      throw new RoboxNotFoundError('RobotAccount', initiatedBy);
    }

    // Check permissions
    const canTransfer = await this.auth.canTransfer({
      from: fromAccount,
      to: toAccount,
      amount,
      type,
      initiator: initiator ?? undefined,
    });

    if (!canTransfer) {
      this.logger?.warn('Transfer forbidden', { from, to, amount, initiatedBy });
      throw new RoboxForbiddenError('INSUFFICIENT_ROLE', {
        action: 'transfer',
        from,
        to,
        initiatedBy: initiatedBy ?? from,
      });
    }

    // Check sufficient funds
    if (fromAccount.balance < amount) {
      throw new RoboxInsufficientFundsError(amount, fromAccount.balance);
    }

    // Perform transfer atomically
    await this.storage.updateBalance(from, -amount);
    await this.storage.updateBalance(to, amount);

    // Create transaction record
    const transaction: Transaction = {
      id: uuidv4(),
      from,
      to,
      amount,
      type,
      meta,
      initiatedBy: initiatedBy ?? from,
      createdAt: new Date(),
    };

    await this.storage.createTransaction(transaction);
    
    this.logger?.info('Transfer completed', {
      id: transaction.id,
      from,
      to,
      amount,
      type,
    });

    return transaction;
  }

  // ============================================
  // Transaction History
  // ============================================

  /**
   * List transactions with filters
   */
  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    return this.storage.listTransactions(filter);
  }

  /**
   * Get a specific transaction
   */
  async getTransaction(id: string): Promise<Transaction | null> {
    return this.storage.getTransaction(id);
  }
}
