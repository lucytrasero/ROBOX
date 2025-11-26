import type {
  RoboxLayerOptions,
  StorageAdapter,
  AuthPolicy,
  Logger,
  FeeCalculator,
  RobotAccount,
  Transaction,
  BalanceOperation,
  Escrow,
  BatchTransfer,
  BatchTransferItem,
  CreateRobotAccountOptions,
  UpdateRobotAccountOptions,
  BalanceOperationOptions,
  TransferOptions,
  CreateEscrowOptions,
  BatchTransferOptions,
  TransactionFilter,
  AccountFilter,
  AccountLimits,
  AuditLogEntry,
  Statistics,
  EventHandler,
  Middleware,
  MiddlewareContext,
} from './types';
import {
  RobotRole,
  AccountStatus,
  TransactionStatus,
  EscrowStatus,
  BatchStatus,
  EventType,
  AuditAction,
} from './types';
import {
  RoboxForbiddenError,
  RoboxNotFoundError,
  RoboxValidationError,
  RoboxInsufficientFundsError,
  RoboxAccountFrozenError,
  RoboxLimitExceededError,
  RoboxEscrowError,
  RoboxIdempotencyError,
} from './errors';
import { createAuthPolicy, checkLimits } from './auth';
import { EventEmitter, createEvent } from './events';
import { generateId, validateAmount, validateId } from './utils';
import { compose } from './middleware';

/**
 * Main clearing layer class for robot-to-robot interactions
 */
export class RoboxLayer {
  private storage: StorageAdapter;
  private auth: Required<AuthPolicy>;
  private logger?: Logger;
  private feeCalculator?: FeeCalculator;
  private defaultLimits?: AccountLimits;
  private enableAuditLog: boolean;
  private events: EventEmitter;
  private middlewares: Middleware[] = [];

  constructor(options: RoboxLayerOptions) {
    this.storage = options.storage;
    this.auth = createAuthPolicy(options.auth);
    this.logger = options.logger;
    this.feeCalculator = options.feeCalculator;
    this.defaultLimits = options.defaultLimits;
    this.enableAuditLog = options.enableAuditLog ?? false;
    this.events = new EventEmitter();
  }

  // ============================================
  // Middleware
  // ============================================

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  private async runMiddleware(action: string, params: Record<string, unknown>, fn: () => Promise<void>): Promise<void> {
    if (this.middlewares.length === 0) {
      return fn();
    }

    const ctx: MiddlewareContext = {
      action,
      params,
      timestamp: new Date(),
    };

    const composed = compose(...this.middlewares);
    await composed(ctx, fn);
  }

  // ============================================
  // Events
  // ============================================

  on<T = unknown>(event: EventType | '*', handler: EventHandler<T>): () => void {
    return this.events.on(event, handler);
  }

  off(event: EventType | '*', handler: EventHandler): void {
    this.events.off(event, handler);
  }

  // ============================================
  // Account Management
  // ============================================

  async createRobotAccount(options: CreateRobotAccountOptions = {}): Promise<RobotAccount> {
    const now = new Date();

    const account: RobotAccount = {
      id: options.id ?? generateId(),
      name: options.name,
      balance: options.initialBalance ?? 0,
      frozenBalance: 0,
      roles: options.roles ?? [RobotRole.CONSUMER],
      status: AccountStatus.ACTIVE,
      limits: options.limits ?? this.defaultLimits,
      metadata: options.metadata,
      tags: options.tags,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.storage.createAccount(account);

    await this.audit(AuditAction.CREATE, 'RobotAccount', created.id);
    await this.events.emit(createEvent(EventType.ACCOUNT_CREATED, created));

    this.logger?.info('Robot account created', { id: created.id, name: created.name });

    return created;
  }

  async getRobotAccount(id: string): Promise<RobotAccount | null> {
    return this.storage.getAccount(id);
  }

  async listRobotAccounts(filter?: AccountFilter): Promise<RobotAccount[]> {
    return this.storage.listAccounts(filter);
  }

  async countRobotAccounts(filter?: AccountFilter): Promise<number> {
    return this.storage.countAccounts(filter);
  }

  async updateRobotAccount(
    id: string,
    updates: UpdateRobotAccountOptions,
    initiatedBy?: string
  ): Promise<RobotAccount> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

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
      limits: updates.limits,
      tags: updates.tags,
    });

    if (!updated) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    await this.audit(AuditAction.UPDATE, 'RobotAccount', id, initiatedBy);
    await this.events.emit(createEvent(EventType.ACCOUNT_UPDATED, updated, initiatedBy));

    this.logger?.info('Robot account updated', { id });

    return updated;
  }

  async deleteRobotAccount(id: string): Promise<void> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    if (account.balance !== 0 || account.frozenBalance !== 0) {
      throw new RoboxValidationError(
        `Cannot delete account with balance: ${account.balance} (frozen: ${account.frozenBalance})`,
        'balance'
      );
    }

    await this.storage.deleteAccount(id);
    await this.audit(AuditAction.DELETE, 'RobotAccount', id);
    await this.events.emit(createEvent(EventType.ACCOUNT_DELETED, { id }));

    this.logger?.info('Robot account deleted', { id });
  }

  // ============================================
  // Account Status
  // ============================================

  async freezeAccount(id: string, initiatedBy?: string): Promise<RobotAccount> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    if (account.status === AccountStatus.FROZEN) {
      return account;
    }

    const updated = await this.storage.updateAccount(id, {
      status: AccountStatus.FROZEN,
    });

    if (!updated) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    await this.audit(AuditAction.FREEZE, 'RobotAccount', id, initiatedBy);
    await this.events.emit(createEvent(EventType.ACCOUNT_FROZEN, updated, initiatedBy));

    this.logger?.info('Account frozen', { id });

    return updated;
  }

  async unfreezeAccount(id: string, initiatedBy?: string): Promise<RobotAccount> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    if (account.status === AccountStatus.ACTIVE) {
      return account;
    }

    const updated = await this.storage.updateAccount(id, {
      status: AccountStatus.ACTIVE,
    });

    if (!updated) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    await this.audit(AuditAction.UNFREEZE, 'RobotAccount', id, initiatedBy);
    await this.events.emit(createEvent(EventType.ACCOUNT_UNFROZEN, updated, initiatedBy));

    this.logger?.info('Account unfrozen', { id });

    return updated;
  }

  async suspendAccount(id: string, initiatedBy?: string): Promise<RobotAccount> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    const updated = await this.storage.updateAccount(id, {
      status: AccountStatus.SUSPENDED,
    });

    if (!updated) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    this.logger?.info('Account suspended', { id });

    return updated;
  }

  async closeAccount(id: string, initiatedBy?: string): Promise<RobotAccount> {
    const account = await this.storage.getAccount(id);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    if (account.balance !== 0 || account.frozenBalance !== 0) {
      throw new RoboxValidationError('Cannot close account with balance', 'balance');
    }

    const updated = await this.storage.updateAccount(id, {
      status: AccountStatus.CLOSED,
    });

    if (!updated) {
      throw new RoboxNotFoundError('RobotAccount', id);
    }

    this.logger?.info('Account closed', { id });

    return updated;
  }

  // ============================================
  // Balance Operations
  // ============================================

  async getBalance(robotId: string): Promise<number> {
    const account = await this.storage.getAccount(robotId);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }
    return account.balance;
  }

  async getAvailableBalance(robotId: string): Promise<number> {
    const account = await this.storage.getAccount(robotId);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }
    return account.balance;
  }

  async getTotalBalance(robotId: string): Promise<{ available: number; frozen: number; total: number }> {
    const account = await this.storage.getAccount(robotId);
    if (!account) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }
    return {
      available: account.balance,
      frozen: account.frozenBalance,
      total: account.balance + account.frozenBalance,
    };
  }

  async credit(
    robotId: string,
    amount: number,
    options: BalanceOperationOptions = {}
  ): Promise<BalanceOperation> {
    validateAmount(amount);

    const target = await this.storage.getAccount(robotId);
    if (!target) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }

    if (target.status === AccountStatus.CLOSED) {
      throw new RoboxAccountFrozenError(robotId);
    }

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

    const newBalance = await this.storage.updateBalance(robotId, amount);

    const operation: BalanceOperation = {
      id: generateId(),
      robotId,
      direction: 'CREDIT',
      amount,
      balanceAfter: newBalance,
      reason: options.reason,
      meta: options.meta,
      initiatedBy: options.initiatedBy,
      createdAt: new Date(),
    };

    await this.storage.createBalanceOperation(operation);
    await this.audit(AuditAction.CREDIT, 'RobotAccount', robotId, options.initiatedBy);
    await this.events.emit(createEvent(EventType.BALANCE_CREDITED, operation, options.initiatedBy));

    this.logger?.info('Credit operation completed', { robotId, amount });

    return operation;
  }

  async debit(
    robotId: string,
    amount: number,
    options: BalanceOperationOptions = {}
  ): Promise<BalanceOperation> {
    validateAmount(amount);

    const target = await this.storage.getAccount(robotId);
    if (!target) {
      throw new RoboxNotFoundError('RobotAccount', robotId);
    }

    if (target.status !== AccountStatus.ACTIVE) {
      throw new RoboxAccountFrozenError(robotId);
    }

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

    if (target.balance < amount) {
      throw new RoboxInsufficientFundsError(amount, target.balance);
    }

    const newBalance = await this.storage.updateBalance(robotId, -amount);

    const operation: BalanceOperation = {
      id: generateId(),
      robotId,
      direction: 'DEBIT',
      amount,
      balanceAfter: newBalance,
      reason: options.reason,
      meta: options.meta,
      initiatedBy: options.initiatedBy,
      createdAt: new Date(),
    };

    await this.storage.createBalanceOperation(operation);
    await this.audit(AuditAction.DEBIT, 'RobotAccount', robotId, options.initiatedBy);
    await this.events.emit(createEvent(EventType.BALANCE_DEBITED, operation, options.initiatedBy));

    this.logger?.info('Debit operation completed', { robotId, amount });

    return operation;
  }

  // ============================================
  // Transfers (Micropayments)
  // ============================================

  async transfer(options: TransferOptions): Promise<Transaction> {
    const { from, to, amount, type, meta, initiatedBy, idempotencyKey } = options;

    // Check idempotency
    if (idempotencyKey) {
      const existing = await this.storage.getByIdempotencyKey(idempotencyKey);
      if (existing) {
        throw new RoboxIdempotencyError(idempotencyKey, existing.id);
      }
    }

    validateAmount(amount);

    const fromAccount = await this.storage.getAccount(from);
    if (!fromAccount) {
      throw new RoboxNotFoundError('RobotAccount', from);
    }

    const toAccount = await this.storage.getAccount(to);
    if (!toAccount) {
      throw new RoboxNotFoundError('RobotAccount', to);
    }

    // Check account status
    if (fromAccount.status !== AccountStatus.ACTIVE) {
      throw new RoboxAccountFrozenError(from);
    }
    if (toAccount.status !== AccountStatus.ACTIVE) {
      throw new RoboxAccountFrozenError(to);
    }

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

    // Check limits
    const limitCheck = checkLimits(fromAccount, amount, this.defaultLimits);
    if (!limitCheck.allowed) {
      throw new RoboxLimitExceededError('transfer', fromAccount.limits?.maxTransferAmount ?? 0, amount);
    }

    // Calculate fee
    let fee = options.fee ?? 0;
    if (this.feeCalculator && !options.fee) {
      fee = await this.feeCalculator.calculate(amount, type, fromAccount, toAccount);
    }

    const totalAmount = amount + fee;

    // Check sufficient funds
    if (fromAccount.balance < totalAmount) {
      throw new RoboxInsufficientFundsError(totalAmount, fromAccount.balance);
    }

    // Create pending transaction
    const transaction: Transaction = {
      id: generateId(),
      from,
      to,
      amount,
      fee,
      type,
      status: TransactionStatus.PENDING,
      meta: { ...meta, idempotencyKey },
      initiatedBy: initiatedBy ?? from,
      createdAt: new Date(),
    };

    await this.storage.createTransaction(transaction);
    await this.events.emit(createEvent(EventType.TRANSFER_INITIATED, transaction, initiatedBy ?? from));

    try {
      // Perform transfer atomically
      await this.storage.updateBalance(from, -totalAmount);
      await this.storage.updateBalance(to, amount);

      // Update transaction status
      const completedTx = await this.storage.updateTransaction(transaction.id, {
        status: TransactionStatus.COMPLETED,
        completedAt: new Date(),
      });

      await this.audit(AuditAction.TRANSFER, 'Transaction', transaction.id, initiatedBy ?? from);
      await this.events.emit(createEvent(EventType.TRANSFER_COMPLETED, completedTx, initiatedBy ?? from));

      this.logger?.info('Transfer completed', {
        id: transaction.id,
        from,
        to,
        amount,
        fee,
        type,
      });

      return completedTx!;
    } catch (error) {
      await this.storage.updateTransaction(transaction.id, {
        status: TransactionStatus.FAILED,
        meta: { ...transaction.meta, error: (error as Error).message },
      });

      await this.events.emit(createEvent(EventType.TRANSFER_FAILED, { transaction, error: (error as Error).message }));

      throw error;
    }
  }

  async refund(transactionId: string, initiatedBy?: string): Promise<Transaction> {
    const original = await this.storage.getTransaction(transactionId);
    if (!original) {
      throw new RoboxNotFoundError('Transaction', transactionId);
    }

    if (original.status !== TransactionStatus.COMPLETED) {
      throw new RoboxValidationError('Can only refund completed transactions', 'status');
    }

    const refundTx = await this.transfer({
      from: original.to,
      to: original.from,
      amount: original.amount,
      type: 'REFUND',
      meta: {
        originalTransactionId: transactionId,
        refundReason: 'Manual refund',
      },
      initiatedBy,
    });

    // Mark original as refunded
    await this.storage.updateTransaction(transactionId, {
      status: TransactionStatus.REFUNDED,
      meta: { ...original.meta, refundTransactionId: refundTx.id },
    });

    return refundTx;
  }

  // ============================================
  // Escrow
  // ============================================

  async createEscrow(options: CreateEscrowOptions): Promise<Escrow> {
    const { from, to, amount, condition, expiresAt, meta, initiatedBy } = options;

    validateAmount(amount);

    const fromAccount = await this.storage.getAccount(from);
    if (!fromAccount) {
      throw new RoboxNotFoundError('RobotAccount', from);
    }

    if (fromAccount.status !== AccountStatus.ACTIVE) {
      throw new RoboxAccountFrozenError(from);
    }

    const toAccount = await this.storage.getAccount(to);
    if (!toAccount) {
      throw new RoboxNotFoundError('RobotAccount', to);
    }

    if (fromAccount.balance < amount) {
      throw new RoboxInsufficientFundsError(amount, fromAccount.balance);
    }

    // Freeze the funds
    await this.storage.freezeBalance(from, amount);

    const escrow: Escrow = {
      id: generateId(),
      from,
      to,
      amount,
      status: EscrowStatus.PENDING,
      condition,
      expiresAt,
      meta,
      createdAt: new Date(),
    };

    const created = await this.storage.createEscrow(escrow);

    await this.audit(AuditAction.ESCROW_CREATE, 'Escrow', escrow.id, initiatedBy);
    await this.events.emit(createEvent(EventType.ESCROW_CREATED, created, initiatedBy));

    this.logger?.info('Escrow created', { id: escrow.id, from, to, amount });

    return created;
  }

  async releaseEscrow(escrowId: string, initiatedBy?: string): Promise<Transaction> {
    const escrow = await this.storage.getEscrow(escrowId);
    if (!escrow) {
      throw new RoboxNotFoundError('Escrow', escrowId);
    }

    if (escrow.status !== EscrowStatus.PENDING) {
      throw new RoboxEscrowError(`Escrow is not pending: ${escrow.status}`, escrowId);
    }

    // Check expiration
    if (escrow.expiresAt && new Date() > escrow.expiresAt) {
      throw new RoboxEscrowError('Escrow has expired', escrowId);
    }

    // Unfreeze and transfer
    await this.storage.unfreezeBalance(escrow.from, escrow.amount);
    await this.storage.updateBalance(escrow.from, -escrow.amount);
    await this.storage.updateBalance(escrow.to, escrow.amount);

    // Create transaction
    const transaction: Transaction = {
      id: generateId(),
      from: escrow.from,
      to: escrow.to,
      amount: escrow.amount,
      type: 'ESCROW_RELEASE',
      status: TransactionStatus.COMPLETED,
      meta: { escrowId },
      escrowId,
      initiatedBy,
      createdAt: new Date(),
      completedAt: new Date(),
    };

    await this.storage.createTransaction(transaction);
    await this.storage.updateEscrow(escrowId, {
      status: EscrowStatus.RELEASED,
      releasedAt: new Date(),
      transactionId: transaction.id,
    });

    await this.audit(AuditAction.ESCROW_RELEASE, 'Escrow', escrowId, initiatedBy);
    await this.events.emit(createEvent(EventType.ESCROW_RELEASED, { escrow, transaction }, initiatedBy));

    this.logger?.info('Escrow released', { escrowId, transactionId: transaction.id });

    return transaction;
  }

  async refundEscrow(escrowId: string, initiatedBy?: string): Promise<void> {
    const escrow = await this.storage.getEscrow(escrowId);
    if (!escrow) {
      throw new RoboxNotFoundError('Escrow', escrowId);
    }

    if (escrow.status !== EscrowStatus.PENDING) {
      throw new RoboxEscrowError(`Escrow is not pending: ${escrow.status}`, escrowId);
    }

    // Unfreeze the funds back to sender
    await this.storage.unfreezeBalance(escrow.from, escrow.amount);

    await this.storage.updateEscrow(escrowId, {
      status: EscrowStatus.REFUNDED,
      releasedAt: new Date(),
    });

    await this.audit(AuditAction.ESCROW_REFUND, 'Escrow', escrowId, initiatedBy);
    await this.events.emit(createEvent(EventType.ESCROW_REFUNDED, escrow, initiatedBy));

    this.logger?.info('Escrow refunded', { escrowId });
  }

  async getEscrow(id: string): Promise<Escrow | null> {
    return this.storage.getEscrow(id);
  }

  async listEscrows(filter?: { robotId?: string; status?: EscrowStatus }): Promise<Escrow[]> {
    return this.storage.listEscrows(filter);
  }

  // ============================================
  // Batch Transfers
  // ============================================

  async batchTransfer(options: BatchTransferOptions): Promise<BatchTransfer> {
    const { transfers, stopOnError = false, meta, initiatedBy } = options;

    if (transfers.length === 0) {
      throw new RoboxValidationError('Batch must contain at least one transfer', 'transfers');
    }

    const batch: BatchTransfer = {
      id: generateId(),
      transfers: transfers.map(t => ({ ...t, status: TransactionStatus.PENDING })),
      status: BatchStatus.PROCESSING,
      successCount: 0,
      failedCount: 0,
      totalAmount: transfers.reduce((sum, t) => sum + t.amount, 0),
      initiatedBy,
      meta,
      createdAt: new Date(),
    };

    await this.storage.createBatchTransfer(batch);
    await this.events.emit(createEvent(EventType.BATCH_STARTED, batch, initiatedBy));

    for (let i = 0; i < batch.transfers.length; i++) {
      const item = batch.transfers[i];

      try {
        const tx = await this.transfer({
          from: item.from,
          to: item.to,
          amount: item.amount,
          type: item.type,
          meta: item.meta,
          initiatedBy,
        });

        batch.transfers[i].status = TransactionStatus.COMPLETED;
        batch.transfers[i].transactionId = tx.id;
        batch.successCount++;
      } catch (error) {
        batch.transfers[i].status = TransactionStatus.FAILED;
        batch.transfers[i].error = (error as Error).message;
        batch.failedCount++;

        if (stopOnError) {
          break;
        }
      }
    }

    // Determine final status
    if (batch.failedCount === 0) {
      batch.status = BatchStatus.COMPLETED;
    } else if (batch.successCount === 0) {
      batch.status = BatchStatus.FAILED;
    } else {
      batch.status = BatchStatus.PARTIAL;
    }

    batch.completedAt = new Date();

    await this.storage.updateBatchTransfer(batch.id, batch);
    await this.events.emit(createEvent(EventType.BATCH_COMPLETED, batch, initiatedBy));

    this.logger?.info('Batch transfer completed', {
      id: batch.id,
      success: batch.successCount,
      failed: batch.failedCount,
    });

    return batch;
  }

  async getBatchTransfer(id: string): Promise<BatchTransfer | null> {
    return this.storage.getBatchTransfer(id);
  }

  // ============================================
  // Transaction History
  // ============================================

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    return this.storage.listTransactions(filter);
  }

  async countTransactions(filter?: TransactionFilter): Promise<number> {
    return this.storage.countTransactions(filter);
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    return this.storage.getTransaction(id);
  }

  // ============================================
  // Statistics
  // ============================================

  async getStatistics(fromDate?: Date, toDate?: Date): Promise<Statistics> {
    return this.storage.getStatistics(fromDate, toDate);
  }

  // ============================================
  // Audit Log
  // ============================================

  async getAuditLog(filter?: { entityId?: string; action?: AuditAction; limit?: number }): Promise<AuditLogEntry[]> {
    return this.storage.listAuditLogs(filter);
  }

  private async audit(
    action: AuditAction,
    entityType: string,
    entityId: string,
    actorId?: string,
    changes?: Record<string, { from: unknown; to: unknown }>
  ): Promise<void> {
    if (!this.enableAuditLog) return;

    const entry: AuditLogEntry = {
      id: generateId(),
      action,
      entityType,
      entityId,
      actorId,
      changes,
      timestamp: new Date(),
    };

    await this.storage.createAuditLog(entry);
  }
}
