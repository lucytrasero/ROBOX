/**
 * PostgreSQL Storage Adapter Types
 */

/**
 * PostgreSQL connection configuration
 */
export interface PostgresConfig {
  /** Connection string (postgres://user:pass@host:port/db) */
  connectionString?: string;

  /** Host (alternative to connectionString) */
  host?: string;

  /** Port (default: 5432) */
  port?: number;

  /** Database name */
  database?: string;

  /** Username */
  user?: string;

  /** Password */
  password?: string;

  /** Connection pool size (default: 10) */
  poolSize?: number;

  /** Pool idle timeout in ms (default: 30000) */
  idleTimeout?: number;

  /** Connection timeout in ms (default: 10000) */
  connectionTimeout?: number;

  /** SSL configuration */
  ssl?: boolean | PostgresSSLConfig;

  /** Schema name (default: 'robox') */
  schema?: string;

  /** Auto-run migrations on connect (default: true) */
  autoMigrate?: boolean;

  /** Table name prefix (default: '') */
  tablePrefix?: string;
}

/**
 * SSL configuration for PostgreSQL
 */
export interface PostgresSSLConfig {
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

/**
 * Query result
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * Database client interface (abstracts pg.Pool)
 */
export interface DatabaseClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

/**
 * Pool client for transactions
 */
export interface PoolClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  release(): void;
}

/**
 * Migration definition
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

/**
 * Transaction callback
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Database row types
 */
export interface AccountRow {
  id: string;
  name: string | null;
  balance: string; // numeric comes as string
  frozen_balance: string;
  roles: string[];
  status: string;
  limits: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow {
  id: string;
  from_account: string;
  to_account: string;
  amount: string;
  fee: string | null;
  type: string;
  status: string;
  meta: Record<string, unknown> | null;
  initiated_by: string | null;
  escrow_id: string | null;
  batch_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface BalanceOperationRow {
  id: string;
  robot_id: string;
  direction: string;
  amount: string;
  balance_after: string;
  reason: string | null;
  meta: Record<string, unknown> | null;
  initiated_by: string | null;
  created_at: Date;
}

export interface EscrowRow {
  id: string;
  from_account: string;
  to_account: string;
  amount: string;
  status: string;
  condition: string | null;
  expires_at: Date | null;
  meta: Record<string, unknown> | null;
  transaction_id: string | null;
  created_at: Date;
  released_at: Date | null;
}

export interface BatchTransferRow {
  id: string;
  transfers: unknown;
  status: string;
  success_count: number;
  failed_count: number;
  total_amount: string;
  initiated_by: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  changes: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  timestamp: Date;
}
