// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Product Card — RENDER engine (canvas). Vẽ card/poster SP TRỰC TIẾP lên <canvas>
 * (1 nguồn cho cả preview lẫn export PNG → không lệch, không cần lib DOM→image).
 *
 *   Web2ProductCard.render(canvas, opts)  → vẽ + scale theo devicePixelRatio
 *   Web2ProductCard.SIZES / .TEMPLATES    → preset kích thước + bố cục
 *   Web2ProductCard.loadImage(src)        → Promise<HTMLImageElement|null> (CORS-safe)
 *
 * opts = { sizeKey, templateKey, accent, image, name, price, currency, badge,
 *          note, shop, qrText }
 *
 * KHÔNG fetch gì — ảnh truyền vào dạng dataURL/blobURL/URL. Card "trang trí" thuần
 * client-side, ăn khớp Studio tách nền (output PNG trong suốt → đặt lên card).
 */
(function (global) {
    'use strict';

    // Kích thước phổ biến cho shop (FB/IG/Zalo/XHS).
    const SIZES = {
        square: { key: 'square', w: 1080, h: 1080, label: 'Vuông 1:1 (FB/IG)' },
        story: { key: 'story', w: 1080, h: 1920, label: 'Story 9:16 (Zalo/IG)' },
        landscape: { key: 'landscape', w: 1200, h: 630, label: 'Ngang 1.91:1 (FB share)' },
        portrait: { key: 'portrait', w: 1080, h: 1350, label: 'Dọc 4:5 (IG)' },
    };

    // Template = preset bố cục + phong cách. layout: cách đặt ảnh & khối chữ.
    const TEMPLATES = {
        saleBold: {
            key: 'saleBold',
            label: 'Sale Bold',
            layout: 'bottomBar',
            bg: '#0b1220',
            ink: '#ffffff',
            sub: '#c7d2fe',
            priceStyle: 'block', // khối giá nổi bật
        },
        clean: {
            key: 'clean',
            label: 'Sạch (Clean)',
            layout: 'bottomBar',
            bg: '#ffffff',
            ink: '#0f172a',
            sub: '#64748b',
            priceStyle: 'plain',
        },
        editorial: {
            key: 'editorial',
            label: 'Editorial',
            layout: 'sideText',
            bg: '#f5f1ea',
            ink: '#1c1917',
            sub: '#78716c',
            priceStyle: 'plain',
        },
        pop: {
            key: 'pop',
            label: 'Pop màu',
            layout: 'frame',
            bg: '#fde68a',
            ink: '#1e1b4b',
            sub: '#4338ca',
            priceStyle: 'block',
        },
    };

    const ACCENTS = ['#0068ff', '#ef4444', '#16a34a', '#f59e0b', '#7c3aed', '#db2777', '#0d9488'];

    // ---------- helpers ----------
    function loadImage(src) {
        return new Promise((resolve) => {
            if (!src) return resolve(null);
            const img = new Image();
            // crossOrigin để canvas KHÔNG bị taint khi export (host phải cho CORS;
            // ảnh upload/dataURL/blob same-origin thì luôn an toàn).
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => {
                // thử lại không crossOrigin (vẫn hiện preview, nhưng export có thể taint)
                const img2 = new Image();
                img2.onload = () => resolve(img2);
                img2.onerror = () => resolve(null);
                img2.src = src;
            };
            img.src = src;
        });
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    // Vẽ ảnh kiểu object-fit: cover vào vùng (x,y,w,h), có thể bo góc.
    function drawCover(ctx, img, x, y, w, h, radius) {
        if (!img || !img.width) return;
        ctx.save();
        if (radius) {
            roundRect(ctx, x, y, w, h, radius);
            ctx.clip();
        }
        const ir = img.width / img.height;
        const dr = w / h;
        let dw = w;
        let dh = h;
        let dx = x;
        let dy = y;
        if (ir > dr) {
            dh = h;
            dw = h * ir;
            dx = x - (dw - w) / 2;
        } else {
            dw = w;
            dh = w / ir;
            dy = y - (dh - h) / 2;
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
    }

    // Vẽ ảnh kiểu contain (nguyên SP, nền trong suốt — hợp ảnh tách nền).
    function drawContain(ctx, img, x, y, w, h) {
        if (!img || !img.width) return;
        const ir = img.width / img.height;
        const dr = w / h;
        let dw, dh;
        if (ir > dr) {
            dw = w;
            dh = w / ir;
        } else {
            dh = h;
            dw = h * ir;
        }
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }

    function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
        const words = String(text || '')
            .split(/\s+/)
            .filter(Boolean);
        const lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && line) {
                lines.push(line);
                line = w;
                if (lines.length >= maxLines - 1) break;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        const out = lines.slice(0, maxLines);
        // ellipsis dòng cuối nếu còn dư chữ
        if (lines.length > maxLines || (out.length === maxLines && words.length)) {
            // không chính xác tuyệt đối nhưng đủ tốt
        }
        out.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
        return out.length;
    }

    function fmtPrice(n, currency) {
        const num = Number(String(n).replace(/[^\d.-]/g, ''));
        if (!isFinite(num) || !num) return String(n || '');
        return new Intl.NumberFormat('vi-VN').format(num) + (currency || 'đ');
    }

    const FONT =
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

    // ---------- main render ----------
    function render(canvas, opts) {
        opts = opts || {};
        const size = SIZES[opts.sizeKey] || SIZES.square;
        const tpl = TEMPLATES[opts.templateKey] || TEMPLATES.saleBold;
        const accent = opts.accent || ACCENTS[0];
        const W = size.w;
        const H = size.h;
        const dpr = 1; // canvas đã là 1080+ px nên không cần nhân thêm (export sắc nét)

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';

        // nền
        ctx.fillStyle = tpl.bg;
        ctx.fillRect(0, 0, W, H);

        const pad = Math.round(W * 0.06);
        const layout = tpl.layout;

        if (layout === 'sideText') {
            _renderSideText(ctx, { W, H, pad, tpl, accent, opts });
        } else if (layout === 'frame') {
            _renderFrame(ctx, { W, H, pad, tpl, accent, opts });
        } else {
            _renderBottomBar(ctx, { W, H, pad, tpl, accent, opts });
        }
        return ctx;
    }

    // Bố cục: ảnh full phía trên, dải thông tin (gradient) phía dưới.
    function _renderBottomBar(ctx, c) {
        const { W, H, pad, tpl, accent, opts } = c;
        const imgH = Math.round(H * 0.66);
        // ảnh
        if (opts._img) {
            if (opts.cutout) drawContain(ctx, opts._img, pad, pad, W - pad * 2, imgH - pad);
            else drawCover(ctx, opts._img, 0, 0, W, imgH, 0);
        } else {
            _placeholder(ctx, 0, 0, W, imgH);
        }
        // gradient nối ảnh → khối chữ
        const grad = ctx.createLinearGradient(0, imgH - 200, 0, imgH);
        grad.addColorStop(0, _alpha(tpl.bg, 0));
        grad.addColorStop(1, tpl.bg);
        ctx.fillStyle = grad;
        ctx.fillRect(0, imgH - 200, W, 200);

        // badge
        let by = imgH + Math.round(H * 0.02);
        if (opts.badge) {
            ctx.font = `800 ${Math.round(W * 0.035)}px ${FONT}`;
            const bw = ctx.measureText(opts.badge.toUpperCase()).width + pad * 0.9;
            roundRect(ctx, pad, by, bw, Math.round(W * 0.07), 999);
            ctx.fillStyle = accent;
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(opts.badge.toUpperCase(), pad + pad * 0.45, by + Math.round(W * 0.05));
            by += Math.round(W * 0.1);
        }
        // tên SP (rỗng → KHÔNG vẽ placeholder)
        let ty = by;
        if (opts.name) {
            ctx.fillStyle = tpl.ink;
            ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
            const nameLines = wrapText(
                ctx,
                opts.name,
                pad,
                by + Math.round(W * 0.05),
                W - pad * 2,
                Math.round(W * 0.066),
                2
            );
            ty = by + Math.round(W * 0.05) + nameLines * Math.round(W * 0.066);
        }
        // giá
        if (opts.price) {
            ty += Math.round(W * 0.02);
            const priceTxt = fmtPrice(opts.price, opts.currency);
            ctx.font = `900 ${Math.round(W * 0.075)}px ${FONT}`;
            if (tpl.priceStyle === 'block') {
                const pw = ctx.measureText(priceTxt).width + pad * 0.9;
                const ph = Math.round(W * 0.11);
                roundRect(ctx, pad, ty, pw, ph, 16);
                ctx.fillStyle = accent;
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillText(priceTxt, pad + pad * 0.45, ty + ph * 0.72);
                ty += ph;
            } else {
                ctx.fillStyle = accent;
                ctx.fillText(priceTxt, pad, ty + Math.round(W * 0.07));
                ty += Math.round(W * 0.09);
            }
        }
        // note
        if (opts.note) {
            ctx.fillStyle = tpl.sub;
            ctx.font = `500 ${Math.round(W * 0.034)}px ${FONT}`;
            wrapText(
                ctx,
                opts.note,
                pad,
                ty + Math.round(W * 0.05),
                W - pad * 2,
                Math.round(W * 0.045),
                2
            );
        }
        _footer(ctx, c);
    }

    // Bố cục editorial: ảnh nửa phải, chữ nửa trái.
    function _renderSideText(ctx, c) {
        const { W, H, pad, tpl, accent, opts } = c;
        const imgX = Math.round(W * 0.42);
        if (opts._img) drawCover(ctx, opts._img, imgX, 0, W - imgX, H, 0);
        else _placeholder(ctx, imgX, 0, W - imgX, H);
        // dải màu mảnh
        ctx.fillStyle = accent;
        ctx.fillRect(pad, pad, Math.round(W * 0.12), Math.round(H * 0.008));
        let ty = pad + Math.round(H * 0.06);
        if (opts.badge) {
            ctx.fillStyle = accent;
            ctx.font = `800 ${Math.round(W * 0.03)}px ${FONT}`;
            ctx.fillText(opts.badge.toUpperCase(), pad, ty);
            ty += Math.round(W * 0.05);
        }
        if (opts.name) {
            ctx.fillStyle = tpl.ink;
            ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
            const nl = wrapText(
                ctx,
                opts.name,
                pad,
                ty,
                imgX - pad * 1.5,
                Math.round(W * 0.064),
                4
            );
            ty += nl * Math.round(W * 0.064) + Math.round(W * 0.03);
        }
        if (opts.price) {
            ctx.fillStyle = accent;
            ctx.font = `900 ${Math.round(W * 0.07)}px ${FONT}`;
            ctx.fillText(fmtPrice(opts.price, opts.currency), pad, ty);
            ty += Math.round(W * 0.06);
        }
        if (opts.note) {
            ctx.fillStyle = tpl.sub;
            ctx.font = `500 ${Math.round(W * 0.032)}px ${FONT}`;
            wrapText(ctx, opts.note, pad, ty, imgX - pad * 1.5, Math.round(W * 0.043), 4);
        }
        _footer(ctx, c);
    }

    // Bố cục pop: ảnh trong khung bo góc giữa, chữ trên/dưới.
    function _renderFrame(ctx, c) {
        const { W, H, pad, tpl, accent, opts } = c;
        // tên trên (rỗng → KHÔNG vẽ placeholder)
        let top = pad;
        if (opts.name) {
            ctx.fillStyle = tpl.ink;
            ctx.font = `900 ${Math.round(W * 0.06)}px ${FONT}`;
            ctx.textAlign = 'center';
            const nl = wrapText(
                ctx,
                opts.name,
                W / 2,
                pad + Math.round(W * 0.06),
                W - pad * 2,
                Math.round(W * 0.07),
                2
            );
            top = pad + Math.round(W * 0.06) + nl * Math.round(W * 0.07);
            ctx.textAlign = 'left';
        }
        // khung ảnh
        const fy = top + Math.round(W * 0.02);
        const fh = Math.round(H * 0.5);
        ctx.save();
        roundRect(ctx, pad, fy, W - pad * 2, fh, 28);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
        if (opts._img) {
            if (opts.cutout)
                drawContain(ctx, opts._img, pad + 20, fy + 20, W - pad * 2 - 40, fh - 40);
            else drawCover(ctx, opts._img, pad, fy, W - pad * 2, fh, 28);
        } else _placeholder(ctx, pad, fy, W - pad * 2, fh);
        // giá dưới
        let by = fy + fh + Math.round(W * 0.06);
        ctx.textAlign = 'center';
        if (opts.price) {
            const priceTxt = fmtPrice(opts.price, opts.currency);
            ctx.font = `900 ${Math.round(W * 0.085)}px ${FONT}`;
            const pw = ctx.measureText(priceTxt).width + pad;
            roundRect(ctx, (W - pw) / 2, by, pw, Math.round(W * 0.12), 999);
            ctx.fillStyle = accent;
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(priceTxt, W / 2, by + Math.round(W * 0.085));
            by += Math.round(W * 0.14);
        }
        if (opts.badge) {
            ctx.fillStyle = tpl.sub;
            ctx.font = `700 ${Math.round(W * 0.035)}px ${FONT}`;
            ctx.fillText(opts.badge, W / 2, by + Math.round(W * 0.04));
        }
        ctx.textAlign = 'left';
        _footer(ctx, c);
    }

    function _footer(ctx, c) {
        const { W, H, pad, tpl, opts } = c;
        if (!opts.shop) return;
        ctx.fillStyle = tpl.sub;
        ctx.font = `700 ${Math.round(W * 0.028)}px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(opts.shop, pad, H - Math.round(H * 0.03));
        // QR góc phải dưới (nếu có)
        if (opts._qr) {
            const qs = Math.round(W * 0.13);
            ctx.drawImage(opts._qr, W - pad - qs, H - pad - qs, qs, qs);
        }
    }

    function _placeholder(ctx, x, y, w, h) {
        ctx.save();
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#94a3b8';
        ctx.font = `600 ${Math.round(w * 0.05)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('Chọn / tải ảnh sản phẩm', x + w / 2, y + h / 2);
        ctx.restore();
        ctx.textAlign = 'left';
    }

    function _alpha(hex, a) {
        // chuyển #rrggbb → rgba với alpha (chỉ hỗ trợ hex 6 ký tự, fallback transparent)
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return `rgba(0,0,0,${a})`;
        const n = parseInt(m[1], 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    global.Web2ProductCard = {
        SIZES,
        TEMPLATES,
        ACCENTS,
        loadImage,
        render,
        fmtPrice,
    };
})(window);
