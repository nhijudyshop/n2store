// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WALLET DEBT MODAL - Lịch sử hoạt động ví khách hàng
// Hiển thị khi click vào wallet debt badge
// =====================================================

(function() {
    'use strict';

    const WALLET_API_URL = 'https://n2store-fallback.onrender.com/api';

    const WALLET_TYPE_CONFIG = {
        'DEPOSIT':              { label: 'Cộng Tiền',          iconChar: '+', isCredit: true },
        'WITHDRAW':             { label: 'Trừ Tiền',           iconChar: '-', isCredit: false },
        'VIRTUAL_CREDIT':       { label: 'Cộng Công Nợ Ảo',   iconChar: '+', isCredit: true },
        'VIRTUAL_DEBIT':        { label: 'Trừ Công Nợ Ảo',    iconChar: '-', isCredit: false },
        'VIRTUAL_CANCEL':       { label: 'Thu Hồi Công Nợ Ảo', iconChar: '-', isCredit: false },
        'VIRTUAL_EXPIRE':       { label: 'Công Nợ Hết Hạn',   iconChar: '-', isCredit: false },
        'ADJUSTMENT':           { label: 'Điều Chỉnh Số Dư',  iconChar: '~', isCredit: true },
        'ORDER_CANCEL_REFUND':  { label: 'Hoàn Tiền Hủy Đơn', iconChar: '+', isCredit: true },
        'RETURN_SHIPPER':       { label: 'Phiếu Thu Về',       iconChar: '+', isCredit: true },
        'RETURN_CLIENT':        { label: 'Phiếu Trả Hàng',    iconChar: '+', isCredit: true },
        'BOOM':                 { label: 'Phiếu Boom Hàng',   iconChar: '-', isCredit: false },
        'COD_ADJUSTMENT':       { label: 'Điều Chỉnh COD',    iconChar: '~', isCredit: true },
    };
    const DEFAULT_CONFIG = { label: 'Giao Dịch Ví', iconChar: '~', isCredit: false };

    function formatCurrency(val) {
        const num = parseFloat(val) || 0;
        return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Open the wallet debt modal for a phone number
     */
    async function openWalletDebtModal(phone) {
        if (!phone) return;

        // Create or get modal
        let modal = document.getElementById('wallet-debt-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wallet-debt-modal';
            modal.innerHTML = `
                <div class="wdm-backdrop"></div>
                <div class="wdm-content">
                    <div class="wdm-header">
                        <h3 class="wdm-title">Ví Khách Hàng</h3>
                        <button class="wdm-close" onclick="document.getElementById('wallet-debt-modal').style.display='none'">&times;</button>
                    </div>
                    <div class="wdm-body" id="wdm-body">
                        <div style="text-align:center;padding:30px;">
                            <i class="fas fa-spinner fa-spin" style="font-size:24px;color:#8b5cf6;"></i>
                            <p style="margin-top:8px;color:#64748b;">Đang tải...</p>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Close on backdrop click
            modal.querySelector('.wdm-backdrop').addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        // Show modal
        modal.style.display = 'flex';
        document.getElementById('wdm-body').innerHTML = `
            <div style="text-align:center;padding:30px;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px;color:#8b5cf6;"></i>
                <p style="margin-top:8px;color:#64748b;">Đang tải...</p>
            </div>
        `;

        // Fetch wallet + transactions
        let wallet = null;
        let transactions = [];

        try {
            const [walletRes, txRes] = await Promise.all([
                fetch(`${WALLET_API_URL}/v2/wallets/${encodeURIComponent(phone)}`),
                fetch(`${WALLET_API_URL}/v2/wallets/${encodeURIComponent(phone)}/transactions?limit=20`)
            ]);

            if (walletRes.ok) {
                const walletResult = await walletRes.json();
                wallet = walletResult.data;
            }

            if (txRes.ok) {
                const txResult = await txRes.json();
                transactions = txResult.data || [];
            }
        } catch (error) {
            console.error('[WALLET-MODAL] Error fetching data:', error);
        }

        // Get customer name from table
        let customerName = phone;
        const rows = document.querySelectorAll('tr[data-order-id]');
        for (const row of rows) {
            const phoneCell = row.querySelector('td[data-column="phone"]');
            if (!phoneCell) continue;
            const rowPhone = phoneCell.textContent.trim().replace(/\D/g, '');
            const normalizedInput = phone.replace(/\D/g, '');
            if (rowPhone === normalizedInput || rowPhone.endsWith(normalizedInput.slice(-9))) {
                const nameDiv = row.querySelector('.customer-name');
                if (nameDiv) {
                    const clone = nameDiv.cloneNode(true);
                    clone.querySelectorAll('.wallet-debt-badge').forEach(b => b.remove());
                    customerName = clone.textContent.trim();
                    break;
                }
            }
        }

        // Update title
        modal.querySelector('.wdm-title').textContent = `Ví - ${customerName} (${phone})`;

        // Render content
        if (!wallet && transactions.length === 0) {
            document.getElementById('wdm-body').innerHTML = `
                <div style="text-align:center;padding:30px;color:#94a3b8;">
                    <i class="fas fa-wallet" style="font-size:32px;margin-bottom:10px;"></i>
                    <p>Chưa có thông tin ví</p>
                </div>
            `;
            return;
        }

        const balance = parseFloat(wallet?.balance) || 0;
        const virtualBalance = parseFloat(wallet?.virtual_balance) || 0;
        const total = balance + virtualBalance;

        // Build wallet summary header
        let summaryHTML = `
            <div class="wdm-summary">
                <div class="wdm-summary-total">
                    <span class="wdm-summary-label">Tổng số dư ví</span>
                    <span class="wdm-summary-amount">${formatCurrency(total)}</span>
                </div>
                <div class="wdm-summary-detail">
                    <div class="wdm-summary-item">
                        <span class="wdm-summary-dot" style="background:#10b981;"></span>
                        <span>Tiền thật: <b>${formatCurrency(balance)}</b></span>
                    </div>
                    <div class="wdm-summary-item">
                        <span class="wdm-summary-dot" style="background:#f59e0b;"></span>
                        <span>Công nợ ảo: <b>${formatCurrency(virtualBalance)}</b></span>
                    </div>
                </div>
            </div>
        `;

        // Build transactions list
        let txHTML = '';
        if (transactions.length > 0) {
            txHTML = `
                <div class="wdm-activity-header">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-wallet" style="font-size:18px;color:#6366f1;"></i>
                        <span style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Hoạt động ví</span>
                    </div>
                    <span class="wdm-activity-count">${transactions.length} hoạt động</span>
                </div>
                <div class="wdm-activity-list">
                    ${transactions.map(tx => renderTransaction(tx)).join('')}
                </div>
            `;
        }

        document.getElementById('wdm-body').innerHTML = summaryHTML + txHTML;
    }

    /**
     * Render a single transaction entry
     */
    function renderTransaction(tx) {
        const cfg = WALLET_TYPE_CONFIG[tx.type] || DEFAULT_CONFIG;
        const amount = parseFloat(tx.amount) || 0;
        const sign = cfg.isCredit ? '+' : '-';
        const amountColor = cfg.isCredit ? '#16a34a' : '#dc2626';
        const bgColor = cfg.isCredit ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)';
        const borderColor = cfg.isCredit ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)';
        const iconBg = cfg.isCredit ? '#dcfce7' : '#fee2e2';
        const iconColor = cfg.isCredit ? '#16a34a' : '#dc2626';

        const date = tx.created_at
            ? new Date(tx.created_at).toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
            : '';
        const createdBy = tx.created_by && tx.created_by !== 'system' ? tx.created_by : '';
        const note = tx.note || tx.source || '';

        let detailParts = [];
        if (note) detailParts.push(escapeHtml(note));
        if (date) detailParts.push(date);

        let operatorHtml = '';
        if (createdBy) {
            const isDeposit = tx.type === 'DEPOSIT';
            const isWithdraw = tx.type === 'WITHDRAW';
            const isRefund = tx.type === 'ORDER_CANCEL_REFUND';
            const label = isDeposit ? 'Duyệt bởi' : isWithdraw ? 'Tạo bởi' : isRefund ? 'Hoàn bởi' : 'Bởi';
            operatorHtml = ` - <span style="color:#ef4444;font-weight:700;">${label} ${escapeHtml(createdBy)}</span>`;
        }

        // Balance before & after
        const balBefore = parseFloat(tx.balance_before) || 0;
        const vBalBefore = parseFloat(tx.virtual_balance_before) || 0;
        const totalBefore = balBefore + vBalBefore;
        const balAfter = parseFloat(tx.balance_after) || 0;
        const vBalAfter = parseFloat(tx.virtual_balance_after) || 0;
        const totalAfter = balAfter + vBalAfter;

        return `
            <div class="wdm-tx-item" style="background:${bgColor};border:1px solid ${borderColor};">
                <div class="wdm-tx-header">
                    <div class="wdm-tx-icon" style="background:${iconBg};">
                        <span style="font-size:20px;font-weight:900;color:${iconColor};line-height:1;">${cfg.iconChar}</span>
                    </div>
                    <span class="wdm-tx-label" style="color:${amountColor};">${cfg.label}  ${sign}${formatCurrency(Math.abs(amount))}</span>
                </div>
                <div class="wdm-tx-detail">
                    <p class="wdm-tx-note">${detailParts.join(' - ')}${operatorHtml}</p>
                    <p class="wdm-tx-balance">Thay đổi số dư: ${formatCurrency(totalBefore)} → ${formatCurrency(totalAfter)}</p>
                </div>
            </div>
        `;
    }

    // Inject CSS
    const style = document.createElement('style');
    style.id = 'wallet-debt-modal-styles';
    style.textContent = `
        #wallet-debt-modal {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 10020;
            justify-content: center;
            align-items: center;
        }
        .wdm-backdrop {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.45);
        }
        .wdm-content {
            position: relative;
            background: white;
            border-radius: 14px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            max-width: 480px;
            width: 92%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .wdm-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 18px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .wdm-title {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
        }
        .wdm-close {
            background: none;
            border: none;
            color: white;
            font-size: 26px;
            cursor: pointer;
            line-height: 1;
            opacity: 0.8;
            padding: 0;
        }
        .wdm-close:hover { opacity: 1; }
        .wdm-body {
            overflow-y: auto;
            flex: 1;
            max-height: calc(85vh - 60px);
        }
        .wdm-summary {
            padding: 16px 18px;
            background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
            border-bottom: 1px solid #d1fae5;
        }
        .wdm-summary-total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .wdm-summary-label {
            font-size: 13px;
            font-weight: 600;
            color: #475569;
        }
        .wdm-summary-amount {
            font-size: 22px;
            font-weight: 800;
            color: #059669;
        }
        .wdm-summary-detail {
            display: flex;
            gap: 16px;
        }
        .wdm-summary-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: #64748b;
        }
        .wdm-summary-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .wdm-activity-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 18px 8px;
            font-size: 13px;
            font-weight: 700;
            color: #1e293b;
        }
        .wdm-activity-count {
            font-size: 11px;
            color: #94a3b8;
            font-weight: 500;
        }
        .wdm-activity-list {
            padding: 0 14px 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .wdm-tx-item {
            border-radius: 10px;
            padding: 14px 16px;
        }
        .wdm-tx-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }
        .wdm-tx-icon {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .wdm-tx-label {
            font-size: 16px;
            font-weight: 800;
        }
        .wdm-tx-detail {
            padding-left: 44px;
        }
        .wdm-tx-note {
            font-size: 13px;
            font-weight: 500;
            color: #475569;
            line-height: 1.6;
            margin: 0;
        }
        .wdm-tx-balance {
            font-size: 14px;
            font-weight: 800;
            color: #1e293b;
            margin: 6px 0 0;
        }
    `;
    document.head.appendChild(style);

    // Export globally
    window.openWalletDebtModal = openWalletDebtModal;

})();
