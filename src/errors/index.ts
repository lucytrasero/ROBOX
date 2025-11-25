/**
 * Base error class for Robox library
 */
export class RoboxError extends Error {
  public readonly code: number;
  public readonly details?: unknown;

  constructor(message: string, code: number = 500, details?: unknown) {
    super(message);
    this.name = 'RoboxError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Forbidden error (403)
 * Thrown when an operation is not authorized
 */
export class RoboxForbiddenError extends RoboxError {
  public readonly reason: string;

  constructor(reason: string, details?: unknown) {
    super(`Forbidden: ${reason}`, 403, details);
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
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 404, { resource, id });
    this.name = 'RoboxNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validation error (400)
 * Thrown when input validation fails
 */
export class RoboxValidationError extends RoboxError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 400, { field });
    this.name = 'RoboxValidationError';
    this.field = field;
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

  constructor(required: number, available: number) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      402,
      { required, available }
    );
    this.name = 'RoboxInsufficientFundsError';
    this.required = required;
    this.available = available;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
