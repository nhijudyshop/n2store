// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Chấm công (admin).
// =====================================================================
// Chấm công Web 2.0 — quản lý dữ liệu máy chấm công vân tay DG-600.
//
// Kiến trúc: máy DG-600 đẩy punch (giờ vào/ra) qua agent chạy máy shop
//   (đọc LAN cổng 4370) HOẶC ADMS push (text/cdata) → POST vào route này.
//   Backend CHỈ lưu punch thô + cấu hình NV + điều chỉnh bảng lương; toàn bộ
//   tính giờ công / đi muộn / OT / lương do FRONTEND tính (web2/cham-cong).
//
// Nguồn NHÂN VIÊN: web2_users (map device_user_id → employee_id). Trang
//   chấm công gọi /api/web2-users/list để lấy danh sách NV gắn vào PIN máy.
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb (Web 2.0 — KHÔNG ghi Web 1.0).
// Realtime: web2:attendance (SSE). Auth: web UI = requireWeb2Admin; agent đẩy
//   dữ liệu = shared secret header x-web2-attendance-secret (env WEB2_ATTENDANCE_SECRET).
// Múi giờ: lưu TIMESTAMPTZ (UTC) — date_key tính theo GMT+7 (Asia/Ho_Chi_Minh).
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();
const { requireWeb2Admin } = require('../middleware/web2-auth');

const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

// ── SSE notifier ─────────────────────────────────────────────────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, extra) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:attendance', { action, ...(extra || {}), ts: now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-ATTENDANCE] _notify failed:', e.message);
    }
}

// ── Agent shared-secret gate (cho endpoint máy đẩy dữ liệu) ────────────────
// Có WEB2_ATTENDANCE_SECRET → bắt buộc khớp. Chưa set (dev/beta) → cho qua +
// warn 1 lần để nhắc cấu hình prod. KHÔNG dùng token user (agent không login).
let _secretWarned = false;
function requireAgentSecret(req, res, next) {
    const expected = String(process.env.WEB2_ATTENDANCE_SECRET || '').trim();
    if (!expected) {
        // FAIL-CLOSED (2026-06-26): thiếu secret → CHẶN ingest (trước đây MỞ → ai cũng
        // chèn punch). Dev/test muốn mở phải bật cờ tường minh WEB2_ATTENDANCE_ALLOW_OPEN=1.
        if (String(process.env.WEB2_ATTENDANCE_ALLOW_OPEN || '') === '1') {
            if (!_secretWarned) {
                _secretWarned = true;
                console.warn(
                    '[WEB2-ATTENDANCE] ALLOW_OPEN=1 → ingest MỞ không secret (CHỈ dev/beta).'
                );
            }
            return next();
        }
        if (!_secretWarned) {
            _secretWarned = true;
            console.error(
                '[WEB2-ATTENDANCE] WEB2_ATTENDANCE_SECRET chưa set → ingest BỊ CHẶN (fail-closed). Set secret, hoặc WEB2_ATTENDANCE_ALLOW_OPEN=1 cho dev.'
            );
        }
        return res
            .status(503)
            .json({ success: false, error: 'Ingest chấm công chưa cấu hình secret (server)' });
    }
    const got = String(
        req.headers['x-web2-attendance-secret'] || (req.query && req.query.secret) || ''
    ).trim();
    if (got && got === expected) return next();
    return res.status(401).json({ success: false, error: 'Sai secret agent chấm công' });
}

// ── Helpers ───────────────────────────────────────────────────────────────
const VN_TZ = 'Asia/Ho_Chi_Minh';
// date_key 'YYYY-MM-DD' theo GMT+7 từ 1 Date/ms/ISO. Dùng Intl để KHÔNG phụ thuộc
// TZ process (memory: Render chạy +7 nhưng không bảo đảm) — luôn ra lịch +7.
function dateKeyVN(input) {
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: VN_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
    return parts; // en-CA → 'YYYY-MM-DD'
}
// Parse 1 mốc thời gian punch về Date. Chấp nhận:
//   - epoch ms (number)
//   - ISO có hậu tố Z/offset → đúng instant
//   - 'YYYY-MM-DD HH:MM:SS' (naive, từ máy) = giờ LOCAL +7 → append +07:00.
function parsePunchTime(v) {
    if (v == null) return null;
    if (typeof v === 'number') return new Date(v);
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return new Date(Number(s));
    // Có timezone (Z hoặc ±hh:mm) → tin thẳng.
    if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    // Naive 'YYYY-MM-DD HH:MM:SS' hoặc 'YYYY-MM-DDTHH:MM:SS' → giờ +7.
    const iso = s.replace(' ', 'T');
    const d = new Date(`${iso}+07:00`);
    return isNaN(d.getTime()) ? null : d;
}
function ok(res, data) {
    return res.json({ success: true, ...data });
}
function fail(res, code, error) {
    return res.status(code).json({ success: false, error });
}
// Tên người sửa (audit) — quy ước CHUNG với commands/period-lock của route này.
const editorOf = (req) => req.web2User?.display_name || req.web2User?.username || 'admin';
// Đóng dấu "đã chỉnh sửa" cho 1 NGÀY của 1 NV (upsert: ai + lúc nào sửa lần cuối).
// Gọi SAU khi 1 thao tác TAY (đổi giờ Vào/Ra, thêm/xoá lượt, nghỉ phép, ghi chú) đã
// ghi DB thành công. Nuốt lỗi (audit phụ trợ — KHÔNG được làm hỏng mutation chính).
async function stampEdit(db, deviceUserId, dateKey, by) {
    const uid = String(deviceUserId || '').trim();
    const dk = String(dateKey || '').slice(0, 10);
    if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(dk)) return;
    try {
        await db.query(
            `INSERT INTO web2_attendance_edits (id, device_user_id, date_key, edited_by, edited_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET
                edited_by = EXCLUDED.edited_by,
                edited_at = EXCLUDED.edited_at`,
            [`${uid}_${dk}`, uid, dk, String(by || 'admin').slice(0, 120), now()]
        );
    } catch (e) {
        console.warn('[WEB2-ATTENDANCE] stampEdit failed:', e.message);
    }
}

// ── Schema (idempotent) ────────────────────────────────────────────────────
async function ensureSchema(pool) {
    if (!pool) return;
    await pool.query(`
        -- NV trên máy (PIN) → map sang web2_users (employee_id) + cấu hình lương/ca.
        CREATE TABLE IF NOT EXISTS web2_attendance_device_users (
            device_user_id        VARCHAR(64) PRIMARY KEY,
            uid                   VARCHAR(64),
            name                  VARCHAR(120),              -- tên trên máy
            display_name          VARCHAR(120),             -- tên hiển thị (sửa được)
            employee_id           INTEGER,                  -- web2_users.id (nullable)
            daily_rate            BIGINT  NOT NULL DEFAULT 200000,
            work_start            VARCHAR(5) NOT NULL DEFAULT '08:00',
            work_end              VARCHAR(5) NOT NULL DEFAULT '20:00', -- mốc kết ca = mốc OT
            late_penalty_per_min  BIGINT  NOT NULL DEFAULT 5000,
            ot_multiplier         NUMERIC NOT NULL DEFAULT 2,
            sunday_full           BOOLEAN NOT NULL DEFAULT FALSE,
            salary_type           VARCHAR(10) NOT NULL DEFAULT 'daily', -- 'daily' | 'monthly'
            grace_minutes         INTEGER NOT NULL DEFAULT 6,            -- dung sai vào/ra (phút)
            active                BOOLEAN NOT NULL DEFAULT TRUE,
            created_at            BIGINT  NOT NULL,
            updated_at            BIGINT  NOT NULL
        );
        ALTER TABLE web2_attendance_device_users ADD COLUMN IF NOT EXISTS salary_type VARCHAR(10) NOT NULL DEFAULT 'daily';
        ALTER TABLE web2_attendance_device_users ADD COLUMN IF NOT EXISTS grace_minutes INTEGER NOT NULL DEFAULT 6;
        -- Dung sai mặc định 5→6 (8h06/19h54 vẫn đúng giờ). Idempotent (beta): đổi default
        -- cột + bump các dòng còn ở mặc định cũ 5. Muốn chặt hơn 6 thì đặt 0-5 ở UI sau bump.
        ALTER TABLE web2_attendance_device_users ALTER COLUMN grace_minutes SET DEFAULT 6;
        UPDATE web2_attendance_device_users SET grace_minutes = 6 WHERE grace_minutes = 5;
        -- Punch thô từ máy. id = '{device_user_id}_{epoch_ms}' → idempotent.
        CREATE TABLE IF NOT EXISTS web2_attendance_records (
            id              VARCHAR(80) PRIMARY KEY,
            device_user_id  VARCHAR(64) NOT NULL,
            check_time      TIMESTAMPTZ NOT NULL,
            date_key        VARCHAR(10) NOT NULL,            -- YYYY-MM-DD (+7)
            type            SMALLINT NOT NULL DEFAULT 0,     -- 0=in 1=out 2=break-out 3=break-in 4=OT-in 5=OT-out
            verify_mode     SMALLINT,
            source          VARCHAR(16) NOT NULL DEFAULT 'agent', -- agent|adms|file|manual
            raw             TEXT,
            synced_at       BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2att_rec_date ON web2_attendance_records(date_key);
        CREATE INDEX IF NOT EXISTS idx_w2att_rec_user ON web2_attendance_records(device_user_id);
        CREATE INDEX IF NOT EXISTS idx_w2att_rec_dk_user ON web2_attendance_records(date_key, device_user_id);
        -- Điều chỉnh bảng lương tháng (thưởng/giảm trừ/đã trả/phụ cấp/ghi chú + override).
        CREATE TABLE IF NOT EXISTS web2_attendance_payroll (
            id                       VARCHAR(80) PRIMARY KEY, -- '{emp_id}_{YYYY-MM}'
            emp_id                   VARCHAR(64) NOT NULL,
            month_key                VARCHAR(7)  NOT NULL,
            thuong_items             JSONB NOT NULL DEFAULT '[]'::jsonb,
            giam_tru_items           JSONB NOT NULL DEFAULT '[]'::jsonb,
            da_tra_items             JSONB NOT NULL DEFAULT '[]'::jsonb,
            allowances               JSONB NOT NULL DEFAULT '[]'::jsonb,
            ghi_chu                  TEXT,
            salary_days_override     NUMERIC,
            ot_hours_override        NUMERIC,
            lam_them_override        NUMERIC,
            giam_tru_late_override   BIGINT,
            updated_at               BIGINT NOT NULL
        );
        ALTER TABLE web2_attendance_payroll ADD COLUMN IF NOT EXISTS lam_them_override NUMERIC;
        -- Ngày công đủ (full) override thủ công (vd nghỉ phép có lương / lỗi máy).
        CREATE TABLE IF NOT EXISTS web2_attendance_fullday (
            id          VARCHAR(80) PRIMARY KEY, -- '{emp_id}_{date_key}'
            emp_id      VARCHAR(64) NOT NULL,
            date_key    VARCHAR(10) NOT NULL,
            created_at  BIGINT NOT NULL
        );
        -- Ngày shop nghỉ (không tính vắng).
        CREATE TABLE IF NOT EXISTS web2_attendance_holidays (
            date_key    VARCHAR(10) PRIMARY KEY,
            note        TEXT,
            created_at  BIGINT NOT NULL
        );
        -- Ghi chú theo NGÀY cho từng NV (hiện ở popup ngày + bảng lương chi tiết).
        CREATE TABLE IF NOT EXISTS web2_attendance_day_notes (
            id              VARCHAR(96) PRIMARY KEY, -- '{device_user_id}_{date_key}'
            device_user_id  VARCHAR(64) NOT NULL,
            date_key        VARCHAR(10) NOT NULL,
            note            TEXT,
            updated_at      BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2att_note_date ON web2_attendance_day_notes(date_key);
        CREATE INDEX IF NOT EXISTS idx_w2att_note_user ON web2_attendance_day_notes(device_user_id);
        -- Audit chỉnh sửa thủ công theo NGÀY/NV: ai + lúc nào sửa chấm công 1 ngày.
        -- 1 dòng / (device_user_id, date_key); upsert mỗi lần admin sửa qua popup ngày
        -- (đổi giờ Vào/Ra, thêm/xoá lượt, nghỉ phép, ghi chú). KHÔNG ghi cho punch máy
        -- (agent/ADMS) hay import file — chỉ thao tác TAY của người dùng.
        CREATE TABLE IF NOT EXISTS web2_attendance_edits (
            id              VARCHAR(96) PRIMARY KEY, -- '{device_user_id}_{date_key}'
            device_user_id  VARCHAR(64) NOT NULL,
            date_key        VARCHAR(10) NOT NULL,
            edited_by       VARCHAR(120),
            edited_at       BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2att_edit_date ON web2_attendance_edits(date_key);
        -- Trạng thái đồng bộ agent (1 dòng id='current').
        CREATE TABLE IF NOT EXISTS web2_attendance_sync_status (
            id              VARCHAR(20) PRIMARY KEY,
            connected       BOOLEAN NOT NULL DEFAULT FALSE,
            last_sync_time  TIMESTAMPTZ,
            last_error      TEXT,
            device_count    INTEGER NOT NULL DEFAULT 0,
            record_count    INTEGER NOT NULL DEFAULT 0,
            updated_at      BIGINT NOT NULL
        );
        -- Lệnh từ web → agent (vd sync_now / re-pull).
        CREATE TABLE IF NOT EXISTS web2_attendance_commands (
            id              SERIAL PRIMARY KEY,
            action          VARCHAR(40) NOT NULL,
            status          VARCHAR(20) NOT NULL DEFAULT 'pending',
            device_user_id  VARCHAR(64),
            created_by      VARCHAR(120),
            result          TEXT,
            created_at      BIGINT NOT NULL,
            processed_at    BIGINT
        );
        -- Chốt lương kỳ (khoá tháng): snapshot bảng lương ĐÃ tính (frontend gửi lên)
        -- + ai/khi nào chốt. Tháng đã khoá → render từ snapshot, chặn sửa.
        CREATE TABLE IF NOT EXISTS web2_attendance_period_lock (
            month_key   VARCHAR(7) PRIMARY KEY,
            locked_by   VARCHAR(120),
            locked_at   BIGINT NOT NULL,
            snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb
        );
    `);
}

// =====================================================================
// DEVICE USERS (NV trên máy)
// =====================================================================

// GET /device-users — danh sách NV máy + cấu hình lương/ca (admin).
router.get('/device-users', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(
            `SELECT * FROM web2_attendance_device_users ORDER BY display_name NULLS LAST, name NULLS LAST, device_user_id`
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] device-users list:', e.message);
        return fail(res, 500, e.message);
    }
});

// POST /device-users/bulk — agent upsert NV từ máy (secret).
router.post('/device-users/bulk', requireAgentSecret, async (req, res) => {
    try {
        const db = getDb(req);
        const users = Array.isArray(req.body?.users) ? req.body.users : [];
        if (!users.length) return ok(res, { upserted: 0 });
        const t = now();
        let upserted = 0;
        for (const u of users) {
            const id = String(u.user_id ?? u.uid ?? '').trim();
            if (!id || id === '0') continue;
            // Upsert: KHÔNG đè display_name/employee_id/cấu hình lương admin đã chỉnh.
            await db.query(
                `INSERT INTO web2_attendance_device_users
                    (device_user_id, uid, name, display_name, created_at, updated_at)
                 VALUES ($1,$2,$3,$3,$4,$4)
                 ON CONFLICT (device_user_id) DO UPDATE SET
                    uid = EXCLUDED.uid,
                    name = EXCLUDED.name,
                    updated_at = EXCLUDED.updated_at`,
                [id, String(u.uid ?? id), u.name ? String(u.name).slice(0, 120) : null, t]
            );
            upserted++;
        }
        _notify('device-users', { upserted });
        return ok(res, { upserted });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] device-users bulk:', e.message);
        return fail(res, 500, e.message);
    }
});

// POST /device-users — tạo NV THỦ CÔNG (admin), cho người KHÔNG bấm máy DG-600.
// PIN tự sinh 'MANUAL-<base36 thời gian>' để phân biệt với PIN máy thật. Sau đó
// admin gán NV + nhập số công (qua popup ngày / override bảng lương) như NV máy.
router.post('/device-users', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const b = req.body || {};
        const displayName = String(b.displayName || b.display_name || '').trim();
        if (!displayName) return fail(res, 400, 'Cần Tên hiển thị');
        const t = now();
        const id = 'MANUAL-' + t.toString(36) + Math.floor(t % 1000).toString(36);
        // NV thủ công mặc định tính LƯƠNG THÁNG (thường trả tháng), đổi được qua dropdown.
        const salaryType = b.salary_type === 'daily' ? 'daily' : 'monthly';
        const r = await db.query(
            `INSERT INTO web2_attendance_device_users
                (device_user_id, uid, name, display_name, employee_id, daily_rate,
                 work_start, work_end, late_penalty_per_min, ot_multiplier, salary_type, grace_minutes, active, created_at, updated_at)
             VALUES ($1,$1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$11)
             RETURNING *`,
            [
                id,
                displayName,
                b.employee_id != null && b.employee_id !== '' ? b.employee_id : null,
                Number(b.daily_rate) || 0,
                b.work_start || '08:00',
                b.work_end || '20:00',
                Number(b.late_penalty_per_min) || 0,
                b.ot_multiplier != null ? Number(b.ot_multiplier) : 2,
                salaryType,
                b.grace_minutes != null ? Number(b.grace_minutes) : 6,
                t,
            ]
        );
        _notify('device-users', { id, manual: true });
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] device-users create:', e.message);
        return fail(res, 500, e.message);
    }
});

// DELETE /device-users/:id — xoá NV THỦ CÔNG (admin). CHỈ cho phép PIN 'MANUAL-*'
// (PIN máy thật không xoá — để tránh mất dữ liệu máy; muốn ẩn thì tắt "Bật").
// Dọn luôn punch/ghi chú/bảng lương/ngày-công của PIN thủ công đó.
router.delete('/device-users/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = String(req.params.id);
        if (!id.startsWith('MANUAL-'))
            return fail(res, 400, 'Chỉ xoá được NV thủ công (PIN máy thật chỉ có thể tắt "Bật").');
        await db.query(`DELETE FROM web2_attendance_records WHERE device_user_id = $1`, [id]);
        await db.query(`DELETE FROM web2_attendance_day_notes WHERE device_user_id = $1`, [id]);
        await db.query(`DELETE FROM web2_attendance_payroll WHERE emp_id = $1`, [id]);
        await db.query(`DELETE FROM web2_attendance_fullday WHERE emp_id = $1`, [id]);
        await db.query(`DELETE FROM web2_attendance_edits WHERE device_user_id = $1`, [id]);
        const r = await db.query(
            `DELETE FROM web2_attendance_device_users WHERE device_user_id = $1 RETURNING device_user_id`,
            [id]
        );
        if (!r.rows.length) return fail(res, 404, 'Không tìm thấy NV');
        _notify('device-users', { id, deleted: true });
        return ok(res, {});
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] device-users delete:', e.message);
        return fail(res, 500, e.message);
    }
});

// PATCH /device-users/:id — sửa cấu hình NV (admin).
router.patch('/device-users/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = String(req.params.id);
        const b = req.body || {};
        const sets = [];
        const vals = [];
        let i = 1;
        const map = {
            display_name: 'display_name',
            employee_id: 'employee_id',
            daily_rate: 'daily_rate',
            work_start: 'work_start',
            work_end: 'work_end',
            late_penalty_per_min: 'late_penalty_per_min',
            ot_multiplier: 'ot_multiplier',
            sunday_full: 'sunday_full',
            salary_type: 'salary_type',
            grace_minutes: 'grace_minutes',
            active: 'active',
        };
        for (const [k, col] of Object.entries(map)) {
            if (b[k] !== undefined) {
                sets.push(`${col} = $${i++}`);
                vals.push(b[k] === '' ? null : b[k]);
            }
        }
        if (!sets.length) return fail(res, 400, 'Không có trường cập nhật');
        sets.push(`updated_at = $${i++}`);
        vals.push(now());
        vals.push(id);
        const r = await db.query(
            `UPDATE web2_attendance_device_users SET ${sets.join(', ')} WHERE device_user_id = $${i} RETURNING *`,
            vals
        );
        if (!r.rows.length) return fail(res, 404, 'Không tìm thấy NV máy');
        _notify('device-users', { id });
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] device-users patch:', e.message);
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// RECORDS (punch)
// =====================================================================

// GET /records?start=YYYY-MM-DD&end=YYYY-MM-DD (admin).
router.get('/records', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const start = String(req.query.start || '').slice(0, 10);
        const end = String(req.query.end || '').slice(0, 10);
        const params = [];
        let where = '';
        if (start && end) {
            where = `WHERE date_key >= $1 AND date_key <= $2`;
            params.push(start, end);
        } else if (start) {
            where = `WHERE date_key >= $1`;
            params.push(start);
        }
        const r = await db.query(
            `SELECT id, device_user_id, check_time, date_key, type, verify_mode, source
                 FROM web2_attendance_records ${where}
              ORDER BY check_time ASC`,
            params
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] records list:', e.message);
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// DAY NOTES (ghi chú theo ngày cho từng NV)
// =====================================================================

// GET /day-notes?start=YYYY-MM-DD&end=YYYY-MM-DD (admin).
router.get('/day-notes', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const start = String(req.query.start || '').slice(0, 10);
        const end = String(req.query.end || '').slice(0, 10);
        const params = [];
        let where = '';
        if (start && end) {
            where = `WHERE date_key >= $1 AND date_key <= $2`;
            params.push(start, end);
        } else if (start) {
            where = `WHERE date_key >= $1`;
            params.push(start);
        }
        const r = await db.query(
            `SELECT id, device_user_id, date_key, note FROM web2_attendance_day_notes ${where}`,
            params
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] day-notes list:', e.message);
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// EDIT AUDIT (ai + lúc nào sửa chấm công 1 ngày)
// =====================================================================

// GET /edits?start=YYYY-MM-DD&end=YYYY-MM-DD (admin) — dấu thời gian chỉnh sửa tay
// theo ngày/NV để hiện "Đã chỉnh sửa: HH:MM DD/MM bởi <ai>" ở popup ngày + ô lưới.
router.get('/edits', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const start = String(req.query.start || '').slice(0, 10);
        const end = String(req.query.end || '').slice(0, 10);
        const params = [];
        let where = '';
        if (start && end) {
            where = `WHERE date_key >= $1 AND date_key <= $2`;
            params.push(start, end);
        } else if (start) {
            where = `WHERE date_key >= $1`;
            params.push(start);
        }
        const r = await db.query(
            `SELECT id, device_user_id, date_key, edited_by, edited_at
                 FROM web2_attendance_edits ${where}`,
            params
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] edits list:', e.message);
        return fail(res, 500, e.message);
    }
});

// PUT /day-notes/:id — upsert ghi chú 1 ngày (id = '{device_user_id}_{date_key}').
// note rỗng → xoá dòng (giữ bảng sạch). (admin)
router.put('/day-notes/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = String(req.params.id);
        const note = String((req.body || {}).note || '').trim();
        // id dạng '{device_user_id}_{YYYY-MM-DD}' → tách date_key 10 ký tự cuối.
        const dateKey = id.slice(-10);
        const deviceUserId = id.slice(0, -11); // bỏ '_YYYY-MM-DD'
        if (!deviceUserId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
            return fail(res, 400, 'id ghi chú không hợp lệ');
        if (!note) {
            await db.query(`DELETE FROM web2_attendance_day_notes WHERE id = $1`, [id]);
            await stampEdit(db, deviceUserId, dateKey, editorOf(req));
            _notify('day-note', { id });
            return ok(res, { deleted: true });
        }
        await db.query(
            `INSERT INTO web2_attendance_day_notes (id, device_user_id, date_key, note, updated_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
            [id, deviceUserId, dateKey, note.slice(0, 1000), now()]
        );
        await stampEdit(db, deviceUserId, dateKey, editorOf(req));
        _notify('day-note', { id });
        return ok(res, {});
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] day-notes put:', e.message);
        return fail(res, 500, e.message);
    }
});

// Upsert 1 batch punch. Trả số dòng thực sự ghi. Dùng chung agent + import + manual.
// Tự tạo dòng web2_attendance_device_users tối thiểu cho mỗi PIN mới gặp → punch
// nhập tay/ADMS/import HIỆN ngay trong bảng công (không cần agent đẩy device-users).
// FIX audit R3 (#2): khoá kỳ lương PHẢI enforce SERVER-SIDE. Trước chỉ chặn ở frontend
// (state.lock của tháng đang xem) → tab cũ/khác tháng/API trực tiếp vẫn sửa được punch/
// payroll/fullday/holiday của tháng ĐÃ CHỐT → mở khoá lại số liệu lệch snapshot đã duyệt.
async function isMonthLocked(db, monthKey) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return false;
    try {
        const r = await db.query(
            `SELECT 1 FROM web2_attendance_period_lock WHERE month_key = $1 LIMIT 1`,
            [monthKey]
        );
        return r.rows.length > 0;
    } catch {
        return false; // bảng chưa tồn tại / lỗi đọc → không chặn (fail-open an toàn)
    }
}
const LOCK_MSG = (mk) => `Kỳ lương ${mk} đã CHỐT (khoá) — mở khoá kỳ trước khi sửa.`;

async function insertRecords(db, rows, source) {
    let inserted = 0;
    const seenUids = new Set();
    const minTs = new Date('2020-01-01').getTime();
    const maxTs = now() + 36 * 60 * 60 * 1000; // không nhận tương lai > 36h
    for (const rec of rows) {
        const uid = String(rec.device_user_id ?? rec.deviceUserId ?? rec.pin ?? '').trim();
        if (!uid || uid === '0') continue;
        seenUids.add(uid);
        const dt = parsePunchTime(rec.check_time ?? rec.checkTime ?? rec.recordTime ?? rec.time);
        if (!dt) continue;
        const ms = dt.getTime();
        if (ms < minTs || ms > maxTs) continue;
        const id = rec.id && String(rec.id).includes('_') ? String(rec.id) : `${uid}_${ms}`;
        const dk = dateKeyVN(dt);
        const type = Number.isFinite(Number(rec.type)) ? Number(rec.type) : 0;
        const verify = rec.verify_mode != null ? Number(rec.verify_mode) : null;
        await db.query(
            `INSERT INTO web2_attendance_records
                (id, device_user_id, check_time, date_key, type, verify_mode, source, raw, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO UPDATE SET
                check_time = EXCLUDED.check_time,
                date_key = EXCLUDED.date_key,
                type = EXCLUDED.type,
                verify_mode = COALESCE(EXCLUDED.verify_mode, web2_attendance_records.verify_mode),
                synced_at = EXCLUDED.synced_at`,
            [
                id,
                uid,
                dt.toISOString(),
                dk,
                type,
                verify,
                source,
                rec.raw ? String(rec.raw).slice(0, 500) : null,
                now(),
            ]
        );
        inserted++;
    }
    // Tạo dòng device-user tối thiểu cho PIN mới (idempotent — KHÔNG đè tên/cấu hình
    // admin đã chỉnh; agent /device-users/bulk sẽ bổ sung tên máy sau).
    if (inserted && seenUids.size) {
        const t = now();
        for (const uid of seenUids) {
            await db
                .query(
                    `INSERT INTO web2_attendance_device_users (device_user_id, uid, created_at, updated_at)
                     VALUES ($1,$1,$2,$2) ON CONFLICT (device_user_id) DO NOTHING`,
                    [uid, t]
                )
                .catch(() => {});
        }
    }
    return inserted;
}

// Đánh dấu agent ĐANG KẾT NỐI (gọi từ ADMS route khi máy bắt tay / đẩy punch).
// ADMS proxy KHÔNG gọi PUT /sync-status nên nếu thiếu hàm này trang Chấm công sẽ
// luôn hiện "Chưa đồng bộ" dù máy vẫn đang đẩy. Fire-and-forget, nuốt lỗi.
async function touchAdmsStatus(db) {
    try {
        await db.query(
            `INSERT INTO web2_attendance_sync_status
                (id, connected, last_sync_time, last_error, device_count, record_count, updated_at)
             VALUES ('current', TRUE, now(), NULL, 0, 0, $1)
             ON CONFLICT (id) DO UPDATE SET
                connected = TRUE,
                last_sync_time = now(),
                last_error = NULL,
                updated_at = $1`,
            [now()]
        );
    } catch (_) {}
}

// POST /records/bulk — agent ingest (secret).
router.post('/records/bulk', requireAgentSecret, async (req, res) => {
    try {
        const db = getDb(req);
        const rows = Array.isArray(req.body?.records) ? req.body.records : [];
        const inserted = await insertRecords(db, rows, 'agent');
        if (inserted) _notify('records', { inserted, source: 'agent' });
        return ok(res, { inserted });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] records bulk:', e.message);
        return fail(res, 500, e.message);
    }
});

// POST /records/import — admin nhập file Excel/TXT (frontend parse → rows).
router.post('/records/import', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const rows = Array.isArray(req.body?.records) ? req.body.records : [];
        if (!rows.length) return fail(res, 400, 'Không có dòng nào để nhập');
        const inserted = await insertRecords(db, rows, 'file');
        if (inserted) _notify('records', { inserted, source: 'file' });
        return ok(res, { inserted, total: rows.length });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] records import:', e.message);
        return fail(res, 500, e.message);
    }
});

// POST /records — admin thêm tay 1 punch.
router.post('/records', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const b = req.body || {};
        const _dt = parsePunchTime(b.check_time ?? b.checkTime ?? b.recordTime ?? b.time);
        const _mk = _dt ? dateKeyVN(_dt).slice(0, 7) : null;
        if (_mk && (await isMonthLocked(db, _mk))) return fail(res, 409, LOCK_MSG(_mk));
        const inserted = await insertRecords(db, [b], 'manual');
        if (!inserted) return fail(res, 400, 'Dữ liệu punch không hợp lệ');
        // Audit: ai + lúc nào sửa ngày này (dùng date_key +7 từ giờ punch).
        const _uid = String(b.device_user_id ?? b.deviceUserId ?? b.pin ?? '').trim();
        if (_uid && _dt) await stampEdit(db, _uid, dateKeyVN(_dt), editorOf(req));
        _notify('records', { inserted, source: 'manual' });
        return ok(res, { inserted });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] records add:', e.message);
        return fail(res, 500, e.message);
    }
});

// DELETE /records/clear-all — admin xoá hết + queue lệnh re-sync cho agent.
// ⚠ PHẢI khai báo TRƯỚC '/records/:id' — nếu không Express khớp ':id'='clear-all'.
router.delete('/records/clear-all', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        await db.query(`DELETE FROM web2_attendance_records`);
        await db.query(
            `INSERT INTO web2_attendance_commands (action, device_user_id, created_by, created_at)
             VALUES ('resync', NULL, $1, $2)`,
            [req.web2User?.display_name || req.web2User?.username || 'admin', now()]
        );
        _notify('records', { clearedAll: true });
        return ok(res, {});
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] records clear-all:', e.message);
        return fail(res, 500, e.message);
    }
});

// DELETE /records/:id — admin xoá 1 punch.
router.delete('/records/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const _id = String(req.params.id);
        const _rec = await db.query(
            `SELECT date_key, device_user_id FROM web2_attendance_records WHERE id = $1`,
            [_id]
        );
        const _row = _rec.rows[0];
        const _mk = _row?.date_key ? String(_row.date_key).slice(0, 7) : null;
        if (_mk && (await isMonthLocked(db, _mk))) return fail(res, 409, LOCK_MSG(_mk));
        await db.query(`DELETE FROM web2_attendance_records WHERE id = $1`, [_id]);
        if (_row?.device_user_id && _row?.date_key)
            await stampEdit(db, _row.device_user_id, _row.date_key, editorOf(req));
        _notify('records', { deleted: req.params.id });
        return ok(res, {});
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] records delete:', e.message);
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// PAYROLL (điều chỉnh tháng)
// =====================================================================

// GET /payroll?monthKey=YYYY-MM (admin).
router.get('/payroll', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const monthKey = String(req.query.monthKey || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(monthKey)) return fail(res, 400, 'monthKey không hợp lệ');
        const r = await db.query(`SELECT * FROM web2_attendance_payroll WHERE month_key = $1`, [
            monthKey,
        ]);
        return ok(res, { items: r.rows });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] payroll get:', e.message);
        return fail(res, 500, e.message);
    }
});

// PUT /payroll/:id — merge update bảng lương tháng (admin). id = '{emp}_{YYYY-MM}'.
router.put('/payroll/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = String(req.params.id);
        const m = id.match(/^(.+)_(\d{4}-\d{2})$/);
        if (!m) return fail(res, 400, 'id bảng lương không hợp lệ');
        const empId = m[1];
        const monthKey = m[2];
        if (await isMonthLocked(db, monthKey)) return fail(res, 409, LOCK_MSG(monthKey));
        const b = req.body || {};
        const r = await db.query(
            `INSERT INTO web2_attendance_payroll
                (id, emp_id, month_key, thuong_items, giam_tru_items, da_tra_items, allowances,
                 ghi_chu, salary_days_override, ot_hours_override, lam_them_override, giam_tru_late_override, updated_at)
             VALUES ($1,$2,$3,
                 COALESCE($4::jsonb,'[]'::jsonb), COALESCE($5::jsonb,'[]'::jsonb),
                 COALESCE($6::jsonb,'[]'::jsonb), COALESCE($7::jsonb,'[]'::jsonb),
                 $8,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO UPDATE SET
                thuong_items   = COALESCE($4::jsonb, web2_attendance_payroll.thuong_items),
                giam_tru_items = COALESCE($5::jsonb, web2_attendance_payroll.giam_tru_items),
                da_tra_items   = COALESCE($6::jsonb, web2_attendance_payroll.da_tra_items),
                allowances     = COALESCE($7::jsonb, web2_attendance_payroll.allowances),
                ghi_chu        = COALESCE($8, web2_attendance_payroll.ghi_chu),
                salary_days_override   = $9,
                ot_hours_override      = $10,
                lam_them_override      = $11,
                giam_tru_late_override = $12,
                updated_at = $13
             RETURNING *`,
            [
                id,
                empId,
                monthKey,
                b.thuongItems ? JSON.stringify(b.thuongItems) : null,
                b.giamTruItems ? JSON.stringify(b.giamTruItems) : null,
                b.daTraItems ? JSON.stringify(b.daTraItems) : null,
                b.allowances ? JSON.stringify(b.allowances) : null,
                b.ghiChu !== undefined ? b.ghiChu : null,
                b.salaryDaysOverride ?? null,
                b.otHoursOverride ?? null,
                b.lamThemOverride ?? null,
                b.giamTruLateOverride ?? null,
                now(),
            ]
        );
        _notify('payroll', { id, monthKey });
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        console.error('[WEB2-ATTENDANCE] payroll put:', e.message);
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// FULLDAY override + HOLIDAYS
// =====================================================================

router.get('/fullday', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(`SELECT id, emp_id, date_key FROM web2_attendance_fullday`);
        return ok(res, { items: r.rows });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.post('/fullday', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const empId = String(req.body?.empId || '').trim();
        const dateKey = String(req.body?.dateKey || '').slice(0, 10);
        if (!empId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
            return fail(res, 400, 'empId/dateKey không hợp lệ');
        if (await isMonthLocked(db, dateKey.slice(0, 7)))
            return fail(res, 409, LOCK_MSG(dateKey.slice(0, 7)));
        const id = `${empId}_${dateKey}`;
        const _ins = await db.query(
            `INSERT INTO web2_attendance_fullday (id, emp_id, date_key, created_at)
             VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING
             RETURNING id`,
            [id, empId, dateKey, now()]
        );
        // Chỉ đóng dấu "đã chỉnh sửa" khi THỰC SỰ thêm dòng mới (DO NOTHING → 0 dòng
        // nếu ngày đã là công đủ) → re-set trùng không tạo audit giả.
        if (_ins.rowCount) await stampEdit(db, empId, dateKey, editorOf(req));
        _notify('fullday', { id });
        return ok(res, { id });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.delete('/fullday/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const _fid = String(req.params.id);
        const _fdk = _fid.slice(-10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(_fdk) && (await isMonthLocked(db, _fdk.slice(0, 7))))
            return fail(res, 409, LOCK_MSG(_fdk.slice(0, 7)));
        await db.query(`DELETE FROM web2_attendance_fullday WHERE id = $1`, [_fid]);
        // id = '{emp_id}_{date_key}' → tách để đóng dấu chỉnh sửa.
        if (/^\d{4}-\d{2}-\d{2}$/.test(_fdk))
            await stampEdit(db, _fid.slice(0, -11), _fdk, editorOf(req));
        _notify('fullday', { deleted: req.params.id });
        return ok(res, {});
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.get('/holidays', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(
            `SELECT date_key, note FROM web2_attendance_holidays ORDER BY date_key`
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.post('/holidays', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const dateKey = String(req.body?.dateKey || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return fail(res, 400, 'dateKey không hợp lệ');
        if (await isMonthLocked(db, dateKey.slice(0, 7)))
            return fail(res, 409, LOCK_MSG(dateKey.slice(0, 7)));
        await db.query(
            `INSERT INTO web2_attendance_holidays (date_key, note, created_at)
             VALUES ($1,$2,$3) ON CONFLICT (date_key) DO UPDATE SET note = EXCLUDED.note`,
            [dateKey, req.body?.note ? String(req.body.note).slice(0, 200) : null, now()]
        );
        _notify('holidays', { dateKey });
        return ok(res, { dateKey });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.delete('/holidays/:dateKey', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const _hdk = String(req.params.dateKey).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(_hdk) && (await isMonthLocked(db, _hdk.slice(0, 7))))
            return fail(res, 409, LOCK_MSG(_hdk.slice(0, 7)));
        await db.query(`DELETE FROM web2_attendance_holidays WHERE date_key = $1`, [_hdk]);
        _notify('holidays', { deleted: req.params.dateKey });
        return ok(res, {});
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// SYNC STATUS + COMMANDS (agent ↔ web)
// =====================================================================

router.get('/sync-status', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(`SELECT * FROM web2_attendance_sync_status WHERE id = 'current'`);
        return ok(res, { status: r.rows[0] || null });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

// ADMIN-ONLY: trả secret agent (từ env Render, KHÔNG có trong repo) để trang Cài đặt
// nhúng vào config.json của bộ cài 1-click. Chỉ admin đăng nhập mới lấy được → secret
// KHÔNG bao giờ nằm trong mã nguồn public / GitHub.
router.get('/agent-secret', requireWeb2Admin, (req, res) => {
    const secret = String(process.env.WEB2_ATTENDANCE_SECRET || '').trim();
    return ok(res, { secret, configured: !!secret });
});

// ── Chốt lương kỳ (khoá tháng) — snapshot bảng lương + ai/khi nào ────────
const MK_RE = /^\d{4}-\d{2}$/;
router.get('/period-lock', requireWeb2Admin, async (req, res) => {
    try {
        const mk = String(req.query.monthKey || '').trim();
        if (!MK_RE.test(mk)) return fail(res, 400, 'monthKey không hợp lệ');
        const r = await getDb(req).query(
            `SELECT month_key, locked_by, locked_at, snapshot
               FROM web2_attendance_period_lock WHERE month_key=$1`,
            [mk]
        );
        return ok(res, { locked: r.rows.length > 0, lock: r.rows[0] || null });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});
// Validate snapshot bảng lương client gửi khi CHỐT (admin-only nên rủi ro thấp, nhưng
// fail-fast với client lỗi/bịa). Chặn NaN/∞/số khổng lồ + nhất quán nội bộ mỗi dòng.
// ⚠ Công thức phải KHỚP cham-cong-salary.js:238 (tongLuong) & :239 (conCanTra) — sửa 1 nơi nhớ nơi kia.
function validateLockSnapshot(snap, mk) {
    if (!snap || typeof snap !== 'object') return 'snapshot rỗng';
    if (snap.monthKey && String(snap.monthKey) !== mk) return 'monthKey lệch';
    const rows = snap.rows;
    if (!Array.isArray(rows)) return 'thiếu rows';
    const fin = (n) => Number.isFinite(Number(n));
    const CAP = 1e12; // 1 nghìn tỷ — chặn số bịa khổng lồ
    const FIELDS = [
        'luongChinh',
        'lamThem',
        'phuCap',
        'thuong',
        'giamTru',
        'tongLuong',
        'daTra',
        'conCanTra',
    ];
    for (const row of rows) {
        const m = row && row.m;
        if (!m || typeof m !== 'object') return 'row thiếu m';
        for (const k of FIELDS) {
            if (m[k] != null && (!fin(m[k]) || Math.abs(Number(m[k])) > CAP))
                return `${k} không hợp lệ`;
        }
        const num = (x) => Number(x) || 0;
        const expTong =
            num(m.luongChinh) + num(m.lamThem) + num(m.phuCap) + num(m.thuong) - num(m.giamTru);
        if (fin(m.tongLuong) && Math.abs(num(m.tongLuong) - expTong) > 2)
            return 'tongLuong không khớp các khoản';
        if (fin(m.conCanTra) && Math.abs(num(m.conCanTra) - (num(m.tongLuong) - num(m.daTra))) > 2)
            return 'conCanTra không khớp';
    }
    return null;
}

router.post('/period-lock', requireWeb2Admin, async (req, res) => {
    try {
        const b = req.body || {};
        const mk = String(b.monthKey || '').trim();
        if (!MK_RE.test(mk)) return fail(res, 400, 'monthKey không hợp lệ');
        const snapshot = b.snapshot && typeof b.snapshot === 'object' ? b.snapshot : {};
        const vErr = validateLockSnapshot(snapshot, mk);
        if (vErr) return fail(res, 400, 'Snapshot lương không hợp lệ: ' + vErr);
        const by = req.web2User?.display_name || req.web2User?.username || 'admin';
        const t = now();
        await getDb(req).query(
            `INSERT INTO web2_attendance_period_lock (month_key, locked_by, locked_at, snapshot)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (month_key) DO UPDATE SET
                locked_by=EXCLUDED.locked_by, locked_at=EXCLUDED.locked_at, snapshot=EXCLUDED.snapshot`,
            [mk, by, t, JSON.stringify(snapshot)]
        );
        _notify('period-lock', { monthKey: mk, locked: true });
        return ok(res, { locked: true, locked_by: by, locked_at: t });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});
router.delete('/period-lock/:monthKey', requireWeb2Admin, async (req, res) => {
    try {
        const mk = String(req.params.monthKey || '').trim();
        if (!MK_RE.test(mk)) return fail(res, 400, 'monthKey không hợp lệ');
        await getDb(req).query('DELETE FROM web2_attendance_period_lock WHERE month_key=$1', [mk]);
        _notify('period-lock', { monthKey: mk, locked: false });
        return ok(res, { unlocked: true });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.put('/sync-status', requireAgentSecret, async (req, res) => {
    try {
        const db = getDb(req);
        const b = req.body || {};
        const last = b.last_sync_time ? new Date(b.last_sync_time) : null;
        await db.query(
            `INSERT INTO web2_attendance_sync_status
                (id, connected, last_sync_time, last_error, device_count, record_count, updated_at)
             VALUES ('current',$1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE SET
                connected = EXCLUDED.connected,
                last_sync_time = COALESCE(EXCLUDED.last_sync_time, web2_attendance_sync_status.last_sync_time),
                last_error = EXCLUDED.last_error,
                device_count = COALESCE(EXCLUDED.device_count, web2_attendance_sync_status.device_count),
                record_count = COALESCE(EXCLUDED.record_count, web2_attendance_sync_status.record_count),
                updated_at = EXCLUDED.updated_at`,
            [
                b.connected === true,
                last && !isNaN(last.getTime()) ? last.toISOString() : null,
                b.last_error ? String(b.last_error).slice(0, 500) : null,
                Number.isFinite(Number(b.device_count)) ? Number(b.device_count) : null,
                Number.isFinite(Number(b.record_count)) ? Number(b.record_count) : null,
                now(),
            ]
        );
        _notify('sync', { connected: b.connected === true });
        return ok(res, {});
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.post('/commands', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const action = String(req.body?.action || '')
            .trim()
            .slice(0, 40);
        if (!action) return fail(res, 400, 'Thiếu action');
        const r = await db.query(
            `INSERT INTO web2_attendance_commands (action, device_user_id, created_by, created_at)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [
                action,
                req.body?.deviceUserId ? String(req.body.deviceUserId) : null,
                req.web2User?.display_name || req.web2User?.username || 'admin',
                now(),
            ]
        );
        return ok(res, { id: r.rows[0].id });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.get('/commands/pending', requireAgentSecret, async (req, res) => {
    try {
        const db = getDb(req);
        // Atomic claim — FOR UPDATE SKIP LOCKED tránh 2 agent nhận trùng.
        const r = await db.query(
            `UPDATE web2_attendance_commands SET status = 'processing'
              WHERE id IN (
                SELECT id FROM web2_attendance_commands WHERE status = 'pending'
                 ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 10
              ) RETURNING id, action, device_user_id`
        );
        return ok(res, { commands: r.rows });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.patch('/commands/:id', requireAgentSecret, async (req, res) => {
    try {
        const db = getDb(req);
        const status = String(req.body?.status || 'completed').slice(0, 20);
        await db.query(
            `UPDATE web2_attendance_commands SET status = $1, result = $2, processed_at = $3 WHERE id = $4`,
            [
                status,
                req.body?.result ? String(req.body.result).slice(0, 500) : null,
                now(),
                Number(req.params.id),
            ]
        );
        return ok(res, {});
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.ensureSchema = ensureSchema;
module.exports.insertRecords = insertRecords;
module.exports.touchAdmsStatus = touchAdmsStatus;
module.exports.dateKeyVN = dateKeyVN;
module.exports.parsePunchTime = parsePunchTime;
