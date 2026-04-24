// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone History Badges — hiển thị số cuộc gọi bên cạnh SĐT trong bảng đơn
// Hover → tooltip chi tiết (direction + time + duration + nhân viên)

const PhoneHistoryBadges = (() => {
    const API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall';
    const CACHE_TTL_MS = 2 * 60 * 1000; // 2 phút refresh
    const MAX_HISTORY_DAYS = 90;
    const MAX_ROWS = 5000;

    let callsByPhone = new Map(); // phone → calls[] (newest first)
    let recordingsByPhone = new Map(); // phone → recordings[] (newest first)
    let lastLoadAt = 0;
    let loading = false;
    let tooltipEl = null;

    function stripPhone(s) {
        return String(s || '').replace(/[^\d+]/g, '');
    }
    function _fmtDur(sec) {
        const n = parseInt(sec, 10) || 0;
        if (!n) return '';
        const m = Math.floor(n / 60);
        return m ? `${m}:${String(n % 60).padStart(2, '0')}` : `${n}s`;
    }
    function _fmtTs(ts) {
        const ms = typeof ts === 'string' ? parseInt(ts, 10) : ts || 0;
        if (!ms) return '';
        const d = new Date(ms);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function _dirIcon(dir) {
        return dir === 'in' ? '↙' : dir === 'missed' ? '✕' : '↗';
    }
    function _dirColor(dir) {
        return dir === 'in' ? '#60a5fa' : dir === 'missed' ? '#f87171' : '#4ade80';
    }

    async function loadHistory(force = false) {
        if (loading) return;
        // Cache by `lastLoadAt` — works even when both maps are empty (no
        // history + no recordings) so we don't hammer the API.
        if (!force && lastLoadAt > 0 && Date.now() - lastLoadAt < CACHE_TTL_MS) return;
        loading = true;
        try {
            const since = Date.now() - MAX_HISTORY_DAYS * 86400000;
            const [historyRes, recRes] = await Promise.all([
                fetch(`${API}/call-history?from=${since}&limit=${MAX_ROWS}`, {
                    cache: 'no-store',
                }).then((r) => r.json()).catch(() => ({})),
                fetch(`${API}/call-recordings?limit=${MAX_ROWS}`, {
                    cache: 'no-store',
                }).then((r) => r.json()).catch(() => ({})),
            ]);

            const next = new Map();
            if (historyRes?.success) {
                (historyRes.rows || []).forEach((c) => {
                    const p = stripPhone(c.phone);
                    if (!p) return;
                    if (!next.has(p)) next.set(p, []);
                    next.get(p).push(c);
                });
                next.forEach((arr) =>
                    arr.sort((a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10))
                );
            }
            callsByPhone = next;

            const recMap = new Map();
            if (Array.isArray(recRes?.rows)) {
                recRes.rows.forEach((rec) => {
                    const p = stripPhone(rec.phone);
                    if (!p) return;
                    if (!recMap.has(p)) recMap.set(p, []);
                    recMap.get(p).push(rec);
                });
                recMap.forEach((arr) =>
                    arr.sort((a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10))
                );
            }
            recordingsByPhone = recMap;

            lastLoadAt = Date.now();
            renderBadges();
        } catch (err) {
            console.warn('[PhoneHistoryBadges]', err.message);
        } finally {
            loading = false;
        }
    }

    function getCountsFor(phone) {
        const p = stripPhone(phone);
        const calls = callsByPhone.get(p) || [];
        const recordings = recordingsByPhone.get(p) || [];
        const counts = {
            total: calls.length,
            out: 0,
            in: 0,
            missed: 0,
            recordings: recordings.length,
        };
        calls.forEach((c) => {
            counts[c.direction === 'missed' ? 'missed' : c.direction === 'in' ? 'in' : 'out']++;
        });
        return { counts, calls, recordings };
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
        .phone-hist-badge.has-recording { background: rgba(124,58,237,.12); color: #6d28d9; border: 1px solid rgba(124,58,237,.3); }
        .phone-hist-badge.has-recording:hover { background: rgba(124,58,237,.22); }
        .phone-hist-badge.has-recording.has-missed { background: rgba(239,68,68,.15); color: #b91c1c; border: 1px solid rgba(239,68,68,.3); }
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
        const { counts, calls, recordings } = getCountsFor(phone);
        if (!calls.length && !recordings.length) return;

        if (tooltipEl) tooltipEl.remove();
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'phone-hist-tooltip';

        const statsParts = [];
        if (counts.out) statsParts.push(`<span style="color:#4ade80">↗ ${counts.out}</span>`);
        if (counts.in) statsParts.push(`<span style="color:#60a5fa">↙ ${counts.in}</span>`);
        if (counts.missed) statsParts.push(`<span style="color:#f87171">✕ ${counts.missed}</span>`);
        if (counts.recordings)
            statsParts.push(`<span style="color:#c4b5fd">▶ ${counts.recordings} ghi âm</span>`);

        const rowsArr = calls.length ? calls : recordings;
        const recent = rowsArr.slice(0, 8);
        tooltipEl.innerHTML = `
            <div class="phb-head">
                <span class="phb-phone">${phone}</span>
                <div class="phb-stats">${statsParts.join('')}</div>
            </div>
            <div class="phb-list">
                ${recent
                    .map(
                        (c) => `
                    <div class="phb-row">
                        <span class="phb-dir" style="color:${_dirColor(c.direction)}">${_dirIcon(c.direction)}</span>
                        <span class="phb-meta">${_fmtTs(c.timestamp)}${c.name ? ` · <b>${(c.name || '').slice(0, 20)}</b>` : ''}</span>
                        <span class="phb-dur">${_fmtDur(c.duration)}</span>
                        <span class="phb-user">${(c.username || '').slice(0, 8)}</span>
                    </div>
                `
                    )
                    .join('')}
            </div>
            ${rowsArr.length > recent.length ? `<div class="phb-more">+ ${rowsArr.length - recent.length} mục khác — bấm để mở</div>` : '<div class="phb-more">Bấm để mở + nghe ghi âm</div>'}
        `;
        document.body.appendChild(tooltipEl);

        const rect = target.getBoundingClientRect();
        const ttRect = tooltipEl.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;
        if (top + ttRect.height > window.innerHeight - 8) top = rect.top - ttRect.height - 6;
        if (left + ttRect.width > window.innerWidth - 8)
            left = window.innerWidth - ttRect.width - 8;
        if (left < 8) left = 8;
        tooltipEl.style.top = top + 'px';
        tooltipEl.style.left = left + 'px';
    }
    function _hideTooltip() {
        if (tooltipEl) {
            tooltipEl.remove();
            tooltipEl = null;
        }
    }

    function _badgeContent(counts) {
        const hasCalls = counts.total > 0;
        const parts = [];
        if (hasCalls) {
            parts.push(`📞 ${counts.total}`);
            if (counts.missed) parts.push(`<span style="color:#b91c1c">✕${counts.missed}</span>`);
        }
        if (counts.recordings > 0) {
            parts.push(
                `<span class="phb-rec-ico" style="color:#7c3aed">▶ ${counts.recordings}</span>`
            );
        }
        return parts.join(' ');
    }
    function _updateBadge(badge, phone, counts) {
        const wantMissed = counts.missed > 0;
        const hasMissed = badge.classList.contains('has-missed');
        if (wantMissed !== hasMissed) badge.classList.toggle('has-missed', wantMissed);
        const wantRec = counts.recordings > 0;
        const hasRec = badge.classList.contains('has-recording');
        if (wantRec !== hasRec) badge.classList.toggle('has-recording', wantRec);
        const sig = `${counts.total}|${counts.missed}|${counts.recordings}`;
        if (badge.dataset.sig !== sig) {
            badge.dataset.sig = sig;
            badge.innerHTML = _badgeContent(counts);
        }
        badge.dataset.phone = phone;
    }
    function _isAdmin() {
        try {
            return !!window.authManager?.isAdminTemplate?.();
        } catch {
            return false;
        }
    }

    function _esc(s) {
        return String(s == null ? '' : s).replace(
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

    function _ensureModalStyles() {
        if (document.getElementById('phoneHistModalStyles')) return;
        const s = document.createElement('style');
        s.id = 'phoneHistModalStyles';
        s.textContent = `
        .phm-overlay {
            position: fixed; inset: 0; z-index: 100001;
            background: rgba(15,23,42,.55); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            animation: phm-fade .15s ease-out;
        }
        @keyframes phm-fade { from { opacity: 0; } to { opacity: 1; } }
        .phm-modal {
            background: #fff; border-radius: 14px; width: min(620px, 92vw);
            max-height: 86vh; display: flex; flex-direction: column;
            box-shadow: 0 24px 64px rgba(0,0,0,.45), 0 0 0 1px rgba(15,23,42,.1);
            overflow: hidden; animation: phm-pop .18s cubic-bezier(.16,1,.3,1);
        }
        @keyframes phm-pop { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .phm-head {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; padding: 14px 18px; border-bottom: 1px solid #e2e8f0;
        }
        .phm-head h3 {
            margin: 0; font-size: 15px; color: #0f172a;
            display: flex; align-items: center; gap: 8px;
        }
        .phm-head .phm-phone {
            font-family: 'SF Mono', Monaco, monospace; color: #1d4ed8;
            background: rgba(59,130,246,.1); padding: 3px 8px; border-radius: 6px;
            font-size: 13px;
        }
        .phm-close {
            background: none; border: none; cursor: pointer; font-size: 22px;
            color: #94a3b8; line-height: 1; padding: 0 4px;
        }
        .phm-close:hover { color: #0f172a; }
        .phm-tabs {
            display: flex; gap: 2px; padding: 0 18px;
            border-bottom: 1px solid #e2e8f0; background: #f8fafc;
        }
        .phm-tab {
            padding: 10px 16px; border: none; background: transparent; cursor: pointer;
            font-size: 13px; font-weight: 600; color: #64748b;
            border-bottom: 2px solid transparent; transition: all .12s;
            display: inline-flex; align-items: center; gap: 6px;
        }
        .phm-tab:hover { color: #0f172a; }
        .phm-tab.active { color: #4f46e5; border-bottom-color: #4f46e5; background: #fff; }
        .phm-tab .phm-count {
            background: #e2e8f0; color: #475569; font-size: 10px;
            padding: 1px 7px; border-radius: 10px; font-weight: 700;
        }
        .phm-tab.active .phm-count { background: rgba(79,70,229,.15); color: #4f46e5; }
        .phm-body { flex: 1; overflow-y: auto; padding: 14px 18px; background: #fff; }
        .phm-empty { text-align: center; color: #94a3b8; padding: 36px 12px; font-size: 13px; }
        .phm-loading { text-align: center; color: #94a3b8; padding: 28px; font-size: 12px; }

        .phm-row {
            display: grid; grid-template-columns: 22px 1fr auto;
            gap: 10px; align-items: center;
            padding: 10px 12px; border-radius: 8px;
            border: 1px solid #e2e8f0; margin-bottom: 8px;
            transition: background .1s, border-color .1s;
        }
        .phm-row:hover { background: #f8fafc; border-color: #cbd5e1; }
        .phm-row .phm-dir { font-weight: 700; text-align: center; font-size: 14px; }
        .phm-row .phm-meta { font-size: 12px; line-height: 1.5; min-width: 0; }
        .phm-row .phm-when { color: #0f172a; font-weight: 600; }
        .phm-row .phm-sub {
            color: #64748b; font-size: 11px; margin-top: 2px;
            display: flex; gap: 8px; flex-wrap: wrap;
        }
        .phm-row .phm-sub b { color: #334155; font-weight: 600; }
        .phm-row .phm-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .phm-row audio { width: 240px; height: 32px; }

        .phm-foot {
            padding: 12px 18px; border-top: 1px solid #e2e8f0;
            background: #f8fafc; display: flex; gap: 8px; justify-content: space-between;
            align-items: center; flex-wrap: wrap;
        }
        .phm-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 7px 12px; border-radius: 7px; font-size: 12px; font-weight: 600;
            border: 1px solid #e2e8f0; background: #fff; color: #0f172a;
            cursor: pointer; text-decoration: none;
        }
        .phm-btn:hover { background: #f1f5f9; }
        .phm-btn.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
        .phm-btn.primary:hover { background: #4338ca; }
        .phm-btn.green { background: #16a34a; border-color: #16a34a; color: #fff; }
        .phm-btn.green:hover { background: #15803d; }
        .phm-btn.danger { color: #b91c1c; }
        .phm-btn.danger:hover { background: rgba(239,68,68,.08); }
        `;
        document.head.appendChild(s);
    }

    function _openHistoryModal(phone) {
        _ensureModalStyles();
        // Close existing
        document.getElementById('phoneHistModal')?.remove();

        const { counts, calls, recordings } = getCountsFor(phone);
        const firstCall = calls[0] || recordings[0] || {};
        const displayName = firstCall.name || '';
        // Default to recordings tab when user only has ghi âm but no OnCallCX call-history
        const defaultTab = counts.total === 0 && counts.recordings > 0 ? 'render' : 'oncall';

        const overlay = document.createElement('div');
        overlay.id = 'phoneHistModal';
        overlay.className = 'phm-overlay';
        overlay.innerHTML = `
            <div class="phm-modal" role="dialog" aria-modal="true">
                <div class="phm-head">
                    <h3>
                        <span>📞 Lịch sử cuộc gọi</span>
                        <span class="phm-phone">${_esc(phone)}</span>
                        ${displayName ? `<span style="color:#64748b;font-weight:500;font-size:13px">· ${_esc(displayName)}</span>` : ''}
                    </h3>
                    <button class="phm-close" aria-label="Đóng">×</button>
                </div>
                <div class="phm-tabs">
                    <button class="phm-tab ${defaultTab === 'oncall' ? 'active' : ''}" data-phm-tab="oncall">
                        <span>OnCallCX</span>
                        <span class="phm-count">${counts.total}</span>
                    </button>
                    <button class="phm-tab ${defaultTab === 'render' ? 'active' : ''}" data-phm-tab="render">
                        <span>Ghi âm</span>
                        <span class="phm-count" data-phm-render-count>${counts.recordings || '…'}</span>
                    </button>
                </div>
                <div class="phm-body">
                    <div data-phm-pane="oncall" style="display:${defaultTab === 'oncall' ? '' : 'none'}">${_renderOncallPane(phone, calls, counts)}</div>
                    <div data-phm-pane="render" style="display:${defaultTab === 'render' ? '' : 'none'}">
                        <div class="phm-loading">Đang tải ghi âm…</div>
                    </div>
                </div>
                <div class="phm-foot">
                    <div style="font-size:11px;color:#64748b">
                        ${counts.total} cuộc gọi · ${counts.out} gọi ra · ${counts.in} gọi vào${counts.missed ? ` · <span style="color:#b91c1c;font-weight:600">${counts.missed} nhỡ</span>` : ''}${counts.recordings ? ` · <span style="color:#6d28d9;font-weight:600">▶ ${counts.recordings} ghi âm</span>` : ''}
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="phm-btn green" data-phm-call><span>📞</span> Gọi ngay</button>
                        <a class="phm-btn" href="https://pbx-ucaas.oncallcx.vn/portal/pbxCalls.xhtml" target="_blank" rel="noopener">↗ Portal OnCallCX</a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('.phm-close').addEventListener('click', close);
        overlay.querySelector('[data-phm-call]').addEventListener('click', () => {
            try {
                window.PhoneWidget?.makeCall?.(phone);
            } catch {}
            close();
        });
        // Tab switching
        overlay.querySelectorAll('.phm-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                const k = btn.dataset.phmTab;
                overlay
                    .querySelectorAll('.phm-tab')
                    .forEach((b) => b.classList.toggle('active', b === btn));
                overlay.querySelectorAll('[data-phm-pane]').forEach((p) => {
                    p.style.display = p.dataset.phmPane === k ? '' : 'none';
                });
            });
        });
        // Esc to close
        const onKey = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);

        // Fetch recordings async (default tab is OnCallCX so loads in background)
        _loadRenderRecordings(phone, overlay);
    }

    function _renderOncallPane(phone, calls, counts) {
        if (!calls.length) {
            return `<div class="phm-empty">Chưa có cuộc gọi nào với số này.</div>`;
        }
        return (
            calls
                .slice(0, 50)
                .map((c) => {
                    const dir =
                        c.direction === 'missed' ? 'missed' : c.direction === 'in' ? 'in' : 'out';
                    const dirLabel = dir === 'in' ? 'Gọi vào' : dir === 'missed' ? 'Nhỡ' : 'Gọi ra';
                    return `
                <div class="phm-row">
                    <span class="phm-dir" style="color:${_dirColor(dir)}">${_dirIcon(dir)}</span>
                    <div class="phm-meta">
                        <div class="phm-when">${_fmtTs(c.timestamp)} · ${dirLabel}${c.duration ? ` · ${_fmtDur(c.duration)}` : ''}</div>
                        <div class="phm-sub">
                            ${c.username ? `<span>NV: <b>${_esc(c.username)}</b></span>` : ''}
                            ${c.ext ? `<span>Ext: <b>${_esc(c.ext)}</b></span>` : ''}
                            ${c.order_code ? `<span>Đơn: <b>${_esc(c.order_code)}</b></span>` : ''}
                            ${c.outcome ? `<span>Kết quả: <b>${_esc(c.outcome)}</b></span>` : ''}
                        </div>
                        ${c.note ? `<div style="color:#64748b;font-size:11px;margin-top:4px;font-style:italic">"${_esc(c.note)}"</div>` : ''}
                    </div>
                    <div class="phm-actions">
                        <span style="font-size:10px;color:#94a3b8">Audio: portal</span>
                    </div>
                </div>
            `;
                })
                .join('') +
            (calls.length > 50
                ? `<div style="text-align:center;color:#94a3b8;font-size:11px;padding:8px">+ ${calls.length - 50} cuộc gọi cũ hơn</div>`
                : '')
        );
    }

    async function _loadRenderRecordings(phone, overlay) {
        const pane = overlay.querySelector('[data-phm-pane="render"]');
        const countBadge = overlay.querySelector('[data-phm-render-count]');
        if (!pane) return;
        try {
            const r = await fetch(
                `${API}/call-recordings?phone=${encodeURIComponent(phone)}&limit=200`,
                { cache: 'no-store' }
            );
            const d = await r.json().catch(() => ({}));
            const rows = Array.isArray(d.rows) ? d.rows : [];
            if (countBadge) countBadge.textContent = String(rows.length);
            if (!rows.length) {
                pane.innerHTML = `<div class="phm-empty">
                    Chưa có ghi âm nào trên Render DB cho số này.<br>
                    <small style="color:#cbd5e1">Ghi âm sẽ tự động upload sau mỗi cuộc gọi.</small>
                </div>`;
                return;
            }
            pane.innerHTML = rows
                .map((rec) => {
                    const dir =
                        rec.direction === 'missed'
                            ? 'missed'
                            : rec.direction === 'in'
                              ? 'in'
                              : 'out';
                    const dirLabel = dir === 'in' ? 'Gọi vào' : dir === 'missed' ? 'Nhỡ' : 'Gọi ra';
                    const audioUrl = `${API}/call-recordings/${rec.id}/audio`;
                    const sizeKB = Math.round((rec.size_bytes || 0) / 1024);
                    return `
                    <div class="phm-row" data-rec-id="${rec.id}">
                        <span class="phm-dir" style="color:${_dirColor(dir)}">${_dirIcon(dir)}</span>
                        <div class="phm-meta">
                            <div class="phm-when">${_fmtTs(parseInt(rec.timestamp, 10))} · ${dirLabel} · ${_fmtDur(rec.duration)}</div>
                            <div class="phm-sub">
                                ${rec.username ? `<span>NV: <b>${_esc(rec.username)}</b></span>` : ''}
                                ${rec.ext ? `<span>Ext: <b>${_esc(rec.ext)}</b></span>` : ''}
                                <span>${sizeKB} KB</span>
                            </div>
                            <audio controls preload="none" src="${audioUrl}" style="margin-top:6px"></audio>
                        </div>
                        <div class="phm-actions">
                            <a class="phm-btn" href="${audioUrl}" download="call-${rec.id}.webm" title="Tải về"><span>⬇</span></a>
                            <button class="phm-btn danger" data-phm-del="${rec.id}" title="Xoá"><span>🗑</span></button>
                        </div>
                    </div>
                `;
                })
                .join('');
            // Wire delete buttons
            pane.querySelectorAll('[data-phm-del]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.phmDel;
                    if (!confirm('Xoá ghi âm này trên Render DB?')) return;
                    try {
                        const resp = await fetch(`${API}/call-recordings/${id}`, {
                            method: 'DELETE',
                        });
                        if (!resp.ok) throw new Error('HTTP ' + resp.status);
                        btn.closest('[data-rec-id]')?.remove();
                        const remaining = pane.querySelectorAll('[data-rec-id]').length;
                        if (countBadge) countBadge.textContent = String(remaining);
                        if (!remaining) {
                            pane.innerHTML = `<div class="phm-empty">Đã xoá hết ghi âm cho số này.</div>`;
                        }
                    } catch (err) {
                        alert('Lỗi: ' + err.message);
                    }
                });
            });
        } catch (err) {
            pane.innerHTML = `<div class="phm-empty" style="color:#b91c1c">Lỗi tải ghi âm: ${_esc(err.message)}</div>`;
        }
    }
    function _makeBadge(phone, counts) {
        const badge = document.createElement('span');
        const cls = ['phone-hist-badge'];
        if (counts.missed > 0) cls.push('has-missed');
        if (counts.recordings > 0) cls.push('has-recording');
        badge.className = cls.join(' ');
        badge.dataset.phone = phone;
        badge.dataset.sig = `${counts.total}|${counts.missed}|${counts.recordings}`;
        badge.innerHTML = _badgeContent(counts);
        badge.addEventListener('mouseenter', () => _showTooltip(badge, phone));
        badge.addEventListener('mouseleave', _hideTooltip);
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            _hideTooltip();
            // Always open the modal — inside the modal there's a "Gọi ngay"
            // button plus the recordings tab with audio player. Admin-only gate
            // here hid the play button from non-admin staff who still need to
            // listen to calls they made.
            _openHistoryModal(phone);
        });
        return badge;
    }

    // Flag để tắt MutationObserver trong lúc renderBadges tự modify DOM
    // (append/remove badge) — tránh self-loop: observer fires → renderBadges →
    // mutation → observer fires → … gây bảng giật khi filter active + SSE events.
    let _rendering = false;

    function renderBadges() {
        _ensureStyles();
        _rendering = true;
        try {
            const cells = document.querySelectorAll('td[data-column="phone"]');
            cells.forEach((cell) => {
                const container = cell.querySelector('div') || cell;
                const existing = container.querySelector('.phone-hist-badge');
                // Extract phone from cell (last span)
                const span = cell.querySelector('span:last-of-type');
                const phoneText = span?.textContent || cell.textContent || '';
                const phone = stripPhone(phoneText);
                if (!phone) {
                    if (existing) existing.remove();
                    return;
                }
                const { counts } = getCountsFor(phone);
                if (counts.total === 0 && counts.recordings === 0) {
                    if (existing) existing.remove();
                    return;
                }
                // Idempotent: keep existing badge — only update content if counts changed
                // (avoids remove→recreate flicker that kills the tooltip mid-hover)
                if (existing && existing.dataset.phone === phone) {
                    const newSig = `${counts.total}|${counts.missed}|${counts.recordings}`;
                    if (existing.dataset.sig === newSig) return; // no change → skip
                    _updateBadge(existing, phone, counts);
                    return;
                }
                if (existing) existing.remove();
                container.appendChild(_makeBadge(phone, counts));
            });
        } finally {
            _rendering = false;
        }
    }

    // Debounced re-render on table mutations.
    // Skip while tooltip is open — re-rendering under the cursor causes flicker.
    let renderDebounceTimer = null;
    function scheduleRender() {
        if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
        renderDebounceTimer = setTimeout(() => {
            renderDebounceTimer = null;
            if (tooltipEl) {
                scheduleRender();
                return;
            } // retry after mouse leaves
            renderBadges();
        }, 400);
    }

    // Kiểm tra mutation có phải từ chính renderBadges (self-mutation) không.
    // Nếu toàn bộ mutations chỉ touch .phone-hist-badge / td[data-column="phone"]
    // hoặc xảy ra khi _rendering=true → skip để tránh loop.
    function _isSelfMutation(mutations) {
        if (_rendering) return true;
        return mutations.every((m) => {
            const target = m.target;
            if (target?.classList?.contains?.('phone-hist-badge')) return true;
            if (target?.closest?.('.phone-hist-badge')) return true;
            // childList mutations: check addedNodes for badge only
            if (m.type === 'childList') {
                const nodes = [...m.addedNodes, ...m.removedNodes];
                if (
                    nodes.length > 0 &&
                    nodes.every((n) => n.classList?.contains?.('phone-hist-badge'))
                ) {
                    return true;
                }
            }
            return false;
        });
    }

    function _observeTable() {
        // Narrow scope: chỉ observe tbody (nơi row thay đổi khi filter/render),
        // không subtree toàn table. Filter mutation ở cell-level qua _isSelfMutation.
        const tbody =
            document.getElementById('tableBody') ||
            document.querySelector('#ordersTable tbody') ||
            document.querySelector('.orders-table tbody') ||
            document.querySelector('table tbody');
        if (!tbody) {
            setTimeout(_observeTable, 1000);
            return;
        }
        const observer = new MutationObserver((mutations) => {
            if (_isSelfMutation(mutations)) return;
            scheduleRender();
        });
        // childList only (row add/remove), không cần characterData
        observer.observe(tbody, { childList: true, subtree: true });
        renderBadges();
    }

    // Public API
    function refresh() {
        return loadHistory(true);
    }
    function getStats(phone) {
        return getCountsFor(phone);
    }

    // Boot: load history ASAP — observer picks up rows as they render.
    // Previous 3s delay meant users saw no badge on initial paint if they
    // looked at the table immediately.
    if (typeof window !== 'undefined') {
        const boot = () => loadHistory().then(_observeTable);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 500));
        } else {
            setTimeout(boot, 500);
        }
        // Auto-refresh every 2 min (in case new calls logged)
        setInterval(() => loadHistory(), CACHE_TTL_MS);
    }

    return { refresh, getStats, renderBadges };
})();

if (typeof window !== 'undefined') window.PhoneHistoryBadges = PhoneHistoryBadges;
