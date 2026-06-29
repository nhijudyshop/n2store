// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Quét tem (gộp 2026-06-29): 1 trang 2 CHẾ ĐỘ chung scanner — "Tra/Đóng gói" (resolve 1 món + reprint + sibling + vị trí) & "Chia hàng" (9 KỆ/xe + tiến độ + manifest + sơ đồ). Client: Web2ProductUnits + Web2ShelfMap. Đặc tả: docs/web2/KB-PRODUCT-CODE-UNITS.md
(function () {
    'use strict';

    // ── Config / helpers (CHUNG) ───────────────────────────────────
    const PU = () => window.Web2ProductUnits;
    const SM = () => window.Web2ShelfMap;
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
    function vibe(ms) {
        if (navigator.vibrate)
            try {
                navigator.vibrate(ms);
            } catch (_) {}
    }
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

    let MODE = 'tra'; // 'tra' | 'sort'
    let scanner = null;
    let torchOn = false;

    // =================================================================
    // CHẾ ĐỘ "TRA / ĐÓNG GÓI" — resolve 1 món
    // =================================================================
    let current = null;
    let resolving = false;
    let sibOpen = false;
    const STATUS_LABEL = {
        IN_STOCK: ['Còn hàng', 'blue'],
        ASSIGNED: ['Đã gán đơn', 'green'],
        PACKED: ['Đã đóng gói', 'green'],
        SHIPPED: ['Đã gửi', 'green'],
        RETURNED: ['Đã trả', 'amber'],
    };

    async function resolve(target) {
        if (resolving) return;
        resolving = true;
        const result = $('#result');
        result.innerHTML =
            '<div class="muted"><i data-lucide="loader-2" class="spin"></i> Đang tra cứu…</div>';
        result.hidden = false;
        icons();
        try {
            const data = await PU().resolve(target);
            current = data;
            renderResult(data);
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

    function renderResult(data) {
        const u = data.unit;
        const p = data.product || {};
        const orders = data.orders || [];
        const cl = data.clearance || {};
        const m = data.metrics || {};
        const [stLbl, stCls] = STATUS_LABEL[u.status] || [u.status, ''];
        const img = p.imageUrl
            ? `<img class="prod-img" src="${esc(p.imageUrl)}" alt="" />`
            : `<div class="prod-img" style="display:grid;place-items:center"><i data-lucide="package"></i></div>`;
        const suggested = orders.find((o) => o.remaining > 0) || null;
        const posLine = (s) => {
            const l = SM()?.locate(s);
            return l && l.ke
                ? `<div class="sub" style="margin-top:3px;color:var(--c-primary-d);font-weight:800">📍 ${esc(l.full)}</div>`
                : '';
        };
        let hero = '';
        if (u.status === 'ASSIGNED' && u.orderStt != null) {
            hero = `<div class="stt-hero done">
                <div class="lbl">Đã ở kệ</div>
                <div class="num">${esc(u.orderStt)}</div>
                <div class="sub">${esc(u.customerName || '')}${u.orderCode ? ' · ' + esc(u.orderCode) : ''}</div>
                ${posLine(u.orderStt)}
            </div>`;
        } else if (suggested && suggested.stt != null) {
            hero = `<div class="stt-hero">
                <div class="lbl">➡️ Bỏ vào kệ</div>
                <div class="num">${esc(suggested.stt)}</div>
                <div class="sub">${esc(suggested.customerName || 'Đơn ' + (suggested.orderCode || ''))}${suggested.remaining ? ' · còn thiếu ' + suggested.remaining : ''}</div>
                ${posLine(suggested.stt)}
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
            cl.isClearance ? `<span class="chip amber"><i data-lucide="tag"></i>Rớt xả</span>` : '',
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
                        ${done ? '<span class="chip green">đủ</span>' : `<span class="chip amber">còn ${o.remaining}</span>`}
                    </div>`;
                  })
                  .join('')
            : '<div class="muted">Không có đơn mở nào đặt SP này.</div>';
        const _mCard = (lbl, val, danger) =>
            `<div style="flex:1;min-width:50px;text-align:center;background:#f7faff;border:1px solid #e7ebf1;border-radius:10px;padding:6px 3px"><div style="font-size:10px;color:#5b6b7d;font-weight:600">${lbl}</div><div style="font-size:17px;font-weight:800;color:${danger ? '#dc2626' : '#16202c'}">${val}</div></div>`;
        const metricsHtml = `<div style="display:flex;gap:6px;margin-top:8px">${_mCard('Bán', Number(m.sold) || 0)}${_mCard('KH mới', Number(m.newCust) || 0)}${_mCard('NCC', Number(m.ncc) || 0)}${_mCard('Còn', Number(m.con) || 0, (Number(m.con) || 0) <= 0 && Number(m.ncc) > 0)}${_mCard('Tồn', Number(m.stock) || 0)}</div>`;

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
                ${metricsHtml}
                <button class="reprint-btn" id="reprintBtn"><i data-lucide="printer"></i> In lại tem này</button>
                ${hero}
            </div>
            <button class="sib-toggle${sibOpen ? ' open' : ''}" id="sibToggle" type="button" aria-expanded="${sibOpen}">
                <i data-lucide="layout-list"></i>
                <span id="sibTitle">Tất cả tem của SP này</span>
                <i data-lucide="chevron-down" class="sib-chev"></i>
            </button>
            <div class="sib-wrap" id="siblings"${sibOpen ? '' : ' hidden'}></div>
            <div class="sec-title">Đơn đang chờ SP này (${orders.length})</div>
            ${ordersHtml}
            <div class="sec-title">Lịch sử đơn vị</div>
            <div class="card" style="padding:8px 14px"><div class="hist" id="hist"><div class="muted" style="padding:8px">Đang tải…</div></div></div>
        `;
        icons();
        $('#reprintBtn')?.addEventListener('click', () => reprintUnit(u, p));
        const sibBtn = $('#sibToggle');
        sibBtn?.addEventListener('click', () => {
            const wrap = $('#siblings');
            if (!wrap) return;
            sibOpen = wrap.hasAttribute('hidden');
            wrap.toggleAttribute('hidden', !sibOpen);
            sibBtn.classList.toggle('open', sibOpen);
            sibBtn.setAttribute('aria-expanded', String(sibOpen));
        });
        loadSiblings(u.productCode, u.id);
    }

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
        PU()
            .reprint([u.id])
            .then(() => {
                if (current?.unit?.id === u.id) resolve({ id: u.id });
            });
    }

    async function loadEvents(unitId) {
        try {
            const host = $('#hist');
            if (!host) return;
            const evs = await PU().events(unitId);
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

    const SIB_ASSIGNED = ['ASSIGNED', 'PACKED', 'SHIPPED'];
    function sibRow(currentId, x) {
        const cur = x.id === currentId;
        const assigned = x.orderStt != null && SIB_ASSIGNED.includes(x.status);
        let right, sub;
        if (assigned) {
            right = `<div class="sib-stt">${esc(x.orderStt)}</div>`;
            sub = `<div class="sib-sub">${esc(x.customerName || x.orderCode || 'đã vào giỏ')}</div>`;
        } else if (x.status === 'RETURNED') {
            right = `<span class="chip amber">trả</span>`;
            sub = `<div class="sib-sub">đã trả</div>`;
        } else {
            right = `<span class="chip blue">kho</span>`;
            sub = `<div class="sib-sub">còn trong kho</div>`;
        }
        return `<div class="sib-row${cur ? ' current' : ''}">
            <div class="sib-info">
                <div class="sib-code">${esc(x.unitCode)}${cur ? '<span class="sib-now">đang quét</span>' : ''}</div>
                ${sub}
            </div>
            ${right}
        </div>`;
    }
    async function loadSiblings(productCode, currentId) {
        const host = $('#siblings');
        if (!host) return;
        host.innerHTML = '<div class="muted" style="padding:10px">Đang tải…</div>';
        try {
            const units = await PU().byProduct(productCode);
            const titleEl = $('#sibTitle');
            if (titleEl) titleEl.textContent = `Tất cả tem của SP này (${units.length})`;
            if (!units.length) {
                host.innerHTML = '<div class="muted" style="padding:10px">Chưa có tem nào.</div>';
                return;
            }
            const assignedN = units.filter(
                (x) => x.orderStt != null && SIB_ASSIGNED.includes(x.status)
            ).length;
            host.innerHTML =
                `<div class="sib-summary">${assignedN} đã vào giỏ · ${units.length - assignedN} còn kho</div>` +
                units.map((x) => sibRow(currentId, x)).join('');
            icons();
        } catch (_) {
            host.innerHTML =
                '<div class="muted" style="padding:10px">Không tải được danh sách tem.</div>';
        }
    }

    // =================================================================
    // CHẾ ĐỘ "CHIA HÀNG" — 9 KỆ (xe) + tiến độ + manifest + sơ đồ
    // =================================================================
    const byId = new Map(); // orderId → {orderId,orderCode,stt,customerName,customerPhone,needed,products,unitIds,sorted:Set}
    const unitToOrder = new Map();
    const scanned = new Set();
    let sortLoaded = false;
    let sortLoading = false;
    let sortBusy = false;

    async function sortLoad() {
        if (sortLoading) return;
        sortLoading = true;
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
                    sorted: new Set(ids.filter((id) => scanned.has(id))),
                });
            }
            sortLoaded = true;
            renderGrid();
            renderStats();
        } catch (e) {
            $('#grid').innerHTML =
                '<div class="muted">❌ Không tải được danh sách (' +
                esc(e.message || '') +
                ')</div>';
        } finally {
            sortLoading = false;
        }
    }

    const oDone = (o) => o.needed > 0 && o.sorted.size >= o.needed;
    const keOf = (o) => (SM() ? SM().keOf(o.stt) : null) || 0;
    function buildKes() {
        const m = new Map();
        for (const o of byId.values()) {
            const ke = keOf(o);
            let g = m.get(ke);
            if (!g) {
                g = {
                    ke,
                    wall: ke ? SM()?.wallOf(ke) || '' : 'khác',
                    orders: [],
                    needed: 0,
                    sorted: 0,
                };
                m.set(ke, g);
            }
            g.orders.push(o);
            g.needed += o.needed;
            g.sorted += o.sorted.size;
        }
        for (const g of m.values())
            g.orders.sort((a, b) => (a.stt == null ? 1e9 : a.stt) - (b.stt == null ? 1e9 : b.stt));
        return [...m.values()].sort((a, b) => (a.ke || 1e3) - (b.ke || 1e3));
    }
    const kDone = (g) => g.needed > 0 && g.sorted >= g.needed;

    function renderGrid() {
        const kes = buildKes();
        const host = $('#grid');
        if (!host) return;
        if (!kes.length) {
            host.innerHTML =
                '<div class="muted">Chưa có đơn nào chờ xếp kệ.<br>Thêm SP vào giỏ (native-orders) để hệ gán kệ.</div>';
            return;
        }
        host.innerHTML = kes
            .map((g) => {
                const done = kDone(g);
                const title = g.ke ? `Kệ ${g.ke}` : 'Chưa rõ kệ';
                return `<div class="ke-card${done ? ' done' : ''}" id="ke-${g.ke}" data-ke="${g.ke}">
                    <div class="c-top">
                        <div class="c-badge">${g.ke || '?'}</div>
                        <div class="c-info">
                            <div class="c-name">${esc(title)} <span class="c-wall">${esc(g.wall)}</span></div>
                            <div class="c-prog">${done ? '✓ ĐỦ — đưa xe ra' : `đã chia ${g.sorted}/${g.needed}`} · ${g.orders.length} đơn</div>
                        </div>
                        <i data-lucide="chevron-right" class="c-arrow"></i>
                    </div>
                </div>`;
            })
            .join('');
        host.querySelectorAll('.ke-card').forEach((el) =>
            el.addEventListener('click', () => openKe(Number(el.dataset.ke)))
        );
        icons();
    }
    function refreshKeCard(ke) {
        renderGrid();
        const el = $('#ke-' + ke);
        if (el) {
            el.classList.add('active');
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            setTimeout(() => el.classList.remove('active'), 1100);
        }
    }
    function renderStats() {
        const kes = buildKes();
        const totalUnits = kes.reduce((s, g) => s + g.needed, 0);
        const sortedUnits = kes.reduce((s, g) => s + g.sorted, 0);
        const doneKes = kes.filter(kDone).length;
        const el = $('#stats');
        if (!el) return;
        el.innerHTML =
            `<div class="stat${sortedUnits >= totalUnits && totalUnits > 0 ? ' ok' : ''}"><b>${sortedUnits}/${totalUnits}</b><span>Món đã chia</span></div>` +
            `<div class="stat${doneKes === kes.length && kes.length ? ' ok' : ''}"><b>${doneKes}/${kes.length}</b><span>Kệ (xe) đủ</span></div>`;
    }
    function flash(kind, big, lbl, name, sub) {
        const el = $('#flash');
        el.className = 'flash' + (kind ? ' ' + kind : '');
        el.innerHTML = `<div class="stt-num">${esc(big)}</div>
            <div class="f-meta">
                <div class="f-lbl">${esc(lbl)}</div>
                <div class="f-name">${esc(name || '')}</div>
                <div class="f-sub">${esc(sub || '')}</div>
            </div>`;
        el.hidden = false;
    }
    async function onScanSort(target) {
        if (sortBusy) return;
        sortBusy = true;
        try {
            let orderId = null,
                unitId = null,
                stt = null,
                name = null;
            if (target.id != null && unitToOrder.has(Number(target.id))) {
                unitId = Number(target.id);
                orderId = unitToOrder.get(unitId);
                const o = byId.get(orderId);
                stt = o?.stt;
                name = o?.customerName;
            } else {
                const data = await PU().resolve(target);
                const u = data.unit || {};
                unitId = u.id;
                if (u.status !== 'ASSIGNED' || u.orderStt == null) {
                    flash(
                        'warn',
                        '—',
                        'Lưu ý',
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
                if (!byId.has(orderId)) await sortLoad();
            }
            const loc = SM() ? SM().locate(stt) : null;
            const ke = loc && loc.ke ? loc.ke : null;
            if (scanned.has(unitId)) {
                flash(
                    'warn',
                    ke || '—',
                    'Đã chia rồi',
                    name || '',
                    loc ? 'STT ' + stt + ' · ' + loc.full : 'STT ' + stt
                );
                beep('warn');
                vibe(60);
                return;
            }
            scanned.add(unitId);
            const o = byId.get(orderId);
            if (o) o.sorted.add(unitId);
            const g = buildKes().find((x) => x.ke === ke);
            const keFull = g && kDone(g);
            flash(
                keFull ? 'done' : '',
                ke || '?',
                keFull ? `Kệ ${ke} ĐỦ — đưa xe ra` : `Bỏ vào XE / KỆ ${ke ?? '?'}`,
                name || (o && o.orderCode) || '',
                loc ? `STT ${stt} · ${loc.full}` : 'STT ' + stt
            );
            beep(keFull ? 'done' : 'ok');
            vibe(keFull ? [40, 50, 60] : 40);
            if (ke != null) refreshKeCard(ke);
            else renderGrid();
            renderStats();
        } catch (e) {
            flash('err', '!', 'Lỗi', '', e.message || 'Lỗi tra cứu');
            beep('warn');
        } finally {
            sortBusy = false;
        }
    }
    function openKe(ke) {
        const g = buildKes().find((x) => x.ke === ke);
        if (!g) return;
        $('#sheetTitle').textContent =
            `Kệ ${ke || '?'}${g.wall ? ' · ' + g.wall : ''} — đặt lên kệ`;
        const body = $('#sheetBody');
        const sttMap = new Map();
        g.orders.forEach((o) => sttMap.set(o.stt, o));
        const rows = g.orders
            .map((o) => {
                const loc = SM() ? SM().locate(o.stt) : null;
                const done = oDone(o);
                return `<div class="m-row">
                <div class="m-badge" style="${done ? '' : 'background:var(--c-amber)'}">${o.stt != null ? esc(o.stt) : '?'}</div>
                <div class="m-info">
                    <div class="m-name">${esc(o.customerName || o.orderCode || 'Khách lẻ')}</div>
                    <div class="m-sub">${loc ? '📍 ' + esc(loc.full) : ''} · ${done ? '✓ đủ ' : '⚠ ' + o.sorted.size + '/'}${o.needed} món</div>
                </div>
            </div>`;
            })
            .join('');
        let mapHtml = '';
        if (ke && SM()) {
            const grid = SM().keGrid(ke);
            mapHtml =
                `<div class="ke-map-wrap"><div class="ke-map-title">Sơ đồ Kệ ${ke} (ô có hàng tô màu)</div><div class="ke-map">` +
                grid
                    .flat()
                    .map((s) => {
                        const o = sttMap.get(s);
                        const cls = o ? (oDone(o) ? 'm-cell on' : 'm-cell part') : 'm-cell';
                        return `<span class="${cls}" title="STT ${s}${o ? ' · ' + esc(o.customerName || '') : ''}">${o ? s : ''}</span>`;
                    })
                    .join('') +
                `</div></div>`;
        }
        body.innerHTML =
            `<div class="m-sub" style="padding:2px 4px 8px">${g.orders.length} đơn · đặt theo STT (📍 Hàng·Cột). Đưa xe ${ke} ra, bỏ lên đúng ô.</div>` +
            mapHtml +
            rows;
        icons();
        $('#sheetBack').hidden = false;
    }
    function openManifest() {
        const kes = buildKes().filter((g) => g.sorted > 0);
        $('#sheetTitle').textContent = 'Đưa xe ra kệ';
        const body = $('#sheetBody');
        if (!kes.length) {
            body.innerHTML = '<div class="muted">Chưa chia món nào. Quét hàng để bắt đầu.</div>';
        } else {
            const rows = kes
                .map((g) => {
                    const done = kDone(g);
                    return `<div class="m-row" data-ke="${g.ke}" style="cursor:pointer">
                    <div class="m-badge" style="${done ? '' : 'background:var(--c-amber)'}">${g.ke || '?'}</div>
                    <div class="m-info">
                        <div class="m-name">Kệ ${g.ke || '?'} ${esc(g.wall)} ${done ? '· ✓ đưa ra' : ''}</div>
                        <div class="m-sub">${g.sorted}/${g.needed} món · ${g.orders.length} đơn — bấm xem ô đặt</div>
                    </div>
                    <i data-lucide="chevron-right"></i>
                </div>`;
                })
                .join('');
            body.innerHTML =
                `<div class="m-sub" style="padding:2px 4px 10px">9 xe = 9 kệ. Xe nào ĐỦ → đẩy ra kệ, bấm xem ô đặt. ${kes.filter(kDone).length}/${kes.length} xe đủ.</div>` +
                rows +
                `<button class="link-btn" id="resetBtn" style="margin-top:14px;width:100%;justify-content:center;color:var(--c-red)"><i data-lucide="rotate-ccw"></i> Xoá tiến độ — đợt mới</button>`;
            icons();
            body.querySelectorAll('.m-row[data-ke]').forEach((el) =>
                el.addEventListener('click', () => openKe(Number(el.dataset.ke)))
            );
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

    // =================================================================
    // CHUNG: scanner, manual, SSE, mode toggle, boot
    // =================================================================
    function dispatchScan(t) {
        if (!t) return;
        if (MODE === 'sort') onScanSort(t);
        else {
            vibe(40);
            resolve(t);
        }
    }

    let camReady = false;
    function buildScanner() {
        const host = $('#scanHost');
        if (!host || !window.Web2BarcodeScanner) return null;
        const ctrl = window.Web2BarcodeScanner.mount(host, {
            continuous: true,
            dedupeMs: 1800,
            hint: 'Đưa mã QR vào khung',
            onScan: (code) => dispatchScan(parseScan(code)),
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
            $('#scanHost') && showCamRetry('Trình duyệt không hỗ trợ camera');
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

    function initSse() {
        try {
            if (window.Web2SSE?.subscribe) {
                let deb = null;
                window.Web2SSE.subscribe('web2:product-units', () => {
                    clearTimeout(deb);
                    deb = setTimeout(() => {
                        if (MODE === 'sort') {
                            if (sortLoaded) sortLoad();
                        } else if (current?.unit) {
                            resolve({ id: current.unit.id });
                        }
                    }, 650);
                });
            }
        } catch (_) {}
    }

    function wireManual() {
        const go = () => {
            const v = $('#manualInput').value.trim();
            if (!v) return;
            dispatchScan(parseScan(v));
            if (MODE === 'sort') $('#manualInput').value = '';
        };
        $('#manualGo').addEventListener('click', go);
        $('#manualInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') go();
        });
    }

    function setMode(m) {
        MODE = m === 'sort' ? 'sort' : 'tra';
        document
            .querySelectorAll('.mode-tab')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.mode === MODE));
        $('#traView').hidden = MODE !== 'tra';
        $('#sortView').hidden = MODE !== 'sort';
        $('#tagBtn') && ($('#tagBtn').style.display = MODE === 'sort' ? '' : 'none');
        $('.scanner')?.classList.toggle('compact', MODE === 'sort');
        $('#manualInput')?.setAttribute(
            'placeholder',
            MODE === 'sort' ? 'Nhập mã đơn vị để chia…' : 'Nhập mã đơn vị (vd KHOAODEN-017)'
        );
        if (MODE === 'sort' && !sortLoaded) sortLoad();
        icons();
    }

    function boot() {
        icons();
        $('#torchBtn').addEventListener('click', toggleTorch);
        document
            .querySelectorAll('.mode-tab')
            .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
        $('#manifestBtn')?.addEventListener('click', openManifest);
        $('#sheetClose')?.addEventListener('click', closeSheet);
        $('#sheetBack')?.addEventListener('click', (e) => {
            if (e.target === $('#sheetBack')) closeSheet();
        });
        wireManual();
        initSse();
        // Deep-link: ?mode=sort → chia hàng; ?u=/?code= → tra 1 món.
        const qs = new URLSearchParams(location.search);
        const u = qs.get('u');
        const code = qs.get('code');
        if (qs.get('mode') === 'sort') {
            setMode('sort');
        } else if (u) {
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
