// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Kho rớt xả (derived/lazy, 0 cron). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md
(function () {
    'use strict';

    const API_BASE =
        window.API_CONFIG?.WORKER_URL ||
        window.WEB2_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const UNITS = API_BASE + '/api/web2-product-units';

    function token() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token || '';
        } catch (_) {
            return '';
        }
    }
    function userName() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null')?.user?.username || '';
        } catch (_) {
            return '';
        }
    }
    // Chỉ admin được chuyển SP rớt xả ↔ kho chính (sửa nhầm). Pattern canonical
    // so-order _isAdmin: web2_auth = { token, expiresAt, user:{role} }.
    function _isAdmin() {
        try {
            const u =
                (window.Web2Auth?.getStored && window.Web2Auth.getStored()?.user) ||
                JSON.parse(localStorage.getItem('web2_auth') || 'null')?.user ||
                null;
            return !!(u && (u.role === 'admin' || u.isAdmin === true));
        } catch (_) {
            return false;
        }
    }
    async function api(path, opts = {}) {
        const t = token();
        const res = await fetch(UNITS + path, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                ...(t ? { 'x-web2-token': t } : {}),
                ...(opts.headers || {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
    }

    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    const fmtVnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    function icons(root) {
        if (window.lucide?.createIcons)
            try {
                window.lucide.createIcons({
                    nameAttr: 'data-lucide',
                    ...(root ? { el: root } : {}),
                });
            } catch (_) {}
    }
    let toastTimer = null;
    function toast(msg, kind) {
        let el = $('#clrToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'clrToast';
            el.className = 'clr-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.className = 'clr-toast show' + (kind ? ' ' + kind : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (el.className = 'clr-toast'), 2400);
    }

    const TIER = {
        RUOT_XA: { label: 'Rớt xả', short: '<30 ngày' },
        XA_MANH: { label: 'Xả mạnh', short: '30–90 ngày' },
        THANH_LY: { label: 'Thanh lý', short: '>90 ngày' },
    };

    let DATA = null;
    let filter = ''; // '' = tất cả, hoặc tier key

    async function load() {
        $('#clrList').innerHTML =
            '<div class="clr-muted"><i data-lucide="loader-2" class="spin"></i> Đang tải…</div>';
        icons($('#clrList'));
        try {
            DATA = await api('/clearance');
            render();
        } catch (e) {
            $('#clrList').innerHTML = '<div class="clr-muted">❌ ' + esc(e.message) + '</div>';
        }
    }

    function render() {
        renderSummary();
        renderFilters();
        renderList();
    }

    function renderSummary() {
        const d = DATA;
        const t = d.tiers || {};
        const card = (cls, lbl, val, sub) =>
            `<div class="clr-card ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
        $('#clrSummary').innerHTML =
            card('total', 'Tổng tem rớt xả', d.totalCount, 'món vật lý dư') +
            card('money', 'Giá trị kẹt', fmtVnd(d.totalValue), 'vốn nằm trong hàng dư') +
            card('', 'Rớt xả (<30d)', t.RUOT_XA?.count || 0, fmtVnd(t.RUOT_XA?.value || 0)) +
            card('', 'Xả mạnh (30–90d)', t.XA_MANH?.count || 0, fmtVnd(t.XA_MANH?.value || 0)) +
            card('', 'Thanh lý (>90d)', t.THANH_LY?.count || 0, fmtVnd(t.THANH_LY?.value || 0));
    }

    function renderFilters() {
        const t = DATA.tiers || {};
        const chip = (key, lbl, cnt) =>
            `<button class="clr-chip ${filter === key ? 'on' : ''}" data-f="${key}">${lbl}${cnt != null ? ` (${cnt})` : ''}</button>`;
        $('#clrFilters').innerHTML =
            chip('', 'Tất cả', DATA.totalCount) +
            chip('RUOT_XA', 'Rớt xả', t.RUOT_XA?.count || 0) +
            chip('XA_MANH', 'Xả mạnh', t.XA_MANH?.count || 0) +
            chip('THANH_LY', 'Thanh lý', t.THANH_LY?.count || 0);
        $('#clrFilters')
            .querySelectorAll('[data-f]')
            .forEach((b) =>
                b.addEventListener('click', () => {
                    filter = b.dataset.f;
                    render();
                })
            );
    }

    function renderList() {
        const host = $('#clrList');
        const groups = (DATA.groups || [])
            .map((g) => ({
                ...g,
                units: filter ? g.units.filter((u) => u.tier === filter) : g.units,
            }))
            .filter((g) => g.units.length);
        if (!groups.length) {
            host.innerHTML =
                '<div class="clr-muted">🎉 Không có hàng rớt xả' +
                (filter ? ' ở nhóm này' : '') +
                '. Kho sạch!</div>';
            return;
        }
        const admin = _isAdmin();
        host.innerHTML = groups
            .map((g) => {
                const gValue = g.units.length * (Number(g.price) || 0);
                const img = g.imageUrl
                    ? `<img class="clr-gimg" src="${esc(g.imageUrl)}" alt="" />`
                    : `<div class="clr-gimg" style="display:grid;place-items:center"><i data-lucide="package"></i></div>`;
                const units = g.units
                    .map(
                        (u) => `<span class="clr-unit tier-${u.tier}">
                            <span class="uc">${esc(u.unitCode)}</span>
                            <span class="tier-badge">${TIER[u.tier]?.label || u.tier}</span>
                            <span class="meta">tồn ${u.days}d${u.shipmentId ? ' · đợt ' + esc(String(u.shipmentId).slice(-6)) : ''}${u.manual ? ' · ép xả' : ''}</span>
                            ${admin ? `<button class="keep" data-keep="${u.id}" title="Giữ kho chính (đưa ngược)"><i data-lucide="undo-2"></i></button>` : ''}
                        </span>`
                    )
                    .join('');
                return `<div class="clr-group">
                    <div class="clr-ghead">
                        ${img}
                        <div class="clr-gmeta">
                            <div class="clr-gname">${esc(g.name)}</div>
                            <span class="clr-gcode">${esc(g.productCode)}</span> · ${fmtVnd(g.price)}/món
                        </div>
                        <div class="clr-gval"><div class="n">${fmtVnd(gValue)}</div><div class="c">${g.units.length} tem</div></div>
                        ${admin ? `<button class="clr-gkeep" data-keepall="${esc(g.productCode)}">Giữ cả SP</button>` : ''}
                    </div>
                    <div class="clr-units">${units}</div>
                </div>`;
            })
            .join('');
        host.querySelectorAll('[data-keep]').forEach((b) =>
            b.addEventListener('click', () => keepUnit(Number(b.dataset.keep)))
        );
        host.querySelectorAll('[data-keepall]').forEach((b) =>
            b.addEventListener('click', () => keepGroup(b.dataset.keepall))
        );
        icons(host);
    }

    async function keepUnit(id) {
        if (!_isAdmin()) return toast('Chỉ admin được đưa SP về kho chính', 'err');
        try {
            await api('/' + id + '/clearance', {
                method: 'POST',
                body: JSON.stringify({ state: 'KEEP', userName: userName() }),
            });
            toast('✓ Đã đưa về kho chính', 'ok');
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        }
    }
    async function keepGroup(code) {
        if (!_isAdmin()) return toast('Chỉ admin được đưa SP về kho chính', 'err');
        const g = (DATA.groups || []).find((x) => x.productCode === code);
        if (!g) return;
        const units = filter ? g.units.filter((u) => u.tier === filter) : g.units;
        try {
            await Promise.all(
                units.map((u) =>
                    api('/' + u.id + '/clearance', {
                        method: 'POST',
                        body: JSON.stringify({ state: 'KEEP', userName: userName() }),
                    })
                )
            );
            toast(`✓ Giữ ${units.length} tem về kho chính`, 'ok');
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        }
    }

    function boot() {
        if (window.Web2Sidebar) Web2Sidebar.mount('#web2Aside', { activeRoute: 'clearance' });
        $('#clrRefresh')?.addEventListener('click', load);
        icons();
        load();
        // SSE: gán/đổi unit ở nơi khác → refresh (debounce)
        try {
            if (window.Web2SSE?.subscribe) {
                let deb = null;
                window.Web2SSE.subscribe('web2:product-units', () => {
                    clearTimeout(deb);
                    deb = setTimeout(load, 800);
                });
            }
        } catch (_) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
