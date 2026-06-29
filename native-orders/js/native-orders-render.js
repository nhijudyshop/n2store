// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — order row build + derived badges + renderRows/pagination/counters + load(). MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ---------- Render ----------
    NO._renderExpandRow = function _renderExpandRow(o) {
        const lines = Array.isArray(o.products) ? o.products : [];
        if (!lines.length) {
            return `
                <tr class="expand-row" data-for="${NO.escapeHtml(o.code)}">
                    <td colspan="17">
                        <div class="expand-empty">
                            <i data-lucide="package-x"></i>
                            Đơn chưa có sản phẩm —
                            <a href="#" onclick="event.preventDefault();event.stopPropagation();NativeOrdersApp.openEdit('${NO.escapeHtml(o.code)}')">Bấm Sửa để thêm →</a>
                        </div>
                    </td>
                </tr>`;
        }
        const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
        const totalAmt = lines.reduce(
            (s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0),
            0
        );
        const rows = lines
            .map((l, i) => {
                const qty = Number(l.quantity) || 0;
                const price = Number(l.price) || 0;
                const amount = qty * price;
                const img = l.imageUrl
                    ? `<img src="${NO.escapeHtml(l.imageUrl)}" class="expand-img" onerror="this.style.display='none';this.nextElementSibling.style.setProperty('display','inline-flex');">
                   <span class="expand-img-ph" style="display:none;"><i data-lucide="image"></i></span>`
                    : `<span class="expand-img-ph"><i data-lucide="image"></i></span>`;
                const sourceBadge = NO._renderSourceBadge(l.source);
                // Mã đơn vị "-xxx" đã AUTO-GÁN cho đơn này (NO._unitSerials, fetch theo
                // order id). Quét tem -xxx → ra STT đơn này → khớp. Số serial < SL = đơn
                // còn THIẾU unit (chưa đủ hàng vật lý gán vào giỏ).
                const _ser =
                    (NO._unitSerials &&
                        NO._unitSerials[o.id] &&
                        NO._unitSerials[o.id][l.productCode]) ||
                    [];
                const _unitTag = _ser.length
                    ? ` <span class="expand-unit-codes" title="Mã đơn vị đã gán (auto theo giỏ) — quét tem ra STT đơn này" style="font-family:ui-monospace,monospace;font-weight:700;color:#0068ff;font-size:11.5px;">${_ser
                          .map((s) => '-' + s)
                          .join(' ')}</span>`
                    : '';
                // Thiếu tem: gán được 1 PHẦN (serial < SL) → chưa đủ hàng vật lý gán vào
                // giỏ → đơn KHÔNG ra được PBH. Badge đỏ cảnh báo. 0 serial = bỏ qua (đơn
                // cũ chưa track per-unit, tránh nhiễu). Không in quá SL nên serial ≤ SL.
                const _short = _ser.length > 0 && _ser.length < qty ? qty - _ser.length : 0;
                const _shortTag = _short
                    ? ` <span class="expand-unit-short" title="Thiếu ${_short} tem — chưa đủ hàng vật lý gán vào giỏ (đơn không ra được PBH)" style="font-weight:700;color:#dc2626;font-size:11px;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:0 5px;">⚠ thiếu ${_short}</span>`
                    : '';
                return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${img}</td>
                    <td>
                        <div class="expand-name">${NO.escapeHtml(l.name || '—')}</div>
                        <div class="expand-code">${NO.escapeHtml(l.productCode || '')}${_unitTag}${_shortTag}${sourceBadge}</div>
                    </td>
                    <td class="expand-qty">${qty}</td>
                    <td class="expand-price">${price.toLocaleString('vi-VN')}đ</td>
                    <td class="expand-amount">${amount.toLocaleString('vi-VN')}đ</td>
                </tr>`;
            })
            .join('');
        return `
            <tr class="expand-row" data-for="${NO.escapeHtml(o.code)}">
                <td colspan="17">
                    <div class="expand-wrap">
                        <div class="expand-header">
                            <span class="expand-title"><i data-lucide="package"></i>Sản phẩm trong đơn ${NO.escapeHtml(o.code)}</span>
                            <span class="expand-totals">${totalQty} SP · ${totalAmt.toLocaleString('vi-VN')}đ</span>
                        </div>
                        <table class="expand-table">
                            <thead>
                                <tr>
                                    <th style="width:40px;">#</th>
                                    <th style="width:56px;">ẢNH</th>
                                    <th>SẢN PHẨM</th>
                                    <th style="width:60px;">SL</th>
                                    <th style="width:120px;">ĐƠN GIÁ</th>
                                    <th style="width:130px;">THÀNH TIỀN</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </td>
            </tr>`;
    };

    // 2026-06-21: cột "Thẻ" — TAG đơn hàng auto (server /load tính o.autoTags theo
    // trigger ở web2_order_tags). Render pill dùng chung Web2OrderTagPill (cùng renderer
    // với trang Cấu hình). Rỗng → '—' nhạt. KHÔNG nhầm với o.tags (Pancake/keyword ở cột Mã).
    NO._autoTagPills = function _autoTagPills(o) {
        const tags = Array.isArray(o.autoTags) ? o.autoTags : [];
        if (!tags.length) return '<span class="web2-count-empty">—</span>';
        const code = NO.escapeHtml(o.code);
        // o._enterTriggers (Set|null) do renderRows gắn transient: chứa trigger của THẺ
        // vừa MỚI thêm ở lần render này → pill đó chạy animation "pop vào" (mượt, không giật).
        const enterSet = o._enterTriggers || null;
        if (window.Web2OrderTagPill) {
            // Mỗi pill bấm được → mở Web2OrderTagDetail (lý do chi tiết: SP chờ hàng,
            // SP âm mã + ai đang giữ). stopPropagation để không toggle expand đơn.
            const pills = tags
                .map(
                    (t) =>
                        `<span class="no-otag-click" title="Bấm xem lý do" onclick="event.stopPropagation();NativeOrdersApp.openTagDetail('${code}','${NO.escapeHtml(t.trigger)}')" style="cursor:pointer;display:inline-flex;">${window.Web2OrderTagPill.html(t, { small: true, enter: enterSet ? enterSet.has(t.trigger) : false })}</span>`
                )
                .join(' ');
            return `<span class="w2-otag-list" style="display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;">${pills}</span>`;
        }
        // Fallback nếu renderer chưa load.
        return tags
            .map(
                (t) =>
                    `<span class="web2-label web2-label-default">${NO.escapeHtml(t.name || '')}</span>`
            )
            .join(' ');
    };

    // Admin Web 2.0? (role='admin'). 1 nguồn ở Web2Kpi.isAdmin (fallback inline nếu chưa load).
    NO.isAdmin = function isAdmin() {
        if (window.Web2Kpi && window.Web2Kpi.isAdmin) return window.Web2Kpi.isAdmin();
        try {
            const u = window.Web2Auth?.getStored?.()?.user;
            if (u && u.role) return String(u.role).toLowerCase() === 'admin';
        } catch {}
        return false;
    };

    // Chốt KPI base cho 1 đơn livestream (admin-only). Khóa SL hiện tại làm base bất biến
    // → từ giờ chỉ phần bán THÊM (upsell) mới tính KPI. Backend requireWeb2Admin → 403 nếu
    // không phải admin. Thành công → reload (pill hết "chưa chốt").
    NO.lockKpiBase = async function lockKpiBase(code) {
        if (!code) return;
        try {
            const r = await fetch(
                `${NO.WORKER_URL}/api/native-orders/${encodeURIComponent(code)}/lock-kpi-base`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                    },
                    body: JSON.stringify({}),
                }
            );
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.success) {
                const reasonMap = {
                    'empty-order': 'Đơn chưa có SP — không chốt KPI được',
                    'no-unbased-order': 'Đơn đã chốt KPI rồi (hoặc không phải đơn livestream)',
                    'race-already-based': 'Đơn vừa được chốt KPI',
                };
                const msg =
                    r.status === 403
                        ? 'Chỉ admin mới chốt KPI được'
                        : reasonMap[j.reason] || j.message || j.error || 'Chốt KPI thất bại';
                NO.notify(msg, 'error');
                return;
            }
            NO.notify(
                `Đã chốt KPI đơn ${j.code} · base khóa ${Object.keys(j.base || {}).length} mã SP`,
                'success'
            );
            await NO.load();
        } catch (e) {
            NO.notify('Lỗi chốt KPI: ' + e.message, 'error');
        }
    };

    // Bấm 1 pill TAG → mở popup lý do chi tiết (shared Web2OrderTagDetail).
    // Với kpi_user: bơm kpiActions (chốt KPI admin-only + deep-link chia dải STT).
    NO.openTagDetail = function openTagDetail(code, trigger) {
        const o = NO.STATE.orders.find((x) => x.code === code);
        if (!o) return;
        const tag = (o.autoTags || []).find((t) => t.trigger === trigger);
        if (!tag) return;
        const opts = {};
        if (trigger === 'kpi_user') {
            opts.kpiActions = {
                isAdmin: NO.isAdmin(),
                onLock: (c) => NO.lockKpiBase(c),
                onAssign: (camp) => {
                    const url =
                        '../web2/kpi/assignments.html' +
                        (camp ? '?campaign=' + encodeURIComponent(camp) : '');
                    window.open(url, '_blank');
                },
            };
        }
        if (window.Web2OrderTagDetail) window.Web2OrderTagDetail.open(o, tag, opts);
        else NO.notify(tag.name, 'info');
    };

    // WEB2 Trạng thái column uses PLAIN TEXT (not pill). Color varies by status:
    // draft → gray #808080, others → blue/red as appropriate. fw 700, fs 14px.
    NO.web2StatusText = function web2StatusText(s) {
        const map = {
            // draft = chưa tạo PBH → là GIỎ HÀNG (cart). confirmed = đã có PBH → Đơn hàng.
            draft: { label: 'Giỏ hàng', cls: '' },
            confirmed: { label: 'Đơn hàng', cls: 'confirmed' },
            cancelled: { label: 'Đã hủy', cls: 'cancelled' },
            delivered: { label: 'Đã giao', cls: 'delivered' },
        };
        const m = map[s] || { label: s || '—', cls: '' };
        return `<span class="web2-status-text ${m.cls}">${m.label}</span>`;
    };

    // 2026-06-04: badge phái sinh từ PBH liên kết (server /load gắn pbh* fields):
    //   - "Đã thanh toán" khi COD còn lại = 0 (ví đủ trả hết / đã thanh toán).
    //   - "Đã đối soát" khi PBH đã đóng gói xong (fulfillment ∈ packed/shipped/delivered).
    NO.RECONCILED_STATES = new Set(['packed', 'shipped', 'delivered']);

    NO.orderDerivedBadges = function orderDerivedBadges(o) {
        const out = [];
        if (/pbh\s*shop|shop/i.test(o.pbhCarrierName || '')) {
            out.push(`<span class="no-shop-badge" title="Bán tại shop">🏪 PBH SHOP</span>`);
        }
        const paid = Number(o.pbhTotal) > 0 && Number(o.pbhResidual) <= 0;
        if (paid) {
            out.push(
                `<span class="no-paid-badge" title="Ví đủ trả / đã thanh toán — COD còn lại 0₫">✓ Đã thanh toán</span>`
            );
        }
        if (NO.RECONCILED_STATES.has(o.pbhFulfillmentState)) {
            out.push(
                `<span class="no-reconciled-badge" title="Đã đối soát đóng gói (${NO.escapeHtml(o.pbhFulfillmentState)})">📦 Đã đối soát</span>`
            );
        }
        // 2026-06-05: cờ "KH báo đã CK" (web2_payment_signals). Soft marker — KH
        // nhắn "CK XONG"/"ĐÃ CK" trong inbox Pancake, CHƯA phải xác nhận tiền thật.
        if (o.ckSignal) {
            const confirmed = o.ckSignal.status === 'confirmed';
            // Click badge → mở web2-ck-review (đối chiếu GD SePay + duyệt). Prefill
            // SĐT/tên từ đơn (data-ck-*). Pending mới clickable; confirmed chỉ xem.
            const clickable = o.ckSignal.id
                ? ` data-ck-review="${o.ckSignal.id}" data-ck-phone="${NO.escapeHtml(o.phone || '')}" data-ck-name="${NO.escapeHtml(o.customerName || '')}" style="cursor:pointer"`
                : '';
            out.push(
                `<span class="no-ck-badge${confirmed ? ' ck-confirmed' : ''}"${clickable} title="KH báo đã chuyển khoản (${NO.escapeHtml(o.ckSignal.keyword || '')}${confirmed ? ' — đã xác nhận' : ' — bấm để đối chiếu & duyệt'}). Đối soát tiền vẫn qua SePay.">💸 KH báo đã CK</span>`
            );
        }
        // [2026-06-07] Cảnh báo "Chưa nhận CK" — đơn chưa nhận tiền chuyển khoản
        // của khách (chưa "đã thanh toán" + chưa CK xác nhận + ví < tổng đơn).
        // NGOẠI LỆ: ví KH ≥ tổng đơn → coi như đủ tiền → KHÔNG cảnh báo.
        // Bấm badge → picker gán giao dịch CK từ balance-history (Part C).
        const totalAmt = Number(o.totalAmount || 0);
        const wallet = Number(o.walletBalance || 0);
        const ckConfirmed = o.ckSignal && o.ckSignal.status === 'confirmed';
        const covered = paid || ckConfirmed || (totalAmt > 0 && wallet >= totalAmt);
        if (totalAmt > 0 && !covered) {
            out.push(
                `<span class="no-nock-badge" data-action="assign-ck" data-code="${NO.escapeHtml(o.code)}" data-phone="${NO.escapeHtml(o.phone || '')}" data-name="${NO.escapeHtml(o.customerName || '')}" data-total="${totalAmt}" title="Đơn chưa nhận chuyển khoản của khách. Bấm để gán giao dịch CK từ danh sách." style="cursor:pointer">⚠ Chưa nhận CK</span>`
            );
        }
        // [2026-06-07] Đã in: chỉ hiện ICON máy in (gọn, không chiếm chữ/dòng).
        // Hover (native title — có độ trễ sẵn, không hiện liền) → số lần in + thời
        // gian in gần nhất. Số lần in cụ thể đã in trên chính phiếu (bill / PSH).
        // [2026-06-09] Bấm icon → XEM bill (preview) đúng loại theo trạng thái (Nháp
        // → Phiếu Soạn Hàng, PBH SHOP → bill PBH SHOP, còn lại → bill PBH). Chỉ XEM,
        // KHÔNG auto-in, KHÔNG bump số lần in (in thật qua nút trong preview). Dùng
        // inline onclick (badge nằm trong td col-check có stopPropagation nên
        // document-delegation không nhận được event). cursor:pointer gợi ý click.
        const pc = Number(o.printCount) || 0;
        if (pc > 0) {
            const t = o.lastPrintedAt ? NO.formatFullTime(o.lastPrintedAt) : '';
            const tip = `Đã in ${pc} lần${t ? ` — lần cuối: ${t}` : ''} — bấm để xem bill`;
            out.push(
                `<span class="no-print-badge" title="${NO.escapeHtml(tip)}" onclick="event.stopPropagation();NativeOrdersApp.viewOrderBill('${NO.escapeHtml(o.code)}')" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;font-size:12.5px;border-radius:6px;background:#fef3c7;border:1px solid #fde68a;cursor:pointer;">🖨</span>`
            );
        }
        return out.length ? `<div class="no-derived-badges">${out.join('')}</div>` : '';
    };

    // VN phone carrier prefix → label
    NO.CARRIER_PREFIXES = {
        Viettel: /^(086|096|097|098|032|033|034|035|036|037|038|039)/,
        Mobifone: /^(089|090|093|070|079|077|076|078)/,
        Vinaphone: /^(088|091|094|083|084|085|081|082)/,
        Vietnamobile: /^(092|056|058)/,
        Gmobile: /^(099|059)/,
    };

    NO.detectCarrier = function detectCarrier(phone) {
        if (!phone) return '';
        const p = String(phone).replace(/\D/g, '');
        for (const [name, re] of Object.entries(NO.CARRIER_PREFIXES)) {
            if (re.test(p)) return name;
        }
        return '';
    };

    // STT hiển thị CHUẨN (dùng chung list + in bill — phải khớp nhau):
    //   - đơn TÁCH: "31-2" (splitIndex > 0, chia sẻ campaignStt gốc)
    //   - đơn thường + đơn GỘP: campaignStt (per-campaign 1..n) — KHÔNG dùng
    //     displayStt (global sequence) vì list hiển thị campaignStt → bill phải giống.
    // STT đơn = SỐ KỆ vật lý (user dán ngoài kệ). Đơn GỘP: dùng campaign_stt MỚI
    // của đơn gộp (= số kệ thật, KHỚP tem quét ra), KHÔNG còn join display_stt cũ
    // "1 + 2" (2026-06-29 user chốt "lấy số mới nhất" — tránh lệch tem ↔ native-orders;
    // 1 nguồn STT kệ = campaign_stt, xem render.com/lib/web2-shelf-stt.js).
    // STT các đơn gốc vẫn xem được qua title badge (mergedDisplayStt) + merged_codes.
    NO.computeOrderStt = function computeOrderStt(o) {
        const base = o.campaignStt ?? o.displayStt ?? o.sessionIndex ?? '';
        return o.splitIndex && o.splitIndex > 0 ? `${base}-${o.splitIndex}` : base;
    };

    // Build HTML cho 1 order — return string: main row + (optional) expand row.
    // Tách ra để renderRows có thể diff per-code và chỉ thay row thay đổi.
    NO._buildOrderHtml = function _buildOrderHtml(o) {
        const time = NO.formatTimeSplit(o.createdAt);
        const isExpanded = NO.STATE.expandedOrders.has(o.code);
        const carrier = NO.detectCarrier(o.phone);
        const status = (o.partnerStatus || '').trim();
        const statusPill =
            status === 'Bom hàng'
                ? `<span class="web2-label web2-label-danger m-l-xs">Bom hàng</span>`
                : status === 'Cảnh báo'
                  ? `<span class="web2-label web2-label-warning m-l-xs">Cảnh báo</span>`
                  : status === 'Nguy hiểm'
                    ? `<span class="web2-label web2-label-danger m-l-xs">Nguy hiểm</span>`
                    : `<span class="web2-label web2-label-success m-l-xs">Bình thường</span>`;
        const tagBadges = (o.tags || [])
            .map((t) => {
                const txt = typeof t === 'string' ? t : t.name || t.label || '';
                if (!txt) return '';
                const upper = txt.toUpperCase();
                let cls = 'web2-label-default';
                if (/CỌC|COC/.test(upper)) cls = 'web2-label-coc';
                else if (/BOOM/.test(upper)) cls = 'web2-label-boom';
                else if (/GIỎ|GIO/.test(upper)) cls = 'web2-label-warning';
                return `<span class="web2-label ${cls}">${NO.escapeHtml(txt)}</span>`;
            })
            .join('');
        const total = Number(o.totalAmount || 0).toLocaleString('vi-VN');
        const qty = Number(o.totalQuantity || 0);
        const campaignName = o.liveCampaignName || '';

        // When merge mode is on, embed the merged sibling info inside the
        // primary cell so user still sees it even though sibling column is hidden.
        const mergeNameSdt = NO.STATE.colVisibility.mergeNameSdt;
        const mergeTotalQty = NO.STATE.colVisibility.mergeTotalQty;
        const mergedPhoneHtml =
            mergeNameSdt && o.phone
                ? `<a href="tel:${NO.escapeHtml(o.phone)}" class="web2-phone-link" style="font-size:11px;color:#6b7280;font-weight:500;" onclick="event.stopPropagation();">${NO.escapeHtml(o.phone)}</a>`
                : '';
        const mergedQtyHtml =
            mergeTotalQty && qty
                ? `<div style="font-size:11px;color:#6b7280;font-weight:500;">SL: ${qty}</div>`
                : '';
        // Hiển thị STT:
        //   - 2026-06-02 (user spec): ưu tiên campaignStt (per-campaign 1..n, reset
        //     theo campaign group key) thay vì displayStt (global sequence không bao
        //     giờ reset → "1 đơn STT 7" sau khi xóa data cũ → confusing).
        //   - đơn GỘP: campaign_stt MỚI của đơn gộp (số kệ thật, khớp tem) + dấu ⛓
        //     (2026-06-29 user chốt "số mới nhất"); STT gốc xem qua title/⛓ hover
        //   - "31-2" nếu là đơn tách (splitIndex > 0) — chia sẻ STT với các đơn cùng split family
        //   - "31" cho đơn thường
        const sttValue = NO.computeOrderStt(o);
        const _mergedFrom =
            Array.isArray(o.mergedDisplayStt) && o.mergedDisplayStt.length > 1
                ? o.mergedDisplayStt.join(' + ')
                : '';
        const _sttTitle = _mergedFrom
            ? ` title="Đơn gộp từ STT ${NO.escapeHtml(_mergedFrom)}"`
            : '';
        const _mergeMark = _mergedFrom
            ? '<sup class="web2-stt-merge" style="font-size:9px;color:#0068ff;font-weight:800;margin-left:1px;">⛓</sup>'
            : '';
        // is-split-family: visually nhóm các đơn cùng display_stt với split_index > 0.
        // splitTopcap / splitBotcap để border-radius hợp lý: 33-1 chỉ bo trên, 33-2 chỉ bo dưới.
        const splitClass = o.splitIndex && o.splitIndex > 0 ? ' is-split-family' : '';
        const mainRow = `
                <tr class="order-row${splitClass} ${isExpanded ? 'is-expanded' : ''}" data-code="${NO.escapeHtml(o.code)}"
                    data-stt-group="${o.splitIndex && o.splitIndex > 0 ? NO.escapeHtml(String(o.displayStt)) : ''}"
                    data-split-index="${o.splitIndex || 0}"
                    data-fb-user-id="${NO.escapeHtml(o.fbUserId || '')}"
                    data-fb-page-id="${NO.escapeHtml(o.fbPageId || '')}"
                    onclick="NativeOrdersApp.toggleExpand('${NO.escapeHtml(o.code)}')" style="cursor:pointer;">
                    <td class="col-check" onclick="event.stopPropagation();">
                        <div class="web2-check-stt">
                            <input type="checkbox" class="row-check" value="${NO.escapeHtml(o.code)}">
                            <span class="web2-row-stt"${_sttTitle}>${sttValue}${_mergeMark}</span>
                            <!-- 2026-06-01: trạng thái đơn moved into STT cell (per user) -->
                            <div class="web2-row-status-inline">${NO.web2StatusText(o.status)}</div>
                            ${NO.orderDerivedBadges(o)}
                        </div>
                    </td>
                    <td class="col-actions" onclick="event.stopPropagation();">
                        <div class="web2-row-actions web2-row-actions-grid">
                            <button class="web2-btn web2-btn-primary web2-btn-xs" title="Sửa" aria-label="Sửa"
                                onclick="event.stopPropagation();NativeOrdersApp.openEdit('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="pencil" style="width:12px;height:12px;"></i>
                            </button>
                            ${(() => {
                                // 3-state action buttons (slot sau "Sửa"):
                                //   - cancelled: nút "Tạo PBH" (sẽ tạo PBH mới số HĐ mới, không đụng PBH cũ)
                                //   - confirmed: KHÔNG có button trong slot này. "Huỷ PBH" (cancelPbh)
                                //     đã bỏ vì trùng chức năng với "Huỷ đơn" (cancelOrder, slot cuối)
                                //     khác mỗi scope: cancelOrder huỷ cả đơn web + PBH + restock,
                                //     cancelPbh chỉ huỷ PBH giữ đơn web — UX confusing, user yêu cầu
                                //     gom về 1 nút huỷ duy nhất (cancelOrder).
                                //     Muốn thêm PBH ở confirmed → "Tách đơn" tạo native-order con.
                                //   - draft: chỉ createPbh (user spec 2026-06-02: bỏ nút
                                //     "Xác nhận đơn" — workflow gom lại 1 bước, click Tạo
                                //     PBH = vừa confirm vừa tạo PBH luôn + deduct stock).
                                if (o.status === 'cancelled') {
                                    return `<button class="web2-btn web2-btn-success web2-btn-xs" title="Tạo PBH mới (đơn đã huỷ — sẽ tạo PBH mới với số HĐ mới, KHÔNG đụng PBH cũ)" aria-label="Tạo PBH mới"
                                onclick="event.stopPropagation();NativeOrdersApp.createPbh('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="receipt" style="width:12px;height:12px;"></i>
                            </button>`;
                                }
                                if (o.status === 'confirmed') {
                                    // 2026-06-04: slot 2 cho đơn confirmed = nút Huỷ đơn (X) — dời
                                    // lên đây theo yêu cầu (bỏ In PBH per-row vì trùng "In bill").
                                    return `<button class="web2-btn web2-btn-warning web2-btn-xs" title="Huỷ đơn (PBH liên kết tự cancel + restock)" aria-label="Huỷ đơn"
                                onclick="event.stopPropagation();NativeOrdersApp.cancelOrder('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="x-octagon" style="width:12px;height:12px;"></i>
                            </button>`;
                                }
                                // draft (default)
                                return `<button class="web2-btn web2-btn-success web2-btn-xs" title="Tạo PBH" aria-label="Tạo PBH"
                                onclick="event.stopPropagation();NativeOrdersApp.createPbh('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="receipt" style="width:12px;height:12px;"></i>
                            </button>`;
                            })()}
                            ${
                                o.customerId
                                    ? `<button class="web2-btn web2-btn-default web2-btn-xs" title="Khách hàng 360° (id ${o.customerId})" aria-label="Khách hàng 360°" style="color:#0068ff;"
                                onclick="event.stopPropagation();NativeOrdersApp.openCustomer(${o.customerId})">
                                <i data-lucide="user-circle" style="width:12px;height:12px;"></i>
                            </button>`
                                    : '<span class="web2-action-placeholder"></span>'
                            }
                            <button class="web2-btn web2-btn-default web2-btn-xs" title="Lịch sử thao tác đơn ${NO.escapeHtml(o.code)}" aria-label="Lịch sử đơn" style="color:#7c3aed;"
                                onclick="event.stopPropagation();NativeOrdersApp.openHistory('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="history" style="width:12px;height:12px;"></i>
                            </button>
                            ${
                                o.status === 'draft' || o.status === 'confirmed'
                                    ? `<button class="web2-btn web2-btn-default web2-btn-xs" title="Tách đơn (tạo giỏ hàng mới ${sttValue}-N với giỏ rỗng — cùng khách. Giỏ mới (chưa PBH) → có thể Tạo PBH riêng)" aria-label="Tách đơn" style="color:#0ea5e9;"
                                onclick="event.stopPropagation();NativeOrdersApp.splitOrder('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="split-square-vertical" style="width:12px;height:12px;"></i>
                            </button>`
                                    : ''
                            }
                            ${/* 2026-06-04: nút Huỷ đơn (X) đã dời lên slot 2 cho confirmed. */ ''}
                            ${(() => {
                                // 2026-06-26: Admin xoá GIỎ HÀNG (draft) hoặc đơn đã HUỶ (cancelled),
                                // kể cả giỏ có SP (draft chưa trừ kho → xoá an toàn). ĐƠN ĐÃ CHỐT PBH
                                // (confirmed = "Đơn hàng") KHÔNG xoá được — chỉ Huỷ. Chỉ admin thấy nút.
                                // Server DELETE vẫn chặn nếu còn PBH liên kết (defense-in-depth).
                                // removeOrder() đã có confirm + cập nhật state + SSE notify.
                                const deletable = NO.isAdmin() && o.status !== 'confirmed';
                                if (!deletable) return '';
                                return `<button class="web2-btn web2-btn-danger web2-btn-xs" title="Xoá đơn (admin — giỏ hàng / đơn đã huỷ; đơn đã chốt PBH không xoá được)" aria-label="Xoá đơn"
                                onclick="event.stopPropagation();NativeOrdersApp.removeOrder('${NO.escapeHtml(o.code)}')">
                                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                            </button>`;
                            })()}
                        </div>
                    </td>
                    <td class="col-stt web2-cell-center"><strong>${sttValue}</strong></td>
                    <td class="col-code web2-cell-center">
                        <div class="web2-code-cell" style="align-items:center;">
                            <span class="web2-code-main" onclick="event.stopPropagation();NativeOrdersApp.copyCode('${NO.escapeHtml(o.code)}')">${NO.escapeHtml(o.code)}</span>
                            ${campaignName ? `<span class="web2-code-sub">${NO.escapeHtml(campaignName)}</span>` : ''}
                            ${tagBadges ? `<div class="web2-code-tags">${tagBadges}</div>` : `<div class="web2-code-tags"><button class="web2-tag-trigger" onclick="event.stopPropagation();NativeOrdersApp.openEdit('${NO.escapeHtml(o.code)}')"><i data-lucide="tag" style="width:11px;height:11px;"></i></button></div>`}
                        </div>
                    </td>
                    <td class="col-tag">${NO._autoTagPills(o)}</td>
                    <td class="col-channel web2-cell-center">
                        <div class="web2-channel-cell" style="align-items:center;">
                            <span class="web2-channel-name">${NO.escapeHtml(o.fbUserName || '—')}</span>
                            ${o.fbCommentId ? `<span class="web2-channel-link">Bình luận</span>` : ''}
                        </div>
                    </td>
                    <td class="col-customer">
                        <div class="cust-with-avatar">
                            <div class="web2-customer-avatar-wrap"
                                 data-fb-user-id="${NO.escapeHtml(NO._isRealFbId(o.fbUserId) ? o.fbUserId : '')}"
                                 data-fb-page-id="${NO.escapeHtml(o.fbPageId || '')}"
                                 data-customer-name="${NO.escapeHtml(o.customerName || '')}"
                                 data-customer-phone="${NO.escapeHtml(o.phone || '')}"
                                 onmouseenter="NativeOrdersApp.onCustAvatarEnter(this)"
                                 onmouseleave="NativeOrdersApp.onCustAvatarLeave(this)">
                                ${NO.renderAvatar(o)}
                            </div>
                            <div class="web2-customer-cell" style="flex:1;min-width:0;">
                                <div class="web2-customer-name-row">
                                    ${
                                        o.customerName
                                            ? `<span class="web2-customer-name">${NO.escapeHtml(o.customerName)}</span>`
                                            : `<span class="web2-customer-name web2-customer-stranger" title="Đơn chưa có tên KH — hover avatar hoặc bấm nút WEB2 bên dưới">Khách lạ</span>`
                                    }
                                    ${statusPill}
                                    <span class="no-wallet-pill" data-w2wallet-phone="${NO.escapeHtml(o.phone || '')}"></span>
                                    <!-- Nút "Lấy WEB2" đã GỠ (2026-06-15): dùng chung kho KH
                                         web2_customers + SSE web2:customers → kho cập nhật thì
                                         native-orders tự cập nhật, không cần fetch tay (vốn hay
                                         lấy nhầm fb qua SĐT). -->
                                </div>
                                ${mergedPhoneHtml}
                            </div>
                        </div>
                    </td>
                    <td class="col-phone web2-cell-center" onclick="event.stopPropagation();">
                        ${
                            o.phone
                                ? `
                          <div class="web2-phone-cell" style="align-items:center;">
                            <a href="tel:${NO.escapeHtml(o.phone)}" class="web2-phone-link">${NO.escapeHtml(o.phone)}</a>
                            ${carrier ? `<span class="web2-carrier">${carrier}</span>` : ''}
                          </div>
                        `
                                : '—'
                        }
                    </td>
                    <td class="col-address">
                        <div class="no-addr-text">${NO.escapeHtml(o.address || '')}</div>
                        ${NO._deliveryBadgeHtml(o)}
                    </td>
                    <td class="col-money web2-cell-money">${total}${mergedQtyHtml}</td>
                    <td class="col-qty web2-cell-center">${qty || ''}</td>
                    <td class="col-message web2-cell-center" onclick="event.stopPropagation();NativeOrdersApp.openInteractions('${NO.escapeHtml(o.code)}','messages')">
                        <span class="web2-count-pill web2-count-msg ${Number(o.messageCount) > 0 ? '' : 'is-empty'}" title="Mở tin nhắn">
                            <i data-lucide="message-circle" style="width:11px;height:11px;"></i>
                            ${Number(o.messageCount) > 0 ? o.messageCount : '0'}
                        </span>
                    </td>
                    <td class="col-comment web2-cell-center" onclick="event.stopPropagation();NativeOrdersApp.openInteractions('${NO.escapeHtml(o.code)}','comments')">
                        <span class="web2-count-pill web2-count-cmt ${Number(o.commentCount) > 0 ? '' : 'is-empty'}" title="${o.commentCount || 0} bình luận">
                            <i data-lucide="message-square" style="width:11px;height:11px;"></i>
                            ${o.commentCount || 0}
                        </span>
                    </td>
                    <td class="col-customerComment">${
                        o.note
                            ? `<div class="web2-note-cell" title="${NO.escapeHtml(o.note)}">${NO.escapeHtml(o.note)}</div>`
                            : '<span class="web2-count-empty">—</span>'
                    }</td>
                    <td class="col-userNote">${
                        o.userNote
                            ? `<div class="web2-note-cell" title="${NO.escapeHtml(o.userNote)}">${NO.escapeHtml(o.userNote)}</div>`
                            : '<span class="web2-count-empty">—</span>'
                    }</td>
                    <td class="col-employee">${NO.escapeHtml(o.assignedEmployeeName || o.createdByName || '—')}</td>
                    <td class="col-time web2-date-cell center" title="${NO.escapeHtml(NO.formatFullTime(o.createdAt))}">
                        ${time.date}/${new Date(Number(o.createdAt)).getFullYear()}<br>${time.hour}
                    </td>
                </tr>`;
        return isExpanded ? mainRow + NO._renderExpandRow(o) : mainRow;
    };

    // Signature cho 1 row — gồm mọi field hiển thị + trạng thái expand. SSE ping
    // với cùng signature → reuse DOM element (no flicker, no image reload).
    NO._rowSignature = function _rowSignature(o) {
        const expanded = NO.STATE.expandedOrders.has(o.code) ? '1' : '0';
        const products = (o.products || [])
            .map(
                (p) =>
                    `${p.productCode || ''}|${p.quantity || 0}|${p.imageUrl || ''}|${p.name || ''}|${p.price || 0}`
            )
            .join(';');
        return [
            o.code,
            o.displayStt ?? '',
            o.splitIndex || 0,
            JSON.stringify(o.mergedDisplayStt || ''),
            o.status,
            o.customerName || '',
            o.phone || '',
            o.address || '',
            o.note || '',
            o.totalQuantity || 0,
            Number(o.totalAmount) || 0,
            Number(o.deposit) || 0,
            o.commentCount || 0,
            o.messageCount || 0,
            o.partnerStatus || '',
            o.customerId || '',
            JSON.stringify(o.tags || []),
            // 2026-06-22: autoTags (cột "Thẻ") ĐÃ TÁCH khỏi chữ ký "rest" này → theo dõi
            // riêng ở _rowTagSignature. Lý do: khi CHỈ tag đổi → cập nhật cell .col-tag
            // TẠI CHỖ (giữ DOM avatar + cell khác, animate pill mới mượt) thay vì rebuild
            // cả row (tránh giật + tránh avatar reload). hasChoHang VẪN ở đây vì nó đổi
            // nút col-actions (chặn PBH) → đổi là phải rebuild cả row.
            o.hasChoHang ? '1' : '0',
            o.deliveryMethod || '',
            o.deliveryMethodManual ? '1' : '0',
            o.pbhResidual ?? '',
            o.pbhTotal ?? '',
            o.pbhFulfillmentState || '',
            o.pbhCarrierName || '',
            expanded,
            products,
            o.updatedAt || 0,
            // audit r7: ckSignal (badge "💸 KH báo đã CK") đổi qua SSE web2:payment-signals
            // KHÔNG bump native_orders.updated_at → nếu thiếu ở chữ ký, row tái dùng DOM
            // (26 field kia giống) sẽ KHÔNG re-render badge → KH báo CK mà badge không hiện.
            o.ckSignal ? `${o.ckSignal.id || ''}:${o.ckSignal.status || ''}` : '',
        ].join('||');
    };

    // Chữ ký RIÊNG cho cột "Thẻ" (autoTags) — tách khỏi _rowSignature để khi CHỈ tag
    // đổi thì cập nhật cell .col-tag tại chỗ (mượt, animate pill mới) thay vì rebuild row.
    NO._rowTagSignature = function _rowTagSignature(o) {
        return JSON.stringify(o.autoTags || []);
    };
    // Set các trigger của tag hiện tại — để diff ra tag MỚI (animate "pop vào").
    NO._rowTagTriggers = function _rowTagTriggers(o) {
        const s = new Set();
        (o.autoTags || []).forEach((t) => {
            if (t && t.trigger) s.add(t.trigger);
        });
        return s;
    };

    NO.renderRows = function renderRows() {
        // _visibleOrders áp thẻ (client-side); rỗng/chưa load module filters → toàn bộ.
        const orders = NO._visibleOrders ? NO._visibleOrders() : NO.STATE.orders;
        const tb = NO.tbody();
        if (!orders.length) {
            tb.replaceChildren();
            const hasFilter = !!(
                NO.STATE.search ||
                (NO.STATE.status && NO.STATE.status !== 'all') ||
                NO.STATE.tagFilter ||
                (NO.STATE.selectedCampaignIds && NO.STATE.selectedCampaignIds.length)
            );
            const clearBtn = hasFilter
                ? `<button onclick="window._noClearFilters&&window._noClearFilters()" style="margin-top:12px;padding:7px 18px;background:#0068ff;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i data-lucide="x-circle" style="width:15px;height:15px;"></i>Xóa bộ lọc</button>`
                : '';
            tb.insertAdjacentHTML(
                'beforeend',
                `<tr><td colspan="16" class="empty-row" style="padding:40px;text-align:center;color:#64748b">
                    <i data-lucide="${hasFilter ? 'search-x' : 'inbox'}" style="width:38px;height:38px;color:#bcdcff;display:block;margin:0 auto 8px"></i>
                    <div style="font-weight:700;color:#0f172a;margin-bottom:3px">${hasFilter ? 'Không có đơn khớp bộ lọc' : 'Chưa có đơn nào'}</div>
                    <div style="font-size:13px">${hasFilter ? 'Thử đổi bộ lọc / từ khoá tìm kiếm.' : 'Đơn web mới sẽ hiện ở đây.'}</div>
                    ${clearBtn}
                </td></tr>`
            );
            // Wire clear-filters button — clearFilters() is a closure in this IIFE,
            // so expose it transiently via a module-scoped var checked in the handler.
            window._noClearFilters = NO.clearFilters;
            if (window.lucide) lucide.createIcons();
            tb._rowSigs = new Map();
            tb._rowTagSigs = new Map();
            tb._rowTagSets = new Map();
            return;
        }
        if (!tb._rowSigs) tb._rowSigs = new Map();
        if (!tb._rowTagSigs) tb._rowTagSigs = new Map();
        if (!tb._rowTagSets) tb._rowTagSets = new Map();
        const sigs = tb._rowSigs;
        const tagSigs = tb._rowTagSigs;
        const tagSets = tb._rowTagSets;
        // Index existing DOM elements by code (main row + expand-row).
        const existing = new Map();
        Array.from(tb.children).forEach((el) => {
            const code = el.dataset?.code || el.dataset?.for;
            if (!code) return;
            if (!existing.has(code)) existing.set(code, []);
            existing.get(code).push(el);
        });

        const fragment = document.createDocumentFragment();
        const newCodes = new Set();
        let rebuiltCount = 0;
        for (const o of orders) {
            newCodes.add(o.code);
            const sig = NO._rowSignature(o);
            const oldSig = sigs.get(o.code);
            const tagSig = NO._rowTagSignature(o);
            const oldTagSig = tagSigs.get(o.code);
            const newTagTriggers = NO._rowTagTriggers(o);
            const oldTagTriggers = tagSets.get(o.code);
            // Trigger của THẺ vừa MỚI (có ở lần này, chưa có lần trước) → pill đó "pop vào".
            // null khi row mới thấy lần đầu → KHÔNG animate (tránh nhảy hết pill lúc load).
            const enterTriggers = oldTagTriggers
                ? new Set([...newTagTriggers].filter((tr) => !oldTagTriggers.has(tr)))
                : null;
            if (oldSig === sig && existing.has(o.code)) {
                // "rest" giống → tái dùng DOM (no flicker, no image reload).
                const els = existing.get(o.code);
                if (oldTagSig !== tagSig) {
                    // CHỈ cột "Thẻ" đổi → cập nhật cell .col-tag TẠI CHỖ + animate pill mới,
                    // KHÔNG rebuild cả row (giữ avatar + cell khác → hết giật, hết reload ảnh).
                    const mainRow =
                        els.find((el) => el.classList && el.classList.contains('order-row')) ||
                        els[0];
                    const cell =
                        mainRow && mainRow.querySelector ? mainRow.querySelector('.col-tag') : null;
                    if (cell) {
                        o._enterTriggers = enterTriggers;
                        cell.innerHTML = NO._autoTagPills(o);
                        delete o._enterTriggers;
                    }
                }
                els.forEach((el) => fragment.appendChild(el));
            } else {
                // "rest" đổi (hoặc row mới) → rebuild cả row. Animate tag mới nếu row đã tồn tại.
                o._enterTriggers = enterTriggers;
                const html = NO._buildOrderHtml(o);
                const tmp = document.createElement('tbody');
                tmp.innerHTML = html;
                while (tmp.firstChild) fragment.appendChild(tmp.firstChild);
                delete o._enterTriggers;
                sigs.set(o.code, sig);
                rebuiltCount++;
            }
            tagSigs.set(o.code, tagSig);
            tagSets.set(o.code, newTagTriggers);
        }
        // Clean up sigs for codes no longer present
        for (const code of Array.from(sigs.keys())) {
            if (!newCodes.has(code)) sigs.delete(code);
        }
        for (const code of Array.from(tagSigs.keys())) {
            if (!newCodes.has(code)) {
                tagSigs.delete(code);
                tagSets.delete(code);
            }
        }
        // Single atomic swap
        tb.replaceChildren(fragment);

        // Gỡ class .w2-otag-enter SAU khi animation chạy xong (once) → pill không "pop"
        // lại mỗi lần render kế. Lý do: renderRows move row reused ra/vào document qua
        // fragment → class animation còn sót có thể bị trình duyệt chạy lại animation.
        tb.querySelectorAll('.w2-otag-enter').forEach((p) =>
            p.addEventListener('animationend', () => p.classList.remove('w2-otag-enter'), {
                once: true,
            })
        );

        // Lucide only re-processes <i data-lucide> nodes (idempotent skip <svg>).
        // Reused rows already have <svg> rendered → no work; new rows get icons created.
        if (window.lucide) lucide.createIcons();
        if (window.Web2NewMsgBadge?.reapply) window.Web2NewMsgBadge.reapply();
        // Số dư ví KH cho row có SĐT (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(tb);
        // Tab Inbox: đơn chưa có fb_id → resolve avatar theo SĐT (chạy nền).
        if (NO.STATE.channel === 'web2_inbox') {
            setTimeout(() => NO._hydrateInboxAvatars(), 0);
        }
    };

    NO.toggleExpand = function toggleExpand(code) {
        // Surgical DOM update — don't re-render the whole tbody (that would
        // destroy avatar <img> elements and cause a visible flicker while
        // they reload from cache). Only touch the one row + its expand sibling.
        const tb = NO.tbody();
        const mainRow = tb?.querySelector(`tr.order-row[data-code="${CSS.escape(code)}"]`);
        if (!mainRow) return;

        const isExpanded = NO.STATE.expandedOrders.has(code);
        const caret = mainRow.querySelector('.expand-caret');

        const swapCaret = (name) => {
            if (!caret) return;
            const next = document.createElement('i');
            next.setAttribute('data-lucide', name);
            next.className = 'expand-caret';
            caret.replaceWith(next);
        };

        if (isExpanded) {
            NO.STATE.expandedOrders.delete(code);
            mainRow.classList.remove('is-expanded');
            swapCaret('chevron-right');
            tb.querySelector(`tr.expand-row[data-for="${CSS.escape(code)}"]`)?.remove();
        } else {
            NO.STATE.expandedOrders.add(code);
            mainRow.classList.add('is-expanded');
            swapCaret('chevron-down');
            const order = NO.STATE.orders.find((x) => x.code === code);
            if (order) mainRow.insertAdjacentHTML('afterend', NO._renderExpandRow(order));
        }
        // Convert the newly inserted <i data-lucide> nodes only — existing
        // SVGs (avatars, status icons, etc.) in other rows stay untouched.
        if (window.lucide) lucide.createIcons();
    };

    NO.renderPagination = function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(NO.STATE.total / NO.STATE.limit));
        const cur = NO.STATE.page;
        const html = [];
        html.push(
            `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="NativeOrdersApp.goPage(${cur - 1})">‹</button>`
        );
        const start = Math.max(1, cur - 2);
        const end = Math.min(totalPages, start + 4);
        if (start > 1) {
            html.push(`<button class="page-btn" onclick="NativeOrdersApp.goPage(1)">1</button>`);
            if (start > 2) html.push(`<span class="page-info">…</span>`);
        }
        for (let p = start; p <= end; p++) {
            html.push(
                `<button class="page-btn ${p === cur ? 'active' : ''}" onclick="NativeOrdersApp.goPage(${p})">${p}</button>`
            );
        }
        if (end < totalPages) {
            if (end < totalPages - 1) html.push(`<span class="page-info">…</span>`);
            html.push(
                `<button class="page-btn" onclick="NativeOrdersApp.goPage(${totalPages})">${totalPages}</button>`
            );
        }
        html.push(
            `<button class="page-btn" ${cur >= totalPages ? 'disabled' : ''} onclick="NativeOrdersApp.goPage(${cur + 1})">›</button>`
        );
        html.push(
            `<span class="page-info">${NO.STATE.total.toLocaleString('vi-VN')} đơn — trang ${cur}/${totalPages}</span>`
        );
        NO.pag().innerHTML = html.join('');
    };

    NO._prevTotal = 0;

    NO.renderCounters = function renderCounters() {
        const totalStr = NO.STATE.total.toLocaleString('vi-VN');
        NO.counter().textContent = `${totalStr} đơn`;
        // Lọc thẻ (client-side) → "kết quả" hiện số đơn KHỚP THẺ trên trang, không phải
        // tổng server (animate count-up không hợp lý cho lọc cục bộ → set thẳng).
        if (NO.STATE.tagFilter) {
            const n = NO._visibleOrders ? NO._visibleOrders().length : NO.STATE.orders.length;
            NO.searchCount().textContent = n.toLocaleString('vi-VN');
            NO._prevTotal = NO.STATE.total;
            return;
        }
        // Count-up animation on the searchCount pill (numeric-only — keeps the
        // suffix safe). Only when delta exists and not the first render.
        if (window.Web2Effects?.countUp && NO._prevTotal > 0 && NO._prevTotal !== NO.STATE.total) {
            window.Web2Effects.countUp(NO.searchCount(), NO._prevTotal, NO.STATE.total, 600);
        } else {
            NO.searchCount().textContent = totalStr;
        }
        NO._prevTotal = NO.STATE.total;
    };

    // Phase 14: filter chip when scoping to a Customer 360 id
    NO.renderCustomerChip = function renderCustomerChip() {
        let chip = document.getElementById('nativeOrdersCustomerChip');
        if (!NO.STATE.customerId) {
            if (chip) chip.remove();
            return;
        }
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'nativeOrdersCustomerChip';
            chip.style.cssText =
                'display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:#e8f2ff;color:#004bb5;border:1px solid #bcdcff;border-radius:999px;font-size:12px;font-weight:600;margin:8px 0 12px 0;';
            const anchor = NO.$('#searchInfo') || NO.controlBar() || NO.tbody()?.closest('table');
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(chip, anchor);
            else document.body.appendChild(chip);
        }
        chip.innerHTML = `
            <i data-lucide="user-circle" style="width:14px;height:14px;color:#0068ff;"></i>
            Đang lọc theo Khách hàng #${NO.STATE.customerId}
            <button onclick="NativeOrdersApp.clearCustomerFilter()" title="Bỏ lọc" style="background:transparent;border:none;color:#004bb5;cursor:pointer;font-size:14px;line-height:1;padding:0 0 0 6px;">×</button>`;
        if (window.lucide) lucide.createIcons();
    };

    NO.filterByCustomer = function filterByCustomer(customerId) {
        if (!customerId) return;
        NO.STATE.customerId = Number(customerId);
        NO.STATE.page = 1;
        const url = new URL(location.href);
        url.searchParams.set('customerId', String(customerId));
        history.replaceState(null, '', url.toString());
        const modalEl = document.getElementById('customer360Modal');
        if (modalEl) modalEl.style.display = 'none';
        NO.load();
    };

    NO.clearCustomerFilter = function clearCustomerFilter() {
        NO.STATE.customerId = null;
        NO.STATE.page = 1;
        const url = new URL(location.href);
        url.searchParams.delete('customerId');
        history.replaceState(null, '', url.toString());
        NO.load();
    };

    // ---------- Data load ----------
    NO.load = async function load() {
        if (NO.STATE.loading) return;
        NO.STATE.loading = true;
        // CHỈ wipe tbody khi chưa có row nào — để giữ DOM nodes cho diff render
        // (SSE-driven reload bảo toàn DOM, sig diff chỉ thay row thay đổi).
        const tb = NO.tbody();
        const hasExistingRows = tb && tb.querySelector('tr.order-row');
        if (!hasExistingRows) {
            tb.innerHTML = `<tr><td colspan="16" class="loading-row">
                <div class="spinner"></div>Đang tải dữ liệu...
            </td></tr>`;
        }
        try {
            // Chiến dịch + chiến dịch cha là khái niệm RIÊNG của kênh Livestream
            // (đơn inbox không có fbPostId/campaign). Tab Inbox phải BỎ QUA các
            // filter này — nếu không, campaign livestream còn lưu trong
            // localStorage sẽ lọc sạch đơn inbox → bảng trống.
            const isInbox = NO.STATE.channel === 'web2_inbox';
            const resp = await window.NativeOrdersApi.list({
                status: NO.STATE.status,
                channel: NO.STATE.channel || undefined,
                search: NO.STATE.search || undefined,
                page: NO.STATE.page,
                limit: NO.STATE.limit,
                campaignIds:
                    !isInbox && NO.STATE.selectedCampaignIds.length
                        ? NO.STATE.selectedCampaignIds
                        : undefined,
                // Chiến dịch cha (chung live-chat): lọc theo tập post của parent.
                fbPostIds:
                    !isInbox && NO.STATE.parentPostIds && NO.STATE.parentPostIds.length
                        ? NO.STATE.parentPostIds
                        : undefined,
                customerId: NO.STATE.customerId || undefined,
            });
            NO.STATE.orders = resp.orders || [];
            NO.STATE.total = resp.total || 0;
            // Dựng lại options thẻ từ data mới (giữ lựa chọn nếu trigger còn xuất hiện).
            if (NO.populateTagFilterOptions) NO.populateTagFilterOptions();
            NO.renderRows();
            NO.renderPagination();
            NO.renderCounters();
            NO.renderCustomerChip();
        } catch (e) {
            console.error(e);
            // Chỉ hiển thị error row nếu chưa có dữ liệu (first load failed). SSE
            // refresh fail → giữ DOM cũ + toast notify.
            if (!hasExistingRows) {
                NO.tbody().innerHTML = `<tr><td colspan="16" class="empty-row" style="color:#ef4444;">
                    Lỗi tải dữ liệu: ${NO.escapeHtml(e.message)}
                </td></tr>`;
            }
            NO.notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            NO.STATE.loading = false;
        }
    };
})();
