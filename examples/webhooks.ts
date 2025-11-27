/**
 * Example: Advanced Webhook Usage
 *
 * This example demonstrates:
 * - Creating webhooks with filters
 * - Event dispatching
 * - Rate limiting
 * - Health monitoring
 * - Signature verification
 *
 * Run: npx ts-node examples/webhooks.ts
 */

import {
  WebhookManager,
  WebhookDeliveryStatus,
  EventType,
  RoboxEvent,
} from '../src';

async function main() {
  console.log('='.repeat(60));
  console.log('WEBHOOK MANAGER DEMO');
  console.log('='.repeat(60));

  // Initialize webhook manager with logging
  const webhookManager = new WebhookManager({
    debug: () => {},
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
  });

  console.log('\n📌 Creating Webhooks...\n');

  // 1. Basic webhook - receives all events
  const allEventsHook = webhookManager.create({
    name: 'All Events Webhook',
    url: 'https://httpbin.org/post',
    events: ['*'],
    secret: 'my-secret-key-123',
    metadata: { environment: 'demo' },
  });
  console.log(`✅ Created: ${allEventsHook.name} (ID: ${allEventsHook.id})`);

  // 2. Transfer-only webhook with amount filter
  const transferHook = webhookManager.create({
    name: 'Large Transfers Alert',
    url: 'https://httpbin.org/post',
    events: [EventType.TRANSFER_COMPLETED],
    minAmountThreshold: 1000, // Only transfers >= 1000
    rateLimitPerMinute: 10,
    robotId: 'robot-001', // Owned by this robot
  });
  console.log(`✅ Created: ${transferHook.name} (ID: ${transferHook.id})`);

  // 3. Webhook filtered by specific robots
  const robotFilteredHook = webhookManager.create({
    name: 'VIP Robot Monitor',
    url: 'https://httpbin.org/post',
    events: [EventType.TRANSFER_COMPLETED, EventType.ESCROW_CREATED],
    filterRobotIds: ['vip-robot-1', 'vip-robot-2'],
    transactionTypes: ['TASK_PAYMENT', 'ENERGY_PAYMENT'],
    autoDisableAfterFailures: 5,
  });
  console.log(`✅ Created: ${robotFilteredHook.name} (ID: ${robotFilteredHook.id})`);

  console.log('\n📋 Listing Webhooks...\n');

  const allWebhooks = webhookManager.list();
  console.log(`Total webhooks: ${allWebhooks.length}`);
  allWebhooks.forEach(w => {
    console.log(`  - ${w.name}: ${w.events.join(', ')}`);
  });

  console.log('\n🧪 Testing Webhook...\n');

  const testResult = await webhookManager.test(allEventsHook.id, {
    data: { message: 'Hello from test!' },
  });
  console.log(`Test result: ${testResult.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Duration: ${testResult.durationMs}ms`);
  if (testResult.statusCode) {
    console.log(`  Status: ${testResult.statusCode}`);
  }
  if (testResult.error) {
    console.log(`  Error: ${testResult.error}`);
  }

  console.log('\n📤 Dispatching Events...\n');

  // Dispatch a transfer event
  const transferEvent: RoboxEvent = {
    type: EventType.TRANSFER_COMPLETED,
    data: {
      id: 'tx_123456',
      from: 'vip-robot-1',
      to: 'robot-002',
      amount: 5000,
      type: 'TASK_PAYMENT',
    },
    timestamp: new Date(),
  };

  await webhookManager.dispatch(transferEvent, {
    fromRobotId: 'vip-robot-1',
    toRobotId: 'robot-002',
    amount: 5000,
    transactionType: 'TASK_PAYMENT',
  });
  console.log('✅ Transfer event dispatched');

  // Dispatch an escrow event
  const escrowEvent: RoboxEvent = {
    type: EventType.ESCROW_CREATED,
    data: {
      id: 'escrow_789',
      from: 'robot-003',
      to: 'robot-004',
      amount: 500,
    },
    timestamp: new Date(),
  };

  await webhookManager.dispatch(escrowEvent, {
    fromRobotId: 'robot-003',
    amount: 500,
  });
  console.log('✅ Escrow event dispatched');

  // Wait a bit for deliveries
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n📊 Delivery History...\n');

  const deliveries = webhookManager.listDeliveries({ limit: 10 });
  console.log(`Total deliveries: ${deliveries.length}`);
  deliveries.forEach(d => {
    console.log(`  - ${d.event}: ${d.status} (${d.attempts} attempts, ${d.durationMs ?? '?'}ms)`);
  });

  console.log('\n❤️ Health Check...\n');

  const health = webhookManager.getAllHealth();
  health.forEach(h => {
    const status = h.healthy ? '✅' : '❌';
    console.log(`${status} ${h.name ?? h.id}`);
    console.log(`   URL: ${h.url}`);
    console.log(`   Success Rate: ${(h.successRate * 100).toFixed(1)}%`);
    console.log(`   Consecutive Failures: ${h.consecutiveFailures}`);
    if (h.averageResponseTime) {
      console.log(`   Avg Response: ${h.averageResponseTime.toFixed(0)}ms`);
    }
  });

  console.log('\n📈 Statistics...\n');

  const stats = webhookManager.getStats();
  console.log(`Total Webhooks: ${stats.totalWebhooks}`);
  console.log(`Active Webhooks: ${stats.activeWebhooks}`);
  console.log(`Total Deliveries: ${stats.totalDeliveries}`);
  console.log(`Successful: ${stats.successfulDeliveries}`);
  console.log(`Failed: ${stats.failedDeliveries}`);
  console.log(`Pending: ${stats.pendingDeliveries}`);

  console.log('\n🔧 Management Operations...\n');

  // Update webhook
  webhookManager.update(transferHook.id, {
    minAmountThreshold: 500, // Lower threshold
    name: 'Updated Transfer Alert',
  });
  console.log('✅ Updated transfer webhook');

  // Disable webhook
  webhookManager.disable(robotFilteredHook.id);
  console.log('✅ Disabled VIP webhook');

  // Get rate limit status
  const rateLimit = webhookManager.getRateLimitStatus(transferHook.id);
  if (rateLimit) {
    console.log(`Rate limit remaining: ${rateLimit.remaining}`);
    console.log(`Resets at: ${rateLimit.resetAt.toISOString()}`);
  }

  console.log('\n🔐 Signature Verification Example...\n');

  // Simulating receiving a webhook
  const incomingPayload = JSON.stringify({
    id: 'payload_123',
    event: 'transfer.completed',
    data: { amount: 100 },
    timestamp: new Date().toISOString(),
  });
  const secret = 'my-secret-key-123';
  const signature = WebhookManager.createSignature(incomingPayload, secret);
  
  console.log(`Payload: ${incomingPayload.substring(0, 50)}...`);
  console.log(`Signature: ${signature}`);
  
  const isValid = WebhookManager.verifySignature(incomingPayload, signature, secret);
  console.log(`Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

  console.log('\n🗑️ Cleanup...\n');

  // Export before cleanup
  const backup = webhookManager.export();
  console.log(`Exported ${backup.length} webhooks for backup`);

  // Clear old deliveries
  const cleared = webhookManager.clearOldDeliveries(new Date(Date.now() - 3600000));
  console.log(`Cleared ${cleared} old deliveries`);

  // Delete a webhook
  webhookManager.delete(robotFilteredHook.id);
  console.log('✅ Deleted VIP webhook');

  console.log('\n' + '='.repeat(60));
  console.log('DEMO COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
