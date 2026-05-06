// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// TAB1 — CHAT ADDRESS DETECTOR + APPLY-TO-ORDER
// Detect message text chứa địa chỉ Việt Nam → render nút "📍 Thêm địa chỉ"
// trong msg-hover-actions (cho customer messages).
// Click → inline confirm trong message bubble → confirm → fetch order detail
// từ TPOS → update Address field → PUT SaleOnline_Order(id) update.
// Snapshot saved to OrderEditHistory trước update để restore.
// =====================================================

(function () {
    'use strict';
    if (window.__chatAddressLoaded) return;
    window.__chatAddressLoaded = true;

    const TPOS_API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';

    // ===== Address detection heuristic =====
    // Vietnamese địa chỉ có ít nhất 2 trong các keywords + thường kèm phone.
    const ADDRESS_KEYWORDS = [
        /\bphường\s+/i,
        /\bp\.\s*\d/i, // "P.16"
        /\bquận\s+/i,
        /\bq\.\s*\d/i, // "Q.11"
        /\bhuyện\s+/i,
        /\btỉnh\s+/i,
        /\btp\.?\s+/i, // "TP HCM" / "Tp."
        /\bthành\s*phố\s+/i,
        /\bđường\s+/i,
        /\b(?:kp|khu\s*phố)\s+/i,
        /\b(?:thôn|xã|ấp)\s+/i,
        /\bsố\s+\d+/i,
    ];
    const PHONE_REGEX = /(?:\+?84|0)\d{9,10}\b/;

    function detectAddressInText(text) {
        if (!text || text.length < 20) return null;
        const t = String(text).trim();
        let kwHits = 0;
        for (const kw of ADDRESS_KEYWORDS) {
            if (kw.test(t)) kwHits++;
            if (kwHits >= 2) break;
        }
        const hasPhone = PHONE_REGEX.test(t);
        // Cần ít nhất 2 keyword OR (1 keyword + phone)
        if (kwHits >= 2 || (kwHits >= 1 && hasPhone)) {
            return { text: t, hasPhone };
        }
        return null;
    }

    // ===== Render button injection (called by chat-messages render path) =====
    /**
     * Trả về HTML cho action button "📍 Thêm địa chỉ".
     * Chỉ render khi msg.sender === 'customer' và text match address heuristic.
     */
    function buildAddressActionButton(msg) {
        if (!msg || msg.sender !== 'customer') return '';
        const detected = detectAddressInText(msg.text);
        if (!detected) return '';
        // data-msg-id để bind click handler runtime
        return `<button class="msg-action-btn msg-action-address" data-msg-id="${escapeAttr(msg.id)}" title="Thêm địa chỉ này vào đơn hàng"><i class="fas fa-map-marker-alt"></i></button>`;
    }

    function escapeAttr(s) {
        return String(s || '').replace(/"/g, '&quot;');
    }

    // ===== Click handler (event delegation on chat container) =====
    function _onAddressBtnClick(e) {
        const btn = e.target.closest('.msg-action-address');
        if (!btn) return;
        e.stopPropagation();
        const msgId = btn.getAttribute('data-msg-id');
        const msg = (window.allChatMessages || []).find((m) => String(m.id) === String(msgId));
        if (!msg) return;
        const detected = detectAddressInText(msg.text);
        if (!detected) return;

        // Render inline confirm trong message bubble
        const msgRow = btn.closest('.message-row');
        if (!msgRow) return;
        if (msgRow.querySelector('.msg-address-confirm')) return; // đã mở rồi

        const orderId = window.currentChatOrderId;
        const orderCode = orderId ? window.OrderStore?.get?.(orderId)?.Code : '';
        const previewLines = detected.text.split(/\r?\n/).filter(Boolean).slice(0, 5);

        const confirm = document.createElement('div');
        confirm.className = 'msg-address-confirm';
        confirm.innerHTML = `
            <div class="msg-addr-title">
                <i class="fas fa-map-marker-alt"></i> Thêm địa chỉ vào đơn
                ${orderCode ? `<strong>${escapeAttr(orderCode)}</strong>` : ''}?
            </div>
            <div class="msg-addr-preview">${previewLines.map((l) => `<div>${escapeAttr(l).replace(/&quot;/g, '"')}</div>`).join('')}</div>
            <div class="msg-addr-actions">
                <button class="msg-addr-btn msg-addr-cancel">Hủy</button>
                <button class="msg-addr-btn msg-addr-ok">Xác nhận</button>
            </div>
        `;
        const bubbleWrap = msgRow.querySelector('.message-bubble-wrap') || msgRow;
        bubbleWrap.appendChild(confirm);

        confirm.querySelector('.msg-addr-cancel').onclick = (ev) => {
            ev.stopPropagation();
            confirm.remove();
        };
        confirm.querySelector('.msg-addr-ok').onclick = async (ev) => {
            ev.stopPropagation();
            confirm.querySelector('.msg-addr-ok').disabled = true;
            confirm.querySelector('.msg-addr-ok').textContent = 'Đang lưu...';
            try {
                await applyAddressToOrder(orderId, detected.text);
                confirm.innerHTML = `<div class="msg-addr-success"><i class="fas fa-check-circle"></i> Đã cập nhật địa chỉ đơn ${escapeAttr(orderCode || orderId)}</div>`;
                setTimeout(() => confirm.remove(), 3000);
            } catch (err) {
                confirm.innerHTML = `<div class="msg-addr-error"><i class="fas fa-exclamation-triangle"></i> Lỗi: ${escapeAttr(err.message || 'unknown')}</div>`;
                setTimeout(() => confirm.remove(), 5000);
            }
        };
    }

    // ===== TPOS update flow =====
    /**
     * 1. Fetch current SaleOnline_Order với $expand=Details để có full payload
     * 2. Snapshot vào OrderEditHistory (cho restore)
     * 3. Build new payload: replace Address + có thể parse city/district/ward
     * 4. PUT to TPOS
     */
    async function applyAddressToOrder(orderId, addressText) {
        if (!orderId) throw new Error('Không có orderId');
        if (!addressText) throw new Error('Địa chỉ rỗng');

        const headers = await window.tokenManager.getAuthHeader();
        // Step 1: fetch full order
        const url = `${TPOS_API_BASE}/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
        const res = await window.API_CONFIG.smartFetch(url, {
            headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Fetch order HTTP ${res.status}`);
        const order = await res.json();

        // Step 2: snapshot vào OrderEditHistory (idempotent)
        if (window.OrderEditHistory) {
            window.OrderEditHistory.captureSnapshot(order.Id, order.Code, order.Details || []);
            window.OrderEditHistory.logChange(order.Id, 'address', {
                orderCode: order.Code,
                oldAddress: order.Address || '',
                newAddress: addressText,
                source: 'chat_message',
            });
        }

        // Step 3: build payload — keep most fields nguyên, override Address
        // (TPOS PUT yêu cầu full body với @odata.context).
        // Strip phone từ địa chỉ (phone đã có field Telephone riêng).
        const cleanAddress = addressText
            .replace(PHONE_REGEX, '')
            .replace(/\s{2,}/g, ' ')
            .trim();

        // Re-use prepareOrderPayload nếu available (tab1-edit-modal.js)
        let payload;
        if (typeof window.prepareOrderPayload === 'function') {
            // Cần currentEditOrderData mock cho prepareOrderPayload — clone order với Address mới
            const mock = { ...order, Address: cleanAddress };
            // prepareOrderPayload đọc currentEditOrderData global → tạm swap rồi restore
            const prevData = window.currentEditOrderData;
            try {
                window.currentEditOrderData = mock;
                payload = window.prepareOrderPayload(mock);
            } finally {
                window.currentEditOrderData = prevData;
            }
        } else {
            // Fallback minimal payload (chỉ thay Address)
            payload = { ...order, Address: cleanAddress };
        }

        // Step 4: PUT
        const putUrl = `${TPOS_API_BASE}/SaleOnline_Order(${orderId})`;
        const putRes = await window.API_CONFIG.smartFetch(putUrl, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!putRes.ok) {
            const errTxt = await putRes.text();
            throw new Error(`PUT HTTP ${putRes.status}: ${errTxt.slice(0, 100)}`);
        }

        // Update local OrderStore + invalidate edit modal cache
        if (window.OrderStore?.update) {
            window.OrderStore.update(orderId, { Address: cleanAddress });
        }
        if (typeof window.invalidateEditOrderCache === 'function') {
            window.invalidateEditOrderCache(orderId);
        }

        // Update row trong bảng (surgical replace)
        if (typeof window.updateOrderInTable === 'function') {
            window.updateOrderInTable(orderId, { Address: cleanAddress });
        }

        return true;
    }

    // ===== Wire event delegation on chat messages container =====
    function _attachListener() {
        const container = document.getElementById('chatMessages');
        if (!container) {
            setTimeout(_attachListener, 500);
            return;
        }
        if (container.__addrListener) return;
        container.addEventListener('click', _onAddressBtnClick);
        container.__addrListener = true;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _attachListener);
    } else {
        _attachListener();
    }

    window.detectAddressInText = detectAddressInText;
    window.buildAddressActionButton = buildAddressActionButton;
    window.applyAddressToOrder = applyAddressToOrder;
})();
