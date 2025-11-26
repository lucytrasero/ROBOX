import {
  RoboxLayer,
  InMemoryStorage,
  MarketplaceManager,
  ServiceCategory,
  ServiceStatus,
  OrderStatus,
  MarketplaceEventType,
} from '../src';

describe('MarketplaceManager', () => {
  let robox: RoboxLayer;
  let marketplace: MarketplaceManager;

  beforeEach(async () => {
    robox = new RoboxLayer({ storage: new InMemoryStorage() });
    marketplace = new MarketplaceManager(robox, { feePercentage: 5 });

    // Create test accounts
    await robox.createRobotAccount({ id: 'provider-1', name: 'Charger Bot' });
    await robox.createRobotAccount({ id: 'provider-2', name: 'Storage Bot' });
    await robox.createRobotAccount({ id: 'buyer-1', name: 'Vacuum Bot' });
    await robox.credit('buyer-1', 1000, { initiatedBy: 'buyer-1' });
  });

  afterEach(() => {
    marketplace.clear();
  });

  describe('Service Listing', () => {
    it('should list a new service', async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Fast Charging',
        description: 'Quick battery charging service',
        price: 50,
        category: ServiceCategory.ENERGY,
        availability: { totalSlots: 5, schedule: '24/7' },
        tags: ['fast', 'reliable'],
      });

      expect(service.id).toBeDefined();
      expect(service.name).toBe('Fast Charging');
      expect(service.price).toBe(50);
      expect(service.category).toBe(ServiceCategory.ENERGY);
      expect(service.status).toBe(ServiceStatus.ACTIVE);
      expect(service.availability?.availableSlots).toBe(5);
    });

    it('should reject invalid price', async () => {
      await expect(
        marketplace.listService({
          providerId: 'provider-1',
          name: 'Bad Service',
          price: -10,
          category: ServiceCategory.ENERGY,
        })
      ).rejects.toThrow('Price must be non-negative');
    });

    it('should reject non-existent provider', async () => {
      await expect(
        marketplace.listService({
          providerId: 'unknown',
          name: 'Service',
          price: 10,
          category: ServiceCategory.ENERGY,
        })
      ).rejects.toThrow('not found');
    });

    it('should update a service', async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Old Name',
        price: 50,
        category: ServiceCategory.ENERGY,
      });

      const updated = await marketplace.updateService(service.id, {
        name: 'New Name',
        price: 75,
      });

      expect(updated.name).toBe('New Name');
      expect(updated.price).toBe(75);
    });

    it('should pause and resume a service', async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Service',
        price: 50,
        category: ServiceCategory.ENERGY,
      });

      const paused = await marketplace.pauseService(service.id);
      expect(paused.status).toBe(ServiceStatus.PAUSED);

      const resumed = await marketplace.resumeService(service.id);
      expect(resumed.status).toBe(ServiceStatus.ACTIVE);
    });

    it('should cancel a service', async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Service',
        price: 50,
        category: ServiceCategory.ENERGY,
      });

      const cancelled = await marketplace.cancelService(service.id);
      expect(cancelled.status).toBe(ServiceStatus.CANCELLED);
    });
  });

  describe('Search', () => {
    beforeEach(async () => {
      await marketplace.listService({
        providerId: 'provider-1',
        name: 'Fast Charging',
        price: 50,
        category: ServiceCategory.ENERGY,
        tags: ['fast'],
      });

      await marketplace.listService({
        providerId: 'provider-1',
        name: 'Slow Charging',
        price: 20,
        category: ServiceCategory.ENERGY,
        tags: ['budget'],
      });

      await marketplace.listService({
        providerId: 'provider-2',
        name: 'Data Storage',
        price: 100,
        category: ServiceCategory.STORAGE,
      });
    });

    it('should search all active services', async () => {
      const results = await marketplace.search();
      expect(results.length).toBe(3);
    });

    it('should filter by category', async () => {
      const results = await marketplace.search({
        category: ServiceCategory.ENERGY,
      });
      expect(results.length).toBe(2);
    });

    it('should filter by price range', async () => {
      const results = await marketplace.search({
        minPrice: 30,
        maxPrice: 80,
      });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Fast Charging');
    });

    it('should filter by provider', async () => {
      const results = await marketplace.search({
        providerId: 'provider-2',
      });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Data Storage');
    });

    it('should search by query', async () => {
      const results = await marketplace.search({
        query: 'charging',
      });
      expect(results.length).toBe(2);
    });

    it('should filter by tags', async () => {
      const results = await marketplace.search({
        tags: ['budget'],
      });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Slow Charging');
    });

    it('should sort by price ascending', async () => {
      const results = await marketplace.search({
        sortBy: 'price',
        sortOrder: 'asc',
      });
      expect(results[0].price).toBe(20);
      expect(results[2].price).toBe(100);
    });

    it('should paginate results', async () => {
      const page1 = await marketplace.search({ limit: 2, offset: 0 });
      const page2 = await marketplace.search({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(1);
    });
  });

  describe('Orders', () => {
    let serviceId: string;

    beforeEach(async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Charging',
        price: 100,
        category: ServiceCategory.ENERGY,
        availability: { totalSlots: 3 },
      });
      serviceId = service.id;
    });

    it('should create an order with escrow', async () => {
      const order = await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });

      expect(order.id).toBeDefined();
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.escrowId).toBeDefined();
      expect(order.totalPrice).toBe(100);
      expect(order.fee).toBe(5); // 5% of 100
    });

    it('should decrement availability on purchase', async () => {
      await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });

      const service = await marketplace.getService(serviceId);
      expect(service?.availability?.availableSlots).toBe(2);
    });

    it('should start an order', async () => {
      const order = await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });

      const started = await marketplace.startOrder(order.id);
      expect(started.status).toBe(OrderStatus.IN_PROGRESS);
      expect(started.startedAt).toBeDefined();
    });

    it('should complete an order and release escrow', async () => {
      const order = await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });

      const completed = await marketplace.completeOrder(order.id);
      expect(completed.status).toBe(OrderStatus.COMPLETED);
      expect(completed.completedAt).toBeDefined();
      expect(completed.transactionId).toBeDefined();

      // Check provider received payment
      const provider = await robox.getRobotAccount('provider-1');
      expect(provider?.balance).toBeGreaterThan(0);
    });

    it('should cancel an order and refund escrow', async () => {
      const order = await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });

      const buyerBefore = await robox.getRobotAccount('buyer-1');
      const cancelled = await marketplace.cancelOrder(order.id, 'Changed mind');

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(cancelled.cancellationReason).toBe('Changed mind');

      // Check buyer was refunded
      const buyerAfter = await robox.getRobotAccount('buyer-1');
      expect(buyerAfter?.balance).toBe(buyerBefore?.balance);
    });

    it('should dispute an order', async () => {
      const order = await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });

      const disputed = await marketplace.disputeOrder(order.id, 'Bad service');
      expect(disputed.status).toBe(OrderStatus.DISPUTED);
    });

    it('should reject purchase of unavailable service', async () => {
      // Use all slots
      await marketplace.purchase({ serviceId, buyerId: 'buyer-1' });
      await marketplace.purchase({ serviceId, buyerId: 'buyer-1' });
      await marketplace.purchase({ serviceId, buyerId: 'buyer-1' });

      await expect(
        marketplace.purchase({ serviceId, buyerId: 'buyer-1' })
      ).rejects.toThrow('not available');
    });

    it('should list orders by buyer', async () => {
      await marketplace.purchase({ serviceId, buyerId: 'buyer-1' });
      await marketplace.purchase({ serviceId, buyerId: 'buyer-1' });

      const orders = await marketplace.listOrders({ buyerId: 'buyer-1' });
      expect(orders.length).toBe(2);
    });
  });

  describe('Reviews', () => {
    let orderId: string;
    let serviceId: string;

    beforeEach(async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Charging',
        price: 50,
        category: ServiceCategory.ENERGY,
      });
      serviceId = service.id;

      const order = await marketplace.purchase({
        serviceId,
        buyerId: 'buyer-1',
      });
      orderId = order.id;

      await marketplace.completeOrder(orderId);
    });

    it('should create a review', async () => {
      const review = await marketplace.createReview({
        orderId,
        reviewerId: 'buyer-1',
        rating: 5,
        comment: 'Excellent service!',
      });

      expect(review.id).toBeDefined();
      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Excellent service!');
    });

    it('should update service rating', async () => {
      await marketplace.createReview({
        orderId,
        reviewerId: 'buyer-1',
        rating: 4,
      });

      const service = await marketplace.getService(serviceId);
      expect(service?.rating).toBe(4);
      expect(service?.totalReviews).toBe(1);
    });

    it('should reject review from non-buyer', async () => {
      await expect(
        marketplace.createReview({
          orderId,
          reviewerId: 'provider-1',
          rating: 5,
        })
      ).rejects.toThrow('Only the buyer can review');
    });

    it('should reject duplicate review', async () => {
      await marketplace.createReview({
        orderId,
        reviewerId: 'buyer-1',
        rating: 5,
      });

      await expect(
        marketplace.createReview({
          orderId,
          reviewerId: 'buyer-1',
          rating: 4,
        })
      ).rejects.toThrow('already exists');
    });

    it('should allow provider response', async () => {
      const review = await marketplace.createReview({
        orderId,
        reviewerId: 'buyer-1',
        rating: 3,
        comment: 'Could be better',
      });

      const responded = await marketplace.respondToReview(
        review.id,
        'Thanks for the feedback!'
      );

      expect(responded.response?.comment).toBe('Thanks for the feedback!');
    });

    it('should mark review as helpful', async () => {
      const review = await marketplace.createReview({
        orderId,
        reviewerId: 'buyer-1',
        rating: 5,
      });

      const helpful = await marketplace.markReviewHelpful(review.id);
      expect(helpful.helpful).toBe(1);
    });
  });

  describe('Events', () => {
    it('should emit service listed event', async () => {
      const events: unknown[] = [];
      marketplace.on(MarketplaceEventType.SERVICE_LISTED, (e) => events.push(e));

      await marketplace.listService({
        providerId: 'provider-1',
        name: 'Service',
        price: 50,
        category: ServiceCategory.ENERGY,
      });

      expect(events.length).toBe(1);
    });

    it('should emit order events', async () => {
      const events: string[] = [];
      marketplace.on(MarketplaceEventType.ORDER_CREATED, () =>
        events.push('created')
      );
      marketplace.on(MarketplaceEventType.ORDER_PAID, () =>
        events.push('paid')
      );
      marketplace.on(MarketplaceEventType.ORDER_COMPLETED, () =>
        events.push('completed')
      );

      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Service',
        price: 50,
        category: ServiceCategory.ENERGY,
      });

      const order = await marketplace.purchase({
        serviceId: service.id,
        buyerId: 'buyer-1',
      });

      await marketplace.completeOrder(order.id);

      expect(events).toContain('created');
      expect(events).toContain('paid');
      expect(events).toContain('completed');
    });
  });

  describe('Statistics', () => {
    it('should get marketplace stats', async () => {
      const service = await marketplace.listService({
        providerId: 'provider-1',
        name: 'Service',
        price: 50,
        category: ServiceCategory.ENERGY,
      });

      const order = await marketplace.purchase({
        serviceId: service.id,
        buyerId: 'buyer-1',
      });
      await marketplace.completeOrder(order.id);

      await marketplace.createReview({
        orderId: order.id,
        reviewerId: 'buyer-1',
        rating: 5,
      });

      const stats = await marketplace.getStats();

      expect(stats.totalServices).toBe(1);
      expect(stats.activeServices).toBe(1);
      expect(stats.totalOrders).toBe(1);
      expect(stats.completedOrders).toBe(1);
      expect(stats.totalVolume).toBe(50);
      expect(stats.totalReviews).toBe(1);
    });
  });
});
