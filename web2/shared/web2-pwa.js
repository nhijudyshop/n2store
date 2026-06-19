// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — PWA (Thêm vào Màn hình chính) cho MỌI trang, không cần App Store.
// =====================================================================
// Web 2.0 — Web2PWA: biến web thành "app" cài qua "Thêm vào Màn hình chính"
//   (iOS Safari / Android Chrome) — MIỄN PHÍ, KHÔNG cần Apple Developer, KHÔNG App Store.
//
// Cách hoạt động: inject (1 lần) các thẻ <head> cần cho PWA vào MỌI trang Web 2.0
//   (auto-load qua web2-sidebar.js) → KHÔNG phải sửa HTML từng trang.
//   - <link rel="manifest">            → Chrome/Android: cài + standalone.
//   - apple-mobile-web-app-*           → iOS: mở TOÀN MÀN HÌNH (ẩn thanh Safari) + tên app.
//   - <link rel="apple-touch-icon">    → iOS: icon trên màn hình chính (iOS bỏ qua icon
//                                         trong manifest, CHỈ dùng apple-touch-icon).
//   - theme-color                      → màu thanh trạng thái.
//
// CỐ Ý KHÔNG đăng ký service worker: app này là công cụ quản lý dữ liệu (cần mạng + dữ
//   liệu LUÔN mới); SW cache dễ kẹt code/màn cũ sau mỗi lần deploy → nguy hiểm hơn lợi.
//   iOS "Thêm vào Màn hình chính" KHÔNG cần service worker. (Cần offline/Android-install
//   prompt sau này → thêm SW có version hoá cẩn thận, riêng.)
//
// Guard: thẻ nào trang đã tự khai (vd photo-studio có manifest riêng) thì GIỮ NGUYÊN.
// =====================================================================
(function () {
    'use strict';

    // Tự resolve thư mục của chính script này → trỏ asset (manifest/icon) đúng dù trang
    // nằm ở độ sâu nào (/web2/<x>/, /native-orders/, …) và host nào (nhijudy.store /
    // nhijudyshop.github.io/n2store/). Dùng path TƯƠNG ĐỐI → host-agnostic.
    const SCRIPT_SRC = (() => {
        const cs = document.currentScript;
        if (cs && cs.src) return cs.src;
        const list = document.getElementsByTagName('script');
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].src && /web2-pwa\.js(\?|#|$)/.test(list[i].src)) return list[i].src;
        }
        return location.href;
    })();
    const asset = (rel) => {
        try {
            return new URL(rel, SCRIPT_SRC).toString();
        } catch (_) {
            return rel;
        }
    };
    const head = document.head || document.documentElement;

    function ensureMeta(name, content) {
        if (document.querySelector(`meta[name="${name}"]`)) return; // trang tự khai → giữ
        const m = document.createElement('meta');
        m.name = name;
        m.content = content;
        head.appendChild(m);
    }
    function ensureLink(rel, href) {
        if (document.querySelector(`link[rel="${rel}"]`)) return; // trang tự khai → giữ
        const l = document.createElement('link');
        l.rel = rel;
        l.href = href;
        head.appendChild(l);
    }

    // 1) Manifest (Chrome/Android: cài + chạy standalone).
    ensureLink('manifest', asset('./web2-manifest.webmanifest?v=20260620a'));

    // 2) iOS: full-screen standalone + tên + status bar.
    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'default');
    ensureMeta('apple-mobile-web-app-title', 'N2Store');
    ensureMeta('theme-color', '#0068ff');

    // 3) Icon màn hình chính iOS (iOS chỉ đọc apple-touch-icon, không đọc manifest icon).
    ensureLink('apple-touch-icon', asset('./img/logo-emblem.png?v=20260530'));

    window.Web2PWA = {
        manifestUrl: asset('./web2-manifest.webmanifest'),
        installed: () =>
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true,
    };
})();
