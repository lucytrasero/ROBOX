import type { Migration } from './types';

/**
 * Database migrations for PostgreSQL storage
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_accounts_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}accounts (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
        frozen_balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
        roles TEXT[] NOT NULL DEFAULT '{}',
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        limits JSONB,
        metadata JSONB,
        tags TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS {{prefix}}accounts_status_idx ON {{schema}}.{{prefix}}accounts(status);
      CREATE INDEX IF NOT EXISTS {{prefix}}accounts_roles_idx ON {{schema}}.{{prefix}}accounts USING GIN(roles);
      CREATE INDEX IF NOT EXISTS {{prefix}}accounts_tags_idx ON {{schema}}.{{prefix}}accounts USING GIN(tags);
      CREATE INDEX IF NOT EXISTS {{prefix}}accounts_balance_idx ON {{schema}}.{{prefix}}accounts(balance);
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}accounts CASCADE;`,
  },
  {
    version: 2,
    name: 'create_transactions_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}transactions (
        id VARCHAR(255) PRIMARY KEY,
        from_account VARCHAR(255) NOT NULL,
        to_account VARCHAR(255) NOT NULL,
        amount NUMERIC(20, 8) NOT NULL,
        fee NUMERIC(20, 8),
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        meta JSONB,
        initiated_by VARCHAR(255),
        escrow_id VARCHAR(255),
        batch_id VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_from_idx ON {{schema}}.{{prefix}}transactions(from_account);
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_to_idx ON {{schema}}.{{prefix}}transactions(to_account);
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_type_idx ON {{schema}}.{{prefix}}transactions(type);
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_status_idx ON {{schema}}.{{prefix}}transactions(status);
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_created_idx ON {{schema}}.{{prefix}}transactions(created_at DESC);
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_escrow_idx ON {{schema}}.{{prefix}}transactions(escrow_id);
      CREATE INDEX IF NOT EXISTS {{prefix}}transactions_batch_idx ON {{schema}}.{{prefix}}transactions(batch_id);
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}transactions CASCADE;`,
  },
  {
    version: 3,
    name: 'create_balance_operations_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}balance_operations (
        id VARCHAR(255) PRIMARY KEY,
        robot_id VARCHAR(255) NOT NULL,
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
        amount NUMERIC(20, 8) NOT NULL,
        balance_after NUMERIC(20, 8) NOT NULL,
        reason TEXT,
        meta JSONB,
        initiated_by VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS {{prefix}}balance_ops_robot_idx ON {{schema}}.{{prefix}}balance_operations(robot_id);
      CREATE INDEX IF NOT EXISTS {{prefix}}balance_ops_created_idx ON {{schema}}.{{prefix}}balance_operations(created_at DESC);
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}balance_operations CASCADE;`,
  },
  {
    version: 4,
    name: 'create_escrows_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}escrows (
        id VARCHAR(255) PRIMARY KEY,
        from_account VARCHAR(255) NOT NULL,
        to_account VARCHAR(255) NOT NULL,
        amount NUMERIC(20, 8) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        condition TEXT,
        expires_at TIMESTAMPTZ,
        meta JSONB,
        transaction_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ
      );
      
      CREATE INDEX IF NOT EXISTS {{prefix}}escrows_from_idx ON {{schema}}.{{prefix}}escrows(from_account);
      CREATE INDEX IF NOT EXISTS {{prefix}}escrows_to_idx ON {{schema}}.{{prefix}}escrows(to_account);
      CREATE INDEX IF NOT EXISTS {{prefix}}escrows_status_idx ON {{schema}}.{{prefix}}escrows(status);
      CREATE INDEX IF NOT EXISTS {{prefix}}escrows_expires_idx ON {{schema}}.{{prefix}}escrows(expires_at);
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}escrows CASCADE;`,
  },
  {
    version: 5,
    name: 'create_batch_transfers_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}batch_transfers (
        id VARCHAR(255) PRIMARY KEY,
        transfers JSONB NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        success_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        total_amount NUMERIC(20, 8) NOT NULL DEFAULT 0,
        initiated_by VARCHAR(255),
        meta JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      
      CREATE INDEX IF NOT EXISTS {{prefix}}batch_status_idx ON {{schema}}.{{prefix}}batch_transfers(status);
      CREATE INDEX IF NOT EXISTS {{prefix}}batch_created_idx ON {{schema}}.{{prefix}}batch_transfers(created_at DESC);
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}batch_transfers CASCADE;`,
  },
  {
    version: 6,
    name: 'create_audit_logs_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}audit_logs (
        id VARCHAR(255) PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        actor_id VARCHAR(255),
        changes JSONB,
        meta JSONB,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS {{prefix}}audit_entity_idx ON {{schema}}.{{prefix}}audit_logs(entity_id);
      CREATE INDEX IF NOT EXISTS {{prefix}}audit_action_idx ON {{schema}}.{{prefix}}audit_logs(action);
      CREATE INDEX IF NOT EXISTS {{prefix}}audit_timestamp_idx ON {{schema}}.{{prefix}}audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS {{prefix}}audit_actor_idx ON {{schema}}.{{prefix}}audit_logs(actor_id);
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}audit_logs CASCADE;`,
  },
  {
    version: 7,
    name: 'create_migrations_table',
    up: `
      CREATE TABLE IF NOT EXISTS {{schema}}.{{prefix}}migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
    down: `DROP TABLE IF EXISTS {{schema}}.{{prefix}}migrations CASCADE;`,
  },
];

/**
 * Replace placeholders in SQL
 */
export function prepareSql(sql: string, schema: string, prefix: string): string {
  return sql
    .replace(/\{\{schema\}\}/g, schema)
    .replace(/\{\{prefix\}\}/g, prefix);
}
