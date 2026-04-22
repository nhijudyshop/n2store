// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone History Badges — hiển thị số cuộc gọi bên cạnh SĐT trong bảng đơn
// Hover → tooltip chi tiết (direction + time + duration + nhân viên)

const PhoneHistoryBadges = (() => {
    const API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall';
    const CACHE_TTL_MS = 2 * 60 * 1000; // 2 phút refresh
    const MAX_HISTORY_DAYS = 90;
    const MAX_ROWS = 5000;

    let callsByPhone = new Map(); // phone → calls[] (newest first)
    let lastLoadAt = 0;
    let loading = false;
    let tooltipEl = null;

    function stripPhone(s) { return String(s || '').replace(/[^\d+]/g, ''); }
    function _fmtDur(sec) { const n = parseInt(sec, 10) || 0; if (!n) return ''; const m = Math.floor(n/60); return m ? `${m}:${String(n%60).padStart(2,'0')}` : `${n}s`; }
    function _fmtTs(ts) {
        const ms = typeof ts === 'string' ? parseInt(ts, 10) : (ts || 0);
        if (!ms) return '';
        const d = new Date(ms);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    function _dirIcon(dir) { return dir === 'in' ? '↙' : dir === 'missed' ? '✕' : '↗'; }
    function _dirColor(dir) { return dir === 'in' ? '#60a5fa' : dir === 'missed' ? '#f87171' : '#4ade80'; }

    async function loadHistory(force = false) {
        if (loading) return;
        if (!force && callsByPhone.size > 0 && Date.now() - lastLoadAt < CACHE_TTL_MS) return;
        loading = true;
        try {
            const since = Date.now() - MAX_HISTORY_DAYS * 86400000;
            const r = await fetch(`${API}/call-history?from=${since}&limit=${MAX_ROWS}`, { cache: 'no-store' });
            const d = await r.json();
            if (d?.success) {
                const next = new Map();
                (d.rows || []).forEach(c => {
                    const p = stripPhone(c.phone);
                    if (!p) return;
                    if (!next.has(p)) next.set(p, []);
                    next.get(p).push(c);
                });
                // Ensure newest first per phone
                next.forEach(arr => arr.sort((a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10)));
                callsByPhone = next;
                lastLoadAt = Date.now();
                renderBadges();
            }
        } catch (err) { console.warn('[PhoneHistoryBadges]', err.message); }
        finally { loading = false; }
    }

    function getCountsFor(phone) {
        const p = stripPhone(phone);
        const calls = callsByPhone.get(p) || [];
        const counts = { total: calls.length, out: 0, in: 0, missed: 0 };
        calls.forEach(c => { counts[c.direction === 'missed' ? 'missed' : c.direction === 'in' ? 'in' : 'out']++; });
        return { counts, calls };
    }

    function _ensureStyles() {
        if (document.getElementById('phoneHistBadgeStyles')) return;
        const s = document.createElement('style');
        s.id = 'phoneHistBadgeStyles';
        s.textContent = `
        .phone-hist-badge {
            display: inline-flex; align-items: center; gap: 2px;
            background: rgba(59,130,246,.12); color: #1d4ed8;
            font-size: 10px; font-weight: 700; padding: 2px 6px;
            border-radius: 10px; cursor: pointer; margin-left: 4px;
            transition: transform .1s, background .1s;
            user-select: none; line-height: 1.3;
        }
        .phone-hist-badge:hover { background: rgba(59,130,246,.25); transform: scale(1.05); }
        .phone-hist-badge.has-missed { background: rgba(239,68,68,.15); color: #b91c1c; }
        .phone-hist-badge.has-missed:hover { background: rgba(239,68,68,.28); }
        .phone-hist-tooltip {
            position: fixed; z-index: 100000; pointer-events: none;
            background: #0f172a; color: #e2e8f0;
            padding: 10px 12px; border-radius: 8px; font-size: 11px;
            min-width: 260px; max-width: 340px;
            box-shadow: 0 12px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            animation: phb-fade .15s ease-out;
        }
        @keyframes phb-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .phone-hist-tooltip .phb-head {
            font-weight: 700; margin-bottom: 6px; padding-bottom: 6px;
            border-bottom: 1px solid rgba(255,255,255,.1);
            display: flex; justify-content: space-between; align-items: center; gap: 8px;
        }
        .phone-hist-tooltip .phb-phone { font-family: 'SF Mono', Monaco, monospace; color: #93c5fd; }
        .phone-hist-tooltip .phb-stats { display: flex; gap: 8px; font-size: 10px; font-weight: 600; }
        .phone-hist-tooltip .phb-stats span { opacity: .85; }
        .phone-hist-tooltip .phb-list { display: flex; flex-direction: column; gap: 4px; }
        .phone-hist-tooltip .phb-row {
            display: grid; grid-template-columns: 18px 1fr auto auto;
            gap: 6px; align-items: center; font-size: 10.5px; line-height: 1.4;
        }
        .phone-hist-tooltip .phb-dir { font-weight: 700; text-align: center; }
        .phone-hist-tooltip .phb-meta { color: #94a3b8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .phone-hist-tooltip .phb-meta b { color: #e2e8f0; }
        .phone-hist-tooltip .phb-dur { color: #cbd5e1; font-family: 'SF Mono', Monaco, monospace; font-size: 10px; }
        .phone-hist-tooltip .phb-user { color: #a78bfa; font-size: 10px; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .phone-hist-tooltip .phb-more { font-size: 10px; color: #64748b; text-align: center; margin-top: 4px; }
        `;
        document.head.appendChild(s);
    }

    function _showTooltip(target, phone) {
        _ensureStyles();
        const { counts, calls } = getCountsFor(phone);
        if (!calls.length) return;

        if (tooltipEl) tooltipEl.remove();
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'phone-hist-tooltip';

        const statsParts = [];
        if (counts.out) statsParts.push(`<span style="color:#4ade80">↗ ${counts.out}</span>`);
        if (counts.in) statsParts.push(`<span style="color:#60a5fa">↙ ${counts.in}</span>`);
        if (counts.missed) statsParts.push(`<span style="color:#f87171">✕ ${counts.missed}</span>`);

        const recent = calls.slice(0, 8);
        tooltipEl.innerHTML = `
            <div class="phb-head">
                <span class="phb-phone">${phone}</span>
                <div class="phb-stats">${statsParts.join('')}</div>
            </div>
            <div class="phb-list">
                ${recent.map(c => `
                    <div class="phb-row">
                        <span class="phb-dir" style="color:${_dirColor(c.direction)}">${_dirIcon(c.direction)}</span>
                        <span class="phb-meta">${_fmtTs(c.timestamp)}${c.name ? ` · <b>${(c.name || '').slice(0,20)}</b>` : ''}</span>
                        <span class="phb-dur">${_fmtDur(c.duration)}</span>
                        <span class="phb-user">${(c.username || '').slice(0, 8)}</span>
                    </div>
                `).join('')}
            </div>
            ${calls.length > recent.length ? `<div class="phb-more">+ ${calls.length - recent.length} cuộc gọi khác</div>` : ''}
        `;
        document.body.appendChild(tooltipEl);

        const rect = target.getBoundingClientRect();
        const ttRect = tooltipEl.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;
        if (top + ttRect.height > window.innerHeight - 8) top = rect.top - ttRect.height - 6;
        if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
        if (left < 8) left = 8;
        tooltipEl.style.top = top + 'px';
        tooltipEl.style.left = left + 'px';
    }
    function _hideTooltip() {
        if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    }

    function _badgeContent(counts) {
        return `📞 ${counts.total}${counts.missed ? ` <span style="color:#b91c1c">✕${counts.missed}</span>` : ''}`;
    }
    function _updateBadge(badge, phone, counts) {
        const wantMissed = counts.missed > 0;
        const hasMissed = badge.classList.contains('has-missed');
        if (wantMissed !== hasMissed) badge.classList.toggle('has-missed', wantMissed);
        const sig = `${counts.total}|${counts.missed}`;
        if (badge.dataset.sig !== sig) {
            badge.dataset.sig = sig;
            badge.innerHTML = _badgeContent(counts);
        }
        badge.dataset.phone = phone;
    }
    function _makeBadge(phone, counts) {
        const badge = document.createElement('span');
        badge.className = 'phone-hist-badge' + (counts.missed > 0 ? ' has-missed' : '');
        badge.dataset.phone = phone;
        badge.dataset.sig = `${counts.total}|${counts.missed}`;
        badge.innerHTML = _badgeContent(counts);
        badge.addEventListener('mouseenter', () => _showTooltip(badge, phone));
        badge.addEventListener('mouseleave', _hideTooltip);
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            try { window.PhoneWidget?.makeCall?.(phone); } catch {}
        });
        return badge;
    }

    function renderBadges() {
        _ensureStyles();
        const cells = document.querySelectorAll('td[data-column="phone"]');
        cells.forEach(cell => {
            const container = cell.querySelector('div') || cell;
            const existing = container.querySelector('.phone-hist-badge');
            // Extract phone from cell (last span)
            const span = cell.querySelector('span:last-of-type');
            const phoneText = span?.textContent || cell.textContent || '';
            const phone = stripPhone(phoneText);
            if (!phone) { if (existing) existing.remove(); return; }
            const { counts } = getCountsFor(phone);
            if (counts.total === 0) { if (existing) existing.remove(); return; }
            // Idempotent: keep existing badge — only update content if counts changed
            // (avoids remove→recreate flicker that kills the tooltip mid-hover)
            if (existing && existing.dataset.phone === phone) {
                _updateBadge(existing, phone, counts);
                return;
            }
            if (existing) existing.remove();
            container.appendChild(_makeBadge(phone, counts));
        });
    }

    // Debounced re-render on table mutations.
    // Skip while tooltip is open — re-rendering under the cursor causes flicker.
    let renderDebounceTimer = null;
    function scheduleRender() {
        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        renderDebounceTimer = setTimeout(() => {
            renderDebounceTimer = null;
            if (tooltipEl) { scheduleRender(); return; } // retry after mouse leaves
            renderBadges();
        }, 400);
    }

    function _observeTable() {
        const table = document.querySelector('#ordersTable') || document.querySelector('.orders-table') || document.querySelector('table');
        if (!table) { setTimeout(_observeTable, 1000); return; }
        const observer = new MutationObserver(() => scheduleRender());
        observer.observe(table, { childList: true, subtree: true });
        renderBadges();
    }

    // Public API
    function refresh() { return loadHistory(true); }
    function getStats(phone) { return getCountsFor(phone); }

    // Boot: load history after table likely rendered
    if (typeof window !== 'undefined') {
        setTimeout(() => { loadHistory().then(_observeTable); }, 3000);
        // Auto-refresh every 2 min (in case new calls logged)
        setInterval(() => loadHistory(), CACHE_TTL_MS);
    }

    return { refresh, getStats, renderBadges };
})();

if (typeof window !== 'undefined') window.PhoneHistoryBadges = PhoneHistoryBadges;
