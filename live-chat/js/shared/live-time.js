// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 shared.
/**
 * LiveTime — formatter thời gian tương đối + bộ đếm TỰ TICK dùng chung cho
 * live-chat desktop (index.html) và mobile (comments-mobile.html).
 *
 * Vì sao: bảng comment livestream giờ APPEND (không full re-render). Khi không
 * render lại, thứ DUY NHẤT cần đổi theo thời gian là nhãn "Vừa xong" → "1 phút"
 * → "2 phút"… Module này render mỗi mốc thời gian thành 1 element mang
 * `data-live-ts="<epoch ms>"`, rồi MỘT setInterval chung quét mọi element đó và
 * chỉ cập nhật textContent (KHÔNG đụng renderCommentItem / không re-render dòng).
 *
 * Múi giờ GMT+7 (Asia/Ho_Chi_Minh) theo quy ước Web 2.0. Timestamp Pancake là
 * UTC KHÔNG hậu tố Z → parseMs append 'Z' (reuse SharedUtils.toEpochMs nếu có).
 */
(function (global) {
    'use strict';
    if (global.LiveTime) return;

    var TZ = { timeZone: 'Asia/Ho_Chi_Minh' };
    var TICK_MS = 30000; // 30s đủ để "Vừa xong"→"1 phút" cập nhật mượt, rất nhẹ.

    function parseMs(v) {
        if (v == null || v === '') return 0;
        if (typeof v === 'number') return v > 9999999999 ? v : v * 1000;
        if (global.SharedUtils && typeof global.SharedUtils.toEpochMs === 'function') {
            return global.SharedUtils.toEpochMs(v);
        }
        var s = String(v).trim();
        // naive "2026-06-14T04:25:23" (UTC không Z) → append Z (server TZ=+7 bug guard)
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
            s = s.replace(' ', 'T') + 'Z';
        }
        var d = new Date(s);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }

    function absShort(ms) {
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: TZ.timeZone,
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date(ms));
    }

    /**
     * "Vừa xong" / "N phút" / "N giờ" / "dd/mm HH:MM".
     * @param {string|number} v timestamp hoặc epoch ms
     */
    function format(v) {
        var ms = typeof v === 'number' && v > 9999999999 ? v : parseMs(v);
        if (!ms) return '';
        var diff = (Date.now() - ms) / 1000;
        if (diff < 0) diff = 0;
        if (diff < 60) return 'Vừa xong';
        if (diff < 3600) return Math.floor(diff / 60) + ' phút';
        if (diff < 86400) return Math.floor(diff / 3600) + ' giờ';
        return absShort(ms);
    }

    function escAttr(s) {
        return String(s).replace(/"/g, '&quot;');
    }

    /**
     * Trả về chuỗi HTML 1 element mang data-live-ts để ticker tự cập nhật.
     * @param {string|number} v timestamp
     * @param {{tag?:string, cls?:string, title?:string}} [opt]
     */
    function markup(v, opt) {
        opt = opt || {};
        var tag = opt.tag || 'span';
        var ms = parseMs(v);
        var cls = opt.cls ? ' class="' + escAttr(opt.cls) + '"' : '';
        var title = opt.title ? ' title="' + escAttr(opt.title) + '"' : '';
        return (
            '<' + tag + cls + title + ' data-live-ts="' + ms + '">' + format(ms) + '</' + tag + '>'
        );
    }

    var _timer = null;
    function tick() {
        if (!global.document) return;
        if (global.document.visibilityState === 'hidden') return;
        var nodes = global.document.querySelectorAll('[data-live-ts]');
        for (var i = 0; i < nodes.length; i++) {
            var ms = Number(nodes[i].getAttribute('data-live-ts')) || 0;
            if (!ms) continue;
            var t = format(ms);
            if (nodes[i].textContent !== t) nodes[i].textContent = t;
        }
    }

    function start(intervalMs) {
        if (_timer) return;
        _timer = setInterval(tick, intervalMs || TICK_MS);
        if (global.document) {
            global.document.addEventListener('visibilitychange', function () {
                if (global.document.visibilityState === 'visible') tick();
            });
        }
    }

    global.LiveTime = {
        format: format,
        markup: markup,
        parseMs: parseMs,
        tick: tick,
        start: start,
    };

    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener(
                'DOMContentLoaded',
                function () {
                    start();
                },
                {
                    once: true,
                }
            );
        } else {
            start();
        }
    }
})(typeof window !== 'undefined' ? window : this);
