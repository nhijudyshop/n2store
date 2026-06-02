// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — cron re-khớp GD "chưa gán KH" định kỳ, KHÔNG cần mở trang.
// =====================================================
// WEB 2.0 REPROCESS CRON
//
// Trước đây việc thử khớp lại các GD "chưa gán KH" (debt_added=false,
// chưa pending) CHỈ chạy khi có người MỞ trang balance-history
// (autoReprocessOnLoad ở client). Nếu cả ngày không ai mở → GD mới về
// nhưng SĐT chưa có trong DB lúc webhook fire sẽ nằm "chưa gán" mãi.
//
// Cron này quét định kỳ trên server và gọi lại processWeb2Match cho
// các GD đó → khách được cộng ví mà không cần ai mở trang.
//
// KHÁC với web2-webhook-retry (chỉ retry webhook bị CRASH/exception):
// cron này nhắm các GD đã insert OK nhưng auto chưa khớp được KH.
// =====================================================

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 phút
const DEFAULT_LIMIT = 200;

let _intervalRef = null;
let _running = false;

/**
 * Start cron — mỗi `intervalMs` quét & re-khớp tối đa `limit` GD chưa gán.
 *
 * @param {object} db - Postgres pool (chatDb)
 * @param {Function} reprocessFn - async (db, limit) => stats
 * @param {{ intervalMs?: number, limit?: number }} [opts]
 */
function startCron(db, reprocessFn, opts = {}) {
    if (_intervalRef) return;
    if (!db || typeof reprocessFn !== 'function') {
        console.warn('[web2-reprocess-cron] start skipped: missing db/reprocessFn');
        return;
    }
    const intervalMs = Number(opts.intervalMs) || DEFAULT_INTERVAL_MS;
    const limit = Number(opts.limit) || DEFAULT_LIMIT;

    const tick = async () => {
        // Tránh chồng lần chạy nếu 1 tick kéo dài hơn interval.
        if (_running) return;
        _running = true;
        try {
            const r = await reprocessFn(db, limit);
            if (r && r.picked > 0 && (r.matched > 0 || r.pending > 0)) {
                console.log(
                    `[web2-reprocess-cron] tick: picked=${r.picked} matched=${r.matched} pending=${r.pending} no_match=${r.no_match} errors=${r.errors}`
                );
            }
        } catch (e) {
            console.error('[web2-reprocess-cron] tick failed:', e.message);
        } finally {
            _running = false;
        }
    };

    _intervalRef = setInterval(tick, intervalMs);
    console.log(
        `[web2-reprocess-cron] cron started (${Math.round(intervalMs / 60000)}-min interval, limit=${limit})`
    );
}

function stopCron() {
    if (_intervalRef) {
        clearInterval(_intervalRef);
        _intervalRef = null;
    }
}

module.exports = { startCron, stopCron };
