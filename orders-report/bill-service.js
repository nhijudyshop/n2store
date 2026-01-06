/**
 * Bill Service - Custom bill generation, printing and sending
 * Extracted from tab1-orders.js for better code organization
 */

/**
 * Bill Service Module
 */
const BillService = (function () {

    /**
     * Generate custom bill HTML from order data
     * @param {Object} orderResult - The created order result from FastSaleOrder API
     * @param {Object} options - Optional parameters
     * @param {Object} options.currentSaleOrderData - Current sale order data (from saleButtonModal)
     * @returns {string} HTML content for the bill
     */
    function generateCustomBillHTML(orderResult, options = {}) {
        // Support both saleButtonModal (uses currentSaleOrderData) and FastSale (uses orderResult directly)
        const currentSaleOrderData = options.currentSaleOrderData || null;
        const order = currentSaleOrderData || orderResult;
        const defaultData = window.lastDefaultSaleData || {};
        const company = defaultData.Company || { Name: 'NJD Live', Phone: '090 8888 674' };

        // Get form values - try form fields first, then fallback to orderResult data
        const receiverName = document.getElementById('saleReceiverName')?.value ||
            orderResult?.Partner?.Name ||
            orderResult?.PartnerDisplayName ||
            '';
        const receiverPhone = document.getElementById('saleReceiverPhone')?.value ||
            orderResult?.Partner?.Phone ||
            orderResult?.Ship_Receiver?.Phone ||
            '';
        const receiverAddress = document.getElementById('saleReceiverAddress')?.value ||
            orderResult?.Partner?.Street ||
            orderResult?.Ship_Receiver?.Street ||
            '';
        const deliveryNote = document.getElementById('saleDeliveryNote')?.value ||
            orderResult?.Ship_Note ||
            orderResult?.Comment ||
            '';
        const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) ||
            orderResult?.DeliveryPrice ||
            0;
        const discount = parseFloat(document.getElementById('saleDiscount')?.value) ||
            orderResult?.Discount ||
            orderResult?.DiscountAmount ||
            0;
        const codAmount = parseFloat(document.getElementById('saleCOD')?.value) ||
            orderResult?.CashOnDelivery ||
            orderResult?.AmountTotal ||
            0;
        const prepaidAmount = parseFloat(document.getElementById('salePrepaidAmount')?.value) ||
            orderResult?.AmountDeposit ||
            0;

        // Get carrier info - prioritize orderResult.CarrierName (set by FastSale enrichment)
        // Only use saleDeliveryPartner dropdown as fallback for saleButtonModal
        const carrierSelect = document.getElementById('saleDeliveryPartner');
        const carrierFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
        // Skip dropdown value if it's a loading placeholder
        const isValidDropdownCarrier = carrierFromDropdown && !carrierFromDropdown.includes('Đang tải');
        const carrierName = orderResult?.CarrierName ||
            orderResult?.Carrier?.Name ||
            (isValidDropdownCarrier ? carrierFromDropdown : '') ||
            '';

        // Get seller name from current user
        const sellerName = window.authManager?.currentUser?.displayName ||
            defaultData.User?.Name ||
            orderResult?.User?.Name ||
            orderResult?.UserName ||
            '';

        // Get STT
        let sttDisplay = '';
        if (order?.IsMerged && order?.OriginalOrders?.length > 1) {
            const allSTTs = order.OriginalOrders
                .map(o => o.SessionIndex)
                .filter(stt => stt)
                .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
            sttDisplay = allSTTs.join(', ');
        } else {
            sttDisplay = order?.SessionIndex || orderResult?.SessionIndex || '';
        }

        // Get products from orderLines - support multiple field names
        const orderLines = order?.orderLines || orderResult?.OrderLines || orderResult?.orderLines || [];
        let totalQuantity = 0;
        let totalAmount = 0;

        const productsHTML = orderLines.map((item, index) => {
            const quantity = item.Quantity || item.ProductUOMQty || 1;
            const price = item.PriceUnit || item.Price || 0;
            const total = quantity * price;
            const productName = item.ProductName || item.ProductNameGet || '';
            const note = item.Note || '';

            totalQuantity += quantity;
            totalAmount += total;

            return `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
                        ${productName}
                        ${note ? `<div style="font-size: 11px; color: #6b7280; font-style: italic;">${note}</div>` : ''}
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${quantity}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${price.toLocaleString('vi-VN')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${total.toLocaleString('vi-VN')}</td>
                </tr>
            `;
        }).join('');

        // Calculate final total
        const finalTotal = totalAmount - discount + shippingFee;
        const remainingBalance = codAmount - prepaidAmount;

        // Format date
        const now = new Date();
        const dateStr = now.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Phiếu bán hàng - ${orderResult?.Number || ''}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
            padding: 20px;
            max-width: 80mm;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px dashed #333;
        }
        .shop-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .shop-phone {
            font-size: 14px;
            color: #333;
        }
        .bill-title {
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            margin: 10px 0;
        }
        .order-info {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #ccc;
        }
        .order-info div {
            margin-bottom: 3px;
        }
        .stt-display {
            font-size: 20px;
            font-weight: bold;
            text-align: center;
            background: #f3f4f6;
            padding: 8px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .customer-info {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #ccc;
        }
        .customer-info div {
            margin-bottom: 3px;
        }
        .label {
            font-weight: bold;
            display: inline-block;
            min-width: 80px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }
        th {
            background: #f3f4f6;
            padding: 8px 4px;
            text-align: left;
            font-weight: bold;
            border-bottom: 2px solid #333;
        }
        th:nth-child(1) { width: 30px; text-align: center; }
        th:nth-child(3) { width: 40px; text-align: center; }
        th:nth-child(4), th:nth-child(5) { width: 70px; text-align: right; }
        .totals {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 2px dashed #333;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
        }
        .total-row.final {
            font-size: 16px;
            font-weight: bold;
            padding-top: 5px;
            border-top: 1px solid #333;
            margin-top: 5px;
        }
        .cod-amount {
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            background: #fef3c7;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border: 2px solid #f59e0b;
        }
        .delivery-note {
            margin-top: 10px;
            padding: 10px;
            background: #fef2f2;
            border-radius: 4px;
            font-size: 11px;
            color: #dc2626;
        }
        .footer {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 2px dashed #333;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
        .barcode-container {
            text-align: center;
            margin: 10px 0;
        }
        .barcode-container svg {
            max-width: 100%;
            height: auto;
        }
        @media print {
            body { padding: 5px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="shop-name">${company.Name || 'NJD Live'}</div>
        <div class="shop-phone">Hotline: ${company.Phone || '090 8888 674'}</div>
    </div>

    <div class="bill-title">PHIẾU BÁN HÀNG</div>

    ${sttDisplay ? `<div class="stt-display">STT: ${sttDisplay}</div>` : ''}

    <!-- Barcode for order number -->
    <div class="barcode-container">
        <svg id="barcode"></svg>
    </div>

    <div class="order-info">
        <div><span class="label">Số HĐ:</span> ${orderResult?.Number || 'N/A'}</div>
        <div><span class="label">Ngày:</span> ${dateStr}</div>
        ${carrierName ? `<div><span class="label">ĐVVC:</span> ${carrierName}</div>` : ''}
    </div>

    <div class="customer-info">
        <div><span class="label">Khách hàng:</span> ${receiverName}</div>
        <div><span class="label">SĐT:</span> ${receiverPhone}</div>
        <div><span class="label">Địa chỉ:</span> ${receiverAddress}</div>
        ${sellerName ? `<div><span class="label">Người bán:</span> ${sellerName}</div>` : ''}
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Sản phẩm</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
            </tr>
        </thead>
        <tbody>
            ${productsHTML}
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row">
            <span>Tổng SL:</span>
            <span>${totalQuantity}</span>
        </div>
        <div class="total-row">
            <span>Tổng tiền hàng:</span>
            <span>${totalAmount.toLocaleString('vi-VN')} đ</span>
        </div>
        ${discount > 0 ? `
        <div class="total-row">
            <span>Chiết khấu:</span>
            <span>-${discount.toLocaleString('vi-VN')} đ</span>
        </div>
        ` : ''}
        <div class="total-row">
            <span>Phí giao hàng:</span>
            <span>${shippingFee.toLocaleString('vi-VN')} đ</span>
        </div>
        ${prepaidAmount > 0 ? `
        <div class="total-row">
            <span>Trả trước (Công nợ):</span>
            <span>-${prepaidAmount.toLocaleString('vi-VN')} đ</span>
        </div>
        ` : ''}
        <div class="total-row final">
            <span>TỔNG CỘNG:</span>
            <span>${finalTotal.toLocaleString('vi-VN')} đ</span>
        </div>
    </div>

    <div class="cod-amount">
        THU HỘ (COD): ${codAmount.toLocaleString('vi-VN')} đ
    </div>

    ${deliveryNote ? `
    <div class="delivery-note">
        <strong>Ghi chú giao hàng:</strong><br>
        ${deliveryNote}
    </div>
    ` : ''}

    <div class="footer">
        <div>Cảm ơn quý khách!</div>
        <div>Mọi thắc mắc vui lòng liên hệ: ${company.Phone || '090 8888 674'}</div>
    </div>

    <!-- JsBarcode library -->
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <script>
        // Generate barcode after page loads
        document.addEventListener('DOMContentLoaded', function() {
            try {
                JsBarcode("#barcode", "${orderResult?.Number || ''}", {
                    format: "CODE128",
                    width: 1.5,
                    height: 40,
                    displayValue: false,
                    margin: 5
                });
            } catch (e) {
                console.error('Barcode generation failed:', e);
            }
        });
    </script>
</body>
</html>
        `;
    }

    /**
     * Open print popup with custom bill
     * @param {Object} orderResult - The created order result from FastSaleOrder API
     * @param {Object} options - Optional parameters
     */
    function openPrintPopup(orderResult, options = {}) {
        console.log('[BILL-SERVICE] Opening print popup with custom bill...');

        // Generate custom bill HTML
        const html = generateCustomBillHTML(orderResult, options);

        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            if (window.notificationManager) {
                window.notificationManager.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
            }
            return;
        }

        // Write the HTML content
        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for content to load, then trigger print
        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        };

        // Fallback if onload doesn't fire
        setTimeout(() => {
            if (printWindow && !printWindow.closed) {
                printWindow.focus();
                printWindow.print();
            }
        }, 1500);
    }

    /**
     * Open ONE combined print popup with multiple bills
     * @param {Array<Object>} orders - Array of enriched order objects
     * @param {Object} options - Optional parameters
     */
    function openCombinedPrintPopup(orders, options = {}) {
        console.log('[BILL-SERVICE] Opening combined print popup for', orders.length, 'bills...');

        if (!orders || orders.length === 0) {
            console.warn('[BILL-SERVICE] No orders to print');
            return;
        }

        // Generate HTML for each bill (extract body content only)
        const billBodies = orders.map((order, index) => {
            const fullHtml = generateCustomBillHTML(order, options);
            // Extract content between <body> and </body>
            const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const bodyContent = bodyMatch ? bodyMatch[1] : fullHtml;

            // Add page break after each bill except the last one
            const pageBreak = index < orders.length - 1
                ? '<div style="page-break-after: always; border-top: 2px dashed #999; margin: 20px 0; padding-top: 20px;"></div>'
                : '';

            return `<div class="bill-container" data-bill-index="${index}">${bodyContent}</div>${pageBreak}`;
        });

        // Get styles from first bill
        const firstHtml = generateCustomBillHTML(orders[0], options);
        const styleMatch = firstHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const styles = styleMatch ? styleMatch[1] : '';

        // Combine all bills into one HTML document
        const combinedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>In ${orders.length} phiếu bán hàng</title>
    <style>
        ${styles}
        .bill-container {
            margin-bottom: 20px;
        }
        @media print {
            .bill-container {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    ${billBodies.join('\n')}

    <!-- JsBarcode library -->
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <script>
        // Generate barcodes for all bills after page loads
        document.addEventListener('DOMContentLoaded', function() {
            const barcodes = document.querySelectorAll('#barcode');
            barcodes.forEach((svg, index) => {
                // Give each barcode a unique ID
                svg.id = 'barcode_' + index;
                const orderNumber = '${orders.map(o => o.Number || '').join("','")}';
                const numbers = orderNumber.split("','");
                try {
                    JsBarcode('#barcode_' + index, numbers[index] || '', {
                        format: "CODE128",
                        width: 1.5,
                        height: 40,
                        displayValue: false,
                        margin: 5
                    });
                } catch (e) {
                    console.error('Barcode generation failed for bill ' + index + ':', e);
                }
            });
        });
    </script>
</body>
</html>
        `;

        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=800,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            if (window.notificationManager) {
                window.notificationManager.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
            }
            return;
        }

        // Write the HTML content
        printWindow.document.write(combinedHtml);
        printWindow.document.close();

        // Wait for content to load, then trigger print
        let printed = false;
        printWindow.onload = function () {
            setTimeout(() => {
                if (!printed) {
                    printed = true;
                    printWindow.focus();
                    printWindow.print();
                }
            }, 800); // Longer wait for multiple barcodes
        };

        // Fallback if onload doesn't fire
        setTimeout(() => {
            if (printWindow && !printWindow.closed && !printed) {
                printed = true;
                printWindow.focus();
                printWindow.print();
            }
        }, 2000);

        console.log('[BILL-SERVICE] Combined print popup opened successfully');
    }

    /**
     * Generate bill image from HTML using html2canvas
     * @param {Object} orderResult - The created order result
     * @param {Object} options - Optional parameters
     * @returns {Promise<Blob>} - Image blob
     */
    async function generateBillImage(orderResult, options = {}) {
        console.log('[BILL-SERVICE] Generating bill image...');

        // Use the same HTML as the print bill
        const html = generateCustomBillHTML(orderResult, options);

        // Create hidden iframe to render full HTML document with styles
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 400px;
            height: 1200px;
            border: none;
        `;
        document.body.appendChild(iframe);

        // Write full HTML to iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        // Wait for scripts to load and barcode to render (JsBarcode needs time)
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            // Get the body element from iframe
            const iframeBody = iframeDoc.body;

            // Check if html2canvas is available
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            // Generate image using html2canvas
            const canvas = await html2canvas(iframeBody, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: 400,
                windowHeight: 1200
            });

            // Remove iframe
            document.body.removeChild(iframe);

            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });

            console.log('[BILL-SERVICE] Bill image generated:', blob.size, 'bytes');
            return blob;

        } catch (error) {
            document.body.removeChild(iframe);
            console.error('[BILL-SERVICE] Error generating image:', error);
            throw error;
        }
    }

    /**
     * Send bill image to customer via Messenger
     * @param {Object} orderResult - The created order result
     * @param {string} pageId - Facebook Page ID (channelId)
     * @param {string} psid - Customer's Facebook PSID
     * @param {Object} options - Optional parameters
     * @param {Object} options.currentSaleOrderData - Current sale order data for conversation lookup
     * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
     */
    async function sendBillToCustomer(orderResult, pageId, psid, options = {}) {
        console.log('[BILL-SERVICE] ========================================');
        console.log('[BILL-SERVICE] Sending bill image to customer...');
        console.log('[BILL-SERVICE] Page ID:', pageId, 'PSID:', psid);

        if (!pageId || !psid) {
            console.warn('[BILL-SERVICE] Missing pageId or psid, cannot send bill');
            return { success: false, error: 'Missing pageId or psid' };
        }

        try {
            // Step 1: Generate bill image
            console.log('[BILL-SERVICE] Step 1: Generating bill image...');
            const imageBlob = await generateBillImage(orderResult, options);

            // Convert blob to File for upload
            const imageFile = new File([imageBlob], `bill_${orderResult?.Number || Date.now()}.png`, {
                type: 'image/png'
            });

            // Step 2: Upload image to Pancake
            console.log('[BILL-SERVICE] Step 2: Uploading image to Pancake...');
            if (!window.pancakeDataManager) {
                throw new Error('PancakeDataManager not available');
            }

            const uploadResult = await window.pancakeDataManager.uploadImage(pageId, imageFile);
            const contentUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
            const contentId = typeof uploadResult === 'object' ? uploadResult.id : null;

            if (!contentUrl) {
                throw new Error('Upload failed - no content_url returned');
            }
            console.log('[BILL-SERVICE] Image uploaded:', contentUrl, 'content_id:', contentId);

            // Step 3: Send message with image via Pancake API
            console.log('[BILL-SERVICE] Step 3: Sending message with image...');

            // Get conversation ID - try multiple sources
            const currentSaleOrderData = options.currentSaleOrderData || null;
            let convId = currentSaleOrderData?.Facebook_ConversationId ||
                currentSaleOrderData?.Conversation_Id ||
                currentSaleOrderData?.ConversationId;

            // Try to get conversation from Pancake conversations map by PSID
            if (!convId && window.pancakeDataManager) {
                const pancakeConv = window.pancakeDataManager.getConversationByUserId(psid);
                if (pancakeConv && pancakeConv.id) {
                    convId = pancakeConv.id;
                    console.log('[BILL-SERVICE] Got conversation ID from Pancake map:', convId);
                }
            }

            // Fallback: construct conversationId from pageId_psid (standard Pancake format)
            if (!convId && pageId && psid) {
                convId = `${pageId}_${psid}`;
                console.log('[BILL-SERVICE] Using fallback conversation ID:', convId);
            }

            if (!convId) {
                console.warn('[BILL-SERVICE] No conversation ID found');
                return { success: false, error: 'No conversation ID available' };
            }

            // Send via Pancake API (use same method as chat modal)
            const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
            if (!pageAccessToken) {
                throw new Error('No page_access_token available. Vui lòng vào Pancake Settings → Tools để tạo token.');
            }

            const sendResponse = await fetch(
                `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${convId}/messages?page_access_token=${pageAccessToken}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        action: 'reply_inbox',
                        message: `📋 Phiếu bán hàng #${orderResult?.Number || ''}`,
                        ...(contentId ? { content_ids: [contentId], attachment_type: 'PHOTO' } : {})
                    })
                }
            );

            if (!sendResponse.ok) {
                const errorText = await sendResponse.text();
                throw new Error(`Send failed: ${sendResponse.status} - ${errorText}`);
            }

            const sendResult = await sendResponse.json();
            console.log('[BILL-SERVICE] Bill sent successfully:', sendResult);

            return { success: true, messageId: sendResult.id };

        } catch (error) {
            console.error('[BILL-SERVICE] Error sending bill:', error);
            return { success: false, error: error.message };
        }
    }

    // Public API
    return {
        generateCustomBillHTML,
        openPrintPopup,
        openCombinedPrintPopup,
        generateBillImage,
        sendBillToCustomer
    };

})();

// Expose to window for global access
window.BillService = BillService;

// Also expose individual functions for backward compatibility
window.generateCustomBillHTML = BillService.generateCustomBillHTML;
window.openPrintPopup = BillService.openPrintPopup;
window.openCombinedPrintPopup = BillService.openCombinedPrintPopup;
window.generateBillImage = BillService.generateBillImage;
window.sendBillToCustomer = BillService.sendBillToCustomer;

console.log('[BILL-SERVICE] Bill Service loaded successfully');
