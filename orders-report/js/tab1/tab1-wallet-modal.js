// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WALLET DEBT MODAL - Lịch sử hoạt động ví khách hàng
// Hiển thị khi click vào wallet debt badge
// =====================================================

(function() {
    'use strict';

    const WALLET_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api';

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

    function formatK(val) {
        const num = Math.abs(parseFloat(val) || 0);
        if (num === 0) return '0K';
        const k = num / 1000;
        return (Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, '')) + 'K';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Group COD payments of the same order into a single line
    function groupCodPayments(txs) {
        const out = [];
        const groupMap = new Map();
        for (const tx of txs) {
            const rn = tx.note || tx.source || '';
            const isCod = tx.type === 'WITHDRAW'
                && (tx.source === 'SALE_ORDER' || /Thanh toán.*đơn hàng/i.test(rn));
            if (!isCod) { out.push(tx); continue; }
            const m = rn.match(/#?(NJD\/\d{4}\/\d+)/i)
                || (tx.reference_id || '').match(/(NJD\/\d{4}\/\d+)/i);
            const orderCode = m ? m[1] : '';
            const key = `${orderCode}`;
            if (!orderCode || !groupMap.has(key)) {
                groupMap.set(key, out.length);
                out.push({ ...tx, amount: parseFloat(tx.amount) || 0 });
            } else {
                const ex = out[groupMap.get(key)];
                ex.amount = (parseFloat(ex.amount) || 0) + (parseFloat(tx.amount) || 0);
                const exAfter = (parseFloat(ex.balance_after) || 0) + (parseFloat(ex.virtual_balance_after) || 0);
                const txAfter = (parseFloat(tx.balance_after) || 0) + (parseFloat(tx.virtual_balance_after) || 0);
                if (txAfter < exAfter) {
                    ex.balance_after = tx.balance_after;
                    ex.virtual_balance_after = tx.virtual_balance_after;
                }
                const exBefore = (parseFloat(ex.balance_before) || 0) + (parseFloat(ex.virtual_balance_before) || 0);
                const txBefore = (parseFloat(tx.balance_before) || 0) + (parseFloat(tx.virtual_balance_before) || 0);
                if (txBefore > exBefore) {
                    ex.balance_before = tx.balance_before;
                    ex.virtual_balance_before = tx.virtual_balance_before;
                }
                if ((tx.note || '').length > (ex.note || '').length) ex.note = tx.note;
            }
        }
        return out;
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
            const grouped = groupCodPayments(transactions).slice(0, 15);
            txHTML = `
                <div class="wdm-activity-header">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-wallet" style="font-size:18px;color:#6366f1;"></i>
                        <span style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Hoạt động ví</span>
                    </div>
                    <span class="wdm-activity-count">${grouped.length} hoạt động</span>
                </div>
                <div class="wdm-activity-list">
                    ${grouped.map(tx => renderTransaction(tx)).join('')}
                </div>
            `;
        }

        document.getElementById('wdm-body').innerHTML = summaryHTML + txHTML;
    }

    /**
     * Render a single transaction entry (compact single-line style,
     * matches customer-hub's "Hoạt động gần đây").
     */
    function renderTransaction(tx) {
        let cfg = WALLET_TYPE_CONFIG[tx.type] || DEFAULT_CONFIG;
        let suppressOperator = false;

        // DEPOSIT + ORDER_CANCEL_REFUND → label "HOÀN" (xanh, dấu +)
        if (tx.type === 'DEPOSIT' && tx.source === 'ORDER_CANCEL_REFUND') {
            cfg = { label: 'HOÀN', iconChar: '+', isCredit: true };
        }

        const amount = parseFloat(tx.amount) || 0;
        const isAdjust = tx.type === 'ADJUSTMENT';
        const isCredit = isAdjust ? (amount >= 0) : cfg.isCredit;

        const sign = isCredit ? '+' : '-';
        const amountColor = isCredit ? '#16a34a' : '#dc2626';
        const bgColor = isCredit ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)';
        const iconColor = isCredit ? '#16a34a' : '#dc2626';

        // Dynamic label for ADJUSTMENT
        let txLabel = cfg.label;
        if (isAdjust) {
            const cp = tx.counterparty_phone;
            if (isCredit) {
                txLabel = cp ? `Nhận Điều Chỉnh Từ SĐT ${cp}` : 'Nhận Điều Chỉnh Ví';
            } else {
                txLabel = cp ? `Điều Chỉnh Chuyển Sang SĐT ${cp}` : 'Điều Chỉnh Trừ Ví';
            }
        }

        const date = tx.created_at
            ? new Date(tx.created_at).toLocaleDateString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
            : '';
        const createdBy = (tx.created_by && tx.created_by !== 'system') ? tx.created_by
            : (tx.reference_id && tx.reference_id !== 'admin' && tx.reference_id.includes('@')) ? tx.reference_id : '';

        // Extract image URL + clean note text (Nạp từ CK → Khách CK)
        const rawNote = tx.note || tx.source || '';
        const imgMatch = rawNote.match(/\[Ảnh GD: (https?:\/\/[^\]]+)\]/);
        const note = rawNote
            .replace(/\n?\[Ảnh GD: https?:\/\/[^\]]+\]/, '')
            .replace(/Nạp từ CK/gi, 'Khách CK')
            .trim();

        let detailParts = [];
        if (isAdjust) {
            const wp = tx.wrong_customer_phone || '';
            const cpPhone = tx.correct_customer_phone || '';
            const amtFmt = formatCurrency(Math.abs(amount));
            if (wp && cpPhone) {
                detailParts.push(`Điều chỉnh ví sai SĐT: chuyển số dư từ SĐT ${escapeHtml(wp)} → SĐT ${escapeHtml(cpPhone)} (${sign}${amtFmt})`);
            } else if (wp) {
                detailParts.push(`Điều chỉnh trừ ví SĐT ${escapeHtml(wp)} (${sign}${amtFmt})`);
            }
            if (tx.adjustment_reason) detailParts.push('Lý do: ' + escapeHtml(tx.adjustment_reason));
            if (date) detailParts.push(date);
        } else {
            const orderMatch = (rawNote.match(/#?(NJD\/\d{4}\/\d+)/i)
                || (tx.reference_id || '').match(/(NJD\/\d{4}\/\d+)/i));
            const orderCode = orderMatch ? orderMatch[1] : (tx.reference_id || '');

            const isCodPayment = tx.type === 'WITHDRAW'
                && (tx.source === 'SALE_ORDER' || /Thanh toán công nợ.*đơn hàng/i.test(rawNote));
            const isCancelRefund = tx.type === 'DEPOSIT' && tx.source === 'ORDER_CANCEL_REFUND';

            if (isCodPayment) {
                // Giữ breakdown "(Hàng: … + Ship: … = …đ)" — chỉ thay phần đầu
                const headRe = /^Thanh toán công nợ qua COD đơn hàng\s*#?[^\s(]+/i;
                const rewritten = headRe.test(note)
                    ? note.replace(headRe, `Thanh Toán Đơn Hàng #${escapeHtml(orderCode)}`)
                    : `Thanh Toán Đơn Hàng #${escapeHtml(orderCode)}`;
                detailParts.push(rewritten);
                if (date) detailParts.push(date);
                if (createdBy) {
                    detailParts.push(`<span style="color:#ef4444;font-weight:700;">Người Tạo ${escapeHtml(createdBy)}</span>`);
                }
                suppressOperator = true;
            } else if (isCancelRefund) {
                detailParts.push(`Hoàn Tiền Hủy Đơn Công Nợ #${escapeHtml(orderCode)}`);
                if (date) detailParts.push(date);
                if (createdBy) {
                    detailParts.push(`<span style="color:#ef4444;font-weight:700;">Người Hủy ${escapeHtml(createdBy)}</span>`);
                }
                suppressOperator = true;
            } else {
                // Tách "(Duyệt bởi X)" cuối note → đưa ra sau date
                const approverMatch = note.match(/\s*\((Duyệt bởi|Tạo bởi|Hoàn bởi|Bởi)\s+([^)]+)\)\s*$/i);
                if (approverMatch) {
                    const head = note.slice(0, approverMatch.index).trim();
                    if (head) detailParts.push(escapeHtml(head));
                    if (date) detailParts.push(date);
                    detailParts.push(`<span style="color:#1e293b;font-weight:700;">(${escapeHtml(approverMatch[1])} ${escapeHtml(approverMatch[2].trim())})</span>`);
                    suppressOperator = true;
                } else {
                    if (note) detailParts.push(escapeHtml(note));
                    if (date) detailParts.push(date);
                }
            }
        }

        let operatorHtml = '';
        if (isAdjust && tx.adjusted_by) {
            operatorHtml = ` - <span style="color:#ef4444;font-weight:700;">Điều chỉnh bởi ${escapeHtml(tx.adjusted_by)}</span>`;
        } else if (createdBy && !suppressOperator) {
            const isRefund = tx.type === 'DEPOSIT' && tx.source === 'ORDER_CANCEL_REFUND';
            const isDeposit = tx.type === 'DEPOSIT' && !isRefund;
            const isWithdraw = tx.type === 'WITHDRAW';
            const labelOp = isDeposit ? 'Duyệt bởi' : isWithdraw ? 'Tạo bởi' : isRefund ? 'Hoàn bởi' : 'Bởi';
            operatorHtml = ` - <span style="color:#ef4444;font-weight:700;">${labelOp} ${escapeHtml(createdBy)}</span>`;
        }

        // Balance before & after
        const balBefore = parseFloat(tx.balance_before) || 0;
        const vBalBefore = parseFloat(tx.virtual_balance_before) || 0;
        const totalBefore = balBefore + vBalBefore;
        const balAfter = parseFloat(tx.balance_after) || 0;
        const vBalAfter = parseFloat(tx.virtual_balance_after) || 0;
        const totalAfter = balAfter + vBalAfter;

        const detailLine = `${detailParts.join(' - ')}${operatorHtml}`;
        const tooltipText = `${txLabel} ${sign}${formatCurrency(Math.abs(amount))}\nThay đổi số dư: ${formatCurrency(totalBefore)} → ${formatCurrency(totalAfter)}`;

        return `
            <div class="wdm-tx-line" title="${tooltipText.replace(/"/g, '&quot;')}" style="border-left-color:${iconColor};background:${bgColor};">
                <span class="wdm-tx-amount" style="color:${amountColor};">${sign}${formatK(amount)}</span>
                <span class="wdm-tx-text">${detailLine}</span>
                ${imgMatch ? `<img src="${imgMatch[1]}" class="wdm-tx-thumb" alt="Ảnh GD">` : ''}
                <span class="wdm-tx-after">→ ${formatK(totalAfter)}</span>
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
            max-width: 760px;
            width: 94%;
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
            gap: 4px;
        }
        .wdm-tx-line {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-left: 3px solid #16a34a;
            border-radius: 4px;
        }
        .wdm-tx-amount {
            font-size: 15px;
            font-weight: 800;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .wdm-tx-text {
            flex: 1;
            font-size: 13px;
            font-weight: 600;
            color: #1e293b;
            white-space: normal;
            word-break: break-word;
            line-height: 1.45;
        }
        .wdm-tx-thumb {
            width: 26px;
            height: 26px;
            object-fit: cover;
            border-radius: 4px;
            border: 1px solid #e2e8f0;
            cursor: pointer;
            flex-shrink: 0;
        }
        .wdm-tx-after {
            font-size: 14px;
            font-weight: 800;
            color: #1e293b;
            white-space: nowrap;
            flex-shrink: 0;
        }
    `;
    document.head.appendChild(style);

    // Export globally
    window.openWalletDebtModal = openWalletDebtModal;

})();
