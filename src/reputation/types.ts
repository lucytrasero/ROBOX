/**
 * Robot reputation record
 */
export interface RobotReputation {
  robotId: string;
  
  // Core metrics
  score: number;              // 0-100 overall score
  level: ReputationLevel;
  
  // Transaction stats
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  
  // Escrow stats
  totalEscrows: number;
  completedEscrows: number;
  disputedEscrows: number;
  
  // Ratings from other robots
  totalRatings: number;
  averageRating: number;      // 1-5 stars
  
  // Behavioral
  onTimePayments: number;
  latePayments: number;
  
  // Timestamps
  firstTransactionAt?: Date;
  lastTransactionAt?: Date;
  updatedAt: Date;
}

/**
 * Reputation levels
 */
export enum ReputationLevel {
  UNKNOWN = 'UNKNOWN',       // New robot, no history
  BRONZE = 'BRONZE',         // Score 0-25
  SILVER = 'SILVER',         // Score 26-50
  GOLD = 'GOLD',             // Score 51-75
  PLATINUM = 'PLATINUM',     // Score 76-90
  DIAMOND = 'DIAMOND',       // Score 91-100
}

/**
 * Rating from one robot to another
 */
export interface RobotRating {
  id: string;
  fromRobotId: string;
  toRobotId: string;
  transactionId?: string;
  escrowId?: string;
  rating: number;            // 1-5
  comment?: string;
  createdAt: Date;
}

/**
 * Reputation event types
 */
export enum ReputationEventType {
  TRANSACTION_SUCCESS = 'TRANSACTION_SUCCESS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  ESCROW_COMPLETED = 'ESCROW_COMPLETED',
  ESCROW_DISPUTED = 'ESCROW_DISPUTED',
  RATING_RECEIVED = 'RATING_RECEIVED',
  PAYMENT_ON_TIME = 'PAYMENT_ON_TIME',
  PAYMENT_LATE = 'PAYMENT_LATE',
}

/**
 * Reputation change event
 */
export interface ReputationEvent {
  robotId: string;
  type: ReputationEventType;
  scoreChange: number;
  previousScore: number;
  newScore: number;
  reason?: string;
  timestamp: Date;
}

/**
 * Rating options
 */
export interface CreateRatingOptions {
  fromRobotId: string;
  toRobotId: string;
  rating: number;            // 1-5
  transactionId?: string;
  escrowId?: string;
  comment?: string;
}

/**
 * Reputation filter
 */
export interface ReputationFilter {
  minScore?: number;
  maxScore?: number;
  level?: ReputationLevel;
  minTransactions?: number;
  limit?: number;
  offset?: number;
}
