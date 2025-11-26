/**
 * Example: Escrow workflow
 *
 * Run: npx ts-node examples/escrow.ts
 */

import {
  RoboxLayer,
  InMemoryStorage,
  RobotRole,
  EscrowStatus,
  EventType,
} from '../src';

async function main() {
  console.log('='.repeat(60));
  console.log('ESCROW WORKFLOW DEMO');
  console.log('='.repeat(60));

  const robox = new RoboxLayer({
    storage: new InMemoryStorage(),
  });

  // Listen to escrow events
  robox.on(EventType.ESCROW_CREATED, (e) => {
    console.log(`[EVENT] Escrow created`);
  });
  robox.on(EventType.ESCROW_RELEASED, (e) => {
    console.log(`[EVENT] Escrow released`);
  });
  robox.on(EventType.ESCROW_REFUNDED, (e) => {
    console.log(`[EVENT] Escrow refunded`);
  });

  // Setup accounts
  const buyer = await robox.createRobotAccount({
    id: 'buyer',
    name: 'Purchasing Bot',
    initialBalance: 10000,
    roles: [RobotRole.CONSUMER],
  });

  const seller = await robox.createRobotAccount({
    id: 'seller',
    name: 'Repair Service Bot',
    roles: [RobotRole.PROVIDER],
  });

  const arbiter = await robox.createRobotAccount({
    id: 'arbiter',
    name: 'Dispute Resolution Bot',
    roles: [RobotRole.ADMIN],
  });

  console.log('\n📋 Scenario 1: Successful Trade\n');

  // Create escrow for repair service
  const escrow1 = await robox.createEscrow({
    from: 'buyer',
    to: 'seller',
    amount: 500,
    condition: 'repair_verified',
    meta: { serviceType: 'motor_replacement', orderId: 'ORD-001' },
  });

  console.log(`Created escrow: ${escrow1.id}`);
  console.log(`  Amount: ${escrow1.amount}`);
  console.log(`  Status: ${escrow1.status}`);

  // Check balances
  let buyerBalance = await robox.getTotalBalance('buyer');
  console.log(`\nBuyer balance: available=${buyerBalance.available}, frozen=${buyerBalance.frozen}`);

  // Seller completes service, arbiter releases escrow
  console.log('\n✅ Service completed, releasing escrow...');
  const tx = await robox.releaseEscrow(escrow1.id, 'arbiter');

  console.log(`Released! Transaction: ${tx.id}`);
  console.log(`  Seller received: ${tx.amount}`);

  buyerBalance = await robox.getTotalBalance('buyer');
  const sellerBalance = await robox.getBalance('seller');
  console.log(`\nFinal balances:`);
  console.log(`  Buyer: ${buyerBalance.available}`);
  console.log(`  Seller: ${sellerBalance}`);

  console.log('\n' + '-'.repeat(60));
  console.log('\n📋 Scenario 2: Cancelled Trade (Refund)\n');

  // Create another escrow
  const escrow2 = await robox.createEscrow({
    from: 'buyer',
    to: 'seller',
    amount: 1000,
    condition: 'parts_delivered',
    meta: { orderId: 'ORD-002' },
  });

  console.log(`Created escrow: ${escrow2.id}`);

  buyerBalance = await robox.getTotalBalance('buyer');
  console.log(`Buyer balance: available=${buyerBalance.available}, frozen=${buyerBalance.frozen}`);

  // Order cancelled, refund escrow
  console.log('\n❌ Order cancelled, refunding...');
  await robox.refundEscrow(escrow2.id, 'arbiter');

  buyerBalance = await robox.getTotalBalance('buyer');
  console.log(`\nBuyer balance after refund: ${buyerBalance.available}`);

  // Check escrow statuses
  const updatedEscrow1 = await robox.getEscrow(escrow1.id);
  const updatedEscrow2 = await robox.getEscrow(escrow2.id);

  console.log('\n📊 Escrow Statuses:');
  console.log(`  Escrow 1: ${updatedEscrow1?.status}`);
  console.log(`  Escrow 2: ${updatedEscrow2?.status}`);

  // List all pending escrows
  const pendingEscrows = await robox.listEscrows({ status: EscrowStatus.PENDING });
  console.log(`\nPending escrows: ${pendingEscrows.length}`);

  console.log('\n' + '='.repeat(60));
  console.log('DEMO COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
