// ============================================================================
// TAB SOCIAL - SALE MODAL ADAPTER
// Provides all helper functions needed to run the Tab1 sale modal
// (confirmAndPrintSale, buildSaleOrderModelForInsertList from tab1-sale.js)
// within the Social tab iframe.
//
// Architecture: The core creation logic lives in tab1-sale.js (shared).
// This file provides UI helpers + stubs for tab1-specific functions.
// ============================================================================

// =====================================================
// GLOBAL VARIABLES (required by tab1-sale.js)
// =====================================================
let currentSaleOrderData = null;
let currentSalePartnerData = null;
let currentSaleLastDeposit = null;

// Carrier cache
const DELIVERY_CARRIER_CACHE_KEY = 'social_delivery_carrier_cache';
const DELIVERY_CARRIER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let deliveryCarrierCacheMemory = null;
let deliveryCarrierCacheLoaded = false;

// QR/wallet API URL
const QR_API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// =====================================================
// PHONE NORMALIZATION (from tab1-address-stats.js)
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
// DEBT CACHE STUBS (tab1-sale.js calls these after order creation)
// In social tab, we don't maintain a debt column, so these are no-ops
// =====================================================
function getDebtCache() {
    try {
        const cache = localStorage.getItem('social_debt_cache');
        return cache ? JSON.parse(cache) : {};
    } catch (e) { return {}; }
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
    console.log('[SOCIAL-SALE] Debt update skipped (no debt column in social tab):', phone, debt);
}

// =====================================================
// FORMAT HELPERS
// =====================================================
function formatCurrencyVND(amount) {
    if (!amount && amount !== 0) return '0đ';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatNumber(num) {
    return (num || 0).toLocaleString('vi-VN');
}

function formatDateTimeDisplay(date) {
    return date.toLocaleString('vi-VN');
}

function formatDateTimeLocal(date) {
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// =====================================================
// DELIVERY CARRIER CACHE
// =====================================================
async function initDeliveryCarrierCache() {
    if (deliveryCarrierCacheLoaded) return;
    try {
        if (window.indexedDBStorage) {
            await window.indexedDBStorage.readyPromise;
            const cached = await window.indexedDBStorage.getItem(DELIVERY_CARRIER_CACHE_KEY);
            if (cached) deliveryCarrierCacheMemory = cached;
        }
        deliveryCarrierCacheLoaded = true;
    } catch (e) {
        deliveryCarrierCacheLoaded = true;
    }
}

function getCachedDeliveryCarriers() {
    try {
        if (!deliveryCarrierCacheMemory) return null;
        const { data, timestamp } = deliveryCarrierCacheMemory;
        if (Date.now() - timestamp > DELIVERY_CARRIER_CACHE_TTL) {
            deliveryCarrierCacheMemory = null;
            return null;
        }
        return data;
    } catch (e) { return null; }
}

function saveDeliveryCarriersToCache(carriers) {
    deliveryCarrierCacheMemory = { data: carriers, timestamp: Date.now() };
    if (window.indexedDBStorage) {
        window.indexedDBStorage.setItem(DELIVERY_CARRIER_CACHE_KEY, deliveryCarrierCacheMemory);
    }
}

async function fetchDeliveryCarriers() {
    const cached = getCachedDeliveryCarriers();
    if (cached) return cached;

    let token = null;
    try {
        if (window.tokenManager) token = await window.tokenManager.getToken();
    } catch (e) {}

    if (!token) return [];

    try {
        const proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier?$format=json&$orderby=DateCreated+desc&$filter=Active+eq+true&$count=true';
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'authorization': `Bearer ${token}`,
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const carriers = data.value || [];
        saveDeliveryCarriersToCache(carriers);
        return carriers;
    } catch (error) {
        console.error('[SOCIAL-SALE] Error fetching carriers:', error);
        return [];
    }
}

// =====================================================
// DELIVERY CARRIER DROPDOWN
// =====================================================
async function populateDeliveryCarrierDropdown(selectedId = null) {
    const select = document.getElementById('saleDeliveryPartner');
    if (!select) return;

    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    const carriers = await fetchDeliveryCarriers();

    let optionsHtml = '<option value="">-- Chọn đối tác giao hàng --</option>';
    carriers.forEach(carrier => {
        const fee = carrier.Config_DefaultFee || carrier.FixedPrice || 0;
        const feeText = fee > 0 ? ` (${formatCurrencyVND(fee)})` : '';
        const selected = selectedId && carrier.Id == selectedId ? 'selected' : '';
        optionsHtml += `<option value="${carrier.Id}" data-fee="${fee}" data-name="${carrier.Name}"${selected}>${carrier.Name}${feeText}</option>`;
    });

    select.innerHTML = optionsHtml;
    select.disabled = false;

    select.onchange = function () {
        const selectedOption = this.options[this.selectedIndex];
        let fee = parseFloat(selectedOption.dataset.fee) || 0;
        const carrierName = selectedOption.dataset.name || '';

        const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
        const isThanhPho = carrierName.startsWith('THÀNH PHỐ');
        const isTinh = carrierName.includes('TỈNH');

        if (isThanhPho && finalTotal > 1500000) fee = 0;
        if (isTinh && finalTotal > 3000000) fee = 0;

        const shippingFeeInput = document.getElementById('saleShippingFee');
        if (shippingFeeInput) {
            shippingFeeInput.value = fee;
            updateSaleCOD();
        }
    };

    if (selectedId) select.dispatchEvent(new Event('change'));
}

// =====================================================
// COD & REMAINING BALANCE
// =====================================================
function updateSaleCOD() {
    const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
    const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) || 0;
    const codInput = document.getElementById('saleCOD');
    if (codInput) codInput.value = totalAmount + shippingFee;
    updateSaleRemainingBalance();
}

function updateSaleRemainingBalance() {
    const codValue = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const prepaidAmount = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    const remainingElement = document.getElementById('saleRemainingBalance');
    if (remainingElement) {
        let remaining = prepaidAmount < codValue ? codValue - prepaidAmount : 0;
        remainingElement.textContent = formatNumber(remaining);
    }
}

// =====================================================
// SMART DELIVERY PARTNER SELECTION
// =====================================================
function smartSelectDeliveryPartner(address, extraAddress = null) {
    const select = document.getElementById('saleDeliveryPartner');
    if (!select || select.options.length <= 1) return;

    let districtInfo = extractDistrictFromAddress(address, extraAddress);

    if (!districtInfo) {
        selectCarrierByName(select, 'SHIP TỈNH', true);
        return;
    }

    if (districtInfo.isProvince) {
        selectCarrierByName(select, 'SHIP TỈNH', false);
        if (window.notificationManager) {
            window.notificationManager.success(`Tự động chọn: SHIP TỈNH (${districtInfo.cityName || 'tỉnh'})`, 2000);
        }
        return;
    }

    const matchedCarrier = findMatchingCarrier(select, districtInfo);
    if (matchedCarrier) {
        select.value = matchedCarrier.id;
        select.dispatchEvent(new Event('change'));
        if (window.notificationManager) {
            window.notificationManager.success(`Tự động chọn: ${matchedCarrier.name}`, 2000);
        }
    } else {
        selectCarrierByName(select, 'SHIP TỈNH', true);
    }
}

function extractDistrictFromAddress(address, extraAddress) {
    let result = {
        districtName: null, districtNumber: null, wardName: null,
        cityName: null, isProvince: false, originalText: address
    };

    if (extraAddress) {
        if (extraAddress.District?.name) {
            result.districtName = extraAddress.District.name;
            const numMatch = extraAddress.District.name.match(/(\d+)/);
            if (numMatch) result.districtNumber = numMatch[1];
        }
        if (extraAddress.Ward?.name) result.wardName = extraAddress.Ward.name;
        if (extraAddress.City?.name) {
            result.cityName = extraAddress.City.name;
            const cityNorm = extraAddress.City.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (!cityNorm.includes('ho chi minh') && !cityNorm.includes('ha noi') &&
                !cityNorm.includes('hcm') && !cityNorm.includes('sai gon')) {
                result.isProvince = true;
            }
        }
    }

    if (address) {
        let cleanedAddress = address
            .replace(/\b0\d{9,10}\b/g, '')
            .replace(/\bD\.\s*/gi, '')
            .replace(/[/.]{2,}/g, ' ')
            .replace(/\.\s+\./g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        const normalizedAddress = cleanedAddress.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const provinces = [
            'hai phong', 'haiphong', 'da nang', 'danang', 'can tho', 'cantho',
            'ha giang', 'hagiang', 'cao bang', 'caobang', 'bac kan', 'backan',
            'tuyen quang', 'tuyenquang', 'lao cai', 'laocai',
            'dien bien', 'dienbien', 'lai chau', 'laichau', 'son la', 'sonla',
            'yen bai', 'yenbai', 'hoa binh', 'hoabinh',
            'thai nguyen', 'thainguyen', 'lang son', 'langson',
            'quang ninh', 'quangninh', 'bac giang', 'bacgiang',
            'phu tho', 'phutho', 'vinh phuc', 'vinhphuc',
            'bac ninh', 'bacninh', 'hai duong', 'haiduong',
            'hung yen', 'hungyen', 'thai binh', 'thaibinh',
            'ha nam', 'hanam', 'nam dinh', 'namdinh', 'ninh binh', 'ninhbinh',
            'thanh hoa', 'thanhhoa', 'nghe an', 'nghean',
            'ha tinh', 'hatinh', 'quang binh', 'quangbinh',
            'quang tri', 'quangtri', 'thua thien hue', 'thuathienhue',
            'quang nam', 'quangnam', 'quang ngai', 'quangngai',
            'binh dinh', 'binhdinh', 'phu yen', 'phuyen',
            'khanh hoa', 'khanhhoa', 'ninh thuan', 'ninhthuan',
            'binh thuan', 'binhthuan',
            'kon tum', 'kontum', 'gia lai', 'gialai',
            'dak lak', 'daklak', 'dac lak', 'daclak',
            'dak nong', 'daknong', 'dac nong', 'dacnong',
            'lam dong', 'lamdong',
            'binh phuoc', 'binhphuoc', 'tay ninh', 'tayninh',
            'binh duong', 'binhduong', 'dong nai', 'dongnai',
            'ba ria', 'baria', 'vung tau', 'vungtau', 'ba ria vung tau', 'bariavungtau',
            'long an', 'longan', 'tien giang', 'tiengiang',
            'ben tre', 'bentre', 'tra vinh', 'travinh',
            'vinh long', 'vinhlong', 'dong thap', 'dongthap',
            'an giang', 'angiang', 'kien giang', 'kiengiang',
            'hau giang', 'haugiang', 'soc trang', 'soctrang',
            'bac lieu', 'baclieu', 'ca mau', 'camau'
        ];

        const parts = normalizedAddress.split(/[,\s]+/).filter(p => p.length > 1);
        const endParts = parts.slice(-4).join(' ');

        for (const province of provinces) {
            if (endParts.includes(province)) {
                result.isProvince = true;
                result.cityName = province;
                return result;
            }
        }

        const districtPatterns = [
            /quan\s*\.?\s*(\d+)/i, /q\s*\.?\s*(\d+)/i,
            /district\s*(\d+)/i, /\bq(\d+)\b/i
        ];

        for (const pattern of districtPatterns) {
            const match = normalizedAddress.match(pattern);
            if (match) { result.districtNumber = match[1]; break; }
        }

        const namedDistricts = [
            { normalized: 'binh tan', original: 'Bình Tân' },
            { normalized: 'binh thanh', original: 'Bình Thạnh' },
            { normalized: 'go vap', original: 'Gò Vấp' },
            { normalized: 'phu nhuan', original: 'Phú Nhuận' },
            { normalized: 'tan binh', original: 'Tân Bình' },
            { normalized: 'tan phu', original: 'Tân Phú' },
            { normalized: 'thu duc', original: 'Thủ Đức' },
            { normalized: 'tp thu duc', original: 'Thủ Đức' },
            { normalized: 'thanh pho thu duc', original: 'Thủ Đức' },
            { normalized: 'binh chanh', original: 'Bình Chánh' },
            { normalized: 'can gio', original: 'Cần Giờ' },
            { normalized: 'cu chi', original: 'Củ Chi' },
            { normalized: 'hoc mon', original: 'Hóc Môn' },
            { normalized: 'nha be', original: 'Nhà Bè' }
        ];

        for (const district of namedDistricts) {
            const lastThreeParts = parts.slice(-3).join(' ');
            const districtPattern = new RegExp(
                `(quan|huyen|phuong|xa|thi tran|tp|thanh pho|q\\.?)?\\s*${district.normalized}(?:\\s|,|$)`, 'i'
            );
            const hasApPrefix = normalizedAddress.includes(`ap ${district.normalized}`) ||
                normalizedAddress.includes(`xom ${district.normalized}`) ||
                normalizedAddress.includes(`thon ${district.normalized}`);

            if (!hasApPrefix && (districtPattern.test(lastThreeParts) || lastThreeParts.endsWith(district.normalized))) {
                result.districtName = district.original;
                break;
            }
        }
    }

    if (!result.districtName && !result.districtNumber && !result.isProvince) return null;
    return result;
}

function findMatchingCarrier(select, districtInfo) {
    const CARRIER_20K = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
    const CARRIER_20K_NAMED = ['phu nhuan', 'binh thanh', 'tan phu', 'tan binh', 'go vap'];
    const CARRIER_30K = ['2', '12'];
    const CARRIER_30K_NAMED = ['binh tan', 'thu duc'];
    const CARRIER_35K_TP = ['9'];
    const CARRIER_35K_TP_NAMED = ['binh chanh', 'nha be', 'hoc mon'];
    const SHIP_TINH_NAMED = ['cu chi', 'can gio'];

    let targetGroup = null;
    const districtNum = districtInfo.districtNumber;
    const districtName = districtInfo.districtName?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';

    if (districtNum) {
        if (CARRIER_20K.includes(districtNum)) targetGroup = '20k';
        else if (CARRIER_30K.includes(districtNum)) targetGroup = '30k';
        else if (CARRIER_35K_TP.includes(districtNum)) targetGroup = '35k_tp';
    }

    if (!targetGroup && districtName) {
        if (CARRIER_20K_NAMED.some(d => districtName.includes(d))) targetGroup = '20k';
        else if (CARRIER_30K_NAMED.some(d => districtName.includes(d))) targetGroup = '30k';
        else if (CARRIER_35K_TP_NAMED.some(d => districtName.includes(d))) targetGroup = '35k_tp';
        else if (SHIP_TINH_NAMED.some(d => districtName.includes(d))) targetGroup = 'ship_tinh';
    }

    if (!targetGroup) return null;

    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        if (!option.value) continue;
        const carrierName = option.dataset.name || option.text;
        const carrierNorm = carrierName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const carrierFee = parseFloat(option.dataset.fee) || 0;

        if (carrierNorm.includes('gop') || carrierName === 'BÁN HÀNG SHOP') continue;

        if (targetGroup === '20k' && carrierFee === 20000 && carrierNorm.includes('thanh pho')) return { id: option.value, name: carrierName };
        if (targetGroup === '30k' && carrierFee === 30000 && carrierNorm.includes('thanh pho')) return { id: option.value, name: carrierName };
        if (targetGroup === '35k_tp' && carrierFee === 35000 && carrierNorm.includes('thanh pho')) return { id: option.value, name: carrierName };
        if (targetGroup === 'ship_tinh' && carrierNorm.includes('ship tinh')) return { id: option.value, name: carrierName };
    }
    return null;
}

function selectCarrierByName(select, namePattern, showWarning = false) {
    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        const carrierName = option.dataset.name || option.text;
        if (carrierName.includes(namePattern)) {
            select.value = option.value;
            select.dispatchEvent(new Event('change'));
            if (showWarning && window.notificationManager) {
                window.notificationManager.info(`Không xác định được quận/huyện, đã chọn: ${carrierName}`, 3000);
            }
            return true;
        }
    }
    return false;
}

// =====================================================
// SALE MODAL TAB SWITCHING
// =====================================================
function switchSaleTab(tabName) {
    document.querySelectorAll('.sale-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });
    document.querySelectorAll('.sale-tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const activeContent = document.getElementById(`saleTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
    }
}

// =====================================================
// POPULATE SALE MODAL WITH ORDER DATA
// =====================================================
function populateSaleModalWithOrder(order) {
    const customerName = order.PartnerName || order.Name || '';
    document.getElementById('saleCustomerName').textContent = customerName;
    document.getElementById('saleCustomerNameHeader').textContent = customerName;
    document.getElementById('saleCustomerStatus').textContent = '';
    document.getElementById('saleCustomerStatusHeader').textContent = '';
    document.getElementById('saleLoyaltyPoints').textContent = '0';
    document.getElementById('saleLoyaltyPointsHeader').textContent = '0';
    document.getElementById('saleUsedPointsHeader').textContent = '0';
    document.getElementById('saleRemainingPointsHeader').textContent = '0';
    document.getElementById('saleOldDebt').textContent = '0';

    document.getElementById('saleReceiverName').value = order.PartnerName || order.Name || '';
    document.getElementById('saleReceiverPhone').value = order.PartnerPhone || order.Telephone || '';
    document.getElementById('saleReceiverAddress').value = order.PartnerAddress || order.Address || '';
    document.getElementById('saleReceiverNote').value = '';

    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseInt(shippingFeeValue) : 35000;
    const totalAmount = order.TotalAmount || 0;

    document.getElementById('saleCOD').value = totalAmount + shippingFee;

    const defaultDeliveryNote = 'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CỦA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ';
    document.getElementById('saleDeliveryNote').value = order.Comment || defaultDeliveryNote;
    document.getElementById('saleGoodsValue').value = totalAmount;

    const now = new Date();
    document.getElementById('saleDeliveryDate').value = formatDateTimeLocal(now);
    document.getElementById('saleInvoiceDate').textContent = formatDateTimeDisplay(now);

    populateSaleOrderItems(order);
}

// =====================================================
// POPULATE ORDER ITEMS
// =====================================================
function populateSaleOrderItems(order) {
    const container = document.getElementById('saleOrderItems');

    if (!order.Details || order.Details.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    <i class="fas fa-box-open"></i> Chưa có sản phẩm
                </td>
            </tr>
        `;
        updateSaleTotals(0, 0);
        return;
    }

    let totalQuantity = 0;
    let totalAmount = 0;

    const itemsHTML = order.Details.map((item, index) => {
        const qty = item.Quantity || item.ProductUOMQty || 1;
        const price = item.PriceUnit || item.Price || 0;
        const total = qty * price;
        totalQuantity += qty;
        totalAmount += total;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="sale-product-name">${item.ProductNameGet || item.ProductName || ''}</div>
                    <div style="font-size: 11px; color: #6b7280;">${item.Note || 'Ghi chú'}</div>
                </td>
                <td>
                    <input type="number" class="sale-input" value="${qty}" min="1"
                        onchange="updateSaleItemQuantity(${index}, this.value)"
                        style="width: 60px; text-align: center;">
                </td>
                <td style="text-align: right;">${formatNumber(price)}</td>
                <td style="text-align: right;">${formatNumber(total)}</td>
                <td style="text-align: center;">
                    <button onclick="removeSaleItem(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = itemsHTML;
    updateSaleTotals(totalQuantity, totalAmount);
}

// =====================================================
// DISCOUNT HELPERS
// =====================================================
function parseDiscountFromNoteForDisplay(note) {
    if (!note || typeof note !== 'string') return 0;
    const cleanNote = note.trim().toLowerCase();
    if (!cleanNote) return 0;
    const kMatch = cleanNote.match(/^(\d+(?:[.,]\d+)?)\s*k$/i);
    if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000);
    const plainMatch = cleanNote.match(/^(\d{1,3}(?:[.,]\d{3})*|\d+)$/);
    if (plainMatch) {
        const num = parseInt(plainMatch[1].replace(/[.,]/g, ''), 10);
        if (num >= 1000) return num;
        if (num > 0) return num * 1000;
    }
    return 0;
}

function currentSaleOrderHasDiscountTag() {
    if (!currentSaleOrderData?.Tags) return false;
    try {
        const tags = typeof currentSaleOrderData.Tags === 'string'
            ? JSON.parse(currentSaleOrderData.Tags)
            : currentSaleOrderData.Tags;
        if (Array.isArray(tags)) {
            return tags.some(tag => {
                const tagName = (tag.Name || '').toUpperCase();
                return tagName.includes('GIẢM GIÁ') || tagName.includes('GIAM GIA');
            });
        }
    } catch (e) {}
    return false;
}

// =====================================================
// POPULATE ORDER LINES FROM API
// =====================================================
function populateSaleOrderLinesFromAPI(orderLines) {
    const container = document.getElementById('saleOrderItems');

    if (!orderLines || orderLines.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                    <i class="fas fa-box-open"></i> Chưa có sản phẩm
                </td>
            </tr>
        `;
        updateSaleTotals(0, 0);
        return;
    }

    currentSaleOrderData.orderLines = orderLines;
    const hasDiscountTag = currentSaleOrderHasDiscountTag();

    let totalQuantity = 0, totalAmount = 0, totalDiscount = 0;

    const itemsHTML = orderLines.map((item, index) => {
        const qty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        const total = qty * price;
        const productName = item.Product?.NameGet || item.ProductName || '';
        const productNote = item.Note || '';
        const notePrice = hasDiscountTag ? parseDiscountFromNoteForDisplay(productNote) : 0;
        const discountPerUnit = notePrice > 0 ? Math.max(0, price - notePrice) : 0;
        const productDiscount = discountPerUnit * qty;
        const isDiscountedProduct = productDiscount > 0;
        if (isDiscountedProduct) totalDiscount += productDiscount;

        const rowStyle = isDiscountedProduct ? 'background-color: #fef3c7;' : '';
        const noteStyle = isDiscountedProduct
            ? 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-weight: 600;'
            : 'font-size: 11px; color: #6b7280;';

        const productImage = item.Product?.Thumbnails?.[1] || item.Product?.ImageUrl || '';
        const imageHTML = productImage
            ? `<img src="${productImage}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;">`
            : `<div style="width: 40px; height: 40px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #9ca3af;"></i></div>`;

        totalQuantity += qty;
        totalAmount += total;

        const noteDisplay = productNote
            ? (isDiscountedProduct
                ? `<span style="${noteStyle}"><i class="fas fa-tag"></i> -${discountPerUnit.toLocaleString('vi-VN')}đ (${productNote})</span>`
                : `<div style="${noteStyle}">${productNote}</div>`)
            : '<div style="font-size: 11px; color: #9ca3af;">Ghi chú</div>';

        return `
            <tr style="${rowStyle}">
                <td>${index + 1}</td>
                <td>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        ${imageHTML}
                        <div>
                            <div class="sale-product-name">${productName}</div>
                            ${noteDisplay}
                        </div>
                    </div>
                </td>
                <td>
                    <input type="number" class="sale-input" value="${qty}" min="1"
                        onchange="updateSaleItemQuantityFromAPI(${index}, this.value)"
                        style="width: 60px; text-align: center;">
                </td>
                <td style="text-align: right;">${formatNumber(price)}</td>
                <td style="text-align: right;">${formatNumber(total)}</td>
                <td style="text-align: center;">
                    <button onclick="removeSaleItemFromAPI(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = itemsHTML;

    if (hasDiscountTag && totalDiscount > 0) {
        const discountInput = document.getElementById('saleDiscount');
        if (discountInput) discountInput.value = totalDiscount;
    }

    updateSaleTotals(totalQuantity, totalAmount);
}

// =====================================================
// UPDATE / REMOVE ITEMS
// =====================================================
function updateSaleItemQuantity(index, value) {
    if (!currentSaleOrderData || !currentSaleOrderData.Details) return;
    const qty = parseInt(value) || 1;
    currentSaleOrderData.Details[index].Quantity = qty;

    let totalQuantity = 0, totalAmount = 0;
    currentSaleOrderData.Details.forEach(item => {
        const itemQty = item.Quantity || item.ProductUOMQty || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += itemQty;
        totalAmount += itemQty * price;
    });
    updateSaleTotals(totalQuantity, totalAmount);
}

function removeSaleItem(index) {
    if (!currentSaleOrderData || !currentSaleOrderData.Details) return;
    currentSaleOrderData.Details.splice(index, 1);
    populateSaleOrderItems(currentSaleOrderData);
}

async function updateSaleItemQuantityFromAPI(index, value) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;
    const newQty = parseInt(value) || 1;
    currentSaleOrderData.orderLines[index].ProductUOMQty = newQty;
    currentSaleOrderData.orderLines[index].Quantity = newQty;

    let totalQuantity = 0, totalAmount = 0;
    currentSaleOrderData.orderLines.forEach(item => {
        const itemQty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += itemQty;
        totalAmount += itemQty * price;
    });
    updateSaleTotals(totalQuantity, totalAmount);
}

async function removeSaleItemFromAPI(index) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;
    const productName = currentSaleOrderData.orderLines[index].Product?.NameGet ||
        currentSaleOrderData.orderLines[index].ProductName || 'sản phẩm này';

    const confirmed = window.notificationManager ?
        await window.notificationManager.confirm(`Bạn có chắc muốn xóa ${productName}?`, 'Xóa sản phẩm') : true;
    if (!confirmed) return;

    currentSaleOrderData.orderLines.splice(index, 1);
    populateSaleOrderLinesFromAPI(currentSaleOrderData.orderLines);
    if (window.notificationManager) window.notificationManager.success(`Đã xóa ${productName}`);
}

// =====================================================
// UPDATE TOTALS
// =====================================================
function updateSaleTotals(quantity, amount) {
    document.getElementById('saleTotalQuantity').textContent = quantity;
    document.getElementById('saleTotalAmount').textContent = formatNumber(amount);

    const discount = parseInt(document.getElementById('saleDiscount').value) || 0;
    const finalTotal = amount - discount;
    document.getElementById('saleFinalTotal').textContent = formatNumber(finalTotal);

    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (carrierSelect && shippingFeeInput && carrierSelect.value) {
        const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
        const carrierName = selectedOption?.dataset?.name || '';
        const baseFee = parseFloat(selectedOption?.dataset?.fee) || 0;
        const isThanhPho = carrierName.startsWith('THÀNH PHỐ');
        const isTinh = carrierName.includes('TỈNH');

        if (isThanhPho && finalTotal > 1500000) shippingFeeInput.value = 0;
        else if (isTinh && finalTotal > 3000000) shippingFeeInput.value = 0;
        else if (parseFloat(shippingFeeInput.value) === 0 && baseFee > 0) shippingFeeInput.value = baseFee;
    }

    const shippingFeeValue = document.getElementById('saleShippingFee')?.value;
    const shippingFee = (shippingFeeValue !== '' && shippingFeeValue !== null && shippingFeeValue !== undefined)
        ? parseInt(shippingFeeValue) : 0;
    document.getElementById('saleCOD').value = finalTotal + shippingFee;
    document.getElementById('saleGoodsValue').value = finalTotal;
    updateSaleRemainingBalance();
}

// =====================================================
// FETCH WALLET BALANCE
// =====================================================
async function fetchDebtForSaleModal(phone) {
    const normalizedPhone = normalizePhoneForQR(phone);
    if (!normalizedPhone) return;

    const prepaidAmountField = document.getElementById('salePrepaidAmount');
    if (prepaidAmountField) prepaidAmountField.value = '...';

    try {
        const response = await fetch(`${QR_API_URL}/api/v2/wallets/${encodeURIComponent(normalizedPhone)}`);
        const result = await response.json();

        if (result.success && result.data) {
            const realBalance = parseFloat(result.data.balance) || 0;
            const virtualBalance = parseFloat(result.data.virtual_balance) || 0;
            const totalBalance = realBalance + virtualBalance;

            if (result.data.lastDepositAmount && result.data.lastDepositDate) {
                currentSaleLastDeposit = {
                    amount: parseFloat(result.data.lastDepositAmount),
                    date: result.data.lastDepositDate
                };
            } else {
                currentSaleLastDeposit = null;
            }

            if (prepaidAmountField) prepaidAmountField.value = totalBalance > 0 ? totalBalance : 0;

            const oldDebtField = document.getElementById('saleOldDebt');
            if (oldDebtField) oldDebtField.textContent = formatCurrencyVND(totalBalance);

            if (prepaidAmountField) prepaidAmountField.dataset.hasVirtualDebt = virtualBalance > 0 ? '1' : '0';

            saveDebtToCache(normalizedPhone, totalBalance);
            updateSaleRemainingBalance();
        } else {
            currentSaleLastDeposit = null;
            if (prepaidAmountField) {
                prepaidAmountField.value = 0;
                prepaidAmountField.dataset.hasVirtualDebt = '0';
            }
            updateSaleRemainingBalance();
        }
    } catch (error) {
        console.error('[SOCIAL-SALE] Error fetching wallet balance:', error);
        if (prepaidAmountField) {
            prepaidAmountField.value = 0;
            prepaidAmountField.dataset.hasVirtualDebt = '0';
        }
        updateSaleRemainingBalance();
    }
}

// =====================================================
// AUTO-FILL SALE NOTE
// =====================================================
function autoFillSaleNote() {
    const noteField = document.getElementById('saleReceiverNote');
    if (!noteField || noteField.value.trim()) return;

    const order = currentSaleOrderData;
    if (!order) return;

    const noteParts = [];

    const walletBalance = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    if (walletBalance > 0) {
        let ckAmount = walletBalance;
        let dateStr;
        if (currentSaleLastDeposit?.amount && currentSaleLastDeposit?.date) {
            ckAmount = currentSaleLastDeposit.amount;
            const depositDate = new Date(currentSaleLastDeposit.date);
            dateStr = `${String(depositDate.getDate()).padStart(2, '0')}/${String(depositDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
            const today = new Date();
            dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
        }
        const amountStr = ckAmount >= 1000 ? `${Math.round(ckAmount / 1000)}K` : ckAmount;
        noteParts.push(`CK ${amountStr} ACB ${dateStr}`);
    }

    let orderTags = [];
    try {
        if (order.Tags) {
            orderTags = typeof order.Tags === 'string' ? JSON.parse(order.Tags) : order.Tags;
            if (!Array.isArray(orderTags)) orderTags = [];
        }
    } catch (e) { orderTags = []; }

    const totalDiscount = parseFloat(document.getElementById('saleDiscount')?.value) || 0;
    if (totalDiscount > 0) {
        const discountStr = totalDiscount >= 1000 ? `${Math.round(totalDiscount / 1000)}K` : totalDiscount;
        noteParts.push(`GG ${discountStr}`);
    }

    const mergeTag = orderTags.find(tag => (tag.Name || '').toLowerCase().startsWith('gộp '));
    if (mergeTag) {
        const numbers = mergeTag.Name.match(/\d+/g);
        if (numbers && numbers.length > 1) noteParts.push(`ĐƠN GỘP ${numbers.join(' + ')}`);
    }

    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
    if (carrierSelect && carrierSelect.value) {
        const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
        const carrierName = selectedOption?.dataset?.name || '';
        if ((carrierName.startsWith('THÀNH PHỐ') && finalTotal > 1500000) ||
            (carrierName.includes('TỈNH') && finalTotal > 3000000)) {
            noteParts.push('FREESHIP');
        }
    }

    if (noteParts.length > 0) noteField.value = noteParts.join(', ');
}

// =====================================================
// POPULATE PARTNER DATA
// =====================================================
function populatePartnerData(partner) {
    if (!partner) return;
    const customerName = partner.DisplayName || partner.Name || '';
    const customerStatus = partner.StatusText || 'Bình thường';
    const loyaltyPoints = partner.LoyaltyPoints || 0;

    document.getElementById('saleCustomerName').textContent = customerName;
    document.getElementById('saleCustomerStatus').textContent = customerStatus;
    document.getElementById('saleLoyaltyPoints').textContent = loyaltyPoints;
    document.getElementById('saleCustomerNameHeader').textContent = customerName;
    document.getElementById('saleCustomerStatusHeader').textContent = customerStatus;
    document.getElementById('saleLoyaltyPointsHeader').textContent = loyaltyPoints;
    document.getElementById('saleUsedPointsHeader').textContent = '0';
    document.getElementById('saleRemainingPointsHeader').textContent = loyaltyPoints;

    const receiverName = document.getElementById('saleReceiverName');
    const receiverPhone = document.getElementById('saleReceiverPhone');
    const receiverAddress = document.getElementById('saleReceiverAddress');

    if (!receiverName.value) receiverName.value = partner.DisplayName || partner.Name || '';
    if (!receiverPhone.value) receiverPhone.value = partner.Phone || partner.Mobile || '';
    if (!receiverAddress.value) {
        let address = partner.FullAddress || partner.Street || '';
        if (!address && partner.ExtraAddress) {
            const ea = partner.ExtraAddress;
            const parts = [ea.Street, ea.Ward?.name, ea.District?.name, ea.City?.name].filter(p => p);
            address = parts.join(', ');
        }
        receiverAddress.value = address;
    }
}

// =====================================================
// WALLET HISTORY (stub)
// =====================================================
function showCustomerWalletHistory() {
    const phoneField = document.getElementById('saleReceiverPhone');
    if (!phoneField || !phoneField.value) {
        if (window.notificationManager) window.notificationManager.warning('Không có số điện thoại khách hàng');
        return;
    }
    const phone = normalizePhoneForQR(phoneField.value);
    if (!phone) {
        if (window.notificationManager) window.notificationManager.warning('Số điện thoại không hợp lệ');
        return;
    }
    if (typeof WalletIntegration !== 'undefined' && WalletIntegration.showWalletModal) {
        WalletIntegration.showWalletModal(phone);
    } else {
        if (window.notificationManager) window.notificationManager.error('Chức năng xem ví chưa sẵn sàng');
    }
}

// =====================================================
// CLOSE SALE BUTTON MODAL
// =====================================================
function closeSaleButtonModal(clearSelection = false) {
    const modal = document.getElementById('saleButtonModal');
    if (modal) modal.style.display = 'none';
    currentSaleOrderData = null;
    currentSalePartnerData = null;
    currentSaleLastDeposit = null;

    // Update social order status in table if needed
    if (clearSelection && window._lastSocialSaleOrderId) {
        updateSocialOrderAfterSale(window._lastSocialSaleOrderId);
        window._lastSocialSaleOrderId = null;
    }
}

/**
 * Update social order in the table after successful sale creation
 */
function updateSocialOrderAfterSale(socialOrderId) {
    if (!socialOrderId) return;

    // Find and update the order in SocialOrderState
    const order = SocialOrderState?.orders?.find(o => o.id === socialOrderId);
    if (order) {
        order.status = 'confirmed';
        // Re-render table to show updated status
        if (typeof renderSocialOrderTable === 'function') {
            renderSocialOrderTable();
        }
    }
}

// =====================================================
// OPEN SALE MODAL FROM SOCIAL ORDER
// Main entry point: opens the sale modal within the Social tab
// =====================================================
async function openSaleModalInSocialTab(orderId) {
    console.log('[SOCIAL-SALE] Opening sale modal for order:', orderId);

    const order = SocialOrderState?.orders?.find(o => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    // Store the social order ID for post-sale update
    window._lastSocialSaleOrderId = orderId;

    // Map social order data to Tab1-compatible format
    const mappedOrder = {
        Id: order.id,
        PartnerId: order.tposPartnerId || 0,  // TPOS Partner Id saved from phone lookup/customer creation
        PartnerName: order.customerName || '',
        Name: order.customerName || '',
        Telephone: order.phone || '',
        PartnerPhone: order.phone || '',
        PartnerAddress: order.address || '',
        Address: order.address || '',
        TotalAmount: order.totalAmount || 0,
        Comment: order.note || '',
        Details: (order.products || []).map(p => ({
            ProductId: p.tposProductId || 0,
            ProductNameGet: p.productName || p.name || '',
            ProductName: p.productName || p.name || '',
            Quantity: p.quantity || 1,
            PriceUnit: p.sellingPrice || p.price || 0,
            Price: p.sellingPrice || p.price || 0,
            Note: p.variant || ''
        })),
        Tags: order.tags ? JSON.stringify(order.tags) : '[]',
        _isSocialOrder: true  // Flag to skip SaleOnlineIds (SO-* format != GUID)
    };

    currentSaleOrderData = mappedOrder;

    // Reset form fields
    const discountEl = document.getElementById('saleDiscount');
    if (discountEl) discountEl.value = 0;
    const receiverNoteEl = document.getElementById('saleReceiverNote');
    if (receiverNoteEl) receiverNoteEl.value = '';
    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl) prepaidEl.value = 0;
    const prepaidDateEl = document.getElementById('salePrepaidDate');
    if (prepaidDateEl) prepaidDateEl.value = '';

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
            if (confirmDebtBtn) confirmDebtBtn.style.display = 'none';
        }
        prepaidAmountField.oninput = function () { updateSaleRemainingBalance(); };
    }

    // Event listeners for COD, shipping fee, discount
    const codInput = document.getElementById('saleCOD');
    if (codInput) codInput.oninput = function () { updateSaleRemainingBalance(); };

    const shippingFeeInput = document.getElementById('saleShippingFee');
    if (shippingFeeInput) {
        shippingFeeInput.oninput = function () {
            const finalTotal = parseFloat(document.getElementById('saleFinalTotal')?.textContent?.replace(/[^\d]/g, '')) || 0;
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
            const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || 0;
            const totalQuantity = parseInt(document.getElementById('saleTotalQuantity')?.textContent) || 0;
            updateSaleTotals(totalQuantity, totalAmount);
        };
    }

    // Populate the modal with order data
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

// Init carrier cache on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initDeliveryCarrierCache, 200));
} else {
    setTimeout(initDeliveryCarrierCache, 200);
}

// Export for debugging
window.openSaleModalInSocialTab = openSaleModalInSocialTab;
