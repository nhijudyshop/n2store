// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Kho Biến Thể Web 2.0 — main app: render bảng + CRUD qua modal.
 */

(function () {
    'use strict';

    const STATE = {
        variants: [],
        total: 0,
        search: '',
        activeOnly: false,
        group: '',
        loading: false,
        editingId: null,
    };

    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#variantsTbody');
    const counter = () => $('#totalCounter');
    const modal = () => $('#variantModal');

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    function renderRows() {
        const items = STATE.variants;
        if (!items.length) {
            tbody().innerHTML = `<tr><td colspan="6" class="empty-row">
                Chưa có biến thể nào — bấm "Thêm Biến Thể" để tạo
            </td></tr>`;
            return;
        }
        tbody().innerHTML = items
            .map((v, idx) => {
                const groupHtml = v.groupName
                    ? `<span class="group-pill">${escapeHtml(v.groupName)}</span>`
                    : '<span class="group-empty">—</span>';
                return `
                <tr data-id="${v.id}">
                    <td>${idx + 1}</td>
                    <td><span class="variant-value-pill">${escapeHtml(v.value)}</span></td>
                    <td>${groupHtml}</td>
                    <td class="sort-cell">${v.sortOrder ?? 0}</td>
                    <td>
                        ${
                            v.isActive
                                ? `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang dùng</span>`
                                : `<span class="active-badge active-no"><i data-lucide="pause"></i>Đã ẩn</span>`
                        }
                    </td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-action act-edit" title="Sửa" onclick="Web2VariantsApp.openEdit(${v.id})"><i data-lucide="pencil"></i></button>
                            <button class="btn-action act-confirm" title="${v.isActive ? 'Ẩn' : 'Dùng lại'}" onclick="Web2VariantsApp.toggleActive(${v.id}, ${!v.isActive})"><i data-lucide="${v.isActive ? 'pause' : 'play'}"></i></button>
                            <button class="btn-action act-delete" title="Xóa" onclick="Web2VariantsApp.remove(${v.id})"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderCounters() {
        const t = STATE.total.toLocaleString('vi-VN');
        const c = counter();
        if (c) c.textContent = `${t} biến thể`;
    }

    function renderGroupOptions() {
        const groups = [...new Set(STATE.variants.map((v) => v.groupName).filter(Boolean))].sort();
        const sel = $('#filterGroup');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML =
            '<option value="">Tất cả</option>' +
            groups
                .map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`)
                .join('');
        sel.value = cur || '';
    }

    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        tbody().innerHTML = `<tr><td colspan="6" class="loading-row">
            <div class="spinner"></div>Đang tải dữ liệu...
        </td></tr>`;
        try {
            const resp = await window.Web2VariantsApi.list({
                search: STATE.search || undefined,
                activeOnly: STATE.activeOnly,
                group: STATE.group || undefined,
                page: 1,
                limit: 2000,
            });
            STATE.variants = resp.variants || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderGroupOptions();
            renderCounters();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="6" class="empty-row" style="color:#ef4444;">
                Lỗi tải: ${escapeHtml(e.message)}
            </td></tr>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
        }
    }

    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.activeOnly = $('#filterActive').value === 'true';
        STATE.group = $('#filterGroup').value || '';
        load();
    }

    function openCreate() {
        STATE.editingId = null;
        $('#variantModalTitle').innerHTML = `<i data-lucide="plus"></i><span>Thêm biến thể</span>`;
        $('#vmValue').value = '';
        $('#vmValue').disabled = false;
        $('#vmGroup').value = '';
        $('#vmSortOrder').value = 0;
        $('#vmIsActive').value = 'true';
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
        setTimeout(() => $('#vmValue').focus(), 50);
    }

    function openEdit(id) {
        const v = STATE.variants.find((x) => x.id === Number(id));
        if (!v) return;
        STATE.editingId = v.id;
        $('#variantModalTitle').innerHTML =
            `<i data-lucide="pencil"></i><span>Sửa biến thể "${escapeHtml(v.value)}"</span>`;
        $('#vmValue').value = v.value;
        $('#vmValue').disabled = false;
        $('#vmGroup').value = v.groupName || '';
        $('#vmSortOrder').value = v.sortOrder ?? 0;
        $('#vmIsActive').value = v.isActive ? 'true' : 'false';
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }

    function closeModal() {
        STATE.editingId = null;
        modal().classList.remove('active');
    }

    async function saveModal() {
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const fields = {
            value: $('#vmValue').value.trim(),
            groupName: $('#vmGroup').value.trim() || null,
            sortOrder: Number($('#vmSortOrder').value) || 0,
            isActive: $('#vmIsActive').value === 'true',
        };
        if (!fields.value) return notify('Thiếu giá trị biến thể', 'error');
        try {
            if (STATE.editingId) {
                const resp = await window.Web2VariantsApi.update(STATE.editingId, fields);
                const idx = STATE.variants.findIndex((x) => x.id === STATE.editingId);
                if (idx !== -1 && resp.variant) STATE.variants[idx] = resp.variant;
                notify('Đã lưu', 'success');
                window.Web2VariantsCache?.pushTickle?.({ action: 'update', id: STATE.editingId });
                renderRows();
                renderGroupOptions();
                closeModal();
            } else {
                const resp = await window.Web2VariantsApi.create({
                    ...fields,
                    createdBy: user.uid || user.email || null,
                });
                notify(`Đã tạo biến thể "${fields.value}"`, 'success');
                window.Web2VariantsCache?.pushTickle?.({ action: 'create', id: resp?.variant?.id });
                load();
                closeModal();
            }
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function toggleActive(id, newState) {
        try {
            const resp = await window.Web2VariantsApi.update(id, { isActive: newState });
            const idx = STATE.variants.findIndex((x) => x.id === Number(id));
            if (idx !== -1 && resp.variant) STATE.variants[idx] = resp.variant;
            renderRows();
            notify(newState ? 'Đã bật dùng lại' : 'Đã ẩn biến thể', 'success');
            window.Web2VariantsCache?.pushTickle?.({ action: 'update', id });
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function remove(id) {
        const v = STATE.variants.find((x) => x.id === Number(id));
        if (!v) return;
        const ok = window.Popup
            ? await window.Popup.confirm(
                  `Xóa biến thể "${v.value}"? SP đang dùng biến thể này sẽ còn lưu chuỗi text cũ nhưng dropdown picker sẽ không gợi ý nữa.`,
                  {
                      title: `Xoá biến thể?`,
                      okText: 'Xoá',
                      cancelText: 'Đóng',
                      type: 'error',
                  }
              )
            : confirm(`Xóa biến thể "${v.value}"?`);
        if (!ok) return;
        try {
            await window.Web2VariantsApi.remove(id);
            STATE.variants = STATE.variants.filter((x) => x.id !== Number(id));
            STATE.total = Math.max(0, STATE.total - 1);
            renderRows();
            renderGroupOptions();
            renderCounters();
            notify('Đã xóa biến thể', 'success');
            window.Web2VariantsCache?.pushTickle?.({ action: 'delete', id });
        } catch (e) {
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        $('#btnCreateVariant')?.addEventListener('click', openCreate);
        $('#filterSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        $('#filterSearchClear')?.addEventListener('click', () => {
            const el = $('#filterSearch');
            if (el) {
                el.value = '';
                STATE.search = '';
                load();
            }
        });
        $('#filterActive')?.addEventListener('change', applyFilters);
        $('#filterGroup')?.addEventListener('change', applyFilters);

        $('#btnCloseVariantModal')?.addEventListener('click', closeModal);
        $('#btnCancelVariant')?.addEventListener('click', closeModal);
        $('#btnSaveVariant')?.addEventListener('click', saveModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal()?.classList.contains('active')) closeModal();
        });

        load();

        if (window.Web2VariantsCache) {
            window.Web2VariantsCache.init().then(() => {
                window.Web2VariantsCache.subscribe((reason) => {
                    if (reason === 'tickle' || reason === 'refresh') load();
                });
            });
        }
    }

    window.Web2VariantsApp = { openEdit, toggleActive, remove };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
