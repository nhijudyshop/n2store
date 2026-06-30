// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Sổ quảng cáo NHẬP TAY: gắn bài/đợt live + tiền QC + số đơn → tổng hợp ngày/tuần/tháng.
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    let _pages = [];
    let _entries = [];
    let _period = 'day'; // day | week | month
    let _filterMonth = ''; // 'YYYY-MM' hoặc '' = tất cả
    let _el = null;

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    function notify(msg, t) {
        if (window.notificationManager) window.notificationManager[t || 'info'](msg);
    }
    function n(v) {
        return Number(String(v == null ? 0 : v).replace(/[^\d.-]/g, '')) || 0;
    }
    function money(v) {
        return (Math.round(n(v)) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function pageName(id) {
        const p = _pages.find((x) => x.id === id);
        return p ? p.name : id || '—';
    }
    function isoWeek(d) {
        const dt = new Date(d + 'T00:00:00');
        const day = (dt.getDay() + 6) % 7;
        dt.setDate(dt.getDate() - day + 3);
        const firstThu = new Date(dt.getFullYear(), 0, 4);
        const week =
            1 + Math.round(((dt - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
        return `${dt.getFullYear()}-Tuần ${week}`;
    }
    function periodKey(date) {
        if (!date) return '?';
        const d = String(date).slice(0, 10);
        if (_period === 'month') return d.slice(0, 7);
        if (_period === 'week') return isoWeek(d);
        return d;
    }
    function fmtDay(d) {
        if (!d) return '';
        const s = String(d).slice(0, 10).split('-');
        return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : d;
    }

    function filtered() {
        if (!_filterMonth) return _entries;
        return _entries.filter((e) => String(e.entry_date || '').slice(0, 7) === _filterMonth);
    }
    function agg(list) {
        const spend = list.reduce((s, e) => s + n(e.ad_spend), 0);
        const orders = list.reduce((s, e) => s + n(e.orders), 0);
        const revenue = list.reduce((s, e) => s + n(e.revenue), 0);
        return {
            spend,
            orders,
            revenue,
            cpo: orders ? spend / orders : 0,
            roas: spend ? revenue / spend : 0,
        };
    }

    function card(label, value, color) {
        return `<div class="fbp-card" style="margin:0;text-align:center;padding:14px">
            <div style="font-size:1.4rem;font-weight:800;color:${color || 'var(--web2-primary,#0068ff)'}">${value}</div>
            <div style="font-size:.8rem;color:#6b7a8d;font-weight:700;margin-top:2px">${label}</div></div>`;
    }

    function render() {
        const list = filtered();
        const t = agg(list);
        // group theo kỳ
        const groups = new Map();
        list.forEach((e) => {
            const k = periodKey(e.entry_date);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(e);
        });
        const groupHtml = [...groups.entries()]
            .map(([k, items]) => {
                const g = agg(items);
                return `<div class="fbp-card">
                    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid #eef2f7;padding-bottom:8px;margin-bottom:8px">
                        <b style="color:var(--web2-primary,#0068ff)">${_period === 'day' ? fmtDay(k) : esc(k)}</b>
                        <span style="font-size:.82rem;color:#5a6b80">Chi: <b>${money(g.spend)}</b> · Đơn: <b>${g.orders}</b> · CP/đơn: <b>${money(g.cpo)}</b>${g.revenue ? ` · DT: <b>${money(g.revenue)}</b> · ROAS <b>${g.roas.toFixed(1)}x</b>` : ''}</span>
                    </div>
                    ${items.map(rowHtml).join('')}
                </div>`;
            })
            .join('');

        _el.innerHTML = `
            <div class="fbp-card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <button class="fbp-btn" id="fbmAdd" type="button"><i data-lucide="plus"></i> Thêm bản ghi</button>
                <div class="fbp-styles" id="fbmPeriod" style="margin:0">
                    ${[
                        ['day', 'Theo ngày'],
                        ['week', 'Theo tuần'],
                        ['month', 'Theo tháng'],
                    ]
                        .map(
                            ([k, l]) =>
                                `<button type="button" class="fbp-style ${k === _period ? 'on' : ''}" data-p="${k}">${l}</button>`
                        )
                        .join('')}
                </div>
                <input type="month" class="fbp-input" id="fbmMonth" style="max-width:170px" value="${esc(_filterMonth)}" />
                ${_filterMonth ? '<button class="fbp-btn ghost sm" id="fbmAll" type="button">Tất cả</button>' : ''}
            </div></div>
            <div class="fbp-card"><h3><i data-lucide="sigma"></i> Tổng hợp ${_filterMonth ? 'tháng ' + _filterMonth : '(tất cả)'}</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
                    ${card('Tổng chi QC', money(t.spend), '#e74c3c')}
                    ${card('Tổng đơn', t.orders.toLocaleString('vi-VN'))}
                    ${card('Chi phí/đơn', money(t.cpo), '#c87f0a')}
                    ${card('Doanh thu', money(t.revenue), '#1f9d55')}
                    ${card('ROAS', t.roas ? t.roas.toFixed(1) + 'x' : '—', '#1f9d55')}
                </div>
                <div style="font-size:.75rem;color:#94a3b8;margin-top:8px">CP/đơn = chi QC ÷ đơn · ROAS = doanh thu ÷ chi QC (số nhập tay).</div>
            </div>
            ${groupHtml || '<div class="fbp-empty"><div class="empty-state-icon">📒</div>Chưa có bản ghi. Bấm "Thêm bản ghi" để nhập tiền QC + số đơn cho 1 bài/đợt live.</div>'}
        `;
        wire();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function rowHtml(e) {
        const cpo = n(e.orders) ? n(e.ad_spend) / n(e.orders) : 0;
        return `<div class="fbp-post">
            ${e.post_picture ? `<img class="fbp-post-thumb" src="${esc(e.post_picture)}" loading="lazy" alt="" />` : ''}
            <div class="fbp-post-body">
                <p class="fbp-post-msg">${esc(e.post_message) || '<i>(không gắn bài)</i>'}${e.note ? ` — <span style="color:#94a3b8">${esc(e.note)}</span>` : ''}</p>
                <div class="fbp-post-meta">
                    <span>${fmtDay(e.entry_date)}</span><span>📄 ${esc(pageName(e.page_id))}</span>
                    <span>💰 <b>${money(e.ad_spend)}</b></span><span>🛒 <b>${n(e.orders)}</b> đơn</span>
                    <span>CP/đơn <b>${money(cpo)}</b></span>
                    ${n(e.revenue) ? `<span>DT <b>${money(e.revenue)}</b></span>` : ''}
                    ${n(e.messages) ? `<span>💬 ${n(e.messages)}</span>` : ''}
                </div>
            </div>
            <div class="fbp-post-actions">
                <button class="fbp-btn ghost sm" data-edit="${e.id}" type="button"><i data-lucide="pencil"></i></button>
                <button class="fbp-btn danger sm" data-del="${e.id}" type="button"><i data-lucide="trash-2"></i></button>
            </div>
        </div>`;
    }

    function wire() {
        document.getElementById('fbmAdd').onclick = () => openModal();
        document.querySelectorAll('#fbmPeriod [data-p]').forEach((b) =>
            b.addEventListener('click', () => {
                _period = b.dataset.p;
                render();
            })
        );
        const m = document.getElementById('fbmMonth');
        if (m) m.addEventListener('change', () => ((_filterMonth = m.value), render()));
        const all = document.getElementById('fbmAll');
        if (all) all.onclick = () => ((_filterMonth = ''), render());
        _el.querySelectorAll('[data-edit]').forEach((b) =>
            b.addEventListener('click', () => {
                const e = _entries.find((x) => String(x.id) === b.dataset.edit);
                if (e) openModal(e);
            })
        );
        _el.querySelectorAll('[data-del]').forEach((b) =>
            b.addEventListener('click', () => del(b.dataset.del))
        );
    }

    async function del(id) {
        const ok =
            window.Popup && window.Popup.confirm
                ? await window.Popup.confirm('Xoá bản ghi quảng cáo này?')
                : confirm('Xoá?');
        if (!ok) return;
        const r = await Api().deleteAdEntry(id);
        if (r.success) {
            notify('Đã xoá', 'success');
            load();
        } else notify(r.error || 'Lỗi', 'error');
    }

    // ── Modal thêm/sửa ──────────────────────────────────────────────────────
    function openModal(entry) {
        const e = entry || {};
        let chosen = e.post_id
            ? {
                  id: e.post_id,
                  message: e.post_message,
                  picture: e.post_picture,
                  permalink: e.post_permalink,
                  type: e.post_type,
              }
            : null;
        const today = new Date().toISOString().slice(0, 10);
        const ov = document.createElement('div');
        ov.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
        ov.innerHTML = `<div class="fbp-card" style="max-width:560px;width:100%;margin:auto">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <strong style="flex:1;font-size:1.05rem">${e.id ? 'Sửa' : 'Thêm'} bản ghi quảng cáo</strong>
                <button class="fbp-btn ghost sm" id="fbmClose" type="button">Đóng</button>
            </div>
            <div class="fbp-field" style="margin-bottom:10px"><label>Page</label>
                <select class="fbp-input" id="fbmPage">${_pages.map((p) => `<option value="${esc(p.id)}" ${p.id === e.page_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
            <div class="fbp-field" style="margin-bottom:10px"><label>Bài / đợt live (tuỳ chọn)</label>
                <div id="fbmPostBox" style="display:flex;gap:8px;align-items:center">
                    <div id="fbmPostInfo" style="flex:1;font-size:.85rem;color:#5a6b80">${chosen ? esc((chosen.message || '(bài đã chọn)').slice(0, 50)) : '<i>chưa gắn bài</i>'}</div>
                    <button class="fbp-btn ghost sm" id="fbmPick" type="button"><i data-lucide="image"></i> Chọn bài</button>
                </div>
            </div>
            <div class="fbp-fields" style="grid-template-columns:1fr 1fr">
                <div class="fbp-field"><label>Ngày *</label><input type="date" class="fbp-input" id="fbmDate" value="${esc(e.entry_date ? String(e.entry_date).slice(0, 10) : today)}" /></div>
                <div class="fbp-field"><label>Tiền quảng cáo (đ)</label><input class="fbp-input" id="fbmSpend" inputmode="numeric" value="${e.ad_spend != null ? n(e.ad_spend) : ''}" placeholder="VD: 500000" /></div>
                <div class="fbp-field"><label>Số đơn</label><input class="fbp-input" id="fbmOrders" inputmode="numeric" value="${e.orders != null ? n(e.orders) : ''}" placeholder="VD: 25" /></div>
                <div class="fbp-field"><label>Doanh thu (đ)</label><input class="fbp-input" id="fbmRevenue" inputmode="numeric" value="${e.revenue != null && n(e.revenue) ? n(e.revenue) : ''}" placeholder="tuỳ chọn" /></div>
                <div class="fbp-field"><label>Tiếp cận/Reach</label><input class="fbp-input" id="fbmReach" inputmode="numeric" value="${e.reach != null && n(e.reach) ? n(e.reach) : ''}" placeholder="tuỳ chọn" /></div>
                <div class="fbp-field"><label>Tin nhắn</label><input class="fbp-input" id="fbmMsg" inputmode="numeric" value="${e.messages != null && n(e.messages) ? n(e.messages) : ''}" placeholder="tuỳ chọn" /></div>
            </div>
            <div class="fbp-field" style="margin-top:6px"><label>Ghi chú</label><input class="fbp-input" id="fbmNote" value="${esc(e.note || '')}" placeholder="VD: Live tối T7, ngân sách 500k" /></div>
            <div style="display:flex;gap:10px;margin-top:14px">
                <button class="fbp-btn" id="fbmSave" type="button"><i data-lucide="save"></i> Lưu</button>
            </div>
        </div>`;
        document.body.appendChild(ov);
        if (window.lucide?.createIcons) window.lucide.createIcons();
        const close = () => ov.remove();
        ov.querySelector('#fbmClose').onclick = close;
        ov.addEventListener('click', (ev) => {
            if (ev.target === ov) close();
        });
        ov.querySelector('#fbmPick').onclick = () =>
            pickPost(ov.querySelector('#fbmPage').value, (p) => {
                chosen = p;
                ov.querySelector('#fbmPostInfo').innerHTML = esc(
                    (p.message || '(bài đã chọn)').slice(0, 50)
                );
            });
        ov.querySelector('#fbmSave').onclick = async () => {
            const payload = {
                id: e.id || undefined,
                pageId: ov.querySelector('#fbmPage').value,
                post: chosen || {},
                entryDate: ov.querySelector('#fbmDate').value,
                adSpend: ov.querySelector('#fbmSpend').value,
                orders: ov.querySelector('#fbmOrders').value,
                revenue: ov.querySelector('#fbmRevenue').value,
                reach: ov.querySelector('#fbmReach').value,
                messages: ov.querySelector('#fbmMsg').value,
                note: ov.querySelector('#fbmNote').value,
                createdBy: (window.Web2Auth && window.Web2Auth.getUserName?.()) || '',
            };
            if (!payload.entryDate) {
                notify('Chọn ngày', 'warning');
                return;
            }
            const btn = ov.querySelector('#fbmSave');
            btn.disabled = true;
            const r = await Api().saveAdEntry(payload);
            if (r.success) {
                notify('Đã lưu', 'success');
                close();
                load();
            } else {
                notify(r.error || 'Lỗi lưu', 'error');
                btn.disabled = false;
            }
        };
    }

    // Picker bài: nạp /list của page → grid chọn.
    async function pickPost(pageId, onPick) {
        const ov = document.createElement('div');
        ov.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10001;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
        ov.innerHTML = `<div class="fbp-card" style="max-width:620px;width:100%;margin:auto">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><strong style="flex:1">Chọn bài / đợt live</strong>
            <button class="fbp-btn ghost sm" id="fbmPkClose" type="button">Đóng</button></div>
            <div id="fbmPkList"><div class="fbp-empty"><i data-lucide="loader"></i> Đang tải bài…</div></div></div>`;
        document.body.appendChild(ov);
        if (window.lucide?.createIcons) window.lucide.createIcons();
        ov.querySelector('#fbmPkClose').onclick = () => ov.remove();
        ov.addEventListener('click', (e) => {
            if (e.target === ov) ov.remove();
        });
        try {
            const r = await Api().list(pageId, 25);
            const posts = (r && r.posts) || [];
            const badge = (p) =>
                p.type === 'live'
                    ? '🔴 Live'
                    : p.type === 'video'
                      ? '🎬'
                      : p.type === 'photo'
                        ? '🖼️'
                        : '📝';
            ov.querySelector('#fbmPkList').innerHTML = posts.length
                ? posts
                      .map(
                          (p, i) =>
                              `<div class="fbp-post" style="cursor:pointer" data-i="${i}">
                                ${p.picture ? `<img class="fbp-post-thumb" src="${esc(p.picture)}" loading="lazy" alt="" />` : ''}
                                <div class="fbp-post-body"><p class="fbp-post-msg">${badge(p)} ${esc(p.message) || '<i>(không nội dung)</i>'}</p></div>
                              </div>`
                      )
                      .join('')
                : '<div class="fbp-empty">Không có bài.</div>';
            ov.querySelectorAll('[data-i]').forEach((el) =>
                el.addEventListener('click', () => {
                    onPick(posts[Number(el.dataset.i)]);
                    ov.remove();
                })
            );
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            ov.querySelector('#fbmPkList').innerHTML =
                `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    async function load() {
        _el.innerHTML =
            '<div class="fbp-empty"><i data-lucide="loader"></i> Đang tải sổ quảng cáo…</div>';
        try {
            const r = await Api().adEntries();
            _entries = (r && r.entries) || [];
            render();
        } catch (e) {
            _el.innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    function mount(el, pages) {
        _el = el;
        _pages = pages || [];
        load();
    }

    window.FBAdsManual = { mount };
})();
