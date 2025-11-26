/**
 * Marketplace Module Example
 *
 * Demonstrates how to use the marketplace for robot services
 *
 * Run with: npx ts-node examples/marketplace.ts
 */

import {
  RoboxLayer,
  InMemoryStorage,
  MarketplaceManager,
  ServiceCategory,
  MarketplaceEventType,
} from '../src';

async function main() {
  console.log('🏪 Robox Marketplace Example\n');

  // Initialize
  const robox = new RoboxLayer({ storage: new InMemoryStorage() });
  const marketplace = new MarketplaceManager(robox, {
    feePercentage: 2.5,
  });

  // ============================================
  // Setup: Create robot accounts
  // ============================================

  console.log('📦 Setting up accounts...\n');

  // Providers
  const charger = await robox.createRobotAccount({
    id: 'charger-bot',
    name: 'ChargeMaster 3000',
    roles: ['provider'],
  });

  const storage = await robox.createRobotAccount({
    id: 'storage-bot',
    name: 'DataVault Pro',
    roles: ['provider'],
  });

  // Consumers
  const vacuum = await robox.createRobotAccount({
    id: 'vacuum-bot',
    name: 'CleanSweep X',
    roles: ['consumer'],
  });
  await robox.credit('vacuum-bot', 500);

  const drone = await robox.createRobotAccount({
    id: 'drone-bot',
    name: 'SkyScout Alpha',
    roles: ['consumer'],
  });
  await robox.credit('drone-bot', 300);

  console.log('✅ Created accounts:');
  console.log(`   - ${charger.name} (provider)`);
  console.log(`   - ${storage.name} (provider)`);
  console.log(`   - ${vacuum.name} (consumer, balance: 500)`);
  console.log(`   - ${drone.name} (consumer, balance: 300)\n`);

  // ============================================
  // Subscribe to events
  // ============================================

  marketplace.on(MarketplaceEventType.ORDER_COMPLETED, (event) => {
    console.log(`📬 Event: Order completed!`);
  });

  marketplace.on(MarketplaceEventType.REVIEW_CREATED, (event) => {
    console.log(`📬 Event: New review received!`);
  });

  // ============================================
  // List services
  // ============================================

  console.log('📋 Listing services...\n');

  const chargingService = await marketplace.listService({
    providerId: 'charger-bot',
    name: 'Fast Charging',
    description: 'Quick battery charging in under 30 minutes',
    price: 25,
    category: ServiceCategory.ENERGY,
    availability: {
      totalSlots: 5,
      schedule: '24/7',
      location: {
        lat: 52.52,
        lng: 13.405, // Berlin
        radius: 5000,
      },
    },
    duration: 30,
    tags: ['fast', 'reliable', 'eco-friendly'],
  });

  const premiumCharging = await marketplace.listService({
    providerId: 'charger-bot',
    name: 'Premium Charging + Diagnostics',
    description: 'Full charge with battery health check',
    price: 50,
    category: ServiceCategory.ENERGY,
    availability: { totalSlots: 2, schedule: 'weekdays' },
    duration: 60,
    tags: ['premium', 'diagnostics'],
  });

  const storageService = await marketplace.listService({
    providerId: 'storage-bot',
    name: 'Secure Data Backup',
    description: 'Encrypted cloud backup for sensor data',
    price: 15,
    category: ServiceCategory.STORAGE,
    availability: { totalSlots: 100 },
    tags: ['secure', 'encrypted', 'backup'],
  });

  console.log('✅ Listed services:');
  console.log(`   - ${chargingService.name} (${chargingService.price} credits)`);
  console.log(`   - ${premiumCharging.name} (${premiumCharging.price} credits)`);
  console.log(`   - ${storageService.name} (${storageService.price} credits)\n`);

  // ============================================
  // Search services
  // ============================================

  console.log('🔍 Searching for services...\n');

  // Search by category
  const energyServices = await marketplace.search({
    category: ServiceCategory.ENERGY,
  });
  console.log(`   Found ${energyServices.length} energy services`);

  // Search by price range
  const affordableServices = await marketplace.search({
    maxPrice: 30,
  });
  console.log(`   Found ${affordableServices.length} services under 30 credits`);

  // Search by query
  const fastServices = await marketplace.search({
    query: 'fast',
  });
  console.log(`   Found ${fastServices.length} services matching "fast"`);

  // Sort by price
  const sortedByPrice = await marketplace.search({
    sortBy: 'price',
    sortOrder: 'asc',
  });
  console.log(`   Cheapest service: ${sortedByPrice[0].name} (${sortedByPrice[0].price} credits)\n`);

  // ============================================
  // Purchase services
  // ============================================

  console.log('🛒 Making purchases...\n');

  // Vacuum bot purchases charging
  const order1 = await marketplace.purchase({
    serviceId: chargingService.id,
    buyerId: 'vacuum-bot',
    notes: 'Please charge to 100%',
  });

  console.log(`   Order #${order1.id.slice(0, 8)}...`);
  console.log(`   - Service: ${chargingService.name}`);
  console.log(`   - Total: ${order1.totalPrice} credits (+ ${order1.fee} fee)`);
  console.log(`   - Status: ${order1.status}`);
  console.log(`   - Escrow ID: ${order1.escrowId?.slice(0, 8)}...\n`);

  // Drone bot purchases storage
  const order2 = await marketplace.purchase({
    serviceId: storageService.id,
    buyerId: 'drone-bot',
    quantity: 2,
  });

  console.log(`   Order #${order2.id.slice(0, 8)}...`);
  console.log(`   - Service: ${storageService.name} x${order2.quantity}`);
  console.log(`   - Total: ${order2.totalPrice} credits\n`);

  // ============================================
  // Process orders
  // ============================================

  console.log('⚙️ Processing orders...\n');

  // Start the first order
  await marketplace.startOrder(order1.id);
  console.log(`   Order #${order1.id.slice(0, 8)}: Started`);

  // Complete the first order (releases escrow)
  const completed = await marketplace.completeOrder(order1.id);
  console.log(`   Order #${order1.id.slice(0, 8)}: Completed`);
  console.log(`   Transaction ID: ${completed.transactionId?.slice(0, 8)}...`);

  // Check provider received payment
  const chargerAccount = await robox.getRobotAccount('charger-bot');
  console.log(`   ${charger.name} balance: ${chargerAccount?.balance} credits\n`);

  // Complete the second order
  await marketplace.completeOrder(order2.id);
  console.log(`   Order #${order2.id.slice(0, 8)}: Completed\n`);

  // ============================================
  // Reviews
  // ============================================

  console.log('⭐ Adding reviews...\n');

  const review1 = await marketplace.createReview({
    orderId: order1.id,
    reviewerId: 'vacuum-bot',
    rating: 5,
    comment: 'Excellent service! Battery charged quickly and efficiently.',
  });

  console.log(`   Review for ${chargingService.name}:`);
  console.log(`   - Rating: ${'⭐'.repeat(review1.rating)}`);
  console.log(`   - Comment: "${review1.comment}"\n`);

  // Provider responds
  await marketplace.respondToReview(
    review1.id,
    'Thank you for your feedback! Happy to serve you again.'
  );
  console.log('   Provider responded to review\n');

  const review2 = await marketplace.createReview({
    orderId: order2.id,
    reviewerId: 'drone-bot',
    rating: 4,
    comment: 'Good storage service, fast upload speeds.',
  });

  // ============================================
  // Check updated service ratings
  // ============================================

  console.log('📊 Service ratings updated:\n');

  const updatedCharging = await marketplace.getService(chargingService.id);
  console.log(`   ${updatedCharging?.name}: ${updatedCharging?.rating}⭐ (${updatedCharging?.totalReviews} reviews)`);

  const updatedStorage = await marketplace.getService(storageService.id);
  console.log(`   ${updatedStorage?.name}: ${updatedStorage?.rating}⭐ (${updatedStorage?.totalReviews} reviews)\n`);

  // ============================================
  // Marketplace statistics
  // ============================================

  console.log('📈 Marketplace Statistics:\n');

  const stats = await marketplace.getStats();
  console.log(`   Total services: ${stats.totalServices}`);
  console.log(`   Active services: ${stats.activeServices}`);
  console.log(`   Total orders: ${stats.totalOrders}`);
  console.log(`   Completed orders: ${stats.completedOrders}`);
  console.log(`   Total volume: ${stats.totalVolume} credits`);
  console.log(`   Total fees collected: ${stats.totalFees} credits`);
  console.log(`   Average rating: ${stats.averageRating}⭐`);
  console.log(`   Total reviews: ${stats.totalReviews}`);

  if (stats.topCategories.length > 0) {
    console.log('\n   Top categories:');
    for (const cat of stats.topCategories) {
      console.log(`   - ${cat.category}: ${cat.count} services`);
    }
  }

  // ============================================
  // List provider's orders
  // ============================================

  console.log('\n📦 Charger Bot Order History:\n');

  const providerOrders = await marketplace.listOrders({
    providerId: 'charger-bot',
  });

  for (const order of providerOrders) {
    console.log(`   - Order #${order.id.slice(0, 8)}: ${order.totalPrice} credits (${order.status})`);
  }

  // ============================================
  // Final balances
  // ============================================

  console.log('\n💰 Final Balances:\n');

  for (const id of ['charger-bot', 'storage-bot', 'vacuum-bot', 'drone-bot']) {
    const account = await robox.getRobotAccount(id);
    console.log(`   ${account?.name}: ${account?.balance.toFixed(2)} credits`);
  }

  console.log('\n✅ Marketplace example complete!');
}

main().catch(console.error);
