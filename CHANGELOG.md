# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-11-30

### Added

#### Bluetooth Communication Module (NEW)
- **Device Discovery & Connection**
  - BLE (Bluetooth Low Energy) and Classic Bluetooth support
  - Automatic device scanning with filters (RSSI, name, services)
  - Connection management with configurable timeouts
  - Auto-connect option for discovered robots
  - Handshake protocol for secure pairing

- **Robot-to-Robot Messaging**
  - Multiple message types (DATA, COMMAND, TRANSACTION, SERVICE, MESH)
  - Priority levels (LOW, NORMAL, HIGH, URGENT)
  - Reliable delivery with acknowledgments
  - Message timeout and retry configuration
  - Broadcast to all connected devices

- **Transaction Over Bluetooth**
  - Request, confirm, and reject transactions
  - Secure transaction negotiation protocol
  - Transaction timeout handling
  - Integration with RoboxLayer for actual transfers

- **Service Advertisement**
  - Advertise services to nearby robots
  - Service discovery and query
  - Price, availability, and type information
  - Real-time service updates

- **Proximity Detection**
  - Distance estimation based on RSSI
  - Proximity zones (IMMEDIATE, NEAR, FAR, UNKNOWN)
  - Find devices in specific zones
  - Accuracy indicators for distance estimates

- **Mesh Networking**
  - Create and join mesh networks
  - Mesh node roles (NODE, RELAY, PROXY, FRIEND, LOW_POWER)
  - Broadcast through mesh
  - Mesh topology management

- **Comprehensive Statistics**
  - Messages sent/received counts
  - Bytes transferred tracking
  - Connection statistics (total, active)
  - Average latency measurement
  - Error tracking

- **Event System**
  - Events for all Bluetooth operations
  - DEVICE_DISCOVERED, DEVICE_CONNECTED, DEVICE_DISCONNECTED
  - MESSAGE_RECEIVED, MESSAGE_SENT
  - MESH_JOINED, MESH_LEFT
  - SCAN_STARTED, SCAN_COMPLETED
  - ERROR events
  - Wildcard subscription support

- **Optional Dependencies**
  - @abandonware/noble for BLE
  - bleno for BLE peripheral mode
  - bluetooth-serial-port for Classic Bluetooth

## [1.2.0] - 2025-11-28

### Added

#### Invoice Module (NEW)
- **Complete Invoice Management**
  - Create invoices with multiple line items
  - Automatic tax and discount calculation
  - Sequential invoice numbering with customizable prefix
  - Draft workflow (create as draft → update → send)
  - Cancel, dispute, and refund invoices
  - Export/import for backup and migration

- **Partial Payments**
  - Allow or disallow partial payments per invoice
  - Configurable minimum partial payment amount
  - Track payment history with transaction links
  - Automatic status updates (PENDING → PARTIALLY_PAID → PAID)

- **Invoice Templates**
  - Create reusable templates for recurring invoices
  - Generate invoices from templates with overrides
  - Template management (create, update, delete, list)

- **Automatic Reminders**
  - Configurable reminder schedule (days before/after due)
  - Multiple reminder types (UPCOMING_DUE, DUE_TODAY, OVERDUE, FINAL_NOTICE)
  - Custom reminder sender integration
  - Reminder history tracking

- **Overdue Detection**
  - Automatic status change to OVERDUE
  - Background processor for invoice monitoring
  - Overdue amount tracking in statistics

- **Comprehensive Statistics**
  - Total/draft/pending/paid/overdue/cancelled counts
  - Total revenue, outstanding, and overdue amounts
  - Average payment time calculation
  - Statistics by status and currency
  - Filter by issuer, recipient, and date range

- **Event System**
  - Events for all invoice lifecycle changes
  - INVOICE_CREATED, INVOICE_PAID, INVOICE_OVERDUE, etc.
  - REMINDER_SENT events
  - Template events (created, updated, deleted)

- **Integration**
  - Payment executor for automatic transfers
  - Reminder sender for notifications
  - Full TypeScript support with comprehensive types

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
