// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2VariantPicker — NGUỒN DUY NHẤT nhập biến thể theo MÓN (dùng chung Kho SP + Sổ Order)
// =====================================================
//
// 1 sản phẩm có thể gồm NHIỀU MÓN (loại): vd BỘ = Áo + Quần. Mỗi món có 1 ô
// biến thể riêng ("/"-aware: Màu hoặc "Màu / Size"). Ghép các món bằng " + ".
//   - category: 'Áo + Quần'                (các LOẠI ngăn ' + ', từ Web2ProductTypesCache)
//   - variant : 'Trắng / M + Đen / L'      (biến thể từng món ngăn ' + ')
// Chọn loại = multi-select chip; KHÔNG có nhãn "Set" riêng (combo = chọn ≥2 loại).
//
// API:
//   const ctl = Web2VariantPicker.mount(containerEl, {
//       category, value, compact, showTypes=true,
//       onChange: ({ variant, category, combos }) => {},
//   });
//   ctl.getVariant()  // 'Trắng / M + Đen / L'
//   ctl.getCategory() // 'Áo + Quần'
//   ctl.getCombos()   // [] | ['Trắng / S','Trắng / M',…]  (chỉ khi 1 món + nhiều token → cartesian)
//   ctl.setValue({category, value}); ctl.focus(); ctl.destroy(); ctl.el
//
// Deps (đọc, KHÔNG gọi API trực tiếp): Web2VariantsCache (gợi ý Màu/Size),
// Web2ProductTypesCache (loại), Web2VariantMulti (cartesian/expand). An toàn dùng
// mọi nơi; degrade gọn nếu thiếu cache.

(function (global) {
    'use strict';
    if (global.Web2VariantPicker) return;

    const PIECE_SEP = ' + '; // ngăn giữa các MÓN
    const ATTR_SEP = ' / '; // ngăn Màu / Size trong 1 món (mirror Web2VariantMulti.SEP)

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Split chuỗi đã lưu thành mảng (' + '): "Trắng / M + Đen" → ["Trắng / M","Đen"].
    function splitPieces(s) {
        return String(s || '')
            .split('+')
            .map((x) => x.trim())
            .filter((x, i, arr) => x !== '' || arr.length === 1);
    }

    // ── CSS (inject 1 lần) ───────────────────────────────────────────────
    let _cssDone = false;
    function ensureCss() {
        if (_cssDone || typeof document === 'undefined') return;
        _cssDone = true;
        const css = `
.w2vp{display:flex;flex-direction:column;gap:8px;font-size:13px;}
.w2vp-types{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.w2vp-types-lbl{font-size:11px;font-weight:600;color:#64748b;margin-right:2px;}
.w2vp-chip{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;cursor:pointer;line-height:1.3;white-space:nowrap;}
.w2vp-chip:hover{border-color:#94a3b8;}
.w2vp-chip.is-on{background:#4f46e5;border-color:#4f46e5;color:#fff;}
.w2vp-chip-empty{font-size:11px;color:#94a3b8;}
.w2vp-chip-empty a{color:#4f46e5;}
.w2vp-pieces{display:flex;flex-wrap:wrap;gap:8px;}
.w2vp-piece{position:relative;display:flex;flex-direction:column;gap:2px;min-width:120px;flex:1 1 140px;}
.w2vp-piece-lbl{font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.02em;}
.w2vp-input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:6px 9px;font-size:13px;outline:none;}
.w2vp-input:focus{border-color:#4f46e5;box-shadow:0 0 0 2px rgba(79,70,229,.15);}
.w2vp-dd{position:absolute;top:100%;left:0;right:0;z-index:1000;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.14);margin-top:3px;max-height:240px;overflow:auto;}
.w2vp-dd[hidden]{display:none;}
.w2vp-item{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;background:none;text-align:left;padding:7px 10px;cursor:pointer;font-size:13px;}
.w2vp-item:hover{background:#f1f5f9;}
.w2vp-item-grp{font-size:10px;color:#94a3b8;background:#f1f5f9;border-radius:4px;padding:1px 6px;}
.w2vp-empty{padding:8px 10px;font-size:12px;color:#94a3b8;}
.w2vp-empty a{color:#4f46e5;}
.w2vp-hint{display:flex;align-items:center;gap:5px;font-size:11px;color:#6366f1;background:#eef2ff;border-radius:6px;padding:4px 8px;cursor:pointer;}
.w2vp-preview{font-size:11px;color:#475569;}
.w2vp-preview b{color:#4f46e5;}
.w2vp-qty-head{font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;}
.w2vp-qty-list{display:flex;flex-wrap:wrap;gap:6px;}
.w2vp-qty-item{display:flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:3px 6px;font-size:12px;}
.w2vp-qty-item span{color:#334155;font-weight:600;white-space:nowrap;}
.w2vp-qty{width:52px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:3px 6px;font-size:12px;text-align:right;}
.w2vp-qty:focus{outline:none;border-color:#4f46e5;}
.w2vp.is-compact{gap:5px;}
.w2vp.is-compact .w2vp-piece{min-width:96px;flex-basis:110px;}
.w2vp.is-compact .w2vp-input{padding:4px 7px;font-size:12px;}
`;
        const st = document.createElement('style');
        st.id = 'w2vp-style';
        st.textContent = css;
        document.head.appendChild(st);
    }

    function mount(container, opts = {}) {
        ensureCss();
        if (!container) throw new Error('Web2VariantPicker.mount: container required');
        const showTypes = opts.showTypes !== false;
        const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
        // withQty: khi 1 món tách >1 biến thể (cartesian) → cho nhập SL TỪNG biến thể.
        const withQty = opts.withQty === true;
        const defaultQty = Number.isFinite(Number(opts.qty)) ? Math.max(0, Number(opts.qty)) : 1;

        // State: pieces = [{ type, value }]. type = tên loại (''), value = biến thể của món.
        let pieces = [];
        const qtyByVariant = new Map(); // variant → SL (chỉ dùng khi withQty + combos>1)

        const root = document.createElement('div');
        root.className = 'w2vp' + (opts.compact ? ' is-compact' : '');
        root.innerHTML = `
            <div class="w2vp-types" ${showTypes ? '' : 'hidden'}></div>
            <div class="w2vp-pieces"></div>
            <div class="w2vp-preview" hidden></div>`;
        container.appendChild(root);
        const typesEl = root.querySelector('.w2vp-types');
        const piecesEl = root.querySelector('.w2vp-pieces');
        const previewEl = root.querySelector('.w2vp-preview');

        function combinedVariant() {
            return pieces
                .map((p) => (p.value || '').trim())
                .filter(Boolean)
                .join(PIECE_SEP);
        }
        function combinedCategory() {
            return pieces
                .map((p) => (p.type || '').trim())
                .filter(Boolean)
                .join(PIECE_SEP);
        }
        function combos() {
            // Cartesian CHỈ khi đúng 1 món + nhiều token "/" (giữ bulk-create Kho SP).
            if (pieces.length !== 1) return [];
            const vm = global.Web2VariantMulti;
            if (!vm?.expand) return [];
            try {
                return vm.expand((pieces[0].value || '').trim()) || [];
            } catch {
                return [];
            }
        }
        // Tên SP gợi ý TỪ lựa chọn: mỗi món "LOẠI BIẾNTHỂ" → nối khoảng trắng, IN HOA.
        // VD: Áo Trắng + Quần Đen + Giày Đen → "ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN".
        // "/" trong biến thể (Màu / Size) → khoảng trắng cho tên gọn ("Trắng / M" → "TRẮNG M").
        function genName() {
            return pieces
                .map((p) => {
                    const t = (p.type || '').trim();
                    const v = (p.value || '').trim().replace(/\s*\/\s*/g, ' ');
                    return [t, v].filter(Boolean).join(' ').trim();
                })
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLocaleUpperCase('vi-VN');
        }
        // SL từng biến thể (chỉ ý nghĩa khi withQty + combos>1). variant chưa nhập
        // → defaultQty (mặc định = SL dòng truyền vào). [{variant, qty}].
        function variantQtys() {
            const cb = combos();
            if (!withQty || cb.length <= 1) return [];
            return cb.map((v) => ({
                variant: v,
                qty: qtyByVariant.has(v) ? qtyByVariant.get(v) : defaultQty,
            }));
        }
        function totalQty() {
            return variantQtys().reduce((s, x) => s + (Number(x.qty) || 0), 0);
        }
        function payload() {
            return {
                variant: combinedVariant(),
                category: combinedCategory(),
                combos: combos(),
                name: genName(),
                variantQtys: variantQtys(),
                totalQty: totalQty(),
            };
        }
        function fire() {
            renderPreview();
            onChange(payload());
        }
        // Đổi SL từng biến thể: KHÔNG re-render (giữ focus ô input), chỉ báo onChange.
        function fireQtyOnly() {
            onChange(payload());
        }

        function renderPreview() {
            const cb = combos();
            if (cb.length > 1) {
                previewEl.hidden = false;
                if (withQty) {
                    // Nhập SL từng biến thể; tổng cập nhật realtime.
                    previewEl.innerHTML =
                        `<div class="w2vp-qty-head">Nhập SL từng biến thể (tổng: <b class="w2vp-qty-total">${totalQty()}</b>):</div>` +
                        `<div class="w2vp-qty-list">` +
                        cb
                            .map(
                                (c) =>
                                    `<label class="w2vp-qty-item"><span>${esc(c)}</span><input type="number" min="0" class="w2vp-qty" data-variant="${esc(c)}" value="${qtyByVariant.has(c) ? qtyByVariant.get(c) : defaultQty}" /></label>`
                            )
                            .join('') +
                        `</div>`;
                    previewEl.querySelectorAll('.w2vp-qty').forEach((inp) => {
                        inp.addEventListener('input', () => {
                            qtyByVariant.set(
                                inp.dataset.variant,
                                Math.max(0, Number(inp.value) || 0)
                            );
                            const t = previewEl.querySelector('.w2vp-qty-total');
                            if (t) t.textContent = totalQty();
                            fireQtyOnly();
                        });
                    });
                    return;
                }
                previewEl.innerHTML = `Tạo <b>${cb.length}</b> SP biến thể: ${cb
                    .slice(0, 12)
                    .map((c) => esc(c))
                    .join(' · ')}${cb.length > 12 ? ' …' : ''}`;
                return;
            }
            // BỘ nhiều món → preview ZIP "Áo Trắng, Quần Đen" (loại + biến thể từng món).
            const paired = pieces
                .map((p) => {
                    const t = (p.type || '').trim();
                    const v = (p.value || '').trim();
                    return t && v ? `${t} ${v}` : t || v;
                })
                .filter(Boolean);
            if (pieces.length > 1 && paired.length) {
                previewEl.hidden = false;
                previewEl.innerHTML = `Biến thể bộ: <b>${esc(paired.join(', '))}</b>`;
                return;
            }
            previewEl.hidden = true;
            previewEl.textContent = '';
        }

        // ── Type chips ───────────────────────────────────────────────────
        function renderTypes() {
            if (!showTypes) return;
            const cache = global.Web2ProductTypesCache;
            const all = cache?.getAll?.() || [];
            const selected = new Set(pieces.map((p) => (p.type || '').trim()).filter(Boolean));
            if (!all.length) {
                typesEl.innerHTML = `<span class="w2vp-chip-empty">Chưa có loại — <a href="../web2/product-types/index.html" target="_blank">thêm ở Cấu hình →</a></span>`;
                return;
            }
            typesEl.innerHTML =
                `<span class="w2vp-types-lbl">Loại:</span>` +
                all
                    .map(
                        (t) =>
                            `<button type="button" class="w2vp-chip${selected.has(t.name) ? ' is-on' : ''}" data-type="${esc(t.name)}">${esc(t.name)}</button>`
                    )
                    .join('');
            typesEl.querySelectorAll('.w2vp-chip').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => toggleType(btn.dataset.type));
            });
        }

        function toggleType(name) {
            const idx = pieces.findIndex((p) => (p.type || '').trim() === name);
            if (idx !== -1) {
                // Bỏ chọn → xoá món (giữ value của các món khác).
                pieces.splice(idx, 1);
                if (!pieces.length) pieces.push({ type: '', value: '' });
            } else {
                // Chọn thêm → nếu đang có 1 món "trống loại" thì gán loại cho nó, else thêm món mới.
                const blank = pieces.find((p) => !(p.type || '').trim() && !(p.value || '').trim());
                if (blank) blank.type = name;
                else pieces.push({ type: name, value: '' });
            }
            renderAll();
            fire();
        }

        // ── Per-piece variant input + dropdown ───────────────────────────
        function renderPieces() {
            piecesEl.innerHTML = '';
            pieces.forEach((piece, i) => {
                const wrap = document.createElement('div');
                wrap.className = 'w2vp-piece';
                const labelHtml = piece.type
                    ? `<span class="w2vp-piece-lbl">${esc(piece.type)}</span>`
                    : pieces.length > 1
                      ? `<span class="w2vp-piece-lbl">Món ${i + 1}</span>`
                      : '';
                wrap.innerHTML = `${labelHtml}
                    <input class="w2vp-input" type="text" autocomplete="off" spellcheck="false"
                           placeholder="${piece.type ? `Biến thể ${esc(piece.type)}…` : 'Màu / Size…'}" />
                    <div class="w2vp-dd" hidden></div>`;
                const input = wrap.querySelector('.w2vp-input');
                const dd = wrap.querySelector('.w2vp-dd');
                input.value = piece.value || '';
                bindInput(input, dd, piece);
                piecesEl.appendChild(wrap);
            });
        }

        function bindInput(input, dd, piece) {
            const refresh = () => {
                const cache = global.Web2VariantsCache;
                if (!cache?.findByValue) {
                    dd.hidden = true;
                    return;
                }
                const lastTok = String(input.value || '')
                    .split('/')
                    .pop()
                    .trim();
                const items = cache.findByValue(lastTok, 10);
                if (!items.length) {
                    dd.innerHTML = `<div class="w2vp-empty">${lastTok ? `Dùng “<b>${esc(lastTok)}</b>” (biến thể tự do) hoặc ` : ''}<a href="../web2/variants/index.html" target="_blank">thêm Kho Biến Thể →</a></div>`;
                    dd.hidden = false;
                    return;
                }
                dd.innerHTML = items
                    .map(
                        (v) =>
                            `<button type="button" class="w2vp-item" data-val="${esc(v.value)}"><span>${esc(v.value)}</span>${v.groupName ? `<span class="w2vp-item-grp">${esc(v.groupName)}</span>` : ''}</button>`
                    )
                    .join('');
                dd.hidden = false;
                dd.querySelectorAll('.w2vp-item').forEach((btn) => {
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    btn.addEventListener('click', () => {
                        // Append vào token CUỐI sau "/" → build "Trắng / M".
                        const segs = input.value.split('/');
                        segs[segs.length - 1] = btn.dataset.val;
                        input.value = segs.map((s) => s.trim()).join(ATTR_SEP);
                        piece.value = input.value;
                        dd.hidden = true;
                        input.focus();
                        fire();
                    });
                });
            };
            input.addEventListener('focus', refresh);
            input.addEventListener('input', () => {
                piece.value = input.value;
                refresh();
                fire();
            });
            input.addEventListener('blur', () => setTimeout(() => (dd.hidden = true), 160));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    dd.hidden = true;
                }
            });
        }

        function renderAll() {
            renderTypes();
            renderPieces();
            renderPreview();
        }

        function setValue({ category = '', value = '' } = {}) {
            const cats = (category || '').trim() ? splitPieces(category) : [];
            const vals = (value || '').trim() ? splitPieces(value) : [];
            const n = Math.max(cats.length, vals.length, 1);
            pieces = [];
            for (let i = 0; i < n; i++) {
                pieces.push({ type: (cats[i] || '').trim(), value: (vals[i] || '').trim() });
            }
            renderAll();
        }

        // Init
        setValue({ category: opts.category || '', value: opts.value || '' });
        // Cache loại có thể init muộn → re-render chips khi cache đổi.
        let _unsub = null;
        if (global.Web2ProductTypesCache) {
            global.Web2ProductTypesCache.init?.()
                .then(() => renderTypes())
                .catch(() => {});
            _unsub = global.Web2ProductTypesCache.subscribe?.(() => renderTypes());
        }
        if (global.Web2VariantsCache) global.Web2VariantsCache.init?.().catch(() => {});

        return {
            el: root,
            getVariant: combinedVariant,
            getCategory: combinedCategory,
            getCombos: combos,
            getName: genName,
            getVariantQtys: variantQtys,
            getTotalQty: totalQty,
            setValue,
            focus: () => root.querySelector('.w2vp-input')?.focus(),
            destroy: () => {
                try {
                    _unsub?.();
                } catch {}
                root.remove();
            },
        };
    }

    global.Web2VariantPicker = { mount, PIECE_SEP, ATTR_SEP, splitPieces };
})(typeof window !== 'undefined' ? window : globalThis);
