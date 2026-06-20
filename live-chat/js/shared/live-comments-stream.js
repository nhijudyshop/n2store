// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 shared.
/**
 * LiveCommentsStream — engine realtime comment livestream DÙNG CHUNG
 * (desktop live-init.js + mobile comments-mobile.js).
 *
 * Bỏ HẲN polling: chỉ nghe SSE topic `web2:live-comments` (relay Pancake WS 24/7
 * trên service web2-realtime → /ingest → DB → SSE). SSE payload chỉ là tickle
 * {action,postId,ts} → engine debounce rồi GET delta (chỉ comment MỚI hơn cursor)
 * → trả về `onDelta(rows)` để trang APPEND (không full re-render).
 *
 * Cursor = updated_at (epoch ms server gán mỗi upsert, đơn điệu — bắt cả comment
 * đến trễ / bị sửa) + fallback created_time. Overlap 3s + dedup-by-id phía trang.
 *
 * API:
 *   const stream = LiveCommentsStream.create({
 *     getWorkerUrl, getPostIds, shouldFetch, mapRow, onDelta,
 *     allowGlobal, getUpdatedMs, getCreatedMs, debounceMs, limit,
 *   });
 *   stream.start();                         // subscribe SSE (auto-retry nếu bridge load trễ)
 *   stream.primeCursor({updatedMs,createdMs}); // gọi sau initial load để biết mốc
 *   stream.fetchNow();                      // ép fetch delta ngay (vd visibilitychange)
 *   stream.stop();
 */
(function (global) {
    'use strict';
    if (global.LiveCommentsStream) return;

    function create(opts) {
        opts = opts || {};
        var topic = opts.topic || 'web2:live-comments';
        var debounceMs = opts.debounceMs || 400;
        var limit = opts.limit || 2000;
        var allowGlobal = !!opts.allowGlobal; // mobile: fetch toàn cục khi không có postIds
        var getWorkerUrl =
            opts.getWorkerUrl ||
            function () {
                return '';
            };
        var getPostIds =
            opts.getPostIds ||
            function () {
                return [];
            };
        var shouldFetch =
            opts.shouldFetch ||
            function () {
                return true;
            };
        var mapRow =
            opts.mapRow ||
            function (r) {
                return r;
            };
        var onDelta = opts.onDelta || function () {};
        var getUpdatedMs =
            opts.getUpdatedMs ||
            function (row) {
                return Number(row.updated_at) || 0;
            };
        var getCreatedMs =
            opts.getCreatedMs ||
            function (row) {
                return global.SharedUtils ? global.SharedUtils.toEpochMs(row.created_time) : 0;
            };

        var lastUpdatedMs = 0;
        var lastCreatedMs = 0;
        var timer = null;
        var unsub = null;
        var inFlight = false;
        var pending = false;
        var started = false;

        function primeCursor(c) {
            if (!c) return;
            if (c.updatedMs && c.updatedMs > lastUpdatedMs) lastUpdatedMs = c.updatedMs;
            if (c.createdMs && c.createdMs > lastCreatedMs) lastCreatedMs = c.createdMs;
        }

        function cursor() {
            return { updatedMs: lastUpdatedMs, createdMs: lastCreatedMs };
        }

        async function fetchDelta() {
            if (inFlight) {
                pending = true;
                return;
            }
            if (!shouldFetch()) return;
            var ids = getPostIds() || [];
            if (!ids.length && !allowGlobal) return; // desktop: chưa chọn campaign → skip
            // Guard: chưa prime cursor (cả 2 đều 0) → bỏ qua, tránh since=0 dump cả nghìn dòng.
            if (!lastUpdatedMs && !lastCreatedMs) return;
            inFlight = true;
            try {
                var sinceUpdated = Math.max(0, lastUpdatedMs - 3000);
                var cursorParam = lastUpdatedMs
                    ? 'sinceUpdated=' + sinceUpdated
                    : 'since=' + (lastCreatedMs || 0);
                var postParam = ids.length
                    ? 'postIds=' + encodeURIComponent(ids.join(',')) + '&'
                    : '';
                var url =
                    getWorkerUrl() +
                    '/api/web2-live-comments?' +
                    postParam +
                    cursorParam +
                    '&limit=' +
                    limit;
                var resp = await fetch(url, {
                    signal: AbortSignal.timeout(15000),
                    headers: (window.Web2Auth && window.Web2Auth.authHeaders()) || {}, // x-web2-token (API đã gate)
                });
                var j = await resp.json();
                if (j && j.success && Array.isArray(j.data) && j.data.length) {
                    // Advance cursor từ RAW rows TRƯỚC khi map (để chính xác epoch).
                    for (var i = 0; i < j.data.length; i++) {
                        var u = getUpdatedMs(j.data[i]);
                        if (u > lastUpdatedMs) lastUpdatedMs = u;
                        var cm = getCreatedMs(j.data[i]);
                        if (cm > lastCreatedMs) lastCreatedMs = cm;
                    }
                    var mapped = j.data.map(mapRow);
                    onDelta(mapped);
                }
            } catch (e) {
                if (global.console)
                    console.warn('[LiveCommentsStream] delta fail:', e && e.message);
            } finally {
                inFlight = false;
                if (pending) {
                    pending = false;
                    schedule();
                }
            }
        }

        function schedule() {
            clearTimeout(timer);
            timer = setTimeout(fetchDelta, debounceMs);
        }

        function start() {
            if (started) return;
            if (!global.Web2SSE || typeof global.Web2SSE.subscribe !== 'function') {
                setTimeout(start, 1000); // bridge load trễ → retry
                return;
            }
            started = true;
            unsub = global.Web2SSE.subscribe(topic, function (evt) {
                // resync (bridge reconnect) hoặc tickle thường → đều debounce fetch delta.
                schedule();
            });
        }

        function stop() {
            if (unsub) {
                try {
                    unsub();
                } catch (e) {}
                unsub = null;
            }
            started = false;
            clearTimeout(timer);
        }

        return {
            start: start,
            stop: stop,
            primeCursor: primeCursor,
            cursor: cursor,
            fetchNow: fetchDelta,
            reconcile: schedule,
        };
    }

    global.LiveCommentsStream = { create: create };
})(typeof window !== 'undefined' ? window : this);
