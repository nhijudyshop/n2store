// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// CANCEL REQUEST - Yêu cầu hủy đơn
// =====================================================

(function() {
    'use strict';

    const CancelState = {
        requests: [],
        selectedOrders: new Set(),
        isListVisible: false,
        _listener: null
    };

    // =====================================================
    // FIRESTORE HELPERS
    // =====================================================
    function getDB() {
        if (typeof getFirestore === 'function') return getFirestore();
        if (typeof firebase !== 'undefined' && firebase.apps?.length) return firebase.firestore();
        return null;
    }

    function getCancelCollection() {
        const db = getDB();
        if (!db) return null;
        return db.collection('delivery_report').doc('data').collection('cancel_requests');
    }

    // =====================================================
    // LOAD & REALTIME SYNC
    // =====================================================
    async function loadRequests() {
        const col = getCancelCollection();
        if (!col) return;

        try {
            const snap = await col.orderBy('requestedAt', 'desc').get();
            CancelState.requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderList();
            updateBadge();
        } catch (e) {
            console.warn('[CANCEL-REQUEST] Failed to load:', e);
        }
    }

    function setupListener() {
        const col = getCancelCollection();
        if (!col) return;

        CancelState._listener = col.orderBy('requestedAt', 'desc')
            .onSnapshot(snap => {
                CancelState.requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderList();
                updateBadge();
            }, err => {
                console.warn('[CANCEL-REQUEST] Listener error:', err);
            });
    }

    // =====================================================
    // TOGGLE LIST
    // =====================================================
    function toggleList() {
        CancelState.isListVisible = !CancelState.isListVisible;
        const wrapper = document.getElementById('drCancelListWrapper');
        if (wrapper) wrapper.style.display = CancelState.isListVisible ? '' : 'none';
    }

    // =====================================================
    // RENDER LIST
    // =====================================================
    function canApprove() {
        const info = window.authManager?.getUserInfo?.();
        if (!info) return false;
        if (window.authManager?.isAdminTemplate?.()) return true;
        const uname = (info.username || '').toLowerCase();
        return uname === 'phuoc';
    }

    function renderList() {
        const listEl = document.getElementById('drCancelList');
        if (!listEl) return;

        if (CancelState.requests.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Chưa có yêu cầu hủy nào</div>';
            return;
        }

        const statusLabels = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
        const approver = canApprove();

        let html = '';
        CancelState.requests.forEach(req => {
            const date = req.requestedAt ? new Date(req.requestedAt) : null;
            const dateStr = date
                ? `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
                : '';

            const approveBtn = (approver && (req.status || 'pending') === 'pending')
                ? `<button class="dr-cancel-approve-btn" onclick="CancelRequest.approve('${esc(req.id)}')"><i class="fas fa-check"></i> Duyệt</button>`
                : '';

            html += `<div class="dr-cancel-item">
                <div class="dr-cancel-item-left">
                    <div><strong>${esc(req.orderNumber)}</strong> — ${esc(req.customerName || '')}</div>
                    <div style="color:#6b7280;font-size:12px;">
                        Lý do: ${esc(req.reason || '(không có)')} &middot;
                        ${esc(req.requestedBy || '')} &middot; ${dateStr}
                    </div>
                </div>
                <div class="dr-cancel-item-right">
                    <span style="font-weight:600;">${fmtMoney(req.amount || 0)}</span>
                    <span class="dr-cancel-status ${req.status || 'pending'}">${statusLabels[req.status] || 'Chờ duyệt'}</span>
                    ${approveBtn}
                </div>
            </div>`;
        });

        listEl.innerHTML = html;
    }

    // =====================================================
    // APPROVE — chỉ admin/phuoc, confirm rồi xóa document
    // =====================================================
    async function approve(id) {
        if (!canApprove()) { alert('Bạn không có quyền duyệt yêu cầu hủy.'); return; }
        const req = CancelState.requests.find(r => r.id === id);
        if (!req) return;

        const ok = confirm(`Duyệt yêu cầu hủy đơn ${req.orderNumber} (${req.customerName || ''})?\nYêu cầu sẽ bị xóa khỏi danh sách.`);
        if (!ok) return;

        const col = getCancelCollection();
        if (!col) { alert('Không thể kết nối Firestore.'); return; }

        try {
            await col.doc(id).delete();
            // Xóa đơn khỏi delivery report (ẩn vĩnh viễn)
            if (window.DeliveryReport?.hideOrder) {
                window.DeliveryReport.hideOrder(req.orderNumber);
            }
        } catch (e) {
            console.error('[CANCEL-REQUEST] Approve error:', e);
            alert('Lỗi khi duyệt: ' + e.message);
        }
    }

    function updateBadge() {
        const badge = document.getElementById('drCancelBadge');
        if (!badge) return;
        const count = CancelState.requests.filter(r => r.status === 'pending').length;
        badge.textContent = count;
        badge.style.display = count > 0 ? '' : 'none';
    }

    // =====================================================
    // MODAL: OPEN / CLOSE
    // =====================================================
    function openCreateModal() {
        CancelState.selectedOrders = new Set();
        const modal = document.getElementById('drCancelModal');
        if (modal) modal.classList.add('show');

        renderOrderList('');
        updateSelectedCount();

        const reasonWrapper = document.getElementById('drCancelReasonWrapper');
        if (reasonWrapper) reasonWrapper.style.display = 'none';

        const searchInput = document.getElementById('drCancelSearch');
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    }

    function closeModal() {
        const modal = document.getElementById('drCancelModal');
        if (modal) modal.classList.remove('show');
        CancelState.selectedOrders = new Set();
    }

    // =====================================================
    // MODAL: ORDER LIST
    // =====================================================
    function renderOrderList(keyword) {
        const listEl = document.getElementById('drCancelOrderList');
        if (!listEl) return;

        const state = window.DeliveryReport?.getState?.();
        const allData = state?.allData || [];
        const scanned = state?.scannedNumbers;

        // Chỉ cho phép tạo yêu cầu hủy với đơn ĐÃ QUÉT
        const scannedOnly = (scanned && scanned.size > 0)
            ? allData.filter(i => scanned.has(i.Number))
            : [];

        if (scannedOnly.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Chưa có đơn nào được quét. Vui lòng quét đơn trong "Tra soát" trước.</div>';
            return;
        }

        const kw = (keyword || '').toLowerCase().trim();
        const filtered = kw
            ? scannedOnly.filter(item =>
                (item.Number || '').toLowerCase().includes(kw) ||
                (item.PartnerDisplayName || '').toLowerCase().includes(kw) ||
                (item.Phone || '').toLowerCase().includes(kw)
            )
            : scannedOnly.slice(0, 100);

        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">Không tìm thấy đơn hàng đã quét</div>';
            return;
        }

        let html = '';
        filtered.forEach(item => {
            const sel = CancelState.selectedOrders.has(item.Number);
            html += `<div class="dr-cancel-order-item ${sel ? 'selected' : ''}"
                          onclick="CancelRequest.toggleOrder('${esc(item.Number)}')">
                <input type="checkbox" ${sel ? 'checked' : ''} style="pointer-events:none;" />
                <div style="flex:1;">
                    <strong>${esc(item.Number)}</strong> — ${esc(item.PartnerDisplayName || '')}
                    ${item.Phone ? `<span style="color:#9ca3af;margin-left:6px;">${esc(item.Phone)}</span>` : ''}
                </div>
                <div style="color:#374151;font-weight:500;">${fmtMoney(item.CashOnDelivery || 0)}</div>
            </div>`;
        });

        listEl.innerHTML = html;
    }

    function toggleOrder(number) {
        if (CancelState.selectedOrders.has(number)) {
            CancelState.selectedOrders.delete(number);
        } else {
            CancelState.selectedOrders.add(number);
        }
        const searchInput = document.getElementById('drCancelSearch');
        renderOrderList(searchInput?.value || '');
        updateSelectedCount();
    }

    function filterOrders(keyword) {
        renderOrderList(keyword);
    }

    function updateSelectedCount() {
        const countEl = document.getElementById('drCancelSelectedCount');
        const submitBtn = document.getElementById('drBtnSubmitCancel');
        const reasonWrapper = document.getElementById('drCancelReasonWrapper');
        const count = CancelState.selectedOrders.size;

        if (countEl) countEl.textContent = `Chọn ${count} đơn`;
        if (submitBtn) submitBtn.disabled = count === 0;
        if (reasonWrapper) reasonWrapper.style.display = count > 0 ? '' : 'none';
    }

    // =====================================================
    // SUBMIT
    // =====================================================
    async function submit() {
        const selected = CancelState.selectedOrders;
        if (selected.size === 0) return;

        const reason = (document.getElementById('drCancelReason')?.value || '').trim();
        if (!reason) {
            alert('Vui lòng nhập lý do hủy đơn.');
            return;
        }

        const userInfo = window.authManager?.getUserInfo?.();
        const requestedBy = userInfo?.displayName || 'Unknown';

        const state = window.DeliveryReport?.getState?.();
        const allData = state?.allData || [];

        const db = getDB();
        const col = getCancelCollection();
        if (!db || !col) { alert('Không thể kết nối Firestore.'); return; }

        const submitBtn = document.getElementById('drBtnSubmitCancel');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang gửi...'; }

        try {
            const batch = db.batch();

            selected.forEach(number => {
                const item = allData.find(i => i.Number === number);
                const docRef = col.doc();
                batch.set(docRef, {
                    orderNumber: number,
                    customerName: item?.PartnerDisplayName || '',
                    amount: item?.CashOnDelivery || 0,
                    reason: reason,
                    requestedBy: requestedBy,
                    requestedAt: Date.now(),
                    status: 'pending'
                });
            });

            await batch.commit();
            closeModal();
        } catch (e) {
            console.error('[CANCEL-REQUEST] Submit error:', e);
            alert('Lỗi khi gửi yêu cầu: ' + e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi yêu cầu';
            }
        }
    }

    // =====================================================
    // HELPERS
    // =====================================================
    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function fmtMoney(amount) {
        if (!amount && amount !== 0) return '';
        return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
    }

    // =====================================================
    // INIT
    // =====================================================
    function init() {
        loadRequests();
        setupListener();

        // Escape key closes modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('drCancelModal');
                if (modal && modal.classList.contains('show')) closeModal();
            }
        });

        // Backdrop click closes modal
        const modal = document.getElementById('drCancelModal');
        if (modal) modal.addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        });
    }

    // =====================================================
    // PUBLIC API
    // =====================================================
    window.CancelRequest = {
        init,
        toggleList,
        openCreateModal,
        closeModal,
        filterOrders,
        toggleOrder,
        submit,
        approve
    };
})();
