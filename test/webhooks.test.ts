import { WebhookManager, WebhookDeliveryStatus } from '../src/webhooks';
import { EventType, RoboxEvent } from '../src/types';

describe('WebhookManager', () => {
  let manager: WebhookManager;

  beforeEach(() => {
    manager = new WebhookManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('Webhook CRUD', () => {
    test('should create webhook', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: [EventType.TRANSFER_COMPLETED],
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toContain(EventType.TRANSFER_COMPLETED);
      expect(webhook.enabled).toBe(true);
    });

    test('should create webhook with all options', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'my-secret-key',
        name: 'Test Webhook',
        metadata: { env: 'test' },
        robotId: 'robot-001',
        filterRobotIds: ['robot-002', 'robot-003'],
        minAmountThreshold: 100,
        maxAmountThreshold: 10000,
        transactionTypes: ['TASK_PAYMENT'],
        rateLimitPerMinute: 30,
        autoDisableAfterFailures: 5,
        headers: { 'X-Custom': 'value' },
      });

      expect(webhook.secret).toBe('my-secret-key');
      expect(webhook.name).toBe('Test Webhook');
      expect(webhook.metadata).toEqual({ env: 'test' });
      expect(webhook.robotId).toBe('robot-001');
      expect(webhook.filterRobotIds).toEqual(['robot-002', 'robot-003']);
      expect(webhook.minAmountThreshold).toBe(100);
      expect(webhook.maxAmountThreshold).toBe(10000);
      expect(webhook.transactionTypes).toEqual(['TASK_PAYMENT']);
      expect(webhook.rateLimitPerMinute).toBe(30);
      expect(webhook.autoDisableAfterFailures).toBe(5);
    });

    test('should create batch webhooks', () => {
      const webhooks = manager.createBatch([
        { url: 'https://example.com/hook1', events: ['*'] },
        { url: 'https://example.com/hook2', events: ['*'] },
      ]);

      expect(webhooks).toHaveLength(2);
    });

    test('should get webhook by id', () => {
      const created = manager.create({
        url: 'https://example.com/webhook',
        events: [EventType.ACCOUNT_CREATED],
      });

      const fetched = manager.get(created.id);
      expect(fetched).toEqual(created);
    });

    test('should get webhook by url', () => {
      const created = manager.create({
        url: 'https://example.com/unique-webhook',
        events: ['*'],
      });

      const fetched = manager.getByUrl('https://example.com/unique-webhook');
      expect(fetched?.id).toBe(created.id);
    });

    test('should return null for non-existing webhook', () => {
      const webhook = manager.get('non-existent');
      expect(webhook).toBeNull();
    });

    test('should list all webhooks', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      manager.create({ url: 'https://example.com/hook2', events: ['*'] });
      manager.create({ url: 'https://example.com/hook3', events: ['*'] });

      const webhooks = manager.list();
      expect(webhooks).toHaveLength(3);
    });

    test('should list webhooks with filter', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'], robotId: 'robot-1', enabled: true });
      manager.create({ url: 'https://example.com/hook2', events: ['*'], robotId: 'robot-1', enabled: false });
      manager.create({ url: 'https://example.com/hook3', events: ['*'], robotId: 'robot-2' });

      expect(manager.list({ robotId: 'robot-1' })).toHaveLength(2);
      expect(manager.list({ enabled: true })).toHaveLength(2);
      expect(manager.listByRobot('robot-2')).toHaveLength(1);
    });

    test('should list webhooks with name filter', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'], name: 'Transfer Hook' });
      manager.create({ url: 'https://example.com/hook2', events: ['*'], name: 'Escrow Hook' });
      manager.create({ url: 'https://example.com/hook3', events: ['*'], name: 'All Events' });

      const filtered = manager.list({ nameContains: 'hook' });
      expect(filtered).toHaveLength(2);
    });

    test('should update webhook', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: [EventType.TRANSFER_COMPLETED],
      });

      const updated = manager.update(webhook.id, {
        url: 'https://example.com/new-webhook',
        events: [EventType.TRANSFER_COMPLETED, EventType.ESCROW_CREATED],
        name: 'Updated Name',
        minAmountThreshold: 500,
      });

      expect(updated?.url).toBe('https://example.com/new-webhook');
      expect(updated?.events).toHaveLength(2);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.minAmountThreshold).toBe(500);
    });

    test('should delete webhook', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
      });

      const deleted = manager.delete(webhook.id);
      expect(deleted).toBe(true);

      const fetched = manager.get(webhook.id);
      expect(fetched).toBeNull();
    });

    test('should delete batch webhooks', () => {
      const w1 = manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      const w2 = manager.create({ url: 'https://example.com/hook2', events: ['*'] });

      const results = manager.deleteBatch([w1.id, w2.id, 'non-existent']);
      
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(false);
    });

    test('should delete by robot', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'], robotId: 'robot-1' });
      manager.create({ url: 'https://example.com/hook2', events: ['*'], robotId: 'robot-1' });
      manager.create({ url: 'https://example.com/hook3', events: ['*'], robotId: 'robot-2' });

      const deleted = manager.deleteByRobot('robot-1');
      expect(deleted).toBe(2);
      expect(manager.list()).toHaveLength(1);
    });

    test('should enable/disable webhook', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        enabled: false,
      });

      expect(webhook.enabled).toBe(false);

      manager.enable(webhook.id);
      expect(manager.get(webhook.id)?.enabled).toBe(true);

      manager.disable(webhook.id);
      expect(manager.get(webhook.id)?.enabled).toBe(false);
    });

    test('should enable/disable batch', () => {
      const w1 = manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      const w2 = manager.create({ url: 'https://example.com/hook2', events: ['*'] });

      manager.disableBatch([w1.id, w2.id]);
      expect(manager.get(w1.id)?.enabled).toBe(false);
      expect(manager.get(w2.id)?.enabled).toBe(false);

      manager.enableBatch([w1.id, w2.id]);
      expect(manager.get(w1.id)?.enabled).toBe(true);
      expect(manager.get(w2.id)?.enabled).toBe(true);
    });

    test('should rotate secret', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'old-secret',
      });

      const rotated = manager.rotateSecret(webhook.id, 'new-secret');
      expect(rotated).toBe(true);
      expect(manager.get(webhook.id)?.secret).toBe('new-secret');
    });
  });

  describe('Signature Verification', () => {
    test('should verify valid signature', () => {
      const payload = '{"event":"test","data":{}}';
      const secret = 'my-secret';

      const signature = WebhookManager.createSignature(payload, secret);
      const isValid = WebhookManager.verifySignature(payload, signature, secret);
      
      expect(isValid).toBe(true);
    });

    test('should reject invalid signature', () => {
      const payload = '{"event":"test","data":{}}';
      const secret = 'my-secret';

      const isValid = WebhookManager.verifySignature(payload, 'invalid-signature', secret);
      expect(isValid).toBe(false);
    });

    test('should reject signature with wrong secret', () => {
      const payload = '{"event":"test","data":{}}';
      const signature = WebhookManager.createSignature(payload, 'secret-1');
      const isValid = WebhookManager.verifySignature(payload, signature, 'secret-2');
      
      expect(isValid).toBe(false);
    });

    test('should parse webhook payload', () => {
      const payload = {
        id: 'test-123',
        event: EventType.TRANSFER_COMPLETED,
        data: { amount: 100 },
        timestamp: '2024-01-01T00:00:00Z',
      };

      const parsed = WebhookManager.parsePayload(JSON.stringify(payload));
      expect(parsed.id).toBe('test-123');
      expect(parsed.event).toBe(EventType.TRANSFER_COMPLETED);
      expect(parsed.data).toEqual({ amount: 100 });
    });
  });

  describe('Delivery History', () => {
    test('should list deliveries', () => {
      const deliveries = manager.listDeliveries();
      expect(deliveries).toHaveLength(0);
    });

    test('should filter deliveries by status', () => {
      const deliveries = manager.listDeliveries({
        status: WebhookDeliveryStatus.SUCCESS,
      });
      expect(deliveries).toHaveLength(0);
    });

    test('should get recent deliveries', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
      });

      const deliveries = manager.getRecentDeliveries(webhook.id, 5);
      expect(deliveries).toHaveLength(0);
    });

    test('should clear old deliveries', () => {
      const cleared = manager.clearOldDeliveries(new Date());
      expect(cleared).toBe(0);
    });
  });

  describe('Health & Monitoring', () => {
    test('should get webhook health', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        name: 'Test Hook',
      });

      const health = manager.getHealth(webhook.id);
      
      expect(health).not.toBeNull();
      expect(health?.id).toBe(webhook.id);
      expect(health?.name).toBe('Test Hook');
      expect(health?.enabled).toBe(true);
      expect(health?.healthy).toBe(true);
      expect(health?.consecutiveFailures).toBe(0);
      expect(health?.successRate).toBe(1);
    });

    test('should get all health statuses', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      manager.create({ url: 'https://example.com/hook2', events: ['*'] });

      const health = manager.getAllHealth();
      expect(health).toHaveLength(2);
    });

    test('should get unhealthy webhooks', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      
      const unhealthy = manager.getUnhealthyWebhooks();
      expect(unhealthy).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    test('should return comprehensive stats', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'], enabled: true });
      manager.create({ url: 'https://example.com/hook2', events: ['*'], enabled: false });

      const stats = manager.getStats();

      expect(stats.totalWebhooks).toBe(2);
      expect(stats.activeWebhooks).toBe(1);
      expect(stats.totalDeliveries).toBe(0);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(0);
      expect(stats.pendingDeliveries).toBe(0);
      expect(stats.deliveriesByEvent).toEqual({});
      expect(stats.deliveriesByStatus).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    test('should get rate limit status', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        rateLimitPerMinute: 100,
      });

      const status = manager.getRateLimitStatus(webhook.id);
      
      expect(status).not.toBeNull();
      expect(status?.remaining).toBe(100);
      expect(status?.resetAt).toBeInstanceOf(Date);
    });

    test('should return null for webhook without rate limit', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        rateLimitPerMinute: undefined,
      });

      const status = manager.getRateLimitStatus(webhook.id);
      expect(status).toBeNull();
    });
  });

  describe('Export/Import', () => {
    test('should export webhooks', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'], name: 'Hook 1' });
      manager.create({ url: 'https://example.com/hook2', events: ['*'], name: 'Hook 2' });

      const exported = manager.export();
      
      expect(exported).toHaveLength(2);
      expect(exported[0].name).toBeDefined();
    });

    test('should import webhooks', () => {
      const webhook1 = manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      const exported = manager.export();
      
      manager.clear();
      expect(manager.list()).toHaveLength(0);

      const imported = manager.import(exported);
      expect(imported).toBe(1);
      expect(manager.list()).toHaveLength(1);
    });

    test('should not import duplicates', () => {
      const webhook = manager.create({ url: 'https://example.com/hook1', events: ['*'] });
      const exported = manager.export();

      // Try to import same webhooks again
      const imported = manager.import(exported);
      expect(imported).toBe(0);
      expect(manager.list()).toHaveLength(1);
    });
  });

  describe('URL Validation', () => {
    test('should validate valid HTTPS URL', async () => {
      const result = await manager.validateUrl('https://example.com/webhook');
      expect(result.valid).toBe(true);
    });

    test('should reject invalid protocol', async () => {
      const result = await manager.validateUrl('ftp://example.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTP or HTTPS');
    });

    test('should reject invalid URL format', async () => {
      const result = await manager.validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });
  });
});
