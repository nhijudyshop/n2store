// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Tra cứu vận đơn J&T (báo cáo).
// =====================================================================
// Tra cứu + quản lý trạng thái giao hàng J&T Express VN cho Web 2.0.
//
// Nguồn mã vận đơn (12 số): (a) quét tin nhắn Zalo (web2_zalo_messages),
//   (b) dán text thủ công. Lưu cache + trạng thái vào web2_jt_tracking (web2Db).
//
// J&T render kết quả SERVER-SIDE vào HTML tại:
//   https://jtexpress.vn/vi/tracking?type=track&billcode=<code>&cellphone=<4số>
//   cellphone = 4 số cuối SĐT người gửi (shop). Đã verify '8674' chạy cho mọi
//   đơn shop NHI JUDY → dùng làm mặc định (cấu hình qua env JT_CELLPHONE).
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb (Web 2.0 — KHÔNG ghi Web 1.0).
// Realtime: web2:jt-tracking (SSE).
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();
const zca = require('../services/web2-zalo-zca'); // đọc lịch sử nhóm Zalo (scan-history)

let _pool = null;
const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

// 4 số cuối SĐT gửi (shop) — gate bắt buộc của J&T. Verify chạy mọi đơn NHI JUDY.
const DEFAULT_CELLPHONE = (process.env.JT_CELLPHONE || '8674').replace(/\D/g, '').slice(-4);
const JT_BASE = 'https://jtexpress.vn/vi/tracking';
const BILLCODE_RE = /\b\d{12}\b/g; // "tất cả string dạng 12 số"
const FETCH_TIMEOUT_MS = 12000;
const REFRESH_BATCH = 25; // trần 1 lần refresh (tránh spam jtexpress + treo request)
const STALE_MS = 30 * 60 * 1000; // coi là cũ sau 30' (delivered/problem coi như chốt)
const APPROVED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // đã DUYỆT → tự xoá sau 7 ngày

// ── SSE notifier ────────────────────────────────────────────────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:jt-tracking', { action, code: code || null, ts: now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-JT] _notify failed:', e.message);
    }
}

// ── Schema (idempotent) ─────────────────────────────────────────────────
async function ensureSchema(pool) {
    _pool = pool;
    if (!pool) return;
    try {
        // ADD COLUMN trên bảng đã sống (idempotent) — đặt ĐẦU, IF EXISTS = no-op khi chưa có.
        await pool
            .query(
                `ALTER TABLE IF EXISTS web2_jt_tracking
                    ADD COLUMN IF NOT EXISTS approved_at  BIGINT,
                    ADD COLUMN IF NOT EXISTS zalo_conv_id BIGINT,
                    ADD COLUMN IF NOT EXISTS src_message  TEXT;`
            )
            .catch(() => {});
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_jt_tracking (
                billcode        VARCHAR(20) PRIMARY KEY,
                cellphone       VARCHAR(10),
                status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                                -- pending|transit|delivering|delivered|returned|problem|not_found
                latest_event    TEXT,
                latest_at       BIGINT,                 -- epoch ms (GMT+7 → UTC)
                latest_at_text  VARCHAR(25),            -- 'YYYY-MM-DD HH:MM:SS' (J&T, +7)
                events          JSONB NOT NULL DEFAULT '[]'::jsonb,
                event_count     INTEGER NOT NULL DEFAULT 0,
                source          VARCHAR(12) NOT NULL DEFAULT 'manual', -- zalo|manual
                note            TEXT,                   -- ngữ cảnh (nhóm Zalo / SĐT gần mã)
                src_message     TEXT,                   -- TOÀN BỘ tin nhắn chứa mã (tên/SĐT/ghi chú KH)
                last_fetched_at BIGINT,
                approved_at     BIGINT,                 -- đã DUYỆT (xong) → mờ đi + tự xoá sau 7 ngày
                zalo_conv_id    BIGINT,                 -- conv Zalo nguồn (mở chat nhóm từ row)
                created_at      BIGINT NOT NULL,
                updated_at      BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_jt_status   ON web2_jt_tracking(status);
            CREATE INDEX IF NOT EXISTS idx_web2_jt_latest   ON web2_jt_tracking(latest_at DESC NULLS LAST);
            CREATE INDEX IF NOT EXISTS idx_web2_jt_updated  ON web2_jt_tracking(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_web2_jt_approved ON web2_jt_tracking(approved_at) WHERE approved_at IS NOT NULL;
        `);
        console.log('[web2-jt-tracking] schema ready (web2Db)');
    } catch (e) {
        console.error('[web2-jt-tracking] ensureSchema failed:', e.message);
    }
}

// Mã ĐƠN HÀNG J&T chỉ nhận khi đúng FORMAT dòng đơn: "<12 số> [tab/space] Shop NHI JUDY 01 <tiền>..."
// → loại mention/reply (vd "@Nhi Judy Store 802... dạ ship...") + số 12 chữ số ngẫu nhiên.
// Capture group 1 = mã. Case-insensitive, "NHI JUDY" cho phép có/không khoảng trắng.
// (?<!\d)…(?!\d): mã ĐÚNG 12 số (chặn 13+ số dính nhau bị cắt còn 12).
const ORDER_CODE_RE = /(?<!\d)(\d{12})(?!\d)\s+Shop\s+NHI\s*JUDY/gi;
function extractOrderCodes(text) {
    const out = new Set();
    const re = new RegExp(ORDER_CODE_RE.source, 'gi');
    let m;
    while ((m = re.exec(String(text || '')))) out.add(m[1]);
    return [...out];
}

// Auto-ingest từ tin nhắn Zalo (gọi từ web2-zalo _persistIncoming khi có tin MỚI):
// tin NHÓM chứa mã J&T → thêm pending + SSE (UI realtime, không cần refresh), rồi
// fetch nền điền trạng thái. KHÔNG chặn luồng tin nhắn (fire-and-forget ở caller).
async function autoIngestFromZalo(db, msg) {
    try {
        if (!db || !msg || msg.threadType !== 'group') return;
        const codes = extractOrderCodes(msg.content).slice(0, 20);
        if (!codes.length) return;
        // tên + id conv nhóm (chỉ lookup khi đã có mã → nhẹ) để mở chat từ row
        let convName = null;
        let convId = null;
        try {
            const c = (
                await db.query(
                    `SELECT id, display_name FROM web2_zalo_conversations WHERE account_key=$1 AND thread_id=$2`,
                    [msg.accountKey, msg.threadId]
                )
            ).rows[0];
            convName = c?.display_name || null;
            convId = c?.id || null;
        } catch (e) {
            /* best-effort */
        }
        const ts = now();
        const srcMsg = String(msg.content || '').slice(0, 2000); // toàn bộ tin chứa mã
        const added = [];
        for (const code of codes) {
            // upsert: backfill conv_id/note/src_message cho row cũ; row MỚI qua xmax=0.
            const r = await db.query(
                `INSERT INTO web2_jt_tracking (billcode, status, source, note, zalo_conv_id, src_message, created_at, updated_at)
                 VALUES ($1,'pending','zalo',$2,$4,$5,$3,$3)
                 ON CONFLICT (billcode) DO UPDATE SET
                    zalo_conv_id = COALESCE(web2_jt_tracking.zalo_conv_id, EXCLUDED.zalo_conv_id),
                    note = COALESCE(web2_jt_tracking.note, EXCLUDED.note),
                    src_message = COALESCE(EXCLUDED.src_message, web2_jt_tracking.src_message)
                 RETURNING (xmax = 0) AS inserted`,
                [code, convName, ts, convId, srcMsg || null]
            );
            if (r.rows[0]?.inserted) added.push(code);
        }
        if (!added.length) return;
        _notify('auto-add', String(added.length)); // UI hiện ngay row "Chưa tra"
        // fetch nền điền trạng thái thật (không chặn ingest tin nhắn)
        (async () => {
            let changed = 0;
            for (const code of added) {
                try {
                    const fetched = await fetchJt(code);
                    await _upsertTracked(db, code, fetched, { source: 'zalo', note: convName });
                    changed++;
                } catch (e) {
                    /* để pending, refresh sau */
                }
            }
            if (changed) _notify('refresh', String(changed));
        })();
    } catch (e) {
        console.warn('[WEB2-JT] autoIngestFromZalo:', e.message);
    }
}

// Tự xoá các mã ĐÃ DUYỆT quá 7 ngày (best-effort, gọi khi list).
async function _purgeApproved(db) {
    try {
        const r = await db.query(
            `DELETE FROM web2_jt_tracking WHERE approved_at IS NOT NULL AND approved_at < $1`,
            [now() - APPROVED_TTL_MS]
        );
        if (r.rowCount) _notify('purge', String(r.rowCount));
    } catch (e) {
        /* best-effort */
    }
}

// ── HTML helpers ────────────────────────────────────────────────────────
function _decodeEntities(s) {
    return String(s || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}
function _stripTags(s) {
    return _decodeEntities(String(s || '').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

// J&T "YYYY-MM-DD HH:MM:SS" là giờ +7 (không hậu tố) → epoch ms.
function _toEpoch(dateStr, timeStr) {
    if (!dateStr) return null;
    const iso = `${dateStr}T${timeStr || '00:00:00'}+07:00`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

// Parse các event từ HTML kết quả J&T (.result-vandon-item, mới nhất ở trên).
function parseJtEvents(html) {
    const events = [];
    if (!html) return events;
    const parts = html.split('result-vandon-item');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const timeM = block.match(/(\d{2}:\d{2}:\d{2})/);
        const dateM = block.match(/(\d{4}-\d{2}-\d{2})/);
        if (!timeM || !dateM) continue;
        const time = timeM[1];
        const date = dateM[1];
        // desc nằm trong <div> (không class) NGAY sau cột ngày/giờ.
        const after = block.slice(block.indexOf(date) + date.length);
        const descM = after.match(/<div>\s*([\s\S]*?)<\/div>/);
        const desc = descM ? _stripTags(descM[1]) : '';
        if (!desc) continue;
        events.push({ time, date, desc, ts: _toEpoch(date, time) });
    }
    // chuẩn hoá: mới nhất trước (đề phòng nguồn đổi thứ tự)
    events.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return events;
}

// Trạng thái rút gọn từ event MỚI NHẤT (events[0]).
function deriveStatus(events) {
    if (!events.length) return 'not_found';
    const d = (events[0].desc || '').toLowerCase();
    const hit = (...kw) => kw.some((k) => d.includes(k));
    // Phân loại theo từ vựng THẬT của J&T (audit 121 sự kiện thật). Thứ tự ưu tiên QUAN TRỌNG:
    //   1) Kết cục dứt khoát (hoàn / sự cố) kiểm TRƯỚC tín hiệu "thành công" — vì câu hoàn-hàng
    //      & kiện-khó hay dính 'thành công'/'nhận' ("chuyển hoàn thành công" = đã hoàn, KHÔNG phải giao).
    const failedAttempt = d.includes('không thành công') || d.includes('chưa thành công');
    if (hit('chuyển hoàn', 'hoàn hàng', 'hoàn về', 'trả hàng', 'trả về')) return 'returned';
    if (
        failedAttempt ||
        hit('từ chối', 'kiện khó', 'không liên lạc', 'đổi ý', 'thất bại', 'hủy', 'sự cố')
    )
        return 'problem';
    // ⚠ Đã giao = NGƯỜI NHẬN ký nhận ("Đơn hàng đã ký nhận. Người ký nhận là:【khách】").
    //   KHÔNG dùng 'đã nhận hàng' (="Nhân viên bưu cục đã nhận hàng" = lấy/nhập kho → còn transit)
    //   cũng KHÔNG dùng 'thành công' trần ("chuyển hoàn thành công" = hoàn).
    if (hit('ký nhận', 'giao hàng thành công', 'giao thành công', 'phát thành công'))
        return 'delivered';
    if (hit('đang giao', 'phát lại', 'đang tiến hành', 'giao hàng')) return 'delivering';
    return 'transit';
}

// Fetch + parse 1 vận đơn từ jtexpress.vn (timeout an toàn).
async function fetchJt(billcode, cellphone) {
    const cp = String(cellphone || DEFAULT_CELLPHONE)
        .replace(/\D/g, '')
        .slice(-4);
    const url = `${JT_BASE}?type=track&billcode=${encodeURIComponent(billcode)}&cellphone=${cp}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Accept-Language': 'vi,en;q=0.9',
            },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        const events = parseJtEvents(html);
        return { ok: true, cellphone: cp, events, status: deriveStatus(events) };
    } finally {
        clearTimeout(timer);
    }
}

// Upsert 1 vận đơn sau khi fetch. Trả row đã lưu. db = pool request-scoped (web2Db).
async function _upsertTracked(db, billcode, fetched, opts = {}) {
    const ts = now();
    const events = fetched.events || [];
    const latest = events[0] || null;
    const { rows } = await db.query(
        `INSERT INTO web2_jt_tracking
            (billcode, cellphone, status, latest_event, latest_at, latest_at_text, events,
             event_count, source, note, last_fetched_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$11,$11)
         ON CONFLICT (billcode) DO UPDATE SET
            cellphone=COALESCE(EXCLUDED.cellphone, web2_jt_tracking.cellphone),
            status=EXCLUDED.status,
            latest_event=EXCLUDED.latest_event,
            latest_at=EXCLUDED.latest_at,
            latest_at_text=EXCLUDED.latest_at_text,
            events=EXCLUDED.events,
            event_count=EXCLUDED.event_count,
            source=COALESCE(web2_jt_tracking.source, EXCLUDED.source),
            note=COALESCE(EXCLUDED.note, web2_jt_tracking.note),
            last_fetched_at=EXCLUDED.last_fetched_at,
            updated_at=EXCLUDED.updated_at
         RETURNING *`,
        [
            billcode,
            fetched.cellphone || DEFAULT_CELLPHONE,
            fetched.status || 'not_found',
            latest ? latest.desc : null,
            latest ? latest.ts : null,
            latest ? `${latest.date} ${latest.time}` : null,
            JSON.stringify(events),
            events.length,
            opts.source || 'manual',
            opts.note || null,
            ts,
        ]
    );
    return rows[0];
}

// =====================================================================
// ROUTES
// =====================================================================

// Bóc mã 12 số từ text (dùng cho cả scan Zalo lẫn dán thủ công).
function extractCodes(text) {
    const out = new Set();
    let m;
    const re = new RegExp(BILLCODE_RE.source, 'g');
    while ((m = re.exec(String(text || '')))) out.add(m[0]);
    return [...out];
}

// POST /scan — quét web2_zalo_messages tìm mã 12 số mới → thêm (status pending).
// POST /clear — XÓA TOÀN BỘ data J&T (beta) để quét lại sạch. Cần confirm=YES-CLEAR.
router.post('/clear', async (req, res) => {
    try {
        if ((req.body?.confirm || req.query.confirm) !== 'YES-CLEAR')
            return res.status(400).json({ success: false, error: 'Cần confirm=YES-CLEAR' });
        const db = getDb(req);
        const r = await db.query(`DELETE FROM web2_jt_tracking`);
        _notify('clear', String(r.rowCount));
        res.json({ success: true, removed: r.rowCount });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/scan', async (req, res) => {
    try {
        const db = getDb(req);
        // Lấy tin có chứa chuỗi 12 số (lọc sơ bộ ở DB cho nhẹ) + id/tên conv nguồn.
        const { rows } = await db.query(
            `SELECT m.content, c.id AS conv_id, c.display_name AS conv_name
               FROM web2_zalo_messages m
               LEFT JOIN web2_zalo_conversations c
                 ON c.account_key = m.account_key AND c.thread_id = m.thread_id
              WHERE m.content ~ '[0-9]{12}' AND m.content ~* 'shop\\s+nhi\\s*judy'
              ORDER BY m.sent_at DESC
              LIMIT 5000`
        );
        // mã → ngữ cảnh (nhóm Zalo gặp gần nhất: tên + id + TOÀN BỘ tin chứa mã)
        const found = new Map();
        for (const r of rows) {
            for (const code of extractOrderCodes(r.content)) {
                if (!found.has(code))
                    found.set(code, {
                        name: r.conv_name || null,
                        id: r.conv_id || null,
                        content: String(r.content || '').slice(0, 2000),
                    });
            }
        }
        if (!found.size) return res.json({ success: true, found: 0, added: 0 });
        const ts = now();
        let added = 0;
        for (const [code, ctx] of found) {
            // upsert: backfill note/conv_id/src_message cho mã CŨ; insert nếu mới.
            const r = await db.query(
                `INSERT INTO web2_jt_tracking (billcode, status, source, note, zalo_conv_id, src_message, created_at, updated_at)
                 VALUES ($1,'pending','zalo',$2,$4,$5,$3,$3)
                 ON CONFLICT (billcode) DO UPDATE SET
                    note = COALESCE(web2_jt_tracking.note, EXCLUDED.note),
                    zalo_conv_id = COALESCE(web2_jt_tracking.zalo_conv_id, EXCLUDED.zalo_conv_id),
                    src_message = COALESCE(EXCLUDED.src_message, web2_jt_tracking.src_message)
                 RETURNING (xmax = 0) AS inserted`,
                [code, ctx.name, ts, ctx.id, ctx.content || null]
            );
            if (r.rows[0]?.inserted) added++;
        }
        if (added) _notify('scan', String(added));
        res.json({ success: true, found: found.size, added });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /scan-history — BACKFILL: đọc LỊCH SỬ nhóm J&T trực tiếp từ Zalo (zca
// getGroupHistory) → quét mã đơn CŨ / bị thiếu (tin nhắn gửi TRƯỚC khi listener
// kết nối, chưa có trong web2_zalo_messages). Quét các nhóm trong allowlist
// (web2_zalo_tracked_groups). count = số tin gần nhất mỗi nhóm (mặc định 200).
router.post('/scan-history', async (req, res) => {
    try {
        const db = getDb(req);
        const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 14, 1), 60);
        const count = Math.min(parseInt(req.body?.count, 10) || 1000, 3000);
        const cutoff = now() - days * 24 * 60 * 60 * 1000;
        // Nhóm J&T được theo dõi + tên/id hội thoại (để gán nguồn).
        const groups = (
            await db.query(
                `SELECT t.account_key, t.thread_id,
                        COALESCE(c.display_name, t.name) AS name, c.id AS conv_id
                   FROM web2_zalo_tracked_groups t
                   LEFT JOIN web2_zalo_conversations c
                     ON c.account_key = t.account_key AND c.thread_id = t.thread_id`
            )
        ).rows;
        if (!groups.length)
            return res.json({
                success: false,
                error: 'Chưa cấu hình nhóm J&T theo dõi (web2_zalo_tracked_groups)',
            });
        let fetched = 0; // tin có nội dung TRONG cửa sổ `days`
        let rawTotal = 0; // tổng tin Zalo trả về (gồm ảnh/system)
        let moreAvail = 0; // >0 = Zalo còn tin cũ hơn (zca 2.1.2 không lấy tiếp được)
        let oldestTs = null; // mốc cũ nhất chạm tới (cho biết với tới bao xa)
        const errors = [];
        // mã → ngữ cảnh (giống /scan): tên/id nhóm + toàn bộ tin chứa mã.
        const found = new Map();
        for (const g of groups) {
            let r;
            try {
                r = await zca.getGroupHistory(g.account_key, g.thread_id, count);
            } catch (e) {
                errors.push(`${g.name || g.thread_id}: ${e.message}`);
                continue;
            }
            rawTotal += r.total || 0;
            moreAvail = Math.max(moreAvail, r.more || 0);
            for (const m of r.messages || []) {
                if (!m) continue;
                if (m.sentAt && (oldestTs === null || m.sentAt < oldestTs)) oldestTs = m.sentAt;
                if (m.sentAt && m.sentAt < cutoff) continue; // ngoài cửa sổ `days`
                if (!m.content) continue;
                fetched++;
                for (const code of extractOrderCodes(m.content)) {
                    if (!found.has(code))
                        found.set(code, {
                            name: g.name || null,
                            id: g.conv_id || null,
                            content: String(m.content).slice(0, 2000),
                        });
                }
            }
        }
        const ts = now();
        let added = 0;
        for (const [code, ctx] of found) {
            const r = await db.query(
                `INSERT INTO web2_jt_tracking (billcode, status, source, note, zalo_conv_id, src_message, created_at, updated_at)
                 VALUES ($1,'pending','zalo',$2,$4,$5,$3,$3)
                 ON CONFLICT (billcode) DO UPDATE SET
                    note = COALESCE(web2_jt_tracking.note, EXCLUDED.note),
                    zalo_conv_id = COALESCE(web2_jt_tracking.zalo_conv_id, EXCLUDED.zalo_conv_id),
                    src_message = COALESCE(EXCLUDED.src_message, web2_jt_tracking.src_message)
                 RETURNING (xmax = 0) AS inserted`,
                [code, ctx.name, ts, ctx.id, ctx.content || null]
            );
            if (r.rows[0]?.inserted) added++;
        }
        if (added) _notify('scan', String(added));
        res.json({
            success: true,
            groups: groups.length,
            days,
            fetched,
            rawTotal,
            more: moreAvail,
            found: found.size,
            added,
            oldestDate: oldestTs ? new Date(oldestTs).toISOString().slice(0, 10) : null,
            errors,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /add — thêm mã thủ công (body {text} hoặc {codes:[]}). Trả mã đã thêm.
router.post('/add', async (req, res) => {
    try {
        const db = getDb(req);
        const codes = [
            ...new Set([
                ...extractCodes(req.body?.text),
                ...(Array.isArray(req.body?.codes) ? req.body.codes : [])
                    .map((c) => String(c).replace(/\D/g, ''))
                    .filter((c) => /^\d{12}$/.test(c)),
            ]),
        ];
        if (!codes.length)
            return res.status(400).json({ success: false, error: 'Không tìm thấy mã 12 số' });
        const ts = now();
        let added = 0;
        for (const code of codes) {
            const r = await db.query(
                `INSERT INTO web2_jt_tracking (billcode, status, source, created_at, updated_at)
                 VALUES ($1,'pending','manual',$2,$2)
                 ON CONFLICT (billcode) DO NOTHING`,
                [code, ts]
            );
            if (r.rowCount) added++;
        }
        if (added) _notify('add', String(added));
        res.json({ success: true, codes, added });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// POST /track — fetch + lưu 1 vận đơn (body {billcode, cellphone?, source?, note?}).
router.post('/track', async (req, res) => {
    try {
        const db = getDb(req);
        const billcode = String(req.body?.billcode || '').replace(/\D/g, '');
        if (!/^\d{12}$/.test(billcode))
            return res.status(400).json({ success: false, error: 'Mã vận đơn phải là 12 số' });
        const fetched = await fetchJt(billcode, req.body?.cellphone);
        const row = await _upsertTracked(db, billcode, fetched, {
            source: req.body?.source,
            note: req.body?.note,
        });
        _notify('track', billcode);
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(502).json({ success: false, error: 'J&T lỗi: ' + e.message });
    }
});

// Re-derive status từ events ĐÃ LƯU (không gọi J&T) — sửa drift khi đổi logic deriveStatus
// (vd "chuyển hoàn thành công" từng bị gán 'delivered', giờ là 'returned'). Rẻ, idempotent.
async function _rederiveStored(db) {
    const { rows } = await db.query(
        `SELECT billcode, status, events FROM web2_jt_tracking
          WHERE approved_at IS NULL AND events IS NOT NULL AND jsonb_array_length(events) > 0`
    );
    let changed = 0;
    for (const r of rows) {
        const evs = Array.isArray(r.events) ? r.events : [];
        const ns = deriveStatus(evs);
        if (ns && ns !== r.status) {
            await db.query(
                `UPDATE web2_jt_tracking SET status=$2, updated_at=$3 WHERE billcode=$1`,
                [r.billcode, ns, now()]
            );
            changed++;
        }
    }
    return changed;
}

// POST /refresh — làm mới hàng loạt (mã pending + đơn chưa chốt + cũ). Bounded.
router.post('/refresh', async (req, res) => {
    try {
        const db = getDb(req);
        // sửa status từ events đã lưu trước (rẻ, không gọi J&T) → đơn 'delivered' sai → 'returned'
        const rederived = await _rederiveStored(db).catch(() => 0);
        const limit = Math.min(parseInt(req.body?.limit, 10) || REFRESH_BATCH, REFRESH_BATCH);
        const onlyCodes = Array.isArray(req.body?.codes)
            ? req.body.codes
                  .map((c) => String(c).replace(/\D/g, ''))
                  .filter((c) => /^\d{12}$/.test(c))
            : null;
        let rows;
        if (onlyCodes && onlyCodes.length) {
            rows = (
                await db.query(
                    `SELECT billcode, cellphone FROM web2_jt_tracking
                      WHERE billcode = ANY($1::text[]) AND approved_at IS NULL LIMIT $2`,
                    [onlyCodes, limit]
                )
            ).rows;
        } else {
            // ưu tiên: pending → chưa fetch lâu → chưa chốt (transit/delivering)
            rows = (
                await db.query(
                    `SELECT billcode, cellphone FROM web2_jt_tracking
                      WHERE approved_at IS NULL
                        AND (status IN ('pending','transit','delivering','not_found')
                             OR last_fetched_at IS NULL
                             OR last_fetched_at < $1)
                      ORDER BY (status='pending') DESC, last_fetched_at ASC NULLS FIRST
                      LIMIT $2`,
                    [now() - STALE_MS, limit]
                )
            ).rows;
        }
        // Fetch SONG SONG theo chunk 5 (giảm wall-time: 25 mã ~ 5 lượt thay vì 25).
        let ok = 0;
        let fail = 0;
        const CONC = 5;
        for (let i = 0; i < rows.length; i += CONC) {
            const chunk = rows.slice(i, i + CONC);
            const results = await Promise.allSettled(
                chunk.map(async (r) => {
                    const fetched = await fetchJt(r.billcode, r.cellphone);
                    await _upsertTracked(db, r.billcode, fetched, {});
                })
            );
            for (const x of results) x.status === 'fulfilled' ? ok++ : fail++;
        }
        if (ok || rederived) _notify('refresh', String(ok || rederived));
        res.json({
            success: true,
            processed: rows.length,
            ok,
            fail,
            rederived,
            remaining: rows.length >= limit,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /list — danh sách quản lý (filter status + search). Trả kèm KPI đếm.
router.get('/list', async (req, res) => {
    try {
        const db = getDb(req);
        await _purgeApproved(db); // tự xoá mã đã duyệt quá 7 ngày
        const { status, search } = req.query;
        const lim = Math.min(parseInt(req.query.limit, 10) || 500, 1000);
        const where = [];
        const params = [];
        if (status === 'approved') {
            where.push('approved_at IS NOT NULL'); // lọc riêng "Đã duyệt" (không phải status)
        } else if (status && status !== 'all') {
            params.push(status);
            where.push(`status = $${params.length}`);
        }
        if (search) {
            params.push('%' + String(search).trim() + '%');
            where.push(
                `(billcode ILIKE $${params.length} OR note ILIKE $${params.length} OR latest_event ILIKE $${params.length})`
            );
        }
        const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        params.push(lim);
        // đã duyệt → đẩy xuống cuối (mờ), chưa duyệt ưu tiên trên.
        const { rows } = await db.query(
            `SELECT billcode, cellphone, status, latest_event, latest_at, latest_at_text,
                    event_count, source, note, last_fetched_at, approved_at, zalo_conv_id,
                    src_message, created_at, updated_at
               FROM web2_jt_tracking ${wsql}
              ORDER BY (approved_at IS NOT NULL), latest_at DESC NULLS LAST, updated_at DESC
              LIMIT $${params.length}`,
            params
        );
        const kpi = (
            await db.query(`SELECT status, COUNT(*)::int n FROM web2_jt_tracking GROUP BY status`)
        ).rows.reduce((a, r) => ((a[r.status] = r.n), a), {});
        kpi.total = Object.values(kpi).reduce((a, b) => a + b, 0);
        kpi.approved = (
            await db.query(
                `SELECT COUNT(*)::int n FROM web2_jt_tracking WHERE approved_at IS NOT NULL`
            )
        ).rows[0].n;
        res.json({ success: true, data: rows, kpi });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /:billcode — chi tiết 1 vận đơn (full events). Auto-fetch nếu chưa có.
router.get('/:billcode', async (req, res) => {
    try {
        const db = getDb(req);
        const billcode = String(req.params.billcode || '').replace(/\D/g, '');
        if (!/^\d{12}$/.test(billcode))
            return res.status(400).json({ success: false, error: 'Mã vận đơn phải là 12 số' });
        let row = (await db.query(`SELECT * FROM web2_jt_tracking WHERE billcode=$1`, [billcode]))
            .rows[0];
        // chưa fetch bao giờ → fetch ngay (best-effort).
        if (!row || !row.last_fetched_at) {
            try {
                const fetched = await fetchJt(billcode, row?.cellphone);
                row = await _upsertTracked(db, billcode, fetched, {
                    source: row?.source || 'manual',
                });
            } catch (e) {
                if (!row)
                    return res.status(502).json({ success: false, error: 'J&T lỗi: ' + e.message });
            }
        }
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:billcode/approve — DUYỆT (xong) → mờ đi, tự xoá sau 7 ngày.
router.post('/:billcode/approve', async (req, res) => {
    try {
        const db = getDb(req);
        const billcode = String(req.params.billcode || '').replace(/\D/g, '');
        if (!/^\d{12}$/.test(billcode))
            return res.status(400).json({ success: false, error: 'Mã vận đơn phải là 12 số' });
        const r = await db.query(
            `UPDATE web2_jt_tracking SET approved_at=$2, updated_at=$2 WHERE billcode=$1`,
            [billcode, now()]
        );
        if (!r.rowCount)
            return res.status(404).json({ success: false, error: 'Không tìm thấy mã' });
        _notify('approve', billcode);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:billcode/unapprove — TRỞ LẠI (bỏ duyệt) → hết mờ, không bị tự xoá nữa.
router.post('/:billcode/unapprove', async (req, res) => {
    try {
        const db = getDb(req);
        const billcode = String(req.params.billcode || '').replace(/\D/g, '');
        if (!/^\d{12}$/.test(billcode))
            return res.status(400).json({ success: false, error: 'Mã vận đơn phải là 12 số' });
        await db.query(
            `UPDATE web2_jt_tracking SET approved_at=NULL, updated_at=$2 WHERE billcode=$1`,
            [billcode, now()]
        );
        _notify('unapprove', billcode);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.ensureSchema = ensureSchema;
router.initializeNotifiers = initializeNotifiers;
router.autoIngestFromZalo = autoIngestFromZalo; // gọi từ web2-zalo khi có tin nhắn mới
module.exports = router;
