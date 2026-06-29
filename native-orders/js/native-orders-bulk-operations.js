// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — selection + bulk merge/pbh/shop/send-message. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    NO.getSelectedCodes = function getSelectedCodes() {
        return Array.from(document.querySelectorAll('#ordersTbody .row-check:checked')).map(
            (c) => c.value
        );
    };

    NO.updateBulkBar = function updateBulkBar() {
        const codes = NO.getSelectedCodes();
        const bar = NO.$('#ordersBulkBar');
        if (!bar) return;
        if (codes.length === 0) {
            bar.style.display = 'none';
        } else {
            bar.style.display = 'flex';
            const countEl = NO.$('#ordersBulkCount');
            if (countEl) countEl.textContent = String(codes.length);
        }
    };

    NO.unselectAllOrders = function unselectAllOrders() {
        document.querySelectorAll('#ordersTbody .row-check:checked').forEach((c) => {
            c.checked = false;
        });
        const ca = NO.$('#checkAll');
        if (ca) ca.checked = false;
        NO.updateBulkBar();
    };

    // Gộp 2+ Đơn Web cùng SĐT → 1 Đơn Web mới (STT "1 + 2"). KHÔNG tạo PBH.
    // Đơn gốc bị xóa, đơn mới hiện trong list như Đơn Web bình thường — user
    // có thể click "Tạo PBH" sau hoặc dùng bulk Tạo PBH hàng loạt.
    NO.bulkMergeOrders = async function bulkMergeOrders() {
        const codes = NO.getSelectedCodes();
        if (codes.length < 2) {
            NO.notify('Cần chọn ít nhất 2 đơn để gộp', 'warning');
            return;
        }
        const orders = codes.map((c) => NO.STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (orders.length !== codes.length) {
            NO.notify('Không tìm thấy đơn trong state', 'error');
            return;
        }
        // Preflight: cùng SĐT (KHÔNG cần validate đủ address/products vì chỉ gộp)
        const phones = new Set(orders.map((o) => (o.phone || '').trim()));
        if (phones.size > 1) {
            NO.notify(
                `Phải cùng SĐT. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
                'error'
            );
            return;
        }
        const phone = Array.from(phones)[0] || '(chưa có SĐT)';
        const customerName = orders[0].customerName || '';
        // STT confirm phải khớp list: dùng computeOrderStt (ưu tiên campaignStt cho
        // đơn livestream) thay vì displayStt trần (audit r3 HIGH 2026-06-21).
        const stts = orders
            .map((o) => {
                const n = parseInt(NO.computeOrderStt(o), 10);
                return Number.isFinite(n) ? n : 0;
            })
            .filter(Boolean)
            .sort((a, b) => a - b);
        const totalQty = orders.reduce(
            (s, o) => s + (o.products || []).reduce((q, p) => q + (Number(p.quantity) || 0), 0),
            0
        );
        const totalAmt = orders.reduce(
            (s, o) =>
                s +
                (o.products || []).reduce(
                    (q, p) => q + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                    0
                ),
            0
        );

        const proceed = await window.Popup.confirm(
            `Gộp ${orders.length} Đơn Web của KH ${customerName} (${phone}) thành 1 đơn?\n\n` +
                `STT mới hiển thị: "${stts.join(' + ')}"\n` +
                `Tổng SL: ${totalQty} sản phẩm — ${Number(totalAmt).toLocaleString('vi-VN')}đ\n\n` +
                `⚠️ Các đơn gốc (${codes.join(', ')}) sẽ BỊ XÓA và thay bằng 1 Đơn Web mới (chưa tạo PBH).`,
            { title: 'Gộp Đơn Web', okText: 'Gộp đơn', type: 'warning' }
        );
        if (!proceed) return;

        try {
            const mergeHeaders = { 'Content-Type': 'application/json' };
            if (window.Web2Auth?.authHeaders) {
                Object.assign(mergeHeaders, window.Web2Auth.authHeaders());
            } else {
                try {
                    const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                    if (t) mergeHeaders['x-web2-token'] = t;
                } catch {
                    /* ignore */
                }
            }
            const r = await fetch(`${NO.WORKER_URL}/api/native-orders/merge`, {
                method: 'POST',
                headers: mergeHeaders,
                body: JSON.stringify({ codes }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            NO.notify(
                `✅ Đã gộp ${orders.length} đơn → ${data.order.code} (STT ${data.mergedStts.join(' + ')})`,
                'success'
            );
            NO.unselectAllOrders();
            NO.load();
        } catch (e) {
            NO.notify('Lỗi gộp đơn: ' + e.message, 'error');
        }
    };

    // Bulk send template message — port từ orders-report MessageTemplateManager.
    // Lookup order data → convert sang shape mà Web2MsgTemplate hiểu →
    // delegate cho `Web2MsgTemplate.open({orders})`. Module này tự handle UI
    // template + send loop + global_id resolution + extension fallback chain.
    NO.bulkSendMessage = async function bulkSendMessage() {
        const codes = NO.getSelectedCodes();
        if (!codes.length) {
            NO.notify('Chưa chọn đơn nào', 'warning');
            return;
        }
        if (!window.Web2MsgTemplate?.open) {
            NO.notify('Web2MsgTemplate chưa load — kiểm tra script', 'error');
            return;
        }
        const rawOrders = codes
            .map((c) => NO.STATE.orders.find((o) => o.code === c))
            .filter(Boolean);
        if (!rawOrders.length) {
            NO.notify('Không tìm thấy đơn', 'error');
            return;
        }
        // Bỏ qua đơn SL=0 (giỏ trống — chưa nhập sản phẩm hoặc draft rỗng). Gửi
        // tin nhắn "đã đặt sản phẩm gồm: ..." cho đơn không sản phẩm rất kỳ.
        const orders = [];
        let skippedEmpty = 0;
        for (const o of rawOrders) {
            const totalQty = (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
            if (totalQty <= 0) {
                skippedEmpty++;
                continue;
            }
            orders.push(o);
        }
        if (skippedEmpty > 0) {
            NO.notify(
                `Bỏ qua ${skippedEmpty} đơn SL=0 (giỏ trống) · còn ${orders.length} đơn để gửi`,
                'info'
            );
        }
        if (!orders.length) {
            NO.notify('Tất cả đơn được chọn đều SL=0 — không có gì để gửi', 'warning');
            return;
        }
        // Convert sang shape Web2MsgTemplate cần. Conversation lookup: nếu order
        // chưa có conversationId (truth nguồn từ Pancake), fetch nhanh qua Web2Chat.
        const enriched = [];
        for (const o of orders) {
            const lines = (o.products || []).map((p) => ({
                productName: p.name || p.productName || p.productCode || '?',
                qty: Number(p.quantity) || 1,
                price: Number(p.price) || 0,
            }));
            let conversationId = null;
            let customerUuid = null;
            let threadId = null;
            if (window.Web2Chat && o.fbPageId && o.fbUserId) {
                try {
                    const r = await window.Web2Chat.fetchConversations(o.fbPageId, o.fbUserId);
                    if (r?.ok && r.conversations?.length) {
                        const conv = r.conversations[0];
                        conversationId = conv.id || null;
                        customerUuid = r.customerUuid || conv.customers?.[0]?.id || null;
                        threadId = conv.thread_id || conv.threadId || null;
                    }
                } catch (_) {
                    /* skip */
                }
            }
            const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
            enriched.push({
                code: o.code,
                customerName: o.customerName || '',
                fbUserName: o.fbUserName || '',
                phone: o.phone || '',
                address: o.address || '',
                fbPageId: o.fbPageId || '',
                fbUserId: o.fbUserId || '',
                conversationId,
                customerUuid,
                threadId,
                lines,
                total,
            });
        }
        await window.Web2MsgTemplate.open({ orders: enriched });
    };

    // Phase 15: bulk-create PBH. Opens a management modal that lists every
    // selected order with its readiness status; user can apply shared
    // delivery / date / note OR per-row override (just delivery for now),
    // then submit creates PBH sequentially with a live progress bar.
    NO.bulkCreatePbh = async function bulkCreatePbh() {
        const codes = NO.getSelectedCodes();
        if (codes.length === 0) {
            NO.notify('Chưa chọn đơn nào', 'warning');
            return;
        }
        const allSel = codes.map((c) => NO.STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (allSel.length === 0) {
            NO.notify('Không tìm thấy đơn', 'error');
            return;
        }
        // Đơn "Đơn hàng" (status confirmed) ĐÃ CÓ PBH → KHÔNG tạo PBH lại. Chỉ
        // đơn Nháp mới tạo được PBH.
        // 2026-06-21: đơn nháp CÓ SP chờ hàng (o.hasChoHang) cũng KHÔNG tạo PBH —
        // phải tạo Phiếu soạn hàng (dùng "In bill"). Tách riêng để báo rõ.
        const draftAll = allSel.filter((o) => o.status === 'draft');
        const choHangOrders = draftAll.filter((o) => o.hasChoHang);
        const orders = draftAll.filter((o) => !o.hasChoHang);
        const skipped = allSel.length - draftAll.length;
        if (orders.length === 0) {
            if (choHangOrders.length) {
                NO.notify(
                    `${choHangOrders.length} đơn có SP chờ hàng — không tạo PBH. Dùng "In bill" để tạo Phiếu soạn hàng.`,
                    'warning'
                );
            } else {
                NO.notify(
                    'Đơn đã có PBH — không tạo PBH lại (chỉ giỏ hàng chưa PBH mới tạo được).',
                    'warning'
                );
            }
            return;
        }
        const _skipNotes = [];
        if (skipped > 0) _skipNotes.push(`${skipped} đơn "Đơn hàng" (đã có PBH)`);
        if (choHangOrders.length)
            _skipNotes.push(`${choHangOrders.length} đơn chờ hàng (tạo Phiếu soạn hàng riêng)`);
        if (_skipNotes.length)
            NO.notify(
                `Bỏ qua ${_skipNotes.join(' + ')} — tạo PBH cho ${orders.length} đơn`,
                'info'
            );
        const DMP = window.DeliveryMethodPicker;
        // Phase 17: load backend options once for both per-row pick + dropdown
        const deliveryOpts = DMP ? await DMP.getOptionsAsync() : [];

        // Compute per-row validation + auto-picked delivery option
        const rows = orders.map((o) => {
            const v = NO.validateOrderForPbh(o);
            // Bulk: dùng pickOffline (fuzzy + province) — KHÔNG gọi Goong per-row
            // để tránh đốt quota; cross-check Goong chỉ ở tạo PBH đơn lẻ.
            const pick = DMP ? (DMP.pickOffline || DMP.pick)(o.address || '', deliveryOpts) : null;
            const totalQty = (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
            const totalAmt = (o.products || []).reduce(
                (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                0
            );
            return {
                code: o.code,
                customerName: o.customerName || '—',
                phone: o.phone || '',
                address: o.address || '',
                totalQty,
                totalAmt,
                valid: v.ok,
                missing: v.missing,
                pickedValue: pick?.option?.value || '',
                pickedLabel: pick?.option?.label || '',
                pickedPrice: pick?.option?.price || 0,
                // BUG FIX (2026-06-24): giữ confidence/note để CẢNH BÁO khi auto-pick
                // độ tin cậy thấp (vd tên tỉnh nằm trong địa chỉ HCM → ship tỉnh nhầm).
                // Trước đây bulk bỏ qua → bill phí sai im lặng.
                pickedConfidence: pick?.confidence || '',
                pickedNote: pick?.note || '',
            };
        });
        const validCount = rows.filter((r) => r.valid).length;
        const invalidCount = rows.length - validCount;

        const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
        const today = new Date().toISOString().slice(0, 10);

        const rowsHtml = rows
            .map(
                (r) => `
            <tr style="border-top:1px solid #f1f5f9;${r.valid ? '' : 'background:#fef2f2;'}">
                <td style="padding:8px 6px;font-weight:600;">${NO.escapeHtml(r.code)}</td>
                <td style="padding:8px 6px;">${NO.escapeHtml(r.customerName)}</td>
                <td style="padding:8px 6px;color:${r.phone ? '#0f172a' : '#dc2626'};">${NO.escapeHtml(r.phone || '⚠ thiếu')}</td>
                <td style="padding:8px 6px;color:${r.address ? '#0f172a' : '#dc2626'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${NO.escapeHtml(r.address || '')}">${NO.escapeHtml(r.address || '⚠ thiếu')}</td>
                <td style="padding:8px 6px;text-align:center;color:${r.totalQty > 0 ? '#0f172a' : '#dc2626'};">${r.totalQty > 0 ? r.totalQty : '⚠ 0'}</td>
                <td style="padding:8px 6px;text-align:right;color:#10b981;font-weight:600;">${fmt(r.totalAmt)}đ</td>
                <td style="padding:8px 6px;text-align:center;">
                    ${
                        r.valid
                            ? `<span style="color:#10b981;">✓ Sẵn sàng</span>${
                                  r.pickedConfidence && r.pickedConfidence !== 'high'
                                      ? `<br><span style="color:#f59e0b;font-size:11px;" title="${NO.escapeHtml(r.pickedNote || 'Độ tin cậy thấp — kiểm tra phương thức giao')}">⚠ phí auto ${fmt(r.pickedPrice)}đ — KIỂM TRA</span>`
                                      : ''
                              }`
                            : `<span style="color:#dc2626;">⚠ Thiếu ${NO.escapeHtml(r.missing.join(', '))}</span>`
                    }
                </td>
            </tr>`
            )
            .join('');

        const html = `
            <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;color:#334155;">
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:999px;font-weight:600;font-size:12px;">✓ ${validCount} sẵn sàng</span>
                    ${invalidCount > 0 ? `<span style="background:#fee2e2;color:#991b1b;padding:4px 10px;border-radius:999px;font-weight:600;font-size:12px;">⚠ ${invalidCount} thiếu SĐT / địa chỉ / sản phẩm</span>` : ''}
                </div>
                <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                        <thead style="background:#f8fafc;">
                            <tr>
                                <th style="padding:8px 6px;text-align:left;width:130px;">Mã</th>
                                <th style="padding:8px 6px;text-align:left;width:110px;">Khách</th>
                                <th style="padding:8px 6px;text-align:left;width:100px;">SĐT</th>
                                <th style="padding:8px 6px;text-align:left;">Địa chỉ</th>
                                <th style="padding:8px 6px;text-align:center;width:50px;">SL</th>
                                <th style="padding:8px 6px;text-align:right;width:90px;">Tổng</th>
                                <th style="padding:8px 6px;text-align:center;width:130px;">Trạng thái</th>
                            </tr>
                        </thead>
                    </table>
                    <!-- Body in own .w2p-scroll-area (GPU layer + contain:paint).
                         See docs/web2-modal-conventions.md. -->
                    <div class="w2p-scroll-area" style="max-height:240px;">
                        <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                            <colgroup>
                                <col style="width:130px;">
                                <col style="width:110px;">
                                <col style="width:100px;">
                                <col>
                                <col style="width:50px;">
                                <col style="width:90px;">
                                <col style="width:130px;">
                            </colgroup>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
                <fieldset style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin:0;">
                    <legend style="padding:0 8px;font-weight:700;color:#475569;font-size:12px;">Cài đặt áp dụng cho TẤT CẢ đơn hợp lệ</legend>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
                        <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;grid-column:1/-1;">
                            <span style="display:flex;align-items:center;gap:6px;">
                                Phương thức giao hàng
                                <small style="color:#64748b;font-weight:400;">(mặc định: auto-pick theo từng đơn)</small>
                            </span>
                            <select id="bulkDeliveryMethod"
                                style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;background:#fff;">
                                <option value="" selected>— Auto-pick theo địa chỉ từng đơn —</option>
                                ${deliveryOpts
                                    .map(
                                        (o) =>
                                            `<option value="${NO.escapeHtml(o.value)}" data-price="${o.price || 0}">${NO.escapeHtml(o.label)}${o.price ? ' — ' + fmt(o.price) + 'đ' : ''}</option>`
                                    )
                                    .join('')}
                            </select>
                        </label>
                        <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                            Ngày HĐ
                            <input id="bulkDateInvoice" type="date" value="${today}"
                                style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                            Ghi chú chung (áp cho tất cả)
                            <input id="bulkComment" type="text" placeholder="Tuỳ chọn"
                                style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                        </label>
                    </div>
                </fieldset>
                <div id="bulkProgress" style="display:none;font-size:12px;color:#475569;">
                    <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                        <div id="bulkProgressBar" style="height:100%;background:#0068ff;width:0;transition:width 200ms;"></div>
                    </div>
                    <div id="bulkProgressLabel" style="margin-top:6px;"></div>
                </div>
            </div>`;

        const submit = await NO.openCustomFormPopup({
            title: `Tạo PBH hàng loạt — ${codes.length} đơn`,
            iconName: 'layers',
            html,
            okText: validCount > 0 ? `Tạo ${validCount} PBH` : 'Không có đơn hợp lệ',
            cancelText: 'Đóng',
            okDisabled: validCount === 0,
            maxWidth: 760,
            collect: (root) => {
                const sel = root.querySelector('#bulkDeliveryMethod');
                const selectedOpt = sel?.options?.[sel.selectedIndex];
                return {
                    sharedDeliveryValue: sel?.value || '',
                    sharedDeliveryLabel: selectedOpt
                        ? selectedOpt.textContent.replace(/\s*—\s*[\d.,]+đ\s*$/, '').trim()
                        : '',
                    sharedDeliveryPrice: Number(selectedOpt?.dataset?.price || 0),
                    dateInvoice: NO._dateInputToIsoWithNowTime(
                        root.querySelector('#bulkDateInvoice').value
                    ),
                    comment: root.querySelector('#bulkComment').value.trim() || null,
                };
            },
        });
        if (!submit || validCount === 0) return;

        // Submit sequentially with live progress (modal stays open showing progress)
        // We re-open a simple progress popup since the form is dismissed
        const progressModal = document.createElement('div');
        progressModal.className = 'w2p-overlay';
        progressModal.innerHTML = `
            <div class="w2p-card" style="max-width:480px;padding:22px 26px;">
                <strong style="font-size:15px;color:#0f172a;display:block;margin-bottom:12px;">Đang tạo PBH…</strong>
                <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                    <div id="pgBar" style="height:100%;background:#0068ff;width:0;transition:width 200ms;"></div>
                </div>
                <div id="pgLabel" style="margin-top:8px;font-size:12px;color:#475569;">0 / ${validCount}</div>
                <ul id="pgList" style="margin:10px 0 0;padding:0;list-style:none;max-height:180px;overflow:auto;font-size:12px;"></ul>
            </div>`;
        document.body.appendChild(progressModal);

        const validRows = rows.filter((r) => r.valid);
        const results = [];
        for (let i = 0; i < validRows.length; i++) {
            const r = validRows[i];
            const extras = {
                deposit: 0,
                paymentAmount: 0,
                dateInvoice: submit.dateInvoice,
                comment: submit.comment,
            };
            // Resolve delivery: shared override OR per-row auto-pick
            if (submit.sharedDeliveryValue) {
                extras.deliveryPrice = submit.sharedDeliveryPrice;
                extras.carrierName = submit.sharedDeliveryLabel;
            } else {
                extras.deliveryPrice = r.pickedPrice;
                extras.carrierName = r.pickedLabel
                    ? r.pickedLabel.replace(/\s*—\s*[\d.,]+đ\s*$/, '').trim()
                    : null;
            }
            try {
                const resp = await fetch(
                    `${NO.WORKER_URL}/api/fast-sale-orders/from-native-order`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                        },
                        body: JSON.stringify({ nativeOrderCode: r.code, ...extras }),
                    }
                );
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    // Prefer server-side message (vi-VN) over error code; nếu over_sell có
                    // violations thì gom vào message để row-error hiển thị tốt hơn.
                    let msg = data.message || data.error || `HTTP ${resp.status}`;
                    if (data.error === 'over_sell' && Array.isArray(data.violations)) {
                        msg +=
                            ' [' +
                            data.violations
                                .map((v) => `${v.code}:${v.requested}/${v.available}`)
                                .join(', ') +
                            ']';
                    }
                    throw new Error(msg);
                }
                results.push({ code: r.code, pbh: data.order.number, ok: true });
                progressModal
                    .querySelector('#pgList')
                    .insertAdjacentHTML(
                        'beforeend',
                        `<li style="color:#065f46;padding:2px 0;">✓ ${NO.escapeHtml(r.code)} → ${NO.escapeHtml(data.order.number)}</li>`
                    );
            } catch (e) {
                results.push({ code: r.code, ok: false, error: e.message });
                progressModal
                    .querySelector('#pgList')
                    .insertAdjacentHTML(
                        'beforeend',
                        `<li style="color:#991b1b;padding:2px 0;">✗ ${NO.escapeHtml(r.code)} — ${NO.escapeHtml(e.message)}</li>`
                    );
            }
            const done = i + 1;
            const pct = Math.round((done / validRows.length) * 100);
            progressModal.querySelector('#pgBar').style.width = pct + '%';
            progressModal.querySelector('#pgLabel').textContent = `${done} / ${validRows.length}`;
        }

        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        progressModal.remove();
        NO.notify(
            `Đã tạo ${okCount}/${validRows.length} PBH${failCount ? ` (${failCount} lỗi)` : ''}${invalidCount ? ` — ${invalidCount} đơn bỏ qua (thiếu data)` : ''}`,
            failCount ? 'warning' : 'success'
        );
        NO.unselectAllOrders();
        await NO.load();
    };
})();
