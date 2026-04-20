-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
-- Phone Management tables — migrate từ Firestore sang Render Postgres

-- Extension assignments (replace Firestore phone_ext_assignments)
CREATE TABLE IF NOT EXISTS phone_ext_assignments (
    username VARCHAR(255) PRIMARY KEY,
    ext VARCHAR(20) NOT NULL,
    assigned_by VARCHAR(255),
    assigned_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_ext_assignments_ext ON phone_ext_assignments(ext);

-- Call history — mỗi cuộc gọi 1 row
CREATE TABLE IF NOT EXISTS phone_call_history (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    ext VARCHAR(20),
    phone VARCHAR(30) NOT NULL,
    name VARCHAR(255),
    direction VARCHAR(10) NOT NULL,        -- out | in | missed
    duration INTEGER DEFAULT 0,            -- seconds
    order_code VARCHAR(50),
    outcome VARCHAR(50),                   -- success | voicemail | no-answer | busy | failed
    note TEXT,
    timestamp BIGINT NOT NULL,             -- ms since epoch
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_call_history_username_ts ON phone_call_history(username, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_history_phone_ts ON phone_call_history(phone, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_history_timestamp ON phone_call_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_history_direction ON phone_call_history(direction);
CREATE INDEX IF NOT EXISTS idx_phone_call_history_ext ON phone_call_history(ext);

-- Presence — 1 row per user, upsert
CREATE TABLE IF NOT EXISTS phone_presence (
    username VARCHAR(255) PRIMARY KEY,
    state VARCHAR(20) NOT NULL,            -- offline | registered | ringing | in-call
    ext VARCHAR(20),
    call_phone VARCHAR(30),
    call_name VARCHAR(255),
    direction VARCHAR(10),
    since BIGINT,
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_presence_state ON phone_presence(state);
CREATE INDEX IF NOT EXISTS idx_phone_presence_updated ON phone_presence(updated_at DESC);

-- Audit log — ext assignments, config changes, etc.
CREATE TABLE IF NOT EXISTS phone_audit_log (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    detail JSONB,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_audit_log_username ON phone_audit_log(username);
CREATE INDEX IF NOT EXISTS idx_phone_audit_log_action ON phone_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_phone_audit_log_timestamp ON phone_audit_log(timestamp DESC);

-- Contacts — shared phone book
CREATE TABLE IF NOT EXISTS phone_contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    tag VARCHAR(100),
    note TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_contacts_phone ON phone_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_phone_contacts_name ON phone_contacts(name);
