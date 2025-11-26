import type { RoboxLayer } from '../RoboxLayer';
import type { Transaction } from '../types';
import { TransactionStatus } from '../types';
import { generateId } from '../utils';
import * as fs from 'fs';
import * as path from 'path';
import {
  TimePeriod,
  ExportFormat,
  ReportType,
  type StatsOptions,
  type TimeSeriesPoint,
  type AggregatedStats,
  type AccountActivity,
  type TopAccountResult,
  type MoneyFlowNode,
  type MoneyFlowOptions,
  type ExportOptions,
  type ReportOptions,
  type Report,
  type TrendAnalysis,
  type AnalyticsConfig,
} from './types';

/**
 * Analytics Manager
 *
 * Provides statistics, reporting, and data export capabilities
 * for analyzing robot economy.
 *
 * @example
 * ```typescript
 * import { RoboxLayer, InMemoryStorage, AnalyticsManager } from 'robox-clearing';
 *
 * const robox = new RoboxLayer({ storage: new InMemoryStorage() });
 * const analytics = new AnalyticsManager(robox);
 *
 * // Get statistics
 * const stats = await analytics.getStats({
 *   from: '2025-11-01',
 *   to: '2025-11-30',
 *   groupBy: TimePeriod.DAY,
 * });
 *
 * // Export to CSV
 * await analytics.exportCSV('./report.csv');
 *
 * // Get top spenders
 * const topSpenders = await analytics.topSpenders({ limit: 10 });
 *
 * // Analyze money flow
 * const flow = await analytics.moneyFlow({ from: 'hub', depth: 3 });
 * ```
 */
export class AnalyticsManager {
  private robox: RoboxLayer;
  private config: Required<AnalyticsConfig>;
  private cache: Map<string, { data: unknown; expires: number }> = new Map();

  constructor(robox: RoboxLayer, config?: AnalyticsConfig) {
    this.robox = robox;
    this.config = {
      defaultPeriod: config?.defaultPeriod ?? TimePeriod.DAY,
      topN: config?.topN ?? 10,
      cacheDuration: config?.cacheDuration ?? 60000, // 1 minute
      cacheEnabled: config?.cacheEnabled ?? true,
    };
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get aggregated statistics for a time period
   */
  async getStats(options?: StatsOptions): Promise<AggregatedStats> {
    const from = options?.from
      ? new Date(options.from)
      : undefined;
    const to = options?.to ? new Date(options.to) : undefined;

    // Fetch transactions
    let transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      status: TransactionStatus.COMPLETED,
      limit: 100000,
    });

    // Apply filters
    if (options?.accountIds && options.accountIds.length > 0) {
      const ids = new Set(options.accountIds);
      transactions = transactions.filter(
        (tx) => ids.has(tx.from) || ids.has(tx.to)
      );
    }

    if (options?.types && options.types.length > 0) {
      const types = new Set(options.types);
      transactions = transactions.filter((tx) => types.has(tx.type));
    }

    if (transactions.length === 0) {
      return this.createEmptyStats(from, to);
    }

    // Calculate statistics
    const amounts = transactions.map((tx) => tx.amount);
    const totalVolume = amounts.reduce((sum, a) => sum + a, 0);
    const totalFees = transactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
    const averageAmount = totalVolume / amounts.length;
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const medianAmount =
      sortedAmounts.length % 2 === 0
        ? (sortedAmounts[sortedAmounts.length / 2 - 1] +
            sortedAmounts[sortedAmounts.length / 2]) /
          2
        : sortedAmounts[Math.floor(sortedAmounts.length / 2)];

    // Standard deviation
    const squaredDiffs = amounts.map((a) => Math.pow(a - averageAmount, 2));
    const standardDeviation = Math.sqrt(
      squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length
    );

    // By type
    const byType: Record<string, number> = {};
    const volumeByType: Record<string, number> = {};
    for (const tx of transactions) {
      byType[tx.type] = (byType[tx.type] || 0) + 1;
      volumeByType[tx.type] = (volumeByType[tx.type] || 0) + tx.amount;
    }

    // Time series
    let timeSeries: TimeSeriesPoint[] | undefined;
    if (options?.groupBy) {
      timeSeries = this.groupByPeriod(transactions, options.groupBy);
    }

    return {
      totalVolume,
      totalTransactions: transactions.length,
      totalFees,
      averageAmount: Math.round(averageAmount * 100) / 100,
      medianAmount,
      maxAmount: Math.max(...amounts),
      minAmount: Math.min(...amounts),
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      byType,
      volumeByType,
      timeSeries,
      periodStart: from,
      periodEnd: to,
    };
  }

  /**
   * Get volume time series
   */
  async getVolumeSeries(
    options?: StatsOptions
  ): Promise<TimeSeriesPoint[]> {
    const stats = await this.getStats({
      ...options,
      groupBy: options?.groupBy ?? this.config.defaultPeriod,
    });
    return stats.timeSeries || [];
  }

  /**
   * Get transaction count time series
   */
  async getTransactionCountSeries(
    options?: StatsOptions
  ): Promise<TimeSeriesPoint[]> {
    const from = options?.from ? new Date(options.from) : undefined;
    const to = options?.to ? new Date(options.to) : undefined;

    const transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      status: TransactionStatus.COMPLETED,
      limit: 100000,
    });

    const period = options?.groupBy ?? this.config.defaultPeriod;
    const grouped = new Map<number, number>();

    for (const tx of transactions) {
      const key = this.getPeriodKey(tx.createdAt, period);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([timestamp, value]) => ({
        timestamp: new Date(timestamp),
        value,
        count: value,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ============================================
  // Top Lists
  // ============================================

  /**
   * Get top spenders (accounts with highest outgoing volume)
   */
  async topSpenders(options?: {
    limit?: number;
    from?: Date | string;
    to?: Date | string;
  }): Promise<TopAccountResult[]> {
    const from = options?.from ? new Date(options.from) : undefined;
    const to = options?.to ? new Date(options.to) : undefined;
    const limit = options?.limit ?? this.config.topN;

    const transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      status: TransactionStatus.COMPLETED,
      limit: 100000,
    });

    // Aggregate by sender
    const spending = new Map<string, { amount: number; count: number }>();
    let totalVolume = 0;

    for (const tx of transactions) {
      const current = spending.get(tx.from) || { amount: 0, count: 0 };
      current.amount += tx.amount;
      current.count += 1;
      spending.set(tx.from, current);
      totalVolume += tx.amount;
    }

    // Sort and limit
    const sorted = Array.from(spending.entries())
      .map(([accountId, data]) => ({
        accountId,
        amount: data.amount,
        transactionCount: data.count,
        percentage:
          totalVolume > 0
            ? Math.round((data.amount / totalVolume) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);

    // Add account names
    const results: TopAccountResult[] = [];
    for (const item of sorted) {
      const account = await this.robox.getRobotAccount(item.accountId);
      results.push({
        ...item,
        accountName: account?.name,
      });
    }

    return results;
  }

  /**
   * Get top receivers (accounts with highest incoming volume)
   */
  async topReceivers(options?: {
    limit?: number;
    from?: Date | string;
    to?: Date | string;
  }): Promise<TopAccountResult[]> {
    const from = options?.from ? new Date(options.from) : undefined;
    const to = options?.to ? new Date(options.to) : undefined;
    const limit = options?.limit ?? this.config.topN;

    const transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      status: TransactionStatus.COMPLETED,
      limit: 100000,
    });

    // Aggregate by receiver
    const receiving = new Map<string, { amount: number; count: number }>();
    let totalVolume = 0;

    for (const tx of transactions) {
      const current = receiving.get(tx.to) || { amount: 0, count: 0 };
      current.amount += tx.amount;
      current.count += 1;
      receiving.set(tx.to, current);
      totalVolume += tx.amount;
    }

    // Sort and limit
    const sorted = Array.from(receiving.entries())
      .map(([accountId, data]) => ({
        accountId,
        amount: data.amount,
        transactionCount: data.count,
        percentage:
          totalVolume > 0
            ? Math.round((data.amount / totalVolume) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);

    // Add account names
    const results: TopAccountResult[] = [];
    for (const item of sorted) {
      const account = await this.robox.getRobotAccount(item.accountId);
      results.push({
        ...item,
        accountName: account?.name,
      });
    }

    return results;
  }

  /**
   * Get most active accounts (by transaction count)
   */
  async topActive(options?: {
    limit?: number;
    from?: Date | string;
    to?: Date | string;
  }): Promise<TopAccountResult[]> {
    const from = options?.from ? new Date(options.from) : undefined;
    const to = options?.to ? new Date(options.to) : undefined;
    const limit = options?.limit ?? this.config.topN;

    const transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      status: TransactionStatus.COMPLETED,
      limit: 100000,
    });

    // Aggregate by account
    const activity = new Map<string, { amount: number; count: number }>();
    let totalCount = 0;

    for (const tx of transactions) {
      // Count sender
      const senderData = activity.get(tx.from) || { amount: 0, count: 0 };
      senderData.amount += tx.amount;
      senderData.count += 1;
      activity.set(tx.from, senderData);

      // Count receiver
      const receiverData = activity.get(tx.to) || { amount: 0, count: 0 };
      receiverData.amount += tx.amount;
      receiverData.count += 1;
      activity.set(tx.to, receiverData);

      totalCount += 2;
    }

    // Sort by count
    const sorted = Array.from(activity.entries())
      .map(([accountId, data]) => ({
        accountId,
        amount: data.amount,
        transactionCount: data.count,
        percentage:
          totalCount > 0
            ? Math.round((data.count / totalCount) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.transactionCount - a.transactionCount)
      .slice(0, limit);

    // Add account names
    const results: TopAccountResult[] = [];
    for (const item of sorted) {
      const account = await this.robox.getRobotAccount(item.accountId);
      results.push({
        ...item,
        accountName: account?.name,
      });
    }

    return results;
  }

  // ============================================
  // Account Analysis
  // ============================================

  /**
   * Get activity summary for a specific account
   */
  async getAccountActivity(accountId: string): Promise<AccountActivity> {
    const transactions = await this.robox.listTransactions({
      robotId: accountId,
      status: TransactionStatus.COMPLETED,
      limit: 100000,
    });

    if (transactions.length === 0) {
      const account = await this.robox.getRobotAccount(accountId);
      return {
        accountId,
        accountName: account?.name,
        totalSent: 0,
        totalReceived: 0,
        netFlow: 0,
        transactionCount: 0,
        averageTransactionSize: 0,
        mostCommonType: '',
        firstActivity: new Date(),
        lastActivity: new Date(),
      };
    }

    let totalSent = 0;
    let totalReceived = 0;
    const typeCount: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.from === accountId) {
        totalSent += tx.amount;
      }
      if (tx.to === accountId) {
        totalReceived += tx.amount;
      }
      typeCount[tx.type] = (typeCount[tx.type] || 0) + 1;
    }

    const mostCommonType = Object.entries(typeCount).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] || '';

    const sortedByDate = transactions.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const account = await this.robox.getRobotAccount(accountId);

    return {
      accountId,
      accountName: account?.name,
      totalSent,
      totalReceived,
      netFlow: totalReceived - totalSent,
      transactionCount: transactions.length,
      averageTransactionSize:
        Math.round(
          ((totalSent + totalReceived) / transactions.length) * 100
        ) / 100,
      mostCommonType,
      firstActivity: sortedByDate[0].createdAt,
      lastActivity: sortedByDate[sortedByDate.length - 1].createdAt,
    };
  }

  /**
   * Get activity for all accounts
   */
  async getAllAccountActivities(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AccountActivity[]> {
    const accounts = await this.robox.listRobotAccounts({
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    });

    const activities: AccountActivity[] = [];
    for (const account of accounts) {
      const activity = await this.getAccountActivity(account.id);
      activities.push(activity);
    }

    return activities;
  }

  // ============================================
  // Money Flow Analysis
  // ============================================

  /**
   * Analyze money flow from a starting account
   */
  async moneyFlow(options: MoneyFlowOptions): Promise<MoneyFlowNode> {
    const depth = options.depth ?? 2;
    const account = await this.robox.getRobotAccount(options.from);

    const root: MoneyFlowNode = {
      accountId: options.from,
      accountName: account?.name,
      incoming: 0,
      outgoing: 0,
      balance: account?.balance ?? 0,
    };

    if (depth > 0) {
      await this.buildFlowTree(root, depth, options, new Set([options.from]));
    }

    return root;
  }

  private async buildFlowTree(
    node: MoneyFlowNode,
    depth: number,
    options: MoneyFlowOptions,
    visited: Set<string>
  ): Promise<void> {
    const transactions = await this.robox.listTransactions({
      robotId: node.accountId,
      status: TransactionStatus.COMPLETED,
      fromDate: options.fromDate,
      toDate: options.toDate,
      limit: 100000,
    });

    // Calculate flows
    const childrenMap = new Map<
      string,
      { incoming: number; outgoing: number }
    >();

    for (const tx of transactions) {
      if (tx.from === node.accountId) {
        node.outgoing += tx.amount;

        if (!visited.has(tx.to)) {
          const child = childrenMap.get(tx.to) || { incoming: 0, outgoing: 0 };
          child.incoming += tx.amount;
          childrenMap.set(tx.to, child);
        }
      }
      if (tx.to === node.accountId) {
        node.incoming += tx.amount;

        if (!visited.has(tx.from)) {
          const child = childrenMap.get(tx.from) || { incoming: 0, outgoing: 0 };
          child.outgoing += tx.amount;
          childrenMap.set(tx.from, child);
        }
      }
    }

    // Filter by minimum amount
    if (options.minAmount) {
      for (const [id, data] of childrenMap.entries()) {
        if (data.incoming + data.outgoing < options.minAmount) {
          childrenMap.delete(id);
        }
      }
    }

    // Build children
    if (depth > 1 && childrenMap.size > 0) {
      node.children = [];

      for (const [childId, data] of childrenMap.entries()) {
        if (!visited.has(childId)) {
          visited.add(childId);
          const childAccount = await this.robox.getRobotAccount(childId);

          const childNode: MoneyFlowNode = {
            accountId: childId,
            accountName: childAccount?.name,
            incoming: data.incoming,
            outgoing: data.outgoing,
            balance: childAccount?.balance ?? 0,
          };

          await this.buildFlowTree(
            childNode,
            depth - 1,
            options,
            visited
          );
          node.children.push(childNode);
        }
      }

      // Sort children by total flow
      node.children.sort(
        (a, b) =>
          b.incoming + b.outgoing - (a.incoming + a.outgoing)
      );
    }
  }

  // ============================================
  // Trend Analysis
  // ============================================

  /**
   * Analyze trend for a metric
   */
  async analyzeTrend(
    metric: 'volume' | 'count' | 'fees',
    options?: StatsOptions
  ): Promise<TrendAnalysis> {
    const stats = await this.getStats({
      ...options,
      groupBy: options?.groupBy ?? TimePeriod.DAY,
    });

    const timeSeries = stats.timeSeries || [];

    if (timeSeries.length < 2) {
      return {
        metric,
        trend: 'stable',
        changePercent: 0,
        slope: 0,
      };
    }

    // Calculate linear regression slope
    const n = timeSeries.length;
    const xSum = timeSeries.reduce((sum, _, i) => sum + i, 0);
    const ySum = timeSeries.reduce((sum, p) => sum + p.value, 0);
    const xySum = timeSeries.reduce((sum, p, i) => sum + i * p.value, 0);
    const xxSum = timeSeries.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * xySum - xSum * ySum) / (n * xxSum - xSum * xSum);
    const yMean = ySum / n;

    // Calculate percentage change
    const firstValue = timeSeries[0].value;
    const lastValue = timeSeries[timeSeries.length - 1].value;
    const changePercent =
      firstValue > 0
        ? Math.round(((lastValue - firstValue) / firstValue) * 10000) / 100
        : 0;

    // Determine trend
    const threshold = yMean * 0.05; // 5% of mean
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (slope > threshold / n) {
      trend = 'increasing';
    } else if (slope < -threshold / n) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    // Detect anomalies (values beyond 2 standard deviations)
    const values = timeSeries.map((p) => p.value);
    const std = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - yMean, 2), 0) / n
    );
    const anomalies = timeSeries.filter(
      (p) => Math.abs(p.value - yMean) > 2 * std
    );

    return {
      metric,
      trend,
      changePercent,
      slope: Math.round(slope * 100) / 100,
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  }

  // ============================================
  // Export
  // ============================================

  /**
   * Export transactions to CSV
   */
  async exportCSV(
    pathOrOptions: string | ExportOptions
  ): Promise<string> {
    const options: ExportOptions =
      typeof pathOrOptions === 'string'
        ? { path: pathOrOptions, format: ExportFormat.CSV }
        : pathOrOptions;

    const from = options.from ? new Date(options.from) : undefined;
    const to = options.to ? new Date(options.to) : undefined;

    const transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      limit: 100000,
    });

    // Filter by accounts
    let filtered = transactions;
    if (options.accountIds && options.accountIds.length > 0) {
      const ids = new Set(options.accountIds);
      filtered = transactions.filter(
        (tx) => ids.has(tx.from) || ids.has(tx.to)
      );
    }

    // Filter by types
    if (options.types && options.types.length > 0) {
      const types = new Set(options.types);
      filtered = filtered.filter((tx) => types.has(tx.type));
    }

    const delimiter = options.delimiter ?? ',';
    const dateFormat = options.dateFormat ?? 'ISO';

    // Build CSV
    const headers = [
      'id',
      'from',
      'to',
      'amount',
      'fee',
      'type',
      'status',
      'created_at',
      'completed_at',
    ];
    const lines = [headers.join(delimiter)];

    for (const tx of filtered) {
      const row = [
        tx.id,
        tx.from,
        tx.to,
        tx.amount.toString(),
        (tx.fee ?? 0).toString(),
        tx.type,
        tx.status,
        this.formatDate(tx.createdAt, dateFormat),
        tx.completedAt ? this.formatDate(tx.completedAt, dateFormat) : '',
      ];
      lines.push(row.join(delimiter));
    }

    const content = lines.join('\n');
    await this.writeFile(options.path, content);

    return options.path;
  }

  /**
   * Export data to JSON
   */
  async exportJSON(
    pathOrOptions: string | ExportOptions
  ): Promise<string> {
    const options: ExportOptions =
      typeof pathOrOptions === 'string'
        ? { path: pathOrOptions, format: ExportFormat.JSON }
        : pathOrOptions;

    const from = options.from ? new Date(options.from) : undefined;
    const to = options.to ? new Date(options.to) : undefined;

    const data: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      periodStart: from?.toISOString(),
      periodEnd: to?.toISOString(),
    };

    // Transactions
    const transactions = await this.robox.listTransactions({
      fromDate: from,
      toDate: to,
      limit: 100000,
    });
    data.transactions = transactions;

    // Accounts (if requested)
    if (options.includeAccounts) {
      const accounts = await this.robox.listRobotAccounts({ limit: 100000 });
      data.accounts = accounts;
    }

    // Escrows (if requested)
    if (options.includeEscrows) {
      const escrows = await this.robox.listEscrows({});
      data.escrows = escrows;
    }

    // Statistics
    const stats = await this.getStats({ from, to });
    data.statistics = stats;

    const content = JSON.stringify(data, null, 2);
    await this.writeFile(options.path, content);

    return options.path;
  }

  /**
   * Export shorthand
   */
  async export(options: ExportOptions): Promise<string> {
    const format = options.format ?? ExportFormat.CSV;

    switch (format) {
      case ExportFormat.CSV:
        return this.exportCSV(options);
      case ExportFormat.JSON:
        return this.exportJSON(options);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ============================================
  // Reports
  // ============================================

  /**
   * Generate a report
   */
  async generateReport(options: ReportOptions): Promise<Report> {
    const from = options.from ? new Date(options.from) : undefined;
    const to = options.to ? new Date(options.to) : undefined;

    const summary = await this.getStats({ from, to, groupBy: TimePeriod.DAY });

    const report: Report = {
      id: generateId(),
      type: options.type,
      title:
        options.title ??
        `${options.type.charAt(0).toUpperCase() + options.type.slice(1)} Report`,
      generatedAt: new Date(),
      periodStart: from,
      periodEnd: to,
      summary,
    };

    // Add type-specific data
    switch (options.type) {
      case ReportType.SUMMARY:
        report.topSpenders = await this.topSpenders({
          limit: 5,
          from,
          to,
        });
        report.topReceivers = await this.topReceivers({
          limit: 5,
          from,
          to,
        });
        break;

      case ReportType.DETAILED:
        report.topSpenders = await this.topSpenders({
          limit: 10,
          from,
          to,
        });
        report.topReceivers = await this.topReceivers({
          limit: 10,
          from,
          to,
        });
        report.accountActivities = await this.getAllAccountActivities({
          limit: 50,
        });
        break;

      case ReportType.ACCOUNT_ACTIVITY:
        report.accountActivities = await this.getAllAccountActivities({
          limit: 100,
        });
        break;

      case ReportType.COMPARISON:
        if (options.compareTo) {
          const previousStats = await this.getStats({
            from: options.compareTo.from,
            to: options.compareTo.to,
            groupBy: TimePeriod.DAY,
          });

          report.comparison = {
            current: summary,
            previous: previousStats,
            changes: {
              volumeChange: this.calculateChange(
                summary.totalVolume,
                previousStats.totalVolume
              ),
              transactionChange: this.calculateChange(
                summary.totalTransactions,
                previousStats.totalTransactions
              ),
              averageChange: this.calculateChange(
                summary.averageAmount,
                previousStats.averageAmount
              ),
            },
          };
        }
        break;
    }

    return report;
  }

  // ============================================
  // Utilities
  // ============================================

  private createEmptyStats(from?: Date, to?: Date): AggregatedStats {
    return {
      totalVolume: 0,
      totalTransactions: 0,
      totalFees: 0,
      averageAmount: 0,
      medianAmount: 0,
      maxAmount: 0,
      minAmount: 0,
      standardDeviation: 0,
      byType: {},
      volumeByType: {},
      periodStart: from,
      periodEnd: to,
    };
  }

  private groupByPeriod(
    transactions: Transaction[],
    period: TimePeriod
  ): TimeSeriesPoint[] {
    const grouped = new Map<number, { volume: number; count: number }>();

    for (const tx of transactions) {
      const key = this.getPeriodKey(tx.createdAt, period);
      const current = grouped.get(key) || { volume: 0, count: 0 };
      current.volume += tx.amount;
      current.count += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([timestamp, data]) => ({
        timestamp: new Date(timestamp),
        value: data.volume,
        count: data.count,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private getPeriodKey(date: Date, period: TimePeriod): number {
    const d = new Date(date);

    switch (period) {
      case TimePeriod.HOUR:
        d.setMinutes(0, 0, 0);
        break;
      case TimePeriod.DAY:
        d.setHours(0, 0, 0, 0);
        break;
      case TimePeriod.WEEK:
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        break;
      case TimePeriod.MONTH:
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        break;
      case TimePeriod.YEAR:
        d.setHours(0, 0, 0, 0);
        d.setMonth(0, 1);
        break;
    }

    return d.getTime();
  }

  private formatDate(date: Date, format: string): string {
    if (format === 'ISO') {
      return date.toISOString();
    }
    // Simple date format support
    return date.toISOString().split('T')[0];
  }

  private calculateChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
