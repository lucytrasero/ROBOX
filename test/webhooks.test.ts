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

    test('should create webhook with secret', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
        secret: 'my-secret-key',
      });

      expect(webhook.secret).toBe('my-secret-key');
    });

    test('should get webhook by id', () => {
      const created = manager.create({
        url: 'https://example.com/webhook',
        events: [EventType.ACCOUNT_CREATED],
      });

      const fetched = manager.get(created.id);
      expect(fetched).toEqual(created);
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

    test('should update webhook', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: [EventType.TRANSFER_COMPLETED],
      });

      const updated = manager.update(webhook.id, {
        url: 'https://example.com/new-webhook',
        events: [EventType.TRANSFER_COMPLETED, EventType.ESCROW_CREATED],
      });

      expect(updated?.url).toBe('https://example.com/new-webhook');
      expect(updated?.events).toHaveLength(2);
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
  });

  describe('Webhook Matching', () => {
    test('should match wildcard webhooks', () => {
      const webhook = manager.create({
        url: 'https://example.com/webhook',
        events: ['*'],
      });

      const webhooks = manager.list();
      expect(webhooks).toHaveLength(1);
    });

    test('should match specific event webhooks', () => {
      manager.create({
        url: 'https://example.com/transfers',
        events: [EventType.TRANSFER_COMPLETED],
      });

      manager.create({
        url: 'https://example.com/accounts',
        events: [EventType.ACCOUNT_CREATED],
      });

      const webhooks = manager.list();
      expect(webhooks).toHaveLength(2);
    });
  });

  describe('Statistics', () => {
    test('should return stats', () => {
      manager.create({ url: 'https://example.com/hook1', events: ['*'], enabled: true });
      manager.create({ url: 'https://example.com/hook2', events: ['*'], enabled: false });

      const stats = manager.getStats();

      expect(stats.totalWebhooks).toBe(2);
      expect(stats.activeWebhooks).toBe(1);
    });
  });

  describe('Signature Verification', () => {
    test('should verify valid signature', () => {
      const payload = '{"event":"test","data":{}}';
      const secret = 'my-secret';

      // Create signature
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const isValid = WebhookManager.verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    test('should reject invalid signature', () => {
      const payload = '{"event":"test","data":{}}';
      const secret = 'my-secret';

      const isValid = WebhookManager.verifySignature(payload, 'invalid-signature', secret);
      expect(isValid).toBe(false);
    });
  });

  describe('Delivery History', () => {
    test('should list deliveries', () => {
      // Initially empty
      const deliveries = manager.listDeliveries();
      expect(deliveries).toHaveLength(0);
    });

    test('should filter deliveries by status', () => {
      const deliveries = manager.listDeliveries({
        status: WebhookDeliveryStatus.SUCCESS,
      });
      expect(deliveries).toHaveLength(0);
    });
  });
});
