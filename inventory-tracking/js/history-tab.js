// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// EDIT HISTORY TAB - INVENTORY TRACKING
// Tab "Lịch Sử" — truy vấn toàn bộ audit trail (30 ngày gần nhất) với filter
// theo ngày / NCC / loại thay đổi. Khác modal per-NCC ở chỗ:
//   - Query cross-entity (mọi NCC, mọi đợt) một chỗ.
//   - MỞ RỘNG diff `san_pham`: hiện maSP cũ → mới theo từng dòng để có thể
//     đọc lại + khôi phục tên mã hàng (modal cũ chỉ ghi "N item").
// Server giữ tối đa 30 ngày; lọc ngày/loại/NCC làm client-side trên tập đã tải.
// =====================================================

window.HistoryTab = (function () {
    'use strict';

    const FETCH_LIMIT = 500;

    const ACTION_LABELS = {
        create: { label: 'Tạo mới', cls: 'create', icon: 'plus-circle' },
        update: { label: 'Cập nhật', cls: 'update', icon: 'edit-3' },
        shortage: { label: 'Cập nhật thiếu', cls: 'update', icon: 'alert-triangle' },
        delete: { label: 'Xóa', cls: 'delete', icon: 'trash-2' },
    };

    const FIELD_LABELS = {
        stt_ncc: 'STT NCC',
        ten_ncc: 'Tên NCC',
        ngay_di_hang: 'Ngày giao',
        dot_so: 'Đợt',
        kien_hang: 'Kiện hàng',
        tong_kien: 'Tổng kiện',
        tong_kg: 'Tổng KG',
        san_pham: 'Mã hàng / Sản phẩm',
        tong_tien_hd: 'Tiền HĐ',
        tong_mon: 'Tổng món',
        so_mon_thieu: 'Số món thiếu',
        ghi_chu_thieu: 'Ghi chú thiếu',
        anh_hoa_don: 'Ảnh hóa đơn',
        ghi_chu: 'Ghi chú',
        chi_phi_hang_ve: 'Chi phí hàng về',
        tong_chi_phi: 'Tổng chi phí',
        ghi_chu_admin: 'Ghi chú admin',
        thanh_toan_ck: 'Thanh toán CK',
        ti_gia: 'Tỉ giá',
    };

    // Raw rows last loaded (for client-side re-filtering without re-fetch).
    let _rows = [];
    let _wired = false;

    function _parsePayload(row) {
        let p = row.changes;
        if (typeof p === 'string') {
            try {
                p = JSON.parse(p);
            } catch {
                p = null;
            }
        }
        return p || {};
    }

    // ===== FILTERING =====

    function _applyFilters(rows) {
        const from = document.getElementById('histFltFrom')?.value || '';
        const to = document.getElementById('histFltTo')?.value || '';
        const nccQ = (document.getElementById('histFltNcc')?.value || '').trim().toLowerCase();
        const field = document.getElementById('histFltField')?.value || '';

        const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
        const toTs = to ? new Date(to + 'T23:59:59').getTime() : null;

        return rows.filter((row) => {
            const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
            if (fromTs && ts < fromTs) return false;
            if (toTs && ts > toTs) return false;

            const payload = _parsePayload(row);
            const changes = payload.changes || [];

            if (field && !changes.some((c) => c.field === field)) return false;

            if (nccQ) {
                const hay = [String(row.stt_ncc || ''), String(payload.ten_ncc || '')]
                    .join(' ')
                    .toLowerCase();
                if (!hay.includes(nccQ)) return false;
            }
            return true;
        });
    }

    // ===== RENDER =====

    // Compact color breakdown: "Trắng (10), Đen (5)" or "N màu" or "—".
    function _fmtColors(p) {
        if (!p || typeof p !== 'object') return '';
        if (Array.isArray(p.mauSac) && p.mauSac.length > 0) {
            return p.mauSac.map((c) => `${c.mau || '?'} (${c.soLuong ?? 0})`).join(', ');
        }
        if (p.soMau) return `${p.soMau} màu`;
        return '';
    }

    function _qtyOf(p) {
        if (!p || typeof p !== 'object') return null;
        return p.tongSoLuong ?? p.soLuong ?? null;
    }

    // Build the comparable signature of one product across ALL meaningful
    // attributes — NOT just maSP. A history entry can change colors / qty /
    // price while the code stays the same (common when editing màu inline),
    // so a maSP-only diff misleadingly reads "0 thay đổi".
    function _prodSig(p) {
        return JSON.stringify({
            maSP: (p && p.maSP) || '',
            colors: _fmtColors(p),
            qty: _qtyOf(p),
            gia: (p && p.giaDonVi) || 0,
        });
    }

    function _prodCellHtml(p) {
        if (p === undefined) return '<em class="hist-null">∅</em>';
        const maSP = (p && p.maSP) || '';
        const colors = _fmtColors(p);
        const qty = _qtyOf(p);
        const gia = (p && p.giaDonVi) || 0;
        const meta = [];
        if (colors) meta.push(_esc(colors));
        if (qty != null) meta.push(`SL ${_esc(String(qty))}`);
        if (gia) meta.push(`${_esc(String(gia))}đ`);
        return (
            `<span class="hist-prod-masp">${_esc(maSP) || '<em class="hist-null">∅</em>'}</span>` +
            (meta.length ? `<span class="hist-prod-attr">${meta.join(' · ')}</span>` : '')
        );
    }

    // Per-item full diff (maSP + màu + SL + giá) so colour/qty edits are visible.
    function _renderProductDiff(oldVal, newVal) {
        const oldA = Array.isArray(oldVal) ? oldVal : [];
        const newA = Array.isArray(newVal) ? newVal : [];
        const n = Math.max(oldA.length, newA.length);
        let changedCount = 0;
        const lines = [];
        for (let i = 0; i < n; i++) {
            const o = oldA[i];
            const nw = newA[i];
            const changed = _prodSig(o || {}) !== _prodSig(nw || {});
            if (changed) changedCount++;
            lines.push(`
                <div class="hist-prod-line${changed ? ' changed' : ''}">
                    <span class="hist-prod-idx">${i + 1}</span>
                    <span class="hist-prod-old">${_prodCellHtml(o)}</span>
                    <i data-lucide="arrow-right" class="hist-prod-arrow"></i>
                    <span class="hist-prod-new">${_prodCellHtml(nw)}</span>
                </div>`);
        }
        return `
            <div class="hist-prod-diff">
                <div class="hist-prod-diff-head">${changedCount}/${n} sản phẩm thay đổi — mã / màu / SL / giá (cũ → mới)</div>
                ${lines.join('')}
            </div>`;
    }

    // Readable rendering for EVERY field type (not just scalars) so the whole
    // table row is auditable: kiện hàng, chi phí, thanh toán, ảnh, ngày, …
    function _fmtFieldValue(field, v) {
        if (v === null || v === undefined || v === '') return '<em class="hist-null">∅</em>';

        if (field === 'kien_hang' && Array.isArray(v)) {
            if (v.length === 0) return '<em class="hist-null">0 kiện</em>';
            return _esc(
                v
                    .map((k) => `Kiện ${k.stt ?? '?'}: ${k.soKg ?? 0}kg${k.daNhan ? ' ✓' : ''}`)
                    .join(', ')
            );
        }
        if ((field === 'chi_phi_hang_ve' || field === 'thanh_toan_ck') && Array.isArray(v)) {
            if (v.length === 0) return '<em class="hist-null">∅</em>';
            // Ignore volatile `id` — compare/show meaningful content only.
            return _esc(
                v
                    .map(
                        (c) =>
                            `${c.loai || c.ghiChu || c.ngay || '—'}: ${c.soTien ?? c.amount ?? 0}`
                    )
                    .join(', ')
            );
        }
        if (field === 'anh_hoa_don' && Array.isArray(v)) {
            return v.length ? `${v.length} ảnh` : '<em class="hist-null">∅</em>';
        }
        if (field === 'ngay_di_hang') return _esc(_fmtDate(v));

        if (typeof v === 'object') {
            if (Array.isArray(v)) return `<em>${v.length} item</em>`;
            return `<em>${Object.keys(v).length} field</em>`;
        }
        return _esc(String(v));
    }

    // Strip volatile id keys so id-only regenerations don't read as changes.
    function _stripIds(v) {
        if (Array.isArray(v)) return v.map(_stripIds);
        if (v && typeof v === 'object') {
            const out = {};
            Object.keys(v).forEach((k) => {
                if (k === 'id') return;
                out[k] = _stripIds(v[k]);
            });
            return out;
        }
        return v;
    }

    function _renderChange(c) {
        const label = FIELD_LABELS[c.field] || c.field;
        if (c.field === 'san_pham') {
            return `
                <div class="hist-change hist-change-block">
                    <span class="hist-change-field">${_esc(label)}</span>
                    ${_renderProductDiff(c.oldValue, c.newValue)}
                </div>`;
        }
        // Mark id-only / no-op array changes so the user isn't confused by a
        // logged entry whose visible content is identical.
        const noop =
            JSON.stringify(_stripIds(c.oldValue)) === JSON.stringify(_stripIds(c.newValue));
        return `
            <div class="hist-change${noop ? ' hist-change-noop' : ''}">
                <span class="hist-change-field">${_esc(label)}${noop ? ' <em class="hist-noop-tag">(không đổi nội dung)</em>' : ''}</span>
                <span class="hist-change-old">${_fmtFieldValue(c.field, c.oldValue)}</span>
                <i data-lucide="arrow-right" class="hist-change-arrow"></i>
                <span class="hist-change-new">${_fmtFieldValue(c.field, c.newValue)}</span>
            </div>`;
    }

    // Render a full snapshot (create/delete) as a readable field list.
    function _renderSnapshot(data, kind) {
        if (!data || typeof data !== 'object') return '';
        const rows = [];
        const push = (label, html) =>
            rows.push(`
            <div class="hist-snap-row"><span class="hist-snap-label">${_esc(label)}</span><span class="hist-snap-val">${html}</span></div>`);

        if (data.ngayDiHang || data.ngay_di_hang)
            push('Ngày giao', _esc(_fmtDate(data.ngayDiHang || data.ngay_di_hang)));
        if (data.dotSo || data.dot_so) push('Đợt', _esc(String(data.dotSo || data.dot_so)));

        const hoaDon = data.hoaDon || (data.sttNCC != null ? [data] : []);
        hoaDon.forEach((hd) => {
            const ncc = hd.tenNCC ? `NCC ${hd.sttNCC} — ${hd.tenNCC}` : `NCC ${hd.sttNCC}`;
            const prods = (hd.sanPham || [])
                .map((p) => p.maSP || '')
                .filter(Boolean)
                .join(', ');
            push(
                ncc,
                `${(hd.sanPham || []).length} SP${prods ? ': ' + _esc(prods) : ''} · ` +
                    `tổng món ${_esc(String(hd.tongMon ?? 0))} · ${_esc(String(hd.tongTienHD ?? 0))}`
            );
        });
        if (data.kienHang && data.kienHang.length)
            push('Kiện hàng', _fmtFieldValue('kien_hang', data.kienHang));
        if (data.chiPhiHangVe && data.chiPhiHangVe.length)
            push('Chi phí', _fmtFieldValue('chi_phi_hang_ve', data.chiPhiHangVe));
        if (data.ghiChuAdmin) push('Ghi chú admin', _esc(data.ghiChuAdmin));

        if (!rows.length) return '';
        return `<div class="hist-snapshot hist-snapshot-${kind}">${rows.join('')}</div>`;
    }

    function _renderEntry(row, idx) {
        const action = ACTION_LABELS[row.action] || ACTION_LABELS.update;
        const ts = row.created_at ? new Date(row.created_at) : null;
        const user = row.user_name || _parsePayload(row).user || 'anonymous';
        const payload = _parsePayload(row);
        const changes = payload.changes || [];

        const meta = [];
        if (payload.ngay_di_hang) meta.push(_fmtDate(payload.ngay_di_hang));
        if (payload.dot_so) meta.push(`Đợt ${payload.dot_so}`);
        if (payload.ten_ncc) meta.push(payload.ten_ncc);
        if (row.stt_ncc) meta.push(`NCC ${row.stt_ncc}`);

        // Create/delete carry a full snapshot (newData/oldData) instead of a
        // changes[] list — render it so "tạo mới đơn / NCC / SP" is auditable.
        const snapshotData =
            action.cls === 'create'
                ? payload.newData
                : action.cls === 'delete'
                  ? payload.oldData
                  : null;
        const snapshotHtml = snapshotData ? _renderSnapshot(snapshotData, action.cls) : '';

        const fieldsSummary = changes.length
            ? changes.map((c) => FIELD_LABELS[c.field] || c.field).join(', ')
            : action.cls === 'create'
              ? 'Tạo mới đơn hàng'
              : action.cls === 'delete'
                ? 'Đã xóa'
                : '—';

        const hasProductChange =
            changes.some((c) => c.field === 'san_pham') ||
            (snapshotData &&
                (snapshotData.hoaDon || [snapshotData]).some((h) => (h?.sanPham || []).length));

        return `
            <div class="hist-entry hist-entry-collapsible" data-idx="${idx}">
                <div class="hist-entry-head" role="button" tabindex="0">
                    <i data-lucide="chevron-right" class="hist-expand-chevron"></i>
                    <span class="hist-action hist-action-${action.cls}">
                        <i data-lucide="${action.icon}"></i> ${action.label}
                    </span>
                    <span class="hist-user"><i data-lucide="user"></i> ${_esc(user)}</span>
                    ${
                        hasProductChange
                            ? '<span class="hist-prod-badge"><i data-lucide="package"></i> Mã hàng</span>'
                            : ''
                    }
                    <span class="hist-time">${ts ? _fmtDateTime(ts) : ''}</span>
                </div>
                ${meta.length ? `<div class="hist-meta">${meta.map(_esc).join(' • ')}</div>` : ''}
                <div class="hist-entry-summary">${_esc(fieldsSummary)}</div>
                <div class="hist-changes hist-changes-detail" hidden>
                    ${
                        changes.length
                            ? changes.map(_renderChange).join('')
                            : snapshotHtml || '<div class="hist-meta">Không có chi tiết diff.</div>'
                    }
                </div>
            </div>`;
    }

    function _render(rows) {
        const body = document.getElementById('histTabBody');
        if (!body) return;
        if (!rows.length) {
            body.innerHTML =
                '<p class="hist-empty">Không có thay đổi nào khớp bộ lọc (trong 30 ngày gần nhất).</p>';
            return;
        }
        body.innerHTML =
            `<div class="hist-tab-count">${rows.length} thay đổi</div>` +
            `<div class="hist-list">${rows.map(_renderEntry).join('')}</div>`;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ===== EVENTS =====

    function _wire() {
        if (_wired) return;
        _wired = true;

        document.getElementById('histFltApply')?.addEventListener('click', () => {
            _render(_applyFilters(_rows));
        });
        document.getElementById('histFltReset')?.addEventListener('click', () => {
            ['histFltFrom', 'histFltTo', 'histFltNcc'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const sel = document.getElementById('histFltField');
            if (sel) sel.value = '';
            _render(_rows);
        });
        document.getElementById('histFltNcc')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') _render(_applyFilters(_rows));
        });

        // Expand/collapse via delegation on the body.
        const body = document.getElementById('histTabBody');
        body?.addEventListener('click', (e) => {
            const head = e.target.closest('.hist-entry-head');
            if (!head) return;
            const entry = head.closest('.hist-entry-collapsible');
            const detail = entry?.querySelector('.hist-changes-detail');
            const chevron = entry?.querySelector('.hist-expand-chevron');
            if (!detail) return;
            const open = detail.hasAttribute('hidden');
            if (open) {
                detail.removeAttribute('hidden');
                entry.classList.add('expanded');
            } else {
                detail.setAttribute('hidden', '');
                entry.classList.remove('expanded');
            }
            if (chevron) chevron.style.transform = open ? 'rotate(90deg)' : '';
        });
    }

    // ===== PUBLIC =====

    async function load() {
        _wire();
        const body = document.getElementById('histTabBody');
        if (body) {
            body.innerHTML =
                '<div class="hist-loading"><i data-lucide="loader-2"></i> Đang tải lịch sử…</div>';
            if (window.lucide?.createIcons) lucide.createIcons();
        }
        try {
            _rows = await editHistoryApi.getAll({ entityType: 'shipment', limit: FETCH_LIMIT });
            if (!Array.isArray(_rows)) _rows = [];
            _render(_applyFilters(_rows));
        } catch (e) {
            console.error('[HISTORY-TAB] load failed:', e);
            if (body) {
                body.innerHTML = `<p class="hist-empty">Không thể tải lịch sử: ${_esc(e.message)}</p>`;
            }
        }
    }

    // ===== HELPERS =====

    function _esc(s) {
        return String(s).replace(/[&<>"']/g, (c) => {
            switch (c) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case "'":
                    return '&#39;';
                default:
                    return c;
            }
        });
    }

    function _fmtDateTime(d) {
        try {
            return d.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return d.toISOString();
        }
    }

    function _fmtDate(s) {
        try {
            const d = new Date(s);
            if (Number.isNaN(d.getTime())) return String(s);
            return d.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        } catch {
            return String(s);
        }
    }

    return { load };
})();

console.log('[HISTORY-TAB] Loaded');
