// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Quản lý chi tiêu: tab Báo cáo.
// =====================================================================
// Render báo cáo: breakdown theo loại/danh mục, theo tháng, theo nguồn, theo
// quỹ. Dữ liệu từ /api/web2-cashbook/report (server tính). Dùng window.ChiTieu.
// =====================================================================

(function (global) {
    'use strict';

    function CT() {
        return global.ChiTieu;
    }

    async function render() {
        const ct = CT();
        const el = document.getElementById('ctReportBody');
        if (!el) return;
        el.innerHTML = `<div class="ct-empty">Đang tải báo cáo…</div>`;
        let rep;
        try {
            const r = await ct.Api.report({
                start: ct.state.filter.start,
                end: ct.state.filter.end,
                fund: ct.state.filter.fund,
            });
            rep = r.report;
        } catch (e) {
            el.innerHTML = `<div class="ct-empty">Lỗi báo cáo: ${ct.esc(e.message)}</div>`;
            return;
        }
        const fmt = ct.fmtVnd;
        const esc = ct.esc;

        // By category (gom theo loại phiếu)
        const catByType = { receipt: [], payment_cn: [], payment_kd: [] };
        for (const c of rep.byCategory || []) (catByType[c.type] = catByType[c.type] || []).push(c);
        const catBlock = (type, title, cls) => {
            const list = catByType[type] || [];
            const total = list.reduce((s, x) => s + Number(x.total), 0);
            if (!list.length) return '';
            const rows = list
                .map((c) => {
                    const pct = total ? Math.round((Number(c.total) / total) * 100) : 0;
                    return `<div class="ct-rep-row">
                        <span class="ct-rep-name">${esc(c.category || '(không loại)')}</span>
                        <span class="ct-rep-bar"><span class="ct-rep-fill ${cls}" style="width:${pct}%"></span></span>
                        <span class="ct-rep-val">${fmt(c.total)} <em>${pct}%</em></span>
                    </div>`;
                })
                .join('');
            return `<div class="ct-rep-card"><h3 class="${cls}">${title} · ${fmt(total)}</h3>${rows}</div>`;
        };

        // By month
        const monthRows = (rep.byMonth || [])
            .map((m) => {
                const bal = Number(m.receipts) - Number(m.pay_cn) - Number(m.pay_kd);
                return `<tr>
                    <td>${esc(m.month)}</td>
                    <td class="num in">${fmt(m.receipts)}</td>
                    <td class="num out">${fmt(m.pay_cn)}</td>
                    <td class="num out">${fmt(m.pay_kd)}</td>
                    <td class="num ${bal >= 0 ? 'in' : 'out'}">${fmt(bal)}</td>
                </tr>`;
            })
            .join('');

        // By source
        const srcRows = (rep.bySource || [])
            .map(
                (s) => `<tr>
                <td>${esc(s.source)}</td>
                <td class="num in">${fmt(s.receipts)}</td>
                <td class="num out">${fmt(s.payments)}</td>
                <td class="num ${Number(s.receipts) - Number(s.payments) >= 0 ? 'in' : 'out'}">${fmt(Number(s.receipts) - Number(s.payments))}</td>
            </tr>`
            )
            .join('');

        // By fund
        const FUND = ct.FUND_LABELS;
        const fundRows = (rep.byFund || [])
            .map(
                (f) => `<tr>
                <td>${esc(FUND[f.fund_type] || f.fund_type)}</td>
                <td class="num ${Number(f.net) >= 0 ? 'in' : 'out'}">${fmt(f.net)}</td>
            </tr>`
            )
            .join('');

        el.innerHTML = `
          <div class="ct-rep-grid">
            ${catBlock('receipt', 'Thu theo danh mục', 'in')}
            ${catBlock('payment_cn', 'Chi cá nhân theo danh mục', 'out')}
            ${catBlock('payment_kd', 'Chi kinh doanh theo danh mục', 'out')}
          </div>
          <div class="ct-rep-tables">
            <div class="ct-rep-card">
              <h3>Theo tháng</h3>
              <table class="ct-rep-table"><thead><tr><th>Tháng</th><th class="num">Thu</th><th class="num">Chi CN</th><th class="num">Chi KD</th><th class="num">Số dư</th></tr></thead>
              <tbody>${monthRows || '<tr><td colspan="5" class="ct-empty-sm">Không có dữ liệu</td></tr>'}</tbody></table>
            </div>
            <div class="ct-rep-card">
              <h3>Theo nguồn</h3>
              <table class="ct-rep-table"><thead><tr><th>Nguồn</th><th class="num">Thu</th><th class="num">Chi</th><th class="num">Chênh lệch</th></tr></thead>
              <tbody>${srcRows || '<tr><td colspan="4" class="ct-empty-sm">Không có dữ liệu</td></tr>'}</tbody></table>
            </div>
            <div class="ct-rep-card ct-rep-card-sm">
              <h3>Theo quỹ (ròng)</h3>
              <table class="ct-rep-table"><thead><tr><th>Quỹ</th><th class="num">Ròng</th></tr></thead>
              <tbody>${fundRows || '<tr><td colspan="2" class="ct-empty-sm">Không có dữ liệu</td></tr>'}</tbody></table>
            </div>
          </div>`;
    }

    global.ChiTieuReport = { render };
})(window);
