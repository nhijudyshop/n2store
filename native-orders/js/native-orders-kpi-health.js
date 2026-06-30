// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// KPI health bar cho trang Đơn Web (native-orders). Tự tính TỪ cột "Thẻ" (pill kpi_user
// đã render) — KHÔNG gọi thêm API:
//   • ⚠ N đơn chưa gán NV  (pill đỏ — STT ngoài mọi dải) → link Cấu hình KPI chia dải.
//   • ⏳ N đơn chưa chốt KPI (pill hổ phách — base chưa khóa).
//   • Chip mỗi NV (tên · số đơn) → bấm LỌC bảng chỉ còn đơn của NV đó (client-side).
// Bù cho leaderboard #noKpiStrip (chỉ hiện khi /kpi có NV) — bar này luôn hiện khi có
// đơn KPI, phơi bày cấu hình thiếu + lọc nhanh. Cập nhật realtime qua MutationObserver tbody.

(function (global) {
    'use strict';

    const C_ERR = 'rgb(220, 38, 38)'; // #dc2626 — chưa gán NV
    const C_AMBER = 'rgb(245, 158, 11)'; // #f59e0b — chưa chốt
    const KPI_CONFIG_URL = '../web2/kpi/assignments.html';
    let _filter = null; // { type:'unassigned'|'notchoted'|'nv', value? }
    let _obs = null;
    let _t = null;

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Kpi && global.Web2Kpi.escapeHtml) return global.Web2Kpi.escapeHtml(s);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    function ensureStyles() {
        if (document.getElementById('no-kpihealth-css')) return;
        const st = document.createElement('style');
        st.id = 'no-kpihealth-css';
        st.textContent = `
        .no-kpih{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:8px 12px;margin:0 0 8px;
            background:#fff;border:1px solid #eef1f6;border-radius:11px;font-size:12.5px;}
        .no-kpih-lbl{display:inline-flex;align-items:center;gap:5px;font-weight:700;color:#475569;}
        .no-kpih-lbl i{width:15px;height:15px;}
        .no-kpih-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid #e2e8f0;background:#f8fafc;
            border-radius:999px;padding:3px 10px;font-weight:700;color:#334155;cursor:pointer;transition:all .12s;}
        .no-kpih-chip:hover{border-color:#94a3b8;background:#f1f5f9;}
        .no-kpih-chip.on{background:#0068ff;border-color:#0068ff;color:#fff;}
        .no-kpih-chip .c{font-weight:800;}
        .no-kpih-chip.err{background:#fee2e2;border-color:#fecaca;color:#b91c1c;}
        .no-kpih-chip.err.on{background:#dc2626;border-color:#dc2626;color:#fff;}
        .no-kpih-chip.amber{background:#fef3c7;border-color:#fde68a;color:#92400e;}
        .no-kpih-chip.amber.on{background:#f59e0b;border-color:#f59e0b;color:#fff;}
        .no-kpih-cfg{display:inline-flex;align-items:center;gap:4px;color:#0068ff;font-weight:700;text-decoration:none;
            border:1px solid #bfdbfe;border-radius:8px;padding:3px 9px;}
        .no-kpih-cfg:hover{background:#eff6ff;}
        .no-kpih-cfg i{width:13px;height:13px;}
        .no-kpih-clear{margin-left:auto;color:#64748b;cursor:pointer;font-weight:700;border:none;background:none;
            display:inline-flex;align-items:center;gap:4px;}
        .no-kpih-clear:hover{color:#0f172a;}
        .no-kpih-ok{color:#15803d;font-weight:700;display:inline-flex;align-items:center;gap:5px;}
        `;
        document.head.appendChild(st);
    }

    function ensureBar() {
        let bar = document.getElementById('noKpiHealthBar');
        if (bar) return bar;
        const strip = document.getElementById('noKpiStrip');
        bar = document.createElement('div');
        bar.id = 'noKpiHealthBar';
        bar.className = 'no-kpih';
        bar.hidden = true;
        if (strip && strip.parentNode) strip.parentNode.insertBefore(bar, strip.nextSibling);
        else {
            const tbl = document.getElementById('ordersTable');
            if (tbl && tbl.parentNode) tbl.parentNode.insertBefore(bar, tbl);
            else document.body.appendChild(bar);
        }
        return bar;
    }

    // Trạng thái 1 pill kpi_user: 'masked'|'err'|'notchoted'|'ok'. nv = tên NV (ok/notchoted).
    // masked = pill '👤 KPI' của NV KHÁC (server đã che cho staff) → KHÔNG gom tên/đếm.
    function pillInfo(pill) {
        const span = pill.querySelector('.w2-otag');
        const color = (span && span.style.color) || '';
        const text = (span ? span.textContent : pill.textContent || '').trim();
        if (text.startsWith('👤')) return { state: 'masked', nv: null };
        if (color === C_ERR || text.startsWith('⚠')) return { state: 'err', nv: null };
        if (color === C_AMBER) return { state: 'notchoted', nv: text };
        return { state: 'ok', nv: text };
    }

    // Quét tbody → { rows:[{tr,state,nv}], unassigned, notChoted, byNv:Map(name→count) }.
    function scan() {
        const tbody = document.getElementById('ordersTbody');
        const out = { rows: [], unassigned: 0, notChoted: 0, byNv: new Map() };
        if (!tbody) return out;
        const pills = tbody.querySelectorAll('.no-otag-click[onclick*="kpi_user"]');
        for (const pill of pills) {
            const tr = pill.closest('tr');
            if (!tr) continue;
            const info = pillInfo(pill);
            out.rows.push({ tr, state: info.state, nv: info.nv });
            if (info.state === 'err') out.unassigned++;
            else {
                if (info.state === 'notchoted') out.notChoted++;
                if (info.nv) out.byNv.set(info.nv, (out.byNv.get(info.nv) || 0) + 1);
            }
        }
        return out;
    }

    function matchFilter(row) {
        if (!_filter) return true;
        if (_filter.type === 'unassigned') return row.state === 'err';
        if (_filter.type === 'notchoted') return row.state === 'notchoted';
        if (_filter.type === 'nv') return row.nv === _filter.value;
        return true;
    }

    function applyFilter(s) {
        for (const row of s.rows) {
            row.tr.style.display = matchFilter(row) ? '' : 'none';
        }
    }

    function setFilter(f) {
        const same =
            _filter && _filter.type === f.type && (f.type !== 'nv' || _filter.value === f.value);
        _filter = same ? null : f;
        render();
    }

    function render() {
        ensureStyles();
        const bar = ensureBar();
        const s = scan();
        if (!s.rows.length) {
            bar.hidden = true;
            _filter = null;
            return;
        }
        bar.hidden = false;
        const parts = [`<span class="no-kpih-lbl"><i data-lucide="target"></i>KPI</span>`];

        if (s.unassigned > 0) {
            const on = _filter && _filter.type === 'unassigned' ? ' on' : '';
            parts.push(
                `<button type="button" class="no-kpih-chip err${on}" data-f="unassigned" title="Lọc đơn chưa gán NV"><i data-lucide="user-x" style="width:13px;height:13px;"></i> <span class="c">${s.unassigned}</span> chưa gán NV</button>`
            );
            parts.push(
                `<a class="no-kpih-cfg" href="${KPI_CONFIG_URL}" target="_blank" rel="noopener"><i data-lucide="sliders-horizontal"></i> Cấu hình KPI</a>`
            );
        }
        if (s.notChoted > 0) {
            const on = _filter && _filter.type === 'notchoted' ? ' on' : '';
            parts.push(
                `<button type="button" class="no-kpih-chip amber${on}" data-f="notchoted" title="Lọc đơn chưa chốt KPI"><i data-lucide="hourglass" style="width:13px;height:13px;"></i> <span class="c">${s.notChoted}</span> chưa chốt</button>`
            );
        }
        if (!s.unassigned && !s.notChoted) {
            parts.push(
                `<span class="no-kpih-ok"><i data-lucide="check-circle"></i> Đã gán & chốt đủ</span>`
            );
        }

        const nvs = [...s.byNv.entries()].sort((a, b) => b[1] - a[1]);
        for (const [name, count] of nvs) {
            const on = _filter && _filter.type === 'nv' && _filter.value === name ? ' on' : '';
            parts.push(
                `<button type="button" class="no-kpih-chip${on}" data-nv="${esc(name)}" title="Lọc đơn của ${esc(name)}">${esc(name)} · <span class="c">${count}</span></button>`
            );
        }

        if (_filter) {
            parts.push(
                `<button type="button" class="no-kpih-clear" data-clear="1"><i data-lucide="x" style="width:13px;height:13px;"></i> Bỏ lọc</button>`
            );
        }

        bar.innerHTML = parts.join('');
        bar.querySelectorAll('[data-f]').forEach((el) =>
            el.addEventListener('click', () => setFilter({ type: el.getAttribute('data-f') }))
        );
        bar.querySelectorAll('[data-nv]').forEach((el) =>
            el.addEventListener('click', () =>
                setFilter({ type: 'nv', value: el.getAttribute('data-nv') })
            )
        );
        const clr = bar.querySelector('[data-clear]');
        if (clr)
            clr.addEventListener('click', () => {
                _filter = null;
                render();
            });

        applyFilter(s);
        if (global.lucide) global.lucide.createIcons();
    }

    function schedule() {
        clearTimeout(_t);
        _t = setTimeout(render, 250);
    }

    function init() {
        const tbody = document.getElementById('ordersTbody');
        if (tbody && global.MutationObserver) {
            _obs = new MutationObserver(schedule);
            _obs.observe(tbody, { childList: true, subtree: false });
        }
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.NativeOrdersKpiHealth = { render, setFilter };
})(typeof window !== 'undefined' ? window : globalThis);
