// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Studio — tiện ích canvas/ảnh + vẽ nền + chroma key.
 *
 * Hàm thuần pixel/canvas: chuyển đổi ảnh↔canvas↔blob, vẽ nền (màu/ảnh/mờ/preset),
 * chroma keyOut, silhouette/bóng/logo. Không đụng UI hay engine AI.
 * Gắn vào `window.PS`; đọc `PS.state` cho tham số nền/khử phông.
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ---- Image ↔ canvas ↔ blob ------------------------------------------
    PS.imgToCanvas = function (img, W, H) {
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        cv.getContext('2d').drawImage(img, 0, 0, W, H);
        if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
        return cv;
    };
    PS.canvasToBlob = function (canvas, type, q) {
        return new Promise((res) => canvas.toBlob(res, type, q));
    };
    PS.loadImageSrc = function (src) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => rej(new Error('Không tải được ảnh kết quả'));
            img.src = src;
        });
    };
    PS.blobToImage = function (blob) {
        return new Promise((res, rej) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            // Revoke ngay khi decode xong/lỗi: bitmap đã nằm trong bộ nhớ,
            // không ai đọc lại img.src → tránh rò blob: URL (OOM mobile).
            img.onload = () => {
                URL.revokeObjectURL(url);
                res(img);
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                rej(e);
            };
            img.src = url;
        });
    };
    PS.fileToImage = function (file) {
        return new Promise((res, rej) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                res(img);
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                rej(e);
            };
            img.src = url;
        });
    };

    // ---- Chroma key -----------------------------------------------------
    PS.keyOut = function (img, key, threshold, smooth, spill) {
        const d = img.data;
        const MAXD = 441.6729559;
        const lo = threshold * MAXD;
        const hi = (threshold + smooth) * MAXD;
        const span = Math.max(1, hi - lo);
        const dom = key.r >= key.g && key.r >= key.b ? 0 : key.g >= key.b ? 1 : 2;
        const a = dom === 0 ? 1 : 0;
        const b = dom === 2 ? 1 : 2;
        for (let i = 0; i < d.length; i += 4) {
            const dr = d[i] - key.r,
                dg = d[i + 1] - key.g,
                db = d[i + 2] - key.b;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist <= lo) {
                d[i + 3] = 0;
                continue;
            } else if (dist < hi) {
                d[i + 3] = Math.round(((dist - lo) / span) * d[i + 3]);
            }
            if (spill && d[i + 3] > 0) {
                const cap = (d[i + a] + d[i + b]) / 2;
                if (d[i + dom] > cap) d[i + dom] = cap;
            }
        }
    };

    // ---- Background draw -------------------------------------------------
    PS.drawBg = function (ctx, W, H, frameEl, crop) {
        const state = PS.state;
        if (state.bgType === 'color') {
            ctx.fillStyle = state.bgColor;
            ctx.fillRect(0, 0, W, H);
        } else if (state.bgType === 'image' && state.bgImage) {
            PS.drawCover(ctx, state.bgImage, W, H);
        } else if (state.bgType === 'blur' && frameEl) {
            ctx.save();
            ctx.filter = `blur(${state.blurStrength}px)`;
            const pad = Math.ceil(state.blurStrength * 1.5);
            ctx.drawImage(
                frameEl,
                crop.sx,
                crop.sy,
                crop.sw,
                crop.sh,
                -pad,
                -pad,
                W + pad * 2,
                H + pad * 2
            );
            ctx.restore();
        } else if (state.bgType === 'preset') {
            PS.drawPreset(ctx, W, H, state.bgPreset);
        }
    };

    PS.drawPreset = function (ctx, W, H, id) {
        const p = PS.PRESETS.find((x) => x.id === id);
        if (!p) return;
        let g;
        if (p.kind === 'radial') {
            g = ctx.createRadialGradient(
                W / 2,
                H * 0.42,
                0,
                W / 2,
                H * 0.42,
                Math.hypot(W, H) * 0.62
            );
        } else {
            g = ctx.createLinearGradient(0, 0, 0, H);
        }
        p.stops.forEach(([o, c]) => g.addColorStop(o, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    };

    PS.drawCover = function (ctx, img, W, H) {
        const iw = img.naturalWidth || img.width,
            ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;
        const scale = Math.max(W / iw, H / ih);
        ctx.drawImage(img, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
    };

    // ---- Silhouette / shadow / logo -------------------------------------
    /** Silhouette đen của cutout (cho bóng đổ). */
    PS.buildSilhouette = function (cutout, W, H) {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        x.drawImage(cutout, 0, 0);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = '#000';
        x.fillRect(0, 0, W, H);
        return c;
    };

    PS.drawShadow = function (ctx, W, H) {
        const state = PS.state;
        if (!state._sil) return;
        const soft = state.shadowSoft;
        const dy = Math.round(soft * 0.55 + H * 0.012); // bóng đổ xuống dưới
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.filter = `blur(${soft}px)`;
        ctx.drawImage(state._sil, 0, dy, W, H);
        ctx.restore();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
    };

    PS.drawLogo = function (ctx, W, H) {
        const state = PS.state;
        const img = state.logoImg;
        if (!img) return;
        const lw = Math.round(W * 0.2);
        const lh = Math.round(lw * (img.naturalHeight / img.naturalWidth || 1));
        const m = Math.round(W * 0.03);
        let x = W - lw - m,
            y = H - lh - m; // br
        if (state.logoPos === 'bl') x = m;
        else if (state.logoPos === 'tr') y = m;
        else if (state.logoPos === 'tl') {
            x = m;
            y = m;
        }
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, x, y, lw, lh);
        ctx.restore();
    };
})(typeof window !== 'undefined' ? window : globalThis);
