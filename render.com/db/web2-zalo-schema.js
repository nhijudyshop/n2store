// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Zalo schema (web2Db).
// =====================================================================
// ensureWeb2ZaloSchema(pool) — tạo toàn bộ bảng web2_zalo_* (idempotent).
//
// Nguồn DUY NHẤT của dữ liệu Zalo trong Web 2.0 (trang web2/zalo/).
// 2 loại tài khoản trong CÙNG bảng web2_zalo_accounts:
//   • account_type='personal' → zca-js (đăng nhập QR/cookie, chat 2 chiều)
//   • account_type='oa'       → Zalo OA chính thức (ZNS, tin tư vấn)
//
// Quy tắc migration (bài học web2-wallet-schema):
//   ALTER TABLE IF EXISTS ... ADD COLUMN đặt ĐẦU ensureSchema, trong try/catch
//   riêng — ALTER IF EXISTS là no-op khi bảng chưa có, không bao giờ throw.
// =====================================================================

'use strict';

// WeakSet keyed theo pool object: route nhận web2Db HOẶC fallback chatDb lúc
// cold-start → tránh pool đầu mark ready khiến pool thứ 2 skip tạo bảng.
const _ensuredPools = new WeakSet();

async function ensureWeb2ZaloSchema(pool) {
    if (!pool || _ensuredPools.has(pool)) return;
    try {
        // ── 0. ADD COLUMN trên bảng đã sống ở prod (web2_customers) — ĐẦU TIÊN ──
        //    Gộp identity Zalo vào kho KH theo SĐT (UNIQUE phone sẵn có).
        try {
            await pool.query(`
                ALTER TABLE IF EXISTS web2_customers
                    ADD COLUMN IF NOT EXISTS zalo_uid         VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS zalo_followed_oa BOOLEAN DEFAULT false;
            `);
        } catch (e) {
            console.error('[web2-zalo-schema] web2_customers ALTER warn:', e.message);
        }

        // ── 0b. Cột chat đầy đủ (reply/reaction/recall/seen) — ĐẶT ĐẦU, IF EXISTS ──
        //    Bảng web2_zalo_messages/conversations đã sống ở prod (web2Db) → ALTER
        //    idempotent. Fresh install lấy từ CREATE bên dưới (đã thêm cùng cột).
        try {
            await pool.query(`
                ALTER TABLE IF EXISTS web2_zalo_messages
                    ADD COLUMN IF NOT EXISTS cli_msg_id       TEXT,
                    ADD COLUMN IF NOT EXISTS reply_to_msg_id  TEXT,
                    ADD COLUMN IF NOT EXISTS reply_to_preview TEXT,
                    ADD COLUMN IF NOT EXISTS reactions        JSONB NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS recalled         BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS recalled_at      BIGINT,
                    ADD COLUMN IF NOT EXISTS recalled_by      VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS hidden_for_me    BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS seen_at          BIGINT;
                ALTER TABLE IF EXISTS web2_zalo_conversations
                    ADD COLUMN IF NOT EXISTS last_read_msg_id TEXT,
                    ADD COLUMN IF NOT EXISTS last_read_at     BIGINT,
                    ADD COLUMN IF NOT EXISTS is_pinned        BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS is_muted         BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN IF NOT EXISTS muted_until      BIGINT,
                    ADD COLUMN IF NOT EXISTS last_msg_sender_uid VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS info_synced_at   BIGINT;
                ALTER TABLE IF EXISTS web2_zalo_accounts
                    ADD COLUMN IF NOT EXISTS is_primary       BOOLEAN NOT NULL DEFAULT false,
                    -- owner_id = MÁY/trình duyệt sở hữu account (per-máy isolation,
                    -- 2026-06-23): mỗi máy chỉ thấy/dùng account của mình. NULL = vô chủ.
                    ADD COLUMN IF NOT EXISTS owner_id         VARCHAR(80);
                CREATE INDEX IF NOT EXISTS idx_web2_zalo_acc_owner ON web2_zalo_accounts(owner_id);
            `);
            // Backfill last_msg_sender_uid từ tin gần nhất (chỉ rows còn NULL → idempotent).
            await pool.query(`
                UPDATE web2_zalo_conversations c
                   SET last_msg_sender_uid = sub.suid
                  FROM (
                    SELECT DISTINCT ON (account_key, thread_id) account_key, thread_id,
                           CASE WHEN direction='out' THEN 'me' ELSE sender_uid END AS suid
                      FROM web2_zalo_messages
                     ORDER BY account_key, thread_id, sent_at DESC
                  ) sub
                 WHERE c.account_key = sub.account_key AND c.thread_id = sub.thread_id
                   AND c.last_msg_sender_uid IS NULL;
            `);
        } catch (e) {
            console.error('[web2-zalo-schema] chat-cols ALTER warn:', e.message);
        }

        // ── 1. Tài khoản Zalo (personal qua zca-js HOẶC OA chính thức) ──────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_accounts (
                id            BIGSERIAL PRIMARY KEY,
                account_key   VARCHAR(80) UNIQUE NOT NULL,   -- uuid (personal) | oa_id (oa)
                account_type  VARCHAR(10) NOT NULL DEFAULT 'personal', -- personal | oa
                label         VARCHAR(255),
                zalo_uid      VARCHAR(100),                  -- own user id (personal)
                oa_id         VARCHAR(80),                   -- OA id (oa)
                display_name  VARCHAR(255),
                avatar_url    TEXT,
                -- personal (zca-js) session (nhạy cảm — không log/echo):
                session       JSONB,                         -- {cookie, imei, userAgent, language}
                proxy_url     TEXT,
                -- oa (official) credentials/tokens:
                app_id        VARCHAR(80),
                oa_secret     TEXT,
                access_token  TEXT,
                refresh_token TEXT,
                token_expires BIGINT,                        -- epoch ms
                status        VARCHAR(20) NOT NULL DEFAULT 'disconnected',
                                -- disconnected|qr_pending|scanned|connected|banned|error|token_ok
                status_msg    TEXT,
                is_active     BOOLEAN NOT NULL DEFAULT true,
                is_primary    BOOLEAN NOT NULL DEFAULT false, -- (legacy, không dùng — per-máy owner-scoped)
                owner_id      VARCHAR(80),                    -- MÁY/trình duyệt sở hữu (per-máy isolation)
                meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
                last_connected_at BIGINT,
                created_at    BIGINT NOT NULL,
                updated_at    BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_acc_type   ON web2_zalo_accounts(account_type);
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_acc_active ON web2_zalo_accounts(is_active);
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_acc_oa     ON web2_zalo_accounts(oa_id) WHERE oa_id IS NOT NULL;
        `);
        // GLOBAL always-on (2026-06-29): LƯU phiên Zalo trên server lại (đảo ngược wipe
        // 2026-06-23) để boot-restore + auto-refresh. KHÔNG wipe cột `session` nữa.
        // Gộp account về 1 owner GLOBAL ('__global__') — mọi máy thấy/dùng/nghe chung
        // 1 tài khoản (bỏ per-máy owner-scoped). Idempotent (lần sau đã '__global__' → no-op).
        try {
            await pool.query(
                `UPDATE web2_zalo_accounts
                    SET owner_id='__global__'
                  WHERE account_type IN ('personal','oa')
                    AND (owner_id IS NULL OR owner_id <> '__global__')`
            );
        } catch (e) {
            console.error('[web2-zalo-schema] migrate owner_id→global warn:', e.message);
        }

        // ── 2. Hội thoại (1 dòng / account × thread) ────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_conversations (
                id            BIGSERIAL PRIMARY KEY,
                account_key   VARCHAR(80) NOT NULL,
                thread_id     VARCHAR(100) NOT NULL,         -- zalo uid (user) | group id
                thread_type   VARCHAR(10) NOT NULL DEFAULT 'user', -- user | group
                zalo_uid      VARCHAR(100),
                display_name  VARCHAR(255),
                avatar_url    TEXT,
                customer_id   BIGINT,                        -- FK → web2_customers.id (nullable)
                phone         VARCHAR(20),
                last_msg_at   BIGINT,
                last_msg_text TEXT,
                unread_count  INTEGER NOT NULL DEFAULT 0,
                last_read_msg_id TEXT,
                last_read_at  BIGINT,
                is_pinned     BOOLEAN NOT NULL DEFAULT false,
                is_muted      BOOLEAN NOT NULL DEFAULT false,
                muted_until   BIGINT,
                last_msg_sender_uid VARCHAR(100),
                info_synced_at BIGINT,                       -- lần cuối lấy tên/avatar NHÓM từ zca (gate repair)
                meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at    BIGINT NOT NULL,
                updated_at    BIGINT NOT NULL,
                UNIQUE (account_key, thread_id)
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_conv_acc      ON web2_zalo_conversations(account_key);
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_conv_uid      ON web2_zalo_conversations(zalo_uid);
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_conv_phone    ON web2_zalo_conversations(phone) WHERE phone IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_conv_customer ON web2_zalo_conversations(customer_id) WHERE customer_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_conv_last     ON web2_zalo_conversations(last_msg_at DESC NULLS LAST);
        `);

        // ── 3. Tin nhắn (append-only) ───────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_messages (
                id            BIGSERIAL PRIMARY KEY,
                msg_id        TEXT,                          -- zalo message id (dedup, nullable)
                cli_msg_id    TEXT,                          -- client msg id (cần cho recall/react/seen)
                account_key   VARCHAR(80) NOT NULL,
                thread_id     VARCHAR(100) NOT NULL,
                thread_type   VARCHAR(10) NOT NULL DEFAULT 'user',
                direction     VARCHAR(10) NOT NULL,          -- in | out
                msg_type      VARCHAR(30) NOT NULL DEFAULT 'text', -- text|image|file|sticker|video|voice|link|zns|template
                content       TEXT,
                attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,
                reply_to_msg_id  TEXT,                       -- quote: msg_id gốc
                reply_to_preview TEXT,                       -- quote: preview ngắn
                reactions     JSONB NOT NULL DEFAULT '{}'::jsonb, -- {icon: [uid,...]}
                recalled      BOOLEAN NOT NULL DEFAULT false, -- thu hồi (undo)
                recalled_at   BIGINT,
                recalled_by   VARCHAR(100),
                hidden_for_me BOOLEAN NOT NULL DEFAULT false, -- xoá ở phía tôi (deleteMessage onlyMe)
                seen_at       BIGINT,                        -- KH đã xem tin out
                sender_uid    VARCHAR(100),
                send_status   VARCHAR(20) DEFAULT 'sent',    -- sent|failed|pending
                error_msg     TEXT,
                sent_at       BIGINT NOT NULL,
                created_at    BIGINT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_zalo_msg_id ON web2_zalo_messages(account_key, msg_id) WHERE msg_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_msg_thread ON web2_zalo_messages(account_key, thread_id, sent_at DESC);
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_msg_failed ON web2_zalo_messages(send_status) WHERE send_status = 'failed';
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_msg_reply  ON web2_zalo_messages(reply_to_msg_id) WHERE reply_to_msg_id IS NOT NULL;
        `);

        // ── 3b. Media tự host (ảnh/file shop GỬI) — bytea, serve qua /media/:id ──
        //    Lý do: api.sendMessage upload ảnh lên Zalo CDN nhưng KHÔNG trả URL về
        //    → lưu bản copy bytea để UI shop hiển thị lại ảnh đã gửi sau reload.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_media (
                id          BIGSERIAL PRIMARY KEY,
                account_key VARCHAR(80),
                mime        VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
                filename    VARCHAR(255),
                data        BYTEA NOT NULL,
                width       INTEGER,
                height      INTEGER,
                size        INTEGER,
                created_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_media_created ON web2_zalo_media(created_at DESC);
            -- token bất khả đoán cho URL /media (chống IDOR enumerate id BIGSERIAL tuần tự).
            ALTER TABLE web2_zalo_media ADD COLUMN IF NOT EXISTS token VARCHAR(48);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_web2_zalo_media_token ON web2_zalo_media(token) WHERE token IS NOT NULL;
        `);

        // ── 3c. Cache thành viên (uid → tên + avatar) — resolve tên người gửi ──
        //    trong NHÓM (group message dName rỗng → phải getGroupMembersInfo).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_members (
                account_key  VARCHAR(80) NOT NULL,
                uid          VARCHAR(100) NOT NULL,
                display_name VARCHAR(255),
                avatar       TEXT,
                updated_at   BIGINT NOT NULL,
                PRIMARY KEY (account_key, uid)
            );
        `);

        // ── 3d. Nhóm được THEO DÕI (allowlist) — chỉ tin của các nhóm này mới ───
        //    được _persistIncoming lưu lại. Bảng có ≥1 row → filter BẬT (chỉ lưu
        //    nhóm trong bảng); bảng RỖNG → filter TẮT (lưu tất, backward-compat an
        //    toàn để không vô tình rớt sạch tin khi cấu hình sai). Khoá theo
        //    (account_key, thread_id) — sống sót qua wipe (chỉ wipe messages/conv).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_tracked_groups (
                account_key VARCHAR(80) NOT NULL,
                thread_id   VARCHAR(100) NOT NULL,
                name        VARCHAR(255),
                added_at    BIGINT NOT NULL,
                PRIMARY KEY (account_key, thread_id)
            );
        `);

        // ── 4. ZNS templates (cache từ OA) ──────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zns_templates (
                id               BIGSERIAL PRIMARY KEY,
                template_id      VARCHAR(80) UNIQUE NOT NULL,
                oa_id            VARCHAR(80),
                template_name    VARCHAR(255) NOT NULL,
                template_quality VARCHAR(20),
                status           VARCHAR(20) DEFAULT 'ENABLE',
                params           JSONB NOT NULL DEFAULT '[]'::jsonb,
                preview_url      TEXT,
                is_active        BOOLEAN NOT NULL DEFAULT true,
                created_at       BIGINT NOT NULL,
                updated_at       BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zns_tpl_oa     ON web2_zns_templates(oa_id);
            CREATE INDEX IF NOT EXISTS idx_web2_zns_tpl_active ON web2_zns_templates(is_active);
        `);

        // ── 5. ZNS send log (append-only, 1 dòng / lần gửi) ─────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zns_log (
                id          BIGSERIAL PRIMARY KEY,
                log_id      TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
                oa_id       VARCHAR(80),
                template_id VARCHAR(80) NOT NULL,
                phone       VARCHAR(20) NOT NULL,
                customer_id BIGINT,
                params      JSONB NOT NULL DEFAULT '{}'::jsonb,
                status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|sent|failed
                zalo_msg_id TEXT,
                quota_cost  INTEGER,
                order_ref   VARCHAR(80),
                error_msg   TEXT,
                sent_by     VARCHAR(100),
                sent_at     BIGINT,
                created_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zns_log_phone   ON web2_zns_log(phone);
            CREATE INDEX IF NOT EXISTS idx_web2_zns_log_status  ON web2_zns_log(status);
            CREATE INDEX IF NOT EXISTS idx_web2_zns_log_ref     ON web2_zns_log(order_ref) WHERE order_ref IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_zns_log_created ON web2_zns_log(created_at DESC);
        `);

        // ── 6. Bulk send jobs ───────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_send_jobs (
                id          BIGSERIAL PRIMARY KEY,
                job_id      TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
                account_key VARCHAR(80),
                job_type    VARCHAR(30) NOT NULL DEFAULT 'zns', -- zns | chat
                template_id VARCHAR(80),
                params_base JSONB NOT NULL DEFAULT '{}'::jsonb,
                message     TEXT,
                status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|running|done|failed|cancelled
                total       INTEGER NOT NULL DEFAULT 0,
                sent        INTEGER NOT NULL DEFAULT 0,
                failed      INTEGER NOT NULL DEFAULT 0,
                created_by  VARCHAR(100),
                started_at  BIGINT,
                finished_at BIGINT,
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_jobs_status ON web2_zalo_send_jobs(status);
        `);

        // ── 7. Bulk send items ──────────────────────────────────────────────────
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_zalo_send_items (
                id          BIGSERIAL PRIMARY KEY,
                job_id      TEXT NOT NULL,
                phone       VARCHAR(20),
                thread_id   VARCHAR(100),
                customer_id BIGINT,
                params      JSONB NOT NULL DEFAULT '{}'::jsonb,
                status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|sent|failed|skip
                zalo_msg_id TEXT,
                error_msg   TEXT,
                sent_at     BIGINT,
                created_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_items_job    ON web2_zalo_send_items(job_id);
            CREATE INDEX IF NOT EXISTS idx_web2_zalo_items_status ON web2_zalo_send_items(job_id, status);
        `);

        _ensuredPools.add(pool);
        console.log('[web2-zalo-schema] all Zalo tables ready (web2Db)');
    } catch (e) {
        console.error('[web2-zalo-schema] ensureSchema failed:', e.message);
    }
}

module.exports = { ensureWeb2ZaloSchema };
