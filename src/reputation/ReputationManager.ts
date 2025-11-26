import { generateId } from '../utils';
import type { Logger } from '../types';
import {
  RobotReputation,
  ReputationLevel,
  RobotRating,
  ReputationEventType,
  ReputationEvent,
  CreateRatingOptions,
  ReputationFilter,
} from './types';

/**
 * Score weights for different events
 */
const SCORE_WEIGHTS = {
  [ReputationEventType.TRANSACTION_SUCCESS]: 1,
  [ReputationEventType.TRANSACTION_FAILED]: -5,
  [ReputationEventType.ESCROW_COMPLETED]: 3,
  [ReputationEventType.ESCROW_DISPUTED]: -10,
  [ReputationEventType.RATING_RECEIVED]: 0, // Calculated separately
  [ReputationEventType.PAYMENT_ON_TIME]: 2,
  [ReputationEventType.PAYMENT_LATE]: -3,
};

/**
 * ReputationManager - tracks robot reputation and ratings
 */
export class ReputationManager {
  private reputations: Map<string, RobotReputation> = new Map();
  private ratings: Map<string, RobotRating> = new Map();
  private events: ReputationEvent[] = [];
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  // ============================================
  // Reputation Management
  // ============================================

  /**
   * Get or create reputation for robot
   */
  getReputation(robotId: string): RobotReputation {
    let reputation = this.reputations.get(robotId);
    
    if (!reputation) {
      reputation = this.createReputation(robotId);
      this.reputations.set(robotId, reputation);
    }

    return { ...reputation };
  }

  /**
   * Create initial reputation
   */
  private createReputation(robotId: string): RobotReputation {
    return {
      robotId,
      score: 50, // Start at middle
      level: ReputationLevel.SILVER,
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      totalEscrows: 0,
      completedEscrows: 0,
      disputedEscrows: 0,
      totalRatings: 0,
      averageRating: 0,
      onTimePayments: 0,
      latePayments: 0,
      updatedAt: new Date(),
    };
  }

  /**
   * List reputations with filter
   */
  listReputations(filter?: ReputationFilter): RobotReputation[] {
    let results = Array.from(this.reputations.values());

    if (filter) {
      if (filter.minScore !== undefined) {
        results = results.filter(r => r.score >= filter.minScore!);
      }
      if (filter.maxScore !== undefined) {
        results = results.filter(r => r.score <= filter.maxScore!);
      }
      if (filter.level) {
        results = results.filter(r => r.level === filter.level);
      }
      if (filter.minTransactions !== undefined) {
        results = results.filter(r => r.totalTransactions >= filter.minTransactions!);
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 100;
      results = results.slice(offset, offset + limit);
    }

    return results.map(r => ({ ...r }));
  }

  /**
   * Get top robots by reputation
   */
  getLeaderboard(limit: number = 10): RobotReputation[] {
    return this.listReputations({ limit, minTransactions: 1 });
  }

  // ============================================
  // Event Recording
  // ============================================

  /**
   * Record a reputation event
   */
  recordEvent(robotId: string, type: ReputationEventType, reason?: string): ReputationEvent {
    const reputation = this.getOrCreateReputation(robotId);
    const previousScore = reputation.score;
    const scoreChange = SCORE_WEIGHTS[type];

    // Update score
    reputation.score = Math.max(0, Math.min(100, reputation.score + scoreChange));
    reputation.level = this.calculateLevel(reputation.score);
    reputation.updatedAt = new Date();

    // Update stats based on event type
    switch (type) {
      case ReputationEventType.TRANSACTION_SUCCESS:
        reputation.totalTransactions++;
        reputation.successfulTransactions++;
        if (!reputation.firstTransactionAt) {
          reputation.firstTransactionAt = new Date();
        }
        reputation.lastTransactionAt = new Date();
        break;

      case ReputationEventType.TRANSACTION_FAILED:
        reputation.totalTransactions++;
        reputation.failedTransactions++;
        break;

      case ReputationEventType.ESCROW_COMPLETED:
        reputation.totalEscrows++;
        reputation.completedEscrows++;
        break;

      case ReputationEventType.ESCROW_DISPUTED:
        reputation.totalEscrows++;
        reputation.disputedEscrows++;
        break;

      case ReputationEventType.PAYMENT_ON_TIME:
        reputation.onTimePayments++;
        break;

      case ReputationEventType.PAYMENT_LATE:
        reputation.latePayments++;
        break;
    }

    // Create event record
    const event: ReputationEvent = {
      robotId,
      type,
      scoreChange,
      previousScore,
      newScore: reputation.score,
      reason,
      timestamp: new Date(),
    };

    this.events.push(event);

    this.logger?.info('Reputation event recorded', {
      robotId,
      type,
      scoreChange,
      newScore: reputation.score,
    });

    return event;
  }

  /**
   * Record successful transaction
   */
  recordTransactionSuccess(robotId: string): ReputationEvent {
    return this.recordEvent(robotId, ReputationEventType.TRANSACTION_SUCCESS);
  }

  /**
   * Record failed transaction
   */
  recordTransactionFailure(robotId: string, reason?: string): ReputationEvent {
    return this.recordEvent(robotId, ReputationEventType.TRANSACTION_FAILED, reason);
  }

  /**
   * Record completed escrow
   */
  recordEscrowCompleted(robotId: string): ReputationEvent {
    return this.recordEvent(robotId, ReputationEventType.ESCROW_COMPLETED);
  }

  /**
   * Record disputed escrow
   */
  recordEscrowDisputed(robotId: string, reason?: string): ReputationEvent {
    return this.recordEvent(robotId, ReputationEventType.ESCROW_DISPUTED, reason);
  }

  // ============================================
  // Ratings
  // ============================================

  /**
   * Add a rating from one robot to another
   */
  addRating(options: CreateRatingOptions): RobotRating {
    if (options.rating < 1 || options.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    if (options.fromRobotId === options.toRobotId) {
      throw new Error('Cannot rate yourself');
    }

    const rating: RobotRating = {
      id: generateId(),
      fromRobotId: options.fromRobotId,
      toRobotId: options.toRobotId,
      rating: options.rating,
      transactionId: options.transactionId,
      escrowId: options.escrowId,
      comment: options.comment,
      createdAt: new Date(),
    };

    this.ratings.set(rating.id, rating);

    // Update target robot's reputation
    const reputation = this.getOrCreateReputation(options.toRobotId);
    const totalRatingPoints = reputation.averageRating * reputation.totalRatings + options.rating;
    reputation.totalRatings++;
    reputation.averageRating = totalRatingPoints / reputation.totalRatings;

    // Adjust score based on rating
    const ratingScoreChange = (options.rating - 3) * 2; // 1=-4, 2=-2, 3=0, 4=+2, 5=+4
    reputation.score = Math.max(0, Math.min(100, reputation.score + ratingScoreChange));
    reputation.level = this.calculateLevel(reputation.score);
    reputation.updatedAt = new Date();

    // Record event
    this.events.push({
      robotId: options.toRobotId,
      type: ReputationEventType.RATING_RECEIVED,
      scoreChange: ratingScoreChange,
      previousScore: reputation.score - ratingScoreChange,
      newScore: reputation.score,
      reason: `Rated ${options.rating}/5 by ${options.fromRobotId}`,
      timestamp: new Date(),
    });

    this.logger?.info('Rating added', {
      from: options.fromRobotId,
      to: options.toRobotId,
      rating: options.rating,
    });

    return { ...rating };
  }

  /**
   * Get ratings for a robot
   */
  getRatings(robotId: string): RobotRating[] {
    return Array.from(this.ratings.values())
      .filter(r => r.toRobotId === robotId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(r => ({ ...r }));
  }

  /**
   * Get ratings given by a robot
   */
  getRatingsGiven(robotId: string): RobotRating[] {
    return Array.from(this.ratings.values())
      .filter(r => r.fromRobotId === robotId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(r => ({ ...r }));
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Get or create reputation
   */
  private getOrCreateReputation(robotId: string): RobotReputation {
    let reputation = this.reputations.get(robotId);
    if (!reputation) {
      reputation = this.createReputation(robotId);
      this.reputations.set(robotId, reputation);
    }
    return reputation;
  }

  /**
   * Calculate level from score
   */
  private calculateLevel(score: number): ReputationLevel {
    if (score >= 91) return ReputationLevel.DIAMOND;
    if (score >= 76) return ReputationLevel.PLATINUM;
    if (score >= 51) return ReputationLevel.GOLD;
    if (score >= 26) return ReputationLevel.SILVER;
    if (score > 0) return ReputationLevel.BRONZE;
    return ReputationLevel.UNKNOWN;
  }

  /**
   * Check if robot is trusted (for conditional logic)
   */
  isTrusted(robotId: string, minScore: number = 50): boolean {
    const reputation = this.reputations.get(robotId);
    return reputation ? reputation.score >= minScore : false;
  }

  /**
   * Get reputation events for robot
   */
  getEvents(robotId: string, limit: number = 50): ReputationEvent[] {
    return this.events
      .filter(e => e.robotId === robotId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRobots: number;
    totalRatings: number;
    averageScore: number;
    byLevel: Record<ReputationLevel, number>;
  } {
    const reputations = Array.from(this.reputations.values());
    
    const byLevel: Record<ReputationLevel, number> = {
      [ReputationLevel.UNKNOWN]: 0,
      [ReputationLevel.BRONZE]: 0,
      [ReputationLevel.SILVER]: 0,
      [ReputationLevel.GOLD]: 0,
      [ReputationLevel.PLATINUM]: 0,
      [ReputationLevel.DIAMOND]: 0,
    };

    for (const rep of reputations) {
      byLevel[rep.level]++;
    }

    return {
      totalRobots: reputations.length,
      totalRatings: this.ratings.size,
      averageScore: reputations.length > 0
        ? reputations.reduce((sum, r) => sum + r.score, 0) / reputations.length
        : 0,
      byLevel,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.reputations.clear();
    this.ratings.clear();
    this.events = [];
  }
}
