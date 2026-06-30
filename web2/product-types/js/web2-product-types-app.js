// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Loại Sản Phẩm Web 2.0 — main app: render bảng + CRUD qua modal.
 * Mirror cấu trúc web2-variants-app.js (UI-first + SSE), đơn giản hơn (chỉ
 * name / sortOrder / isActive). Loại dùng để chọn khi nhập SP (Áo/Quần/Đầm…),
 * chọn nhiều loại = sản phẩm BỘ.
 */

(function () {
    'use strict';

    const STATE = {
        types: [],
        total: 0,
        search: '',
        activeOnly: false,
        loading: false,
        editingId: null,
    };

    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#typesTbody');
    const counter = () => $('#totalCounter');
    const modal = () => $('#typeModal');

    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    function renderRows() {
        const items = STATE.types;
        if (!items.length) {
            tbody().innerHTML = STATE.search
                ? `<tr><td colspan="5" class="empty-row">Không tìm thấy loại phù hợp.</td></tr>`
                : `<tr><td colspan="5" class="empty-row"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;"><i data-lucide="shirt" style="width:28px;height:28px;color:#94a3b8;"></i><span>Chưa có loại nào — bấm "Thêm Loại" để tạo (Áo, Quần, Đầm…)</span></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        tbody().innerHTML = items
            .map((t, idx) => {
                return `
                <tr data-id="${t.id}">
                    <td>${idx + 1}</td>
                    <td><span class="type-name-pill">${escapeHtml(t.name)}</span></td>
                    <td class="sort-cell">${t.sortOrder ?? 0}</td>
                    <td>
                        ${
                            t.isActive
                                ? `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang dùng</span>`
                                : `<span class="active-badge active-no"><i data-lucide="pause"></i>Đã ẩn</span>`
                        }
                    </td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-action act-edit" title="Sửa" onclick="Web2ProductTypesApp.openEdit(${t.id})"><i data-lucide="pencil"></i></button>
                            <button class="btn-action act-confirm" title="${t.isActive ? 'Ẩn' : 'Dùng lại'}" onclick="Web2ProductTypesApp.toggleActive(${t.id}, ${!t.isActive})"><i data-lucide="${t.isActive ? 'pause' : 'play'}"></i></button>
                            <button class="btn-action act-delete" title="Xóa" onclick="Web2ProductTypesApp.remove(${t.id})"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderCounters() {
        const c = counter();
        if (c) c.textContent = `${STATE.total.toLocaleString('vi-VN')} loại`;
    }

    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        if (!STATE.types.length) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.rows(tbody(), { rows: 6, cols: 5 });
            } else {
                tbody().innerHTML = `<tr><td colspan="5" class="loading-row"><div class="spinner"></div>Đang tải dữ liệu...</td></tr>`;
            }
        }
        try {
            const resp = await window.Web2ProductTypesApi.list({
                search: STATE.search || undefined,
                activeOnly: STATE.activeOnly,
                page: 1,
                limit: 2000,
            });
            STATE.types = resp.types || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderCounters();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="5" class="empty-row" style="color:#ef4444;">Lỗi tải: ${escapeHtml(e.message)}</td></tr>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
        }
    }

    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.activeOnly = $('#filterActive').value === 'true';
        load();
    }

    function openCreate() {
        STATE.editingId = null;
        $('#typeModalTitle').innerHTML = `<i data-lucide="plus"></i><span>Thêm loại</span>`;
        $('#tmName').value = '';
        $('#tmSortOrder').value = 0;
        $('#tmIsActive').value = 'true';
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
        setTimeout(() => $('#tmName').focus(), 50);
    }

    function openEdit(id) {
        const t = STATE.types.find((x) => x.id === Number(id));
        if (!t) return;
        STATE.editingId = t.id;
        $('#typeModalTitle').innerHTML =
            `<i data-lucide="pencil"></i><span>Sửa loại "${escapeHtml(t.name)}"</span>`;
        $('#tmName').value = t.name;
        $('#tmSortOrder').value = t.sortOrder ?? 0;
        $('#tmIsActive').value = t.isActive ? 'true' : 'false';
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }

    function closeModal() {
        STATE.editingId = null;
        modal().classList.remove('active');
        const sb = document.getElementById('btnSaveType');
        if (sb) sb.disabled = false;
    }

    async function saveModal() {
        const _saveBtn = document.getElementById('btnSaveType');
        if (_saveBtn) {
            if (_saveBtn.disabled) return;
            _saveBtn.disabled = true;
        }
        const _reenable = (msg) => {
            if (_saveBtn) _saveBtn.disabled = false;
            return notify(msg, 'error');
        };
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const fields = {
            name: $('#tmName').value.trim(),
            sortOrder: Number($('#tmSortOrder').value) || 0,
            isActive: $('#tmIsActive').value === 'true',
        };
        if (!fields.name) return _reenable('Thiếu tên loại');

        // ─── UPDATE ──────────────────────────────────────────
        if (STATE.editingId) {
            const editId = STATE.editingId;
            const idx = STATE.types.findIndex((x) => x.id === editId);
            const prev = idx !== -1 ? { ...STATE.types[idx] } : null;
            if (window.Web2Optimistic?.run && prev) {
                closeModal();
                Web2Optimistic.run({
                    snapshot: () => prev,
                    apply: () => {
                        const i = STATE.types.findIndex((x) => x.id === editId);
                        if (i !== -1) STATE.types[i] = { ...prev, ...fields };
                        renderRows();
                    },
                    run: async () => window.Web2ProductTypesApi.update(editId, fields),
                    onSuccess: (resp) => {
                        if (resp?.type) {
                            const i = STATE.types.findIndex((x) => x.id === editId);
                            if (i !== -1) {
                                STATE.types[i] = resp.type;
                                renderRows();
                            }
                        }
                        window.Web2ProductTypesCache?.pushTickle?.({
                            action: 'update',
                            id: editId,
                        });
                    },
                    rollback: (snap) => {
                        const i = STATE.types.findIndex((x) => x.id === editId);
                        if (i !== -1 && snap) STATE.types[i] = snap;
                        renderRows();
                    },
                    successMsg: 'Đã lưu',
                    errLabel: `lưu loại ${editId}`,
                });
                return;
            }
            try {
                const resp = await window.Web2ProductTypesApi.update(editId, fields);
                const i = STATE.types.findIndex((x) => x.id === editId);
                if (i !== -1 && resp.type) STATE.types[i] = resp.type;
                notify('Đã lưu', 'success');
                window.Web2ProductTypesCache?.pushTickle?.({ action: 'update', id: editId });
                renderRows();
                closeModal();
            } catch (e) {
                notify('Lỗi: ' + e.message, 'error');
            }
            return;
        }

        // ─── CREATE ──────────────────────────────────────────
        const createPayload = { ...fields, createdBy: user.uid || user.email || null };
        if (window.Web2Optimistic?.run) {
            const snapshot = { types: STATE.types.slice(), total: STATE.total };
            const optimisticRow = { ...fields, id: `tmp-${Date.now()}` };
            closeModal();
            Web2Optimistic.run({
                snapshot: () => snapshot,
                apply: () => {
                    STATE.types = [...STATE.types, optimisticRow];
                    STATE.total = STATE.total + 1;
                    renderRows();
                    renderCounters();
                },
                run: async () => window.Web2ProductTypesApi.create(createPayload),
                onSuccess: (resp) => {
                    window.Web2ProductTypesCache?.pushTickle?.({
                        action: 'create',
                        id: resp?.type?.id,
                    });
                    load();
                },
                rollback: (snap) => {
                    if (snap) {
                        STATE.types = snap.types;
                        STATE.total = snap.total;
                        renderRows();
                        renderCounters();
                    }
                },
                successMsg: `Đã tạo loại "${fields.name}"`,
                errLabel: `tạo loại "${fields.name}"`,
            });
            return;
        }
        try {
            const resp = await window.Web2ProductTypesApi.create(createPayload);
            notify(`Đã tạo loại "${fields.name}"`, 'success');
            window.Web2ProductTypesCache?.pushTickle?.({ action: 'create', id: resp?.type?.id });
            load();
            closeModal();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    function toggleActive(id, newState) {
        const numId = Number(id);
        const idx = STATE.types.findIndex((x) => x.id === numId);
        if (idx === -1) return;
        const prev = { ...STATE.types[idx] };
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => ({ ...prev }),
                apply: () => {
                    const i = STATE.types.findIndex((x) => x.id === numId);
                    if (i !== -1) STATE.types[i] = { ...prev, isActive: newState };
                    renderRows();
                },
                run: async () => window.Web2ProductTypesApi.update(numId, { isActive: newState }),
                onSuccess: (resp) => {
                    if (resp.type) {
                        const i = STATE.types.findIndex((x) => x.id === numId);
                        if (i !== -1) {
                            STATE.types[i] = resp.type;
                            renderRows();
                        }
                    }
                    window.Web2ProductTypesCache?.pushTickle?.({ action: 'update', id: numId });
                },
                rollback: (snap) => {
                    const i = STATE.types.findIndex((x) => x.id === numId);
                    if (i !== -1 && snap) STATE.types[i] = snap;
                    renderRows();
                },
                successMsg: newState ? 'Đã bật dùng lại' : 'Đã ẩn loại',
                errLabel: `toggle loại ${numId}`,
            });
        } else {
            (async () => {
                try {
                    const resp = await window.Web2ProductTypesApi.update(numId, {
                        isActive: newState,
                    });
                    const i = STATE.types.findIndex((x) => x.id === numId);
                    if (i !== -1 && resp.type) STATE.types[i] = resp.type;
                    renderRows();
                    notify(newState ? 'Đã bật dùng lại' : 'Đã ẩn loại', 'success');
                    window.Web2ProductTypesCache?.pushTickle?.({ action: 'update', id: numId });
                } catch (e) {
                    notify('Lỗi: ' + e.message, 'error');
                }
            })();
        }
    }

    async function remove(id) {
        const t = STATE.types.find((x) => x.id === Number(id));
        if (!t) return;
        const ok = window.Popup?.danger
            ? await window.Popup.danger(
                  `Xóa loại "${t.name}"? SP đã gắn loại này vẫn giữ chuỗi text cũ nhưng sẽ không gợi ý nữa.`,
                  { title: 'Xoá loại?', okText: 'Xoá', cancelText: 'Đóng' }
              )
            : confirm(`Xóa loại "${t.name}"?`);
        if (!ok) return;
        try {
            await window.Web2ProductTypesApi.remove(id);
            STATE.types = STATE.types.filter((x) => x.id !== Number(id));
            STATE.total = Math.max(0, STATE.total - 1);
            renderRows();
            renderCounters();
            notify('Đã xóa loại', 'success');
            window.Web2ProductTypesCache?.pushTickle?.({ action: 'delete', id });
        } catch (e) {
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function init() {
        if (window.lucide) lucide.createIcons();
        $('#btnCreateType')?.addEventListener('click', openCreate);
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

        $('#btnCloseTypeModal')?.addEventListener('click', closeModal);
        $('#btnCancelType')?.addEventListener('click', closeModal);
        $('#btnSaveType')?.addEventListener('click', saveModal);
        document.addEventListener('keydown', (e) => {
            if (!modal()?.classList.contains('active')) return;
            if (e.key === 'Escape') return closeModal();
            if (e.key === 'Enter' && !e.isComposing) {
                const tag = document.activeElement?.tagName;
                if (tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') {
                    e.preventDefault();
                    saveModal();
                }
            }
        });

        load();

        if (window.Web2ProductTypesCache) {
            window.Web2ProductTypesCache.init().catch(() => {});
        }
        if (window.Web2SSE?.subscribe) {
            let _sseT = null;
            window.Web2SSE.subscribe('web2:product-types', () => {
                clearTimeout(_sseT);
                _sseT = setTimeout(load, 600);
            });
        }
    }

    window.Web2ProductTypesApp = { openEdit, toggleActive, remove };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
