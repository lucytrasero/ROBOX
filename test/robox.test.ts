import {
  RoboxLayer,
  InMemoryStorage,
  RobotRole,
  TransactionType,
  RoboxForbiddenError,
  RoboxNotFoundError,
  RoboxValidationError,
  RoboxInsufficientFundsError,
} from '../src';

describe('RoboxLayer', () => {
  let robox: RoboxLayer;
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
    robox = new RoboxLayer({ storage });
  });

  // ============================================
  // Account Management Tests
  // ============================================

  describe('Account Management', () => {
    test('should create account with default values', async () => {
      const account = await robox.createRobotAccount();

      expect(account.id).toBeDefined();
      expect(account.balance).toBe(0);
      expect(account.roles).toContain(RobotRole.CONSUMER);
      expect(account.createdAt).toBeInstanceOf(Date);
    });

    test('should create account with custom values', async () => {
      const account = await robox.createRobotAccount({
        id: 'robot-001',
        name: 'Test Robot',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER, RobotRole.PROVIDER],
        metadata: { type: 'worker' },
      });

      expect(account.id).toBe('robot-001');
      expect(account.name).toBe('Test Robot');
      expect(account.balance).toBe(1000);
      expect(account.roles).toEqual([RobotRole.CONSUMER, RobotRole.PROVIDER]);
      expect(account.metadata).toEqual({ type: 'worker' });
    });

    test('should get existing account', async () => {
      const created = await robox.createRobotAccount({ id: 'robot-001' });
      const fetched = await robox.getRobotAccount('robot-001');

      expect(fetched).toEqual(created);
    });

    test('should return null for non-existing account', async () => {
      const account = await robox.getRobotAccount('non-existent');
      expect(account).toBeNull();
    });

    test('should update account metadata', async () => {
      await robox.createRobotAccount({ id: 'robot-001', name: 'Original' });

      const updated = await robox.updateRobotAccount('robot-001', {
        name: 'Updated',
        metadata: { version: 2 },
      });

      expect(updated.name).toBe('Updated');
      expect(updated.metadata).toEqual({ version: 2 });
    });

    test('should throw on update non-existing account', async () => {
      await expect(
        robox.updateRobotAccount('non-existent', { name: 'Test' })
      ).rejects.toThrow(RoboxNotFoundError);
    });

    test('should delete account with zero balance', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });
      await robox.deleteRobotAccount('robot-001');

      const account = await robox.getRobotAccount('robot-001');
      expect(account).toBeNull();
    });

    test('should not delete account with non-zero balance', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 100,
      });

      await expect(robox.deleteRobotAccount('robot-001')).rejects.toThrow(
        RoboxValidationError
      );
    });
  });

  // ============================================
  // Balance Operations Tests
  // ============================================

  describe('Balance Operations', () => {
    test('should get balance', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 500,
      });

      const balance = await robox.getBalance('robot-001');
      expect(balance).toBe(500);
    });

    test('should credit account (self)', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });

      const op = await robox.credit('robot-001', 100, {
        reason: 'Initial deposit',
        initiatedBy: 'robot-001',
      });

      expect(op.direction).toBe('CREDIT');
      expect(op.amount).toBe(100);

      const balance = await robox.getBalance('robot-001');
      expect(balance).toBe(100);
    });

    test('should credit account (admin)', async () => {
      await robox.createRobotAccount({ id: 'admin', roles: [RobotRole.ADMIN] });
      await robox.createRobotAccount({ id: 'robot-001' });

      await robox.credit('robot-001', 100, { initiatedBy: 'admin' });

      const balance = await robox.getBalance('robot-001');
      expect(balance).toBe(100);
    });

    test('should forbid credit without permission', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });
      await robox.createRobotAccount({ id: 'robot-002' });

      await expect(
        robox.credit('robot-001', 100, { initiatedBy: 'robot-002' })
      ).rejects.toThrow(RoboxForbiddenError);
    });

    test('should debit account (admin only)', async () => {
      await robox.createRobotAccount({ id: 'admin', roles: [RobotRole.ADMIN] });
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 500,
      });

      const op = await robox.debit('robot-001', 100, { initiatedBy: 'admin' });

      expect(op.direction).toBe('DEBIT');
      expect(op.amount).toBe(100);

      const balance = await robox.getBalance('robot-001');
      expect(balance).toBe(400);
    });

    test('should forbid debit without admin role', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 500,
      });

      await expect(
        robox.debit('robot-001', 100, { initiatedBy: 'robot-001' })
      ).rejects.toThrow(RoboxForbiddenError);
    });

    test('should throw on insufficient funds', async () => {
      await robox.createRobotAccount({ id: 'admin', roles: [RobotRole.ADMIN] });
      await robox.createRobotAccount({
        id: 'robot-001',
        initialBalance: 50,
      });

      await expect(
        robox.debit('robot-001', 100, { initiatedBy: 'admin' })
      ).rejects.toThrow(RoboxInsufficientFundsError);
    });

    test('should reject non-positive amounts', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });

      await expect(
        robox.credit('robot-001', 0, { initiatedBy: 'robot-001' })
      ).rejects.toThrow(RoboxValidationError);

      await expect(
        robox.credit('robot-001', -50, { initiatedBy: 'robot-001' })
      ).rejects.toThrow(RoboxValidationError);
    });
  });

  // ============================================
  // Transfer Tests
  // ============================================

  describe('Transfers', () => {
    beforeEach(async () => {
      // Setup: Consumer and Provider
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

    test('should transfer between consumer and provider', async () => {
      const tx = await robox.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });

      expect(tx.from).toBe('consumer');
      expect(tx.to).toBe('provider');
      expect(tx.amount).toBe(100);
      expect(tx.type).toBe(TransactionType.TASK_PAYMENT);

      const consumerBalance = await robox.getBalance('consumer');
      const providerBalance = await robox.getBalance('provider');

      expect(consumerBalance).toBe(900);
      expect(providerBalance).toBe(100);
    });

    test('should transfer with custom type', async () => {
      const tx = await robox.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 50,
        type: 'CUSTOM_PAYMENT',
        meta: { orderId: '12345' },
      });

      expect(tx.type).toBe('CUSTOM_PAYMENT');
      expect(tx.meta).toEqual({ orderId: '12345' });
    });

    test('should forbid transfer from non-consumer', async () => {
      await robox.createRobotAccount({
        id: 'not-consumer',
        initialBalance: 500,
        roles: [RobotRole.PROVIDER], // Not a consumer
      });

      await expect(
        robox.transfer({
          from: 'not-consumer',
          to: 'provider',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxForbiddenError);
    });

    test('should forbid transfer to non-provider', async () => {
      await robox.createRobotAccount({
        id: 'not-provider',
        roles: [RobotRole.CONSUMER], // Not a provider
      });

      await expect(
        robox.transfer({
          from: 'consumer',
          to: 'not-provider',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxForbiddenError);
    });

    test('should allow admin to initiate any transfer', async () => {
      await robox.createRobotAccount({
        id: 'admin',
        roles: [RobotRole.ADMIN],
      });

      const tx = await robox.transfer({
        from: 'consumer',
        to: 'provider',
        amount: 100,
        type: TransactionType.ENERGY_PAYMENT,
        initiatedBy: 'admin',
      });

      expect(tx.initiatedBy).toBe('admin');
    });

    test('should forbid third-party initiation without admin', async () => {
      await robox.createRobotAccount({
        id: 'third-party',
        roles: [RobotRole.CONSUMER],
      });

      await expect(
        robox.transfer({
          from: 'consumer',
          to: 'provider',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
          initiatedBy: 'third-party',
        })
      ).rejects.toThrow(RoboxForbiddenError);
    });

    test('should fail on insufficient funds', async () => {
      await expect(
        robox.transfer({
          from: 'consumer',
          to: 'provider',
          amount: 5000, // More than balance
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxInsufficientFundsError);
    });

    test('should fail on non-existing accounts', async () => {
      await expect(
        robox.transfer({
          from: 'non-existent',
          to: 'provider',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxNotFoundError);

      await expect(
        robox.transfer({
          from: 'consumer',
          to: 'non-existent',
          amount: 100,
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxNotFoundError);
    });

    test('should reject non-positive amounts', async () => {
      await expect(
        robox.transfer({
          from: 'consumer',
          to: 'provider',
          amount: 0,
          type: TransactionType.TASK_PAYMENT,
        })
      ).rejects.toThrow(RoboxValidationError);
    });
  });

  // ============================================
  // Role Management Tests
  // ============================================

  describe('Role Management', () => {
    test('should allow admin to change roles', async () => {
      await robox.createRobotAccount({
        id: 'admin',
        roles: [RobotRole.ADMIN],
      });
      await robox.createRobotAccount({
        id: 'robot-001',
        roles: [RobotRole.CONSUMER],
      });

      const updated = await robox.updateRobotAccount(
        'robot-001',
        { roles: [RobotRole.CONSUMER, RobotRole.PROVIDER] },
        'admin'
      );

      expect(updated.roles).toEqual([RobotRole.CONSUMER, RobotRole.PROVIDER]);
    });

    test('should forbid non-admin to change roles', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        roles: [RobotRole.CONSUMER],
      });
      await robox.createRobotAccount({
        id: 'robot-002',
        roles: [RobotRole.CONSUMER],
      });

      await expect(
        robox.updateRobotAccount(
          'robot-001',
          { roles: [RobotRole.ADMIN] },
          'robot-002'
        )
      ).rejects.toThrow(RoboxForbiddenError);
    });

    test('should forbid self role change without admin', async () => {
      await robox.createRobotAccount({
        id: 'robot-001',
        roles: [RobotRole.CONSUMER],
      });

      await expect(
        robox.updateRobotAccount(
          'robot-001',
          { roles: [RobotRole.ADMIN] },
          'robot-001'
        )
      ).rejects.toThrow(RoboxForbiddenError);
    });
  });

  // ============================================
  // Transaction History Tests
  // ============================================

  describe('Transaction History', () => {
    beforeEach(async () => {
      await robox.createRobotAccount({
        id: 'robot-a',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER, RobotRole.PROVIDER],
      });
      await robox.createRobotAccount({
        id: 'robot-b',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER, RobotRole.PROVIDER],
      });
      await robox.createRobotAccount({
        id: 'robot-c',
        initialBalance: 1000,
        roles: [RobotRole.CONSUMER, RobotRole.PROVIDER],
      });
    });

    test('should list all transactions', async () => {
      await robox.transfer({
        from: 'robot-a',
        to: 'robot-b',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-b',
        to: 'robot-c',
        amount: 50,
        type: TransactionType.ENERGY_PAYMENT,
      });

      const transactions = await robox.listTransactions();
      expect(transactions).toHaveLength(2);
    });

    test('should filter by robotId', async () => {
      await robox.transfer({
        from: 'robot-a',
        to: 'robot-b',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-b',
        to: 'robot-c',
        amount: 50,
        type: TransactionType.ENERGY_PAYMENT,
      });

      const transactions = await robox.listTransactions({ robotId: 'robot-b' });
      expect(transactions).toHaveLength(2); // robot-b is in both
    });

    test('should filter by type', async () => {
      await robox.transfer({
        from: 'robot-a',
        to: 'robot-b',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-a',
        to: 'robot-b',
        amount: 50,
        type: TransactionType.ENERGY_PAYMENT,
      });

      const transactions = await robox.listTransactions({
        type: TransactionType.TASK_PAYMENT,
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe(TransactionType.TASK_PAYMENT);
    });

    test('should get single transaction', async () => {
      const tx = await robox.transfer({
        from: 'robot-a',
        to: 'robot-b',
        amount: 100,
        type: TransactionType.PARTS_PAYMENT,
      });

      const fetched = await robox.getTransaction(tx.id);
      expect(fetched).toEqual(tx);
    });

    test('should return null for non-existing transaction', async () => {
      const tx = await robox.getTransaction('non-existent');
      expect(tx).toBeNull();
    });

    test('should paginate results', async () => {
      for (let i = 0; i < 10; i++) {
        await robox.transfer({
          from: 'robot-a',
          to: 'robot-b',
          amount: 10,
          type: TransactionType.TASK_PAYMENT,
        });
      }

      const page1 = await robox.listTransactions({ limit: 5, offset: 0 });
      const page2 = await robox.listTransactions({ limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  // ============================================
  // Error Code Tests
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

    test('RoboxNotFoundError should have code 404', async () => {
      try {
        await robox.getBalance('non-existent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RoboxNotFoundError);
        expect((error as RoboxNotFoundError).code).toBe(404);
      }
    });

    test('RoboxValidationError should have code 400', async () => {
      await robox.createRobotAccount({ id: 'robot-001' });

      try {
        await robox.credit('robot-001', -100, { initiatedBy: 'robot-001' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RoboxValidationError);
        expect((error as RoboxValidationError).code).toBe(400);
      }
    });

    test('RoboxInsufficientFundsError should have code 402', async () => {
      await robox.createRobotAccount({ id: 'admin', roles: [RobotRole.ADMIN] });
      await robox.createRobotAccount({ id: 'robot-001', initialBalance: 10 });

      try {
        await robox.debit('robot-001', 100, { initiatedBy: 'admin' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RoboxInsufficientFundsError);
        expect((error as RoboxInsufficientFundsError).code).toBe(402);
      }
    });
  });
});
