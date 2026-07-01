// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Drawer trượt dùng chung (mọi trang Web 2.0).
//
// Web2Drawer — panel TRƯỢT (phải/trái) dùng chung, học pattern native-orders-control-drawer.js
// (edge-toggle + slide + Esc), nhưng generic để MỌI trang tái dùng (KHÔNG fork mỗi nơi 1 drawer).
//
//   const dw = Web2Drawer.create({
//       id: 'gwPhotos',            // duy nhất mỗi drawer
//       side: 'right',             // 'right' (mặc định) | 'left'
//       width: 440,                // px (mobile ≤520 auto full-width)
//       title: 'Tiêu đề',          // HTML tiêu đề (đổi runtime bằng setTitle)
//       backdrop: true,            // true = có nền mờ + bấm nền đóng (modal-ish); false = non-modal (như native-orders)
//       lockScroll: undefined,     // mặc định = backdrop; khoá cuộn body khi mở (iOS-safe position:fixed)
//       toggle: { label:'ẢNH', icon:'image', title:'Mở' }, // (tuỳ chọn) nút mép màn hình như native-orders; null = không có
//       onOpen(){}, onClose(){},
//   });
//   dw.open(); dw.close(); dw.toggle(); dw.isOpen();
//   dw.setTitle(html); dw.setBody(html); dw.body → phần tử body (để wire event/append);
//   dw.setBadge(n); dw.destroy();
//
// Nhiều drawer đồng thời OK (mỗi cái z-index chồng lên); khoá cuộn body dùng ref-count chung.
(function (global) {
    'use strict';
    if (global.Web2Drawer) return; // 1 nguồn, không nạp lại

    // ── CSS 1 lần (self-contained, token web2 xanh #0068ff) ──
    function ensureStyles() {
        if (document.getElementById('web2-drawer-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-drawer-css';
        st.textContent = `
        .w2dw-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.42);z-index:10070;opacity:0;
            pointer-events:none;transition:opacity .2s ease;}
        .w2dw-backdrop.show{opacity:1;pointer-events:auto;}
        .w2dw-panel{position:fixed;top:0;height:100vh;height:100dvh;width:420px;max-width:94vw;z-index:10071;
            background:#fff;display:flex;flex-direction:column;font-family:Inter,system-ui,-apple-system,sans-serif;
            will-change:transform;transition:transform .24s cubic-bezier(.16,1,.3,1);contain:layout paint;}
        .w2dw-panel.right{right:0;box-shadow:-14px 0 44px rgba(15,23,42,.20);transform:translateX(100%);}
        .w2dw-panel.left{left:0;box-shadow:14px 0 44px rgba(15,23,42,.20);transform:translateX(-100%);}
        .w2dw-panel.open{transform:translateX(0);}
        .w2dw-head{display:flex;align-items:center;gap:10px;padding:14px 12px 12px 16px;
            border-bottom:1px solid #eef2f7;flex:0 0 auto;}
        .w2dw-title{flex:1;min-width:0;font-size:15px;font-weight:800;color:#0f172a;line-height:1.28;}
        .w2dw-title small{display:block;font-size:12px;font-weight:600;color:#64748b;margin-top:2px;}
        .w2dw-x{border:1px solid #e2e8f0;background:#fff;border-radius:9px;width:34px;height:34px;cursor:pointer;
            color:#475569;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
            transition:background .13s;}
        .w2dw-x:hover{background:#f1f5f9;}
        .w2dw-x i{width:17px;height:17px;}
        .w2dw-body{flex:1;overflow:auto;padding:14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}
        .w2dw-toggle{position:fixed;top:46%;transform:translateY(-50%);z-index:10060;display:inline-flex;
            flex-direction:column;align-items:center;gap:4px;background:#0068ff;color:#fff;border:0;padding:14px 9px;
            cursor:pointer;box-shadow:-4px 4px 16px rgba(0,104,255,.32);font-weight:800;font-size:11.5px;
            letter-spacing:.4px;font-family:Inter,system-ui,sans-serif;transition:padding .15s,background .15s;}
        .w2dw-toggle.right{right:0;border-radius:12px 0 0 12px;}
        .w2dw-toggle.left{left:0;border-radius:0 12px 12px 0;box-shadow:4px 4px 16px rgba(0,104,255,.32);}
        .w2dw-toggle:hover{background:#0056d6;}
        .w2dw-toggle.right:hover{padding-right:14px;}
        .w2dw-toggle.left:hover{padding-left:14px;}
        .w2dw-toggle i{width:18px;height:18px;}
        .w2dw-toggle.hidden{display:none;}
        .w2dw-toggle .w2dw-badge{background:#fff;color:#0068ff;border-radius:999px;font-size:10px;min-width:16px;
            height:16px;line-height:16px;padding:0 4px;font-weight:800;}
        @media (max-width:520px){.w2dw-panel{width:100vw;max-width:100vw;}}`;
        document.head.appendChild(st);
    }

    // ── Khoá cuộn body (iOS-safe) — ref-count chung cho mọi drawer ──
    let _lockCount = 0,
        _scrollY = 0;
    function lockBody() {
        if (_lockCount++ > 0) return;
        _scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const b = document.body.style;
        b.position = 'fixed';
        b.top = `-${_scrollY}px`;
        b.left = '0';
        b.right = '0';
        b.width = '100%';
    }
    function unlockBody() {
        if (_lockCount <= 0) return;
        if (--_lockCount > 0) return;
        const b = document.body.style;
        b.position = '';
        b.top = '';
        b.left = '';
        b.right = '';
        b.width = '';
        window.scrollTo(0, _scrollY);
    }

    function lucide(root) {
        if (global.lucide && global.lucide.createIcons)
            try {
                global.lucide.createIcons(root ? { el: root } : undefined);
            } catch (_) {}
    }

    function create(opts) {
        opts = opts || {};
        ensureStyles();
        const side = opts.side === 'left' ? 'left' : 'right';
        const backdrop = opts.backdrop !== false; // mặc định true
        const lockScroll = opts.lockScroll == null ? backdrop : !!opts.lockScroll;
        const width = Number(opts.width) || 420;
        const id = opts.id || 'w2dw_' + Math.random().toString(36).slice(2, 8);
        let _open = false;

        // backdrop
        let bg = null;
        if (backdrop) {
            bg = document.createElement('div');
            bg.className = 'w2dw-backdrop';
            bg.addEventListener('click', () => api.close());
            document.body.appendChild(bg);
        }

        // panel
        const panel = document.createElement('aside');
        panel.className = `w2dw-panel ${side}`;
        panel.id = id;
        panel.style.width = width + 'px';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', backdrop ? 'true' : 'false');
        panel.hidden = false;
        panel.innerHTML = `
            <div class="w2dw-head">
                <div class="w2dw-title" id="${id}-title">${opts.title || ''}</div>
                <button class="w2dw-x" type="button" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
            </div>
            <div class="w2dw-body" id="${id}-body"></div>`;
        document.body.appendChild(panel);
        const titleEl = panel.querySelector(`#${id}-title`);
        const bodyEl = panel.querySelector(`#${id}-body`);
        panel.querySelector('.w2dw-x').addEventListener('click', () => api.close());

        // edge toggle (tuỳ chọn) — như native-orders
        let toggleBtn = null;
        if (opts.toggle) {
            toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = `w2dw-toggle ${side}`;
            toggleBtn.title = opts.toggle.title || 'Mở';
            toggleBtn.innerHTML =
                `${opts.toggle.icon ? `<i data-lucide="${opts.toggle.icon}"></i>` : ''}` +
                `${opts.toggle.label ? `<span>${opts.toggle.label}</span>` : ''}` +
                `<span class="w2dw-badge" style="display:none;"></span>`;
            toggleBtn.addEventListener('click', () => api.toggle());
            document.body.appendChild(toggleBtn);
        }

        function onKey(e) {
            if (e.key === 'Escape' && _open) api.close();
        }

        const api = {
            id,
            body: bodyEl,
            panel,
            isOpen: () => _open,
            open() {
                if (_open) return api;
                _open = true;
                if (lockScroll) lockBody();
                if (bg) bg.classList.add('show');
                // reflow rồi add .open để transition chạy khi vừa append
                void panel.offsetWidth;
                panel.classList.add('open');
                if (toggleBtn) toggleBtn.classList.add('hidden');
                document.addEventListener('keydown', onKey);
                lucide(panel);
                if (typeof opts.onOpen === 'function') opts.onOpen(api);
                return api;
            },
            close() {
                if (!_open) return api;
                _open = false;
                panel.classList.remove('open');
                if (bg) bg.classList.remove('show');
                if (toggleBtn) toggleBtn.classList.remove('hidden');
                document.removeEventListener('keydown', onKey);
                if (lockScroll) unlockBody();
                if (typeof opts.onClose === 'function') opts.onClose(api);
                return api;
            },
            toggle() {
                return _open ? api.close() : api.open();
            },
            setTitle(html) {
                titleEl.innerHTML = html == null ? '' : String(html);
                lucide(titleEl);
                return api;
            },
            setBody(html) {
                bodyEl.innerHTML = html == null ? '' : String(html);
                lucide(bodyEl);
                return api;
            },
            setBadge(n) {
                const b = toggleBtn && toggleBtn.querySelector('.w2dw-badge');
                if (!b) return api;
                if (n == null || n === 0 || n === '') b.style.display = 'none';
                else {
                    b.style.display = '';
                    b.textContent = n;
                }
                return api;
            },
            showToggle(show) {
                if (toggleBtn) toggleBtn.classList.toggle('hidden', show === false);
                return api;
            },
            destroy() {
                api.close();
                panel.remove();
                if (bg) bg.remove();
                if (toggleBtn) toggleBtn.remove();
            },
        };

        lucide(panel);
        if (toggleBtn) lucide(toggleBtn);
        return api;
    }

    global.Web2Drawer = { create };
})(typeof window !== 'undefined' ? window : globalThis);
