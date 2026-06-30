// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Sổ Order: surface "chờ hàng cần đặt".
// Sổ Order — modal "Chờ hàng cần đặt": SP có cầu giỏ NHÁP > TỒN (cần đặt thêm NCC).
// Nguồn: GET /api/web2-products/restock-needed (committed draft − stock). Bấm chọn →
// mở modal Tạo Đơn Hàng prefill sẵn (qty = cần đặt). #2 follow-up 2026-06-30.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});
    const esc = (s) =>
        window.Web2Escape && window.Web2Escape.escapeHtml
            ? window.Web2Escape.escapeHtml(s)
            : SO.escapeHtml
              ? SO.escapeHtml(s)
              : String(s == null ? '' : s);

    function _overlay() {
        let ov = document.getElementById('soRestockOverlay');
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = 'soRestockOverlay';
        ov.style.cssText =
            'position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;padding:20px';
        ov.innerHTML =
            '<div class="so-restock-box" style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;border-bottom:1px solid #eef2f7">' +
            '<strong style="font-size:15px">📦 Chờ hàng cần đặt <span id="soRestockCount" style="color:#0068ff"></span></strong>' +
            '<button id="soRestockClose" type="button" style="border:0;background:#f1f5f9;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px">✕</button>' +
            '</div>' +
            '<div id="soRestockBody" style="overflow-y:auto;padding:10px 14px;flex:1"></div>' +
            '<div style="padding:12px 18px;border-top:1px solid #eef2f7;display:flex;gap:10px;align-items:center;justify-content:space-between">' +
            '<label style="font-size:13px;color:#475569;display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="soRestockAll" checked /> Chọn tất cả</label>' +
            '<button id="soRestockAdd" type="button" class="btn btn-primary" style="font-weight:600">+ Thêm vào đơn mới</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.id === 'soRestockClose') _hide();
        });
        ov.querySelector('#soRestockAll').addEventListener('change', function () {
            ov.querySelectorAll('.so-restock-chk').forEach((c) => (c.checked = this.checked));
        });
        ov.querySelector('#soRestockAdd').addEventListener('click', _addSelected);
        return ov;
    }

    function _hide() {
        const ov = document.getElementById('soRestockOverlay');
        if (ov) ov.style.display = 'none';
    }

    let _items = [];

    SO.openRestockModal = async function openRestockModal() {
        const ov = _overlay();
        ov.style.display = 'flex';
        const body = ov.querySelector('#soRestockBody');
        body.innerHTML =
            '<div style="padding:24px;text-align:center;color:#94a3b8">Đang tải…</div>';
        try {
            const d = await window.Web2ProductsApi.restockNeeded();
            _items = (d && d.items) || [];
        } catch (e) {
            body.innerHTML =
                '<div style="padding:20px;color:#b45309">⚠️ Lỗi tải: ' + esc(e.message) + '</div>';
            return;
        }
        ov.querySelector('#soRestockCount').textContent = _items.length
            ? '(' + _items.length + ' SP)'
            : '';
        if (!_items.length) {
            body.innerHTML =
                '<div style="padding:28px;text-align:center;color:#16a34a">✓ Không có SP nào cần đặt thêm — giỏ chưa vượt tồn.</div>';
            return;
        }
        body.innerHTML = _items
            .map((p, i) => {
                const img = p.imageUrl
                    ? '<img src="' +
                      esc(p.imageUrl) +
                      '" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover" />'
                    : '<span style="width:40px;height:40px;border-radius:8px;background:#f1f5f9;display:grid;place-items:center">📦</span>';
                return (
                    '<label style="display:flex;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid #f3f4f6;cursor:pointer">' +
                    '<input type="checkbox" class="so-restock-chk" data-i="' +
                    i +
                    '" checked />' +
                    img +
                    '<div style="flex:1;min-width:0">' +
                    '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
                    esc(p.name) +
                    (p.variant ? ' · ' + esc(p.variant) : '') +
                    '</div>' +
                    '<div style="font-size:11.5px;color:#64748b">' +
                    esc(p.code) +
                    (p.supplier ? ' · NCC ' + esc(p.supplier) : '') +
                    (p.region ? ' · ' + esc(p.region) : '') +
                    '</div></div>' +
                    '<div style="text-align:right;font-size:12px;white-space:nowrap">' +
                    '<span style="color:#475569">Tồn ' +
                    (p.stock || 0) +
                    ' · Giỏ ' +
                    (p.demand || 0) +
                    '</span><br/>' +
                    '<strong style="color:#b45309">cần đặt ' +
                    (p.needed || 0) +
                    '</strong></div>' +
                    '</label>'
                );
            })
            .join('');
    };

    function _addSelected() {
        const ov = document.getElementById('soRestockOverlay');
        if (!ov) return;
        const chosen = [];
        ov.querySelectorAll('.so-restock-chk').forEach((c) => {
            if (c.checked) chosen.push(_items[Number(c.dataset.i)]);
        });
        if (!chosen.length) {
            if (SO.notify) SO.notify('Chưa chọn SP nào', 'warning');
            return;
        }
        _hide();
        // Mở modal Tạo Đơn Hàng rồi prefill rows (qty = cần đặt). Tái dùng
        // _fillRowFromProduct (quy đổi giá VND→tab + ảnh) qua product cache.
        SO.openOrderModal(null);
        const rows = chosen.map((it) => {
            const row = SO._newModalRow({ qty: it.needed || 1 });
            const p = (window.Web2ProductsCache && window.Web2ProductsCache.findByCode
                ? window.Web2ProductsCache.findByCode(it.code)
                : null) || {
                name: it.name,
                code: it.code,
                variant: it.variant,
                price: it.price,
                imageUrl: it.imageUrl,
                supplier: it.supplier,
            };
            if (SO._fillRowFromProduct) SO._fillRowFromProduct(row, p, true);
            else {
                row.productName = it.name;
                row.matchedCode = it.code;
                row.variant = it.variant || '';
            }
            row.supplier = it.supplier || row.supplier || '';
            row.qty = it.needed || 1; // SL gợi ý = cần đặt (sau _fill có thể bị reset)
            return row;
        });
        SO.modalRows = rows.length ? rows : [SO._newModalRow()];
        if (SO.renderModalRows) SO.renderModalRows();
        if (SO.notify) SO.notify('Đã thêm ' + rows.length + ' SP cần đặt vào đơn', 'success');
    }
})();
