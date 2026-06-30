// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Quét tem (gộp bỏ tab 2026-06-29): 1 VIEW DUY NHẤT. Quét 1 món → hero "Bỏ vào KỆ X · STT · 📍 Hàng·Cột" + chi tiết SP (in lại, sibling, đơn, lịch sử) Ở TRÊN; tiến độ 9 kệ (xe) + sơ đồ kệ Ở DƯỚI. Bấm kệ → sheet chi tiết SP theo từng STT (cùng 1 mã ở nhiều STT → tô ô). Client: Web2ProductUnits + Web2ShelfMap. Đặc tả: docs/web2/KB-PRODUCT-CODE-UNITS.md
(function () {
    'use strict';

    // ── Config / helpers ───────────────────────────────────────────
    const PU = () => window.Web2ProductUnits;
    const SM = () => window.Web2ShelfMap;
    const $ = (sel, root = document) => root.querySelector(sel);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    const fmtVnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    // "HCAO3XCO35-002" → "002" (đuôi seq, gọn để đọc tay khi camera lỗi)
    const shortCode = (c) => {
        const s = String(c || '');
        const i = s.lastIndexOf('-');
        return i >= 0 ? s.slice(i + 1) : s;
    };
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

    let scanner = null;
    let torchOn = false;

    // =================================================================
    // QUÉT 1 MÓN — resolve + render chi tiết + đánh dấu vào tiến độ kệ
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
    const locate = (s) => (SM() ? SM().locate(s) : null);
    const keOfStt = (s) => {
        const l = locate(s);
        return l && l.ke ? l.ke : null;
    };

    async function onScan(target) {
        if (!target) return;
        vibe(30);
        await resolve(target);
    }

    async function resolve(target) {
        if (resolving) return;
        resolving = true;
        const result = $('#result');
        result.innerHTML =
            '<div class="card"><div class="muted"><i data-lucide="loader-2" class="spin"></i> Đang tra cứu…</div></div>';
        result.hidden = false;
        icons();
        try {
            const data = await PU().resolve(target);
            current = data;
            renderResult(data);
            loadEvents(data.unit.id);
            // Gộp: mỗi lần quét cũng cập nhật tiến độ chia hàng
            const r = markSorted(data.unit);
            beep(r.full ? 'done' : r.dup ? 'warn' : 'ok');
            vibe(r.full ? [40, 50, 60] : 40);
            // Put-to-light: sáng đúng ô kệ của tem vừa quét (nếu đã bật + cấu hình ESP32).
            if (
                window.Web2PutWall?.isOn() &&
                data.unit.status === 'ASSIGNED' &&
                data.unit.orderStt != null
            )
                window.Web2PutWall.light(data.unit.orderStt);
        } catch (e) {
            result.innerHTML =
                '<div class="card"><div class="muted">❌ ' +
                esc(e.message || 'Không tra cứu được') +
                '<br><span style="font-size:12px">' +
                esc(target.id ? 'u=' + target.id : target.code) +
                '</span></div></div>';
            beep('warn');
        } finally {
            resolving = false;
        }
    }

    function heroHtml(u, suggested) {
        const posLine = (s) => {
            const l = locate(s);
            return l && l.ke ? `<div class="hero-pos">📍 ${esc(l.full)}</div>` : '';
        };
        if (u.status === 'ASSIGNED' && u.orderStt != null) {
            const ke = keOfStt(u.orderStt);
            return `<div class="stt-hero done">
                <div class="lbl">➡️ Bỏ vào KỆ ${ke != null ? esc(ke) : '?'}</div>
                <div class="num">${esc(u.orderStt)}</div>
                ${posLine(u.orderStt)}
                <div class="sub">${esc(u.customerName || '')}${u.orderCode ? ' · ' + esc(u.orderCode) : ''}</div>
            </div>`;
        }
        if (suggested && suggested.stt != null) {
            const ke = keOfStt(suggested.stt);
            return `<div class="stt-hero">
                <div class="lbl">➡️ Bỏ vào KỆ ${ke != null ? esc(ke) : '?'}</div>
                <div class="num">${esc(suggested.stt)}</div>
                ${posLine(suggested.stt)}
                <div class="sub">${esc(suggested.customerName || 'Đơn ' + (suggested.orderCode || ''))}${suggested.remaining ? ' · còn thiếu ' + suggested.remaining : ''}</div>
            </div>`;
        }
        if ((current?.orders || []).length) {
            return `<div class="stt-hero done"><div class="lbl">Tất cả đơn đã đủ</div><div class="sub" style="margin-top:6px">Món này DƯ — để IN_STOCK</div></div>`;
        }
        return `<div class="stt-hero"><div class="lbl">Chưa có đơn nào cần SP này</div><div class="sub" style="margin-top:6px">Để IN_STOCK — chờ khách đặt</div></div>`;
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
                ${heroHtml(u, suggested)}
                <div class="prod" style="margin-top:12px">
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
    // TIẾN ĐỘ CHIA HÀNG — 9 KỆ (xe) + sơ đồ + manifest
    // =================================================================
    const byId = new Map(); // orderId → {orderId,orderCode,stt,customerName,...,needed,products,unitIds,sorted:Set}
    const unitToOrder = new Map();
    const scanned = new Set();
    let sortLoaded = false;
    let sortLoading = false;

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

    // Đánh dấu 1 unit đã quét vào tiến độ kệ. Trả {assigned, dup, full, ke}.
    function markSorted(u) {
        if (!u || u.status !== 'ASSIGNED' || u.orderStt == null || u.orderId == null)
            return { assigned: false, dup: false, full: false, ke: null };
        const oid = u.orderId;
        if (!byId.has(oid)) {
            if (sortLoaded) sortLoad(); // đơn mới → refresh manifest
            return { assigned: true, dup: false, full: false, ke: keOfStt(u.orderStt) };
        }
        if (scanned.has(u.id)) {
            renderStats();
            return { assigned: true, dup: true, full: false, ke: keOfStt(u.orderStt) };
        }
        scanned.add(u.id);
        const o = byId.get(oid);
        if (o) o.sorted.add(u.id);
        const ke = keOf(o);
        const g = buildKes().find((x) => x.ke === ke);
        const full = !!(g && kDone(g));
        if (ke != null) refreshKeCard(ke);
        else renderGrid();
        renderStats();
        return { assigned: true, dup: false, full, ke };
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

    // ── Sheet: chi tiết 1 kệ (SP theo từng STT) ─────────────────────
    // Modal chi tiết 1 đơn (bấm ô sơ đồ kệ). Dùng data có sẵn từ /sort-manifest.
    function openCellDetail(o) {
        if (!o) return;
        const loc = locate(o.stt);
        const done = oDone(o);
        const tags = (o.autoTags || [])
            .map((t) => {
                const c = /^#[0-9a-fA-F]{3,8}$/.test(t.color || '') ? t.color : '#6b7280';
                return `<span class="o-tag" style="background:${c}">${esc(t.name || t.code || '')}</span>`;
            })
            .join('');
        const prods = (o.products || [])
            .map((p) => {
                const codes = (p.codes || []).map(shortCode).filter(Boolean);
                return `<div class="cd-prod"><span class="cd-pname">${esc(p.name || p.code)}</span>${
                    (Number(p.qty) || 1) > 1 ? '<span class="cd-pqty">×' + p.qty + '</span>' : ''
                }${codes.length ? `<span class="m-codes">#${codes.join(',')}</span>` : ''}</div>`;
            })
            .join('');
        const ov = document.createElement('div');
        ov.className = 'cd-back';
        ov.innerHTML = `<div class="cd-modal" role="dialog" aria-modal="true">
            <div class="cd-hd">
                <div class="cd-stt ${done ? 'ok' : ''}">${o.stt != null ? esc(o.stt) : '?'}</div>
                <div class="cd-hd-main">
                    <div class="cd-name">${esc(o.customerName || 'Khách lẻ')}</div>
                    <div class="cd-meta">${esc(o.orderCode || '')}${o.customerPhone ? ' · ' + esc(o.customerPhone) : ''}</div>
                </div>
                <button class="cd-close" aria-label="Đóng"><i data-lucide="x"></i></button>
            </div>
            ${tags ? `<div class="o-tags cd-tags">${tags}</div>` : ''}
            <div class="cd-row">${loc ? `<span class="cd-loc">📍 ${esc(loc.full)}</span>` : ''}<span class="cd-prog ${done ? 'ok' : ''}">${done ? '✓ đã đủ' : '⚠ ' + o.sorted.size + '/' + o.needed} món</span></div>
            <div class="cd-prods">${prods || '<div class="muted">—</div>'}</div>
        </div>`;
        document.body.appendChild(ov);
        icons();
        const close = () => {
            ov.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        ov.addEventListener('click', (e) => {
            if (e.target === ov) close();
        });
        ov.querySelector('.cd-close').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
    }

    function openKe(ke) {
        const g = buildKes().find((x) => x.ke === ke);
        if (!g) return;
        $('#sheetTitle').textContent =
            `Kệ ${ke || '?'}${g.wall ? ' · ' + g.wall : ''} — đặt lên kệ`;
        const body = $('#sheetBody');
        const sttMap = new Map();
        g.orders.forEach((o) => sttMap.set(o.stt, o));

        // SP tóm tắt: cùng 1 mã có thể ở NHIỀU STT → MỖI tem (001/002…) gán 1 STT.
        // byStt: stt → [đuôi mã tem] để chỉ rõ "tem nào vào STT nào".
        const prodMap = new Map();
        g.orders.forEach((o) =>
            (o.products || []).forEach((p) => {
                let e = prodMap.get(p.code);
                if (!e) {
                    e = { code: p.code, name: p.name || p.code, qty: 0, byStt: new Map() };
                    prodMap.set(p.code, e);
                }
                e.qty += Number(p.qty) || 0;
                if (o.stt != null) {
                    const arr = e.byStt.get(o.stt) || [];
                    (p.codes || []).forEach((c) => arr.push(shortCode(c)));
                    e.byStt.set(o.stt, arr);
                }
            })
        );
        const prods = [...prodMap.values()].sort((a, b) => b.qty - a.qty);
        const multi = prods.some((e) => e.byStt.size > 1);
        const sttPartsOf = (e) =>
            [...e.byStt.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(
                    ([stt, codes]) =>
                        `STT ${stt}${codes.length ? ' <b>#' + codes.join(',') + '</b>' : ''}`
                )
                .join(' · ');
        const sumHtml = prods.length
            ? `<div class="kp-hint">${multi ? 'Cùng 1 mã ở nhiều STT — mỗi tem (#001…) vào ĐÚNG 1 STT. Bấm 1 SP để TÔ Ô:' : 'Các loại SP trong kệ này (#mã tem theo STT):'}</div>` +
              `<div class="kp-sum">` +
              prods
                  .map(
                      (e) =>
                          `<button class="kp-item" type="button" data-code="${esc(e.code)}">
                            <span class="kp-name">${esc(e.name)} <span class="kp-q">×${e.qty}</span></span>
                            <span class="kp-meta">${sttPartsOf(e)}</span>
                          </button>`
                  )
                  .join('') +
              `</div>`
            : '';

        // Sơ đồ kệ — ô có hàng tô màu, bấm → cuộn tới đơn.
        let mapHtml = '';
        if (ke && SM()) {
            const grid = SM().keGrid(ke);
            mapHtml =
                `<div class="ke-map-wrap"><div class="ke-map-title">Sơ đồ Kệ ${ke} — bấm ô để xem đơn</div><div class="ke-map">` +
                grid
                    .flat()
                    .map((s) => {
                        const o = sttMap.get(s);
                        const cls = o ? (oDone(o) ? 'm-cell on' : 'm-cell part') : 'm-cell';
                        // Tag đơn ngay trên ô kệ (ô rộng, còn chỗ) — pill trắng đọc rõ trên nền cam/xanh.
                        const ctags = o && Array.isArray(o.autoTags) ? o.autoTags : [];
                        const ctagHtml = ctags.length
                            ? `<span class="mc-tags">${ctags
                                  .map(
                                      (t) => `<i class="mc-tag">${esc(t.name || t.code || '')}</i>`
                                  )
                                  .join('')}</span>`
                            : '';
                        const inner = o ? `<b class="mc-num">${s}</b>${ctagHtml}` : '';
                        return `<span class="${cls}" data-stt="${s}" title="STT ${s}${o ? ' · ' + esc(o.customerName || '') : ''}">${inner}</span>`;
                    })
                    .join('') +
                `</div></div>`;
        }

        // Hàng theo STT — KÈM danh sách SP của STT đó.
        const rows = g.orders
            .map((o) => {
                const loc = locate(o.stt);
                const done = oDone(o);
                const prodLine = (o.products || [])
                    .map((p) => {
                        const codes = (p.codes || []).map(shortCode).filter(Boolean);
                        const tail = codes.length
                            ? ` <span class="m-codes">#${codes.join(',')}</span>`
                            : '';
                        return `${esc(p.name || p.code)}${(Number(p.qty) || 1) > 1 ? ' ×' + p.qty : ''}${tail}`;
                    })
                    .join(' · ');
                // Tag đơn (CHỜ HÀNG / PHIẾU BÁN HÀNG…) từ /sort-manifest. Màu theo def thẻ.
                const tagsHtml = (o.autoTags || [])
                    .map((t) => {
                        const c = /^#[0-9a-fA-F]{3,8}$/.test(t.color || '') ? t.color : '#6b7280';
                        return `<span class="o-tag" style="background:${c}">${esc(t.name || t.code || '')}</span>`;
                    })
                    .join('');
                return `<div class="m-row" id="mrow-${o.stt}" data-stt="${o.stt}">
                <div class="m-badge" style="${done ? '' : 'background:var(--c-amber)'}">${o.stt != null ? esc(o.stt) : '?'}</div>
                <div class="m-info">
                    <div class="m-name">${esc(o.customerName || o.orderCode || 'Khách lẻ')}</div>
                    ${tagsHtml ? `<div class="o-tags">${tagsHtml}</div>` : ''}
                    <div class="m-prods">${prodLine || '—'}</div>
                    <div class="m-sub">${loc ? '📍 ' + esc(loc.full) + ' · ' : ''}${done ? '✓ đủ ' : '⚠ ' + o.sorted.size + '/'}${o.needed} món</div>
                </div>
            </div>`;
            })
            .join('');

        body.innerHTML =
            `<div class="m-sub" style="padding:2px 4px 8px">${g.orders.length} đơn · ${prods.length} loại SP. Đưa xe ${ke} ra, bỏ đúng STT (📍 Hàng·Cột).</div>` +
            sumHtml +
            mapHtml +
            rows;
        icons();

        const clearHot = () => {
            body.querySelectorAll('.m-cell.hot').forEach((c) => c.classList.remove('hot'));
            body.querySelectorAll('.m-row.hot').forEach((r) => r.classList.remove('hot'));
        };
        // Bấm 1 SP → tô mọi STT chứa mã đó (giải bài "cùng kệ nhiều SP giống nhau").
        body.querySelectorAll('.kp-item').forEach((btn) =>
            btn.addEventListener('click', () => {
                const code = btn.dataset.code;
                const wasActive = btn.classList.contains('active');
                body.querySelectorAll('.kp-item').forEach((b) => b.classList.remove('active'));
                clearHot();
                if (wasActive) {
                    if (window.Web2PutWall?.isOn()) window.Web2PutWall.clear();
                    return;
                }
                btn.classList.add('active');
                const stts = [];
                g.orders.forEach((o) => {
                    if (o.stt != null && (o.products || []).some((p) => p.code === code))
                        stts.push(o.stt);
                });
                stts.forEach((s) => {
                    body.querySelector('.m-cell[data-stt="' + s + '"]')?.classList.add('hot');
                    body.querySelector('#mrow-' + s)?.classList.add('hot');
                });
                // Put-to-light: sáng TẤT CẢ ô của SP này (đặt cả "sấp" 1 lượt).
                if (window.Web2PutWall?.isOn()) window.Web2PutWall.lightMany(stts);
                const first = stts.sort((a, b) => a - b)[0];
                if (first != null)
                    body.querySelector('#mrow-' + first)?.scrollIntoView({
                        block: 'nearest',
                        behavior: 'smooth',
                    });
            })
        );
        // Bấm 1 ô sơ đồ → MỞ MODAL chi tiết đơn của STT đó (KHÔNG cuộn xuống).
        body.querySelectorAll('.m-cell[data-stt]').forEach((cell) =>
            cell.addEventListener('click', () => {
                const o = sttMap.get(Number(cell.dataset.stt));
                if (o) openCellDetail(o);
            })
        );
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

    // ── Cài đặt đèn put-to-light (ESP32) ────────────────────────────
    function openPutwallSettings() {
        const PW = window.Web2PutWall;
        if (!PW) {
            toast('Module đèn LED chưa tải', 'err');
            return;
        }
        const c = PW.cfg();
        $('#sheetTitle').textContent = '💡 Đèn LED chỉ ô kệ (put-to-light)';
        const body = $('#sheetBody');
        const httpsWarn =
            location.protocol === 'https:'
                ? `<div class="pw-warn">⚠ Trang đang chạy HTTPS → trình duyệt CHẶN gọi ESP32 (http). Mở trang qua HTTP LAN (vd <code>http://&lt;ip-máy-shop&gt;:8080/web2/unit-scan/</code>) mới dùng được đèn. Xem <b>docs/web2/PUTWALL-LED-SETUP.md</b>.</div>`
                : '';
        body.innerHTML = `
            ${httpsWarn}
            <label class="pw-row"><input type="checkbox" id="pwEnable" ${c.enabled ? 'checked' : ''}/> <b>Bật đèn LED khi quét</b></label>
            <div class="pw-lbl">Địa chỉ ESP32 — mỗi dòng 1 controller</div>
            <textarea id="pwUrls" class="pw-ta" rows="3" placeholder="http://192.168.1.50&#10;http://192.168.1.51">${esc((c.urls || []).join('\n'))}</textarea>
            <div class="pw-grid">
                <label class="pw-cell">Màu<input type="color" id="pwColor" value="${esc(c.color || '#1aff5a')}"/></label>
                <label class="pw-cell">Độ sáng<input type="range" id="pwBright" min="10" max="255" value="${Number(c.brightness) || 160}"/></label>
                <label class="pw-cell">Tự tắt (ms)<input type="number" id="pwMs" value="${Number(c.ms) || 0}" min="0" step="500"/></label>
            </div>
            <div class="pw-btns">
                <button class="link-btn" id="pwSave"><i data-lucide="save"></i> Lưu</button>
                <button class="link-btn" id="pwTest"><i data-lucide="zap"></i> Test</button>
                <button class="link-btn" id="pwClear"><i data-lucide="power"></i> Tắt đèn</button>
                <button class="link-btn" id="pwHealth"><i data-lucide="activity"></i> Kiểm tra</button>
            </div>
            <div class="pw-status" id="pwStatus"></div>
            <div class="pw-help">Quét tem → ô kệ tương ứng SÁNG. Trong chi tiết kệ, bấm 1 SP → sáng MỌI ô của SP đó (đặt cả sấp 1 lượt). Cài đặt + mua linh kiện: <b>docs/web2/PUTWALL-LED-SETUP.md</b>.</div>
        `;
        icons();
        const readForm = () => ({
            enabled: $('#pwEnable').checked,
            urls: $('#pwUrls')
                .value.split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            color: $('#pwColor').value,
            brightness: Number($('#pwBright').value) || 160,
            ms: Number($('#pwMs').value) || 0,
        });
        $('#pwSave').addEventListener('click', () => {
            PW.save(readForm());
            toast('Đã lưu cấu hình đèn', 'ok');
        });
        $('#pwTest').addEventListener('click', () => {
            PW.save(readForm());
            PW.test();
            toast('Đã gửi lệnh test', 'ok');
        });
        $('#pwClear').addEventListener('click', () => {
            PW.save(readForm());
            PW.clear();
        });
        $('#pwHealth').addEventListener('click', async () => {
            PW.save(readForm());
            const list = PW.urls();
            const st = $('#pwStatus');
            if (!list.length) {
                st.textContent = 'Chưa có địa chỉ ESP32.';
                return;
            }
            st.textContent = 'Đang kiểm tra…';
            const rows = await Promise.all(
                list.map(async (u) => {
                    const h = await PW.health(u);
                    return h.ok
                        ? `${u} → ✅ STT ${h.base}..${h.base + h.num - 1}`
                        : `${u} → ❌ ${h.error || 'lỗi'}`;
                })
            );
            st.innerHTML = rows.map(esc).join('<br>');
        });
        $('#sheetBack').hidden = false;
    }

    // =================================================================
    // scanner, manual, SSE, boot
    // =================================================================
    let camReady = false;
    function buildScanner() {
        const host = $('#scanHost');
        if (!host || !window.Web2BarcodeScanner) return null;
        const ctrl = window.Web2BarcodeScanner.mount(host, {
            continuous: true,
            dedupeMs: 1800,
            hint: 'Đưa mã QR vào khung',
            onScan: (code) => onScan(parseScan(code)),
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
                        if (sortLoaded) sortLoad();
                        if (current?.unit) resolve({ id: current.unit.id });
                    }, 650);
                });
            }
        } catch (_) {}
    }

    function wireManual() {
        const go = () => {
            const v = $('#manualInput').value.trim();
            if (!v) return;
            onScan(parseScan(v));
            $('#manualInput').value = '';
        };
        $('#manualGo').addEventListener('click', go);
        $('#manualInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') go();
        });
    }

    function boot() {
        icons();
        $('#torchBtn').addEventListener('click', toggleTorch);
        $('#putwallBtn')?.addEventListener('click', openPutwallSettings);
        $('#manifestBtn')?.addEventListener('click', openManifest);
        $('#sheetClose')?.addEventListener('click', closeSheet);
        $('#sheetBack')?.addEventListener('click', (e) => {
            if (e.target === $('#sheetBack')) closeSheet();
        });
        wireManual();
        initSse();
        sortLoad(); // tiến độ kệ luôn hiển thị
        // Deep-link: ?u= / ?code= → tra 1 món ngay. (?mode=sort cũ: bỏ qua, view đã gộp.)
        const qs = new URLSearchParams(location.search);
        const u = qs.get('u');
        const code = qs.get('code');
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
