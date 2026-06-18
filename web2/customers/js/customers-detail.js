// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse detail/edit (modal + SĐT/địa chỉ phụ + status + merge). warehouse riêng.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — DETAIL/EDIT: modal Thêm/Sửa,
// SĐT phụ + địa chỉ phụ (1 KH nhiều SĐT/địa chỉ), collect/save form,
// row actions (detail/qr/edit/delete), gộp KH trùng, xuất CSV.
// Write (create/update/delete/merge) qua CustomersApi (đã gắn
// x-web2-token), GIỮ await + validation (SĐT 10 số) verbatim.
// Đọc state/utils từ window.__wcApp (customers-state.js load TRƯỚC).
// =====================================================================

(function () {
    'use strict';

    const NS = (window.__wcApp = window.__wcApp || {});
    const { state, $, esc, notify, normPhone } = NS;

    // ─── SĐT phụ trong modal ────────────────────────────────────────────
    function renderAltPhones() {
        const list = $('#wcAltPhoneList');
        if (!list) return;
        if (!NS.modalAltPhones.length) {
            list.innerHTML = '<span class="wc-altphone-empty">Chưa có SĐT phụ</span>';
            return;
        }
        list.innerHTML = NS.modalAltPhones
            .map(
                (p, i) =>
                    `<span class="wc-altphone-chip"><button type="button" class="wc-altphone-star" data-idx="${i}" title="Đặt làm SĐT chính (hiển thị)" aria-label="Đặt ${esc(p)} làm SĐT chính"><i data-lucide="star"></i></button><span>${esc(p)}</span><button type="button" class="wc-altphone-rm" data-idx="${i}" aria-label="Xóa SĐT ${esc(p)}"><i data-lucide="x"></i></button></span>`
            )
            .join('');
        if (window.lucide) window.lucide.createIcons();
    }

    // Đặt 1 SĐT phụ làm SĐT chính (hiển thị). SĐT chính cũ → về danh sách phụ.
    // Mọi SĐT vẫn cùng 1 KH (tham chiếu qua SĐT chính = khoá phone UNIQUE).
    function setPrimaryAltPhone(idx) {
        const inp = $('#wcfPhone');
        const chosen = NS.modalAltPhones[idx];
        if (!chosen) return;
        const oldPrimary = normPhone(inp.value);
        NS.modalAltPhones.splice(idx, 1);
        if (oldPrimary && oldPrimary !== chosen && !NS.modalAltPhones.includes(oldPrimary)) {
            NS.modalAltPhones.unshift(oldPrimary);
        }
        inp.value = chosen;
        renderAltPhones();
        notify('Đã đặt ' + chosen + ' làm SĐT chính', 'success');
    }

    function addAltPhone() {
        const inp = $('#wcfAltPhoneInput');
        const n = normPhone(inp.value);
        if (!n) {
            notify('SĐT phụ phải đủ 10 số', 'warning');
            return;
        }
        const primary = normPhone($('#wcfPhone').value);
        if (primary && n === primary) {
            notify('SĐT này trùng SĐT chính', 'warning');
            return;
        }
        if (NS.modalAltPhones.includes(n)) {
            notify('SĐT phụ đã có trong danh sách', 'warning');
            return;
        }
        NS.modalAltPhones.push(n);
        inp.value = '';
        renderAltPhones();
        inp.focus();
    }

    // ─── Địa chỉ phụ trong modal (1 KH nhiều địa chỉ) ───────────────────
    function renderAltAddresses() {
        const list = $('#wcAltAddrList');
        if (!list) return;
        if (!NS.modalAltAddresses.length) {
            list.innerHTML = '<span class="wc-altaddr-empty">Chưa có địa chỉ phụ</span>';
            return;
        }
        list.innerHTML = NS.modalAltAddresses
            .map(
                (a, i) =>
                    `<span class="wc-altaddr-chip"><button type="button" class="wc-altaddr-star" data-idx="${i}" title="Đặt làm địa chỉ chính (hiển thị)" aria-label="Đặt làm địa chỉ chính"><i data-lucide="star"></i></button><span class="wc-altaddr-text">${esc(a)}</span><button type="button" class="wc-altaddr-rm" data-idx="${i}" aria-label="Xóa địa chỉ"><i data-lucide="x"></i></button></span>`
            )
            .join('');
        if (window.lucide) window.lucide.createIcons();
    }

    // Đặt 1 địa chỉ phụ làm địa chỉ chính (hiển thị). Địa chỉ chính cũ → về phụ.
    function setPrimaryAltAddr(idx) {
        const inp = $('#wcfAddress');
        const chosen = NS.modalAltAddresses[idx];
        if (!chosen) return;
        const oldPrimary = String(inp.value || '').trim();
        NS.modalAltAddresses.splice(idx, 1);
        if (oldPrimary && oldPrimary !== chosen && !NS.modalAltAddresses.includes(oldPrimary)) {
            NS.modalAltAddresses.unshift(oldPrimary);
        }
        inp.value = chosen;
        renderAltAddresses();
        notify('Đã đặt địa chỉ chính', 'success');
    }

    function addAltAddress() {
        const inp = $('#wcfAltAddrInput');
        const a = String(inp.value || '').trim();
        if (!a) {
            notify('Nhập địa chỉ phụ', 'warning');
            return;
        }
        const primary = String($('#wcfAddress').value || '').trim();
        if (primary && a === primary) {
            notify('Địa chỉ này trùng địa chỉ chính', 'warning');
            return;
        }
        if (NS.modalAltAddresses.includes(a)) {
            notify('Địa chỉ phụ đã có trong danh sách', 'warning');
            return;
        }
        NS.modalAltAddresses.push(a);
        inp.value = '';
        renderAltAddresses();
        inp.focus();
    }

    // ─── Modal Thêm/Sửa ─────────────────────────────────────────────────
    function openModal(row) {
        state.editing = row || null;
        $('#wcModalTitle').textContent = row ? 'Sửa khách hàng' : 'Thêm khách hàng';
        const g = (id) => $('#' + id);
        g('wcfName').value = row?.name || '';
        g('wcfPhone').value = row?.phone || '';
        g('wcfEmail').value = row?.email || '';
        g('wcfStatus').value = row?.status || 'Normal';
        g('wcfTier').value = row?.tier || '';
        g('wcfAddress').value = row?.address || '';
        g('wcfWard').value = row?.ward || '';
        g('wcfDistrict').value = row?.district || '';
        g('wcfCity').value = row?.city || '';
        g('wcfCarrier').value = row?.carrier || '';
        g('wcfNote').value = row?.note || '';
        g('wcfFbId').value = row?.fbId || '';
        g('wcfGlobalId').value = row?.globalId || '';
        g('wcfFbPageId').value = row?.fbPageId || '';
        g('wcfTags').value = Array.isArray(row?.tags) ? row.tags.join(', ') : '';
        // SĐT phụ
        NS.modalAltPhones = Array.isArray(row?.altPhones)
            ? row.altPhones.map(normPhone).filter(Boolean)
            : [];
        if ($('#wcfAltPhoneInput')) $('#wcfAltPhoneInput').value = '';
        renderAltPhones();
        // Địa chỉ phụ
        NS.modalAltAddresses = Array.isArray(row?.altAddresses)
            ? row.altAddresses.map((a) => String(a || '').trim()).filter(Boolean)
            : [];
        if ($('#wcfAltAddrInput')) $('#wcfAltAddrInput').value = '';
        renderAltAddresses();
        $('#wcModalError').textContent = '';
        // History timeline (chỉ khi sửa)
        const histWrap = $('#wcModalHistory');
        if (row && Array.isArray(row.history) && row.history.length && window.Web2HistoryTimeline) {
            histWrap.innerHTML = window.Web2HistoryTimeline.render(row.history);
            histWrap.hidden = false;
        } else {
            histWrap.hidden = true;
            histWrap.innerHTML = '';
        }
        $('#wcModal').hidden = false;
        setTimeout(() => g('wcfName').focus(), 50);
    }
    function closeModal() {
        $('#wcModal').hidden = true;
        state.editing = null;
    }

    function collectForm() {
        const v = (id) => $('#' + id).value.trim();
        const tags = v('wcfTags')
            ? v('wcfTags')
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
            : [];
        return {
            name: v('wcfName'),
            phone: v('wcfPhone'),
            altPhones: NS.modalAltPhones.slice(),
            altAddresses: NS.modalAltAddresses.slice(),
            email: v('wcfEmail'),
            status: v('wcfStatus'),
            tier: v('wcfTier'),
            address: v('wcfAddress'),
            ward: v('wcfWard'),
            district: v('wcfDistrict'),
            city: v('wcfCity'),
            carrier: v('wcfCarrier'),
            note: v('wcfNote'),
            fbId: v('wcfFbId'),
            globalId: v('wcfGlobalId'),
            fbPageId: v('wcfFbPageId'),
            tags,
        };
    }

    async function saveModal() {
        const body = collectForm();
        if (!body.name) {
            $('#wcModalError').textContent = 'Tên khách hàng bắt buộc';
            return;
        }
        const actor = window.Web2UserInfo?.get?.('web2/customers') || {};
        body.userId = actor.userId;
        body.userName = actor.userName;
        const editing = state.editing;
        // GIỮ modal mở khi đang lưu → lỗi thì không mất data user đã nhập.
        $('#wcModalError').textContent = '';
        const btn = $('#wcModalSave');
        if (btn) {
            btn.classList.add('is-busy');
            btn.disabled = true;
        }
        const runFn = editing
            ? () => window.CustomersApi.update(editing.id, body)
            : () => window.CustomersApi.create(body);
        try {
            const res = await runFn();
            if (res.success === false) throw new Error(res.error || 'Lưu thất bại');
            closeModal();
            notify(editing ? 'Đã cập nhật KH' : 'Đã thêm KH', 'success');
            NS.load();
        } catch (e) {
            // Modal vẫn mở, hiện lỗi inline — user sửa & lưu lại, KHÔNG mất dữ liệu.
            $('#wcModalError').textContent = e.message || 'Lưu thất bại';
        } finally {
            if (btn) {
                btn.classList.remove('is-busy');
                btn.disabled = false;
            }
        }
    }

    // ─── Row actions ────────────────────────────────────────────────────
    async function onAction(act, row) {
        if (act === 'edit') return openModal(row);
        if (act === 'detail') {
            if (window.Web2CustomerDetailModal?.open) {
                window.Web2CustomerDetailModal.open(row.phone || '', row.name || '');
            } else {
                notify('Module chi tiết chưa load', 'warning');
            }
            return;
        }
        if (act === 'qr') {
            if (!row.phone) return notify('KH chưa có SĐT để tạo QR', 'warning');
            window.Web2QrModal?.open?.(row.phone, {
                customerId: row.id,
                customerName: row.name,
            });
            return;
        }
        if (act === 'delete') {
            if (
                !(await window.Popup.danger(`Xóa khách hàng "${row.name || row.phone}"?`, {
                    okText: 'Xóa',
                }))
            )
                return;
            try {
                const res = await window.CustomersApi.remove(row.id);
                if (res.success === false) throw new Error(res.error || 'Xóa thất bại');
                notify(
                    res.archived ? `KH có ${res.orderCount} đơn → đã lưu trữ (ẩn)` : 'Đã xóa KH',
                    'success'
                );
                NS.load();
            } catch (e) {
                notify('✗ ' + e.message, 'error');
            }
        }
    }

    // ─── Merge mode ─────────────────────────────────────────────────────
    async function doMerge() {
        const ids = Array.from(state.selected);
        if (ids.length !== 2) return notify('Chọn ĐÚNG 2 KH để gộp', 'warning');
        const [a, b] = ids;
        const ra = state.rows.find((r) => r.id === a);
        const rb = state.rows.find((r) => r.id === b);
        const primary = await window.Popup.confirm(
            `Gộp 2 KH:\n  A: ${ra?.name} (${ra?.phone || '—'})\n  B: ${rb?.name} (${rb?.phone || '—'})\n\nOK = giữ A làm chính (B gộp vào A).\nCancel = giữ B làm chính.`
        );
        const primaryId = primary ? a : b;
        const secondaryId = primary ? b : a;
        try {
            const res = await window.CustomersApi.merge(primaryId, secondaryId);
            if (res.success === false) throw new Error(res.error || 'Gộp thất bại');
            notify('Đã gộp 2 KH', 'success');
            state.selected.clear();
            NS.load();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    // ─── Export CSV (client-side, trang hiện tại) ───────────────────────
    function exportCsv() {
        const cols = [
            'name',
            'phone',
            'email',
            'address',
            'status',
            'tier',
            'fbId',
            'globalId',
            'totalOrders',
            'totalSpent',
        ];
        const head = cols.join(',');
        const lines = state.rows.map((r) =>
            cols.map((c) => `"${String(r[c] == null ? '' : r[c]).replace(/"/g, '""')}"`).join(',')
        );
        const blob = new Blob(['﻿' + head + '\n' + lines.join('\n')], {
            type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `web2-customers-p${state.page}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    NS.renderAltPhones = renderAltPhones;
    NS.setPrimaryAltPhone = setPrimaryAltPhone;
    NS.addAltPhone = addAltPhone;
    NS.renderAltAddresses = renderAltAddresses;
    NS.setPrimaryAltAddr = setPrimaryAltAddr;
    NS.addAltAddress = addAltAddress;
    NS.openModal = openModal;
    NS.closeModal = closeModal;
    NS.collectForm = collectForm;
    NS.saveModal = saveModal;
    NS.onAction = onAction;
    NS.doMerge = doMerge;
    NS.exportCsv = exportCsv;
})();
