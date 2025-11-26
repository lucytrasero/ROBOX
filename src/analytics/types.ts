/**
 * Analytics Module Types
 */

/**
 * Time period for grouping
 */
export enum TimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

/**
 * Statistics request options
 */
export interface StatsOptions {
  /** Start date */
  from?: Date | string;
  /** End date */
  to?: Date | string;
  /** Group by time period */
  groupBy?: TimePeriod;
  /** Filter by account IDs */
  accountIds?: string[];
  /** Filter by transaction types */
  types?: string[];
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  count?: number;
}

/**
 * Aggregated statistics
 */
export interface AggregatedStats {
  /** Total transaction volume */
  totalVolume: number;
  /** Total number of transactions */
  totalTransactions: number;
  /** Total fees collected */
  totalFees: number;
  /** Average transaction amount */
  averageAmount: number;
  /** Median transaction amount */
  medianAmount: number;
  /** Maximum transaction amount */
  maxAmount: number;
  /** Minimum transaction amount */
  minAmount: number;
  /** Standard deviation */
  standardDeviation: number;
  /** Transaction count by type */
  byType: Record<string, number>;
  /** Volume by type */
  volumeByType: Record<string, number>;
  /** Time series data */
  timeSeries?: TimeSeriesPoint[];
  /** Period start */
  periodStart?: Date;
  /** Period end */
  periodEnd?: Date;
}

/**
 * Account activity summary
 */
export interface AccountActivity {
  accountId: string;
  accountName?: string;
  totalSent: number;
  totalReceived: number;
  netFlow: number;
  transactionCount: number;
  averageTransactionSize: number;
  mostCommonType: string;
  firstActivity: Date;
  lastActivity: Date;
}

/**
 * Top spenders/receivers result
 */
export interface TopAccountResult {
  accountId: string;
  accountName?: string;
  amount: number;
  transactionCount: number;
  percentage: number;
}

/**
 * Money flow node
 */
export interface MoneyFlowNode {
  accountId: string;
  accountName?: string;
  incoming: number;
  outgoing: number;
  balance: number;
  children?: MoneyFlowNode[];
}

/**
 * Money flow options
 */
export interface MoneyFlowOptions {
  /** Starting account ID */
  from: string;
  /** Depth of flow tree (default: 2) */
  depth?: number;
  /** Minimum amount to include */
  minAmount?: number;
  /** Start date */
  fromDate?: Date;
  /** End date */
  toDate?: Date;
}

/**
 * Export format
 */
export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  XLSX = 'xlsx',
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Output file path */
  path: string;
  /** Export format */
  format?: ExportFormat;
  /** Date range start */
  from?: Date | string;
  /** Date range end */
  to?: Date | string;
  /** Filter by account IDs */
  accountIds?: string[];
  /** Filter by transaction types */
  types?: string[];
  /** Include account details */
  includeAccounts?: boolean;
  /** Include escrow details */
  includeEscrows?: boolean;
  /** Custom fields to include */
  fields?: string[];
  /** Column delimiter for CSV */
  delimiter?: string;
  /** Date format string */
  dateFormat?: string;
}

/**
 * Report type
 */
export enum ReportType {
  SUMMARY = 'summary',
  DETAILED = 'detailed',
  ACCOUNT_ACTIVITY = 'account_activity',
  FLOW_ANALYSIS = 'flow_analysis',
  COMPARISON = 'comparison',
}

/**
 * Report options
 */
export interface ReportOptions {
  /** Report type */
  type: ReportType;
  /** Report title */
  title?: string;
  /** Date range start */
  from?: Date | string;
  /** Date range end */
  to?: Date | string;
  /** Comparison period (for comparison reports) */
  compareTo?: {
    from: Date | string;
    to: Date | string;
  };
  /** Include charts/visualizations (for PDF) */
  includeCharts?: boolean;
  /** Custom sections */
  sections?: string[];
}

/**
 * Generated report
 */
export interface Report {
  id: string;
  type: ReportType;
  title: string;
  generatedAt: Date;
  periodStart?: Date;
  periodEnd?: Date;
  summary: AggregatedStats;
  topSpenders?: TopAccountResult[];
  topReceivers?: TopAccountResult[];
  accountActivities?: AccountActivity[];
  comparison?: {
    current: AggregatedStats;
    previous: AggregatedStats;
    changes: Record<string, number>;
  };
  data?: Record<string, unknown>;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
  slope: number;
  forecast?: TimeSeriesPoint[];
  anomalies?: TimeSeriesPoint[];
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** Default time period for grouping */
  defaultPeriod?: TimePeriod;
  /** Number of results for top lists */
  topN?: number;
  /** Cache duration in ms */
  cacheDuration?: number;
  /** Enable caching */
  cacheEnabled?: boolean;
}
