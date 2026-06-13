// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).
// =====================================================================
// WZChat.openLightbox(images, startIndex) — overlay xem ảnh full màn hình.
// Phím: Esc đóng, ←/→ chuyển ảnh. Click nền đóng. no-referrer cho CDN Zalo.
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const esc = WZ.esc;

    let _el = null;
    let _imgs = [];
    let _i = 0;
    let _lastFocus = null;

    function render() {
        const url = _imgs[_i];
        if (!_el || !url) return;
        _el.querySelector('.wz-lb-img').src = url;
        const counter = _el.querySelector('.wz-lb-count');
        counter.textContent = _imgs.length > 1 ? `${_i + 1} / ${_imgs.length}` : '';
        _el.querySelector('.wz-lb-prev').style.visibility = _imgs.length > 1 ? '' : 'hidden';
        _el.querySelector('.wz-lb-next').style.visibility = _imgs.length > 1 ? '' : 'hidden';
        _el.querySelector('.wz-lb-dl').href = url;
    }
    function go(d) {
        _i = (_i + d + _imgs.length) % _imgs.length;
        render();
    }
    function onKey(e) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'ArrowRight') go(1);
    }
    function close() {
        if (!_el) return;
        document.removeEventListener('keydown', onKey);
        _el.remove();
        _el = null;
        if (_lastFocus?.focus) _lastFocus.focus();
    }

    WZ.openLightbox = function (images, startIndex) {
        _imgs = (Array.isArray(images) ? images : [images]).filter(Boolean);
        if (!_imgs.length) return;
        _i = Math.max(0, Math.min(startIndex || 0, _imgs.length - 1));
        _lastFocus = document.activeElement;
        close();
        _el = document.createElement('div');
        _el.className = 'wz-lightbox';
        _el.setAttribute('role', 'dialog');
        _el.setAttribute('aria-modal', 'true');
        _el.setAttribute('aria-label', 'Xem ảnh');
        _el.innerHTML = `
            <button class="wz-lb-close" aria-label="Đóng">✕</button>
            <a class="wz-lb-dl" download target="_blank" rel="noopener noreferrer" aria-label="Tải ảnh" title="Tải ảnh">⤓</a>
            <button class="wz-lb-prev" aria-label="Ảnh trước">‹</button>
            <img class="wz-lb-img" alt="" referrerpolicy="no-referrer">
            <button class="wz-lb-next" aria-label="Ảnh sau">›</button>
            <div class="wz-lb-count" aria-hidden="true"></div>`;
        _el.addEventListener('click', (e) => {
            if (e.target === _el || e.target.closest('.wz-lb-close')) close();
        });
        _el.querySelector('.wz-lb-prev').addEventListener('click', (e) => {
            e.stopPropagation();
            go(-1);
        });
        _el.querySelector('.wz-lb-next').addEventListener('click', (e) => {
            e.stopPropagation();
            go(1);
        });
        document.body.appendChild(_el);
        document.addEventListener('keydown', onKey);
        render();
        _el.querySelector('.wz-lb-close').focus();
    };

    // Tiện ích: thu thập mọi URL ảnh trong khung chat (cho prev/next)
    WZ.collectThreadImages = function (bodyEl) {
        return [...(bodyEl?.querySelectorAll('.wz-msg-media img, .wz-grid-cell img') || [])]
            .map((i) => i.dataset.full || i.src)
            .filter(Boolean);
    };
})();
