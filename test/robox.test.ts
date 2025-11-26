import {
  RoboxLayer,
  InMemoryStorage,
  RobotRole,
  TransactionType,
  TransactionStatus,
  AccountStatus,
  EscrowStatus,
  BatchStatus,
  EventType,
  RoboxForbiddenError,
  RoboxNotFoundError,
  RoboxValidationError,
  RoboxInsufficientFundsError,
  RoboxAccountFrozenError,
  RoboxEscrowError,
  RoboxIdempotencyError,
} from '../src';

describe('RoboxLayer', () => {
  let robox: RoboxLayer;
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
    robox = new RoboxLayer({ storage, enableAuditLog: true });
  });

  // ============================================
  // Account Management
  // ============================================

  describe('Account Management', () => {
    test('should create account with default values', async () => {
      const account = await robox.createRobotAccount();

      expect(account.id).toBeDefined();
      expect(account.balance).toBe(0);
      expect(account.frozenBalance).toBe(0);
      expect(account.status).toBe(AccountStatus.ACTIVE);
      expect(account.roles).toContain(RobotRole.CONSUMER);
    });

    test('should create account with custom values', async () => {
      const account = await robox.createRobotAccount({
        id: 'robot-001',
        name: 'Test Robot',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER, RobotRole.PROVIDER],
        metadata: { type: 'worker' },
        tags: ['production', 'warehouse-a'],
      });

      expect(account.id).toBe('robot-001');
      expect(account.name).toBe('Test Robot');
      expect(account.balance).toBe(1000);
      expect(account.tags).toEqual(['production', 'warehouse-a']);
    });

    test('should list accounts with filters', async () => {
      await robox.createRobotAccount({ id: 'a1', roles: [RobotRole.CONSUMER], tags: ['prod'] });
      await robox.createRobotAccount({ id: 'a2', roles: [RobotRole.PROVIDER], tags: ['dev'] });
      await robox.createRobotAccount({ id: 'a3', roles: [RobotRole.ADMIN] });

      const consumers = await robox.listRobotAccounts({ role: RobotRole.CONSUMER });
      expect(consumers).toHaveLength(1);

      const prodAccounts = await robox.listRobotAccounts({ tag: 'prod' });
      expect(prodAccounts).toHaveLength(1);
    });

    test('should freeze and unfreeze account', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });

      const frozen = await robox.freezeAccount('robot-001');
      expect(frozen.status).toBe(AccountStatus.FROZEN);

      const unfrozen = await robox.unfreezeAccount('robot-001');
      expect(unfrozen.status).toBe(AccountStatus.ACTIVE);
    });

    test('should not allow operations on frozen account', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'robot-002',
        roles: [RobotRole.PROVIDER],
      });

      await robox.freezeAccount('robot-001');

      await expect(
        robox.transfer({
          from: 'robot-001',
          to: 'robot-002',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxAccountFrozenError);
    });
  });

  // ============================================
  // Balance Operations
  // ============================================

  describe('Balance Operations', () => {
    test('should get total balance including frozen', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'robot-002',
        roles: [RobotRole.PROVIDER],
      });

      // Create escrow to freeze funds
      await robox.createEscrow({
        from: 'robot-001',
        to: 'robot-002',
        amount: 300,
      });

      const balance = await robox.getTotalBalance('robot-001');
      expect(balance.available).toBe(700);
      expect(balance.frozen).toBe(300);
      expect(balance.total).toBe(1000);
    });

    test('should credit with balance after info', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });

      const op = await robox.credit('robot-001', 500, {
        reason: 'Deposit',
        initiatedBy: 'robot-001',
      });

      expect(op.balanceAfter).toBe(500);
    });
  });

  // ============================================
  // Transfers
  // ============================================

  describe('Transfers', () => {
    beforeEach(async () => {
      await robox.createRobotAccount({
        id: 'consumer',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'provider',
        roles: [RobotRole.PROVIDER],
      });
    });

    test('should complete transfer with status', async () => {
      const tx = await robox.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });

      expect(tx.status).toBe(TransactionStatus.COMPLETED);
      expect(tx.completedAt).toBeDefined();
    });

    test('should handle idempotency', async () => {
      const tx1 = await robox.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
        idempotencyKey: 'unique-key-123',
      });

      await expect(
        robox.transfer({
          from: 'consumer',
          to: 'provider',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
          idempotencyKey: 'unique-key-123',
        })
      ).rejects.toThrow(RoboxIdempotencyError);
    });

    test('should refund completed transaction', async () => {
      const tx = await robox.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });

      // Provider needs consumer role to refund
      await robox.createRobotAccount({
        id: 'admin',
        roles: [RobotRole.ADMIN],
      });

      const refund = await robox.refund(tx.id, 'admin');

      expect(refund.type).toBe('REFUND');
      expect(refund.from).toBe('provider');
      expect(refund.to).toBe('consumer');

      const original = await robox.getTransaction(tx.id);
      expect(original?.status).toBe(TransactionStatus.REFUNDED);
    });

    test('should apply custom fees', async () => {
      const roboxWithFees = new RoboxLayer({
        storage,
        feeCalculator: {
          calculate: (amount) => Math.floor(amount * 0.01), // 1% fee
        },
      });

      const tx = await roboxWithFees.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });

      expect(tx.fee).toBe(1);

      const consumerBalance = await roboxWithFees.getBalance('consumer');
      expect(consumerBalance).toBe(899); // 1000 - 100 - 1
    });
  });

  // ============================================
  // Escrow
  // ============================================

  describe('Escrow', () => {
    beforeEach(async () => {
      await robox.createRobotAccount({
        id: 'buyer',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'seller',
        roles: [RobotRole.PROVIDER],
      });
    });

    test('should create escrow and freeze funds', async () => {
      const escrow = await robox.createEscrow({
        from: 'buyer',
        to: 'seller',
        amount: 500,
        condition: 'delivery_confirmed',
      });

      expect(escrow.status).toBe(EscrowStatus.PENDING);

      const balance = await robox.getTotalBalance('buyer');
      expect(balance.available).toBe(500);
      expect(balance.frozen).toBe(500);
    });

    test('should release escrow and transfer funds', async () => {
      const escrow = await robox.createEscrow({
        from: 'buyer',
        to: 'seller',
        amount: 500,
      });

      const tx = await robox.releaseEscrow(escrow.id);

      expect(tx.type).toBe('ESCROW_RELEASE');
      expect(tx.amount).toBe(500);

      const buyerBalance = await robox.getBalance('buyer');
      const sellerBalance = await robox.getBalance('seller');

      expect(buyerBalance).toBe(500);
      expect(sellerBalance).toBe(500);

      const updatedEscrow = await robox.getEscrow(escrow.id);
      expect(updatedEscrow?.status).toBe(EscrowStatus.RELEASED);
    });

    test('should refund escrow', async () => {
      const escrow = await robox.createEscrow({
        from: 'buyer',
        to: 'seller',
        amount: 500,
      });

      await robox.refundEscrow(escrow.id);

      const buyerBalance = await robox.getBalance('buyer');
      expect(buyerBalance).toBe(1000); // Full balance restored

      const updatedEscrow = await robox.getEscrow(escrow.id);
      expect(updatedEscrow?.status).toBe(EscrowStatus.REFUNDED);
    });

    test('should not release already released escrow', async () => {
      const escrow = await robox.createEscrow({
        from: 'buyer',
        to: 'seller',
        amount: 500,
      });

      await robox.releaseEscrow(escrow.id);

      await expect(robox.releaseEscrow(escrow.id)).rejects.toThrow(RoboxEscrowError);
    });
  });

  // ============================================
  // Batch Transfers
  // ============================================

  describe('Batch Transfers', () => {
    beforeEach(async () => {
      await robox.createRobotAccount({
        id: 'payer',
        initialBalance: 10000,
        roles: [RobotRole.CONSUMER],
      });
      for (let i = 1; i <= 5; i++) {
        await robox.createRobotAccount({
          id: `recipient-${i}`,
          roles: [RobotRole.PROVIDER],
        });
      }
    });

    test('should process batch successfully', async () => {
      const batch = await robox.batchTransfer({
        transfers: [
          { from: 'payer', to: 'recipient-1', amount: 100, type: TransactionType.REWARD },
          { from: 'payer', to: 'recipient-2', amount: 200, type: TransactionType.REWARD },
          { from: 'payer', to: 'recipient-3', amount: 300, type: TransactionType.REWARD },
        ],
      });

      expect(batch.status).toBe(BatchStatus.COMPLETED);
      expect(batch.successCount).toBe(3);
      expect(batch.failedCount).toBe(0);
      expect(batch.totalAmount).toBe(600);
    });

    test('should handle partial batch failure', async () => {
      const batch = await robox.batchTransfer({
        transfers: [
          { from: 'payer', to: 'recipient-1', amount: 100, type: TransactionType.REWARD },
          { from: 'payer', to: 'non-existent', amount: 200, type: TransactionType.REWARD },
          { from: 'payer', to: 'recipient-3', amount: 300, type: TransactionType.REWARD },
        ],
      });

      expect(batch.status).toBe(BatchStatus.PARTIAL);
      expect(batch.successCount).toBe(2);
      expect(batch.failedCount).toBe(1);
    });

    test('should stop on error when configured', async () => {
      const batch = await robox.batchTransfer({
        transfers: [
          { from: 'payer', to: 'recipient-1', amount: 100, type: TransactionType.REWARD },
          { from: 'payer', to: 'non-existent', amount: 200, type: TransactionType.REWARD },
          { from: 'payer', to: 'recipient-3', amount: 300, type: TransactionType.REWARD },
        ],
        stopOnError: true,
      });

      expect(batch.successCount).toBe(1);
      expect(batch.failedCount).toBe(1);
      // Third transfer was not attempted
    });
  });

  // ============================================
  // Events
  // ============================================

  describe('Events', () => {
    test('should emit events on account creation', async () => {
      const events: unknown[] = [];

      robox.on(EventType.ACCOUNT_CREATED, (e) => {
        events.push(e);
      });

      await robox.createRobotAccount({ id: 'test' });

      expect(events).toHaveLength(1);
    });

    test('should emit events on transfer', async () => {
      const events: unknown[] = [];

      robox.on('*', (e) => {
        events.push(e);
      });

      await robox.createRobotAccount({
        id: 'a',
        initialBalance: 100,
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'b',
        roles: [RobotRole.PROVIDER],
      });

      await robox.transfer({
        from: 'a',
        to: 'b',
        amount: 50,
        type: TransactionType.TASK_PAYMENT,
      });

      const transferEvents = events.filter(
        (e: any) =>
          e.type === EventType.TRANSFER_INITIATED ||
          e.type === EventType.TRANSFER_COMPLETED
      );
      expect(transferEvents).toHaveLength(2);
    });
  });

  // ============================================
  // Statistics
  // ============================================

  describe('Statistics', () => {
    test('should calculate statistics', async () => {
      await robox.createRobotAccount({
        id: 'a',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'b',
        roles: [RobotRole.PROVIDER],
      });

      await robox.transfer({ from: 'a', to: 'b', amount: 100, type: TransactionType.TASK_PAYMENT });
      await robox.transfer({ from: 'a', to: 'b', amount: 200, type: TransactionType.ENERGY_PAYMENT });
      await robox.transfer({ from: 'a', to: 'b', amount: 150, type: TransactionType.TASK_PAYMENT });

      const stats = await robox.getStatistics();

      expect(stats.totalAccounts).toBe(2);
      expect(stats.totalTransactions).toBe(3);
      expect(stats.totalVolume).toBe(450);
      expect(stats.transactionsByType[TransactionType.TASK_PAYMENT]).toBe(2);
      expect(stats.transactionsByType[TransactionType.ENERGY_PAYMENT]).toBe(1);
    });
  });

  // ============================================
  // Audit Log
  // ============================================

  describe('Audit Log', () => {
    test('should create audit entries', async () => {
      await robox.createRobotAccount({ id: 'test' });
      await robox.updateRobotAccount('test', { name: 'Updated' });

      const logs = await robox.getAuditLog({ entityId: 'test' });

      expect(logs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // Error Codes
  // ============================================

  describe('Error Codes', () => {
    test('RoboxForbiddenError should have code 403', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });

      try {
        await robox.debit('robot-001', 100, { initiatedBy: 'robot-001' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RoboxForbiddenError);
        expect((error as RoboxForbiddenError).code).toBe(403);
      }
    });

    test('RoboxAccountFrozenError should have code 403', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });
      await robox.freezeAccount('robot-001');

      try {
        await robox.debit('robot-001', 100, { initiatedBy: 'admin' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RoboxAccountFrozenError);
        expect((error as RoboxAccountFrozenError).code).toBe(403);
      }
    });

    test('Errors should serialize to JSON', async () => {
      const error = new RoboxForbiddenError('TEST_REASON', { extra: 'data' });
      const json = error.toJSON();

      expect(json.code).toBe(403);
      expect(json.errorCode).toBe('TEST_REASON');
      expect(json.details).toEqual({ extra: 'data' });
      expect(json.timestamp).toBeDefined();
    });
  });
});
