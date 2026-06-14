// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web2Deeplink — điều hướng sâu (deep-link) GIỮA các trang Web 2.0.
// Khóa join chung của hệ NCC = TÊN NCC (string, vd "CHIẾN NGỌC"). Không có id số.
//
// Mọi trang nằm dưới 1 app-root chung (GitHub Pages: /n2store/, localhost/prod: /).
// Helper tự tính app-root từ location.pathname rồi build URL tuyệt đối → không lệ
// thuộc độ sâu thư mục của trang gọi.
//
// Public API:
//   Web2Deeplink.param(name)            → giá trị query param (đã decode) | null
//   Web2Deeplink.url.supplierWallet(name)  → '<root>web2/supplier-wallet/index.html?supplier=...'
//   Web2Deeplink.url.supplierDebt(name)    → '<root>web2/supplier-debt/index.html?supplier=...'
//   Web2Deeplink.url.soOrder({supplier, tab})  → '<root>so-order/index.html?...'
//   Web2Deeplink.url.product(code)         → '<root>web2/products/index.html?code=...'
//   Web2Deeplink.url.nativeOrders(search)  → '<root>native-orders/index.html?search=...'
//   Web2Deeplink.url.reconcile(pbh)        → '<root>web2/reconcile/index.html?pbh=...'
//   Web2Deeplink.go(url, newTab=false)  → điều hướng (cùng tab) hoặc mở tab mới
//   Web2Deeplink.linkBtn({label, icon, url, title}) → HTML <a> nút liên kết (class .w2-xlink)

(function (global) {
    'use strict';

    // App-root = phần path trước 'web2/' (hoặc trước folder root đã biết).
    function root() {
        const p = global.location?.pathname || '/';
        const mWeb2 = p.match(/^(.*\/)web2\//);
        if (mWeb2) return mWeb2[1];
        // Trang ở root-level (so-order/, native-orders/): cắt segment cuối (folder + file)
        const mRoot = p.match(/^(.*\/)(?:so-order|native-orders|live-chat)\//);
        if (mRoot) return mRoot[1];
        // Fallback: thư mục cha của file hiện tại
        const parts = p.split('/');
        parts.pop(); // file
        if (parts.length) parts.pop(); // folder
        return (parts.join('/') || '') + '/';
    }

    function enc(v) {
        return encodeURIComponent(String(v == null ? '' : v).trim());
    }

    function param(name) {
        try {
            const v = new URLSearchParams(global.location.search).get(name);
            return v == null ? null : v;
        } catch {
            return null;
        }
    }

    const url = {
        supplierWallet(name) {
            return `${root()}web2/supplier-wallet/index.html?supplier=${enc(name)}`;
        },
        supplierDebt(name) {
            return `${root()}web2/supplier-debt/index.html?supplier=${enc(name)}`;
        },
        soOrder(opts) {
            opts = opts || {};
            const qs = [];
            if (opts.supplier) qs.push(`supplier=${enc(opts.supplier)}`);
            if (opts.tab) qs.push(`tab=${enc(opts.tab)}`);
            return `${root()}so-order/index.html${qs.length ? '?' + qs.join('&') : ''}`;
        },
        product(code) {
            return `${root()}web2/products/index.html?code=${enc(code)}`;
        },
        nativeOrders(search) {
            return `${root()}native-orders/index.html?search=${enc(search)}`;
        },
        reconcile(pbh) {
            return `${root()}web2/reconcile/index.html?pbh=${enc(pbh)}`;
        },
    };

    function go(href, newTab) {
        if (!href) return;
        if (newTab) {
            global.open(href, '_blank', 'noopener');
        } else {
            global.location.href = href;
        }
    }

    // HTML cho nút liên kết chéo (dùng innerHTML). icon = tên lucide.
    function linkBtn(opt) {
        opt = opt || {};
        const icon = opt.icon
            ? `<i data-lucide="${opt.icon}" style="width:13px;height:13px"></i>`
            : '';
        const title = opt.title ? ` title="${opt.title.replace(/"/g, '&quot;')}"` : '';
        return (
            `<a class="w2-xlink" href="${opt.url}"${title}>` +
            `${icon}<span>${opt.label || ''}</span></a>`
        );
    }

    global.Web2Deeplink = { param, url, go, linkBtn, root };
})(window);
