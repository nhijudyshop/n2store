// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Bill Service - Custom bill generation, printing and sending
 * Extracted from tab1-orders.js for better code organization
 */

/**
 * Bill Service Module
 */
const BillService = (function () {
    /**
     * Get merged STT display string for an order.
     * Returns "84 + 313" if order is a merge target, else single STT or empty string.
     * Priority:
     *   1) TPOS Tags "Gộp X Y" / "GỘP X Y"
     *   2) order.IsMerged + order.OriginalOrders[].SessionIndex
     *   3) TAG XL custom flag id GOP_<sttList> (ProcessingTagState)
     *   4) Fallback: order.SessionIndex
     * @param {Object} order - Order object (may have Tags, IsMerged, OriginalOrders, Code, Id, SessionIndex)
     * @param {Object} [orderResult] - Optional secondary source for Tags/Code/Id/SessionIndex
     * @returns {string} STT display value (e.g., "84 + 313" or "313" or "")
     */
    function getMergedSttDisplay(order, orderResult) {
        const src = order || orderResult || {};
        const fallback = orderResult || {};
        // 1) TPOS Tags
        let orderTags = [];
        try {
            const tagsRaw = src.Tags || fallback.Tags;
            if (tagsRaw) {
                orderTags = typeof tagsRaw === 'string' ? JSON.parse(tagsRaw) : tagsRaw;
                if (!Array.isArray(orderTags)) orderTags = [];
            }
        } catch (e) {
            orderTags = [];
        }
        const mergeTag = orderTags.find((t) => {
            const n = (t.Name || '').trim();
            return (
                n.toLowerCase().startsWith('gộp ') ||
                n.startsWith('Gộp ') ||
                n.startsWith('GỘP ')
            );
        });
        if (mergeTag) {
            const nums = mergeTag.Name.match(/\d+/g);
            if (nums && nums.length > 1) return nums.sort((a, b) => +a - +b).join(' + ');
        }
        // 2) IsMerged + OriginalOrders
        if (src.IsMerged && Array.isArray(src.OriginalOrders) && src.OriginalOrders.length > 1) {
            const sttList = src.OriginalOrders.map((o) => o.SessionIndex)
                .filter((s) => s)
                .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
            if (sttList.length > 1) return sttList.join(' + ');
        }
        // 3) TAG XL custom flag
        if (window.ProcessingTagState) {
            const code = src.Code || fallback.Code;
            const id = src.Id || fallback.Id;
            const xlData =
                (code && window.ProcessingTagState.getOrderData(String(code))) ||
                (id && window.ProcessingTagState.getOrderDataByIdFallback(String(id))) ||
                null;
            const xlFlags = xlData?.flags || [];
            const xlMergeFlag = xlFlags.find((f) => {
                const fId = typeof f === 'string' ? f : f?.id;
                return typeof fId === 'string' && /^GOP_\d+(_\d+)+$/.test(fId);
            });
            if (xlMergeFlag) {
                const fId = typeof xlMergeFlag === 'string' ? xlMergeFlag : xlMergeFlag.id;
                const nums = fId.match(/\d+/g);
                if (nums && nums.length > 1) return nums.sort((a, b) => +a - +b).join(' + ');
            }
        }
        // 4) Single STT fallback
        return String(src.SessionIndex || fallback.SessionIndex || '');
    }

    /**
     * Generate bill HTML from order data (EXACT TPOS template copy)
     *
     * This is a fallback bill template that matches TPOS bill format EXACTLY.
     * Used when TPOS API is unavailable or fails.
     * CSS and HTML structure copied directly from TPOS API response.
     *
     * ===== TEMPLATE VARIABLES =====
     * These variables are extracted from orderResult and can be customized:
     *
     * SHOP INFO:
     *   - shopName: Shop name (default: "NJD Live")
     *
     * ORDER INFO:
     *   - billNumber: orderResult.Number - Bill number (e.g., "NJD/2026/49318")
     *   - dateStr: Bill date formatted as "DD/MM/YYYY HH:mm"
     *   - carrierName: Delivery carrier name
     *   - sttDisplay: Session index / STT number
     *
     * CUSTOMER INFO:
     *   - receiverName: Customer name (Partner.Name, PartnerDisplayName, ReceiverName)
     *   - receiverPhone: Customer phone (Partner.Phone, Ship_Receiver.Phone, ReceiverPhone)
     *   - receiverAddress: Customer address (Partner.Street, Ship_Receiver.Street, ReceiverAddress)
     *   - sellerName: Seller name (from authManager or orderResult.User.Name)
     *
     * PRODUCTS (from orderLines array):
     *   - ProductName / ProductNameGet: Product name
     *   - Quantity / ProductUOMQty: Quantity
     *   - PriceUnit / Price: Unit price
     *   - ProductUOMName: Unit name (default "Cái")
     *   - Note: Product note (optional, displayed in italics)
     *
     * TOTALS:
     *   - totalQuantity: Sum of all quantities
     *   - totalAmount: Sum of all product prices (before shipping/discount)
     *   - shippingFee: Shipping fee (DeliveryPrice)
     *   - discount: Discount amount (DecreaseAmount)
     *   - prepaidAmount: Prepaid/deposit amount (AmountDeposit, PaymentAmount)
     *   - finalTotal: totalAmount - discount + shippingFee
     *   - codAmount: Amount to collect on delivery (còn lại)
     *
     * NOTES:
     *   - deliveryNote: Delivery note (DeliveryNote field)
     *   - comment: General comment (Comment field)
     *
     * @param {Object} orderResult - The created order result from FastSaleOrder API
     * @param {Object} options - Optional parameters
     * @param {Object} options.currentSaleOrderData - Current sale order data (from saleButtonModal)
     * @returns {string} HTML content for the bill (EXACT TPOS format)
     */
    function generateCustomBillHTML(orderResult, options = {}) {
        // Support both saleButtonModal (uses currentSaleOrderData) and FastSale (uses orderResult directly)
        const currentSaleOrderData = options.currentSaleOrderData || null;
        const order = currentSaleOrderData || orderResult;
        const defaultData = window.lastDefaultSaleData || {};
        const company = defaultData.Company || { Name: 'NJD Live' };

        // ========== EXTRACT VARIABLES ==========

        // Shop info
        const shopName = company.Name || 'NJD Live';

        // Only read form fields if saleButtonModal is currently visible (single order flow)
        // This prevents batch flow from using stale form data from previous single order
        const saleModal = document.getElementById('saleButtonModal');
        const isModalVisible =
            saleModal && saleModal.style.display !== 'none' && saleModal.style.display !== '';

        // Customer info - only use form fields when modal is visible
        const receiverName =
            (isModalVisible && document.getElementById('saleReceiverName')?.value) ||
            orderResult?.Partner?.Name ||
            orderResult?.PartnerDisplayName ||
            orderResult?.ReceiverName ||
            '';
        const receiverPhone =
            (isModalVisible && document.getElementById('saleReceiverPhone')?.value) ||
            orderResult?.Partner?.Phone ||
            orderResult?.Ship_Receiver?.Phone ||
            orderResult?.ReceiverPhone ||
            '';
        const receiverAddress =
            (isModalVisible && document.getElementById('saleReceiverAddress')?.value) ||
            orderResult?.Partner?.Street ||
            orderResult?.Ship_Receiver?.Street ||
            orderResult?.ReceiverAddress ||
            '';

        // Money values
        const shippingFee =
            (isModalVisible && parseFloat(document.getElementById('saleShippingFee')?.value)) ||
            orderResult?.DeliveryPrice ||
            0;
        const discount =
            (isModalVisible && parseFloat(document.getElementById('saleDiscount')?.value)) ||
            orderResult?.Discount ||
            orderResult?.DiscountAmount ||
            orderResult?.DecreaseAmount ||
            0;

        // Wallet balance for offline calculation
        // Priority: 1) options.walletBalance (passed explicitly, e.g. from confirmAndPrintSale)
        //           2) form field salePrepaidAmount (when modal visible)
        //           3) orderResult.PaymentAmount (fallback)
        const walletBalance =
            options.walletBalance ||
            (isModalVisible && parseFloat(document.getElementById('salePrepaidAmount')?.value)) ||
            orderResult?.PaymentAmount ||
            0;

        // Virtual debt flag - true when order uses công nợ ảo from return ticket
        const hasVirtualDebt = options.hasVirtualDebt || orderResult?.hasVirtualDebt || false;

        // ========== PARSE TAGS (for STT merge display) ==========
        let orderTags = [];
        try {
            const tagsRaw = order?.Tags || orderResult?.Tags;
            if (tagsRaw) {
                orderTags = typeof tagsRaw === 'string' ? JSON.parse(tagsRaw) : tagsRaw;
                if (!Array.isArray(orderTags)) orderTags = [];
            }
        } catch (e) {
            orderTags = [];
        }

        // STT merge display — covers TPOS Tags, IsMerged, and TAG XL custom flag GOP_*
        const sttDisplayMerged = getMergedSttDisplay(order, orderResult);

        // Order comment - get from form or data (pre-filled by fast sale modal)
        const orderComment =
            (isModalVisible && document.getElementById('saleReceiverNote')?.value) ||
            orderResult?.Comment ||
            order?.Comment ||
            '';

        // Shop-wide delivery note (hotline warning + return policy)
        // This comes from shop settings or default
        let shopDeliveryNote =
            defaultData?.DeliveryNote ||
            orderResult?.DeliveryNote ||
            'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CŨA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ\n\nSản phẩm nhận đổi trả trong vòng 2-4 ngày kể từ ngày nhận hàng, "ĐỐI VỚI SẢN PHẨM BỊ LỖI HOẶC SẢN PHẨM SHOP GIAO SAI" quá thời gian shop không nhận xử lý đổi trả bất kì trường hợp nào.';

        // Nếu ghi chú có "Thu về" thì thêm "Thu về" vào cuối ghi chú giao hàng
        if (/thu\s*về/i.test(orderComment)) {
            shopDeliveryNote = shopDeliveryNote.trimEnd() + ' Thu về';
        }

        // Shop-wide comment (bank account info)
        // This comes from shop settings or default
        const shopComment = defaultData?.Comment || 'STK ngân hàng Lại Thụy Yến Nhi\n75918 (ACB)';

        // Carrier info
        const carrierSelect = isModalVisible
            ? document.getElementById('saleDeliveryPartner')
            : null;
        const carrierFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
        const isValidDropdownCarrier =
            carrierFromDropdown && !carrierFromDropdown.includes('Đang tải');
        const carrierName =
            orderResult?.CarrierName ||
            orderResult?.Carrier?.Name ||
            (isValidDropdownCarrier ? carrierFromDropdown : '') ||
            '';

        // Seller name
        const sellerName =
            window.authManager?.currentUser?.displayName ||
            defaultData.User?.Name ||
            orderResult?.User?.Name ||
            orderResult?.UserName ||
            '';

        // STT (Session Index) - merge-aware via getMergedSttDisplay()
        const sttDisplay = sttDisplayMerged;

        // Bill number and date (data should already be complete from InvoiceStatusStore)
        const billNumber = orderResult?.Number || '';

        // Use DateInvoice or timestamp from stored data if available, otherwise use current time
        const billDate = orderResult?.DateInvoice
            ? new Date(orderResult.DateInvoice)
            : orderResult?.timestamp
              ? new Date(orderResult.timestamp)
              : new Date();
        const dateStr = `${String(billDate.getDate()).padStart(2, '0')}/${String(billDate.getMonth() + 1).padStart(2, '0')}/${billDate.getFullYear()} ${String(billDate.getHours()).padStart(2, '0')}:${String(billDate.getMinutes()).padStart(2, '0')}`;

        // Barcode URL (TPOS CDN - exact format from TPOS)
        const barcodeUrl = billNumber
            ? `https://statics.tpos.vn/Web/Barcode?type=Code 128&value=${encodeURIComponent(billNumber)}&width=600&height=100`
            : '';

        // ========== GENERATE PRODUCT ROWS ==========
        const orderLines =
            order?.orderLines || orderResult?.OrderLines || orderResult?.orderLines || [];

        let totalQuantity = 0;
        let totalAmount = 0;

        const productsHTML = orderLines
            .map((item) => {
                const quantity = item.Quantity || item.ProductUOMQty || 1;
                const price = item.PriceUnit || item.Price || 0;
                const total = quantity * price;
                const productName = item.ProductName || item.ProductNameGet || '';
                const warehouseSTT = window.WebWarehouseCache
                    ? window.WebWarehouseCache.getSTT(item)
                    : 0;
                const displayName = `${warehouseSTT} - ${productName}`;
                const uomName = item.ProductUOMName || 'Cái';
                const note = item.Note || '';

                totalQuantity += quantity;
                totalAmount += total;

                // EXACT TPOS format: product name row + quantity/price row
                return `                        <tr>
                            <td class="PaddingProduct word-break" colspan="3" style="border-bottom:none">
                                    <label>
                                        ${displayName}${note ? ` <span style="font-weight:bold">(${note})</span>` : ''}

                                                                            </label>


                            </td>
                        </tr>
                        <tr class="">
                            <td class="text-center numberPadding">
                                ${quantity}
${uomName}                            </td>
                            <td class="text-right numberPadding">
                                ${price.toLocaleString('vi-VN')}
                            </td>
                            <td class="text-right numberPadding">
                                ${total.toLocaleString('vi-VN')}
                            </td>
                        </tr>`;
            })
            .join('\n');

        // ========== CALCULATE TOTALS ==========
        // Offline calculation - same logic as TPOS
        const safeShippingFee = Number(shippingFee) || 0;
        const safeDiscount = Number(discount) || 0;
        const safeTotalAmount = Number(totalAmount) || 0;
        const safeWalletBalance = Number(walletBalance) || 0;

        // finalTotal = tổng sản phẩm - giảm giá + ship
        const finalTotal = safeTotalAmount - safeDiscount + safeShippingFee;

        // Trả trước = min(số dư ví, tổng tiền) - giống TPOS
        const safePrepaidAmount = Math.min(safeWalletBalance, finalTotal);

        // Còn lại = tổng tiền - trả trước
        const codAmount = Math.max(0, finalTotal - safePrepaidAmount);

        // ========== EXACT TPOS HTML TEMPLATE ==========
        // CSS and structure copied directly from TPOS API response (html_bill.txt)
        return `

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Phiếu bán hàng - TPOS.VN</title>
    <style>
        @page {
            margin: 1mm  0;
        }
        html, body {
            width: 80mm;
            margin: auto;
            color: #000 !important;
            font-size:  13px;
            font-family: Arial, Helvetica, sans-serif;
            line-height:1.2
        }
        /*---*/
        html {
            font-family: Arial, Helvetica, sans-serif;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .word-break {
            word-break: break-word;
        }

        *, *:before, *:after {
            -webkit-box-sizing: border-box;
            -moz-box-sizing: border-box;
            box-sizing: border-box;
        }

        .container {
            padding-right: 10px;
            padding-left: 10px;
            margin-right: auto;
            margin-left: auto;
        }

        .row {
            margin: 0 !important;
        }

        .form-horizontal .form-group {
            margin-right: -15px;
            margin-left: -15px;
        }

            .form-horizontal .form-group:before, .form-horizontal .form-group:after {
                display: table;
                content: " ";
            }

        .text-center {
            text-align: center;
        }

        .text-left {
            text-align: left;
        }

        .text-right {
            text-align: right;
        }

        .text-muted {
            color: black;
        }

        .hidden {
            display: none !important;
            visibility: hidden !important;
        }
        label {
            display: inline-block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        code {
            padding: 2px 4px;
            font-size: 90%;
            color: black;
            font-weight: 500;
            border-radius: 4px;
        }

        h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6 {
            font-family: "Helvetica Neue",Helvetica,Arial,sans-serif;
            font-weight: 500;
            line-height: 1.1;
        }

        h3 {
            display: block;
            font-size: 1.17em;
            margin-block-start: 1em;
            margin-block-end: 1em;
            margin-inline-start: 0px;
            margin-inline-end: 0px;
            font-weight: bold;
        }

        table {
            max-width: 100%;
            background-color: transparent;
        }

        table {
            border-collapse: collapse;
            border-spacing: 0;
        }

        .table {
            width: 100%;
            margin-bottom: 10px;
        }
        .img-responsive {
            display: block;
            height: auto;
            max-width: 100%;
        }

        img {
            vertical-align: middle;
        }

        img {
            border: 0;
        }

        .image_header img {
            margin-left: auto;
            margin-right: auto;
            width: 100%;
        }
        /*---*/
        .size-18 {
            font-size: 18px;
        }

        .size-20 {
            font-size: 20px;
        }
        .size-16 {
            font-size: 16px;
        }
        .size-12 {
            font-size: 12px;
        }
        .size-13 {
            font-size: 13px;
        }
        .size-18pt {
            font-size: 18pt;
        }
        .size-15pt {
            font-size: 15pt;
        }
        .size-14pt {
            font-size: 14pt;
        }
        .size-11pt {
            font-size: 11pt;
        }
        .size-trackingRef {
            font-size: 1.2em;
        }

        .inline-cs > div {
            display: inline-block !important;
            vertical-align: middle !important;
        }

        .table-custom > thead > tr > th {
            vertical-align: middle !important;
            text-align: center;
        }

        .table-custom > tbody > tr > td {
            vertical-align: middle !important;
        }

        .table.print-header, .table.print-header td, .table.print-header th {
            border: none !important;
            padding: 0 !important;
        }

            .table.print-header th {
                font-weight: 500;
            }

            .table.print-header h1 {
                font-size: 28px;
            }

        h3 {
            font-size: 15px !important;
        }

        .table .table-heading {
            text-transform: uppercase;
        }

        .dataBody {
            margin-top: 0;
        }

        .price_text {
            display: inline-block;
        }

            .price_text:first-letter {
                text-transform: uppercase;
            }

        .table tbody > tr > td.numberPadding {
            padding-top: 0px;
            padding-bottom: 2px;
            border-top: none !important;
        }

        .table tbody > tr > td.PaddingProduct {
            padding-top: 2px;
            padding-bottom: 2px;
            border-bottom: none !important;
        }

        .table tbody > tr > td {
            padding: 1px;
        }

        .table tfoot > tr > td {
            padding: 1px;
        }

        .table thead > tr > th {
            padding: 1px;
        }

        .table thead > tr > th {
            border-top: 2px solid #ddd !important
        }

        .table tfoot > tr > td {
            font-weight: bold !important;
        }

        .oe_page {
            page-break-after: always;
        }

        .form-control-static {
            padding-top: 0;
            padding-bottom: 0;
            margin:0;
        }

        .pre-wrap {
            white-space: pre-wrap !important;
        }

        .footer-cs {
            margin-bottom: 0 !important;
        }

        .column20 {
            float: left;
            width: 20%;
        }

        .column80 {
            float: left;
            width: 80%;
            padding-left: 10px;
        }

        /*.image_header {
            margin-top: -15px;
        }*/

        .image_header img {
            width: 100%;
        }
        /* Clear floats after the columns */
        .row {
            margin: 0 !important;
        }

            .row:after {
                content: "";
                display: table;
                clear: both;
            }

        table tbody.border-none > tr > td {
            border: none;
        }

        .border-top {
            border-top: 1px solid black !important;
        }

        .border-bottom {
            border-bottom: 1px solid black !important;
        }
        /*.table-cs >th > tr {
            border-top: 1px solid black !important;
            border-bottom: 1px solid black !important;
        }*/
        .table-cs > tbody > tr > td, .table-cs > thead > tr > th {
            border-top: 1px solid gray !important;
            border-bottom: 1px solid gray !important;
        }

        .table-cs > tfoot > tr > td {
            border: none !important
        }

        .logo-center img {
            margin-left: auto;
            margin-right: auto;
            max-width: 180px !important;
            max-height: 180px !important;
        }

        hr.dash-cs {
            margin-top: 5px;
            margin-bottom: 5px;
            border-top: 1px dashed black;
        }

        .bottom_0 {
            margin-bottom: 0;
        }

        .bottom-size {
            font-size: 16pt !important;
        }

        .ship-font {
            font-size:  14px;
        }

        .font-ship-bexinh {
            font-size: 14px;
        }
        /*.pos .pos-receipt-container {
            text-align: center;
        }*/
        /*.receipt-total, receipt-paymentlines, receipt-change {
            width: 100%
        }*/
        table {
            width: 100%;
        }

        .pos .pos-sale-ticket {
            text-align: left;
            background-color: white;
            font-size: 13px;
            /*display: inline-block;*/
            /*font-family: "Inconsolata";*/
            /*border: solid 1px rgb(220, 220, 220);*/
            border-radius: 3px;
            overflow: hidden;
        }

        .pos .pos-center-align {
            text-align: center;
        }

        .pos .pos-right-align {
            text-align: right;
        }

        .pos .pos-sale-ticket h3 {
            margin-top: 10px;
            margin-bottom: 5px;
            font-size: 20px;
        }

        .pos .pos-sale-ticket p {
            margin-bottom: 5px;
        }

        table.receipt-orderlines > tbody > tr.border-top {
            border-top: 1px solid #ccc !important;
        }

        table.receipt-orderlines > tbody > tr.border-bottom {
            border-bottom: 1px solid #ccc !important;
        }

        .pos .pos-sale-ticket table {
            width: 100%;
            border: 0;
            table-layout: auto;
        }
            .pos .pos-sale-ticket table tr th,
            .pos .pos-sale-ticket table tr td {
                padding-right: 2px;
            }

            .pos .pos-sale-ticket table td {
                border: 0;
                word-wrap: break-word;
            }

            .pos .pos-sale-ticket table.receipt-orderlines tr td.product-name {
                /*border-top: 1px dashed #333;*/
            }

        .pos .pos-disc-font {
            font-size: 12px;
            font-style: italic;
            color: #808080;
        }

        .pos .pos-sale-ticket .emph {
            font-size: 14px;
            margin: 5px;
        }

        .pos .pos-sale-ticket hr {
            margin-top: 5px;
            margin-bottom: 5px;
            border: 0;
            border-top: 1px dashed #333;
        }

        .text-uppercase {
            text-transform: uppercase;
        }

        .content-thuchi {
            margin-top: 15px;
        }

            .content-thuchi div {
                margin-bottom: 10px;
            }
        .ship-group .form-group{
        margin-bottom: 5px
        }

         .flex-ship {
            display: flex;
            flex-flow: column;
            width: 100%;
            height: 50mm;

            margin-left: 0;
            margin-right: 0;
            font-size:12px;
        }

         .flex-ship-80 {
            display: flex;
            flex-flow: column;
            width: 100%;
            height: 78mm;

            margin-left: 0;
            margin-right: 0;
            font-size: 11px !important;
            border: 1px solid;
        }
         .flex-ship-80x35 {
            display: flex;
            flex-flow: column;
            width: 100%;
            height: 34mm;

            margin-left: 0;
            margin-right: 0;
            font-size: 11px !important;
        }
        .ship-top {
            flex: 1;
        }

        .ship-mid {
            flex: 1;
            text-align: center;
            align-items: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .ship-bottom {
            font-size:  12px;
            flex: 1;
            display: flex;
            align-items: flex-end;
        }
       .ship-bottom .form-group, .ship-top .form-group  {
        margin-bottom: 0 !important;
        }

        .border-bottom{
        border-bottom: 1px solid;
        }
        .container {
            padding-right: 10px;
            padding-left: 10px;
            margin-right: auto;
            margin-left: auto;
        }
      .col-xs-1, .col-xs-2, .col-xs-3, .col-xs-4, .col-xs-5, .col-xs-6, .col-xs-7, .col-xs-8, .col-xs-9, .col-xs-10, .col-xs-11, .col-xs-12, .col-sm-1, .col-sm-2, .col-sm-3, .col-sm-4, .col-sm-5, .col-sm-6, .col-sm-7, .col-sm-8, .col-sm-9, .col-sm-10, .col-sm-11, .col-sm-12, .col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12, .col-lg-1, .col-lg-2, .col-lg-3, .col-lg-4, .col-lg-5, .col-lg-6, .col-lg-7, .col-lg-8, .col-lg-9, .col-lg-10, .col-lg-11, .col-lg-12 {
    position: relative;
    min-height: 1px;
    padding-right: 5px;
    padding-left: 5px;
        }
        .font-bold {
            font-weight: bold;
        }
    .text-clamp {
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2; /* number of lines to show */
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    strong {
        font-weight: bold !important;
    }

        .page-break {
            display: block;
            height: 0;
            page-break-before: always;
        }
    </style>
</head>
<body>
    <div class="container body-content">



    <div class="hidden">0</div>
    <div>
        <div class='row'>
                    <div class='text-center'>
                        <span style='font-size:16px; font-weight:bold'>${shopName}</span>
                    </div>
                    <div class='text-center'>
                        <strong><span style='white-space:pre-wrap; word-break:break-word'></span></strong>
                    </div>
                    </div>
        <table class="table print-header table-bordered">
            <thead>
                <tr>
                    <th class="text-center">
                                                                                                <div class='text-center'>
${carrierName ? `<span>${carrierName}</span><br/>` : ''}
${hasVirtualDebt ? `<span style="font-weight:bold; color:#c00;">** CÓ ĐƠN THU VỀ **</span><br/>` : ''}
<p class='size-16 font-bold'>Tiền thu hộ: ${codAmount.toLocaleString('vi-VN')}</p>
</div>
                        <hr class="b-b dash-cs" />
                    </th>

                </tr>
                <tr>
                    <th class="text-center">
                        <h3 style="text-transform:uppercase">Phiếu bán hàng</h3>

                    </th>
                </tr>
                <tr>
                    <th>
                        <div class='text-center'>
                    ${
                        barcodeUrl
                            ? `<div>
                        <img src='${barcodeUrl}' style='width:95%' onerror="this.style.display='none'" />
                    </div>`
                            : ''
                    }
                <strong>Số phiếu</strong>: ${billNumber}
                <div>
                    <strong>Ngày</strong>: ${dateStr}
                </div>
                <hr class='b-b dash-cs' />
                </div>
                    </th>
                </tr>
                <tr>
                    <th class="text-left">
                            <div>
                                <strong>Khách hàng:</strong> ${receiverName}
                            </div>
                                                                            ${
                                                                                receiverAddress
                                                                                    ? `<div>
                                <strong>Địa chỉ:</strong> ${receiverAddress}
                            </div>`
                                                                                    : ''
                                                                            }
                                                                            <div style="float:right">
                            </div>
                            <div>
                                <strong>Điện thoại:</strong> ${receiverPhone}
                            </div>
                                                    ${
                                                        sellerName
                                                            ? `<div>
                                <strong>Người bán:</strong> ${sellerName}
                            </div>`
                                                            : ''
                                                    }
${
    sttDisplay
        ? `                            <div>
                                <strong>STT:</strong> ${sttDisplay}
                            </div>`
        : ''
}
                                                                                            </th>

                </tr>
            </thead>
        </table>

            <table class="table table-cs ">
                <thead>
                    <tr>
                        <th width="80">Sản phẩm</th>
                        <th class="text-right" width="80">Giá</th>
                        <th class="text-right" width="80">Tổng</th>
                    </tr>
                </thead>
                <tbody>
${productsHTML}
                </tbody>
                <tfoot style="display: table-row-group !important;" class="word-break">
                    <tr>
                        <td colspan="1">
                            <strong>Tổng:</strong>
                        </td>
                         <td>
                            <strong>SL: ${totalQuantity}</strong>
                        </td>
                        <td class="text-right"><strong>${totalAmount.toLocaleString('vi-VN')}</strong> </td>
                    </tr>
                                    ${
                                        discount > 0
                                            ? `
                        <tr>
                            <td colspan="2" class="text-right" style="border-right: none !important">
                                <strong>Giảm giá :</strong>
                            </td>
                             <td style="border-left:none !important" class="text-right">${safeDiscount.toLocaleString('vi-VN')}</td>
                        </tr>`
                                            : ''
                                    }


                        <tr>
                            <td colspan="2" class="text-right" style="border-right: none !important">
                                <strong>Tiền ship :</strong>
                            </td>
                             <td style="border-left:none !important" class="text-right">${safeShippingFee.toLocaleString('vi-VN')}</td>
                        </tr>



                        <tr>
                            <td colspan="2" class="text-right">
                                <strong>Tổng tiền :</strong>
                            </td>
                            <td class="text-right">${finalTotal.toLocaleString('vi-VN')}</td>
                        </tr>
${
    safePrepaidAmount > 0
        ? `
                        <tr>
                            <td colspan="2" class="text-right" style="border-right: none !important">
                                <strong>Trả trước :</strong>
                            </td>
                            <td style="border-left:none !important" class="text-right">${safePrepaidAmount.toLocaleString('vi-VN')}</td>
                        </tr>
                        <tr>
                            <td colspan="2" class="text-right">
                                <strong>Còn lại :</strong>
                            </td>
                            <td class="text-right">${codAmount.toLocaleString('vi-VN')}</td>
                        </tr>
`
        : ''
}
                                    </tfoot>
            </table>
${
    orderComment
        ? `
            <div style="word-wrap:break-word">
                <strong>Ghi chú :</strong> ${orderComment}
            </div>
`
        : ''
}
            <div style="word-wrap:break-word">
                <strong>Ghi chú giao hàng :</strong> <span style="white-space:pre-wrap; word-break: break-word;">${shopDeliveryNote}</span>
            </div>
            <div style="word-wrap:break-word">
                <strong>Ghi chú:</strong>
                <p class="form-control-static">
                    ${shopComment.replace(/\n/g, '<br />')}
                </p>
            </div>
        </div>
    </div>
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
        // Generate custom bill HTML
        const html = generateCustomBillHTML(orderResult, options);

        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            if (window.notificationManager) {
                window.notificationManager.warning(
                    'Không thể mở cửa sổ in. Vui lòng cho phép popup.'
                );
            }
            return;
        }

        // Write the HTML content
        printWindow.document.write(html);
        printWindow.document.close();

        // Use flag to prevent double print (matches openPrintPopupWithHtml pattern)
        let printed = false;
        const triggerPrint = () => {
            if (printed || !printWindow || printWindow.closed) return;
            printed = true;
            printWindow.focus();
            printWindow.print();
        };

        // Auto-close popup window after printing/cancelling
        printWindow.onafterprint = () => {
            printWindow.close();
        };

        // Wait for content to load, then trigger print
        printWindow.onload = function () {
            setTimeout(triggerPrint, 500);
        };

        // Fallback if onload doesn't fire
        setTimeout(triggerPrint, 1500);
    }

    /**
     * Open ONE combined print popup with multiple bills
     * @param {Array<Object>} orders - Array of enriched order objects
     * @param {Object} options - Optional parameters
     */
    function openCombinedPrintPopup(orders, options = {}) {
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
            const pageBreak =
                index < orders.length - 1
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
                const orderNumber = '${orders.map((o) => o.Number || '').join("','")}';
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
                window.notificationManager.warning(
                    'Không thể mở cửa sổ in. Vui lòng cho phép popup.'
                );
            }
            return;
        }

        // Write the HTML content
        printWindow.document.write(combinedHtml);
        printWindow.document.close();

        // Wait for content to load, then trigger print
        let printed = false;
        const triggerPrint = () => {
            if (printed || !printWindow || printWindow.closed) return;
            printed = true;
            printWindow.focus();
            printWindow.print();
        };

        // Auto-close popup window after printing/cancelling
        printWindow.onafterprint = () => {
            printWindow.close();
        };

        printWindow.onload = function () {
            setTimeout(triggerPrint, 800); // Longer wait for multiple barcodes
        };

        // Fallback if onload doesn't fire
        setTimeout(triggerPrint, 2000);
    }

    /**
     * Generate bill image from HTML using html2canvas
     * @param {Object} orderResult - The created order result
     * @param {Object} options - Optional parameters
     * @returns {Promise<Blob>} - Image blob
     */
    async function generateBillImage(orderResult, options = {}) {
        // Use pre-generated HTML if provided (e.g., TPOS bill), otherwise fall back to custom bill
        const html = options.billHtml || generateCustomBillHTML(orderResult, options);

        // Create hidden iframe to render full HTML document with styles
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 400px;
            height: auto;
            border: none;
        `;
        document.body.appendChild(iframe);

        // Write full HTML to iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        // Wait for scripts to load and barcode to render (JsBarcode needs time)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        try {
            // Get the body element from iframe
            const iframeBody = iframeDoc.body;

            // Get actual content height (add small padding)
            const contentHeight = iframeBody.scrollHeight + 20;

            // Check if html2canvas is available
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            // Generate image using html2canvas with dynamic height
            const canvas = await html2canvas(iframeBody, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: 400,
                windowHeight: contentHeight,
                height: contentHeight,
            });

            // Remove iframe
            document.body.removeChild(iframe);

            // Convert to blob — use JPEG with progressive quality reduction to stay under 500KB
            const MAX_SIZE = 480 * 1024; // 480KB (buffer for 500KB limit)
            let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));

            if (blob.size > MAX_SIZE) {
                // Try lower quality
                blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.65));
            }
            if (blob.size > MAX_SIZE) {
                // Try even lower + scale down canvas
                const smallCanvas = document.createElement('canvas');
                const ratio = 0.7;
                smallCanvas.width = Math.round(canvas.width * ratio);
                smallCanvas.height = Math.round(canvas.height * ratio);
                const ctx = smallCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
                blob = await new Promise((resolve) =>
                    smallCanvas.toBlob(resolve, 'image/jpeg', 0.6)
                );
            }

            console.log(`[BILL-SERVICE] Image size: ${(blob.size / 1024).toFixed(0)}KB`);
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
     * @param {string} options.preGeneratedContentUrl - Pre-uploaded image URL (skip generation & upload if provided)
     * @param {string} options.preGeneratedContentId - Pre-uploaded content ID
     * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
     */
    async function sendBillToCustomer(orderResult, pageId, psid, options = {}) {
        if (!pageId || !psid) {
            console.warn('[BILL-SERVICE] Missing pageId or psid, cannot send bill');
            return { success: false, error: 'Missing pageId or psid' };
        }

        try {
            let contentId = options.preGeneratedContentId || null;
            let billImageFile = null; // Keep for extension fallback

            // Use pre-generated content if available, otherwise generate and upload
            if (contentId) {
                // Use pre-generated content_id
            } else {
                // Generate bill image (reuse pre-generated blob if available)
                const imageBlob =
                    options.preGeneratedBlob || (await generateBillImage(orderResult, options));

                // Convert blob to File for upload
                const isJpeg = imageBlob.type === 'image/jpeg';
                billImageFile = new File(
                    [imageBlob],
                    `bill_${orderResult?.Number || Date.now()}.${isJpeg ? 'jpg' : 'png'}`,
                    {
                        type: imageBlob.type || 'image/jpeg',
                    }
                );
                const imageFile = billImageFile;

                // Step 2: Upload image to Pancake
                if (!window.pancakeDataManager) {
                    throw new Error('PancakeDataManager not available');
                }

                const uploadResult = await window.pancakeDataManager.uploadImage(pageId, imageFile);

                // Pancake upload_contents API returns: { id, type/attachment_type, success }
                // The "id" IS the content_id to use in content_ids[] when sending messages
                // There is NO content_url — message and content_ids are mutually exclusive
                if (typeof uploadResult === 'object' && uploadResult.success) {
                    contentId = uploadResult.id || uploadResult.content_id;
                } else if (typeof uploadResult === 'string') {
                    contentId = uploadResult;
                }

                if (!contentId) {
                    throw new Error(
                        'Upload failed - no content id returned: ' + JSON.stringify(uploadResult)
                    );
                }
            }

            // Step 3: Send message with image via Pancake API

            // Use pre-supplied conversationId if available (from chat modal)
            let convId = options.conversationId || null;

            // Otherwise lookup conversation by customer fb_id
            if (!convId && window.pancakeDataManager) {
                try {
                    const result = await window.pancakeDataManager.fetchConversationsByCustomerFbId(
                        pageId,
                        psid
                    );

                    if (result.conversations?.length > 0) {
                        const inboxConversations = result.conversations.filter(
                            (conv) => conv.type === 'INBOX'
                        );
                        convId =
                            inboxConversations.length > 0
                                ? inboxConversations[0].id
                                : result.conversations[0].id;
                    } else {
                        console.warn('[BILL-SERVICE] No conversations found for customer');
                    }
                } catch (fetchError) {
                    console.error(
                        '[BILL-SERVICE] Error fetching conversation:',
                        fetchError.message
                    );
                }
            }

            // If no conversation found, try extension bypass as fallback
            if (!convId) {
                if (
                    billImageFile &&
                    window.pancakeExtension?.connected &&
                    window.sendImagesViaExtension
                ) {
                    console.log('[BILL-SERVICE] No conversation — trying extension bypass');
                    try {
                        await window.sendImagesViaExtension(pageId, psid, [billImageFile]);
                        return { success: true, method: 'extension' };
                    } catch (extErr) {
                        console.error('[BILL-SERVICE] Extension fallback failed:', extErr.message);
                    }
                }
                return {
                    success: false,
                    error: 'Không tìm thấy conversation. Khách hàng chưa có tin nhắn với page này.',
                };
            }

            // Build JSON payload - send image via content_ids (Official API docs §3.3)
            const billPayload = {
                action: 'reply_inbox',
                content_ids: contentId ? [contentId] : [],
            };

            // Send via Official API v1 (page_access_token) with JSON.
            // Auto-refresh PAT and retry once if Pancake reports token was renewed
            // (response: {success:false, message:'access_token renewed ...'}).
            const _postBill = async (patToken) => {
                const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${pageId}/conversations/${convId}/messages`,
                    patToken
                );
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(billPayload),
                });
                if (!resp.ok) {
                    const errorText = await resp.text();
                    throw new Error(`Send failed: ${resp.status} - ${errorText}`);
                }
                return resp.json();
            };

            let pageAccessToken =
                await window.pancakeTokenManager?.getOrGeneratePageAccessToken(pageId);
            if (!pageAccessToken) {
                throw new Error(
                    'No page_access_token available. Vui lòng kiểm tra cài đặt Pancake.'
                );
            }

            let sendResult = await _postBill(pageAccessToken);

            // Detect "access_token renewed" → refresh PAT and retry once
            const isRenewedMsg = (m) => typeof m === 'string' && /access_token\s+renewed/i.test(m);
            if (sendResult.success === false && isRenewedMsg(sendResult.message)) {
                console.warn(
                    '[BILL-SERVICE] 🔄 PAT rotated by Pancake, refreshing and retrying once'
                );
                const refreshed =
                    await window.pancakeTokenManager?.refreshPageAccessToken?.(pageId);
                if (refreshed) {
                    pageAccessToken = refreshed;
                    sendResult = await _postBill(pageAccessToken);
                } else {
                    console.error('[BILL-SERVICE] PAT refresh failed, cannot retry');
                }
            }

            // Check if API returned success: false (Facebook policy errors, etc.)
            if (sendResult.success === false) {
                const errorMessage = sendResult.message || `Error code: ${sendResult.e_code}`;
                console.warn('[BILL-SERVICE] ⚠️ Bill send failed (API error):', {
                    e_code: sendResult.e_code,
                    e_subcode: sendResult.e_subcode,
                    message: sendResult.message,
                });

                // Check for 24-hour policy error OR #551 user unavailable - try Extension Bypass fallback
                const is24HourError =
                    (sendResult.e_code === 10 && sendResult.e_subcode === 2018278) ||
                    (sendResult.message &&
                        sendResult.message.includes('khoảng thời gian cho phép'));
                const isUserUnavailable =
                    sendResult.e_code === 551 ||
                    (sendResult.message && sendResult.message.includes('không có mặt'));

                if (
                    (is24HourError || isUserUnavailable) &&
                    window.pancakeExtension?.connected &&
                    window.sendImagesViaExtension
                ) {
                    try {
                        // Fetch messages API to get thread_id + global_id + customers
                        const pdm = window.pancakeDataManager;
                        const raw = { from_psid: psid };
                        let customers = [];
                        let customerName = '';

                        if (pdm) {
                            try {
                                const msgData = await pdm.fetchMessages(pageId, convId);
                                if (msgData.conversation) {
                                    const mc = msgData.conversation;
                                    if (mc.thread_id) raw.thread_id = mc.thread_id;
                                    if (mc.page_customer) raw.page_customer = mc.page_customer;
                                    customerName = mc.page_customer?.name || '';
                                }
                                if (msgData.customers?.length) {
                                    customers = msgData.customers;
                                }
                            } catch (e) {
                                console.warn(
                                    '[BILL-SERVICE] Messages fetch for ext data failed:',
                                    e.message
                                );
                            }
                        }

                        // Fallback customerName from orderResult
                        if (!customerName && orderResult) {
                            customerName =
                                orderResult.Partner?.Name ||
                                orderResult.PartnerDisplayName ||
                                orderResult.ReceiverName ||
                                '';
                        }

                        const extConv = {
                            pageId,
                            psid,
                            conversationId: convId,
                            _raw: raw,
                            customers,
                            _messagesData: { customers },
                            updated_at: null,
                            customerName,
                            type: 'INBOX',
                        };

                        // Regenerate bill image if not available (preGenerated path)
                        if (!billImageFile) {
                            const blob = await generateBillImage(orderResult, options);
                            billImageFile = new File(
                                [blob],
                                `bill_${orderResult?.Number || Date.now()}.png`,
                                { type: 'image/png' }
                            );
                        }

                        // Send actual bill IMAGE via extension (not just text)
                        await window.sendImagesViaExtension([billImageFile], null, extConv);

                        // Send CAMON (image + text) via extension
                        try {
                            const camonReply = window.quickReplyManager?.replies?.find(
                                (r) => (r.shortcut || '').toUpperCase() === 'CAMON'
                            );
                            const camonImageUrl =
                                camonReply?.imageUrl ||
                                'https://content.pancake.vn/2-25/2025/5/21/2c82b1de2b01a5ad96990f2a14277eaa22d65293.jpg';
                            let camonText =
                                camonReply?.message ||
                                'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️';
                            const displayName =
                                window.authManager?.getUserInfo?.()?.displayName ||
                                window.authManager?.getAuthState?.()?.displayName;
                            if (displayName) camonText += '\nNv. ' + displayName;

                            // Get CAMON image from cache (IndexedDB) or download + cache
                            const camonBlob = await window.imageBlobCache.getOrFetch(camonImageUrl);
                            const ext =
                                camonImageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
                            const camonFile = new File([camonBlob], `camon.${ext}`, {
                                type: camonBlob.type || `image/${ext}`,
                            });
                            await window.sendImagesViaExtension([camonFile], camonText, extConv);
                        } catch (camonErr) {
                            console.warn(
                                '[BILL-SERVICE] CAMON via extension failed:',
                                camonErr.message
                            );
                        }

                        return {
                            success: true,
                            messageId: `ext_${Date.now()}`,
                            viafallback: true,
                        };
                    } catch (extError) {
                        console.warn('[BILL-SERVICE] Extension Bypass failed:', extError.message);
                    }
                }

                return {
                    success: false,
                    error: errorMessage,
                    e_code: sendResult.e_code,
                    e_subcode: sendResult.e_subcode,
                };
            }

            // Bill sent successfully — now fire CAMON (image + text) in background
            sendAdditionalBillMessages(pageId, convId, pageAccessToken);

            return { success: true, messageId: sendResult.id };
        } catch (error) {
            console.error('[BILL-SERVICE] Error sending bill:', error);
            return { success: false, error: error.message };
        }
    }

    // sendViaFacebookAPI() removed - 24h fallback now uses Extension Bypass (sendViaExtension)

    /**
     * Send CAMON quick reply after successful bill send (image + thank you message)
     * Fires after bill success - fire and forget
     * Uses Official API v1 with page_access_token
     * @param {string} pageId - Facebook Page ID
     * @param {string} convId - Conversation ID
     * @param {string} pageAccessToken - Page access token
     */
    function sendAdditionalBillMessages(pageId, convId, pageAccessToken) {
        // Build URL using Official API v1 (page_access_token)
        const baseUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${pageId}/conversations/${convId}/messages`,
            pageAccessToken
        );

        const jsonHeaders = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        // Get CAMON template from quick reply manager (or use defaults)
        const camonReply = window.quickReplyManager?.replies?.find(
            (r) => (r.shortcut || '').toUpperCase() === 'CAMON'
        );
        const camonImageContentId = camonReply?.contentId || '4d0b73b0-8d3f-4dfa-bb9b-11a82096734d';
        let camonText =
            camonReply?.message ||
            'Dạ hàng của mình đã được lên bill , cám ơn chị yêu đã ủng hộ shop ạ ❤️';

        // Add employee signature
        const displayName =
            window.authManager?.getUserInfo?.()?.displayName ||
            window.authManager?.getAuthState?.()?.displayName;
        if (displayName) camonText += '\nNv. ' + displayName;

        // Message 1: Send image via content_ids (Official API docs §3.3)
        const imagePayload = {
            action: 'reply_inbox',
            content_ids: [camonImageContentId],
        };

        // Message 2: Send thank you text with signature
        const textPayload = {
            action: 'reply_inbox',
            message: camonText,
        };

        // Fire both requests without waiting (fire and forget)
        fetch(baseUrl, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(imagePayload) })
            .then((response) => {
                if (!response.ok) {
                    console.warn(
                        '[BILL-SERVICE] [ADDITIONAL] Image message HTTP error:',
                        response.status
                    );
                    return { success: false, httpError: response.status };
                }
                return response.json();
            })
            .then(() => {})
            .catch((error) => {
                console.warn('[BILL-SERVICE] [ADDITIONAL] Image message error:', error.message);
            });

        fetch(baseUrl, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(textPayload) })
            .then((response) => {
                if (!response.ok) {
                    console.warn(
                        '[BILL-SERVICE] [ADDITIONAL] Thank you message HTTP error:',
                        response.status
                    );
                    return { success: false, httpError: response.status };
                }
                return response.json();
            })
            .then(() => {})
            .catch((error) => {
                console.warn('[BILL-SERVICE] [ADDITIONAL] Thank you message error:', error.message);
            });
    }

    // ========== TPOS BILL FUNCTIONS ==========

    /**
     * Fetch TPOS bill HTML and add STT
     * @param {number} orderId - FastSaleOrder ID from TPOS
     * @param {object} headers - Auth headers for TPOS API
     * @param {object} orderData - Original order data (for getting STT)
     * @returns {Promise<string|null>} Modified HTML with STT, or null if failed
     */
    async function fetchTPOSBillHTML(orderId, headers, orderData) {
        try {
            const printUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fastsaleorder/print1?ids=${orderId}`;
            const response = await API_CONFIG.smartFetch(printUrl, {
                method: 'GET',
                headers: {
                    ...headers,
                    accept: 'application/json, text/javascript, */*; q=0.01',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.html) {
                throw new Error('No HTML returned from TPOS API');
            }

            // Get STT from order data
            let sttDisplay = '';
            if (orderData?.IsMerged && orderData?.OriginalOrders?.length > 1) {
                const allSTTs = orderData.OriginalOrders.map((o) => o.SessionIndex)
                    .filter((stt) => stt)
                    .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
                sttDisplay = allSTTs.join(', ');
            } else {
                sttDisplay = orderData?.SessionIndex || '';
            }
            // Modify HTML to add STT below "Người bán" if STT exists
            let modifiedHtml = result.html;
            if (sttDisplay) {
                // HTML may have "á" as either literal or HTML entity (&#225;)
                const nguoiBanRegex =
                    /(<div[^>]*>\s*<strong>Người\s+b(?:á|&#225;|&aacute;)n:<\/strong>[^<]*<\/div>)/i;

                if (nguoiBanRegex.test(modifiedHtml)) {
                    modifiedHtml = modifiedHtml.replace(
                        nguoiBanRegex,
                        `$1\n                            <div><strong>STT:</strong> ${sttDisplay}</div>`
                    );
                }
            }

            // Add "CÓ ĐƠN THU VỀ" when order uses virtual debt from return ticket
            if (orderData?.hasVirtualDebt) {
                const codRegex =
                    /(<p[^>]*class=['"]size-16 font-bold['"][^>]*>Ti(?:ề|&#7873;)n thu h(?:ộ|&#7897;))/i;
                if (codRegex.test(modifiedHtml)) {
                    modifiedHtml = modifiedHtml.replace(
                        codRegex,
                        `<span style="font-weight:bold">** CÓ ĐƠN THU VỀ **</span><br/>\n$1`
                    );
                }
            }

            return modifiedHtml;
        } catch (error) {
            console.error('[BILL-SERVICE] Error fetching TPOS bill:', error);
            return null;
        }
    }

    /**
     * Open print popup with raw HTML content (for TPOS bills)
     * @param {string} html - HTML content to print
     */
    function openPrintPopupWithHtml(html) {
        const printWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');

        if (!printWindow) {
            console.error('[BILL-SERVICE] Failed to open print window - popup blocked?');
            window.notificationManager?.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
            return;
        }

        // Write the HTML content
        printWindow.document.write(html);
        printWindow.document.close();

        // Use flag to prevent double print
        let printed = false;
        const triggerPrint = () => {
            if (printed || !printWindow || printWindow.closed) return;
            printed = true;
            printWindow.focus();
            printWindow.print();
        };

        // Auto-close popup window after printing/cancelling
        printWindow.onafterprint = () => {
            printWindow.close();
        };

        // Wait for content to load, then trigger print
        printWindow.onload = function () {
            setTimeout(triggerPrint, 500);
        };

        // Fallback if onload doesn't fire
        setTimeout(triggerPrint, 1500);
    }

    /**
     * Open combined print popup with TPOS bills for multiple orders
     * @param {Array<{orderId: number, orderData: object}>} orders - Array of order info
     * @param {object} headers - Auth headers for TPOS API
     */
    async function openCombinedTPOSPrintPopup(orders, headers) {
        if (!orders || orders.length === 0) {
            console.warn('[BILL-SERVICE] No orders to print');
            return;
        }

        // Fetch all TPOS bills in parallel
        const billPromises = orders.map(({ orderId, orderData }) => {
            return fetchTPOSBillHTML(orderId, headers, orderData);
        });

        const bills = await Promise.all(billPromises);
        const validBills = bills.filter((html) => html !== null);

        if (validBills.length === 0) {
            console.error('[BILL-SERVICE] No valid TPOS bills fetched - all returned null');
            window.notificationManager?.error(
                'Không thể tải bill từ TPOS. Kiểm tra Console để biết chi tiết.'
            );
            return;
        }

        // Extract body content from each bill and combine
        const billBodies = validBills.map((html, index) => {
            // Extract content between <body> and </body>
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const bodyContent = bodyMatch ? bodyMatch[1] : html;

            // Add page break after each bill except the last one
            const pageBreak =
                index < validBills.length - 1
                    ? '<div style="page-break-after: always; border-top: 2px dashed #999; margin: 20px 0;"></div>'
                    : '';

            return `<div class="bill-container">${bodyContent}</div>${pageBreak}`;
        });

        // Extract styles from first bill
        const styleMatch = validBills[0].match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const styles = styleMatch ? styleMatch[1] : '';

        // Combine all bills
        const combinedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>In ${validBills.length} phiếu bán hàng</title>
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
</body>
</html>`;

        openPrintPopupWithHtml(combinedHtml);
    }

    /**
     * Fetch and print TPOS bill for a single order
     * @param {number} orderId - FastSaleOrder ID
     * @param {object} headers - Auth headers
     * @param {object} orderData - Order data with SessionIndex
     */
    async function fetchAndPrintTPOSBill(orderId, headers, orderData) {
        const html = await fetchTPOSBillHTML(orderId, headers, orderData);
        if (html) {
            openPrintPopupWithHtml(html);
        } else {
            // Fallback to custom bill
            openPrintPopup({ Id: orderId }, { currentSaleOrderData: orderData });
        }
    }

    // Public API
    return {
        generateCustomBillHTML,
        openPrintPopup,
        openCombinedPrintPopup,
        generateBillImage,
        sendBillToCustomer,
        // TPOS bill functions
        fetchTPOSBillHTML,
        openPrintPopupWithHtml,
        openCombinedTPOSPrintPopup,
        fetchAndPrintTPOSBill,
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
// TPOS bill functions
window.fetchTPOSBillHTML = BillService.fetchTPOSBillHTML;
window.openPrintPopupWithHtml = BillService.openPrintPopupWithHtml;
window.openCombinedTPOSPrintPopup = BillService.openCombinedTPOSPrintPopup;
window.fetchAndPrintTPOSBill = BillService.fetchAndPrintTPOSBill;
