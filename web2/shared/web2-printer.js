// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.
// =====================================================================
// WEB 2.0 — Web2Printer: quản lý NHIỀU máy in + gán theo chức năng in.
//
// Mô hình: 1 DANH SÁCH máy in (mỗi máy: ip/port/khổ/phương thức). Mỗi
// CHỨC NĂNG in (PBH, tem SP, …) gán tới 1 máy in trong danh sách → ví dụ
// in tem mã SP ra máy tem 2 nhãn, in PBH ra máy bill khác.
//
// In thẳng (KHÔNG hộp thoại): bill/tem SVG → canvas (576/384 chấm) →
// 1-bit raster → ESC/POS (GS v 0) → POST print-bridge localhost → bridge
// mở TCP tới máy in IP:9100. Tiếng Việt OK vì in dạng ẢNH raster.
//
// Lưu localStorage (theo MÁY POS):
//   web2_printers      = [{ id, name, ip, port, paper, method, bridgeUrl }]
//   web2_printer_roles = { pbh: <printerId>, label: <printerId>, ... }
//
// API chính:
//   Web2Printer.getPrinters() / setPrinters(arr) / upsertPrinter(p) / removePrinter(id)
//   Web2Printer.getRoles() / setRole(roleKey, printerId) / ROLES
//   Web2Printer.getPrinterFor(roleKey)        → printer obj (fallback máy đầu)
//   Web2Printer.printSvg(svg, roleKey)        → render + in đúng máy theo role
//   Web2Printer.printEscpos(bytes, printer)
//   Web2Printer.escposRasterFromSvg(svg, {dots})
//   Web2Printer.testConnection(printer) / bridgeAlive(printer)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Printer) return;

    const LS_PRINTERS = 'web2_printers';
    const LS_ROLES = 'web2_printer_roles';
    const LS_LEGACY = 'web2_printer_config'; // cấu hình đơn cũ → migrate

    // Các chức năng in trong Web 2.0 (mở rộng dần).
    const ROLES = [
        { key: 'pbh', label: 'In Phiếu Bán Hàng (bill 80mm)' },
        { key: 'label', label: 'In tem / mã sản phẩm (máy tem)' },
    ];

    const PRINTER_DEFAULTS = {
        name: '',
        ip: '',
        port: 9100,
        paper: '80', // '80'→576 chấm, '58'→384 chấm, 'label'→ (tem) dùng width riêng
        method: 'bridge', // 'bridge' (in thẳng IP) | 'dialog' (hộp thoại)
        bridgeUrl: 'http://127.0.0.1:17777',
    };

    function _genId() {
        try {
            if (global.crypto && crypto.randomUUID) return 'prn_' + crypto.randomUUID().slice(0, 8);
        } catch {}
        return 'prn_' + Math.random().toString(36).slice(2, 10);
    }
    function _read(key, fb) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null') ?? fb;
        } catch {
            return fb;
        }
    }

    // Migrate cấu hình đơn cũ (web2_printer_config) → 1 máy trong danh sách.
    function _migrate() {
        if (localStorage.getItem(LS_PRINTERS)) return;
        const legacy = _read(LS_LEGACY, null);
        if (legacy && (legacy.ip || legacy.name)) {
            const p = Object.assign({ id: _genId() }, PRINTER_DEFAULTS, legacy);
            localStorage.setItem(LS_PRINTERS, JSON.stringify([p]));
            localStorage.setItem(LS_ROLES, JSON.stringify({ pbh: p.id, label: p.id }));
        }
    }

    function getPrinters() {
        _migrate();
        const arr = _read(LS_PRINTERS, []);
        return Array.isArray(arr) ? arr.map((p) => Object.assign({}, PRINTER_DEFAULTS, p)) : [];
    }
    function setPrinters(arr) {
        localStorage.setItem(LS_PRINTERS, JSON.stringify(Array.isArray(arr) ? arr : []));
        return getPrinters();
    }
    function upsertPrinter(p) {
        const list = getPrinters();
        if (!p.id) p.id = _genId();
        const i = list.findIndex((x) => x.id === p.id);
        const merged = Object.assign({}, PRINTER_DEFAULTS, p);
        if (i >= 0) list[i] = merged;
        else list.push(merged);
        setPrinters(list);
        return merged;
    }
    function removePrinter(id) {
        setPrinters(getPrinters().filter((p) => p.id !== id));
        const roles = getRoles();
        let changed = false;
        for (const k of Object.keys(roles))
            if (roles[k] === id) {
                delete roles[k];
                changed = true;
            }
        if (changed) localStorage.setItem(LS_ROLES, JSON.stringify(roles));
    }
    function getPrinter(id) {
        return getPrinters().find((p) => p.id === id) || null;
    }

    function getRoles() {
        _migrate();
        return _read(LS_ROLES, {}) || {};
    }
    function setRole(roleKey, printerId) {
        const r = getRoles();
        if (printerId) r[roleKey] = printerId;
        else delete r[roleKey];
        localStorage.setItem(LS_ROLES, JSON.stringify(r));
        return r;
    }
    // Máy in cho 1 chức năng — fallback: máy gán → máy đầu danh sách → null.
    function getPrinterFor(roleKey) {
        const id = getRoles()[roleKey];
        return getPrinter(id) || getPrinters()[0] || null;
    }

    function dotsWidth(printer) {
        const p = printer || {};
        if (p.dots) return Number(p.dots);
        return p.paper === '58' ? 384 : 576;
    }

    // Canvas (đã vẽ nội dung đen/trắng) → Uint8Array lệnh ESC/POS in raster 1-bit.
    function _canvasToEscpos(canvas) {
        const W = canvas.width;
        const H = canvas.height;
        const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
        const bytesPerRow = Math.ceil(W / 8);
        const raster = new Uint8Array(bytesPerRow * H);
        for (let y = 0; y < H; y++) {
            const row = y * bytesPerRow;
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const a = data[i + 3];
                const lum =
                    a === 0 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                if (lum < 150) raster[row + (x >> 3)] |= 0x80 >> (x & 7);
            }
        }
        const init = [0x1b, 0x40];
        const center = [0x1b, 0x61, 0x01];
        const header = [
            0x1d,
            0x76,
            0x30,
            0x00,
            bytesPerRow & 0xff,
            (bytesPerRow >> 8) & 0xff,
            H & 0xff,
            (H >> 8) & 0xff,
        ];
        const feedCut = [0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00];
        const out = new Uint8Array(
            init.length + center.length + header.length + raster.length + feedCut.length
        );
        let p = 0;
        const put = (a) => {
            out.set(a, p);
            p += a.length;
        };
        put(init);
        put(center);
        put(header);
        put(raster);
        put(feedCut);
        return out;
    }

    // SVG (chuỗi/markup) → ESC/POS raster (dùng cho bill — vector sắc nét).
    async function escposRasterFromSvg(svgString, opts = {}) {
        const W = opts.dots || 576;
        const svg = /^<svg/.test(svgString)
            ? svgString
            : (String(svgString).match(/<svg[\s\S]*?<\/svg>/) || [''])[0];
        if (!svg) throw new Error('Không tìm thấy SVG để in');
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('Lỗi nạp SVG vào ảnh'));
            i.src = url;
        });
        const ratio = img.height / img.width || 2;
        const H = Math.max(1, Math.round(W * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        return _canvasToEscpos(canvas);
    }

    function _loadScript(src) {
        return new Promise((res, rej) => {
            if ([...document.scripts].some((s) => s.src === src)) return res();
            const s = document.createElement('script');
            s.src = src;
            s.onload = res;
            s.onerror = () => rej(new Error('Không tải được ' + src));
            document.head.appendChild(s);
        });
    }

    // HTML (vd tem mã SP) → ESC/POS raster. Render HTML trong iframe ẩn rộng
    // đúng số chấm máy in rồi html2canvas → 1-bit. Tiếng Việt OK (ảnh).
    async function escposRasterFromHtml(html, opts = {}) {
        const W = opts.dots || 576;
        if (!global.html2canvas) {
            await _loadScript(
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
            );
        }
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${W}px;border:0;background:#fff`;
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        await new Promise((r) => setTimeout(r, 120)); // chờ layout + barcode SVG
        try {
            const body = doc.body;
            const H = Math.max(1, body.scrollHeight);
            const rendered = await global.html2canvas(body, {
                backgroundColor: '#ffffff',
                width: W,
                height: H,
                windowWidth: W,
                scale: 1,
                logging: false,
            });
            // Chuẩn hoá về đúng W (html2canvas có thể trả khác scale)
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = Math.round((rendered.height / rendered.width) * W) || rendered.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(rendered, 0, 0, canvas.width, canvas.height);
            return _canvasToEscpos(canvas);
        } finally {
            iframe.remove();
        }
    }

    function _b64(bytes) {
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH)
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(bin);
    }

    async function printEscpos(bytes, printer) {
        if (!printer || !printer.ip) throw new Error('Máy in chưa cấu hình IP');
        const r = await fetch(printer.bridgeUrl.replace(/\/$/, '') + '/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip: printer.ip,
                port: Number(printer.port) || 9100,
                b64: _b64(bytes),
            }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.error || 'Bridge lỗi (HTTP ' + r.status + ')');
        return true;
    }

    // In 1 SVG theo CHỨC NĂNG (role) — chọn đúng máy in đã gán.
    async function printSvg(svgString, roleKey, printerOverride) {
        const printer = printerOverride || getPrinterFor(roleKey);
        if (!printer) throw new Error('Chưa có máy in nào — vào Cấu hình > Máy in');
        const bytes = await escposRasterFromSvg(svgString, { dots: dotsWidth(printer) });
        return printEscpos(bytes, printer);
    }
    // In 1 HTML (vd tem mã SP) theo CHỨC NĂNG (role).
    async function printHtml(html, roleKey, printerOverride) {
        const printer = printerOverride || getPrinterFor(roleKey);
        if (!printer) throw new Error('Chưa có máy in nào — vào Cấu hình > Máy in');
        const bytes = await escposRasterFromHtml(html, { dots: dotsWidth(printer) });
        return printEscpos(bytes, printer);
    }
    // Máy in đã gán cho role có in THẲNG (bridge) không?
    function roleIsBridge(roleKey) {
        const p = getPrinterFor(roleKey);
        return !!(p && p.method === 'bridge' && p.ip);
    }

    async function bridgeAlive(printer) {
        const url = (printer || getPrinters()[0] || PRINTER_DEFAULTS).bridgeUrl;
        try {
            const r = await fetch(url.replace(/\/$/, '') + '/health', {
                signal: AbortSignal.timeout(1500),
            });
            return r.ok;
        } catch {
            return false;
        }
    }
    async function testConnection(printer) {
        if (!printer || !printer.ip) throw new Error('Máy in chưa nhập IP');
        const r = await fetch(printer.bridgeUrl.replace(/\/$/, '') + '/tcp-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: printer.ip, port: Number(printer.port) || 9100 }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.error || 'Không kết nối được máy in');
        return true;
    }

    global.Web2Printer = {
        ROLES,
        PRINTER_DEFAULTS,
        getPrinters,
        setPrinters,
        upsertPrinter,
        removePrinter,
        getPrinter,
        getRoles,
        setRole,
        getPrinterFor,
        dotsWidth,
        roleIsBridge,
        escposRasterFromSvg,
        escposRasterFromHtml,
        printEscpos,
        printSvg,
        printHtml,
        bridgeAlive,
        testConnection,
    };
})(typeof window !== 'undefined' ? window : globalThis);
