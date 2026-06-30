// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — hover customer side-panel (fetch + render) + manual WEB2 fetch. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ====================================================================
    // Customer side-panel — slide-in từ phải viewport. Hover avatar 500ms
    // → fetch + slide-in. Mouse rời avatar VÀ panel → 250ms delay → ẩn.
    // KHÔNG overlap row content (panel ở right edge, fixed position).
    // 3-source data: Pancake conversation + customers table + WEB2 Partner live.
    // ====================================================================
    NO._custPanelCache = new Map();
    // fbUserId → { data, ts }
    NO._CUST_PANEL_TTL = 15 * 60 * 1000;

    NO._custPanelEl = null;

    NO._custPanelShowTimer = null;

    NO._custPanelHideTimer = null;

    NO._custPanelAbort = null;

    NO._custPanelToken = 0;

    NO._custPanelActiveFbId = null;

    NO._ensureCustPanelEl = function _ensureCustPanelEl() {
        if (NO._custPanelEl) return NO._custPanelEl;
        const el = document.createElement('aside');
        el.id = 'nativeCustSidePanel';
        el.className = 'native-cust-panel';
        el.setAttribute('aria-hidden', 'true');
        // Hover panel → keep visible
        el.addEventListener('mouseenter', () => {
            clearTimeout(NO._custPanelHideTimer);
        });
        el.addEventListener('mouseleave', () => {
            NO._scheduleCustPanelHide(250);
        });
        document.body.appendChild(el);
        NO._custPanelEl = el;
        return el;
    };

    NO._showCustPanel = function _showCustPanel() {
        const el = NO._ensureCustPanelEl();
        el.classList.add('is-open');
        el.setAttribute('aria-hidden', 'false');
    };

    NO._hideCustPanel = function _hideCustPanel() {
        if (!NO._custPanelEl) return;
        NO._custPanelEl.classList.remove('is-open');
        NO._custPanelEl.setAttribute('aria-hidden', 'true');
        NO._custPanelActiveFbId = null;
    };

    NO._scheduleCustPanelHide = function _scheduleCustPanelHide(delay = 250) {
        clearTimeout(NO._custPanelHideTimer);
        NO._custPanelHideTimer = setTimeout(NO._hideCustPanel, delay);
    };

    NO._renderCustPanelContent = function _renderCustPanelContent({
        loading,
        data,
        error,
        fallback,
    }) {
        const el = NO._ensureCustPanelEl();
        if (loading) {
            el.innerHTML = `
                <header class="ncp-head">
                    <div class="ncp-skeleton-avatar"></div>
                    <div style="flex:1;">
                        <div class="ncp-skeleton-line" style="width:60%;"></div>
                        <div class="ncp-skeleton-line" style="width:40%;margin-top:6px;height:10px;"></div>
                    </div>
                    <button class="ncp-close" type="button" aria-label="Đóng">×</button>
                </header>
                <div class="ncp-body">
                    <div class="ncp-skeleton-block"></div>
                    <div class="ncp-skeleton-block" style="margin-top:8px;height:60px;"></div>
                </div>
            `;
            el.querySelector('.ncp-close')?.addEventListener('click', NO._hideCustPanel);
            return;
        }
        if (error) {
            el.innerHTML = `
                <header class="ncp-head">
                    <div style="flex:1;font-weight:600;color:#dc2626;">Lỗi tải dữ liệu</div>
                    <button class="ncp-close" type="button" aria-label="Đóng">×</button>
                </header>
                <div class="ncp-body">
                    <div style="color:#dc2626;font-size:13px;">${NO.escapeHtml(error)}</div>
                    <div style="margin-top:10px;color:#6b7280;font-size:12.5px;">${NO.escapeHtml(fallback?.name || '—')} · ${NO.escapeHtml(fallback?.phone || '')}</div>
                </div>
            `;
            el.querySelector('.ncp-close')?.addEventListener('click', NO._hideCustPanel);
            return;
        }
        const d = data || {};
        const name = d.name || fallback?.name || '—';
        const phone = d.phone || fallback?.phone || '';
        const avatar = d.avatar || null;
        const tags = Array.isArray(d.tags) ? d.tags : [];
        const address = d.address;
        const status = d.status;
        const messageCount = d.message_count ?? null;
        const orderCount = d.order_count ?? null;
        const successOrders = d.success_order_count ?? null;
        const lastInteraction = d.last_interaction_at;
        const lastSent = d.last_sent_by?.name || null;
        const note = d.note;
        const formatTime = (t) => {
            if (!t) return '';
            const dt = new Date(t);
            return Number.isFinite(dt.getTime()) ? dt.toLocaleString('vi-VN') : '';
        };
        const initial = (name || '?').charAt(0).toUpperCase();
        el.innerHTML = `
            <header class="ncp-head">
                ${avatar ? `<img class="ncp-avatar" src="${NO.escapeHtml(avatar)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ncp-avatar ncp-avatar-fallback',textContent:'${NO.escapeHtml(initial)}'}))">` : `<div class="ncp-avatar ncp-avatar-fallback">${NO.escapeHtml(initial)}</div>`}
                <div style="flex:1;min-width:0;">
                    <div class="ncp-name">${NO.escapeHtml(name)}</div>
                    ${phone ? `<div class="ncp-phone">📞 ${NO.escapeHtml(phone)}</div>` : ''}
                    ${status && status !== 'Normal' && status !== 'Bình thường' ? `<div style="margin-top:4px;"><span class="ncp-status-bad">${NO.escapeHtml(status)}</span></div>` : ''}
                </div>
                <button class="ncp-close" type="button" aria-label="Đóng">×</button>
            </header>
            <div class="ncp-body">
                ${
                    address
                        ? `<section class="ncp-section">
                    <div class="ncp-section-label">📍 Địa chỉ</div>
                    <div class="ncp-section-value">${NO.escapeHtml(address)}</div>
                </section>`
                        : ''
                }
                ${
                    tags.length
                        ? `<section class="ncp-section">
                    <div class="ncp-section-label">🏷️ Tags</div>
                    <div class="ncp-tags">${tags
                        .slice(0, 10)
                        .map(
                            (t) =>
                                `<span class="ncp-tag">${NO.escapeHtml(t.text || t.name || t)}</span>`
                        )
                        .join('')}</div>
                </section>`
                        : ''
                }
                <section class="ncp-section">
                    <div class="ncp-section-label">📊 Hoạt động</div>
                    <div class="ncp-stats">
                        ${messageCount !== null ? `<div class="ncp-stat"><span class="ncp-stat-num">${messageCount}</span><span class="ncp-stat-lbl">tin nhắn</span></div>` : ''}
                        ${orderCount !== null ? `<div class="ncp-stat"><span class="ncp-stat-num">${orderCount}</span><span class="ncp-stat-lbl">đơn (Pancake)</span></div>` : ''}
                        ${successOrders !== null ? `<div class="ncp-stat"><span class="ncp-stat-num" style="color:#16a34a;">${successOrders}</span><span class="ncp-stat-lbl">chốt thành công</span></div>` : ''}
                    </div>
                </section>
                ${
                    lastInteraction
                        ? `<section class="ncp-section">
                    <div class="ncp-section-label">⏱️ Tương tác cuối</div>
                    <div class="ncp-section-value">${NO.escapeHtml(formatTime(lastInteraction))}${lastSent ? ` <span style="color:#9ca3af;">· NV: ${NO.escapeHtml(lastSent)}</span>` : ''}</div>
                </section>`
                        : ''
                }
                ${
                    note
                        ? `<section class="ncp-section ncp-section-note">
                    <div class="ncp-section-label">📝 Ghi chú Pancake</div>
                    <div class="ncp-section-value">${NO.escapeHtml(note)}</div>
                </section>`
                        : ''
                }
                <footer class="ncp-foot">
                    Nguồn: Pancake (live) + WEB2 Partner (địa chỉ live) + Customer 360 (lịch sử)
                </footer>
            </div>
        `;
        el.querySelector('.ncp-close')?.addEventListener('click', NO._hideCustPanel);
    };

    NO._fetchCustomerPanelData = async function _fetchCustomerPanelData(
        fbUserId,
        fbPageId,
        phone,
        token
    ) {
        const cached = NO._custPanelCache.get(fbUserId);
        if (cached && Date.now() - cached.ts < NO._CUST_PANEL_TTL) return cached.data;
        if (NO._custPanelAbort) {
            try {
                NO._custPanelAbort.abort();
            } catch {}
        }
        NO._custPanelAbort = new AbortController();
        const signal = NO._custPanelAbort.signal;
        try {
            const pancakeUrl = `${NO.WORKER_URL}/api/pancake/conversations?pages[${encodeURIComponent(fbPageId)}]=0&from_psid=${encodeURIComponent(fbUserId)}&limit=1&mode=OR&unread_first=false`;
            const customerUrl = phone
                ? `${NO.WORKER_URL}/api/web2/customers/search?search=${encodeURIComponent(phone)}&limit=1`
                : null;
            // 2026-06-08: Web 2.0 bỏ WEB2 — KH info lấy từ warehouse + Pancake.
            // /customers/search là route auth-gated (PII) → gửi x-web2-token. (audit 2026-06-30)
            const w2Headers = window.Web2Auth?.authHeaders
                ? window.Web2Auth.authHeaders()
                : (() => {
                      try {
                          const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                          return t ? { 'x-web2-token': t } : {};
                      } catch {
                          return {};
                      }
                  })();
            const [pancakeD, customerD] = await Promise.all([
                fetch(pancakeUrl, { credentials: 'include', signal })
                    .then((r) => r.json())
                    .catch(() => null),
                customerUrl
                    ? fetch(customerUrl, { credentials: 'include', signal, headers: w2Headers })
                          .then((r) => r.json())
                          .catch(() => null)
                    : Promise.resolve(null),
            ]);
            if (token !== NO._custPanelToken) return null;
            const conv = (pancakeD?.conversations || [])[0] || null;
            const whCust = (customerD?.customers || customerD?.data || [])[0] || null;
            const cust = conv ? (conv.customers || [])[0] || conv.from || {} : {};
            const enriched = {
                name: cust.name || conv?.from?.name || whCust?.name,
                phone: conv?.recent_phone_numbers?.[0]?.phone_number || whCust?.phone || phone,
                avatar: cust.avatar_url || cust.avatar,
                tags: conv?.tags || [],
                last_interaction_at: conv?.last_customer_interactive_at || conv?.updated_at,
                message_count: conv?.message_count,
                last_sent_by: conv?.last_sent_by,
                success_order_count: cust.success_order_count,
                order_count: cust.order_count,
                note: conv?.extra_info?.note,
                address: whCust?.address,
                customerId: whCust?.id,
                status: whCust?.status,
            };
            NO._custPanelCache.set(fbUserId, { data: enriched, ts: Date.now() });
            return enriched;
        } catch (e) {
            if (e.name === 'AbortError') return null;
            throw e;
        }
    };

    NO._onCustAvatarEnter = function _onCustAvatarEnter(target) {
        const fbUserId = target.dataset.fbUserId;
        const fbPageId = target.dataset.fbPageId;
        const fallback = {
            name: target.dataset.customerName,
            phone: target.dataset.customerPhone,
        };
        if (!fbUserId) return;
        clearTimeout(NO._custPanelHideTimer);
        // Nếu panel đang mở với CÙNG KH → no-op
        if (
            NO._custPanelActiveFbId === fbUserId &&
            NO._custPanelEl?.classList.contains('is-open')
        ) {
            return;
        }
        clearTimeout(NO._custPanelShowTimer);
        // 500ms hover delay — buộc user phải có intent rõ ràng
        NO._custPanelShowTimer = setTimeout(async () => {
            const token = ++NO._custPanelToken;
            NO._custPanelActiveFbId = fbUserId;
            NO._showCustPanel();
            const cached = NO._custPanelCache.get(fbUserId);
            if (cached && Date.now() - cached.ts < NO._CUST_PANEL_TTL) {
                NO._renderCustPanelContent({ data: cached.data, fallback });
                return;
            }
            NO._renderCustPanelContent({ loading: true });
            try {
                const data = await NO._fetchCustomerPanelData(
                    fbUserId,
                    fbPageId,
                    fallback.phone,
                    token
                );
                if (token !== NO._custPanelToken) return;
                NO._renderCustPanelContent({ data, fallback });
            } catch (e) {
                if (token !== NO._custPanelToken) return;
                NO._renderCustPanelContent({ error: e.message, fallback });
            }
        }, 500);
    };

    NO._onCustAvatarLeave = function _onCustAvatarLeave() {
        clearTimeout(NO._custPanelShowTimer);
        // 250ms grace period — cho user di chuột vào panel.
        // Mouseenter trên panel → cancel timer (panel listener handle).
        NO._scheduleCustPanelHide(250);
    };

    // 2026-06-01: Thủ công lấy info KH từ WEB2 qua Facebook_ASUserId
    // (cho đơn từ web2-pancake có FB ID nhưng rỗng phone/address/name).
    // 2026-06-08: lookup info KH từ kho warehouse (Web 2.0 bỏ WEB2).
    // UI-first: badge "Đang lấy..." optimistic, lỗi → rollback, success → render.
    NO.fetchCustomerFromWeb2 = async function fetchCustomerFromWeb2(code, fbUserId) {
        if (!fbUserId) {
            NO.notify('Đơn này chưa có FB ID — không lookup được', 'warning');
            return;
        }
        const order = NO.STATE.orders.find((x) => x.code === code);
        if (!order) {
            NO.notify(`Không tìm thấy đơn ${code}`, 'error');
            return;
        }

        const apply = () => {
            // Mark đang loading bằng cách disable button (render attribute)
            const btn = document.querySelector(`button.web2-fetch-web2-btn[onclick*="'${code}'"]`);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML =
                    '<i data-lucide="loader-2" style="width:11px;height:11px;animation:spin 1s linear infinite;"></i> Đang lấy...';
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
        };

        const run = async () => {
            // 2026-06-08: Web 2.0 bỏ WEB2 — lookup info KH từ kho warehouse theo fb_id.
            const fbHeaders = { 'Content-Type': 'application/json' };
            if (window.Web2Auth?.authHeaders) {
                Object.assign(fbHeaders, window.Web2Auth.authHeaders());
            } else {
                try {
                    const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                    if (t) fbHeaders['x-web2-token'] = t;
                } catch {
                    /* ignore */
                }
            }
            const r = await fetch(`${NO.WORKER_URL}/api/web2/customers/batch-by-fbid`, {
                method: 'POST',
                headers: fbHeaders,
                credentials: 'include',
                body: JSON.stringify({ fbIds: [fbUserId] }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || data.success === false) {
                throw new Error(data.error || `Lookup kho KH lỗi ${r.status}`);
            }
            const web2Cust = data.data && data.data[fbUserId];
            if (!web2Cust) {
                throw new Error('Kho KH chưa có FB ID này — KH chưa từng nhắn/đặt');
            }
            // PATCH native_order với info mới (chỉ fill field còn rỗng,
            // không ghi đè data user đã sửa thủ công).
            const patchFields = {};
            if (!order.customerName && web2Cust.name) patchFields.customerName = web2Cust.name;
            if (!order.phone && web2Cust.phone) patchFields.phone = web2Cust.phone;
            if (!order.address && web2Cust.address) patchFields.address = web2Cust.address;
            if (Object.keys(patchFields).length === 0) {
                return { web2Cust, patchedOrder: order, noop: true };
            }
            const resp = await window.NativeOrdersApi.update(code, patchFields);
            return { web2Cust, patchedOrder: resp?.order || null };
        };

        const onSuccess = (result) => {
            if (result?.noop) {
                NO.notify('WEB2 không có info mới — đơn đã đủ data', 'info');
                NO.renderRows(); // re-enable button
                return;
            }
            if (result?.patchedOrder) {
                const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                if (idx !== -1) NO.STATE.orders[idx] = result.patchedOrder;
                const filled = [];
                if (result.web2Cust?.name && !order.customerName) filled.push('tên');
                if (result.web2Cust?.phone && !order.phone) filled.push('SĐT');
                if (result.web2Cust?.address && !order.address) filled.push('địa chỉ');
                NO.notify(
                    filled.length ? `Đã lấy ${filled.join(' + ')} từ WEB2` : 'Đã sync với WEB2',
                    'success'
                );
            } else {
                NO.notify('WEB2 trả về rỗng', 'warning');
            }
            NO.renderRows();
            // Invalidate panel cache cho fbUserId này để hover tiếp sau hiện data mới
            if (NO._custPanelCache?.has(fbUserId)) NO._custPanelCache.delete(fbUserId);
        };

        const rollback = () => {
            // Re-render để khôi phục button (apply() đã tạm disable button DOM)
            NO.renderRows();
        };

        // KHÔNG dùng successMsg — Web2Optimistic fire nó NGAY sau apply() (trước backend).
        // Lấy WEB2 cần notify thực sự khi backend confirm có data → notify trong onSuccess.
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => null,
                apply,
                run,
                onSuccess,
                rollback,
                errLabel: `lấy WEB2 cho ${code}`,
            });
        } else {
            apply();
            try {
                const result = await run();
                onSuccess(result);
            } catch (e) {
                rollback();
                NO.notify('Lỗi lấy WEB2: ' + e.message, 'error');
            }
        }
    };
})();
