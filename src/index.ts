// Main class
export { RoboxLayer } from './RoboxLayer';

// Storage adapters
export { InMemoryStorage } from './storage';

// Types
export type {
  RobotAccount,
  Transaction,
  BalanceOperation,
  CreateRobotAccountOptions,
  UpdateRobotAccountOptions,
  BalanceOperationOptions,
  TransferOptions,
  TransactionFilter,
  Logger,
  StorageAdapter,
  AuthPolicy,
  RoboxLayerOptions,
  TransferContext,
  ChangeRolesContext,
  CreditContext,
  DebitContext,
} from './types';

export { TransactionType, RobotRole } from './types';

// Errors
export {
  RoboxError,
  RoboxForbiddenError,
  RoboxNotFoundError,
  RoboxValidationError,
  RoboxInsufficientFundsError,
} from './errors';

// Auth
export { DefaultAuthPolicy, createAuthPolicy } from './auth';
