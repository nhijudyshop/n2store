-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
-- Cache bearer tokens for TPOS/Pancake/FB to avoid re-login on every page load.
-- Server refreshes proactively; clients GET cached token via API.
CREATE TABLE IF NOT EXISTS auth_token_cache (
    provider    VARCHAR(64) PRIMARY KEY,    -- 'tpos_1' (provider_companyId), 'pancake', etc.
    token       TEXT NOT NULL,
    refresh_token TEXT,
    expires_at  TIMESTAMP NOT NULL,
    metadata    JSONB DEFAULT '{}',         -- {username, company_id, scope, ...}
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
