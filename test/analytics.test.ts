import * as fs from 'fs';
import * as path from 'path';
import {
  RoboxLayer,
  InMemoryStorage,
  AnalyticsManager,
  TransactionType,
  TimePeriod,
  ExportFormat,
  ReportType,
} from '../src';

describe('AnalyticsManager', () => {
  let robox: RoboxLayer;
  let analytics: AnalyticsManager;
  const testOutputDir = '/tmp/robox-test-exports';

  beforeEach(async () => {
    robox = new RoboxLayer({ storage: new InMemoryStorage() });
    analytics = new AnalyticsManager(robox);

    // Create test accounts
    await robox.createRobotAccount({ id: 'hub', name: 'Central Hub' });
    await robox.createRobotAccount({ id: 'robot-1', name: 'Robot Alpha' });
    await robox.createRobotAccount({ id: 'robot-2', name: 'Robot Beta' });
    await robox.createRobotAccount({ id: 'robot-3', name: 'Robot Gamma' });

    // Fund accounts
    await robox.credit('hub', 10000, { initiatedBy: 'hub' });
    await robox.credit('robot-1', 1000, { initiatedBy: 'robot-1' });
    await robox.credit('robot-2', 500, { initiatedBy: 'robot-2' });

    // Create test directory
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testOutputDir)) {
      const files = fs.readdirSync(testOutputDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testOutputDir, file));
      }
    }
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Create some transactions
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-2',
        amount: 200,
        type: TransactionType.ENERGY_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-1',
        to: 'robot-3',
        amount: 50,
        type: TransactionType.DATA_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-2',
        to: 'robot-3',
        amount: 75,
        type: TransactionType.COMPUTE_PAYMENT,
      });
    });

    it('should calculate basic statistics', async () => {
      const stats = await analytics.getStats();

      expect(stats.totalTransactions).toBe(4);
      expect(stats.totalVolume).toBe(425);
      expect(stats.averageAmount).toBeCloseTo(106.25, 2);
      expect(stats.minAmount).toBe(50);
      expect(stats.maxAmount).toBe(200);
    });

    it('should group transactions by type', async () => {
      const stats = await analytics.getStats();

      expect(stats.byType[TransactionType.TASK_PAYMENT]).toBe(1);
      expect(stats.byType[TransactionType.ENERGY_PAYMENT]).toBe(1);
      expect(stats.byType[TransactionType.DATA_PAYMENT]).toBe(1);
      expect(stats.byType[TransactionType.COMPUTE_PAYMENT]).toBe(1);
    });

    it('should calculate volume by type', async () => {
      const stats = await analytics.getStats();

      expect(stats.volumeByType[TransactionType.TASK_PAYMENT]).toBe(100);
      expect(stats.volumeByType[TransactionType.ENERGY_PAYMENT]).toBe(200);
    });

    it('should filter by date range', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const stats = await analytics.getStats({
        from: tomorrow,
      });

      expect(stats.totalTransactions).toBe(0);
    });

    it('should filter by account IDs', async () => {
      const stats = await analytics.getStats({
        accountIds: ['robot-1'],
      });

      expect(stats.totalTransactions).toBe(2); // One received, one sent
    });

    it('should filter by transaction types', async () => {
      const stats = await analytics.getStats({
        types: [TransactionType.TASK_PAYMENT, TransactionType.ENERGY_PAYMENT],
      });

      expect(stats.totalTransactions).toBe(2);
      expect(stats.totalVolume).toBe(300);
    });

    it('should generate time series', async () => {
      const stats = await analytics.getStats({
        groupBy: TimePeriod.DAY,
      });

      expect(stats.timeSeries).toBeDefined();
      expect(stats.timeSeries!.length).toBeGreaterThan(0);
      expect(stats.timeSeries![0].value).toBe(425);
    });
  });

  describe('Top Lists', () => {
    beforeEach(async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 300,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-2',
        amount: 200,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-1',
        to: 'robot-3',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
    });

    it('should get top spenders', async () => {
      const topSpenders = await analytics.topSpenders({ limit: 5 });

      expect(topSpenders.length).toBe(2);
      expect(topSpenders[0].accountId).toBe('hub');
      expect(topSpenders[0].amount).toBe(500);
      expect(topSpenders[0].accountName).toBe('Central Hub');
    });

    it('should get top receivers', async () => {
      const topReceivers = await analytics.topReceivers({ limit: 5 });

      expect(topReceivers[0].accountId).toBe('robot-1');
      expect(topReceivers[0].amount).toBe(300);
    });

    it('should get most active accounts', async () => {
      const topActive = await analytics.topActive({ limit: 5 });

      // hub has 2 transactions, robot-1 has 2 transactions
      expect(topActive.length).toBeGreaterThan(0);
    });

    it('should calculate percentage correctly', async () => {
      const topSpenders = await analytics.topSpenders();

      const totalPercentage = topSpenders.reduce(
        (sum, s) => sum + s.percentage,
        0
      );
      expect(totalPercentage).toBeCloseTo(100, 0);
    });
  });

  describe('Account Analysis', () => {
    beforeEach(async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 200,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 150,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-1',
        to: 'robot-2',
        amount: 100,
        type: TransactionType.DATA_PAYMENT,
      });
    });

    it('should get account activity', async () => {
      const activity = await analytics.getAccountActivity('robot-1');

      expect(activity.accountId).toBe('robot-1');
      expect(activity.accountName).toBe('Robot Alpha');
      expect(activity.totalReceived).toBe(350);
      expect(activity.totalSent).toBe(100);
      expect(activity.netFlow).toBe(250);
      expect(activity.transactionCount).toBe(3);
      expect(activity.mostCommonType).toBe(TransactionType.TASK_PAYMENT);
    });

    it('should handle account with no transactions', async () => {
      const activity = await analytics.getAccountActivity('robot-3');

      expect(activity.totalReceived).toBe(0);
      expect(activity.totalSent).toBe(0);
      expect(activity.transactionCount).toBe(0);
    });

    it('should get all account activities', async () => {
      const activities = await analytics.getAllAccountActivities();

      expect(activities.length).toBe(4);
    });
  });

  describe('Money Flow', () => {
    beforeEach(async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 300,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-2',
        amount: 200,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-1',
        to: 'robot-3',
        amount: 100,
        type: TransactionType.DATA_PAYMENT,
      });
      await robox.transfer({
        from: 'robot-2',
        to: 'robot-3',
        amount: 50,
        type: TransactionType.DATA_PAYMENT,
      });
    });

    it('should analyze money flow from hub', async () => {
      const flow = await analytics.moneyFlow({
        from: 'hub',
        depth: 2,
      });

      expect(flow.accountId).toBe('hub');
      expect(flow.outgoing).toBe(500);
      expect(flow.children).toBeDefined();
      expect(flow.children!.length).toBe(2);
    });

    it('should respect depth limit', async () => {
      const flow = await analytics.moneyFlow({
        from: 'hub',
        depth: 1,
      });

      expect(flow.children).toBeDefined();
      // Children should not have their own children at depth 1
      for (const child of flow.children!) {
        expect(child.children).toBeUndefined();
      }
    });

    it('should filter by minimum amount', async () => {
      const flow = await analytics.moneyFlow({
        from: 'hub',
        depth: 2,
        minAmount: 250,
      });

      expect(flow.children!.length).toBe(1);
      expect(flow.children![0].accountId).toBe('robot-1');
    });
  });

  describe('Trend Analysis', () => {
    it('should detect stable trend with no data', async () => {
      const trend = await analytics.analyzeTrend('volume');

      expect(trend.trend).toBe('stable');
      expect(trend.changePercent).toBe(0);
    });

    it('should analyze volume trend', async () => {
      // Create some transactions
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });

      const trend = await analytics.analyzeTrend('volume', {
        groupBy: TimePeriod.DAY,
      });

      expect(trend.metric).toBe('volume');
      expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
    });
  });

  describe('Export', () => {
    beforeEach(async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-2',
        amount: 200,
        type: TransactionType.ENERGY_PAYMENT,
      });
    });

    it('should export to CSV', async () => {
      const filePath = path.join(testOutputDir, 'export.csv');
      await analytics.exportCSV(filePath);

      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('id,from,to,amount');
      expect(content).toContain('hub');
      expect(content).toContain('robot-1');
    });

    it('should export to JSON', async () => {
      const filePath = path.join(testOutputDir, 'export.json');
      await analytics.exportJSON(filePath);

      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.transactions).toBeDefined();
      expect(content.transactions.length).toBe(2);
      expect(content.statistics).toBeDefined();
    });

    it('should export JSON with accounts', async () => {
      const filePath = path.join(testOutputDir, 'export-full.json');
      await analytics.exportJSON({
        path: filePath,
        includeAccounts: true,
      });

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.accounts).toBeDefined();
      expect(content.accounts.length).toBe(4);
    });

    it('should filter export by account', async () => {
      const filePath = path.join(testOutputDir, 'filtered.csv');
      await analytics.exportCSV({
        path: filePath,
        accountIds: ['robot-1'],
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2); // header + 1 transaction
    });

    it('should use custom delimiter', async () => {
      const filePath = path.join(testOutputDir, 'semicolon.csv');
      await analytics.exportCSV({
        path: filePath,
        delimiter: ';',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('id;from;to;amount');
    });
  });

  describe('Reports', () => {
    beforeEach(async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-2',
        amount: 200,
        type: TransactionType.ENERGY_PAYMENT,
      });
    });

    it('should generate summary report', async () => {
      const report = await analytics.generateReport({
        type: ReportType.SUMMARY,
        title: 'Monthly Summary',
      });

      expect(report.id).toBeDefined();
      expect(report.type).toBe(ReportType.SUMMARY);
      expect(report.title).toBe('Monthly Summary');
      expect(report.summary).toBeDefined();
      expect(report.topSpenders).toBeDefined();
      expect(report.topReceivers).toBeDefined();
    });

    it('should generate detailed report', async () => {
      const report = await analytics.generateReport({
        type: ReportType.DETAILED,
      });

      expect(report.accountActivities).toBeDefined();
      expect(report.topSpenders!.length).toBeLessThanOrEqual(10);
    });

    it('should generate account activity report', async () => {
      const report = await analytics.generateReport({
        type: ReportType.ACCOUNT_ACTIVITY,
      });

      expect(report.accountActivities).toBeDefined();
    });

    it('should generate comparison report', async () => {
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const report = await analytics.generateReport({
        type: ReportType.COMPARISON,
        from: lastWeek,
        to: now,
        compareTo: {
          from: twoWeeksAgo,
          to: lastWeek,
        },
      });

      expect(report.comparison).toBeDefined();
      expect(report.comparison!.current).toBeDefined();
      expect(report.comparison!.previous).toBeDefined();
      expect(report.comparison!.changes).toBeDefined();
    });
  });

  describe('Time Series', () => {
    it('should get volume series', async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });

      const series = await analytics.getVolumeSeries({
        groupBy: TimePeriod.DAY,
      });

      expect(series.length).toBeGreaterThan(0);
      expect(series[0].timestamp).toBeDefined();
      expect(series[0].value).toBe(100);
    });

    it('should get transaction count series', async () => {
      await robox.transfer({
        from: 'hub',
        to: 'robot-1',
        amount: 100,
        type: TransactionType.TASK_PAYMENT,
      });
      await robox.transfer({
        from: 'hub',
        to: 'robot-2',
        amount: 200,
        type: TransactionType.TASK_PAYMENT,
      });

      const series = await analytics.getTransactionCountSeries({
        groupBy: TimePeriod.DAY,
      });

      expect(series.length).toBeGreaterThan(0);
      expect(series[0].count).toBe(2);
    });
  });
});
