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

    function _codesOf(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map((p) => (p && typeof p === 'object' ? p.maSP || '' : String(p)));
    }

    // Per-item maSP diff so the user can read/recover product names.
    function _renderProductDiff(oldVal, newVal) {
        const oldC = _codesOf(oldVal);
        const newC = _codesOf(newVal);
        const n = Math.max(oldC.length, newC.length);
        const lines = [];
        for (let i = 0; i < n; i++) {
            const o = oldC[i] ?? '';
            const nw = newC[i] ?? '';
            const changed = o !== nw;
            lines.push(`
                <div class="hist-prod-line${changed ? ' changed' : ''}">
                    <span class="hist-prod-idx">${i + 1}</span>
                    <span class="hist-prod-old">${_esc(o) || '<em class="hist-null">∅</em>'}</span>
                    <i data-lucide="arrow-right" class="hist-prod-arrow"></i>
                    <span class="hist-prod-new">${_esc(nw) || '<em class="hist-null">∅</em>'}</span>
                </div>`);
        }
        const changedCount = lines.filter((l) => l.includes(' changed')).length;
        return `
            <div class="hist-prod-diff">
                <div class="hist-prod-diff-head">${changedCount}/${n} mã hàng thay đổi (cũ → mới)</div>
                ${lines.join('')}
            </div>`;
    }

    function _fmtScalar(v) {
        if (v === null || v === undefined || v === '') return '<em class="hist-null">∅</em>';
        if (typeof v === 'object') {
            if (Array.isArray(v)) return `<em>${v.length} item</em>`;
            return `<em>${Object.keys(v).length} field</em>`;
        }
        return _esc(String(v));
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
        return `
            <div class="hist-change">
                <span class="hist-change-field">${_esc(label)}</span>
                <span class="hist-change-old">${_fmtScalar(c.oldValue)}</span>
                <i data-lucide="arrow-right" class="hist-change-arrow"></i>
                <span class="hist-change-new">${_fmtScalar(c.newValue)}</span>
            </div>`;
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

        const fieldsSummary = changes.length
            ? changes.map((c) => FIELD_LABELS[c.field] || c.field).join(', ')
            : action.cls === 'create'
              ? 'Tạo mới'
              : action.cls === 'delete'
                ? 'Đã xóa'
                : '—';

        const hasProductChange = changes.some((c) => c.field === 'san_pham');

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
                    ${changes.map(_renderChange).join('') || '<div class="hist-meta">Không có chi tiết diff.</div>'}
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
