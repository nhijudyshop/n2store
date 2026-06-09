// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.
// =====================================================================
// Web2QR — NGUỒN DUY NHẤT sinh mã QR cho Web 2.0 (tem sản phẩm + PBH).
//
// Mục tiêu: QR ĐEN TRẮNG (in máy nhiệt / laser đen trắng), nội dung là
// TEXT thuần (mã SP / mã đơn). "Trang trí" = module bo góc + mắt finder
// kiểu styled, NHƯNG vẫn giữ quiet-zone + error-correction để máy quét
// (kể cả tem nhiệt 203dpi) đọc nhạy.
//
// Vì sao tự render SVG thay vì xài canvas của davidshimjs: SVG nét sắc khi
// in raster ESC/POS (Web2Printer.printSvg), scale vô cấp, bo góc tuỳ biến.
// Ta CHỈ mượn davidshimjs để tính MA TRẬN QR (đã vendored qrcode.min.js),
// rồi tự vẽ.
//
// API:
//   Web2QR.ready()                         → Promise (đảm bảo lib QR sẵn sàng)
//   Web2QR.matrix(text, ecLevel?)          → { count, isDark(r,c) }  (sync sau ready)
//   Web2QR.toSvg(text, opts?)              → SVG string (đen trắng)
//   Web2QR.toDataUrl(text, opts?)          → Promise<dataURL PNG>
//   Web2QR.card({ code, caption, sub, ... })→ Promise<SVG string>  (QR + chữ mã)
//   Web2QR.cardDataUrl({ ... })            → Promise<dataURL PNG>
//
// opts (toSvg/toDataUrl):
//   ec        : 'L'|'M'|'Q'|'H'   (default 'M')
//   margin    : số module quiet-zone (default 4 — chuẩn QR, đừng giảm < 2)
//   style     : 'rounded' | 'dots' | 'square'  (default 'rounded')
//   radius    : 0..0.5 bo góc module rounded (default 0.30)
//   styledEye : bool  mắt finder kiểu viền bo (default true)
//   dark      : màu module (default '#000')
//   light     : màu nền  (default '#fff'; '' = trong suốt)
//   pxPerCell : px mỗi module khi toDataUrl (default 12)
//   centerLabel: chữ (mã) đặt GIỮA QR trong hộp chữ nhật trắng, cách module 1
//                khoảng nhỏ. Có centerLabel → tự nâng ec='H' (phục hồi 30%) để
//                vẫn quét được. Tối ưu cho mã ~12-18 ký tự. (default '' = tắt)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2QR) return;

    // davidshimjs/qrcodejs — ưu tiên bản đã vendored trong repo (offline, robust
    // cho cửa sổ in), fallback CDN nếu trang chưa nhúng.
    const QR_LOCAL = '../shared/qrcode.min.js';
    const QR_CDN = 'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@master/qrcode.min.js';
    let _loadPromise = null;

    function _loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('load fail: ' + src));
            document.head.appendChild(s);
        });
    }

    function ready() {
        if (global.QRCode && global.QRCode.CorrectLevel) return Promise.resolve();
        if (_loadPromise) return _loadPromise;
        // Thử local trước; lỗi (sai relative path tuỳ trang) → CDN.
        _loadPromise = _loadScript(QR_LOCAL)
            .catch(() => _loadScript(QR_CDN))
            .then(() => {
                if (!(global.QRCode && global.QRCode.CorrectLevel)) {
                    throw new Error('QRCode lib không khả dụng');
                }
            });
        return _loadPromise;
    }

    const _EC = () => ({
        L: global.QRCode.CorrectLevel.L,
        M: global.QRCode.CorrectLevel.M,
        Q: global.QRCode.CorrectLevel.Q,
        H: global.QRCode.CorrectLevel.H,
    });

    // Tính ma trận QR. PHẢI gọi sau ready().
    function matrix(text, ecLevel) {
        if (!(global.QRCode && global.QRCode.CorrectLevel)) {
            throw new Error('Web2QR.matrix gọi trước ready()');
        }
        const lvl = _EC()[(ecLevel || 'M').toUpperCase()] ?? global.QRCode.CorrectLevel.M;
        const holder = document.createElement('div');
        // eslint-disable-next-line no-new
        const qr = new global.QRCode(holder, {
            text: String(text == null ? '' : text),
            correctLevel: lvl,
            width: 100,
            height: 100,
        });
        const model = qr._oQRCode; // QRCodeModel nội bộ davidshimjs
        const count = model.getModuleCount();
        // Copy ra mảng để khỏi giữ DOM/model.
        const grid = [];
        for (let r = 0; r < count; r++) {
            const row = [];
            for (let c = 0; c < count; c++) row.push(!!model.isDark(r, c));
            grid.push(row);
        }
        return { count, isDark: (r, c) => !!(grid[r] && grid[r][c]) };
    }

    // 3 vùng finder 7x7 (góc trên-trái, trên-phải, dưới-trái).
    function _finderTopLeft(r, c, count) {
        const inTL = r < 7 && c < 7;
        const inTR = r < 7 && c >= count - 7;
        const inBL = r >= count - 7 && c < 7;
        if (inTL) return { r0: 0, c0: 0 };
        if (inTR) return { r0: 0, c0: count - 7 };
        if (inBL) return { r0: count - 7, c0: 0 };
        return null;
    }

    function _moduleShape(r, c, style, radius) {
        const x = c;
        const y = r;
        if (style === 'dots') {
            return `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="${0.5}"/>`;
        }
        if (style === 'square') {
            return `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        }
        // rounded
        const rx = Math.max(0, Math.min(0.5, radius));
        return `<rect x="${x}" y="${y}" width="1" height="1" rx="${rx}" ry="${rx}"/>`;
    }

    // Mắt finder kiểu styled: 3 rect bo góc lồng nhau (đen 7x7 → trắng 5x5 →
    // đen 3x3). Đơn giản, chắc chắn đúng hình + quét nhạy hơn path even-odd.
    function _styledEye(r0, c0, dark, light, radius) {
        const oR = Math.min(2.2, 7 * radius);
        const mR = Math.min(1.6, 5 * radius);
        const iR = Math.min(1.2, 3 * radius);
        const gap = light || '#fff';
        return (
            `<rect x="${c0}" y="${r0}" width="7" height="7" rx="${oR}" ry="${oR}" fill="${dark}"/>` +
            `<rect x="${c0 + 1}" y="${r0 + 1}" width="5" height="5" rx="${mR}" ry="${mR}" fill="${gap}"/>` +
            `<rect x="${c0 + 2}" y="${r0 + 2}" width="3" height="3" rx="${iR}" ry="${iR}" fill="${dark}"/>`
        );
    }

    function toSvg(text, opts = {}) {
        // centerLabel: chữ (mã) đặt GIỮA QR trong hộp chữ nhật trắng, cách module
        // QR 1 khoảng (halo) cho dễ đọc. Kỹ thuật chuẩn (kozakdenys/qr-code-styling):
        // QR error-correction cao (H = phục hồi 30%) + che 1 vùng giữa < ~15% diện
        // tích → máy vẫn quét được. Có centerLabel → tự nâng ec lên 'H' (trừ khi
        // caller chỉ định ec khác).
        const centerLabel = opts.centerLabel == null ? '' : String(opts.centerLabel);
        const ec = opts.ec || (centerLabel ? 'H' : 'M');
        const margin = opts.margin == null ? 4 : Math.max(0, opts.margin);
        const style = opts.style || 'rounded';
        const radius = opts.radius == null ? 0.3 : opts.radius;
        const styledEye = opts.styledEye !== false && style !== 'square';
        const dark = opts.dark || '#000';
        const light = opts.light == null ? '#fff' : opts.light;

        const m = matrix(text, ec);
        const count = m.count;
        const dim = count + margin * 2;

        let body = '';
        const eyesDrawn = new Set();
        for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
                const fin = styledEye ? _finderTopLeft(r, c, count) : null;
                if (fin) {
                    const key = fin.r0 + ':' + fin.c0;
                    if (!eyesDrawn.has(key)) {
                        eyesDrawn.add(key);
                        body += _styledEye(fin.r0 + margin, fin.c0 + margin, dark, light, radius);
                    }
                    continue; // bỏ qua module trong vùng finder (đã vẽ styled)
                }
                if (m.isDark(r, c)) {
                    body += _moduleShape(r + margin, c + margin, style, radius);
                }
            }
        }

        const bg = light ? `<rect width="${dim}" height="${dim}" fill="${light}"/>` : '';

        // Overlay nhãn GIỮA QR (hộp chữ nhật trắng + chữ mã, có halo cách module).
        // Vẽ SAU <g> module nên nằm TRÊN, che các module ở giữa (EC 'H' bù lại).
        let centerOverlay = '';
        if (centerLabel) {
            const cx = dim / 2;
            const cy = dim / 2;
            // Hộp giữ NHỎ (≤ ~55% bề ngang, hộp dẹt) để che < ~8% diện tích → EC 'H'
            // (phục hồi 30%) thừa sức quét lại. Band ngang rộng hơn logo vuông nên
            // càng phải hạn chế coverage. Tối ưu cho mã ~12-18 ký tự (mã PBH 16 ký tự).
            const maxBoxW = count * 0.55;
            const padX = 0.8; // padding ngang trong hộp (module units)
            const padY = 0.6; // padding dọc
            const charW = 0.62; // bề ngang ~ mỗi ký tự (monospace, theo font-size)
            const len = Math.max(1, centerLabel.length);
            let fontSize = (maxBoxW - padX * 2) / (len * charW);
            fontSize = Math.max(1.2, Math.min(2.6, fontSize)); // clamp đọc được/không quá to
            const textW = len * fontSize * charW;
            const boxW = Math.min(maxBoxW, textW + padX * 2);
            const boxH = fontSize + padY * 2;
            const bx = cx - boxW / 2;
            const by = cy - boxH / 2;
            const gap = 0.9; // "khoảng nhỏ" trắng quanh hộp, tách khỏi module QR
            const haloFill = light || '#fff';
            const rx = Math.min(boxH * 0.18, 1.2); // bo nhẹ — vẫn dạng chữ nhật
            centerOverlay =
                // halo: nền trắng lớn hơn hộp 1 chút → tạo khoảng cách với QR
                `<rect x="${(bx - gap).toFixed(2)}" y="${(by - gap).toFixed(2)}" ` +
                `width="${(boxW + gap * 2).toFixed(2)}" height="${(boxH + gap * 2).toFixed(2)}" ` +
                `rx="${(rx + gap * 0.5).toFixed(2)}" fill="${haloFill}"/>` +
                // hộp chữ nhật viền mảnh
                `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${boxW.toFixed(2)}" ` +
                `height="${boxH.toFixed(2)}" rx="${rx.toFixed(2)}" fill="${haloFill}" ` +
                `stroke="${dark}" stroke-width="0.3"/>` +
                // chữ mã canh giữa
                `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="middle" ` +
                `dominant-baseline="central" ` +
                `font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700" ` +
                `font-size="${fontSize.toFixed(2)}" fill="${dark}">${_xmlEsc(centerLabel)}</text>`;
        }

        // Nhóm module (trừ mắt đã có fill riêng) tô bằng dark qua attribute group.
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
            `shape-rendering="geometricPrecision" width="${dim * 4}" height="${dim * 4}">` +
            bg +
            `<g fill="${dark}">${body}</g>` +
            centerOverlay +
            `</svg>`
        );
    }

    function _svgToDataUrl(svgString, pxPerCell, dimUnits) {
        return new Promise((resolve, reject) => {
            const px = Math.max(1, pxPerCell || 12) * dimUnits;
            const img = new Image();
            const svg64 =
                'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = px;
                canvas.height = px;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, px, px);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('SVG→PNG render fail'));
            img.src = svg64;
        });
    }

    async function toDataUrl(text, opts = {}) {
        await ready();
        const svg = toSvg(text, opts);
        // suy ra dim từ viewBox để canvas vuông đúng tỉ lệ
        const vb = svg.match(/viewBox="0 0 (\d+) /);
        const dimUnits = vb ? parseInt(vb[1], 10) : 33;
        return _svgToDataUrl(svg, opts.pxPerCell || 12, dimUnits);
    }

    // Thẻ QR + caption mã (đen trắng) — dùng in tem SP / PBH.
    async function card(opts = {}) {
        await ready();
        const code = opts.code == null ? '' : String(opts.code);
        const caption = opts.caption == null ? code : String(opts.caption);
        const sub = opts.sub == null ? '' : String(opts.sub);
        const qrSvg = toSvg(code, {
            ec: opts.ec || 'M',
            margin: opts.margin == null ? 2 : opts.margin,
            style: opts.style || 'rounded',
            radius: opts.radius,
            styledEye: opts.styledEye,
            dark: '#000',
            light: '#fff',
        });
        // Bọc QR + 2 dòng chữ trong 1 SVG (đơn vị px, để Web2Printer raster đẹp).
        const W = opts.width || 240;
        const qrSize = opts.qrSize || 200;
        const padTop = 6;
        const capH = caption ? 26 : 0;
        const subH = sub ? 18 : 0;
        const H = padTop + qrSize + (caption ? 8 : 0) + capH + subH + 6;
        const qrX = (W - qrSize) / 2;
        const inner = qrSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
        const vb = qrSvg.match(/viewBox="0 0 (\d+) /);
        const dimUnits = vb ? parseInt(vb[1], 10) : 33;
        const scale = qrSize / dimUnits;
        const capEsc = _xmlEsc(caption);
        const subEsc = _xmlEsc(sub);
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
            `<rect width="${W}" height="${H}" fill="#fff"/>` +
            `<g transform="translate(${qrX},${padTop}) scale(${scale})" fill="#000">${inner}</g>` +
            (caption
                ? `<text x="${W / 2}" y="${padTop + qrSize + 8 + 18}" text-anchor="middle" ` +
                  `font-family="JetBrains Mono, ui-monospace, monospace" font-size="18" ` +
                  `font-weight="700" fill="#000">${capEsc}</text>`
                : '') +
            (sub
                ? `<text x="${W / 2}" y="${padTop + qrSize + 8 + capH + 14}" text-anchor="middle" ` +
                  `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#333">${subEsc}</text>`
                : '') +
            `</svg>`
        );
    }

    async function cardDataUrl(opts = {}) {
        const svg = await card(opts);
        const w = svg.match(/width="(\d+)"/);
        const h = svg.match(/height="(\d+)"/);
        const W = w ? parseInt(w[1], 10) : 240;
        const H = h ? parseInt(h[1], 10) : 260;
        return new Promise((resolve, reject) => {
            const scale = opts.scale || 3;
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = W * scale;
                canvas.height = H * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('card SVG→PNG fail'));
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        });
    }

    function _xmlEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    global.Web2QR = { ready, matrix, toSvg, toDataUrl, card, cardDataUrl };
})(window);
