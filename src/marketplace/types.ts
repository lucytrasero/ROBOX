/**
 * Marketplace Module Types
 */

/**
 * Service listing status
 */
export enum ServiceStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SOLD_OUT = 'SOLD_OUT',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 * Service category
 */
export enum ServiceCategory {
  ENERGY = 'ENERGY',
  COMPUTE = 'COMPUTE',
  STORAGE = 'STORAGE',
  BANDWIDTH = 'BANDWIDTH',
  DATA = 'DATA',
  MAINTENANCE = 'MAINTENANCE',
  LOGISTICS = 'LOGISTICS',
  CUSTOM = 'CUSTOM',
}

/**
 * Order status
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
}

/**
 * Service availability configuration
 */
export interface ServiceAvailability {
  /** Total available slots/units */
  totalSlots?: number;
  /** Currently available slots */
  availableSlots?: number;
  /** Schedule (e.g., '24/7', 'weekdays', 'custom') */
  schedule?: string;
  /** Specific time slots if schedule is custom */
  timeSlots?: TimeSlot[];
  /** Location constraints */
  location?: {
    lat?: number;
    lng?: number;
    radius?: number; // in meters
    zones?: string[];
  };
}

/**
 * Time slot for availability
 */
export interface TimeSlot {
  dayOfWeek: number; // 0-6, Sunday = 0
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}

/**
 * Service listing
 */
export interface ServiceListing {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category: ServiceCategory | string;
  subcategory?: string;
  status: ServiceStatus;
  availability?: ServiceAvailability;
  duration?: number; // in minutes
  tags?: string[];
  images?: string[];
  rating?: number;
  totalOrders?: number;
  totalReviews?: number;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

/**
 * Service order
 */
export interface ServiceOrder {
  id: string;
  serviceId: string;
  buyerId: string;
  providerId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  fee?: number;
  status: OrderStatus;
  escrowId?: string;
  transactionId?: string;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  notes?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service review
 */
export interface ServiceReview {
  id: string;
  orderId: string;
  serviceId: string;
  reviewerId: string;
  providerId: string;
  rating: number; // 1-5
  comment?: string;
  helpful?: number; // upvotes
  response?: {
    comment: string;
    respondedAt: Date;
  };
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for listing a service
 */
export interface ListServiceOptions {
  providerId: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category: ServiceCategory | string;
  subcategory?: string;
  availability?: ServiceAvailability;
  duration?: number;
  tags?: string[];
  images?: string[];
  meta?: Record<string, unknown>;
  expiresAt?: Date;
}

/**
 * Options for updating a service listing
 */
export interface UpdateServiceOptions {
  name?: string;
  description?: string;
  price?: number;
  category?: ServiceCategory | string;
  subcategory?: string;
  availability?: ServiceAvailability;
  duration?: number;
  tags?: string[];
  images?: string[];
  status?: ServiceStatus;
  meta?: Record<string, unknown>;
  expiresAt?: Date;
}

/**
 * Service search options
 */
export interface ServiceSearchOptions {
  query?: string;
  category?: ServiceCategory | string;
  subcategory?: string;
  providerId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  tags?: string[];
  status?: ServiceStatus;
  location?: {
    lat: number;
    lng: number;
    radius: number; // in meters
  };
  sortBy?: 'price' | 'rating' | 'orders' | 'created' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Purchase options
 */
export interface PurchaseOptions {
  serviceId: string;
  buyerId: string;
  quantity?: number;
  scheduledAt?: Date;
  notes?: string;
  meta?: Record<string, unknown>;
  /** Use escrow for payment (default: true) */
  useEscrow?: boolean;
}

/**
 * Review options
 */
export interface CreateReviewOptions {
  orderId: string;
  reviewerId: string;
  rating: number;
  comment?: string;
  meta?: Record<string, unknown>;
}

/**
 * Order filter options
 */
export interface OrderFilterOptions {
  buyerId?: string;
  providerId?: string;
  serviceId?: string;
  status?: OrderStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Review filter options
 */
export interface ReviewFilterOptions {
  serviceId?: string;
  providerId?: string;
  reviewerId?: string;
  minRating?: number;
  maxRating?: number;
  limit?: number;
  offset?: number;
}

/**
 * Marketplace statistics
 */
export interface MarketplaceStats {
  totalServices: number;
  activeServices: number;
  totalOrders: number;
  completedOrders: number;
  totalVolume: number;
  totalFees: number;
  averageRating: number;
  totalReviews: number;
  topCategories: Array<{ category: string; count: number }>;
  periodStart?: Date;
  periodEnd?: Date;
}

/**
 * Search result with relevance score
 */
export interface ServiceSearchResult extends ServiceListing {
  relevanceScore?: number;
  distance?: number; // in meters, if location search
}

/**
 * Marketplace event types
 */
export enum MarketplaceEventType {
  SERVICE_LISTED = 'marketplace.service.listed',
  SERVICE_UPDATED = 'marketplace.service.updated',
  SERVICE_PAUSED = 'marketplace.service.paused',
  SERVICE_CANCELLED = 'marketplace.service.cancelled',
  ORDER_CREATED = 'marketplace.order.created',
  ORDER_PAID = 'marketplace.order.paid',
  ORDER_STARTED = 'marketplace.order.started',
  ORDER_COMPLETED = 'marketplace.order.completed',
  ORDER_CANCELLED = 'marketplace.order.cancelled',
  ORDER_REFUNDED = 'marketplace.order.refunded',
  ORDER_DISPUTED = 'marketplace.order.disputed',
  REVIEW_CREATED = 'marketplace.review.created',
  REVIEW_RESPONDED = 'marketplace.review.responded',
}

/**
 * Marketplace configuration
 */
export interface MarketplaceConfig {
  /** Default fee percentage (0-100) */
  feePercentage?: number;
  /** Minimum order amount */
  minOrderAmount?: number;
  /** Maximum order amount */
  maxOrderAmount?: number;
  /** Auto-complete orders after duration (ms) */
  autoCompleteAfter?: number;
  /** Allow reviews only after completion */
  reviewAfterCompletion?: boolean;
  /** Escrow expiration for orders (ms) */
  escrowExpiration?: number;
}
