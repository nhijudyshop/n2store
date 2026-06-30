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
    const WORKER_BASE =
        (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = WORKER_BASE + '/api/web2/printer';
    // Registry máy shop tự host (dùng chung gemini/hyperframes) — máy POS chạy print-tunnel.ps1
    // báo danh engine='printer' URL tunnel HTTPS → máy KHÁC (ĐT/PC) dò ra ở đây để in qua tunnel.
    const REGISTRY_LIST = WORKER_BASE + '/api/web2-vieneu-registry/list?engine=printer';

    function _w2Auth(extra) {
        if (global.Web2Auth && global.Web2Auth.authHeaders)
            return global.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {}
        return h;
    }

    const ROLES = [
        { key: 'pbh', label: 'In Phiếu Bán Hàng (bill 80mm)' },
        { key: 'label', label: 'In tem / mã sản phẩm (máy tem)' },
    ];
    // Máy in MẶC ĐỊNH cho từng chức năng — khớp theo TÊN (không theo id vì id máy
    // in do server sinh ngẫu nhiên). Dùng khi user CHƯA gán thủ công (getRoles()
    // trống cho role đó). Đổi tên máy in trên server thì cập nhật danh sách này.
    const ROLE_DEFAULT_NAMES = {
        pbh: 'Máy in PBH Huyền + Hạnh + Còi + Hồng',
        label: 'Máy in 2 tem mã sản phẩm',
    };
    const PRINTER_DEFAULTS = {
        name: '',
        ip: '',
        port: 9100,
        paper: '80',
        method: 'bridge',
        bridgeUrl: 'http://127.0.0.1:17777',
        gapMm: 2, // khoảng cách giữa 2 tem (máy tem TSPL)
        lang: '', // '' = auto (khổ 'label' → tspl), 'escpos' | 'tspl' override
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
            gapMm: Number(p.gapMm) || 2,
            lang: p.lang || '',
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
            headers: _w2Auth({ 'Content-Type': 'application/json' }),
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
                headers: _w2Auth(),
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
    // ID máy in khớp tên mặc định cho 1 chức năng (case-insensitive, trim) — '' nếu
    // không có máy nào trùng tên / role không có default.
    function _defaultPrinterIdForRole(roleKey) {
        const want = ROLE_DEFAULT_NAMES[roleKey];
        if (!want) return '';
        const norm = (s) =>
            String(s == null ? '' : s)
                .trim()
                .toLowerCase();
        const target = norm(want);
        const m = _printers.find((p) => norm(p.name) === target);
        return m ? m.id : '';
    }
    // ID máy in HIỆU LỰC cho 1 role (cho UI hiển thị selected): máy user gán thủ công
    // (nếu còn tồn tại) → máy mặc định theo tên → '' (Chưa gán). KHÔNG fallback máy
    // đầu danh sách ở đây — đó chỉ là lưới an toàn lúc IN (getPrinterFor), không phải
    // "mặc định" để hiển thị.
    function effectiveRoleId(roleKey) {
        const explicit = getRoles()[roleKey];
        if (explicit && getPrinter(explicit)) return explicit;
        return _defaultPrinterIdForRole(roleKey) || '';
    }
    // Máy in cho 1 chức năng — fallback: máy gán → máy mặc định theo tên → máy đầu
    // danh sách → null.
    function getPrinterFor(roleKey) {
        return (
            getPrinter(getRoles()[roleKey]) ||
            getPrinter(_defaultPrinterIdForRole(roleKey)) ||
            getPrinters()[0] ||
            null
        );
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
        if (p.paper === '58') return 384;
        if (p.paper === 'label') return 528; // ~66mm tem 2-con; thực tế printHtml tự co theo mm
        return 576;
    }

    // Canvas (vẽ ở SS× độ phân giải đích) → ESC/POS raster 1-bit, downsample
    // SUPERSAMPLE để dấu tiếng Việt (sắc/huyền/ngã/hỏi/nặng, ơ/ư/đ) RÕ khi in:
    // render SVG ở 2× số chấm máy in (nét nhiều pixel hơn) rồi gộp mỗi ô ss×ss →
    // đen nếu có ≥1 sub-pixel mực (giữ nét mảnh, không mất dấu). Không dãn nở
    // thêm (supersample đã đủ đậm + giữ nét).
    function _canvasToEscpos(canvas, opts = {}) {
        const ss = opts.ss && opts.ss > 1 ? Math.round(opts.ss) : 1;
        const srcW = canvas.width;
        const srcH = canvas.height;
        const W = Math.floor(srcW / ss);
        const H = Math.floor(srcH / ss);
        const inkLum = opts.inkLum != null ? opts.inkLum : 165; // sub-pixel coi là mực
        // coverage: cần bao nhiêu sub-pixel mực trong ô ss×ss để ra chấm đen.
        // thấp (1) → giữ nét mảnh tối đa (dấu rõ); cao → mảnh hơn.
        const need = Math.max(
            1,
            Math.round((opts.coverage != null ? opts.coverage : 0.2) * ss * ss)
        );
        const data = canvas.getContext('2d').getImageData(0, 0, srcW, srcH).data;
        const dark = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let ink = 0;
                for (let dy = 0; dy < ss; dy++) {
                    const sy = y * ss + dy;
                    for (let dx = 0; dx < ss; dx++) {
                        const sx = x * ss + dx;
                        const i = (sy * srcW + sx) * 4;
                        const a = data[i + 3];
                        const lum =
                            a === 0
                                ? 255
                                : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                        if (lum < inkLum) ink++;
                    }
                }
                if (ink >= need) dark[y * W + x] = 1;
            }
        }
        const fin = dark;
        // pack
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

    // SVG → ESC/POS raster. Render ở 2× số chấm (SVG vector → sắc nét) rồi
    // supersample downsample → dấu tiếng Việt rõ, không mờ khi in.
    async function escposRasterFromSvg(svgString, opts = {}) {
        const dots = opts.dots || 576;
        const SS = opts.ss || 2;
        const W = dots * SS;
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
        const H = Math.max(SS, Math.round(W * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        return _canvasToEscpos(canvas, { ss: SS });
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
        const dots = opts.dots || 576;
        const SS = opts.ss || 2;
        const W = dots; // iframe rộng theo dots; html2canvas scale=SS để render 2×
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
                scale: SS, // render 2× → supersample cho dấu tiếng Việt rõ
                logging: false,
            });
            // canvas đích = SS × dots (để _canvasToEscpos downsample về dots)
            const canvas = document.createElement('canvas');
            canvas.width = dots * SS;
            canvas.height =
                Math.round((rendered.height / rendered.width) * dots * SS) || rendered.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(rendered, 0, 0, canvas.width, canvas.height);
            return _canvasToEscpos(canvas, { ss: SS });
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

    // /health 1 bridge URL còn sống không (timeout ngắn để không treo UI).
    async function _bridgeOk(url) {
        if (!url) return false;
        try {
            const r = await fetch(url.replace(/\/$/, '') + '/health', {
                signal: AbortSignal.timeout(1500),
            });
            return r.ok;
        } catch {
            return false;
        }
    }

    // URL tunnel máy in shop (registry) — cache 60s để không hỏi registry mỗi lần in.
    let _tunnel = { url: '', ts: 0 };
    // URL bridge DÙNG ĐƯỢC cho máy HIỆN TẠI: ưu tiên 127.0.0.1 (máy POS có bridge) →
    // nếu không (ĐT/PC khác) thì URL tunnel máy shop từ registry. Trả local làm fallback
    // cuối (lỗi sẽ rõ ràng khi in nếu không có máy nào reachable).
    async function resolveBridgeUrl(printer) {
        const local = ((printer && printer.bridgeUrl) || PRINTER_DEFAULTS.bridgeUrl).replace(
            /\/$/,
            ''
        );
        if (await _bridgeOk(local)) return local;
        const now = Date.now();
        if (_tunnel.url && now - _tunnel.ts < 60000 && (await _bridgeOk(_tunnel.url)))
            return _tunnel.url;
        try {
            const res = await fetch(REGISTRY_LIST, { signal: AbortSignal.timeout(6000) });
            const d = await res.json();
            for (const s of (d && d.servers) || []) {
                const u = String((s && s.url) || '').replace(/\/+$/, '');
                if (u && (await _bridgeOk(u))) {
                    _tunnel = { url: u, ts: now };
                    return u;
                }
            }
        } catch {}
        return local;
    }

    async function printEscpos(bytes, printer) {
        if (!printer || !printer.ip) throw new Error('Máy in chưa cấu hình IP');
        const base = await resolveBridgeUrl(printer);
        const r = await fetch(base + '/print', {
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
    // In tem nhãn: raster theo KÍCH THƯỚC VẬT LÝ (mm → 8 chấm/mm @203DPI).
    // Tem có .barcode-sheet width:Xmm cố định (vd 66mm 2-con) → in ĐÚNG khổ tem,
    // KHÔNG bị co nhỏ + dồn về trái như khi ép theo khổ bill 80/58 (576/384 chấm).
    // Khổ tem lấy từ dialog "In mã vạch" → "Giấy in" (sheetW mm) → tự co theo.
    async function escposRasterFromHtmlPhysical(html, opts = {}) {
        const SS = opts.ss || 2;
        const DPMM = opts.dpmm || 8; // 203 DPI ≈ 8 chấm/mm
        const PX_PER_MM = 96 / 25.4; // CSS px/mm ≈ 3.7795
        if (!global.html2canvas) {
            await _loadScript(
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
            );
        }
        const iframe = document.createElement('iframe');
        iframe.style.cssText =
            'position:fixed;left:-9999px;top:0;width:800px;border:0;background:#fff';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        await new Promise((r) => setTimeout(r, 160)); // chờ layout + JsBarcode render SVG
        try {
            const body = doc.body;
            // Đo bề rộng THẬT của nội dung (tem .barcode-sheet hoặc bill .bill/
            // .receipt-wrap, width:Xmm cố định) → suy ra số chấm máy in.
            let cw = 0;
            body.querySelectorAll('.barcode-sheet, .bill, .receipt-wrap').forEach((s) => {
                cw = Math.max(cw, s.getBoundingClientRect().width);
            });
            if (!cw) cw = body.scrollWidth || 300;
            cw = Math.ceil(cw);
            const H = Math.max(1, body.scrollHeight);
            const scale = (DPMM / PX_PER_MM) * SS; // px CSS → chấm máy in (×SS supersample)
            const rendered = await global.html2canvas(body, {
                backgroundColor: '#ffffff',
                width: cw,
                height: H,
                windowWidth: cw,
                scale,
                logging: false,
            });
            // rendered.width = cw*scale = dots*SS → _canvasToEscpos downsample về dots.
            return _canvasToEscpos(rendered, { ss: SS, coverage: opts.coverage });
        } finally {
            iframe.remove();
        }
    }

    // ── TSPL (máy in TEM chuyên dụng: Xprinter XP-4xx, TSC, Godex, Zebra ZPL) ──
    // Máy tem KHÔNG nói ESC/POS — nói TSPL/EPL/ZPL. Sinh lệnh TSPL gửi raw qua
    // bridge (TCP relay thuần). TSPL handle gap-sensor + canh khổ NATIVE.
    function _ascii(s) {
        const a = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
        return a;
    }
    // Canvas (supersampled) → TSPL BITMAP data. TSPL: bit 1 = TRẮNG (không in),
    // bit 0 = ĐEN (in) — NGƯỢC với ESC/POS GS v 0. Cùng logic supersample/dấu.
    function _canvasToTsplBitmap(canvas, opts = {}) {
        const ss = opts.ss && opts.ss > 1 ? Math.round(opts.ss) : 1;
        const srcW = canvas.width;
        const srcH = canvas.height;
        const W = Math.floor(srcW / ss);
        const H = Math.floor(srcH / ss);
        const inkLum = opts.inkLum != null ? opts.inkLum : 165;
        const need = Math.max(
            1,
            Math.round((opts.coverage != null ? opts.coverage : 0.2) * ss * ss)
        );
        const data = canvas.getContext('2d').getImageData(0, 0, srcW, srcH).data;
        const bytesPerRow = Math.ceil(W / 8);
        const bytes = new Uint8Array(bytesPerRow * H).fill(0xff); // mặc định trắng (bit 1)
        for (let y = 0; y < H; y++) {
            const row = y * bytesPerRow;
            for (let x = 0; x < W; x++) {
                let ink = 0;
                for (let dy = 0; dy < ss; dy++) {
                    const sy = y * ss + dy;
                    for (let dx = 0; dx < ss; dx++) {
                        const sx = x * ss + dx;
                        const i = (sy * srcW + sx) * 4;
                        const a = data[i + 3];
                        const lum =
                            a === 0
                                ? 255
                                : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                        if (lum < inkLum) ink++;
                    }
                }
                if (ink >= need) bytes[row + (x >> 3)] &= ~(0x80 >> (x & 7)); // đen → clear bit
            }
        }
        return { bytes, bytesPerRow, H };
    }

    // HTML tem → TSPL command stream. Mỗi .barcode-sheet = 1 nhãn vật lý
    // (66×21mm chứa 2 con tem) → 1 lệnh CLS+BITMAP+PRINT. SIZE/GAP đặt 1 lần đầu.
    async function tsplFromHtmlPhysical(html, opts = {}) {
        const SS = opts.ss || 2;
        const DPMM = opts.dpmm || 8; // 203 DPI
        const PX_PER_MM = 96 / 25.4;
        const gapMm = opts.gapMm != null ? opts.gapMm : 2;
        if (!global.html2canvas) {
            await _loadScript(
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
            );
        }
        const iframe = document.createElement('iframe');
        iframe.style.cssText =
            'position:fixed;left:-9999px;top:0;width:800px;border:0;background:#fff';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        await new Promise((r) => setTimeout(r, 160)); // chờ layout + JsBarcode SVG
        try {
            const body = doc.body;
            let sheets = Array.from(body.querySelectorAll('.barcode-sheet'));
            const scale = (DPMM / PX_PER_MM) * SS;
            const bodyTop = body.getBoundingClientRect().top;
            // Khổ nhãn (mm) từ sheet đầu; fallback toàn body nếu không có .barcode-sheet.
            const r0 = (sheets[0] || body).getBoundingClientRect();
            const widthMm = Math.max(1, Math.round(r0.width / PX_PER_MM));
            const heightMm = Math.max(1, Math.round(r0.height / PX_PER_MM));
            const fullW = Math.ceil(
                sheets.length
                    ? Math.max(...sheets.map((s) => s.getBoundingClientRect().width))
                    : body.scrollWidth || r0.width
            );
            const fullH = Math.max(1, body.scrollHeight);
            const rendered = await global.html2canvas(body, {
                backgroundColor: '#ffffff',
                width: fullW,
                height: fullH,
                windowWidth: fullW,
                scale,
                logging: false,
            });
            if (!sheets.length) sheets = [body]; // fallback: cả body = 1 nhãn
            const parts = [
                _ascii(
                    `SIZE ${widthMm} mm,${heightMm} mm\r\n` +
                        `GAP ${gapMm} mm,0 mm\r\n` +
                        `DIRECTION 1\r\n` +
                        `REFERENCE 0,0\r\n` +
                        `DENSITY 10\r\n`
                ),
            ];
            for (const sheet of sheets) {
                const r = sheet.getBoundingClientRect();
                const y0 = Math.max(0, Math.round((r.top - bodyTop) * scale));
                const sw = Math.max(1, Math.round((r.width || fullW) * scale));
                const sh = Math.max(1, Math.round((r.height || fullH) * scale));
                const sub = document.createElement('canvas');
                sub.width = sw;
                sub.height = sh;
                const sctx = sub.getContext('2d');
                sctx.fillStyle = '#fff';
                sctx.fillRect(0, 0, sw, sh);
                sctx.drawImage(rendered, 0, y0, sw, sh, 0, 0, sw, sh);
                const bmp = _canvasToTsplBitmap(sub, { ss: SS });
                parts.push(_ascii(`CLS\r\nBITMAP 0,0,${bmp.bytesPerRow},${bmp.H},0,`));
                parts.push(bmp.bytes);
                parts.push(_ascii(`\r\nPRINT 1,1\r\n`));
            }
            const total = parts.reduce((n, p) => n + p.length, 0);
            const out = new Uint8Array(total);
            let p = 0;
            for (const part of parts) {
                out.set(part, p);
                p += part.length;
            }
            return out;
        } finally {
            iframe.remove();
        }
    }

    // Máy in dùng ngôn ngữ TEM (TSPL)? — khổ 'label' mặc định TSPL (máy tem
    // chuyên dụng XP-470B class). Override qua printer.lang = 'escpos' | 'tspl'.
    function _isLabelLang(p) {
        if (!p) return false;
        if (p.lang) return p.lang === 'tspl';
        return p.paper === 'label';
    }

    // In 1 HTML (tem mã SP) theo CHỨC NĂNG (role). Máy tem TSPL → lệnh TSPL;
    // máy bill/ESC-POS → raster vật-lý-mm (tem in đúng khổ thay vì ép khổ bill).
    async function printHtml(html, roleKey, printerOverride) {
        const printer = printerOverride || getPrinterFor(roleKey);
        if (!printer) throw new Error('Chưa có máy in nào — vào Cấu hình > Máy in');
        const bytes = _isLabelLang(printer)
            ? await tsplFromHtmlPhysical(html, { ss: 2, gapMm: Number(printer.gapMm) || 2 })
            : await escposRasterFromHtmlPhysical(html, { ss: 2 });
        return printEscpos(bytes, printer);
    }
    // In BILL (HTML/CSS thiết kế: khung COD/mã vạch, đường trang trí) qua máy
    // bill ESC/POS. Raster vật-lý-mm: bill width 72mm → đúng 576 chấm, fill khổ.
    async function printBillHtml(html, roleKey, printerOverride) {
        const printer = printerOverride || getPrinterFor(roleKey);
        if (!printer) throw new Error('Chưa có máy in nào — vào Cấu hình > Máy in');
        // Tiếng Việt sắc nét: render 3× (mịn hơn → dấu không đứt khúc) + coverage
        // thấp (need=1: ô có ≥1 sub-pixel mực = chấm đen → giữ liền nét dấu mảnh,
        // chống "đứt khúc"). Chống "nhòe": giảm font-weight trong CSS bill (không
        // để chữ nhỏ quá đậm). Density máy in chỉnh ở phần cứng.
        const bytes = await escposRasterFromHtmlPhysical(html, { ss: 3, coverage: 0.14 });
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
        ROLE_DEFAULT_NAMES,
        PRINTER_DEFAULTS,
        loadPrinters,
        getPrinters,
        getPrinter,
        upsertPrinter,
        removePrinter,
        onPrintersChanged,
        getRoles,
        setRole,
        effectiveRoleId,
        getPrinterFor,
        dotsWidth,
        roleIsBridge,
        escposRasterFromSvg,
        escposRasterFromHtml,
        escposRasterFromHtmlPhysical,
        tsplFromHtmlPhysical,
        printBillHtml,
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
