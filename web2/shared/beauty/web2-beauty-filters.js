// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — beauty engine (pure pixel ops).
// =====================================================================
// Web2BeautyFilters — NHÂN XỬ LÝ ẢNH thuần (canvas ImageData), KHÔNG lib,
// 100% on-device. Dùng chung cho Studio làm đẹp + mọi trang Web 2.0 cần
// liquify / mịn da / chỉnh tông da / kéo dài (band-scale).
//
// API (window.Web2BeautyFilters):
//   warp(srcImageData, brushes) -> ImageData            // liquify backward-map
//   buildSkinMask(imageData, opt?) -> Float32Array      // xác suất da 0..1
//   smoothSkin(imageData, mask, opt?) -> imageData      // mịn da (giữ chi tiết)
//   adjustSkinTone(imageData, mask, opt?) -> imageData  // sáng/ấm/đều màu da
//   beautify(imageData, strength) -> imageData          // mask+smooth+tone 1 chạm
//   stretchBand(srcCanvasOrImg, y0, y1, factor, opt?) -> canvas  // kéo dài dọc
//
// brushes: [{type:'bloat'|'pucker'|'push', cx,cy,r,strength, dirX?,dirY?}]
//   cx,cy,r = PIXEL. strength ~0..1. dirX,dirY = unit vector (chỉ 'push').
// Nguồn tham khảo: GPUImage bulge/pinch, Photoshop liquify, YCbCr skin (Cb
// 77-127, Cr 133-173), frequency-separation lite, native drawImage band-scale.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2BeautyFilters) return;

    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    function rgb2ycbcr(r, g, b) {
        return [
            0.299 * r + 0.587 * g + 0.114 * b,
            128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
            128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
        ];
    }

    // ───────────────────────── LIQUIFY (backward-map) ──────────────────────
    // Lấy mẫu song tuyến + CLAMP viền → không bao giờ NaN / lỗ đen.
    function sampleBilinear(src, w, h, x, y, out) {
        if (x < 0) x = 0;
        else if (x > w - 1) x = w - 1;
        if (y < 0) y = 0;
        else if (y > h - 1) y = h - 1;
        const x0 = x | 0;
        const y0 = y | 0;
        const x1 = x0 + 1 < w ? x0 + 1 : x0;
        const y1 = y0 + 1 < h ? y0 + 1 : y0;
        const fx = x - x0;
        const fy = y - y0;
        const i00 = (y0 * w + x0) << 2;
        const i10 = (y0 * w + x1) << 2;
        const i01 = (y1 * w + x0) << 2;
        const i11 = (y1 * w + x1) << 2;
        for (let c = 0; c < 4; c++) {
            const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
            const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
            out[c] = top * (1 - fy) + bot * fy;
        }
    }

    // 1 brush: từ điểm ĐÍCH (x,y) → toạ độ NGUỒN cần lấy mẫu. Falloff (1-d/r)^2.
    function applyBrushBackward(b, x, y, o) {
        const dx = x - b.cx;
        const dy = y - b.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= b.r) {
            o.x = x;
            o.y = y;
            return;
        }
        const t = d / b.r;
        const f = (1 - t) * (1 - t);
        if (b.type === 'bloat') {
            const k = 1 - b.strength * f; // k<1 → phóng to
            o.x = b.cx + dx * k;
            o.y = b.cy + dy * k;
        } else if (b.type === 'pucker') {
            const k = 1 + b.strength * f; // k>1 → thu nhỏ
            o.x = b.cx + dx * k;
            o.y = b.cy + dy * k;
        } else if (b.type === 'push') {
            const m = b.strength * b.r * f;
            o.x = x - b.dirX * m;
            o.y = y - b.dirY * m;
        } else {
            o.x = x;
            o.y = y;
        }
    }

    // Backward map toàn ảnh, CHAIN nhiều brush → 1 ImageData mới (bất biến).
    function warp(srcImageData, brushes) {
        const w = srcImageData.width;
        const h = srcImageData.height;
        const src = srcImageData.data;
        const dst = new ImageData(w, h);
        const out = dst.data;
        const px = [0, 0, 0, 0];
        const o = { x: 0, y: 0 };
        const n = brushes.length;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let sx = x;
                let sy = y;
                for (let i = 0; i < n; i++) {
                    applyBrushBackward(brushes[i], sx, sy, o);
                    sx = o.x;
                    sy = o.y;
                }
                sampleBilinear(src, w, h, sx, sy, px);
                const di = (y * w + x) << 2;
                out[di] = px[0];
                out[di + 1] = px[1];
                out[di + 2] = px[2];
                out[di + 3] = px[3];
            }
        }
        return dst;
    }

    // ───────────────────────── BOX BLUR (separable, O(W*H)) ────────────────
    function boxBlurH(src, dst, W, H, r) {
        const norm = 1 / (r + r + 1);
        for (let y = 0; y < H; y++) {
            const row = y * W;
            let sum = 0;
            for (let i = -r; i <= r; i++) sum += src[row + Math.min(W - 1, Math.max(0, i))];
            for (let x = 0; x < W; x++) {
                dst[row + x] = sum * norm;
                sum += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
            }
        }
    }
    function boxBlurV(src, dst, W, H, r) {
        const norm = 1 / (r + r + 1);
        for (let x = 0; x < W; x++) {
            let sum = 0;
            for (let i = -r; i <= r; i++) sum += src[x + Math.min(H - 1, Math.max(0, i)) * W];
            for (let y = 0; y < H; y++) {
                dst[x + y * W] = sum * norm;
                sum += src[x + Math.min(H - 1, y + r + 1) * W] - src[x + Math.max(0, y - r) * W];
            }
        }
    }
    function boxBlurFloat(src, W, H, radius, passes) {
        if (radius < 1) return src.slice();
        passes = passes || 3;
        let a = src.slice();
        const b = new Float32Array(W * H);
        for (let p = 0; p < passes; p++) {
            boxBlurH(a, b, W, H, radius);
            boxBlurV(b, a, W, H, radius);
        }
        return a;
    }

    // ───────────────────────── SKIN: mask / smooth / tone ──────────────────
    function buildSkinMask(imageData, opt) {
        opt = opt || {};
        const W = imageData.width;
        const H = imageData.height;
        const d = imageData.data;
        const CB_MIN = opt.cbMin ?? 77;
        const CB_MAX = opt.cbMax ?? 127;
        const CR_MIN = opt.crMin ?? 133;
        const CR_MAX = opt.crMax ?? 173;
        const SOFT = opt.softness ?? 12;
        const featherPx = opt.feather ?? Math.max(2, Math.round(W / 220));
        const raw = new Float32Array(W * H);
        const bandFn = (v, lo, hi) => {
            if (v >= lo && v <= hi) return 1;
            if (v < lo) return clamp01(1 - (lo - v) / SOFT);
            return clamp01(1 - (v - hi) / SOFT);
        };
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const yc = rgb2ycbcr(r, g, b);
            let prob = bandFn(yc[1], CB_MIN, CB_MAX) * bandFn(yc[2], CR_MIN, CR_MAX);
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            const rgbOk =
                r > 95 &&
                g > 40 &&
                b > 20 &&
                mx - mn > 15 &&
                Math.abs(r - g) > 15 &&
                r > g &&
                r > b;
            if (!rgbOk) prob *= 0.55;
            raw[p] = prob;
        }
        return boxBlurFloat(raw, W, H, featherPx, 2);
    }

    function smoothSkin(imageData, mask, opt) {
        opt = opt || {};
        const W = imageData.width;
        const H = imageData.height;
        const d = imageData.data;
        const intensity = clamp01(opt.intensity ?? 0.6);
        if (intensity <= 0) return imageData;
        const radius = opt.radius ?? Math.max(2, Math.round(W / 320));
        const edgeKeep = opt.edgeKeep ?? 18;
        const detailBack = clamp01(opt.detail ?? 0.35);
        const N = W * H;
        const R = new Float32Array(N);
        const G = new Float32Array(N);
        const B = new Float32Array(N);
        const Yl = new Float32Array(N);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            R[p] = d[i];
            G[p] = d[i + 1];
            B[p] = d[i + 2];
            Yl[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        const Rb = boxBlurFloat(R, W, H, radius, 3);
        const Gb = boxBlurFloat(G, W, H, radius, 3);
        const Bb = boxBlurFloat(B, W, H, radius, 3);
        const Yb = boxBlurFloat(Yl, W, H, radius, 3);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const m = mask[p];
            if (m <= 0.01) continue;
            const lumaDelta = Math.abs(Yl[p] - Yb[p]);
            const edgeKeepF = clamp01(1 - lumaDelta / edgeKeep);
            const t = m * intensity * edgeKeepF;
            let nr = R[p] + (Rb[p] - R[p]) * t;
            let ng = G[p] + (Gb[p] - G[p]) * t;
            let nb = B[p] + (Bb[p] - B[p]) * t;
            if (detailBack > 0) {
                const hf = detailBack * t;
                nr += (R[p] - Rb[p]) * hf;
                ng += (G[p] - Gb[p]) * hf;
                nb += (B[p] - Bb[p]) * hf;
            }
            d[i] = clamp255(nr);
            d[i + 1] = clamp255(ng);
            d[i + 2] = clamp255(nb);
        }
        return imageData;
    }

    function adjustSkinTone(imageData, mask, opt) {
        opt = opt || {};
        const d = imageData.data;
        const brighten = opt.brighten ?? 0;
        const warmth = opt.warmth ?? 0;
        const sat = opt.saturation ?? 0;
        let sCb = 0;
        let sCr = 0;
        let n = 0;
        if (sat < 0) {
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                const m = mask[p];
                if (m < 0.4) continue;
                const yc = rgb2ycbcr(d[i], d[i + 1], d[i + 2]);
                sCb += yc[1] * m;
                sCr += yc[2] * m;
                n += m;
            }
            if (n > 0) {
                sCb /= n;
                sCr /= n;
            }
        }
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const m = mask[p];
            if (m <= 0.01) continue;
            const yc = rgb2ycbcr(d[i], d[i + 1], d[i + 2]);
            let Y = yc[0];
            let cb = yc[1];
            let cr = yc[2];
            if (brighten) Y = Y + (255 - Y) * (brighten * m);
            if (warmth) {
                const w = warmth * m * 12;
                cb -= w;
                cr += w;
            }
            if (sat > 0) {
                cb = 128 + (cb - 128) * (1 + sat * m);
                cr = 128 + (cr - 128) * (1 + sat * m);
            } else if (sat < 0 && n > 0) {
                const a = -sat * m;
                cb += (sCb - cb) * a;
                cr += (sCr - cr) * a;
            }
            d[i] = clamp255(Y + 1.402 * (cr - 128));
            d[i + 1] = clamp255(Y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128));
            d[i + 2] = clamp255(Y + 1.772 * (cb - 128));
        }
        return imageData;
    }

    // Làm đẹp 1 chạm: mask → mịn da → sáng/ấm/đều màu nhẹ.
    function beautify(imageData, strength) {
        const s = clamp01(strength ?? 0.6);
        const mask = buildSkinMask(imageData);
        smoothSkin(imageData, mask, { intensity: s });
        adjustSkinTone(imageData, mask, {
            brighten: 0.12 * s,
            warmth: 0.05,
            saturation: -0.15 * s,
        });
        return imageData;
    }

    // ───────────────────────── BAND-SCALE (kéo dài / thu gọn) ──────────────
    function _blurSeam(ctx, canvas, yc, seam) {
        const W = canvas.width;
        const H = canvas.height;
        const y = Math.round(yc - seam);
        const h = seam * 2;
        if (y < 0 || y + h > H || h <= 0) return;
        const tmp = document.createElement('canvas');
        tmp.width = W;
        tmp.height = h;
        tmp.getContext('2d').drawImage(canvas, 0, y, W, h, 0, 0, W, h);
        ctx.save();
        ctx.filter = `blur(${Math.max(1, seam / 3)}px)`;
        ctx.drawImage(tmp, 0, y);
        ctx.restore();
        ctx.filter = 'none';
    }

    // Kéo dãn DỌC dải ngang y0..y1 theo factor (top giữ nguyên, bottom dời xuống).
    function stretchBand(src, y0, y1, factor, opt) {
        opt = opt || {};
        const W = src.naturalWidth || src.width;
        const H = src.naturalHeight || src.height;
        const seam = opt.seam ?? 6;
        y0 = Math.max(0, Math.min(H, Math.round(y0)));
        y1 = Math.max(0, Math.min(H, Math.round(y1)));
        if (y1 < y0) {
            const t = y0;
            y0 = y1;
            y1 = t;
        }
        if (!isFinite(factor) || factor <= 0 || y1 === y0) {
            const c0 = document.createElement('canvas');
            c0.width = W;
            c0.height = H;
            c0.getContext('2d').drawImage(src, 0, 0);
            return c0;
        }
        const bandH = y1 - y0;
        const newBandH = Math.max(0, Math.round(bandH * factor));
        const added = newBandH - bandH;
        const outH = H + added;
        const out = document.createElement('canvas');
        out.width = W;
        out.height = outH;
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (y0 > 0) ctx.drawImage(src, 0, 0, W, y0, 0, 0, W, y0);
        if (bandH > 0 && newBandH > 0) ctx.drawImage(src, 0, y0, W, bandH, 0, y0, W, newBandH);
        if (y1 < H) ctx.drawImage(src, 0, y1, W, H - y1, 0, y0 + newBandH, W, H - y1);
        if (seam > 0) {
            _blurSeam(ctx, out, y0, seam);
            _blurSeam(ctx, out, y0 + newBandH, seam);
        }
        return out;
    }

    global.Web2BeautyFilters = {
        warp,
        buildSkinMask,
        smoothSkin,
        adjustSkinTone,
        beautify,
        stretchBand,
        _sampleBilinear: sampleBilinear,
    };
})(window);
