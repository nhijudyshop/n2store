-- AI KOL Studio (tikreel clone) — DB schema
-- Run via: psql $DATABASE_URL -f migrations/aikol_create_tables.sql
-- Idempotent: safe to re-run.

-- ====================================================================
-- 1. MODELS — portrait subjects (face/body reference for generation)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_models (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,                  -- n2store user identifier
    name        TEXT NOT NULL,
    file_path   TEXT NOT NULL,                  -- Bunny key, e.g. 'aikol/models/<id>.jpg'
    file_size   INTEGER,
    mime        TEXT,
    thumb_path  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aikol_models_user      ON aikol_models(user_id, created_at DESC);

-- ====================================================================
-- 2. PRODUCTS — outfit/accessory references (optional, used during gen)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_products (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    file_size   INTEGER,
    mime        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aikol_products_user    ON aikol_products(user_id, created_at DESC);

-- ====================================================================
-- 3. CLIPS — source video clips (TikTok/Douyin import or MP4 upload)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_clips (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    platform        TEXT NOT NULL,              -- 'tiktok' | 'douyin' | 'upload'
    username        TEXT,
    video_id        TEXT,
    video_url       TEXT,
    cover_url       TEXT,                        -- TikTok signed URL (lazy)
    title           TEXT,
    duration        REAL,                        -- seconds
    view_count      BIGINT,
    like_count      BIGINT,
    file_path       TEXT NOT NULL,               -- Bunny key
    file_size       BIGINT,
    download_status TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'running'|'done'|'error'
    error           TEXT,
    favorite        BOOLEAN NOT NULL DEFAULT FALSE,
    tags            TEXT[] DEFAULT '{}',
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    downloaded_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aikol_clips_user       ON aikol_clips(user_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_aikol_clips_user_user  ON aikol_clips(user_id, username);
CREATE INDEX IF NOT EXISTS idx_aikol_clips_status     ON aikol_clips(download_status) WHERE download_status IN ('pending', 'running');

-- ====================================================================
-- 4. IMPORTS — async import jobs (channel scrape progress tracker)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_imports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    profile         TEXT,                        -- channel URL
    platform        TEXT,
    username        TEXT,
    requested_count INTEGER,
    state           TEXT NOT NULL DEFAULT 'running', -- 'running'|'done'|'error'
    clips_scanned   INTEGER NOT NULL DEFAULT 0,
    done_count      INTEGER NOT NULL DEFAULT 0,
    error_count     INTEGER NOT NULL DEFAULT 0,
    pending_count   INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aikol_imports_user     ON aikol_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aikol_imports_state    ON aikol_imports(state) WHERE state = 'running';

-- ====================================================================
-- 5. GENERATIONS — image/video gen jobs (charge + refund tracked here)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_generations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT NOT NULL,
    clip_id       BIGINT REFERENCES aikol_clips(id) ON DELETE SET NULL,
    model_id      BIGINT REFERENCES aikol_models(id) ON DELETE SET NULL,
    product_id    BIGINT REFERENCES aikol_products(id) ON DELETE SET NULL,
    kind          TEXT NOT NULL,                 -- 'image'|'video'
    config        JSONB NOT NULL,                -- variations, similarity, creativity, …, note
    state         TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'running'|'done'|'error'
    error         TEXT,
    cost_credits  INTEGER NOT NULL,
    external_id   TEXT,                          -- Kling/Fal job id (poll)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aikol_gens_user        ON aikol_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aikol_gens_state       ON aikol_generations(state) WHERE state IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_aikol_gens_clip_model  ON aikol_generations(clip_id, model_id, kind);

-- ====================================================================
-- 6. OUTPUTS — generated images/videos (1 generation → N outputs)
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_outputs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id   UUID NOT NULL REFERENCES aikol_generations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    variant_index   INTEGER NOT NULL DEFAULT 0,
    file_path       TEXT NOT NULL,               -- Bunny key
    file_kind       TEXT NOT NULL,               -- 'image'|'video'
    file_size       BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aikol_outputs_user     ON aikol_outputs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aikol_outputs_gen      ON aikol_outputs(generation_id);

-- ====================================================================
-- 7. CREDITS + HISTORY — wallet
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_credits (
    user_id     TEXT PRIMARY KEY,
    balance     INTEGER NOT NULL DEFAULT 0,      -- KHÔNG free credits signup (admin: 09/05/2026 bỏ 30cr free)
    plan        TEXT NOT NULL DEFAULT 'free',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aikol_credit_history (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    kind        TEXT NOT NULL,                   -- 'topup'|'charge'|'refund'|'gift'|'signup_bonus'
    delta       INTEGER NOT NULL,                -- positive add, negative deduct
    amount_vnd  INTEGER,
    bank        TEXT,
    memo        TEXT,                            -- SePay memo (e.g. CT8YGLFDA3)
    gen_id      UUID REFERENCES aikol_generations(id) ON DELETE SET NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aikol_credit_hist_user ON aikol_credit_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aikol_credit_hist_memo ON aikol_credit_history(memo) WHERE memo IS NOT NULL;

-- ====================================================================
-- 8. CAMPAIGNS — saved (channel × model × config) bundles
-- ====================================================================
CREATE TABLE IF NOT EXISTS aikol_campaigns (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    platform        TEXT,
    username        TEXT,
    favorite_only   BOOLEAN NOT NULL DEFAULT FALSE,
    min_views       BIGINT,
    model_id        BIGINT REFERENCES aikol_models(id) ON DELETE SET NULL,
    kind            TEXT NOT NULL,
    config          JSONB NOT NULL,
    last_run_at     TIMESTAMPTZ,
    last_run_count  INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aikol_campaigns_user   ON aikol_campaigns(user_id, created_at DESC);

-- ====================================================================
-- DONE
-- ====================================================================
COMMENT ON TABLE aikol_models       IS 'AI KOL Studio: portrait subjects';
COMMENT ON TABLE aikol_products     IS 'AI KOL Studio: outfits/accessories';
COMMENT ON TABLE aikol_clips        IS 'AI KOL Studio: source clips (TikTok/Douyin/upload)';
COMMENT ON TABLE aikol_imports      IS 'AI KOL Studio: async channel import jobs';
COMMENT ON TABLE aikol_generations  IS 'AI KOL Studio: gen jobs (image/video)';
COMMENT ON TABLE aikol_outputs      IS 'AI KOL Studio: generated outputs';
COMMENT ON TABLE aikol_credits      IS 'AI KOL Studio: user credit balance';
COMMENT ON TABLE aikol_credit_history IS 'AI KOL Studio: charge/refund/topup ledger';
COMMENT ON TABLE aikol_campaigns    IS 'AI KOL Studio: saved bundles for re-run';

-- ===== Idempotency for poll re-fire / restart re-dispatch =====
-- aikol_outputs (generation_id, variant_index) UNIQUE → cho phép switch
-- INSERT từ NOT EXISTS pattern sang ON CONFLICT DO NOTHING (faster). Worker
-- code hiện dùng NOT EXISTS để work cả khi constraint chưa apply.
DO $$
BEGIN
    BEGIN
        ALTER TABLE aikol_outputs
        ADD CONSTRAINT aikol_outputs_gen_variant_unique
        UNIQUE (generation_id, variant_index);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
        NULL;
    END;
END$$;
