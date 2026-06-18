// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Studio chụp tách nền — giao diện camera-app mobile-first. (Orchestrator)
 *
 * Luồng: Camera (live) → Chụp → Xem (review) → chọn nền + Lưu ảnh.
 *  - Mode "AI nét" (mặc định): tách nền chất lượng cao. Engine 'auto' = PhotoRoom
 *    cloud, tự fallback @imgly on-device nếu lỗi/mất mạng. 'local' = luôn @imgly.
 *  - Mode "AI nhanh": MediaPipe realtime (xem trước trực tiếp).
 *  - Mode "Phông xanh": chroma key.
 *
 * Tách nền tạo ra "cutout" (chủ thể nền trong suốt). Màn Xem ghép cutout với nền
 * (trong suốt/màu/ảnh/mờ) theo thời gian thực — đổi nền không cần tách lại.
 * Lưu ảnh qua Web Share API (vào Ảnh điện thoại) → fallback tải về.
 *
 * Không backend cho on-device; cloud chỉ proxy PhotoRoom. Ảnh không lưu ở server.
 *
 * File này CHỈ điều phối + khởi tạo. Logic tách ra các module nạp trước theo thứ tự:
 *   photo-studio-state.js  → window.PS base (state/const/util)
 *   photo-studio-canvas.js → tiện ích canvas/ảnh + vẽ nền + chroma
 *   photo-studio-bg.js     → engine tách nền (MediaPipe/cloud/@imgly/upscale/SAM)
 *   photo-studio-edit.js   → chụp → review → brush/pick/lưu/hàng loạt
 *   photo-studio-ui.js     → camera, hàng nền, logo, mode/sheet, cache+bind
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ---- Init -----------------------------------------------------------
    function init() {
        const state = PS.state,
            el = PS.el;
        PS.cache();
        if (!el.output) return;
        PS.octx = el.output.getContext('2d', { willReadFrequently: true });
        PS.rctx = el.reviewCanvas.getContext('2d');
        PS.work = document.createElement('canvas');
        PS.workCtx = PS.work.getContext('2d', { willReadFrequently: true });
        PS.maskC = document.createElement('canvas');
        PS.maskCtx = PS.maskC.getContext('2d');
        PS.segInput = document.createElement('canvas');
        PS.segInputCtx = PS.segInput.getContext('2d');
        PS.maskRaw = document.createElement('canvas');
        PS.maskRawCtx = PS.maskRaw.getContext('2d');
        PS.bind();
        PS.initSegmentation();
        PS.applyMobileDefaults();
        PS.loadSavedBgs();
        PS.renderBgRows();
        PS.loadLogo();
        el.qualityWrap.style.display = 'none'; // PNG mặc định → ẩn thanh chất lượng
        PS.setMode('ai');
        PS.autoStartIfAllowed();
    }

    PS.init = init;
    global.PhotoStudio = { init };
})(typeof window !== 'undefined' ? window : globalThis);
