// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2ImageLightbox — 1 NGUỒN lightbox xem ảnh + dải thumbnail cho Web 2.0.
//
// Lý do (dedup, 2026-06-19): overlay xem ảnh full-screen copy-paste ở
// native-orders-snapshots (openSnapLightbox), purchase-refund-state
// (openImageLightbox), zalo/live-chat. Cùng pattern: overlay fixed inset:0,
// click backdrop / Esc đóng, ảnh contain. Gom 1 nguồn + thêm prev/next khi
// nhiều ảnh + dải thumbnail click→open.
//
// Compositor-friendly: chỉ transform/opacity; listener scroll/touch passive.
//
// API:
//   Web2ImageLightbox.open(images, startIdx=0)  → mở overlay; images = []url
//                                                  hoặc [{url,caption}]
//   Web2ImageLightbox.thumbStripHtml(images, opts) → HTML dải thumbnail
//        opts: { className, size } — mỗi thumb có data-w2lb-url + data-w2lb-idx
//   Web2ImageLightbox.safeImageUrl(url)         → reuse Web2Escape.safeImageUrl
//   Web2ImageLightbox.close()                   → đóng overlay đang mở
//
// Tự delegate click `[data-w2lb-url]` (thumbStripHtml dùng) — KHÔNG cần wire tay.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ImageLightbox) return;

    var OVERLAY_ID = 'web2ImageLightbox';
    var _state = { images: [], idx: 0 };

    function _esc(v) {
        if (global.Web2Escape && global.Web2Escape.escapeHtml) {
            return global.Web2Escape.escapeHtml(v);
        }
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeImageUrl(url) {
        if (global.Web2Escape && global.Web2Escape.safeImageUrl) {
            return global.Web2Escape.safeImageUrl(url);
        }
        var s = String(url || '').trim();
        return /^(https:\/\/|http:\/\/|\/|data:image\/)/i.test(s) ? s : '';
    }

    // Chuẩn hoá → [{ url, caption }]. Bỏ url không hợp lệ.
    function _normalize(images) {
        var arr = Array.isArray(images) ? images : images ? [images] : [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            var url = typeof it === 'string' ? it : it && (it.url || it.src || it.thumbnailUrl);
            var safe = safeImageUrl(url);
            if (!safe) continue;
            out.push({ url: safe, caption: (it && it.caption) || '' });
        }
        return out;
    }

    function _ensureOverlay() {
        var ov = document.getElementById(OVERLAY_ID);
        if (ov) return ov;
        ov = document.createElement('div');
        ov.id = OVERLAY_ID;
        ov.className = 'w2-lb-overlay';
        ov.hidden = true;
        ov.style.cssText =
            'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;' +
            'align-items:center;justify-content:center;padding:24px;cursor:zoom-out;' +
            'background:rgba(0,0,0,0.85);opacity:0;transition:opacity 180ms ease;';
        ov.innerHTML =
            '<button type="button" class="w2-lb-prev" aria-label="Ảnh trước" ' +
            'style="position:absolute;left:16px;top:50%;transform:translateY(-50%);' +
            'background:rgba(255,255,255,0.15);color:#fff;border:none;width:44px;height:44px;' +
            'border-radius:50%;font-size:24px;cursor:pointer;line-height:1;">‹</button>' +
            '<img class="w2-lb-img" alt="" ' +
            'style="max-width:92vw;max-height:82vh;object-fit:contain;border-radius:8px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.6);background:#111;cursor:default;">' +
            '<div class="w2-lb-cap" style="margin-top:12px;color:#fff;font-size:13px;text-align:center;max-width:80vw;"></div>' +
            '<button type="button" class="w2-lb-next" aria-label="Ảnh sau" ' +
            'style="position:absolute;right:16px;top:50%;transform:translateY(-50%);' +
            'background:rgba(255,255,255,0.15);color:#fff;border:none;width:44px;height:44px;' +
            'border-radius:50%;font-size:24px;cursor:pointer;line-height:1;">›</button>' +
            '<button type="button" class="w2-lb-close" aria-label="Đóng" ' +
            'style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);' +
            'color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:22px;cursor:pointer;line-height:1;">×</button>';

        // Click backdrop đóng; click ảnh/nút không đóng (trừ nút close).
        ov.addEventListener('click', function (e) {
            var t = e.target;
            if (t === ov || (t.classList && t.classList.contains('w2-lb-close'))) {
                close();
            }
        });
        ov.querySelector('.w2-lb-img').addEventListener('click', function (e) {
            e.stopPropagation();
        });
        ov.querySelector('.w2-lb-prev').addEventListener('click', function (e) {
            e.stopPropagation();
            _go(-1);
        });
        ov.querySelector('.w2-lb-next').addEventListener('click', function (e) {
            e.stopPropagation();
            _go(1);
        });
        document.body.appendChild(ov);
        return ov;
    }

    function _render() {
        var ov = document.getElementById(OVERLAY_ID);
        if (!ov) return;
        var cur = _state.images[_state.idx];
        if (!cur) return;
        ov.querySelector('.w2-lb-img').src = cur.url;
        ov.querySelector('.w2-lb-cap').textContent = cur.caption || '';
        var multi = _state.images.length > 1;
        ov.querySelector('.w2-lb-prev').style.display = multi ? '' : 'none';
        ov.querySelector('.w2-lb-next').style.display = multi ? '' : 'none';
    }

    function _go(delta) {
        var n = _state.images.length;
        if (n <= 1) return;
        _state.idx = (_state.idx + delta + n) % n;
        _render();
    }

    function _onKey(e) {
        var ov = document.getElementById(OVERLAY_ID);
        if (!ov || ov.hidden) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') _go(-1);
        else if (e.key === 'ArrowRight') _go(1);
    }

    var _keyBound = false;

    function open(images, startIdx) {
        var imgs = _normalize(images);
        if (!imgs.length) return;
        _state.images = imgs;
        _state.idx = Math.min(Math.max(0, Number(startIdx) || 0), imgs.length - 1);
        var ov = _ensureOverlay();
        _render();
        ov.hidden = false;
        // Reflow để transition opacity chạy (compositor-friendly).
        requestAnimationFrame(function () {
            ov.style.opacity = '1';
        });
        if (!_keyBound) {
            document.addEventListener('keydown', _onKey, { passive: true });
            _keyBound = true;
        }
    }

    function close() {
        var ov = document.getElementById(OVERLAY_ID);
        if (!ov || ov.hidden) return;
        ov.style.opacity = '0';
        setTimeout(function () {
            ov.hidden = true;
        }, 180);
    }

    // Dải thumbnail: mỗi ảnh là <button> với data-w2lb-url + data-w2lb-idx.
    // Click delegate (đăng ký 1 lần) → open(toàn bộ, idx).
    function thumbStripHtml(images, opts) {
        var imgs = _normalize(images);
        if (!imgs.length) return '';
        var o = opts || {};
        var cls = _esc(o.className || 'w2-lb-strip');
        var size = Number(o.size) || 56;
        var thumbs = imgs
            .map(function (im, i) {
                return (
                    '<button type="button" class="w2-lb-thumb" data-w2lb-url="' +
                    _esc(im.url) +
                    '" data-w2lb-idx="' +
                    i +
                    '" style="width:' +
                    size +
                    'px;height:' +
                    size +
                    'px;padding:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;' +
                    'cursor:zoom-in;background:#f8fafc;flex:0 0 auto;">' +
                    '<img src="' +
                    _esc(im.url) +
                    '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" ' +
                    'onerror="this.style.display=\'none\'"></button>'
                );
            })
            .join('');
        return (
            '<div class="' +
            cls +
            '" data-w2lb-strip="1" style="display:flex;gap:6px;flex-wrap:wrap;">' +
            thumbs +
            '</div>'
        );
    }

    // Delegate click cho mọi thumb sinh bởi thumbStripHtml. Gom toàn bộ url
    // trong cùng strip để open hỗ trợ prev/next.
    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-w2lb-url]');
        if (!btn) return;
        var strip = btn.closest('[data-w2lb-strip]');
        var urls;
        var idx = Number(btn.getAttribute('data-w2lb-idx')) || 0;
        if (strip) {
            urls = Array.prototype.map.call(
                strip.querySelectorAll('[data-w2lb-url]'),
                function (el) {
                    return el.getAttribute('data-w2lb-url');
                }
            );
        } else {
            urls = [btn.getAttribute('data-w2lb-url')];
            idx = 0;
        }
        open(urls, idx);
    });

    global.Web2ImageLightbox = {
        open: open,
        close: close,
        thumbStripHtml: thumbStripHtml,
        safeImageUrl: safeImageUrl,
    };
})(typeof window !== 'undefined' ? window : globalThis);
