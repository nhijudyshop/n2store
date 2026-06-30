// #Note: WEB2.0 module — System / Cấu hình → tab "Module". Đọc CLAUDE.md trước khi sửa.
// Tổng hợp TOÀN BỘ module Web 2.0: shared (web2/shared) + trang + backend (Render).
// Nguồn: web2/system/data/web2-modules.json (sinh bởi scripts/gen-web2-system-data.js).
// Lazy-start: chỉ fetch khi mở tab. Expose window.SystemModules.
(function () {
    'use strict';

    const DATA_URL = 'data/web2-modules.json';
    let _data = null;
    let _started = false;

    // Filter state.
    const state = { q: '', cat: 'all', view: 'shared' };

    const $ = (id) => document.getElementById(id);
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }

    // Nhãn category gọn (icon + tên) cho module shared.
    const CAT_LABEL = {
        chat: '💬 Chat',
        'popup-ui': '🪟 Popup / UI',
        'sse-realtime': '📡 SSE Realtime',
        cache: '🗃️ Cache',
        'media-ai': '🤖 Media / AI',
        'voice-tts': '🔊 Giọng / TTS',
        image: '🖼️ Ảnh',
        'qr-barcode': '🔳 QR / Barcode',
        'scanner-count': '📷 Quét / Đếm',
        suppliers: '🏭 NCC',
        customers: '👤 Khách hàng',
        wallet: '💰 Ví',
        products: '📦 Sản phẩm',
        'sidebar-nav': '🧭 Sidebar / Nav',
        optimistic: '⚡ Optimistic',
        'format-util': '🔧 Tiện ích',
        kpi: '📈 KPI',
        campaign: '🎯 Chiến dịch',
        beauty: '✨ Beauty',
        video: '🎬 Video',
        auth: '🔐 Auth',
        other: '📁 Khác',
    };
    function catLabel(c) {
        return CAT_LABEL[c] || `📁 ${c}`;
    }

    async function load() {
        try {
            const r = await fetch(DATA_URL, { cache: 'no-cache' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            _data = await r.json();
            renderAll();
        } catch (e) {
            console.error('[system-modules] load fail:', e);
            const host = $('modHost');
            if (host)
                host.innerHTML = `<div class="sd-loading">Lỗi tải manifest module: ${esc(
                    e.message
                )}<br><small>Chạy <code>node scripts/gen-web2-system-data.js</code> để sinh lại.</small></div>`;
        }
    }

    function renderAll() {
        renderSummary();
        renderToolbar();
        renderBody();
        if (window.lucide) lucide.createIcons();
    }

    function renderSummary() {
        const t = _data.totals || {};
        const host = $('modSummary');
        if (!host) return;
        const cells = [
            { v: t.sharedModules ?? '—', l: 'Module dùng chung' },
            { v: t.pages ?? '—', l: 'Trang Web 2.0' },
            { v: t.backendRoutes ?? '—', l: 'Backend routes' },
            { v: t.backendServices ?? '—', l: 'Backend services' },
            { v: (t.functions ?? 0).toLocaleString('vi-VN'), l: 'Tổng hàm (FE)' },
        ];
        host.innerHTML = cells
            .map(
                (c) =>
                    `<div class="sys-pg-stat"><div class="v">${esc(c.v)}</div><div class="l">${esc(c.l)}</div></div>`
            )
            .join('');
    }

    function renderToolbar() {
        const host = $('modToolbar');
        if (!host) return;
        const views = [
            { k: 'shared', label: `Dùng chung (${(_data.shared || []).length})` },
            { k: 'pages', label: `Trang (${(_data.pages || []).length})` },
            {
                k: 'backend',
                label: `Backend (${(_data.backend?.routes || []).length + (_data.backend?.services || []).length})`,
            },
        ];
        const cats = _data.sharedByCategory || {};
        const catChips =
            state.view === 'shared'
                ? `<div class="mod-cats">
                    <button class="mod-chip ${state.cat === 'all' ? 'is-on' : ''}" data-cat="all">Tất cả</button>
                    ${Object.keys(cats)
                        .sort((a, b) => cats[b] - cats[a])
                        .map(
                            (c) =>
                                `<button class="mod-chip ${state.cat === c ? 'is-on' : ''}" data-cat="${esc(
                                    c
                                )}">${esc(catLabel(c))} <span class="n">${cats[c]}</span></button>`
                        )
                        .join('')}
                  </div>`
                : '';
        host.innerHTML = `
            <div class="mod-views">
                ${views
                    .map(
                        (v) =>
                            `<button class="mod-view ${state.view === v.k ? 'is-on' : ''}" data-view="${v.k}">${esc(
                                v.label
                            )}</button>`
                    )
                    .join('')}
                <input type="search" id="modSearch" class="mod-search" placeholder="Tìm theo tên / công dụng / file…" value="${esc(
                    state.q
                )}" />
            </div>
            ${catChips}`;

        $('modSearch')?.addEventListener('input', (e) => {
            state.q = e.target.value.toLowerCase();
            renderBody();
        });
        host.querySelectorAll('.mod-view').forEach((b) =>
            b.addEventListener('click', () => {
                state.view = b.dataset.view;
                state.cat = 'all';
                renderToolbar();
                renderBody();
                if (window.lucide) lucide.createIcons();
            })
        );
        host.querySelectorAll('.mod-chip').forEach((b) =>
            b.addEventListener('click', () => {
                state.cat = b.dataset.cat;
                renderToolbar();
                renderBody();
            })
        );
    }

    function matchQ(...fields) {
        if (!state.q) return true;
        return fields.some((f) =>
            String(f || '')
                .toLowerCase()
                .includes(state.q)
        );
    }

    function renderBody() {
        const host = $('modHost');
        if (!host) return;
        if (state.view === 'shared') host.innerHTML = renderShared();
        else if (state.view === 'pages') host.innerHTML = renderPages();
        else host.innerHTML = renderBackend();
        if (window.lucide) lucide.createIcons();
    }

    function renderShared() {
        let items = (_data.shared || []).filter((m) =>
            matchQ(m.name, m.purpose, m.file, (m.globals || []).join(' '), (m.api || []).join(' '))
        );
        if (state.cat !== 'all') items = items.filter((m) => m.category === state.cat);
        if (!items.length) return `<div class="sd-loading">Không có module khớp.</div>`;

        // Group by category.
        const groups = {};
        for (const m of items) (groups[m.category] = groups[m.category] || []).push(m);
        return Object.keys(groups)
            .sort((a, b) => groups[b].length - groups[a].length)
            .map((cat) => {
                const cards = groups[cat]
                    .sort((a, b) => b.consumerCount - a.consumerCount)
                    .map((m) => {
                        const big = m.lines > 800;
                        const apiPreview = (m.api || []).slice(0, 6).join(', ');
                        const pages = m.consumerPages || [];
                        const pagesTitle = pages.length
                            ? esc(pages.join(', '))
                            : 'Chưa trang nào dùng (mồ côi / mới)';
                        const usedTag = pages.length
                            ? `<span class="mod-tag" title="${pagesTitle}">🔌 ${pages.length} trang dùng</span>`
                            : `<span class="mod-tag warn" title="Chưa có trang nào import">🔌 mồ côi</span>`;
                        return `<div class="mod-card">
                            <div class="mod-card-head">
                                <span class="mod-name">${esc(m.name)}</span>
                                <span class="mod-lines ${big ? 'big' : ''}">${m.lines}d</span>
                            </div>
                            <div class="mod-file"><code>${esc(m.file)}</code></div>
                            ${m.purpose ? `<div class="mod-purpose">${esc(m.purpose)}</div>` : ''}
                            <div class="mod-meta">
                                ${usedTag}
                                ${apiPreview ? `<span class="mod-tag api" title="API public">⚙️ ${esc(apiPreview)}${(m.api || []).length > 6 ? '…' : ''}</span>` : ''}
                            </div>
                            ${
                                pages.length
                                    ? `<div class="mod-used" title="${pagesTitle}"><span class="mod-used-label">Trang:</span> ${pages
                                          .slice(0, 8)
                                          .map((p) => `<code>${esc(p)}</code>`)
                                          .join(
                                              ' '
                                          )}${pages.length > 8 ? ` <span class="mod-more">+${pages.length - 8}</span>` : ''}</div>`
                                    : ''
                            }
                        </div>`;
                    })
                    .join('');
                return `<div class="mod-group">
                    <h3 class="mod-group-head">${esc(catLabel(cat))} <span class="count">${groups[cat].length}</span></h3>
                    <div class="mod-grid">${cards}</div>
                </div>`;
            })
            .join('');
    }

    function renderPages() {
        let items = (_data.pages || []).filter((p) =>
            matchQ(
                p.page,
                (p.globals || []).join(' '),
                (p.usesShared || []).map((u) => u.name).join(' ')
            )
        );
        if (!items.length) return `<div class="sd-loading">Không có trang khớp.</div>`;
        const cards = items
            .sort((a, b) => (b.usesSharedCount || 0) - (a.usesSharedCount || 0))
            .map((p) => {
                const warn = (p.oversized || []).length
                    ? `<span class="mod-tag warn" title="${esc((p.oversized || []).map((o) => `${o.file} (${o.lines}d)`).join(', '))}">⚠️ ${p.oversized.length} file >800d</span>`
                    : '';
                const uses = p.usesShared || [];
                const usesHtml = uses.length
                    ? `<div class="mod-uses"><span class="mod-uses-label">🧩 Dùng ${uses.length} module shared:</span> ${uses
                          .map(
                              (u) =>
                                  `<code class="mod-usechip mod-uc-${esc(u.category)}">${esc(u.name)}</code>`
                          )
                          .join(' ')}</div>`
                    : `<div class="mod-uses"><span class="mod-uses-label" style="color:var(--web2-text-faded)">Không import module shared nào (độc lập)</span></div>`;
                return `<div class="mod-card mod-card-wide">
                    <div class="mod-card-head">
                        <span class="mod-name">${esc(p.page)}</span>
                        <span class="mod-lines">${p.totalLines.toLocaleString('vi-VN')}d</span>
                    </div>
                    <div class="mod-meta">
                        <span class="mod-tag">📄 ${p.fileCount} file</span>
                        <span class="mod-tag" title="Số module dùng chung trang này import">🧩 ${p.usesSharedCount || 0} module</span>
                        ${warn}
                    </div>
                    ${usesHtml}
                </div>`;
            })
            .join('');
        return `<div class="mod-group"><div class="mod-grid mod-grid-wide">${cards}</div></div>`;
    }

    function renderBackend() {
        const routes = (_data.backend?.routes || []).filter((m) => matchQ(m.file, m.purpose));
        const services = (_data.backend?.services || []).filter((m) => matchQ(m.file, m.purpose));
        function list(arr, head) {
            if (!arr.length) return '';
            const cards = arr
                .map((m) => {
                    const big = m.lines > 800;
                    const py = m.piggyback
                        ? '<span class="mod-tag warn" title="Mounted dưới /api/v2 nhưng thực sự Web 2.0">v2 piggy-back</span>'
                        : '';
                    return `<div class="mod-card">
                        <div class="mod-card-head">
                            <span class="mod-name">${esc(m.file.split('/').pop())}</span>
                            <span class="mod-lines ${big ? 'big' : ''}">${m.lines}d</span>
                        </div>
                        <div class="mod-file"><code>${esc(m.file)}</code></div>
                        ${m.purpose ? `<div class="mod-purpose">${esc(m.purpose)}</div>` : ''}
                        ${py ? `<div class="mod-meta">${py}</div>` : ''}
                    </div>`;
                })
                .join('');
            return `<div class="mod-group">
                <h3 class="mod-group-head">${esc(head)} <span class="count">${arr.length}</span></h3>
                <div class="mod-grid">${cards}</div>
            </div>`;
        }
        if (!routes.length && !services.length)
            return `<div class="sd-loading">Không có module backend khớp.</div>`;
        return (
            list(routes, '🛣️ Routes (render.com/routes)') +
            list(services, '⚙️ Services (render.com/services)')
        );
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

    window.SystemModules = { start, reload: load };
})();
