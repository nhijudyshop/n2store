// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Web2SupplierPay — MODAL THANH TOÁN NCC dùng chung (2026-06-28).
//
// 1 nguồn cho mọi nơi thanh toán NCC (so-order theo đợt, supplier-debt theo NCC).
// supplier-wallet ĐÃ BỎ thanh toán → chỉ 2 consumer. Bút toán cuối cùng vẫn do
// caller POST ledger (`/api/web2-supplier-wallet/tx`) trong onSubmit — component
// chỉ lo UI (NCC picker tab-strip + tìm kiếm + mũi tên, summary card, số tiền/ngày/
// ghi chú, slot mở rộng tuỳ trang, lịch sử) + validate + loading/rollback.
//
// API:
//   Web2SupplierPay.open(config) — mở modal (xem JSDoc dưới).
//   Web2SupplierPay.setSummary(cards) — cập nhật summary khi modal mở (vd CP đổi).
//   Web2SupplierPay.getSelectedSupplier() — NCC đang chọn.
//   Web2SupplierPay.close() — đóng.
//
// Money op (CLAUDE.md rule 8 NGOẠI LỆ): GIỮ await + loading + rollback toast.

(function () {
    'use strict';

    const W = (window.Web2SupplierPay = window.Web2SupplierPay || {});
    if (W.__inited) return;
    W.__inited = true;

    const STYLE_ID = 'web2-supplier-pay-styles';
    const STYLE = `
.w2pay-modal{position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;padding:18px}
.w2pay-modal[hidden]{display:none}
.w2pay-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45)}
.w2pay-panel{position:relative;background:#fff;border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.22);width:min(680px,94vw);max-height:92vh;display:flex;flex-direction:column;animation:w2payPop .18s ease-out;font:14px/1.45 Inter,system-ui,sans-serif}
@keyframes w2payPop{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:none}}
.w2pay-head{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eef2f7}
.w2pay-head h2{margin:0;font:700 17px/1.2 Inter,system-ui,sans-serif;color:#0058da;flex:1}
.w2pay-close{appearance:none;border:none;background:transparent;color:#94a3b8;cursor:pointer;width:34px;height:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center}
.w2pay-close:hover{background:#f1f5f9;color:#475569}
.w2pay-close i{width:18px;height:18px}
.w2pay-body{padding:16px 20px;overflow-y:auto}
.w2pay-summary{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.w2pay-sum{flex:1 1 auto;min-width:120px;display:flex;flex-direction:column;gap:3px;padding:9px 12px;background:#f8fafc;border:1px solid #e3e8ee;border-radius:10px}
.w2pay-sum>span{font:700 11px/1 Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8}
.w2pay-sum>strong{font:800 16px/1.1 Manrope,Inter,system-ui,sans-serif;color:#0f172a;font-variant-numeric:tabular-nums}
.w2pay-sum.is-danger{background:linear-gradient(135deg,#fff1f1,#fff7ed);border-color:#fca5a5}
.w2pay-sum.is-danger>strong{color:#dc2626}
.w2pay-field{display:block;margin-bottom:12px}
.w2pay-field>span{display:block;font-weight:600;color:#334155;margin-bottom:5px;font-size:13px}
.w2pay-input{width:100%;height:42px;border:1px solid #d1d9e3;border-radius:9px;padding:0 12px;font:600 14px Inter,system-ui,sans-serif;color:#0f172a;outline:none;box-sizing:border-box}
.w2pay-input:focus{border-color:#0068ff;box-shadow:0 0 0 3px rgba(0,104,255,.15)}
.w2pay-input-num{text-align:right;font-variant-numeric:tabular-nums}
/* NCC picker */
.w2pay-ncc-fixed{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:9px;font-weight:700;color:#3730a3}
.w2pay-ncc-fixed i{width:15px;height:15px}
.w2pay-ncc-search{position:relative;margin-bottom:7px}
.w2pay-ncc-search i{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:#94a3b8;pointer-events:none}
.w2pay-ncc-search input{width:100%;height:38px;border:1px solid #d1d9e3;border-radius:9px;padding:0 12px 0 34px;font:500 13px Inter,system-ui,sans-serif;outline:none;box-sizing:border-box}
.w2pay-ncc-search input:focus{border-color:#0068ff;box-shadow:0 0 0 3px rgba(0,104,255,.15)}
.w2pay-ncc-strip-wrap{display:flex;align-items:center;gap:6px}
.w2pay-ncc-arrow{appearance:none;flex:0 0 auto;width:30px;height:38px;border:1px solid #dbe2ea;background:#f8fafc;color:#475569;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.w2pay-ncc-arrow:hover{background:#eef2f7;border-color:#c7d0db}
.w2pay-ncc-arrow:disabled{opacity:.35;cursor:default}
.w2pay-ncc-arrow i{width:16px;height:16px}
.w2pay-ncc-strip{display:flex;gap:6px;overflow-x:auto;scroll-behavior:smooth;flex:1;padding:3px 1px;scrollbar-width:thin}
.w2pay-ncc-strip::-webkit-scrollbar{height:6px}
.w2pay-ncc-strip::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
.w2pay-ncc-pill{appearance:none;flex:0 0 auto;white-space:nowrap;border:1px solid #dbe2ea;background:#f8fafc;color:#475569;padding:7px 14px;border-radius:999px;cursor:pointer;font:600 13px/1.2 Inter,system-ui,sans-serif;transition:background .12s,color .12s,border-color .12s}
.w2pay-ncc-pill:hover{background:#eef2f7;border-color:#c7d0db}
.w2pay-ncc-pill.is-active{background:linear-gradient(135deg,#0058da,#0068ff);border-color:transparent;color:#fff;box-shadow:0 2px 8px rgba(0,104,255,.25)}
.w2pay-ncc-empty{font-size:12.5px;color:#94a3b8;padding:6px 2px}
.w2pay-extra:empty{display:none}
/* history */
.w2pay-hist-wrap{margin-top:14px;border-top:1px solid #eef2f7;padding-top:10px}
.w2pay-hist-head{font-size:12px;font-weight:700;color:#64748b;margin-bottom:8px}
.w2pay-hist{display:flex;flex-direction:column;gap:4px;max-height:170px;overflow-y:auto}
.w2pay-hist-empty{font-size:12.5px;color:#94a3b8;padding:6px 0}
.w2pay-hist-row{display:grid;grid-template-columns:78px 1fr auto 90px;align-items:center;gap:8px;padding:6px 8px;background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;font-size:12.5px}
.w2pay-hist-date{color:#64748b;font-variant-numeric:tabular-nums}
.w2pay-hist-ncc{font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.w2pay-hist-amt{font-weight:700;color:#16a34a;text-align:right;font-variant-numeric:tabular-nums}
.w2pay-hist-move{font-size:11px;color:#94a3b8;text-align:right;font-variant-numeric:tabular-nums}
.w2pay-foot{display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid #eef2f7}
.w2pay-foot .w2pay-spacer{flex:1}
.w2pay-btn{appearance:none;border-radius:9px;padding:9px 18px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:7px;border:1px solid transparent}
.w2pay-btn-cancel{background:#fff;border-color:#d1d9e3;color:#475569}
.w2pay-btn-cancel:hover{background:#f8fafc}
.w2pay-btn-save{background:linear-gradient(135deg,#0058da,#0068ff);color:#fff}
.w2pay-btn-save:hover{filter:brightness(1.06)}
.w2pay-btn-save:disabled{opacity:.65;cursor:default}
.w2pay-btn i{width:15px;height:15px}
.w2pay-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;display:inline-block;animation:w2paySpin .7s linear infinite}
@keyframes w2paySpin{to{transform:rotate(360deg)}}
`;

    function _injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    function _esc(s) {
        if (window.Web2Escape?.escapeHtml) return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function _fmtVnd(n) {
        if (window.Web2Format?.vnd) return window.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function _todayVN() {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
                new Date()
            );
        } catch {
            return new Date().toISOString().slice(0, 10);
        }
    }
    function _notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    function _icons(root) {
        if (window.lucide?.createIcons)
            window.lucide.createIcons({ nameAttr: 'data-lucide', root });
    }

    let _root = null; // modal element (created once)
    let _cfg = null; // current open config
    let _selected = null; // selected NCC key

    function _ensureRoot() {
        if (_root) return _root;
        _injectStyle();
        const el = document.createElement('div');
        el.className = 'w2pay-modal';
        el.hidden = true;
        el.innerHTML = `
            <div class="w2pay-backdrop" data-w2pay-close></div>
            <div class="w2pay-panel" role="dialog" aria-modal="true">
                <div class="w2pay-head">
                    <h2 data-w2pay-title>Thanh toán NCC</h2>
                    <button class="w2pay-close" type="button" data-w2pay-close aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="w2pay-body">
                    <div class="w2pay-summary" data-w2pay-summary></div>
                    <div class="w2pay-field" data-w2pay-ncc-field>
                        <span data-w2pay-ncc-label>Nhà cung cấp</span>
                        <div data-w2pay-ncc></div>
                    </div>
                    <label class="w2pay-field"><span>Ngày thanh toán</span>
                        <input type="date" class="w2pay-input" data-w2pay-date /></label>
                    <label class="w2pay-field"><span data-w2pay-amount-label>Số tiền (VNĐ)</span>
                        <input type="text" inputmode="decimal" data-w2num="decimal" class="w2pay-input w2pay-input-num" data-w2pay-amount value="0" /></label>
                    <label class="w2pay-field"><span>Ghi chú</span>
                        <input type="text" class="w2pay-input" data-w2pay-note placeholder="Vd: CK Vietcombank…" /></label>
                    <div class="w2pay-extra" data-w2pay-extra></div>
                    <div class="w2pay-hist-wrap" data-w2pay-hist-wrap hidden>
                        <div class="w2pay-hist-head" data-w2pay-hist-head>Lịch sử thanh toán</div>
                        <div class="w2pay-hist" data-w2pay-hist></div>
                    </div>
                </div>
                <div class="w2pay-foot">
                    <span class="w2pay-spacer"></span>
                    <button class="w2pay-btn w2pay-btn-cancel" type="button" data-w2pay-close>Hủy</button>
                    <button class="w2pay-btn w2pay-btn-save" type="button" data-w2pay-save><i data-lucide="banknote"></i> Lưu thanh toán</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        // Close handlers (delegated, bound once)
        el.querySelectorAll('[data-w2pay-close]').forEach((b) =>
            b.addEventListener('click', () => W.close())
        );
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') W.close();
        });
        el.querySelector('[data-w2pay-save]').addEventListener('click', _submit);
        _root = el;
        return el;
    }

    function _q(sel) {
        return _root.querySelector(sel);
    }

    function _renderSummary(cards) {
        const host = _q('[data-w2pay-summary]');
        host.innerHTML = (cards || [])
            .map(
                (c) =>
                    `<div class="w2pay-sum${c.tone === 'danger' ? ' is-danger' : ''}"><span>${_esc(c.label)}</span><strong>${_esc(c.value)}</strong></div>`
            )
            .join('');
    }

    function _renderNcc(ncc) {
        const field = _q('[data-w2pay-ncc-field]');
        const host = _q('[data-w2pay-ncc]');
        const lbl = _q('[data-w2pay-ncc-label]');
        if (!ncc || ncc.mode === 'hidden') {
            field.hidden = true;
            host.innerHTML = '';
            _selected = ncc?.value || null;
            return;
        }
        field.hidden = false;
        lbl.textContent = ncc.label || 'Nhà cung cấp (trừ nợ NCC này)';
        if (ncc.mode === 'fixed') {
            _selected = ncc.value || ncc.display || null;
            host.innerHTML = `<span class="w2pay-ncc-fixed"><i data-lucide="store"></i> ${_esc(ncc.display || ncc.value || '—')}</span>`;
            return;
        }
        // picker — tab strip, alphabetical, search + arrows
        const list = (ncc.suppliers || [])
            .slice()
            .sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        _selected = ncc.selected && list.includes(ncc.selected) ? ncc.selected : list[0] || null;
        host.innerHTML = `
            <div class="w2pay-ncc-search"><i data-lucide="search"></i>
                <input type="text" data-w2pay-ncc-q placeholder="Tìm NCC…" autocomplete="off" /></div>
            <div class="w2pay-ncc-strip-wrap">
                <button type="button" class="w2pay-ncc-arrow" data-w2pay-ncc-arrow="-1" title="Cuộn trái"><i data-lucide="chevron-left"></i></button>
                <div class="w2pay-ncc-strip" data-w2pay-ncc-strip>
                    ${list.length ? list.map((s) => `<button type="button" class="w2pay-ncc-pill${s === _selected ? ' is-active' : ''}" data-ncc="${_esc(s)}">${_esc(s)}</button>`).join('') : '<span class="w2pay-ncc-empty">Không có NCC.</span>'}
                </div>
                <button type="button" class="w2pay-ncc-arrow" data-w2pay-ncc-arrow="1" title="Cuộn phải"><i data-lucide="chevron-right"></i></button>
            </div>`;
        const strip = host.querySelector('[data-w2pay-ncc-strip]');
        host.querySelectorAll('.w2pay-ncc-pill').forEach((p) =>
            p.addEventListener('click', () => {
                _selected = p.dataset.ncc;
                host.querySelectorAll('.w2pay-ncc-pill').forEach((x) =>
                    x.classList.toggle('is-active', x === p)
                );
                if (typeof _cfg?.onNccChange === 'function') _cfg.onNccChange(_selected);
            })
        );
        host.querySelectorAll('[data-w2pay-ncc-arrow]').forEach((a) =>
            a.addEventListener('click', () =>
                strip.scrollBy({ left: Number(a.dataset.w2payNccArrow) * 200, behavior: 'smooth' })
            )
        );
        const norm = (s) =>
            String(s || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .toLowerCase();
        const qEl = host.querySelector('[data-w2pay-ncc-q]');
        qEl?.addEventListener('input', () => {
            const q = norm(qEl.value);
            host.querySelectorAll('.w2pay-ncc-pill').forEach((p) => {
                p.style.display = !q || norm(p.dataset.ncc).includes(q) ? '' : 'none';
            });
        });
        // scroll selected into view
        setTimeout(() => {
            const act = strip.querySelector('.is-active');
            if (act) act.scrollIntoView({ inline: 'center', block: 'nearest' });
        }, 0);
    }

    function _renderHistory(history) {
        const wrap = _q('[data-w2pay-hist-wrap]');
        const host = _q('[data-w2pay-hist]');
        if (!history) {
            wrap.hidden = true;
            host.innerHTML = '';
            return;
        }
        wrap.hidden = false;
        if (!history.length) {
            host.innerHTML = '<div class="w2pay-hist-empty">Chưa có thanh toán nào.</div>';
            return;
        }
        host.innerHTML = history
            .map((p) => {
                const d = p.ts
                    ? new Intl.DateTimeFormat('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                      }).format(new Date(p.ts))
                    : '';
                return `<div class="w2pay-hist-row"><span class="w2pay-hist-date">${_esc(d)}</span><span class="w2pay-hist-ncc" title="${_esc(p.supplier || '')}">${_esc(p.supplier || '')}</span><span class="w2pay-hist-amt">${_esc(_fmtVnd(p.amountVnd))}</span><span class="w2pay-hist-move">${_esc(p.moveName || '')}</span></div>`;
            })
            .join('');
    }

    async function _submit() {
        const saveBtn = _q('[data-w2pay-save]');
        if (saveBtn.disabled) return;
        const amtEl = _q('[data-w2pay-amount]');
        const amountVnd =
            (window.Web2NumberInput
                ? window.Web2NumberInput.getValue(amtEl)
                : Number(amtEl.value)) || 0;
        const supplier = _selected;
        if (_cfg.ncc && _cfg.ncc.mode === 'picker' && !supplier) {
            _notify('Chọn NCC để thanh toán', 'warning');
            return;
        }
        if (!amountVnd || amountVnd <= 0) {
            _notify('Nhập số tiền hợp lệ', 'warning');
            return;
        }
        const date = _q('[data-w2pay-date]').value;
        const note = _q('[data-w2pay-note]').value;
        const orig = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="w2pay-spin"></span> Đang lưu…';
        try {
            await _cfg.onSubmit({ supplier, amountVnd, date, note, txId: _cfg._txId });
            W.close();
        } catch (e) {
            _notify('Lỗi thanh toán: ' + (e?.message || e), 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = orig;
            _icons(_root);
        }
    }

    /**
     * @param {Object} cfg
     * @param {string} cfg.title
     * @param {Array<{label,value,tone?}>} cfg.summary
     * @param {Object} cfg.ncc - { mode:'picker'|'fixed'|'hidden', suppliers?, selected?, value?, display?, label? }
     * @param {number} [cfg.amountVnd]
     * @param {string} [cfg.amountLabel]
     * @param {string} [cfg.note]
     * @param {string} [cfg.notePlaceholder]
     * @param {string} [cfg.extraHtml] - HTML chèn vào slot mở rộng (vd Chi phí đợt)
     * @param {(root:HTMLElement)=>void} [cfg.onMount] - chạy sau khi show (wire slot)
     * @param {Array} [cfg.history] - [{ts, supplier, amountVnd, moveName}] | null
     * @param {string} [cfg.historyHead]
     * @param {(ctx:{supplier,amountVnd,date,note,txId})=>Promise} cfg.onSubmit
     */
    W.open = function open(cfg) {
        _ensureRoot();
        _cfg = cfg || {};
        _cfg._txId =
            'pay-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        _q('[data-w2pay-title]').textContent = _cfg.title || 'Thanh toán NCC';
        _renderSummary(_cfg.summary);
        _renderNcc(_cfg.ncc);
        _q('[data-w2pay-date]').value = _cfg.date || _todayVN();
        _q('[data-w2pay-amount-label]').textContent = _cfg.amountLabel || 'Số tiền (VNĐ)';
        const amtEl = _q('[data-w2pay-amount]');
        const amt = Math.max(0, Math.round(Number(_cfg.amountVnd) || 0));
        if (window.Web2NumberInput) window.Web2NumberInput.setValue(amtEl, amt);
        else amtEl.value = amt;
        const noteEl = _q('[data-w2pay-note]');
        noteEl.value = _cfg.note || '';
        noteEl.placeholder = _cfg.notePlaceholder || 'Vd: CK Vietcombank…';
        const extra = _q('[data-w2pay-extra]');
        extra.innerHTML = _cfg.extraHtml || '';
        _q('[data-w2pay-hist-head]').textContent = _cfg.historyHead || 'Lịch sử thanh toán';
        _renderHistory(_cfg.history || null);
        _root.hidden = false;
        if (window.Web2NumberInput) window.Web2NumberInput.attachAll(_root);
        if (typeof _cfg.onMount === 'function') _cfg.onMount(_root);
        _icons(_root);
        setTimeout(() => amtEl.focus(), 30);
    };

    W.setSummary = function setSummary(cards) {
        if (_root && !_root.hidden) _renderSummary(cards);
    };
    // Cập nhật số tiền (vd đổi NCC ở chế độ supplier → remaining của NCC mới).
    W.setAmount = function setAmount(vnd) {
        if (!_root || _root.hidden) return;
        const el = _q('[data-w2pay-amount]');
        const v = Math.max(0, Math.round(Number(vnd) || 0));
        if (window.Web2NumberInput) window.Web2NumberInput.setValue(el, v);
        else el.value = v;
    };
    W.setHistory = function setHistory(history) {
        if (_root && !_root.hidden) _renderHistory(history || null);
    };
    W.getSelectedSupplier = function getSelectedSupplier() {
        return _selected;
    };
    W.isOpen = function isOpen() {
        return !!_root && !_root.hidden;
    };
    W.close = function close() {
        if (_root) _root.hidden = true;
        if (typeof _cfg?.onClose === 'function') _cfg.onClose();
    };
})();
