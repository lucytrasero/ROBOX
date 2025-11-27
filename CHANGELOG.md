# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-11-27

### Added

#### Enhanced Webhooks
- **Advanced Filtering**: Filter events by robot IDs, amount thresholds, transaction types
- **Rate Limiting**: Per-webhook rate limits with configurable deliveries per minute
- **Auto-Disable**: Automatically disable webhooks after consecutive failures
- **Health Monitoring**: Track success rates, response times, and consecutive failures
- **Batch Operations**: Create, enable, disable, and delete multiple webhooks at once
- **Testing**: Test webhooks with custom payloads before going live
- **URL Validation**: Validate webhook endpoints for reachability
- **Export/Import**: Backup and restore webhook configurations
- **Timing-Safe Signature Verification**: Secure HMAC-SHA256 signature validation
- **Enhanced Statistics**: Deliveries by event type, status breakdown, average response times
- **Delivery Metrics**: Track request/response sizes and duration for each delivery
- **Secret Rotation**: Rotate webhook secrets without recreation
- New webhook options:
  - `name` - Human-readable webhook name
  - `metadata` - Custom metadata storage
  - `robotId` - Owner robot for webhook management
  - `filterRobotIds` - Filter events by specific robots
  - `minAmountThreshold` / `maxAmountThreshold` - Amount-based filtering
  - `transactionTypes` - Filter by transaction type
  - `rateLimitPerMinute` - Rate limiting
  - `autoDisableAfterFailures` - Auto-disable threshold
- New delivery statuses: `SKIPPED`, `RATE_LIMITED`
- New headers: `X-Timestamp`, `X-Attempt-Number`
- New payload fields: `webhookId`, `attemptNumber`

### Changed
- Webhook User-Agent updated to `RoboxClearing/1.1`
- Signature verification now uses timing-safe comparison
- Improved exponential backoff for retries

## [1.1.0] - 2025-01-20

### Added

#### PostgreSQL Storage Adapter
- Production-ready persistent storage with PostgreSQL
- Connection pooling with configurable pool size
- Automatic migrations for all tables
- Transaction support with `transaction()` method for atomic operations
- Optimized indexes for fast queries
- Support for custom schema and table prefix
- SSL configuration support
- Dynamic `pg` import (optional dependency)

#### Marketplace Module
- Service listing with categories, pricing, and availability
- Advanced search with filters (category, price range, rating, location)
- Location-based search with Haversine distance calculation
- Order management with full lifecycle (pending → paid → in_progress → completed)
- Automatic escrow integration for secure payments
- Review system with ratings (1-5) and provider responses
- Configurable marketplace fees
- Event system for all marketplace actions

#### Analytics Module
- Aggregated statistics (volume, count, fees, averages)
- Time series data with configurable grouping (hour/day/week/month/year)
- Top spenders/receivers/active accounts analysis
- Account activity summaries
- Money flow analysis with tree visualization
- Trend detection with anomaly identification
- CSV and JSON export
- Report generation (summary, detailed, comparison)

### Changed
- Updated exports to avoid naming conflicts between Discovery and Marketplace modules

## [1.0.0] - 2024-01-15

### Added

- Initial release
- Robot account management with status (active, frozen, suspended, closed)
- Balance operations (credit, debit) with authorization
- Micropayment transfers between robots
- Escrow functionality with conditions and expiration
- Batch transfer processing
- Event system for all operations
- Middleware support
- Audit logging
- Statistics and analytics
- Role-based authorization (consumer, provider, admin, operator, auditor)
- Account limits (max transfer, daily limit, min balance)
- Idempotency keys for safe retries
- Fee calculator support
- Comprehensive error types with HTTP codes
- InMemoryStorage adapter
- Full TypeScript support
- 40+ unit tests
