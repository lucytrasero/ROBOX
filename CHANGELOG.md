# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
