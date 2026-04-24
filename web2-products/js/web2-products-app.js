// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web2 Products — main app: render bảng + CRUD qua modal.
 */

(function () {
    'use strict';

    const STATE = {
        products: [],
        total: 0,
        page: 1,
        limit: 200,
        search: '',
        activeOnly: false,    // 'all' (false) vs 'true' (active only)
        loading: false,
        editingCode: null,    // null = creating, string = editing
    };

    const $ = (sel) => document.querySelector(sel);
    const tbody = () => $('#productsTbody');
    const counter = () => $('#totalCounter');
    const searchCount = () => $('#searchResultCount');
    const pag = () => $('#pagination');
    const modal = () => $('#productModal');

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    function fmtPrice(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    // ---------- Render ----------
    function renderRows() {
        const items = STATE.products;
        if (!items.length) {
            tbody().innerHTML = `<tr><td colspan="9" class="empty-row">
                Chưa có sản phẩm — bấm "Thêm SP" để tạo
            </td></tr>`;
            return;
        }
        tbody().innerHTML = items.map((p, idx) => {
            const n = (STATE.page - 1) * STATE.limit + idx + 1;
            const imgHtml = p.imageUrl
                ? `<img class="product-image" src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy"
                       onerror="this.style.display='none';this.nextElementSibling?.style.setProperty('display','inline-flex');">`
                  + `<span class="product-image-placeholder" style="display:none;"><i data-lucide="image"></i></span>`
                : `<span class="product-image-placeholder"><i data-lucide="image"></i></span>`;
            const stockClass = p.stock === 0 ? 'zero' : (p.stock < 5 ? 'low' : '');
            return `
                <tr data-code="${escapeHtml(p.code)}">
                    <td>${n}</td>
                    <td>${imgHtml}</td>
                    <td><span class="code-badge code-product" onclick="Web2ProductsApp.copyCode('${escapeHtml(p.code)}')"><i data-lucide="tag"></i>${escapeHtml(p.code)}</span></td>
                    <td><div style="font-weight:600;">${escapeHtml(p.name)}</div></td>
                    <td class="price-cell">${fmtPrice(p.price)}</td>
                    <td class="stock-cell ${stockClass}">${p.stock ?? 0}</td>
                    <td class="note-cell" title="${escapeHtml(p.note || '')}">${escapeHtml(p.note || '—')}</td>
                    <td>
                        ${p.isActive
                            ? `<span class="active-badge active-yes"><i data-lucide="check"></i>Đang bán</span>`
                            : `<span class="active-badge active-no"><i data-lucide="pause"></i>Tạm dừng</span>`}
                    </td>
                    <td>
                        <div class="row-actions">
                            <button class="btn-action act-edit" title="Sửa" onclick="Web2ProductsApp.openEdit('${escapeHtml(p.code)}')"><i data-lucide="pencil"></i></button>
                            <button class="btn-action act-confirm" title="${p.isActive ? 'Tạm dừng' : 'Bán lại'}" onclick="Web2ProductsApp.toggleActive('${escapeHtml(p.code)}', ${!p.isActive})"><i data-lucide="${p.isActive ? 'pause' : 'play'}"></i></button>
                            <button class="btn-action act-delete" title="Xóa" onclick="Web2ProductsApp.remove('${escapeHtml(p.code)}')"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        const cur = STATE.page;
        const html = [];
        html.push(`<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="Web2ProductsApp.goPage(${cur - 1})">‹</button>`);
        const start = Math.max(1, cur - 2);
        const end = Math.min(totalPages, start + 4);
        if (start > 1) {
            html.push(`<button class="page-btn" onclick="Web2ProductsApp.goPage(1)">1</button>`);
            if (start > 2) html.push(`<span class="page-info">…</span>`);
        }
        for (let p = start; p <= end; p++) {
            html.push(`<button class="page-btn ${p === cur ? 'active' : ''}" onclick="Web2ProductsApp.goPage(${p})">${p}</button>`);
        }
        if (end < totalPages) {
            if (end < totalPages - 1) html.push(`<span class="page-info">…</span>`);
            html.push(`<button class="page-btn" onclick="Web2ProductsApp.goPage(${totalPages})">${totalPages}</button>`);
        }
        html.push(`<button class="page-btn" ${cur >= totalPages ? 'disabled' : ''} onclick="Web2ProductsApp.goPage(${cur + 1})">›</button>`);
        html.push(`<span class="page-info">${STATE.total.toLocaleString('vi-VN')} SP — trang ${cur}/${totalPages}</span>`);
        pag().innerHTML = html.join('');
    }

    function renderCounters() {
        const t = STATE.total.toLocaleString('vi-VN');
        counter().textContent = `${t} sản phẩm`;
        searchCount().textContent = t;
    }

    // ---------- Data load ----------
    async function load() {
        if (STATE.loading) return;
        STATE.loading = true;
        tbody().innerHTML = `<tr><td colspan="9" class="loading-row">
            <div class="spinner"></div>Đang tải dữ liệu...
        </td></tr>`;
        try {
            const resp = await window.Web2ProductsApi.list({
                search: STATE.search || undefined,
                activeOnly: STATE.activeOnly,
                page: STATE.page,
                limit: STATE.limit,
            });
            STATE.products = resp.products || [];
            STATE.total = resp.total || 0;
            renderRows();
            renderPagination();
            renderCounters();
        } catch (e) {
            console.error(e);
            tbody().innerHTML = `<tr><td colspan="9" class="empty-row" style="color:#ef4444;">
                Lỗi tải: ${escapeHtml(e.message)}
            </td></tr>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            STATE.loading = false;
        }
    }

    // ---------- Filter ----------
    function applyFilters() {
        STATE.search = $('#filterSearch').value.trim();
        STATE.activeOnly = $('#filterActive').value === 'true';
        STATE.limit = parseInt($('#filterLimit').value, 10) || 200;
        STATE.page = 1;
        load();
    }
    function clearFilters() {
        $('#filterSearch').value = '';
        $('#filterActive').value = 'all';
        $('#filterLimit').value = '200';
        STATE.search = '';
        STATE.activeOnly = false;
        STATE.limit = 200;
        STATE.page = 1;
        load();
    }

    // ---------- Modal ----------
    function openCreate() {
        STATE.editingCode = null;
        $('#productModalTitle').innerHTML = `<i data-lucide="plus"></i><span>Thêm sản phẩm</span>`;
        $('#pmCode').value = '';
        $('#pmCode').disabled = false;
        $('#pmName').value = '';
        $('#pmPrice').value = 0;
        $('#pmStock').value = 0;
        $('#pmImage').value = '';
        $('#pmNote').value = '';
        $('#pmIsActive').value = 'true';
        updateImagePreview('');
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
        setTimeout(() => $('#pmCode').focus(), 50);
    }
    function openEdit(code) {
        const p = STATE.products.find((x) => x.code === code);
        if (!p) return;
        STATE.editingCode = code;
        $('#productModalTitle').innerHTML = `<i data-lucide="pencil"></i><span>Sửa sản phẩm ${escapeHtml(code)}</span>`;
        $('#pmCode').value = p.code;
        $('#pmCode').disabled = true;
        $('#pmName').value = p.name || '';
        $('#pmPrice').value = p.price || 0;
        $('#pmStock').value = p.stock ?? 0;
        $('#pmImage').value = p.imageUrl || '';
        $('#pmNote').value = p.note || '';
        $('#pmIsActive').value = p.isActive ? 'true' : 'false';
        updateImagePreview(p.imageUrl || '');
        modal().classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
    function closeModal() {
        STATE.editingCode = null;
        modal().classList.remove('active');
    }
    function updateImagePreview(url) {
        const box = $('#pmImagePreview');
        const img = $('#pmImagePreviewImg');
        if (url) {
            img.src = url;
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
            img.src = '';
        }
    }

    async function saveModal() {
        const user = window.AuthManager?.getCurrentUser?.() || {};
        const fields = {
            code: $('#pmCode').value.trim(),
            name: $('#pmName').value.trim(),
            price: Number($('#pmPrice').value) || 0,
            stock: Number($('#pmStock').value) || 0,
            imageUrl: $('#pmImage').value.trim() || null,
            note: $('#pmNote').value.trim() || null,
            isActive: $('#pmIsActive').value === 'true',
        };
        if (!fields.code) return notify('Thiếu mã SP', 'error');
        if (!fields.name) return notify('Thiếu tên SP', 'error');

        try {
            if (STATE.editingCode) {
                const resp = await window.Web2ProductsApi.update(STATE.editingCode, {
                    name: fields.name,
                    price: fields.price,
                    stock: fields.stock,
                    imageUrl: fields.imageUrl,
                    note: fields.note,
                    isActive: fields.isActive,
                });
                const idx = STATE.products.findIndex((x) => x.code === STATE.editingCode);
                if (idx !== -1 && resp.product) STATE.products[idx] = resp.product;
                notify('Đã lưu', 'success');
            } else {
                await window.Web2ProductsApi.create({
                    ...fields,
                    createdBy: user.uid || user.email || null,
                });
                notify(`Đã tạo SP ${fields.code}`, 'success');
                load(); // reload to include new item at top
                closeModal();
                return;
            }
            renderRows();
            closeModal();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function toggleActive(code, newState) {
        try {
            const resp = await window.Web2ProductsApi.update(code, { isActive: newState });
            const idx = STATE.products.findIndex((x) => x.code === code);
            if (idx !== -1 && resp.product) STATE.products[idx] = resp.product;
            renderRows();
            notify(newState ? 'Đã bật bán' : 'Đã tạm dừng', 'success');
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function remove(code) {
        if (!confirm(`Xóa SP ${code}? Không thể hoàn tác.`)) return;
        try {
            await window.Web2ProductsApi.remove(code);
            STATE.products = STATE.products.filter((x) => x.code !== code);
            STATE.total = Math.max(0, STATE.total - 1);
            renderRows();
            renderPagination();
            renderCounters();
            notify(`Đã xóa ${code}`, 'success');
        } catch (e) {
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function copyCode(code) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(() => notify(`Đã copy ${code}`, 'success'));
        }
    }

    function goPage(p) {
        const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
        STATE.page = Math.min(Math.max(1, p), totalPages);
        load();
    }

    // ---------- Init ----------
    function init() {
        if (window.lucide) lucide.createIcons();
        $('#btnApplyFilter')?.addEventListener('click', applyFilters);
        $('#btnClearFilter')?.addEventListener('click', clearFilters);
        $('#btnRefresh')?.addEventListener('click', load);
        $('#btnCreateProduct')?.addEventListener('click', openCreate);
        $('#filterSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
        $('#filterSearchClear')?.addEventListener('click', () => {
            const el = $('#filterSearch');
            if (el) { el.value = ''; STATE.search = ''; STATE.page = 1; load(); }
        });
        $('#filterActive')?.addEventListener('change', applyFilters);
        $('#filterLimit')?.addEventListener('change', applyFilters);

        // Modal
        $('#btnCloseProductModal')?.addEventListener('click', closeModal);
        $('#btnCancelProduct')?.addEventListener('click', closeModal);
        $('#btnSaveProduct')?.addEventListener('click', saveModal);
        modal()?.addEventListener('click', (e) => { if (e.target === modal()) closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal()?.classList.contains('active')) closeModal(); });

        // Image preview on input
        $('#pmImage')?.addEventListener('input', (e) => updateImagePreview(e.target.value.trim()));

        load();
    }

    window.Web2ProductsApp = { openEdit, toggleActive, remove, copyCode, goPage };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
