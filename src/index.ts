// Main class
export { RoboxLayer } from './RoboxLayer';

// Storage adapters
export { InMemoryStorage, PostgresStorage } from './storage';

export type {
  PostgresConfig,
  PostgresSSLConfig,
  DatabaseClient,
  PoolClient,
  TransactionCallback,
} from './storage';

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

// Scheduler
export { Scheduler, ScheduleType, ScheduledPaymentStatus } from './scheduler';

export type {
  SchedulerConfig,
  TransferExecutor,
  ScheduledPayment,
  ScheduleConfig,
  CreateScheduledPaymentOptions,
  UpdateScheduledPaymentOptions,
  ScheduledPaymentFilter,
  ExecutionResult,
} from './scheduler';

// Reputation
export { ReputationManager, ReputationLevel, ReputationEventType } from './reputation';

export type {
  RobotReputation,
  RobotRating,
  ReputationEvent,
  CreateRatingOptions,
  ReputationFilter,
} from './reputation';

// Discovery
export { DiscoveryManager, ServiceType } from './discovery';

export type {
  RobotLocation,
  RobotService,
  ServiceSearchResult as DiscoverySearchResult,
  ServiceSearchOptions as DiscoverySearchOptions,
  RegisterServiceOptions,
  UpdateLocationOptions,
} from './discovery';

// Subscriptions
export {
  SubscriptionManager,
  SubscriptionStatus,
  BillingPeriod,
} from './subscriptions';

export type {
  SubscriptionPlan,
  Subscription,
  CreatePlanOptions,
  SubscribeOptions,
  SubscriptionTransferExecutor,
} from './subscriptions';

// Marketplace (new in v1.1.0)
export {
  MarketplaceManager,
  ServiceStatus,
  ServiceCategory,
  OrderStatus,
  MarketplaceEventType,
} from './marketplace';

export type {
  ServiceListing,
  ServiceOrder,
  ServiceReview,
  ServiceAvailability,
  TimeSlot,
  ListServiceOptions,
  UpdateServiceOptions,
  ServiceSearchOptions,
  ServiceSearchResult,
  PurchaseOptions,
  CreateReviewOptions,
  OrderFilterOptions,
  ReviewFilterOptions,
  MarketplaceStats,
  MarketplaceConfig,
} from './marketplace';

// Analytics (new in v1.1.0)
export {
  AnalyticsManager,
  TimePeriod,
  ExportFormat,
  ReportType,
} from './analytics';

export type {
  StatsOptions,
  TimeSeriesPoint,
  AggregatedStats,
  AccountActivity,
  TopAccountResult,
  MoneyFlowNode,
  MoneyFlowOptions,
  ExportOptions,
  ReportOptions,
  Report,
  TrendAnalysis,
  AnalyticsConfig,
} from './analytics';

// Rate Limiting
export {
  RateLimiter,
  InMemoryRateLimitStorage,
  rateLimitMiddleware as createRateLimitMiddleware,
  perActionRateLimit,
  RateLimitExceededError,
  RateLimitPresets,
} from './ratelimit';

export type {
  RateLimitConfig,
  RateLimitContext,
  RateLimitResult,
  RateLimitStorage,
} from './ratelimit';

// HTTP API
export {
  createRoboxRouter,
  generateApiKey,
  isValidApiKey,
  hashApiKey,
  generateRobotId,
} from './api';

export type {
  RoboxRequest,
  RoboxRouterOptions,
  ApiResponse,
  RoboxMiddleware,
} from './api';