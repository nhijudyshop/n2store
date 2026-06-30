// #Note: WEB2.0 module — System / Cấu hình → tab "Bên thứ 3". Đọc CLAUDE.md trước khi sửa.
// Tổng hợp TOÀN BỘ dịch vụ / API / thư viện / dự án GitHub / hạ tầng bên thứ 3 dùng
// trong Web 2.0. Nguồn: web2/system/data/web2-third-parties.json (curated, audit 5 vòng).
// Lazy-start: chỉ fetch khi mở tab. Expose window.SystemThirdParty.
(function () {
    'use strict';

    const DATA_URL = 'data/web2-third-parties.json';
    let _data = null;
    let _started = false;

    const state = { q: '', cat: 'all', layer: 'all', cost: 'all' };

    const $ = (id) => document.getElementById(id);
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }

    const CAT_LABEL = {
        'ai-llm': '🤖 AI / LLM',
        'tts-voice': '🔊 Giọng nói / TTS',
        'media-gen': '🎨 Tạo media AI',
        'stock-media': '🖼️ Kho ảnh/video',
        'messaging-social': '💬 Nhắn tin / MXH',
        'commerce-tpos': '🛒 Bán hàng / TPOS',
        payment: '💳 Thanh toán',
        'browser-lib': '📚 Thư viện CDN',
        'ml-model-ondevice': '🧠 Model ML on-device',
        'opensource-port': '🐙 Open-source / GitHub',
        'infra-platform': '🏗️ Hạ tầng / Platform',
        font: '🔤 Font',
        other: '📦 Khác',
    };
    function catLabel(c) {
        return CAT_LABEL[c] || `📦 ${c}`;
    }

    const TYPE_ICON = {
        api: '🌐 API',
        cdn: '📦 CDN',
        github: '🐙 GitHub',
        infra: '🏗️ Infra',
        model: '🧠 Model',
    };
    const COST_CLASS = { free: 'free', paid: 'paid', freemium: 'freemium', usage: 'usage' };
    const COST_LABEL = { free: 'Free', paid: 'Trả phí', freemium: 'Freemium', usage: 'Theo usage' };

    async function load() {
        try {
            const r = await fetch(DATA_URL, { cache: 'no-cache' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            _data = await r.json();
            renderAll();
        } catch (e) {
            console.error('[system-thirdparty] load fail:', e);
            const host = $('tpHost');
            if (host)
                host.innerHTML = `<div class="sd-loading">Lỗi tải registry bên thứ 3: ${esc(e.message)}</div>`;
        }
    }

    function items() {
        return _data?.thirdParties || [];
    }

    function renderAll() {
        renderSummary();
        renderToolbar();
        renderBody();
        if (window.lucide) lucide.createIcons();
    }

    function renderSummary() {
        const host = $('tpSummary');
        if (!host) return;
        const all = items();
        const paid = all.filter(
            (x) => x.cost === 'paid' || x.cost === 'usage' || x.cost === 'freemium'
        ).length;
        const free = all.filter((x) => x.cost === 'free').length;
        const web2 = all.filter((x) => x.layer === 'web2' || x.layer === 'both').length;
        const gh = all.filter((x) => x.type === 'github' || x.type === 'model').length;
        const cells = [
            { v: all.length, l: 'Tổng bên thứ 3' },
            { v: web2, l: 'Dùng cho Web 2.0' },
            { v: paid, l: 'Có thể tốn phí' },
            { v: free, l: 'Miễn phí' },
            { v: gh, l: 'OSS / GitHub / model' },
        ];
        host.innerHTML = cells
            .map(
                (c) =>
                    `<div class="sys-pg-stat"><div class="v">${esc(c.v)}</div><div class="l">${esc(c.l)}</div></div>`
            )
            .join('');
    }

    function renderToolbar() {
        const host = $('tpToolbar');
        if (!host) return;
        const all = items();
        const catCounts = {};
        for (const x of all) catCounts[x.category] = (catCounts[x.category] || 0) + 1;

        const layerChips = [
            { k: 'all', label: 'Mọi layer' },
            { k: 'web2', label: 'Web 2.0' },
            { k: 'web1', label: 'Web 1.0' },
        ];
        const costChips = [
            { k: 'all', label: 'Mọi chi phí' },
            { k: 'paid', label: '💸 Trả phí' },
            { k: 'free', label: '🆓 Free' },
        ];

        host.innerHTML = `
            <div class="mod-views">
                <input type="search" id="tpSearch" class="mod-search" placeholder="Tìm tên / nhà cung cấp / công dụng / file…" value="${esc(
                    state.q
                )}" />
            </div>
            <div class="tp-filterline">
                <div class="mod-cats">
                    ${layerChips
                        .map(
                            (c) =>
                                `<button class="mod-chip ${state.layer === c.k ? 'is-on' : ''}" data-layer="${c.k}">${esc(
                                    c.label
                                )}</button>`
                        )
                        .join('')}
                </div>
                <div class="mod-cats">
                    ${costChips
                        .map(
                            (c) =>
                                `<button class="mod-chip ${state.cost === c.k ? 'is-on' : ''}" data-cost="${c.k}">${esc(
                                    c.label
                                )}</button>`
                        )
                        .join('')}
                </div>
            </div>
            <div class="mod-cats">
                <button class="mod-chip ${state.cat === 'all' ? 'is-on' : ''}" data-cat="all">Tất cả loại</button>
                ${Object.keys(catCounts)
                    .sort((a, b) => catCounts[b] - catCounts[a])
                    .map(
                        (c) =>
                            `<button class="mod-chip ${state.cat === c ? 'is-on' : ''}" data-cat="${esc(
                                c
                            )}">${esc(catLabel(c))} <span class="n">${catCounts[c]}</span></button>`
                    )
                    .join('')}
            </div>`;

        $('tpSearch')?.addEventListener('input', (e) => {
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
        host.querySelectorAll('[data-layer]').forEach((b) =>
            b.addEventListener('click', () => {
                state.layer = b.dataset.layer;
                renderToolbar();
                renderBody();
            })
        );
        host.querySelectorAll('[data-cost]').forEach((b) =>
            b.addEventListener('click', () => {
                state.cost = b.dataset.cost;
                renderToolbar();
                renderBody();
            })
        );
    }

    function matchQ(x) {
        if (!state.q) return true;
        const hay = [
            x.name,
            x.provider,
            x.notes,
            x.license,
            x.category,
            (x.usedIn || []).join(' '),
            (x.envKeys || []).join(' '),
        ]
            .join(' ')
            .toLowerCase();
        return hay.includes(state.q);
    }
    function matchLayer(x) {
        if (state.layer === 'all') return true;
        if (state.layer === 'web2') return x.layer === 'web2' || x.layer === 'both';
        if (state.layer === 'web1') return x.layer === 'web1' || x.layer === 'both';
        return true;
    }
    function matchCost(x) {
        if (state.cost === 'all') return true;
        if (state.cost === 'free') return x.cost === 'free';
        if (state.cost === 'paid')
            return x.cost === 'paid' || x.cost === 'usage' || x.cost === 'freemium';
        return true;
    }

    function renderBody() {
        const host = $('tpHost');
        if (!host) return;
        let list = items().filter((x) => matchQ(x) && matchLayer(x) && matchCost(x));
        if (state.cat !== 'all') list = list.filter((x) => x.category === state.cat);
        if (!list.length) {
            host.innerHTML = `<div class="sd-loading">Không có bên thứ 3 khớp bộ lọc.</div>`;
            return;
        }
        const groups = {};
        for (const x of list) (groups[x.category] = groups[x.category] || []).push(x);
        host.innerHTML = Object.keys(groups)
            .sort((a, b) => groups[b].length - groups[a].length)
            .map((cat) => {
                const cards = groups[cat]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(card)
                    .join('');
                return `<div class="mod-group">
                    <h3 class="mod-group-head">${esc(catLabel(cat))} <span class="count">${groups[cat].length}</span></h3>
                    <div class="tp-grid">${cards}</div>
                </div>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    function card(x) {
        const cost = x.cost || 'free';
        const costCls = COST_CLASS[cost] || 'free';
        const costTxt = (COST_LABEL[cost] || cost) + (x.costDetail ? ` · ${x.costDetail}` : '');
        const layerBadge =
            x.layer === 'web1'
                ? '<span class="tp-badge w1">Web 1.0</span>'
                : x.layer === 'both'
                  ? '<span class="tp-badge both">Web 1.0 + 2.0</span>'
                  : '<span class="tp-badge w2">Web 2.0</span>';
        const statusBadge =
            x.status === 'legacy'
                ? '<span class="tp-badge legacy">legacy</span>'
                : x.status === 'dormant'
                  ? '<span class="tp-badge dormant">dormant</span>'
                  : '';
        const used = (x.usedIn || []).slice(0, 6);
        const usedMore = (x.usedIn || []).length - used.length;
        const env = (x.envKeys || []).length
            ? `<div class="tp-env"><span class="tp-env-label">🔑 ENV:</span> ${(x.envKeys || [])
                  .map((k) => `<code>${esc(k)}</code>`)
                  .join(' ')}</div>`
            : '';
        const gh = x.githubUrl
            ? `<a href="${esc(x.githubUrl)}" target="_blank" rel="noopener" class="tp-link">🐙 GitHub</a>`
            : '';
        return `<div class="tp-card tp-cat-${esc(x.category)}">
            <div class="tp-head">
                <span class="tp-name">${esc(x.name)}</span>
                <span class="tp-cost ${costCls}">${esc(cost === 'free' ? 'Free' : COST_LABEL[cost] || cost)}</span>
            </div>
            <div class="tp-provider">${esc(TYPE_ICON[x.type] || x.type || '')} · ${esc(x.provider || '')}</div>
            <div class="tp-badges">${layerBadge}${statusBadge}${x.license ? `<span class="tp-badge lic">${esc(x.license)}</span>` : ''}</div>
            ${x.costDetail ? `<div class="tp-cost-detail">${esc(x.costDetail)}</div>` : ''}
            ${x.notes ? `<div class="tp-notes">${esc(x.notes)}</div>` : ''}
            ${
                used.length
                    ? `<div class="tp-used"><span class="tp-used-label">Dùng ở:</span> ${used
                          .map((u) => `<code>${esc(u)}</code>`)
                          .join(
                              ' '
                          )}${usedMore > 0 ? ` <span class="tp-more">+${usedMore}</span>` : ''}</div>`
                    : ''
            }
            ${env}
            ${gh}
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

    window.SystemThirdParty = { start, reload: load };
})();
