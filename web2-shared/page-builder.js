// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 generic CRUD page builder — same look as TPOS list views.
 * Each TPOS-clone page calls Web2Page.mount(config) and gets:
 *   - Header (breadcrumb + title + count pill)
 *   - Toolbar (Tải lại / Thêm mới / Xuất Excel buttons matching TPOS palette)
 *   - Filter bar (search + status + limit)
 *   - Table with TPOS classes (.data-table + tpos-theme)
 *   - Pagination
 *   - Create/Edit modal driven by `fields` config
 *
 * Config shape:
 * {
 *   slug: 'productcategory',         // entity slug — also web2 API path
 *   title: 'Nhóm sản phẩm',          // page heading + breadcrumb leaf
 *   breadcrumb: ['App','Sản phẩm'],  // ancestor crumbs
 *   columns: [                       // table columns
 *     { key: 'code',  label: 'Mã',  width: 140, align: 'center' },
 *     { key: 'name',  label: 'Tên', width: null, align: 'left' },
 *     { key: 'data.note', label: 'Ghi chú' },
 *   ],
 *   fields: [                        // modal form fields
 *     { key: 'code', label: 'Mã', type: 'text', required: true, placeholder: 'VD: SP001' },
 *     { key: 'name', label: 'Tên', type: 'text', required: true },
 *     { key: 'data.note', label: 'Ghi chú', type: 'textarea' },
 *   ],
 *   defaults: { isActive: true },
 * }
 */
(function (global) {
    'use strict';

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    // Get nested value: 'data.note' from { data: { note: 'x' } }
    function getPath(obj, path) {
        if (!path) return undefined;
        return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    }
    // Set nested value: 'data.note' = 'x' on { data: {} }
    function setPath(obj, path, value) {
        const parts = path.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
            cur = cur[k];
        }
        cur[parts[parts.length - 1]] = value;
        return obj;
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[${type}]`, msg);
    }

    function fmtTime(ms) {
        if (!ms) return '';
        const d = new Date(Number(ms));
        return (
            [d.getDate(), d.getMonth() + 1, d.getFullYear()]
                .map((n) => String(n).padStart(2, '0'))
                .join('/') +
            ' ' +
            String(d.getHours()).padStart(2, '0') +
            ':' +
            String(d.getMinutes()).padStart(2, '0')
        );
    }

    // -------- Mount --------
    function mount(rootSel, config) {
        const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
        if (!root) throw new Error('page-builder: root not found');
        if (!config?.slug || !config?.title) throw new Error('page-builder: slug + title required');

        const api = Web2Api.forEntity(config.slug);
        const STATE = {
            records: [],
            total: 0,
            page: 1,
            limit: 200,
            search: '',
            activeOnly: false,
            loading: false,
            editingCode: null,
        };

        // Render skeleton
        const breadcrumbHtml = (config.breadcrumb || [])
            .map(
                (c) =>
                    `<span class="web2-breadcrumb-item">${escapeHtml(c)}</span><span class="web2-breadcrumb-sep">/</span>`
            )
            .join('');

        root.innerHTML = `
            <header class="web2-main-header">
                <div class="web2-breadcrumb">
                    ${breadcrumbHtml}
                    <span class="web2-breadcrumb-current">${escapeHtml(config.title)}</span>
                </div>
                <span class="counter-pill" id="w2pCount">— bản ghi</span>
            </header>

            <section class="search-section">
                <div class="filter-row">
                    <div class="search-wrapper">
                        <i data-lucide="search" class="search-icon"></i>
                        <input type="text" class="search-input" id="w2pSearch" placeholder="Tìm theo mã / tên..." autocomplete="off">
                        <button class="search-clear" id="w2pSearchClear"><i data-lucide="x"></i></button>
                    </div>
                    <div class="filter-chip-group">
                        <label class="chip-label chip-label-primary">
                            <i data-lucide="eye"></i> Hiển thị:
                        </label>
                        <div class="chip-select-wrapper">
                            <select id="w2pActiveFilter" class="chip-select chip-select-primary">
                                <option value="all" selected>Tất cả</option>
                                <option value="true">Đang dùng</option>
                            </select>
                            <i data-lucide="chevron-down" class="chip-caret"></i>
                        </div>
                    </div>
                    <div class="filter-chip-group">
                        <label class="chip-label chip-label-muted">
                            <i data-lucide="list"></i> Limit:
                        </label>
                        <div class="chip-select-wrapper">
                            <select id="w2pLimit" class="chip-select chip-select-muted">
                                <option value="100">100 / trang</option>
                                <option value="200" selected>200 / trang</option>
                                <option value="500">500 / trang</option>
                                <option value="1000">1000 / trang</option>
                            </select>
                            <i data-lucide="chevron-down" class="chip-caret"></i>
                        </div>
                    </div>
                </div>
                <div class="search-info">
                    <div class="search-info-left">
                        <span class="search-result-count" id="w2pResultCount">0</span>
                        <span class="search-result-label">bản ghi</span>
                    </div>
                    <div class="search-info-right">
                        <button class="tpos-btn tpos-btn-default tpos-btn-sm" id="w2pReload"><i data-lucide="refresh-cw" style="width:12px;height:12px;"></i> Tải lại</button>
                        <button class="tpos-btn tpos-btn-default tpos-btn-sm" id="w2pApply"><i data-lucide="filter" style="width:12px;height:12px;"></i> Áp dụng</button>
                        <button class="tpos-btn tpos-btn-default tpos-btn-sm" id="w2pClear"><i data-lucide="x" style="width:12px;height:12px;"></i> Xóa lọc</button>
                        <button class="tpos-btn tpos-btn-success tpos-btn-sm" id="w2pAdd"><i data-lucide="plus" style="width:12px;height:12px;"></i> Thêm mới</button>
                    </div>
                </div>
            </section>

            <section class="table-section">
                <div class="table-scroll">
                    <table class="data-table" id="w2pTable">
                        <thead>
                            <tr>
                                <th style="width:30px;"><input type="checkbox" id="w2pCheckAll"></th>
                                <th style="width:90px;">Thao tác</th>
                                ${(config.columns || [])
                                    .map(
                                        (c) =>
                                            `<th style="${c.width ? `width:${c.width}px;` : 'min-width:180px;'}text-align:${c.align || 'left'};">${escapeHtml(c.label)}</th>`
                                    )
                                    .join('')}
                                <th style="width:120px;text-align:center;">Ngày tạo</th>
                                <th style="width:90px;text-align:center;">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody id="w2pTbody">
                            <tr><td colspan="${(config.columns?.length || 0) + 5}" class="loading-row">
                                <div class="spinner"></div>Đang tải...
                            </td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="pagination" id="w2pPagination"></div>
            </section>

            <!-- Modal -->
            <div class="modal-overlay" id="w2pModal">
                <div class="modal-content" style="min-width:520px;max-width:640px;">
                    <div class="modal-header">
                        <h3 id="w2pModalTitle"><i data-lucide="plus"></i><span>Thêm mới</span></h3>
                        <button class="btn-icon-round" id="w2pModalClose"><i data-lucide="x"></i></button>
                    </div>
                    <div class="modal-body" id="w2pModalBody"></div>
                    <div class="modal-footer">
                        <button class="tpos-btn tpos-btn-default tpos-btn-sm" id="w2pModalCancel">Hủy</button>
                        <button class="tpos-btn tpos-btn-primary tpos-btn-sm" id="w2pModalSave"><i data-lucide="save" style="width:12px;height:12px;"></i> Lưu</button>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        // ---- Render ----
        function renderRows() {
            const tb = root.querySelector('#w2pTbody');
            const colCount = (config.columns?.length || 0) + 5;
            if (!STATE.records.length) {
                tb.innerHTML = `<tr><td colspan="${colCount}" class="empty-row">Chưa có dữ liệu — bấm "Thêm mới" ở trên</td></tr>`;
                return;
            }
            tb.innerHTML = STATE.records
                .map((r) => {
                    const cells = (config.columns || [])
                        .map((c) => {
                            const raw =
                                c.key === 'code'
                                    ? r.code
                                    : c.key === 'name'
                                      ? r.name
                                      : getPath(r, c.key);
                            const txt = raw == null ? '—' : String(raw);
                            const align = c.align || 'left';
                            // If column references another entity, render code as a link
                            // that opens that entity's list page (so user can verify / edit)
                            if (c.link && raw) {
                                const folder = String(c.link).replace(/[_]/g, '-');
                                const href = inferRefPageUrl(folder);
                                return `<td style="text-align:${align};${c.mono ? 'font-family:monospace;' : ''}" title="${escapeHtml(txt)}">
                                    <a class="web2-cell-link" href="${escapeHtml(href)}" target="_blank">${escapeHtml(txt)}</a>
                                </td>`;
                            }
                            return `<td style="text-align:${align};${c.mono ? 'font-family:monospace;' : ''}" title="${escapeHtml(txt)}">${escapeHtml(txt)}</td>`;
                        })
                        .join('');
                    const status = r.isActive
                        ? `<span class="tpos-status-text confirmed">Đang dùng</span>`
                        : `<span class="tpos-status-text cancelled">Tạm dừng</span>`;
                    return `
                    <tr data-code="${escapeHtml(r.code || '')}">
                        <td onclick="event.stopPropagation();"><input type="checkbox" class="w2p-row-check" value="${escapeHtml(r.code || '')}"></td>
                        <td>
                            <div class="tpos-row-actions">
                                <button class="tpos-btn tpos-btn-primary tpos-btn-xs" title="Sửa" data-act="edit" data-code="${escapeHtml(r.code || '')}">
                                    <i data-lucide="pencil" style="width:12px;height:12px;"></i>
                                </button>
                                <button class="tpos-btn tpos-btn-danger tpos-btn-xs" title="Xóa" data-act="delete" data-code="${escapeHtml(r.code || '')}">
                                    <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                                </button>
                            </div>
                        </td>
                        ${cells}
                        <td class="tpos-cell-center">${fmtTime(r.createdAt)}</td>
                        <td class="tpos-cell-center">${status}</td>
                    </tr>`;
                })
                .join('');
            if (window.lucide) lucide.createIcons();
            // Wire row buttons
            tb.querySelectorAll('button[data-act]').forEach((b) => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = b.dataset.code;
                    if (b.dataset.act === 'edit') openEdit(code);
                    if (b.dataset.act === 'delete') removeRecord(code);
                });
            });
        }

        function renderPagination() {
            const totalPages = Math.max(1, Math.ceil(STATE.total / STATE.limit));
            const cur = STATE.page;
            const pag = root.querySelector('#w2pPagination');
            const html = [];
            html.push(
                `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} data-go="${cur - 1}">‹</button>`
            );
            const start = Math.max(1, cur - 2);
            const end = Math.min(totalPages, start + 4);
            if (start > 1) {
                html.push(`<button class="page-btn" data-go="1">1</button>`);
                if (start > 2) html.push(`<span class="page-info">…</span>`);
            }
            for (let p = start; p <= end; p++) {
                html.push(
                    `<button class="page-btn ${p === cur ? 'active' : ''}" data-go="${p}">${p}</button>`
                );
            }
            if (end < totalPages) {
                if (end < totalPages - 1) html.push(`<span class="page-info">…</span>`);
                html.push(
                    `<button class="page-btn" data-go="${totalPages}">${totalPages}</button>`
                );
            }
            html.push(
                `<button class="page-btn" ${cur >= totalPages ? 'disabled' : ''} data-go="${cur + 1}">›</button>`
            );
            html.push(
                `<span class="page-info">${STATE.total.toLocaleString('vi-VN')} bản ghi — trang ${cur}/${totalPages}</span>`
            );
            pag.innerHTML = html.join('');
            pag.querySelectorAll('button[data-go]').forEach((b) => {
                b.addEventListener('click', () => goPage(parseInt(b.dataset.go, 10)));
            });
        }

        function renderCounters() {
            const t = STATE.total.toLocaleString('vi-VN');
            root.querySelector('#w2pCount').textContent = `${t} bản ghi`;
            root.querySelector('#w2pResultCount').textContent = t;
        }

        // ---- Data ----
        async function load() {
            if (STATE.loading) return;
            STATE.loading = true;
            const tb = root.querySelector('#w2pTbody');
            const colCount = (config.columns?.length || 0) + 5;
            tb.innerHTML = `<tr><td colspan="${colCount}" class="loading-row"><div class="spinner"></div>Đang tải...</td></tr>`;
            try {
                const resp = await api.list({
                    search: STATE.search || undefined,
                    activeOnly: STATE.activeOnly,
                    page: STATE.page,
                    limit: STATE.limit,
                });
                STATE.records = resp.records || [];
                STATE.total = resp.total || 0;
                renderRows();
                renderPagination();
                renderCounters();
            } catch (e) {
                tb.innerHTML = `<tr><td colspan="${colCount}" class="empty-row" style="color:#f05050;">Lỗi: ${escapeHtml(e.message)}</td></tr>`;
                notify('Lỗi tải dữ liệu: ' + e.message, 'error');
            } finally {
                STATE.loading = false;
            }
        }

        function applyFilters() {
            STATE.search = root.querySelector('#w2pSearch').value.trim();
            STATE.activeOnly = root.querySelector('#w2pActiveFilter').value === 'true';
            STATE.limit = parseInt(root.querySelector('#w2pLimit').value, 10) || 200;
            STATE.page = 1;
            load();
        }
        function clearFilters() {
            root.querySelector('#w2pSearch').value = '';
            root.querySelector('#w2pActiveFilter').value = 'all';
            root.querySelector('#w2pLimit').value = '200';
            STATE.search = '';
            STATE.activeOnly = false;
            STATE.limit = 200;
            STATE.page = 1;
            load();
        }
        function goPage(p) {
            const tot = Math.max(1, Math.ceil(STATE.total / STATE.limit));
            STATE.page = Math.min(Math.max(1, p), tot);
            load();
        }

        // ---- Modal ----
        function openCreate() {
            STATE.editingCode = null;
            root.querySelector('#w2pModalTitle').innerHTML =
                `<i data-lucide="plus"></i><span>Thêm ${escapeHtml(config.title.toLowerCase())}</span>`;
            renderForm({});
            root.querySelector('#w2pModal').classList.add('active');
            if (window.lucide) lucide.createIcons();
            setTimeout(
                () =>
                    root
                        .querySelector(
                            `#w2pField_${(config.fields[0]?.key || '').replace(/\./g, '_')}`
                        )
                        ?.focus(),
                50
            );
        }
        function openEdit(code) {
            const r = STATE.records.find((x) => x.code === code);
            if (!r) return;
            STATE.editingCode = code;
            root.querySelector('#w2pModalTitle').innerHTML =
                `<i data-lucide="pencil"></i><span>Sửa ${escapeHtml(code)}</span>`;
            renderForm(r, /*editing*/ true);
            root.querySelector('#w2pModal').classList.add('active');
            if (window.lucide) lucide.createIcons();
        }
        function closeModal() {
            STATE.editingCode = null;
            root.querySelector('#w2pModal').classList.remove('active');
        }
        function renderForm(record, editing = false) {
            const body = root.querySelector('#w2pModalBody');
            body.innerHTML = (config.fields || [])
                .map((f) => {
                    const id = `w2pField_${f.key.replace(/\./g, '_')}`;
                    const val =
                        f.key === 'code'
                            ? record.code || ''
                            : f.key === 'name'
                              ? record.name || ''
                              : (getPath(record, f.key) ?? '');
                    const disabled = editing && f.key === 'code' ? 'disabled' : '';
                    if (f.type === 'textarea') {
                        return `<div class="field-row">
                        <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                        <textarea id="${id}" placeholder="${escapeHtml(f.placeholder || '')}" ${disabled}>${escapeHtml(val)}</textarea>
                    </div>`;
                    }
                    if (f.type === 'select') {
                        const opts = (f.options || [])
                            .map(
                                (o) =>
                                    `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
                            )
                            .join('');
                        return `<div class="field-row">
                        <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                        <select id="${id}" ${disabled}>${opts}</select>
                    </div>`;
                    }
                    if (f.type === 'checkbox') {
                        return `<div class="field-row">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" id="${id}" ${val ? 'checked' : ''} ${disabled}>
                            ${escapeHtml(f.label)}
                        </label>
                    </div>`;
                    }
                    if (f.type === 'ref') {
                        // Ref autocomplete picker — fetches records from referenced entity
                        const refSlug = f.ref || f.refSlug;
                        if (!refSlug) {
                            console.warn('[page-builder] ref field missing `ref` slug:', f.key);
                        }
                        return `<div class="field-row web2-ref-row" data-ref-slug="${escapeHtml(refSlug || '')}" data-ref-key="${escapeHtml(f.key)}">
                        <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                        <div class="web2-ref-wrapper">
                            <input type="text" id="${id}" class="web2-ref-input" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.placeholder || 'Gõ để tìm...')}" autocomplete="off" ${disabled} data-ref-slug="${escapeHtml(refSlug || '')}">
                            <a class="web2-ref-open" target="_blank" title="Mở danh sách ${escapeHtml(refSlug || '')}" tabindex="-1">
                                <i data-lucide="external-link"></i>
                            </a>
                            <div class="web2-ref-dropdown" id="${id}_dropdown" hidden></div>
                        </div>
                        <span class="web2-ref-hint" id="${id}_hint"></span>
                    </div>`;
                    }
                    return `<div class="field-row">
                    <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                    <input type="${f.type || 'text'}" id="${id}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.placeholder || '')}" autocomplete="off" ${disabled}>
                </div>`;
                })
                .join('');

            // Wire ref pickers (autocomplete + open-link)
            body.querySelectorAll('.web2-ref-row').forEach((row) => {
                const slug = row.dataset.refSlug;
                if (!slug) return;
                const input = row.querySelector('.web2-ref-input');
                const dropdown = row.querySelector('.web2-ref-dropdown');
                const hint = row.querySelector('.web2-ref-hint');
                const openLink = row.querySelector('.web2-ref-open');
                if (openLink) {
                    // Resolve target page via slug → folder mapping is approximate (replace _ → -)
                    // Best-effort: open list of that entity by deriving folder name.
                    const folder = slug.replace(/[_]/g, '-');
                    openLink.href = inferRefPageUrl(folder);
                }
                let timer = null;
                let lastFetched = null;
                const refApi = window.Web2Api?.forEntity ? window.Web2Api.forEntity(slug) : null;

                async function loadName(code) {
                    if (!refApi || !code) {
                        hint.textContent = '';
                        return;
                    }
                    try {
                        const r = await refApi.get(code);
                        if (r?.record?.name) {
                            hint.textContent = `→ ${r.record.name}`;
                            hint.classList.remove('error');
                        } else {
                            hint.textContent = `(không tìm thấy)`;
                            hint.classList.add('error');
                        }
                    } catch {
                        hint.textContent = `(không tìm thấy)`;
                        hint.classList.add('error');
                    }
                }

                async function showDropdown(query) {
                    if (!refApi) return;
                    try {
                        const resp = await refApi.list({ search: query || undefined, limit: 20 });
                        const records = resp.records || [];
                        if (records.length === 0) {
                            dropdown.innerHTML = `<div class="web2-ref-empty">Không có kết quả${query ? ` cho "${escapeHtml(query)}"` : ''}.</div>`;
                        } else {
                            dropdown.innerHTML = records
                                .map((r) =>
                                    `<div class="web2-ref-item" data-code="${escapeHtml(r.code || '')}">
                                        <span class="web2-ref-item-code">${escapeHtml(r.code || '—')}</span>
                                        <span class="web2-ref-item-name">${escapeHtml(r.name || '')}</span>
                                    </div>`
                                )
                                .join('');
                        }
                        dropdown.hidden = false;
                        dropdown.querySelectorAll('.web2-ref-item').forEach((item) => {
                            item.addEventListener('mousedown', (e) => {
                                e.preventDefault();
                                input.value = item.dataset.code;
                                hint.textContent = `→ ${item.querySelector('.web2-ref-item-name')?.textContent || ''}`;
                                hint.classList.remove('error');
                                dropdown.hidden = true;
                            });
                        });
                    } catch (e) {
                        dropdown.innerHTML = `<div class="web2-ref-empty error">Lỗi: ${escapeHtml(e.message)}</div>`;
                        dropdown.hidden = false;
                    }
                }

                input.addEventListener('focus', () => showDropdown(input.value.trim()));
                input.addEventListener('input', () => {
                    clearTimeout(timer);
                    timer = setTimeout(() => showDropdown(input.value.trim()), 220);
                });
                input.addEventListener('blur', () => {
                    setTimeout(() => { dropdown.hidden = true; }, 180);
                    if (input.value.trim() && input.value.trim() !== lastFetched) {
                        lastFetched = input.value.trim();
                        loadName(lastFetched);
                    }
                });
                // Initial hint
                if (input.value.trim()) {
                    lastFetched = input.value.trim();
                    loadName(input.value.trim());
                }
            });
        }

        // Best-effort URL builder for "open list" link from a ref slug.
        // Maps entity slug (e.g. "productcategory") → page folder (e.g. "product-category").
        function inferRefPageUrl(folder) {
            // Caller is currently at /web2/<X>/index.html → sibling is /web2/<folder>/index.html
            const here = window.location.pathname;
            if (/\/web2\/[^/]+\/[^/]*$/.test(here)) {
                return `../${folder}/index.html`;
            }
            return `../web2/${folder}/index.html`;
        }
        async function saveModal() {
            const editing = !!STATE.editingCode;
            const payload = { code: null, name: null, data: {} };
            for (const f of config.fields || []) {
                const el = root.querySelector(`#w2pField_${f.key.replace(/\./g, '_')}`);
                if (!el) continue;
                let v;
                if (f.type === 'checkbox') v = el.checked;
                else v = el.value.trim();
                if (f.required && !v) return notify(`Thiếu "${f.label}"`, 'error');
                if (f.key === 'code') payload.code = v;
                else if (f.key === 'name') payload.name = v;
                else setPath(payload, f.key, v);
            }
            try {
                if (editing) {
                    await api.update(STATE.editingCode, { name: payload.name, data: payload.data });
                    notify('Đã lưu', 'success');
                } else {
                    await api.create(payload);
                    notify(`Đã tạo ${payload.code || payload.name}`, 'success');
                }
                closeModal();
                load();
            } catch (e) {
                notify('Lỗi: ' + e.message, 'error');
            }
        }
        async function removeRecord(code) {
            if (!confirm(`Xóa "${code}"?`)) return;
            try {
                await api.remove(code);
                notify(`Đã xóa ${code}`, 'success');
                load();
            } catch (e) {
                notify('Lỗi xóa: ' + e.message, 'error');
            }
        }

        // ---- Wire events ----
        root.querySelector('#w2pReload').addEventListener('click', load);
        root.querySelector('#w2pApply').addEventListener('click', applyFilters);
        root.querySelector('#w2pClear').addEventListener('click', clearFilters);
        root.querySelector('#w2pAdd').addEventListener('click', openCreate);
        root.querySelector('#w2pSearch').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
        root.querySelector('#w2pSearchClear').addEventListener('click', () => {
            root.querySelector('#w2pSearch').value = '';
            STATE.search = '';
            STATE.page = 1;
            load();
        });
        root.querySelector('#w2pActiveFilter').addEventListener('change', applyFilters);
        root.querySelector('#w2pLimit').addEventListener('change', applyFilters);
        root.querySelector('#w2pCheckAll').addEventListener('change', (e) => {
            root.querySelectorAll('.w2p-row-check').forEach((c) => {
                c.checked = e.target.checked;
            });
        });
        root.querySelector('#w2pModalClose').addEventListener('click', closeModal);
        root.querySelector('#w2pModalCancel').addEventListener('click', closeModal);
        root.querySelector('#w2pModalSave').addEventListener('click', saveModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && root.querySelector('#w2pModal')?.classList.contains('active'))
                closeModal();
        });

        // First load
        load();

        return { reload: load, openCreate, STATE };
    }

    global.Web2Page = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
