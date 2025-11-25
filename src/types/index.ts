/**
 * Robot account representation
 */
export interface RobotAccount {
  id: string;
  name?: string;
  balance: number;
  roles: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transaction between robots
 */
export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  type: TransactionType | string;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
  createdAt: Date;
}

/**
 * Balance operation (credit/debit)
 */
export interface BalanceOperation {
  id: string;
  robotId: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  reason?: string;
  meta?: Record<string, unknown>;
  initiatedBy?: string;
  createdAt: Date;
}

/**
 * Built-in transaction types
 */
export enum TransactionType {
  TASK_PAYMENT = 'TASK_PAYMENT',
  ENERGY_PAYMENT = 'ENERGY_PAYMENT',
  PARTS_PAYMENT = 'PARTS_PAYMENT',
}

/**
 * Built-in roles
 */
export enum RobotRole {
  CONSUMER = 'consumer',
  PROVIDER = 'provider',
  ADMIN = 'admin',
}

/**
 * Options for creating robot account
 */
export interface CreateRobotAccountOptions {
  id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  initialBalance?: number;
  roles?: string[];
}

/**
 * Options for updating robot account
 */
export interface UpdateRobotAccountOptions {
  name?: string;
  metadata?: Record<string, unknown>;
  roles?: string[];
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
  meta?: Record<string, unknown>;
  initiatedBy?: string;
}

/**
 * Transaction filter
 */
export interface TransactionFilter {
  robotId?: string;
  type?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Logger interface
 */
export interface Logger {
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
 * RoboxLayer configuration options
 */
export interface RoboxLayerOptions {
  storage: StorageAdapter;
  auth?: AuthPolicy;
  logger?: Logger;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  // Accounts
  createAccount(account: RobotAccount): Promise<RobotAccount>;
  getAccount(id: string): Promise<RobotAccount | null>;
  updateAccount(id: string, updates: Partial<RobotAccount>): Promise<RobotAccount | null>;
  deleteAccount(id: string): Promise<boolean>;
  
  // Transactions
  createTransaction(transaction: Transaction): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | null>;
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>;
  
  // Balance operations
  createBalanceOperation(operation: BalanceOperation): Promise<BalanceOperation>;
  
  // Atomic balance update
  updateBalance(id: string, delta: number): Promise<number>;
}
