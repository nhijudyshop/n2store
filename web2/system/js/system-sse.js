// #Note: WEB2.0 module — System / Cấu hình → tab "Realtime (SSE)". Admin-gated.
// Đọc/hiển thị live SSE activity từ server. Tách từ admin-sse-monitor/js/monitor.js;
// lazy-start (chỉ kết nối EventSource khi mở tab). | Đọc CLAUDE.md, docs/web2/SSE-REALTIME.md trước khi sửa.
(function () {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2';
    const USERS_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-users';
    const STATS_POLL_MS = 2000;
    const MAX_LOG_ROWS = 1000;
    const ADMIN_TOPIC = 'web2:_admin:sse-log';

    // -----------------------------------------------------
    // Token + admin gate — XÁC THỰC QUA SERVER (không tin localStorage thuần).
    // -----------------------------------------------------
    function authToken() {
        try {
            const t = window.Web2Auth?.getStored?.()?.token;
            if (t) return t;
            const raw = localStorage.getItem('web2_users_session');
            if (raw) return JSON.parse(raw)?.token || '';
        } catch (_) {}
        return '';
    }

    async function isAdmin() {
        const token = authToken();
        if (!token) return false;
        try {
            const r = await fetch(`${USERS_API}/me`, {
                headers: { 'x-web2-token': token },
                cache: 'no-store',
            });
            if (!r.ok) return false;
            const d = await r.json();
            return d?.success === true && d?.user?.role === 'admin';
        } catch (_) {
            return false;
        }
    }

    function showAccessDenied() {
        const gate = document.getElementById('ssGate');
        if (!gate) return;
        gate.innerHTML = `
            <div class="sse-access-denied">
                <h2 style="margin:0 0 10px;color:#b91c1c;">🚫 Chỉ admin xem được mục Realtime (SSE)</h2>
                <p style="color:var(--web2-text-3);font-size:13.5px;">
                    SSE Monitor cho phép xem realtime hoạt động pub/sub của Web 2.0.
                    Yêu cầu tài khoản có quyền admin (<code>role === 'admin'</code>).
                    Các tab khác (Dịch vụ, Các trang) vẫn dùng bình thường.
                </p>
            </div>`;
    }

    // -----------------------------------------------------
    // State
    // -----------------------------------------------------
    let eventCount = 0;
    let paused = false;
    let filterText = '';
    let lastSeq = 0;
    let _started = false;
    let _statsTimer = null;
    let _topicsHadData = false; // first-load guard cho skeleton danh sách topic

    const $ = (id) => document.getElementById(id);

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );
    }

    function fmtTime(ts) {
        // GMT+7 (Asia/Ho_Chi_Minh) — convention Web 2.0.
        const d = new Date(ts);
        const p = new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh',
        }).format(d);
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${p}.${ms}`;
    }

    function renderLogBody(entry) {
        if (entry.type === 'connect') {
            const keys = (entry.keys || []).map(esc).join(', ');
            return `<strong>${esc(entry.connectionId || '?')}</strong> watching <span class="muted">[${keys}]</span> · total=${entry.totalClients}`;
        }
        if (entry.type === 'disconnect') {
            return `<strong>${esc(entry.connectionId || '?')}</strong> after <span class="muted">${entry.durationSec}s</span> · total=${entry.totalClients}`;
        }
        if (entry.type === 'notify') {
            const action = entry.action ? ` · action=<strong>${esc(entry.action)}</strong>` : '';
            const code = entry.code ? ` · code=<span class="muted">${esc(entry.code)}</span>` : '';
            return `<strong>${esc(entry.topic || '?')}</strong> → ${entry.clientsNotified} clients${action}${code}`;
        }
        return esc(JSON.stringify(entry));
    }

    function tagClass(entry) {
        if (entry.type === 'connect') return 'connect';
        if (entry.type === 'disconnect') return 'disconnect';
        if (entry.type === 'notify') return entry.clientsNotified > 0 ? 'notify' : 'notify-0';
        return '';
    }

    function matchesFilter(entry) {
        if (!filterText) return true;
        const hay = JSON.stringify(entry).toLowerCase();
        return hay.includes(filterText.toLowerCase());
    }

    function appendLogRow(entry, opts = {}) {
        if (!matchesFilter(entry)) return;
        const log = $('ssLog');
        if (!log) return;
        const empty = log.querySelector('.sse-empty');
        if (empty) empty.remove();
        const row = document.createElement('div');
        row.className = 'sse-log-row' + (opts.fresh ? ' new' : '');
        row.innerHTML = `
            <span class="sse-log-ts">${fmtTime(entry.ts)}</span>
            <span class="sse-log-tag ${tagClass(entry)}">${esc(entry.type)}</span>
            <span class="sse-log-body">${renderLogBody(entry)}</span>`;
        log.appendChild(row);
        while (log.children.length > MAX_LOG_ROWS) log.removeChild(log.firstChild);
        if (opts.fresh) {
            const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
            if (nearBottom) log.scrollTop = log.scrollHeight;
            setTimeout(() => row.classList.remove('new'), 1500);
        }
        if (entry.seq && entry.seq > lastSeq) lastSeq = entry.seq;
    }

    function rerenderAllLogs(entries) {
        const log = $('ssLog');
        if (!log) return;
        log.innerHTML = '';
        if (!entries.length) {
            log.innerHTML = '<div class="sse-empty">(chưa có log nào)</div>';
            return;
        }
        for (const e of entries) appendLogRow(e, { fresh: false });
        log.scrollTop = log.scrollHeight;
    }

    function renderTopics(keyStats) {
        const el = $('ssTopicsList');
        if (!el) return;
        const entries = Object.entries(keyStats || {}).sort((a, b) => b[1] - a[1]);
        if (!entries.length) {
            el.innerHTML = '<div class="sse-empty">Chưa có topic nào active</div>';
            return;
        }
        el.innerHTML = entries
            .map(
                ([topic, count]) =>
                    `<div class="sse-topic-row" title="${esc(topic)}">
                        <span class="sse-topic-name">${esc(topic)}</span>
                        <span class="sse-topic-count">${count}</span>
                    </div>`
            )
            .join('');
    }

    // -----------------------------------------------------
    // Stats polling
    // -----------------------------------------------------
    async function pollStats() {
        try {
            const r = await fetch(`${API_BASE}/sse/stats`, {
                cache: 'no-store',
                headers: { 'x-web2-token': authToken() },
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            $('ssStatClients').textContent = d.totalClients ?? 0;
            $('ssStatTopics').textContent = d.uniqueKeys ?? 0;
            $('ssStatsTime').textContent =
                'cập nhật ' +
                new Date(d.timestamp || Date.now()).toLocaleTimeString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                });
            renderTopics(d.keyStats);
            _topicsHadData = true;
        } catch (e) {
            const t = $('ssStatsTime');
            if (t) t.textContent = '⚠ lỗi: ' + e.message;
            // Xóa skeleton first-load nếu poll đầu lỗi → không đứng hình.
            if (!_topicsHadData) {
                const el = $('ssTopicsList');
                if (el)
                    el.innerHTML =
                        '<div class="sse-empty">⚠ Không tải được topics: ' +
                        esc(e.message) +
                        '</div>';
            }
        }
    }

    // -----------------------------------------------------
    // Bootstrap: fetch buffer + subscribe live
    // -----------------------------------------------------
    async function bootstrapLog() {
        try {
            const r = await fetch(`${API_BASE}/sse/log?limit=200`, {
                cache: 'no-store',
                headers: { 'x-web2-token': authToken() },
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            $('ssStatBuffer').textContent = '#' + (d.currentSeq || 0);
            const entries = (d.entries || []).filter(matchesFilter);
            rerenderAllLogs(entries);
            lastSeq = d.currentSeq || 0;
        } catch (e) {
            const log = $('ssLog');
            if (log)
                log.innerHTML =
                    '<div class="sse-empty">⚠ Không load được log buffer: ' +
                    esc(e.message) +
                    '</div>';
        }
    }

    function setConn(state, label) {
        const wrap = $('sysConn');
        const dot = $('sysConnDot');
        const lab = $('sysConnLabel');
        if (wrap) wrap.hidden = false;
        if (dot) {
            dot.classList.remove('live', 'error');
            if (state) dot.classList.add(state);
        }
        if (lab && label != null) lab.textContent = label;
    }

    function subscribeLive() {
        // Server yêu cầu ?admintoken= cho key web2:_admin:* + đẩy bằng `event: log`
        // → mở EventSource trực tiếp (bridge không hỗ trợ 2 điểm này).
        const token = authToken();
        const url = `${API_BASE}/sse?keys=${encodeURIComponent(ADMIN_TOPIC)}&admintoken=${encodeURIComponent(token)}`;
        let es;
        try {
            es = new EventSource(url);
        } catch (e) {
            setConn('error', 'EventSource lỗi: ' + e.message);
            return;
        }
        es.addEventListener('connected', () => {
            setConn('live', `live · ${ADMIN_TOPIC}`);
        });
        es.addEventListener('log', (ev) => {
            if (paused) return;
            let payload = null;
            try {
                payload = JSON.parse(ev.data);
            } catch (_) {
                return;
            }
            const entry = payload?.data;
            if (!entry) return;
            eventCount++;
            $('ssStatEvents').textContent = eventCount;
            $('ssStatBuffer').textContent = '#' + (entry.seq || lastSeq);
            appendLogRow(entry, { fresh: true });
        });
        es.onerror = () => {
            setConn('error', 'mất kết nối — đang reconnect…');
        };
    }

    // -----------------------------------------------------
    // Toolbar wiring
    // -----------------------------------------------------
    function wireToolbar() {
        $('ssPause').addEventListener('click', () => {
            paused = !paused;
            const btn = $('ssPause');
            btn.classList.toggle('active', paused);
            btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
        });

        $('ssClear').addEventListener('click', () => {
            $('ssLog').innerHTML = '<div class="sse-empty">(đã xóa — chờ event mới)</div>';
            eventCount = 0;
            $('ssStatEvents').textContent = 0;
        });

        $('ssFilter').addEventListener('input', (e) => {
            filterText = e.target.value.trim();
            bootstrapLog();
        });

        $('ssTrigger').addEventListener('click', async () => {
            const key = await Popup.prompt(
                'Trigger test event trên topic nào? (vd web2:test-topic)',
                { defaultValue: 'web2:test-topic' }
            );
            if (!key) return;
            try {
                const r = await fetch(`${API_BASE}/sse/test`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-web2-token': authToken(),
                    },
                    body: JSON.stringify({
                        key,
                        data: { action: 'admin-trigger', ts: Date.now() },
                    }),
                });
                const d = await r.json();
                Popup.alert(
                    d.success
                        ? `✓ Broadcast ${key} → ${d.clientsNotified} clients`
                        : '✗ Lỗi: ' + (d.error || 'unknown')
                );
            } catch (e) {
                Popup.error('✗ Network error: ' + e.message);
            }
        });
    }

    function _scheduleStatsPoll() {
        clearTimeout(_statsTimer);
        _statsTimer = setTimeout(async () => {
            if (document.visibilityState === 'visible') await pollStats();
            _scheduleStatsPoll();
        }, STATS_POLL_MS);
    }

    // -----------------------------------------------------
    // Lazy start (gọi lần đầu khi mở tab SSE). Idempotent.
    // -----------------------------------------------------
    async function start() {
        if (_started) {
            pollStats();
            return;
        }
        if (!(await isAdmin())) {
            showAccessDenied();
            return;
        }
        _started = true;
        const app = $('ssApp');
        if (app) app.style.display = '';
        // Sổ tay SSE (registry tĩnh) — render 1 lần khi mở tab (đừng sửa hỏng doc).
        window.SystemSSERegistry?.render?.();
        setConn('', 'Đang kết nối…');
        // First-load skeleton cho danh sách topic (overwrite bởi renderTopics/poll-error).
        if (!_topicsHadData && window.Web2Skeleton) {
            window.Web2Skeleton.list('#ssTopicsList', { count: 6, avatar: false });
        }
        wireToolbar();
        bootstrapLog();
        subscribeLive();
        pollStats();
        _scheduleStatsPoll();

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && _started) pollStats();
        });
        window.addEventListener('pagehide', () => clearTimeout(_statsTimer));
    }

    window.SystemSSE = { start, reload: () => (_started ? pollStats() : start()) };
})();
