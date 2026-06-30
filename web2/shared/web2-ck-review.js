// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).
// =====================================================
// Web 2.0 — CK Review (component dùng chung: balance-history, native-orders, web2-pancake)
// =====================================================
//
// 1 NGUỒN: mọi trang chỉ gọi 1 dòng để mở; logic/dữ liệu/SSE tập trung ở đây +
// 2 endpoint backend (/api/web2/payment-signals, /api/web2/balance-history).
//
//   Web2CkReview.openSignalList({ onDone })           — danh sách tín hiệu CK chờ duyệt (10 + tải thêm)
//   Web2CkReview.openReview({ signal|signalId, phone, name, onDone }) — đối chiếu 1 tín hiệu ↔ GD SePay → Duyệt
//
// Duyệt LINH HOẠT: chọn GD SePay → link GD (gán SĐT/tên + CỘNG VÍ tiền thật) +
// confirm signal; KHÔNG chọn GD → chỉ confirm + lưu SĐT/tên (chờ tiền về).
// ⚠ Money op: nút Duyệt giữ await + disable (KHÔNG optimistic).

(function (global) {
    'use strict';
    if (global.Web2CkReview) return; // idempotent

    const PROXY =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const SIG_API = PROXY + '/api/web2/payment-signals';
    const BH_API = PROXY + '/api/web2/balance-history';
    const PAGE = 10;

    // ─── Helpers ──────────────────────────────────────────────────────
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function fmtMoney(n) {
        if (global.Web2Format) return global.Web2Format.num(n);
        return Number(n || 0).toLocaleString('vi-VN');
    }
    function fmtTime(ts) {
        if (global.Web2Format) return global.Web2Format.dateTime(ts);
        if (!ts) return '';
        const n = typeof ts === 'number' ? ts : Date.parse(ts);
        return Number.isNaN(n) ? '' : new Date(n).toLocaleString('vi-VN');
    }
    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (global.Web2PhoneUtils) return global.Web2PhoneUtils.norm(p);
        let s = String(p || '').replace(/\D/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }
    function toast(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[ck-review]', msg);
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho mutation payment-signals
    // (approve/dismiss — soft-gate → WEB2_AUTH_ENFORCE=1). Fallback đọc thẳng
    // localStorage nếu page nhúng component này không load web2-auth.js.
    function authHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    // Lịch sử thao tác (audit: ai detect/duyệt/cộng ví/gửi tin — lúc nào).
    const ACTION_VI = {
        detect: 'Hệ thống nhận',
        confirm: 'Xác nhận',
        approve: 'Duyệt',
        dismiss: 'Bỏ qua',
        link: 'Gán đơn',
        notify: 'Gửi tin báo KH',
        'auto-link': 'Tự đối soát (watcher)',
    };
    function historyHtml(history) {
        const h = Array.isArray(history) ? history : [];
        if (!h.length) return '';
        if (global.Web2HistoryTimeline?.render) {
            return `<details class="w2ck-history"><summary>Lịch sử (${h.length})</summary>${global.Web2HistoryTimeline.render(h, { title: false })}</details>`;
        }
        const rows = h
            .map(
                (e) =>
                    `<div class="w2ck-hist-row"><b>${esc(ACTION_VI[e.action] || e.action)}</b> · ${esc(e.userName || '(ẩn danh)')} · ${esc(fmtTime(e.ts))}${e.note ? ' · ' + esc(e.note) : ''}</div>`
            )
            .join('');
        return `<details class="w2ck-history"><summary>Lịch sử (${h.length})</summary>${rows}</details>`;
    }
    function userBody(extra) {
        const body = { ...(extra || {}) };
        if (global.Web2UserInfo?.attachToBody)
            return global.Web2UserInfo.attachToBody(body, 'web2-ck-review');
        const u = global.Web2UserInfo?.get?.();
        if (u) {
            body.userId = u.userId || null;
            body.userName = u.userName || null;
        }
        return body;
    }

    // ─── Score GD SePay khả năng khớp tín hiệu (port smart-match) ──────
    function scoreTx(sig, tx) {
        let score = 0;
        const reasons = [];
        const expected = sig.order?.total || null;
        const amount = Number(tx.transfer_amount) || 0;
        if (expected) {
            if (amount === expected) {
                score += 50;
                reasons.push('khớp tiền');
            } else if (expected > 0 && Math.abs(amount - expected) / expected <= 0.05) {
                score += 30;
                reasons.push('±5% tiền');
            }
        }
        const desc = String(tx.content || tx.description || '');
        const digits = desc.replace(/\D/g, '');
        const phone = normPhone(sig.phone);
        if (phone && phone.length >= 9 && digits.includes(phone.slice(-9))) {
            score += 40;
            reasons.push('SĐT trong ND');
        }
        const name = String(sig.customerName || '')
            .toLowerCase()
            .trim();
        if (name.length > 3 && desc.toLowerCase().includes(name)) {
            score += 20;
            reasons.push('tên');
        }
        const txT = tx.transaction_date ? Date.parse(tx.transaction_date) : 0;
        const sigT = sig.createdAt || 0;
        if (txT && sigT) {
            const diffH = Math.abs(txT - sigT) / 3600000;
            if (diffH <= 24) {
                score += 30;
                reasons.push('≤24h');
            } else if (diffH <= 72) {
                score += 10;
                reasons.push('≤72h');
            }
        }
        return { score, reasons };
    }

    // ─── Overlay infra ────────────────────────────────────────────────
    function makeOverlay(title) {
        const ov = document.createElement('div');
        ov.className = 'w2ck-overlay';
        ov.innerHTML = `
            <div class="w2ck-modal">
                <div class="w2ck-head">
                    <span class="w2ck-title">${esc(title)}</span>
                    <button class="w2ck-x" aria-label="Đóng">×</button>
                </div>
                <div class="w2ck-body"></div>
            </div>`;
        document.body.appendChild(ov);
        const close = () => closeOverlay(ov);
        ov.querySelector('.w2ck-x').onclick = close;
        ov.addEventListener('mousedown', (e) => {
            if (e.target === ov) close();
        });
        ov._subs = [];
        ov.body = ov.querySelector('.w2ck-body');
        return ov;
    }
    function closeOverlay(ov) {
        (ov._subs || []).forEach((u) => {
            try {
                u();
            } catch (e) {
                /* ignore */
            }
        });
        ov.remove();
    }
    function subscribeRefresh(ov, topics, cb) {
        if (!global.Web2SSE?.subscribe) return;
        let t = null;
        const deb = () => {
            clearTimeout(t);
            t = setTimeout(cb, 500);
        };
        topics.forEach((topic) => {
            const unsub = global.Web2SSE.subscribe(topic, deb);
            if (typeof unsub === 'function') ov._subs.push(unsub);
        });
    }

    // ─── Pager (dùng cho cả signal list + tx list) ────────────────────
    function makePager(url, listEl, moreWrap, renderRows) {
        const st = { offset: 0, items: [], total: 0, hasMore: true, loading: false };
        async function load(reset) {
            if (st.loading) return;
            st.loading = true;
            if (reset) {
                st.offset = 0;
                st.items = [];
                listEl.innerHTML = '<div class="w2ck-empty">Đang tải…</div>';
            }
            try {
                const r = await fetch(`${url}&limit=${PAGE}&offset=${st.offset}`, {
                    credentials: 'include',
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'Lỗi tải');
                const got = d.data || d.customers || [];
                st.items.push(...got);
                st.total = d.meta?.total ?? d.total ?? st.items.length;
                st.hasMore = d.meta?.hasMore ?? st.offset + got.length < st.total;
                st.offset += got.length;
                renderRows(st);
                moreWrap.innerHTML = st.hasMore
                    ? `<button class="w2ck-more">Tải thêm ${PAGE}</button>`
                    : `<span class="w2ck-end">Đã hết (${st.total})</span>`;
                const mb = moreWrap.querySelector('.w2ck-more');
                if (mb) mb.onclick = () => load(false);
            } catch (e) {
                listEl.innerHTML = `<div class="w2ck-empty">${esc(e.message)}</div>`;
            }
            st.loading = false;
        }
        return { st, load };
    }

    // ─── openSignalList — danh sách tín hiệu CK chờ duyệt ─────────────
    function openSignalList(opts = {}) {
        const ov = makeOverlay('Xét duyệt tín hiệu CK');
        ov.body.innerHTML = `
            <p class="w2ck-sub">Khách báo "CK XONG" / "ĐÃ CK" chờ đối chiếu với giao dịch SePay.</p>
            <div class="w2ck-list"></div>
            <div class="w2ck-more-wrap"></div>`;
        const listEl = ov.body.querySelector('.w2ck-list');
        const moreWrap = ov.body.querySelector('.w2ck-more-wrap');

        const pager = makePager(`${SIG_API}?status=pending`, listEl, moreWrap, (st) => {
            if (!st.items.length) {
                listEl.innerHTML = '<div class="w2ck-empty">Không có tín hiệu chờ duyệt.</div>';
                return;
            }
            listEl.innerHTML = st.items.map(sigRowHtml).join('');
            listEl.querySelectorAll('[data-review]').forEach((b) => {
                b.onclick = () => {
                    const sig = st.items.find((s) => s.id === Number(b.dataset.review));
                    openReview({
                        signal: sig,
                        onDone: () => {
                            pager.load(true);
                            opts.onDone && opts.onDone();
                        },
                    });
                };
            });
            if (global.Web2WalletBalance?.attachBalances)
                global.Web2WalletBalance.attachBalances(listEl);
        });
        pager.load(true);
        subscribeRefresh(ov, ['web2:payment-signals'], () => pager.load(true));
        return ov;
    }

    function sigRowHtml(sig) {
        const pill = sig.phone ? ` <span data-w2wallet-phone="${esc(sig.phone)}"></span>` : '';
        const orderTxt = sig.orderCode
            ? `<div class="w2ck-order">Đơn ${esc(sig.orderCode)}${sig.order ? ' · ' + fmtMoney(sig.order.total) + 'đ' : ''}</div>`
            : '<div class="w2ck-noorder">Chưa khớp đơn</div>';
        return `
        <div class="w2ck-row">
            <div>
                <div class="w2ck-cust">${esc(sig.customerName || sig.psid || 'KH')}
                    <span class="w2ck-kw">${esc(sig.keyword || '')}</span>${pill}</div>
                <div class="w2ck-msg">"${esc(sig.rawMessage || '')}"</div>
                <div class="w2ck-meta">${esc(fmtTime(sig.createdAt))}${sig.phone ? ' · ' + esc(sig.phone) : ''}</div>
                ${orderTxt}
            </div>
            <button class="w2ck-btn w2ck-btn-primary" data-review="${sig.id}">Đối chiếu / Duyệt</button>
        </div>`;
    }

    // ─── openReview — đối chiếu 1 tín hiệu ↔ GD SePay → Duyệt ─────────
    async function openReview({ signal, signalId, phone, name, onDone }) {
        let sig = signal;
        if (!sig && signalId) {
            try {
                const r = await fetch(`${SIG_API}/${signalId}`, { credentials: 'include' });
                const d = await r.json();
                if (d.success) sig = d.data;
            } catch (e) {
                /* ignore */
            }
        }
        if (!sig) {
            toast('Không tìm thấy tín hiệu CK', 'error');
            return;
        }

        const ov = makeOverlay('Đối chiếu & Duyệt CK');
        const initPhone = normPhone(phone || sig.phone || '');
        const initName = name || sig.customerName || '';
        ov.body.innerHTML = `
            <div class="w2ck-subject">
                <div class="w2ck-cust">${esc(sig.customerName || sig.psid || 'KH')}
                    <span class="w2ck-kw">${esc(sig.keyword || '')}</span></div>
                <div class="w2ck-msg">"${esc(sig.rawMessage || '')}"</div>
                <div class="w2ck-meta">${esc(fmtTime(sig.createdAt))}${
                    sig.orderCode
                        ? ` · Đơn ${esc(sig.orderCode)}${sig.order ? ' (' + fmtMoney(sig.order.total) + 'đ)' : ''}`
                        : ''
                }</div>
                ${historyHtml(sig.history)}
            </div>
            <div class="w2ck-fields">
                <label>SĐT <input class="w2ck-phone" value="${esc(initPhone)}" placeholder="0901234567" /></label>
                <label>Tên <input class="w2ck-name" value="${esc(initName)}" placeholder="Tên khách" /></label>
            </div>
            <div class="w2ck-txhead">Giao dịch SePay chưa gán — chọn 1 GD khớp (hoặc bỏ trống = chờ tiền về):</div>
            <div class="w2ck-txlist"></div>
            <div class="w2ck-tx-more"></div>
            <div class="w2ck-foot">
                <label class="w2ck-notify"><input type="checkbox" class="w2ck-notify-cb" checked /> Gửi tin báo cho khách (khi cộng ví)</label>
                <span style="flex:1"></span>
                <button class="w2ck-btn w2ck-btn-ghost w2ck-dismiss">Bỏ qua (sai)</button>
                <button class="w2ck-btn w2ck-btn-approve">Duyệt</button>
            </div>`;

        const txListEl = ov.body.querySelector('.w2ck-txlist');
        const moreWrap = ov.body.querySelector('.w2ck-tx-more');
        let selectedTxId = null;

        const pager = makePager(`${BH_API}?status=NO_PHONE`, txListEl, moreWrap, (st) => {
            if (!st.items.length) {
                txListEl.innerHTML = '<div class="w2ck-empty">Không có GD chưa gán.</div>';
                return;
            }
            const scored = st.items.map((tx) => ({ tx, ...scoreTx(sig, tx) }));
            scored.sort((a, b) => b.score - a.score);
            txListEl.innerHTML = scored.map(txRowHtml).join('');
            txListEl.querySelectorAll('input[name="w2cktx"]').forEach((radio) => {
                radio.onchange = () => {
                    selectedTxId = radio.checked ? Number(radio.value) : null;
                };
            });
        });
        pager.load(true);
        subscribeRefresh(ov, ['web2:balance-history'], () => pager.load(true));

        // Duyệt (money op → await + disable)
        const approveBtn = ov.body.querySelector('.w2ck-btn-approve');
        approveBtn.onclick = async () => {
            const ph = normPhone(ov.body.querySelector('.w2ck-phone').value);
            const nm = ov.body.querySelector('.w2ck-name').value.trim();
            if (!ph) {
                toast('Cần SĐT để duyệt', 'error');
                return;
            }
            approveBtn.disabled = true;
            approveBtn.textContent = 'Đang duyệt…';
            try {
                const notifyCustomer = !!ov.body.querySelector('.w2ck-notify-cb')?.checked;
                const body = userBody({
                    phone: ph,
                    name: nm,
                    txId: selectedTxId || undefined,
                    notifyCustomer,
                });
                const r = await fetch(`${SIG_API}/${sig.id}/approve`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }), // ENFORCE-PREP (2026-06-12)
                    credentials: 'include',
                    body: JSON.stringify(body),
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'Lỗi duyệt');
                toast(
                    d.credited ? 'Đã duyệt + cộng ví ✅' : 'Đã duyệt (chờ tiền về) ✅',
                    'success'
                );
                closeOverlay(ov);
                onDone && onDone();
            } catch (e) {
                toast('Lỗi: ' + e.message, 'error');
                approveBtn.disabled = false;
                approveBtn.textContent = 'Duyệt';
            }
        };

        // Bỏ qua (sai / false-positive) — check response, lỗi thì giữ modal (giống approveBtn)
        const dismissBtn = ov.body.querySelector('.w2ck-dismiss');
        dismissBtn.onclick = async () => {
            dismissBtn.disabled = true;
            dismissBtn.textContent = 'Đang bỏ qua…';
            try {
                const r = await fetch(`${SIG_API}/${sig.id}/dismiss`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }), // ENFORCE-PREP (2026-06-12)
                    credentials: 'include',
                    body: JSON.stringify(userBody()),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok || !d.success) throw new Error(d.error || `HTTP ${r.status}`);
                toast('Đã bỏ qua', 'info');
                closeOverlay(ov);
                onDone && onDone();
            } catch (e) {
                toast('Lỗi: ' + e.message, 'error');
                dismissBtn.disabled = false;
                dismissBtn.textContent = 'Bỏ qua (sai)';
            }
        };
        return ov;
    }

    function txRowHtml({ tx, score, reasons }) {
        const hi = score >= 50 ? ' w2ck-tx-hi' : score >= 30 ? ' w2ck-tx-mid' : '';
        const badge = score > 0 ? `<span class="w2ck-score">${score}</span>` : '';
        return `
        <label class="w2ck-tx${hi}">
            <input type="radio" name="w2cktx" value="${tx.id}" />
            <div class="w2ck-tx-info">
                <div><b>+${fmtMoney(tx.transfer_amount)}đ</b> ${badge}
                    <span class="w2ck-tx-time">${esc(fmtTime(tx.transaction_date))}</span></div>
                <div class="w2ck-tx-content">${esc(tx.content || tx.description || '')}</div>
                ${reasons.length ? `<div class="w2ck-tx-reasons">${esc(reasons.join(' · '))}</div>` : ''}
            </div>
        </label>`;
    }

    // ─── CSS (self-inject) ────────────────────────────────────────────
    function injectCss() {
        if (document.getElementById('w2ck-style')) return;
        const css = `
        .w2ck-overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
        .w2ck-modal{background:#fff;border-radius:14px;width:min(640px,100%);box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
        .w2ck-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef2f7}
        .w2ck-title{font-weight:700;font-size:15px;color:#1e293b}
        .w2ck-x{border:0;background:transparent;font-size:24px;line-height:1;color:#94a3b8;cursor:pointer}
        .w2ck-x:hover{color:#475569}
        .w2ck-body{padding:14px 18px;overflow:auto}
        .w2ck-sub,.w2ck-txhead{color:#64748b;font-size:12px;margin:0 0 10px}
        .w2ck-txhead{margin-top:6px;font-weight:600;color:#475569}
        .w2ck-list,.w2ck-txlist{display:grid;gap:8px}
        .w2ck-row,.w2ck-subject{background:#f8fafc;border-radius:10px;padding:10px 12px}
        .w2ck-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-left:4px solid #14b8a6}
        .w2ck-subject{border-left:4px solid #2a96ff;margin-bottom:12px}
        .w2ck-cust{font-weight:700;color:#1e293b;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .w2ck-kw{background:#e8f2ff;color:#0058da;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700}
        .w2ck-msg{color:#475569;font-size:13px;margin-top:2px}
        .w2ck-meta{color:#94a3b8;font-size:11px;margin-top:3px}
        .w2ck-order{color:#0058da;font-size:12px;margin-top:3px;font-weight:600}
        .w2ck-noorder{color:#b91c1c;font-size:12px;margin-top:3px}
        .w2ck-fields{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
        .w2ck-fields label{flex:1;min-width:160px;font-size:12px;color:#64748b;display:flex;flex-direction:column;gap:3px}
        .w2ck-fields input{padding:7px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:13px}
        .w2ck-tx{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:9px 11px;cursor:pointer}
        .w2ck-tx:hover{border-color:#a5b4fc}
        .w2ck-tx-hi{border-color:#16a34a;background:#f0fdf4}
        .w2ck-tx-mid{border-color:#f59e0b;background:#fffbeb}
        .w2ck-tx input{margin-top:3px}
        .w2ck-tx-info{flex:1;font-size:13px;color:#334155}
        .w2ck-tx-time{color:#94a3b8;font-size:11px;margin-left:6px}
        .w2ck-tx-content{color:#64748b;font-size:12px;margin-top:2px;word-break:break-word}
        .w2ck-tx-reasons{color:#16a34a;font-size:11px;margin-top:2px}
        .w2ck-score{background:#16a34a;color:#fff;border-radius:9px;padding:0 7px;font-size:11px;font-weight:700}
        .w2ck-more-wrap,.w2ck-tx-more{text-align:center;margin-top:10px}
        .w2ck-more{padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;color:#475569}
        .w2ck-more:hover{background:#f8fafc}
        .w2ck-end{color:#94a3b8;font-size:12px}
        .w2ck-empty{text-align:center;color:#94a3b8;padding:24px;font-size:13px}
        .w2ck-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #eef2f7;position:sticky;bottom:0;background:#fff}
        .w2ck-btn{padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-size:13px;font-weight:600}
        .w2ck-btn-primary{background:linear-gradient(135deg,#0068ff,#0058da);color:#fff}
        .w2ck-btn-approve{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff}
        .w2ck-btn-approve:disabled{opacity:.6;cursor:wait}
        .w2ck-notify{display:flex;align-items:center;gap:5px;font-size:12px;color:#64748b;cursor:pointer}
        .w2ck-notify input{margin:0}
        .w2ck-history{margin-top:6px;font-size:12px}
        .w2ck-history>summary{cursor:pointer;color:#64748b;font-weight:600;list-style:revert}
        .w2ck-history>summary:hover{color:#0058da}
        .w2ck-hist-row{color:#475569;padding:2px 0 2px 10px;border-left:2px solid #e5e7eb;margin:3px 0 0 2px}
        .w2ck-btn-ghost{background:#f1f5f9;color:#64748b}
        .w2ck-btn:hover:not(:disabled){filter:brightness(.95)}`;
        const el = document.createElement('style');
        el.id = 'w2ck-style';
        el.textContent = css;
        document.head.appendChild(el);
    }

    injectCss();
    global.Web2CkReview = { openSignalList, openReview };
})(window);
