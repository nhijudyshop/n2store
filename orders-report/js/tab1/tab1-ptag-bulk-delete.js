// =====================================================
// TAB1 PROCESSING TAGS — BULK DELETE
// Xóa Tag XL hàng loạt theo STT
// =====================================================

(function() {
    'use strict';

    const BULK_DEL_API_BASE = 'https://n2store-fallback.onrender.com/api/realtime/processing-tags';
    const BULK_DEL_LOG = '[PTAG BulkDel]';

    // =====================================================
    // API
    // =====================================================

    async function _bulkDelFetch(url, options = {}) {
        const defaults = {
            headers: { 'Content-Type': 'application/json' },
            ...options
        };
        const response = await fetch(url, defaults);
        if (!response.ok) {
            throw new Error(`BulkDel API ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    async function _bulkDelClearAPI(orderId) {
        const campaignId = window.ProcessingTagState?._campaignId;
        if (!campaignId) return;
        try {
            await _bulkDelFetch(
                `${BULK_DEL_API_BASE}/${encodeURIComponent(campaignId)}/${encodeURIComponent(orderId)}`,
                { method: 'DELETE' }
            );
        } catch (e) {
            console.error(`${BULK_DEL_LOG} Failed to delete tag for ${orderId}:`, e);
        }
    }

    // =====================================================
    // STT PARSER
    // =====================================================

    function _bulkDelParseSTT(input) {
        const result = [];
        const parts = input.split(',').map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
            if (part.includes('-')) {
                const [a, b] = part.split('-').map(Number);
                if (!isNaN(a) && !isNaN(b)) {
                    const lo = Math.min(a, b);
                    const hi = Math.max(a, b);
                    for (let i = lo; i <= hi; i++) result.push(i);
                }
            } else {
                const n = parseInt(part);
                if (!isNaN(n)) result.push(n);
            }
        }
        return [...new Set(result)];
    }

    // =====================================================
    // MODAL UI
    // =====================================================

    function _bulkDelOpenModal() {
        _bulkDelCloseModal();

        const html = `<div class="ptag-bulk-del-overlay" id="ptag-bulk-del-overlay" onclick="if(event.target===this)window._bulkDelCloseModal();">
            <div class="ptag-bulk-del-modal">
                <div class="ptag-bulk-del-header">
                    <span style="font-weight:600;">🗑️ Xóa Tag XL Hàng Loạt</span>
                    <button onclick="window._bulkDelCloseModal();" style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;">&times;</button>
                </div>
                <div class="ptag-bulk-del-body">
                    <label style="font-size:12px;font-weight:500;">Nhập STT (VD: 1, 5-10, 15)</label>
                    <input type="text" id="ptag-bulk-del-stt" class="ptag-bulk-del-input" placeholder="1, 5-10, 15" autofocus />
                    <div class="ptag-bulk-del-warning">
                        ⚠️ Sẽ xóa toàn bộ Tag XL (bao gồm T-tag) của các đơn được chọn
                    </div>
                </div>
                <div class="ptag-bulk-del-footer">
                    <button class="ptag-bulk-del-cancel" onclick="window._bulkDelCloseModal();">Hủy</button>
                    <button class="ptag-bulk-del-confirm" onclick="window._bulkDelConfirm();">Xóa</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);

        // Focus input
        setTimeout(() => {
            document.getElementById('ptag-bulk-del-stt')?.focus();
        }, 100);
    }

    function _bulkDelCloseModal() {
        const overlay = document.getElementById('ptag-bulk-del-overlay');
        if (overlay) overlay.remove();
    }

    // =====================================================
    // CONFIRM & EXECUTE DELETE
    // =====================================================

    async function _bulkDelConfirm() {
        const sttInput = document.getElementById('ptag-bulk-del-stt')?.value || '';

        if (!sttInput.trim()) {
            alert('Vui lòng nhập STT.');
            return;
        }

        const stts = _bulkDelParseSTT(sttInput);
        if (stts.length === 0) {
            alert('STT không hợp lệ.');
            return;
        }

        // Tìm đơn theo STT, chỉ lấy đơn đã có Tag XL
        const allOrders = window.allData || [];
        const orders = allOrders.filter(o =>
            stts.includes(o.SessionIndex) && window.ProcessingTagState?.getOrderData(o.Id)
        );

        if (orders.length === 0) {
            alert('Không tìm thấy đơn nào có Tag XL với STT đã nhập.');
            return;
        }

        if (!confirm(`Xóa Tag XL của ${orders.length} đơn?`)) return;

        _bulkDelCloseModal();

        let deleted = 0;
        for (const order of orders) {
            try {
                // Xóa khỏi state
                window.ProcessingTagState.removeOrder(order.Id);
                // Refresh UI row
                if (typeof window._ptagRefreshRow === 'function') {
                    window._ptagRefreshRow(order.Id);
                }
                // Gọi DELETE API
                await _bulkDelClearAPI(order.Id);
                deleted++;
            } catch (e) {
                console.error(`${BULK_DEL_LOG} Error deleting ${order.Id}:`, e);
            }
        }

        // Refresh panel
        if (typeof window.renderPanelContent === 'function') {
            window.renderPanelContent();
        }

        console.log(`${BULK_DEL_LOG} Bulk deleted ${deleted}/${orders.length} orders`);
    }

    // =====================================================
    // INJECT CSS
    // =====================================================

    function _bulkDelInjectStyles() {
        if (document.getElementById('ptag-bulk-del-styles')) return;
        const style = document.createElement('style');
        style.id = 'ptag-bulk-del-styles';
        style.textContent = `
            .ptag-bulk-del-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.4); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
            }
            .ptag-bulk-del-modal {
                background: #fff; border-radius: 10px; width: 380px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                overflow: hidden;
            }
            .ptag-bulk-del-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
                font-size: 14px;
            }
            .ptag-bulk-del-body {
                padding: 16px;
            }
            .ptag-bulk-del-input {
                width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
                border-radius: 6px; font-size: 13px; margin-top: 6px;
                box-sizing: border-box;
            }
            .ptag-bulk-del-input:focus {
                outline: none; border-color: #ef4444;
                box-shadow: 0 0 0 2px rgba(239,68,68,0.15);
            }
            .ptag-bulk-del-warning {
                font-size: 11px; color: #ef4444; margin-top: 10px;
                padding: 8px; background: #fef2f2; border-radius: 6px;
                border: 1px solid #fecaca;
            }
            .ptag-bulk-del-footer {
                display: flex; justify-content: flex-end; gap: 8px;
                padding: 12px 16px; border-top: 1px solid #e5e7eb;
                background: #f9fafb;
            }
            .ptag-bulk-del-cancel {
                padding: 6px 16px; border: 1px solid #d1d5db;
                border-radius: 6px; background: #fff; cursor: pointer;
                font-size: 13px; color: #374151;
            }
            .ptag-bulk-del-cancel:hover { background: #f3f4f6; }
            .ptag-bulk-del-confirm {
                padding: 6px 16px; border: none; border-radius: 6px;
                background: #ef4444; color: #fff; cursor: pointer;
                font-size: 13px; font-weight: 600;
            }
            .ptag-bulk-del-confirm:hover { background: #dc2626; }
        `;
        document.head.appendChild(style);
    }

    // Inject styles on load
    _bulkDelInjectStyles();

    // =====================================================
    // WINDOW EXPORTS
    // =====================================================

    window._bulkDelOpenModal = _bulkDelOpenModal;
    window._bulkDelCloseModal = _bulkDelCloseModal;
    window._bulkDelConfirm = _bulkDelConfirm;

    console.log(`${BULK_DEL_LOG} Module loaded`);

})();
