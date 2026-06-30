// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.
// =====================================================================
// Web2CommandPalette — bảng lệnh tìm-nhảy-nhanh cho TOÀN BỘ Web 2.0.
// Mở bằng Ctrl/Cmd+K (hoặc "/" khi không gõ trong ô input). Gõ để lọc mọi
// trang trong sidebar + vài hành động nhanh → Enter để đi. Auto-load qua
// web2-sidebar.js nên có mặt ở mọi trang, KHÔNG cần sửa HTML từng trang.
//
// Diacritic-insensitive (gõ "khach" ra "Khách hàng"). A11y: dialog + focus
// trap + listbox/option + Esc. Style bằng token --web2-* (đồng bộ Zalo blue).
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2CommandPalette) return;

    const norm = (s) =>
        String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();

    // subsequence fuzzy match (gõ tắt "khh" khớp "khach hang")
    function score(q, text) {
        const t = norm(text);
        const n = norm(q);
        if (!n) return 1;
        if (t.includes(n)) return 100 - t.indexOf(n); // ưu tiên khớp sớm
        let i = 0;
        for (const ch of t) if (i < n.length && ch === n[i]) i++;
        return i === n.length ? 10 : -1; // subsequence
    }

    let _root, _input, _list, _hint;
    let _items = [];
    let _filtered = [];
    let _active = 0;
    let _open = false;
    let _lastFocus = null;

    function ensureStyles() {
        if (document.getElementById('w2cmdp-styles')) return;
        const s = document.createElement('style');
        s.id = 'w2cmdp-styles';
        s.textContent = `
        .w2cmdp-ov{position:fixed;inset:0;z-index:11000;display:flex;align-items:flex-start;justify-content:center;
            padding:12vh 16px 16px;background:rgba(15,23,42,.5);animation:w2cmdpFade .14s ease}
        .w2cmdp-ov[hidden]{display:none!important}
        @keyframes w2cmdpFade{from{opacity:0}to{opacity:1}}
        .w2cmdp-box{width:min(620px,96vw);max-height:70vh;display:flex;flex-direction:column;
            background:#fff;border-radius:16px;overflow:hidden;
            box-shadow:0 16px 48px rgba(15,23,42,.32);animation:w2cmdpIn .2s cubic-bezier(.16,1,.3,1)}
        @keyframes w2cmdpIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
        .w2cmdp-search{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e6e9ef}
        .w2cmdp-search svg{width:18px;height:18px;color:#94a3b8;flex-shrink:0}
        .w2cmdp-search input{flex:1;border:0;outline:0;font-size:16px;font-family:inherit;color:#0f172a;background:transparent}
        .w2cmdp-kbd{font-size:11px;color:#94a3b8;border:1px solid #e6e9ef;border-radius:6px;padding:2px 6px;font-weight:600}
        .w2cmdp-list{overflow-y:auto;overscroll-behavior:contain;padding:6px}
        .w2cmdp-item{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;cursor:pointer;color:#0f172a}
        .w2cmdp-item .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;
            background:#e8f2ff;color:#0068ff}
        .w2cmdp-item .ic svg{width:16px;height:16px}
        .w2cmdp-item .lbl{font-size:14px;font-weight:600}
        .w2cmdp-item .grp{font-size:11.5px;color:#94a3b8;margin-left:auto;white-space:nowrap}
        .w2cmdp-item.active,.w2cmdp-item:hover{background:#e8f2ff}
        .w2cmdp-empty{padding:30px;text-align:center;color:#94a3b8;font-size:14px}
        .w2cmdp-foot{display:flex;gap:14px;padding:9px 16px;border-top:1px solid #e6e9ef;color:#94a3b8;font-size:12px}
        .w2cmdp-foot b{color:#475569;font-weight:600}
        @media (prefers-reduced-motion:reduce){.w2cmdp-ov,.w2cmdp-box{animation:none!important}}`;
        document.head.appendChild(s);
    }

    const SEARCH_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    const ARROW_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

    function build() {
        ensureStyles();
        _root = document.createElement('div');
        _root.className = 'w2cmdp-ov';
        _root.hidden = true;
        _root.setAttribute('role', 'dialog');
        _root.setAttribute('aria-modal', 'true');
        _root.setAttribute('aria-label', 'Tìm kiếm & lệnh nhanh');
        _root.innerHTML = `
            <div class="w2cmdp-box" role="document">
                <div class="w2cmdp-search">
                    ${SEARCH_SVG}
                    <input type="text" placeholder="Tìm trang, chức năng…" aria-label="Tìm kiếm" autocomplete="off" spellcheck="false" />
                    <span class="w2cmdp-kbd">esc</span>
                </div>
                <div class="w2cmdp-list" role="listbox" aria-label="Kết quả"></div>
                <div class="w2cmdp-foot"><span><b>↑↓</b> chọn</span><span><b>↵</b> mở</span><span><b>esc</b> đóng</span><span style="margin-left:auto"><b>Ctrl/⌘ K</b> mở bảng lệnh</span></div>
            </div>`;
        document.body.appendChild(_root);
        _input = _root.querySelector('input');
        _list = _root.querySelector('.w2cmdp-list');

        _root.addEventListener('click', (e) => {
            if (e.target === _root) close();
        });
        _input.addEventListener('input', () => {
            _active = 0;
            renderList();
        });
        _input.addEventListener('keydown', onKey);
        _list.addEventListener('click', (e) => {
            const it = e.target.closest('.w2cmdp-item');
            if (it) run(_filtered[Number(it.dataset.i)]);
        });
    }

    // Thu thập mục: mọi link trong sidebar đã mount + vài hành động nhanh.
    function collectItems() {
        const items = [];
        const seen = new Set();
        document.querySelectorAll('.web2-aside a[href]').forEach((a) => {
            const href = a.getAttribute('href');
            if (!href || href === '#' || href.startsWith('javascript')) return;
            const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
            if (!label || seen.has(href)) return;
            seen.add(href);
            // nhóm = group head gần nhất (nếu có)
            const grp =
                a.closest('[data-group]')?.getAttribute('data-group') ||
                a
                    .closest('.web2-nav-group')
                    ?.querySelector('.web2-nav-group-label,.group-label,summary')
                    ?.textContent?.trim() ||
                '';
            items.push({
                type: 'page',
                label,
                href,
                group: (grp || '').replace(/\s+/g, ' ').trim(),
            });
        });
        // Hành động nhanh toàn cục
        items.push({
            type: 'action',
            label: 'Tải lại trang',
            icon: 'reload',
            run: () => location.reload(),
        });
        items.push({
            type: 'action',
            label: 'Về Tổng quan Web 2.0',
            href:
                items.find((i) => /tổng quan|overview/i.test(i.label))?.href ||
                '../web2/overview/index.html',
        });
        return items;
    }

    function renderList() {
        const q = _input.value;
        _filtered = _items
            .map((it) => ({ it, s: score(q, it.label + ' ' + (it.group || '')) }))
            .filter((x) => x.s >= 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 50)
            .map((x) => x.it);
        if (_active >= _filtered.length) _active = Math.max(0, _filtered.length - 1);
        if (!_filtered.length) {
            _list.innerHTML = `<div class="w2cmdp-empty">Không tìm thấy "${(q || '').replace(/[<>&]/g, '')}"</div>`;
            return;
        }
        _list.innerHTML = _filtered
            .map(
                (
                    it,
                    i
                ) => `<div class="w2cmdp-item ${i === _active ? 'active' : ''}" role="option" aria-selected="${i === _active}" data-i="${i}">
                    <span class="ic">${ARROW_SVG}</span>
                    <span class="lbl">${escapeHtml(it.label)}</span>
                    ${it.group ? `<span class="grp">${escapeHtml(it.group)}</span>` : ''}
                </div>`
            )
            .join('');
        scrollActive();
    }

    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    }
    function scrollActive() {
        _list.querySelector('.w2cmdp-item.active')?.scrollIntoView({ block: 'nearest' });
    }

    function onKey(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _active = Math.min(_active + 1, _filtered.length - 1);
            renderList();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _active = Math.max(_active - 1, 0);
            renderList();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (_filtered[_active]) run(_filtered[_active]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'Tab') {
            e.preventDefault(); // focus trap: giữ trong input
        }
    }

    function run(item) {
        if (!item) return;
        close();
        if (typeof item.run === 'function') return item.run();
        if (item.href) global.location.href = item.href;
    }

    function open() {
        if (_open) return;
        if (!_root) build();
        _items = collectItems();
        _lastFocus = document.activeElement;
        _input.value = '';
        _active = 0;
        renderList();
        _root.hidden = false;
        _open = true;
        setTimeout(() => _input.focus(), 30);
    }
    function close() {
        if (!_open) return;
        _root.hidden = true;
        _open = false;
        if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
    }
    function toggle() {
        _open ? close() : open();
    }

    // Global hotkey: Ctrl/Cmd+K. "/" mở khi không gõ trong field.
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            toggle();
            return;
        }
        if (e.key === '/' && !_open) {
            const t = e.target;
            const typing =
                t &&
                (t.tagName === 'INPUT' ||
                    t.tagName === 'TEXTAREA' ||
                    t.tagName === 'SELECT' ||
                    t.isContentEditable);
            if (!typing) {
                e.preventDefault();
                open();
            }
        }
    });

    global.Web2CommandPalette = { open, close, toggle };
})(window);
