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

    // DANH SÁCH máy in lưu TRÊN SERVER (entity generic 'printer') → mọi user/máy
    // POS thấy chung. Cache localStorage để dùng offline + sync nhanh (getPrinters
    // đồng bộ). GÁN role (máy nào cho PBH/tem) lưu LOCAL theo máy — mỗi POS tự chọn
    // từ danh sách chung.
    const LS_ROLES = 'web2_printer_roles';
    const LS_CACHE = 'web2_printers_cache';
    const LS_LEGACY_LIST = 'web2_printers'; // danh sách local cũ → đẩy lên server
    const LS_LEGACY = 'web2_printer_config'; // cấu hình đơn rất cũ
    const API_BASE =
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL
            ? global.API_CONFIG.WORKER_URL
            : 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/web2/printer';

    const ROLES = [
        { key: 'pbh', label: 'In Phiếu Bán Hàng (bill 80mm)' },
        { key: 'label', label: 'In tem / mã sản phẩm (máy tem)' },
    ];
    const PRINTER_DEFAULTS = {
        name: '',
        ip: '',
        port: 9100,
        paper: '80',
        method: 'bridge',
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

    // Cache đồng bộ — seed từ localStorage để getPrinters() có data ngay khi load.
    let _printers = (() => {
        const a = _read(LS_CACHE, null);
        return Array.isArray(a) ? a : [];
    })();
    const _listeners = [];
    function onPrintersChanged(cb) {
        if (typeof cb === 'function') _listeners.push(cb);
    }
    function _fire() {
        _listeners.forEach((cb) => {
            try {
                cb(getPrinters());
            } catch {}
        });
    }
    function _recToPrinter(r) {
        return Object.assign({}, PRINTER_DEFAULTS, r.data || {}, {
            id: r.code,
            name: r.name || '',
        });
    }

    // Tải danh sách máy in từ SERVER → cache + localStorage + fire listeners.
    async function loadPrinters() {
        try {
            const res = await fetch(API_BASE + '/list?limit=200', { credentials: 'omit' });
            const j = await res.json();
            if (j && Array.isArray(j.records)) {
                _printers = j.records.map(_recToPrinter);
                localStorage.setItem(LS_CACHE, JSON.stringify(_printers));
                _fire();
            }
        } catch (e) {
            /* offline → giữ cache cũ */
        }
        return getPrinters();
    }
    function getPrinters() {
        return _printers.map((p) => Object.assign({}, PRINTER_DEFAULTS, p));
    }
    function getPrinter(id) {
        const p = _printers.find((x) => x.id === id);
        return p ? Object.assign({}, PRINTER_DEFAULTS, p) : null;
    }

    // Thêm/sửa máy in → LÊN SERVER (mọi user thấy). Trả printer sau khi reload.
    async function upsertPrinter(p) {
        if (!p.id) p.id = _genId();
        const exists = _printers.some((x) => x.id === p.id);
        const data = {
            ip: p.ip || '',
            port: Number(p.port) || 9100,
            paper: p.paper || '80',
            method: p.method || 'bridge',
            bridgeUrl: p.bridgeUrl || PRINTER_DEFAULTS.bridgeUrl,
        };
        const url = exists
            ? API_BASE + '/update/' + encodeURIComponent(p.id)
            : API_BASE + '/create';
        const body = exists
            ? { name: p.name || 'Máy in', data, isActive: true }
            : {
                  code: p.id,
                  name: p.name || 'Máy in',
                  data,
                  isActive: true,
                  sourcePage: 'printer-settings',
              };
        const res = await fetch(url, {
            method: exists ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error('Lưu máy in lỗi (HTTP ' + res.status + ') ' + t.slice(0, 80));
        }
        await loadPrinters();
        return getPrinter(p.id) || Object.assign({ id: p.id }, PRINTER_DEFAULTS, p);
    }
    // Xoá máy in trên server + dọn role local trỏ tới nó.
    async function removePrinter(id) {
        let ok = false;
        try {
            const res = await fetch(API_BASE + '/delete/' + encodeURIComponent(id), {
                method: 'DELETE',
            });
            ok = res.ok;
        } catch {}
        const roles = getRoles();
        let changed = false;
        for (const k of Object.keys(roles))
            if (roles[k] === id) {
                delete roles[k];
                changed = true;
            }
        if (changed) localStorage.setItem(LS_ROLES, JSON.stringify(roles));
        await loadPrinters();
        return ok;
    }

    function getRoles() {
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

    // Migrate danh sách/cấu hình LOCAL cũ → đẩy LÊN SERVER 1 lần (chỉ khi server rỗng).
    async function _migrateToServer() {
        const FLAG = 'web2_printers_migrated';
        try {
            if (localStorage.getItem(FLAG)) return;
            await loadPrinters();
            if (_printers.length) {
                localStorage.setItem(FLAG, '1');
                return;
            }
            let locals = _read(LS_LEGACY_LIST, []);
            if (!Array.isArray(locals)) locals = [];
            const legacy = _read(LS_LEGACY, null);
            if (legacy && (legacy.ip || legacy.name))
                locals.push(Object.assign({ id: _genId() }, legacy));
            for (const lp of locals) {
                try {
                    await upsertPrinter(lp);
                } catch {}
            }
            localStorage.setItem(FLAG, '1');
        } catch {}
    }

    function dotsWidth(printer) {
        const p = printer || {};
        if (p.dots) return Number(p.dots);
        return p.paper === '58' ? 384 : 576;
    }

    // Canvas → ESC/POS raster 1-bit. ĐẬM HƠN cho máy in nhiệt (chữ mỏng hay mờ
    // mực): (1) ngưỡng cao (176) bắt cả pixel xám antialias → nét đầy hơn;
    // (2) DÃN nở (dilation) 1 chấm phải+dưới → mọi nét dày thêm 1px, không mất
    // nét mảnh khi in. Barcode module rộng ≥3px nên vẫn quét tốt.
    function _canvasToEscpos(canvas, opts = {}) {
        const W = canvas.width;
        const H = canvas.height;
        const threshold = opts.threshold != null ? opts.threshold : 176;
        const dilate = opts.dilate !== false; // mặc định BẬT dãn nở cho đậm
        const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
        // 1) ma trận đen/trắng theo ngưỡng
        const dark = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                const a = data[i + 3];
                const lum =
                    a === 0 ? 255 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                if (lum < threshold) dark[y * W + x] = 1;
            }
        }
        // 2) dãn nở 1px (phải + dưới) → nét dày hơn, đậm hơn
        let fin = dark;
        if (dilate) {
            fin = new Uint8Array(W * H);
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    if (
                        dark[y * W + x] ||
                        (x > 0 && dark[y * W + x - 1]) ||
                        (y > 0 && dark[(y - 1) * W + x])
                    )
                        fin[y * W + x] = 1;
                }
            }
        }
        // 3) pack
        const bytesPerRow = Math.ceil(W / 8);
        const raster = new Uint8Array(bytesPerRow * H);
        for (let y = 0; y < H; y++) {
            const row = y * bytesPerRow;
            for (let x = 0; x < W; x++) {
                if (fin[y * W + x]) raster[row + (x >> 3)] |= 0x80 >> (x & 7);
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
        loadPrinters,
        getPrinters,
        getPrinter,
        upsertPrinter,
        removePrinter,
        onPrintersChanged,
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

    // Auto: nạp danh sách máy in từ server + migrate local cũ + SSE sync đa user.
    _migrateToServer();
    if (global.Web2SSE && typeof global.Web2SSE.subscribe === 'function') {
        try {
            global.Web2SSE.subscribe('web2:printer', () => loadPrinters());
        } catch {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
