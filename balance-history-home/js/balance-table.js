// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BALANCE HISTORY HOME - TABLE RENDERING
// Bảng giao dịch đơn giản với 7 cột:
//   Ngày giờ | Loại | Số tiền | Số dư sau GD | Nội dung | Mã tham chiếu | Mã phòng
// =====================================================

// NOTE: Depends on balance-core.js for: formatCurrency, formatDateTime,
//       allLoadedData, currentPage, totalPages, showNotification, CONFIG.

// Escape HTML to prevent XSS in user-provided content
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Format amount with +/- prefix and currency
function formatAmount(amount, type) {
    const sign = type === 'in' ? '+' : '-';
    return `${sign}${formatCurrency(Math.abs(amount))}`;
}

// =====================================================
// MAIN TABLE RENDER
// =====================================================

function renderTable(data) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Chưa có giao dịch nào</p>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const html = data.map(renderTransactionRow).join('');
    tableBody.innerHTML = html;

    if (window.lucide) lucide.createIcons();
}

// =====================================================
// SINGLE ROW RENDER
// =====================================================

function renderTransactionRow(row) {
    const isIn = row.transfer_type === 'in';

    const typeBadge = isIn
        ? '<span class="badge badge-in">Vào</span>'
        : '<span class="badge badge-out">Ra</span>';

    const amountHtml = `<span class="amount-${row.transfer_type}">${formatAmount(row.amount ?? row.transfer_amount, row.transfer_type)}</span>`;

    const runningBalance =
        row.running_balance != null
            ? formatCurrency(row.running_balance)
            : '<span class="text-muted">—</span>';

    const roomOptions =
        typeof window.renderRoomOptions === 'function'
            ? window.renderRoomOptions(row.room_code || '')
            : `<option value="">(chưa gán)</option>`;

    const roomDropdown = `
        <select class="room-code-select" data-tx-id="${row.id}">
            ${roomOptions}
        </select>
    `;

    const hiddenClass = row.is_hidden ? ' is-hidden-row' : '';

    // Nhãn tài khoản (44 TL / 481 NVK) từ CONFIG.ACCOUNTS — phân biệt 2 nhà.
    const accountLabel =
        typeof window.getAccountLabel === 'function'
            ? window.getAccountLabel(row.account_number)
            : escapeHtml(row.account_number || '');
    const accountHtml = accountLabel
        ? `<span class="account-tag" title="${escapeHtml(row.account_number || '')}">${escapeHtml(accountLabel)}</span>`
        : '<span class="text-muted">—</span>';

    return `
        <tr data-transaction-id="${row.id}" class="tx-row${hiddenClass}">
            <td class="col-date">${formatDateTime(row.transaction_date)}</td>
            <td class="col-account">${accountHtml}</td>
            <td class="col-type">${typeBadge}</td>
            <td class="col-amount">${amountHtml}</td>
            <td class="col-balance running-balance">${runningBalance}</td>
            <td class="col-content">${escapeHtml(row.content)}</td>
            <td class="col-ref"><code>${escapeHtml(row.reference_code || '')}</code></td>
            <td class="col-room">${roomDropdown}</td>
        </tr>
    `;
}

// =====================================================
// HEADER STATISTICS RENDER
// =====================================================

function renderStatistics(stats) {
    if (!stats) return;

    const totalIn = document.getElementById('totalIn');
    const totalInCount = document.getElementById('totalInCount');
    const totalOut = document.getElementById('totalOut');
    const totalOutCount = document.getElementById('totalOutCount');
    const netChange = document.getElementById('netChange');
    const totalTransactions = document.getElementById('totalTransactions');
    const latestBalance = document.getElementById('latestBalance');

    if (totalIn) totalIn.textContent = formatCurrency(stats.total_in || 0);
    if (totalInCount) totalInCount.textContent = `${stats.total_in_count || 0} giao dịch`;
    if (totalOut) totalOut.textContent = formatCurrency(stats.total_out || 0);
    if (totalOutCount) totalOutCount.textContent = `${stats.total_out_count || 0} giao dịch`;
    if (netChange) netChange.textContent = formatCurrency(stats.net_change || 0);
    if (totalTransactions)
        totalTransactions.textContent = `${stats.total_transactions || 0} giao dịch`;
    if (latestBalance) latestBalance.textContent = formatCurrency(stats.latest_balance || 0);
}

// =====================================================
// ROOM CODE DROPDOWN — change handler
// PUT /api/sepay-home/transaction/:id/room { room_code }
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    tableBody.addEventListener('change', async (e) => {
        if (!e.target.classList.contains('room-code-select')) return;

        const select = e.target;
        const txId = select.dataset.txId;
        const newRoomCode = select.value;
        const previousValue = select.dataset.previousValue || '';

        select.disabled = true;

        try {
            const url = `${CONFIG.API_BASE_URL}/api/sepay-home/transaction/${txId}/room`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room_code: newRoomCode || null }),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // Update local data so cache stays consistent
            if (Array.isArray(window.allLoadedData)) {
                const item = window.allLoadedData.find((t) => t.id == txId);
                if (item) item.room_code = newRoomCode || null;
            }

            select.dataset.previousValue = newRoomCode;
            showNotification('Đã cập nhật mã phòng', 'success');
        } catch (err) {
            console.error('[ROOM-CODE] Update failed:', err);
            select.value = previousValue;
            showNotification('Lỗi cập nhật mã phòng: ' + err.message, 'error');
        } finally {
            select.disabled = false;
        }
    });
});

// Export
window.renderTable = renderTable;
window.renderTransactionRow = renderTransactionRow;
window.renderStatistics = renderStatistics;
window.formatAmount = formatAmount;
window.escapeHtml = escapeHtml;
