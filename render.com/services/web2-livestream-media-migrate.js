// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — one-time migrate livestream media chatDb → web2Db.
// =====================================================================
// web2-livestream-media-migrate — dời `livestream_snapshots` + `livestream_images`
// từ chatDb (Web 1.0 PROD, 1GB — bị full 2026-06-11) sang web2Db (15GB).
//
// VÌ SAO 2 bảng này nằm chatDb: route tạo 2026-05-23 / 06-02 — TRƯỚC ngày tách
// DB (2026-06-03). Khi tách chỉ dời bảng prefix `web2_*`, 2 bảng này tên không
// prefix nên bị bỏ sót dù consumer là live-chat (Web 2.0).
//
// Cách chạy: gọi `migrate({ chatPool, web2Pool })` 1 lần lúc boot (background,
// không chặn server). Idempotent:
//   • Bảng đích đã có ≥ số rows nguồn → skip (đã migrate xong / write mới đã vào).
//   • Copy keyset theo id (batch nhỏ vì bytea nặng) + ON CONFLICT (id) DO NOTHING
//     → re-run giữa chừng không duplicate, giữ NGUYÊN id (thumbnail_url chứa
//     /snapshot/:id nên id phải bất biến).
//   • Sau copy: setval sequence = MAX(id) để BIGSERIAL không cấp id trùng.
//
// KHÔNG xóa bảng nguồn trên chatDb — việc DROP (giải phóng ~172MB) làm thủ công
// sau khi user xác nhận (chatDb là Web 1.0 PROD).
// =====================================================================

'use strict';

const BATCH = 20; // bytea ~100-600KB/row → batch nhỏ tránh phình RAM

const TABLES = [
    {
        name: 'livestream_snapshots',
        cols: [
            'id',
            'comment_id',
            'customer_fb_user_id',
            'customer_name',
            'page_id',
            'page_name',
            'live_campaign_id',
            'live_video_id',
            'captured_at',
            'captured_by',
            'captured_by_name',
            'offset_seconds',
            'livestream_url',
            'thumbnail_url',
            'note',
            'image_data',
            'image_mime',
            'image_size',
            'created_at',
        ],
    },
    {
        name: 'livestream_images',
        cols: [
            'id',
            'page_id',
            'page_name',
            'live_campaign_id',
            'live_campaign_name',
            'live_video_id',
            'captured_at',
            'captured_by',
            'captured_by_name',
            'offset_seconds',
            'livestream_url',
            'note',
            'image_data',
            'image_mime',
            'image_size',
            'extract_status',
            'created_at',
        ],
    },
];

async function _tableExists(pool, table) {
    const r = await pool.query('SELECT to_regclass($1) AS t', ['public.' + table]);
    return !!r.rows[0]?.t;
}

// Chỉ copy các cột tồn tại ở CẢ 2 bên (schema 2 bên có thể lệch ALTER vài cột).
async function _commonCols(chatPool, web2Pool, table, wanted) {
    const q = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`;
    const [a, b] = await Promise.all([chatPool.query(q, [table]), web2Pool.query(q, [table])]);
    const setA = new Set(a.rows.map((r) => r.column_name));
    const setB = new Set(b.rows.map((r) => r.column_name));
    return wanted.filter((c) => setA.has(c) && setB.has(c));
}

async function _migrateTable(chatPool, web2Pool, { name, cols }) {
    if (!(await _tableExists(chatPool, name))) {
        console.log(`[LS-MIGRATE] ${name}: không có trên chatDb — skip`);
        return { skipped: true };
    }
    if (!(await _tableExists(web2Pool, name))) {
        // Tạo bảng đích bằng CHÍNH ensureSchema của route (1 nguồn DDL, không drift).
        try {
            const mod =
                name === 'livestream_snapshots'
                    ? require('../routes/livestream-snapshots')
                    : require('../routes/livestream-images');
            if (typeof mod.ensureSchema === 'function') await mod.ensureSchema(web2Pool);
        } catch (e) {
            console.warn(`[LS-MIGRATE] ${name}: ensureSchema đích fail:`, e.message);
        }
        if (!(await _tableExists(web2Pool, name))) {
            console.log(`[LS-MIGRATE] ${name}: bảng đích chưa tạo được — skip lần này`);
            return { skipped: true };
        }
    }
    const [srcN, dstN] = await Promise.all([
        chatPool.query(`SELECT COUNT(*)::int AS n, COALESCE(MAX(id),0)::bigint AS mx FROM ${name}`),
        web2Pool.query(`SELECT COUNT(*)::int AS n FROM ${name}`),
    ]);
    const srcCount = srcN.rows[0].n;
    const srcMax = Number(srcN.rows[0].mx) || 0;
    const dstCount = dstN.rows[0].n;
    // Nhảy sequence đích qua MAX(id) nguồn NGAY từ đầu (TRƯỚC khi copy) — snapshot
    // MỚI ghi vào web2Db trong lúc migrate đang chạy sẽ không bị cấp id trùng dải
    // id cũ (trùng → ON CONFLICT nuốt row cũ + thumbnail_url /snapshot/:id loạn).
    if (srcMax > 0) {
        await web2Pool.query(
            `SELECT setval(pg_get_serial_sequence('${name}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${name}), $1))`,
            [srcMax]
        );
    }
    if (srcCount === 0 || dstCount >= srcCount) {
        console.log(`[LS-MIGRATE] ${name}: src=${srcCount} dst=${dstCount} — đã đủ, skip`);
        return { copied: 0, src: srcCount, dst: dstCount };
    }
    const useCols = await _commonCols(chatPool, web2Pool, name, cols);
    const colList = useCols.map((c) => `"${c}"`).join(', ');
    let lastId = 0;
    let copied = 0;
    for (;;) {
        const batch = await chatPool.query(
            `SELECT ${colList} FROM ${name} WHERE id > $1 ORDER BY id LIMIT ${BATCH}`,
            [lastId]
        );
        if (!batch.rows.length) break;
        for (const row of batch.rows) {
            const vals = useCols.map((c) => row[c]);
            const ph = useCols.map((_, i) => `$${i + 1}`).join(', ');
            await web2Pool.query(
                `INSERT INTO ${name} (${colList}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
                vals
            );
            copied++;
        }
        lastId = batch.rows[batch.rows.length - 1].id;
        if (copied % 200 < BATCH) {
            console.log(`[LS-MIGRATE] ${name}: copied ${copied}/${srcCount}...`);
        }
    }
    // BIGSERIAL của bảng đích phải nhảy qua MAX(id) đã copy — không thì INSERT
    // mới cấp id trùng → ON CONFLICT nuốt mất snapshot mới.
    await web2Pool.query(
        `SELECT setval(pg_get_serial_sequence('${name}','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM ${name}), 1))`
    );
    console.log(`[LS-MIGRATE] ${name}: DONE copied=${copied} (src=${srcCount})`);
    return { copied, src: srcCount };
}

let _running = false;
async function migrate({ chatPool, web2Pool }) {
    if (_running) return;
    if (!chatPool || !web2Pool) {
        console.log('[LS-MIGRATE] thiếu pool (web2Db chưa config?) — skip');
        return;
    }
    _running = true;
    try {
        for (const t of TABLES) {
            try {
                await _migrateTable(chatPool, web2Pool, t);
            } catch (e) {
                console.error(`[LS-MIGRATE] ${t.name} fail:`, e.message);
            }
        }
    } finally {
        _running = false;
    }
}

module.exports = { migrate };
