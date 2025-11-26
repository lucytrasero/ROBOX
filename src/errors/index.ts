/**
 * Base error class for Robox library
 */
export class RoboxError extends Error {
  public readonly code: number;
  public readonly errorCode: string;
  public readonly details?: unknown;
  public readonly timestamp: Date;

  constructor(message: string, code: number = 500, errorCode: string = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'RoboxError';
    this.code = code;
    this.errorCode = errorCode;
    this.details = details;
    this.timestamp = new Date();
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      errorCode: this.errorCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Forbidden error (403)
 * Thrown when an operation is not authorized
 */
export class RoboxForbiddenError extends RoboxError {
  public readonly reason: string;

  constructor(reason: string, details?: unknown) {
    super(`Forbidden: ${reason}`, 403, reason, details);
    this.name = 'RoboxForbiddenError';
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Not found error (404)
 * Thrown when a resource is not found
 */
export class RoboxNotFoundError extends RoboxError {
  public readonly resource: string;
  public readonly resourceId: string;

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 404, 'NOT_FOUND', { resource, id });
    this.name = 'RoboxNotFoundError';
    this.resource = resource;
    this.resourceId = id;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validation error (400)
 * Thrown when input validation fails
 */
export class RoboxValidationError extends RoboxError {
  public readonly field?: string;
  public readonly constraints?: string[];

  constructor(message: string, field?: string, constraints?: string[]) {
    super(message, 400, 'VALIDATION_ERROR', { field, constraints });
    this.name = 'RoboxValidationError';
    this.field = field;
    this.constraints = constraints;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Insufficient funds error (402)
 * Thrown when balance is too low for operation
 */
export class RoboxInsufficientFundsError extends RoboxError {
  public readonly required: number;
  public readonly available: number;
  public readonly shortfall: number;

  constructor(required: number, available: number) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      402,
      'INSUFFICIENT_FUNDS',
      { required, available, shortfall: required - available }
    );
    this.name = 'RoboxInsufficientFundsError';
    this.required = required;
    this.available = available;
    this.shortfall = required - available;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Conflict error (409)
 * Thrown when there's a conflict with current state
 */
export class RoboxConflictError extends RoboxError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'RoboxConflictError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Account frozen error (403)
 * Thrown when trying to operate on frozen account
 */
export class RoboxAccountFrozenError extends RoboxError {
  public readonly accountId: string;

  constructor(accountId: string) {
    super(`Account is frozen: ${accountId}`, 403, 'ACCOUNT_FROZEN', { accountId });
    this.name = 'RoboxAccountFrozenError';
    this.accountId = accountId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Limit exceeded error (429)
 * Thrown when account limits are exceeded
 */
export class RoboxLimitExceededError extends RoboxError {
  public readonly limitType: string;
  public readonly limit: number;
  public readonly attempted: number;

  constructor(limitType: string, limit: number, attempted: number) {
    super(
      `${limitType} limit exceeded: limit ${limit}, attempted ${attempted}`,
      429,
      'LIMIT_EXCEEDED',
      { limitType, limit, attempted }
    );
    this.name = 'RoboxLimitExceededError';
    this.limitType = limitType;
    this.limit = limit;
    this.attempted = attempted;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Escrow error (400)
 * Thrown for escrow-related issues
 */
export class RoboxEscrowError extends RoboxError {
  public readonly escrowId: string;

  constructor(message: string, escrowId: string, details?: unknown) {
    super(message, 400, 'ESCROW_ERROR', { escrowId, ...details as object });
    this.name = 'RoboxEscrowError';
    this.escrowId = escrowId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Idempotency error (409)
 * Thrown when duplicate idempotency key is detected
 */
export class RoboxIdempotencyError extends RoboxError {
  public readonly idempotencyKey: string;
  public readonly existingTransactionId: string;

  constructor(idempotencyKey: string, existingTransactionId: string) {
    super(
      `Duplicate request with idempotency key: ${idempotencyKey}`,
      409,
      'DUPLICATE_REQUEST',
      { idempotencyKey, existingTransactionId }
    );
    this.name = 'RoboxIdempotencyError';
    this.idempotencyKey = idempotencyKey;
    this.existingTransactionId = existingTransactionId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
