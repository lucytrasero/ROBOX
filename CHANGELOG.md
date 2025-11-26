# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
