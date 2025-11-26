/**
 * Example: Basic usage of robox-clearing
 *
 * Run: npx ts-node examples/basic.ts
 */

import {
  RoboxLayer,
  InMemoryStorage,
  RobotRole,
  TransactionType,
  EventType,
  RoboxForbiddenError,
  RoboxInsufficientFundsError,
} from '../src';

async function main() {
  console.log('='.repeat(60));
  console.log('ROBOX-CLEARING DEMO');
  console.log('='.repeat(60));

  // Initialize with logging and audit
  const robox = new RoboxLayer({
    storage: new InMemoryStorage(),
    enableAuditLog: true,
    logger: {
      debug: () => {},
      info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
      warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
      error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
    },
    // 1% fee on all transfers
    feeCalculator: {
      calculate: (amount) => Math.floor(amount * 0.01),
    },
  });

  // Subscribe to events
  robox.on(EventType.TRANSFER_COMPLETED, (event) => {
    console.log(`[EVENT] Transfer completed: ${(event.data as { id: string }).id}`);
  });

  console.log('\n📦 Creating Robot Accounts...\n');

  // Create admin
  const admin = await robox.createRobotAccount({
    id: 'admin-bot',
    name: 'System Administrator',
    roles: [RobotRole.ADMIN],
  });
  console.log(`✅ Created admin: ${admin.id}`);

  // Create worker (consumer)
  const worker = await robox.createRobotAccount({
    id: 'worker-001',
    name: 'Warehouse Worker Bot',
    roles: [RobotRole.CONSUMER],
    tags: ['warehouse', 'priority'],
    limits: {
      maxTransferAmount: 500,
      minBalance: 50,
    },
  });
  console.log(`✅ Created worker: ${worker.id}`);

  // Create service provider
  const charger = await robox.createRobotAccount({
    id: 'charger-001',
    name: 'Charging Station Alpha',
    roles: [RobotRole.PROVIDER],
    tags: ['infrastructure'],
  });
  console.log(`✅ Created charger: ${charger.id}`);

  // Create parts vendor
  const vendor = await robox.createRobotAccount({
    id: 'vendor-001',
    name: 'Parts Vendor Bot',
    roles: [RobotRole.PROVIDER, RobotRole.CONSUMER],
    initialBalance: 500,
  });
  console.log(`✅ Created vendor: ${vendor.id}`);

  console.log('\n💰 Funding Accounts...\n');

  // Admin credits worker's account
  await robox.credit('worker-001', 1000, {
    reason: 'Initial funding',
    initiatedBy: 'admin-bot',
  });
  console.log(`💵 Credited worker-001 with 1000 units`);

  console.log('\n⚡ Making Payments...\n');

  // Worker pays for charging
  const chargeTx = await robox.transfer({
    from: 'worker-001',
    to: 'charger-001',
    amount: 150,
    type: TransactionType.ENERGY_PAYMENT,
    meta: { kwh: 5, duration: 1800 },
  });
  console.log(`⚡ Energy payment: ${chargeTx.amount} (fee: ${chargeTx.fee})`);

  // Worker buys parts
  const partsTx = await robox.transfer({
    from: 'worker-001',
    to: 'vendor-001',
    amount: 200,
    type: TransactionType.PARTS_PAYMENT,
    meta: { partId: 'servo-x1', quantity: 2 },
  });
  console.log(`🔧 Parts payment: ${partsTx.amount} (fee: ${partsTx.fee})`);

  console.log('\n📊 Balances After Payments:\n');
  console.log(`  Worker: ${await robox.getBalance('worker-001')}`);
  console.log(`  Charger: ${await robox.getBalance('charger-001')}`);
  console.log(`  Vendor: ${await robox.getBalance('vendor-001')}`);

  console.log('\n🔒 Creating Escrow...\n');

  // Worker creates escrow for a repair service
  const escrow = await robox.createEscrow({
    from: 'worker-001',
    to: 'vendor-001',
    amount: 300,
    condition: 'repair_completed',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  console.log(`🔒 Escrow created: ${escrow.id}`);

  const workerBalance = await robox.getTotalBalance('worker-001');
  console.log(`   Worker balance: available=${workerBalance.available}, frozen=${workerBalance.frozen}`);

  // Release escrow
  const escrowTx = await robox.releaseEscrow(escrow.id, 'admin-bot');
  console.log(`✅ Escrow released: ${escrowTx.id}`);

  console.log('\n📦 Batch Transfer...\n');

  // Create more recipients
  for (let i = 1; i <= 3; i++) {
    await robox.createRobotAccount({
      id: `helper-${i}`,
      roles: [RobotRole.PROVIDER],
    });
  }

  // Vendor distributes rewards
  const batch = await robox.batchTransfer({
    transfers: [
      { from: 'vendor-001', to: 'helper-1', amount: 50, type: TransactionType.REWARD },
      { from: 'vendor-001', to: 'helper-2', amount: 75, type: TransactionType.REWARD },
      { from: 'vendor-001', to: 'helper-3', amount: 100, type: TransactionType.REWARD },
    ],
    initiatedBy: 'admin-bot',
  });
  console.log(`📦 Batch completed: ${batch.successCount}/${batch.transfers.length} succeeded`);

  console.log('\n📈 Statistics...\n');

  const stats = await robox.getStatistics();
  console.log(`  Total accounts: ${stats.totalAccounts}`);
  console.log(`  Total transactions: ${stats.totalTransactions}`);
  console.log(`  Total volume: ${stats.totalVolume}`);
  console.log(`  Total fees: ${stats.totalFees}`);
  console.log(`  Avg transaction: ${stats.averageTransactionAmount.toFixed(2)}`);

  console.log('\n🚫 Error Handling Demo...\n');

  // Try forbidden operation
  try {
    await robox.debit('worker-001', 100, { initiatedBy: 'worker-001' });
  } catch (error) {
    if (error instanceof RoboxForbiddenError) {
      console.log(`❌ Forbidden (${error.code}): ${error.reason}`);
    }
  }

  // Try insufficient funds
  try {
    await robox.transfer({
      from: 'worker-001',
      to: 'vendor-001',
      amount: 99999,
      type: TransactionType.TASK_PAYMENT,
    });
  } catch (error) {
    if (error instanceof RoboxInsufficientFundsError) {
      console.log(`❌ Insufficient funds: need ${error.required}, have ${error.available}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DEMO COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
