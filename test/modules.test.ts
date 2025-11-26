import { Scheduler, ScheduleType, ScheduledPaymentStatus } from '../src/scheduler';
import { ReputationManager, ReputationLevel, ReputationEventType } from '../src/reputation';
import { DiscoveryManager, ServiceType } from '../src/discovery';
import { SubscriptionManager, SubscriptionStatus, BillingPeriod } from '../src/subscriptions';
import { TransactionType } from '../src/types';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let executedTransfers: any[];

  beforeEach(() => {
    executedTransfers = [];
    scheduler = new Scheduler({
      executor: async (params) => {
        executedTransfers.push(params);
        return { id: `tx-${Date.now()}` };
      },
      checkIntervalMs: 100,
    });
  });

  afterEach(() => {
    scheduler.clear();
  });

  test('should create scheduled payment', () => {
    const payment = scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.TASK_PAYMENT,
      schedule: {
        type: ScheduleType.INTERVAL,
        intervalMs: 60000,
      },
    });

    expect(payment.id).toBeDefined();
    expect(payment.from).toBe('robot-1');
    expect(payment.to).toBe('robot-2');
    expect(payment.amount).toBe(100);
    expect(payment.status).toBe(ScheduledPaymentStatus.PENDING);
  });

  test('should create one-time payment', () => {
    const executeAt = new Date(Date.now() + 60000);
    const payment = scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 50,
      type: TransactionType.ENERGY_PAYMENT,
      schedule: {
        type: ScheduleType.ONE_TIME,
        executeAt,
      },
    });

    expect(payment.schedule.type).toBe(ScheduleType.ONE_TIME);
    expect(payment.schedule.executeAt).toEqual(executeAt);
  });

  test('should create daily payment', () => {
    const payment = scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.SUBSCRIPTION,
      schedule: {
        type: ScheduleType.DAILY,
        hour: 9,
        minute: 0,
      },
    });

    expect(payment.schedule.type).toBe(ScheduleType.DAILY);
    expect(payment.schedule.hour).toBe(9);
  });

  test('should list payments', () => {
    scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.TASK_PAYMENT,
      schedule: { type: ScheduleType.DAILY, hour: 9 },
    });

    scheduler.create({
      from: 'robot-1',
      to: 'robot-3',
      amount: 200,
      type: TransactionType.ENERGY_PAYMENT,
      schedule: { type: ScheduleType.WEEKLY, dayOfWeek: 1 },
    });

    const payments = scheduler.list();
    expect(payments).toHaveLength(2);
  });

  test('should pause and resume payment', () => {
    const payment = scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.TASK_PAYMENT,
      schedule: { type: ScheduleType.DAILY, hour: 9 },
    });

    scheduler.pause(payment.id);
    expect(scheduler.get(payment.id)?.status).toBe(ScheduledPaymentStatus.PAUSED);

    scheduler.resume(payment.id);
    expect(scheduler.get(payment.id)?.status).toBe(ScheduledPaymentStatus.ACTIVE);
  });

  test('should cancel payment', () => {
    const payment = scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.TASK_PAYMENT,
      schedule: { type: ScheduleType.DAILY, hour: 9 },
    });

    scheduler.cancel(payment.id);
    expect(scheduler.get(payment.id)?.status).toBe(ScheduledPaymentStatus.CANCELLED);
  });

  test('should execute payment manually', async () => {
    const payment = scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.TASK_PAYMENT,
      schedule: { type: ScheduleType.DAILY, hour: 9 },
    });

    const result = await scheduler.executeNow(payment.id);
    
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(executedTransfers).toHaveLength(1);
    expect(executedTransfers[0].amount).toBe(100);
  });

  test('should get stats', () => {
    scheduler.create({
      from: 'robot-1',
      to: 'robot-2',
      amount: 100,
      type: TransactionType.TASK_PAYMENT,
      schedule: { type: ScheduleType.DAILY, hour: 9 },
    });

    const stats = scheduler.getStats();
    expect(stats.total).toBe(1);
  });
});

describe('ReputationManager', () => {
  let reputation: ReputationManager;

  beforeEach(() => {
    reputation = new ReputationManager();
  });

  afterEach(() => {
    reputation.clear();
  });

  test('should create reputation for new robot', () => {
    const rep = reputation.getReputation('robot-1');

    expect(rep.robotId).toBe('robot-1');
    expect(rep.score).toBe(50);
    expect(rep.level).toBe(ReputationLevel.SILVER);
  });

  test('should increase score on successful transaction', () => {
    reputation.recordTransactionSuccess('robot-1');
    const rep = reputation.getReputation('robot-1');

    expect(rep.score).toBe(51);
    expect(rep.successfulTransactions).toBe(1);
    expect(rep.totalTransactions).toBe(1);
  });

  test('should decrease score on failed transaction', () => {
    reputation.recordTransactionFailure('robot-1', 'Insufficient funds');
    const rep = reputation.getReputation('robot-1');

    expect(rep.score).toBe(45);
    expect(rep.failedTransactions).toBe(1);
  });

  test('should add rating', () => {
    const rating = reputation.addRating({
      fromRobotId: 'robot-1',
      toRobotId: 'robot-2',
      rating: 5,
      comment: 'Great service!',
    });

    expect(rating.rating).toBe(5);
    
    const rep = reputation.getReputation('robot-2');
    expect(rep.totalRatings).toBe(1);
    expect(rep.averageRating).toBe(5);
  });

  test('should not allow self-rating', () => {
    expect(() => {
      reputation.addRating({
        fromRobotId: 'robot-1',
        toRobotId: 'robot-1',
        rating: 5,
      });
    }).toThrow('Cannot rate yourself');
  });

  test('should get leaderboard', () => {
    reputation.recordTransactionSuccess('robot-1');
    reputation.recordTransactionSuccess('robot-1');
    reputation.recordTransactionSuccess('robot-2');

    const leaderboard = reputation.getLeaderboard(10);
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].robotId).toBe('robot-1');
  });

  test('should check if robot is trusted', () => {
    reputation.recordTransactionSuccess('robot-1');
    reputation.recordTransactionSuccess('robot-1');

    expect(reputation.isTrusted('robot-1', 50)).toBe(true);
    expect(reputation.isTrusted('robot-1', 60)).toBe(false);
  });

  test('should calculate correct levels', () => {
    // Get to diamond level
    for (let i = 0; i < 50; i++) {
      reputation.recordTransactionSuccess('robot-1');
    }

    const rep = reputation.getReputation('robot-1');
    expect(rep.level).toBe(ReputationLevel.DIAMOND);
  });
});

describe('DiscoveryManager', () => {
  let discovery: DiscoveryManager;

  beforeEach(() => {
    discovery = new DiscoveryManager();
  });

  afterEach(() => {
    discovery.clear();
  });

  test('should update robot location', () => {
    const location = discovery.updateLocation({
      robotId: 'robot-1',
      latitude: 55.7558,
      longitude: 37.6173,
    });

    expect(location.robotId).toBe('robot-1');
    expect(location.latitude).toBe(55.7558);
    expect(location.longitude).toBe(37.6173);
  });

  test('should get robot location', () => {
    discovery.updateLocation({
      robotId: 'robot-1',
      latitude: 55.7558,
      longitude: 37.6173,
    });

    const location = discovery.getLocation('robot-1');
    expect(location).not.toBeNull();
    expect(location?.latitude).toBe(55.7558);
  });

  test('should register service', () => {
    const service = discovery.registerService({
      robotId: 'charger-1',
      serviceType: ServiceType.CHARGING,
      name: 'Fast Charger',
      price: 10,
    });

    expect(service.id).toBeDefined();
    expect(service.serviceType).toBe(ServiceType.CHARGING);
    expect(service.price).toBe(10);
    expect(service.available).toBe(true);
  });

  test('should search services by type', () => {
    discovery.registerService({
      robotId: 'charger-1',
      serviceType: ServiceType.CHARGING,
      name: 'Charger 1',
      price: 10,
    });

    discovery.registerService({
      robotId: 'vendor-1',
      serviceType: ServiceType.PARTS,
      name: 'Parts Vendor',
      price: 100,
    });

    const results = discovery.searchServices({ serviceType: ServiceType.CHARGING });
    expect(results).toHaveLength(1);
    expect(results[0].service.serviceType).toBe(ServiceType.CHARGING);
  });

  test('should find nearest service', () => {
    discovery.updateLocation({ robotId: 'charger-1', latitude: 55.7558, longitude: 37.6173 });
    discovery.updateLocation({ robotId: 'charger-2', latitude: 55.7600, longitude: 37.6200 });

    discovery.registerService({
      robotId: 'charger-1',
      serviceType: ServiceType.CHARGING,
      name: 'Charger 1',
      price: 10,
    });

    discovery.registerService({
      robotId: 'charger-2',
      serviceType: ServiceType.CHARGING,
      name: 'Charger 2',
      price: 12,
    });

    const nearest = discovery.findNearest(
      ServiceType.CHARGING,
      55.7560,  // Close to charger-1
      37.6175
    );

    expect(nearest).not.toBeNull();
    expect(nearest?.service.robotId).toBe('charger-1');
  });

  test('should find cheapest service', () => {
    discovery.registerService({
      robotId: 'charger-1',
      serviceType: ServiceType.CHARGING,
      name: 'Expensive Charger',
      price: 20,
    });

    discovery.registerService({
      robotId: 'charger-2',
      serviceType: ServiceType.CHARGING,
      name: 'Cheap Charger',
      price: 5,
    });

    const cheapest = discovery.findCheapest(ServiceType.CHARGING);
    expect(cheapest?.service.price).toBe(5);
  });

  test('should get robot services', () => {
    discovery.registerService({
      robotId: 'provider-1',
      serviceType: ServiceType.CHARGING,
      name: 'Charging',
      price: 10,
    });

    discovery.registerService({
      robotId: 'provider-1',
      serviceType: ServiceType.REPAIR,
      name: 'Repair',
      price: 100,
    });

    const services = discovery.getRobotServices('provider-1');
    expect(services).toHaveLength(2);
  });
});

describe('SubscriptionManager', () => {
  let subscriptions: SubscriptionManager;
  let executedPayments: any[];

  beforeEach(() => {
    executedPayments = [];
    subscriptions = new SubscriptionManager({
      executor: async (params) => {
        executedPayments.push(params);
        return { id: `tx-${Date.now()}` };
      },
    });
  });

  afterEach(() => {
    subscriptions.clear();
  });

  test('should create plan', () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    expect(plan.id).toBeDefined();
    expect(plan.name).toBe('Basic Plan');
    expect(plan.price).toBe(100);
    expect(plan.billingPeriod).toBe(BillingPeriod.MONTHLY);
  });

  test('should subscribe to plan', () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    const sub = subscriptions.subscribe({
      planId: plan.id,
      subscriberId: 'robot-1',
    });

    expect(sub).not.toBeNull();
    expect(sub?.subscriberId).toBe('robot-1');
    expect(sub?.providerId).toBe('provider-1');
    expect(sub?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  test('should not subscribe to inactive plan', () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    subscriptions.deactivatePlan(plan.id);

    const sub = subscriptions.subscribe({
      planId: plan.id,
      subscriberId: 'robot-1',
    });

    expect(sub).toBeNull();
  });

  test('should pause and resume subscription', () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    const sub = subscriptions.subscribe({
      planId: plan.id,
      subscriberId: 'robot-1',
    })!;

    subscriptions.pause(sub.id);
    expect(subscriptions.getSubscription(sub.id)?.status).toBe(SubscriptionStatus.PAUSED);

    subscriptions.resume(sub.id);
    expect(subscriptions.getSubscription(sub.id)?.status).toBe(SubscriptionStatus.ACTIVE);
  });

  test('should cancel subscription', () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    const sub = subscriptions.subscribe({
      planId: plan.id,
      subscriberId: 'robot-1',
    })!;

    subscriptions.cancel(sub.id);
    
    const cancelled = subscriptions.getSubscription(sub.id);
    expect(cancelled?.status).toBe(SubscriptionStatus.CANCELLED);
    expect(cancelled?.cancelledAt).toBeDefined();
  });

  test('should process subscriptions', async () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    subscriptions.subscribe({
      planId: plan.id,
      subscriberId: 'robot-1',
    });

    await subscriptions.processSubscriptions();

    expect(executedPayments).toHaveLength(1);
    expect(executedPayments[0].amount).toBe(100);
    expect(executedPayments[0].from).toBe('robot-1');
    expect(executedPayments[0].to).toBe('provider-1');
  });

  test('should get stats', () => {
    const plan = subscriptions.createPlan({
      providerId: 'provider-1',
      name: 'Basic Plan',
      price: 100,
      billingPeriod: BillingPeriod.MONTHLY,
    });

    subscriptions.subscribe({
      planId: plan.id,
      subscriberId: 'robot-1',
    });

    const stats = subscriptions.getStats();
    expect(stats.totalPlans).toBe(1);
    expect(stats.totalSubscriptions).toBe(1);
    expect(stats.activeSubscriptions).toBe(1);
  });
});
