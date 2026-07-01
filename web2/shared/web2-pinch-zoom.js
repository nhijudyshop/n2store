// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Pinch-to-zoom ảnh (2 ngón) dùng chung.
//
// Web2PinchZoom — zoom 1 ảnh bằng 2 ngón (pinch) + kéo 1 ngón (pan khi đã zoom) trên điện thoại.
// Dùng chung cho MỌI ảnh cần zoom tại chỗ (preview cân, ảnh sản phẩm, …) — KHÔNG fork mỗi nơi.
//
//   const pz = Web2PinchZoom.mount(imgEl, { maxScale: 5 });
//   pz.reset();     // về scale 1 (gọi khi đổi ảnh)
//   pz.destroy();   // gỡ listener
//
// Yêu cầu: imgEl nằm trong 1 container overflow:hidden (viewport clip). Transform chỉ dùng
// transform/opacity (compositor-friendly). Nhả tay mà chưa zoom (scale≈1) → tự về giữa.
(function (global) {
    'use strict';
    if (global.Web2PinchZoom) return;

    function mount(el, opts) {
        opts = opts || {};
        const MAX = opts.maxScale || 4;
        let scale = 1,
            tx = 0,
            ty = 0,
            st = null;

        el.style.touchAction = 'none'; // JS tự xử lý cử chỉ (trang đã maximum-scale=1)
        el.style.transformOrigin = '0 0';
        el.style.willChange = 'transform';

        const frame = () => (el.parentElement || el).getBoundingClientRect(); // khung ổn định (không bị transform)
        const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        function midIn(t, r) {
            return {
                x: (t[0].clientX + t[1].clientX) / 2 - r.left,
                y: (t[0].clientY + t[1].clientY) / 2 - r.top,
            };
        }
        function apply() {
            el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        }
        function clampPan() {
            const p = el.parentElement || el;
            const w = p.clientWidth,
                h = p.clientHeight;
            tx = Math.min(0, Math.max(w - w * scale, tx)); // không kéo lố mép ảnh
            ty = Math.min(0, Math.max(h - h * scale, ty));
        }
        function reset() {
            scale = 1;
            tx = 0;
            ty = 0;
            apply();
        }

        function onStart(e) {
            const t = e.touches;
            if (t.length === 2) {
                e.preventDefault();
                st = {
                    mode: 'pinch',
                    d0: dist(t) || 1,
                    s0: scale,
                    f: midIn(t, frame()),
                    tx0: tx,
                    ty0: ty,
                };
            } else if (t.length === 1 && scale > 1) {
                st = { mode: 'pan', x0: t[0].clientX, y0: t[0].clientY, tx0: tx, ty0: ty };
            } else {
                st = null;
            }
        }
        function onMove(e) {
            if (!st) return;
            const t = e.touches;
            if (st.mode === 'pinch' && t.length === 2) {
                e.preventDefault();
                const m = midIn(t, frame());
                scale = Math.min(MAX, Math.max(1, (st.s0 * dist(t)) / st.d0));
                // giữ điểm giữa 2 ngón cố định khi zoom: c = (f − tx0)/s0
                const cx = (st.f.x - st.tx0) / st.s0;
                const cy = (st.f.y - st.ty0) / st.s0;
                tx = m.x - cx * scale;
                ty = m.y - cy * scale;
                clampPan();
                apply();
            } else if (st.mode === 'pan' && t.length === 1) {
                e.preventDefault();
                tx = st.tx0 + (t[0].clientX - st.x0);
                ty = st.ty0 + (t[0].clientY - st.y0);
                clampPan();
                apply();
            }
        }
        function onEnd(e) {
            if (e.touches.length === 0) {
                st = null;
                if (scale <= 1.02) reset(); // nhả tay chưa zoom → về giữa
            } else if (e.touches.length === 1 && scale > 1) {
                st = {
                    mode: 'pan',
                    x0: e.touches[0].clientX,
                    y0: e.touches[0].clientY,
                    tx0: tx,
                    ty0: ty,
                };
            } else {
                st = null;
            }
        }

        el.addEventListener('touchstart', onStart, { passive: false });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd);
        el.addEventListener('touchcancel', onEnd);
        reset();

        return {
            reset,
            isZoomed: () => scale > 1.02,
            destroy() {
                el.removeEventListener('touchstart', onStart);
                el.removeEventListener('touchmove', onMove);
                el.removeEventListener('touchend', onEnd);
                el.removeEventListener('touchcancel', onEnd);
                el.style.transform = '';
                el.style.touchAction = '';
                el.style.willChange = '';
                el.style.transformOrigin = '';
            },
        };
    }

    global.Web2PinchZoom = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
