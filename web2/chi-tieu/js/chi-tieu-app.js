// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Quản lý chi tiêu: app core.
// =====================================================================
// Sổ quỹ Web 2.0 — danh sách phiếu + bộ lọc + dải số dư + tạo/sửa/huỷ phiếu +
// quản lý loại + ảnh hoá đơn + lịch sử. Tab Báo cáo ở chi-tieu-report.js.
// State dùng chung qua window.ChiTieu. SSE web2:cashbook. Múi giờ GMT+7.
// =====================================================================

(function (global) {
    'use strict';

    const Api = global.ChiTieuApi;
    const VN_TZ = 'Asia/Ho_Chi_Minh';

    const TYPE_LABELS = {
        receipt: 'Phiếu thu',
        payment_cn: 'Chi cá nhân',
        payment_kd: 'Chi kinh doanh',
    };
    const FUND_LABELS = { cash: 'Tiền mặt', bank: 'Ngân hàng', ewallet: 'Ví điện tử' };

    function toast(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[chi-tieu]', type || 'info', msg);
    }
    async function confirmBox(msg) {
        if (global.Popup?.confirm) return await global.Popup.confirm(msg);
        return global.confirm(msg);
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function fmtVnd(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function fmtDateTime(ts) {
        if (!ts) return '';
        // voucher_time = TIMESTAMPTZ (ISO string); created_at audit = BIGINT epoch
        // (pg trả về dạng chuỗi số "1782202709000") → new Date(chuỗi-số) = Invalid Date.
        // Ép số khi toàn chữ số; guard Invalid Date để không throw "Invalid time value".
        const d = /^\d+$/.test(String(ts)) ? new Date(Number(ts)) : new Date(ts);
        if (isNaN(d.getTime())) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: VN_TZ,
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(d);
    }
    // 'YYYY-MM-DD' theo +7.
    function todayVN() {
        return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(new Date());
    }
    function monthStartVN() {
        return todayVN().slice(0, 8) + '01';
    }
    // datetime-local value (theo +7) cho input.
    function nowLocalInput() {
        const p = new Intl.DateTimeFormat('en-CA', {
            timeZone: VN_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(new Date());
        const g = (t) => p.find((x) => x.type === t).value;
        return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
    }

    const state = {
        filter: {
            start: monthStartVN(),
            end: todayVN(),
            type: '',
            fund: '',
            status: 'paid',
            category: '',
            source: '',
            q: '',
            page: 1,
            limit: 50,
        },
        vouchers: [],
        meta: { total: 0 },
        summary: null,
        categories: { receipt: [], payment_cn: [], payment_kd: [] },
        sources: [],
        tab: 'list',
        loading: false,
    };

    function summaryFilter() {
        return { start: state.filter.start, end: state.filter.end, fund: state.filter.fund };
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    async function loadAll() {
        state.loading = true;
        renderList();
        try {
            const [sum, list, catR, catCn, catKd, src] = await Promise.all([
                Api.summary(summaryFilter()).catch(() => ({ summary: null })),
                Api.listVouchers(state.filter).catch(() => ({ items: [], meta: { total: 0 } })),
                Api.listCategories('receipt').catch(() => ({ items: [] })),
                Api.listCategories('payment_cn').catch(() => ({ items: [] })),
                Api.listCategories('payment_kd').catch(() => ({ items: [] })),
                Api.listSources().catch(() => ({ items: [] })),
            ]);
            state.summary = sum.summary;
            state.vouchers = list.items || [];
            state.meta = list.meta || { total: 0 };
            state.categories = {
                receipt: catR.items || [],
                payment_cn: catCn.items || [],
                payment_kd: catKd.items || [],
            };
            state.sources = src.items || [];
        } catch (e) {
            toast('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
        state.loading = false;
        renderBalance();
        renderList();
        if (state.tab === 'report' && global.ChiTieuReport) global.ChiTieuReport.render();
    }

    // ── Balance strip ─────────────────────────────────────────────────────────
    function renderBalance() {
        const el = document.getElementById('ctBalance');
        if (!el) return;
        const s = state.summary || {
            opening: 0,
            receipts: 0,
            paymentsCN: 0,
            paymentsKD: 0,
            closing: 0,
        };
        el.innerHTML = `
            <div class="ct-stat open"><span class="ct-stat-lbl">Tồn đầu kỳ</span><span class="ct-stat-val">${fmtVnd(s.opening)}</span></div>
            <div class="ct-stat in"><span class="ct-stat-lbl">Tổng thu</span><span class="ct-stat-val">+${fmtVnd(s.receipts)}</span></div>
            <div class="ct-stat out"><span class="ct-stat-lbl">Chi cá nhân</span><span class="ct-stat-val">−${fmtVnd(s.paymentsCN)}</span></div>
            <div class="ct-stat out"><span class="ct-stat-lbl">Chi kinh doanh</span><span class="ct-stat-val">−${fmtVnd(s.paymentsKD)}</span></div>
            <div class="ct-stat close"><span class="ct-stat-lbl">Tồn cuối kỳ</span><span class="ct-stat-val">${fmtVnd(s.closing)}</span></div>`;
    }

    // ── List ──────────────────────────────────────────────────────────────────
    function typeBadge(t) {
        const cls = t === 'receipt' ? 'in' : 'out';
        return `<span class="ct-tbadge ${cls}">${esc(TYPE_LABELS[t] || t)}</span>`;
    }
    function renderList() {
        const el = document.getElementById('ctBody');
        if (!el) return;
        // Skeleton CHỈ lần tải đầu (chưa có phiếu). Re-filter giữ list cũ → không nháy.
        if (state.loading && !state.vouchers.length) {
            if (global.Web2Skeleton) {
                el.innerHTML = `
                  <div class="ct-list-wrap">
                    <table class="ct-table">
                      <thead><tr>
                        <th>Mã</th><th>Thời gian</th><th>Loại</th><th>Quỹ</th><th>Danh mục</th>
                        <th>Đối tượng/NV</th><th class="ct-th-amount">Số tiền</th><th>Ghi chú</th><th></th><th></th>
                      </tr></thead>
                      <tbody></tbody>
                    </table>
                  </div>`;
                global.Web2Skeleton.rows(el.querySelector('tbody'), { rows: 8, cols: 10 });
            } else {
                el.innerHTML = `<div class="ct-empty">Đang tải…</div>`;
            }
            return;
        }
        if (!state.vouchers.length) {
            el.innerHTML = `<div class="ct-empty"><p>Chưa có phiếu nào trong kỳ này.</p>
                <p class="ct-empty-hint">Bấm <b>Phiếu thu</b> hoặc <b>Phiếu chi</b> ở trên để tạo.</p></div>`;
            return;
        }
        let rows = '';
        for (const v of state.vouchers) {
            const isIn = v.type === 'receipt';
            const cancelled = v.status === 'cancelled';
            rows += `<tr class="${cancelled ? 'ct-cancelled' : ''}">
                <td class="ct-code">${esc(v.code)}</td>
                <td class="ct-time">${fmtDateTime(v.voucher_time)}</td>
                <td>${typeBadge(v.type)}</td>
                <td>${esc(FUND_LABELS[v.fund_type] || v.fund_type)}</td>
                <td class="ct-cat">${esc(v.category || '')}</td>
                <td class="ct-person">${esc(v.person_name || v.collector || '')}</td>
                <td class="ct-amount ${isIn ? 'in' : 'out'}">${isIn ? '+' : '−'}${fmtVnd(v.amount)}</td>
                <td class="ct-note" title="${esc(v.note || '')}">${esc((v.note || '').slice(0, 40))}</td>
                <td class="ct-img">${v.image_id ? `<button type="button" class="ct-img-btn" data-w2lb-url="${Api.imageUrl(v.image_id)}" title="Xem ảnh (phóng to)">🧾</button>` : ''}</td>
                <td class="ct-row-act">
                    <button class="ct-mini" data-act="audit" data-id="${v.id}" title="Lịch sử">⟲</button>
                    ${
                        cancelled
                            ? `<span class="ct-cancel-tag">đã huỷ</span>`
                            : `
                    <button class="ct-mini" data-act="edit" data-id="${v.id}" title="Sửa">✎</button>
                    <button class="ct-mini danger" data-act="cancel" data-id="${v.id}" title="Huỷ">⊘</button>`
                    }
                </td>
            </tr>`;
        }
        const total = state.meta.total || 0;
        const pages = Math.max(1, Math.ceil(total / state.filter.limit));
        el.innerHTML = `
          <div class="ct-list-wrap">
            <table class="ct-table">
              <thead><tr>
                <th>Mã</th><th>Thời gian</th><th>Loại</th><th>Quỹ</th><th>Danh mục</th>
                <th>Đối tượng/NV</th><th class="ct-th-amount">Số tiền</th><th>Ghi chú</th><th></th><th></th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="ct-pager">
            <span>${total} phiếu · trang ${state.filter.page}/${pages}</span>
            <div class="ct-pager-btns">
              <button class="ct-btn ct-btn-ghost" id="ctPrev" ${state.filter.page <= 1 ? 'disabled' : ''}>‹ Trước</button>
              <button class="ct-btn ct-btn-ghost" id="ctNext" ${state.filter.page >= pages ? 'disabled' : ''}>Sau ›</button>
            </div>
          </div>`;
        el.querySelectorAll('.ct-mini').forEach((b) => {
            b.addEventListener('click', () => {
                const v = state.vouchers.find((x) => String(x.id) === b.dataset.id);
                if (!v) return;
                if (b.dataset.act === 'edit') openForm(v.type, v);
                else if (b.dataset.act === 'cancel') doCancel(v);
                else if (b.dataset.act === 'audit') openAudit(v);
            });
        });
        document.getElementById('ctPrev')?.addEventListener('click', () => {
            if (state.filter.page > 1) {
                state.filter.page--;
                loadAll();
            }
        });
        document.getElementById('ctNext')?.addEventListener('click', () => {
            state.filter.page++;
            loadAll();
        });
    }

    async function doCancel(v) {
        let reason = '';
        if (global.Popup?.prompt) {
            reason = await global.Popup.prompt('Lý do huỷ phiếu ' + v.code + '?', '');
            if (reason === null) return;
        } else {
            if (!(await confirmBox('Huỷ phiếu ' + v.code + '?'))) return;
        }
        try {
            await Api.cancelVoucher(v.id, reason || '');
            toast('Đã huỷ phiếu ' + v.code, 'success');
            await loadAll();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    // ── Create / Edit form ────────────────────────────────────────────────────
    function catOptions(type, selected) {
        const list = state.categories[type] || [];
        return list
            .map(
                (c) =>
                    `<option value="${esc(c.name)}" ${c.name === selected ? 'selected' : ''}>${esc(c.name)}</option>`
            )
            .join('');
    }
    function srcOptions(selected) {
        return ['<option value="">— Không —</option>']
            .concat(
                state.sources.map(
                    (s) =>
                        `<option value="${esc(s.code)}" ${s.code === selected ? 'selected' : ''}>${esc(s.name)} (${esc(s.code)})</option>`
                )
            )
            .join('');
    }

    function openForm(type, v) {
        const isEdit = !!v;
        const t = isEdit ? v.type : type;
        const isReceipt = t === 'receipt';
        const mount = document.getElementById('ctModalMount');
        const vTime =
            isEdit && v.voucher_time
                ? (() => {
                      const p = new Intl.DateTimeFormat('en-CA', {
                          timeZone: VN_TZ,
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                      }).formatToParts(new Date(v.voucher_time));
                      const g = (k) => p.find((x) => x.type === k).value;
                      return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
                  })()
                : nowLocalInput();
        mount.innerHTML = `
          <div class="ct-modal-backdrop" id="ctFormBackdrop">
            <div class="ct-modal">
              <div class="ct-modal-head">
                <div>${isEdit ? 'Sửa' : 'Tạo'} ${esc(TYPE_LABELS[t])} ${isEdit ? '· ' + esc(v.code) : ''}</div>
                <button class="ct-x" id="ctFormClose">✕</button>
              </div>
              <div class="ct-modal-body">
                <div class="ct-form-grid">
                  <label class="ct-fl">Quỹ
                    <select id="ctfFund">
                      <option value="cash" ${!isEdit || v.fund_type === 'cash' ? 'selected' : ''}>Tiền mặt</option>
                      <option value="bank" ${isEdit && v.fund_type === 'bank' ? 'selected' : ''}>Ngân hàng</option>
                      <option value="ewallet" ${isEdit && v.fund_type === 'ewallet' ? 'selected' : ''}>Ví điện tử</option>
                    </select>
                  </label>
                  <label class="ct-fl">Thời gian
                    <input type="datetime-local" id="ctfTime" value="${vTime}">
                  </label>
                  <label class="ct-fl">Số tiền
                    <input type="text" inputmode="numeric" data-w2num id="ctfAmount" value="${isEdit ? v.amount : ''}" placeholder="0">
                  </label>
                  <label class="ct-fl">Danh mục
                    <div class="ct-cat-pick">
                      <select id="ctfCategory">${catOptions(t, isEdit ? v.category : '')}</select>
                      <button type="button" class="ct-btn ct-btn-ghost ct-mini-btn" id="ctfCatManage" title="Quản lý danh mục">⚙</button>
                    </div>
                  </label>
                  ${
                      isReceipt || t === 'payment_kd'
                          ? `<label class="ct-fl">Nguồn
                              <select id="ctfSource">${srcOptions(isEdit ? v.source_code : '')}</select>
                            </label>`
                          : ''
                  }
                  <label class="ct-fl">Đối tượng
                    <input id="ctfPerson" value="${isEdit ? esc(v.person_name || '') : ''}" placeholder="Tên KH/NCC/NV">
                  </label>
                  <label class="ct-fl">Nhân viên xử lý
                    <input id="ctfCollector" value="${isEdit ? esc(v.collector || '') : ''}" placeholder="Người thực hiện">
                  </label>
                </div>
                <label class="ct-fl ct-fl-full">Ghi chú
                  <textarea id="ctfNote" rows="2" placeholder="Diễn giải…">${isEdit ? esc(v.note || '') : ''}</textarea>
                </label>
                <label class="ct-fl ct-fl-full">Ảnh hoá đơn
                  <div id="ctfImageArea"></div>
                </label>
              </div>
              <div class="ct-modal-foot">
                <button class="ct-btn ct-btn-ghost" id="ctFormCancel">Huỷ</button>
                <button class="ct-btn ct-btn-primary" id="ctFormSave">${isEdit ? 'Lưu' : 'Tạo phiếu'}</button>
              </div>
            </div>
          </div>`;
        // Format số tiền ngay khi gõ (1.000) — gắn ngay để value edit prefilled hiển thị đúng.
        if (window.Web2NumberInput) Web2NumberInput.attachAll(mount);
        const close = () => (mount.innerHTML = '');
        document.getElementById('ctFormClose').onclick = close;
        document.getElementById('ctFormCancel').onclick = close;
        document.getElementById('ctFormBackdrop').onclick = (e) => {
            if (e.target.id === 'ctFormBackdrop') close();
        };
        document.getElementById('ctfCatManage').onclick = () => openCatManage(t);

        // Ô nhập ảnh hoá đơn dùng chung (paste/kéo-thả/chọn + nén) — 1 nguồn.
        let imgCtrl = null;
        if (global.Web2ImagePaste) {
            imgCtrl = global.Web2ImagePaste.mount('#ctfImageArea', {
                multiple: false,
                maxWidth: 1600,
                maxHeight: 1600,
                quality: 0.7,
                compact: true,
                label: 'Dán / kéo-thả / chọn ảnh hoá đơn',
                hint: 'Ctrl+V để dán ảnh chụp màn hình — tự nén còn ~1600px.',
                initial: isEdit && v.image_id ? [Api.imageUrl(v.image_id)] : [],
            });
        }

        document.getElementById('ctFormSave').onclick = async () => {
            const amtEl = document.getElementById('ctfAmount');
            const amount = Math.round(
                (window.Web2NumberInput ? Web2NumberInput.getValue(amtEl) : Number(amtEl.value)) ||
                    0
            );
            if (amount <= 0) return toast('Nhập số tiền > 0', 'warning');
            const fund = document.getElementById('ctfFund').value;
            const timeVal = document.getElementById('ctfTime').value;
            const voucherTime = timeVal
                ? new Date(timeVal + ':00+07:00').toISOString()
                : new Date().toISOString();
            const srcEl = document.getElementById('ctfSource');
            const body = {
                type: t,
                fundType: fund,
                amount,
                voucherTime,
                category: document.getElementById('ctfCategory').value || null,
                sourceCode: srcEl ? srcEl.value : null,
                personName: document.getElementById('ctfPerson').value.trim(),
                collector: document.getElementById('ctfCollector').value.trim(),
                note: document.getElementById('ctfNote').value.trim(),
            };
            const saveBtn = document.getElementById('ctFormSave');
            saveBtn.disabled = true;
            saveBtn.textContent = '…';
            try {
                // Ảnh mới (item chưa 'existing') → dataUrl đã nén sẵn bởi Web2ImagePaste.
                if (imgCtrl) {
                    const newImg = imgCtrl.getItems().find((it) => !it.existing);
                    if (newImg) body.imageDataUrl = newImg.dataUrl;
                }
                if (isEdit) await Api.updateVoucher(v.id, body);
                else await Api.createVoucher(body);
                toast(isEdit ? 'Đã lưu phiếu.' : 'Đã tạo phiếu.', 'success');
                close();
                await loadAll();
            } catch (e) {
                toast(e.message, 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = isEdit ? 'Lưu' : 'Tạo phiếu';
            }
        };
    }

    // (Nén ảnh đã chuyển sang module dùng chung Web2ImagePaste — xem mount ở openForm.)

    // ── Category management modal ─────────────────────────────────────────────
    function openCatManage(type) {
        const mount = document.getElementById('ctModalMount2');
        const render = () => {
            const list = state.categories[type] || [];
            mount.innerHTML = `
              <div class="ct-modal-backdrop" id="ctCatBackdrop">
                <div class="ct-modal ct-modal-sm">
                  <div class="ct-modal-head"><div>Danh mục · ${esc(TYPE_LABELS[type])}</div><button class="ct-x" id="ctCatClose">✕</button></div>
                  <div class="ct-modal-body">
                    <div class="ct-cat-add">
                      <input id="ctNewCat" placeholder="Tên danh mục mới">
                      <button class="ct-btn ct-btn-primary" id="ctAddCat">Thêm</button>
                    </div>
                    <div class="ct-cat-list">
                      ${list.map((c) => `<div class="ct-cat-row"><span>${esc(c.name)}</span><button class="ct-mini danger" data-id="${c.id}">✕</button></div>`).join('') || '<div class="ct-empty-sm">Chưa có danh mục.</div>'}
                    </div>
                  </div>
                </div>
              </div>`;
            const close = () => (mount.innerHTML = '');
            document.getElementById('ctCatClose').onclick = close;
            document.getElementById('ctCatBackdrop').onclick = (e) => {
                if (e.target.id === 'ctCatBackdrop') close();
            };
            document.getElementById('ctAddCat').onclick = async () => {
                const name = document.getElementById('ctNewCat').value.trim();
                if (!name) return;
                try {
                    await Api.addCategory(type, name);
                    const r = await Api.listCategories(type);
                    state.categories[type] = r.items || [];
                    render();
                    syncFormCatSelect(type);
                } catch (e) {
                    toast(e.message, 'error');
                }
            };
            mount.querySelectorAll('.ct-cat-row .ct-mini').forEach((b) => {
                b.onclick = async () => {
                    try {
                        await Api.delCategory(b.dataset.id);
                        const r = await Api.listCategories(type);
                        state.categories[type] = r.items || [];
                        render();
                        syncFormCatSelect(type);
                    } catch (e) {
                        toast(e.message, 'error');
                    }
                };
            });
        };
        render();
    }
    function syncFormCatSelect(type) {
        const sel = document.getElementById('ctfCategory');
        if (sel) sel.innerHTML = catOptions(type, sel.value);
    }

    // ── Audit popup ───────────────────────────────────────────────────────────
    async function openAudit(v) {
        const mount = document.getElementById('ctModalMount2');
        mount.innerHTML = `<div class="ct-modal-backdrop" id="ctAuditBackdrop"><div class="ct-modal ct-modal-sm">
            <div class="ct-modal-head"><div>Lịch sử · ${esc(v.code)}</div><button class="ct-x" id="ctAuditClose">✕</button></div>
            <div class="ct-modal-body" id="ctAuditBody">Đang tải…</div></div></div>`;
        const close = () => (mount.innerHTML = '');
        document.getElementById('ctAuditClose').onclick = close;
        document.getElementById('ctAuditBackdrop').onclick = (e) => {
            if (e.target.id === 'ctAuditBackdrop') close();
        };
        try {
            const r = await Api.voucherAudit(v.id);
            const items = r.items || [];
            const labels = { create: 'Tạo', update: 'Sửa', cancel: 'Huỷ', delete: 'Xoá' };
            document.getElementById('ctAuditBody').innerHTML = items.length
                ? items
                      .map(
                          (a) => `<div class="ct-audit-row">
                            <span class="ct-audit-act ${a.action}">${labels[a.action] || a.action}</span>
                            <span class="ct-audit-who">${esc(a.user_name || a.username || '?')}</span>
                            <span class="ct-audit-time">${fmtDateTime(a.created_at)}</span>
                          </div>`
                      )
                      .join('')
                : '<div class="ct-empty-sm">Chưa có lịch sử.</div>';
        } catch (e) {
            document.getElementById('ctAuditBody').innerHTML =
                '<div class="ct-empty-sm">Lỗi: ' + esc(e.message) + '</div>';
        }
    }

    // ── Filters ───────────────────────────────────────────────────────────────
    function bindFilters() {
        const set = (k, v) => {
            state.filter[k] = v;
            state.filter.page = 1;
        };
        document.getElementById('ctFStart')?.addEventListener('change', (e) => {
            set('start', e.target.value);
            loadAll();
        });
        document.getElementById('ctFEnd')?.addEventListener('change', (e) => {
            set('end', e.target.value);
            loadAll();
        });
        document.getElementById('ctFType')?.addEventListener('change', (e) => {
            set('type', e.target.value);
            loadAll();
        });
        document.getElementById('ctFFund')?.addEventListener('change', (e) => {
            set('fund', e.target.value);
            loadAll();
        });
        document.getElementById('ctFStatus')?.addEventListener('change', (e) => {
            set('status', e.target.value);
            loadAll();
        });
        let t = null;
        document.getElementById('ctFSearch')?.addEventListener('input', (e) => {
            clearTimeout(t);
            t = setTimeout(() => {
                set('q', e.target.value.trim());
                loadAll();
            }, 400);
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        if (global.Web2Sidebar?.mount)
            global.Web2Sidebar.mount('#web2Aside', { activeUrl: global.location.href });

        // Admin guard — server cũng chặn (requireWeb2Admin); hiện thông báo gọn cho NV.
        const stored = global.Web2Auth?.getStored?.();
        if (stored?.user && String(stored.user.role || '').toLowerCase() !== 'admin') {
            const body = document.getElementById('ctBody');
            if (body)
                body.innerHTML = `<div class="ct-empty"><p>Trang <b>Quản lý chi tiêu</b> chỉ dành cho <b>Quản trị viên</b>.</p></div>`;
            document.querySelector('.ct-tabs')?.style.setProperty('display', 'none');
            document.querySelector('.ct-filters')?.style.setProperty('display', 'none');
            document.querySelector('.ct-head-actions')?.style.setProperty('display', 'none');
            document.querySelector('.ct-balance')?.style.setProperty('display', 'none');
            if (global.lucide) global.lucide.createIcons();
            return;
        }

        document
            .getElementById('ctNewReceipt')
            ?.addEventListener('click', () => openForm('receipt'));
        document.getElementById('ctNewCn')?.addEventListener('click', () => openForm('payment_cn'));
        document.getElementById('ctNewKd')?.addEventListener('click', () => openForm('payment_kd'));
        document.getElementById('ctReload')?.addEventListener('click', loadAll);

        // init filter inputs
        const fs = document.getElementById('ctFStart');
        const fe = document.getElementById('ctFEnd');
        if (fs) fs.value = state.filter.start;
        if (fe) fe.value = state.filter.end;
        bindFilters();

        document.querySelectorAll('.ct-tab').forEach((b) => {
            b.addEventListener('click', () => {
                state.tab = b.dataset.tab;
                document
                    .querySelectorAll('.ct-tab')
                    .forEach((x) => x.classList.toggle('active', x === b));
                document.getElementById('ctBody').style.display =
                    state.tab === 'list' ? '' : 'none';
                document.getElementById('ctReportBody').style.display =
                    state.tab === 'report' ? '' : 'none';
                if (state.tab === 'report' && global.ChiTieuReport) global.ChiTieuReport.render();
            });
        });

        if (global.lucide) global.lucide.createIcons();
        loadAll();
        if (global.Web2SSE?.subscribeReload) {
            global.Web2SSE.subscribeReload('web2:cashbook', loadAll, { debounce: 600 });
        } else if (global.Web2SSE?.subscribe) {
            let t = null;
            global.Web2SSE.subscribe('web2:cashbook', () => {
                clearTimeout(t);
                t = setTimeout(loadAll, 600);
            });
        }
    }

    global.ChiTieu = {
        state,
        Api,
        esc,
        fmtVnd,
        fmtDateTime,
        toast,
        loadAll,
        TYPE_LABELS,
        FUND_LABELS,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
