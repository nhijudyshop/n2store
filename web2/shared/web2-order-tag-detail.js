// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web2OrderTagDetail — popup "lý do chi tiết" khi bấm 1 TAG đơn hàng (cột Thẻ native-orders).
//   - Chờ hàng  → SP cần đặt NCC (giỏ giữ vượt tồn) + "ai đang giữ" (fetch /usage: đơn + tên KH + SL + trạng thái). Gộp "Âm mã" cũ.
//   - Hết hàng / Mua 1 phần → danh sách SP + tồn.
//   - Trigger khác → mô tả điều kiện (registry /triggers).
// Data SP đến từ tag.detail.products (server gắn ở /load). Holders "chờ hàng" fetch /usage on-click.
// 1 nguồn dùng chung — trang nào cần "giải thích tag đơn" thì load + gọi Web2OrderTagDetail.open(order, tag).
(function (global) {
    'use strict';

    const WORKER_FALLBACK = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    let _triggerDescCache = null;
    let _root = null;

    function workerBase() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            WORKER_FALLBACK
        );
    }
    function esc(s) {
        if (global.Web2Escape?.escapeHtml) return global.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function icons() {
        if (global.lucide) global.lucide.createIcons();
    }
    function vnNum(n) {
        return Number(n || 0).toLocaleString('vi-VN');
    }

    function ensureStyles() {
        if (document.getElementById('w2otd-styles')) return;
        const st = document.createElement('style');
        st.id = 'w2otd-styles';
        st.textContent = `
        .w2otd-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:11000;padding:16px;}
        .w2otd-modal{background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(15,23,42,.3);}
        .w2otd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px;border-bottom:1px solid #eef1f6;position:sticky;top:0;background:#fff;}
        .w2otd-head h3{margin:0;font-size:15.5px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px;}
        .w2otd-x{border:none;background:#f1f5f9;border-radius:8px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#475569;}
        .w2otd-x:hover{background:#e2e8f0;}
        .w2otd-body{padding:14px 18px 18px;}
        .w2otd-lead{font-size:13px;color:#475569;line-height:1.5;margin:0 0 12px;}
        .w2otd-prod{border:1px solid #eef1f6;border-radius:11px;padding:11px 12px;margin-bottom:10px;background:#fafbfc;}
        .w2otd-prod-row{display:flex;gap:11px;align-items:flex-start;}
        .w2otd-thumb{flex:0 0 auto;width:52px;height:52px;border-radius:9px;overflow:hidden;border:1px solid #e2e8f0;background:#fff;display:flex;align-items:center;justify-content:center;}
        .w2otd-thumb-img{width:100%;height:100%;object-fit:cover;display:block;}
        .w2otd-thumb-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#cbd5e1;}
        .w2otd-thumb-ph i{width:20px;height:20px;}
        .w2otd-prod-main{flex:1;min-width:0;}
        .w2otd-prod-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .w2otd-prod-head strong{font-size:13.5px;color:#0f172a;}
        .w2otd-code{font-family:ui-monospace,monospace;font-size:11.5px;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:5px;padding:1px 5px;}
        .w2otd-badge{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:auto;white-space:nowrap;}
        .w2otd-badge.amber{background:#fef3c7;color:#92400e;}
        .w2otd-badge.red{background:#fee2e2;color:#b91c1c;}
        .w2otd-badge.slate{background:#e2e8f0;color:#475569;}
        .w2otd-sub{font-size:12px;color:#64748b;margin-top:5px;}
        .w2otd-holders{margin-top:9px;border-top:1px dashed #e2e8f0;padding-top:8px;}
        .w2otd-holders-title{font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;}
        .w2otd-holder{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#334155;padding:4px 6px;border-radius:7px;}
        .w2otd-holder:nth-child(even){background:#fff;}
        .w2otd-holder.me{background:#eff6ff;}
        .w2otd-holder .stt{font-weight:700;color:#0068ff;min-width:54px;}
        .w2otd-holder .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .w2otd-holder .qty{font-weight:700;color:#b91c1c;}
        .w2otd-holder .st{font-size:11px;color:#94a3b8;}
        .w2otd-me-tag{font-size:10px;font-weight:700;color:#0068ff;background:#dbeafe;border-radius:5px;padding:1px 5px;}
        .w2otd-muted{font-size:12.5px;color:#94a3b8;padding:6px 0;}
        .w2otd-spin{display:inline-block;width:14px;height:14px;border:2px solid #cbd5e1;border-top-color:#0068ff;border-radius:50%;animation:w2otdspin .7s linear infinite;vertical-align:middle;margin-right:6px;}
        @keyframes w2otdspin{to{transform:rotate(360deg)}}
        .w2otd-kpi-hero{display:flex;gap:11px;align-items:center;border:1px solid #e2e8f0;border-radius:13px;padding:12px 13px;background:linear-gradient(135deg,#f0fdf4,#fff);margin-bottom:12px;}
        .w2otd-kpi-hero.err{background:linear-gradient(135deg,#fef2f2,#fff);border-color:#fecaca;}
        .w2otd-kpi-hero .av{flex:0 0 auto;width:40px;height:40px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;}
        .w2otd-kpi-hero.err > i{flex:0 0 auto;width:26px;height:26px;color:#dc2626;}
        .w2otd-kpi-hero .nm{font-size:15px;font-weight:800;color:#0f172a;display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
        .w2otd-kpi-hero.err .nm{color:#b91c1c;}
        .w2otd-kpi-hero .rs{font-size:12px;color:#64748b;margin-top:3px;line-height:1.45;}
        .w2otd-kpi-src{font-size:10.5px;font-weight:700;border-radius:999px;padding:1px 8px;}
        .w2otd-kpi-src.live{background:#dcfce7;color:#15803d;}
        .w2otd-kpi-src.inbox{background:#dbeafe;color:#1d4ed8;}
        .w2otd-kpi-money{display:flex;gap:8px;margin-bottom:12px;}
        .w2otd-kpi-money .box{flex:1;border:1px solid #eef1f6;border-radius:11px;padding:9px 10px;background:#fafbfc;text-align:center;}
        .w2otd-kpi-money .k{font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:3px;}
        .w2otd-kpi-money .v{font-size:15px;font-weight:800;color:#0f172a;}
        .w2otd-kpi-money .v.hl{color:#16a34a;}
        .w2otd-kpi-note{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:8px 10px;margin-bottom:12px;line-height:1.45;}
        .w2otd-kpi-lines-t{font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.03em;margin:4px 0 8px;}
        .w2otd-kpi-bc{font-size:12px;color:#475569;}
        .w2otd-act-row{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}
        .w2otd-act{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;border-radius:9px;padding:8px 12px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;transition:background .15s,border-color .15s,transform .05s;}
        .w2otd-act:hover{background:#f1f5f9;border-color:#94a3b8;}
        .w2otd-act:active{transform:translateY(1px);}
        .w2otd-act.primary{background:#16a34a;border-color:#16a34a;color:#fff;}
        .w2otd-act.primary:hover{background:#15803d;border-color:#15803d;}
        .w2otd-act[disabled]{opacity:.6;cursor:not-allowed;}
        .w2otd-act i{width:15px;height:15px;}
        .w2otd-act-note{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:8px 11px;}
        .w2otd-act-note i{width:14px;height:14px;}
        `;
        document.head.appendChild(st);
    }

    function close() {
        if (_root) {
            _root.remove();
            _root = null;
        }
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
        if (e.key === 'Escape') close();
    }

    function statusLabel(s) {
        if (s === 'draft') return 'giỏ hàng · đang giữ';
        if (s === 'confirmed') return 'đơn hàng · đã lên PBH';
        if (s === 'cancelled') return 'đã huỷ';
        return s || '';
    }

    async function triggerDesc(trigger) {
        if (!_triggerDescCache) {
            try {
                const r = await fetch(workerBase() + '/api/web2-order-tags/triggers');
                const d = await r.json();
                _triggerDescCache = new Map((d.triggers || []).map((t) => [t.id, t]));
            } catch {
                _triggerDescCache = new Map();
            }
        }
        return _triggerDescCache.get(trigger) || null;
    }

    // ----- renderers -----
    function prodBadge(trigger, p) {
        if (trigger === 'cho_hang')
            return `<span class="w2otd-badge amber">Cần đặt ${vnNum(Math.max(0, (p.held || 0) - (p.stock || 0)))}</span>`;
        if (trigger === 'het_hang')
            return `<span class="w2otd-badge slate">Tồn ${vnNum(p.stock)}</span>`;
        if (trigger === 'mua_1_phan')
            return `<span class="w2otd-badge slate">Tồn ${vnNum(p.stock)} · chờ ${vnNum(p.pendingQty)}</span>`;
        return '';
    }
    function prodSub(trigger, p) {
        if (trigger === 'cho_hang')
            return `Tồn kho: <strong>${vnNum(p.stock)}</strong> · Tổng đang giữ (các giỏ): <strong>${vnNum(p.held)}</strong>${p.orderQty ? ` · giỏ này giữ ×${vnNum(p.orderQty)}` : ''}`;
        if (p.orderQty) return `Đặt trong đơn này: ×${vnNum(p.orderQty)}`;
        return '';
    }

    function thumbHtml(p) {
        if (p.imageUrl) {
            return `<img class="w2otd-thumb-img" src="${esc(p.imageUrl)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentNode.querySelector('.w2otd-thumb-ph').style.display='flex';"><span class="w2otd-thumb-ph" style="display:none;"><i data-lucide="image"></i></span>`;
        }
        return `<span class="w2otd-thumb-ph"><i data-lucide="image"></i></span>`;
    }
    function productListHtml(trigger, products) {
        return products
            .map(
                (p) => `
            <div class="w2otd-prod" data-code="${esc(p.code)}">
                <div class="w2otd-prod-row">
                    <div class="w2otd-thumb">${thumbHtml(p)}</div>
                    <div class="w2otd-prod-main">
                        <div class="w2otd-prod-head">
                            <strong>${esc(p.name || p.code)}</strong>
                            <span class="w2otd-code">${esc(p.code)}</span>
                            ${prodBadge(trigger, p)}
                        </div>
                        ${prodSub(trigger, p) ? `<div class="w2otd-sub">${prodSub(trigger, p)}</div>` : ''}
                    </div>
                </div>
                ${trigger === 'cho_hang' ? `<div class="w2otd-holders" data-holders="${esc(p.code)}"><span class="w2otd-spin"></span><span class="w2otd-muted">Đang tải đơn đang giữ…</span></div>` : ''}
            </div>`
            )
            .join('');
    }

    // Chờ hàng (gộp Âm mã cũ): fetch /usage → render holders per product (ai đang giữ, đơn nào).
    async function fillHolders(order, products) {
        const codes = products.map((p) => p.code);
        if (!codes.length) return;
        let usage = {};
        try {
            const r = await fetch(
                workerBase() +
                    '/api/web2-products/usage?codes=' +
                    encodeURIComponent(codes.join(','))
            );
            const d = await r.json();
            usage = d.usage || {};
        } catch {
            usage = {};
        }
        for (const p of products) {
            const box =
                _root && _root.querySelector(`.w2otd-holders[data-holders="${cssEsc(p.code)}"]`);
            if (!box) continue;
            const holders = (usage[p.code] || [])
                .filter((h) => h.status !== 'cancelled')
                .sort((a, b) => (a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1));
            if (!holders.length) {
                box.innerHTML = `<div class="w2otd-muted">Không có đơn nào đang giữ (tồn có thể đã trừ qua PBH).</div>`;
                continue;
            }
            const rows = holders
                .map((h) => {
                    const me = h.orderCode === order.code;
                    const stt =
                        Array.isArray(h.mergedDisplayStt) && h.mergedDisplayStt.length
                            ? h.mergedDisplayStt.join('+')
                            : h.displayStt != null
                              ? h.displayStt
                              : '?';
                    return `<div class="w2otd-holder ${me ? 'me' : ''}">
                        <span class="stt">STT ${esc(stt)}</span>
                        <span class="nm">${esc(h.customerName || 'Khách lạ')}</span>
                        <span class="qty">×${vnNum(h.qty)}</span>
                        <span class="st">${esc(statusLabel(h.status))}</span>
                        ${me ? '<span class="w2otd-me-tag">đơn này</span>' : ''}
                    </div>`;
                })
                .join('');
            box.innerHTML = `<div class="w2otd-holders-title">Ai đang giữ mã này (${holders.length} đơn)</div>${rows}`;
        }
    }
    function cssEsc(s) {
        return String(s).replace(/["\\]/g, '\\$&');
    }

    // ----- KPI User render (tag.detail.kpiUser) -----
    function kpiSrcBadge(src) {
        return src === 'inbox'
            ? `<span class="w2otd-kpi-src inbox">Inbox</span>`
            : `<span class="w2otd-kpi-src live">Livestream</span>`;
    }
    function kpiLineRow(info, l) {
        const isLive = info.source === 'livestream';
        const bc =
            l.base == null
                ? `Chưa chốt · SL hiện tại <strong>${vnNum(l.current)}</strong>`
                : isLive
                  ? `Base ${vnNum(l.base)} → SL hiện tại <strong>${vnNum(l.current)}</strong>`
                  : `Số lượng <strong>${vnNum(l.current)}</strong>`;
        const badge =
            Number(l.delta) > 0
                ? `<span class="w2otd-badge" style="background:#dcfce7;color:#15803d;margin-left:auto;">+${vnNum(l.delta)} KPI</span>`
                : `<span class="w2otd-badge slate" style="margin-left:auto;">0</span>`;
        return `<div class="w2otd-prod"><div class="w2otd-prod-row">
            <div class="w2otd-thumb">${thumbHtml(l)}</div>
            <div class="w2otd-prod-main">
                <div class="w2otd-prod-head"><strong>${esc(l.name || l.code)}</strong><span class="w2otd-code">${esc(l.code)}</span>${badge}</div>
                <div class="w2otd-sub"><span class="w2otd-kpi-bc">${bc}</span></div>
            </div></div></div>`;
    }
    // Khu nút hành động trong popup KPI: chốt KPI (admin, khi chưa chốt) + chia dải STT
    // (khi lỗi chưa gán). acts = { isAdmin, onLock, onAssign }.
    function kpiActionsHtml(info, acts) {
        const btns = [];
        if (info.source === 'livestream' && info.notChoted) {
            if (acts.isAdmin && acts.onLock) {
                btns.push(
                    `<button type="button" class="w2otd-act primary" data-kpi-act="lock"><i data-lucide="lock"></i> Chốt KPI ngay</button>`
                );
            } else {
                btns.push(
                    `<span class="w2otd-act-note"><i data-lucide="shield-alert"></i> Chỉ admin chốt KPI được</span>`
                );
            }
        }
        if (info.state === 'error' && acts.onAssign) {
            btns.push(
                `<button type="button" class="w2otd-act" data-kpi-act="assign"><i data-lucide="sliders-horizontal"></i> Chia dải STT chiến dịch này</button>`
            );
        }
        return btns.length ? `<div class="w2otd-act-row">${btns.join('')}</div>` : '';
    }

    function wireKpiActions(body, order, info, acts) {
        const lock = body.querySelector('[data-kpi-act="lock"]');
        if (lock && acts.onLock) {
            lock.addEventListener('click', () => {
                lock.disabled = true;
                lock.innerHTML = '<span class="w2otd-spin"></span> Đang chốt…';
                Promise.resolve(acts.onLock(order.code)).finally(() => close());
            });
        }
        const assign = body.querySelector('[data-kpi-act="assign"]');
        if (assign && acts.onAssign) {
            assign.addEventListener('click', () => {
                acts.onAssign(info.campaignName || '');
            });
        }
    }

    function renderKpiUser(order, info, acts) {
        acts = acts || {};
        const orderRef = `Đơn <strong>${esc(order.code)}</strong>${order.customerName ? ` · ${esc(order.customerName)}` : ''}`;
        const err = info.state === 'error';
        const lines = Array.isArray(info.lines) ? info.lines : [];
        const hero = err
            ? `<div class="w2otd-kpi-hero err"><i data-lucide="alert-triangle"></i><div><div class="nm">${esc(info.label)}</div><div class="rs">${esc(info.resolveText)}</div></div></div>`
            : `<div class="w2otd-kpi-hero"><div class="av">${esc(
                  String(info.beneficiaryName || info.label || '?')
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()
              )}</div><div><div class="nm">${esc(info.beneficiaryName || info.label)} ${kpiSrcBadge(info.source)}</div><div class="rs">${esc(info.resolveText)}</div></div></div>`;
        const money = `<div class="w2otd-kpi-money">
            <div class="box"><div class="k">SL tính KPI</div><div class="v">${vnNum(info.kpiQty)} SP</div></div>
            <div class="box"><div class="k">Tiền KPI</div><div class="v hl">${vnNum(info.kpiAmount)}đ</div></div>
            <div class="box"><div class="k">Đơn giá</div><div class="v">${vnNum(info.rate)}đ</div></div>
        </div>`;
        const note = info.notChoted
            ? `<div class="w2otd-kpi-note">Đơn livestream <strong>CHƯA chốt</strong> → KPI tạm tính 0. Chỉ phần bán THÊM sau khi "Chốt đơn" (vượt base) mới được tính KPI.</div>`
            : '';
        const linesHtml = lines.length
            ? `<div class="w2otd-kpi-lines-t">Chi tiết theo sản phẩm (${lines.length})</div>${lines.map((l) => kpiLineRow(info, l)).join('')}`
            : '';
        const actions = kpiActionsHtml(info, acts);
        return `<p class="w2otd-lead">${orderRef} — người được tính KPI cho đơn này:</p>${hero}${actions}${money}${note}${linesHtml}`;
    }

    async function open(order, tag, opts) {
        if (!order || !tag) return;
        opts = opts || {};
        ensureStyles();
        close();
        const products = (tag.detail && tag.detail.products) || [];
        _root = document.createElement('div');
        _root.className = 'w2otd-overlay';
        _root.innerHTML = `
            <div class="w2otd-modal" role="dialog" aria-modal="true">
                <div class="w2otd-head">
                    <h3>${tag.icon ? `<i data-lucide="${esc(tag.icon)}" style="width:17px;height:17px;"></i>` : ''}${esc(tag.name)}</h3>
                    <button class="w2otd-x" aria-label="Đóng"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
                </div>
                <div class="w2otd-body" id="w2otdBody"><span class="w2otd-spin"></span><span class="w2otd-muted">Đang tải…</span></div>
            </div>`;
        document.body.appendChild(_root);
        _root.addEventListener('click', (e) => {
            if (e.target === _root) close();
        });
        _root.querySelector('.w2otd-x').addEventListener('click', close);
        document.addEventListener('keydown', onKey);

        const body = _root.querySelector('#w2otdBody');
        const orderRef = `Đơn <strong>${esc(order.code)}</strong>${order.customerName ? ` · ${esc(order.customerName)}` : ''}`;

        if (tag.trigger === 'kpi_user' && tag.detail && tag.detail.kpiUser) {
            const acts = opts.kpiActions || {};
            body.innerHTML = renderKpiUser(order, tag.detail.kpiUser, acts);
            wireKpiActions(body, order, tag.detail.kpiUser, acts);
            icons();
            return;
        }

        if (products.length) {
            const leadMap = {
                cho_hang: `${products.length} sản phẩm <strong>chờ hàng</strong> (giỏ giữ vượt tồn → cần đặt thêm NCC) trong ${orderRef}.`,
                het_hang: `${products.length} sản phẩm <strong>hết hàng</strong> (tồn ≤ 0) trong ${orderRef}.`,
                mua_1_phan: `${products.length} sản phẩm <strong>mua 1 phần</strong> (đã nhận một phần từ NCC) trong ${orderRef}.`,
            };
            body.innerHTML =
                `<p class="w2otd-lead">${leadMap[tag.trigger] || orderRef}</p>` +
                productListHtml(tag.trigger, products);
            icons();
            if (tag.trigger === 'cho_hang') fillHolders(order, products);
        } else {
            const t = await triggerDesc(tag.trigger);
            body.innerHTML = `<p class="w2otd-lead">${orderRef} được gắn thẻ này vì:</p><div class="w2otd-prod"><div class="w2otd-sub" style="font-size:13px;color:#334155;">${esc(t ? t.desc : 'Điều kiện ' + tag.trigger)}</div></div>`;
        }
        icons();
    }

    global.Web2OrderTagDetail = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
