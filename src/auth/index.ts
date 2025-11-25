import type {
  AuthPolicy,
  TransferContext,
  ChangeRolesContext,
  CreditContext,
  DebitContext,
} from '../types';
import { RobotRole } from '../types';

/**
 * Default authorization policy
 */
export class DefaultAuthPolicy implements Required<AuthPolicy> {
  /**
   * Check if transfer is allowed
   * - Initiator must be the sender (from) or an admin
   * - Sender must have 'consumer' role
   * - Receiver must have 'provider' role
   */
  async canTransfer(ctx: TransferContext): Promise<boolean> {
    const { from, to, initiator } = ctx;

    // If no initiator specified, assume self-initiated
    const actualInitiator = initiator ?? from;

    // Admin can initiate any transfer
    if (actualInitiator.roles.includes(RobotRole.ADMIN)) {
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
   * - Only admin can change roles
   */
  async canChangeRoles(ctx: ChangeRolesContext): Promise<boolean> {
    const { initiator } = ctx;

    // Must have an initiator
    if (!initiator) {
      return false;
    }

    // Only admin can change roles
    return initiator.roles.includes(RobotRole.ADMIN);
  }

  /**
   * Check if credit operation is allowed
   * - Only admin can credit accounts
   * - Or self-credit (own account)
   */
  async canCredit(ctx: CreditContext): Promise<boolean> {
    const { target, initiator } = ctx;

    // Self-credit is allowed
    if (initiator && initiator.id === target.id) {
      return true;
    }

    // Admin can credit any account
    if (initiator?.roles.includes(RobotRole.ADMIN)) {
      return true;
    }

    return false;
  }

  /**
   * Check if debit operation is allowed
   * - Only admin can debit accounts
   */
  async canDebit(ctx: DebitContext): Promise<boolean> {
    const { initiator } = ctx;

    // Must have an initiator
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
