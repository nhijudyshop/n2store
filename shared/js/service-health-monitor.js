// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * SERVICE HEALTH MONITOR (shared, infra-level — Web 1.0 + Web 2.0)
 * File: shared/js/service-health-monitor.js
 *
 * Vì sao có file này: server đang chết thì KHÔNG thể tự push tín hiệu báo
 * nó chết (SSE từ Render tắt luôn khi Render sập). Nên client tự ping định
 * kỳ cả Render `/health` lẫn Cloudflare worker; ping fail/timeout → hiện
 * banner đỏ realtime trên cùng; ping lại OK → tự ẩn.
 *
 * Tự nạp qua navigation-modern.js / web2-sidebar.js / shared-auth-manager.js.
 * Không phụ thuộc thư viện nào. An toàn nạp nhiều lần (guard double-init).
 */
(function () {
    'use strict';

    if (window.__n2ServiceHealthMonitor) return; // double-init guard

    // ---- Config ----
    const RENDER_HEALTH_URL = 'https://n2store-fallback.onrender.com/health';
    const WORKER_PROBE_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/';
    const POLL_MS = 25000; // chu kỳ ping khi tab đang xem
    const PROBE_TIMEOUT_MS = 8000; // timeout mỗi lần ping
    const FAIL_THRESHOLD = 2; // số lần fail liên tiếp trước khi báo "down" (tránh blip)
    const RECOVERED_TOAST_MS = 3500; // thời gian hiện "đã kết nối lại"

    const SERVICES = {
        render: { label: 'Máy chủ (Render)' },
        worker: { label: 'Cloudflare proxy' },
    };

    // ---- State ----
    const state = {
        render: { status: 'ok', fails: 0, since: null },
        worker: { status: 'ok', fails: 0, since: null },
    };
    let timer = null;
    let bannerEl = null;
    let lastBadKey = ''; // để biết khi nào vừa hồi phục

    const reduceMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- Probe helpers ----
    async function probe(url, opts) {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: opts.method || 'GET',
                signal: ctrl.signal,
                cache: 'no-store',
                // không gửi credentials — chỉ cần biết server có sống không
                credentials: 'omit',
            });
            return res; // resolve với BẤT KỲ status nào = server còn sống
        } finally {
            clearTimeout(to);
        }
    }

    async function checkRender() {
        try {
            const res = await probe(RENDER_HEALTH_URL, {});
            if (res.status === 503) return 'degraded'; // server sống nhưng DB rớt
            if (res.ok) return 'ok';
            // 5xx khác → coi như degraded (server có phản hồi nhưng lỗi)
            return res.status >= 500 ? 'degraded' : 'ok';
        } catch (_) {
            return 'down'; // timeout / network / abort
        }
    }

    async function checkWorker() {
        try {
            // OPTIONS '/' → worker trả 204 (CORS preflight) NGAY tại edge (không proxy
            // Render). 204 = success → KHÔNG spam console (GET '/' trước đây trả 404 →
            // browser log lỗi mọi 25s mọi trang). Bất kỳ response nào = worker sống.
            await probe(WORKER_PROBE_URL, { method: 'OPTIONS' });
            return 'ok';
        } catch (_) {
            return 'down';
        }
    }

    function applyResult(key, result) {
        const s = state[key];
        if (result === 'ok') {
            s.fails = 0;
            if (s.status !== 'ok') {
                s.status = 'ok';
                s.since = null;
            }
            return;
        }
        // degraded / down
        s.fails += 1;
        if (s.fails >= FAIL_THRESHOLD && s.status !== result) {
            s.status = result;
            s.since = s.since || Date.now();
        } else if (s.fails >= FAIL_THRESHOLD) {
            s.status = result;
            s.since = s.since || Date.now();
        }
    }

    // ---- Banner UI ----
    function ensureBanner() {
        if (bannerEl) return bannerEl;
        const el = document.createElement('div');
        el.id = 'n2-health-banner';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        el.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'right:0',
            'z-index:2147483000', // trên cả modal
            'padding:9px 16px',
            'font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'color:#fff',
            'text-align:center',
            'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
            'transform:translateY(-110%)',
            reduceMotion ? '' : 'transition:transform 220ms cubic-bezier(0.16,1,0.3,1)',
            'pointer-events:none',
            'white-space:nowrap',
            'overflow:hidden',
            'text-overflow:ellipsis',
        ].join(';');
        (document.body || document.documentElement).appendChild(el);
        bannerEl = el;
        return el;
    }

    function showBanner(html, bg) {
        const el = ensureBanner();
        el.style.background = bg;
        el.innerHTML = html;
        // ép reflow để transition chạy khi vừa tạo
        void el.offsetHeight;
        el.style.transform = 'translateY(0)';
    }

    function hideBanner() {
        if (!bannerEl) return;
        bannerEl.style.transform = 'translateY(-110%)';
    }

    function sinceText(ts) {
        if (!ts) return '';
        const sec = Math.round((Date.now() - ts) / 1000);
        if (sec < 60) return ` (${sec}s)`;
        return ` (${Math.round(sec / 60)} phút)`;
    }

    function render() {
        // Mất mạng phía client → đừng đổ lỗi cho server
        if (navigator.onLine === false) {
            lastBadKey = 'offline';
            showBanner('🔌 Mất kết nối mạng — kiểm tra Internet của bạn. Đang thử lại…', '#475569');
            return;
        }

        const down = [];
        const degraded = [];
        for (const key of Object.keys(SERVICES)) {
            const s = state[key];
            if (s.status === 'down') down.push(key);
            else if (s.status === 'degraded') degraded.push(key);
        }

        const badKey = down.join(',') + '|' + degraded.join(',');

        if (down.length === 0 && degraded.length === 0) {
            // Tất cả OK — nếu trước đó có lỗi → hiện toast "đã kết nối lại"
            if (lastBadKey && lastBadKey !== 'recovered') {
                lastBadKey = 'recovered';
                showBanner('✓ Đã kết nối lại máy chủ', '#059669');
                setTimeout(() => {
                    if (lastBadKey === 'recovered') {
                        hideBanner();
                        lastBadKey = '';
                    }
                }, RECOVERED_TOAST_MS);
            }
            return;
        }

        lastBadKey = badKey;
        if (down.length > 0) {
            const names = down.map((k) => SERVICES[k].label).join(' + ');
            const earliest = down
                .map((k) => state[k].since)
                .filter(Boolean)
                .sort()[0];
            showBanner(
                `⚠ Mất kết nối: <b>${names}</b>${sinceText(earliest)} — đang thử lại…`,
                '#dc2626'
            );
        } else {
            const names = degraded.map((k) => SERVICES[k].label).join(' + ');
            showBanner(
                `⚠ <b>${names}</b> đang chập chờn (có thể đang khởi động lại). Một số thao tác có thể chậm.`,
                '#d97706'
            );
        }
    }

    // ---- Poll loop ----
    let inFlight = false;
    async function tick() {
        if (inFlight) return;
        inFlight = true;
        try {
            const [r, w] = await Promise.all([checkRender(), checkWorker()]);
            applyResult('render', r);
            applyResult('worker', w);
            render();
        } catch (_) {
            // không để lỗi bất ngờ phá vòng lặp
        } finally {
            inFlight = false;
        }
    }

    function start() {
        if (timer) clearInterval(timer);
        tick(); // ping ngay
        timer = setInterval(() => {
            if (document.visibilityState === 'visible') tick();
        }, POLL_MS);
    }

    // Khi tab được focus lại → ping ngay (bắt nhanh trạng thái sau khi rời tab)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
    });
    window.addEventListener('online', tick);
    window.addEventListener('offline', render);

    // Expose để debug tay: window.__n2ServiceHealthMonitor.check()
    window.__n2ServiceHealthMonitor = {
        check: tick,
        state,
        config: { RENDER_HEALTH_URL, WORKER_PROBE_URL, POLL_MS, PROBE_TIMEOUT_MS },
    };

    // Khởi động sau khi DOM sẵn sàng (cần document.body cho banner)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
