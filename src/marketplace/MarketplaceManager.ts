import type { RoboxLayer } from '../RoboxLayer';
import type { EventHandler } from '../types';
import { generateId, deepClone } from '../utils';
import { RoboxNotFoundError, RoboxValidationError } from '../errors';
import {
  ServiceStatus,
  ServiceCategory,
  OrderStatus,
  MarketplaceEventType,
  type ServiceListing,
  type ServiceOrder,
  type ServiceReview,
  type ListServiceOptions,
  type UpdateServiceOptions,
  type ServiceSearchOptions,
  type ServiceSearchResult,
  type PurchaseOptions,
  type CreateReviewOptions,
  type OrderFilterOptions,
  type ReviewFilterOptions,
  type MarketplaceStats,
  type MarketplaceConfig,
} from './types';

/**
 * Marketplace Manager
 *
 * Enables robots to publish and discover services,
 * with automatic escrow-based payments and reviews.
 *
 * @example
 * ```typescript
 * import { RoboxLayer, InMemoryStorage, MarketplaceManager } from 'robox-clearing';
 *
 * const robox = new RoboxLayer({ storage: new InMemoryStorage() });
 * const marketplace = new MarketplaceManager(robox);
 *
 * // List a service
 * const service = await marketplace.listService({
 *   providerId: 'charger-1',
 *   name: 'Fast Charging',
 *   price: 15,
 *   category: ServiceCategory.ENERGY,
 *   availability: { slots: 3, schedule: '24/7' },
 * });
 *
 * // Search services
 * const results = await marketplace.search({
 *   category: ServiceCategory.ENERGY,
 *   maxPrice: 20,
 * });
 *
 * // Purchase service
 * const order = await marketplace.purchase({
 *   serviceId: service.id,
 *   buyerId: 'vacuum-1',
 * });
 * ```
 */
export class MarketplaceManager {
  private robox: RoboxLayer;
  private config: Required<MarketplaceConfig>;

  private services: Map<string, ServiceListing> = new Map();
  private orders: Map<string, ServiceOrder> = new Map();
  private reviews: Map<string, ServiceReview> = new Map();

  private eventHandlers: Map<MarketplaceEventType, Set<EventHandler>> =
    new Map();

  constructor(robox: RoboxLayer, config?: MarketplaceConfig) {
    this.robox = robox;
    this.config = {
      feePercentage: config?.feePercentage ?? 2.5,
      minOrderAmount: config?.minOrderAmount ?? 0,
      maxOrderAmount: config?.maxOrderAmount ?? Infinity,
      autoCompleteAfter: config?.autoCompleteAfter ?? 0,
      reviewAfterCompletion: config?.reviewAfterCompletion ?? true,
      escrowExpiration:
        config?.escrowExpiration ?? 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  // ============================================
  // Service Listing
  // ============================================

  /**
   * List a new service in the marketplace
   */
  async listService(options: ListServiceOptions): Promise<ServiceListing> {
    // Validate provider exists
    const provider = await this.robox.getRobotAccount(options.providerId);
    if (!provider) {
      throw new RoboxNotFoundError('Account', options.providerId);
    }

    // Validate price
    if (options.price < 0) {
      throw new RoboxValidationError('Price must be non-negative', 'price');
    }

    const now = new Date();
    const service: ServiceListing = {
      id: generateId(),
      providerId: options.providerId,
      name: options.name,
      description: options.description,
      price: options.price,
      currency: options.currency || 'CREDITS',
      category: options.category,
      subcategory: options.subcategory,
      status: ServiceStatus.ACTIVE,
      availability: options.availability
        ? {
            ...options.availability,
            availableSlots: options.availability.totalSlots,
          }
        : undefined,
      duration: options.duration,
      tags: options.tags,
      images: options.images,
      rating: 0,
      totalOrders: 0,
      totalReviews: 0,
      meta: options.meta,
      createdAt: now,
      updatedAt: now,
      expiresAt: options.expiresAt,
    };

    this.services.set(service.id, service);
    await this.emit(MarketplaceEventType.SERVICE_LISTED, { service });

    return deepClone(service);
  }

  /**
   * Update an existing service listing
   */
  async updateService(
    serviceId: string,
    options: UpdateServiceOptions
  ): Promise<ServiceListing> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new RoboxNotFoundError('Service', serviceId);
    }

    const updated: ServiceListing = {
      ...service,
      ...options,
      id: service.id,
      providerId: service.providerId,
      createdAt: service.createdAt,
      updatedAt: new Date(),
    };

    this.services.set(serviceId, updated);
    await this.emit(MarketplaceEventType.SERVICE_UPDATED, { service: updated });

    return deepClone(updated);
  }

  /**
   * Get a service by ID
   */
  async getService(serviceId: string): Promise<ServiceListing | null> {
    const service = this.services.get(serviceId);
    return service ? deepClone(service) : null;
  }

  /**
   * Pause a service listing
   */
  async pauseService(serviceId: string): Promise<ServiceListing> {
    const service = await this.updateService(serviceId, {
      status: ServiceStatus.PAUSED,
    });
    await this.emit(MarketplaceEventType.SERVICE_PAUSED, { service });
    return service;
  }

  /**
   * Resume a paused service
   */
  async resumeService(serviceId: string): Promise<ServiceListing> {
    return this.updateService(serviceId, {
      status: ServiceStatus.ACTIVE,
    });
  }

  /**
   * Cancel/remove a service listing
   */
  async cancelService(serviceId: string): Promise<ServiceListing> {
    const service = await this.updateService(serviceId, {
      status: ServiceStatus.CANCELLED,
    });
    await this.emit(MarketplaceEventType.SERVICE_CANCELLED, { service });
    return service;
  }

  /**
   * List all services by a provider
   */
  async getProviderServices(providerId: string): Promise<ServiceListing[]> {
    const results: ServiceListing[] = [];
    for (const service of this.services.values()) {
      if (service.providerId === providerId) {
        results.push(deepClone(service));
      }
    }
    return results;
  }

  // ============================================
  // Search
  // ============================================

  /**
   * Search for services with filters
   */
  async search(options?: ServiceSearchOptions): Promise<ServiceSearchResult[]> {
    let results = Array.from(this.services.values());

    // Apply filters
    if (options) {
      // Status filter (default: only active)
      const statusFilter = options.status ?? ServiceStatus.ACTIVE;
      results = results.filter((s) => s.status === statusFilter);

      // Category filter
      if (options.category) {
        results = results.filter((s) => s.category === options.category);
      }

      // Subcategory filter
      if (options.subcategory) {
        results = results.filter((s) => s.subcategory === options.subcategory);
      }

      // Provider filter
      if (options.providerId) {
        results = results.filter((s) => s.providerId === options.providerId);
      }

      // Price range
      if (options.minPrice !== undefined) {
        results = results.filter((s) => s.price >= options.minPrice!);
      }
      if (options.maxPrice !== undefined) {
        results = results.filter((s) => s.price <= options.maxPrice!);
      }

      // Rating filter
      if (options.minRating !== undefined) {
        results = results.filter(
          (s) => (s.rating ?? 0) >= options.minRating!
        );
      }

      // Tags filter
      if (options.tags && options.tags.length > 0) {
        results = results.filter((s) =>
          options.tags!.some((tag) => s.tags?.includes(tag))
        );
      }

      // Query (search in name and description)
      if (options.query) {
        const query = options.query.toLowerCase();
        results = results.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.description?.toLowerCase().includes(query)
        );
      }

      // Location filter
      if (options.location) {
        results = results.filter((s) => {
          if (!s.availability?.location?.lat || !s.availability?.location?.lng) {
            return false;
          }
          const distance = this.calculateDistance(
            options.location!.lat,
            options.location!.lng,
            s.availability.location.lat,
            s.availability.location.lng
          );
          return distance <= options.location!.radius;
        });
      }
    } else {
      // Default: only active services
      results = results.filter((s) => s.status === ServiceStatus.ACTIVE);
    }

    // Calculate relevance scores and distances
    const searchResults: ServiceSearchResult[] = results.map((s) => {
      const result: ServiceSearchResult = { ...s };

      // Calculate relevance score if query is provided
      if (options?.query) {
        const query = options.query.toLowerCase();
        let score = 0;
        if (s.name.toLowerCase().includes(query)) score += 10;
        if (s.description?.toLowerCase().includes(query)) score += 5;
        if (s.tags?.some((t) => t.toLowerCase().includes(query))) score += 3;
        result.relevanceScore = score;
      }

      // Calculate distance if location is provided
      if (
        options?.location &&
        s.availability?.location?.lat &&
        s.availability?.location?.lng
      ) {
        result.distance = this.calculateDistance(
          options.location.lat,
          options.location.lng,
          s.availability.location.lat,
          s.availability.location.lng
        );
      }

      return result;
    });

    // Sort results
    const sortBy = options?.sortBy ?? 'created';
    const sortOrder = options?.sortOrder ?? 'desc';
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    searchResults.sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return (a.price - b.price) * multiplier;
        case 'rating':
          return ((a.rating ?? 0) - (b.rating ?? 0)) * multiplier;
        case 'orders':
          return ((a.totalOrders ?? 0) - (b.totalOrders ?? 0)) * multiplier;
        case 'relevance':
          return (
            ((a.relevanceScore ?? 0) - (b.relevanceScore ?? 0)) * multiplier
          );
        case 'created':
        default:
          return (
            (a.createdAt.getTime() - b.createdAt.getTime()) * multiplier
          );
      }
    });

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return searchResults.slice(offset, offset + limit).map((s) => deepClone(s));
  }

  // ============================================
  // Orders
  // ============================================

  /**
   * Purchase a service
   */
  async purchase(options: PurchaseOptions): Promise<ServiceOrder> {
    const service = this.services.get(options.serviceId);
    if (!service) {
      throw new RoboxNotFoundError('Service', options.serviceId);
    }

    if (service.status !== ServiceStatus.ACTIVE) {
      throw new RoboxValidationError(
        `Service is not available (status: ${service.status})`,
        'serviceId'
      );
    }

    // Validate buyer exists
    const buyer = await this.robox.getRobotAccount(options.buyerId);
    if (!buyer) {
      throw new RoboxNotFoundError('Account', options.buyerId);
    }

    // Check availability
    const quantity = options.quantity ?? 1;
    if (
      service.availability?.availableSlots !== undefined &&
      service.availability.availableSlots < quantity
    ) {
      throw new RoboxValidationError(
        `Not enough slots available (available: ${service.availability.availableSlots}, requested: ${quantity})`,
        'quantity'
      );
    }

    const totalPrice = service.price * quantity;
    const fee = Math.round((totalPrice * this.config.feePercentage) / 100);

    // Validate amount
    if (totalPrice < this.config.minOrderAmount) {
      throw new RoboxValidationError(
        `Order amount ${totalPrice} is below minimum ${this.config.minOrderAmount}`,
        'totalPrice'
      );
    }
    if (totalPrice > this.config.maxOrderAmount) {
      throw new RoboxValidationError(
        `Order amount ${totalPrice} exceeds maximum ${this.config.maxOrderAmount}`,
        'totalPrice'
      );
    }

    const now = new Date();
    const order: ServiceOrder = {
      id: generateId(),
      serviceId: service.id,
      buyerId: options.buyerId,
      providerId: service.providerId,
      quantity,
      unitPrice: service.price,
      totalPrice,
      fee,
      status: OrderStatus.PENDING,
      scheduledAt: options.scheduledAt,
      notes: options.notes,
      meta: options.meta,
      createdAt: now,
      updatedAt: now,
    };

    // Create escrow if enabled
    const useEscrow = options.useEscrow !== false;
    if (useEscrow) {
      const escrow = await this.robox.createEscrow({
        from: options.buyerId,
        to: service.providerId,
        amount: totalPrice + fee,
        condition: `Order ${order.id}`,
        expiresAt: new Date(Date.now() + this.config.escrowExpiration),
        meta: {
          orderId: order.id,
          serviceId: service.id,
        },
      });

      order.escrowId = escrow.id;
      order.status = OrderStatus.PAID;
    }

    // Update availability
    if (service.availability?.availableSlots !== undefined) {
      service.availability.availableSlots -= quantity;
      if (service.availability.availableSlots <= 0) {
        service.status = ServiceStatus.SOLD_OUT;
      }
      service.updatedAt = now;
    }

    // Update order count
    service.totalOrders = (service.totalOrders ?? 0) + 1;

    this.orders.set(order.id, order);
    this.services.set(service.id, service);

    await this.emit(MarketplaceEventType.ORDER_CREATED, { order, service });
    if (useEscrow) {
      await this.emit(MarketplaceEventType.ORDER_PAID, { order, service });
    }

    return deepClone(order);
  }

  /**
   * Get an order by ID
   */
  async getOrder(orderId: string): Promise<ServiceOrder | null> {
    const order = this.orders.get(orderId);
    return order ? deepClone(order) : null;
  }

  /**
   * Start working on an order (provider action)
   */
  async startOrder(orderId: string): Promise<ServiceOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new RoboxNotFoundError('Order', orderId);
    }

    if (order.status !== OrderStatus.PAID) {
      throw new RoboxValidationError(
        `Cannot start order with status: ${order.status}`,
        'status'
      );
    }

    order.status = OrderStatus.IN_PROGRESS;
    order.startedAt = new Date();
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    await this.emit(MarketplaceEventType.ORDER_STARTED, { order });

    return deepClone(order);
  }

  /**
   * Complete an order (provider action)
   */
  async completeOrder(orderId: string): Promise<ServiceOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new RoboxNotFoundError('Order', orderId);
    }

    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.IN_PROGRESS
    ) {
      throw new RoboxValidationError(
        `Cannot complete order with status: ${order.status}`,
        'status'
      );
    }

    // Release escrow if exists
    if (order.escrowId) {
      const tx = await this.robox.releaseEscrow(order.escrowId);
      order.transactionId = tx.id;
    }

    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    await this.emit(MarketplaceEventType.ORDER_COMPLETED, { order });

    return deepClone(order);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    orderId: string,
    reason?: string
  ): Promise<ServiceOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new RoboxNotFoundError('Order', orderId);
    }

    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new RoboxValidationError(
        `Cannot cancel order with status: ${order.status}`,
        'status'
      );
    }

    // Refund escrow if exists
    if (order.escrowId) {
      await this.robox.refundEscrow(order.escrowId);
    }

    // Restore availability
    const service = this.services.get(order.serviceId);
    if (service?.availability?.availableSlots !== undefined) {
      service.availability.availableSlots += order.quantity;
      if (
        service.status === ServiceStatus.SOLD_OUT &&
        service.availability.availableSlots > 0
      ) {
        service.status = ServiceStatus.ACTIVE;
      }
      service.updatedAt = new Date();
      this.services.set(service.id, service);
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.cancellationReason = reason;
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    await this.emit(MarketplaceEventType.ORDER_CANCELLED, { order, reason });

    return deepClone(order);
  }

  /**
   * Dispute an order
   */
  async disputeOrder(
    orderId: string,
    reason: string
  ): Promise<ServiceOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new RoboxNotFoundError('Order', orderId);
    }

    if (
      order.status !== OrderStatus.PAID &&
      order.status !== OrderStatus.IN_PROGRESS
    ) {
      throw new RoboxValidationError(
        `Cannot dispute order with status: ${order.status}`,
        'status'
      );
    }

    order.status = OrderStatus.DISPUTED;
    order.meta = {
      ...order.meta,
      disputeReason: reason,
      disputedAt: new Date(),
    };
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    await this.emit(MarketplaceEventType.ORDER_DISPUTED, { order, reason });

    return deepClone(order);
  }

  /**
   * Refund an order
   */
  async refundOrder(orderId: string): Promise<ServiceOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new RoboxNotFoundError('Order', orderId);
    }

    // Refund escrow if exists
    if (order.escrowId) {
      await this.robox.refundEscrow(order.escrowId);
    }

    order.status = OrderStatus.REFUNDED;
    order.updatedAt = new Date();

    this.orders.set(orderId, order);
    await this.emit(MarketplaceEventType.ORDER_REFUNDED, { order });

    return deepClone(order);
  }

  /**
   * List orders with filters
   */
  async listOrders(options?: OrderFilterOptions): Promise<ServiceOrder[]> {
    let results = Array.from(this.orders.values());

    if (options) {
      if (options.buyerId) {
        results = results.filter((o) => o.buyerId === options.buyerId);
      }
      if (options.providerId) {
        results = results.filter((o) => o.providerId === options.providerId);
      }
      if (options.serviceId) {
        results = results.filter((o) => o.serviceId === options.serviceId);
      }
      if (options.status) {
        results = results.filter((o) => o.status === options.status);
      }
      if (options.fromDate) {
        results = results.filter((o) => o.createdAt >= options.fromDate!);
      }
      if (options.toDate) {
        results = results.filter((o) => o.createdAt <= options.toDate!);
      }
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return results.slice(offset, offset + limit).map((o) => deepClone(o));
  }

  // ============================================
  // Reviews
  // ============================================

  /**
   * Create a review for a completed order
   */
  async createReview(options: CreateReviewOptions): Promise<ServiceReview> {
    const order = this.orders.get(options.orderId);
    if (!order) {
      throw new RoboxNotFoundError('Order', options.orderId);
    }

    // Validate reviewer is the buyer
    if (order.buyerId !== options.reviewerId) {
      throw new RoboxValidationError(
        'Only the buyer can review this order',
        'reviewerId'
      );
    }

    // Check if review already exists
    for (const review of this.reviews.values()) {
      if (review.orderId === options.orderId) {
        throw new RoboxValidationError(
          'Review already exists for this order',
          'orderId'
        );
      }
    }

    // Check completion requirement
    if (
      this.config.reviewAfterCompletion &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new RoboxValidationError(
        'Can only review completed orders',
        'status'
      );
    }

    // Validate rating
    if (options.rating < 1 || options.rating > 5) {
      throw new RoboxValidationError(
        'Rating must be between 1 and 5',
        'rating'
      );
    }

    const now = new Date();
    const review: ServiceReview = {
      id: generateId(),
      orderId: options.orderId,
      serviceId: order.serviceId,
      reviewerId: options.reviewerId,
      providerId: order.providerId,
      rating: options.rating,
      comment: options.comment,
      helpful: 0,
      meta: options.meta,
      createdAt: now,
      updatedAt: now,
    };

    // Update service rating
    const service = this.services.get(order.serviceId);
    if (service) {
      const totalReviews = (service.totalReviews ?? 0) + 1;
      const currentRating = service.rating ?? 0;
      const newRating =
        (currentRating * (totalReviews - 1) + options.rating) / totalReviews;

      service.rating = Math.round(newRating * 100) / 100;
      service.totalReviews = totalReviews;
      service.updatedAt = now;
      this.services.set(service.id, service);
    }

    this.reviews.set(review.id, review);
    await this.emit(MarketplaceEventType.REVIEW_CREATED, { review, order });

    return deepClone(review);
  }

  /**
   * Respond to a review (provider action)
   */
  async respondToReview(
    reviewId: string,
    comment: string
  ): Promise<ServiceReview> {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new RoboxNotFoundError('Review', reviewId);
    }

    review.response = {
      comment,
      respondedAt: new Date(),
    };
    review.updatedAt = new Date();

    this.reviews.set(reviewId, review);
    await this.emit(MarketplaceEventType.REVIEW_RESPONDED, {
      review,
      response: comment,
    });

    return deepClone(review);
  }

  /**
   * Get a review by ID
   */
  async getReview(reviewId: string): Promise<ServiceReview | null> {
    const review = this.reviews.get(reviewId);
    return review ? deepClone(review) : null;
  }

  /**
   * List reviews with filters
   */
  async listReviews(options?: ReviewFilterOptions): Promise<ServiceReview[]> {
    let results = Array.from(this.reviews.values());

    if (options) {
      if (options.serviceId) {
        results = results.filter((r) => r.serviceId === options.serviceId);
      }
      if (options.providerId) {
        results = results.filter((r) => r.providerId === options.providerId);
      }
      if (options.reviewerId) {
        results = results.filter((r) => r.reviewerId === options.reviewerId);
      }
      if (options.minRating !== undefined) {
        results = results.filter((r) => r.rating >= options.minRating!);
      }
      if (options.maxRating !== undefined) {
        results = results.filter((r) => r.rating <= options.maxRating!);
      }
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return results.slice(offset, offset + limit).map((r) => deepClone(r));
  }

  /**
   * Mark a review as helpful
   */
  async markReviewHelpful(reviewId: string): Promise<ServiceReview> {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new RoboxNotFoundError('Review', reviewId);
    }

    review.helpful = (review.helpful ?? 0) + 1;
    review.updatedAt = new Date();

    this.reviews.set(reviewId, review);
    return deepClone(review);
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get marketplace statistics
   */
  async getStats(
    fromDate?: Date,
    toDate?: Date
  ): Promise<MarketplaceStats> {
    let orders = Array.from(this.orders.values());

    if (fromDate) {
      orders = orders.filter((o) => o.createdAt >= fromDate);
    }
    if (toDate) {
      orders = orders.filter((o) => o.createdAt <= toDate);
    }

    const completedOrders = orders.filter(
      (o) => o.status === OrderStatus.COMPLETED
    );

    // Category counts
    const categoryMap = new Map<string, number>();
    for (const service of this.services.values()) {
      const cat = service.category as string;
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }

    const topCategories = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate average rating
    let totalRating = 0;
    let ratedServices = 0;
    for (const service of this.services.values()) {
      if (service.rating && service.rating > 0) {
        totalRating += service.rating;
        ratedServices++;
      }
    }
    const averageRating =
      ratedServices > 0
        ? Math.round((totalRating / ratedServices) * 100) / 100
        : 0;

    return {
      totalServices: this.services.size,
      activeServices: Array.from(this.services.values()).filter(
        (s) => s.status === ServiceStatus.ACTIVE
      ).length,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      totalVolume: completedOrders.reduce((sum, o) => sum + o.totalPrice, 0),
      totalFees: completedOrders.reduce((sum, o) => sum + (o.fee ?? 0), 0),
      averageRating,
      totalReviews: this.reviews.size,
      topCategories,
      periodStart: fromDate,
      periodEnd: toDate,
    };
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Subscribe to marketplace events
   */
  on(event: MarketplaceEventType, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from marketplace events
   */
  off(event: MarketplaceEventType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private async emit(
    event: MarketplaceEventType,
    data: unknown
  ): Promise<void> {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler({
            type: event as unknown as import('../types').EventType,
            data,
            timestamp: new Date(),
          });
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.services.clear();
    this.orders.clear();
    this.reviews.clear();
  }
}
