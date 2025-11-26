/**
 * Analytics Module Example
 *
 * Demonstrates statistics, reporting, and data export
 *
 * Run with: npx ts-node examples/analytics.ts
 */

import * as fs from 'fs';
import {
  RoboxLayer,
  InMemoryStorage,
  AnalyticsManager,
  TransactionType,
  TimePeriod,
  ReportType,
} from '../src';

async function main() {
  console.log('📊 Robox Analytics Example\n');

  // Initialize
  const robox = new RoboxLayer({ storage: new InMemoryStorage() });
  const analytics = new AnalyticsManager(robox);

  // ============================================
  // Setup: Create test data
  // ============================================

  console.log('📦 Creating test data...\n');

  // Create accounts
  const accounts = [
    { id: 'hub', name: 'Central Hub', balance: 100000 },
    { id: 'factory-1', name: 'Factory Alpha', balance: 5000 },
    { id: 'factory-2', name: 'Factory Beta', balance: 3000 },
    { id: 'robot-a', name: 'Assembly Bot A', balance: 100 },
    { id: 'robot-b', name: 'Assembly Bot B', balance: 100 },
    { id: 'robot-c', name: 'Delivery Bot C', balance: 50 },
    { id: 'charger', name: 'Charging Station', balance: 0 },
  ];

  for (const acc of accounts) {
    await robox.createRobotAccount({ id: acc.id, name: acc.name });
    if (acc.balance > 0) {
      await robox.credit(acc.id, acc.balance);
    }
  }

  console.log(`   Created ${accounts.length} accounts\n`);

  // Create varied transactions
  const transactions = [
    // Hub distributes to factories
    { from: 'hub', to: 'factory-1', amount: 5000, type: TransactionType.TASK_PAYMENT },
    { from: 'hub', to: 'factory-2', amount: 3000, type: TransactionType.TASK_PAYMENT },

    // Factories pay robots
    { from: 'factory-1', to: 'robot-a', amount: 500, type: TransactionType.TASK_PAYMENT },
    { from: 'factory-1', to: 'robot-b', amount: 450, type: TransactionType.TASK_PAYMENT },
    { from: 'factory-2', to: 'robot-c', amount: 300, type: TransactionType.TASK_PAYMENT },

    // Robots pay for energy
    { from: 'robot-a', to: 'charger', amount: 50, type: TransactionType.ENERGY_PAYMENT },
    { from: 'robot-b', to: 'charger', amount: 45, type: TransactionType.ENERGY_PAYMENT },
    { from: 'robot-c', to: 'charger', amount: 30, type: TransactionType.ENERGY_PAYMENT },

    // More factory activities
    { from: 'factory-1', to: 'robot-a', amount: 600, type: TransactionType.COMPUTE_PAYMENT },
    { from: 'factory-1', to: 'robot-b', amount: 550, type: TransactionType.DATA_PAYMENT },
    { from: 'factory-2', to: 'robot-c', amount: 200, type: TransactionType.BANDWIDTH_PAYMENT },

    // Inter-robot transfers
    { from: 'robot-a', to: 'robot-b', amount: 100, type: TransactionType.DATA_PAYMENT },
    { from: 'robot-b', to: 'robot-c', amount: 75, type: TransactionType.STORAGE_PAYMENT },
  ];

  for (const tx of transactions) {
    await robox.transfer(tx);
  }

  console.log(`   Created ${transactions.length} transactions\n`);

  // ============================================
  // Basic Statistics
  // ============================================

  console.log('📈 Basic Statistics:\n');

  const stats = await analytics.getStats();

  console.log(`   Total transactions: ${stats.totalTransactions}`);
  console.log(`   Total volume: ${stats.totalVolume.toLocaleString()} credits`);
  console.log(`   Average transaction: ${stats.averageAmount.toFixed(2)} credits`);
  console.log(`   Median transaction: ${stats.medianAmount} credits`);
  console.log(`   Min/Max: ${stats.minAmount} / ${stats.maxAmount} credits`);
  console.log(`   Std deviation: ${stats.standardDeviation.toFixed(2)} credits\n`);

  console.log('   Transactions by type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    const volume = stats.volumeByType[type];
    console.log(`   - ${type}: ${count} txs (${volume.toLocaleString()} credits)`);
  }

  // ============================================
  // Top Lists
  // ============================================

  console.log('\n🏆 Top Spenders:\n');

  const topSpenders = await analytics.topSpenders({ limit: 5 });
  for (let i = 0; i < topSpenders.length; i++) {
    const s = topSpenders[i];
    console.log(
      `   ${i + 1}. ${s.accountName || s.accountId}: ${s.amount.toLocaleString()} credits (${s.percentage.toFixed(1)}%)`
    );
  }

  console.log('\n📥 Top Receivers:\n');

  const topReceivers = await analytics.topReceivers({ limit: 5 });
  for (let i = 0; i < topReceivers.length; i++) {
    const r = topReceivers[i];
    console.log(
      `   ${i + 1}. ${r.accountName || r.accountId}: ${r.amount.toLocaleString()} credits (${r.percentage.toFixed(1)}%)`
    );
  }

  console.log('\n⚡ Most Active:\n');

  const topActive = await analytics.topActive({ limit: 5 });
  for (let i = 0; i < topActive.length; i++) {
    const a = topActive[i];
    console.log(
      `   ${i + 1}. ${a.accountName || a.accountId}: ${a.transactionCount} transactions`
    );
  }

  // ============================================
  // Account Analysis
  // ============================================

  console.log('\n👤 Account Activity Analysis:\n');

  const factoryActivity = await analytics.getAccountActivity('factory-1');
  console.log(`   ${factoryActivity.accountName}:`);
  console.log(`   - Total sent: ${factoryActivity.totalSent.toLocaleString()} credits`);
  console.log(`   - Total received: ${factoryActivity.totalReceived.toLocaleString()} credits`);
  console.log(`   - Net flow: ${factoryActivity.netFlow.toLocaleString()} credits`);
  console.log(`   - Transaction count: ${factoryActivity.transactionCount}`);
  console.log(`   - Avg transaction: ${factoryActivity.averageTransactionSize.toFixed(2)} credits`);
  console.log(`   - Most common type: ${factoryActivity.mostCommonType}`);

  // ============================================
  // Money Flow Analysis
  // ============================================

  console.log('\n💸 Money Flow from Hub:\n');

  const flow = await analytics.moneyFlow({
    from: 'hub',
    depth: 3,
    minAmount: 100,
  });

  function printFlow(node: typeof flow, indent = 0) {
    const prefix = '   ' + '  '.repeat(indent);
    const name = node.accountName || node.accountId;
    console.log(`${prefix}${name}`);
    console.log(`${prefix}  ↓ Out: ${node.outgoing.toLocaleString()} | ↑ In: ${node.incoming.toLocaleString()}`);

    if (node.children) {
      for (const child of node.children.slice(0, 3)) {
        printFlow(child, indent + 1);
      }
    }
  }

  printFlow(flow);

  // ============================================
  // Time Series
  // ============================================

  console.log('\n📅 Volume Time Series (by day):\n');

  const volumeSeries = await analytics.getVolumeSeries({
    groupBy: TimePeriod.DAY,
  });

  for (const point of volumeSeries.slice(0, 5)) {
    const date = point.timestamp.toISOString().split('T')[0];
    console.log(`   ${date}: ${point.value.toLocaleString()} credits (${point.count} txs)`);
  }

  // ============================================
  // Trend Analysis
  // ============================================

  console.log('\n📉 Trend Analysis:\n');

  const volumeTrend = await analytics.analyzeTrend('volume', {
    groupBy: TimePeriod.DAY,
  });

  console.log(`   Volume trend: ${volumeTrend.trend}`);
  console.log(`   Change: ${volumeTrend.changePercent.toFixed(1)}%`);
  console.log(`   Slope: ${volumeTrend.slope}`);

  if (volumeTrend.anomalies && volumeTrend.anomalies.length > 0) {
    console.log(`   Anomalies detected: ${volumeTrend.anomalies.length}`);
  }

  // ============================================
  // Export Data
  // ============================================

  console.log('\n💾 Exporting Data...\n');

  // Export to CSV
  const csvPath = '/tmp/robox-transactions.csv';
  await analytics.exportCSV(csvPath);
  console.log(`   ✅ Exported to CSV: ${csvPath}`);

  // Export to JSON with full data
  const jsonPath = '/tmp/robox-full-export.json';
  await analytics.exportJSON({
    path: jsonPath,
    includeAccounts: true,
    includeEscrows: true,
  });
  console.log(`   ✅ Exported to JSON: ${jsonPath}`);

  // Show CSV preview
  console.log('\n   CSV Preview:');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(0, 5);
  for (const line of lines) {
    console.log(`   ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
  }

  // ============================================
  // Generate Reports
  // ============================================

  console.log('\n📋 Generating Reports...\n');

  // Summary report
  const summaryReport = await analytics.generateReport({
    type: ReportType.SUMMARY,
    title: 'Daily Operations Summary',
  });

  console.log(`   Report: ${summaryReport.title}`);
  console.log(`   Generated: ${summaryReport.generatedAt.toISOString()}`);
  console.log(`   Total Volume: ${summaryReport.summary.totalVolume.toLocaleString()} credits`);
  console.log(`   Transactions: ${summaryReport.summary.totalTransactions}`);

  if (summaryReport.topSpenders) {
    console.log(`\n   Top 3 Spenders in Report:`);
    for (const s of summaryReport.topSpenders.slice(0, 3)) {
      console.log(`   - ${s.accountName}: ${s.amount.toLocaleString()} credits`);
    }
  }

  // Detailed report
  const detailedReport = await analytics.generateReport({
    type: ReportType.DETAILED,
    title: 'Detailed Activity Report',
  });

  console.log(`\n   Detailed Report: ${detailedReport.title}`);
  console.log(`   Account activities: ${detailedReport.accountActivities?.length || 0}`);

  // Comparison report (simulated periods)
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const comparisonReport = await analytics.generateReport({
    type: ReportType.COMPARISON,
    title: 'Period Comparison',
    from: dayAgo,
    to: now,
    compareTo: {
      from: twoDaysAgo,
      to: dayAgo,
    },
  });

  console.log(`\n   Comparison Report: ${comparisonReport.title}`);
  if (comparisonReport.comparison) {
    console.log(`   Current period volume: ${comparisonReport.comparison.current.totalVolume.toLocaleString()}`);
    console.log(`   Previous period volume: ${comparisonReport.comparison.previous.totalVolume.toLocaleString()}`);
    console.log(`   Volume change: ${comparisonReport.comparison.changes.volumeChange.toFixed(1)}%`);
  }

  // ============================================
  // Final Summary
  // ============================================

  console.log('\n' + '='.repeat(50));
  console.log('📊 Analytics Example Complete!');
  console.log('='.repeat(50));
  console.log(`
Key Features Demonstrated:
  ✅ Basic statistics (volume, avg, median, std dev)
  ✅ Breakdown by transaction type
  ✅ Top spenders, receivers, and active accounts
  ✅ Individual account activity analysis
  ✅ Money flow tree visualization
  ✅ Time series with configurable periods
  ✅ Trend detection with anomaly detection
  ✅ CSV and JSON export
  ✅ Summary, detailed, and comparison reports
`);

  // Cleanup
  try {
    fs.unlinkSync(csvPath);
    fs.unlinkSync(jsonPath);
  } catch {
    // Ignore cleanup errors
  }
}

main().catch(console.error);
