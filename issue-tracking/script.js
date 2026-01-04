/**
 * POST-SALES ISSUE TRACKING
 * Powered by Firebase & TPOS API
 */

// Global State
let TICKETS = [];
let selectedOrder = null;
let currentTicketSubscription = null;

// DOM Elements
const elements = {
    tabs: document.querySelectorAll('.tab-btn'),
    ticketList: document.getElementById('ticket-list-body'),
    countPendingGoods: document.getElementById('count-pending-goods'),
    countPendingFinance: document.getElementById('count-pending-finance'),
    countCompleted: document.getElementById('count-completed-today'),
    badgePendingGoods: document.getElementById('badge-pending-goods'),
    badgePendingFinance: document.getElementById('badge-pending-finance'),
    modalCreate: document.getElementById('modal-create-ticket'),
    modalConfirm: document.getElementById('modal-confirm-action'),
    btnCreate: document.getElementById('btn-create-ticket'),
    btnSearchOrder: document.getElementById('btn-search-order'),
    inpSearchOrder: document.getElementById('order-search-input'),
    closeButtons: document.querySelectorAll('.close-modal, .close-modal-btn'),
    loadingOverlay: document.createElement('div') // Creating loading overlay
};

/**
 * INITIALIZATION
 */
document.addEventListener('DOMContentLoaded', () => {
    // Setup UI
    initLoadingOverlay();
    initTabs();
    initModalHandlers();
    initReconcileHandlers();

    // Subscribe to Realtime Data (DISABLED - Using Mock Data)
    console.log('[APP] Using pre-loaded mock data:', TICKETS.length, 'tickets');
    // Sort mock data by createdAt
    TICKETS.sort((a, b) => b.createdAt - a.createdAt);
    // Render initial view
    renderDashboard('all');
    updateStats();

    /* FIREBASE SUBSCRIPTION - Uncomment to use real data
    currentTicketSubscription = ApiService.subscribeToTickets((tickets) => {
        console.log('[APP] Received tickets update:', tickets.length);
        TICKETS = tickets;
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab || 'all';
        renderDashboard(activeTab);
        updateStats();
    });
    */

    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }
});

function initLoadingOverlay() {
    elements.loadingOverlay.id = 'loading-overlay';
    elements.loadingOverlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(255,255,255,0.7); z-index: 9999;
        display: none; align-items: center; justify-content: center;
        font-size: 1.5rem; color: #333;
    `;
    elements.loadingOverlay.innerHTML = '<div>⏳ Đang xử lý...</div>';
    document.body.appendChild(elements.loadingOverlay);
}

function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

function initTabs() {
    elements.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDashboard(btn.dataset.tab);
        });
    });
}

function initModalHandlers() {
    // Open Create Modal
    elements.btnCreate.addEventListener('click', () => {
        openModal(elements.modalCreate);
        resetCreateForm();
        // Focus search input
        setTimeout(() => elements.inpSearchOrder.focus(), 100);
    });

    // Close Modals
    elements.closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal'));
        });
    });

    // Dashboard Search Input Listener
    const searchInput = document.getElementById('search-ticket');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            renderDashboard(activeTab, term);
        });
    }

    // Modal Search Button
    elements.btnSearchOrder.addEventListener('click', handleSearchOrder);

    // Modal Search Enter Key
    elements.inpSearchOrder.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearchOrder();
    });

    // Modal Submit Ticket
    document.getElementById('btn-submit-ticket').addEventListener('click', handleSubmitTicket);

    // Modal Confirm Action (if exists)
    const btnConfirmAction = document.getElementById('btn-confirm-action');
    if (btnConfirmAction) {
        btnConfirmAction.addEventListener('click', handleConfirmAction);
    }


    // Partial Return Checkbox Logic
    const fixCodReason = document.getElementById('fix-cod-reason');
    console.log('[INIT] fix-cod-reason element:', fixCodReason);
    if (fixCodReason) {
        fixCodReason.addEventListener('change', handleIssueTypeChange);
        console.log('[INIT] Event listener attached to fix-cod-reason');
    } else {
        console.warn('[INIT] fix-cod-reason element NOT FOUND');
    }

    const issueTypeSelect = document.getElementById('issue-type-select');
    console.log('[INIT] issue-type-select element:', issueTypeSelect);
    if (issueTypeSelect) {
        issueTypeSelect.addEventListener('change', handleIssueTypeChange);
        console.log('[INIT] Event listener attached to issue-type-select');
    } else {
        console.warn('[INIT] issue-type-select element NOT FOUND');
    }
}

/**
 * CORE LOGIC
 */

async function handleSearchOrder() {
    const query = elements.inpSearchOrder.value.trim();
    if (!query) return alert("Vui lòng nhập SĐT hoặc Mã đơn");

    showLoading(true);
    try {
        // Call API Service
        const orders = await ApiService.searchOrders(query);

        if (orders && orders.length > 0) {
            // Pick first match for now (or show list if multiple? logic simplified to first)
            selectedOrder = orders[0];

            document.getElementById('order-result').classList.remove('hidden');
            document.getElementById('issue-details-form').classList.remove('hidden');

            // Fill Data
            document.getElementById('res-customer').textContent = selectedOrder.customer;
            document.getElementById('res-phone').textContent = selectedOrder.phone;
            document.getElementById('res-tracking').textContent = selectedOrder.trackingCode || '---';

            const productNames = selectedOrder.products.map(p => `${p.quantity}x ${p.name}`).join(', ');
            document.getElementById('res-products').textContent = productNames;

            // Generate Product Checklist (for partial return)
            const checklist = document.getElementById('product-checklist');
            checklist.innerHTML = selectedOrder.products.map(p => `
                <div class="checkbox-item">
                    <input type="checkbox" value="${p.id}" id="prod-${p.id}" checked>
                    <label for="prod-${p.id}">${p.name} - ${formatCurrency(p.price)}</label>
                </div>
            `).join('');

        } else {
            alert("Không tìm thấy đơn hàng trên hệ thống.");
            document.getElementById('order-result').classList.add('hidden');
            selectedOrder = null;
        }
    } catch (error) {
        console.error(error);
        alert("Lỗi khi tìm kiếm đơn hàng: " + error.message);
    } finally {
        showLoading(false);
    }
}

function handleIssueTypeChange(e) {
    console.log('[DEBUG] handleIssueTypeChange called');

    // Logic to toggle visibility of fields
    const issueType = document.getElementById('issue-type-select').value;
    const fixCodReason = document.getElementById('fix-cod-reason').value;

    console.log('[DEBUG] Issue Type:', issueType, 'Fix COD Reason:', fixCodReason);

    const dynamicFields = document.getElementById('dynamic-fields');
    const fixCodGroup = dynamicFields.querySelector('[data-type="FIX_COD"]');
    const returnGroup = dynamicFields.querySelector('[data-type="RETURN"]');

    console.log('[DEBUG] Elements found:', {
        dynamicFields: !!dynamicFields,
        fixCodGroup: !!fixCodGroup,
        returnGroup: !!returnGroup
    });

    // Reset all first
    if (fixCodGroup) fixCodGroup.classList.add('hidden');
    if (returnGroup) returnGroup.classList.add('hidden');

    const trackingGroup = document.getElementById('tracking-input-group');
    const shipperGroup = document.getElementById('shipper-input-group');
    if (trackingGroup) trackingGroup.classList.add('hidden');
    if (shipperGroup) shipperGroup.classList.add('hidden');

    if (issueType === 'FIX_COD') {
        console.log('[DEBUG] Showing FIX_COD fields');
        if (fixCodGroup) fixCodGroup.classList.remove('hidden');

        // Special Case: Partial Return in Fix COD
        if (fixCodReason === 'REJECT_PARTIAL') {
            console.log('[DEBUG] Showing RETURN fields for REJECT_PARTIAL');
            if (returnGroup) returnGroup.classList.remove('hidden');
        }
    } else if (['RETURN_CLIENT', 'RETURN_SHIPPER', 'BOOM'].includes(issueType)) {
        console.log('[DEBUG] Showing RETURN fields for', issueType);
        if (returnGroup) returnGroup.classList.remove('hidden');

        if (issueType === 'RETURN_CLIENT') {
            if (trackingGroup) trackingGroup.classList.remove('hidden');
        } else if (issueType === 'RETURN_SHIPPER') {
            if (shipperGroup) shipperGroup.classList.remove('hidden');
        }
    }

    console.log('[DEBUG] Final state:', {
        fixCodHidden: fixCodGroup?.classList.contains('hidden'),
        returnHidden: returnGroup?.classList.contains('hidden')
    });
}


// Calculate Money Diff for Fix COD
window.calculateCodDiff = function () {
    if (!selectedOrder) return;
    const newCod = parseInt(document.getElementById('new-cod-amount').value) || 0;
    const diff = selectedOrder.cod - newCod;
    document.getElementById('cod-diff-display').textContent = formatCurrency(diff);
}

async function handleSubmitTicket() {
    if (!selectedOrder) return alert("Chưa chọn đơn hàng!");

    const type = document.getElementById('issue-type-select').value;
    if (!type) return alert("Vui lòng chọn loại vấn đề");

    let status = 'PENDING_GOODS';
    let money = 0;
    let note = document.getElementById('ticket-note').value;

    // Logic for Status & Money
    if (type === 'FIX_COD') {
        status = 'PENDING_FINANCE';
        const newCod = parseInt(document.getElementById('new-cod-amount').value) || 0;
        money = selectedOrder.cod - newCod;
    } else if (type === 'OTHER') {
        status = 'COMPLETED';
        money = 0;
    } else {
        // Boom or Return 
        status = 'PENDING_GOODS';
        money = selectedOrder.products.reduce((sum, p) => sum + p.price, 0);
    }

    // Partial Return Check
    let selectedProducts = selectedOrder.products;
    // If partial check enabled and visible
    const returnGroup = document.querySelector('[data-type="RETURN"]');
    if (!returnGroup.classList.contains('hidden')) {
        const checkedIds = Array.from(document.querySelectorAll('#product-checklist input:checked')).map(cb => cb.value);
        selectedProducts = selectedOrder.products.filter(p => checkedIds.includes(String(p.id)));
    }

    const ticketData = {
        orderId: selectedOrder.id || selectedOrder.tposId,
        customer: selectedOrder.customer,
        phone: selectedOrder.phone,
        type: type,
        channel: "TPOS", // Or infer from tracking
        status: status,
        products: selectedProducts,
        money: money,
        note: note,
        // user: currentUser...
    };

    showLoading(true);
    try {
        await ApiService.createTicket(ticketData);
        alert("Đã tạo sự vụ thành công!");
        closeModal(elements.modalCreate);
    } catch (error) {
        console.error(error);
        alert("Lỗi khi tạo sự vụ: " + error.message);
    } finally {
        showLoading(false);
    }
}

let pendingActionTicketId = null;
let pendingActionType = null;

window.promptAction = function (id, action) {
    pendingActionTicketId = id;
    pendingActionType = action;
    const ticket = TICKETS.find(t => t.firebaseId === id); // Note: using firebaseId now

    if (!ticket) return;

    if (action === 'RECEIVE') {
        document.getElementById('confirm-title').textContent = "Xác nhận Nhập Kho";
        document.getElementById('confirm-message').textContent = `Đã nhận đủ hàng từ đơn ${ticket.orderId}?`;
    } else {
        document.getElementById('confirm-title').textContent = "Xác nhận Thanh Toán";
        document.getElementById('confirm-message').textContent = `Đã chuyển khoản ${formatCurrency(ticket.money)} cho ĐVVC?`;
    }

    openModal(elements.modalConfirm);
}

async function handleConfirmAction() {
    if (!pendingActionTicketId) return;

    showLoading(true);
    try {
        // Simple logic: Move to COMPLETED
        // In real world: might need more steps (e.g. adjust debt)
        await ApiService.updateTicket(pendingActionTicketId, {
            status: 'COMPLETED',
            completedAt: firebase.database.ServerValue.TIMESTAMP
        });

        closeModal(elements.modalConfirm);
    } catch (error) {
        console.error(error);
        alert("Lỗi khi cập nhật: " + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * RECONCILIATION LOGIC (NEW)
 */

let reconcileMatches = []; // Store processing results

function initReconcileHandlers() {
    // Open Modal
    const btnOpen = document.getElementById('btn-open-reconcile');
    const modalRec = document.getElementById('modal-reconcile');

    if (btnOpen && modalRec) {
        btnOpen.addEventListener('click', () => {
            openModal(modalRec);
            // Reset
            document.getElementById('excel-input').value = '';
            document.getElementById('reconcile-result-container').classList.add('hidden');
            reconcileMatches = [];
            updateReconcileSummary();
            document.getElementById('btn-confirm-reconcile').disabled = true;
        });
    }

    // Process Button
    document.getElementById('btn-process-excel').addEventListener('click', handlePreviewReconcile);

    // Confirm Button
    document.getElementById('btn-confirm-reconcile').addEventListener('click', handleBatchConfirm);
}

function handlePreviewReconcile() {
    const text = document.getElementById('excel-input').value.trim();
    if (!text) return alert("Vui lòng dán dữ liệu từ Excel!");

    showLoading(true);

    // 1. Parse Excel Data
    const rows = parseExcelData(text);
    console.log('[REC] Parsed rows:', rows.length);

    // 2. Match with Tickets
    reconcileMatches = performReconciliation(rows);

    // 3. Render Results
    renderReconcileTable(reconcileMatches);
    updateReconcileSummary();

    showLoading(false);
    document.getElementById('reconcile-result-container').classList.remove('hidden');
}

function parseExcelData(text) {
    // Split by newlines
    const lines = text.split(/\r?\n/);
    const data = [];

    lines.forEach(line => {
        if (!line.trim()) return;

        // Strategy: 
        // 1. Extract potential Phone (10-11 digits)
        // 2. Extract potential ID (First column usually)
        // 3. Extract Money (digits with optional commas/dots)

        // Remove commas in numbers for easier parsing
        const cleanLine = line.replace(/,/g, '');
        const cols = cleanLine.split(/\t/); // Excel copy usually uses Tab

        const rawId = cols[0] ? cols[0].trim() : '';

        // Find phone using Regex
        const phoneMatch = line.match(/(0\d{9,10})/);
        const phone = phoneMatch ? phoneMatch[0] : '';

        // Find money: Look for numbers > 1000
        const moneyMatch = cleanLine.match(/(\d{4,})/g);
        // Heuristic: Money is usually the largest number or specific column. 
        // For simplicity, let's take largest number found (risk: OrderId might be number)
        // Better: Expect user to check. Or user specific columns. 
        // Let's assume Column B (index 1) or D (index 3) based on user image.
        // Image: Col B=325000, Col D=325000. 
        // Let's try to parse money from Col B or D.
        let money = 0;
        if (cols[1]) money = parseInt(cols[1].replace(/\D/g, '')) || 0;

        if (rawId || phone) {
            data.push({
                rawId: rawId,
                phone: phone,
                money: money,
                originalLine: line
            });
        }
    });

    return data;
}

function performReconciliation(excelRows) {
    const results = [];

    // Index tickets for faster lookup
    // Map by OrderID (lowercase) and Phone
    const ticketMapById = {};
    const ticketMapByPhone = {}; // Phone might have duplicates!

    TICKETS.forEach(t => {
        if (t.orderId) ticketMapById[t.orderId.toLowerCase()] = t;
        // Phone: store array of tickets
        if (t.phone) {
            if (!ticketMapByPhone[t.phone]) ticketMapByPhone[t.phone] = [];
            ticketMapByPhone[t.phone].push(t);
        }
    });

    excelRows.forEach(row => {
        let match = null;
        let status = 'Not Found';
        let detail = 'Không tìm thấy trên hệ thống';
        let resultCode = 'GHOST'; // GHOST, VALID, ERROR, DUPLICATE

        // 1. Try Match by ID
        if (row.rawId && ticketMapById[row.rawId.toLowerCase()]) {
            match = ticketMapById[row.rawId.toLowerCase()];
        }
        // 2. Try Match by Phone
        else if (row.phone && ticketMapByPhone[row.phone]) {
            const candidates = ticketMapByPhone[row.phone];
            if (candidates.length === 1) {
                match = candidates[0];
            } else if (candidates.length > 1) {
                // Ambiguous: Multiple tickets with same phone
                // Prefer PENDING_FINANCE
                const pending = candidates.find(c => c.status === 'PENDING_FINANCE');
                match = pending || candidates[0]; // Fallback to first
                if (!pending) detail += " (Trùng SĐT)";
            }
        }

        if (match) {
            // Validation Logic
            if (match.status === 'PENDING_FINANCE') {
                resultCode = 'VALID';
                status = 'Ready';
                detail = 'Hợp lệ để thanh toán';
            } else if (match.status === 'PENDING_GOODS') {
                resultCode = 'ERROR';
                status = 'Not Ready';
                detail = 'Đang chờ hàng về (Chưa nhận hàng)';
            } else if (match.status === 'COMPLETED') {
                resultCode = 'DUPLICATE';
                status = 'Done';
                detail = 'Đã thanh toán trước đó';
            } else {
                resultCode = 'UNKNOWN';
                status = match.status;
            }
        }

        results.push({
            excel: row,
            ticket: match,
            resultCode: resultCode,
            statusLabel: status,
            message: detail
        });
    });

    return results;
}

function renderReconcileTable(matches) {
    const tbody = document.getElementById('reconcile-table-body');
    tbody.innerHTML = '';

    matches.forEach(item => {
        let rowClass = '';
        if (item.resultCode === 'VALID') rowClass = 'row-success';
        else if (item.resultCode === 'ERROR' || item.resultCode === 'GHOST') rowClass = 'row-error';
        else if (item.resultCode === 'DUPLICATE') rowClass = 'row-warning';

        const tr = document.createElement('tr');
        tr.className = rowClass;

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold">${item.excel.rawId}</div>
                <div>${item.excel.phone || '---'}</div>
                <div style="font-size:11px">${formatCurrency(item.excel.money)}</div>
            </td>
            <td>
                ${item.ticket ? `
                    <div style="font-weight:bold">${item.ticket.orderId}</div>
                    <div>${item.ticket.customer}</div>
                    <span class="status-badge status-${item.ticket.status.toLowerCase().replace('_', '-')}">${translateStatus(item.ticket.status)}</span>
                ` : '<em style="color:#94a3b8">---</em>'}
            </td>
            <td>
                <div class="${item.resultCode === 'VALID' ? 'text-success' : (item.resultCode === 'DUPLICATE' ? 'text-warning' : 'text-error')}">
                    ${item.resultCode}
                </div>
                <div style="font-size:11px">${item.message}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateReconcileSummary() {
    const total = reconcileMatches.length;
    const valid = reconcileMatches.filter(m => m.resultCode === 'VALID').length;
    const error = reconcileMatches.filter(m => ['GHOST', 'ERROR'].includes(m.resultCode)).length;

    // Sum money valid
    const totalMoney = reconcileMatches
        .filter(m => m.resultCode === 'VALID')
        .reduce((sum, m) => sum + (m.ticket ? m.ticket.money : 0), 0);

    document.getElementById('rec-total-count').textContent = total;
    document.getElementById('rec-valid-count').textContent = valid;
    document.getElementById('rec-error-count').textContent = error;
    document.getElementById('rec-total-money').textContent = formatCurrency(totalMoney);
    document.getElementById('btn-rec-count').textContent = valid;
    document.getElementById('btn-confirm-reconcile').disabled = valid === 0;
}

async function handleBatchConfirm() {
    const validItems = reconcileMatches.filter(m => m.resultCode === 'VALID');
    if (validItems.length === 0) return;

    if (!confirm(`Xác nhận thanh toán cho ${validItems.length} đơn hàng hợp lệ?`)) return;

    showLoading(true);
    try {
        const promises = validItems.map(item => {
            return ApiService.updateTicket(item.ticket.firebaseId, {
                status: 'COMPLETED',
                completedAt: firebase.database.ServerValue.TIMESTAMP,
                reconcileNote: `Batch Settle via Excel: ${item.excel.rawId}`
            });
        });

        await Promise.all(promises);

        alert("Đã quyết toán xong!");
        closeModal(document.getElementById('modal-reconcile'));
        // Refresh? Triggered by listener usually
    } catch (e) {
        console.error(e);
        alert("Lỗi khi quyết toán: " + e.message);
    } finally {
        showLoading(false);
    }
}

/**
 * UTILS & RENDER
 */

const GUIDES = {
    'all': `
        <strong>Tất cả sự vụ:</strong> Tra cứu và Theo dõi toàn bộ lịch sử.
        <br/><br/>
        <!-- Trigger for Detailed Flow -->
        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('flow-details').classList.toggle('hidden')">
            📜 Xem Quy Trình Xử Lý Chi Tiết
        </button>

        <div id="flow-details" class="hidden" style="margin-top:15px; border-top:1px dashed #ccc; padding-top:15px;">
            <div class="mermaid">
flowchart TD
    Start([Bắt đầu]) --> Search[Tìm kiếm Đơn hàng<br/>SĐT / Mã vận đơn]
    Search -->|Có dữ liệu| Found[Hiện thông tin Đơn]
    Search -->|Không thấy| NotFound[Báo lỗi / Kiểm tra lại]
    
    Found --> SelectType{Chọn Loại Sự Vụ}
    
    SelectType -->|Sửa COD| FixCOD[Form Sửa COD]
    FixCOD --> Reason{Lý do}
    Reason -->|Sai phí/Trừ nợ| InputMoney[Nhập COD mới]
    Reason -->|Khách nhận 1 phần| Partial[Hiện DS Sản phẩm]
    Partial --> CheckItem[Chọn SP khách trả lại]
    CheckItem --> InputMoney
    
    SelectType -->|Khách Trả / Boom| Return[Form Trả Hàng]
    Return --> ReturnSource{Nguồn?}
    ReturnSource -->|Khách gửi| InputTracking[Nhập Mã VĐ Khách gửi]
    ReturnSource -->|Shipper thu| InputShipper[Nhập tên Shipper]
    ReturnSource -->|Boom hàng| ConfirmBoom[Xác nhận Boom]
    
    InputMoney --> Submit[Tạo Ticket]
    InputTracking --> Submit
    InputShipper --> Submit
    ConfirmBoom --> Submit
    
    Submit --> End([Lưu vào Hệ thống])
    
    style Start fill:#dbeafe,stroke:#2563eb,stroke-width:2px
    style End fill:#dcfce7,stroke:#16a34a,stroke-width:2px
    style Submit fill:#fef3c7,stroke:#d97706,stroke-width:2px
            </div>

            <div class="flow-steps" style="margin-top:20px;display:grid;gap:15px;">
                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">1. Trường hợp Sửa COD</strong>
                    <p style="font-size:12px;color:#475569">Dùng khi Shipper báo thu sai tiền hoặc Shop muốn trừ tiền cọc/đổi trả.</p>
                    <img src="images/fix_cod.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>

                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">2. Trường hợp Khách Nhận 1 Phần</strong>
                    <p style="font-size:12px;color:#475569">Chọn lý do "Khách nhận 1 phần" để hiện danh sách. Tích vào sản phẩm Khách <strong>trả lại</strong>.</p>
                    <img src="images/partial.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>

                <div class="step-card" style="background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">
                    <strong style="color:#0f172a">3. Trường hợp Hàng Hoàn / Boom</strong>
                    <p style="font-size:12px;color:#475569">Chọn Boom hoặc Khách Gửi. Nếu Khách gửi qua bưu cục, hãy nhập mã vận đơn mới.</p>
                    <img src="images/return.png" style="width:100%;border-radius:4px;border:1px solid #ccc;margin-top:5px;">
                </div>
            </div>
        </div>
    `,
    'pending-goods': `
        <strong>Kho xử lý:</strong> Đơn cần nhận hàng hoàn.
        <ul>
            <li><strong>Boom/Hoàn:</strong> Kiểm tra hàng -> Bấm <em>Đã Nhận Hàng</em>.</li>
            <li><strong>Trả 1 phần:</strong> Chỉ check món hàng nhận lại.</li>
        </ul>
    `,
    'pending-finance': `
        <strong>Kế toán / Admin:</strong> Đơn cần đối soát tiền.
        <ul>
            <li><strong>Sửa COD:</strong> Chênh lệch tiền cần ck lại cho ĐVVC.</li>
            <li>Sau khi ck -> Bấm <em>Đã Thanh Toán</em>.</li>
        </ul>
    `,
    'completed': `
        <strong>Lịch sử:</strong> Các sự vụ đã hoàn tất.
    `
};

function renderDashboard(tabName, searchTerm = '') {
    // 1. Update Guide
    const guidePanel = document.getElementById('tab-guide');
    const guideContent = document.getElementById('guide-content');

    if (GUIDES[tabName]) {
        guidePanel.classList.remove('hidden');
        guideContent.innerHTML = GUIDES[tabName];
        // Re-init Mermaid if present
        if (typeof mermaid !== 'undefined' && tabName === 'all') {
            mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        }
    } else {
        guidePanel.classList.add('hidden');
    }

    // 2. Filter Lists
    let filtered = TICKETS;

    // Filter by Tab
    if (tabName !== 'all') {
        let filterStatus = [];
        if (tabName === 'pending-goods') filterStatus = ['PENDING_GOODS'];
        else if (tabName === 'pending-finance') filterStatus = ['PENDING_FINANCE'];
        else if (tabName === 'completed') filterStatus = ['COMPLETED'];

        filtered = filtered.filter(t => filterStatus.includes(t.status));
    }

    // Filter by Search
    if (searchTerm) {
        filtered = filtered.filter(t =>
            (t.phone && t.phone.includes(searchTerm)) ||
            (t.orderId && t.orderId.toLowerCase().includes(searchTerm)) ||
            (t.customer && t.customer.toLowerCase().includes(searchTerm))
        );
    }

    // Render
    elements.ticketList.innerHTML = '';
    filtered.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:bold;font-size:13px">${t.orderId}</div>
                <div style="font-size:11px;color:#94a3b8">#${t.firebaseId ? t.firebaseId.slice(-4) : '---'}</div>
            </td>
            <td>
                <div>${t.customer}</div>
                <div style="font-size:12px;color:#64748b">${t.phone}</div>
            </td>
            <td>
                ${renderTypeBadge(t.type)}
                <div style="font-size:12px;margin-top:4px">${t.channel || 'TPOS'}</div>
            </td>
            <td>
                <ul style="list-style:none;font-size:13px">
                    ${(t.products || []).map(p => `<li>• ${p.name}</li>`).join('')}
                </ul>
                ${t.note ? `<div style="font-size:11px;color:#f59e0b;margin-top:2px"><em>Note: ${t.note}</em></div>` : ''}
            </td>
            <td>
                <div style="font-weight:bold;color:${t.status === 'PENDING_FINANCE' ? '#ef4444' : '#1e293b'}">
                    ${formatCurrency(t.money)}
                </div>
                <div style="font-size:11px;color:#64748b">
                    ${t.status === 'PENDING_FINANCE' ? 'Phải trả ĐVVC' : 'Giá trị'}
                </div>
            </td>
            <td>
                <span class="status-badge status-${t.status.toLowerCase().replace('_', '-')}">${translateStatus(t.status)}</span>
            </td>
            <td>
                ${renderActionButtons(t)}
            </td>
        `;
        elements.ticketList.appendChild(tr);
    });
}

function renderTypeBadge(type) {
    const map = {
        'BOOM': { text: 'Boom Hàng', class: 'type-boom' },
        'FIX_COD': { text: 'Sửa COD', class: 'type-fix' },
        'RETURN_CLIENT': { text: 'Khách Gửi', class: 'type-return' },
        'RETURN_SHIPPER': { text: 'Shipper Thu', class: 'type-return' },
        'OTHER': { text: 'Vấn đề khác', class: 'type-other' },
    };
    const conf = map[type] || { text: type, class: '' };
    return `<span class="type-label ${conf.class}">● ${conf.text}</span>`;
}

function renderActionButtons(ticket) {
    const id = ticket.firebaseId;
    if (ticket.status === 'PENDING_GOODS') {
        return `<button class="btn btn-primary btn-sm" onclick="promptAction('${id}', 'RECEIVE')">Đã Nhận Hàng</button>`;
    } else if (ticket.status === 'PENDING_FINANCE') {
        return `<button class="btn btn-primary btn-sm" onclick="promptAction('${id}', 'PAY')">Đã Thanh Toán</button>`;
    }
    return `<span style="color:#10b981">✓ Xong</span>`;
}

// Helper: Toggle Guide
window.toggleGuide = function () {
    const content = document.getElementById('guide-content');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        document.querySelector('.btn-toggle-guide').textContent = '▼';
    } else {
        content.style.display = 'none';
        document.querySelector('.btn-toggle-guide').textContent = '▶';
    }
}

// Helper: Update Stats
function updateStats() {
    const pendingGoods = TICKETS.filter(t => t.status === 'PENDING_GOODS').length;
    const pendingFinance = TICKETS.filter(t => t.status === 'PENDING_FINANCE').length;

    elements.countPendingGoods.textContent = pendingGoods;
    elements.countPendingFinance.textContent = pendingFinance;

    elements.badgePendingGoods.textContent = pendingGoods > 0 ? pendingGoods : '';
    elements.badgePendingFinance.textContent = pendingFinance > 0 ? pendingFinance : '';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function openModal(el) { el.classList.add('show'); }
function closeModal(el) { el.classList.remove('show'); }

function resetCreateForm() {
    selectedOrder = null;
    elements.inpSearchOrder.value = '';
    document.getElementById('order-result').classList.add('hidden');
    document.getElementById('issue-details-form').classList.add('hidden');
    document.getElementById('issue-type-select').value = '';
    document.getElementById('ticket-note').value = '';
}

function translateStatus(s) {
    const map = {
        'PENDING_GOODS': 'Chờ nhận hàng',
        'PENDING_FINANCE': 'Chờ đối soát',
        'COMPLETED': 'Hoàn tất'
    };
    return map[s] || s;
}
