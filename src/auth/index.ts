import type {
  AuthPolicy,
  TransferContext,
  ChangeRolesContext,
  CreditContext,
  DebitContext,
  RobotAccount,
  AccountLimits,
} from '../types';
import { RobotRole, AccountStatus } from '../types';

/**
 * Default authorization policy
 */
export class DefaultAuthPolicy implements Required<AuthPolicy> {
  /**
   * Check if transfer is allowed
   */
  async canTransfer(ctx: TransferContext): Promise<boolean> {
    const { from, to, initiator } = ctx;

    // Check account status
    if (from.status !== AccountStatus.ACTIVE || to.status !== AccountStatus.ACTIVE) {
      return false;
    }

    const actualInitiator = initiator ?? from;

    // Admin can initiate any transfer
    if (actualInitiator.roles.includes(RobotRole.ADMIN)) {
      return true;
    }

    // Operator can initiate transfers
    if (actualInitiator.roles.includes(RobotRole.OPERATOR)) {
      return true;
    }

    // Initiator must be the sender
    if (actualInitiator.id !== from.id) {
      return false;
    }

    // Sender must be consumer
    if (!from.roles.includes(RobotRole.CONSUMER)) {
      return false;
    }

    // Receiver must be provider
    if (!to.roles.includes(RobotRole.PROVIDER)) {
      return false;
    }

    return true;
  }

  /**
   * Check if role change is allowed
   */
  async canChangeRoles(ctx: ChangeRolesContext): Promise<boolean> {
    const { initiator } = ctx;

    if (!initiator) {
      return false;
    }

    return initiator.roles.includes(RobotRole.ADMIN);
  }

  /**
   * Check if credit operation is allowed
   */
  async canCredit(ctx: CreditContext): Promise<boolean> {
    const { target, initiator } = ctx;

    // Check account status
    if (target.status === AccountStatus.CLOSED) {
      return false;
    }

    // Self-credit is allowed
    if (initiator && initiator.id === target.id) {
      return true;
    }

    // Admin can credit any account
    if (initiator?.roles.includes(RobotRole.ADMIN)) {
      return true;
    }

    // Operator can credit
    if (initiator?.roles.includes(RobotRole.OPERATOR)) {
      return true;
    }

    return false;
  }

  /**
   * Check if debit operation is allowed
   */
  async canDebit(ctx: DebitContext): Promise<boolean> {
    const { target, initiator } = ctx;

    // Check account status
    if (target.status !== AccountStatus.ACTIVE) {
      return false;
    }

    if (!initiator) {
      return false;
    }

    // Only admin can debit
    return initiator.roles.includes(RobotRole.ADMIN);
  }
}

/**
 * Create merged auth policy with custom overrides
 */
export function createAuthPolicy(custom?: AuthPolicy): Required<AuthPolicy> {
  const defaultPolicy = new DefaultAuthPolicy();

  return {
    canTransfer: custom?.canTransfer ?? defaultPolicy.canTransfer.bind(defaultPolicy),
    canChangeRoles: custom?.canChangeRoles ?? defaultPolicy.canChangeRoles.bind(defaultPolicy),
    canCredit: custom?.canCredit ?? defaultPolicy.canCredit.bind(defaultPolicy),
    canDebit: custom?.canDebit ?? defaultPolicy.canDebit.bind(defaultPolicy),
  };
}

/**
 * Check if account has any of the specified roles
 */
export function hasRole(account: RobotAccount, ...roles: string[]): boolean {
  return roles.some(role => account.roles.includes(role));
}

/**
 * Check if account has all of the specified roles
 */
export function hasAllRoles(account: RobotAccount, ...roles: string[]): boolean {
  return roles.every(role => account.roles.includes(role));
}

/**
 * Check account limits
 */
export function checkLimits(
  account: RobotAccount,
  amount: number,
  limits?: AccountLimits
): { allowed: boolean; reason?: string } {
  const accountLimits = account.limits ?? limits;

  if (!accountLimits) {
    return { allowed: true };
  }

  if (accountLimits.maxTransferAmount && amount > accountLimits.maxTransferAmount) {
    return {
      allowed: false,
      reason: `Amount ${amount} exceeds max transfer limit ${accountLimits.maxTransferAmount}`,
    };
  }

  if (accountLimits.minBalance !== undefined) {
    const balanceAfter = account.balance - amount;
    if (balanceAfter < accountLimits.minBalance) {
      return {
        allowed: false,
        reason: `Balance after transfer (${balanceAfter}) would be below minimum (${accountLimits.minBalance})`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Permission constants
 */
export const Permissions = {
  TRANSFER: 'transfer',
  CREDIT: 'credit',
  DEBIT: 'debit',
  FREEZE: 'freeze',
  UNFREEZE: 'unfreeze',
  CREATE_ACCOUNT: 'create_account',
  DELETE_ACCOUNT: 'delete_account',
  CHANGE_ROLES: 'change_roles',
  VIEW_AUDIT: 'view_audit',
  CREATE_ESCROW: 'create_escrow',
  RELEASE_ESCROW: 'release_escrow',
  BATCH_TRANSFER: 'batch_transfer',
} as const;

/**
 * Role permissions mapping
 */
export const RolePermissions: Record<string, string[]> = {
  [RobotRole.CONSUMER]: [
    Permissions.TRANSFER,
    Permissions.CREATE_ESCROW,
  ],
  [RobotRole.PROVIDER]: [],
  [RobotRole.OPERATOR]: [
    Permissions.TRANSFER,
    Permissions.CREDIT,
    Permissions.CREATE_ESCROW,
    Permissions.RELEASE_ESCROW,
    Permissions.BATCH_TRANSFER,
  ],
  [RobotRole.AUDITOR]: [
    Permissions.VIEW_AUDIT,
  ],
  [RobotRole.ADMIN]: Object.values(Permissions),
};

/**
 * Check if account has permission
 */
export function hasPermission(account: RobotAccount, permission: string): boolean {
  for (const role of account.roles) {
    const permissions = RolePermissions[role] || [];
    if (permissions.includes(permission)) {
      return true;
    }
  }
  return false;
}
