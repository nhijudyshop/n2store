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

    // S6-residual fix (2026-06-12): bản DOM-based KHÔNG escape quote —
    // nhúng vào attribute (value="...") là injectable. Chuẩn 5 ký tự
    // (đồng bộ web2/shared/web2-escape.js).
    function escapeHtml(s) {
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
        const items = STATE.variants;
        if (!items.length) {
            const filtering = STATE.search || STATE.group;
            // Task 5: empty state with lucide 'layers' icon for visual discoverability.
            tbody().innerHTML = filtering
                ? `<tr><td colspan="7" class="empty-row">Không tìm thấy biến thể phù hợp — thử bỏ filter hoặc đổi từ khoá.</td></tr>`
                : `<tr><td colspan="7" class="empty-row"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;"><i data-lucide="layers" style="width:28px;height:28px;color:#94a3b8;"></i><span>Chưa có biến thể nào — bấm "Thêm Biến Thể" để tạo</span></div></td></tr>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        tbody().innerHTML = items
            .map((v, idx) => {
                const groupHtml = v.groupName
                    ? `<span class="group-pill">${escapeHtml(v.groupName)}</span>`
                    : '<span class="group-empty">—</span>';
                const shortCodeHtml = v.shortCode
                    ? `<span style="font-family:'SF Mono','Menlo',monospace;font-weight:700;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:4px;font-size:12px">${escapeHtml(v.shortCode)}</span>`
                    : `<span style="color:#dc2626;font-size:11px">⚠ chưa có</span>`;
                return `
                <tr data-id="${v.id}">
                    <td>${idx + 1}</td>
                    <td><span class="variant-value-pill">${escapeHtml(v.value)}</span></td>
                    <td>${groupHtml}</td>
                    <td>${shortCodeHtml}</td>
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
        // Loading/skeleton CHỈ lần tải đầu (bảng trống). Re-filter/CRUD/SSE giữ
        // data cũ → renderRows() đè in-place, KHÔNG nháy skeleton toàn bảng.
        if (!STATE.variants.length) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.rows(tbody(), { rows: 8, cols: 7 });
            } else {
                tbody().innerHTML = `<tr><td colspan="7" class="loading-row">
                <div class="spinner"></div>Đang tải dữ liệu...
            </td></tr>`;
            }
        }
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
            tbody().innerHTML = `<tr><td colspan="7" class="empty-row" style="color:#ef4444;">
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
        if ($('#vmShortCode')) $('#vmShortCode').value = '';
        if ($('#vmShortCodeHint')) $('#vmShortCodeHint').textContent = '';
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
        if ($('#vmShortCode')) $('#vmShortCode').value = v.shortCode || '';
        if ($('#vmShortCodeHint')) {
            $('#vmShortCodeHint').textContent = v.shortCode
                ? '✓ Đã khoá — đổi sẽ ảnh hưởng các SP mới tạo sau này'
                : '⚠ Chưa có viết tắt — bấm Gợi ý để tự sinh';
        }
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }

    async function suggestShortCode() {
        const value = ($('#vmValue')?.value || '').trim();
        const groupName = ($('#vmGroup')?.value || '').trim();
        if (!value) return notify('Cần điền giá trị biến thể trước', 'warning');
        try {
            const q = new URLSearchParams({ value });
            if (groupName) q.set('groupName', groupName);
            const resp = await window.Web2VariantsApi.suggestShortCode(q);
            $('#vmShortCode').value = resp.shortCode || '';
            const hint = $('#vmShortCodeHint');
            if (hint) {
                hint.textContent = resp.collidesWith
                    ? `✨ Mở rộng vì trùng "${resp.collidesWith}" → ${resp.shortCode}`
                    : `✨ Gợi ý: ${resp.shortCode}`;
            }
        } catch (e) {
            notify('Lỗi gợi ý: ' + e.message, 'error');
        }
    }

    function closeModal() {
        STATE.editingId = null;
        modal().classList.remove('active');
        const sb = document.getElementById('btnSaveVariant');
        if (sb) sb.disabled = false; // luôn bật lại nút Lưu khi đóng (mọi đường)
    }

    async function saveModal() {
        // Chống double-click tạo trùng biến thể: khoá nút Lưu ngay đầu, bật lại khi
        // đóng modal (closeModal) hoặc validation fail.
        const _saveBtn = document.getElementById('btnSaveVariant');
        if (_saveBtn) {
            if (_saveBtn.disabled) return;
            _saveBtn.disabled = true;
        }
        const _reenable = (msg) => {
            if (_saveBtn) _saveBtn.disabled = false;
            return notify(msg, 'error');
        };
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const shortCode = ($('#vmShortCode')?.value || '').trim().toUpperCase();
        const fields = {
            value: $('#vmValue').value.trim(),
            groupName: $('#vmGroup').value.trim() || null,
            shortCode: shortCode || null,
            sortOrder: Number($('#vmSortOrder').value) || 0,
            isActive: $('#vmIsActive').value === 'true',
        };
        if (!fields.value) return _reenable('Thiếu giá trị biến thể');
        if (!fields.groupName) return _reenable('Cần chọn nhóm: Màu hoặc Size');
        if (!fields.shortCode) return _reenable('Thiếu viết tắt — bấm Gợi ý hoặc nhập tay');
        if (!/^[A-Z0-9]{1,20}$/.test(fields.shortCode)) {
            return _reenable('Viết tắt phải gồm A-Z và 0-9, 1-20 ký tự');
        }
        // ─── UPDATE branch ──────────────────────────────────────────
        if (STATE.editingId) {
            const editId = STATE.editingId;
            const idx = STATE.variants.findIndex((x) => x.id === editId);
            const prev = idx !== -1 ? { ...STATE.variants[idx] } : null;
            if (window.Web2Optimistic?.run && prev) {
                closeModal();
                Web2Optimistic.run({
                    snapshot: () => prev,
                    apply: () => {
                        // Optimistic merge — 1 nguồn render duy nhất (renderRows).
                        const i = STATE.variants.findIndex((x) => x.id === editId);
                        if (i !== -1) STATE.variants[i] = { ...prev, ...fields };
                        renderRows();
                        renderGroupOptions();
                    },
                    run: async () => {
                        return await window.Web2VariantsApi.update(editId, fields);
                    },
                    onSuccess: (resp) => {
                        if (resp?.variant) {
                            const i = STATE.variants.findIndex((x) => x.id === editId);
                            if (i !== -1) {
                                STATE.variants[i] = resp.variant;
                                renderRows();
                                renderGroupOptions();
                            }
                        }
                        // SSE tickle (cross-tab) — KHÔNG render local thêm lần nữa.
                        window.Web2VariantsCache?.pushTickle?.({ action: 'update', id: editId });
                    },
                    rollback: (snap) => {
                        const i = STATE.variants.findIndex((x) => x.id === editId);
                        if (i !== -1 && snap) STATE.variants[i] = snap;
                        renderRows();
                        renderGroupOptions();
                    },
                    successMsg: 'Đã lưu',
                    errLabel: `lưu biến thể ${editId}`,
                });
                return;
            }
            // Legacy await path.
            try {
                const resp = await window.Web2VariantsApi.update(editId, fields);
                const i = STATE.variants.findIndex((x) => x.id === editId);
                if (i !== -1 && resp.variant) STATE.variants[i] = resp.variant;
                notify('Đã lưu', 'success');
                window.Web2VariantsCache?.pushTickle?.({ action: 'update', id: editId });
                renderRows();
                renderGroupOptions();
                closeModal();
            } catch (e) {
                notify('Lỗi: ' + e.message, 'error');
            }
            return;
        }

        // ─── CREATE branch ──────────────────────────────────────────
        const createPayload = { ...fields, createdBy: user.uid || user.email || null };
        if (window.Web2Optimistic?.run) {
            const snapshot = { variants: STATE.variants.slice(), total: STATE.total };
            const optimisticRow = { ...fields, id: `tmp-${Date.now()}` };
            closeModal();
            Web2Optimistic.run({
                snapshot: () => snapshot,
                apply: () => {
                    STATE.variants = [...STATE.variants, optimisticRow];
                    STATE.total = STATE.total + 1;
                    renderRows();
                    renderGroupOptions();
                    renderCounters();
                },
                run: async () => {
                    return await window.Web2VariantsApi.create(createPayload);
                },
                onSuccess: (resp) => {
                    window.Web2VariantsCache?.pushTickle?.({
                        action: 'create',
                        id: resp?.variant?.id,
                    });
                    // Reload để lấy id thật + sort order chuẩn từ server.
                    load();
                },
                rollback: (snap) => {
                    if (snap) {
                        STATE.variants = snap.variants;
                        STATE.total = snap.total;
                        renderRows();
                        renderGroupOptions();
                        renderCounters();
                    }
                },
                successMsg: `Đã tạo biến thể "${fields.value}"`,
                errLabel: `tạo biến thể "${fields.value}"`,
            });
            return;
        }
        // Legacy await path.
        try {
            const resp = await window.Web2VariantsApi.create(createPayload);
            notify(`Đã tạo biến thể "${fields.value}"`, 'success');
            window.Web2VariantsCache?.pushTickle?.({ action: 'create', id: resp?.variant?.id });
            load();
            closeModal();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    // UI-first: badge isActive đổi NGAY, PATCH background. Rollback nếu lỗi.
    function toggleActive(id, newState) {
        const numId = Number(id);
        const idx = STATE.variants.findIndex((x) => x.id === numId);
        if (idx === -1) return;
        // Snapshot bằng deep-ish copy ngay lúc capture (giá trị, không phải tham chiếu live).
        const prev = { ...STATE.variants[idx] };
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => ({ ...prev }),
                // Re-find index theo id ở mỗi write — tránh stale idx khi SSE load()
                // thay/đảo STATE.variants giữa apply và lúc PATCH resolve (mirror UPDATE branch).
                apply: () => {
                    const i = STATE.variants.findIndex((x) => x.id === numId);
                    if (i !== -1) STATE.variants[i] = { ...prev, isActive: newState };
                    renderRows();
                },
                run: async () => {
                    return await window.Web2VariantsApi.update(numId, { isActive: newState });
                },
                onSuccess: (resp) => {
                    if (resp.variant) {
                        const i = STATE.variants.findIndex((x) => x.id === numId);
                        if (i !== -1) {
                            STATE.variants[i] = resp.variant;
                            renderRows();
                        }
                    }
                    window.Web2VariantsCache?.pushTickle?.({ action: 'update', id: numId });
                },
                rollback: (snap) => {
                    const i = STATE.variants.findIndex((x) => x.id === numId);
                    if (i !== -1 && snap) STATE.variants[i] = snap;
                    renderRows();
                },
                successMsg: newState ? 'Đã bật dùng lại' : 'Đã ẩn biến thể',
                errLabel: `toggle biến thể ${numId}`,
            });
        } else {
            (async () => {
                try {
                    const resp = await window.Web2VariantsApi.update(numId, { isActive: newState });
                    const i = STATE.variants.findIndex((x) => x.id === numId);
                    if (i !== -1 && resp.variant) STATE.variants[i] = resp.variant;
                    renderRows();
                    notify(newState ? 'Đã bật dùng lại' : 'Đã ẩn biến thể', 'success');
                    window.Web2VariantsCache?.pushTickle?.({ action: 'update', id: numId });
                } catch (e) {
                    notify('Lỗi: ' + e.message, 'error');
                }
            })();
        }
    }

    async function remove(id) {
        const v = STATE.variants.find((x) => x.id === Number(id));
        if (!v) return;
        const ok = await window.Popup.danger(
            `Xóa biến thể "${v.value}"? SP đang dùng biến thể này sẽ còn lưu chuỗi text cũ nhưng dropdown picker sẽ không gợi ý nữa.`,
            {
                title: `Xoá biến thể?`,
                okText: 'Xoá',
                cancelText: 'Đóng',
            }
        );
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
        $('#vmSuggestShortCode')?.addEventListener('click', suggestShortCode);
        // Auto-suggest khi blur giá trị nếu shortcode còn trống.
        // Task 4: after auto-filling shortCode, focus it so user can confirm or override.
        $('#vmValue')?.addEventListener('blur', async () => {
            if (STATE.editingId) return;
            const scEl = $('#vmShortCode');
            if ((scEl?.value || '').trim()) return;
            const val = ($('#vmValue')?.value || '').trim();
            if (!val) return;
            await suggestShortCode();
            // Focus shortCode only if it ended up still empty (edge case: suggest failed)
            // or if it was filled — either way landing focus there is the right UX.
            if (scEl) setTimeout(() => scEl.focus(), 30);
        });
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

        // MEDIUM-cleanup (2026-06-13): khử double-render. Trước đây cache-subscriber
        // (tickle/refresh → load() undebounced) chạy SONG SONG với SSE debounced
        // bên dưới → 2 đường reload trùng. Giữ init cache (cho data nóng) nhưng BỎ
        // reload từ cache-subscriber; reload đi DUY NHẤT qua SSE debounced.
        if (window.Web2VariantsCache) {
            window.Web2VariantsCache.init().catch(() => {});
        }

        // 2026-06-04: SSE canonical (web2:variants) — backend web2-variants.js
        // _notify mọi CRUD. Đồng bộ cross-tab/cross-máy không cần refresh. Debounce
        // 600ms gom burst. Đây là ĐƯỜNG RELOAD DUY NHẤT (xem MEDIUM-cleanup trên).
        if (window.Web2SSE?.subscribe) {
            let _sseT = null;
            window.Web2SSE.subscribe('web2:variants', () => {
                clearTimeout(_sseT);
                _sseT = setTimeout(load, 600);
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
