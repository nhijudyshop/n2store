// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — QUẢN LÝ ẢNH NCC theo đợt (2026-06-28). Ảnh lưu BYTEA ở Render web2Db
// (`/api/web2-so-order-images`), KHÔNG nhét base64 vào doc so-order.
//
// Mỗi (tabId, đợt/batch, NCC) có: 1 ảnh HÓA ĐƠN + nhiều ảnh SP. Modal cho dán
// (Ctrl+V/kéo thả) qua Web2Effects.attachImageDropTarget (nén JPEG ~500KB) → POST.
// Khi tạo đơn (so-order-modal): nhập NCC → auto ảnh hóa đơn + gallery ảnh SP cho chọn.
// Realtime đồng bộ qua SSE topic 'web2:so-order-images'.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    function _worker() {
        return (
            (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function _base() {
        return _worker() + '/api/web2-so-order-images';
    }
    // URL ảnh public (cho <img src> ở manager + create-order).
    SO.imgMgrUrl = function imgMgrUrl(id) {
        return _base() + '/img/' + encodeURIComponent(id);
    };

    async function _api(path, opts) {
        const o = opts || {};
        const headers = SO._w2Auth(o.body ? { 'Content-Type': 'application/json' } : {});
        const r = await fetch(_base() + path, { ...o, headers });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.success === false) throw new Error(d.error || 'HTTP ' + r.status);
        return d;
    }

    // ------ Data layer cho create-order (F2.4) ------
    // /by-ncc → { invoice:{id}|null, products:[{id}] } của 1 NCC trong đợt.
    SO.imgMgrByNcc = async function imgMgrByNcc(batch, ncc) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const qs =
            'tabId=' +
            encodeURIComponent(tab.id) +
            '&batch=' +
            encodeURIComponent(batch || '') +
            '&ncc=' +
            encodeURIComponent(ncc || '');
        return _api('/by-ncc?' + qs);
    };

    // ------ Modal state ------
    SO._imgMgr = { items: [], activeBatch: null, search: '', drafts: {} };

    function _tabId() {
        return window.SoOrderStorage.getActiveTab(SO.state).id;
    }

    // Đợt có sẵn = union(batch của ảnh, batch của lô so-order) — sort: số tăng dần,
    // rỗng ('Chưa đặt') cuối.
    function _allBatches() {
        const set = new Set();
        for (const it of SO._imgMgr.items) set.add(it.batch || '');
        for (const sh of window.SoOrderStorage.getActiveTab(SO.state).shipments || [])
            set.add(window.SoOrderStorage.batchKeyOf(sh));
        for (const b of Object.keys(SO._imgMgr.drafts)) set.add(b);
        const arr = [...set];
        arr.sort((a, b) => {
            if (a === '') return 1;
            if (b === '') return -1;
            const na = Number(a),
                nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b), 'vi');
        });
        return arr;
    }

    function _batchLabel(b) {
        return b === '' ? 'Chưa đặt đợt' : 'Đợt ' + b;
    }

    SO.openImageManager = async function openImageManager() {
        if (SO._isAdmin && !SO._isAdmin()) {
            SO.notify('Chỉ admin được quản lý ảnh', 'warning');
            return;
        }
        SO._imgMgr.search = '';
        SO.showModal('soImageManagerModal');
        const s = document.getElementById('soImgMgrSearch');
        if (s) s.value = '';
        await SO._imgMgrReload();
    };

    SO._imgMgrReload = async function _imgMgrReload() {
        try {
            const d = await _api('/list?tabId=' + encodeURIComponent(_tabId()));
            SO._imgMgr.items = Array.isArray(d.items) ? d.items : [];
        } catch (e) {
            SO.notify('Lỗi tải kho ảnh: ' + e.message, 'error');
            SO._imgMgr.items = [];
        }
        // activeBatch mặc định = đợt đầu (hoặc giữ nếu còn tồn tại)
        const batches = _allBatches();
        if (SO._imgMgr.activeBatch == null || !batches.includes(SO._imgMgr.activeBatch))
            SO._imgMgr.activeBatch = batches[0] != null ? batches[0] : '';
        SO._imgMgrRender();
    };

    SO._imgMgrRender = function _imgMgrRender() {
        SO._imgMgrRenderBatches();
        SO._imgMgrRenderList();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    SO._imgMgrRenderBatches = function _imgMgrRenderBatches() {
        const host = document.getElementById('soImgMgrBatches');
        if (!host) return;
        const batches = _allBatches();
        const active = SO._imgMgr.activeBatch;
        // count NCC distinct per batch
        const cntByBatch = {};
        for (const b of batches) {
            const nccs = new Set(
                SO._imgMgr.items.filter((it) => (it.batch || '') === b).map((it) => it.ncc)
            );
            for (const ncc of Object.keys(SO._imgMgr.drafts[b] || {})) nccs.add(ncc);
            cntByBatch[b] = nccs.size;
        }
        const pills = batches
            .map((b, i) => {
                const cls = b === active ? 'is-active' : '';
                const c = cntByBatch[b] || 0;
                return `<button type="button" class="so-imc-batch ${cls}" data-batch-idx="${i}">
                    <span>${SO.escapeHtml(_batchLabel(b))}</span>
                    ${c ? `<span class="so-imc-batch-count">${c}</span>` : ''}
                </button>`;
            })
            .join('');
        host.innerHTML =
            pills +
            `<button type="button" class="so-imc-batch so-imc-batch-new" id="soImgMgrNewBatch"><i data-lucide="plus"></i> Đợt mới</button>`;
        host.querySelectorAll('.so-imc-batch[data-batch-idx]').forEach((el) => {
            el.addEventListener('click', () => {
                SO._imgMgr.activeBatch = batches[Number(el.dataset.batchIdx)];
                SO._imgMgrRender();
            });
        });
        const nb = document.getElementById('soImgMgrNewBatch');
        if (nb)
            nb.addEventListener('click', async () => {
                const v = await SO._imgMgrPromptBatch();
                if (v == null) return;
                const b = String(v).trim();
                if (!SO._imgMgr.drafts[b]) SO._imgMgr.drafts[b] = {};
                SO._imgMgr.activeBatch = b;
                SO._imgMgrRender();
            });
    };

    // Prompt đợt mới — dùng Popup nếu có, fallback prompt.
    SO._imgMgrPromptBatch = async function _imgMgrPromptBatch() {
        if (window.Popup?.prompt) {
            return await window.Popup.prompt({
                title: 'Đợt mới',
                message: 'Nhập số/tên đợt (vd 1, 2A):',
                placeholder: 'Số đợt…',
            });
        }
        return window.prompt('Nhập số/tên đợt mới (vd 1, 2A):', '');
    };

    SO._imgMgrRenderList = function _imgMgrRenderList() {
        const host = document.getElementById('soImgMgrList');
        if (!host) return;
        const batch = SO._imgMgr.activeBatch || '';
        const q = (SO._imgMgr.search || '').trim().toLowerCase();
        // group items của batch theo ncc
        const byNcc = new Map(); // ncc -> {invoice, products:[]}
        for (const it of SO._imgMgr.items) {
            if ((it.batch || '') !== batch) continue;
            if (!byNcc.has(it.ncc)) byNcc.set(it.ncc, { invoice: null, products: [] });
            const g = byNcc.get(it.ncc);
            if (it.kind === 'invoice') g.invoice = it;
            else g.products.push(it);
        }
        // thêm draft NCC (chưa có ảnh)
        for (const ncc of Object.keys(SO._imgMgr.drafts[batch] || {})) {
            if (!byNcc.has(ncc)) byNcc.set(ncc, { invoice: null, products: [], draft: true });
        }
        let nccs = [...byNcc.keys()];
        if (q) nccs = nccs.filter((n) => String(n).toLowerCase().includes(q));
        nccs.sort((a, b) => String(a).localeCompare(String(b), 'vi'));

        const cards = nccs.map((ncc) => SO._imgMgrCardHtml(ncc, byNcc.get(ncc), batch)).join('');
        host.innerHTML = `
            <div class="so-imc-group">
                <div class="so-imc-group-head"><i data-lucide="layers"></i> ${SO.escapeHtml(_batchLabel(batch))} · ${nccs.length} NCC</div>
                ${cards || '<div class="so-imc-empty">Chưa có NCC nào — bấm “Thêm NCC” để bắt đầu.</div>'}
                <button type="button" class="so-imc-add-ncc" id="soImgMgrAddNcc"><i data-lucide="plus"></i> Thêm NCC vào ${SO.escapeHtml(_batchLabel(batch))}</button>
            </div>`;
        SO._imgMgrWireList(batch);
    };

    SO._imgMgrCardHtml = function _imgMgrCardHtml(ncc, g, batch) {
        const isDraft = !!g.draft && !g.invoice && !g.products.length;
        const invHtml = g.invoice
            ? `<div class="so-imc-thumb"><img src="${SO.imgMgrUrl(g.invoice.id)}" alt="hóa đơn" /><button type="button" class="so-imc-thumb-del" data-del-id="${SO.escapeHtml(g.invoice.id)}" title="Xoá"><i data-lucide="x"></i></button></div>`
            : `<div class="so-imc-paste" data-paste-kind="invoice" tabindex="0"><i data-lucide="clipboard-paste"></i><span>Ctrl+V / kéo thả ảnh hóa đơn</span></div>`;
        const prodThumbs = g.products
            .map(
                (p) =>
                    `<div class="so-imc-thumb"><img src="${SO.imgMgrUrl(p.id)}" alt="sp" /><button type="button" class="so-imc-thumb-del" data-del-id="${SO.escapeHtml(p.id)}" title="Xoá"><i data-lucide="x"></i></button></div>`
            )
            .join('');
        return `<div class="so-imc-card" data-ncc="${SO.escapeHtml(ncc)}" data-batch="${SO.escapeHtml(batch)}">
            <div class="so-imc-card-head">
                <input class="so-imc-ncc-input" value="${SO.escapeHtml(ncc)}" placeholder="Tên NCC…" ${isDraft ? '' : 'readonly'} />
                <button type="button" class="so-imc-del-ncc" data-del-ncc title="Xoá NCC + ảnh"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="so-imc-sects">
                <div class="so-imc-sect">
                    <div class="so-imc-sect-label"><i data-lucide="receipt"></i> Ảnh hóa đơn <span>(1)</span></div>
                    ${invHtml}
                </div>
                <div class="so-imc-sect so-imc-sect-prod">
                    <div class="so-imc-sect-label"><i data-lucide="package"></i> Ảnh sản phẩm <span>(${g.products.length})</span></div>
                    <div class="so-imc-products">
                        ${prodThumbs}
                        <div class="so-imc-paste so-imc-paste-add" data-paste-kind="product" tabindex="0"><i data-lucide="plus"></i><span>Thêm ảnh SP</span></div>
                    </div>
                </div>
            </div>
        </div>`;
    };

    SO._imgMgrWireList = function _imgMgrWireList(batch) {
        const host = document.getElementById('soImgMgrList');
        if (!host) return;
        // Add NCC (draft)
        const addBtn = document.getElementById('soImgMgrAddNcc');
        if (addBtn)
            addBtn.addEventListener('click', () => {
                if (!SO._imgMgr.drafts[batch]) SO._imgMgr.drafts[batch] = {};
                // draft key tạm '' → 1 card trống; nhập tên rồi paste sẽ upload.
                SO._imgMgr.drafts[batch][''] = true;
                SO._imgMgrRenderList();
                if (window.lucide?.createIcons) window.lucide.createIcons();
                host.querySelector('.so-imc-card[data-ncc=""] .so-imc-ncc-input')?.focus();
            });
        // Wire each card
        host.querySelectorAll('.so-imc-card').forEach((card) => {
            const nccInput = card.querySelector('.so-imc-ncc-input');
            const curNcc = () => (nccInput?.value || '').trim();
            // draft rename: cập nhật draft key khi gõ tên
            if (nccInput && !nccInput.readOnly) {
                nccInput.addEventListener('change', () => {
                    const d = SO._imgMgr.drafts[batch] || {};
                    delete d[card.dataset.ncc];
                    d[curNcc()] = true;
                    card.dataset.ncc = curNcc();
                });
            }
            // paste areas
            card.querySelectorAll('[data-paste-kind]').forEach((zone) => {
                if (window.Web2Effects?.attachImageDropTarget) {
                    window.Web2Effects.attachImageDropTarget(zone, {
                        onResult: (dataUrl) =>
                            SO._imgMgrUpload(batch, curNcc(), zone.dataset.pasteKind, dataUrl),
                        notify: SO.notify,
                    });
                }
            });
            // delete single image
            card.querySelectorAll('[data-del-id]').forEach((b) =>
                b.addEventListener('click', () => SO._imgMgrDelete(b.dataset.delId))
            );
            // delete NCC
            const delNcc = card.querySelector('[data-del-ncc]');
            if (delNcc)
                delNcc.addEventListener('click', () => SO._imgMgrDeleteNcc(batch, curNcc(), card));
        });
    };

    SO._imgMgrUpload = async function _imgMgrUpload(batch, ncc, kind, dataUrl) {
        if (!ncc) {
            SO.notify('Nhập tên NCC trước khi dán ảnh', 'warning');
            return;
        }
        try {
            await _api('/', {
                method: 'POST',
                body: JSON.stringify({ tabId: _tabId(), batch, ncc, kind, dataUrl }),
            });
            // draft → đã có ảnh, bỏ draft
            if (SO._imgMgr.drafts[batch]) {
                delete SO._imgMgr.drafts[batch][ncc];
                delete SO._imgMgr.drafts[batch][''];
            }
            SO.notify(kind === 'invoice' ? 'Đã lưu ảnh hóa đơn' : 'Đã thêm ảnh SP', 'success');
            await SO._imgMgrReload();
        } catch (e) {
            SO.notify('Lỗi lưu ảnh: ' + e.message, 'error');
        }
    };

    SO._imgMgrDelete = async function _imgMgrDelete(id) {
        try {
            await _api('/' + encodeURIComponent(id), { method: 'DELETE' });
            await SO._imgMgrReload();
        } catch (e) {
            SO.notify('Lỗi xoá ảnh: ' + e.message, 'error');
        }
    };

    SO._imgMgrDeleteNcc = async function _imgMgrDeleteNcc(batch, ncc, card) {
        if (!ncc) {
            // draft trống → chỉ bỏ card
            if (SO._imgMgr.drafts[batch]) {
                delete SO._imgMgr.drafts[batch][''];
                delete SO._imgMgr.drafts[batch][card?.dataset?.ncc || ''];
            }
            SO._imgMgrRenderList();
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        const ok = window.Popup?.confirm
            ? await window.Popup.confirm(`Xoá NCC "${ncc}" và toàn bộ ảnh trong đợt này?`)
            : window.confirm(`Xoá NCC "${ncc}" và toàn bộ ảnh?`);
        if (!ok) return;
        try {
            await _api('/ncc', {
                method: 'DELETE',
                body: JSON.stringify({ tabId: _tabId(), batch, ncc }),
            });
            if (SO._imgMgr.drafts[batch]) delete SO._imgMgr.drafts[batch][ncc];
            SO.notify('Đã xoá NCC + ảnh', 'info');
            await SO._imgMgrReload();
        } catch (e) {
            SO.notify('Lỗi xoá: ' + e.message, 'error');
        }
    };

    // Wire nút mở + search + SSE (gọi 1 lần trong init).
    SO.wireImageManager = function wireImageManager() {
        const btn = document.getElementById('soImageMgrBtn');
        if (btn && !btn.__imcBound) {
            btn.__imcBound = true;
            btn.addEventListener('click', SO.openImageManager);
        }
        const search = document.getElementById('soImgMgrSearch');
        if (search && !search.__imcBound) {
            search.__imcBound = true;
            search.addEventListener('input', () => {
                SO._imgMgr.search = search.value;
                SO._imgMgrRenderList();
                if (window.lucide?.createIcons) window.lucide.createIcons();
            });
        }
        if (window.Web2SSE && !SO._imcSseBound) {
            SO._imcSseBound = true;
            let t = null;
            window.Web2SSE.subscribe('web2:so-order-images', () => {
                const m = document.getElementById('soImageManagerModal');
                if (!m || m.hidden) return;
                clearTimeout(t);
                t = setTimeout(() => SO._imgMgrReload(), 500);
            });
        }
    };

    // ====== Tích hợp create-order (F2.4) — auto ảnh hóa đơn + gallery ảnh SP ======

    // Đợt (batch) của modal đang mở: edit-shipment → batch của lô; create → field Đợt.
    SO._modalBatch = function _modalBatch() {
        if (SO.modalMode === 'edit-shipment' && SO.editingShipmentId) {
            const tab = window.SoOrderStorage.getActiveTab(SO.state);
            const sh = (tab.shipments || []).find((s) => s.id === SO.editingShipmentId);
            return sh ? window.SoOrderStorage.batchKeyOf(sh) : '';
        }
        const f = document.getElementById('soOrderForm');
        return (f?.elements?.shipBatch?.value || '').trim();
    };

    // NCC của order khi tạo đơn: header supplier (create) hoặc dòng (edit-shipment).
    SO._modalOrderNcc = function _modalOrderNcc() {
        const f = document.getElementById('soOrderForm');
        const headerSup = (f?.elements?.supplier?.value || '').trim();
        if (headerSup) return headerSup;
        return (SO.modalRows.find((r) => (r.supplier || '').trim())?.supplier || '').trim();
    };

    // Auto đổ ảnh HÓA ĐƠN của NCC vào đơn (CHỌN 1 LẦN — chỉ khi ô đang trống).
    SO._imgMgrAutoInvoice = async function _imgMgrAutoInvoice(ncc) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const name = (ncc || '').trim();
        if (!tab.imageManager || !name) return;
        if ((SO.modalInvoiceImage || '').trim()) return; // đã có → không đè
        try {
            const d = await SO.imgMgrByNcc(SO._modalBatch(), name);
            if (d.invoice && !(SO.modalInvoiceImage || '').trim() && SO._setOrderInvoiceImage)
                SO._setOrderInvoiceImage(SO.imgMgrUrl(d.invoice.id));
        } catch (e) {
            /* im lặng — không chặn tạo đơn */
        }
    };

    // Mở gallery ảnh SP của NCC (theo dòng) → click ảnh = set productImage cho dòng.
    SO._imgMgrOpenGalleryForRow = async function _imgMgrOpenGalleryForRow(uid) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        if (!tab.imageManager) return;
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const ncc = (row.supplier || '').trim() || SO._modalOrderNcc();
        if (!ncc) {
            SO.notify('Nhập NCC cho dòng này trước', 'warning');
            return;
        }
        const batch = SO._modalBatch();
        let d;
        try {
            d = await SO.imgMgrByNcc(batch, ncc);
        } catch (e) {
            SO.notify('Lỗi tải ảnh NCC: ' + e.message, 'error');
            return;
        }
        const ids = (d.products || []).map((p) => p.id);
        if (!ids.length) {
            SO.notify(`NCC "${ncc}" chưa có ảnh SP ở ${_batchLabel(batch)}`, 'info');
            return;
        }
        SO._imgMgrShowGallery(ncc, ids, (id) => {
            if (SO._applyImageToRow) SO._applyImageToRow(uid, 'productImage', SO.imgMgrUrl(id));
        });
    };

    // Popup gallery (tạo 1 lần, append body). onPick(id) khi click 1 ảnh.
    SO._imgMgrShowGallery = function _imgMgrShowGallery(ncc, ids, onPick) {
        let pop = document.getElementById('soImgGalleryPopup');
        if (!pop) {
            pop = document.createElement('div');
            pop.id = 'soImgGalleryPopup';
            pop.className = 'so-imc-gallery';
            pop.hidden = true;
            pop.innerHTML = `<div class="so-imc-gallery-backdrop" data-imc-gal-close></div>
                <div class="so-imc-gallery-panel">
                    <div class="so-imc-gallery-head"><span data-imc-gal-title></span>
                        <button type="button" class="so-imc-gallery-close" data-imc-gal-close><i data-lucide="x"></i></button></div>
                    <div class="so-imc-gallery-grid" data-imc-gal-grid></div>
                </div>`;
            document.body.appendChild(pop);
            pop.querySelectorAll('[data-imc-gal-close]').forEach((b) =>
                b.addEventListener('click', () => (pop.hidden = true))
            );
        }
        pop.querySelector('[data-imc-gal-title]').textContent = `Ảnh SP — ${ncc} (bấm để chọn)`;
        const grid = pop.querySelector('[data-imc-gal-grid]');
        grid.innerHTML = ids
            .map(
                (id) =>
                    `<button type="button" class="so-imc-gal-item" data-gal-id="${SO.escapeHtml(id)}"><img src="${SO.imgMgrUrl(id)}" alt="sp" loading="lazy" /></button>`
            )
            .join('');
        grid.querySelectorAll('.so-imc-gal-item').forEach((b) =>
            b.addEventListener('click', () => {
                pop.hidden = true;
                onPick(b.dataset.galId);
            })
        );
        pop.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };
})();
