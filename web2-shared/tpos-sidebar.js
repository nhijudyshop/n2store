// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS-clone sidebar for Web 2.0 pages.
 * Mirrors the 87 routes crawled from tomato.tpos.vn /#/app/dashboard.
 * Ours-counterpart routes go under /web2/<slug>/index.html.
 *
 * Usage:
 *   <link rel="stylesheet" href="../web2-shared/tpos-sidebar.css">
 *   <script src="../web2-shared/tpos-sidebar.js"></script>
 *   <body>
 *     <div class="web2-shell">
 *       <aside class="web2-aside" id="web2Aside"></aside>
 *       <main class="web2-main"> ... </main>
 *     </div>
 *   </body>
 *   <script>Web2Sidebar.mount('#web2Aside', { activeRoute: 'native-orders' });</script>
 */

(function (global) {
    'use strict';

    // Group definitions matching TPOS sidebar structure.
    // For routes already implemented in our project: `our` field points to the URL.
    // Routes not yet implemented (placeholder): `our: null` — clicking shows "Coming soon".
    const NAV = [
        {
            label: 'Tổng quan',
            icon: 'home',
            single: true,
            our: '../native-orders/index.html',
            tpos: '#/app/dashboard',
        },
        {
            label: 'Bán Hàng',
            icon: 'shopping-bag',
            children: [
                { label: 'Điểm bán hàng', tpos: '#/app/posconfig/kanban', our: '../web2/pos-config/index.html' },
                { label: 'Phiên bán hàng', tpos: '#/app/possession/list', our: '../web2/pos-session/index.html' },
                { label: 'Đơn hàng (POS)', tpos: '#/app/posorder/list', our: '../web2/pos-order/index.html' },
                { label: 'Bán hàng (HĐ)', tpos: '#/app/fastsaleorder/invoicelist', our: '../web2/fastsaleorder-invoice/index.html' },
                { label: 'Trả hàng', tpos: '#/app/fastsaleorder/refundlist', our: '../web2/fastsaleorder-refund/index.html' },
                { label: 'Phiếu giao hàng', tpos: '#/app/fastsaleorder/deliveryinvoice', our: '../web2/fastsaleorder-delivery/index.html' },
                { label: 'Lịch sử đối soát', tpos: '#/app/historyds/list', our: '../web2/history-ds/index.html' },
                { label: 'Đối soát SP', tpos: '#/app/fastsaleorder/historycrosscheckproduct', our: '../web2/history-cross-check-product/index.html' },
                { label: 'Hóa đơn điện tử', tpos: '#/app/wiinvoice/list', our: '../web2/wi-invoice/index.html' },
                { label: 'HĐ điện tử lịch sử', tpos: '#/app/wiinvoice/listhistory', our: '../web2/wi-invoice-history/index.html' },
                { label: 'HĐ điện tử cấu hình', tpos: '#/app/wiinvoice/config', our: '../web2/wi-invoice-config/index.html' },
                {
                    label: 'Báo giá',
                    tpos: '#/app/salequotation/quotationlist',
                    our: '../web2/sale-quotation/index.html',
                },
                {
                    label: 'Đơn đặt hàng',
                    tpos: '#/app/saleorder/list2',
                    our: '../web2/sale-order/index.html',
                },
            ],
        },
        {
            label: 'Sale Online',
            icon: 'globe',
            children: [
                {
                    label: 'Chiến dịch Live',
                    tpos: '#/app/saleOnline/liveCampaign/list',
                    our: '../web2/live-campaign/index.html',
                },
                {
                    label: 'Đơn Web',
                    our: '../native-orders/index.html',
                    tpos: '#/app/saleOnline/order/list',
                },
                { label: 'TPOS × Pancake', our: '../tpos-pancake/index.html' },
                { label: 'Facebook', tpos: '#/app/saleOnline/facebook', our: '../web2/sale-online-facebook/index.html' },
            ],
        },
        {
            label: 'Kênh bán',
            icon: 'layers',
            children: [
                {
                    label: 'Danh sách kênh',
                    tpos: '#/app/salechannel/list',
                    our: '../web2/sales-channel/index.html',
                },
            ],
        },
        {
            label: 'Mua hàng',
            icon: 'shopping-cart',
            children: [
                { label: 'Mua hàng', tpos: '#/app/fastpurchaseorder/invoicelist', our: '../web2/fastpurchaseorder-invoice/index.html' },
                { label: 'Trả hàng mua', tpos: '#/app/fastpurchaseorder/refundlist', our: '../web2/fastpurchaseorder-refund/index.html' },
            ],
        },
        {
            label: 'Kho hàng',
            icon: 'box',
            children: [
                { label: 'Tất cả hoạt động', tpos: '#/app/stockpickingtype/overview', our: '../web2/stock-picking-type/index.html' },
                { label: 'Vị trí kho', our: '../web2/stock-location/index.html' },
                {
                    label: 'Điều chỉnh tồn kho',
                    tpos: '#/app/stockinventory/list',
                    our: '../web2/stock-inventory/index.html',
                },
                {
                    label: 'Dịch chuyển kho',
                    tpos: '#/app/stockmove/list',
                    our: '../web2/stock-move/index.html',
                },
                { label: 'Cấu hình SP kho', tpos: '#/app/stockwarehouseproduct/form', our: '../web2/stock-warehouse-product/index.html' },
                { label: 'Điều chỉnh giá vốn', tpos: '#/app/stockmove/fifovacuum', our: '../web2/stock-fifo-vacuum/index.html' },
            ],
        },
        {
            label: 'Tài chính',
            icon: 'dollar-sign',
            children: [
                { label: 'Thanh toán bán hàng', tpos: '#/app/accountpayment/list', our: '../web2/account-payment-list/index.html' },
                { label: 'Tiền thối POS', tpos: '#/app/accountpayment/changelist', our: '../web2/account-payment-change/index.html' },
                {
                    label: 'Điều chỉnh công nợ',
                    tpos: '#/app/accountinventory/list',
                    our: '../web2/account-inventory/index.html',
                },
                {
                    label: 'Ký quỹ',
                    tpos: '#/app/accountdeposit/list',
                    our: '../web2/account-deposit/index.html',
                },
                {
                    label: 'Phiếu thu',
                    tpos: '#/app/accountpayment/thulist',
                    our: '../web2/account-payment-thu/index.html',
                },
                {
                    label: 'Phiếu chi',
                    tpos: '#/app/accountpayment/chilist',
                    our: '../web2/account-payment-chi/index.html',
                },
            ],
        },
        {
            label: 'Khách hàng',
            icon: 'users',
            children: [
                {
                    label: 'Nhóm khách hàng',
                    tpos: '#/app/partnercategory/list',
                    our: '../web2/partner-category/index.html',
                },
                {
                    label: 'Cấu hình nhóm doanh số',
                    tpos: '#/app/partnercategory_revenueconfig/list',
                our: '../web2/partner-category-revenue-config/index.html',
                },
                {
                    label: 'Khách hàng',
                    tpos: '#/app/partner/customer/list1',
                    our: '../web2/partner-customer/index.html',
                },
                {
                    label: 'Nhà cung cấp',
                    tpos: '#/app/partner/supplier/list1',
                    our: '../web2/partner-supplier/index.html',
                },
                {
                    label: 'DSD đầu kỳ KH',
                    tpos: '#/app/revenuebegan/list',
                    our: '../web2/revenue-began-customer/index.html',
                },
                {
                    label: 'DSD đầu kỳ NCC',
                    tpos: '#/app/revenuebegan/list_supplier',
                    our: '../web2/revenue-began-supplier/index.html',
                },
                {
                    label: 'Đối tác giao hàng',
                    tpos: '#/app/deliverycarrier/list',
                    our: '../web2/delivery-carrier/index.html',
                },
            ],
        },
        {
            label: 'Sản phẩm',
            icon: 'package',
            children: [
                { label: 'Kho SP Web 2.0', our: '../web2-products/index.html' },
                {
                    label: 'Nhóm sản phẩm',
                    tpos: '#/app/productcategory/list',
                    our: '../web2/product-category/index.html',
                },
                { label: 'Sản phẩm', tpos: '#/app/producttemplate/list', our: '../web2/product-template/index.html' },
                { label: 'Biến thể SP', tpos: '#/app/product/list', our: '../web2/product-variant/index.html' },
                { label: 'In mã vạch', tpos: '#/app/barcodeproductlabel/printbarcode', our: '../web2/barcode-product-label/index.html' },
                {
                    label: 'Thuộc tính',
                    tpos: '#/app/productattribute/list',
                    our: '../web2/product-attribute/index.html',
                },
                {
                    label: 'Giá trị thuộc tính',
                    tpos: '#/app/productattributevalue/list',
                    our: '../web2/product-attribute-value/index.html',
                },
                {
                    label: 'Nhóm đơn vị tính',
                    tpos: '#/app/productuomcateg/list',
                    our: '../web2/product-uom-categ/index.html',
                },
                {
                    label: 'Đơn vị tính',
                    tpos: '#/app/productuom/list',
                    our: '../web2/product-uom/index.html',
                },
                { label: 'Danh mục khác', tpos: '#/app/category_ext/distributor/list', our: '../web2/category-distributor/index.html' },
            ],
        },
        {
            label: 'Khuyến mãi',
            icon: 'gift',
            children: [
                {
                    label: 'Chương trình khuyến mãi',
                    tpos: '#/app/promotionprogram/list',
                    our: '../web2/promotion-program/index.html',
                },
                {
                    label: 'Coupon',
                    tpos: '#/app/couponprogram/list',
                    our: '../web2/coupon-program/index.html',
                },
                {
                    label: 'Tích điểm',
                    tpos: '#/app/loyaltyprogram/list',
                    our: '../web2/loyalty-program/index.html',
                },
                {
                    label: 'Ưu đãi',
                    tpos: '#/app/offerprogram/list',
                    our: '../web2/offer-program/index.html',
                },
            ],
        },
        {
            label: 'Kế toán',
            icon: 'book',
            children: [
                {
                    label: 'Loại thu',
                    tpos: '#/app/accountaccount/thulist',
                    our: '../web2/account-thu/index.html',
                },
                {
                    label: 'Loại chi',
                    tpos: '#/app/accountaccount/chilist',
                    our: '../web2/account-chi/index.html',
                },
                {
                    label: 'Tài khoản kế toán',
                    tpos: '#/app/accountaccount/list',
                    our: '../web2/account-list/index.html',
                },
                {
                    label: 'Sổ nhật ký',
                    tpos: '#/app/accountjournal/list',
                    our: '../web2/account-journal/index.html',
                },
                { label: 'Nhãn', tpos: '#/app/tag/list', our: '../web2/tag/index.html' },
                { label: 'Tác vụ xuất', tpos: '#/app/exportfile/list', our: '../web2/export-file/index.html' },
            ],
        },
        {
            label: 'Báo cáo',
            icon: 'bar-chart-3',
            children: [
                { label: 'Giá trị tồn kho', tpos: '#/app/product/inventoryvaluation', our: '../web2/inventory-valuation/index.html' },
                { label: 'Nhập-Xuất-Tồn', tpos: '#/app/stockreport/xuatnhapton', our: '../web2/xuat-nhap-ton/index.html' },
                { label: 'Thống kê nhập kho', tpos: '#/app/report/reportImported', our: '../web2/report-imported/index.html' },
                { label: 'Thống kê xuất kho', tpos: '#/app/report/reportExported', our: '../web2/report-exported/index.html' },
                { label: 'Thống kê hóa đơn', tpos: '#/app/report/reportOrder/index', our: '../web2/report-order/index.html' },
                { label: 'Thống kê trả hàng', tpos: '#/app/report/reportRefund/index', our: '../web2/report-refund/index.html' },
                { label: 'Thống kê mua hàng', tpos: '#/app/report/reportPurchase/index', our: '../web2/report-purchase/index.html' },
                { label: 'Thống kê doanh thu', tpos: '#/app/report/reportRevenue/index', our: '../web2/report-revenue/index.html' },
                { label: 'Kết quả kinh doanh', tpos: '#/app/report/businessResults/index', our: '../web2/report-business-results/index.html' },
                { label: 'Thống kê giao hàng', tpos: '#/app/fastsaleorder/deliveryreport/index', our: '../web2/report-delivery/index.html' },
                { label: 'Công nợ NCC', tpos: '#/app/report/supplierDept/index', our: '../web2/report-supplier-debt/index.html' },
                { label: 'Công nợ KH', tpos: '#/app/report/customerDept/index', our: '../web2/report-customer-debt/index.html' },
                { label: 'KH chưa phát sinh HĐ', tpos: '#/app/report/accountnotinvoice', our: '../web2/report-not-invoice/index.html' },
                { label: 'Audit log PBH', tpos: '#/app/report/auditlogfastsaleorder', our: '../web2/report-audit-fastsale/index.html' },
                { label: 'Nguồn tạo KH', tpos: '#/app/report/partnerCreate', our: '../web2/report-partner-create/index.html' },
                { label: 'Sổ tiền mặt', tpos: '#/app/accountcashprintjournal/report', our: '../web2/report-cash-journal/index.html' },
                { label: 'Tỷ lệ lên đơn SO', tpos: '#/app/report/rateinvoicefromsaleonline', our: '../web2/report-rate-saleonline/index.html' },
                { label: 'SP HĐ nháp/xác nhận', tpos: '#/app/report/productinvoice', our: '../web2/report-product-invoice/index.html' },
            ],
        },
        {
            label: 'Cấu hình',
            icon: 'settings',
            children: [
                { label: 'Cấu hình', tpos: '#/app/configs/general/index', our: '../web2/configs-general/index.html' },
                { label: 'Công ty', tpos: '#/app/company/list', our: '../web2/company/index.html' },
                { label: 'Máy in', tpos: '#/app/configs/printer/config', our: '../web2/configs-printer/index.html' },
                { label: 'Giấy in mã vạch', tpos: '#/app/productlabelpaper/list', our: '../web2/product-label-paper/index.html' },
                {
                    label: 'Người dùng',
                    tpos: '#/app/applicationuser/list',
                    our: '../web2/application-user/index.html',
                },
                { label: 'Phân quyền', tpos: '#/app/configs/roles', our: '../web2/configs-roles/index.html' },
                { label: 'Xác thực 2FA', tpos: '#/app/configs/twofa', our: '../web2/configs-twofa/index.html' },
                {
                    label: 'Đơn vị tiền tệ',
                    tpos: '#/app/rescurrency/list',
                    our: '../web2/res-currency/index.html',
                },
                { label: 'Cấu hình Mail', tpos: '#/app/irmailserver/list', our: '../web2/ir-mailserver/index.html' },
                {
                    label: 'Mail template',
                    tpos: '#/app/mailtemplate/list',
                    our: '../web2/mail-template/index.html',
                },
                { label: 'Nâng cao', tpos: '#/app/configs/advanced', our: '../web2/configs-advanced/index.html' },
                { label: 'Tích hợp', tpos: '#/app/callcenter/config', our: '../web2/callcenter-config/index.html' },
            ],
        },
    ];

    // ---------- Helpers ----------
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function isOurRoute(item) {
        return Boolean(item.our);
    }

    function renderItem(item, activeUrl) {
        const isImpl = isOurRoute(item);
        const href = isImpl ? item.our : '#';
        const isActive = isImpl && activeUrl && activeUrl.endsWith(item.our.replace(/^\.\.\//, ''));
        const cls = `web2-nav-sub-link${isActive ? ' active' : ''}`;
        const onclick = isImpl
            ? ''
            : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(item.label)}','${escapeHtml(item.tpos || '')}')"`;
        const soon = isImpl ? '' : ' <span class="web2-nav-soon">soon</span>';
        return `<li><a href="${escapeHtml(href)}" class="${cls}" ${onclick}>${escapeHtml(item.label)}${soon}</a></li>`;
    }

    function renderGroup(g, activeUrl) {
        if (g.single) {
            const isImpl = isOurRoute(g);
            const href = isImpl ? g.our : '#';
            const isActive =
                isImpl && activeUrl && activeUrl.endsWith(g.our.replace(/^\.\.\//, ''));
            const cls = `web2-nav-link${isActive ? ' active' : ''}`;
            const onclick = isImpl
                ? ''
                : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(g.label)}','${escapeHtml(g.tpos || '')}')"`;
            return `<a href="${escapeHtml(href)}" class="${cls}" ${onclick}>
                <i data-lucide="${g.icon}" class="icon"></i>
                <span class="label">${escapeHtml(g.label)}</span>
            </a>`;
        }
        const hasOurChild = (g.children || []).some(isOurRoute);
        const open = (g.children || []).some(
            (c) => isOurRoute(c) && activeUrl && activeUrl.endsWith(c.our.replace(/^\.\.\//, ''))
        );
        return `
            <div class="web2-nav-group${open ? ' is-open' : ''}">
                <div class="web2-nav-group-head" onclick="this.parentElement.classList.toggle('is-open')">
                    <i data-lucide="${g.icon}" class="icon"></i>
                    <span class="label">${escapeHtml(g.label)}${hasOurChild ? '' : ' <span class="web2-nav-soon">soon</span>'}</span>
                    <i data-lucide="chevron-right" class="caret"></i>
                </div>
                <ul class="web2-nav-sub">
                    ${(g.children || []).map((c) => renderItem(c, activeUrl)).join('')}
                </ul>
            </div>`;
    }

    const Web2Sidebar = {
        NAV,
        mount(selector, opts = {}) {
            const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (!el) return;
            const activeUrl = opts.activeUrl || window.location.href;
            el.innerHTML = `
                <div class="web2-brand">
                    <span class="web2-brand-logo">N2</span>
                    <span class="web2-brand-text">Web 2.0</span>
                    <span class="web2-brand-sub">v${opts.version || '1.0'}</span>
                </div>
                <nav class="web2-nav">
                    ${NAV.map((g) => renderGroup(g, activeUrl)).join('')}
                </nav>
            `;
            if (window.lucide) lucide.createIcons();
        },
        alertSoon(label, tpos) {
            const msg = `"${label}" — chưa làm.\nTPOS gốc: ${tpos || '(không rõ)'}\nSẽ port qua Web 2.0 ở phase tiếp.`;
            if (window.notificationManager?.show) window.notificationManager.show(msg, 'info');
            else alert(msg);
        },
    };

    global.Web2Sidebar = Web2Sidebar;
})(typeof window !== 'undefined' ? window : globalThis);
