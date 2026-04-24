// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
let hasUnsavedOrderChanges = false;

// Toggle merged order edit dropdown
function toggleMergedEditDropdown(button, event) {
    event.stopPropagation();
    const dropdown = button.parentElement;
    const options = dropdown.querySelector('.merged-edit-options');

    // Close all other dropdowns first
    document.querySelectorAll('.merged-edit-options').forEach((opt) => {
        if (opt !== options) opt.style.display = 'none';
    });

    // Toggle this dropdown
    options.style.display = options.style.display === 'none' ? 'block' : 'none';
}

// Close all merged edit dropdowns
function closeMergedEditDropdown() {
    document.querySelectorAll('.merged-edit-options').forEach((opt) => {
        opt.style.display = 'none';
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
    if (!e.target.closest('.merged-edit-dropdown')) {
        closeMergedEditDropdown();
    }
});

async function openEditModal(orderId) {
    currentEditOrderId = orderId;
    hasUnsavedOrderChanges = false; // Reset dirty flag
    const modal = document.getElementById('editOrderModal');
    modal.classList.add('show');
    switchEditTab('info');
    document.getElementById('editModalBody').innerHTML =
        `<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Đang tải dữ liệu đơn hàng...</div></div>`;
    try {
        await fetchOrderData(orderId);
    } catch (error) {
        showErrorState(error.message);
    }
}

// Export to window for use in discount stats UI
window.openEditModal = openEditModal;

async function fetchOrderData(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    currentEditOrderData = await response.json();
    await updateModalWithData(currentEditOrderData);
}

async function updateModalWithData(data) {
    document.getElementById('modalOrderCode').textContent = data.Code || '';
    document.getElementById('lastUpdated').textContent = new Date(data.LastUpdated).toLocaleString(
        'vi-VN'
    );
    document.getElementById('editProductCount').textContent = data.Details?.length || 0;

    // Load KPI sale flags trước khi renderProductsTab() đọc cache đồng bộ.
    // Cần await để tránh race: user click tab "Sản phẩm" trước khi GET flags trả về
    // → checkbox render unchecked dù DB có flag TRUE.
    if (data.Code && window.KpiSaleFlagStore) {
        try {
            await window.KpiSaleFlagStore.load(data.Code);
        } catch (e) {
            console.warn('[EditModal] load KPI sale flags failed:', e?.message);
        }
    }

    switchEditTab('info');

    // 🔄 Refresh inline search UI after data is loaded
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        refreshInlineSearchUI();
    }, 100);
}

function switchEditTab(tabName) {
    document.querySelectorAll('.edit-tab-btn').forEach((btn) => btn.classList.remove('active'));
    const activeTab = document.querySelector(`.edit-tab-btn[onclick*="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
    renderTabContent(tabName);
    if (tabName === 'products') initInlineSearchAfterRender();
}

function renderTabContent(tabName) {
    const body = document.getElementById('editModalBody');
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

function renderInfoTab(data) {
    return `
        <div class="info-card">
            <h4><i class="fas fa-user"></i> Thông tin khách hàng</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Tên khách hàng</div>
                    <div class="info-value">
                        <input type="text" class="form-control" value="${(data.Name || '').replace(/"/g, '&quot;')}"
                            onchange="updateOrderInfo('Name', this.value)"
                            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; color: #3b82f6; font-weight: 600;">
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Điện thoại</div>
                    <div class="info-value">
                        <input type="text" class="form-control" value="${data.Telephone || ''}" 
                            onchange="updateOrderInfo('Telephone', this.value)" 
                            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Địa chỉ đầy đủ</div>
                    <div class="info-value">
                        <textarea class="form-control" 
                            onchange="updateOrderInfo('Address', this.value)" 
                            style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; min-height: 60px; resize: vertical;">${data.Address || ''}</textarea>
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
                            <!-- Results will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="info-card">
            <h4><i class="fas fa-shopping-cart"></i> Thông tin đơn hàng</h4>
            <div class="info-grid">
                <div class="info-field"><div class="info-label">Mã đơn</div><div class="info-value highlight">${data.Code || ''}</div></div>
                <div class="info-field"><div class="info-label">Trạng thái</div><div class="info-value"><span class="status-badge-large ${data.Status === 'Nháp' || data.Status === 'Draft' ? 'status-badge-draft' : data.Status === 'Hủy' || data.Status === 'Cancel' ? 'status-badge-cancel' : 'status-badge-order'}">${data.StatusText || data.Status || ''}</span></div></div>
                <div class="info-field"><div class="info-label">Tổng tiền</div><div class="info-value highlight">${(data.TotalAmount || 0).toLocaleString('vi-VN')}đ</div></div>
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú</div>
                    <div class="info-value">${window.DecodingUtility ? window.DecodingUtility.formatNoteWithDecodedData(data.Note || '') : data.Note || ''}</div>
                </div>
            </div>
        </div>`;
}

function updateOrderInfo(field, value) {
    if (!currentEditOrderData) return;

    // Detect phone number change and check wallet balance
    if (field === 'Telephone') {
        const oldPhone = currentEditOrderData.Telephone || '';
        const newPhone = value || '';
        if (oldPhone && newPhone && oldPhone !== newPhone) {
            checkWalletOnPhoneChange(currentEditOrderId, currentEditOrderData, oldPhone, newPhone);
        }
    }

    currentEditOrderData[field] = value;
    hasUnsavedOrderChanges = true; // Set dirty flag

    // Show quick feedback
    if (window.showSaveIndicator) {
        showSaveIndicator('success', 'Đã cập nhật thông tin (chưa lưu)');
    } else if (window.notificationManager) {
        window.notificationManager.show('Đã cập nhật thông tin (chưa lưu)', 'info');
    }
}

/**
 * Check wallet balance when phone number changes.
 * If old or new phone has wallet balance, create a pending adjustment record.
 */
async function checkWalletOnPhoneChange(orderId, orderData, oldPhone, newPhone) {
    if (!window.WalletAdjustmentStore) {
        console.warn('[WALLET-ADJ] WalletAdjustmentStore not loaded');
        return;
    }

    const normalizePhone = (phone) => {
        if (!phone) return '';
        let cleaned = String(phone).replace(/\D/g, '');
        if (cleaned.startsWith('84') && cleaned.length > 9) {
            cleaned = '0' + cleaned.substring(2);
        }
        return cleaned;
    };

    const normOld = normalizePhone(oldPhone);
    const normNew = normalizePhone(newPhone);

    if (!normOld || !normNew || normOld === normNew) return;

    try {
        const apiUrl =
            typeof QR_API_URL !== 'undefined'
                ? QR_API_URL
                : 'https://chatomni-proxy.nhijudyshop.workers.dev';

        // Fetch wallet for both phones in parallel
        const [oldRes, newRes] = await Promise.allSettled([
            fetch(`${apiUrl}/api/v2/wallets/${encodeURIComponent(normOld)}`).then((r) => r.json()),
            fetch(`${apiUrl}/api/v2/wallets/${encodeURIComponent(normNew)}`).then((r) => r.json()),
        ]);

        const oldBalance =
            oldRes.status === 'fulfilled' && oldRes.value?.data
                ? (parseFloat(oldRes.value.data.balance) || 0) +
                  (parseFloat(oldRes.value.data.virtual_balance) || 0)
                : 0;
        const newBalance =
            newRes.status === 'fulfilled' && newRes.value?.data
                ? (parseFloat(newRes.value.data.balance) || 0) +
                  (parseFloat(newRes.value.data.virtual_balance) || 0)
                : 0;

        if (oldBalance > 0 || newBalance > 0) {
            // Create pending adjustment record
            const userName = window.authManager?.currentUser?.displayName || '';
            await window.WalletAdjustmentStore.set(orderId, {
                orderCode: orderData.Code || '',
                oldPhone: normOld,
                newPhone: normNew,
                oldPhoneBalance: oldBalance,
                newPhoneBalance: newBalance,
                customerName: orderData.Name || '',
                status: 'pending',
                createdBy: userName,
            });

            // Show warning
            const balanceInfo = [];
            if (oldBalance > 0)
                balanceInfo.push(`SĐT cũ (${normOld}): ${oldBalance.toLocaleString('vi-VN')}đ`);
            if (newBalance > 0)
                balanceInfo.push(`SĐT mới (${normNew}): ${newBalance.toLocaleString('vi-VN')}đ`);

            const msg = `⚠️ Phát hiện công nợ khi đổi SĐT!\n${balanceInfo.join('\n')}\n\nĐơn sẽ bị đánh dấu chờ kế toán điều chỉnh công nợ trước khi ra đơn.`;

            if (window.notificationManager) {
                window.notificationManager.show(msg, 'warning', 8000);
            } else {
                alert(msg);
            }

            console.log(
                `[WALLET-ADJ] Created pending adjustment for order ${orderId}: old=${normOld}(${oldBalance}), new=${normNew}(${newBalance})`
            );
        }
    } catch (error) {
        console.error('[WALLET-ADJ] Error checking wallet on phone change:', error);
    }
}

function renderProductsTab(data) {
    const inlineSearchHTML = `
        <div class="product-search-inline">
            <div style="display: flex; gap: 8px; align-items: center;">
                <div class="search-input-wrapper" style="flex: 1;">
                    <i class="fas fa-search search-icon"></i>
                    <input type="text" id="inlineProductSearch" class="inline-search-input" placeholder="Tìm sản phẩm theo tên hoặc mã..." autocomplete="off">
                </div>
                <button onclick="reloadExcelProducts()" id="btnReloadExcel" class="btn-reload-excel" title="Tải lại kho sản phẩm từ TPOS">
                    <i class="fas fa-sync-alt"></i> Tải lại
                </button>
            </div>
            <div id="inlineSearchResults" class="inline-search-results"></div>
        </div>`;

    if (!data.Details || data.Details.length === 0) {
        return `<div class="info-card">${inlineSearchHTML}<div class="empty-state"><i class="fas fa-box-open"></i><p>Chưa có sản phẩm</p></div></div>`;
    }

    const orderCode = data.Code || '';
    const productsHTML = data.Details.map(
        (p, i) => {
            const isSale = !!(orderCode && p.ProductId && window.KpiSaleFlagStore
                ? window.KpiSaleFlagStore.get(orderCode, p.ProductId)
                : false);
            const disabled = !p.ProductId || !orderCode;
            return `
        <tr class="product-row" data-index="${i}">
            <td>${i + 1}</td>
            <td>${p.ImageUrl ? `<img src="${window.TPOSImageProxy ? window.TPOSImageProxy.proxyImageUrl(p.ImageUrl) : p.ImageUrl}" class="product-image" loading="lazy" onerror="this.style.display='none'">` : ''}</td>
            <td><div>${p.ProductNameGet || p.ProductName}</div><div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || 'N/A'}</div></td>
            <td style="text-align: center;"><div class="quantity-controls"><button onclick="updateProductQuantity(${i}, -1)" class="qty-btn"><i class="fas fa-minus"></i></button><input type="number" class="quantity-input" value="${p.Quantity || 1}" onchange="updateProductQuantity(${i}, 0, this.value)" min="1"><button onclick="updateProductQuantity(${i}, 1)" class="qty-btn"><i class="fas fa-plus"></i></button></div></td>
            <td style="text-align: right;">${(p.Price || 0).toLocaleString('vi-VN')}đ</td>
            <td style="text-align: right; font-weight: 600;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString('vi-VN')}đ</td>
            <td><input type="text" class="note-input" value="${p.Note || ''}" onchange="updateProductNote(${i}, this.value)"></td>
            <td style="text-align: center;"><input type="checkbox" class="kpi-sale-check" data-product-id="${p.ProductId || ''}" ${isSale ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="handleKpiSaleToggle('${orderCode.replace(/'/g, "\\'")}', ${p.ProductId || 'null'}, this.checked)" title="Tick = SP bán hàng, được tính KPI"></td>
            <td style="text-align: center;"><div class="action-buttons"><button onclick="editProductDetail(${i})" class="btn-product-action btn-edit-item" title="Sửa"><i class="fas fa-edit"></i></button><button onclick="removeProduct(${i})" class="btn-product-action btn-delete-item" title="Xóa"><i class="fas fa-trash"></i></button></div></td>
        </tr>`;
        }
    ).join('');

    return `
        <div class="info-card">
            ${inlineSearchHTML}
            <h4 style="margin-top: 24px;"><i class="fas fa-box"></i> Danh sách sản phẩm (${data.Details.length})</h4>
            <table class="products-table">
                <thead><tr><th>#</th><th>Ảnh</th><th>Sản phẩm</th><th style="text-align: center;">SL</th><th style="text-align: right;">Đơn giá</th><th style="text-align: right;">Thành tiền</th><th>Ghi chú</th><th style="text-align: center;" title="Tick để đánh dấu SP là bán hàng, tính KPI">KPI</th><th style="text-align: center;">Thao tác</th></tr></thead>
                <tbody id="productsTableBody">${productsHTML}</tbody>
                <tfoot style="background: #f9fafb; font-weight: 600;"><tr><td colspan="3" style="text-align: right;">Tổng cộng:</td><td style="text-align: center;" id="totalQuantity">${data.TotalQuantity || 0}</td><td></td><td style="text-align: right; color: #3b82f6;" id="totalAmount">${(data.TotalAmount || 0).toLocaleString('vi-VN')}đ</td><td colspan="3"></td></tr></tfoot>
            </table>
        </div>`;
}

/**
 * Handler cho checkbox "KPI" trên từng dòng SP trong modal Sửa đơn hàng.
 * Gọi bởi onchange trong renderProductsTab().
 * Upsert flag → store tự trigger recalc KPI.
 */
async function handleKpiSaleToggle(orderCode, productId, checked) {
    if (!orderCode || !productId) return;
    if (!window.KpiSaleFlagStore) {
        console.warn('[KPI Toggle] KpiSaleFlagStore chưa sẵn sàng');
        return;
    }
    try {
        await window.KpiSaleFlagStore.set(orderCode, productId, checked);
    } catch (e) {
        console.error('[KPI Toggle] set failed:', e?.message);
        if (window.notificationManager?.error) {
            window.notificationManager.error(`Không lưu được đánh dấu KPI: ${e?.message || e}`);
        }
        // Revert checkbox state về giá trị cũ
        const cb = document.querySelector(
            `.kpi-sale-check[data-product-id="${productId}"]`
        );
        if (cb) cb.checked = !checked;
    }
}
window.handleKpiSaleToggle = handleKpiSaleToggle;

function renderDeliveryTab(data) {
    return `<div class="empty-state"><p>Thông tin giao hàng</p></div>`;
}
function renderLiveTab(data) {
    // Display live stream information if available
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
                ${
                    liveInfo.Description
                        ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Mô tả</div>
                    <div class="info-value">${liveInfo.Description}</div>
                </div>
                `
                        : ''
                }
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
    // Display invoice/payment information
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
                    <div class="info-value" style="color: ${data.TotalAmount - (data.PaidAmount || 0) > 0 ? '#ef4444' : '#059669'};">
                        ${((data.TotalAmount || 0) - (data.PaidAmount || 0)).toLocaleString('vi-VN')}đ
                    </div>
                </div>
                <div class="info-field">
                    <div class="info-label">Trạng thái thanh toán</div>
                    <div class="info-value">
                        <span class="status-badge-large ${
                            data.PaidAmount >= data.TotalAmount
                                ? 'status-badge-paid'
                                : data.PaidAmount > 0
                                  ? 'status-badge-partial'
                                  : 'status-badge-unpaid'
                        }">
                            ${
                                data.PaidAmount >= data.TotalAmount
                                    ? 'Đã thanh toán'
                                    : data.PaidAmount > 0
                                      ? 'Thanh toán một phần'
                                      : 'Chưa thanh toán'
                            }
                        </span>
                    </div>
                </div>
            </div>
        </div>
        
        ${
            data.PaymentMethod
                ? `
        <div class="info-card">
            <h4><i class="fas fa-credit-card"></i> Phương thức thanh toán</h4>
            <div class="info-grid">
                <div class="info-field">
                    <div class="info-label">Phương thức</div>
                    <div class="info-value">${data.PaymentMethod}</div>
                </div>
                ${
                    data.PaymentNote
                        ? `
                <div class="info-field" style="grid-column: 1 / -1;">
                    <div class="info-label">Ghi chú thanh toán</div>
                    <div class="info-value">${data.PaymentNote}</div>
                </div>
                `
                        : ''
                }
            </div>
        </div>
        `
                : ''
        }
        
        ${
            !hasInvoice
                ? `
        <div class="empty-state">
            <i class="fas fa-file-invoice" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
            <p style="color: #9ca3af; font-size: 13px;">Đơn hàng chưa có hóa đơn chi tiết</p>
        </div>
        `
                : ''
        }
    `;
}
async function renderHistoryTab(data) {
    // Show loading state initially
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử chỉnh sửa...</div>
        </div>
    `;

    // Return loading first, then fetch data
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

async function renderInvoiceHistoryTab(data) {
    const loadingHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <div class="loading-text">Đang tải lịch sử hóa đơn...</div>
        </div>
    `;

    // Return loading first, then fetch data
    setTimeout(async () => {
        try {
            const partnerId = data.PartnerId || (data.Partner && data.Partner.Id);
            if (!partnerId) {
                throw new Error('Không tìm thấy thông tin khách hàng (PartnerId)');
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

async function fetchAndDisplayInvoiceHistory(partnerId) {
    // Calculate date range (last 30 days)
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
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[INVOICE HISTORY] Received data:', data);
    document.getElementById('editModalBody').innerHTML = renderInvoiceHistoryTable(
        data.value || []
    );
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

    const rows = invoices
        .map(
            (inv, index) => `
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
    `
        )
        .join('');

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

async function fetchAndDisplayAuditLog(orderId) {
    const headers = await window.tokenManager.getAuthHeader();
    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/AuditLog/ODataService.GetAuditLogEntity?entityName=SaleOnline_Order&entityId=${orderId}&skip=0&take=50`;

    console.log('[AUDIT LOG] Fetching audit log for order:', orderId);

    const response = await API_CONFIG.smartFetch(apiUrl, {
        headers: {
            ...headers,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const auditData = await response.json();
    console.log('[AUDIT LOG] Received audit log:', auditData);

    // Display the audit log
    document.getElementById('editModalBody').innerHTML = renderAuditLogTimeline(
        auditData.value || []
    );
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

    // Map action to icon and color
    const actionConfig = {
        CREATE: { icon: 'plus-circle', color: '#3b82f6', label: 'Tạo mới' },
        UPDATE: { icon: 'edit', color: '#8b5cf6', label: 'Cập nhật' },
        DELETE: { icon: 'trash', color: '#ef4444', label: 'Xóa' },
        APPROVE: { icon: 'check-circle', color: '#10b981', label: 'Phê duyệt' },
        REJECT: { icon: 'x-circle', color: '#ef4444', label: 'Từ chối' },
    };

    return `
        <div class="history-timeline">
            <div class="timeline-header">
                <h4><i class="fas fa-history"></i> Lịch sử thay đổi</h4>
                <span class="timeline-count">${auditLogs.length} thay đổi</span>
            </div>
            <div class="timeline-content">
                ${auditLogs
                    .map((log, index) => {
                        const config = actionConfig[log.Action] || {
                            icon: 'circle',
                            color: '#6b7280',
                            label: log.Action,
                        };
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
                                            minute: '2-digit',
                                        })}
                                    </div>
                                </div>
                                ${
                                    description
                                        ? `
                                <div class="timeline-details">
                                    ${description}
                                </div>
                                `
                                        : ''
                                }
                                ${
                                    log.TransactionId
                                        ? `
                                <div class="timeline-meta">
                                    <i class="fas fa-fingerprint"></i>
                                    <span style="font-family: monospace; font-size: 11px; color: #9ca3af;">
                                        ${log.TransactionId.substring(0, 8)}...
                                    </span>
                                </div>
                                `
                                        : ''
                                }
                            </div>
                        </div>
                    `;
                    })
                    .join('')}
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
                    <div class="audit-stat-value">${[...new Set(auditLogs.map((l) => l.UserName))].length}</div>
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

    // Try to decode encoded strings first
    if (window.DecodingUtility) {
        // Find potential encoded strings (long, no spaces, Base64URL chars)
        description = description.replace(/\b([A-Za-z0-9\-_=]{20,})\b/g, (match) => {
            // Check if it can be decoded
            const decoded = window.DecodingUtility.decodeProductLine(match);
            if (decoded) {
                // Use the utility to format it
                return window.DecodingUtility.formatNoteWithDecodedData(match);
            }
            return match;
        });
    }

    // Replace \r\n with <br> and format the text
    let formatted = description.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>');

    // Highlight changes with arrows (=>)
    formatted = formatted.replace(
        /(\d+(?:,\d+)*(?:\.\d+)?)\s*=>\s*(\d+(?:,\d+)*(?:\.\d+)?)/g,
        '<span class="change-from">$1</span> <i class="fas fa-arrow-right" style="color: #6b7280; font-size: 10px;"></i> <span class="change-to">$2</span>'
    );

    // Highlight product codes and names (e.g., "0610 A3 ÁO TN HT")
    formatted = formatted.replace(
        /(\d{4}\s+[A-Z0-9]+\s+[^:]+):/g,
        '<strong style="color: #3b82f6;">$1</strong>:'
    );

    // Highlight "Thêm chi tiết"
    formatted = formatted.replace(
        /Thêm chi tiết/g,
        '<span style="color: #10b981; font-weight: 600;"><i class="fas fa-plus-circle"></i> Thêm chi tiết</span>'
    );

    // Highlight "Xóa chi tiết"
    formatted = formatted.replace(
        /Xóa chi tiết/g,
        '<span style="color: #ef4444; font-weight: 600;"><i class="fas fa-minus-circle"></i> Xóa chi tiết</span>'
    );

    return formatted;
}

function showErrorState(message) {
    document.getElementById('editModalBody').innerHTML =
        `<div class="empty-state" style="color: #ef4444;"><i class="fas fa-exclamation-triangle"></i><p>Lỗi: ${message}</p><button class="btn-primary" onclick="fetchOrderData('${currentEditOrderId}')">Thử lại</button></div>`;
}

function closeEditModal() {
    if (hasUnsavedOrderChanges) {
        // Use custom confirm popup since native confirm may be blocked
        window.notificationManager
            .confirm('Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng không?', 'Cảnh báo')
            .then((result) => {
                if (result) {
                    forceCloseEditModal();
                }
            });
        return;
    }
    forceCloseEditModal();
}

function forceCloseEditModal() {
    document.getElementById('editOrderModal').classList.remove('show');
    currentEditOrderData = null;
    currentEditOrderId = null;
    hasUnsavedOrderChanges = false;
}

function printOrder() {
    window.print();
}

// =====================================================
// IN-MODAL PRODUCT EDITING (NEW FUNCTIONS)
// =====================================================
function updateProductQuantity(index, change, value = null) {
    const product = currentEditOrderData.Details[index];
    const oldQty = product.Quantity || 0;
    let newQty = value !== null ? parseInt(value, 10) : oldQty + change;
    if (newQty < 1) newQty = 1;
    product.Quantity = newQty;

    // KPI Audit Log - ghi nhận thay đổi số lượng (Render PostgreSQL)
    // Tính delta thực tế (hỗ trợ cả +/- buttons lẫn direct input)
    const actualDelta = newQty - oldQty;
    if (window.kpiAuditLogger && actualDelta !== 0) {
        const orderId = currentEditOrderData.Id;
        const orderCode = currentEditOrderData.Code || window.OrderStore?.get(orderId)?.Code || '';
        const action = actualDelta > 0 ? 'add' : 'remove';
        const qty = Math.abs(actualDelta);
        window.kpiAuditLogger
            .logProductAction({
                orderCode: orderCode,
                orderId: String(orderId),
                action: action,
                productId: parseInt(product.ProductId),
                productCode: product.ProductCode || '',
                productName: product.ProductName || product.ProductNameGet || '',
                quantity: qty,
                source: 'edit_modal_quantity',
            })
            .then(() => {
                if (window.kpiManager && window.kpiManager.recalculateAndSaveKPI && orderCode) {
                    window.kpiManager.recalculateAndSaveKPI(orderCode);
                }
            })
            .catch((err) => {
                console.warn('[EDIT-MODAL] KPI audit log failed (non-blocking):', err);
            });
    }

    const row = document.querySelector(`#productsTableBody tr[data-index='${index}']`);
    if (row) {
        row.querySelector('.quantity-input').value = newQty;
        row.querySelector('td:nth-child(6)').textContent =
            (newQty * (product.Price || 0)).toLocaleString('vi-VN') + 'đ';
    }
    recalculateTotals();
    showSaveIndicator('success', 'Số lượng đã cập nhật');

    // 🔄 Refresh inline search UI to reflect quantity change
    refreshInlineSearchUI();
}

function updateProductNote(index, note) {
    currentEditOrderData.Details[index].Note = note;
    showSaveIndicator('success', 'Ghi chú đã cập nhật');
}

async function removeProduct(index) {
    const product = currentEditOrderData.Details[index];
    const confirmed = await window.notificationManager.confirm(
        `Xóa sản phẩm "${product.ProductNameGet || product.ProductName}"?`,
        'Xác nhận xóa'
    );
    if (!confirmed) return;

    // Remove product from array
    currentEditOrderData.Details.splice(index, 1);

    // KPI Audit Log - ghi nhận xóa sản phẩm (Render PostgreSQL)
    if (window.kpiAuditLogger) {
        try {
            const orderId = currentEditOrderData.Id;
            const orderCode =
                currentEditOrderData.Code || window.OrderStore?.get(orderId)?.Code || '';
            await window.kpiAuditLogger.logProductAction({
                orderCode: orderCode,
                orderId: String(orderId),
                action: 'remove',
                productId: parseInt(product.ProductId),
                productCode: product.ProductCode || '',
                productName: product.ProductName || product.ProductNameGet || '',
                quantity: product.Quantity || 1,
                source: 'edit_modal_remove',
            });
            if (window.kpiManager && window.kpiManager.recalculateAndSaveKPI && orderCode) {
                await window.kpiManager.recalculateAndSaveKPI(orderCode);
            }
        } catch (kpiError) {
            console.warn('[EDIT-MODAL] KPI audit log failed (non-blocking):', kpiError);
        }
    }

    // Surgical table update (preserves search input/results)
    refreshProductsTableOnly();

    showSaveIndicator('success', 'Đã xóa sản phẩm');

    // Refresh inline search UI to remove green highlight and badge
    refreshInlineSearchUI();
}

function editProductDetail(index) {
    const row = document.querySelector(`#productsTableBody tr[data-index='${index}']`);
    const product = currentEditOrderData.Details[index];
    const priceCell = row.querySelector('td:nth-child(5)');
    const actionCell = row.querySelector('td:nth-child(8) .action-buttons');
    priceCell.innerHTML = `<input type="number" class="edit-input" id="price-edit-${index}" value="${product.Price || 0}">`;
    actionCell.innerHTML = `
        <button onclick="saveProductDetail(${index})" class="btn-product-action btn-save-item" title="Lưu"><i class="fas fa-check"></i></button>
        <button onclick="cancelProductDetail(${index})" class="btn-product-action btn-cancel-item" title="Hủy"><i class="fas fa-times"></i></button>`;
    document.getElementById(`price-edit-${index}`).focus();
}

function saveProductDetail(index) {
    const product = currentEditOrderData.Details[index];
    const newPrice = parseInt(document.getElementById(`price-edit-${index}`).value, 10) || 0;

    // Update price
    product.Price = newPrice;

    // Recalculate totals BEFORE re-rendering
    // Surgical table update (preserves search input/results)
    refreshProductsTableOnly();

    showSaveIndicator('success', 'Giá đã cập nhật');

    refreshInlineSearchUI();
}

function cancelProductDetail() {
    refreshProductsTableOnly();
}

/**
 * Refresh only the products table tbody + totals.
 * Does NOT destroy the search input/results area or re-init event listeners.
 * Use this instead of switchEditTab("products") for in-tab data changes.
 */
function refreshProductsTableOnly() {
    if (!currentEditOrderData) return;
    const data = currentEditOrderData;

    // Giỏ rỗng → full re-render để show empty state
    if (!data.Details || data.Details.length === 0) {
        switchEditTab('products');
        return;
    }

    // Empty → non-empty transition: tbody chưa tồn tại (đang ở empty state)
    // → full re-render để dựng table + tbody lần đầu
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) {
        switchEditTab('products');
        return;
    }

    const orderCode = data.Code || '';
    tbody.innerHTML = data.Details.map(
        (p, i) => {
            const isSale = !!(orderCode && p.ProductId && window.KpiSaleFlagStore
                ? window.KpiSaleFlagStore.get(orderCode, p.ProductId)
                : false);
            const disabled = !p.ProductId || !orderCode;
            return `
        <tr class="product-row" data-index="${i}">
            <td>${i + 1}</td>
            <td>${p.ImageUrl ? `<img src="${window.TPOSImageProxy ? window.TPOSImageProxy.proxyImageUrl(p.ImageUrl) : p.ImageUrl}" class="product-image" loading="lazy" onerror="this.style.display='none'">` : ''}</td>
            <td><div>${p.ProductNameGet || p.ProductName}</div><div style="font-size: 11px; color: #6b7280;">Mã: ${p.ProductCode || 'N/A'}</div></td>
            <td style="text-align: center;"><div class="quantity-controls"><button onclick="updateProductQuantity(${i}, -1)" class="qty-btn"><i class="fas fa-minus"></i></button><input type="number" class="quantity-input" value="${p.Quantity || 1}" onchange="updateProductQuantity(${i}, 0, this.value)" min="1"><button onclick="updateProductQuantity(${i}, 1)" class="qty-btn"><i class="fas fa-plus"></i></button></div></td>
            <td style="text-align: right;">${(p.Price || 0).toLocaleString('vi-VN')}đ</td>
            <td style="text-align: right; font-weight: 600;">${((p.Quantity || 0) * (p.Price || 0)).toLocaleString('vi-VN')}đ</td>
            <td><input type="text" class="note-input" value="${p.Note || ''}" onchange="updateProductNote(${i}, this.value)"></td>
            <td style="text-align: center;"><input type="checkbox" class="kpi-sale-check" data-product-id="${p.ProductId || ''}" ${isSale ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="handleKpiSaleToggle('${orderCode.replace(/'/g, "\\'")}', ${p.ProductId || 'null'}, this.checked)" title="Tick = SP bán hàng, được tính KPI"></td>
            <td style="text-align: center;"><div class="action-buttons"><button onclick="editProductDetail(${i})" class="btn-product-action btn-edit-item" title="Sửa"><i class="fas fa-edit"></i></button><button onclick="removeProduct(${i})" class="btn-product-action btn-delete-item" title="Xóa"><i class="fas fa-trash"></i></button></div></td>
        </tr>`;
        }
    ).join('');

    // Update product count header
    const h4 = tbody.closest('.info-card')?.querySelector('h4');
    if (h4) h4.innerHTML = `<i class="fas fa-box"></i> Danh sách sản phẩm (${data.Details.length})`;

    recalculateTotals();
}

function recalculateTotals() {
    let totalQty = 0;
    let totalAmount = 0;
    currentEditOrderData.Details.forEach((p) => {
        totalQty += p.Quantity || 0;
        totalAmount += (p.Quantity || 0) * (p.Price || 0);
    });
    currentEditOrderData.TotalQuantity = totalQty;
    currentEditOrderData.TotalAmount = totalAmount;

    // Update DOM elements if they exist (may not exist if tab is not rendered yet)
    const totalQuantityEl = document.getElementById('totalQuantity');
    const totalAmountEl = document.getElementById('totalAmount');
    const productCountEl = document.getElementById('editProductCount');

    if (totalQuantityEl) {
        totalQuantityEl.textContent = totalQty;
    }
    if (totalAmountEl) {
        totalAmountEl.textContent = totalAmount.toLocaleString('vi-VN') + 'đ';
    }
    if (productCountEl) {
        productCountEl.textContent = currentEditOrderData.Details.length;
    }
}

async function saveAllOrderChanges() {
    // NOTE: Không ghi KPI audit log ở đây - audit log đã được ghi tại từng thao tác riêng lẻ
    // (addProductToOrderFromInline, removeProduct, updateProductQuantity)
    console.log('[SAVE DEBUG] saveAllOrderChanges called at:', new Date().toISOString());

    // Use custom confirm popup since native confirm may be blocked
    const userConfirmed = await window.notificationManager.confirm(
        'Lưu tất cả thay đổi cho đơn hàng này?',
        'Xác nhận lưu'
    );
    console.log('[SAVE DEBUG] User confirmed:', userConfirmed);

    if (!userConfirmed) return;

    let notifId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notifId = window.notificationManager.saving('Đang lưu đơn hàng...');
        }

        // Prepare payload
        const payload = prepareOrderPayload(currentEditOrderData);

        // Validate payload (optional but recommended)
        const validation = validatePayloadBeforePUT(payload);
        if (!validation.valid) {
            throw new Error(`Payload validation failed: ${validation.errors.join(', ')}`);
        }

        console.log('[SAVE] Payload to send:', payload);
        console.log('[SAVE] Payload size:', JSON.stringify(payload).length, 'bytes');

        // Get auth headers
        const headers = await window.tokenManager.getAuthHeader();

        // PUT request
        const response = await API_CONFIG.smartFetch(
            `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentEditOrderId})`,
            {
                method: 'PUT',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[SAVE] Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Success
        if (window.notificationManager && notifId) {
            window.notificationManager.remove(notifId);
            window.notificationManager.success('Đã lưu thành công!', 2000);
        }

        hasUnsavedOrderChanges = false; // Reset dirty flag after save

        // Clear cache và reload data từ API
        window.cacheManager.clear('orders');

        // 🔒 Preserve Tags từ dữ liệu cũ trước khi fetch - O(1) via OrderStore
        const existingOrder =
            window.OrderStore?.get(currentEditOrderId) ||
            allData.find((order) => order.Id === currentEditOrderId);
        const preservedTags = existingOrder ? existingOrder.Tags : null;

        await fetchOrderData(currentEditOrderId);

        // 🔄 Restore Tags nếu API không trả về
        if (currentEditOrderData && !currentEditOrderData.Tags && preservedTags) {
            currentEditOrderData.Tags = preservedTags;
        }

        // Invalidate order details cache so chat modal loads fresh data
        if (typeof window.invalidateOrderDetailsCache === 'function') {
            window.invalidateOrderDetailsCache(currentEditOrderId);
        }

        // 🔄 CẬP NHẬT BẢNG CHÍNH VỚI DỮ LIỆU MỚI
        updateOrderInTable(currentEditOrderId, currentEditOrderData);

        // 🔄 Refresh inline search UI after save and reload
        refreshInlineSearchUI();

        console.log('[SAVE] Order saved successfully ✓');
    } catch (error) {
        console.error('[SAVE] Error:', error);

        if (window.notificationManager) {
            if (notifId) {
                window.notificationManager.remove(notifId);
            }
            window.notificationManager.error(`Lỗi khi lưu: ${error.message}`, 5000);
        }
    }
}

// =====================================================
// PREPARE PAYLOAD FOR PUT REQUEST
// =====================================================
function prepareOrderPayload(orderData) {
    console.log('[PAYLOAD] Preparing payload for PUT request...');

    // Clone dữ liệu để không ảnh hưởng original
    const payload = JSON.parse(JSON.stringify(orderData));

    // THÊM @odata.context
    if (!payload['@odata.context']) {
        payload['@odata.context'] =
            'http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity';
        console.log('[PAYLOAD] ✓ Added @odata.context');
    }

    // ✅ CRITICAL FIX: XỬ LÝ DETAILS ARRAY
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details = payload.Details.map((detail, index) => {
            const cleaned = { ...detail };

            // ✅ XÓA Id nếu null/undefined
            if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                delete cleaned.Id;
                console.log(
                    `[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`,
                    cleaned.ProductId
                );
            } else {
                console.log(`[PAYLOAD] Detail[${index}]: Keeping existing Id:`, cleaned.Id);
            }

            // Đảm bảo OrderId match
            cleaned.OrderId = payload.Id;

            return cleaned;
        });
    }

    // Statistics
    const newDetailsCount = payload.Details?.filter((d) => !d.Id).length || 0;
    const existingDetailsCount = payload.Details?.filter((d) => d.Id).length || 0;

    const summary = {
        orderId: payload.Id,
        orderCode: payload.Code,
        topLevelFields: Object.keys(payload).length,
        detailsCount: payload.Details?.length || 0,
        newDetails: newDetailsCount,
        existingDetails: existingDetailsCount,
        hasContext: !!payload['@odata.context'],
        hasPartner: !!payload.Partner,
        hasUser: !!payload.User,
        hasCRMTeam: !!payload.CRMTeam,
        hasRowVersion: !!payload.RowVersion,
    };

    console.log('[PAYLOAD] ✓ Payload prepared successfully:', summary);

    // Validate critical fields
    if (!payload.RowVersion) {
        console.warn('[PAYLOAD] ⚠️ WARNING: Missing RowVersion!');
    }
    if (!payload['@odata.context']) {
        console.error('[PAYLOAD] ❌ ERROR: Missing @odata.context!');
    }

    // ✅ VALIDATION: Check for Id: null
    const detailsWithNullId =
        payload.Details?.filter(
            (d) => d.hasOwnProperty('Id') && (d.Id === null || d.Id === undefined)
        ) || [];

    if (detailsWithNullId.length > 0) {
        console.error('[PAYLOAD] ❌ ERROR: Found details with null Id:', detailsWithNullId);
        throw new Error('Payload contains details with null Id - this will cause API error');
    }

    return payload;
}

// #region ═══════════════════════════════════════════════════════════════════════
// ║                    SECTION 11: INLINE PRODUCT SEARCH                        ║
// ║                            search: #PRODUCT                                 ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// INLINE PRODUCT SEARCH #PRODUCT
// =====================================================
let inlineSearchTimeout = null;

function initInlineSearchAfterRender() {
    setTimeout(() => {
        const searchInput = document.getElementById('inlineProductSearch');
        if (searchInput && typeof initInlineProductSearch === 'function') {
            initInlineProductSearch();
        }

        // 🔄 Refresh inline search UI when switching to products tab
        refreshInlineSearchUI();
    }, 100);
}

async function reloadExcelProducts() {
    const btn = document.getElementById('btnReloadExcel');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.querySelector('i').className = 'fas fa-sync-alt fa-spin';
    try {
        await window.productSearchManager.fetchExcelProducts(true);
        // Re-run current search if there's a query
        const searchInput = document.getElementById('inlineProductSearch');
        if (searchInput && searchInput.value.trim().length >= 2) {
            await performInlineSearch(searchInput.value.trim());
        }
    } catch (error) {
        console.error('Reload Excel failed:', error);
    } finally {
        btn.disabled = false;
        btn.querySelector('i').className = 'fas fa-sync-alt';
    }
}

function initInlineProductSearch() {
    const searchInput = document.getElementById('inlineProductSearch');
    if (!searchInput || searchInput.dataset.searchInit) return;
    searchInput.dataset.searchInit = '1';
    searchInput.addEventListener('input', () => {
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
    const resultsDiv = document.getElementById('inlineSearchResults');
    const searchInput = document.getElementById('inlineProductSearch');
    searchInput.classList.add('searching');
    resultsDiv.className = 'inline-search-results loading show';
    resultsDiv.innerHTML = `<div class="inline-search-loading"></div>`;
    try {
        if (!window.productSearchManager.isLoaded)
            await window.productSearchManager.fetchExcelProducts();
        const results = window.productSearchManager.search(query, 20);
        displayInlineResults(results);
    } catch (error) {
        resultsDiv.className = 'inline-search-results empty show';
        resultsDiv.innerHTML = `<div style="color: #ef4444;">Lỗi: ${error.message}</div>`;
    } finally {
        searchInput.classList.remove('searching');
    }
}

function displayInlineResults(results) {
    const resultsDiv = document.getElementById('inlineSearchResults');
    if (!results || results.length === 0) {
        resultsDiv.className = 'inline-search-results empty show';
        resultsDiv.innerHTML = `<div>Không tìm thấy sản phẩm</div>`;
        return;
    }
    resultsDiv.className = 'inline-search-results show';

    // Check which products are already in the order
    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach((detail) => {
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
            ${p.ImageUrl ? `<img src="${window.TPOSImageProxy ? window.TPOSImageProxy.proxyImageUrl(p.ImageUrl) : p.ImageUrl}" class="inline-result-image" onerror="this.style.display='none'">` : `<div class="inline-result-image placeholder"><i class="fas fa-image"></i></div>`}
            <div class="inline-result-info">
                <div class="inline-result-name">${p.Name}</div>
                <div class="inline-result-code">Mã: ${p.Code}</div>
            </div>
            <div class="inline-result-price">${(p.Price || 0).toLocaleString('vi-VN')}đ</div>
            <button class="inline-result-add" onclick="event.stopPropagation(); addProductToOrderFromInline(${p.Id})">
                <i class="fas ${buttonIcon}"></i> ${buttonText}
            </button>
        </div>`;
        })
        .join('');
}

function hideInlineResults() {
    const resultsDiv = document.getElementById('inlineSearchResults');
    if (resultsDiv) resultsDiv.classList.remove('show');
}

// =====================================================
// HIGHLIGHT PRODUCT ROW AFTER UPDATE
// =====================================================
function highlightProductRow(index) {
    // Wait for DOM to update
    setTimeout(() => {
        const row = document.querySelector(`#productsTableBody tr[data-index="${index}"]`);
        if (!row) return;

        // Add highlight class
        row.classList.add('product-row-highlight');

        // Scroll to the row
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove highlight after animation
        setTimeout(() => {
            row.classList.remove('product-row-highlight');
        }, 2000);
    }, 100);
}

// =====================================================
// UPDATE PRODUCT ITEM UI AFTER ADDING TO ORDER
// =====================================================
function updateProductItemUI(productId) {
    // Find the product item in search results
    const productItem = document.querySelector(
        `.inline-result-item[data-product-id="${productId}"]`
    );

    if (!productItem) return;

    // Add animation
    productItem.classList.add('just-added');

    // Remove animation class after it completes
    setTimeout(() => {
        productItem.classList.remove('just-added');
    }, 500);

    // Get updated quantity from order
    let updatedQty = 0;
    if (currentEditOrderData && currentEditOrderData.Details) {
        const product = currentEditOrderData.Details.find((p) => p.ProductId == productId);
        updatedQty = product ? product.Quantity || 0 : 0;
    }

    // Update the item to show it's in order
    if (!productItem.classList.contains('in-order')) {
        productItem.classList.add('in-order');
    }

    // Update or add quantity badge
    let badge = productItem.querySelector('.inline-result-quantity-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'inline-result-quantity-badge';
        productItem.insertBefore(badge, productItem.firstChild);
    }

    badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${updatedQty}`;

    // Update button
    const button = productItem.querySelector('.inline-result-add');
    if (button) {
        const icon = button.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-check';
        }
        // Update button text
        const textNode = Array.from(button.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE
        );
        if (textNode) {
            textNode.textContent = ' Thêm nữa';
        }
    }

    console.log(`[UI UPDATE] Product ${productId} UI updated with quantity: ${updatedQty}`);
}

// =====================================================
// REFRESH INLINE SEARCH UI AFTER ANY DATA CHANGE
// =====================================================
function refreshInlineSearchUI() {
    const productItems = document.querySelectorAll('.inline-result-item');
    if (productItems.length === 0) return;

    const productsInOrder = new Map();
    if (currentEditOrderData && currentEditOrderData.Details) {
        currentEditOrderData.Details.forEach((detail) => {
            productsInOrder.set(detail.ProductId, detail.Quantity || 0);
        });
    }

    productItems.forEach((item) => {
        const productId = parseInt(item.getAttribute('data-product-id'));
        if (!productId) return;

        const isInOrder = productsInOrder.has(productId);
        const currentQty = productsInOrder.get(productId) || 0;

        // Update classes
        if (isInOrder) {
            if (!item.classList.contains('in-order')) {
                item.classList.add('in-order');
            }
        } else {
            item.classList.remove('in-order');
        }

        // Update or remove badge
        let badge = item.querySelector('.inline-result-quantity-badge');

        if (isInOrder && currentQty > 0) {
            // Product is in order - show/update badge
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'inline-result-quantity-badge';
                item.insertBefore(badge, item.firstChild);
            }
            badge.innerHTML = `<i class="fas fa-shopping-cart"></i> SL: ${currentQty}`;
        } else if (badge) {
            // Product removed from order - remove badge
            badge.remove();
        }

        // Update button
        const button = item.querySelector('.inline-result-add');
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = isInOrder ? 'fas fa-check' : 'fas fa-plus';
            }

            // Update button text
            const textNode = Array.from(button.childNodes).find(
                (node) => node.nodeType === Node.TEXT_NODE
            );
            if (textNode) {
                textNode.textContent = isInOrder ? ' Thêm nữa' : ' Thêm';
            }
        }
    });
}

async function addProductToOrderFromInline(productId) {
    let notificationId = null;

    try {
        // Show loading notification
        if (window.notificationManager) {
            notificationId = window.notificationManager.show(
                'Đang tải thông tin sản phẩm...',
                'info',
                0,
                {
                    showOverlay: true,
                    persistent: true,
                    icon: 'package',
                }
            );
        }

        // Get full product details from API
        console.log('[INLINE ADD] Fetching full product details for ID:', productId);
        const fullProduct = await window.productSearchManager.getFullProductDetails(productId);

        if (!fullProduct) {
            throw new Error('Không tìm thấy thông tin sản phẩm');
        }

        console.log('[INLINE ADD] Full product details:', fullProduct);

        // Close loading notification
        if (window.notificationManager && notificationId) {
            window.notificationManager.remove(notificationId);
        }

        // Ensure Details is an array
        if (!currentEditOrderData.Details) {
            currentEditOrderData.Details = [];
        }

        // Check if product already exists in order
        const existingProductIndex = currentEditOrderData.Details.findIndex(
            (p) => p.ProductId == productId
        );

        if (existingProductIndex > -1) {
            // Product exists - increase quantity
            const existingProduct = currentEditOrderData.Details[existingProductIndex];
            const oldQty = existingProduct.Quantity || 0;
            const newQty = oldQty + 1;

            updateProductQuantity(existingProductIndex, 1);

            console.log(
                `[INLINE ADD] Product already exists, increased quantity: ${oldQty} → ${newQty}`
            );

            showSaveIndicator(
                'success',
                `${existingProduct.ProductNameGet || existingProduct.ProductName} (SL: ${oldQty} → ${newQty})`
            );

            highlightProductRow(existingProductIndex);
        } else {
            // ============================================
            // QUAN TRỌNG: Product mới - THÊM ĐẦY ĐỦ COMPUTED FIELDS
            // ============================================
            // Validate sale price (only use PriceVariant or ListPrice, never StandardPrice)
            const salePrice = fullProduct.PriceVariant || fullProduct.ListPrice;
            if (salePrice == null || salePrice < 0) {
                showSaveIndicator(
                    'error',
                    `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`
                );
                throw new Error(
                    `Sản phẩm "${fullProduct.Name || fullProduct.DefaultCode}" (ID: ${fullProduct.Id}) không có giá bán.`
                );
            }

            const newProduct = {
                // ============================================
                // REQUIRED FIELDS
                // ============================================
                // ✅ KHÔNG có Id: null cho sản phẩm mới
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

                // ============================================
                // COMPUTED FIELDS - PHẢI CÓ!
                // ============================================
                ProductName: fullProduct.Name || fullProduct.NameTemplate,
                ProductNameGet:
                    fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                UOMName: fullProduct.UOM?.Name || 'Cái',
                ImageUrl: fullProduct.ImageUrl,
                IsOrderPriority: null,
                QuantityRegex: null,
                IsDisabledLiveCampaignDetail: false,

                // Creator ID
                CreatedById: currentEditOrderData.UserId || currentEditOrderData.CreatedById,
            };

            currentEditOrderData.Details.push(newProduct);
            showSaveIndicator('success', 'Đã thêm sản phẩm');
            console.log('[INLINE ADD] Product added with computed fields:', newProduct);
        }

        // ⚠️ QUAN TRỌNG: KHÔNG xóa input và KHÔNG ẩn results
        // Điều này cho phép user tiếp tục thêm sản phẩm khác từ cùng danh sách gợi ý
        // document.getElementById("inlineProductSearch").value = "";
        // hideInlineResults();

        // Update UI to show product was added
        updateProductItemUI(productId);

        // Chỉ focus lại vào input để tiện thao tác
        const searchInput = document.getElementById('inlineProductSearch');
        if (searchInput) {
            searchInput.focus();
            // Select text để user có thể tiếp tục search hoặc giữ nguyên
            searchInput.select();
        }

        // Surgical table update (preserves search input/results + event listeners)
        refreshProductsTableOnly();

        // KPI Audit Log - thêm SP từ edit modal (Render PostgreSQL)
        // Log cả khi SP mới (existingProductIndex === -1) lẫn khi tăng qty SP đã có
        if (window.kpiAuditLogger) {
            try {
                const orderId = currentEditOrderData.Id;
                const orderCode =
                    currentEditOrderData.Code || window.OrderStore?.get(orderId)?.Code || '';
                const addedProduct = currentEditOrderData.Details.find(
                    (p) => p.ProductId == productId
                );
                await window.kpiAuditLogger.logProductAction({
                    orderCode: orderCode,
                    orderId: String(orderId),
                    action: 'add',
                    productId: parseInt(productId),
                    productCode: addedProduct?.ProductCode || fullProduct?.DefaultCode || '',
                    productName: addedProduct?.ProductName || fullProduct?.Name || '',
                    quantity: 1,
                    source: 'edit_modal_inline',
                });
                if (window.kpiManager && window.kpiManager.recalculateAndSaveKPI && orderCode) {
                    await window.kpiManager.recalculateAndSaveKPI(orderCode);
                }
            } catch (kpiError) {
                console.warn('[INLINE ADD] KPI audit log failed (non-blocking):', kpiError);
            }
        }
    } catch (error) {
        console.error('[INLINE ADD] Error:', error);

        // Close loading and show error
        if (window.notificationManager) {
            if (notificationId) {
                window.notificationManager.remove(notificationId);
            }
            window.notificationManager.error(
                'Không thể tải thông tin sản phẩm: ' + error.message,
                4000
            );
        } else {
            alert('Lỗi: ' + error.message);
        }
    }
}

// ============================================
// 3. VALIDATION HELPER (Optional)
// ============================================
function validatePayloadBeforePUT(payload) {
    const errors = [];

    // Check @odata.context
    if (!payload['@odata.context']) {
        errors.push('Missing @odata.context');
    }

    // Check required fields
    if (!payload.Id) errors.push('Missing Id');
    if (!payload.Code) errors.push('Missing Code');
    if (!payload.RowVersion) errors.push('Missing RowVersion');

    // Check Details
    if (payload.Details && Array.isArray(payload.Details)) {
        payload.Details.forEach((detail, index) => {
            if (!detail.ProductId) {
                errors.push(`Detail[${index}]: Missing ProductId`);
            }

            // Check computed fields (should exist for all products)
            const requiredComputedFields = ['ProductName', 'ProductCode', 'UOMName'];
            requiredComputedFields.forEach((field) => {
                if (!detail[field]) {
                    errors.push(`Detail[${index}]: Missing computed field ${field}`);
                }
            });
        });
    }

    if (errors.length > 0) {
        console.error('[VALIDATE] Payload validation errors:', errors);
        return { valid: false, errors };
    }

    console.log('[VALIDATE] Payload is valid ✓');
    return { valid: true, errors: [] };
}

// Debug payload trước khi gửi API
function debugPayloadBeforeSend(payload) {
    console.group('🔍 PAYLOAD DEBUG');

    console.log('Order Info:', {
        id: payload.Id,
        code: payload.Code,
        detailsCount: payload.Details?.length || 0,
    });

    if (payload.Details) {
        console.log('\n📦 Details Analysis:');

        const detailsWithId = payload.Details.filter((d) => d.Id);
        const detailsWithoutId = payload.Details.filter((d) => !d.Id);
        const detailsWithNullId = payload.Details.filter(
            (d) => d.hasOwnProperty('Id') && (d.Id === null || d.Id === undefined)
        );

        console.log(`  ✅ Details with valid Id: ${detailsWithId.length}`);
        console.log(`  ✅ Details without Id (new): ${detailsWithoutId.length}`);
        console.log(
            `  ${detailsWithNullId.length > 0 ? '❌' : '✅'} Details with null Id: ${detailsWithNullId.length}`
        );

        if (detailsWithNullId.length > 0) {
            console.error('\n❌ FOUND DETAILS WITH NULL ID:');
            detailsWithNullId.forEach((d, i) => {
                console.error(`  Detail[${i}]: ProductId=${d.ProductId}, Id=${d.Id}`);
            });
        }

        console.log('\n📋 Details List:');
        payload.Details.forEach((d, i) => {
            console.log(
                `  [${i}] ${d.Id ? '✅' : '🆕'} ProductId=${d.ProductId}, Id=${d.Id || 'N/A'}`
            );
        });
    }

    console.groupEnd();

    // Return validation result
    const hasNullIds =
        payload.Details?.some(
            (d) => d.hasOwnProperty('Id') && (d.Id === null || d.Id === undefined)
        ) || false;

    return {
        valid: !hasNullIds,
        message: hasNullIds ? 'Payload has details with null Id' : 'Payload is valid',
    };
}

// =====================================================
// MESSAGE HANDLER FOR CROSS-TAB COMMUNICATION
// =====================================================
window.addEventListener('message', function (event) {
    // Handle request to fetch conversations for orders loaded from Firebase
    if (event.data.type === 'FETCH_CONVERSATIONS_FOR_ORDERS') {
        handleFetchConversationsRequest(event.data.orders || []);
    }

    // Handle request for employee ranges from overview tab
    if (event.data.type === 'REQUEST_EMPLOYEE_RANGES') {
        console.log('📨 [EMPLOYEE] Nhận request employee ranges từ tab Báo Cáo Tổng Hợp');
        console.log('📊 [EMPLOYEE] employeeRanges length:', employeeRanges.length);

        // Send employee ranges back to overview
        window.parent.postMessage(
            {
                type: 'EMPLOYEE_RANGES_RESPONSE',
                ranges: employeeRanges || [],
            },
            '*'
        );
    }

    // Handle request for campaign info from overview tab
    if (event.data.type === 'REQUEST_CAMPAIGN_INFO') {
        console.log('📨 [CAMPAIGN] Nhận request campaign info từ tab Báo Cáo Tổng Hợp');

        // Send campaign info back to overview
        window.parent.postMessage(
            {
                type: 'CAMPAIGN_INFO_RESPONSE',
                campaignInfo: {
                    allCampaigns: window.campaignManager?.allCampaigns || {},
                    activeCampaign: window.campaignManager?.activeCampaign || null,
                    activeCampaignId: window.campaignManager?.activeCampaignId || null,
                },
            },
            '*'
        );

        console.log('✅ [CAMPAIGN] Sent campaign info:', {
            campaignCount: Object.keys(window.campaignManager?.allCampaigns || {}).length,
            activeCampaign: window.campaignManager?.activeCampaign?.name,
        });
    }
});
