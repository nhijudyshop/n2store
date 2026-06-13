// #Note: WEB2.0 shared module — DB badge next to page title
// =====================================================
// Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"
// kế bên tiêu đề <h1> của trang.
// =====================================================
//
// P1 2026-05-30: user ask "trang nào dùng db web 2.0 hay firebase 2.0 thì
// ghi kế bên tên là DB Render 2.0 hoặc DB Firebase 2.0, có cả 2 thì DB Web 2.0".
//
// Cách dùng — page chỉ cần 1 dòng meta tag trong <head>:
//
//   <meta name="web2-db" content="render">    → "DB Render 2.0" (chỉ Render PG)
//   <meta name="web2-db" content="firebase">  → "DB Firebase 2.0" (chỉ Firestore)
//   <meta name="web2-db" content="both">      → "DB Web 2.0" (cả 2)
//
// Auto-detect: nếu không có meta, KHÔNG render badge (no-op safe).
//
// Script tự render badge sau DOMContentLoaded, tìm first <h1> trong <main>
// hoặc fallback toàn document. Inject CSS lần đầu (idempotent).

(function (global) {
    'use strict';

    if (global.Web2DbBadge) return;

    const BADGE_CONFIG = {
        render: {
            label: 'DB Render 2.0',
            tooltip: 'Trang dùng Render Postgres (n2store-web2-db) cho web2_records',
            bg: '#dbeafe',
            color: '#1d4ed8',
            border: '#93c5fd',
            icon: '🐘', // postgres elephant
        },
        firebase: {
            label: 'DB Firebase 2.0',
            tooltip: 'Trang dùng Firestore web2_* collection',
            bg: '#fef3c7',
            color: '#b45309',
            border: '#fcd34d',
            icon: '🔥',
        },
        both: {
            label: 'DB Web 2.0',
            tooltip: 'Trang dùng cả Render Postgres + Firestore',
            bg: 'linear-gradient(135deg, #dbeafe 0%, #fef3c7 100%)',
            color: '#0068ff',
            border: '#bcdcff',
            icon: '⚡',
        },
    };

    let _cssInjected = false;
    function _injectCss() {
        if (_cssInjected) return;
        _cssInjected = true;
        const css = `
.w2-db-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    margin-left: 12px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    border: 1px solid;
    vertical-align: middle;
    cursor: help;
    white-space: nowrap;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    line-height: 1.4;
}
.w2-db-badge .w2-db-badge-icon { font-size: 12px; line-height: 1; }
`;
        const style = document.createElement('style');
        style.id = 'w2-db-badge-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function _escape(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    function _resolveType() {
        const meta = document.head.querySelector('meta[name="web2-db"]');
        if (!meta) return null;
        const val = String(meta.getAttribute('content') || '')
            .toLowerCase()
            .trim();
        if (BADGE_CONFIG[val]) return val;
        return null;
    }

    function _findTargetHeading() {
        // Priority: explicit data-w2-badge-anchor → main h1 → first h1
        //        → .web2-breadcrumb-current (page-shell page-builder breadcrumb)
        const explicit = document.querySelector('[data-w2-badge-anchor]');
        if (explicit) return explicit;
        const main = document.querySelector('main h1');
        if (main) return main;
        const h1 = document.querySelector('h1');
        if (h1) return h1;
        // Fallback for page-shell pages (page-builder.js uses breadcrumb)
        return document.querySelector('.web2-breadcrumb-current');
    }

    function _renderBadge(type) {
        const cfg = BADGE_CONFIG[type];
        const span = document.createElement('span');
        span.className = 'w2-db-badge';
        span.title = cfg.tooltip;
        span.style.cssText = `background:${cfg.bg};color:${cfg.color};border-color:${cfg.border};`;
        span.innerHTML = `<span class="w2-db-badge-icon">${cfg.icon}</span>${_escape(cfg.label)}`;
        return span;
    }

    function mount(opts) {
        _injectCss();
        const type = (opts && opts.type) || _resolveType();
        if (!type || !BADGE_CONFIG[type]) return null;
        const heading = (opts && opts.target) || _findTargetHeading();
        if (!heading) return null;
        // Idempotent — bỏ badge cũ nếu có
        const existing = heading.querySelector(':scope > .w2-db-badge');
        if (existing) existing.remove();
        const badge = _renderBadge(type);
        heading.appendChild(badge);
        return badge;
    }

    global.Web2DbBadge = { mount, BADGE_CONFIG };

    // Auto-init khi DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mount());
    } else {
        mount();
    }
})(typeof window !== 'undefined' ? window : globalThis);
