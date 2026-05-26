// #Note: WEB2.0 module. Admin SSE Monitor page logic — đọc/hiển thị live SSE activity từ server. | Đọc CLAUDE.md, docs/web2/SSE-REALTIME.md trước khi sửa.
(function () {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2';
    const STATS_POLL_MS = 2000;
    const MAX_LOG_ROWS = 1000; // keep last N rows in DOM
    const ADMIN_TOPIC = 'web2:_admin:sse-log';

    // -----------------------------------------------------
    // Admin gate — same pattern as navigation-modern.js
    // -----------------------------------------------------
    function isAdmin() {
        try {
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
            const userType = localStorage.getItem('userType') || '';
            return (
                auth.isAdmin === true ||
                auth.roleTemplate === 'admin' ||
                userType.startsWith('admin')
            );
        } catch {
            return false;
        }
    }

    function showAccessDenied() {
        const gate = document.getElementById('ssGate');
        gate.innerHTML = `
            <div class="sse-access-denied">
                <h2 style="margin:0 0 10px;color:#b91c1c;">🚫 Chỉ admin truy cập được trang này</h2>
                <p style="color:#6b7280;font-size:13.5px;">
                    SSE Monitor cho phép xem realtime hoạt động pub/sub của Web 2.0.
                    Yêu cầu tài khoản có quyền admin (<code>isAdmin === true</code> hoặc
                    <code>roleTemplate === 'admin'</code>).
                </p>
                <p style="margin-top:14px;"><a href="../overview/index.html">← Về trang Tổng quan</a></p>
            </div>`;
    }

    // -----------------------------------------------------
    // State
    // -----------------------------------------------------
    let eventCount = 0;
    let paused = false;
    let filterText = '';
    let lastSeq = 0;

    // -----------------------------------------------------
    // DOM helpers
    // -----------------------------------------------------
    const $ = (id) => document.getElementById(id);

    function esc(s) {
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
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
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
        // Strip placeholder empty row
        const empty = log.querySelector('.sse-empty');
        if (empty) empty.remove();
        const row = document.createElement('div');
        row.className = 'sse-log-row' + (opts.fresh ? ' new' : '');
        row.innerHTML = `
            <span class="sse-log-ts">${fmtTime(entry.ts)}</span>
            <span class="sse-log-tag ${tagClass(entry)}">${esc(entry.type)}</span>
            <span class="sse-log-body">${renderLogBody(entry)}</span>`;
        log.appendChild(row);
        // Trim excess
        while (log.children.length > MAX_LOG_ROWS) {
            log.removeChild(log.firstChild);
        }
        // Auto scroll if user is already at bottom
        if (opts.fresh) {
            const panel = log;
            const nearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
            if (nearBottom) panel.scrollTop = panel.scrollHeight;
            // remove "new" tint after a moment
            setTimeout(() => row.classList.remove('new'), 1500);
        }
        if (entry.seq && entry.seq > lastSeq) lastSeq = entry.seq;
    }

    function rerenderAllLogs(entries) {
        const log = $('ssLog');
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
            const r = await fetch(`${API_BASE}/sse/stats`, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            $('ssStatClients').textContent = d.totalClients ?? 0;
            $('ssStatTopics').textContent = d.uniqueKeys ?? 0;
            $('ssStatsTime').textContent =
                'cập nhật ' + new Date(d.timestamp || Date.now()).toLocaleTimeString('vi-VN');
            renderTopics(d.keyStats);
        } catch (e) {
            $('ssStatsTime').textContent = '⚠ lỗi: ' + e.message;
        }
    }

    // -----------------------------------------------------
    // Bootstrap: fetch buffer + subscribe live
    // -----------------------------------------------------
    async function bootstrapLog() {
        try {
            const r = await fetch(`${API_BASE}/sse/log?limit=200`, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            $('ssStatBuffer').textContent = '#' + (d.currentSeq || 0);
            const entries = (d.entries || []).filter(matchesFilter);
            rerenderAllLogs(entries);
            lastSeq = d.currentSeq || 0;
        } catch (e) {
            $('ssLog').innerHTML =
                '<div class="sse-empty">⚠ Không load được log buffer: ' + esc(e.message) + '</div>';
        }
    }

    function subscribeLive() {
        if (!window.Web2SSE?.subscribe) {
            $('ssConnLabel').textContent = '⚠ Web2SSE bridge chưa load';
            $('ssConnDot').classList.add('error');
            return;
        }
        $('ssConnDot').classList.add('live');
        $('ssConnLabel').textContent = `live · subscribe ${ADMIN_TOPIC}`;
        window.Web2SSE.subscribe(ADMIN_TOPIC, (msg) => {
            if (paused) return;
            const entry = msg?.data;
            if (!entry) return;
            eventCount++;
            $('ssStatEvents').textContent = eventCount;
            $('ssStatBuffer').textContent = '#' + (entry.seq || lastSeq);
            appendLogRow(entry, { fresh: true });
        });
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
            // Re-fetch buffer to apply filter consistently
            bootstrapLog();
        });

        $('ssTrigger').addEventListener('click', async () => {
            const key = prompt(
                'Trigger test event trên topic nào? (vd web2:test-topic)',
                'web2:test-topic'
            );
            if (!key) return;
            try {
                const r = await fetch(`${API_BASE}/sse/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key,
                        data: { action: 'admin-trigger', ts: Date.now() },
                    }),
                });
                const d = await r.json();
                alert(
                    d.success
                        ? `✓ Broadcast ${key} → ${d.clientsNotified} clients`
                        : '✗ Lỗi: ' + (d.error || 'unknown')
                );
            } catch (e) {
                alert('✗ Network error: ' + e.message);
            }
        });
    }

    // -----------------------------------------------------
    // Entry
    // -----------------------------------------------------
    function init() {
        if (!isAdmin()) {
            showAccessDenied();
            return;
        }
        $('ssApp').style.display = '';
        wireToolbar();
        bootstrapLog();
        subscribeLive();
        pollStats();
        setInterval(pollStats, STATS_POLL_MS);

        // Pause when tab hidden to save bandwidth
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') pollStats();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
