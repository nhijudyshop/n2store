// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — chọn SP từ Kho SP (1 hoặc NHIỀU) trả full object.
// =====================================================================
// Web 2.0 — Web2ProductPicker: overlay chọn sản phẩm từ Kho SP (Web2ProductsCache).
//   NGUỒN DUY NHẤT cho việc "chọn SP từ kho" — trang nào cần (đăng bài AI, in tem, …)
//   load module này rồi gọi, KHÔNG dựng lại picker.
//
// API:
//   Web2ProductPicker.open({ multi:false, title, onPick(product) })          // chọn 1, click là xong
//   Web2ProductPicker.open({ multi:true,  title, onConfirm(products[]) })    // chọn nhiều + nút xác nhận
// product = object đầy đủ từ Web2ProductsCache (name, code, price, imageUrl/images, …).
// =====================================================================
(function () {
    'use strict';

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function imgOf(p) {
        return (
            p.imageUrl || p.image_url || (Array.isArray(p.images) && p.images[0]) || p.image || ''
        );
    }
    function priceText(p) {
        const n = Number(p.price);
        return n ? n.toLocaleString('vi-VN') + 'đ' : '';
    }

    async function open(opts) {
        opts = opts || {};
        const multi = !!opts.multi;
        const selected = new Map(); // code → product

        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;max-width:720px;width:100%;max-height:84vh;display:flex;flex-direction:column;overflow:hidden">
                <div style="padding:14px 16px;border-bottom:1px solid #eef2f7;display:flex;gap:10px;align-items:center">
                    <strong style="flex:1">${esc(opts.title || (multi ? 'Chọn sản phẩm (nhiều)' : 'Chọn sản phẩm'))}</strong>
                    <button data-x class="fbp-btn ghost sm" type="button">Đóng</button>
                </div>
                <div style="padding:12px 16px">
                    <input data-q placeholder="Tìm theo tên / mã SP…" style="width:100%;height:40px;border:1px solid #d8e0ea;border-radius:10px;padding:0 12px;font-size:.92rem;outline:none" />
                </div>
                <div data-list style="flex:1;overflow:auto;padding:0 16px 12px;display:flex;flex-direction:column;gap:8px"></div>
                ${
                    multi
                        ? `<div style="padding:12px 16px;border-top:1px solid #eef2f7;display:flex;align-items:center;gap:10px">
                        <span data-count style="flex:1;font-size:.88rem;color:#5a6b80">Đã chọn 0</span>
                        <button data-confirm class="fbp-btn" type="button" style="background:var(--web2-primary,#0068ff);color:#fff;border:none;border-radius:10px;padding:9px 18px;font-weight:700;cursor:pointer">Dùng sản phẩm đã chọn</button>
                    </div>`
                        : ''
                }
            </div>`;
        document.body.appendChild(overlay);
        const listEl = overlay.querySelector('[data-list]');
        const countEl = overlay.querySelector('[data-count]');
        const close = () => overlay.remove();
        overlay.querySelector('[data-x]').onclick = close;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        try {
            if (window.Web2ProductsCache && window.Web2ProductsCache.init)
                await window.Web2ProductsCache.init();
        } catch (_) {}
        if (!window.Web2ProductsCache) {
            listEl.innerHTML =
                '<div style="grid-column:1/-1;color:#94a3b8;text-align:center;padding:24px">Kho SP chưa sẵn sàng</div>';
            return;
        }

        function updateCount() {
            if (countEl) countEl.textContent = `Đã chọn ${selected.size}`;
        }
        // Mỗi sản phẩm = 1 DÒNG: ảnh + tên + mã + giá (dạng danh sách, dễ nhìn hơn lưới ảnh)
        function rowHtml(p) {
            const on = selected.has(p.code);
            const im = imgOf(p);
            const pr = priceText(p);
            const thumb = im
                ? `background:#f4f6f9 url('${esc(im)}') center/cover`
                : 'background:#f4f6f9;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:1.4rem';
            return `<div data-code="${esc(p.code)}" data-row style="display:flex;align-items:center;gap:12px;padding:8px 10px;border:1.5px solid ${on ? 'var(--web2-primary,#0068ff)' : '#eef2f7'};border-radius:12px;cursor:pointer;background:${on ? 'rgba(0,104,255,.05)' : '#fff'};transition:border-color .12s,background .12s">
                <div style="flex:0 0 52px;width:52px;height:52px;border-radius:9px;overflow:hidden;${thumb}">${im ? '' : '📦'}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:.9rem;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.name || p.code || '')}</div>
                    ${p.code ? `<div style="font-size:.74rem;color:#94a3b8;margin-top:1px">${esc(p.code)}</div>` : ''}
                </div>
                ${pr ? `<div style="flex:0 0 auto;font-size:.9rem;color:var(--web2-primary,#0068ff);font-weight:700;white-space:nowrap">${pr}</div>` : ''}
                ${multi ? `<span data-tick style="flex:0 0 auto;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800;background:${on ? 'var(--web2-primary,#0068ff)' : '#eef2f7'};color:${on ? '#fff' : 'transparent'}">✓</span>` : ''}
            </div>`;
        }
        // Cập nhật riêng 1 dòng khi toggle (không vẽ lại cả list → giữ vị trí cuộn)
        function applyRowState(el, on) {
            el.style.borderColor = on ? 'var(--web2-primary,#0068ff)' : '#eef2f7';
            el.style.background = on ? 'rgba(0,104,255,.05)' : '#fff';
            const tick = el.querySelector('[data-tick]');
            if (tick) {
                tick.style.background = on ? 'var(--web2-primary,#0068ff)' : '#eef2f7';
                tick.style.color = on ? '#fff' : 'transparent';
            }
        }
        function draw(q) {
            let items = window.Web2ProductsCache.getAll() || [];
            if (q && q.trim()) {
                items = window.Web2ProductsCache.findByName
                    ? window.Web2ProductsCache.findByName(q, 80)
                    : items.filter((p) =>
                          `${p.name || ''} ${p.code || ''}`.toLowerCase().includes(q.toLowerCase())
                      );
            }
            items = items.slice(0, 80);
            if (!items.length) {
                listEl.innerHTML =
                    '<div style="color:#94a3b8;text-align:center;padding:24px">Không tìm thấy SP</div>';
                return;
            }
            listEl.innerHTML = items.map(rowHtml).join('');
            listEl.querySelectorAll('[data-row]').forEach((el) => {
                el.addEventListener('click', () => {
                    const code = el.dataset.code;
                    const prod = window.Web2ProductsCache.findByCode
                        ? window.Web2ProductsCache.findByCode(code)
                        : items.find((p) => p.code === code);
                    if (!prod) return;
                    if (!multi) {
                        close();
                        opts.onPick && opts.onPick(prod);
                        return;
                    }
                    if (selected.has(code)) selected.delete(code);
                    else selected.set(code, prod);
                    applyRowState(el, selected.has(code));
                    updateCount();
                });
            });
        }
        draw('');
        let t;
        overlay.querySelector('[data-q]').addEventListener('input', (e) => {
            clearTimeout(t);
            t = setTimeout(() => draw(e.target.value), 220);
        });
        const confirmBtn = overlay.querySelector('[data-confirm]');
        if (confirmBtn)
            confirmBtn.onclick = () => {
                if (!selected.size) {
                    notify('Chưa chọn sản phẩm nào', 'warning');
                    return;
                }
                close();
                opts.onConfirm && opts.onConfirm([...selected.values()]);
            };
    }

    window.Web2ProductPicker = { open };
})();
