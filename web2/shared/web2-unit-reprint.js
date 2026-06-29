// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — In lại tem ĐƠN VỊ (per-unit reprint). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md
// =====================================================
// Web2UnitReprint — modal CHỌN mã đơn vị (qr1..qrN) của 1 SP rồi IN LẠI đúng tem đó.
// Tái dùng: Web2ProductsPrint (cùng modal giấy/máy in tem) + API /api/web2-product-units.
// Mã + QR GIỮ NGUYÊN id (in lại quét vẫn đúng món/đơn). print_count++.
//   Web2UnitReprint.open()                      → mở, tự cho tìm SP
//   Web2UnitReprint.open({ productCode, name, price, variant })  → mở thẳng vào 1 SP
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2UnitReprint) return;

    // API /api/web2-product-units/* qua CLIENT CHUNG window.Web2ProductUnits (1 nguồn).
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    function icons(root) {
        if (global.lucide?.createIcons)
            try {
                global.lucide.createIcons({
                    nameAttr: 'data-lucide',
                    ...(root ? { el: root } : {}),
                });
            } catch (_) {}
    }

    const STATUS_LABEL = {
        IN_STOCK: ['Còn hàng', '#0068ff'],
        ASSIGNED: ['Đã gán đơn', '#16a34a'],
        PACKED: ['Đã đóng gói', '#16a34a'],
        SHIPPED: ['Đã gửi', '#16a34a'],
        RETURNED: ['Đã trả', '#d98a00'],
        CLEARANCE: ['Rớt xả', '#d98a00'],
    };

    function ensureStyle() {
        if (document.getElementById('w2urStyle')) return;
        const s = document.createElement('style');
        s.id = 'w2urStyle';
        s.textContent = `
.w2ur-back{position:fixed;inset:0;background:rgba(16,24,40,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px}
.w2ur-modal{background:#fff;border-radius:16px;width:min(560px,96vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 48px rgba(0,0,0,.25);overflow:hidden;font-family:'Inter',system-ui,sans-serif}
.w2ur-hd{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #eef1f6}
.w2ur-hd h3{margin:0;font-size:16px;font-weight:800;flex:1;color:#16202c}
.w2ur-x{border:0;background:#f1f5f9;width:32px;height:32px;border-radius:9px;cursor:pointer;display:grid;place-items:center}
.w2ur-body{padding:14px 16px;overflow:auto;flex:1}
.w2ur-search{display:flex;gap:8px;margin-bottom:10px}
.w2ur-search input{flex:1;height:40px;border:1.5px solid #e7ebf1;border-radius:10px;padding:0 12px;font-size:15px}
.w2ur-plist{display:flex;flex-direction:column;gap:6px}
.w2ur-pitem{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1.5px solid #e7ebf1;border-radius:11px;cursor:pointer;background:#fff}
.w2ur-pitem:hover{border-color:#0068ff;background:#f7faff}
.w2ur-pitem .c{font-family:ui-monospace,monospace;font-weight:700;color:#0052cc;font-size:13px}
.w2ur-pitem .n{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w2ur-phead{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 10px;background:#f7faff;border-radius:10px}
.w2ur-phead .n{font-weight:800;font-size:15px}
.w2ur-phead .back{margin-left:auto;border:0;background:#eef1f6;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer}
.w2ur-tools{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px}
.w2ur-tools a{color:#0068ff;cursor:pointer;font-weight:700}
.w2ur-ulist{display:flex;flex-direction:column;gap:5px}
.w2ur-u{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1.5px solid #e7ebf1;border-radius:10px;cursor:pointer}
.w2ur-u.on{border-color:#0068ff;background:#f2f8ff}
.w2ur-u input{width:18px;height:18px;flex:0 0 auto}
.w2ur-u .uc{font-family:ui-monospace,monospace;font-weight:700;font-size:13.5px;flex:1}
.w2ur-u .st{font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px}
.w2ur-u .pc{font-size:11.5px;color:#5b6b7d}
.w2ur-ft{padding:12px 16px;border-top:1px solid #eef1f6;display:flex;gap:10px;align-items:center}
.w2ur-ft .cnt{font-size:13px;color:#5b6b7d;flex:1}
.w2ur-print{border:0;border-radius:11px;background:#0068ff;color:#fff;font-weight:800;font-size:14px;padding:11px 18px;cursor:pointer}
.w2ur-print:disabled{opacity:.5;cursor:not-allowed}
.w2ur-muted{text-align:center;color:#9aa7b6;padding:18px;font-size:13.5px}`;
        document.head.appendChild(s);
    }

    let root = null;
    let selected = new Set();
    let curProduct = null;
    let curUnits = [];

    function close() {
        if (root) root.remove();
        root = null;
        selected = new Set();
        curProduct = null;
        curUnits = [];
    }

    function open(opts = {}) {
        ensureStyle();
        close();
        root = document.createElement('div');
        root.className = 'w2ur-back';
        root.innerHTML = `
            <div class="w2ur-modal" role="dialog" aria-modal="true">
                <div class="w2ur-hd">
                    <i data-lucide="printer"></i>
                    <h3>In lại tem đơn vị</h3>
                    <button class="w2ur-x" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="w2ur-body" id="w2urBody"></div>
                <div class="w2ur-ft" id="w2urFt" hidden>
                    <span class="cnt" id="w2urCnt">Chọn tem cần in lại</span>
                    <button class="w2ur-print" id="w2urPrint" disabled>In lại tem đã chọn</button>
                </div>
            </div>`;
        document.body.appendChild(root);
        root.querySelector('.w2ur-x').addEventListener('click', close);
        root.addEventListener('click', (e) => {
            if (e.target === root) close();
        });
        root.querySelector('#w2urPrint').addEventListener('click', doPrint);
        icons(root);

        if (opts.productCode) {
            curProduct = {
                code: opts.productCode,
                name: opts.name || opts.productCode,
                price: opts.price || 0,
                variant: opts.variant || '',
            };
            loadUnits();
        } else {
            renderSearch();
        }
    }

    // ── Tìm SP (Web2ProductsCache) ─────────────────────────────────
    function renderSearch() {
        const body = root.querySelector('#w2urBody');
        body.innerHTML = `
            <div class="w2ur-search">
                <input id="w2urQ" placeholder="Tìm mã SP / tên SP…" autocomplete="off" />
            </div>
            <div class="w2ur-plist" id="w2urPlist"></div>`;
        const q = body.querySelector('#w2urQ');
        const render = () => {
            const term = q.value.trim().toLowerCase();
            const all = (global.Web2ProductsCache?.getAll?.() || []).filter((p) => p && p.code);
            const list = (
                term
                    ? all.filter(
                          (p) =>
                              String(p.code).toLowerCase().includes(term) ||
                              String(p.name || '')
                                  .toLowerCase()
                                  .includes(term)
                      )
                    : all
            ).slice(0, 60);
            const host = body.querySelector('#w2urPlist');
            host.innerHTML = list.length
                ? list
                      .map(
                          (p) =>
                              `<div class="w2ur-pitem" data-code="${esc(p.code)}"><span class="c">${esc(p.code)}</span><span class="n">${esc(p.name || '')}</span><i data-lucide="chevron-right"></i></div>`
                      )
                      .join('')
                : '<div class="w2ur-muted">Không thấy SP. Gõ mã/tên để tìm.</div>';
            host.querySelectorAll('.w2ur-pitem').forEach((el) => {
                el.addEventListener('click', () => {
                    const p =
                        global.Web2ProductsCache?.findByCode?.(el.dataset.code) ||
                        (global.Web2ProductsCache?.getAll?.() || []).find(
                            (x) => x.code === el.dataset.code
                        ) ||
                        {};
                    curProduct = {
                        code: el.dataset.code,
                        name: p.name || el.dataset.code,
                        price: Number(p.price) || 0,
                        variant: p.variant || '',
                    };
                    loadUnits();
                });
            });
            icons(host);
        };
        q.addEventListener('input', render);
        render();
        setTimeout(() => q.focus(), 30);
        root.querySelector('#w2urFt').hidden = true;
    }

    // ── List unit của SP đã chọn ───────────────────────────────────
    async function loadUnits() {
        selected = new Set();
        const body = root.querySelector('#w2urBody');
        body.innerHTML =
            '<div class="w2ur-muted"><i data-lucide="loader-2"></i> Đang tải tem…</div>';
        icons(body);
        try {
            curUnits = await global.Web2ProductUnits.byProduct(curProduct.code);
            renderUnits();
        } catch (e) {
            body.innerHTML = '<div class="w2ur-muted">❌ ' + esc(e.message) + '</div>';
        }
    }

    function renderUnits() {
        const body = root.querySelector('#w2urBody');
        const head = `<div class="w2ur-phead">
            <span class="n">${esc(curProduct.name)}</span>
            <span class="w2ur-pitem c" style="border:0;padding:0;background:none">${esc(curProduct.code)} · ${curUnits.length} tem</span>
            ${'<button class="back" id="w2urBack">‹ Đổi SP</button>'}
        </div>`;
        if (!curUnits.length) {
            body.innerHTML =
                head +
                '<div class="w2ur-muted">SP này chưa có tem đơn vị nào (chưa nhận hàng/in tem).</div>';
            body.querySelector('#w2urBack')?.addEventListener('click', renderSearch);
            root.querySelector('#w2urFt').hidden = true;
            return;
        }
        const rows = curUnits
            .map((u) => {
                const [lbl, color] = STATUS_LABEL[u.status] || [u.status, '#5b6b7d'];
                const stt = u.orderStt != null ? ` · kệ ${u.orderStt}` : '';
                return `<label class="w2ur-u" data-id="${u.id}">
                    <input type="checkbox" data-id="${u.id}" />
                    <span class="uc">${esc(u.unitCode)}</span>
                    <span class="st" style="color:${color};background:${color}1a">${esc(lbl)}${stt}</span>
                    <span class="pc">in ${u.printCount}×</span>
                </label>`;
            })
            .join('');
        body.innerHTML =
            head +
            `<div class="w2ur-tools"><a id="w2urAll">Chọn tất cả</a><a id="w2urNone">Bỏ chọn</a></div>` +
            `<div class="w2ur-ulist">${rows}</div>`;
        body.querySelector('#w2urBack')?.addEventListener('click', renderSearch);
        body.querySelectorAll('.w2ur-u input').forEach((cb) => {
            cb.addEventListener('change', () => {
                const id = Number(cb.dataset.id);
                if (cb.checked) selected.add(id);
                else selected.delete(id);
                cb.closest('.w2ur-u').classList.toggle('on', cb.checked);
                updateFooter();
            });
        });
        body.querySelector('#w2urAll')?.addEventListener('click', () => toggleAll(true));
        body.querySelector('#w2urNone')?.addEventListener('click', () => toggleAll(false));
        icons(body);
        root.querySelector('#w2urFt').hidden = false;
        updateFooter();
    }

    function toggleAll(on) {
        root.querySelectorAll('.w2ur-u input').forEach((cb) => {
            cb.checked = on;
            cb.closest('.w2ur-u').classList.toggle('on', on);
            if (on) selected.add(Number(cb.dataset.id));
        });
        if (!on) selected = new Set();
        updateFooter();
    }
    function updateFooter() {
        const n = selected.size;
        root.querySelector('#w2urCnt').textContent = n ? `Đã chọn ${n} tem` : 'Chọn tem cần in lại';
        const btn = root.querySelector('#w2urPrint');
        btn.disabled = n === 0;
        btn.textContent = n ? `In lại ${n} tem` : 'In lại tem đã chọn';
    }

    // ── In lại ─────────────────────────────────────────────────────
    function doPrint() {
        if (!global.Web2ProductsPrint?.open) {
            alert('Module in chưa tải xong (Web2ProductsPrint).');
            return;
        }
        const chosen = curUnits.filter((u) => selected.has(u.id));
        if (!chosen.length) return;
        const origin = location.origin;
        global.Web2ProductsPrint.open([
            {
                code: curProduct.code,
                name: curProduct.name,
                price: curProduct.price,
                variant: curProduct.variant || '',
                quantity: chosen.length,
                units: chosen.map((u) => ({
                    unitCode: u.unitCode,
                    qrUrl: origin + '/web2/unit-scan/?u=' + u.id,
                })),
            },
        ]);
        // print_count++ (best-effort, qua client chung)
        global.Web2ProductUnits.reprint(chosen.map((u) => u.id));
        close();
    }

    global.Web2UnitReprint = { open, close };
})(typeof window !== 'undefined' ? window : this);
