/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        TAB1-EDIT-MODAL.JS                                    ║
 * ║              Edit Order Modal & Product Management                           ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Module chứa các function liên quan đến modal sửa đơn hàng:                  ║
 * ║  - Edit modal initialization & lifecycle                                     ║
 * ║  - Tab switching & content rendering                                         ║
 * ║  - Product editing (quantity, note, remove, price)                           ║
 * ║  - Inline product search                                                     ║
 * ║  - Address lookup                                                            ║
 * ║  - Save order changes                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Dependencies: tab1-core.js
 * Exports: Edit modal functions via window object
 */

// =====================================================
// MODULE STATE
// =====================================================

// Use state from tab1-core.js via window.tab1State
let currentEditOrderId = null;
let hasUnsavedOrderChanges = false;
let inlineSearchTimeout = null;

// Reference to currentEditOrderData from core module
// This is managed by window.tab1State.currentEditOrderData

// =====================================================
// EDIT MODAL INITIALIZATION (IIFE)
// =====================================================
(function initEditModal() {
    if (document.getElementById("editOrderModal")) return;
    const modalHTML = `
        <div id="editOrderModal" class="edit-modal">
            <div class="edit-modal-content">
                <div class="edit-modal-header">
                    <h3><i class="fas fa-edit"></i> Sửa đơn hàng <span class="order-code" id="modalOrderCode">...</span></h3>
                    <button class="edit-modal-close" onclick="closeEditModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="edit-tabs">
                    <button class="edit-tab-btn active" onclick="switchEditTab('info')"><i class="fas fa-user"></i> Thông tin liên hệ</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('products')"><i class="fas fa-box"></i> Sản phẩm (<span id="productCount">0</span>)</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('delivery')"><i class="fas fa-shipping-fast"></i> Thông tin giao hàng</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('live')"><i class="fas fa-video"></i> Lịch sử đơn live</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoices')"><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('invoice_history')"><i class="fas fa-history"></i> Lịch sử hóa đơn</button>
                    <button class="edit-tab-btn" onclick="switchEditTab('history')"><i class="fas fa-clock"></i> Lịch sử chỉnh sửa</button>
                </div>
                <div class="edit-modal-body" id="editModalBody"><div class="loading-state"><div class="loading-spinner"></div></div></div>
                <div class="edit-modal-footer">
                    <div class="modal-footer-left"><i class="fas fa-info-circle"></i> Cập nhật lần cuối: <span id="lastUpdated">...</span></div>
                    <div class="modal-footer-right">
                        <button class="btn-modal btn-modal-print" onclick="printOrder()"><i class="fas fa-print"></i> In đơn</button>
                        <button class="btn-modal btn-modal-cancel" onclick="closeEditModal()"><i class="fas fa-times"></i> Đóng</button>
                        <button class="btn-modal btn-modal-save" onclick="saveAllOrderChanges()"><i class="fas fa-save"></i> Lưu tất cả thay đổi</button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
})();

// =====================================================
// OPEN/CLOSE EDIT MODAL
// =====================================================

async function openEditModal(orderId) {
    currentEditOrderId = orderId;
    hasUnsavedOrderChanges = false;
    const modal = document.getElementById("editOrderModal");
    modal.classList.add("show");
    switchEditTab("info");
    document.getElementById("editModalBody").innerHTML =
        `<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Đang tải dữ liệu đơn hàng...</div></div>`;
    try {
        await fetchOrderData(orderId);
    } catch (error) {
        showErrorState(error.message);
    }
}

function closeEditModal() {
    if (hasUnsavedOrderChanges) {
        window.notificationManager.confirm(
            "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng không?",
            "Cảnh báo"
        ).then(result => {
            if (result) {
                forceCloseEditModal();
            }
        });
        return;
    }
    forceCloseEditModal();
}

function forceCloseEditModal() {
    document.getElementById("editOrderModal").classList.remove("show");
    window.tab1State.currentEditOrderData = null;
    currentEditOrderId = null;
    hasUnsavedOrderChanges = false;
}

function showErrorState(message) {
    document.getElementById("editModalBody").innerHTML =
        `<div class="empty-state" style="color: #ef4444;"><i class="fas fa-exclamation-triangle"></i><p>Lỗi: ${message}</p><button class="btn-primary" onclick="fetchOrderData('${currentEditOrderId}')">Thử lại</button></div>`;
}

function printOrder() {
    window.print();
}

// =====================================================
// FETCH ORDER DATA
// =====================================================

async function fetchOrderData(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    window.tab1State.currentEditOrderData = data;
    updateModalWithData(data);
}

function updateModalWithData(data) {
    document.getElementById("modalOrderCode").textContent = data.Code || "";
    document.getElementById("lastUpdated").textContent = new Date(
        data.LastUpdated,
    ).toLocaleString("vi-VN");
    document.getElementById("productCount").textContent =
        data.Details?.length || 0;
    switchEditTab("info");

    // Refresh inline search UI after data is loaded
    setTimeout(() => {
        refreshInlineSearchUI();
    }, 100);
}

// =====================================================
// TAB SWITCHING
// =====================================================

function switchEditTab(tabName) {
    document
        .querySelectorAll(".edit-tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
    const activeTab = document.querySelector(
        `.edit-tab-btn[onclick*="${tabName}"]`,
    );
    if (activeTab) activeTab.classList.add("active");
    renderTabContent(tabName);
    if (tabName === "products") initInlineSearchAfterRender();
}

function renderTabContent(tabName) {
    const body = document.getElementById("editModalBody");
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    if (!currentEditOrderData) {
        body.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div></div>`;
        return;
    }
    const renderers = {
        info: renderInfoTab,
        products: renderProductsTab,
        delivery: renderDeliveryTab,
        live: renderLiveTab,
        invoices: renderInvoicesTab,
        invoice_history: renderInvoiceHistoryTab,
        history: renderHistoryTab,
    };
    body.innerHTML = renderers[tabName]
        ? renderers[tabName](currentEditOrderData)
        : `<div class="empty-state"><p>Tab không tồn tại</p></div>`;
}

// =====================================================
// TAB RENDERERS
// =====================================================

function renderInfoTab(data) {
    return `
        <div class="info-card">
            <h4><i class="fas fa-user"></i> Thông tin khách hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Tên khách hàng</div><div class="info-value highlight">${data.Name || ""}</div></div>
                <div class="info-field">
                    <div class="info-label">Điện thoại</div>
                    <div class="info-value">
                        <input type="text" class="form-control" value="${data.Telephone || ""}"
                            onchange="updateOrderInfo('Telephone', this.value)"
                            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Địa chỉ đầy đủ</div>
                    <div class="info-value">
                        <textarea class="form-control"
                            onchange="updateOrderInfo('Address', this.value)"
                            style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; min-height: 60px; resize: vertical;">${data.Address || ""}</textarea>
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1; margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px;">
                    <div class="info-label" style="color: #2563eb; font-weight: 600;">Tra cứu địa chỉ</div>
                    <div class="info-value">
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" id="fullAddressLookupInput" class="form-control" placeholder="Nhập địa chỉ đầy đủ (VD: 28/6 phạm văn chiêu...)"
                                style="flex: 1; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px;"
                                onkeydown="if(event.key === 'Enter') handleFullAddressLookup()">
                            <button type="button" class="btn-primary" onclick="handleFullAddressLookup()" style="padding: 6px 12px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-magic"></i> Tìm Full
                            </button>
                        </div>
                        <div id="addressLookupResults" style="display: none; border: 1px solid #e5e7eb; border-radius: 4px; max-height: 400px; overflow-y: auto; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-shopping-cart"></i> Thông tin đơn hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Mã đơn</div><div class="info-value highlight">${data.Code || ""}</div></div>
                <div class="info-field"><div class="info-label">Trạng thái</div><div class="info-value"><span class="status-badge-large ${data.Status === "Draft" ? "status-badge-draft" : "status-badge-order"}">${data.StatusText || data.Status || ""}</span></div></div>
                <div class="info-field"><div class="info-label">Tổng tiền</div><div class="info-value highlight">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</div></div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú</div>
                    <div class="info-value">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(data.Note || "") : (data.Note || "")}</div>
                </div>
            </div>
        </div>`;
}

function updateOrderInfo(field, value) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    if (!currentEditOrderData) return;
    currentEditOrderData[field] = value;
    window.tab1State.currentEditOrderData = currentEditOrderData;
    hasUnsavedOrderChanges = true;

    if (window.showSaveIndicator) {
        window.showSaveIndicator("success", "Đã cập nhật thông tin (chưa lưu)");
    } else if (window.notificationManager) {
        window.notificationManager.show("Đã cập nhật thông tin (chưa lưu)", "info");
    }
}

function renderProductsTab(data) {
    const inlineSearchHTML = `
        <div class="product-search-inline">
            <div class="search-input-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="inlineProductSearch" class="inline-search-input" placeholder="Tìm sản phẩm theo tên hoặc mã..." autocomplete="off">
            </div>
            <div id="inlineSearchResults" class="inline-search-results"></div>
        </div>`;

    if (!data.Details || data.Details.length === 0) {
        return `<div class="info-card">${inlineSearchHTML}<div class="empty-state"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm</p></div></div>`;
    }

    const productsHTML = data.Details.map(
        (p, i) => `
        <tr class="product-row" data-index="${i}">
            <td>${i + 1}</td>
            <td>${p.ImageUrl ? `<img src="${p.ImageUrl}" class="product-image">` : ""}</td>
            <td><div>${p.ProductNameGet || p.ProductName}</div><div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || "N/A"}</div></td>
            <td style="text-align: center;"><div class="quantity-controls"><button onclick="updateProductQuantity(${i}, -1)" class="qty-btn"><i class="fas fa-minus"></i></button><input type="number" class="quantity-input" value="${p.Quantity || 1}" onchange="updateProductQuantity(${i}, 0, this.value)" min="1"><button onclick="updateProductQuantity(${i}, 1)" class="qty-btn"><i class="fas fa-plus"></i></button></div></td>
            <td style="text-align: right;">${(p.Price || 0).toLocaleString("vi-VN")}đ</td>
            <td style="text-align: right; font-weight: 600;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString("vi-VN")}đ</td>
            <td><input type="text" class="note-input" value="${p.Note || ""}" onchange="updateProductNote(${i}, this.value)"></td>
            <td style="text-align: center;"><div class="action-buttons"><button onclick="editProductDetail(${i})" class="btn-product-action btn-edit-item" title="Sửa"><i class="fas fa-edit"></i></button><button onclick="removeProduct(${i})" class="btn-product-action btn-delete-item" title="Xóa"><i class="fas fa-trash"></i></button></div></td>
        </tr>`,
    ).join("");

    return `
        <div class="info-card">
            ${inlineSearchHTML}
            <h4 style="margin-top: 24px;"><i class="fas fa-box"></i> Danh sách sản phẩm (${data.Details.length})</h4>
            <table class="products-table">
                <thead><tr><th>#</th><th>Ảnh</th><th>Sản phẩm</th><th style="text-align: center;">SL</th><th style="text-align: right;">Đơn giá</th><th style="text-align: right;">Thành tiền</th><th>Ghi chú</th><th style="text-align: center;">Thao tác</th></tr></thead>
                <tbody id="productsTableBody">${productsHTML}</tbody>
                <tfoot style="background: #f9fafb; font-weight: 600;"><tr><td colspan="3" style="text-align: right;">Tổng cộng:</td><td style="text-align: center;" id="totalQuantity">${data.TotalQuantity || 0}</td><td></td><td style="text-align: right; color: #3b82f6;" id="totalAmount">${(data.TotalAmount || 0).toLocaleString("vi-VN")}đ</td><td colspan="2"></td></tr></tfoot>
            </table>
        </div>`;
}

function renderDeliveryTab(data) {
    return `<div class="empty-state"><p>Thông tin giao hàng</p></div>`;
}

function renderLiveTab(data) {
    const liveInfo = data.CRMTeam || {};
    const hasLiveInfo = liveInfo && liveInfo.Name;

    if (!hasLiveInfo) {
        return `
            <div class="empty-state">
                <i class="fas fa-video" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Không có thông tin chiến dịch live</p>
                <p style="color: #9ca3af; font-size: 13px;">Đơn hàng này chưa được liên kết với chiến dịch live nào</p>
            </div>
        `;
    }

    return `
        <div class="info-card">
            <h4><i class="fas fa-video"></i> Thông tin Livestream</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Tên chiến dịch</div>
                    <div class="info-value highlight">${liveInfo.Name || 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Mã chiến dịch</div>
                    <div class="info-value">${liveInfo.Code || 'N/A'}</div>
                </div>
                ${liveInfo.Description ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Mô tả</div>
                    <div class="info-value">${liveInfo.Description}</div>
                </div>
                ` : ''}
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-info-circle"></i> Thông tin bổ sung</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Người phụ trách</div>
                    <div class="info-value">${data.User?.Name || 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Thời gian tạo đơn</div>
                    <div class="info-value">${data.CreatedDate ? new Date(data.CreatedDate).toLocaleString('vi-VN') : 'N/A'}</div>
                </div>
            </div>
        </div>
    `;
}

function renderInvoicesTab(data) {
    const hasInvoice = data.InvoiceNumber || data.InvoiceDate;

    return `
        <div class="info-card">
            <h4><i class="fas fa-file-invoice-dollar"></i> Thông tin hóa đơn & thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Số hóa đơn</div>
                    <div class="info-value highlight">${data.InvoiceNumber || 'Chưa xuất hóa đơn'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Ngày xuất hóa đơn</div>
                    <div class="info-value">${data.InvoiceDate ? new Date(data.InvoiceDate).toLocaleString('vi-VN') : 'N/A'}</div>
                </div>
                <div class="info-field">
                    <div class="info-label">Tổng tiền</div>
                    <div class="info-value highlight" style="color: #059669; font-weight: 700;">
                        ${(data.TotalAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Đã thanh toán</div>
                    <div class="info-value" style="color: ${data.PaidAmount > 0 ? '#059669' : '#6b7280'};">
                        ${(data.PaidAmount || 0).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Còn lại</div>
                    <div class="info-value" style="color: ${(data.TotalAmount - (data.PaidAmount || 0)) > 0 ? '#ef4444' : '#059669'};">
                        ${((data.TotalAmount || 0) - (data.PaidAmount || 0)).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Trạng thái thanh toán</div>
                    <div class="info-value">
                        <span class="status-badge-large ${data.PaidAmount >= data.TotalAmount ? 'status-badge-paid' :
            data.PaidAmount > 0 ? 'status-badge-partial' : 'status-badge-unpaid'
        }">
                            ${data.PaidAmount >= data.TotalAmount ? 'Đã thanh toán' :
            data.PaidAmount > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán'
        }
                        </span>
                    </div>
                </div>
            </div>
        </div>

        ${data.PaymentMethod ? `
        <div class="info-card">
            <h4><i class="fas fa-credit-card"></i> Phương thức thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Phương thức</div>
                    <div class="info-value">${data.PaymentMethod}</div>
                </div>
                ${data.PaymentNote ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú thanh toán</div>
                    <div class="info-value">${data.PaymentNote}</div>
                </div>
                ` : ''}
            </div>
        </div>
        ` : ''}

        ${!hasInvoice ? `
        <div class="empty-state">
            <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
            <p style="color: #9ca3af; font-size: 13px;">Đơn hàng chưa có hóa đơn chi tiết</p>
        </div>
        ` : ''}
    `;
}

function renderHistoryTab(data) {
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử chỉnh sửa...</div>
        </div>
    `;

    setTimeout(async () => {
        try {
            await fetchAndDisplayAuditLog(data.Id);
        } catch (error) {
            console.error('[AUDIT LOG] Error fetching audit log:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không thể tải lịch sử chỉnh sửa</p>
                    <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
                    <button class="btn-primary" style="margin-top: 16px;" onclick="switchEditTab('history')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }, 100);

    return loadingHTML;
}

function renderInvoiceHistoryTab(data) {
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử hóa đơn...</div>
        </div>
    `;

    setTimeout(async () => {
        try {
            const partnerId = data.PartnerId || (data.Partner && data.Partner.Id);
            if (!partnerId) {
                throw new Error("Không tìm thấy thông tin khách hàng (PartnerId)");
            }
            await fetchAndDisplayInvoiceHistory(partnerId);
        } catch (error) {
            console.error('[INVOICE HISTORY] Error:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không thể tải lịch sử hóa đơn</p>
                    <p style="font-size: 13px; color: #6b7280;">${error.message}</p>
                    <button class="btn-primary" style="margin-top: 16px;" onclick="switchEditTab('invoice_history')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }, 100);

    return loadingHTML;
}

// =====================================================
// FETCH HISTORY DATA
// =====================================================

async function fetchAndDisplayAuditLog(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/AuditLog/ODataService.GetAuditLogEntity?entityName=SaleOnline_Order&entityId=${orderId}&skip=0&take=50`;

    console.log('[AUDIT LOG] Fetching audit log for order:', orderId);

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const auditData = await response.json();
    console.log('[AUDIT LOG] Received audit log:', auditData);
    document.getElementById('editModalBody').innerHTML = renderAuditLogTimeline(auditData.value || []);
}

async function fetchAndDisplayInvoiceHistory(partnerId) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetOrdersByPartnerId?partnerId=${partnerId}&fromDate=${startDate.toISOString()}&toDate=${endDate.toISOString()}`;

    console.log('[INVOICE HISTORY] Fetching history for partner:', partnerId);

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[INVOICE HISTORY] Received data:', data);
    document.getElementById('editModalBody').innerHTML = renderInvoiceHistoryTable(data.value || []);
}

function renderInvoiceHistoryTable(invoices) {
    if (invoices.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Không có lịch sử hóa đơn</p>
                <p style="color: #9ca3af; font-size: 13px;">Khách hàng chưa có đơn hàng nào trong 30 ngày qua</p>
            </div>
        `;
    }

    const rows = invoices.map((inv, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><a href="https://tomato.tpos.vn/#/app/fastsaleorder/invoiceform1?id=${inv.Id}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">${inv.Number || 'N/A'}</a></td>
            <td style="text-align: right; font-weight: 600;">${(inv.AmountTotal || 0).toLocaleString('vi-VN')}đ</td>
            <td style="text-align: center;">
                <span class="status-badge-large ${inv.State === 'completed' ? 'status-badge-paid' : 'status-badge-order'}">
                    ${inv.ShowState || inv.State || 'N/A'}
                </span>
            </td>
            <td>${inv.DateInvoice ? new Date(inv.DateInvoice).toLocaleString('vi-VN') : 'N/A'}</td>
        </tr>
    `).join('');

    return `
        <div class="info-card">
            <h4><i class="fas fa-history"></i> Lịch sử hóa đơn (30 ngày gần nhất)</h4>
            <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
                <table class="table" style="margin-top: 16px; width: 100%;">
                    <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                        <tr>
                            <th style="width: 50px;">#</th>
                            <th>Mã hóa đơn</th>
                            <th style="text-align: right;">Tổng tiền</th>
                            <th style="text-align: center;">Trạng thái</th>
                            <th>Ngày tạo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderAuditLogTimeline(auditLogs) {
    if (auditLogs.length === 0) {
        return `
            <div class="empty-state">
                <i class="fas fa-history" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="color: #6b7280; margin-bottom: 8px;">Chưa có lịch sử chỉnh sửa</p>
                <p style="color: #9ca3af; font-size: 13px;">Các thay đổi trên đơn hàng sẽ được ghi lại tại đây</p>
            </div>
        `;
    }

    const actionConfig = {
        'CREATE': { icon: 'plus-circle', color: '#3b82f6', label: 'Tạo mới' },
        'UPDATE': { icon: 'edit', color: '#8b5cf6', label: 'Cập nhật' },
        'DELETE': { icon: 'trash', color: '#ef4444', label: 'Xóa' },
        'APPROVE': { icon: 'check-circle', color: '#10b981', label: 'Phê duyệt' },
        'REJECT': { icon: 'x-circle', color: '#ef4444', label: 'Từ chối' }
    };

    return `
        <div class="history-timeline">
            <div class="timeline-header">
                <h4><i class="fas fa-history"></i> Lịch sử thay đổi</h4>
                <span class="timeline-count">${auditLogs.length} thay đổi</span>
            </div>
            <div class="timeline-content">
                ${auditLogs.map((log, index) => {
        const config = actionConfig[log.Action] || { icon: 'circle', color: '#6b7280', label: log.Action };
        const date = new Date(log.DateCreated);
        const description = formatAuditDescription(log.Description);

        return `
                        <div class="timeline-item ${index === 0 ? 'timeline-item-latest' : ''}">
                            <div class="timeline-marker" style="background: ${config.color};">
                                <i class="fas fa-${config.icon}"></i>
                            </div>
                            <div class="timeline-card">
                                <div class="timeline-card-header">
                                    <div>
                                        <div class="timeline-action">
                                            <span class="action-badge" style="background: ${config.color};">${config.label}</span>
                                            ${log.Code ? `<span class="action-code">${log.Code}</span>` : ''}
                                        </div>
                                        <div class="timeline-user">
                                            <i class="fas fa-user"></i> ${log.UserName || 'Hệ thống'}
                                        </div>
                                    </div>
                                    <div class="timeline-date">
                                        <i class="fas fa-clock"></i>
                                        ${date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}
                                    </div>
                                </div>
                                ${description ? `
                                <div class="timeline-details">
                                    ${description}
                                </div>
                                ` : ''}
                                ${log.TransactionId ? `
                                <div class="timeline-meta">
                                    <i class="fas fa-fingerprint"></i>
                                    <span style="font-family: monospace; font-size: 11px; color: #9ca3af;">
                                        ${log.TransactionId.substring(0, 8)}...
                                    </span>
                                </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>

        <div class="audit-summary">
            <h4><i class="fas fa-chart-bar"></i> Thống kê</h4>
            <div class="audit-stats">
                <div class="audit-stat-item">
                    <div class="audit-stat-value">${auditLogs.length}</div>
                    <div class="audit-stat-label">Tổng thay đổi</div>
                </div>
                <div class="audit-stat-item">
                    <div class="audit-stat-value">${[...new Set(auditLogs.map(l => l.UserName))].length}</div>
                    <div class="audit-stat-label">Người chỉnh sửa</div>
                </div>
                <div class="audit-stat-item">
                    <div class="audit-stat-value">
                        ${auditLogs.length > 0 ? new Date(auditLogs[0].DateCreated).toLocaleDateString('vi-VN') : 'N/A'}
                    </div>
                    <div class="audit-stat-label">Cập nhật cuối</div>
                </div>
            </div>
        </div>
    `;
}

function formatAuditDescription(description) {
    if (!description) return '';

    if (window.DecodingUtility) {
        description = description.replace(/\b([A-Za-z0-9\-_=]{20,})\b/g, (match) => {
            const decoded = window.DecodingUtility.decodeProductLine(match);
            if (decoded) {
                return window.DecodingUtility.formatNoteWithDecodedData(match);
            }
            return match;
        });
    }

    let formatted = description
        .replace(/\r\n/g, '<br>')
        .replace(/\n/g, '<br>');

    formatted = formatted.replace(/(\d+(?:,\d+)*(?:\.\d+)?)\s*=>\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
        '<span class="change-from">$1</span> <i class="fas fa-arrow-right" style="color: #6b7280; font-size: 10px;"></i> <span class="change-to">$2</span>');

    formatted = formatted.replace(/(\d{4}\s+[A-Z0-9]+\s+[^:]+):/g,
        '<strong style="color: #3b82f6;">$1</strong>:');

    formatted = formatted.replace(/Thêm chi tiết/g,
        '<span style="color: #10b981; font-weight: 600;"><i class="fas fa-plus-circle"></i> Thêm chi tiết</span>');

    formatted = formatted.replace(/Xóa chi tiết/g,
        '<span style="color: #ef4444; font-weight: 600;"><i class="fas fa-minus-circle"></i> Xóa chi tiết</span>');

    return formatted;
}

// =====================================================
// PRODUCT EDITING
// =====================================================

function updateProductQuantity(index, change, value = null) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    const product = currentEditOrderData.Details[index];
    let newQty =
        value !== null ? parseInt(value, 10) : (product.Quantity || 0) + change;
    if (newQty < 1) newQty = 1;
    product.Quantity = newQty;

    const row = document.querySelector(
        `#productsTableBody tr[data-index='${index}']`,
    );
    if (row) {
        row.querySelector(".quantity-input").value = newQty;
        row.querySelector("td:nth-child(6)").textContent =
            (newQty * (product.Price || 0)).toLocaleString("vi-VN") + "đ";
    }
    recalculateTotals();
    window.showSaveIndicator("success", "Số lượng đã cập nhật");
    refreshInlineSearchUI();
}

function updateProductNote(index, note) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    currentEditOrderData.Details[index].Note = note;
    window.showSaveIndicator("success", "Ghi chú đã cập nhật");
}

async function removeProduct(index) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    const product = currentEditOrderData.Details[index];
    const confirmed = await window.notificationManager.confirm(
        `Xóa sản phẩm "${product.ProductNameGet || product.ProductName}"?`,
        "Xác nhận xóa"
    );
    if (!confirmed) return;

    currentEditOrderData.Details.splice(index, 1);
    recalculateTotals();
    switchEditTab("products");
    window.showSaveIndicator("success", "Đã xóa sản phẩm");
    refreshInlineSearchUI();
}

function editProductDetail(index) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    const row = document.querySelector(
        `#productsTableBody tr[data-index='${index}']`,
    );
    const product = currentEditOrderData.Details[index];
    const priceCell = row.querySelector("td:nth-child(5)");
    const actionCell = row.querySelector("td:nth-child(8) .action-buttons");
    priceCell.innerHTML = `<input type="number" class="edit-input" id="price-edit-${index}" value="${product.Price || 0}">`;
    actionCell.innerHTML = `
        <button onclick="saveProductDetail(${index})" class="btn-product-action btn-save-item" title="Lưu"><i class="fas fa-check"></i></button>
        <button onclick="cancelProductDetail(${index})" class="btn-product-action btn-cancel-item" title="Hủy"><i class="fas fa-times"></i></button>`;
    document.getElementById(`price-edit-${index}`).focus();
}

function saveProductDetail(index) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    const product = currentEditOrderData.Details[index];
    const newPrice = parseInt(document.getElementById(`price-edit-${index}`).value, 10) || 0;

    product.Price = newPrice;
    recalculateTotals();
    switchEditTab("products");
    window.showSaveIndicator("success", "Giá đã cập nhật");
    refreshInlineSearchUI();
}

function cancelProductDetail() {
    switchEditTab("products");
}

function recalculateTotals() {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    let totalQty = 0;
    let totalAmount = 0;
    currentEditOrderData.Details.forEach((p) => {
        totalQty += p.Quantity || 0;
        totalAmount += (p.Quantity || 0) * (p.Price || 0);
    });
    currentEditOrderData.TotalQuantity = totalQty;
    currentEditOrderData.TotalAmount = totalAmount;

    const totalQuantityEl = document.getElementById("totalQuantity");
    const totalAmountEl = document.getElementById("totalAmount");
    const productCountEl = document.getElementById("productCount");

    if (totalQuantityEl) {
        totalQuantityEl.textContent = totalQty;
    }
    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toLocaleString("vi-VN") + "đ";
    }
    if (productCountEl) {
        productCountEl.textContent = currentEditOrderData.Details.length;
    }
}

// =====================================================
// SAVE ORDER CHANGES
// =====================================================

async function saveAllOrderChanges() {
    console.log('[SAVE DEBUG] saveAllOrderChanges called at:', new Date().toISOString());

    const userConfirmed = await window.notificationManager.confirm(
        "Lưu tất cả thay đổi cho đơn hàng này?",
        "Xác nhận lưu"
    );
    console.log('[SAVE DEBUG] User confirmed:', userConfirmed);

    if (!userConfirmed) return;

    let notifId = null;
    const currentEditOrderData = window.tab1State.currentEditOrderData;

    try {
        if (window.notificationManager) {
            notifId = window.notificationManager.saving("Đang lưu đơn hàng...");
        }

        const payload = prepareOrderPayload(currentEditOrderData);

        const validation = validatePayloadBeforePUT(payload);
        if (!validation.valid) {
            throw new Error(
                `Payload validation failed: ${validation.errors.join(", ")}`,
            );
        }

        console.log("[SAVE] Payload to send:", payload);
        console.log(
            "[SAVE] Payload size:",
            JSON.stringify(payload).length,
            "bytes",
        );

        const headers = await window.tokenManager.getAuthHeader();

        const response = await API_CONFIG.smartFetch(
            `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentEditOrderId})`,
            {
                method: "PUT",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(payload),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[SAVE] Error response:", errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        if (window.notificationManager && notifId) {
            window.notificationManager.remove(notifId);
            window.notificationManager.success("Đã lưu thành công!", 2000);
        }

        hasUnsavedOrderChanges = false;

        window.cacheManager.clear("orders");

        // Preserve Tags
        const allData = window.tab1State.allData;
        const existingOrder = allData.find(order => order.Id === currentEditOrderId);
        const preservedTags = existingOrder ? existingOrder.Tags : null;

        await fetchOrderData(currentEditOrderId);

        const newEditOrderData = window.tab1State.currentEditOrderData;
        if (newEditOrderData && !newEditOrderData.Tags && preservedTags) {
            newEditOrderData.Tags = preservedTags;
            window.tab1State.currentEditOrderData = newEditOrderData;
        }

        // Update table if function exists
        if (typeof window.updateOrderInTable === 'function') {
            window.updateOrderInTable(currentEditOrderId, window.tab1State.currentEditOrderData);
        }

        refreshInlineSearchUI();

        console.log("[SAVE] Order saved successfully");
    } catch (error) {
        console.error("[SAVE] Error:", error);

        if (window.notificationManager) {
            if (notifId) {
                window.notificationManager.remove(notifId);
            }
            window.notificationManager.error(
                `Lỗi khi lưu: ${error.message}`,
                5000,
            );
        }
    }
}

function prepareOrderPayload(orderData) {
    console.log("[PAYLOAD] Preparing payload for PUT request...");

    const payload = JSON.parse(JSON.stringify(orderData));

    if (!payload["@odata.context"]) {
        payload["@odata.context"] =
            "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        console.log("[PAYLOAD] Added @odata.context");
    }

    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details = payload.Details.map((detail, index) => {
            const cleaned = { ...detail };

            if (
                !cleaned.Id ||
                cleaned.Id === null ||
                cleaned.Id === undefined
            ) {
                delete cleaned.Id;
                console.log(
                    `[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`,
                    cleaned.ProductId,
                );
            } else {
                console.log(
                    `[PAYLOAD] Detail[${index}]: Keeping existing Id:`,
                    cleaned.Id,
                );
            }

            cleaned.OrderId = payload.Id;

            return cleaned;
        });
    }

    const newDetailsCount = payload.Details?.filter((d) => !d.Id).length || 0;
    const existingDetailsCount =
        payload.Details?.filter((d) => d.Id).length || 0;

    const summary = {
        orderId: payload.Id,
        orderCode: payload.Code,
        topLevelFields: Object.keys(payload).length,
        detailsCount: payload.Details?.length || 0,
        newDetails: newDetailsCount,
        existingDetails: existingDetailsCount,
        hasContext: !!payload["@odata.context"],
        hasPartner: !!payload.Partner,
        hasUser: !!payload.User,
        hasCRMTeam: !!payload.CRMTeam,
        hasRowVersion: !!payload.RowVersion,
    };

    console.log("[PAYLOAD] Payload prepared successfully:", summary);

    if (!payload.RowVersion) {
        console.warn("[PAYLOAD] WARNING: Missing RowVersion!");
    }
    if (!payload["@odata.context"]) {
        console.error("[PAYLOAD] ERROR: Missing @odata.context!");
    }

    const detailsWithNullId =
        payload.Details?.filter(
            (d) =>
                d.hasOwnProperty("Id") && (d.Id === null || d.Id === undefined),
        ) || [];

    if (detailsWithNullId.length > 0) {
        console.error(
            "[PAYLOAD] ERROR: Found details with null Id:",
            detailsWithNullId,
        );
        throw new Error(
            "Payload contains details with null Id - this will cause API error",
        );
    }

    return payload;
}

function validatePayloadBeforePUT(payload) {
    const errors = [];

    if (!payload["@odata.context"]) {
        errors.push("Missing @odata.context");
    }

    if (!payload.Id) errors.push("Missing Id");
    if (!payload.Code) errors.push("Missing Code");
    if (!payload.RowVersion) errors.push("Missing RowVersion");

    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details.forEach((detail, index) => {
            if (!detail.ProductId) {
                errors.push(`Detail[${index}]: Missing ProductId`);
            }

            const requiredComputedFields = [
                "ProductName",
                "ProductCode",
                "UOMName",
            ];
            requiredComputedFields.forEach((field) => {
                if (!detail[field]) {
                    errors.push(
                        `Detail[${index}]: Missing computed field ${field}`,
                    );
                }
            });
        });
    }

    if (errors.length > 0) {
        console.error("[VALIDATE] Payload validation errors:", errors);
        return { valid: false, errors };
    }

    console.log("[VALIDATE] Payload is valid");
    return { valid: true, errors: [] };
}

// =====================================================
// INLINE PRODUCT SEARCH
// =====================================================

function initInlineSearchAfterRender() {
    setTimeout(() => {
        const searchInput = document.getElementById("inlineProductSearch");
        if (searchInput && typeof initInlineProductSearch === "function") {
            initInlineProductSearch();
        }
        refreshInlineSearchUI();
    }, 100);
}

function initInlineProductSearch() {
    const searchInput = document.getElementById("inlineProductSearch");
    if (!searchInput) return;
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        if (inlineSearchTimeout) clearTimeout(inlineSearchTimeout);
        if (query.length < 2) {
            hideInlineResults();
            return;
        }
        inlineSearchTimeout = setTimeout(() => performInlineSearch(query), 500);
    });
}

async function performInlineSearch(query) {
    const resultsDiv = document.getElementById("inlineSearchResults");
    const searchInput = document.getElementById("inlineProductSearch");
    searchInput.classList.add("searching");
    resultsDiv.className = "inline-search-results loading show";
    resultsDiv.innerHTML = `<div class="inline-search-loading"></div>`;
    try {
        if (!window.productSearchManager.isLoaded)
            await window.productSearchManager.fetchExcelProducts();
        const results = window.productSearchManager.search(query, 20);
        displayInlineResults(results);
    } catch (error) {
        resultsDiv.className = "inline-search-results empty show";
        resultsDiv.innerHTML = `<div style="color: #ef4444;">Lỗi: ${error.message}</div>`;
    } finally {
        searchInput.classList.remove("searching");
    }
}

function displayInlineResults(results) {
    const resultsDiv = document.getElementById("inlineSearchResults");
    const currentEditOrderData = window.tab1State.currentEditOrderData;

    if (!results || results.length === 0) {
        resultsDiv.className = "inline-search-results empty show";
        resultsDiv.innerHTML = `<div>Không tìm thấy sản phẩm</div>`;
        return;
    }
    resultsDiv.className = "inline-search-results show";

    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach(detail => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    resultsDiv.innerHTML = results
        .map((p) => {
            const isInOrder = productsInOrder.has(p.Id);
            const currentQty = productsInOrder.get(p.Id) || 0;
            const itemClass = isInOrder ? 'inline-result-item in-order' : 'inline-result-item';
            const buttonIcon = isInOrder ? 'fa-check' : 'fa-plus';
            const buttonText = isInOrder ? 'Thêm nữa' : 'Thêm';

            return `
        <div class="${itemClass}" onclick="addProductToOrderFromInline(${p.Id})" data-product-id="${p.Id}">
            ${isInOrder ? `<div class="inline-result-quantity-badge"><i class="fas fa-shopping-cart"></i> SL: ${currentQty}</div>` : ''}
            ${p.ImageUrl ? `<img src="${p.ImageUrl}" class="inline-result-image">` : `<div class="inline-result-image placeholder"><i class="fas fa-image"></i></div>`}
            <div class="inline-result-info">
                <div class="inline-result-name">${p.Name}</div>
                <div class="inline-result-code">Mã: ${p.Code}</div>
            </div>
            <div class="inline-result-price">${(p.Price || 0).toLocaleString("vi-VN")}đ</div>
            <button class="inline-result-add" onclick="event.stopPropagation(); addProductToOrderFromInline(${p.Id})">
                <i class="fas ${buttonIcon}"></i> ${buttonText}
            </button>
        </div>`;
        })
        .join("");
}

function hideInlineResults() {
    const resultsDiv = document.getElementById("inlineSearchResults");
    if (resultsDiv) resultsDiv.classList.remove("show");
}

async function addProductToOrderFromInline(productId) {
    let notificationId = null;
    const currentEditOrderData = window.tab1State.currentEditOrderData;

    try {
        if (window.notificationManager) {
            notificationId = window.notificationManager.show(
                "Đang tải thông tin sản phẩm...",
                "info",
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: "package",
                },
            );
        }

        console.log(
            "[INLINE ADD] Fetching full product details for ID:",
            productId,
        );
        const fullProduct =
            await window.productSearchManager.getFullProductDetails(productId);

        if (!fullProduct) {
            throw new Error("Không tìm thấy thông tin sản phẩm");
        }

        console.log("[INLINE ADD] Full product details:", fullProduct);

        if (window.notificationManager && notificationId) {
            window.notificationManager.remove(notificationId);
        }

        if (!currentEditOrderData.Details) {
            currentEditOrderData.Details = [];
        }

        const existingProductIndex = currentEditOrderData.Details.findIndex(
            (p) => p.ProductId == productId,
        );

        if (existingProductIndex > -1) {
            const existingProduct =
                currentEditOrderData.Details[existingProductIndex];
            const oldQty = existingProduct.Quantity || 0;
            const newQty = oldQty + 1;

            updateProductQuantity(existingProductIndex, 1);

            console.log(
                `[INLINE ADD] Product already exists, increased quantity: ${oldQty} -> ${newQty}`,
            );

            window.showSaveIndicator(
                "success",
                `${existingProduct.ProductNameGet || existingProduct.ProductName} (SL: ${oldQty} -> ${newQty})`,
            );

            highlightProductRow(existingProductIndex);
        } else {
            const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
            if (salePrice == null || salePrice < 0) {
                window.showSaveIndicator("error", `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
                throw new Error(`Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`);
            }

            const newProduct = {
                ProductId: fullProduct.Id,
                Quantity: 1,
                Price: salePrice,
                Note: null,
                UOMId: fullProduct.UOM?.Id || 1,
                Factor: 1,
                Priority: 0,
                OrderId: currentEditOrderData.Id,
                LiveCampaign_DetailId: null,
                ProductWeight: 0,
                ProductName: fullProduct.Name || fullProduct.NameTemplate,
                ProductNameGet:
                    fullProduct.NameGet ||
                    `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                UOMName: fullProduct.UOM?.Name || "Cái",
                ImageUrl: fullProduct.ImageUrl,
                IsOrderPriority: null,
                QuantityRegex: null,
                IsDisabledLiveCampaignDetail: false,
                CreatedById:
                    currentEditOrderData.UserId ||
                    currentEditOrderData.CreatedById,
            };

            currentEditOrderData.Details.push(newProduct);
            window.showSaveIndicator("success", "Đã thêm sản phẩm");
            console.log(
                "[INLINE ADD] Product added with computed fields:",
                newProduct,
            );
        }

        updateProductItemUI(productId);

        const searchInput = document.getElementById("inlineProductSearch");
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }

        recalculateTotals();
        switchEditTab("products");
    } catch (error) {
        console.error("[INLINE ADD] Error:", error);

        if (window.notificationManager) {
            if (notificationId) {
                window.notificationManager.remove(notificationId);
            }
            window.notificationManager.error(
                "Không thể tải thông tin sản phẩm: " + error.message,
                4000,
            );
        } else {
            alert("Lỗi: " + error.message);
        }
    }
}

function refreshInlineSearchUI() {
    const productItems = document.querySelectorAll('.inline-result-item');
    const currentEditOrderData = window.tab1State.currentEditOrderData;

    if (productItems.length === 0) {
        console.log('[REFRESH UI] No search results to refresh');
        return;
    }

    console.log(`[REFRESH UI] Refreshing ${productItems.length} items in search results`);

    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach(detail => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    productItems.forEach(item => {
        const productId = parseInt(item.getAttribute('data-product-id'));
        if (!productId) return;

        const isInOrder = productsInOrder.has(productId);
        const currentQty = productsInOrder.get(productId) || 0;

        if (isInOrder) {
            if (!item.classList.contains('in-order')) {
                item.classList.add('in-order');
            }
        } else {
            item.classList.remove('in-order');
        }

        let badge = item.querySelector('.inline-result-quantity-badge');

        if (isInOrder && currentQty > 0) {
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'inline-result-quantity-badge';
                item.insertBefore(badge, item.firstChild);
            }
            badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${currentQty}`;
        } else if (badge) {
            badge.remove();
        }

        const button = item.querySelector('.inline-result-add');
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isInOrder ? 'fas fa-check' : 'fas fa-plus';
            }

            const textNode = Array.from(button.childNodes).find(
                node => node.nodeType === Node.TEXT_NODE
            );
            if (textNode) {
                textNode.textContent = isInOrder ? ' Thêm nữa' : ' Thêm';
            }
        }
    });

    console.log('[REFRESH UI] UI refresh completed');
}

function highlightProductRow(index) {
    setTimeout(() => {
        const row = document.querySelector(
            `#productsTableBody tr[data-index="${index}"]`,
        );
        if (!row) return;

        row.classList.add("product-row-highlight");
        row.scrollIntoView({ behavior: "smooth", block: "center" });

        setTimeout(() => {
            row.classList.remove("product-row-highlight");
        }, 2000);
    }, 100);
}

function updateProductItemUI(productId) {
    const currentEditOrderData = window.tab1State.currentEditOrderData;
    const productItem = document.querySelector(
        `.inline-result-item[data-product-id="${productId}"]`
    );

    if (!productItem) return;

    productItem.classList.add("just-added");

    setTimeout(() => {
        productItem.classList.remove("just-added");
    }, 500);

    let updatedQty = 0;
    if (currentEditOrderData && currentEditOrderData.Details) {
        const product = currentEditOrderData.Details.find(
            p => p.ProductId == productId
        );
        updatedQty = product ? (product.Quantity || 0) : 0;
    }

    if (!productItem.classList.contains("in-order")) {
        productItem.classList.add("in-order");
    }

    let badge = productItem.querySelector(".inline-result-quantity-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.className = "inline-result-quantity-badge";
        productItem.insertBefore(badge, productItem.firstChild);
    }

    badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${updatedQty}`;

    const button = productItem.querySelector(".inline-result-add");
    if (button) {
        const icon = button.querySelector("i");
        if (icon) {
            icon.className = "fas fa-check";
        }
        const textNode = Array.from(button.childNodes).find(
            node => node.nodeType === Node.TEXT_NODE
        );
        if (textNode) {
            textNode.textContent = " Thêm nữa";
        }
    }

    console.log(`[UI UPDATE] Product ${productId} UI updated with quantity: ${updatedQty}`);
}

// =====================================================
// ADDRESS LOOKUP
// =====================================================

async function handleFullAddressLookup() {
    const input = document.getElementById('fullAddressLookupInput');
    const resultsContainer = document.getElementById('addressLookupResults');

    if (!input || !resultsContainer) return;

    const keyword = input.value.trim();
    if (!keyword) {
        alert('Vui lòng nhập địa chỉ đầy đủ');
        return;
    }

    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Đang phân tích địa chỉ...</div>';

    try {
        if (typeof window.searchFullAddress !== 'function') {
            throw new Error('Hàm tìm kiếm không khả dụng (api-handler.js chưa được tải)');
        }

        const response = await window.searchFullAddress(keyword);

        if (!response || !response.data || response.data.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444;">Không tìm thấy kết quả phù hợp</div>';
            return;
        }

        const items = response.data;
        resultsContainer.innerHTML = items.map(item => {
            const fullAddress = item.address;

            return `
            <div class="address-result-item"
                 onclick="selectAddress('${fullAddress.replace(/'/g, "\\'")}', 'full')"
                 style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 500; color: #374151;">${item.address}</div>
                    ${item.note ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${item.note}</div>` : ''}
                </div>
                <i class="fas fa-check" style="font-size: 12px; color: #059669;"></i>
            </div>
            `;
        }).join('');

        const resultItems = resultsContainer.querySelectorAll('.address-result-item');
        resultItems.forEach(item => {
            item.onmouseover = () => item.style.backgroundColor = '#f9fafb';
            item.onmouseout = () => item.style.backgroundColor = 'white';
        });

    } catch (error) {
        console.error('Full address lookup error:', error);
        resultsContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: #ef4444;">Lỗi: ${error.message}</div>`;
    }
}

async function selectAddress(fullAddress, type) {
    const addressTextarea = document.querySelector('textarea[onchange*="updateOrderInfo(\'Address\'"]');
    if (addressTextarea) {
        let newAddress = fullAddress;

        if (addressTextarea.value && addressTextarea.value.trim() !== '') {
            if (!addressTextarea.value.includes(fullAddress)) {
                const replaceAddress = await window.notificationManager.confirm(
                    'Bạn có muốn thay thế địa chỉ hiện tại không?\n\nĐồng ý: Thay thế\nHủy: Nối thêm vào sau',
                    'Chọn cách cập nhật địa chỉ'
                );
                if (replaceAddress) {
                    newAddress = fullAddress;
                } else {
                    newAddress = addressTextarea.value + ', ' + fullAddress;
                }
            }
        }

        addressTextarea.value = newAddress;
        updateOrderInfo('Address', newAddress);

        document.getElementById('addressLookupResults').style.display = 'none';
        const lookupInput = document.getElementById('fullAddressLookupInput');
        if (lookupInput) lookupInput.value = '';

        if (window.notificationManager) {
            window.notificationManager.show('Đã cập nhật địa chỉ', 'success');
        }
    }
}

// =====================================================
// EXPORTS
// =====================================================

// Export functions to window for global access
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.forceCloseEditModal = forceCloseEditModal;
window.switchEditTab = switchEditTab;
window.renderTabContent = renderTabContent;
window.renderInfoTab = renderInfoTab;
window.renderProductsTab = renderProductsTab;
window.renderDeliveryTab = renderDeliveryTab;
window.renderLiveTab = renderLiveTab;
window.renderInvoicesTab = renderInvoicesTab;
window.renderHistoryTab = renderHistoryTab;
window.renderInvoiceHistoryTab = renderInvoiceHistoryTab;
window.updateProductQuantity = updateProductQuantity;
window.updateProductNote = updateProductNote;
window.removeProduct = removeProduct;
window.editProductDetail = editProductDetail;
window.saveProductDetail = saveProductDetail;
window.cancelProductDetail = cancelProductDetail;
window.recalculateTotals = recalculateTotals;
window.saveAllOrderChanges = saveAllOrderChanges;
window.prepareOrderPayload = prepareOrderPayload;
window.validatePayloadBeforePUT = validatePayloadBeforePUT;
window.initInlineProductSearch = initInlineProductSearch;
window.performInlineSearch = performInlineSearch;
window.displayInlineResults = displayInlineResults;
window.hideInlineResults = hideInlineResults;
window.addProductToOrderFromInline = addProductToOrderFromInline;
window.refreshInlineSearchUI = refreshInlineSearchUI;
window.highlightProductRow = highlightProductRow;
window.handleFullAddressLookup = handleFullAddressLookup;
window.selectAddress = selectAddress;
window.updateOrderInfo = updateOrderInfo;
window.printOrder = printOrder;

console.log('[TAB1-EDIT-MODAL] Module loaded successfully');
