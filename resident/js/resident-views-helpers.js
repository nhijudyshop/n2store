// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Helpers + UI building blocks dùng chung cho mọi view.
 * Expose qua window.RHelpers.
 */
(function () {
    const fmt = (n) =>
        typeof n === 'number' ? n.toLocaleString('vi-VN') : n == null ? '—' : String(n);
    const money = (n) => (typeof n === 'number' ? n.toLocaleString('vi-VN') + 'đ' : '—');
    const esc = (s) =>
        String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );

    function kpi(label, value, sub, cls = '') {
        return `<div class="kpi ${cls}"><h4 class="kpi-label">${esc(label)}</h4><div class="kpi-value">${value}</div>${sub ? '<div class="kpi-sub">' + sub + '</div>' : ''}</div>`;
    }

    function tagFromStatus(s) {
        if (!s) return '';
        const v = (s.variant || '').toLowerCase();
        const cls =
            v.includes('primary') || v.includes('success')
                ? 't-success'
                : v.includes('warn')
                  ? 't-warn'
                  : v.includes('info')
                    ? 't-info'
                    : v.includes('danger')
                      ? 't-danger'
                      : 't-muted';
        return `<span class="tag ${cls}">${esc(s.title || s.name || '')}</span>`;
    }

    /**
     * Filter bar — Khu vực / Tòa nhà / Phòng / Khoảng thời gian
     * options: {location:true, apartment:true, room:true, daterange:true, extras:[]}
     */
    async function filterBar(opts = {}) {
        const parts = [];
        if (opts.location) {
            const locs = await RData.locationsSelect();
            const items = locs?.items || [];
            parts.push(
                `<div class="filter"><label>Chọn khu vực</label><select data-filter="location"><option value="">Tất cả khu vực</option>${items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></div>`
            );
        }
        if (opts.apartment) {
            const aps = await RData.apartmentsAll();
            const items = aps?.items || [];
            parts.push(
                `<div class="filter"><label>Chọn tòa nhà</label><select data-filter="apartment"><option value="">Tất cả tòa</option>${items.map((i) => `<option value="${esc(i.id)}">${esc(i.code)} - ${esc(i.name)}</option>`).join('')}</select></div>`
            );
        }
        if (opts.room) {
            parts.push(
                `<div class="filter"><label>Chọn phòng</label><select data-filter="room"><option value="">Tất cả phòng</option></select></div>`
            );
        }
        if (opts.daterange) {
            const today = new Date().toISOString().slice(0, 10);
            const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
            parts.push(
                `<div class="filter"><label>Từ ngày</label><input type="date" data-filter="from" value="${monthAgo}"></div>`
            );
            parts.push(
                `<div class="filter"><label>Đến ngày</label><input type="date" data-filter="to" value="${today}"></div>`
            );
        }
        if (opts.search) {
            parts.push(
                `<div class="filter"><label>Tìm kiếm</label><input type="text" data-filter="q" placeholder="${esc(opts.search === true ? 'Tìm...' : opts.search)}"></div>`
            );
        }
        if (opts.extras) {
            for (const e of opts.extras) {
                parts.push(
                    `<div class="filter"><label>${esc(e.label)}</label><select data-filter="${esc(e.key)}">${(e.options || []).map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>`
                );
            }
        }
        parts.push(
            `<div class="filter-actions"><button class="btn">Lọc</button><button class="btn">Xuất Excel</button></div>`
        );
        return `<div class="filter-bar">${parts.join('')}</div>`;
    }

    /** Tabs (status) */
    function statusTabs(tabs, activeKey) {
        return `<div class="status-tabs">${tabs
            .map(
                (t) =>
                    `<button class="status-tab ${t.key === activeKey ? 'active' : ''}" data-tab="${esc(t.key)}">${esc(t.label)}${t.count != null ? `<span class="count">${fmt(t.count)}</span>` : ''}</button>`
            )
            .join('')}</div>`;
    }

    /** Action column trigger */
    function actionCell() {
        return `<button class="action-trigger" data-action-trigger>⋮</button>`;
    }

    /** Table view với toolbar + Thao tác column */
    function tableView(opts) {
        const { columns, items, total, toolbar = '', emptyMessage = 'Chưa có dữ liệu' } = opts;
        const cols = [
            ...columns,
            { key: '_action', label: 'Thao tác', render: () => actionCell(), width: 60 },
        ];
        if (!items?.length) {
            return `<div class="table-wrap"><div class="empty"><div class="ico">📭</div>${esc(emptyMessage)}</div></div>`;
        }
        const head = cols
            .map((c) => `<th${c.width ? ` style="width:${c.width}px"` : ''}>${esc(c.label)}</th>`)
            .join('');
        const rows = items
            .map(
                (it) =>
                    '<tr>' +
                    cols
                        .map((c) => '<td>' + (c.render ? c.render(it) : esc(it[c.key])) + '</td>')
                        .join('') +
                    '</tr>'
            )
            .join('');
        return `<div class="table-wrap">
      <div class="table-toolbar">
        <div class="total">Hiển thị ${items.length} / ${fmt(total ?? items.length)}</div>
        <div class="right">${toolbar}<button class="btn">Cột hiển thị</button><button class="btn">Xuất Excel</button><button class="btn primary">+ Thêm</button></div>
      </div>
      <table class="t"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    </div>`;
    }

    /** Page-level "actions" trên header (refresh, columns, ...) */
    function pageActions() {
        return `
      <button class="btn btn-icon" title="Làm mới">↻</button>
      <button class="btn btn-icon" title="Cột">⊞</button>
      <button class="btn btn-icon" title="Bộ lọc">▼</button>
      <button class="btn primary">+ Thêm mới</button>`;
    }

    window.RHelpers = {
        fmt,
        money,
        esc,
        kpi,
        tagFromStatus,
        filterBar,
        statusTabs,
        tableView,
        pageActions,
        actionCell,
    };
})();
