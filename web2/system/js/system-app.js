// #Note: WEB2.0 module — System / Cấu hình orchestrator.
// Mount sidebar, điều phối tab (Dịch vụ / Realtime SSE / Các trang), build danh
// sách trang Web 2.0 từ menu đã mount. | Đọc CLAUDE.md trước khi sửa.
(function () {
    'use strict';

    const VALID_TABS = ['services', 'sse', 'pages', 'modules', 'thirdparty', 'dedup', 'ai'];
    const _inited = new Set();

    function $(id) {
        return document.getElementById(id);
    }

    // -----------------------------------------------------
    // Tab switching
    // -----------------------------------------------------
    function activate(tab) {
        if (!VALID_TABS.includes(tab)) tab = 'services';

        document.querySelectorAll('.sys-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.tab === tab);
            b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
        });
        document.querySelectorAll('.sys-panel').forEach((p) => {
            p.classList.toggle('is-active', p.dataset.panel === tab);
        });

        // Conn pill (SSE) chỉ hiện ở tab realtime.
        const conn = $('sysConn');
        if (conn) conn.hidden = tab !== 'sse';

        // Lazy init per tab.
        if (tab === 'services' && !_inited.has('services')) {
            _inited.add('services');
            window.SystemServices?.start?.();
        } else if (tab === 'sse' && !_inited.has('sse')) {
            // KHÔNG latch 'sse' tới khi admin-check xong: transient /me fail không được
            // khoá access vĩnh viễn (lần mở/reload sau vẫn thử lại). start() trả true
            // khi admin xác nhận → mới đánh dấu inited.
            Promise.resolve(window.SystemSSE?.start?.()).then((ok) => {
                if (ok) _inited.add('sse');
            });
        } else if (tab === 'pages' && !_inited.has('pages')) {
            _inited.add('pages');
            buildPages();
        } else if (tab === 'modules' && !_inited.has('modules')) {
            _inited.add('modules');
            window.SystemModules?.start?.();
        } else if (tab === 'thirdparty' && !_inited.has('thirdparty')) {
            _inited.add('thirdparty');
            window.SystemThirdParty?.start?.();
        } else if (tab === 'dedup' && !_inited.has('dedup')) {
            _inited.add('dedup');
            window.SystemDedup?.start?.();
        } else if (tab === 'ai' && !_inited.has('ai')) {
            _inited.add('ai');
            window.SystemAiSuggestions?.start?.();
        }

        // Reflect in URL (không tạo history entry).
        try {
            const u = new URL(location.href);
            u.searchParams.set('tab', tab);
            history.replaceState(null, '', u);
        } catch (_) {}

        if (window.lucide) lucide.createIcons();
    }

    function wireTabs() {
        document.querySelectorAll('.sys-tab').forEach((btn) => {
            btn.addEventListener('click', () => activate(btn.dataset.tab));
        });
    }

    function wireReload() {
        $('sysReloadBtn')?.addEventListener('click', () => {
            const active = document.querySelector('.sys-tab.is-active')?.dataset.tab || 'services';
            if (active === 'services') window.SystemServices?.reload?.();
            else if (active === 'sse') window.SystemSSE?.reload?.();
            else if (active === 'pages') buildPages(true);
            else if (active === 'modules') window.SystemModules?.reload?.();
            else if (active === 'thirdparty') window.SystemThirdParty?.reload?.();
            else if (active === 'dedup') window.SystemDedup?.reload?.();
        });
    }

    // -----------------------------------------------------
    // Pages inventory — đọc từ sidebar đã mount (single source of truth).
    // -----------------------------------------------------
    function _cleanLabel(node) {
        if (!node) return '';
        const clone = node.cloneNode(true);
        clone
            .querySelectorAll('.web2-nav-soon, .web2-nav-w2tag, .web2-nav-w2badge')
            .forEach((s) => s.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    function _parseLink(a) {
        const href = a.getAttribute('href') || '#';
        const impl = href !== '#' && href !== '';
        return {
            name: _cleanLabel(a),
            href,
            impl,
            isWeb2: !!a.querySelector('.web2-nav-w2tag'),
        };
    }

    function buildPages(force) {
        if (force) _inited.add('pages');
        const aside = $('web2Aside');
        const groupsWrap = $('sysPagesGroups');
        const summary = $('sysPagesSummary');
        if (!aside || !groupsWrap) return;

        const groups = [];

        // Top-level single links (vd "Tổng quan").
        const singles = [...aside.querySelectorAll('a.web2-nav-link')].map(_parseLink);
        if (singles.length) groups.push({ label: 'Truy cập nhanh', items: singles });

        // Grouped sections.
        aside.querySelectorAll('.web2-nav-group').forEach((g) => {
            const label = _cleanLabel(g.querySelector('.web2-nav-group-head .label')) || 'Khác';
            const items = [...g.querySelectorAll('.web2-nav-sub a')].map(_parseLink);
            if (items.length) groups.push({ label, items });
        });

        // Summary counters.
        let total = 0,
            impl = 0,
            web2 = 0,
            soon = 0;
        for (const grp of groups)
            for (const it of grp.items) {
                total++;
                if (it.impl) impl++;
                else soon++;
                if (it.isWeb2) web2++;
            }

        summary.innerHTML = `
            <div class="sys-pg-stat"><div class="v">${total}</div><div class="l">Mục trong menu</div></div>
            <div class="sys-pg-stat"><div class="v">${impl}</div><div class="l">Trang đã có</div></div>
            <div class="sys-pg-stat"><div class="v">${web2}</div><div class="l">Gắn tag WEB 2.0</div></div>
            <div class="sys-pg-stat"><div class="v">${soon}</div><div class="l">Coming soon</div></div>`;

        groupsWrap.innerHTML = groups
            .map((grp) => {
                const cards = grp.items
                    .map((it) => {
                        const badge = it.isWeb2
                            ? '<span class="badge w2">WEB 2.0</span>'
                            : it.impl
                              ? '<span class="badge ok">Đã có</span>'
                              : '<span class="badge soon">soon</span>';
                        if (it.impl) {
                            return `<a class="sys-pg-card is-impl" href="${_esc(it.href)}" title="${_esc(it.name)}">
                                <span class="name">${_esc(it.name)}</span>${badge}
                            </a>`;
                        }
                        return `<div class="sys-pg-card is-soon" title="Chưa hiện thực">
                                <span class="name">${_esc(it.name)}</span>${badge}
                            </div>`;
                    })
                    .join('');
                return `<div class="sys-pg-group">
                    <h3 class="sys-pg-group-head">${_esc(grp.label)} <span class="count">${grp.items.length}</span></h3>
                    <div class="sys-pg-grid">${cards}</div>
                </div>`;
            })
            .join('');
    }

    function _esc(s) {
        const div = document.createElement('div');
        div.textContent = String(s ?? '');
        return div.innerHTML;
    }

    // -----------------------------------------------------
    // Boot
    // -----------------------------------------------------
    function init() {
        if (window.Web2Sidebar) {
            window.Web2Sidebar.mount('#web2Aside', { activeUrl: window.location.href });
        }
        wireTabs();
        wireReload();

        // Tab khởi đầu từ ?tab=  (cho redirect từ trang cũ services-dashboard / admin-sse-monitor).
        let initial = 'services';
        try {
            const t = new URL(location.href).searchParams.get('tab');
            if (VALID_TABS.includes(t)) initial = t;
        } catch (_) {}
        activate(initial);

        if (window.lucide) lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
