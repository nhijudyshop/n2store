// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// NATIVE ORDERS REST API
// Web-native order creation, ISOLATED from hệ cũ (SaleOnline_Order)
// and from social_orders (which belongs to don-inbox).
//
// Used by tpos-pancake "Tạo đơn" button (replaces the hệ cũ flow).
// Orders are marked with source='NATIVE_WEB' so they can be
// distinguished from hệ cũ orders in any downstream report.
// =====================================================

const express = require('express');
const router = express.Router();
// 2026-06-03: tách kho KH đơn hàng Web 2.0 → web2_customers (web2Db).
// KHÔNG dùng customer-creation-service / customer-helpers (Web 1.0, bảng
// `customers` ở chatDb) nữa — tránh nhầm + đúng rule no cross-import.
// 2026-06-07: kho KH warehouse Web 2.0 (web2_customers) — ĐỘC LẬP, KHÔNG hệ cũ.
const {
    getOrCreateWeb2OrderCustomer,
    lookupCustomerIdByPhone,
    normalizePhone: _normPhoneWeb2,
} = require('../services/web2-order-customer-service');

// #6 (2026-06-29): cột native_orders.phone trước đây lưu b.phone RAW → có thể
// chứa '+84…', khoảng trắng, fb_id, số rác. Chuẩn hoá về canonical VN ^0\d{9}$
// (bỏ +84→0, lấy 10 số cuối nếu hợp lệ) DÙNG CHUNG với link KH
// (getOrCreateWeb2OrderCustomer cũng normPhone qua cùng nguồn) → cột phone và
// customer_id luôn nhất quán. Trả '' nếu không hợp lệ (KHÔNG dùng làm SĐT chuẩn).
// ponytail: wrap normPhoneWeb2 (đã có) thay vì viết lại regex — 1 nguồn chuẩn hoá.
function _normVnPhone(p) {
    return _normPhoneWeb2(p) || '';
}
const web2WalletService = require('../services/web2-wallet-service');
// Gate admin cho thao tác KPI nhạy cảm (chốt base = khóa bất biến → chỉ admin).
// requireWeb2AuthSoft: gate mềm → 401 khi WEB2_AUTH_ENFORCE=1 (ĐANG BẬT prod). Áp cho
// MỌI route mutation gọi từ browser — parity với fast-sale-orders.js (sibling đã gate).
// ⚠ KHÔNG gate /from-comment: cart.js loopback (v2/cart.js) gọi server-to-server KHÔNG kèm
// token → cần forward token trước khi gate (follow-up).
const { requireWeb2Admin, requireWeb2AuthSoft } = require('../middleware/web2-auth');
// EVENT-SINK audit toàn bộ (2026-06-22): ghi web2_audit_events mỗi thao tác đơn →
// per-order history (Web2AuditLog.openRecord entity='native-order').
const { recordAuditEvent } = require('../services/web2-audit-sink');
// WEB2.0 — engine TAG đơn hàng auto (registry + eval cho_hang/am_ma/...). /load
// gọi enrichOrdersWithTags → o.autoTags + o.hasChoHang. Xem services/web2-order-tags-service.
const orderTagsSvc = require('../services/web2-order-tags-service');

// 2026-06-04: HOÀN ví khi huỷ đơn — refund số tiền đã trừ ví (wallet_deducted)
// của các PBH liên kết, rồi zero-out để không hoàn lặp (idempotent). Trả tổng đã hoàn.
//
// ⚠ 3H3 (2026-06-12): /:code/cancel KHÔNG dùng hàm này nữa — thay bằng
// fastSale._cancelPbhInTx per-PBH (restock + hoàn ví + state, match cả merged).
// Giữ hàm cho tham chiếu/flow phụ; hiện không caller nào (eslint: dead code OK).
//
// 2026-06-10 (bug 5): `db` có thể là Pool HOẶC client transaction. Khi gọi từ
// /cancel ta truyền client của transaction đang giữ → deposit ví + zero-out
// wallet_deducted + UPDATE status='cancelled' COMMIT chung 1 transaction. Nếu
// crash giữa chừng → ROLLBACK toàn bộ: KHÔNG còn cảnh "đã huỷ nhưng ví chưa hoàn"
// hay "hoàn ví nhưng wallet_deducted chưa zero → hoàn trùng khi retry".
// processDeposit + zero-out per-row vẫn idempotent (chỉ chạy khi wallet_deducted>0).
// LƯU Ý: KHÔNG nuốt lỗi khi chạy trong transaction (throw để caller ROLLBACK).
async function _refundWalletForNativeOrder(db, code, phone, performedBy, opts = {}) {
    const inTransaction = !!opts.inTransaction;
    let refunded = 0;
    if (!phone) return refunded;
    try {
        const q = await db.query(
            `SELECT id, number, wallet_deducted FROM fast_sale_orders
             WHERE source_type='native_order' AND source_code = $1 AND wallet_deducted > 0
             FOR UPDATE`,
            [code]
        );
        for (const row of q.rows) {
            const amt = Number(row.wallet_deducted) || 0;
            if (amt <= 0) continue;
            await web2WalletService.processDeposit(
                db,
                phone,
                amt,
                null,
                `Hoàn ví huỷ PBH ${row.number}`,
                null,
                null,
                null,
                performedBy || '(huỷ đơn)' // performed_by — audit ai hoàn ví
            );
            await db.query(`UPDATE fast_sale_orders SET wallet_deducted = 0 WHERE id = $1`, [
                row.id,
            ]);
            refunded += amt;
        }
    } catch (e) {
        console.warn('[native-orders] wallet refund on cancel failed:', e.message);
        // Trong transaction: ném lại để caller ROLLBACK (giữ nguyên tử). Ngoài
        // transaction (gọi bằng Pool): nuốt lỗi như cũ — không chặn luồng huỷ.
        if (inTransaction) throw e;
    }
    return refunded;
}

// =====================================================
// 2-way state sync: native-orders ↔ fast_sale_orders (PBH).
// =====================================================
// User yêu cầu: PBH state mirror native-order status. Khi native-order
// đổi status (draft/confirmed/cancelled) → tự đẩy state mới sang PBH liên kết.
// Hỗ trợ cả merged PBH (source_code = 'NJ-A+NJ-B' join '+').
//
// Map: draft→draft, confirmed→confirmed, cancelled→cancel.
// (Không dùng 'done' để giữ user-facing 'confirmed' label = "Đã XN")
// Simplified 2-state model cho fast_sale_orders (user request):
//   - native creates PBH → PBH state = 'done' (Hoàn thành)
//   - native cancels PBH → PBH state = 'cancel' (Đã hủy)
// Bỏ 'draft' và 'confirmed' khỏi fast_sale_orders — không cần intermediate state.
const NATIVE_TO_PBH_STATE = {
    draft: 'done', // edge case: PBH đã được tạo và native vẫn ở draft (shouldn't happen)
    confirmed: 'done', // confirmed native = PBH đã active = 'done'
    cancelled: 'cancel',
    cancel: 'cancel',
};

async function syncPbhStateFromNativeOrder(pool, nativeOrderCode, newNativeStatus) {
    const pbhState = NATIVE_TO_PBH_STATE[newNativeStatus];
    if (!pbhState || !nativeOrderCode) return { synced: 0 };
    try {
        // Match: source_code = code (single) HOẶC chứa code giữa các dấu '+' (merged).
        // Patterns: 'NJ-A', 'NJ-A+%', '%+NJ-A+%', '%+NJ-A'.
        const r = await pool.query(
            `UPDATE fast_sale_orders
             SET state = $1, date_updated = NOW()
             WHERE state <> $1
               AND (source_code = $2
                    OR source_code LIKE $3
                    OR source_code LIKE $4
                    OR source_code LIKE $5)
             RETURNING number`,
            [
                pbhState,
                nativeOrderCode,
                `${nativeOrderCode}+%`,
                `%+${nativeOrderCode}+%`,
                `%+${nativeOrderCode}`,
            ]
        );
        if (r.rows.length > 0) {
            console.log(
                `[NATIVE→PBH-SYNC] ${nativeOrderCode} status=${newNativeStatus} → PBH state=${pbhState} (${r.rows.length} PBH)`
            );
        }
        return { synced: r.rows.length, numbers: r.rows.map((x) => x.number) };
    } catch (e) {
        console.warn('[NATIVE→PBH-SYNC] fail:', e.message);
        return { synced: 0, error: e.message };
    }
}

// -----------------------------------------------------
// SSE notifier — injected từ server.js. Sau mỗi DB mutation, broadcast
// topic 'web2:native-orders' để các client đang xem trang Đơn Web tự
// refresh không cần F5. Replaces (would-be) Firestore listener.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:native-orders',
            { action, code: code || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[NATIVE-ORDERS] _notify failed:', e.message);
    }
}

// Ghi 1 dòng audit cho đơn (post-commit, best-effort). User lấy từ token →
// _editor → createdBy/userName (native-orders truyền user qua body).
function _auditOrder(req, action, code, note) {
    if (!code) return;
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const b = req.body || {};
    const ed = b._editor || {};
    recordAuditEvent(pool, {
        entity: 'native-order',
        entityId: code,
        action,
        userId: req.web2User?.id ?? ed.userId ?? b.userId ?? b.createdBy ?? null,
        userName:
            req.web2User?.display_name ?? ed.userName ?? b.userName ?? b.createdByName ?? null,
        sourcePage: 'native-orders',
        changes: note ? { note } : {},
    });
}

// -----------------------------------------------------
// Auto-create table on first request
// -----------------------------------------------------
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    // MIGRATION (ĐẶT ĐẦU — rule MEMORY: ALTER mới phải chạy trước mọi bước khác):
    // DROP crm_team_id — di tích hệ cũ, không consumer nào đọc (getPartnerInfo
    // bỏ qua tường minh, không UI hiển thị); di tích hệ cũ còn nhét FB
    // Page Id 15 chữ số vào làm tràn INT4 → 500 (bug drag-drop 2026-06-12).
    // Page của đơn đọc fb_page_id/fb_page_name. Idempotent: DROP IF EXISTS.
    try {
        await pool.query(`ALTER TABLE IF EXISTS native_orders DROP COLUMN IF EXISTS crm_team_id`);
    } catch (e) {
        console.warn('[NATIVE-ORDERS] migrate drop crm_team_id warn:', e.message);
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS native_orders (
                id              BIGSERIAL PRIMARY KEY,
                code            VARCHAR(40)  UNIQUE NOT NULL,
                session_index   INTEGER,
                source          VARCHAR(30)  NOT NULL DEFAULT 'NATIVE_WEB',

                customer_name   VARCHAR(255),
                phone           VARCHAR(40),
                address         TEXT,
                note            TEXT,

                fb_user_id      VARCHAR(100),
                fb_user_name    VARCHAR(255),
                fb_page_id      VARCHAR(100),
                fb_post_id      VARCHAR(100),
                fb_comment_id   VARCHAR(100),

                products        JSONB  DEFAULT '[]'::jsonb,
                total_quantity  INTEGER DEFAULT 0,
                total_amount    NUMERIC(14,2) DEFAULT 0,

                status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                tags            JSONB  DEFAULT '[]'::jsonb,

                created_by      VARCHAR(100),
                created_by_name VARCHAR(255),
                created_at      BIGINT NOT NULL,
                updated_at      BIGINT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_native_orders_created_at
                ON native_orders(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_native_orders_fb_user_id
                ON native_orders(fb_user_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_fb_post_id
                ON native_orders(fb_post_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_status
                ON native_orders(status);
            CREATE INDEX IF NOT EXISTS idx_native_orders_phone
                ON native_orders(phone);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_native_orders_comment
                ON native_orders(fb_comment_id)
                WHERE fb_comment_id IS NOT NULL;

            -- Migration 067: extend with order fields (idempotent ADD IF NOT EXISTS)
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS assigned_employee_id   VARCHAR(100),
                ADD COLUMN IF NOT EXISTS assigned_employee_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS live_campaign_id       VARCHAR(100),
                ADD COLUMN IF NOT EXISTS live_campaign_name     VARCHAR(255),
                ADD COLUMN IF NOT EXISTS deposit                NUMERIC(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS partner_status         VARCHAR(50),
                ADD COLUMN IF NOT EXISTS warehouse_id           INTEGER,
                ADD COLUMN IF NOT EXISTS reversed_code          VARCHAR(40),
                ADD COLUMN IF NOT EXISTS print_count            INTEGER NOT NULL DEFAULT 0,
                -- 2026-06-07: epoch ms lần in gần nhất (hover icon máy in ở list → hiện thời gian).
                ADD COLUMN IF NOT EXISTS last_printed_at        BIGINT,
                -- 2026-06-30: counter RIÊNG cho Phiếu Soạn Hàng (giỏ) — tách khỏi print_count
                -- (print_count gộp cả bill PBH). Tag soan_hang = giỏ draft đã in phiếu soạn hàng.
                ADD COLUMN IF NOT EXISTS soan_hang_print_count  INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS soan_hang_last_printed_at BIGINT,
                -- 2026-06-04: kênh đơn — 'web2_livestream' (drag từ tpos-pancake/comment)
                -- vs 'web2_inbox' (tạo tay từ tab Đơn Inbox). Default web2_livestream cho
                -- đơn cũ + from-comment. (2026-06-05: prefix web2_ — xem migration dưới.)
                ADD COLUMN IF NOT EXISTS channel                VARCHAR(20) NOT NULL DEFAULT 'web2_livestream',
                -- 2026-06-04: phương thức giao hàng auto-detect (lưu lại để hiện ở cột địa chỉ).
                -- value/label từ DeliveryMethodPicker; manual=true khi user chỉnh tay
                -- → không bị auto-detect ghi đè khi địa chỉ đổi.
                ADD COLUMN IF NOT EXISTS delivery_method        VARCHAR(60),
                ADD COLUMN IF NOT EXISTS delivery_method_label  VARCHAR(255),
                ADD COLUMN IF NOT EXISTS delivery_method_manual BOOLEAN NOT NULL DEFAULT false,
                -- 2026-06-09: KPI base snapshot cho đơn LIVESTREAM. Khóa 1 lần lúc gửi
                -- "Chốt đơn" thành công = list SP khách đặt trong live. KPI chỉ tính
                -- phần upsell vượt base: Σ max(0, qty_hiện_tại - qty_base). NULL = chưa
                -- chốt (KPI=0). Bất biến sau khi set (chống cheat hạ base). Inbox KHÔNG
                -- dùng base (tính 100%). Shape: {"<productCode>": <qty>, ...}.
                ADD COLUMN IF NOT EXISTS kpi_base               JSONB,
                ADD COLUMN IF NOT EXISTS kpi_base_at            BIGINT,
                ADD COLUMN IF NOT EXISTS kpi_base_by            VARCHAR(120);
            CREATE INDEX IF NOT EXISTS idx_native_orders_channel ON native_orders(channel);

            -- 2026-06-05: prefix kênh đơn 'web2_'. Lý do: 'inbox'/'livestream'
            -- trần dễ nhầm với Pancake filterType 'inbox', icon lucide 'inbox',
            -- field product-line source 'livestream', hệ thứ 3,… Đổi cho rõ thuộc
            -- Web 2.0. Idempotent (chạy 1 lần/cold start, sau đó WHERE khớp 0 row).
            -- Cột channel đã tồn tại từ trước → ALTER default thủ công (ADD COLUMN
            -- IF NOT EXISTS không đổi default của cột sẵn có).
            ALTER TABLE native_orders ALTER COLUMN channel SET DEFAULT 'web2_livestream';
            UPDATE native_orders SET channel = 'web2_inbox' WHERE channel = 'inbox';
            UPDATE native_orders SET channel = 'web2_livestream'
                WHERE channel = 'livestream' OR channel IS NULL;

            CREATE INDEX IF NOT EXISTS idx_native_orders_live_campaign
                ON native_orders(live_campaign_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_assigned
                ON native_orders(assigned_employee_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_reversed_code
                ON native_orders(reversed_code);

            -- Migration 068: global display STT — sequence cấp số atomic
            -- "Reset về 1" = ALTER SEQUENCE ... RESTART WITH 1
            CREATE SEQUENCE IF NOT EXISTS native_orders_display_stt_seq START 1;
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS display_stt INTEGER;
            CREATE INDEX IF NOT EXISTS idx_native_orders_display_stt
                ON native_orders(display_stt DESC);

            -- Migration 069: mirror hệ cũ (SaleOnline_Order) fields cho full clone
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS city_code         VARCHAR(20),
                ADD COLUMN IF NOT EXISTS city_name         VARCHAR(120),
                ADD COLUMN IF NOT EXISTS district_code     VARCHAR(20),
                ADD COLUMN IF NOT EXISTS district_name     VARCHAR(120),
                ADD COLUMN IF NOT EXISTS ward_code         VARCHAR(20),
                ADD COLUMN IF NOT EXISTS ward_name         VARCHAR(120),
                ADD COLUMN IF NOT EXISTS partner_id        INTEGER,
                ADD COLUMN IF NOT EXISTS partner_code      VARCHAR(60),
                ADD COLUMN IF NOT EXISTS partner_unique_id VARCHAR(80),
                ADD COLUMN IF NOT EXISTS email             VARCHAR(255),
                ADD COLUMN IF NOT EXISTS company_id        INTEGER,
                ADD COLUMN IF NOT EXISTS company_name      VARCHAR(150),
                ADD COLUMN IF NOT EXISTS warehouse_name    VARCHAR(150),
                ADD COLUMN IF NOT EXISTS message_count     INTEGER DEFAULT 0,
                -- 2026-06-10: tên FB Page nguồn comment (đơn from-comment UPDATE
                -- set fb_page_name; thiếu cột → schema drift → UPDATE fail). Idempotent.
                ADD COLUMN IF NOT EXISTS fb_page_name      VARCHAR(255),
                ADD COLUMN IF NOT EXISTS tpos_index        INTEGER;

            -- Migration 073: gộp comment cùng campaign+customer thay vì tạo đơn mới
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS comment_ids JSONB DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 1;
            -- Migration 074: Customer 360 cross-system FK (Phase 12)
            -- Soft FK (no constraint) — orders survive if customer is hard-deleted
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS customer_id INTEGER;
            CREATE INDEX IF NOT EXISTS idx_native_orders_partner_id ON native_orders(partner_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_company_id ON native_orders(company_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_customer_id ON native_orders(customer_id);

            -- Migration 075: Gộp Đơn Web — lưu array display_stt của các đơn gốc
            -- đã merge → client hiển thị "STT1 + STT2" trong cột STT.
            -- Khi merge: tạo native_order mới với merged_display_stt + merged_codes,
            -- xóa các native_order gốc (atomic transaction).
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS merged_display_stt JSONB,
                ADD COLUMN IF NOT EXISTS merged_codes JSONB;

            -- Migration 079: tách đơn nháp — 1 native_order → nhiều đơn cùng STT
            -- nhưng khác split_index (vd 31-1, 31-2). Original gốc giữ split_index=1
            -- khi lần đầu split, đơn mới (giỏ rỗng) lấy split_index=2/3/...
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS split_index INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_native_orders_split_lookup
                ON native_orders(display_stt, split_index);

            -- Migration 080: per-campaign STT (KPI attribution scope).
            -- display_stt là global sequence; admin cần khoảng STT riêng cho từng
            -- campaign để chia cho NV. campaign_stt = 1..N reset theo
            -- live_campaign_id. Đơn không có campaign rơi vào 'NO_CAMPAIGN' synthetic.
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS campaign_stt INTEGER;
            CREATE INDEX IF NOT EXISTS idx_native_orders_campaign_stt
                ON native_orders(live_campaign_id, campaign_stt);

            -- Migration 081: tach comment khoi user note. note (legacy) chua
            -- comment auto-captured tu FB (format [time] [Page] message), gio
            -- treat as readonly. user_note la field moi NV tu ghi (size, mau,
            -- yeu cau KH ...). Save modal ghi vao user_note, KHONG dung note.
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS user_note TEXT;

            -- Migration 082 (#2 + H4): parent_campaign_id — chiến dịch CHA span 2
            -- page. 1 bài (fb_post_id) → 1 cha (web2_live_post_assign.campaign_id).
            -- Là KEY NHÓM thống nhất cho campaign_stt (put-wall) + gộp giỏ cross-page.
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS parent_campaign_id BIGINT;
            CREATE INDEX IF NOT EXISTS idx_native_orders_parent_campaign
                ON native_orders(parent_campaign_id, campaign_stt);
        `);

        // Backfill existing rows with display_stt (one-shot, ordered by created_at ASC)
        await pool.query(`
            DO $$
            DECLARE r RECORD;
            BEGIN
                IF EXISTS (SELECT 1 FROM native_orders WHERE display_stt IS NULL LIMIT 1) THEN
                    FOR r IN SELECT id FROM native_orders WHERE display_stt IS NULL ORDER BY created_at ASC LOOP
                        UPDATE native_orders SET display_stt = nextval('native_orders_display_stt_seq') WHERE id = r.id;
                    END LOOP;
                END IF;
            END $$;
        `);

        // Migration 076: backfill time prefix [HH24:MI:SS D/M/YYYY] cho ghi chú đầu
        // tiên (chưa có prefix). Bug lịch sử: orders tạo trước commit 0599b1dd (2026-05-20
        // 15:52) không có time prefix trên dòng note đầu, chỉ comment merge sau mới có.
        // Self-gated qua bảng tracker (chạy 1 lần duy nhất).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS native_orders_migrations (
                name VARCHAR(120) PRIMARY KEY,
                run_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            DO $$
            DECLARE r RECORD; ts_local TIMESTAMP; prefix TEXT;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM native_orders_migrations
                    WHERE name = '076_backfill_note_time_prefix'
                ) THEN
                    FOR r IN
                        SELECT id, note, created_at
                        FROM native_orders
                        WHERE note IS NOT NULL
                          AND length(trim(note)) > 0
                          AND note !~ '^\\['
                    LOOP
                        ts_local := (to_timestamp(r.created_at / 1000.0)
                                     AT TIME ZONE 'Asia/Ho_Chi_Minh');
                        prefix := '[' || to_char(ts_local, 'HH24:MI:SS')
                               || ' ' || to_char(ts_local, 'FMDD/FMMM/YYYY')
                               || '] ';
                        UPDATE native_orders SET note = prefix || note WHERE id = r.id;
                    END LOOP;
                    INSERT INTO native_orders_migrations(name) VALUES ('076_backfill_note_time_prefix');
                END IF;
            END $$;
        `);

        // Migration 077: với merged orders (gộp đơn), inner segment '[NJ-X-Y] CONTENT'
        // nếu CONTENT không bắt đầu bằng '[' → chèn '[time] ' từ created_at của merged
        // order. Lý do: source orders đã bị xóa khi merge → không khôi phục đúng time
        // gốc; dùng merged.created_at làm fallback (off vài phút, nhưng có time tốt
        // hơn không có).
        await pool.query(`
            DO $$
            DECLARE r RECORD; ts_local TIMESTAMP; prefix_inner TEXT;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM native_orders_migrations
                    WHERE name = '077_backfill_merged_inner_prefix'
                ) THEN
                    FOR r IN
                        SELECT id, note, created_at FROM native_orders
                        WHERE merged_codes IS NOT NULL
                          AND note ~ '\\[N[WJ]-[0-9]+-[0-9]+\\] [^\\[]'
                    LOOP
                        ts_local := (to_timestamp(r.created_at / 1000.0)
                                     AT TIME ZONE 'Asia/Ho_Chi_Minh');
                        prefix_inner := '[' || to_char(ts_local, 'HH24:MI:SS')
                                     || ' ' || to_char(ts_local, 'FMDD/FMMM/YYYY')
                                     || '] ';
                        UPDATE native_orders
                        SET note = regexp_replace(
                            note,
                            '(\\[N[WJ]-[0-9]+-[0-9]+\\] )([^\\[])',
                            '\\1' || prefix_inner || '\\2',
                            'g'
                        )
                        WHERE id = r.id;
                    END LOOP;
                    INSERT INTO native_orders_migrations(name) VALUES ('077_backfill_merged_inner_prefix');
                END IF;
            END $$;
        `);
        // Migration 080: backfill campaign_stt for existing rows.
        // Per campaign, ORDER BY created_at ASC, assign 1..N. NULL campaign →
        // 'NO_CAMPAIGN' synthetic group. Self-gated qua native_orders_migrations.
        await pool.query(`
            DO $$
            DECLARE r RECORD; current_campaign TEXT; counter INTEGER;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM native_orders_migrations
                    WHERE name = '080_backfill_campaign_stt'
                ) THEN
                    current_campaign := NULL;
                    counter := 0;
                    FOR r IN
                        SELECT id, COALESCE(live_campaign_id, 'NO_CAMPAIGN') AS cid
                        FROM native_orders
                        WHERE campaign_stt IS NULL
                        ORDER BY COALESCE(live_campaign_id, 'NO_CAMPAIGN'), created_at ASC
                    LOOP
                        IF current_campaign IS DISTINCT FROM r.cid THEN
                            current_campaign := r.cid;
                            SELECT COALESCE(MAX(campaign_stt), 0) + 1 INTO counter
                            FROM native_orders
                            WHERE COALESCE(live_campaign_id, 'NO_CAMPAIGN') = r.cid;
                        ELSE
                            counter := counter + 1;
                        END IF;
                        UPDATE native_orders SET campaign_stt = counter WHERE id = r.id;
                    END LOOP;
                    INSERT INTO native_orders_migrations(name) VALUES ('080_backfill_campaign_stt');
                END IF;
            END $$;
        `);
        // Migration 082 (#2 + H4): CHỈ backfill parent_campaign_id từ web2_live_post_assign.
        // KHÔNG re-number campaign_stt của đơn CŨ — vì web2_kpi_assignments (KPI) đang
        // key theo (live_campaign_name + campaign_stt range); đổi STT cũ sẽ vỡ attribution
        // NGAY lúc boot (review HIGH-3). Đơn MỚI tự numbering theo group cha (MAX+1 đã
        // đếm cả đơn cũ đã backfill parent). Re-number sạch để dành commit KPI (cùng
        // lúc re-key KPI theo parent_campaign_id). Self-gated; guard post_assign fresh DB.
        await pool.query(`
            DO $$
            DECLARE has_assign BOOLEAN;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM native_orders_migrations
                    WHERE name = '082_backfill_parent_campaign'
                ) THEN
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = 'web2_live_post_assign'
                    ) INTO has_assign;
                    IF has_assign THEN
                        UPDATE native_orders o
                        SET parent_campaign_id = pa.campaign_id
                        FROM web2_live_post_assign pa
                        WHERE o.fb_post_id = pa.post_id
                          AND o.parent_campaign_id IS NULL
                          AND pa.campaign_id IS NOT NULL;
                    END IF;
                    INSERT INTO native_orders_migrations(name) VALUES ('082_backfill_parent_campaign');
                END IF;
            END $$;
        `);

        _ensuredPools.add(pool);
        console.log(
            '[NATIVE-ORDERS] Tables created/verified (migration 082: parent_campaign_id backfill)'
        );
    } catch (error) {
        console.error('[NATIVE-ORDERS] Table creation error:', error.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function mapRowToOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        code: row.code,
        displayStt: row.display_stt,
        campaignStt: row.campaign_stt,
        mergedDisplayStt: row.merged_display_stt || null,
        mergedCodes: row.merged_codes || null,
        splitIndex: Number(row.split_index) || 0,
        sessionIndex: row.session_index,
        source: row.source,
        customerName: row.customer_name,
        phone: row.phone,
        address: row.address,
        note: row.note,
        userNote: row.user_note,
        fbUserId: row.fb_user_id,
        fbUserName: row.fb_user_name,
        fbPageId: row.fb_page_id,
        fbPostId: row.fb_post_id,
        fbCommentId: row.fb_comment_id,
        products: row.products || [],
        totalQuantity: row.total_quantity,
        totalAmount: Number(row.total_amount || 0),
        status: row.status,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        // Migration 067 — order fields
        assignedEmployeeId: row.assigned_employee_id,
        assignedEmployeeName: row.assigned_employee_name,
        liveCampaignId: row.live_campaign_id,
        liveCampaignName: row.live_campaign_name,
        deposit: Number(row.deposit || 0),
        partnerStatus: row.partner_status,
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        reversedCode: row.reversed_code,
        printCount: Number(row.print_count || 0),
        lastPrintedAt: row.last_printed_at != null ? Number(row.last_printed_at) : null,
        soanHangPrintCount: Number(row.soan_hang_print_count || 0), // tag soan_hang (giỏ đã in phiếu soạn hàng)
        channel: row.channel || 'web2_livestream', // kênh đơn (web2_livestream/web2_inbox)
        // 2026-06-04: phương thức giao hàng auto-detect (hiện ở cột địa chỉ)
        deliveryMethod: row.delivery_method || null,
        deliveryMethodLabel: row.delivery_method_label || null,
        deliveryMethodManual: row.delivery_method_manual === true,
        // 2026-06-09: KPI base snapshot (đơn livestream — khóa lúc chốt). null=chưa chốt.
        kpiBase: row.kpi_base || null,
        kpiBaseAt: row.kpi_base_at != null ? Number(row.kpi_base_at) : null,
        kpiBaseBy: row.kpi_base_by || null,
        // Migration 069 — hệ cũ (SaleOnline_Order) mirror fields
        cityCode: row.city_code,
        cityName: row.city_name,
        districtCode: row.district_code,
        districtName: row.district_name,
        wardCode: row.ward_code,
        wardName: row.ward_name,
        partnerId: row.partner_id,
        partnerCode: row.partner_code,
        partnerUniqueId: row.partner_unique_id,
        email: row.email,
        companyId: row.company_id,
        companyName: row.company_name,
        messageCount: Number(row.message_count || 0),
        tposIndex: row.tpos_index,
        // Migration 073 — multi-comment merge
        commentIds: row.comment_ids || [],
        commentCount: Number(row.comment_count || 1),
        // Migration 074 — Customer 360 link (Phase 12)
        customerId: row.customer_id != null ? Number(row.customer_id) : null,
    };
}

function pad(n, width) {
    const s = String(n);
    return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

async function nextDailyCode(pool) {
    // NJ-YYYYMMDD-XXXX (VN timezone)
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `NJ-${datePart}-`;

    const r = await pool.query(
        `SELECT code FROM native_orders
         WHERE code LIKE $1
         ORDER BY code DESC
         LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length > 0) {
        const last = r.rows[0].code;
        const m = last.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

// -----------------------------------------------------
// 2026-06-10: chống RACE sinh trùng mã NJ-YYYYMMDD-XXXX.
// nextDailyCode() đọc MAX rồi +1 ở JS → 2 request đồng thời (poller burst +
// manual) có thể sinh cùng mã → UNIQUE violation (23505) trên cột `code`.
// Bọc INSERT trong retry: nếu 23505 do đụng mã → re-compute nextDailyCode +
// thử lại. An toàn nhất, không cần đổi schema / thêm sequence.
//   doInsert(code) → Promise<result>  (phải dùng `code` được truyền vào)
// Trả về kết quả của doInsert. Ném lỗi nếu không phải đụng mã, hoặc hết retry.
const MAX_CODE_RETRY = 5;
async function insertWithCodeRetry(pool, doInsert) {
    let code = await nextDailyCode(pool);
    for (let attempt = 0; attempt < MAX_CODE_RETRY; attempt++) {
        try {
            return await doInsert(code);
        } catch (e) {
            // 23505 = unique_violation. Chỉ retry khi đụng đúng ràng buộc mã đơn
            // (constraint name chứa 'code' hoặc detail nhắc tới cột code). Các
            // unique khác (vd uq_native_orders_comment) phải ném ra ngay.
            const isCodeCollision =
                e &&
                e.code === '23505' &&
                /code/i.test(String(e.constraint || '') + ' ' + String(e.detail || ''));
            if (!isCodeCollision || attempt === MAX_CODE_RETRY - 1) throw e;
            console.warn(`[NATIVE-ORDERS] mã ${code} bị trùng (race), thử lại (#${attempt + 1})`);
            code = await nextDailyCode(pool);
        }
    }
    // Không reachable (loop luôn return hoặc throw), nhưng để TS/an toàn:
    throw new Error('insertWithCodeRetry: hết số lần thử sinh mã');
}

// -----------------------------------------------------
// 2026-06-11 (C7): biến thể TRONG transaction cho /merge, /split-order,
// /merge-to-pbh.
// - Mã sinh MAX-based (cùng cách nextDailyCode) thay vì COUNT(*)+1: /merge
//   DELETE đơn nguồn → COUNT < MAX → COUNT+1 sinh mã ĐÃ TỒN TẠI → 23505 → 500.
// - Giờ VN = UTC+7 (cùng công thức nextDailyCode), không dùng giờ server UTC.
// - 23505 bên trong transaction Postgres làm abort cả transaction → bọc INSERT
//   bằng SAVEPOINT, ROLLBACK TO SAVEPOINT khi đụng mã rồi recompute + thử lại
//   (pattern fast-sale-orders.js). `table`/`column` là hằng nội bộ do code gọi
//   truyền vào, KHÔNG nhận user input.
function vnDailyPrefix() {
    const vn = new Date(Date.now() + 7 * 3600 * 1000);
    return `NJ-${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}-`;
}

async function nextDailyCodeTx(client, table, column) {
    const prefix = vnDailyPrefix();
    const r = await client.query(
        `SELECT ${column} AS code FROM ${table}
         WHERE ${column} LIKE $1
         ORDER BY ${column} DESC
         LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length > 0) {
        const m = r.rows[0].code.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

async function insertWithCodeRetryTx(
    client,
    doInsert,
    { table = 'native_orders', column = 'code' } = {}
) {
    let code = await nextDailyCodeTx(client, table, column);
    for (let attempt = 0; attempt < MAX_CODE_RETRY; attempt++) {
        await client.query('SAVEPOINT sp_code_retry');
        try {
            const result = await doInsert(code);
            await client.query('RELEASE SAVEPOINT sp_code_retry');
            return result;
        } catch (e) {
            const isCodeCollision =
                e &&
                e.code === '23505' &&
                new RegExp(column, 'i').test(
                    String(e.constraint || '') + ' ' + String(e.detail || '')
                );
            if (!isCodeCollision || attempt === MAX_CODE_RETRY - 1) throw e;
            await client.query('ROLLBACK TO SAVEPOINT sp_code_retry');
            console.warn(
                `[NATIVE-ORDERS] mã ${code} bị trùng (race trong tx), thử lại (#${attempt + 1})`
            );
            code = await nextDailyCodeTx(client, table, column);
        }
    }
    throw new Error('insertWithCodeRetryTx: hết số lần thử sinh mã');
}

// 2026-06-10: advisory lock theo campaign group để cấp campaign_stt tuần tự,
// không trùng dưới tải song song. Dùng trong transaction (pg_advisory_xact_lock
// — tự nhả khi COMMIT/ROLLBACK). Key = hashtext('web2_native_campaign_stt:'||key).
async function lockCampaignSttKey(client, campaignKey) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        'web2_native_campaign_stt:' + String(campaignKey || 'NO_CAMPAIGN'),
    ]);
}

// #2 + H4 (2026-07-01): chiến dịch CHA span 2 page (NhiJudy Store + House).
// 1 bài Facebook (fb_post_id) → 1 chiến dịch cha (web2_live_post_assign.campaign_id).
// Resolve best-effort: bài chưa gán / bảng chưa tồn tại → null (rơi về key cũ).
async function resolveParentCampaignId(db, fbPostId) {
    if (!fbPostId) return null;
    try {
        const r = await db.query(
            'SELECT campaign_id FROM web2_live_post_assign WHERE post_id = $1 LIMIT 1',
            [String(fbPostId)]
        );
        const cid = r.rows[0]?.campaign_id;
        return cid != null ? cid : null;
    } catch (_) {
        return null; // bảng chưa tồn tại (fresh DB) hoặc lỗi → best-effort
    }
}

// KEY NHÓM CHIẾN DỊCH THỐNG NHẤT (1 nguồn) cho campaign_stt + advisory lock.
// Ưu tiên: parent_campaign_id (cha, gộp 2 page) → name-group (strip STORE/HOUSE,
// backward-compat khi bài chưa gán cha) → live_campaign_id (per-post) → 'NO_CAMPAIGN'.
// JS-side này PHẢI khớp precedence của SQL_CAMPAIGN_GROUP_ROW bên dưới.
function campaignGroupKeyJs(parentCampaignId, liveCampaignName, liveCampaignId) {
    if (parentCampaignId != null && String(parentCampaignId) !== '')
        return String(parentCampaignId);
    const ng = String(liveCampaignName || '')
        .replace(/^(STORE|HOUSE)\s+/i, '')
        .trim();
    if (ng) return ng;
    if (liveCampaignId) return String(liveCampaignId);
    return 'NO_CAMPAIGN';
}

// Biểu thức SQL group key cho 1 ROW native_orders (dùng trong subquery MAX+1 của
// campaign_stt). Khớp precedence campaignGroupKeyJs. parent_campaign_id::text ''
// không xảy ra (BIGINT) nhưng giữ NULLIF cho an toàn.
const SQL_CAMPAIGN_GROUP_ROW = `COALESCE(
    NULLIF(parent_campaign_id::text, ''),
    NULLIF(TRIM(REGEXP_REPLACE(COALESCE(live_campaign_name, ''), '^(STORE|HOUSE)\\s+', '', 'i')), ''),
    live_campaign_id,
    'NO_CAMPAIGN')`;

// Biểu thức SQL group key cho ĐƠN MỚI từ params ($parent, $name, $liveId).
function sqlCampaignGroupFromParams(pParent, pName, pLiveId) {
    return `COALESCE(
        NULLIF(${pParent}::text, ''),
        NULLIF(TRIM(REGEXP_REPLACE(COALESCE(${pName}::text, ''), '^(STORE|HOUSE)\\s+', '', 'i')), ''),
        ${pLiveId},
        'NO_CAMPAIGN')`;
}

async function nextSessionIndex(pool, fbUserId) {
    if (!fbUserId) return 1;
    const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM native_orders WHERE fb_user_id = $1`,
        [fbUserId]
    );
    return (r.rows[0]?.n || 0) + 1;
}

// -----------------------------------------------------
// POST /api/native-orders/backfill-customer-links
// One-shot admin endpoint to link existing native_orders → customers
// by normalized phone match. Idempotent: only updates orders where
// customer_id IS NULL.
// -----------------------------------------------------
router.post('/backfill-customer-links', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        // Single-query UPDATE: match by raw phone (already normalized at insert)
        const r = await pool.query(`
            UPDATE native_orders AS o
            SET customer_id = c.id
            FROM web2_customers AS c
            WHERE o.customer_id IS NULL
              AND o.phone IS NOT NULL
              AND o.phone <> ''
              AND c.phone = o.phone
            RETURNING o.code
        `);
        if (r.rows.length) _notify('backfill-customer-links', null);
        res.json({
            success: true,
            linked: r.rows.length,
            codes: r.rows.slice(0, 50).map((x) => x.code),
        });
    } catch (e) {
        console.error('[NATIVE-ORDERS] backfill-customer-links error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/native-orders/health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM native_orders');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/reset-stt
// Reset sequence về 1 — đơn mới tạo sau sẽ có display_stt=1, 2, 3...
// Không ảnh hưởng display_stt của đơn cũ. Optional renumber=true để renumber
// tất cả đơn hiện có theo created_at ASC.
// -----------------------------------------------------
router.post('/reset-stt', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const renumber = req.body?.renumber === true;
        if (renumber) {
            // Renumber tất cả đơn theo created_at ASC, sequence cuối = N+1
            await pool.query('ALTER SEQUENCE native_orders_display_stt_seq RESTART WITH 1');
            await pool.query(`
                DO $$
                DECLARE r RECORD;
                BEGIN
                    FOR r IN SELECT id FROM native_orders ORDER BY created_at ASC LOOP
                        UPDATE native_orders SET display_stt = nextval('native_orders_display_stt_seq') WHERE id = r.id;
                    END LOOP;
                END $$;
            `);
            const c = await pool.query('SELECT COUNT(*)::int AS n FROM native_orders');
            _notify('reset-stt-renumber', null);
            return res.json({ success: true, mode: 'renumber', renumbered: c.rows[0].n });
        }
        // Default: chỉ reset sequence — đơn cũ giữ STT, đơn mới bắt đầu từ 1
        await pool.query('ALTER SEQUENCE native_orders_display_stt_seq RESTART WITH 1');
        res.json({ success: true, mode: 'sequence-only', message: 'Đơn mới sẽ có STT từ 1' });
    } catch (e) {
        console.error('[NATIVE-ORDERS] reset-stt error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/from-comment
// Body:
//  { fbUserId, fbUserName, fbPageId, fbPostId, fbCommentId,
//    message?, phone?, address?, note?,
//    createdBy?, createdByName? }
// -----------------------------------------------------
router.post('/from-comment', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.fbUserId) {
            return res.status(400).json({ error: 'fbUserId required' });
        }

        // Idempotency: if same comment already linked to an order, return it
        if (b.fbCommentId) {
            const existing = await pool.query(
                `SELECT * FROM native_orders
                 WHERE fb_comment_id = $1 OR comment_ids @> $2::jsonb
                 LIMIT 1`,
                [b.fbCommentId, JSON.stringify([b.fbCommentId])]
            );
            if (existing.rows.length > 0) {
                return res.json({
                    success: true,
                    order: mapRowToOrder(existing.rows[0]),
                    idempotent: true,
                    merged: false,
                });
            }
        } else if (b.fbUserId && b.liveCampaignId) {
            // 2026-06-10: thiếu fbCommentId → mất khoá idempotency theo comment.
            // Fallback: nếu đã có đơn cùng (fb_user_id + live_campaign_id) tạo trong
            // 60s gần đây → coi như double-POST, trả đơn cũ thay vì tạo trùng.
            // (Đơn draft cùng campaign sẽ được MERGE bên dưới; fallback này chặn
            //  race tạo 2 đơn mới khi đơn đầu chưa kịp ở trạng thái merge-được.)
            const DUP_WINDOW_MS = 60 * 1000;
            const recent = await pool.query(
                `SELECT * FROM native_orders
                 WHERE fb_user_id = $1 AND live_campaign_id = $2
                   AND created_at >= $3
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [b.fbUserId, b.liveCampaignId, Date.now() - DUP_WINDOW_MS]
            );
            if (recent.rows.length > 0) {
                return res.json({
                    success: true,
                    order: mapRowToOrder(recent.rows[0]),
                    idempotent: true,
                    merged: false,
                });
            }
        }

        // #2 + H4 (2026-07-01): resolve chiến dịch CHA (span 2 page) + KH cross-page
        // TRƯỚC merge → gộp giỏ theo (customer_id | fb_user_id) + parent_campaign_id.
        const parentCampaignId = await resolveParentCampaignId(pool, b.fbPostId);

        // Resolve KH từ kho warehouse Web 2.0 (web2_customers) — ĐỘC LẬP, KHÔNG Web 1.0:
        //   1. Có b.phone → get/create KH theo SĐT (customer_id CROSS-PAGE theo SĐT).
        //   2. Không SĐT nhưng có b.fbUserId → lookup theo fb_id (page-scoped), enrich.
        //   3. Không tìm thấy → để trống, UI hiện "Khách lạ".
        let customerId = null;
        let enrichedPhone = b.phone || null;
        let enrichedName = b.fbUserName || null;
        let enrichedAddress = b.address || null;
        if (b.phone) {
            try {
                const created = await getOrCreateWeb2OrderCustomer(pool, b.phone, {
                    name: b.fbUserName || b.customerName || undefined,
                    address: b.address || undefined,
                    fb_id: b.fbUserId || undefined,
                });
                customerId = created?.customerId || null;
            } catch (custErr) {
                console.warn(
                    '[native-orders] customer upsert failed (continuing):',
                    custErr.message
                );
                customerId = await lookupCustomerIdByPhone(pool, b.phone).catch(() => null);
            }
        } else if (b.fbUserId) {
            try {
                const r = await pool.query(
                    'SELECT id, name, phone, address FROM web2_customers WHERE fb_id = $1 LIMIT 1',
                    [b.fbUserId]
                );
                if (r.rows[0]) {
                    customerId = r.rows[0].id;
                    if (!enrichedPhone) enrichedPhone = r.rows[0].phone || null;
                    if (!enrichedName) enrichedName = r.rows[0].name || null;
                    if (!enrichedAddress) enrichedAddress = r.rows[0].address || null;
                }
            } catch (e) {
                console.warn('[native-orders] fb_id warehouse lookup failed:', e.message);
            }
        }

        // #2 cross-page (2026-07-01): ghi PSID theo page vào web2_customers.fb_psids
        // {page_id: psid}. PSID FB là page-scoped (1 người = PSID khác nhau mỗi page)
        // → nhờ map này cart ops (GET/counts/remove/patch) đến từ page KHÁC resolve
        // được cùng customer_id → thao tác đúng giỏ đã gộp. Fire-and-forget.
        if (customerId && b.fbPageId && b.fbUserId) {
            pool.query(
                `UPDATE web2_customers
                 SET fb_psids = COALESCE(fb_psids, '{}'::jsonb)
                     || jsonb_build_object($2::text, $3::text)
                 WHERE id = $1
                   AND COALESCE(fb_psids->>$2::text, '') <> $3::text`,
                [customerId, b.fbPageId, b.fbUserId]
            ).catch(() => {});
        }

        // ============================================================
        // MERGE LOGIC (Feature 2 + #2 cross-page): nếu khách đã có đơn
        // DRAFT trong CHIẾN DỊCH CHA hiện tại → append comment + message
        // vào đơn cũ, không tạo đơn mới. Identity: customer_id (cross-page
        // theo SĐT) HOẶC fb_user_id (page-scoped fallback). Gate: parent
        // campaign (span 2 page) HOẶC live_campaign_id (per-post fallback).
        // ============================================================
        if (b.fbUserId && (b.liveCampaignId || parentCampaignId != null)) {
            // CHỈ merge vào đơn 'draft' — KHÔNG merge vào 'confirmed' (đã PBH).
            // Lý do: sau khi PBH success, đơn phải bị LOCK. User muốn thêm SP nữa
            // phải tạo đơn mới (drag SP lên panel → cart tạo draft mới) hoặc
            // hủy PBH. Trước đây cho merge 'confirmed' → vô tình unlock đơn đã PBH.
            const draft = await pool.query(
                `SELECT * FROM native_orders
                 WHERE status = 'draft'
                   AND (customer_id = $1 OR fb_user_id = $2)
                   AND (parent_campaign_id = $3 OR live_campaign_id = $4)
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [customerId, b.fbUserId, parentCampaignId, b.liveCampaignId || null]
            );
            if (draft.rows.length > 0) {
                const src = draft.rows[0];
                const newCommentIds = Array.from(
                    new Set([
                        ...(src.comment_ids || []),
                        ...(src.fb_comment_id ? [src.fb_comment_id] : []),
                        ...(b.fbCommentId ? [b.fbCommentId] : []),
                    ])
                );
                // Prefix '[Tên Page]' vào mỗi line note → user phân biệt
                // comment đến từ page nào khi gộp nhiều page về 1 KH.
                const pageTag = b.fbPageName ? `[${String(b.fbPageName).trim()}] ` : '';
                const appendedNote = b.message
                    ? `${src.note || ''}${src.note ? '\n---\n' : ''}[${new Date().toLocaleString('vi-VN')}] ${pageTag}${b.message}`
                    : src.note;
                // #2 (2026-07-01): customer_id đã resolve up-front theo b.phone. Giữ của
                // draft nếu đã có, else điền customerId mới (đơn ẩn danh nay có SĐT).
                const mergedCustomerId = src.customer_id || customerId;
                // Self-heal FB context + parent_campaign_id: draft cũ thiếu → điền từ
                // request mới; KHÔNG override nếu draft đã có giá trị (COALESCE).
                const updated = await pool.query(
                    `UPDATE native_orders
                     SET note = $1,
                         comment_ids = $2::jsonb,
                         comment_count = comment_count + 1,
                         message_count = COALESCE(message_count, 0) + 1,
                         customer_id = COALESCE(customer_id, $5),
                         fb_user_name = COALESCE(fb_user_name, $6),
                         fb_page_id   = COALESCE(fb_page_id,   $7),
                         fb_page_name = COALESCE(fb_page_name, $8),
                         fb_post_id   = COALESCE(fb_post_id,   $9),
                         fb_comment_id= COALESCE(fb_comment_id,$10),
                         live_campaign_name = COALESCE(live_campaign_name, $11),
                         parent_campaign_id = COALESCE(parent_campaign_id, $12),
                         updated_at = $3
                     WHERE id = $4
                     RETURNING *`,
                    [
                        appendedNote,
                        JSON.stringify(newCommentIds),
                        Date.now(),
                        src.id,
                        mergedCustomerId,
                        b.fbUserName || null,
                        b.fbPageId || null,
                        b.fbPageName || null,
                        b.fbPostId || null,
                        b.fbCommentId || null,
                        b.liveCampaignName || null,
                        parentCampaignId,
                    ]
                );
                const order = mapRowToOrder(updated.rows[0]);
                // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
                _notify('comment-merged', order.code);
                return res.json({ success: true, order, merged: true });
            }
        }

        const now = Date.now();
        // Mã đơn sinh trong insertWithCodeRetry (retry nếu đụng mã do race).
        const sessionIndex = await nextSessionIndex(pool, b.fbUserId);

        // Campaign group key (JS-side) cho advisory lock — helper 1 nguồn
        // (parent_campaign_id → name-group STORE/HOUSE → live_campaign_id). PHẢI
        // khớp precedence SQL_CAMPAIGN_GROUP_ROW dùng trong subquery campaign_stt.
        const _campaignGroupKey = campaignGroupKeyJs(
            parentCampaignId,
            b.liveCampaignName,
            b.liveCampaignId
        );

        // Note format: '[timestamp] [Tên Page] message' — page name giúp phân
        // biệt khi sau gộp comment từ nhiều page về 1 KH.
        const pageTag = b.fbPageName ? `[${String(b.fbPageName).trim()}] ` : '';
        const note = b.note
            ? b.note
            : b.message
              ? `[${new Date().toLocaleString('vi-VN')}] ${pageTag}${String(b.message).slice(0, 500)}`
              : null;

        // (customerId + enrichedPhone/Name/Address + parentCampaignId đã resolve
        // up-front, TRƯỚC merge — xem block "#2 + H4" ở trên.)

        // Per-campaign STT: subquery MAX+1 scoped theo "campaign group key" — gộp
        // các campaign cùng tên sau khi bỏ prefix STORE/HOUSE (case-insensitive).
        // Vd "STORE 29/05/2026" + "HOUSE 29/05/2026" → cùng group key "29/05/2026"
        // → STT 1..n chung cho cả 2 page (user spec 2026-06-02).
        // Fallback: nếu live_campaign_name rỗng dùng live_campaign_id; nếu cả 2
        // rỗng dùng 'NO_CAMPAIGN' synthetic group.
        // 2026-06-10: chạy trong transaction + pg_advisory_xact_lock(campaign key)
        // → MAX+1 tuần tự không trùng STT dưới tải song song; bọc insertWithCodeRetry
        // → retry nếu đụng mã NJ (race). Lock tự nhả khi COMMIT/ROLLBACK.
        const insert = await insertWithCodeRetry(pool, async (code) => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await lockCampaignSttKey(client, _campaignGroupKey);
                // MEDIUM-cleanup (2026-06-13): RE-CHECK draft DƯỚI advisory lock.
                // Draft-check ở trên (~831) chạy NGOÀI lock → 2 comment song song
                // cùng fbUser+campaign đều thấy "chưa có draft" → 2 đơn trùng.
                // Giờ request thứ 2 (sau khi chờ lock) thấy draft của request 1
                // đã COMMIT → MERGE vào nó thay vì INSERT (atomic trong cùng lock).
                if (b.fbUserId && (b.liveCampaignId || parentCampaignId != null)) {
                    const lateDraft = await client.query(
                        `SELECT * FROM native_orders
                         WHERE status = 'draft'
                           AND (customer_id = $1 OR fb_user_id = $2)
                           AND (parent_campaign_id = $3 OR live_campaign_id = $4)
                         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
                        [customerId, b.fbUserId, parentCampaignId, b.liveCampaignId || null]
                    );
                    if (lateDraft.rows.length > 0) {
                        const src = lateDraft.rows[0];
                        const mergedCommentIds = Array.from(
                            new Set([
                                ...(src.comment_ids || []),
                                ...(src.fb_comment_id ? [src.fb_comment_id] : []),
                                ...(b.fbCommentId ? [b.fbCommentId] : []),
                            ])
                        );
                        const pageTag = b.fbPageName ? `[${String(b.fbPageName).trim()}] ` : '';
                        const mergedNote = b.message
                            ? `${src.note || ''}${src.note ? '\n---\n' : ''}[${new Date().toLocaleString('vi-VN')}] ${pageTag}${b.message}`
                            : src.note;
                        const upd = await client.query(
                            `UPDATE native_orders
                             SET note = $1, comment_ids = $2::jsonb,
                                 comment_count = comment_count + 1,
                                 message_count = COALESCE(message_count, 0) + 1,
                                 customer_id = COALESCE(customer_id, $5),
                                 fb_user_name = COALESCE(fb_user_name, $6),
                                 fb_page_id = COALESCE(fb_page_id, $7),
                                 fb_page_name = COALESCE(fb_page_name, $8),
                                 fb_post_id = COALESCE(fb_post_id, $9),
                                 fb_comment_id = COALESCE(fb_comment_id, $10),
                                 live_campaign_name = COALESCE(live_campaign_name, $11),
                                 parent_campaign_id = COALESCE(parent_campaign_id, $12),
                                 updated_at = $3
                             WHERE id = $4 RETURNING *`,
                            [
                                mergedNote,
                                JSON.stringify(mergedCommentIds),
                                Date.now(),
                                src.id,
                                customerId,
                                b.fbUserName || enrichedName || null,
                                b.fbPageId || null,
                                b.fbPageName || null,
                                b.fbPostId || null,
                                b.fbCommentId || null,
                                b.liveCampaignName || null,
                                parentCampaignId,
                            ]
                        );
                        await client.query('COMMIT');
                        return upd; // shape {rows:[row]} như INSERT — code sinh dư bỏ qua
                    }
                }
                const r = await client.query(
                    `INSERT INTO native_orders (
                        code, session_index, display_stt, campaign_stt, source,
                        customer_name, phone, address, note,
                        fb_user_id, fb_user_name, fb_page_id, fb_post_id, fb_comment_id,
                        products, total_quantity, total_amount,
                        status, tags,
                        live_campaign_id, live_campaign_name,
                        customer_id, parent_campaign_id,
                        created_by, created_by_name, created_at, updated_at
                    ) VALUES (
                        $1, $2, nextval('native_orders_display_stt_seq'),
                        (SELECT COALESCE(MAX(campaign_stt), 0) + 1
                         FROM native_orders
                         WHERE ${SQL_CAMPAIGN_GROUP_ROW}
                             = ${sqlCampaignGroupFromParams('$18', '$13', '$12')}),
                        'NATIVE_WEB',
                        $3, $4, $5, $6,
                        $7, $8, $9, $10, $11,
                        '[]'::jsonb, 0, 0,
                        'draft', '[]'::jsonb,
                        $12, $13,
                        $14, $18::bigint,
                        $15, $16, $17, $17
                    ) RETURNING *`,
                    [
                        code,
                        sessionIndex,
                        // Use enriched values (from fb_id lookup) nếu body không có
                        b.customerName || enrichedName || null,
                        // #6: chuẩn hoá SĐT trước khi lưu cột (RAW → ^0\d{9}$ hoặc '').
                        // DB-sourced enrichedPhone đã normalized → idempotent.
                        _normVnPhone(enrichedPhone) || null,
                        enrichedAddress,
                        note,
                        b.fbUserId,
                        b.fbUserName || enrichedName || null,
                        b.fbPageId || null,
                        b.fbPostId || null,
                        b.fbCommentId || null,
                        b.liveCampaignId || null,
                        b.liveCampaignName || null,
                        customerId,
                        b.createdBy || null,
                        b.createdByName || null,
                        now,
                        parentCampaignId,
                    ]
                );
                await client.query('COMMIT');
                return r;
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                throw e;
            } finally {
                client.release();
            }
        });

        const order = mapRowToOrder(insert.rows[0]);

        // Phase 17: Auto-upsert Customer 360 record with all available Facebook
        // data so future orders/customer queries can find them. Non-blocking —
        // wrap in IIFE so any error doesn't kill the create-order response.
        upsertCustomerFromOrder(pool, {
            // #5: cùng phone đã normalize với getOrCreateWeb2OrderCustomer ở trên
            // (primary link). Trước đây path này dùng b.phone RAW (replace \s) →
            // query/insert web2_customers bằng phone khác chuẩn → miss match hoặc
            // tạo bản ghi rác. '' cho phone không hợp lệ → upsert rơi sang fb_id.
            phone: _normVnPhone(b.phone) || null,
            customerName: b.customerName || b.fbUserName,
            fbUserId: b.fbUserId,
            fbPageId: b.fbPageId,
            address: b.address,
            email: b.email,
        })
            .then((cid) => {
                // If we now have a linked customer_id but the just-inserted row
                // doesn't yet, backfill it asynchronously so the link is in DB
                // for the next /load.
                if (cid && !order.customerId) {
                    pool.query(
                        `UPDATE native_orders SET customer_id = $1 WHERE id = $2 AND customer_id IS NULL`,
                        [cid, order.id]
                    ).catch(() => {});
                }
            })
            .catch((e) => {
                console.warn('[NATIVE-ORDERS] customer upsert failed (non-fatal):', e.message);
            });

        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        _notify('create', order.code);
        _auditOrder(req, 'create', order.code, 'Tạo đơn (live)');
        res.json({ success: true, order, merged: false });
    } catch (error) {
        console.error('[NATIVE-ORDERS] POST /from-comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// POST /create-manual — tạo đơn TAY từ tab Đơn Inbox (2026-06-04).
// channel='web2_inbox'. Body:
//   { customerName, phone, address, products?, note?, createdBy?, createdByName?,
//     fbUserId?, fbPageId?, fbUserName?, conversationId? }
// fbUserId + fbPageId từ modal tìm hội thoại Pancake → đơn nhắn tin được như đơn
// live-chat (2026-06-09). SĐT/địa chỉ có thể bỏ trống điền sau.
// Gen code NJ-... như đơn livestream. status='draft' → user thêm SP qua modal sửa.
// -----------------------------------------------------
router.post('/create-manual', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const customerName = (b.customerName || '').trim();
        const phone = (b.phone || '').trim();
        if (!customerName && !phone) {
            return res.status(400).json({ error: 'Cần tên hoặc SĐT khách hàng' });
        }
        // #6: cột phone lưu canonical ^0\d{9}$ (RAW → '' nếu không hợp lệ). Giữ
        // `phone` raw cho guard "có tên hoặc SĐT" ở trên (đơn tay được điền SĐT sau).
        const normPhone = _normVnPhone(phone);
        // Mã đơn sinh trong insertWithCodeRetry (retry nếu đụng mã do race).
        const now = Date.now();
        // LOW-validate (2026-06-29): clamp qty/price âm về 0 — input từ modal có thể
        // gửi số âm (paste/typo) → tổng tiền/SL âm làm hỏng KPI + PBH. Chuẩn hoá line
        // luôn (rẻ) để cột products lưu giá trị đã clamp, nhất quán với total.
        const _qty = (p) => Math.max(0, Number(p.quantity ?? p.qty) || 0);
        const _price = (p) => Math.max(0, Number(p.price ?? p.priceUnit) || 0);
        const rawProducts = Array.isArray(b.products) ? b.products : [];
        const products = rawProducts.map((p) => ({
            ...p,
            quantity: _qty(p),
            price: _price(p),
        }));
        const totalQty = products.reduce((s, p) => s + p.quantity, 0);
        const totalAmt = products.reduce((s, p) => s + p.quantity * p.price, 0);
        // customer_id do frontend truyền (từ /api/web2/customers/search — Web 2.0,
        // KHÔNG đụng customers Web 1.0). Không có → null.
        const customerId = b.customerId ? parseInt(b.customerId, 10) || null : null;
        // fb context: đơn inbox tay vẫn cần ĐỦ fb_id + fb_page_id để nhắn tin được
        // như đơn live-chat. Frontend tìm hội thoại Pancake (modal Thêm đơn) rồi
        // truyền b.fbUserId (psid) + b.fbPageId + b.fbUserName. Fallback lookup
        // fb_id từ web2_customers nếu chỉ có customerId. Thiếu fb_page_id → UI tự
        // dò hội thoại theo SĐT khi mở chat (_resolveInboxConvByPhone).
        let fbUserId = (b.fbUserId || '').trim() || null;
        const fbPageId = (b.fbPageId || '').trim() || null;
        const fbUserName = (b.fbUserName || '').trim() || null;
        if (!fbUserId && customerId) {
            try {
                const r = await pool.query(
                    'SELECT fb_id FROM web2_customers WHERE id = $1 LIMIT 1',
                    [customerId]
                );
                fbUserId = r.rows[0]?.fb_id || null;
            } catch {
                /* lookup best-effort — không chặn tạo đơn */
            }
        }
        // 2026-06-10: transaction + advisory lock (key = channel web2_inbox) cho
        // campaign_stt tuần tự không trùng; bọc insertWithCodeRetry chống đụng mã NJ.
        const insert = await insertWithCodeRetry(pool, async (code) => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await lockCampaignSttKey(client, 'channel:web2_inbox');
                const r = await client.query(
                    `INSERT INTO native_orders (
                        code, session_index, display_stt, campaign_stt, source, channel,
                        customer_name, phone, address, note,
                        products, total_quantity, total_amount,
                        status, tags, customer_id, fb_user_id, fb_page_id, fb_user_name,
                        created_by, created_by_name, created_at, updated_at
                    ) VALUES (
                        $1, 0, nextval('native_orders_display_stt_seq'),
                        (SELECT COALESCE(MAX(campaign_stt), 0) + 1 FROM native_orders WHERE channel = 'web2_inbox'),
                        'NATIVE_WEB', 'web2_inbox',
                        $2, $3, $4, $5,
                        $6::jsonb, $7, $8,
                        'draft', '[]'::jsonb, $9, $10, $11, $12,
                        $13, $14, $15, $15
                    ) RETURNING *`,
                    [
                        code,
                        customerName || null,
                        normPhone || null,
                        (b.address || '').trim() || null,
                        (b.note || '').trim() || null,
                        JSON.stringify(products),
                        totalQty,
                        totalAmt,
                        customerId,
                        fbUserId,
                        fbPageId,
                        fbUserName,
                        b.createdBy || null,
                        b.createdByName || null,
                        now,
                    ]
                );
                await client.query('COMMIT');
                return r;
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                throw e;
            } finally {
                client.release();
            }
        });
        const order = mapRowToOrder(insert.rows[0]);
        _notify('create-manual', order.code);
        _auditOrder(req, 'create', order.code, 'Tạo đơn (thủ công)');
        // Auto-gán đơn vị (per-unit QR) theo giỏ — unit nhận STT đơn (ưu tiên ít lịch
        // sử → seq nhỏ). Best-effort fire-and-forget; SSE web2:product-units cập nhật
        // trang quét. Thay nút "Gán" thủ công.
        try {
            require('./web2-product-units')
                .reconcileOrderUnits(pool, order.id)
                .catch(() => {});
        } catch (_) {}
        res.json({ success: true, order });
    } catch (error) {
        console.error('[NATIVE-ORDERS] POST /create-manual error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Phase 17: upsert a customer record with Facebook data.
 * - If phone matches an existing customer: fill in missing fb_id / name / address
 * - If no customer with this phone: create a new one with all known fields
 * - If no phone: try fb_id match; if no fb_id match either, create minimal record
 *   only when fb_id is present (don't pollute customers table with anonymous orders)
 *
 * Returns the customer.id (existing or new), or null if nothing was upserted.
 */
async function upsertCustomerFromOrder(
    pool,
    { phone, customerName, fbUserId, fbPageId, address, email }
) {
    if (!pool) return null;
    const name = (customerName || '').trim();
    const trimmedPhone = phone ? String(phone).replace(/\s/g, '') : null;
    try {
        // 1. Try to find existing customer by phone first
        if (trimmedPhone) {
            const r = await pool.query(
                `SELECT id, fb_id, name, address FROM web2_customers WHERE phone = $1 LIMIT 1`,
                [trimmedPhone]
            );
            if (r.rows.length > 0) {
                const existing = r.rows[0];
                // Fill in missing fields without overwriting non-null values
                const updates = [];
                const params = [];
                if (!existing.fb_id && fbUserId) {
                    params.push(fbUserId);
                    updates.push(`fb_id = $${params.length}`);
                }
                if ((!existing.name || existing.name === 'Khách hàng mới') && name) {
                    params.push(name);
                    updates.push(`name = $${params.length}`);
                }
                if (!existing.address && address) {
                    params.push(address);
                    updates.push(`address = $${params.length}`);
                }
                if (updates.length > 0) {
                    params.push(existing.id);
                    await pool.query(
                        `UPDATE web2_customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
                        params
                    );
                }
                return existing.id;
            }
        }

        // 2. If no phone-match, try fb_id match
        if (fbUserId) {
            const r = await pool.query(`SELECT id FROM web2_customers WHERE fb_id = $1 LIMIT 1`, [
                fbUserId,
            ]);
            if (r.rows.length > 0) {
                // Fill in phone if we have one and customer doesn't
                if (trimmedPhone) {
                    await pool
                        .query(
                            `UPDATE web2_customers SET phone = COALESCE(NULLIF(phone, ''), $1), updated_at = NOW() WHERE id = $2`,
                            [trimmedPhone, r.rows[0].id]
                        )
                        .catch(() => {});
                }
                return r.rows[0].id;
            }
        }

        // 3. Create new customer if we have at least phone+name OR fb_id+name
        if ((trimmedPhone && name) || (fbUserId && name)) {
            const nowTs = Date.now();
            const ins = await pool.query(
                `INSERT INTO web2_customers (phone, name, address, email, fb_id, fb_page_id, status, source, history, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Normal', 'pancake', $7::jsonb, $8, $8)
                 ON CONFLICT (phone) DO UPDATE SET
                    fb_id = COALESCE(NULLIF(web2_customers.fb_id, ''), EXCLUDED.fb_id),
                    name = CASE WHEN web2_customers.name IN ('', 'Khách hàng mới') THEN EXCLUDED.name ELSE web2_customers.name END,
                    address = COALESCE(NULLIF(web2_customers.address, ''), EXCLUDED.address),
                    fb_page_id = COALESCE(NULLIF(web2_customers.fb_page_id, ''), EXCLUDED.fb_page_id),
                    updated_at = EXCLUDED.updated_at
                 RETURNING id`,
                [
                    trimmedPhone || `fb_${fbUserId}`, // phone NOT NULL? warehouse cho phép — fb_ pseudo-phone giữ uniqueness
                    name,
                    address || null,
                    email || null,
                    fbUserId || null,
                    fbPageId || null,
                    JSON.stringify([
                        {
                            ts: nowTs,
                            action: 'create',
                            userName: '(hệ thống)',
                            note: 'auto từ đơn web',
                        },
                    ]),
                    nowTs,
                ]
            );
            return ins.rows[0]?.id || null;
        }

        return null;
    } catch (e) {
        // Silent fail — caller logs the warning
        throw e;
    }
}

// -----------------------------------------------------
// GET /api/native-orders/by-user/:fbUserId — latest order
// -----------------------------------------------------
router.get('/by-user/:fbUserId', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM native_orders
             WHERE fb_user_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [req.params.fbUserId]
        );
        if (r.rows.length === 0) return res.json({ success: true, order: null });
        res.json({ success: true, order: mapRowToOrder(r.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// GET /api/native-orders/load — list with filters
// -----------------------------------------------------
// -----------------------------------------------------
// GET /api/native-orders/campaigns
// Distinct list of campaigns currently used by native orders, with row count.
// Frontend dùng để render chip filter "Chiến Dịch".
// -----------------------------------------------------
router.get('/campaigns', async (req, res, next) => {
    // Lazy apply scope — call middleware as fn
    return require('./v2/kpi').applyKpiScope(req, res, () => _campaignsHandler(req, res));
});

async function _campaignsHandler(req, res) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        // Sprint 3: nếu user có scope → chỉ trả campaigns mà user được assigned.
        // kpiScope === '__deny_all__' (string sentinel khi enforce + thiếu/sai token)
        // → 0 campaign. Mảng scope → lọc theo tên. null → thấy hết (admin/no-scope).
        let scopeFilter = '';
        const params = [];
        if (req.kpiScope === '__deny_all__') {
            scopeFilter = `WHERE FALSE`;
        } else if (Array.isArray(req.kpiScope) && req.kpiScope.length) {
            // KPI-2PAGE-1: scope entry ưu tiên parent_campaign_id (chiến dịch CHA span
            // 2 page); legacy entry chỉ có campaign_name. Lọc theo CẢ 2 (OR). Row mới có
            // parent_campaign_id=set + campaign_name=null → KHÔNG được để null lọt vào
            // ANY(...::text[]) (match sai). Khớp _buildScope trong kpi.js.
            const parentIds = [
                ...new Set(
                    req.kpiScope
                        .filter((s) => s.parent_campaign_id != null)
                        .map((s) => s.parent_campaign_id)
                ),
            ];
            const names = [
                ...new Set(
                    req.kpiScope
                        .filter((s) => s.parent_campaign_id == null && s.campaign_name)
                        .map((s) => s.campaign_name)
                ),
            ];
            const conds = [];
            if (parentIds.length) {
                params.push(parentIds);
                conds.push(`parent_campaign_id = ANY($${params.length}::bigint[])`);
            }
            if (names.length) {
                params.push(names);
                conds.push(`live_campaign_name = ANY($${params.length}::text[])`);
            }
            scopeFilter = conds.length ? `WHERE (${conds.join(' OR ')})` : `WHERE FALSE`;
        }
        const r = await pool.query(
            `
            SELECT
                COALESCE(NULLIF(live_campaign_id, ''), '__no_campaign__') AS id,
                MAX(NULLIF(live_campaign_name, '')) AS name,
                MAX(NULLIF(fb_page_name, '')) AS page_name,
                MAX(NULLIF(fb_page_id, '')) AS page_id,
                COUNT(*)::int AS count,
                MAX(created_at)::text AS last_order_at
            FROM native_orders
            ${scopeFilter}
            GROUP BY COALESCE(NULLIF(live_campaign_id, ''), '__no_campaign__')
            ORDER BY MAX(created_at) DESC NULLS LAST
        `,
            params
        );
        res.json({
            success: true,
            campaigns: r.rows.map((row) => ({
                id: row.id,
                name: row.id === '__no_campaign__' ? '(Không chiến dịch)' : row.name || row.id,
                pageName: row.page_name || '',
                pageId: row.page_id || '',
                count: row.count,
                lastOrderAt: row.last_order_at,
            })),
            scoped: !!(req.kpiScope && req.kpiScope.length),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// -----------------------------------------------------
// GET /export — CSV download cho Đơn Web
// -----------------------------------------------------
router.get('/export', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).send('DB unavailable');
    try {
        await ensureTables(pool);
        const { status, search, campaignIds, customerId } = req.query;
        const conds = [];
        const params = [];
        if (status && status !== 'all') {
            const arr = String(status).split(',').filter(Boolean);
            params.push(arr.length === 1 ? arr[0] : arr);
            conds.push(
                arr.length === 1
                    ? `status = $${params.length}`
                    : `status = ANY($${params.length}::text[])`
            );
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(customer_name ILIKE $${i} OR phone ILIKE $${i} OR code ILIKE $${i} OR note ILIKE $${i} OR user_note ILIKE $${i})`
            );
        }
        if (campaignIds) {
            const ids = String(campaignIds)
                .split(',')
                .filter((s) => s && s !== '__no_campaign__');
            if (ids.length) {
                params.push(ids);
                conds.push(`live_campaign_id = ANY($${params.length}::text[])`);
            }
        }
        if (customerId) {
            const cid = parseInt(customerId, 10);
            if (Number.isFinite(cid)) {
                params.push(cid);
                conds.push(`customer_id = $${params.length}`);
            }
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const r = await pool.query(
            `SELECT * FROM native_orders ${where} ORDER BY created_at DESC LIMIT 10000`,
            params
        );

        const STATUS_LABEL = {
            draft: 'Giỏ hàng',
            confirmed: 'Đơn hàng',
            cancelled: 'Đã hủy',
            delivered: 'Đã giao',
        };
        const headers = [
            'STT',
            'Mã đơn',
            'Ngày tạo',
            'Khách hàng',
            'SĐT',
            'Địa chỉ',
            'Tỉnh/TP',
            'Quận/Huyện',
            'Phường/Xã',
            'Tổng SL',
            'Tổng tiền',
            'Đặt cọc',
            'Trạng thái',
            'Comment count',
            'Chiến dịch',
            'FB Page',
            'FB User',
            'Nhân viên',
        ];
        function esc(v) {
            if (v == null) return '';
            const s = String(v);
            if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        }
        function fmtMs(ms) {
            if (!ms) return '';
            const d = new Date(Number(ms));
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        const rows = r.rows.map((row) =>
            [
                row.display_stt || '',
                row.code,
                fmtMs(row.created_at),
                row.customer_name || '',
                row.phone || '',
                row.address || '',
                row.city_name || '',
                row.district_name || '',
                row.ward_name || '',
                row.total_quantity || 0,
                Number(row.total_amount || 0),
                Number(row.deposit || 0),
                STATUS_LABEL[row.status] || row.status,
                row.comment_count || 1,
                row.live_campaign_name || '',
                row.fb_page_id || '',
                row.fb_user_name || '',
                row.assigned_employee_name || row.created_by_name || '',
            ]
                .map(esc)
                .join(',')
        );

        const csv = '﻿' + headers.join(',') + '\n' + rows.join('\n');
        const filename = `donweb-export-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (e) {
        console.error('[NATIVE-ORDERS] export error:', e.message);
        res.status(500).send('Export failed: ' + e.message);
    }
});

const _kpiModule = require('./v2/kpi');
// 2026-06-30: enrich PBH/CK/ví + TAG đơn auto cho mảng orders (đã mapRowToOrder).
// Tách từ /load → unit-scan /sort-manifest tái dùng CÙNG nguồn (tag kệ KHỚP tag Đơn Web,
// KHÔNG drift). Mutate orders tại chỗ (o.pbh*/ckSignal/walletBalance/autoTags/hasChoHang).
async function enrichOrdersTags(pool, orders, opts = {}) {
    const viewerUser = (opts && opts.viewerUser) || null;
    // 2026-06-04: enrich badge "Đã thanh toán" (PBH residual=0) + "Đã đối soát"
    // (fulfillment packed+). Lấy PBH ĐẦU (split_index 1) per source_code, bỏ PBH huỷ.
    const codes = orders.map((o) => o.code).filter(Boolean);
    if (codes.length) {
        try {
            // FIX audit R3 (#1 HIGH): PBH GỘP/TÁCH cùng source_code có N bill active.
            // Trước dùng DISTINCT ON → chỉ đọc bill #1 → đơn tách (bill#1 trả đủ, bill#2
            // còn nợ) bị ẩn nợ (pbh_chua_tt=false) + tag nhầm 'Đã đối soát' (chỉ xét bill#1
            // delivered). Giờ AGGREGATE: SUM tiền (residual>0 nếu BẤT KỲ bill nào còn nợ) +
            // all_reconciled = BOOL_AND mọi bill đã packed+ (NULL coi như chưa).
            const pbhQ = await pool.query(
                `SELECT source_code,
                            SUM(amount_total)    AS amount_total,
                            SUM(residual)        AS residual,
                            SUM(payment_amount)  AS payment_amount,
                            SUM(deposit)         AS deposit_total,
                            SUM(wallet_deducted) AS wallet_deducted,
                            BOOL_AND(COALESCE(fulfillment_state IN ('packed','shipped','delivered'), false)) AS all_reconciled,
                            (array_agg(fulfillment_state ORDER BY split_index ASC, date_created ASC))[1] AS fulfillment_state,
                            (array_agg(carrier_name ORDER BY split_index ASC, date_created ASC))[1] AS carrier_name
                     FROM fast_sale_orders
                     WHERE source_type='native_order' AND source_code = ANY($1) AND state <> 'cancel'
                     GROUP BY source_code`,
                [codes]
            );
            const byCode = new Map(pbhQ.rows.map((p) => [p.source_code, p]));
            for (const o of orders) {
                const p = byCode.get(o.code);
                if (!p) continue;
                o.pbhTotal = Number(p.amount_total || 0);
                o.pbhResidual = Number(p.residual || 0); // SUM mọi bill → còn nợ nếu bất kỳ bill nợ
                o.pbhPaymentAmount = Number(p.payment_amount || 0);
                // 2026-06-29: cọc CẤP ĐƠN. o.deposit mặc định = native_orders.deposit
                // (mapRow:547 — GIỎ nhập cọc TRƯỚC khi chốt VẪN tính co_coc). Khi có
                // PBH thì lấy MAX với cọc PBH (SUM) — KHÔNG đè mất cọc GIỎ nếu PBH
                // deposit=0. Tag 'co_coc' fire khi cọc > 0 ở GIỎ HOẶC ĐƠN.
                o.deposit = Math.max(Number(o.deposit || 0), Number(p.deposit_total || 0));
                o.pbhWalletDeducted = Number(p.wallet_deducted || 0);
                o.pbhFulfillmentState = p.fulfillment_state || null; // representative (display/legacy)
                o.pbhAllReconciled = p.all_reconciled === true; // mọi bill đã đóng gói+
                o.pbhCarrierName = p.carrier_name || null;
            }
        } catch (e) {
            console.warn('[native-orders] enrich PBH badge failed:', e.message);
        }

        // 2026-06-05: enrich cờ "KH báo đã CK" (web2_payment_signals, web2Db).
        // Khách nhắn "CK XONG"/"ĐÃ CK" → detector khớp đơn theo phone → signal.
        // Hiển thị badge soft (chưa phải xác nhận tiền). Defensive: bảng có thể
        // chưa tồn tại ở môi trường cũ → warn, không vỡ list.
        try {
            const sigQ = await pool.query(
                `SELECT DISTINCT ON (matched_order_code)
                            id, matched_order_code, status, matched_keyword, phone, created_at
                     FROM web2_payment_signals
                     WHERE matched_order_type = 'native'
                       AND matched_order_code = ANY($1)
                       AND status IN ('pending','confirmed')
                     ORDER BY matched_order_code, created_at DESC`,
                [codes]
            );
            const sigByCode = new Map(sigQ.rows.map((s) => [s.matched_order_code, s]));
            for (const o of orders) {
                const s = sigByCode.get(o.code);
                if (!s) continue;
                o.ckSignal = {
                    id: Number(s.id), // cho web2-ck-review mở đúng signal
                    status: s.status,
                    keyword: s.matched_keyword,
                    phone: s.phone || null,
                    at: s.created_at ? Number(s.created_at) : null,
                };
            }
        } catch (e) {
            console.warn('[native-orders] enrich ckSignal failed:', e.message);
        }

        // 2026-06-07: enrich số dư ví KH (web2_customer_wallets) → badge cảnh
        // báo "Chưa nhận CK". Đơn chưa nhận tiền CK (ví < tổng đơn + chưa có
        // CK confirmed + PBH chưa trả) → frontend hiện cảnh báo. Ngoại lệ:
        // ví ≥ tổng đơn (đã đủ tiền) → không cảnh báo.
        try {
            const norm = (p) =>
                String(p || '')
                    .replace(/\D/g, '')
                    .slice(-10);
            // 2026-06-10: web2_customer_wallets.phone lưu dạng đã normalize.
            // Phải normalize array trước khi query (raw '84...'/có khoảng trắng
            // sẽ miss). Map order.phone → norm, query bằng key đã chuẩn hoá.
            const normPhones = Array.from(
                new Set(orders.map((o) => norm(o.phone)).filter(Boolean))
            );
            if (normPhones.length) {
                const wq = await pool.query(
                    `SELECT phone, balance FROM web2_customer_wallets WHERE phone = ANY($1)`,
                    [normPhones]
                );
                const balByPhone = new Map(
                    wq.rows.map((r) => [norm(r.phone), Number(r.balance) || 0])
                );
                for (const o of orders) {
                    o.walletBalance = o.phone ? balByPhone.get(norm(o.phone)) || 0 : 0;
                }
            }
        } catch (e) {
            console.warn('[native-orders] enrich wallet balance failed:', e.message);
        }
    }

    // 2026-06-21: TAG đơn hàng auto (cột "Thẻ" + hasChoHang chặn PBH). Chạy SAU
    // mọi enrich (cần pbh*/ckSignal/walletBalance đã set). Defensive: lỗi → autoTags=[].
    // viewerUser (req.kpiUser từ applyKpiScope) → CHE pill KPI của NV khác cho staff.
    await orderTagsSvc.enrichOrdersWithTags(pool, orders, { viewerUser });
}

router.get('/load', requireWeb2AuthSoft, _kpiModule.applyKpiScope, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const {
            status,
            page = 1,
            limit = 200,
            search,
            fbPostId,
            fbPostIds,
            campaignIds,
            customerId,
            channel,
        } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (status && status !== 'all') {
            params.push(status);
            conds.push(`status = $${params.length}`);
        }
        // 2026-06-04: filter kênh đơn (tab Đơn Livestream vs Đơn Inbox).
        // 2026-06-05: prefix web2_. Backward-compat — chấp nhận cả giá trị legacy
        // ('livestream'/'inbox') để deploy frontend↔backend KHÔNG cần đúng thứ tự
        // (frontend gửi web2_* vẫn khớp row cũ chưa migrate). web2_livestream còn
        // ôm cả channel NULL (đơn rất cũ chưa set kênh).
        if (channel && channel !== 'all') {
            if (channel === 'web2_inbox' || channel === 'inbox') {
                params.push('web2_inbox', 'inbox');
                conds.push(`channel IN ($${params.length - 1}, $${params.length})`);
            } else if (channel === 'web2_livestream' || channel === 'livestream') {
                params.push('web2_livestream', 'livestream');
                conds.push(
                    `(channel IN ($${params.length - 1}, $${params.length}) OR channel IS NULL)`
                );
            } else {
                params.push(channel);
                conds.push(`channel = $${params.length}`);
            }
        }
        if (fbPostId) {
            params.push(fbPostId);
            conds.push(`fb_post_id = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(customer_name ILIKE $${i} OR phone ILIKE $${i} OR code ILIKE $${i} OR note ILIKE $${i} OR user_note ILIKE $${i})`
            );
        }
        // Phase 14: filter by customer_id (link to Customer 360)
        if (customerId) {
            const cid = parseInt(customerId, 10);
            if (Number.isFinite(cid)) {
                params.push(cid);
                conds.push(`customer_id = $${params.length}`);
            }
        }
        // campaignIds=id1,id2,...  → match orders that belong to ANY of the chosen campaigns.
        // Special token __no_campaign__ matches orders WITHOUT a campaign (NULL/empty).
        if (campaignIds) {
            const ids = String(campaignIds)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (ids.length) {
                const realIds = ids.filter((s) => s !== '__no_campaign__');
                const wantsNoCampaign = ids.includes('__no_campaign__');
                const orParts = [];
                if (realIds.length) {
                    params.push(realIds);
                    orParts.push(`live_campaign_id = ANY($${params.length}::text[])`);
                }
                if (wantsNoCampaign) {
                    orParts.push(`(live_campaign_id IS NULL OR live_campaign_id = '')`);
                }
                if (orParts.length) conds.push(`(${orParts.join(' OR ')})`);
            }
        }
        // fbPostIds=post1,post2,... → lọc đơn theo bài livestream (Facebook_LiveId).
        // Dùng cho "Chiến dịch cha" (parent campaign) chung với live-chat: parent
        // gom nhiều post → orders có fb_post_id thuộc tập post đó.
        if (fbPostIds) {
            const posts = String(fbPostIds)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (posts.length) {
                params.push(posts);
                conds.push(`fb_post_id = ANY($${params.length}::text[])`);
            }
        }
        // Sprint 3 KPI: apply visibility scope. NV được assigned khoảng → chỉ thấy
        // đơn (live_campaign_name + campaign_stt) trong khoảng đó. Admin/no-scope → all.
        if (req.kpiScope && req.kpiScope.length) {
            const scopeFrag = _kpiModule.buildScopeWhere(req.kpiScope, params.length + 1);
            conds.push(scopeFrag.clause);
            params.push(...scopeFrag.params);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM native_orders ${where}`,
            params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        // Sort: ưu tiên các đơn có STT lớn (mới) ở trên (display_stt DESC).
        // Cùng display_stt thì split_index ASC (33-1 trước 33-2). Cuối cùng
        // created_at DESC để đơn mới (nếu trùng) vẫn hiển thị trước.
        const listR = await pool.query(
            `SELECT * FROM native_orders ${where}
             ORDER BY display_stt DESC NULLS LAST, split_index ASC, created_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );

        const orders = listR.rows.map(mapRowToOrder);
        await enrichOrdersTags(pool, orders, { viewerUser: req.kpiUser });

        res.json({
            success: true,
            orders,
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// PATCH /api/native-orders/:code — update mutable fields
// -----------------------------------------------------
router.patch('/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const body = { ...req.body };

        // SECURITY (2026-06-30): strip field server-managed khỏi payload client. Các
        // field này CHỈ được set bởi luồng server (mark-printed bump print_count,
        // reverse/cancel set reversed_code, sync TPOS set partner_*/tpos_index, message
        // events bump message_count). Cho client PATCH = giả mạo count in / spoof
        // partner ID / lệch mirror tiền. Frontend hợp lệ KHÔNG gửi các field này.
        for (const k of [
            'reversedCode',
            'printCount',
            'partnerStatus',
            'partnerId',
            'partnerCode',
            'partnerUniqueId',
            'messageCount',
            'tposIndex',
        ]) {
            delete body[k];
        }

        // 3H4 FIX (2026-06-12): guard state transition cho PATCH. Trước đây PATCH
        // set status bất kỳ không validate: (a) {status:'cancelled'} bypass hoàn
        // ví + restock PBH (chỉ POST /:code/cancel làm đủ); (b) cancelled→draft
        // hồi sinh PBH cancel→'done' không trừ lại kho/ví; (c) sửa products đơn
        // confirmed làm lệch order_lines PBH (UI khoá modal nhưng API mở).
        if (body.status !== undefined || Array.isArray(body.products)) {
            const curQ = await pool.query(`SELECT status FROM native_orders WHERE code = $1`, [
                req.params.code,
            ]);
            if (curQ.rows.length === 0) return res.status(404).json({ error: 'Not found' });
            const curStatus = curQ.rows[0].status;
            if (body.status !== undefined && body.status !== curStatus) {
                const target = String(body.status);
                if (target === 'cancelled' || target === 'cancel') {
                    return res.status(400).json({
                        error: 'Không huỷ đơn qua PATCH — dùng POST /api/native-orders/:code/cancel (có hoàn ví + trả tồn kho PBH)',
                        useEndpoint: `/api/native-orders/${req.params.code}/cancel`,
                    });
                }
                if (!['draft', 'confirmed'].includes(target)) {
                    return res.status(400).json({ error: `status không hợp lệ: ${target}` });
                }
                if (curStatus === 'cancelled') {
                    return res.status(409).json({
                        error: 'Đơn đã huỷ — không hồi sinh qua PATCH (PBH/kho/ví đã quyết toán khi huỷ). Tạo đơn mới thay thế.',
                    });
                }
            }
            if (Array.isArray(body.products) && curStatus === 'confirmed' && body.force !== true) {
                return res.status(409).json({
                    error: 'Đơn đã confirmed (đã có PBH) — sửa products sẽ lệch order_lines của PBH. Gửi force:true nếu chắc chắn.',
                    needForce: true,
                });
            }
        }

        // Sprint 1 KPI: snapshot products HIỆN TẠI để diff với products MỚI sau update.
        // Cần làm TRƯỚC khi UPDATE để có baseline.
        let productsBefore = null;
        let orderBefore = null;
        if (Array.isArray(body.products)) {
            const beforeQ = await pool.query(
                `SELECT products, live_campaign_id, live_campaign_name, campaign_stt, fb_user_id
                 FROM native_orders WHERE code = $1`,
                [req.params.code]
            );
            if (beforeQ.rows.length) {
                orderBefore = beforeQ.rows[0];
                productsBefore = Array.isArray(orderBefore.products) ? orderBefore.products : [];
            }
        }

        // If client sends `products`, auto-recompute total_quantity + total_amount
        // (prevents mismatch between list + totals). Client MAY still override by
        // sending totalQuantity/totalAmount explicitly — respected below.
        if (Array.isArray(body.products)) {
            if (body.totalQuantity === undefined) {
                body.totalQuantity = body.products.reduce(
                    (s, p) => s + (Number(p.quantity) || 0),
                    0
                );
            }
            if (body.totalAmount === undefined) {
                body.totalAmount = body.products.reduce(
                    (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                    0
                );
            }
        }

        const allowed = {
            customerName: 'customer_name',
            phone: 'phone',
            address: 'address',
            note: 'note',
            userNote: 'user_note',
            products: 'products',
            totalQuantity: 'total_quantity',
            totalAmount: 'total_amount',
            status: 'status',
            tags: 'tags',
            // Migration 067 — order fields editable via PATCH
            assignedEmployeeId: 'assigned_employee_id',
            assignedEmployeeName: 'assigned_employee_name',
            liveCampaignId: 'live_campaign_id',
            liveCampaignName: 'live_campaign_name',
            deposit: 'deposit',
            partnerStatus: 'partner_status',
            warehouseId: 'warehouse_id',
            reversedCode: 'reversed_code',
            printCount: 'print_count',
            // Migration 069 — extended hệ cũ mirror
            cityCode: 'city_code',
            cityName: 'city_name',
            districtCode: 'district_code',
            districtName: 'district_name',
            wardCode: 'ward_code',
            wardName: 'ward_name',
            partnerId: 'partner_id',
            partnerCode: 'partner_code',
            partnerUniqueId: 'partner_unique_id',
            email: 'email',
            companyId: 'company_id',
            companyName: 'company_name',
            warehouseName: 'warehouse_name',
            messageCount: 'message_count',
            tposIndex: 'tpos_index',
            // 2026-06-04: phương thức giao hàng (auto-detect lưu lại / chỉnh tay)
            deliveryMethod: 'delivery_method',
            deliveryMethodLabel: 'delivery_method_label',
            deliveryMethodManual: 'delivery_method_manual',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (body[k] === undefined) continue;
            params.push(k === 'products' || k === 'tags' ? JSON.stringify(body[k]) : body[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'No update fields' });
        // 2026-06-09: PATCH phone change → upsert vào KHO KH web2_customers (KHÔNG
        // hệ cũ). Sync customerName + address để 2 chiều consistent (chỉ KH info).
        if (body.phone !== undefined) {
            let cid = null;
            if (body.phone) {
                try {
                    const created = await getOrCreateWeb2OrderCustomer(pool, body.phone, {});
                    cid = created?.customerId || null;
                } catch (e) {
                    console.warn('[native-orders] PATCH phone customer sync failed:', e.message);
                    cid = await lookupCustomerIdByPhone(pool, body.phone).catch(() => null);
                }
            }
            params.push(cid);
            sets.push(`customer_id = $${params.length}`);
        }
        // 2026-06-07: cập nhật KH warehouse (tên/địa chỉ) theo SĐT. KHÔNG hệ cũ
        // (warehouse độc lập — không push CreateUpdatePartner nữa).
        const hasCustomerInfoUpdate =
            body.customerName !== undefined ||
            body.address !== undefined ||
            body.phone !== undefined;
        if (hasCustomerInfoUpdate) {
            const phoneForLookup = body.phone || null;
            if (phoneForLookup) {
                try {
                    await pool.query(
                        `UPDATE web2_customers
                         SET name = COALESCE(NULLIF($2, ''), name),
                             address = COALESCE(NULLIF($3, ''), address),
                             updated_at = $4
                         WHERE phone = $1`,
                        [
                            phoneForLookup,
                            body.customerName || null,
                            body.address || null,
                            Date.now(),
                        ]
                    );
                } catch (e) {
                    console.warn('[native-orders] update warehouse customer failed:', e.message);
                }
            }
        }
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.code);

        const r = await pool.query(
            `UPDATE native_orders SET ${sets.join(', ')}
             WHERE code = $${params.length}
             RETURNING *`,
            params
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const order = mapRowToOrder(r.rows[0]);
        // Sync PBH state nếu status field thay đổi (2-way sync — native is source of truth).
        let pbhSync = null;
        if (body.status) {
            pbhSync = await syncPbhStateFromNativeOrder(pool, order.code, body.status);
            if (pbhSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
                try {
                    req.app.locals.web2RealtimeSseNotify(
                        'web2:fast-sale-orders',
                        {
                            action: 'native-status-sync',
                            code: order.code,
                            status: body.status,
                            ts: Date.now(),
                        },
                        'update'
                    );
                } catch {}
            }
        }
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        _notify('update', order.code);
        _auditOrder(
            req,
            'update',
            order.code,
            body?.status ? 'Đổi trạng thái: ' + body.status : 'Sửa đơn'
        );

        // Auto-gán/nhả đơn vị (per-unit QR) khi giỏ đổi (thêm/bớt SP), đổi trạng thái
        // (huỷ → nhả hết), HOẶC đổi tên/SĐT KH (→ reconcile sync denorm STT/customer
        // của unit đã gán → quét ra TƯƠI). Best-effort fire-and-forget; idempotent.
        if (
            Array.isArray(body.products) ||
            body.status !== undefined ||
            body.customerName !== undefined ||
            body.phone !== undefined
        ) {
            try {
                require('./web2-product-units')
                    .reconcileOrderUnits(pool, order.id)
                    .catch(() => {});
            } catch (_) {}
        }

        // Sprint 1 KPI: diff productsBefore vs productsNew → emit forecast events.
        // Fire-and-forget — KPI lỗi không block response.
        if (productsBefore !== null && Array.isArray(body.products)) {
            _emitPatchKpiEvents(
                pool,
                orderBefore,
                r.rows[0],
                productsBefore,
                body.products,
                body._editor || {}
            ).catch((e) => console.warn('[NATIVE-ORDERS] PATCH KPI emit failed:', e.message));
        }

        res.json({ success: true, order, pbhSync });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper Sprint 1 — diff products[] cũ vs mới, emit forecast events vào ledger.
// Diff key = productCode. Compare quantity, emit add/remove/qty_change accordingly.
async function _emitPatchKpiEvents(pool, orderBefore, orderAfter, before, after, editor) {
    const kpiModule = require('./v2/kpi');
    const beforeMap = new Map();
    const codeOf = (p) => p.productCode || p.code;
    for (const p of before) beforeMap.set(codeOf(p), p);
    const afterMap = new Map();
    for (const p of after) afterMap.set(codeOf(p), p);

    const campaignName = orderAfter.live_campaign_name || orderBefore.live_campaign_name || null;
    const campaignId =
        orderAfter.live_campaign_id ||
        orderBefore.live_campaign_id ||
        kpiModule.SYNTHETIC_NO_CAMPAIGN;
    const campaignStt = orderAfter.campaign_stt ?? orderBefore.campaign_stt ?? null;
    // KPI-2PAGE-1: attribution theo CHIẾN DỊCH CHA (span 2 page).
    const parentCampaignId =
        orderAfter.parent_campaign_id ?? orderBefore.parent_campaign_id ?? null;
    const customerId = orderAfter.fb_user_id || orderBefore.fb_user_id || '';

    const actorId = Number(editor.userId);
    if (!Number.isFinite(actorId)) return; // skip — không có actor để attribute
    const beneficiary = await kpiModule.resolveBeneficiary(pool, {
        parent_campaign_id: parentCampaignId,
        campaign_name: campaignName,
        campaign_stt: campaignStt,
        actor_user_id: actorId,
        actor_name: editor.userName || null,
    });

    const _emit = async (eventType, productCode, qtyDelta, product) =>
        kpiModule.emitKpiEvent(pool, {
            event_type: eventType,
            actor_user_id: actorId,
            actor_name: editor.userName || null,
            ...beneficiary,
            order_code: orderAfter.code,
            order_campaign_stt: campaignStt,
            customer_id: customerId,
            product_code: productCode,
            qty_delta: qtyDelta,
            source: product?.source || 'native',
            campaign_id: campaignId,
            source_page: editor.sourcePage || 'native-orders',
            client_event_id: product?.clientEventId || null,
            raw_payload: { product_name: product?.name },
        });

    // Items removed (in before, not in after)
    for (const [code, oldP] of beforeMap) {
        if (!afterMap.has(code)) {
            const oldQty = Number(oldP.quantity ?? oldP.qty) || 0;
            if (oldQty > 0) await _emit('forecast_remove', code, -oldQty, oldP);
        }
    }
    // Items added or changed
    for (const [code, newP] of afterMap) {
        const oldP = beforeMap.get(code);
        const newQty = Number(newP.quantity ?? newP.qty) || 0;
        if (!oldP) {
            if (newQty > 0) await _emit('forecast_add', code, newQty, newP);
        } else {
            const oldQty = Number(oldP.quantity ?? oldP.qty) || 0;
            const delta = newQty - oldQty;
            if (delta !== 0) await _emit('forecast_qty_change', code, delta, newP);
        }
    }
}

// -----------------------------------------------------
// POST /api/native-orders/:code/confirm
// Mark đơn Web là "confirmed" mà KHÔNG cần tạo PBH (UX: user xem xong đơn,
// thấy thông tin đúng, đánh dấu đã chốt → status='confirmed'). Còn PBH có thể
// lập sau khi đóng gói / chuẩn bị giao. Cancel bằng PATCH /:code body
// {status:'cancelled'} hoặc dùng /by-source/:code/cancel ở fast-sale-orders.
// -----------------------------------------------------
router.post('/:code/confirm', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const code = req.params.code;
        const r = await pool.query(
            `UPDATE native_orders
             SET status = 'confirmed', updated_at = $1
             WHERE code = $2 AND status = 'draft'
             RETURNING *`,
            [Date.now(), code]
        );
        if (r.rows.length === 0) {
            // Idempotent: nếu đơn không phải draft → check tồn tại + return current
            const cur = await pool.query(`SELECT * FROM native_orders WHERE code = $1`, [code]);
            if (cur.rows.length === 0) return res.status(404).json({ error: 'Not found' });
            return res.json({
                success: true,
                order: mapRowToOrder(cur.rows[0]),
                idempotent: true,
                note: `Status hiện tại: ${cur.rows[0].status} (không đổi)`,
            });
        }
        const order = mapRowToOrder(r.rows[0]);
        // Auto sync state sang PBH liên kết (single + merged).
        const pbhSync = await syncPbhStateFromNativeOrder(pool, code, 'confirmed');
        if (pbhSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:fast-sale-orders',
                    { action: 'native-status-sync', code, status: 'confirmed', ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        _notify('confirm', code);
        _auditOrder(req, 'confirm', code, 'Xác nhận đơn');
        res.json({ success: true, order, pbhSync });
    } catch (e) {
        console.error('[NATIVE-ORDERS] /confirm error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/mark-printed   body: { codes: ["NJ-...", ...] }
// Tăng print_count cho các đơn ĐÃ IN BILL (bill PBH hoặc Phiếu Soạn Hàng) →
// biết bill in mấy lần, tránh in trùng gây soạn/chuẩn bị hàng lặp. Trả counts mới.
// (Đặt TRƯỚC /:code/* — path 1 segment, không đụng /:code/confirm…)
// -----------------------------------------------------
router.post('/mark-printed', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const codes = Array.isArray(req.body && req.body.codes) ? req.body.codes.filter(Boolean) : [];
    if (!codes.length) return res.status(400).json({ error: 'codes required' });
    // 2026-06-30: kind điều khiển bump cột nào.
    //   'pbh' (mặc định, in bill)       → chỉ print_count (🖨, backward-compat).
    //   'soan_hang' (in phiếu soạn hàng) → print_count + soan_hang_print_count (in thật + gắn tag).
    //   'soan_hang_tag_only' (toggle IN tắt) → CHỈ soan_hang_print_count (gắn tag, KHÔNG in thật
    //                                           → không bump print_count để 🖨 không báo "đã in").
    const kind = (req.body && req.body.kind) || 'pbh';
    const bumpPrint = kind !== 'soan_hang_tag_only'; // tag_only = không in giấy → không tăng 🖨
    const bumpSoan = kind === 'soan_hang' || kind === 'soan_hang_tag_only';
    try {
        await ensureTables(pool);
        const now = Date.now();
        const sets = ['updated_at = $1'];
        if (bumpPrint) sets.push('print_count = print_count + 1', 'last_printed_at = $1');
        if (bumpSoan)
            sets.push(
                'soan_hang_print_count = soan_hang_print_count + 1',
                'soan_hang_last_printed_at = $1'
            );
        const r = await pool.query(
            `UPDATE native_orders SET ${sets.join(', ')}
             WHERE code = ANY($2::text[]) RETURNING code, print_count, last_printed_at`,
            [now, codes]
        );
        const counts = {};
        const printedAt = {};
        r.rows.forEach((row) => {
            counts[row.code] = Number(row.print_count || 0);
            printedAt[row.code] = row.last_printed_at != null ? Number(row.last_printed_at) : now;
        });
        _notify('print', codes.join(','));
        res.json({ success: true, counts, printedAt });
    } catch (e) {
        console.error('[NATIVE-ORDERS] /mark-printed error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/:code/cancel
// Huỷ đơn web — status='cancelled'. Tự sync sang PBH liên kết (single
// + merged) → state='cancel' + restock tồn kho (qua syncPbhStateFromNativeOrder
// + cancel logic ở fast-sale-orders.js).
// Idempotent: nếu đã cancelled → trả về current state.
// -----------------------------------------------------
router.post('/:code/cancel', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const code = req.params.code;
        const reason = req.body?.reason || null;
        const performedBy =
            req.body?.userName || req.body?._editor?.userName || req.body?.by || null;

        // 2026-06-10 (bug 5): UPDATE status='cancelled' + hoàn ví (deposit + zero-out
        // wallet_deducted) chạy CHUNG 1 transaction → nguyên tử. Crash giữa chừng →
        // ROLLBACK hết: không còn cảnh "đã huỷ nhưng ví chưa hoàn". processDeposit
        // + zero-out per-row vẫn idempotent (chỉ refund row wallet_deducted>0).
        const client = await pool.connect();
        let r;
        let refunded = 0;
        const pbhCancelled = [];
        // audit d-fix (2026-06-23): mã đơn anh em (member của PBH gộp) bị huỷ lan
        // truyền — dùng để thu hồi KPI cho TẤT CẢ, không chỉ req.params.code.
        let cancelledMemberCodes = [];
        try {
            await client.query('BEGIN');
            r = await client.query(
                `UPDATE native_orders
                 SET status = 'cancelled', updated_at = $1,
                     note = CASE
                                WHEN $2::text IS NULL THEN note
                                ELSE COALESCE(note || E'\n---\n', '') || '[' || to_char(NOW(),'DD/MM/YYYY HH24:MI') || '] [HUỶ ĐƠN] ' || $2
                            END
                 WHERE code = $3 AND status <> 'cancelled'
                 RETURNING *`,
                [Date.now(), reason, code]
            );
            if (r.rows.length === 0) {
                // Đơn không tồn tại HOẶC đã cancelled → không có gì để hoàn, commit no-op.
                await client.query('COMMIT');
                const cur = await pool.query(`SELECT * FROM native_orders WHERE code = $1`, [code]);
                if (cur.rows.length === 0) return res.status(404).json({ error: 'Not found' });
                return res.json({
                    success: true,
                    order: mapRowToOrder(cur.rows[0]),
                    idempotent: true,
                    note: `Đã ở trạng thái cancelled trước đó`,
                });
            }
            // 3H3 FIX (2026-06-12): huỷ PBH liên kết ĐÚNG NGHĨA trong CÙNG
            // transaction — _cancelPbhInTx (fast-sale-orders) lock FOR UPDATE
            // → state='cancel' + restock idempotent (stock_restored) + hoàn
            // wallet_deducted idempotent (zero-out). Trước đây chỉ mirror state
            // qua syncPbhStateFromNativeOrder NGOÀI tx → kho đã trừ lúc tạo PBH
            // không bao giờ trả về (mọi đường restock sau skip vì state đã
            // 'cancel'). Match cả merged PBH (source_code 'NJ-A+NJ-B').
            const fastSale = require('./fast-sale-orders');
            const linkedPbh = await client.query(
                `SELECT number FROM fast_sale_orders
                 WHERE source_code = $1
                    OR source_code LIKE $2
                    OR source_code LIKE $3
                    OR source_code LIKE $4
                 ORDER BY number
                 FOR UPDATE`,
                [code, `${code}+%`, `%+${code}+%`, `%+${code}`]
            );
            // audit d-fix (2026-06-23): khi PBH liên kết là PBH GỘP (source_code
            // 'NJ-A+NJ-B'), huỷ đơn NJ-A cancel PBH gộp nhưng đơn anh em NJ-B vẫn
            // status='confirmed' (mồ côi: trông như còn sống, re-convert được, KPI
            // chưa thu hồi). Gom MỌI mã thành viên từ source_code của PBH đã cancel
            // → cancel chung trong CÙNG transaction (atomic). Mirror sync 2 chiều
            // syncNativeOrderStatusFromPbh nhưng chạy in-tx với client.
            const memberCodeSet = new Set();
            for (const lp of linkedPbh.rows) {
                const cr = await fastSale._cancelPbhInTx(client, lp.number, performedBy);
                if (!cr.notFound) {
                    pbhCancelled.push(lp.number);
                    refunded += Number(cr.walletRefunded) || 0;
                    const srcCode = cr.prevRow?.source_code;
                    if (srcCode) {
                        String(srcCode)
                            .split('+')
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .forEach((mc) => memberCodeSet.add(mc));
                    }
                }
            }
            // Đơn vừa huỷ (code) đã set ở UPDATE đầu — loại khỏi danh sách lan truyền.
            memberCodeSet.delete(code);
            const memberCodes = [...memberCodeSet];
            if (memberCodes.length) {
                const propRes = await client.query(
                    `UPDATE native_orders
                     SET status = 'cancelled', updated_at = $1,
                         note = COALESCE(note || E'\n---\n', '')
                                || '[' || to_char(NOW(),'DD/MM/YYYY HH24:MI') || '] [HUỶ ĐƠN] '
                                || 'Huỷ theo PBH gộp (đơn ' || $3 || ')'
                     WHERE code = ANY($2::text[]) AND status <> 'cancelled'
                     RETURNING code`,
                    [Date.now(), memberCodes, code]
                );
                cancelledMemberCodes = propRes.rows.map((x) => x.code);
            }
            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK').catch(() => {});
            throw txErr;
        } finally {
            client.release();
        }

        const order = mapRowToOrder(r.rows[0]);
        const pbhSync = {
            synced: pbhCancelled.length,
            numbers: pbhCancelled,
            // audit d-fix (2026-06-23): mã đơn anh em bị huỷ lan truyền theo PBH gộp.
            cancelledMembers: cancelledMemberCodes,
        };
        // SSE: đơn anh em vừa bị huỷ → tab/máy khác refresh danh sách native-orders.
        if (cancelledMemberCodes.length && req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:native-orders',
                    {
                        action: 'merged-sibling-cancel',
                        codes: cancelledMemberCodes,
                        ts: Date.now(),
                    },
                    'update'
                );
            } catch {}
        }
        if (refunded > 0 && req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    `web2:wallet:${String(r.rows[0].phone).replace(/\D/g, '')}`,
                    { action: 'pbh-refund', phone: r.rows[0].phone, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        if (pbhSync.synced > 0 && req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:fast-sale-orders',
                    { action: 'native-status-sync', code, status: 'cancelled', ts: Date.now() },
                    'update'
                );
                // 3H3: PBH cancel kèm restock → products page refresh stock.
                req.app.locals.web2RealtimeSseNotify(
                    'web2:products',
                    { action: 'native-cancel-restock', code, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        _notify('cancel', code);
        _auditOrder(req, 'cancel', code, 'Hủy đơn');

        // Auto-NHẢ đơn vị (per-unit QR) của đơn vừa huỷ (+ đơn anh em PBH gộp huỷ lan
        // truyền) → reconcile thấy giỏ rỗng (status cancelled) → nhả unit về IN_STOCK +
        // event UNASSIGN. Fire-and-forget, không chặn response.
        try {
            const units = require('./web2-product-units');
            const reconcileIds = [r.rows[0].id];
            if (cancelledMemberCodes.length) {
                const mr = await pool.query(
                    `SELECT id FROM native_orders WHERE code = ANY($1::text[])`,
                    [cancelledMemberCodes]
                );
                for (const x of mr.rows) reconcileIds.push(x.id);
            }
            for (const id of reconcileIds) units.reconcileOrderUnits(pool, id).catch(() => {});
        } catch (_) {}

        // Sprint 1 KPI: emit actual_revoked cho từng SP đã có actual_confirmed.
        // Lookup events qua order_code; emit qua deterministic client_event_id.
        // audit d-fix (2026-06-23): thu hồi KPI cho CẢ đơn anh em bị huỷ lan truyền
        // (member của PBH gộp), không chỉ req.params.code — nếu không KPI đơn NJ-B
        // vẫn còn dù đơn đã cancelled.
        try {
            const kpiModule = require('./v2/kpi');
            const editor = (req.body && req.body._editor) || {};
            const actorId = Number(editor.userId) || null;
            const revokeCodes = [...new Set([code, ...cancelledMemberCodes])];
            const events = await pool.query(
                `SELECT e.id, e.order_code, e.product_code, e.qty_delta, e.beneficiary_user_id,
                        e.beneficiary_name, e.customer_id, e.source,
                        e.campaign_id, e.order_campaign_stt
                 FROM web2_kpi_events e
                 WHERE e.order_code = ANY($1::text[]) AND e.event_type = 'actual_confirmed'
                   AND NOT EXISTS (
                       SELECT 1 FROM web2_kpi_events r
                       WHERE r.event_type = 'actual_revoked'
                         AND r.revokes_event_id = e.id
                   )`,
                [revokeCodes]
            );
            for (const ev of events.rows) {
                await kpiModule.emitKpiEvent(pool, {
                    event_type: 'actual_revoked',
                    actor_user_id: actorId || ev.beneficiary_user_id,
                    actor_name: editor.userName || null,
                    beneficiary_user_id: ev.beneficiary_user_id,
                    beneficiary_name: ev.beneficiary_name,
                    beneficiary_source: 'assignment',
                    order_code: ev.order_code,
                    order_campaign_stt: ev.order_campaign_stt,
                    customer_id: ev.customer_id,
                    product_code: ev.product_code,
                    qty_delta: -ev.qty_delta,
                    source: ev.source,
                    campaign_id: ev.campaign_id,
                    source_page: 'native-orders',
                    client_event_id: `revoke_${ev.id}`,
                    revokes_event_id: ev.id,
                    raw_payload: { reason: reason || 'native-cancel' },
                });
            }
        } catch (e) {
            console.warn('[NATIVE-ORDERS] KPI revoke emit failed:', e.message);
        }

        res.json({ success: true, order, pbhSync });
    } catch (e) {
        console.error('[NATIVE-ORDERS] /cancel error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /api/native-orders/:code — hard delete
// -----------------------------------------------------
router.delete('/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const code = req.params.code;
        // MEDIUM-cleanup (2026-06-13): chặn xoá đơn còn PBH active liên kết —
        // hard-delete trước đây để lại PBH mồ côi (source_code trỏ đơn không tồn
        // tại → sync 2 chiều/cancel/enrich badge gãy). Cho ?force=1 để vẫn xoá
        // được data rác (đối chiếu fast-sale-orders DELETE chỉ cho draft-only).
        const force = req.query.force === '1' || req.query.force === 'true';
        if (!force) {
            const linked = await pool.query(
                `SELECT number FROM fast_sale_orders
                 WHERE state <> 'cancel'
                   AND (source_code = $1
                        OR source_code LIKE $2 OR source_code LIKE $3 OR source_code LIKE $4)
                 LIMIT 5`,
                [code, `${code}+%`, `%+${code}+%`, `%+${code}`]
            );
            if (linked.rows.length > 0) {
                return res.status(409).json({
                    error: `Đơn còn PBH liên kết (${linked.rows.map((x) => x.number).join(', ')}) — huỷ/xoá PBH trước, hoặc dùng ?force=1`,
                    linkedPbh: linked.rows.map((x) => x.number),
                });
            }
        }
        const r = await pool.query(`DELETE FROM native_orders WHERE code = $1 RETURNING code`, [
            code,
        ]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        _notify('delete', code);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/merge-to-pbh
// Body: { codes: ['NJ-...', 'NJ-...'] } (≥2 codes)
// Logic:
//   - Validate: ≥2 codes, tất cả tồn tại, cùng phone
//   - Combine products (concat), sum totalQty + totalAmount
//   - INSERT vào fast_sale_orders (PBH mới) với:
//       source_code = "NJ-A+NJ-B" (join '+')
//       merged_display_stt = [stt_a, stt_b] (lưu để client hiển thị "1 + 2")
//       source_type = 'native_order'
//       state = 'draft'
//   - KHÔNG xóa native-orders gốc — chỉ tạo PBH mới (user có thể delete đơn web sau)
//   - Notify SSE web2:native-orders + web2:fast-sale-orders + cross-bc web2:customer-wallet
// -----------------------------------------------------

// -----------------------------------------------------
// POST /api/native-orders/merge
// Body: { codes: ['NJ-...', 'NJ-...'] } (≥2 codes)
// Gộp 2+ Đơn Web cùng SĐT thành 1 Đơn Web mới (KHÔNG tạo PBH).
// Logic:
//   - Validate: ≥2 codes, tất cả tồn tại, cùng phone
//   - Combine products (concat), sum total_qty + total_amount
//   - INSERT native_order mới:
//       code = "NJ-YYYYMMDD-XXXX" (sequence mới)
//       display_stt = nextval
//       merged_display_stt = [stt_a, stt_b] (lưu để client hiển thị "1 + 2")
//       merged_codes = [code_a, code_b]
//       comment_ids = concat all source comment_ids
//   - DELETE các native_order gốc (atomic transaction)
//   - Notify SSE web2:native-orders
// -----------------------------------------------------
//
// POST /api/native-orders/:code/split-order
// Tách 1 đơn nháp thành 2: original giữ products, new tạo với giỏ rỗng.
//   - Source phải có status='draft'.
//   - Nếu source.split_index = 0 → set thành 1 (đơn đầu).
//   - New order: same customer info, products=[], split_index = MAX(split_index)+1
//     across cùng display_stt (atomic).
//   - Frontend hiển thị "<STT>-<split_index>" cho mọi order có split_index > 0.
// -----------------------------------------------------
router.post('/:code/split-order', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const code = req.params.code;
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');

        const srcQ = await client.query(`SELECT * FROM native_orders WHERE code = $1 FOR UPDATE`, [
            code,
        ]);
        if (!srcQ.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'not_found', message: 'Không tìm thấy đơn' });
        }
        const src = srcQ.rows[0];
        if (src.status !== 'draft') {
            await client.query('ROLLBACK');
            return res
                .status(400)
                .json({ error: 'invalid_status', message: 'Chỉ tách được giỏ hàng (chưa PBH)' });
        }

        // Compute split_index cho new order = MAX(split_index)+1 across same display_stt
        const maxQ = await client.query(
            `SELECT COALESCE(MAX(split_index), 0) AS max_idx
             FROM native_orders
             WHERE display_stt = $1`,
            [src.display_stt]
        );
        const currentMax = Number(maxQ.rows[0].max_idx) || 0;
        // Original gốc lần đầu (split_index=0) → đặt thành 1
        if (src.split_index === 0) {
            await client.query(
                `UPDATE native_orders SET split_index = 1, updated_at = $2 WHERE id = $1`,
                [src.id, Date.now()]
            );
        }
        const newIndex = Math.max(currentMax, 1) + 1;

        // Generate new code (NJ-YYYYMMDD-XXXX, giờ VN) — C7: MAX-based + retry
        // 23505 qua insertWithCodeRetryTx (COUNT+1 cũ sinh mã trùng khi COUNT < MAX).
        const now = Date.now();

        // INSERT new order: same customer/contact info, EMPTY products, split_index = newIndex,
        // display_stt = source's display_stt (cùng STT — chỉ khác hậu tố split_index).
        // campaign_stt: inherit parent (split là copy, KPI tính chung beneficiary parent).
        const insQ = await insertWithCodeRetryTx(client, (newCode) =>
            client.query(
                `INSERT INTO native_orders (
                code, session_index, display_stt, campaign_stt, split_index, source,
                customer_name, phone, address, note,
                fb_user_id, fb_user_name, fb_page_id, fb_post_id,
                products, total_quantity, total_amount,
                status, tags,
                live_campaign_id, live_campaign_name,
                customer_id,
                created_by, created_by_name, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $20, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12, $13,
                '[]'::jsonb, 0, 0,
                'draft', '[]'::jsonb,
                $14, $15,
                $16,
                $17, $18, $19, $19
            ) RETURNING *`,
                [
                    newCode,
                    src.session_index,
                    src.display_stt,
                    newIndex,
                    src.source,
                    src.customer_name,
                    src.phone,
                    src.address,
                    src.note,
                    src.fb_user_id,
                    src.fb_user_name,
                    src.fb_page_id,
                    src.fb_post_id,
                    src.live_campaign_id,
                    src.live_campaign_name,
                    src.customer_id,
                    src.created_by,
                    src.created_by_name,
                    now,
                    src.campaign_stt || null, // $20 — inherit parent
                ]
            )
        );
        const newCode = insQ.rows[0].code;

        await client.query('COMMIT');

        // Re-read source để lấy split_index sau update
        const updatedSrcQ = await pool.query('SELECT * FROM native_orders WHERE id = $1', [src.id]);
        const updatedSrc = mapRowToOrder(updatedSrcQ.rows[0]);
        const newOrder = mapRowToOrder(insQ.rows[0]);

        // 3W4: WS broadcast đã gỡ — SSE _notify là kênh realtime duy nhất.
        _notify('split-order', newCode);

        res.json({
            success: true,
            source: updatedSrc,
            created: newOrder,
            splitIndex: newIndex,
        });
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        console.error('[NATIVE-ORDERS] /split-order error:', e);
        res.status(500).json({ error: 'internal', message: e.message });
    } finally {
        client.release();
    }
});

router.post('/merge', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const codes = Array.isArray(req.body?.codes) ? req.body.codes : null;
    if (!codes || codes.length < 2) {
        return res.status(400).json({ error: 'Cần ít nhất 2 đơn để gộp' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');

        const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
        // H14: FOR UPDATE khóa đơn nguồn — chặn race với confirm/tạo PBH song song.
        const src = await client.query(
            `SELECT * FROM native_orders WHERE code IN (${placeholders}) FOR UPDATE`,
            codes
        );
        if (src.rows.length !== codes.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: `Tìm thấy ${src.rows.length}/${codes.length} đơn — có đơn không tồn tại`,
            });
        }
        // H14: chỉ gộp đơn nháp — đơn đã có PBH mà bị DELETE sẽ làm PBH dangling.
        const nonDraft = src.rows.filter((r) => r.status !== 'draft').map((r) => r.code);
        if (nonDraft.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ gộp được giỏ hàng (chưa PBH). Đơn không hợp lệ: ${nonDraft.join(', ')}`,
            });
        }
        const phones = new Set(src.rows.map((r) => (r.phone || '').trim()));
        if (phones.size > 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Phải cùng SĐT. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
            });
        }

        const sorted = src.rows.sort(
            (a, b) => (Number(a.display_stt) || 0) - (Number(b.display_stt) || 0)
        );
        const base = sorted[0];
        const combinedProducts = [];
        let totalQty = 0;
        let totalAmount = 0;
        const allCommentIds = [];
        for (const r of sorted) {
            const products = Array.isArray(r.products) ? r.products : [];
            for (const p of products) {
                combinedProducts.push(p);
                totalQty += Number(p.quantity) || 0;
                totalAmount += (Number(p.quantity) || 0) * (Number(p.price) || 0);
            }
            const cids = Array.isArray(r.comment_ids) ? r.comment_ids : [];
            allCommentIds.push(...cids);
        }
        const mergedStts = sorted.map((r) => Number(r.display_stt) || 0).filter(Boolean);
        const mergedCodes = sorted.map((r) => r.code);
        const combinedNote = sorted
            .map((r) => (r.note ? `[${r.code}] ${r.note}` : null))
            .filter(Boolean)
            .join('\n---\n');

        const now = Date.now();

        // Merge tạo đơn mới → cấp campaign_stt mới scope theo CHIẾN DỊCH CHA (H4).
        // H14 + #2 (2026-07-01): advisory lock + subquery MAX+1 dùng group key
        // THỐNG NHẤT (parent_campaign_id → name-group → live_campaign_id) như
        // from-comment → merge KHÔNG còn cấp STT lệch scope 1 page (bug MP1/CAMP-1).
        // HIGH-1 (review): RE-RESOLVE parent CHA từ bài (base.parent_campaign_id có thể
        // stale nếu bài được gán cha SAU khi đơn nguồn tạo) → lock key + subquery khớp
        // đúng source-of-truth như from-comment (tránh STT collision dưới concurrency).
        const mergeParentId =
            base.parent_campaign_id != null
                ? base.parent_campaign_id
                : await resolveParentCampaignId(client, base.fb_post_id);
        await lockCampaignSttKey(
            client,
            campaignGroupKeyJs(mergeParentId, base.live_campaign_name, base.live_campaign_id)
        );
        // C7: mã NJ (giờ VN) MAX-based + retry 23505 qua SAVEPOINT — COUNT+1 cũ
        // sinh mã trùng vì /merge DELETE đơn nguồn làm COUNT < MAX.
        const ins = await insertWithCodeRetryTx(client, (newCode) =>
            client.query(
                `INSERT INTO native_orders (
                code, display_stt, campaign_stt, source,
                customer_name, phone, address, note,
                fb_user_id, fb_user_name, fb_page_id, fb_post_id,
                products, total_quantity, total_amount,
                status, live_campaign_id, live_campaign_name,
                customer_id, comment_ids, comment_count,
                merged_display_stt, merged_codes, parent_campaign_id,
                created_by, created_by_name, created_at, updated_at
            ) VALUES (
                $1, nextval('native_orders_display_stt_seq'),
                (SELECT COALESCE(MAX(campaign_stt), 0) + 1
                 FROM native_orders
                 WHERE ${SQL_CAMPAIGN_GROUP_ROW}
                     = ${sqlCampaignGroupFromParams('$23', '$14', '$13')}),
                'NATIVE_WEB',
                $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12,
                'draft', $13, $14,
                $15, $16, $17,
                $18, $19, $23::bigint,
                $20, $21, $22, $22
            ) RETURNING *`,
                [
                    newCode,
                    base.customer_name,
                    base.phone,
                    base.address,
                    combinedNote,
                    base.fb_user_id,
                    base.fb_user_name,
                    base.fb_page_id,
                    base.fb_post_id,
                    JSON.stringify(combinedProducts),
                    totalQty,
                    totalAmount,
                    base.live_campaign_id,
                    base.live_campaign_name,
                    base.customer_id,
                    JSON.stringify(allCommentIds),
                    allCommentIds.length || sorted.length,
                    JSON.stringify(mergedStts),
                    JSON.stringify(mergedCodes),
                    base.created_by,
                    base.created_by_name,
                    now,
                    mergeParentId,
                ]
            )
        );
        const newCode = ins.rows[0].code;

        // Delete source native-orders
        await client.query(`DELETE FROM native_orders WHERE code IN (${placeholders})`, codes);

        await client.query('COMMIT');
        const newOrder = mapRowToOrder(ins.rows[0]);
        _notify('merge', newCode);
        res.json({
            success: true,
            mergedFrom: codes,
            mergedStts,
            order: newOrder,
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[NATIVE-ORDERS] merge error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.post('/merge-to-pbh', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const codes = Array.isArray(req.body?.codes) ? req.body.codes : null;
    if (!codes || codes.length < 2) {
        return res.status(400).json({ error: 'Cần ít nhất 2 đơn để gộp' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');

        // Fetch all native orders.
        // 3H5 FIX (2026-06-12): FOR UPDATE + guard status='draft' — trước đây
        // SELECT trần không guard nên gộp được cả đơn cancelled/confirmed và
        // race với /cancel; đồng bộ với /merge (đơn web) đã làm đúng.
        const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
        const src = await client.query(
            `SELECT * FROM native_orders WHERE code IN (${placeholders}) FOR UPDATE`,
            codes
        );
        if (src.rows.length !== codes.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: `Tìm thấy ${src.rows.length}/${codes.length} đơn — có đơn không tồn tại`,
            });
        }
        const notDraft = src.rows.filter((r) => r.status !== 'draft');
        if (notDraft.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ gộp được đơn ở trạng thái 'draft'. Đơn không hợp lệ: ${notDraft.map((r) => `${r.code} (${r.status})`).join(', ')}`,
            });
        }

        // Validate cùng phone
        const phones = new Set(src.rows.map((r) => (r.phone || '').trim()));
        if (phones.size > 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Phải cùng SĐT. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
            });
        }

        // 3H5: idempotent — đã có PBH gộp active cho ĐÚNG bộ đơn này → trả lại
        // PBH cũ thay vì tạo bản thứ 2 (double-submit khi mạng chậm).
        const mergedSourceCodePre = src.rows
            .sort((a, b) => (Number(a.display_stt) || 0) - (Number(b.display_stt) || 0))
            .map((r) => r.code)
            .join('+');
        const dupQ = await client.query(
            `SELECT number FROM fast_sale_orders
             WHERE source_type = 'native_order' AND source_code = $1 AND state <> 'cancel'
             LIMIT 1`,
            [mergedSourceCodePre]
        );
        if (dupQ.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: `Đã có PBH gộp ${dupQ.rows[0].number} cho bộ đơn này`,
                existingNumber: dupQ.rows[0].number,
                idempotent: true,
            });
        }

        // Combine: sort theo display_stt asc để STT hiển thị đúng thứ tự
        const sorted = src.rows.sort(
            (a, b) => (Number(a.display_stt) || 0) - (Number(b.display_stt) || 0)
        );
        const base = sorted[0];
        const combinedLines = [];
        let totalQty = 0;
        let totalAmount = 0;
        for (const r of sorted) {
            const products = Array.isArray(r.products) ? r.products : [];
            for (const p of products) {
                const q = Number(p.quantity) || 0;
                const price = Number(p.price) || 0;
                combinedLines.push({
                    // 3H5 FIX: giữ productCode — thiếu nó PBH gộp không bao giờ
                    // trừ/hoàn kho được (mọi loop stock skip line không code).
                    productCode: p.productCode || p.code || null,
                    productName: p.name || p.productName || '',
                    quantity: q,
                    priceUnit: price,
                    uomName: p.uomName || 'Cái',
                    note: p.note || '',
                });
                totalQty += q;
                totalAmount += q * price;
            }
        }
        // BUG FIX (2026-06-24): dedupe order_lines theo mã (đồng bộ /merge fast-sale-
        // orders.js) — 2 đơn gộp cùng productCode → dòng TRÙNG mã → reconcile (1-bucket/
        // mã, cap theo dòng đầu) không đóng gói được + restockOrderLines trừ lặp. Cộng
        // dồn quantity; dòng không-mã (phí ship/free) giữ riêng. (validateStock dưới vẫn
        // dùng combinedLines gốc — nó tự gộp theo mã nội bộ, không ảnh hưởng.)
        const _mlByCode = new Map();
        const combinedLinesDeduped = [];
        for (const ln of combinedLines) {
            const code = ln && (ln.productCode || ln.code);
            if (!code) {
                combinedLinesDeduped.push(ln);
                continue;
            }
            const key = String(code).trim().toLowerCase();
            const ex = _mlByCode.get(key);
            if (ex) {
                ex.quantity = (Number(ex.quantity) || 0) + (Number(ln.quantity) || 0);
            } else {
                const copy = { ...ln };
                _mlByCode.set(key, copy);
                combinedLinesDeduped.push(copy);
            }
        }
        const mergedStts = sorted.map((r) => Number(r.display_stt) || 0).filter(Boolean);
        const mergedSourceCode = sorted.map((r) => r.code).join('+');

        // 3H5 FIX: validate + trừ kho TRONG transaction (đồng bộ từng-line với
        // from-native-order). force:true bypass check như from-native-order.
        const fastSaleHelpers = require('./fast-sale-orders');
        if (req.body?.force !== true) {
            const violations = await fastSaleHelpers.validateStock(client, combinedLines);
            if (violations.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'over_sell',
                    message: 'Gộp → PBH thất bại: số lượng vượt tồn kho ở 1 hoặc nhiều SP',
                    violations,
                });
            }
        }
        const combinedComment = sorted
            .map((r) => (r.note ? `[${r.code}] ${r.note}` : null))
            .filter(Boolean)
            .join('\n---\n');

        // Generate new HD number (NJ-YYYYMMDD-XXXX, giờ VN) — C7: MAX-based +
        // retry 23505 qua SAVEPOINT (COUNT+1 cũ sinh số trùng khi COUNT < MAX).
        // INSERT new PBH (fast_sale_orders)
        const ins = await insertWithCodeRetryTx(
            client,
            (newNumber) =>
                client.query(
                    `INSERT INTO fast_sale_orders (
                number, display_stt, source,
                partner_name, partner_phone, partner_address,
                order_lines, total_quantity, amount_untaxed, amount_total,
                state, source_type, source_code, merged_display_stt,
                customer_id, comment, date_invoice
            ) VALUES (
                $1, nextval('fast_sale_orders_display_stt_seq'), 'NATIVE_WEB',
                $2, $3, $4,
                $5, $6, $7, $7,
                'draft', 'native_order', $8, $9,
                $10, $11, NOW()
            ) RETURNING *`,
                    [
                        newNumber,
                        base.customer_name || '',
                        base.phone || '',
                        base.address || '',
                        JSON.stringify(combinedLinesDeduped),
                        totalQty,
                        totalAmount,
                        mergedSourceCode,
                        JSON.stringify(mergedStts),
                        base.customer_id || null,
                        combinedComment,
                    ]
                ),
            { table: 'fast_sale_orders', column: 'number' }
        );
        const newNumber = ins.rows[0].number;

        // audit d-fix (2026-06-23): re-check tồn DƯỚI advisory lock theo MÃ SP bên
        // TRONG transaction — giống nhánh create (from-native-order / manual create
        // ở fast-sale-orders.js:1370-1408). validateStock ngoài lock (line ~2841)
        // KHÔNG serialize 2 merge cùng 1 SP → cả 2 qua check rồi cùng trừ →
        // GREATEST(0,...) bên dưới nuốt âm = OVER-SELL thầm lặng. Khoá theo code
        // (sort tránh deadlock) + so tổng cần với tồn tươi. force:true bypass (parity).
        if (req.body?.force !== true) {
            const needMap = new Map();
            for (const line of combinedLines) {
                const c = line.productCode;
                const q = Number(line.quantity) || 0;
                if (!c || q <= 0) continue;
                needMap.set(c, (needMap.get(c) || 0) + q);
            }
            const sortedCodes = [...needMap.keys()].sort();
            for (const c of sortedCodes) {
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
                    'web2_product_stock:' + c,
                ]);
            }
            if (sortedCodes.length) {
                const sres = await client.query(
                    `SELECT code, stock FROM web2_products WHERE code = ANY($1::text[])`,
                    [sortedCodes]
                );
                const sMap = new Map(sres.rows.map((row) => [row.code, Number(row.stock) || 0]));
                const viol = [];
                for (const [c, reqd] of needMap) {
                    const avail = sMap.has(c) ? sMap.get(c) : 0;
                    if (reqd > avail) viol.push({ code: c, requested: reqd, available: avail });
                }
                if (viol.length) {
                    const err = new Error('over_sell');
                    err.__overSell = viol;
                    throw err;
                }
            }
        }

        // 3H5 FIX: trừ kho TRONG cùng transaction (mirror from-native-order —
        // clamp GREATEST(0)); cancel PBH gộp về sau restock đủ qua stock_restored.
        const stockNow = Date.now();
        for (const line of combinedLines) {
            const lc = line.productCode;
            const lq = Number(line.quantity) || 0;
            if (!lc || lq <= 0) continue;
            // BÁN HẾT → HẾT HÀNG (logic mới 2026-06-28): sau khi trừ kho, nếu tồn về
            // 0 và không còn hàng chờ → status='HET_HANG' + is_active=false (tự ẩn
            // khỏi Kho SP + bảng live, chỉ còn ở gợi ý Số Order). CASE đánh giá theo
            // giá trị TRƯỚC update (Postgres) nên lặp lại GREATEST(0, stock - $1).
            await client.query(
                `UPDATE web2_products
                 SET stock = GREATEST(0, stock - $1),
                     status = CASE WHEN GREATEST(0, stock - $1) = 0 AND COALESCE(pending_qty, 0) = 0 AND is_active = true
                                   THEN 'HET_HANG' ELSE status END,
                     is_active = CASE WHEN GREATEST(0, stock - $1) = 0 AND COALESCE(pending_qty, 0) = 0 AND is_active = true
                                      THEN false ELSE is_active END,
                     updated_at = $2
                 WHERE code = $3`,
                [lq, stockNow, lc]
            );
        }
        // 3H5 FIX: đơn nguồn → 'confirmed' (đã lên PBH) — chặn user tạo thêm PBH
        // lẻ qua from-native-order cho từng đơn = double-billing cùng giỏ hàng.
        const confirmPh = codes.map((_, i) => `$${i + 2}`).join(',');
        await client.query(
            `UPDATE native_orders SET status = 'confirmed', updated_at = $1
             WHERE code IN (${confirmPh})`,
            [Date.now(), ...codes]
        );

        await client.query('COMMIT');
        const newOrder = ins.rows[0];

        // Notify cả 2 topics
        _notify('merge-to-pbh', null);
        // Direct broadcast fast-sale-orders topic (route khác, không gọi _notify của route đó được)
        const realtimeSse = req.app.locals.web2RealtimeSseNotify;
        if (typeof realtimeSse === 'function') {
            realtimeSse(
                'web2:fast-sale-orders',
                { action: 'merge-to-pbh', number: newNumber, ts: Date.now() },
                'update'
            );
            realtimeSse(
                'web2:customer-wallet',
                {
                    action: 'merge-to-pbh',
                    number: newNumber,
                    ts: Date.now(),
                    from: 'web2:native-orders',
                },
                'update'
            );
            // 3H5: PBH gộp giờ trừ kho thật → products page refresh stock.
            realtimeSse(
                'web2:products',
                { action: 'merge-to-pbh', number: newNumber, ts: Date.now() },
                'update'
            );
        }

        res.json({
            success: true,
            mergedFrom: codes,
            mergedStts,
            order: {
                id: Number(newOrder.id),
                number: newOrder.number,
                displayStt: newOrder.display_stt,
                mergedDisplayStt: newOrder.merged_display_stt,
                sourceCode: newOrder.source_code,
                totalQuantity: Number(newOrder.total_quantity),
                amountTotal: Number(newOrder.amount_total),
            },
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        // audit d-fix (2026-06-23): over_sell từ recheck dưới lock → 400 (client xử lý
        // data.error==='over_sell' + violations), không phải 500. Mirror create path.
        if (e && e.__overSell) {
            return res.status(400).json({
                error: 'over_sell',
                message: 'Gộp → PBH thất bại: số lượng vượt tồn kho ở 1 hoặc nhiều SP',
                violations: e.__overSell,
            });
        }
        console.error('[NATIVE-ORDERS] merge-to-pbh error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================
// KPI BASE SNAPSHOT — gọi khi gửi tin "Chốt đơn" thành công (web2-msg-send-worker).
// Khóa list SP hiện tại làm base cho đơn LIVESTREAM mới nhất của khách.
// Anti-cheat: chỉ khóa LẦN ĐẦU (kpi_base IS NULL) + đơn phải có ≥1 SP (không khóa
// base rỗng → chặn "chốt đơn trống rồi thêm hết tính KPI"). Bất biến sau khi set.
// Trả { ok, code?, base?, reason? }.
// =====================================================
async function snapshotKpiBase(pool, { fbUserId, code, byName } = {}) {
    if (!pool || (!fbUserId && !code)) return { ok: false, reason: 'no-args' };
    try {
        // Lock theo code (chốt thủ công 1 đơn) HOẶC theo fbUserId (gửi "Chốt đơn"
        // → đơn livestream mới nhất chưa chốt của khách).
        const r = code
            ? await pool.query(
                  `SELECT id, code, products FROM native_orders
                   WHERE code = $1 AND channel = 'web2_livestream'
                     AND status NOT IN ('cancelled') AND kpi_base IS NULL LIMIT 1`,
                  [code]
              )
            : await pool.query(
                  `SELECT id, code, products FROM native_orders
                   WHERE fb_user_id = $1 AND channel = 'web2_livestream'
                     AND status NOT IN ('cancelled') AND kpi_base IS NULL
                   ORDER BY created_at DESC LIMIT 1`,
                  [fbUserId]
              );
        if (!r.rows.length) return { ok: false, reason: 'no-unbased-order' };
        const o = r.rows[0];
        const prods = Array.isArray(o.products) ? o.products : [];
        const base = {};
        for (const p of prods) {
            const code = p.productCode || p.code;
            const qty = Number(p.quantity ?? p.qty) || 0;
            if (code && qty > 0) base[code] = (base[code] || 0) + qty;
        }
        // Anti-cheat: KHÔNG khóa base rỗng (chốt đơn lúc chưa có SP).
        if (!Object.keys(base).length) return { ok: false, reason: 'empty-order' };
        const upd = await pool.query(
            `UPDATE native_orders SET kpi_base = $2::jsonb, kpi_base_at = $3, kpi_base_by = $4
             WHERE id = $1 AND kpi_base IS NULL
             RETURNING code`,
            [o.id, JSON.stringify(base), Date.now(), byName || null]
        );
        if (!upd.rows.length) return { ok: false, reason: 'race-already-based' };
        console.log(`[NATIVE-ORDERS] KPI base locked: ${o.code} base=${JSON.stringify(base)}`);
        return { ok: true, code: o.code, base };
    } catch (e) {
        console.warn('[NATIVE-ORDERS] snapshotKpiBase fail:', e.message);
        return { ok: false, reason: e.message };
    }
}

// POST /:code/lock-kpi-base — CHỐT KPI THỦ CÔNG: khóa KPI base cho 1 đơn livestream
// (dùng khi chốt tại chỗ không qua gửi tin "Chốt đơn"). Cùng anti-cheat: 1 lần,
// đơn có ≥1 SP, bất biến. Body: { by? }.
// ⚠ CHỈ ADMIN: base bất biến (khóa sai = lệch KPI vĩnh viễn) → requireWeb2Admin.
router.post('/:code/lock-kpi-base', requireWeb2Admin, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await snapshotKpiBase(pool, {
            code: req.params.code,
            byName: req.web2User?.username || req.body?.by || req.body?._editor?.userName || null,
        });
        if (!r.ok) return res.status(400).json({ success: false, ...r });
        _notify('kpi-base-locked', r.code); // tab khác reload → pill KPI hết "chưa chốt"
        res.json({ success: true, ...r });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
module.exports.snapshotKpiBase = snapshotKpiBase;
module.exports.enrichOrdersTags = enrichOrdersTags;
module.exports.mapRowToOrder = mapRowToOrder;
