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
  TransactionStatus,
} from '../../types';
import type {
  PostgresConfig,
  DatabaseClient,
  PoolClient,
  TransactionCallback,
  AccountRow,
  TransactionRow,
  BalanceOperationRow,
  EscrowRow,
  BatchTransferRow,
  AuditLogRow,
} from './types';
import { migrations, prepareSql } from './migrations';

/**
 * PostgreSQL Storage Adapter
 *
 * Production-ready persistent storage with:
 * - Connection pooling
 * - Transactions (atomic operations)
 * - Auto-migrations
 * - Optimized indexes
 *
 * @example
 * ```typescript
 * import { RoboxLayer, PostgresStorage } from 'robox-clearing';
 *
 * const storage = new PostgresStorage({
 *   connectionString: 'postgres://user:pass@localhost:5432/robox',
 *   poolSize: 10,
 * });
 *
 * await storage.connect();
 *
 * const robox = new RoboxLayer({ storage });
 * ```
 */
export class PostgresStorage implements StorageAdapter {
  private pool: DatabaseClient | null = null;
  private config: Required<
    Pick<PostgresConfig, 'schema' | 'tablePrefix' | 'autoMigrate' | 'poolSize'>
  > &
    PostgresConfig;
  private connected = false;

  constructor(config: PostgresConfig) {
    this.config = {
      schema: 'public',
      tablePrefix: '',
      autoMigrate: true,
      poolSize: 10,
      idleTimeout: 30000,
      connectionTimeout: 10000,
      ...config,
    };
  }

  /**
   * Connect to database and run migrations
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // Dynamically import pg to make it optional dependency
    try {
      const pg = await import('pg');
      const Pool = pg.default?.Pool || pg.Pool;

      const poolConfig: Record<string, unknown> = {
        max: this.config.poolSize,
        idleTimeoutMillis: this.config.idleTimeout,
        connectionTimeoutMillis: this.config.connectionTimeout,
      };

      if (this.config.connectionString) {
        poolConfig.connectionString = this.config.connectionString;
      } else {
        poolConfig.host = this.config.host;
        poolConfig.port = this.config.port || 5432;
        poolConfig.database = this.config.database;
        poolConfig.user = this.config.user;
        poolConfig.password = this.config.password;
      }

      if (this.config.ssl) {
        poolConfig.ssl = this.config.ssl;
      }

      this.pool = new Pool(poolConfig) as unknown as DatabaseClient;
      this.connected = true;

      // Create schema if not exists
      await this.pool.query(
        `CREATE SCHEMA IF NOT EXISTS ${this.config.schema}`
      );

      // Run migrations
      if (this.config.autoMigrate) {
        await this.runMigrations();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'PostgreSQL driver not found. Install it with: npm install pg'
        );
      }
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    const pool = this.getPool();
    const schema = this.config.schema;
    const prefix = this.config.tablePrefix;

    // Ensure migrations table exists (use raw SQL first time)
    const migrationsTableSql = prepareSql(
      migrations.find((m) => m.name === 'create_migrations_table')!.up,
      schema,
      prefix
    );
    await pool.query(migrationsTableSql);

    // Get applied migrations
    const { rows } = await pool.query<{ version: number }>(
      `SELECT version FROM ${schema}.${prefix}migrations ORDER BY version`
    );
    const appliedVersions = new Set(rows.map((r) => r.version));

    // Apply pending migrations in order
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        const sql = prepareSql(migration.up, schema, prefix);
        await pool.query(sql);
        await pool.query(
          `INSERT INTO ${schema}.${prefix}migrations (version, name) VALUES ($1, $2)`,
          [migration.version, migration.name]
        );
      }
    }
  }

  /**
   * Execute callback within a transaction
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private getPool(): DatabaseClient {
    if (!this.pool) {
      throw new Error(
        'PostgresStorage not connected. Call connect() first.'
      );
    }
    return this.pool;
  }

  private table(name: string): string {
    return `${this.config.schema}.${this.config.tablePrefix}${name}`;
  }

  // ============================================
  // Account operations
  // ============================================

  async createAccount(account: RobotAccount): Promise<RobotAccount> {
    const pool = this.getPool();
    const sql = `
      INSERT INTO ${this.table('accounts')} 
      (id, name, balance, frozen_balance, roles, status, limits, metadata, tags, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const { rows } = await pool.query<AccountRow>(sql, [
      account.id,
      account.name || null,
      account.balance,
      account.frozenBalance,
      account.roles,
      account.status,
      account.limits ? JSON.stringify(account.limits) : null,
      account.metadata ? JSON.stringify(account.metadata) : null,
      account.tags || null,
      account.createdAt,
      account.updatedAt,
    ]);
    return this.mapAccountRow(rows[0]);
  }

  async getAccount(id: string): Promise<RobotAccount | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<AccountRow>(
      `SELECT * FROM ${this.table('accounts')} WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapAccountRow(rows[0]) : null;
  }

  async getAccountByApiKey(apiKey: string): Promise<RobotAccount | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<AccountRow>(
      `SELECT * FROM ${this.table('accounts')} WHERE api_key = $1`,
      [apiKey]
    );
    return rows[0] ? this.mapAccountRow(rows[0]) : null;
  }

  async getAccountsByOwner(ownerId: string): Promise<RobotAccount[]> {
    const pool = this.getPool();
    const { rows } = await pool.query<AccountRow>(
      `SELECT * FROM ${this.table('accounts')} WHERE owner_id = $1 ORDER BY created_at DESC`,
      [ownerId]
    );
    return rows.map(row => this.mapAccountRow(row));
  }

  async updateAccount(
    id: string,
    updates: Partial<RobotAccount>
  ): Promise<RobotAccount | null> {
    const pool = this.getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.balance !== undefined) {
      setClauses.push(`balance = $${paramIndex++}`);
      values.push(updates.balance);
    }
    if (updates.frozenBalance !== undefined) {
      setClauses.push(`frozen_balance = $${paramIndex++}`);
      values.push(updates.frozenBalance);
    }
    if (updates.roles !== undefined) {
      setClauses.push(`roles = $${paramIndex++}`);
      values.push(updates.roles);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.limits !== undefined) {
      setClauses.push(`limits = $${paramIndex++}`);
      values.push(JSON.stringify(updates.limits));
    }
    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }
    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }

    if (setClauses.length === 0) {
      return this.getAccount(id);
    }

    setClauses.push(`updated_at = $${paramIndex++}`);
    values.push(new Date());
    values.push(id);

    const sql = `
      UPDATE ${this.table('accounts')}
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const { rows } = await pool.query<AccountRow>(sql, values);
    return rows[0] ? this.mapAccountRow(rows[0]) : null;
  }

  async deleteAccount(id: string): Promise<boolean> {
    const pool = this.getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM ${this.table('accounts')} WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  }

  async listAccounts(filter?: AccountFilter): Promise<RobotAccount[]> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }
    if (filter?.role) {
      conditions.push(`$${paramIndex++} = ANY(roles)`);
      values.push(filter.role);
    }
    if (filter?.tag) {
      conditions.push(`$${paramIndex++} = ANY(tags)`);
      values.push(filter.tag);
    }
    if (filter?.minBalance !== undefined) {
      conditions.push(`balance >= $${paramIndex++}`);
      values.push(filter.minBalance);
    }
    if (filter?.maxBalance !== undefined) {
      conditions.push(`balance <= $${paramIndex++}`);
      values.push(filter.maxBalance);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const sql = `
      SELECT * FROM ${this.table('accounts')}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(limit, offset);

    const { rows } = await pool.query<AccountRow>(sql, values);
    return rows.map((r) => this.mapAccountRow(r));
  }

  async countAccounts(filter?: AccountFilter): Promise<number> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }
    if (filter?.role) {
      conditions.push(`$${paramIndex++} = ANY(roles)`);
      values.push(filter.role);
    }
    if (filter?.tag) {
      conditions.push(`$${paramIndex++} = ANY(tags)`);
      values.push(filter.tag);
    }
    if (filter?.minBalance !== undefined) {
      conditions.push(`balance >= $${paramIndex++}`);
      values.push(filter.minBalance);
    }
    if (filter?.maxBalance !== undefined) {
      conditions.push(`balance <= $${paramIndex++}`);
      values.push(filter.maxBalance);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.table('accounts')} ${whereClause}`,
      values
    );
    return parseInt(rows[0].count, 10);
  }

  // ============================================
  // Transaction operations
  // ============================================

  async createTransaction(transaction: Transaction): Promise<Transaction> {
    const pool = this.getPool();
    const sql = `
      INSERT INTO ${this.table('transactions')}
      (id, from_account, to_account, amount, fee, type, status, meta, initiated_by, escrow_id, batch_id, idempotency_key, created_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const idempotencyKey =
      (transaction as unknown as Record<string, unknown>).idempotencyKey || null;

    const { rows } = await pool.query<TransactionRow>(sql, [
      transaction.id,
      transaction.from,
      transaction.to,
      transaction.amount,
      transaction.fee || null,
      transaction.type,
      transaction.status,
      transaction.meta ? JSON.stringify(transaction.meta) : null,
      transaction.initiatedBy || null,
      transaction.escrowId || null,
      transaction.batchId || null,
      idempotencyKey,
      transaction.createdAt,
      transaction.completedAt || null,
    ]);
    return this.mapTransactionRow(rows[0]);
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<TransactionRow>(
      `SELECT * FROM ${this.table('transactions')} WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapTransactionRow(rows[0]) : null;
  }

  async updateTransaction(
    id: string,
    updates: Partial<Transaction>
  ): Promise<Transaction | null> {
    const pool = this.getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completedAt);
    }
    if (updates.meta !== undefined) {
      setClauses.push(`meta = $${paramIndex++}`);
      values.push(JSON.stringify(updates.meta));
    }

    if (setClauses.length === 0) {
      return this.getTransaction(id);
    }

    values.push(id);
    const sql = `
      UPDATE ${this.table('transactions')}
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const { rows } = await pool.query<TransactionRow>(sql, values);
    return rows[0] ? this.mapTransactionRow(rows[0]) : null;
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter?.robotId) {
      conditions.push(
        `(from_account = $${paramIndex} OR to_account = $${paramIndex})`
      );
      values.push(filter.robotId);
      paramIndex++;
    }
    if (filter?.type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(filter.type);
    }
    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }
    if (filter?.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filter.fromDate);
    }
    if (filter?.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filter.toDate);
    }
    if (filter?.minAmount !== undefined) {
      conditions.push(`amount >= $${paramIndex++}`);
      values.push(filter.minAmount);
    }
    if (filter?.maxAmount !== undefined) {
      conditions.push(`amount <= $${paramIndex++}`);
      values.push(filter.maxAmount);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    const sql = `
      SELECT * FROM ${this.table('transactions')}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    values.push(limit, offset);

    const { rows } = await pool.query<TransactionRow>(sql, values);
    return rows.map((r) => this.mapTransactionRow(r));
  }

  async countTransactions(filter?: TransactionFilter): Promise<number> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter?.robotId) {
      conditions.push(
        `(from_account = $${paramIndex} OR to_account = $${paramIndex})`
      );
      values.push(filter.robotId);
      paramIndex++;
    }
    if (filter?.type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(filter.type);
    }
    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }
    if (filter?.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filter.fromDate);
    }
    if (filter?.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filter.toDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.table('transactions')} ${whereClause}`,
      values
    );
    return parseInt(rows[0].count, 10);
  }

  // ============================================
  // Balance operations
  // ============================================

  async createBalanceOperation(
    operation: BalanceOperation
  ): Promise<BalanceOperation> {
    const pool = this.getPool();
    const sql = `
      INSERT INTO ${this.table('balance_operations')}
      (id, robot_id, direction, amount, balance_after, reason, meta, initiated_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const { rows } = await pool.query<BalanceOperationRow>(sql, [
      operation.id,
      operation.robotId,
      operation.direction,
      operation.amount,
      operation.balanceAfter,
      operation.reason || null,
      operation.meta ? JSON.stringify(operation.meta) : null,
      operation.initiatedBy || null,
      operation.createdAt,
    ]);
    return this.mapBalanceOperationRow(rows[0]);
  }

  async updateBalance(id: string, delta: number): Promise<number> {
    const pool = this.getPool();
    const { rows } = await pool.query<{ balance: string }>(
      `
      UPDATE ${this.table('accounts')}
      SET balance = balance + $1, updated_at = NOW()
      WHERE id = $2
      RETURNING balance
    `,
      [delta, id]
    );

    if (rows.length === 0) {
      throw new Error(`Account not found: ${id}`);
    }
    return parseFloat(rows[0].balance);
  }

  async freezeBalance(id: string, amount: number): Promise<void> {
    const pool = this.getPool();
    const { rowCount } = await pool.query(
      `
      UPDATE ${this.table('accounts')}
      SET balance = balance - $1, frozen_balance = frozen_balance + $1, updated_at = NOW()
      WHERE id = $2
    `,
      [amount, id]
    );

    if (rowCount === 0) {
      throw new Error(`Account not found: ${id}`);
    }
  }

  async unfreezeBalance(id: string, amount: number): Promise<void> {
    const pool = this.getPool();
    const { rowCount } = await pool.query(
      `
      UPDATE ${this.table('accounts')}
      SET frozen_balance = frozen_balance - $1, balance = balance + $1, updated_at = NOW()
      WHERE id = $2
    `,
      [amount, id]
    );

    if (rowCount === 0) {
      throw new Error(`Account not found: ${id}`);
    }
  }

  // ============================================
  // Escrow operations
  // ============================================

  async createEscrow(escrow: Escrow): Promise<Escrow> {
    const pool = this.getPool();
    const sql = `
      INSERT INTO ${this.table('escrows')}
      (id, from_account, to_account, amount, status, condition, expires_at, meta, transaction_id, created_at, released_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const { rows } = await pool.query<EscrowRow>(sql, [
      escrow.id,
      escrow.from,
      escrow.to,
      escrow.amount,
      escrow.status,
      escrow.condition || null,
      escrow.expiresAt || null,
      escrow.meta ? JSON.stringify(escrow.meta) : null,
      escrow.transactionId || null,
      escrow.createdAt,
      escrow.releasedAt || null,
    ]);
    return this.mapEscrowRow(rows[0]);
  }

  async getEscrow(id: string): Promise<Escrow | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<EscrowRow>(
      `SELECT * FROM ${this.table('escrows')} WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapEscrowRow(rows[0]) : null;
  }

  async updateEscrow(
    id: string,
    updates: Partial<Escrow>
  ): Promise<Escrow | null> {
    const pool = this.getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.releasedAt !== undefined) {
      setClauses.push(`released_at = $${paramIndex++}`);
      values.push(updates.releasedAt);
    }
    if (updates.transactionId !== undefined) {
      setClauses.push(`transaction_id = $${paramIndex++}`);
      values.push(updates.transactionId);
    }
    if (updates.meta !== undefined) {
      setClauses.push(`meta = $${paramIndex++}`);
      values.push(JSON.stringify(updates.meta));
    }

    if (setClauses.length === 0) {
      return this.getEscrow(id);
    }

    values.push(id);
    const sql = `
      UPDATE ${this.table('escrows')}
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const { rows } = await pool.query<EscrowRow>(sql, values);
    return rows[0] ? this.mapEscrowRow(rows[0]) : null;
  }

  async listEscrows(filter?: {
    robotId?: string;
    status?: EscrowStatus;
  }): Promise<Escrow[]> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter?.robotId) {
      conditions.push(
        `(from_account = $${paramIndex} OR to_account = $${paramIndex})`
      );
      values.push(filter.robotId);
      paramIndex++;
    }
    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query<EscrowRow>(
      `SELECT * FROM ${this.table('escrows')} ${whereClause} ORDER BY created_at DESC`,
      values
    );
    return rows.map((r) => this.mapEscrowRow(r));
  }

  // ============================================
  // Batch operations
  // ============================================

  async createBatchTransfer(batch: BatchTransfer): Promise<BatchTransfer> {
    const pool = this.getPool();
    const sql = `
      INSERT INTO ${this.table('batch_transfers')}
      (id, transfers, status, success_count, failed_count, total_amount, initiated_by, meta, created_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const { rows } = await pool.query<BatchTransferRow>(sql, [
      batch.id,
      JSON.stringify(batch.transfers),
      batch.status,
      batch.successCount,
      batch.failedCount,
      batch.totalAmount,
      batch.initiatedBy || null,
      batch.meta ? JSON.stringify(batch.meta) : null,
      batch.createdAt,
      batch.completedAt || null,
    ]);
    return this.mapBatchTransferRow(rows[0]);
  }

  async getBatchTransfer(id: string): Promise<BatchTransfer | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<BatchTransferRow>(
      `SELECT * FROM ${this.table('batch_transfers')} WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.mapBatchTransferRow(rows[0]) : null;
  }

  async updateBatchTransfer(
    id: string,
    updates: Partial<BatchTransfer>
  ): Promise<BatchTransfer | null> {
    const pool = this.getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.transfers !== undefined) {
      setClauses.push(`transfers = $${paramIndex++}`);
      values.push(JSON.stringify(updates.transfers));
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.successCount !== undefined) {
      setClauses.push(`success_count = $${paramIndex++}`);
      values.push(updates.successCount);
    }
    if (updates.failedCount !== undefined) {
      setClauses.push(`failed_count = $${paramIndex++}`);
      values.push(updates.failedCount);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completedAt);
    }

    if (setClauses.length === 0) {
      return this.getBatchTransfer(id);
    }

    values.push(id);
    const sql = `
      UPDATE ${this.table('batch_transfers')}
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const { rows } = await pool.query<BatchTransferRow>(sql, values);
    return rows[0] ? this.mapBatchTransferRow(rows[0]) : null;
  }

  // ============================================
  // Audit log
  // ============================================

  async createAuditLog(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const pool = this.getPool();
    const sql = `
      INSERT INTO ${this.table('audit_logs')}
      (id, action, entity_type, entity_id, actor_id, changes, meta, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const { rows } = await pool.query<AuditLogRow>(sql, [
      entry.id,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.actorId || null,
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      entry.timestamp,
    ]);
    return this.mapAuditLogRow(rows[0]);
  }

  async listAuditLogs(filter?: {
    entityId?: string;
    action?: AuditAction;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    const pool = this.getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter?.entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      values.push(filter.entityId);
    }
    if (filter?.action) {
      conditions.push(`action = $${paramIndex++}`);
      values.push(filter.action);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 100;

    const sql = `
      SELECT * FROM ${this.table('audit_logs')}
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex}
    `;
    values.push(limit);

    const { rows } = await pool.query<AuditLogRow>(sql, values);
    return rows.map((r) => this.mapAuditLogRow(r));
  }

  // ============================================
  // Idempotency
  // ============================================

  async getByIdempotencyKey(key: string): Promise<Transaction | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<TransactionRow>(
      `SELECT * FROM ${this.table('transactions')} WHERE idempotency_key = $1`,
      [key]
    );
    return rows[0] ? this.mapTransactionRow(rows[0]) : null;
  }

  // ============================================
  // Statistics
  // ============================================

  async getStatistics(fromDate?: Date, toDate?: Date): Promise<Statistics> {
    const pool = this.getPool();

    // Account stats
    const { rows: accountRows } = await pool.query<{
      total: string;
      active: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active
      FROM ${this.table('accounts')}
    `);

    // Transaction stats
    const conditions: string[] = [`status = 'COMPLETED'`];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(fromDate);
    }
    if (toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(toDate);
    }

    const whereClause = conditions.join(' AND ');

    const { rows: txRows } = await pool.query<{
      count: string;
      volume: string;
      fees: string;
      avg: string;
    }>(
      `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as volume,
        COALESCE(SUM(fee), 0) as fees,
        COALESCE(AVG(amount), 0) as avg
      FROM ${this.table('transactions')}
      WHERE ${whereClause}
    `,
      values
    );

    // Transactions by type
    const { rows: typeRows } = await pool.query<{
      type: string;
      count: string;
    }>(
      `
      SELECT type, COUNT(*) as count
      FROM ${this.table('transactions')}
      WHERE ${whereClause}
      GROUP BY type
    `,
      values
    );

    const transactionsByType: Record<string, number> = {};
    for (const row of typeRows) {
      transactionsByType[row.type] = parseInt(row.count, 10);
    }

    return {
      totalAccounts: parseInt(accountRows[0].total, 10),
      activeAccounts: parseInt(accountRows[0].active, 10),
      totalTransactions: parseInt(txRows[0].count, 10),
      totalVolume: parseFloat(txRows[0].volume),
      totalFees: parseFloat(txRows[0].fees),
      averageTransactionAmount: parseFloat(txRows[0].avg),
      transactionsByType,
      periodStart: fromDate,
      periodEnd: toDate,
    };
  }

  // ============================================
  // Row mappers
  // ============================================

  private mapAccountRow(row: AccountRow): RobotAccount {
    return {
      id: row.id,
      name: row.name || undefined,
      balance: parseFloat(row.balance),
      frozenBalance: parseFloat(row.frozen_balance),
      roles: row.roles,
      status: row.status as RobotAccount['status'],
      limits: row.limits || undefined,
      metadata: row.metadata || undefined,
      tags: row.tags || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapTransactionRow(row: TransactionRow): Transaction {
    return {
      id: row.id,
      from: row.from_account,
      to: row.to_account,
      amount: parseFloat(row.amount),
      fee: row.fee ? parseFloat(row.fee) : undefined,
      type: row.type,
      status: row.status as TransactionStatus,
      meta: row.meta || undefined,
      initiatedBy: row.initiated_by || undefined,
      escrowId: row.escrow_id || undefined,
      batchId: row.batch_id || undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  private mapBalanceOperationRow(row: BalanceOperationRow): BalanceOperation {
    return {
      id: row.id,
      robotId: row.robot_id,
      direction: row.direction as 'CREDIT' | 'DEBIT',
      amount: parseFloat(row.amount),
      balanceAfter: parseFloat(row.balance_after),
      reason: row.reason || undefined,
      meta: row.meta || undefined,
      initiatedBy: row.initiated_by || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapEscrowRow(row: EscrowRow): Escrow {
    return {
      id: row.id,
      from: row.from_account,
      to: row.to_account,
      amount: parseFloat(row.amount),
      status: row.status as EscrowStatus,
      condition: row.condition || undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      meta: row.meta || undefined,
      transactionId: row.transaction_id || undefined,
      createdAt: new Date(row.created_at),
      releasedAt: row.released_at ? new Date(row.released_at) : undefined,
    };
  }

  private mapBatchTransferRow(row: BatchTransferRow): BatchTransfer {
    return {
      id: row.id,
      transfers: row.transfers as BatchTransfer['transfers'],
      status: row.status as BatchTransfer['status'],
      successCount: row.success_count,
      failedCount: row.failed_count,
      totalAmount: parseFloat(row.total_amount),
      initiatedBy: row.initiated_by || undefined,
      meta: row.meta || undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  private mapAuditLogRow(row: AuditLogRow): AuditLogEntry {
    return {
      id: row.id,
      action: row.action as AuditAction,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorId: row.actor_id || undefined,
      changes: row.changes as Record<string, { from: unknown; to: unknown }> | undefined,
      meta: row.meta || undefined,
      timestamp: new Date(row.timestamp),
    };
  }
}
