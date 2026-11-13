ALTER TABLE entrevistas ADD COLUMN token_hash VARCHAR(64);
ALTER TABLE entrevistas ADD COLUMN expira_at TIMESTAMP;
ALTER TABLE entrevistas ADD COLUMN consent_at TIMESTAMP;
ALTER TABLE entrevistas ADD COLUMN started_at TIMESTAMP;
ALTER TABLE entrevistas ADD COLUMN finished_at TIMESTAMP;
ALTER TABLE entrevistas ADD COLUMN revoked_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS ix_entrevistas_token_hash ON entrevistas(token_hash);
