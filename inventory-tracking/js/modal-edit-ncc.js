// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MODAL EDIT NCC INVOICE — sửa nhanh hóa đơn 1 NCC trong shipment
// Layout giống modal-convert-po nhưng save trực tiếp vào dot.sanPham
// (qua shipmentsApi.update) thay vì tạo Purchase Order mới.
// =====================================================

(function () {
    'use strict';

    const _esc = (s) =>
        String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    function _findDotById(invoiceId) {
        for (const ncc of globalState.nccList || []) {
            const dot = (ncc.dotHang || []).find((d) => String(d.id) === String(invoiceId));
            if (dot) return dot;
        }
        return null;
    }

    let _editState = null;

    /**
     * Open edit modal for one NCC invoice (1 dot in nccList).
     */
    window.openEditNccInvoiceModal = function (invoiceId) {
        const dot = _findDotById(invoiceId);
        if (!dot) {
            window.notificationManager?.error('Không tìm thấy hóa đơn NCC');
            return;
        }

        // Hiển thị tên NCC: tenNCC nếu có, fallback về sttNCC (giống table).
        // _origTenNCC giữ nguyên để biết user có sửa không (tránh ép tenNCC = "24" string khi save).
        _editState = {
            invoiceId,
            sttNCC: dot.sttNCC,
            _origTenNCC: dot.tenNCC || '',
            tenNCC: dot.tenNCC || (dot.sttNCC ? String(dot.sttNCC) : ''),
            ghiChu: dot.ghiChu || '',
            // Clone sản phẩm — giữ giaDonVi nguyên (Trung), tongSoLuong/soLuong, mauSac
            sanPham: (dot.sanPham || []).map((p, i) => ({
                _key: `e_${i}_${Date.now()}`,
                maSP: p.maSP || '',
                moTa: p.moTa || '',
                tongSoLuong: parseInt(p.tongSoLuong) || 0,
                soLuong: parseInt(p.soLuong) || 0,
                giaDonVi: parseFloat(p.giaDonVi) || 0,
                mauSac: Array.isArray(p.mauSac) ? p.mauSac.map((m) => ({ ...m })) : [],
                ghiChu: p.ghiChu || '',
            })),
        };

        _ensureModalDom();
        _render();
        const modal = document.getElementById('modalEditNcc');
        if (modal) modal.classList.add('active');
        if (window.lucide) lucide.createIcons();
    };

    function _ensureModalDom() {
        if (document.getElementById('modalEditNcc')) return;
        const wrap = document.createElement('div');
        wrap.id = 'modalEditNcc';
        wrap.className = 'modal';
        wrap.innerHTML = `
            <div class="modal-overlay" onclick="window.closeEditNccModal()"></div>
            <div class="modal-container modal-lg">
                <div class="modal-header">
                    <h3 id="modalEditNccTitle">Sửa hóa đơn NCC</h3>
                    <button class="modal-close" onclick="window.closeEditNccModal()" aria-label="Đóng">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body" id="modalEditNccBody"></div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" onclick="window.closeEditNccModal()">Hủy</button>
                    <button type="button" class="btn btn-primary" id="btnSaveEditNcc">
                        <i data-lucide="save"></i> Lưu thay đổi
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
    }

    window.closeEditNccModal = function () {
        const m = document.getElementById('modalEditNcc');
        if (m) m.classList.remove('active');
        _editState = null;
    };

    function _render() {
        const body = document.getElementById('modalEditNccBody');
        if (!body || !_editState) return;
        const { tenNCC, ghiChu, sanPham } = _editState;

        body.innerHTML = `
            <div class="enc-form">
                <div class="enc-row">
                    <div class="enc-field">
                        <label>Tên NCC</label>
                        <input type="text" id="encNcc" class="form-input" value="${_esc(tenNCC)}" placeholder="Tên NCC">
                    </div>
                    <div class="enc-field enc-field-note">
                        <label>Ghi chú</label>
                        <input type="text" id="encNote" class="form-input" value="${_esc(ghiChu)}" placeholder="Ghi chú đơn">
                    </div>
                </div>

                <div class="enc-table-wrap">
                    <table class="enc-table">
                        <thead>
                            <tr>
                                <th class="enc-col-stt">STT</th>
                                <th class="enc-col-sku">Mã hàng</th>
                                <th class="enc-col-desc">Mô tả</th>
                                <th class="enc-col-qty">SL</th>
                                <th class="enc-col-price">Đơn giá (Trung)</th>
                                <th class="enc-col-amt">Thành tiền (Trung)</th>
                                <th class="enc-col-act"></th>
                            </tr>
                        </thead>
                        <tbody id="encItemsBody">
                            ${sanPham.map((p, i) => _renderRow(p, i)).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="text-right"><strong>TỔNG:</strong></td>
                                <td class="text-center"><strong id="encTotalQty">0</strong></td>
                                <td></td>
                                <td class="text-right"><strong id="encTotalAmt">0</strong></td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div class="enc-actions">
                    <button type="button" class="btn btn-outline btn-sm" id="btnAddEncRow">
                        <i data-lucide="plus"></i> Thêm dòng
                    </button>
                </div>
            </div>
        `;

        _bindEvents();
        _recalcTotals();
        if (window.lucide) lucide.createIcons();
    }

    function _renderRow(p, idx) {
        const qty = _qtyOf(p);
        const amt = qty * (parseFloat(p.giaDonVi) || 0);
        return `
            <tr data-key="${p._key}">
                <td class="enc-col-stt">${idx + 1}</td>
                <td><input type="text" class="enc-input" data-field="maSP" value="${_esc(p.maSP)}" placeholder="VD: 24/1"></td>
                <td><input type="text" class="enc-input" data-field="moTa" value="${_esc(p.moTa)}" placeholder="Mô tả"></td>
                <td><input type="number" class="enc-input enc-input-right" data-field="tongSoLuong" value="${qty}" min="0"></td>
                <td><input type="number" class="enc-input enc-input-right" data-field="giaDonVi" value="${p.giaDonVi || 0}" min="0" step="0.01"></td>
                <td class="enc-col-amt enc-row-amt">${amt.toLocaleString('vi-VN')}</td>
                <td class="enc-col-act"><button type="button" class="btn-icon btn-del-enc-row" data-key="${p._key}" title="Xóa"><i data-lucide="x"></i></button></td>
            </tr>
        `;
    }

    function _qtyOf(p) {
        const fn = window.getProductEffectiveQty;
        if (fn) return fn(p);
        return parseInt(p.tongSoLuong) || parseInt(p.soLuong) || 0;
    }

    function _bindEvents() {
        const tbody = document.getElementById('encItemsBody');
        if (tbody) {
            tbody.addEventListener('input', _onRowInput);
            tbody.addEventListener('click', _onRowClick);
        }
        const addBtn = document.getElementById('btnAddEncRow');
        if (addBtn) addBtn.onclick = _addBlankRow;
        const saveBtn = document.getElementById('btnSaveEditNcc');
        if (saveBtn) saveBtn.onclick = _save;
    }

    function _onRowInput(e) {
        const inp = e.target.closest('.enc-input');
        if (!inp) return;
        const tr = inp.closest('tr[data-key]');
        if (!tr) return;
        const item = _editState.sanPham.find((p) => p._key === tr.dataset.key);
        if (!item) return;
        const field = inp.dataset.field;
        if (field === 'tongSoLuong') {
            item.tongSoLuong = parseInt(inp.value) || 0;
            item.soLuong = item.tongSoLuong; // keep both in sync for display elsewhere
        } else if (field === 'giaDonVi') {
            item.giaDonVi = parseFloat(inp.value) || 0;
        } else {
            item[field] = inp.value;
        }
        _updateRowAmt(tr, item);
        _recalcTotals();
    }

    function _onRowClick(e) {
        const del = e.target.closest('.btn-del-enc-row');
        if (!del) return;
        const key = del.dataset.key;
        _editState.sanPham = _editState.sanPham.filter((p) => p._key !== key);
        _render();
    }

    function _addBlankRow() {
        _editState.sanPham.push({
            _key: `e_new_${Date.now()}`,
            maSP: '',
            moTa: '',
            tongSoLuong: 0,
            soLuong: 0,
            giaDonVi: 0,
            mauSac: [],
            ghiChu: '',
        });
        _render();
    }

    function _updateRowAmt(tr, item) {
        const cell = tr.querySelector('.enc-row-amt');
        if (cell) {
            const amt = _qtyOf(item) * (parseFloat(item.giaDonVi) || 0);
            cell.textContent = amt.toLocaleString('vi-VN');
        }
    }

    function _recalcTotals() {
        const totQ = _editState.sanPham.reduce((s, p) => s + _qtyOf(p), 0);
        const totA = _editState.sanPham.reduce(
            (s, p) => s + _qtyOf(p) * (parseFloat(p.giaDonVi) || 0),
            0
        );
        const qEl = document.getElementById('encTotalQty');
        const aEl = document.getElementById('encTotalAmt');
        if (qEl) qEl.textContent = totQ.toLocaleString('vi-VN');
        if (aEl) aEl.textContent = totA.toLocaleString('vi-VN');
    }

    async function _save() {
        if (!_editState) return;
        const btn = document.getElementById('btnSaveEditNcc');
        const nccInp = document.getElementById('encNcc');
        const noteInp = document.getElementById('encNote');
        const tenNCCInput = (nccInp?.value || '').trim();
        // Nếu user không sửa và giá trị bằng sttNCC fallback → lưu lại empty (giữ nguyên data shape).
        const fallbackSttStr = _editState.sttNCC ? String(_editState.sttNCC) : '';
        const tenNCC =
            tenNCCInput && tenNCCInput !== fallbackSttStr ? tenNCCInput : _editState._origTenNCC;
        const ghiChu = (noteInp?.value || '').trim();
        const sanPham = _editState.sanPham
            .filter((p) => (p.maSP || '').trim() || (p.moTa || '').trim() || p.tongSoLuong > 0)
            .map((p) => ({
                maSP: p.maSP,
                moTa: p.moTa,
                tongSoLuong: p.tongSoLuong,
                soLuong: p.tongSoLuong, // sync để fallback chain ổn định
                giaDonVi: p.giaDonVi,
                mauSac: p.mauSac || [],
                ghiChu: p.ghiChu || '',
                thanhTien: (p.tongSoLuong || 0) * (p.giaDonVi || 0),
            }));
        const tongMon = sanPham.reduce((s, p) => s + (p.tongSoLuong || 0), 0);
        const tongTienHD = sanPham.reduce((s, p) => s + (p.thanhTien || 0), 0);

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader"></i> Đang lưu...';
            if (window.lucide) lucide.createIcons();
        }
        try {
            await shipmentsApi.update(_editState.invoiceId, {
                tenNCC,
                ghiChu,
                sanPham,
                tongMon,
                tongTienHD,
            });
            // Cập nhật in-memory state để re-render không cần reload
            const dot = _findDotById(_editState.invoiceId);
            if (dot) {
                dot.tenNCC = tenNCC;
                dot.ghiChu = ghiChu;
                dot.sanPham = sanPham;
                dot.tongMon = tongMon;
                dot.tongTienHD = tongTienHD;
            }
            if (typeof flattenNCCData === 'function') flattenNCCData();
            if (typeof renderShipments === 'function') {
                renderShipments(globalState.filteredShipments || globalState.shipments);
            }
            window.notificationManager?.success('Đã lưu hóa đơn NCC');
            window.closeEditNccModal();
        } catch (err) {
            console.error('[EDIT-NCC] save error:', err);
            window.notificationManager?.error('Không lưu được: ' + (err.message || err));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save"></i> Lưu thay đổi';
                if (window.lucide) lucide.createIcons();
            }
        }
    }
})();
