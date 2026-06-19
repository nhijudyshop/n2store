// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoBeautyRender — áp BEAUTY cho 1 KHUNG HÌNH video lên canvas, tái dùng
 * engine ảnh: lọc màu (ctx.filter) + mịn da/trắng da (Web2BeautyFilters skin) +
 * chỉnh mặt (Web2BeautyFace landmarks → Web2BeautyFilters.warp). 100% on-device.
 *
 *   applyFrame(srcEl, work, wctx, settings, det?)  — vẽ + làm đẹp 1 khung
 *     srcEl    : <video> | canvas | image (nguồn khung)
 *     work     : canvas đích (đặt width/height = độ phân giải xuất)
 *     settings : { filter, smooth, whiten, warmth, face }
 *     det      : kết quả Web2BeautyFace.detect(work) (chỉ render-pass chỉnh mặt)
 *
 * Preview realtime: gọi không có det (mịn da + lọc màu). Render-pass (chỉnh mặt):
 * detect trên work TRƯỚC rồi truyền det vào.
 */
(function (global) {
    'use strict';
    if (global.Web2VideoBeautyRender) return;

    const FILTERS = {
        none: 'none',
        vivid: 'saturate(1.4) contrast(1.08)',
        warm: 'sepia(0.28) saturate(1.2) brightness(1.03)',
        cool: 'saturate(1.12) brightness(1.02) hue-rotate(-12deg)',
        bw: 'grayscale(1) contrast(1.06)',
        vintage: 'sepia(0.45) contrast(0.95) brightness(1.06) saturate(0.9)',
    };
    const FILTER_LIST = [
        ['none', 'Gốc'],
        ['vivid', 'Tươi'],
        ['warm', 'Ấm'],
        ['cool', 'Lạnh'],
        ['bw', 'Đen trắng'],
        ['vintage', 'Cổ điển'],
    ];

    function needsSkin(s) {
        return s.smooth > 0 || s.whiten > 0 || Math.abs(s.warmth || 0) > 0.001;
    }

    function applyFrame(srcEl, work, wctx, s, det) {
        const W = work.width;
        const H = work.height;
        // 1) vẽ khung + lọc màu (GPU, nhanh)
        wctx.filter = FILTERS[s.filter] || 'none';
        try {
            wctx.drawImage(srcEl, 0, 0, W, H);
        } catch (e) {
            wctx.filter = 'none';
            return;
        }
        wctx.filter = 'none';

        const F = global.Web2BeautyFilters;
        const skin = F && needsSkin(s);
        const face = F && global.Web2BeautyFace && (s.face || 0) > 0 && det;
        if (!skin && !face) return;

        let img = wctx.getImageData(0, 0, W, H);
        if (skin) {
            const mask = F.buildSkinMask(img);
            if (s.smooth > 0) F.smoothSkin(img, mask, { intensity: s.smooth });
            if (s.whiten > 0 || Math.abs(s.warmth || 0) > 0.001)
                F.adjustSkinTone(img, mask, {
                    brighten: s.whiten || 0,
                    warmth: s.warmth || 0,
                    saturation: 0,
                });
        }
        if (face) {
            const brushes = global.Web2BeautyFace.buildAutoBrushes(det, s.face);
            if (brushes.length) img = F.warp(img, brushes);
        }
        wctx.putImageData(img, 0, 0);
    }

    global.Web2VideoBeautyRender = { applyFrame, FILTERS, FILTER_LIST, needsSkin };
})(window);
