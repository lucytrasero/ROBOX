// Main class
export { RoboxLayer } from './RoboxLayer';

// Storage adapters
export { InMemoryStorage } from './storage';

// Events
export { EventEmitter, createEvent } from './events';

// Auth
export {
  DefaultAuthPolicy,
  createAuthPolicy,
  hasRole,
  hasAllRoles,
  hasPermission,
  checkLimits,
  Permissions,
  RolePermissions,
} from './auth';

// Middleware
export {
  compose,
  loggingMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  timingMiddleware,
  errorMiddleware,
  conditionalMiddleware,
} from './middleware';

// Utils
export {
  generateId,
  validateAmount,
  validateId,
  deepClone,
  formatAmount,
  calculatePercentage,
  isExpired,
  retry,
  sleep,
  createRateLimiter,
  maskId,
  simpleHash,
} from './utils';

// Types
export type {
  RobotAccount,
  Transaction,
  BalanceOperation,
  Escrow,
  BatchTransfer,
  BatchTransferItem,
  AuditLogEntry,
  Statistics,
  AccountLimits,
  CreateRobotAccountOptions,
  UpdateRobotAccountOptions,
  BalanceOperationOptions,
  TransferOptions,
  CreateEscrowOptions,
  BatchTransferOptions,
  TransactionFilter,
  AccountFilter,
  Logger,
  StorageAdapter,
  AuthPolicy,
  FeeCalculator,
  RoboxLayerOptions,
  TransferContext,
  ChangeRolesContext,
  CreditContext,
  DebitContext,
  Middleware,
  MiddlewareContext,
  RoboxEvent,
  EventHandler,
} from './types';

// Enums
export {
  TransactionType,
  TransactionStatus,
  RobotRole,
  AccountStatus,
  EscrowStatus,
  BatchStatus,
  AuditAction,
  EventType,
} from './types';

// Errors
export {
  RoboxError,
  RoboxForbiddenError,
  RoboxNotFoundError,
  RoboxValidationError,
  RoboxInsufficientFundsError,
  RoboxConflictError,
  RoboxAccountFrozenError,
  RoboxLimitExceededError,
  RoboxEscrowError,
  RoboxIdempotencyError,
} from './errors';

// Webhooks
export { WebhookManager, WebhookDeliveryStatus } from './webhooks';

export type {
  WebhookConfig,
  WebhookDelivery,
  WebhookPayload,
  CreateWebhookOptions,
  UpdateWebhookOptions,
  WebhookDeliveryFilter,
} from './webhooks';