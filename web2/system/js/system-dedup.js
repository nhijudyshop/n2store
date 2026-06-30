// #Note: WEB2.0 module — System / Cấu hình → tab "Trùng lặp / 1-nguồn". Đọc CLAUDE.md trước khi sửa.
// Audit các chỗ TRÙNG CHỨC NĂNG trong Web 2.0 + hướng gộp về 1 nguồn (single source).
// Nguồn: web2/system/data/web2-dedup-audit.json (curated từ audit nhiều vòng + agents).
// Lazy-start: chỉ fetch khi mở tab. Expose window.SystemDedup.
(function () {
    'use strict';

    const DATA_URL = 'data/web2-dedup-audit.json';
    let _data = null;
    let _started = false;
    const state = { q: '', cat: 'all', status: 'all' };

    const $ = (id) => document.getElementById(id);
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }

    const CAT_LABEL = {
        business: '🧠 Nghiệp vụ (business logic)',
        'shared-module': '🧩 Module dùng chung',
        util: '🔧 Tiện ích (util copy-paste)',
    };
    const catLabel = (c) => CAT_LABEL[c] || `📦 ${c}`;

    const SEV = {
        high: { cls: 'sev-high', label: 'Cao' },
        medium: { cls: 'sev-med', label: 'TB' },
        low: { cls: 'sev-low', label: 'Thấp' },
    };
    const STATUS = {
        resolved: { cls: 'st-ok', label: '✅ Đã gộp' },
        partial: { cls: 'st-partial', label: '🟡 Một phần' },
        pending: { cls: 'st-pending', label: '⏳ Chưa làm' },
    };

    async function load() {
        try {
            const r = await fetch(DATA_URL, { cache: 'no-cache' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            _data = await r.json();
            renderAll();
        } catch (e) {
            console.error('[system-dedup] load fail:', e);
            const host = $('ddHost');
            if (host)
                host.innerHTML = `<div class="sd-loading">Lỗi tải audit trùng lặp: ${esc(e.message)}</div>`;
        }
    }

    const groups = () => _data?.groups || [];

    function renderAll() {
        renderSummary();
        renderToolbar();
        renderBody();
        if (window.lucide) lucide.createIcons();
    }

    function renderSummary() {
        const host = $('ddSummary');
        if (!host) return;
        const all = groups();
        const resolved = all.filter((x) => x.status === 'resolved').length;
        const partial = all.filter((x) => x.status === 'partial').length;
        const pending = all.filter((x) => x.status === 'pending').length;
        const files = all.reduce(
            (n, x) => n + (Number(x.filesAffected) || (x.sites || []).length || 0),
            0
        );
        const cells = [
            { v: all.length, l: 'Nhóm trùng' },
            { v: resolved, l: '✅ Đã gộp' },
            { v: partial, l: '🟡 Một phần' },
            { v: pending, l: '⏳ Chưa làm' },
            { v: files, l: 'File ảnh hưởng' },
        ];
        host.innerHTML = cells
            .map(
                (c) =>
                    `<div class="sys-pg-stat"><div class="v">${esc(c.v)}</div><div class="l">${esc(c.l)}</div></div>`
            )
            .join('');
    }

    function renderToolbar() {
        const host = $('ddToolbar');
        if (!host) return;
        const all = groups();
        const catCounts = {};
        for (const x of all) catCounts[x.category] = (catCounts[x.category] || 0) + 1;
        const statusChips = [
            { k: 'all', label: 'Mọi trạng thái' },
            { k: 'resolved', label: '✅ Đã gộp' },
            { k: 'partial', label: '🟡 Một phần' },
            { k: 'pending', label: '⏳ Chưa làm' },
        ];
        host.innerHTML = `
            <div class="mod-views">
                <input type="search" id="ddSearch" class="mod-search" placeholder="Tìm khái niệm / file / hàm / nguồn chung…" value="${esc(state.q)}" />
            </div>
            <div class="mod-cats">
                ${statusChips
                    .map(
                        (c) =>
                            `<button class="mod-chip ${state.status === c.k ? 'is-on' : ''}" data-status="${c.k}">${esc(c.label)}</button>`
                    )
                    .join('')}
            </div>
            <div class="mod-cats">
                <button class="mod-chip ${state.cat === 'all' ? 'is-on' : ''}" data-cat="all">Tất cả loại</button>
                ${Object.keys(catCounts)
                    .sort((a, b) => catCounts[b] - catCounts[a])
                    .map(
                        (c) =>
                            `<button class="mod-chip ${state.cat === c ? 'is-on' : ''}" data-cat="${esc(c)}">${esc(catLabel(c))} <span class="n">${catCounts[c]}</span></button>`
                    )
                    .join('')}
            </div>`;
        $('ddSearch')?.addEventListener('input', (e) => {
            state.q = e.target.value.toLowerCase();
            renderBody();
        });
        host.querySelectorAll('[data-cat]').forEach((b) =>
            b.addEventListener('click', () => {
                state.cat = b.dataset.cat;
                renderToolbar();
                renderBody();
            })
        );
        host.querySelectorAll('[data-status]').forEach((b) =>
            b.addEventListener('click', () => {
                state.status = b.dataset.status;
                renderToolbar();
                renderBody();
            })
        );
    }

    function matchQ(x) {
        if (!state.q) return true;
        const hay = [x.title, x.concept, x.canonical, x.resolution, (x.sites || []).join(' ')]
            .join(' ')
            .toLowerCase();
        return hay.includes(state.q);
    }

    function renderBody() {
        const host = $('ddHost');
        if (!host) return;
        let list = groups().filter(matchQ);
        if (state.cat !== 'all') list = list.filter((x) => x.category === state.cat);
        if (state.status !== 'all') list = list.filter((x) => x.status === state.status);
        if (!list.length) {
            host.innerHTML = `<div class="sd-loading">Không có nhóm trùng khớp bộ lọc.</div>`;
            return;
        }
        // sort: pending → partial → resolved, rồi severity high→low
        const stOrder = { pending: 0, partial: 1, resolved: 2 };
        const sevOrder = { high: 0, medium: 1, low: 2 };
        const groupsByCat = {};
        for (const x of list) (groupsByCat[x.category] = groupsByCat[x.category] || []).push(x);
        host.innerHTML = Object.keys(groupsByCat)
            .sort((a, b) => groupsByCat[b].length - groupsByCat[a].length)
            .map((cat) => {
                const cards = groupsByCat[cat]
                    .sort(
                        (a, b) =>
                            (stOrder[a.status] ?? 9) - (stOrder[b.status] ?? 9) ||
                            (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)
                    )
                    .map(card)
                    .join('');
                return `<div class="mod-group">
                    <h3 class="mod-group-head">${esc(catLabel(cat))} <span class="count">${groupsByCat[cat].length}</span></h3>
                    <div class="dd-grid">${cards}</div>
                </div>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    function card(x) {
        const sev = SEV[x.severity] || SEV.medium;
        const st = STATUS[x.status] || STATUS.pending;
        const sites = (x.sites || []).slice(0, 8);
        const more = (x.sites || []).length - sites.length;
        const commit = x.commit
            ? `<span class="dd-commit">commit <code>${esc(x.commit)}</code></span>`
            : '';
        return `<div class="dd-card ${esc(st.cls)}">
            <div class="dd-head">
                <span class="dd-title">${esc(x.title)}</span>
                <span class="dd-status ${esc(st.cls)}">${esc(st.label)}</span>
            </div>
            <div class="dd-badges">
                <span class="dd-sev ${esc(sev.cls)}">Mức: ${esc(sev.label)}</span>
                ${x.filesAffected ? `<span class="dd-files">${esc(x.filesAffected)} file</span>` : ''}
                ${commit}
            </div>
            ${x.concept ? `<div class="dd-concept">${esc(x.concept)}</div>` : ''}
            ${x.canonical ? `<div class="dd-canon"><span class="dd-lbl">→ 1 nguồn:</span> <code>${esc(x.canonical)}</code></div>` : ''}
            ${x.resolution ? `<div class="dd-res"><span class="dd-lbl">Hướng / đã làm:</span> ${esc(x.resolution)}</div>` : ''}
            ${
                sites.length
                    ? `<div class="dd-sites"><span class="dd-lbl">Nơi trùng:</span> ${sites
                          .map((s) => `<code>${esc(s)}</code>`)
                          .join(
                              ' '
                          )}${more > 0 ? ` <span class="dd-more">+${more}</span>` : ''}</div>`
                    : ''
            }
        </div>`;
    }

    function start() {
        if (_started) {
            if (_data) renderAll();
            else load();
            return;
        }
        _started = true;
        load();
    }

    window.SystemDedup = { start, reload: load };
})();
