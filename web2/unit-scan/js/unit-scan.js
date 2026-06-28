// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Quét QR đơn vị (mobile): resolve → định tuyến kệ STT → gán đơn. Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md
(function () {
    'use strict';

    // ── Config / helpers ───────────────────────────────────────────
    const API_BASE =
        window.API_CONFIG?.WORKER_URL ||
        window.WEB2_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const UNITS = API_BASE + '/api/web2-product-units';

    function token() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token || '';
        } catch (_) {
            return '';
        }
    }
    function userName() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null')?.username || '';
        } catch (_) {
            return '';
        }
    }
    async function api(path, opts = {}) {
        const t = token();
        const res = await fetch(UNITS + path, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                ...(t ? { 'x-web2-token': t } : {}),
                ...(opts.headers || {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
    }

    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    const fmtVnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    function fmtTime(ms) {
        try {
            return new Date(Number(ms)).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (_) {
            return '';
        }
    }
    function icons() {
        if (window.lucide?.createIcons) {
            try {
                window.lucide.createIcons({ nameAttr: 'data-lucide' });
            } catch (_) {}
        }
    }

    let toastTimer = null;
    function toast(msg, kind) {
        const el = $('#toast');
        el.textContent = msg;
        el.className = 'toast show' + (kind ? ' ' + kind : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
    }

    // ── Parse QR / barcode content → {id} hoặc {code} ──────────────
    function parseScan(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        // URL .../unit-scan/?u=<id>
        if (/[?&]u=/.test(raw)) {
            const m = raw.match(/[?&]u=([^&\s]+)/);
            if (m) return { id: decodeURIComponent(m[1]) };
        }
        // URL bất kỳ có ?code=
        if (/[?&]code=/.test(raw)) {
            const m = raw.match(/[?&]code=([^&\s]+)/);
            if (m) return { code: decodeURIComponent(m[1]) };
        }
        // Thuần số → id
        if (/^\d+$/.test(raw)) return { id: raw };
        // Còn lại → coi như unit_code (KHOAODEN-017)
        return { code: raw };
    }

    // ── State ──────────────────────────────────────────────────────
    let current = null; // dữ liệu resolve gần nhất
    let scanner = null;
    let torchOn = false;
    let sseUnsub = null;
    let resolving = false;

    // ── Resolve ────────────────────────────────────────────────────
    async function resolve(target) {
        if (resolving) return;
        resolving = true;
        const result = $('#result');
        result.innerHTML =
            '<div class="muted"><i data-lucide="loader-2" class="spin"></i> Đang tra cứu…</div>';
        result.hidden = false;
        icons();
        try {
            const q =
                target.id != null
                    ? 'u=' + encodeURIComponent(target.id)
                    : 'code=' + encodeURIComponent(target.code);
            const data = await api('/resolve?' + q);
            current = data;
            renderResult(data);
            // history (best-effort)
            loadEvents(data.unit.id);
        } catch (e) {
            result.innerHTML =
                '<div class="muted">❌ ' +
                esc(e.message || 'Không tra cứu được') +
                '<br><span style="font-size:12px">' +
                esc(target.id ? 'u=' + target.id : target.code) +
                '</span></div>';
        } finally {
            resolving = false;
        }
    }

    // ── Render result ──────────────────────────────────────────────
    const STATUS_LABEL = {
        IN_STOCK: ['Còn hàng', 'blue'],
        ASSIGNED: ['Đã gán đơn', 'green'],
        PACKED: ['Đã đóng gói', 'green'],
        SHIPPED: ['Đã gửi', 'green'],
        RETURNED: ['Đã trả', 'amber'],
    };

    function renderResult(data) {
        const u = data.unit;
        const p = data.product || {};
        const orders = data.orders || [];
        const [stLbl, stCls] = STATUS_LABEL[u.status] || [u.status, ''];
        const img = p.imageUrl
            ? `<img class="prod-img" src="${esc(p.imageUrl)}" alt="" />`
            : `<div class="prod-img" style="display:grid;place-items:center"><i data-lucide="package"></i></div>`;

        // STT hero: đã gán → "đã ở kệ"; chưa → gợi ý đơn đầu còn thiếu
        const suggested = orders.find((o) => o.remaining > 0) || null;
        let hero = '';
        if (u.status === 'ASSIGNED' && u.orderStt != null) {
            hero = `<div class="stt-hero done">
                <div class="lbl">Đã ở kệ</div>
                <div class="num">${esc(u.orderStt)}</div>
                <div class="sub">${esc(u.customerName || '')}${u.orderCode ? ' · ' + esc(u.orderCode) : ''}</div>
            </div>`;
        } else if (suggested && suggested.stt != null) {
            hero = `<div class="stt-hero">
                <div class="lbl">➡️ Bỏ vào kệ</div>
                <div class="num">${esc(suggested.stt)}</div>
                <div class="sub">${esc(suggested.customerName || 'Đơn ' + (suggested.orderCode || ''))}${suggested.remaining ? ' · còn thiếu ' + suggested.remaining : ''}</div>
            </div>`;
        } else if (orders.length) {
            hero = `<div class="stt-hero done"><div class="lbl">Tất cả đơn đã đủ</div><div class="sub" style="margin-top:6px">Món này DƯ — để IN_STOCK</div></div>`;
        } else {
            hero = `<div class="stt-hero"><div class="lbl">Chưa có đơn nào cần SP này</div><div class="sub" style="margin-top:6px">Để IN_STOCK — chờ khách đặt</div></div>`;
        }

        const chips = [
            p.supplier || u.supplier
                ? `<span class="chip blue"><i data-lucide="truck"></i>NCC ${esc(u.supplier || p.supplier)}</span>`
                : '',
            u.shipmentId
                ? `<span class="chip">đợt ${esc(String(u.shipmentId).slice(-6))}</span>`
                : '',
            `<span class="chip ${stCls}"><i data-lucide="circle-dot"></i>${esc(stLbl)}</span>`,
            `<span class="chip"><i data-lucide="printer"></i>in ${u.printCount} lần</span>`,
        ]
            .filter(Boolean)
            .join('');

        const ordersHtml = orders.length
            ? orders
                  .map((o) => {
                      const isSug = o === suggested && u.status !== 'ASSIGNED' && o.remaining > 0;
                      const done = o.remaining <= 0;
                      return `<div class="order-row${isSug ? ' suggested' : ''}" data-order="${o.orderId}">
                        <div class="stt-badge">${esc(o.stt != null ? o.stt : '?')}</div>
                        <div class="o-meta">
                            <div class="o-name">${esc(o.customerName || 'Khách lẻ')}</div>
                            <div class="o-sub">${esc(o.customerPhone || '')}${o.orderCode ? ' · ' + esc(o.orderCode) : ''} · đặt ${o.orderedQty}${o.assignedQty ? ' · đã có ' + o.assignedQty : ''}</div>
                        </div>
                        ${done ? '<span class="chip green">đủ</span>' : `<button class="o-act" data-assign="${o.orderId}">Gán</button>`}
                    </div>`;
                  })
                  .join('')
            : '<div class="muted">Không có đơn mở nào đặt SP này.</div>';

        $('#result').innerHTML = `
            <div class="card">
                <div class="prod">
                    ${img}
                    <div class="prod-meta">
                        <div class="prod-name">${esc(p.name || u.productCode)}</div>
                        <span class="unit-code">${esc(u.unitCode)}</span>
                        ${p.price ? ` · <span style="font-size:13px;font-weight:700">${fmtVnd(p.price)}</span>` : ''}
                    </div>
                </div>
                <div class="chips">${chips}</div>
                <button class="reprint-btn" id="reprintBtn"><i data-lucide="printer"></i> In lại tem này</button>
                ${hero}
            </div>
            <div class="sec-title">Đơn đang chờ SP này (${orders.length})</div>
            ${ordersHtml}
            <div class="sec-title">Lịch sử đơn vị</div>
            <div class="card" style="padding:8px 14px"><div class="hist" id="hist"><div class="muted" style="padding:8px">Đang tải…</div></div></div>
        `;
        icons();

        // wire reprint (in lại đúng 1 tem đơn vị này)
        $('#reprintBtn')?.addEventListener('click', () => reprintUnit(u, p));

        // wire assign buttons
        $('#result')
            .querySelectorAll('[data-assign]')
            .forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    doAssign(u, Number(btn.dataset.assign), btn);
                });
            });
    }

    // ── In lại 1 tem đơn vị ────────────────────────────────────────
    // Tái dùng Web2ProductsPrint (cùng modal/giấy/máy in tem Kho SP). Mã + QR
    // GIỮ NGUYÊN (id cố định) → tem in lại quét vẫn ra đúng món/đơn. print_count++.
    function reprintUnit(u, p) {
        if (!window.Web2ProductsPrint?.open) {
            toast('Module in chưa tải xong — mở trên máy có máy in tem', 'err');
            return;
        }
        const qrUrl = location.origin + '/web2/unit-scan/?u=' + u.id;
        window.Web2ProductsPrint.open([
            {
                code: (p && p.code) || u.productCode,
                name: (p && p.name) || u.productCode,
                price: (p && p.price) || 0,
                variant: '',
                quantity: 1,
                units: [{ unitCode: u.unitCode, qrUrl }],
            },
        ]);
        // print_count++ + refresh (best-effort)
        api('/reprint', {
            method: 'POST',
            body: JSON.stringify({ unitIds: [u.id], userName: userName() }),
        })
            .then(() => {
                if (current?.unit?.id === u.id) resolve({ id: u.id });
            })
            .catch(() => {});
    }

    async function loadEvents(unitId) {
        try {
            const data = await api('/' + unitId + '/events');
            const host = $('#hist');
            if (!host) return;
            const evs = data.events || [];
            host.innerHTML = evs.length
                ? evs
                      .map((ev) => {
                          const where =
                              ev.orderStt != null
                                  ? `kệ ${ev.orderStt} · ${esc(ev.customerName || ev.orderCode || '')}`
                                  : esc(ev.note || '');
                          return `<div class="hist-item"><span class="hist-ev">${esc(ev.event)}</span><span>${where} <span style="color:var(--c-text-3)">— ${fmtTime(ev.createdAt)}</span></span></div>`;
                      })
                      .join('')
                : '<div class="muted" style="padding:8px">Chưa có lịch sử</div>';
        } catch (_) {}
    }

    // ── Assign ─────────────────────────────────────────────────────
    async function doAssign(unit, orderId, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '…';
        }
        try {
            const data = await api('/assign', {
                method: 'POST',
                body: JSON.stringify({ unitId: unit.id, orderId, userName: userName() }),
            });
            const stt = data.stt;
            toast('✓ Bỏ vào kệ STT ' + stt, 'ok');
            if (data.fulfillment?.complete) {
                setTimeout(() => toast('🎉 Kệ ' + stt + ' ĐỦ HÀNG — đóng gói!', 'ok'), 1400);
            }
            // refresh hiển thị
            resolve({ id: unit.id });
        } catch (e) {
            toast('Lỗi gán: ' + (e.message || ''), 'err');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Gán';
            }
        }
    }

    // ── Scanner ────────────────────────────────────────────────────
    function initScanner() {
        const host = $('#scanHost');
        if (!host || !window.Web2BarcodeScanner) return;
        scanner = window.Web2BarcodeScanner.mount(host, {
            continuous: true,
            dedupeMs: 2500,
            hint: 'Đưa mã QR vào khung',
            onScan: (code) => {
                const t = parseScan(code);
                if (t) {
                    if (navigator.vibrate)
                        try {
                            navigator.vibrate(40);
                        } catch (_) {}
                    resolve(t);
                }
            },
        });
    }
    function toggleTorch() {
        if (!scanner?.setTorch) return;
        scanner.setTorch(!torchOn).then((ok) => {
            if (!ok) {
                toast('Máy không hỗ trợ đèn flash', 'err');
                return;
            }
            torchOn = !torchOn;
            $('#torchBtn').classList.toggle('on', torchOn);
        });
    }

    // ── SSE realtime: đơn vị đổi (máy khác gán) → refresh ──────────
    function initSse() {
        try {
            if (window.Web2SSE?.subscribe) {
                let deb = null;
                sseUnsub = window.Web2SSE.subscribe('web2:product-units', () => {
                    if (!current?.unit) return;
                    clearTimeout(deb);
                    deb = setTimeout(() => resolve({ id: current.unit.id }), 600);
                });
            }
        } catch (_) {}
    }

    // ── Manual input ───────────────────────────────────────────────
    function wireManual() {
        const go = () => {
            const v = $('#manualInput').value.trim();
            if (!v) return;
            const t = parseScan(v);
            if (t) resolve(t);
        };
        $('#manualGo').addEventListener('click', go);
        $('#manualInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') go();
        });
    }

    // ── Boot ───────────────────────────────────────────────────────
    function boot() {
        icons();
        $('#torchBtn').addEventListener('click', toggleTorch);
        wireManual();
        initSse();
        // QR deep-link: camera điện thoại mở .../unit-scan/?u=<id> → resolve ngay
        const u = new URLSearchParams(location.search).get('u');
        const code = new URLSearchParams(location.search).get('code');
        if (u) {
            $('.scanner')?.classList.add('compact');
            resolve({ id: u });
        } else if (code) {
            $('.scanner')?.classList.add('compact');
            resolve({ code });
        }
        initScanner();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
