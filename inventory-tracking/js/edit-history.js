// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// EDIT HISTORY - INVENTORY TRACKING
// Audit trail per shipment (per (date, đợt, NCC) row).
//
// Server enforces a 30-day retention window — rows older than that are
// pruned lazily on GET and are never returned. UI doesn't need to filter
// dates client-side.
//
// Two view scopes:
//   - Per-NCC: showEditHistoryForInvoice(invoiceId, label)
//   - Per-day/đợt: showEditHistoryForShipment(ngayDiHang, dotSo, label)
// =====================================================

const _ACTION_LABELS = {
    create: { label: 'Tạo mới', cls: 'create', icon: 'plus-circle' },
    update: { label: 'Cập nhật', cls: 'update', icon: 'edit-3' },
    shortage: { label: 'Cập nhật thiếu', cls: 'update', icon: 'alert-triangle' },
    delete: { label: 'Xóa', cls: 'delete', icon: 'trash-2' },
};

// Map snake_case columns to friendly Vietnamese labels for the diff list.
const _FIELD_LABELS = {
    stt_ncc: 'STT NCC',
    ten_ncc: 'Tên NCC',
    ngay_di_hang: 'Ngày giao',
    dot_so: 'Đợt',
    kien_hang: 'Kiện hàng',
    tong_kien: 'Tổng kiện',
    tong_kg: 'Tổng KG',
    san_pham: 'Sản phẩm',
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

/**
 * Legacy entry point — kept for callers in crud-operations.js that pass
 * client-computed diffs. Server-side auto-log already covers shipment
 * mutations; this is mostly a no-op safety net now.
 */
async function logEditHistory(action, collection, docId, oldData = null, newData = null) {
    try {
        const changes = oldData && newData ? getChanges(oldData, newData) : null;
        await editHistoryApi.log(action, collection, docId || '', null, {
            oldData: oldData ? sanitizeData(oldData) : null,
            newData: newData ? sanitizeData(newData) : null,
            changes,
        });
    } catch (error) {
        // History logging must never break main flow.
        console.error('[HISTORY] log failed:', error);
    }
}

function getChanges(oldData, newData) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    allKeys.forEach((key) => {
        if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(key)) return;
        const oldVal = JSON.stringify(oldData[key]);
        const newVal = JSON.stringify(newData[key]);
        if (oldVal !== newVal) {
            changes.push({ field: key, oldValue: oldData[key], newValue: newData[key] });
        }
    });
    return changes;
}

function sanitizeData(data) {
    if (!data) return null;
    const out = {};
    Object.keys(data).forEach((k) => {
        if (data[k] === undefined) return;
        out[k] = data[k];
    });
    return out;
}

// ===== MODAL ENTRY POINTS =====

/**
 * Show history for a single NCC row (one entry in inventory_shipments).
 */
async function showEditHistoryForInvoice(invoiceId, label = '') {
    const title = label ? `Lịch sử — ${label}` : 'Lịch sử chỉnh sửa';
    await _showHistoryModal(title, { entityType: 'shipment', entityId: invoiceId });
}

/**
 * Show history for the whole (date, đợt) shipment — aggregates across all
 * NCC rows that share the same ngay_di_hang + dot_so.
 */
async function showEditHistoryForShipment(ngayDiHang, dotSo, label = '') {
    const title = label ? `Lịch sử — ${label}` : 'Lịch sử chỉnh sửa';
    await _showHistoryModal(title, {
        entityType: 'shipment',
        ngayDiHang,
        dotSo,
    });
}

async function _showHistoryModal(title, filters) {
    _ensureModal();
    const titleEl = document.getElementById('modalEditHistoryTitle');
    const body = document.getElementById('modalEditHistoryBody');
    if (titleEl) titleEl.textContent = title;
    if (body) {
        body.innerHTML =
            '<div class="hist-loading"><i data-lucide="loader-2"></i> Đang tải lịch sử…</div>';
        if (window.lucide) lucide.createIcons();
    }
    openModal('modalEditHistory');

    try {
        const rows = await editHistoryApi.getAll({ ...filters, limit: 200 });
        if (body) body.innerHTML = _renderHistoryList(rows);
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error('[HISTORY] load failed:', e);
        if (body) {
            body.innerHTML = `<p class="hist-empty">Không thể tải lịch sử: ${e.message}</p>`;
        }
    }
}

// ===== MODAL DOM =====
//
// Created lazily on first use so existing pages that never call into edit
// history don't pay any DOM cost.
function _ensureModal() {
    if (document.getElementById('modalEditHistory')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'modalEditHistory';
    wrapper.className = 'modal hidden';
    wrapper.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('modalEditHistory')"></div>
        <div class="modal-container hist-modal-container">
            <div class="modal-header">
                <h2 id="modalEditHistoryTitle"><i data-lucide="history"></i> Lịch sử chỉnh sửa</h2>
                <button class="modal-close" onclick="closeModal('modalEditHistory')" aria-label="Đóng">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="modal-body hist-modal-body" id="modalEditHistoryBody"></div>
            <div class="modal-footer hist-modal-footer">
                <span class="hist-retention-hint">
                    <i data-lucide="info"></i> Lưu tối đa 30 ngày gần nhất
                </span>
                <button class="btn btn-outline" onclick="closeModal('modalEditHistory')">Đóng</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);
    if (window.lucide) lucide.createIcons();
}

// ===== RENDER =====

function _renderHistoryList(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '<p class="hist-empty">Chưa có thay đổi nào trong 30 ngày gần nhất.</p>';
    }
    return `<div class="hist-list">${rows.map(_renderHistoryRow).join('')}</div>`;
}

function _renderHistoryRow(row) {
    const action = _ACTION_LABELS[row.action] || _ACTION_LABELS.update;
    const ts = row.created_at ? new Date(row.created_at) : null;
    const user = row.user_name || 'anonymous';

    // Server payload structure: { changes: [{field, oldValue, newValue}],
    //                             snapshot: {...},
    //                             ngay_di_hang, dot_so, ten_ncc, user }
    let payload = row.changes;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch {
            payload = null;
        }
    }
    const changes = payload?.changes || [];
    const meta = [];
    if (payload?.ngay_di_hang) meta.push(_fmtDate(payload.ngay_di_hang));
    if (payload?.dot_so) meta.push(`Đợt ${payload.dot_so}`);
    if (payload?.ten_ncc) meta.push(payload.ten_ncc);
    if (row.stt_ncc) meta.push(`NCC ${row.stt_ncc}`);

    return `
        <div class="hist-entry">
            <div class="hist-entry-head">
                <span class="hist-action hist-action-${action.cls}">
                    <i data-lucide="${action.icon}"></i> ${action.label}
                </span>
                <span class="hist-user"><i data-lucide="user"></i> ${_esc(user)}</span>
                <span class="hist-time">${ts ? _fmtDateTime(ts) : ''}</span>
            </div>
            ${meta.length > 0 ? `<div class="hist-meta">${meta.map(_esc).join(' • ')}</div>` : ''}
            ${
                changes.length > 0
                    ? `<div class="hist-changes">${changes.map(_renderChange).join('')}</div>`
                    : action.cls === 'create'
                      ? '<div class="hist-meta">Tạo mới</div>'
                      : action.cls === 'delete'
                        ? '<div class="hist-meta">Đã xóa</div>'
                        : ''
            }
        </div>
    `;
}

function _renderChange(c) {
    const label = _FIELD_LABELS[c.field] || c.field;
    return `
        <div class="hist-change">
            <span class="hist-change-field">${_esc(label)}</span>
            <span class="hist-change-old">${_fmtVal(c.oldValue)}</span>
            <i data-lucide="arrow-right" class="hist-change-arrow"></i>
            <span class="hist-change-new">${_fmtVal(c.newValue)}</span>
        </div>
    `;
}

function _fmtVal(v) {
    if (v === null || v === undefined || v === '') return '<em class="hist-null">∅</em>';
    if (typeof v === 'object') {
        // Compact representation for arrays/objects — counts only (otherwise
        // the diff list dwarfs the modal).
        if (Array.isArray(v)) return `<em>${v.length} item</em>`;
        const keys = Object.keys(v);
        return `<em>${keys.length} field</em>`;
    }
    return _esc(String(v));
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
        if (Number.isNaN(d.getTime())) return s;
        return d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    } catch {
        return String(s);
    }
}

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

// Back-compat aliases used by older call sites in crud-operations.js
async function showEditHistoryModal(collection, docId, title = 'Lịch sử chỉnh sửa') {
    return showEditHistoryForInvoice(docId, title);
}

window.showEditHistoryForInvoice = showEditHistoryForInvoice;
window.showEditHistoryForShipment = showEditHistoryForShipment;
window.showEditHistoryModal = showEditHistoryModal;

console.log('[HISTORY] Edit history initialized');
