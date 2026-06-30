// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Product Card — APP (điều khiển): chọn SP (Web2ProductsCache) / tải ảnh / nhập field
 * → render canvas (Web2ProductCard.render) → export PNG. 100% on-device, không server.
 * Ăn khớp Studio tách nền: ảnh PNG trong suốt → bật "ảnh tách nền" để contain.
 */
(function (global) {
    'use strict';

    const $ = (s, r) => (r || document).querySelector(s);
    const notify = (m, t) =>
        global.notificationManager?.show?.(m, t || 'info') || console.log('[card]', m);

    const state = {
        opts: {
            sizeKey: 'square',
            templateKey: 'saleBold',
            accent: '#0068ff',
            name: '',
            price: '',
            currency: 'đ',
            badge: '',
            note: '',
            shop: 'NhiJudy Store',
            cutout: false,
            _imgSrc: '',
            _img: null,
            _qr: null,
            _qrText: '',
            _origSrc: '', // ảnh gốc (trước xóa nền) — để bật/tắt auto-bg revert được
        },
        autoBg: true, // tự động xóa nền SP khi tải ảnh (user yêu cầu 2026-06-24)
        _renderTimer: null,
    };

    let canvas;

    function scheduleRender(delay) {
        clearTimeout(state._renderTimer);
        state._renderTimer = setTimeout(doRender, delay || 120);
    }

    function doRender() {
        try {
            global.Web2ProductCard.render(canvas, state.opts);
            _fitPreview();
        } catch (e) {
            console.error('[product-card] render error:', e);
        }
    }

    // Canvas vẽ ở 1080+px; thu nhỏ hiển thị qua CSS (giữ tỉ lệ).
    function _fitPreview() {
        const wrap = $('#pcardStage');
        if (!wrap) return;
        const maxW = wrap.clientWidth - 4;
        const maxH = wrap.clientHeight - 4;
        const ratio = canvas.width / canvas.height;
        let w = maxW;
        let h = w / ratio;
        if (h > maxH) {
            h = maxH;
            w = h * ratio;
        }
        canvas.style.width = Math.max(40, w) + 'px';
        canvas.style.height = Math.max(40, h) + 'px';
    }

    async function setImage(src, opts) {
        state.opts._imgSrc = src || '';
        state.opts.cutout = !!(opts && opts.cutout);
        const cutToggle = $('#pcardCutout');
        if (cutToggle) cutToggle.checked = state.opts.cutout;
        if (!src) {
            state.opts._img = null;
            doRender();
            return;
        }
        const img = await global.Web2ProductCard.loadImage(src);
        if (!img) notify('Không tải được ảnh (thử tải ảnh từ máy)', 'warning');
        state.opts._img = img;
        doRender();
    }

    // Tải ảnh SP → TỰ ĐỘNG xóa nền (nếu bật) TRƯỚC khi vẽ card (user yêu cầu 2026-06-24).
    // Giữ ảnh gốc (_origSrc) để bật/tắt auto-bg revert được. Lỗi xóa nền → dùng ảnh gốc.
    async function loadProductImage(src) {
        if (!src) return setImage('', { cutout: false });
        state.opts._origSrc = src;
        if (state.autoBg && global.Web2BgScene?.cutout) {
            notify('Đang tự động xóa nền sản phẩm…', 'info');
            try {
                const out = await global.Web2BgScene.cutout(src, { prefer: 'auto' });
                if (out && out.dataUrl) {
                    await setImage(out.dataUrl, { cutout: true });
                    notify('Đã xóa nền ✓ (' + (out.engine || 'AI') + ')', 'success');
                    return;
                }
            } catch (e) {
                console.warn('[product-card] auto cutout fail:', e);
                notify('Xóa nền tự động lỗi — dùng ảnh gốc', 'warning');
            }
        }
        await setImage(src, { cutout: false });
    }

    async function setQr(text) {
        state.opts._qrText = text || '';
        if (!text) {
            state.opts._qr = null;
            doRender();
            return;
        }
        try {
            let dataUrl = null;
            if (global.Web2QR?.toDataUrl)
                dataUrl = await global.Web2QR.toDataUrl(text, { size: 256 });
            if (dataUrl) state.opts._qr = await global.Web2ProductCard.loadImage(dataUrl);
        } catch {
            state.opts._qr = null;
        }
        doRender();
    }

    // ---------- product picker (kho SP web2) ----------
    let _searchTimer = null;
    function wireProductPicker() {
        const input = $('#pcardProdSearch');
        const drop = $('#pcardProdDrop');
        if (!input || !drop) return;
        const close = () => {
            drop.hidden = true;
            drop.innerHTML = '';
        };
        input.addEventListener('input', () => {
            clearTimeout(_searchTimer);
            const q = input.value.trim();
            if (!q) return close();
            _searchTimer = setTimeout(() => {
                const cache = global.Web2ProductsCache;
                const rows = cache?.findByName ? cache.findByName(q, 8) : [];
                if (!rows.length) {
                    drop.innerHTML =
                        '<div class="pcard-drop-empty">Không thấy SP — gõ tiếp hoặc tải ảnh tay</div>';
                    drop.hidden = false;
                    return;
                }
                drop.innerHTML = rows
                    .map(
                        (p, i) =>
                            `<button type="button" class="pcard-drop-row" data-i="${i}">
                                <span class="pcard-drop-name">${esc(p.name || '')}</span>
                                <span class="pcard-drop-code">${esc(p.code || '')}</span>
                            </button>`
                    )
                    .join('');
                drop.hidden = false;
                drop.querySelectorAll('.pcard-drop-row').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        pickProduct(rows[Number(btn.dataset.i)]);
                        close();
                    });
                });
            }, 200);
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#pcardProdSearch') && !e.target.closest('#pcardProdDrop'))
                close();
        });
    }

    function pickProduct(p) {
        if (!p) return;
        state.opts.name = p.name || '';
        const price = p.price ?? p.sellPrice ?? p.salePrice ?? p.retailPrice ?? '';
        state.opts.price = price ? String(price) : '';
        $('#pcardName').value = state.opts.name;
        $('#pcardPrice').value = state.opts.price;
        $('#pcardProdSearch').value = p.name || '';
        const img = global.Web2ProductsCache?.getAll ? p.imageUrl : p.imageUrl;
        if (img) loadProductImage(img);
        else doRender();
        notify('Đã chọn: ' + (p.name || p.code), 'success');
    }

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape?.escapeHtml) return global.Web2Escape.escapeHtml(s);
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    // ---------- export PNG ----------
    function exportPng() {
        doRender();
        try {
            canvas.toBlob((blob) => {
                if (!blob) {
                    notify('Xuất ảnh thất bại', 'error');
                    return;
                }
                const a = document.createElement('a');
                const safe = (state.opts.name || 'card').replace(/[^\wÀ-ỹ]+/g, '-').slice(0, 40);
                a.download = `card-${safe || 'sp'}.png`;
                a.href = URL.createObjectURL(blob);
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
                notify('Đã tải card PNG', 'success');
            }, 'image/png');
        } catch (e) {
            // SecurityError = canvas bị taint do ảnh SP cross-origin không cho CORS.
            notify('Ảnh SP chặn tải xuống (CORS). Hãy TẢI ẢNH TỪ MÁY rồi xuất lại.', 'error');
            console.error('[product-card] export taint:', e);
        }
    }

    async function copyPng() {
        try {
            const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
            if (!blob || !global.ClipboardItem || !navigator.clipboard?.write) {
                notify('Trình duyệt không hỗ trợ copy ảnh — dùng nút Tải', 'warning');
                return;
            }
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            notify('Đã copy card vào clipboard', 'success');
        } catch (e) {
            notify('Không copy được (CORS?). Thử tải ảnh từ máy.', 'error');
        }
    }

    // ---------- Đăng lên FB (handoff sang trang Đăng bài) ----------
    function shareToFb() {
        if (!global.Web2FbShare) {
            notify('Chưa tải được công cụ chuyển sang Đăng bài', 'error');
            return;
        }
        doRender();
        let dataUrl;
        try {
            dataUrl = canvas.toDataURL('image/png');
        } catch (e) {
            // canvas taint do ảnh SP cross-origin → giống lỗi export.
            notify('Ảnh SP chặn xuất (CORS). Hãy TẢI ẢNH TỪ MÁY rồi thử lại.', 'error');
            return;
        }
        // Caption gợi ý tối thiểu (user sẽ chỉnh / dùng AI ở trang Đăng bài). KHÔNG bịa giá/khuyến mãi.
        const parts = [];
        if (state.opts.name) parts.push(state.opts.name);
        if (state.opts.price) parts.push('Giá: ' + state.opts.price);
        notify('Đang chuyển sang trang Đăng bài…', 'info');
        global.Web2FbShare.send({
            images: [{ dataUrl, name: 'product-card.png' }],
            caption: parts.join('\n'),
            source: 'Tạo card SP',
        });
    }

    // ---------- wire controls ----------
    function bindField(id, key, delay) {
        const el = $('#' + id);
        if (!el) return;
        el.addEventListener('input', () => {
            state.opts[key] = el.value;
            scheduleRender(delay);
        });
    }

    function renderPickers() {
        const PC = global.Web2ProductCard;
        // sizes
        const sizeWrap = $('#pcardSizes');
        sizeWrap.innerHTML = Object.values(PC.SIZES)
            .map(
                (s) =>
                    `<button type="button" class="pcard-chip ${s.key === state.opts.sizeKey ? 'on' : ''}" data-size="${s.key}">${esc(s.label)}</button>`
            )
            .join('');
        sizeWrap.querySelectorAll('[data-size]').forEach((b) =>
            b.addEventListener('click', () => {
                state.opts.sizeKey = b.dataset.size;
                sizeWrap
                    .querySelectorAll('[data-size]')
                    .forEach((x) => x.classList.toggle('on', x === b));
                doRender();
            })
        );
        // templates
        const tplWrap = $('#pcardTpls');
        tplWrap.innerHTML = Object.values(PC.TEMPLATES)
            .map(
                (t) =>
                    `<button type="button" class="pcard-chip ${t.key === state.opts.templateKey ? 'on' : ''}" data-tpl="${t.key}">${esc(t.label)}</button>`
            )
            .join('');
        tplWrap.querySelectorAll('[data-tpl]').forEach((b) =>
            b.addEventListener('click', () => {
                state.opts.templateKey = b.dataset.tpl;
                tplWrap
                    .querySelectorAll('[data-tpl]')
                    .forEach((x) => x.classList.toggle('on', x === b));
                doRender();
            })
        );
        // accents
        const accWrap = $('#pcardAccents');
        accWrap.innerHTML = PC.ACCENTS.map(
            (c) =>
                `<button type="button" class="pcard-swatch ${c === state.opts.accent ? 'on' : ''}" data-acc="${c}" style="background:${c}" aria-label="màu"></button>`
        ).join('');
        accWrap.querySelectorAll('[data-acc]').forEach((b) =>
            b.addEventListener('click', () => {
                state.opts.accent = b.dataset.acc;
                accWrap
                    .querySelectorAll('[data-acc]')
                    .forEach((x) => x.classList.toggle('on', x === b));
                doRender();
            })
        );
    }

    // ── Layout AI: AI free tự dàn card HTML đẹp từ thông tin SP (skill
    // product-card-rich, module dùng chung Web2HtmlSkill). Ảnh SP chèn qua
    // placeholder __PRODUCT_IMAGE__ (client thay sau khi AI sinh, tránh gửi base64).
    function openAiLayout() {
        const o = state.opts;
        if (!global.Web2HtmlSkill)
            return notify('Chưa tải module Layout AI (tải lại trang)', 'error');
        if (!o.name && !o.price) return notify('Nhập tên hoặc giá SP trước đã', 'warning');

        const HS = global.Web2HtmlSkill;
        const fields = {
            name: o.name || '',
            price: o.price ? o.price + (o.currency || '') : '',
            badge: o.badge || '',
            note: o.note || '',
            shop: o.shop || '',
        };
        const extra =
            'Ảnh sản phẩm: dùng ĐÚNG 1 thẻ <img src="__PRODUCT_IMAGE__" style="width:100%;height:100%;object-fit:cover"> trong khối ảnh lớn.';
        const injectImg = (h) =>
            String(h)
                .split('__PRODUCT_IMAGE__')
                .join(o._imgSrc || '');

        const ov = document.createElement('div');
        ov.className = 'pcard-ai-overlay';
        ov.innerHTML = `
            <div class="pcard-ai-modal">
                <div class="pcard-ai-head">
                    <strong><i data-lucide="sparkles"></i> Layout AI — card sản phẩm</strong>
                    <div class="pcard-ai-tools">
                        <button data-act="regen" class="pcard-btn">Tạo lại</button>
                        <button data-act="png" class="pcard-btn primary" disabled>Tải PNG</button>
                        <button data-act="html" class="pcard-btn" disabled>HTML</button>
                        <button data-act="close" class="pcard-btn">Đóng</button>
                    </div>
                </div>
                <div class="pcard-ai-stage"><iframe class="pcard-ai-frame" title="AI card"></iframe></div>
                <div class="pcard-ai-status">Đang tạo…</div>
            </div>`;
        document.body.appendChild(ov);
        if (global.lucide) global.lucide.createIcons();
        const frame = ov.querySelector('.pcard-ai-frame');
        const stage = ov.querySelector('.pcard-ai-stage');
        const status = ov.querySelector('.pcard-ai-status');
        const setReady = (on) =>
            ov
                .querySelectorAll('[data-act=png],[data-act=html]')
                .forEach((b) => (b.disabled = !on));
        let html = '';
        let abort = null;

        function fit() {
            const sz = HS.SIZES.card;
            frame.style.width = sz.w + 'px';
            frame.style.height = sz.h + 'px';
            const scale = Math.min(
                (stage.clientWidth - 24) / sz.w,
                (stage.clientHeight - 24) / sz.h,
                1
            );
            frame.style.transform = `scale(${scale})`;
            frame.style.transformOrigin = 'top center';
        }

        async function run() {
            if (abort) abort.abort();
            abort = new AbortController();
            setReady(false);
            status.textContent = 'Đang tạo… (xem trực tiếp)';
            try {
                html = injectImg(
                    await HS.generate({
                        skillId: 'product-card-rich',
                        data: fields,
                        extra,
                        signal: abort.signal,
                        onDelta: (full) => {
                            HS.renderToIframe(frame, injectImg(HS.cleanHtml(full)));
                            fit();
                        },
                    })
                );
                HS.renderToIframe(frame, html);
                fit();
                status.textContent = 'Xong ✓ — tải PNG/HTML hoặc “Tạo lại”.';
                setReady(true);
            } catch (e) {
                if (e?.name !== 'AbortError') {
                    status.textContent = 'Lỗi: ' + (e.message || e);
                    notify('Layout AI lỗi: ' + (e.message || e), 'error');
                }
            }
        }

        function close() {
            if (abort) abort.abort();
            window.removeEventListener('resize', fit);
            ov.remove();
        }
        ov.addEventListener('click', (e) => {
            if (e.target === ov) return close();
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'close') close();
            else if (act === 'regen') run();
            else if (act === 'png') HS.exportPng(frame, 'card-' + (o.name || 'sp'));
            else if (act === 'html') HS.exportHtml(html, 'card-' + (o.name || 'sp'));
        });
        window.addEventListener('resize', fit);
        run();
    }

    function init() {
        canvas = $('#pcardCanvas');
        if (!canvas) return;
        if (!global.Web2ProductCard) {
            notify('Chưa tải được bộ vẽ card', 'error');
            return;
        }
        renderPickers();
        bindField('pcardName', 'name');
        bindField('pcardPrice', 'price');
        bindField('pcardBadge', 'badge');
        bindField('pcardNote', 'note');
        bindField('pcardShop', 'shop');
        // defaults vào input
        $('#pcardShop').value = state.opts.shop;
        // cutout toggle (chế độ vẽ — ảnh đã tách nền hay chưa)
        $('#pcardCutout')?.addEventListener('change', (e) => {
            state.opts.cutout = e.target.checked;
            doRender();
        });
        // auto-xóa-nền toggle: đổi → xử lý lại từ ẢNH GỐC (bật = cutout, tắt = ảnh gốc)
        const autoEl = $('#pcardAutoBg');
        if (autoEl) state.autoBg = autoEl.checked;
        autoEl?.addEventListener('change', (e) => {
            state.autoBg = e.target.checked;
            if (state.opts._origSrc) loadProductImage(state.opts._origSrc);
        });
        // QR field
        $('#pcardQr')?.addEventListener('input', (e) => {
            clearTimeout(state._qrTimer);
            state._qrTimer = setTimeout(() => setQr(e.target.value.trim()), 300);
        });
        // upload
        $('#pcardUpload')?.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => loadProductImage(r.result);
            r.readAsDataURL(f);
        });
        // paste ảnh
        window.addEventListener('paste', (e) => {
            const item = [...(e.clipboardData?.items || [])].find((i) =>
                i.type.startsWith('image/')
            );
            if (!item) return;
            const f = item.getAsFile();
            const r = new FileReader();
            r.onload = () => loadProductImage(r.result);
            r.readAsDataURL(f);
        });
        wireProductPicker();
        $('#pcardExport')?.addEventListener('click', exportPng);
        $('#pcardCopy')?.addEventListener('click', copyPng);
        $('#pcardShareFb')?.addEventListener('click', shareToFb);
        $('#pcardAiLayout')?.addEventListener('click', openAiLayout);
        // Xoá logo/watermark trên ảnh SP (tool dùng chung Web2LogoEraser)
        $('#pcardEraseLogo')?.addEventListener('click', async () => {
            if (!state.opts._imgSrc) return notify('Hãy chọn/tải ảnh SP trước', 'warning');
            if (!global.Web2LogoEraser?.open)
                return notify('Chưa tải được công cụ xoá logo', 'error');
            const cleaned = await global.Web2LogoEraser.open(state.opts._imgSrc);
            if (cleaned) setImage(cleaned, { cutout: state.opts.cutout });
        });
        // Chỉnh sửa ảnh đầy đủ (cắt/lọc/chữ/watermark) — module dùng chung Web2ImageEditor
        $('#pcardEditImg')?.addEventListener('click', async () => {
            if (!state.opts._imgSrc) return notify('Hãy chọn/tải ảnh SP trước', 'warning');
            if (!global.Web2ImageEditor?.open)
                return notify('Chưa tải được trình chỉnh sửa ảnh', 'error');
            const edited = await global.Web2ImageEditor.open(state.opts._imgSrc, {
                name: state.opts.name || 'sp',
            });
            if (edited) setImage(edited, { cutout: state.opts.cutout });
        });
        // product cache (im lặng nếu lỗi)
        global.Web2ProductsCache?.init?.().catch(() => {});
        window.addEventListener('resize', _fitPreview);
        doRender();
    }

    global.ProductCardPage = { init, _state: state };
})(window);
