// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Standalone Ticket History Viewer
 * Usage: window.showTicketHistoryViewer('TV-2026-00578')
 *
 * Self-contained: fetches ticket via apiService.getTicket, renders full detail modal
 * (header, info grid, timeline with audit logs, products list). Injects own CSS/HTML.
 * Works in any page that has apiService loaded (firebase optional for audit logs).
 */
(function () {
    if (window.__ticketHistoryViewerReady) return;
    window.__ticketHistoryViewerReady = true;

    const MODAL_ID = 'thv-modal';
    const STYLE_ID = 'thv-style';

    const CSS = `
        #${MODAL_ID} { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9999;
            display: none; align-items: center; justify-content: center; padding: 16px; }
        #${MODAL_ID}.thv-open { display: flex; }
        #${MODAL_ID} .thv-box { background: #fff; border-radius: 12px; width: 100%; max-width: 640px;
            max-height: calc(100dvh - 32px); display: flex; flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.25); overflow: hidden; }
        #${MODAL_ID} .thv-head { padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
            display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        #${MODAL_ID} .thv-head h2 { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
        #${MODAL_ID} .thv-close { background: transparent; border: 0; cursor: pointer; font-size: 22px;
            line-height: 1; color: #64748b; padding: 4px 8px; }
        #${MODAL_ID} .thv-close:hover { color: #0f172a; }
        #${MODAL_ID} .thv-body { padding: 18px 20px; overflow-y: auto; flex: 1; }
        #${MODAL_ID} .thv-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px;
            background: #f8fafc; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px; }
        #${MODAL_ID} .thv-info .item label { display: block; font-size: 11px; color: #64748b;
            text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
        #${MODAL_ID} .thv-info .item span { font-size: 13px; color: #0f172a; font-weight: 500; }
        #${MODAL_ID} .thv-sec-title { margin: 4px 0 12px; font-size: 14px; font-weight: 700; color: #0f172a; }
        #${MODAL_ID} .thv-timeline { position: relative; padding-left: 18px; }
        #${MODAL_ID} .thv-timeline::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px;
            width: 2px; background: #e2e8f0; }
        #${MODAL_ID} .thv-step { position: relative; padding: 6px 0 14px; }
        #${MODAL_ID} .thv-step .dot { position: absolute; left: -18px; top: 10px; width: 12px; height: 12px;
            border-radius: 50%; background: #e2e8f0; border: 2px solid #fff;
            box-shadow: 0 0 0 2px #e2e8f0; }
        #${MODAL_ID} .thv-step.done .dot { background: #10b981; box-shadow: 0 0 0 2px #10b981; }
        #${MODAL_ID} .thv-step.active .dot { background: #f59e0b; box-shadow: 0 0 0 2px #f59e0b; }
        #${MODAL_ID} .thv-step.cancelled .dot { background: #ef4444; box-shadow: 0 0 0 2px #ef4444; }
        #${MODAL_ID} .thv-step .title { font-weight: 600; font-size: 13px; color: #0f172a; }
        #${MODAL_ID} .thv-step .meta { font-size: 11px; color: #64748b; margin-top: 2px; }
        #${MODAL_ID} .thv-step .detail { font-size: 12px; color: #475569; margin-top: 3px; }
        #${MODAL_ID} .thv-badge { display: inline-block; padding: 3px 8px; border-radius: 999px;
            font-size: 11px; font-weight: 600; }
        #${MODAL_ID} .thv-badge.pending-goods { background: #fef3c7; color: #92400e; }
        #${MODAL_ID} .thv-badge.pending-finance { background: #dbeafe; color: #1e40af; }
        #${MODAL_ID} .thv-badge.completed { background: #d1fae5; color: #065f46; }
        #${MODAL_ID} .thv-badge.cancelled { background: #fee2e2; color: #991b1b; }
        #${MODAL_ID} .thv-type-badge { display: inline-block; padding: 3px 8px; border-radius: 6px;
            font-size: 11px; font-weight: 600; background: #ede9fe; color: #6d28d9; }
        #${MODAL_ID} .thv-products { background: #fff7ed; border-left: 3px solid #fb923c;
            padding: 10px 12px; border-radius: 6px; font-size: 13px; }
        #${MODAL_ID} .thv-products ul { list-style: none; padding: 0; margin: 6px 0 0; }
        #${MODAL_ID} .thv-products li { font-size: 12px; color: #475569; padding: 2px 0; }
        #${MODAL_ID} .thv-loading { text-align: center; padding: 40px 20px; color: #64748b; font-size: 14px; }
        #${MODAL_ID} .thv-amount { font-weight: 700; color: #0f172a; }
        #${MODAL_ID} .thv-amount.neg { color: #ef4444; }
    `;

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    function ensureModal() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.innerHTML = `
            <div class="thv-box" role="dialog" aria-modal="true">
                <div class="thv-head">
                    <h2 class="thv-title">Chi tiết phiếu</h2>
                    <button type="button" class="thv-close" aria-label="Đóng">×</button>
                </div>
                <div class="thv-body"><div class="thv-loading">Đang tải…</div></div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove('thv-open');
        modal.querySelector('.thv-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('thv-open')) close();
        });
        return modal;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatCurrency(n) {
        const v = Number(n) || 0;
        return v.toLocaleString('vi-VN') + ' đ';
    }

    function formatDateTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('vi-VN') + ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    function translateType(type) {
        const map = {
            BOOM: 'Không Nhận Hàng',
            RETURN_SHIPPER: 'Thu về (Shipper)',
            RETURN_CLIENT: 'Khách gửi',
            FIX_COD: 'Sửa COD',
            OTHER: 'Khác',
        };
        return map[type] || type;
    }

    function statusBadge(status) {
        const map = {
            PENDING_GOODS: { cls: 'pending-goods', text: 'Chờ nhận hàng' },
            PENDING_FINANCE: { cls: 'pending-finance', text: 'Chờ đối soát' },
            COMPLETED: { cls: 'completed', text: 'Hoàn tất' },
            CANCELLED: { cls: 'cancelled', text: 'Đã hủy' },
        };
        const info = map[status] || { cls: '', text: status || '—' };
        return `<span class="thv-badge ${info.cls}">${escapeHtml(info.text)}</span>`;
    }

    function typeBadge(ticket) {
        const type = ticket.type;
        const fix = ticket.fixCodReason || ticket.fix_cod_reason;
        const boom = ticket.boomReason || ticket.boom_reason;

        if (type === 'BOOM' && boom) {
            const boomMap = {
                BOOM_HANG: 'Boom Hàng',
                TRUNG_DON: 'Trùng Đơn',
                DOI_DIA_CHI: 'Sai Địa Chỉ',
                KHAC: 'Không Nhận Hàng',
            };
            return `<span class="thv-type-badge">${escapeHtml(boomMap[boom] || boom)}</span>`;
        }
        const baseMap = {
            BOOM: 'Không Nhận Hàng',
            FIX_COD: 'Sửa COD',
            RETURN_CLIENT: 'Khách Gửi',
            RETURN_SHIPPER: 'Thu Về',
            OTHER: 'Vấn đề khác',
        };
        const base = baseMap[type] || type || '—';

        let reason = '';
        if (type === 'FIX_COD' && fix) {
            const rMap = {
                WRONG_SHIP: 'Sai ship',
                CUSTOMER_DEBT: 'Trừ nợ',
                DISCOUNT: 'Giảm giá',
                REJECT_PARTIAL: 'Nhận 1 phần',
                RETURN_OLD_ORDER: 'Trả đơn cũ',
            };
            reason = ` · ${escapeHtml(rMap[fix] || fix)}`;
        }
        return `<span class="thv-type-badge">${escapeHtml(base)}${reason}</span>`;
    }

    function buildTimeline(ticket) {
        const status = ticket.status;
        const steps = [];

        steps.push({
            label: 'Tạo phiếu',
            time: ticket.createdAt || ticket.created_at,
            done: true,
            detail: `Loại: ${translateType(ticket.type)}`,
        });

        if (ticket.type === 'RETURN_SHIPPER') {
            const hasCredit = !!(ticket.virtualCreditId || ticket.virtual_credit_id);
            steps.push({
                label: 'Cấp công nợ ảo',
                done: hasCredit,
                active: !hasCredit && status === 'PENDING_GOODS',
                cancelled: status === 'CANCELLED' && !hasCredit,
                detail: hasCredit ? `ID: ${ticket.virtualCreditId || ticket.virtual_credit_id}` : '',
            });
        }

        const fixReason = ticket.fixCodReason || ticket.fix_cod_reason;
        const needsGoods =
            ['BOOM', 'RETURN_SHIPPER', 'RETURN_CLIENT', 'FIX_COD'].includes(ticket.type) &&
            !(ticket.type === 'FIX_COD' && !['REJECT_PARTIAL', 'RETURN_OLD_ORDER'].includes(fixReason));
        if (needsGoods) {
            const receivedAt = ticket.receivedAt || ticket.received_at;
            const received = !!receivedAt || status === 'PENDING_FINANCE' || status === 'COMPLETED';
            steps.push({
                label: 'Nhận hàng',
                time: receivedAt || null,
                done: received,
                active: !received && status === 'PENDING_GOODS',
                cancelled: status === 'CANCELLED' && !received,
                detail: (ticket.refundNumber || ticket.refund_number)
                    ? `Phiếu trả: ${ticket.refundNumber || ticket.refund_number}` : '',
            });
        }

        if (ticket.type === 'BOOM' || ticket.type === 'FIX_COD') {
            const settledAt = ticket.settled_at || ticket.completedAt || ticket.completed_at;
            const settled = status === 'COMPLETED';
            steps.push({
                label: 'Thanh toán',
                time: settled ? settledAt : null,
                done: settled,
                active: status === 'PENDING_FINANCE',
                cancelled: status === 'CANCELLED',
                detail: settled ? formatCurrency(ticket.money || ticket.refund_amount) : '',
            });
        }

        if (status === 'COMPLETED') {
            steps.push({
                label: 'Hoàn tất',
                time: ticket.completedAt || ticket.completed_at,
                done: true,
            });
        } else if (status === 'CANCELLED') {
            steps.push({
                label: 'Đã hủy',
                time: ticket.updatedAt || ticket.updated_at,
                cancelled: true,
            });
        }
        return steps;
    }

    async function fetchAuditLogs(ticketCode) {
        try {
            let db = null;
            if (typeof window.initializeFirestore === 'function') {
                db = window.initializeFirestore({ enablePersistence: false });
            } else if (typeof window.getFirestore === 'function') {
                db = window.getFirestore();
            } else if (window.firebase && typeof window.firebase.firestore === 'function') {
                db = window.firebase.firestore();
            }
            if (!db) return [];

            const snap = await db.collection('edit_history')
                .where('module', '==', 'issue-tracking')
                .where('entityId', '==', ticketCode)
                .orderBy('timestamp', 'asc')
                .get();

            return snap.docs.map((doc) => {
                const d = doc.data();
                return {
                    actionType: d.actionType,
                    timestamp: d.timestamp?.toDate?.() ? d.timestamp.toDate().getTime() : d.timestamp,
                    performer: d.performerUserName || d.performerUserId || '',
                    description: d.description || '',
                };
            });
        } catch (e) {
            console.warn('[TicketHistoryViewer] audit logs fetch failed:', e);
            return [];
        }
    }

    function enrichSteps(steps, logs) {
        const actionMap = {
            ticket_create: 'Tạo phiếu',
            ticket_add_debt: 'Cấp công nợ ảo',
            ticket_receive_goods: 'Nhận hàng',
            ticket_payment: 'Thanh toán',
            delete: 'Đã hủy',
        };
        return steps.map((s) => {
            const match = logs.find((l) => actionMap[l.actionType] === s.label);
            if (!match) return s;
            return {
                ...s,
                time: s.time || match.timestamp,
                performer: match.performer,
                detail: s.detail || match.description,
            };
        });
    }

    function renderProducts(ticket) {
        const fix = ticket.fixCodReason || ticket.fix_cod_reason;
        const noteDisplay = ticket.note
            ? `<div style="color:#b45309;margin-bottom:4px;">${escapeHtml(ticket.note)}</div>` : '';

        if (ticket.type === 'FIX_COD' && fix !== 'REJECT_PARTIAL' && fix !== 'RETURN_OLD_ORDER') {
            return noteDisplay;
        }
        const products = ticket.products || [];
        if (products.length === 0) return noteDisplay;

        const items = products.map((p) => {
            const qty = p.returnQuantity || p.quantity || 1;
            const code = p.code ? `${escapeHtml(p.code)} ` : '';
            return `<li>• ${qty}x ${code}${escapeHtml(p.name || '')}</li>`;
        }).join('');
        return `${noteDisplay}<ul>${items}</ul>`;
    }

    function renderBody(ticket, steps) {
        const ticketCode = ticket.ticketCode || ticket.ticket_code || ticket.firebaseId || '';
        const amount = ticket.money || ticket.refund_amount || 0;
        const amtClass = (ticket.type === 'BOOM' || ticket.type === 'FIX_COD') ? 'neg' : '';

        const products = renderProducts(ticket);

        const timelineHTML = steps.map((s) => {
            const cls = s.cancelled ? 'cancelled' : s.done ? 'done' : s.active ? 'active' : '';
            return `
                <div class="thv-step ${cls}">
                    <div class="dot"></div>
                    <div class="title">${escapeHtml(s.label)}</div>
                    ${s.time ? `<div class="meta">${escapeHtml(formatDateTime(s.time))}</div>` : ''}
                    ${s.performer ? `<div class="meta">Bởi: ${escapeHtml(s.performer)}</div>` : ''}
                    ${s.detail ? `<div class="detail">${escapeHtml(s.detail)}</div>` : ''}
                </div>`;
        }).join('');

        return `
            <div class="thv-info">
                <div class="item"><label>Khách hàng</label><span>${escapeHtml(ticket.customer || ticket.customer_name || '—')}</span></div>
                <div class="item"><label>Số điện thoại</label><span>${escapeHtml(ticket.phone || '—')}</span></div>
                <div class="item"><label>Mã đơn hàng</label><span>${escapeHtml(ticket.orderId || ticket.order_id || '—')}</span></div>
                <div class="item"><label>Loại sự vụ</label><span>${typeBadge(ticket)}</span></div>
                <div class="item"><label>Số tiền</label><span class="thv-amount ${amtClass}">${formatCurrency(amount)}</span></div>
                <div class="item"><label>Trạng thái</label><span>${statusBadge(ticket.status)}</span></div>
            </div>

            <div class="thv-sec-title">Dòng thời gian xử lý</div>
            <div class="thv-timeline">${timelineHTML}</div>

            ${products ? `
                <div class="thv-sec-title" style="margin-top:18px;">Sản phẩm</div>
                <div class="thv-products">${products}</div>` : ''}
        `;
    }

    async function show(ticketCode) {
        if (!ticketCode) { alert('Không có mã phiếu'); return; }

        injectStyle();
        const modal = ensureModal();
        const titleEl = modal.querySelector('.thv-title');
        const bodyEl = modal.querySelector('.thv-body');

        titleEl.textContent = `Lịch sử phiếu ${ticketCode}`;
        bodyEl.innerHTML = `<div class="thv-loading">Đang tải chi tiết phiếu…</div>`;
        modal.classList.add('thv-open');

        try {
            const api = window.ApiService || window.apiService;
            if (!api || typeof api.getTicket !== 'function') {
                throw new Error('ApiService.getTicket không khả dụng');
            }
            const res = await api.getTicket(ticketCode);
            // api.getTicket may return the ticket object directly OR {success, data}
            const ticket = res && res.data ? res.data : res;
            if (!ticket) {
                throw new Error('Không tìm thấy phiếu');
            }
            const steps = buildTimeline(ticket);
            const logs = await fetchAuditLogs(ticketCode);
            const enriched = enrichSteps(steps, logs);
            bodyEl.innerHTML = renderBody(ticket, enriched);
        } catch (e) {
            console.error('[TicketHistoryViewer] failed:', e);
            bodyEl.innerHTML = `<div class="thv-loading" style="color:#ef4444;">Lỗi: ${escapeHtml(e.message || 'Không tải được chi tiết phiếu')}</div>`;
        }
    }

    window.showTicketHistoryViewer = show;
})();
