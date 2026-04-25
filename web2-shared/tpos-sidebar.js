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
            label: 'Tổng quan', icon: 'home', single: true,
            our: '../native-orders/index.html', tpos: '#/app/dashboard',
        },
        {
            label: 'Bán Hàng', icon: 'shopping-bag',
            children: [
                { label: 'Điểm bán hàng', tpos: '#/app/posconfig/kanban' },
                { label: 'Phiên bán hàng', tpos: '#/app/possession/list' },
                { label: 'Đơn hàng (POS)', tpos: '#/app/posorder/list' },
                { label: 'Bán hàng (HĐ)', tpos: '#/app/fastsaleorder/invoicelist' },
                { label: 'Trả hàng', tpos: '#/app/fastsaleorder/refundlist' },
                { label: 'Phiếu giao hàng', tpos: '#/app/fastsaleorder/deliveryinvoice' },
                { label: 'Lịch sử đối soát', tpos: '#/app/historyds/list' },
                { label: 'Đối soát SP', tpos: '#/app/fastsaleorder/historycrosscheckproduct' },
                { label: 'Hóa đơn điện tử', tpos: '#/app/wiinvoice/list' },
                { label: 'HĐ điện tử lịch sử', tpos: '#/app/wiinvoice/listhistory' },
                { label: 'HĐ điện tử cấu hình', tpos: '#/app/wiinvoice/config' },
                { label: 'Báo giá', tpos: '#/app/salequotation/quotationlist' },
                { label: 'Đơn đặt hàng', tpos: '#/app/saleorder/list2' },
            ],
        },
        {
            label: 'Sale Online', icon: 'globe',
            children: [
                { label: 'Chiến dịch Live', tpos: '#/app/saleOnline/liveCampaign/list' },
                { label: 'Đơn Web', our: '../native-orders/index.html', tpos: '#/app/saleOnline/order/list' },
                { label: 'TPOS × Pancake', our: '../tpos-pancake/index.html' },
                { label: 'Facebook', tpos: '#/app/saleOnline/facebook' },
            ],
        },
        {
            label: 'Kênh bán', icon: 'layers',
            children: [
                { label: 'Danh sách kênh', tpos: '#/app/salechannel/list' },
            ],
        },
        {
            label: 'Mua hàng', icon: 'shopping-cart',
            children: [
                { label: 'Mua hàng', tpos: '#/app/fastpurchaseorder/invoicelist' },
                { label: 'Trả hàng mua', tpos: '#/app/fastpurchaseorder/refundlist' },
            ],
        },
        {
            label: 'Kho hàng', icon: 'box',
            children: [
                { label: 'Tất cả hoạt động', tpos: '#/app/stockpickingtype/overview' },
                { label: 'Điều chỉnh tồn kho', tpos: '#/app/stockinventory/list' },
                { label: 'Dịch chuyển kho', tpos: '#/app/stockmove/list' },
                { label: 'Cấu hình SP kho', tpos: '#/app/stockwarehouseproduct/form' },
                { label: 'Điều chỉnh giá vốn', tpos: '#/app/stockmove/fifovacuum' },
            ],
        },
        {
            label: 'Tài chính', icon: 'dollar-sign',
            children: [
                { label: 'Thanh toán bán hàng', tpos: '#/app/accountpayment/list' },
                { label: 'Tiền thối POS', tpos: '#/app/accountpayment/changelist' },
                { label: 'Điều chỉnh công nợ', tpos: '#/app/accountinventory/list' },
                { label: 'Ký quỹ', tpos: '#/app/accountdeposit/list' },
                { label: 'Phiếu thu', tpos: '#/app/accountpayment/thulist' },
                { label: 'Phiếu chi', tpos: '#/app/accountpayment/chilist' },
            ],
        },
        {
            label: 'Khách hàng', icon: 'users',
            children: [
                { label: 'Nhóm khách hàng', tpos: '#/app/partnercategory/list' },
                { label: 'Cấu hình nhóm doanh số', tpos: '#/app/partnercategory_revenueconfig/list' },
                { label: 'Khách hàng', tpos: '#/app/partner/customer/list1' },
                { label: 'Nhà cung cấp', tpos: '#/app/partner/supplier/list1' },
                { label: 'DSD đầu kỳ KH', tpos: '#/app/revenuebegan/list' },
                { label: 'DSD đầu kỳ NCC', tpos: '#/app/revenuebegan/list_supplier' },
                { label: 'Đối tác giao hàng', tpos: '#/app/deliverycarrier/list' },
            ],
        },
        {
            label: 'Sản phẩm', icon: 'package',
            children: [
                { label: 'Kho SP Web 2.0', our: '../web2-products/index.html' },
                { label: 'Nhóm sản phẩm', tpos: '#/app/productcategory/list' },
                { label: 'Sản phẩm', tpos: '#/app/producttemplate/list' },
                { label: 'Biến thể SP', tpos: '#/app/product/list' },
                { label: 'In mã vạch', tpos: '#/app/barcodeproductlabel/printbarcode' },
                { label: 'Thuộc tính', tpos: '#/app/productattribute/list' },
                { label: 'Giá trị thuộc tính', tpos: '#/app/productattributevalue/list' },
                { label: 'Nhóm đơn vị tính', tpos: '#/app/productuomcateg/list' },
                { label: 'Đơn vị tính', tpos: '#/app/productuom/list' },
                { label: 'Danh mục khác', tpos: '#/app/category_ext/distributor/list' },
            ],
        },
        {
            label: 'Khuyến mãi', icon: 'gift',
            children: [
                { label: 'Chương trình khuyến mãi', tpos: '#/app/promotionprogram/list' },
                { label: 'Coupon', tpos: '#/app/couponprogram/list' },
                { label: 'Tích điểm', tpos: '#/app/loyaltyprogram/list' },
                { label: 'Ưu đãi', tpos: '#/app/offerprogram/list' },
            ],
        },
        {
            label: 'Kế toán', icon: 'book',
            children: [
                { label: 'Loại thu', tpos: '#/app/accountaccount/thulist' },
                { label: 'Loại chi', tpos: '#/app/accountaccount/chilist' },
                { label: 'Tài khoản kế toán', tpos: '#/app/accountaccount/list' },
                { label: 'Sổ nhật ký', tpos: '#/app/accountjournal/list' },
                { label: 'Nhãn', tpos: '#/app/tag/list' },
                { label: 'Tác vụ xuất', tpos: '#/app/exportfile/list' },
            ],
        },
        {
            label: 'Báo cáo', icon: 'bar-chart-3',
            children: [
                { label: 'Giá trị tồn kho', tpos: '#/app/product/inventoryvaluation' },
                { label: 'Nhập-Xuất-Tồn', tpos: '#/app/stockreport/xuatnhapton' },
                { label: 'Thống kê nhập kho', tpos: '#/app/report/reportImported' },
                { label: 'Thống kê xuất kho', tpos: '#/app/report/reportExported' },
                { label: 'Thống kê hóa đơn', tpos: '#/app/report/reportOrder/index' },
                { label: 'Thống kê trả hàng', tpos: '#/app/report/reportRefund/index' },
                { label: 'Thống kê mua hàng', tpos: '#/app/report/reportPurchase/index' },
                { label: 'Thống kê doanh thu', tpos: '#/app/report/reportRevenue/index' },
                { label: 'Kết quả kinh doanh', tpos: '#/app/report/businessResults/index' },
                { label: 'Thống kê giao hàng', tpos: '#/app/fastsaleorder/deliveryreport/index' },
                { label: 'Công nợ NCC', tpos: '#/app/report/supplierDept/index' },
                { label: 'Công nợ KH', tpos: '#/app/report/customerDept/index' },
                { label: 'KH chưa phát sinh HĐ', tpos: '#/app/report/accountnotinvoice' },
                { label: 'Audit log PBH', tpos: '#/app/report/auditlogfastsaleorder' },
                { label: 'Nguồn tạo KH', tpos: '#/app/report/partnerCreate' },
                { label: 'Sổ tiền mặt', tpos: '#/app/accountcashprintjournal/report' },
                { label: 'Tỷ lệ lên đơn SO', tpos: '#/app/report/rateinvoicefromsaleonline' },
                { label: 'SP HĐ nháp/xác nhận', tpos: '#/app/report/productinvoice' },
            ],
        },
        {
            label: 'Cấu hình', icon: 'settings',
            children: [
                { label: 'Cấu hình', tpos: '#/app/configs/general/index' },
                { label: 'Công ty', tpos: '#/app/company/list' },
                { label: 'Máy in', tpos: '#/app/configs/printer/config' },
                { label: 'Giấy in mã vạch', tpos: '#/app/productlabelpaper/list' },
                { label: 'Người dùng', tpos: '#/app/applicationuser/list' },
                { label: 'Phân quyền', tpos: '#/app/configs/roles' },
                { label: 'Xác thực 2FA', tpos: '#/app/configs/twofa' },
                { label: 'Đơn vị tiền tệ', tpos: '#/app/rescurrency/list' },
                { label: 'Cấu hình Mail', tpos: '#/app/irmailserver/list' },
                { label: 'Mail template', tpos: '#/app/mailtemplate/list' },
                { label: 'Nâng cao', tpos: '#/app/configs/advanced' },
                { label: 'Tích hợp', tpos: '#/app/callcenter/config' },
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
            const isActive = isImpl && activeUrl && activeUrl.endsWith(g.our.replace(/^\.\.\//, ''));
            const cls = `web2-nav-link${isActive ? ' active' : ''}`;
            const onclick = isImpl ? '' : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(g.label)}','${escapeHtml(g.tpos || '')}')"`;
            return `<a href="${escapeHtml(href)}" class="${cls}" ${onclick}>
                <i data-lucide="${g.icon}" class="icon"></i>
                <span class="label">${escapeHtml(g.label)}</span>
            </a>`;
        }
        const hasOurChild = (g.children || []).some(isOurRoute);
        const open = (g.children || []).some((c) => isOurRoute(c) && activeUrl && activeUrl.endsWith(c.our.replace(/^\.\.\//, '')));
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
