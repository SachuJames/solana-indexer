-- Solana indexer schema
CREATE TABLE IF NOT EXISTS slots (
  slot BIGINT PRIMARY KEY,
  blockhash TEXT NOT NULL,
  block_time TIMESTAMPTZ,
  tx_count INT NOT NULL DEFAULT 0,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  signature TEXT PRIMARY KEY,
  slot BIGINT NOT NULL REFERENCES slots(slot),
  block_time TIMESTAMPTZ,
  fee BIGINT,
  success BOOLEAN NOT NULL,
  program_ids TEXT[] NOT NULL DEFAULT '{}',
  accounts TEXT[] NOT NULL DEFAULT '{}',
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_slot ON transactions(slot);
CREATE INDEX IF NOT EXISTS idx_tx_block_time ON transactions(block_time DESC);

CREATE TABLE IF NOT EXISTS account_activity (
  id BIGSERIAL PRIMARY KEY,
  account TEXT NOT NULL,
  signature TEXT NOT NULL REFERENCES transactions(signature),
  slot BIGINT NOT NULL,
  is_signer BOOLEAN NOT NULL DEFAULT FALSE,
  is_writable BOOLEAN NOT NULL DEFAULT FALSE,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_account ON account_activity(account);
CREATE INDEX IF NOT EXISTS idx_activity_sig ON account_activity(signature);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
