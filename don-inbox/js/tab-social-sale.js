// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// ============================================================================
// TAB SOCIAL - SALE MODAL ADAPTER
// Provides global variables and social-tab-specific functions.
// All shared sale modal logic is in: js/utils/sale-modal-common.js
// Core creation logic is in: js/tab1/tab1-sale.js
// ============================================================================

// =====================================================
// GLOBAL VARIABLES (required by sale-modal-common.js and tab1-sale.js)
// =====================================================
let currentSaleOrderData = null;
let currentSalePartnerData = null;
let currentSaleLastDeposit = null;
let currentSaleAvailableDeposits = []; // [{ amount, date }] all deposits contributing to wallet balance
let currentSaleVirtualCredits = []; // [{ remaining_amount, source_type, source_id, ticket_note }] active virtual credits

// QR/wallet API URL (required by sale-modal-common.js)
const QR_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// =====================================================
// PHONE NORMALIZATION (required by sale-modal-common.js)
// =====================================================
function normalizePhoneForQR(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('84') && cleaned.length > 9) {
        cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
}

// =====================================================
// DEBT CACHE STUBS (social tab doesn't have debt column)
// =====================================================
function getDebtCache() {
    try {
        const cache = localStorage.getItem('social_debt_cache');
        return cache ? JSON.parse(cache) : {};
    } catch (e) {
        return {};
    }
}

function saveDebtCache(cache) {
    try {
        localStorage.setItem('social_debt_cache', JSON.stringify(cache));
    } catch (e) {}
}

function saveDebtToCache(phone, totalDebt) {
    const cache = getDebtCache();
    cache[phone] = { totalDebt, timestamp: Date.now() };
    saveDebtCache(cache);
}

function updateDebtCellsInTable(phone, debt) {
    // No-op: social tab doesn't have debt column in table
}

// =====================================================
// CONFIRM DEBT UPDATE (copied from tab1-qr-debt.js)
// =====================================================
async function confirmDebtUpdate() {
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmBtn = document.getElementById('confirmDebtBtn');

    if (!prepaidAmountField || !currentSaleOrderData) {
        if (window.notificationManager) {
            window.notificationManager.error('Không có dữ liệu để cập nhật');
        }
        return;
    }

    const phone = currentSaleOrderData.Telephone || currentSaleOrderData.PartnerPhone;
    if (!phone) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy số điện thoại khách hàng');
        }
        return;
    }

    const newDebt = parseFloat(prepaidAmountField.value) || 0;

    // Show loading state
    const originalText = confirmBtn?.textContent;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '...';
    }

    try {
        console.log('[DEBT-UPDATE] Updating debt for phone:', phone, 'to:', newDebt);

        const response = await fetch(`${QR_API_URL}/api/sepay/update-debt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone: phone,
                new_debt: newDebt,
                reason: 'Admin manual adjustment from Sale Modal (Social)',
            }),
        });

        const result = await response.json();

        if (result.success) {
            console.log('[DEBT-UPDATE] Success:', result);
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Đã cập nhật Công nợ: ${newDebt.toLocaleString('vi-VN')}đ`
                );
            }
            prepaidAmountField.style.background = '#d1fae5';
            setTimeout(() => {
                prepaidAmountField.style.background = '#ffffff';
            }, 2000);

            const normalizedPhone = normalizePhoneForQR(phone);
            if (normalizedPhone) {
                const cache = getDebtCache();
                delete cache[normalizedPhone];
                saveDebtCache(cache);

                updateDebtCellsInTable(normalizedPhone, newDebt);

                const oldDebtField = document.getElementById('saleOldDebt');
                if (oldDebtField) {
                    oldDebtField.textContent =
                        newDebt > 0 ? `${newDebt.toLocaleString('vi-VN')} đ` : '0';
                }
            }
        } else {
            throw new Error(result.error || 'Failed to update debt');
        }
    } catch (error) {
        console.error('[DEBT-UPDATE] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi cập nhật Công nợ: ' + error.message);
        }
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText || 'Xác nhận';
        }
    }
}

// =====================================================
// SALE MODAL TAB SWITCHING
// =====================================================
function switchSaleTab(tabName) {
    document.querySelectorAll('.sale-tab').forEach((tab) => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });
    document.querySelectorAll('.sale-tab-content').forEach((content) => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeContent = document.getElementById(
        `saleTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`
    );
    if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
    }
}

// =====================================================
// CLOSE SALE BUTTON MODAL (social-specific)
// =====================================================
function closeSaleButtonModal(clearSelection = false) {
    const modal = document.getElementById('saleButtonModal');
    if (modal) modal.style.display = 'none';
    currentSaleOrderData = null;
    currentSalePartnerData = null;
    currentSaleLastDeposit = null;
    // Social order status update is handled by tab-social-invoice.js override
}

function updateSocialOrderAfterSale(socialOrderId) {
    if (!socialOrderId) return;
    // Delegate to social invoice adapter if available (handles status + InvoiceStatusStore check)
    if (typeof window.updateSocialOrderAfterBillCreation === 'function') {
        window.updateSocialOrderAfterBillCreation(socialOrderId);
        return;
    }
    // Fallback: update status directly
    const order = SocialOrderState?.orders?.find((o) => o.id === socialOrderId);
    if (order) {
        order.status = 'order';
        if (typeof saveSocialOrdersToStorage === 'function') {
            saveSocialOrdersToStorage();
        }
        if (typeof updateSocialOrder === 'function') {
            updateSocialOrder(socialOrderId, { status: 'order' });
        }
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        } else if (typeof renderTable === 'function') {
            renderTable();
        }
    }
}

// =====================================================
// INBOX-ONLY OVERRIDE: updateSaleOrderWithAPI cho social order
// Shared tab1-sale.js mặc định PUT TPOS SaleOnline_Order. Social order sống trên Render
// (id SO-xxx không tồn tại trên TPOS → 404). Override updateSaleOrderWithAPI:
// nếu currentSaleOrderData._isSocialOrder thì sync về Render + SocialOrderState;
// ngược lại gọi nguyên bản → tab1 behavior không đổi.
//
// Dùng bare-name reassignment (giống overrideConfirmAndPrintSale) — pattern này đã chạy
// OK trong codebase. window.*= có thể không intercept bare-name call trong một số browser.
// Chỉ gọi ở don-inbox/index.html, không gọi ở orders-report/tab1-orders.html → tab1 giữ nguyên.
// =====================================================
function installInboxSaleApiOverride() {
    if (window._inboxSaleApiOverrideInstalled) return;
    if (typeof updateSaleOrderWithAPI !== 'function') {
        console.warn('[SOCIAL-SALE] updateSaleOrderWithAPI chưa load, skip install');
        return;
    }
    window._originalUpdateSaleOrderWithAPI = updateSaleOrderWithAPI;
    updateSaleOrderWithAPI = async function inboxRoutedUpdateSaleOrderWithAPI() {
        if (!currentSaleOrderData || !currentSaleOrderData._isSocialOrder) {
            return window._originalUpdateSaleOrderWithAPI.apply(this, arguments);
        }
        return _syncInboxOrderLinesToRender(currentSaleOrderData);
    };
    window._inboxSaleApiOverrideInstalled = true;
    console.log('[SOCIAL-SALE] Installed updateSaleOrderWithAPI override for inbox orders');
}

async function _syncInboxOrderLinesToRender(saleData) {
    const socialId = window._lastSocialSaleOrderId || saleData.Id;
    if (!socialId) {
        console.error('[SOCIAL-SALE] Missing social order id, skip Render sync');
        return null;
    }
    if (typeof window.updateSocialOrder !== 'function') {
        console.warn(
            '[SOCIAL-SALE] updateSocialOrder unavailable — products will persist on submit only'
        );
        return null;
    }

    const sourceOrder = window.SocialOrderState?.orders?.find((o) => o.id === socialId);
    const prevByTposId = new Map(
        (sourceOrder?.products || []).map((p) => [String(p.tposProductId || ''), p])
    );

    // Convert tab1 orderLines shape → inbox products shape (khớp _collectSocialProducts
    // tại tab-social-modal.js:240, dùng cùng format với "Tạo đơn mới" / "Chỉnh sửa đơn").
    const products = (saleData.orderLines || []).map((line) => {
        const tposId = line.ProductId || line.Product?.Id || 0;
        const prev = prevByTposId.get(String(tposId)) || {};
        const quantity = parseInt(line.ProductUOMQty ?? line.Quantity ?? 1) || 1;
        const sellingPrice = parseFloat(line.PriceUnit ?? line.Price ?? 0) || 0;
        const mapped = {
            id: prev.id,
            productName: line.Product?.Name || line.ProductName || prev.productName || '',
            variant: line.Note || prev.variant || '',
            productCode: line.Product?.DefaultCode || line.ProductCode || prev.productCode || '',
            quantity,
            purchasePrice: prev.purchasePrice || 0,
            sellingPrice,
            productImages: prev.productImages || [],
            priceImages: prev.priceImages || [],
            selectedAttributeValueIds: prev.selectedAttributeValueIds || [],
        };
        if (tposId) mapped.tposProductId = tposId;
        if (prev.tposProductTmplId) mapped.tposProductTmplId = prev.tposProductTmplId;
        return mapped;
    });

    const totalQuantity = products.reduce((s, p) => s + (p.quantity || 0), 0);
    const totalAmount = products.reduce(
        (s, p) => s + (Number(p.sellingPrice) || 0) * (p.quantity || 0),
        0
    );

    if (sourceOrder) {
        sourceOrder.products = products;
        sourceOrder.totalQuantity = totalQuantity;
        sourceOrder.totalAmount = totalAmount;
        sourceOrder.updatedAt = Date.now();
        if (typeof window.saveSocialOrdersToStorage === 'function') {
            window.saveSocialOrdersToStorage();
        }
    }

    console.log('[SOCIAL-SALE] Syncing inbox order products → Render', {
        socialId,
        count: products.length,
    });
    return window.updateSocialOrder(socialId, { products, totalQuantity, totalAmount });
}

// =====================================================
// OPEN SALE MODAL FROM SOCIAL ORDER (main entry point)
// =====================================================
async function openSaleModalInSocialTab(orderId) {
    console.log('[SOCIAL-SALE] Opening sale modal for order:', orderId);

    const order = SocialOrderState?.orders?.find((o) => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    window._lastSocialSaleOrderId = orderId;

    // Map social order data to Tab1-compatible format
    const mappedOrder = {
        Id: order.id,
        PartnerId: order.tposPartnerId || 0,
        PartnerName: order.customerName || '',
        Name: order.customerName || '',
        Telephone: order.phone || '',
        PartnerPhone: order.phone || '',
        PartnerAddress: order.address || '',
        Address: order.address || '',
        TotalAmount: order.totalAmount || 0,
        Comment: order.note || '',
        Details: (order.products || [])
            .filter((p) => {
                const name = (p.productName || p.name || '').trim();
                const code = (p.productCode || '').trim();
                const variant = (p.variant || '').trim();
                const price =
                    parseFloat(String(p.sellingPrice || p.price || 0).replace(/[,.]/g, '')) || 0;
                const purchase = parseFloat(String(p.purchasePrice || 0).replace(/[,.]/g, '')) || 0;
                return name || code || variant || price > 0 || purchase > 0;
            })
            .map((p) => ({
                ProductId: p.tposProductId || 0,
                ProductCode: p.productCode || '',
                ProductNameGet: p.productName || p.name || '',
                ProductName: p.productName || p.name || '',
                Quantity: p.quantity || 1,
                PriceUnit: p.sellingPrice || p.price || 0,
                Price: p.sellingPrice || p.price || 0,
                Note: p.variant || '',
            })),
        Tags: order.tags ? JSON.stringify(order.tags) : '[]',
        _isSocialOrder: true,
    };

    // Enrich từng product với full TPOS data (UOM, NameGet, ImageUrl) trước khi mở sale modal.
    // Pattern khớp với addProductToSaleFromSearch (tab1-sale.js:265-339) — flow F2 search đã verified hoạt động.
    // Nếu fetch fail → product có thể bị broken trên TPOS (UOM null, variant orphaned, etc.) → invoice POST sẽ NRE.
    // Track broken products để show modal block + ngăn user submit (tránh confusing TPOS NRE error).
    mappedOrder.orderLines = [];
    const brokenProducts = []; // { tposId, code, name, error }
    for (const p of order.products || []) {
        const name = (p.productName || p.name || '').trim();
        const code = (p.productCode || '').trim();
        const variant = (p.variant || '').trim();
        const price = parseFloat(String(p.sellingPrice || p.price || 0).replace(/[,.]/g, '')) || 0;
        const purchase = parseFloat(String(p.purchasePrice || 0).replace(/[,.]/g, '')) || 0;
        if (!(name || code || variant || price > 0 || purchase > 0)) continue;

        const tposId = parseInt(p.tposProductId) || 0;
        const buildMinimalLine = (idForLine, priceForLine, broken = false) => ({
            ProductId: idForLine,
            Product: null,
            ProductUOMId: 1,
            ProductUOM: { Id: 1, Name: 'Cái', Factor: 1, FactorInv: 1 },
            ProductUOMQty: p.quantity || 1,
            Quantity: p.quantity || 1,
            PriceUnit: priceForLine,
            Price: priceForLine,
            ProductName: name,
            ProductNameGet: code ? `[${code}] ${name}` : name,
            ProductUOMName: 'Cái',
            Note: variant || null,
            SaleOnlineDetailId: null,
            Discount: 0,
            Weight: 0,
            _brokenOnTPOS: broken,
        });

        if (!tposId) {
            // Không có TPOS Id → buildSaleOrderModelForInsertList validate sẽ chặn ở line 791-802. Allow.
            mappedOrder.orderLines.push(buildMinimalLine(tposId, price, false));
            continue;
        }

        if (!window.productSearchManager?.getFullProductDetails) {
            mappedOrder.orderLines.push(buildMinimalLine(tposId, price, false));
            continue;
        }

        try {
            const fullProduct = await window.productSearchManager.getFullProductDetails(tposId);
            const salePrice = price || fullProduct.PriceVariant || fullProduct.ListPrice || 0;
            mappedOrder.orderLines.push({
                ProductId: fullProduct.Id,
                Product: {
                    Id: fullProduct.Id,
                    Name: fullProduct.Name,
                    DefaultCode: fullProduct.DefaultCode,
                    NameGet:
                        fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                    ImageUrl: fullProduct.ImageUrl,
                },
                ProductUOMId: fullProduct.UOM?.Id || 1,
                ProductUOM: {
                    Id: fullProduct.UOM?.Id || 1,
                    Name: fullProduct.UOM?.Name || 'Cái',
                },
                ProductUOMQty: p.quantity || 1,
                Quantity: p.quantity || 1,
                PriceUnit: salePrice,
                Price: salePrice,
                ProductName: fullProduct.Name,
                ProductNameGet:
                    fullProduct.NameGet || `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                ProductUOMName: fullProduct.UOM?.Name || 'Cái',
                Note: variant || null,
                SaleOnlineDetailId: null,
                Discount: 0,
                Weight: fullProduct.Weight || 0,
            });
        } catch (err) {
            // 500/404 từ TPOS = product/variant bị orphan/broken trên TPOS server-side.
            // Invoice POST với product này CHẮC CHẮN sẽ NRE — block trước khi user mất công nhập form.
            console.warn(
                '[SOCIAL-SALE] Product broken on TPOS, will block submit:',
                tposId,
                code,
                err.message
            );
            brokenProducts.push({ tposId, code, name, error: err.message });
            mappedOrder.orderLines.push(buildMinimalLine(tposId, price, true));
        }
    }

    if (brokenProducts.length > 0) {
        const list = brokenProducts.map((b) => `• [${b.code || b.tposId}] ${b.name}`).join('\n');
        const msg =
            `Sản phẩm sau bị lỗi trên TPOS (HTTP 500), không thể tạo phiếu:\n\n${list}\n\n` +
            `Cách xử lý:\n` +
            `1. Kiểm tra & sửa SP trên TPOS (UOM bị null hoặc variant đã xoá)\n` +
            `2. Hoặc xoá SP khỏi đơn rồi thêm SP khác qua "Tìm kiếm [F2]"`;
        if (window.notificationManager) {
            window.notificationManager.error(msg, 0, { persistent: true, title: 'SP lỗi TPOS' });
        }
        // Đánh dấu để socialConfirmAndPrintSale chặn submit
        mappedOrder._brokenProducts = brokenProducts;
    }

    currentSaleOrderData = mappedOrder;
    currentSalePartnerData = null;

    // Lookup TPOS partner by phone so InsertListOrderModel doesn't fail with "Partner is null."
    // tab1 flow populates currentSalePartnerData when user picks a partner; social flow has no picker.
    try {
        const phone = (order.phone || '').trim();
        if (phone && typeof window.fetchTPOSCustomer === 'function') {
            const result = await window.fetchTPOSCustomer(phone);
            if (result && result.success && result.count > 0) {
                const c = result.customers[0];
                // Match working tab1 payload exactly — minimal Partner shape, no City/District/Ward,
                // no nested ExtraAddress. Spreading full TPOS Partner caused TPOS to NRE on null
                // top-level City/District/Ward dereferences.
                currentSalePartnerData = {
                    Id: c.id,
                    Name: c.name || order.customerName || '',
                    DisplayName: c.name || order.customerName || '',
                    Street: c.address || order.address || '',
                    Phone: phone,
                    StatusText: c.statusText || null,
                    Customer: true,
                    Type: 'contact',
                    CompanyType: 'person',
                };
                mappedOrder.PartnerId = c.id;
                console.log('[SOCIAL-SALE] TPOS partner found:', c.id, c.name);
            } else {
                console.warn('[SOCIAL-SALE] No TPOS partner for phone:', phone);
                if (typeof showNotification === 'function') {
                    showNotification(
                        'Không tìm thấy KH trên TPOS — vui lòng tạo KH trước khi xác nhận',
                        'warning'
                    );
                }
            }
        } else if (!phone) {
            if (typeof showNotification === 'function') {
                showNotification('Đơn không có SĐT — không thể tra TPOS partner', 'warning');
            }
        }
    } catch (e) {
        console.error('[SOCIAL-SALE] TPOS partner lookup error:', e);
    }

    // Reset form fields
    const discountEl = document.getElementById('saleDiscount');
    if (discountEl) discountEl.value = 0;
    const receiverNoteEl = document.getElementById('saleReceiverNote');
    if (receiverNoteEl) receiverNoteEl.value = '';
    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl) {
        prepaidEl.value = 0;
        prepaidEl.dataset.originalBalance = '';
        prepaidEl.style.border = '';
    }
    const prepaidDateEl = document.getElementById('salePrepaidDate');
    if (prepaidDateEl) prepaidDateEl.value = '';
    const prepaidWarning = document.getElementById('prepaidExcessWarning');
    if (prepaidWarning) prepaidWarning.style.display = 'none';

    // Show modal
    const modal = document.getElementById('saleButtonModal');
    modal.style.display = 'flex';

    // Reset confirm button
    const confirmBtn = document.querySelector('.sale-btn-teal');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Xác nhận và in (F9)';
    }

    // Restore bill type preference
    const savedBillType = localStorage.getItem('saleBillTypePreference') || 'web';
    const billTypeWeb = document.getElementById('saleBillTypeWeb');
    const billTypeTpos = document.getElementById('saleBillTypeTpos');
    if (billTypeWeb && billTypeTpos) {
        billTypeWeb.checked = savedBillType === 'web';
        billTypeTpos.checked = savedBillType === 'tpos';
    }

    // Admin check for Công nợ field
    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    const confirmDebtBtn = document.getElementById('confirmDebtBtn');
    let isAdmin = window.authManager?.isAdminTemplate?.() || false;

    if (prepaidAmountField) {
        if (isAdmin) {
            prepaidAmountField.disabled = false;
            prepaidAmountField.style.background = '#ffffff';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'inline-flex';
        } else {
            prepaidAmountField.disabled = true;
            prepaidAmountField.style.background = '#f3f4f6';
            prepaidAmountField.style.border = '';
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'none';
        }
        prepaidAmountField.oninput = function () {
            updateSaleRemainingBalance();
        };
    }

    // Event listeners for COD, shipping fee, discount
    const codInput = document.getElementById('saleCOD');
    if (codInput)
        codInput.oninput = function () {
            updateSaleRemainingBalance();
        };

    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (shippingFeeInput) {
        shippingFeeInput.oninput = function () {
            const finalTotal =
                parseFloat(
                    document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')
                ) || 0;
            const shippingFee = parseFloat(this.value) || 0;
            const codInput = document.getElementById('saleCOD');
            if (codInput) {
                codInput.value = finalTotal + shippingFee;
                updateSaleRemainingBalance();
            }
        };
    }

    const discountInput = document.getElementById('saleDiscount');
    if (discountInput) {
        discountInput.oninput = function () {
            const totalAmount =
                parseFloat(
                    document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')
                ) || 0;
            const totalQuantity =
                parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
            updateSaleTotals(totalQuantity, totalAmount);
        };
    }

    // Populate the modal with order data (uses shared functions from sale-modal-common.js)
    populateSaleModalWithOrder(mappedOrder);

    // Fetch wallet/debt if phone available
    if (mappedOrder.Telephone) {
        await fetchDebtForSaleModal(mappedOrder.Telephone);
    }

    // Populate delivery carrier dropdown
    await populateDeliveryCarrierDropdown();

    // Smart select delivery partner based on address
    if (mappedOrder.Address) {
        smartSelectDeliveryPartner(mappedOrder.Address, null);
    }

    // Init product search (from tab1-sale.js - shared)
    if (typeof initSaleProductSearch === 'function') {
        initSaleProductSearch();
    }

    // Auto-fill notes
    autoFillSaleNote();

    // Append social order note to receiver note (Ghi chú)
    if (order.note) {
        const noteField = document.getElementById('saleReceiverNote');
        if (noteField) {
            const existing = noteField.value.trim();
            noteField.value = existing ? `${existing}, ${order.note}` : order.note;
        }
    }
}

// =====================================================
// SYNC PARTNER ADDRESS BEFORE ORDER CREATION (Đơn Inbox only)
// When the address in the sale form differs from the partner's address on TPOS,
// update the partner's default address BEFORE creating the order.
// This ensures TPOS uses the correct address (it ignores payload address for existing partners).
// Pattern: GET Partner -> compare -> PUT if different -> then create order.
// =====================================================

/**
 * Check and sync partner address on TPOS before order creation.
 * Only runs for social orders with an existing TPOS partner.
 * @returns {Promise<boolean>} true if OK to proceed, false if should abort
 */
async function syncPartnerAddressBeforeOrder() {
    const order = currentSaleOrderData;
    if (!order || !order._isSocialOrder) return true;

    const partnerId = order.PartnerId || 0;
    if (!partnerId) return true; // New customer, no partner to sync

    const formAddress = document.getElementById('saleReceiverAddress')?.value?.trim();
    if (!formAddress) return true; // No address to sync

    if (!window.tokenManager?.authenticatedFetch) {
        console.warn('[SOCIAL-SALE] tokenManager not available, skipping address sync');
        return true; // Don't block order creation
    }

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const url = `${API_BASE}/api/odata/Partner(${partnerId})`;
    const headers = {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'feature-version': '2',
        'x-tpos-lang': 'vi',
    };

    try {
        // GET current partner data from TPOS
        console.log(`[SOCIAL-SALE] GET Partner(${partnerId}) to check address...`);
        const getResponse = await window.tokenManager.authenticatedFetch(url, {
            method: 'GET',
            headers,
        });
        if (!getResponse.ok) {
            console.warn(
                `[SOCIAL-SALE] GET Partner failed: ${getResponse.status}, proceeding anyway`
            );
            return true;
        }

        const partnerData = await getResponse.json();
        const tposAddress = partnerData.Street || partnerData.FullAddress || '';

        // Compare: if same address, no need to update
        if (tposAddress.trim() === formAddress) {
            console.log('[SOCIAL-SALE] Partner address matches form, no update needed');
            return true;
        }

        // Address differs -> update partner on TPOS
        console.log(
            `[SOCIAL-SALE] Address differs! TPOS: "${tposAddress}" vs Form: "${formAddress}"`
        );
        console.log(`[SOCIAL-SALE] PUT Partner(${partnerId}) with new address...`);

        partnerData.Street = formAddress;
        partnerData.FullAddress = formAddress;
        if (partnerData.ExtraAddress) {
            partnerData.ExtraAddress.Street = formAddress;
        } else {
            partnerData.ExtraAddress = { Street: formAddress, City: {}, District: {}, Ward: {} };
        }

        const putResponse = await window.tokenManager.authenticatedFetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(partnerData),
        });

        if (!putResponse.ok) {
            console.warn(
                `[SOCIAL-SALE] PUT Partner failed: ${putResponse.status}, proceeding anyway`
            );
            return true;
        }

        console.log(`[SOCIAL-SALE] Partner(${partnerId}) address updated to: "${formAddress}"`);
        return true;
    } catch (error) {
        console.error('[SOCIAL-SALE] syncPartnerAddressBeforeOrder error:', error);
        return true; // Don't block order creation on error
    }
}

/**
 * Wrapper around confirmAndPrintSale for Đơn Inbox.
 * Syncs partner address before creating the order.
 */
async function socialConfirmAndPrintSale() {
    // Block submit nếu có product bị broken trên TPOS (đã detect khi enrich ở openSaleModalInSocialTab).
    // Tránh user mất công nhập form rồi gặp TPOS NRE không rõ nguyên nhân.
    const broken = currentSaleOrderData?._brokenProducts;
    if (Array.isArray(broken) && broken.length > 0) {
        const list = broken.map((b) => `• [${b.code || b.tposId}] ${b.name}`).join('\n');
        alert(
            `Không thể tạo phiếu — sản phẩm sau bị lỗi trên TPOS (HTTP 500):\n\n${list}\n\n` +
                `Vui lòng:\n` +
                `1. Kiểm tra & sửa SP trên TPOS, HOẶC\n` +
                `2. Đóng modal → mở lại đơn → xoá SP lỗi → thêm SP khác qua "Tìm kiếm [F2]"`
        );
        return;
    }

    // Sync address first (only for social orders with existing partner)
    await syncPartnerAddressBeforeOrder();

    // Then proceed with normal order creation
    if (typeof window._originalConfirmAndPrintSale === 'function') {
        window._originalConfirmAndPrintSale();
    }
}

// Override: save original and replace with wrapper
// Called from inline <script> right after tab1-sale.js loads (see index.html)
function overrideConfirmAndPrintSale() {
    if (typeof confirmAndPrintSale === 'function' && !window._originalConfirmAndPrintSale) {
        window._originalConfirmAndPrintSale = confirmAndPrintSale;
        confirmAndPrintSale = socialConfirmAndPrintSale;
        console.log('[SOCIAL-SALE] Overridden confirmAndPrintSale with address sync wrapper');
    }
}

// =====================================================
// EVENT LISTENERS
// =====================================================

// Close modal when clicking outside
document.addEventListener('click', function (e) {
    const modal = document.getElementById('saleButtonModal');
    if (e.target === modal) closeSaleButtonModal();
});

// Close modal with Escape key, F9 to confirm
document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('saleButtonModal');
    if (!modal || modal.style.display !== 'flex') return;

    if (e.key === 'Escape') closeSaleButtonModal();
    if (e.key === 'F9') {
        e.preventDefault();
        if (typeof confirmAndPrintSale === 'function') confirmAndPrintSale();
    }
});

// Export for debugging
window.openSaleModalInSocialTab = openSaleModalInSocialTab;
window.syncPartnerAddressBeforeOrder = syncPartnerAddressBeforeOrder;
