// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Bàn chia hàng: quét pile → KỆ to + theo dõi đủ/thiếu từng STT + manifest mang ra. Client units = Web2ProductUnits. Đặc tả: docs/web2/KB-PRODUCT-CODE-UNITS.md
(function () {
    'use strict';

    const PU = () => window.Web2ProductUnits;
    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
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
        toastTimer = setTimeout(() => (el.className = 'toast'), 2400);
    }
    // Beep ngắn (WebAudio) — phản hồi nhanh khi chia. done = 2 nốt cao, warn = nốt trầm.
    let _ac = null;
    function beep(kind) {
        try {
            _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
            const freqs = kind === 'done' ? [880, 1320] : kind === 'warn' ? [240] : [660];
            freqs.forEach((f, i) => {
                const o = _ac.createOscillator(),
                    g = _ac.createGain();
                o.frequency.value = f;
                o.connect(g);
                g.connect(_ac.destination);
                const t = _ac.currentTime + i * 0.09;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
                o.start(t);
                o.stop(t + 0.09);
            });
        } catch (_) {}
    }
    function vibe(ms) {
        if (navigator.vibrate)
            try {
                navigator.vibrate(ms);
            } catch (_) {}
    }

    // ── State ──────────────────────────────────────────────────────
    // byId: orderId → { orderId, orderCode, stt, customerName, customerPhone, needed,
    //                   products:[{code,name,qty}], unitIds:[], sorted:Set<id> }
    const byId = new Map();
    const unitToOrder = new Map(); // unitId(number) → orderId
    const scanned = new Set(); // unit ids ĐÃ chia phiên này (giữ qua SSE reload)
    let scanner = null;
    let sseUnsub = null;
    let loading = false;

    function parseScan(text) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        if (/[?&]u=/.test(raw)) {
            const m = raw.match(/[?&]u=([^&\s]+)/);
            if (m) return { id: decodeURIComponent(m[1]) };
        }
        if (/[?&]code=/.test(raw)) {
            const m = raw.match(/[?&]code=([^&\s]+)/);
            if (m) return { code: decodeURIComponent(m[1]) };
        }
        if (/^\d+$/.test(raw)) return { id: raw };
        return { code: raw };
    }

    // ── Load manifest ───────────────────────────────────────────────
    async function load() {
        if (loading) return;
        loading = true;
        try {
            const data = await PU().sortManifest();
            byId.clear();
            unitToOrder.clear();
            for (const o of data.orders || []) {
                const ids = (o.unitIds || []).map(Number).filter(Number.isInteger);
                ids.forEach((id) => unitToOrder.set(id, o.orderId));
                byId.set(o.orderId, {
                    ...o,
                    unitIds: ids,
                    sorted: new Set(ids.filter((id) => scanned.has(id))), // giữ tiến độ qua reload
                });
            }
            renderGrid();
            renderStats();
        } catch (e) {
            $('#grid').innerHTML =
                '<div class="muted">❌ Không tải được danh sách (' +
                esc(e.message || '') +
                ')</div>';
        } finally {
            loading = false;
        }
    }

    const isDone = (o) => o.needed > 0 && o.sorted.size >= o.needed;

    // ── Render grid kệ ──────────────────────────────────────────────
    function renderGrid() {
        const orders = [...byId.values()];
        const host = $('#grid');
        if (!orders.length) {
            host.innerHTML =
                '<div class="muted">Chưa có đơn nào chờ xếp kệ.<br>Thêm SP vào giỏ (native-orders) để hệ gán kệ.</div>';
            return;
        }
        host.innerHTML = orders.map(cardHtml).join('');
        icons();
    }
    function cardHtml(o) {
        const done = isDone(o);
        const chips = (o.products || [])
            .map((p) => {
                // đếm đã chia theo SP = số unit của SP này đã scan
                return `<span class="c-chip">${esc(p.name || p.code)} ×${p.qty}</span>`;
            })
            .join('');
        return `<div class="stt-card${done ? ' done' : ''}" id="card-${o.orderId}" data-id="${o.orderId}">
            <div class="c-top">
                <div class="c-badge">${o.stt != null ? esc(o.stt) : '?'}</div>
                <div class="c-info">
                    <div class="c-name">${esc(o.customerName || o.orderCode || 'Khách lẻ')}</div>
                    <div class="c-prog">${done ? '✓ ĐỦ — mang ra kệ' : `đã chia ${o.sorted.size}/${o.needed}`}</div>
                </div>
            </div>
            <div class="c-prods">${chips}</div>
        </div>`;
    }
    function refreshCard(o) {
        const el = $('#card-' + o.orderId);
        if (!el) {
            renderGrid();
            return;
        }
        const done = isDone(o);
        el.classList.toggle('done', done);
        const prog = el.querySelector('.c-prog');
        if (prog)
            prog.textContent = done ? '✓ ĐỦ — mang ra kệ' : `đã chia ${o.sorted.size}/${o.needed}`;
        // flash active
        document.querySelectorAll('.stt-card.active').forEach((x) => x.classList.remove('active'));
        el.classList.add('active');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(() => el.classList.remove('active'), 1200);
    }

    function renderStats() {
        const orders = [...byId.values()];
        const totalUnits = orders.reduce((s, o) => s + o.needed, 0);
        const sortedUnits = orders.reduce((s, o) => s + o.sorted.size, 0);
        const doneOrders = orders.filter(isDone).length;
        $('#stats').innerHTML =
            `<div class="stat${sortedUnits >= totalUnits && totalUnits > 0 ? ' ok' : ''}"><b>${sortedUnits}/${totalUnits}</b><span>Món đã chia</span></div>` +
            `<div class="stat${doneOrders === orders.length && orders.length ? ' ok' : ''}"><b>${doneOrders}/${orders.length}</b><span>Kệ đủ hàng</span></div>`;
    }

    // ── Flash kết quả quét ──────────────────────────────────────────
    function flash(kind, sttText, name, sub) {
        const el = $('#flash');
        el.className = 'flash' + (kind ? ' ' + kind : '');
        el.innerHTML = `<div class="stt-num">${esc(sttText)}</div>
            <div class="f-meta">
                <div class="f-lbl">${kind === 'done' ? 'Kệ này ĐỦ HÀNG' : kind === 'warn' || kind === 'err' ? 'Lưu ý' : 'Bỏ vào kệ'}</div>
                <div class="f-name">${esc(name || '')}</div>
                <div class="f-sub">${esc(sub || '')}</div>
            </div>`;
        el.hidden = false;
    }

    // ── Quét 1 món ──────────────────────────────────────────────────
    let resolving = false;
    async function onScan(target) {
        if (resolving) return;
        resolving = true;
        try {
            let orderId = null,
                unitId = null,
                stt = null,
                name = null,
                unitCode = null;
            // QR (?u=id) → tra map manifest (tức thì, không cần mạng)
            if (target.id != null && unitToOrder.has(Number(target.id))) {
                unitId = Number(target.id);
                orderId = unitToOrder.get(unitId);
                const o = byId.get(orderId);
                stt = o?.stt;
                name = o?.customerName;
            } else {
                // không có trong manifest (gán sau khi load / nhập mã) → hỏi server
                const data = await PU().resolve(target);
                const u = data.unit || {};
                unitId = u.id;
                unitCode = u.unitCode;
                if (u.status !== 'ASSIGNED' || u.orderStt == null) {
                    flash(
                        'warn',
                        '—',
                        u.unitCode || '',
                        'Món chưa gán đơn / không cần chia (' + (u.status || '?') + ')'
                    );
                    beep('warn');
                    vibe(120);
                    return;
                }
                orderId = u.orderId;
                stt = u.orderStt;
                name = u.customerName;
                if (!byId.has(orderId)) {
                    await load(); // đơn mới gán → nạp vào grid
                }
            }
            if (scanned.has(unitId)) {
                flash('warn', stt != null ? String(stt) : '—', name || '', 'Món này đã chia rồi');
                beep('warn');
                vibe(60);
                return;
            }
            scanned.add(unitId);
            const o = byId.get(orderId);
            if (o) {
                o.sorted.add(unitId);
                const done = isDone(o);
                flash(
                    done ? 'done' : '',
                    stt != null ? String(stt) : '?',
                    name || o.orderCode || '',
                    done
                        ? `Đủ ${o.needed} món → mang ra kệ ${stt}`
                        : `đã chia ${o.sorted.size}/${o.needed} món`
                );
                beep(done ? 'done' : 'ok');
                vibe(done ? [40, 50, 60] : 40);
                refreshCard(o);
                renderStats();
            } else {
                // resolve OK nhưng đơn không trong manifest (hiếm) → vẫn báo STT
                flash('', stt != null ? String(stt) : '?', name || '', 'Bỏ vào kệ ' + (stt ?? '?'));
                beep('ok');
                vibe(40);
            }
        } catch (e) {
            flash('err', '!', '', e.message || 'Lỗi tra cứu');
            beep('warn');
        } finally {
            resolving = false;
        }
    }

    // ── Manifest "mang ra kệ" (bottom sheet) ────────────────────────
    function openManifest() {
        const orders = [...byId.values()]
            .filter((o) => o.sorted.size > 0)
            .sort((a, b) => (a.stt == null ? 1e9 : a.stt) - (b.stt == null ? 1e9 : b.stt));
        const body = $('#sheetBody');
        if (!orders.length) {
            body.innerHTML = '<div class="muted">Chưa chia món nào. Quét hàng để bắt đầu.</div>';
        } else {
            const rows = orders
                .map((o) => {
                    const done = isDone(o);
                    return `<div class="m-row">
                    <div class="m-badge" style="${done ? '' : 'background:var(--c-amber)'}">${o.stt != null ? esc(o.stt) : '?'}</div>
                    <div class="m-info">
                        <div class="m-name">${esc(o.customerName || o.orderCode || 'Khách lẻ')}</div>
                        <div class="m-sub">${done ? '✓ đủ ' : '⚠ mới ' + o.sorted.size + '/'}${o.needed} món${o.customerPhone ? ' · ' + esc(o.customerPhone) : ''}</div>
                    </div>
                </div>`;
                })
                .join('');
            body.innerHTML =
                `<div class="m-sub" style="padding:2px 4px 10px">Mang theo thứ tự kệ — đặt 1 lượt. ${orders.filter(isDone).length}/${orders.length} kệ đủ.</div>` +
                rows +
                `<button class="link-btn" id="resetBtn" style="margin-top:14px;width:100%;justify-content:center;color:var(--c-red)"><i data-lucide="rotate-ccw"></i> Xoá tiến độ — bắt đầu đợt mới</button>`;
            icons();
            $('#resetBtn')?.addEventListener('click', () => {
                scanned.clear();
                byId.forEach((o) => o.sorted.clear());
                $('#flash').hidden = true;
                renderGrid();
                renderStats();
                closeSheet();
                toast('Đã xoá tiến độ — đợt mới', 'ok');
            });
        }
        $('#sheetBack').hidden = false;
    }
    function closeSheet() {
        $('#sheetBack').hidden = true;
    }

    // ── Scanner (mobile: camera đen → nút chạm bật lại) ─────────────
    let camReady = false;
    function buildScanner() {
        const host = $('#scanHost');
        if (!host || !window.Web2BarcodeScanner) return null;
        const ctrl = window.Web2BarcodeScanner.mount(host, {
            continuous: true,
            dedupeMs: 1500,
            hint: 'Quét QR từng món',
            onScan: (code) => {
                const t = parseScan(code);
                if (t) onScan(t);
            },
        });
        ctrl?.on?.('ready', () => {
            camReady = true;
            hideCamRetry();
        });
        ctrl?.on?.('error', () => showCamRetry());
        return ctrl;
    }
    function initScanner() {
        camReady = false;
        scanner = buildScanner();
        if (!scanner) {
            showCamRetry('Trình duyệt không hỗ trợ camera');
            return;
        }
        setTimeout(() => {
            if (!camReady) showCamRetry();
        }, 5000);
    }
    function showCamRetry(msg) {
        const host = $('#scanHost');
        if (!host || host.querySelector('.cam-retry')) return;
        const b = document.createElement('button');
        b.className = 'cam-retry';
        b.type = 'button';
        b.innerHTML =
            '<i data-lucide="camera"></i><span>' + esc(msg || 'Chạm để bật camera') + '</span>';
        b.addEventListener('click', () => {
            hideCamRetry();
            camReady = false;
            if (scanner?.start) {
                try {
                    scanner.start();
                } catch (_) {}
            } else scanner = buildScanner();
            setTimeout(() => {
                if (!camReady) showCamRetry();
            }, 3000);
        });
        host.appendChild(b);
        icons();
    }
    function hideCamRetry() {
        $('#scanHost')?.querySelector('.cam-retry')?.remove();
    }

    function initSse() {
        try {
            if (window.Web2SSE?.subscribe) {
                let deb = null;
                sseUnsub = window.Web2SSE.subscribe('web2:product-units', () => {
                    clearTimeout(deb);
                    deb = setTimeout(load, 700);
                });
            }
        } catch (_) {}
    }

    function wireManual() {
        const go = () => {
            const v = $('#manualInput').value.trim();
            if (!v) return;
            const t = parseScan(v);
            if (t) onScan(t);
            $('#manualInput').value = '';
        };
        $('#manualGo').addEventListener('click', go);
        $('#manualInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') go();
        });
    }

    function boot() {
        icons();
        $('#reloadBtn').addEventListener('click', () => {
            load();
            toast('Đã tải lại', 'ok');
        });
        $('#manifestBtn').addEventListener('click', openManifest);
        $('#sheetClose').addEventListener('click', closeSheet);
        $('#sheetBack').addEventListener('click', (e) => {
            if (e.target === $('#sheetBack')) closeSheet();
        });
        wireManual();
        initSse();
        load();
        initScanner();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
