/**
 * Robot account representation
 */
export interface RobotAccount {
  id: string;
  name?: string;
  apiKey?: string;
  ownerId?: string;
  balance: number;
  frozenBalance: number;
  roles: string[];
  status: AccountStatus;
  limits?: AccountLimits;
  metadata?: Record<string, unknown>;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Account status
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

/**
 * Account limits configuration
 */
export interface AccountLimits {
  maxTransferAmount?: number;
  dailyTransferLimit?: number;
  monthlyTransferLimit?: number;
  minBalance?: number;
}

/**
 * Transaction between robots
 */
export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  fee?: number;
  type: TransactionType | string;
  status: TransactionStatus;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
  escrowId?: string;
  batchId?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Transaction status
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  ESCROWED = 'ESCROWED',
}

/**
 * Balance operation (credit/debit)
 */
export interface BalanceOperation {
  id: string;
  robotId: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;
  reason?: string;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
  createdAt: Date;
}

/**
 * Escrow record
 */
export interface Escrow {
  id: string;
  from: string;
  to: string;
  amount: number;
  status: EscrowStatus;
  condition?: string;
  expiresAt?: Date;
  meta?: Record<string, unknown>;
  transactionId?: string;
  createdAt: Date;
  releasedAt?: Date;
}

/**
 * Escrow status
 */
export enum EscrowStatus {
  PENDING = 'PENDING',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

/**
 * Batch transfer record
 */
export interface BatchTransfer {
  id: string;
  transfers: BatchTransferItem[];
  status: BatchStatus;
  successCount: number;
  failedCount: number;
  totalAmount: number;
  initiatedBy?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Single item in batch transfer
 */
export interface BatchTransferItem {
  from: string;
  to: string;
  amount: number;
  type: TransactionType | string;
  meta?: Record<string, unknown>;
  status?: TransactionStatus;
  error?: string;
  transactionId?: string;
}

/**
 * Batch status
 */
export enum BatchStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  meta?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Audit actions
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  TRANSFER = 'TRANSFER',
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  FREEZE = 'FREEZE',
  UNFREEZE = 'UNFREEZE',
  ESCROW_CREATE = 'ESCROW_CREATE',
  ESCROW_RELEASE = 'ESCROW_RELEASE',
  ESCROW_REFUND = 'ESCROW_REFUND',
}

/**
 * Built-in transaction types
 */
export enum TransactionType {
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

/**
 * Built-in roles
 */
export enum RobotRole {
  CONSUMER = 'consumer',
  PROVIDER = 'provider',
  ADMIN = 'admin',
  AUDITOR = 'auditor',
  OPERATOR = 'operator',
}

/**
 * Options for creating robot account
 */
export interface CreateRobotAccountOptions {
  id?: string;
  name?: string;
  apiKey?: string;
  ownerId?: string;
  metadata?: Record<string, unknown>;
  initialBalance?: number;
  roles?: string[];
  limits?: AccountLimits;
  tags?: string[];
}

/**
 * Options for updating robot account
 */
export interface UpdateRobotAccountOptions {
  name?: string;
  metadata?: Record<string, unknown>;
  roles?: string[];
  limits?: AccountLimits;
  tags?: string[];
}

/**
 * Options for credit/debit operations
 */
export interface BalanceOperationOptions {
  reason?: string;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
}

/**
 * Transfer options
 */
export interface TransferOptions {
  from: string;
  to: string;
  amount: number;
  type: TransactionType | string;
  fee?: number;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
  idempotencyKey?: string;
}

/**
 * Escrow options
 */
export interface CreateEscrowOptions {
  from: string;
  to: string;
  amount: number;
  condition?: string;
  expiresAt?: Date;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
}

/**
 * Batch transfer options
 */
export interface BatchTransferOptions {
  transfers: BatchTransferItem[];
  stopOnError?: boolean;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
}

/**
 * Transaction filter
 */
export interface TransactionFilter {
  robotId?: string;
  type?: string;
  status?: TransactionStatus;
  fromDate?: Date;
  toDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

/**
 * Account filter
 */
export interface AccountFilter {
  status?: AccountStatus;
  role?: string;
  tag?: string;
  minBalance?: number;
  maxBalance?: number;
  limit?: number;
  offset?: number;
}

/**
 * Statistics
 */
export interface Statistics {
  totalAccounts: number;
  activeAccounts: number;
  totalTransactions: number;
  totalVolume: number;
  totalFees: number;
  averageTransactionAmount: number;
  transactionsByType: Record<string, number>;
  periodStart?: Date;
  periodEnd?: Date;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

/**
 * Authorization context for transfer
 */
export interface TransferContext {
  from: RobotAccount;
  to: RobotAccount;
  amount: number;
  type: string;
  initiator?: RobotAccount;
}

/**
 * Authorization context for role changes
 */
export interface ChangeRolesContext {
  target: RobotAccount;
  newRoles: string[];
  initiator?: RobotAccount;
}

/**
 * Authorization context for credit
 */
export interface CreditContext {
  target: RobotAccount;
  amount: number;
  initiator?: RobotAccount;
}

/**
 * Authorization context for debit
 */
export interface DebitContext {
  target: RobotAccount;
  amount: number;
  initiator?: RobotAccount;
}

/**
 * Auth policy configuration
 */
export interface AuthPolicy {
  canTransfer?: (ctx: TransferContext) => boolean | Promise<boolean>;
  canChangeRoles?: (ctx: ChangeRolesContext) => boolean | Promise<boolean>;
  canCredit?: (ctx: CreditContext) => boolean | Promise<boolean>;
  canDebit?: (ctx: DebitContext) => boolean | Promise<boolean>;
}

/**
 * Fee calculator
 */
export interface FeeCalculator {
  calculate(amount: number, type: string, from: RobotAccount, to: RobotAccount): number | Promise<number>;
}

/**
 * Middleware context
 */
export interface MiddlewareContext {
  action: string;
  params: Record<string, unknown>;
  actor?: RobotAccount;
  timestamp: Date;
}

/**
 * Middleware function
 */
export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Event types
 */
export enum EventType {
  ACCOUNT_CREATED = 'account.created',
  ACCOUNT_UPDATED = 'account.updated',
  ACCOUNT_DELETED = 'account.deleted',
  ACCOUNT_FROZEN = 'account.frozen',
  ACCOUNT_UNFROZEN = 'account.unfrozen',
  BALANCE_CREDITED = 'balance.credited',
  BALANCE_DEBITED = 'balance.debited',
  TRANSFER_INITIATED = 'transfer.initiated',
  TRANSFER_COMPLETED = 'transfer.completed',
  TRANSFER_FAILED = 'transfer.failed',
  ESCROW_CREATED = 'escrow.created',
  ESCROW_RELEASED = 'escrow.released',
  ESCROW_REFUNDED = 'escrow.refunded',
  ESCROW_EXPIRED = 'escrow.expired',
  BATCH_STARTED = 'batch.started',
  BATCH_COMPLETED = 'batch.completed',
}

/**
 * Event payload
 */
export interface RoboxEvent<T = unknown> {
  type: EventType;
  data: T;
  timestamp: Date;
  actorId?: string;
}

/**
 * Event handler
 */
export type EventHandler<T = unknown> = (event: RoboxEvent<T>) => void | Promise<void>;

/**
 * RoboxLayer configuration options
 */
export interface RoboxLayerOptions {
  storage: StorageAdapter;
  auth?: AuthPolicy;
  logger?: Logger;
  feeCalculator?: FeeCalculator;
  defaultLimits?: AccountLimits;
  enableAuditLog?: boolean;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  // Accounts
  createAccount(account: RobotAccount): Promise<RobotAccount>;
  getAccount(id: string): Promise<RobotAccount | null>;
  getAccountByApiKey(apiKey: string): Promise<RobotAccount | null>;
  getAccountsByOwner(ownerId: string): Promise<RobotAccount[]>;
  updateAccount(id: string, updates: Partial<RobotAccount>): Promise<RobotAccount | null>;
  deleteAccount(id: string): Promise<boolean>;
  listAccounts(filter?: AccountFilter): Promise<RobotAccount[]>;
  countAccounts(filter?: AccountFilter): Promise<number>;
  
  // Transactions
  createTransaction(transaction: Transaction): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | null>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | null>;
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>;
  countTransactions(filter?: TransactionFilter): Promise<number>;
  
  // Balance operations
  createBalanceOperation(operation: BalanceOperation): Promise<BalanceOperation>;
  
  // Atomic balance update
  updateBalance(id: string, delta: number): Promise<number>;
  freezeBalance(id: string, amount: number): Promise<void>;
  unfreezeBalance(id: string, amount: number): Promise<void>;
  
  // Escrow
  createEscrow(escrow: Escrow): Promise<Escrow>;
  getEscrow(id: string): Promise<Escrow | null>;
  updateEscrow(id: string, updates: Partial<Escrow>): Promise<Escrow | null>;
  listEscrows(filter?: { robotId?: string; status?: EscrowStatus }): Promise<Escrow[]>;
  
  // Batch
  createBatchTransfer(batch: BatchTransfer): Promise<BatchTransfer>;
  getBatchTransfer(id: string): Promise<BatchTransfer | null>;
  updateBatchTransfer(id: string, updates: Partial<BatchTransfer>): Promise<BatchTransfer | null>;
  
  // Audit
  createAuditLog(entry: AuditLogEntry): Promise<AuditLogEntry>;
  listAuditLogs(filter?: { entityId?: string; action?: AuditAction; limit?: number }): Promise<AuditLogEntry[]>;
  
  // Idempotency
  getByIdempotencyKey(key: string): Promise<Transaction | null>;
  
  // Stats
  getStatistics(fromDate?: Date, toDate?: Date): Promise<Statistics>;
}
