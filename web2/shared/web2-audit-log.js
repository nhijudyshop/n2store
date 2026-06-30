// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2AuditLog — MODULE CHÍNH "Lịch sử thao tác" Web 2.0 (1 NGUỒN dùng chung).
//
// Nguồn: GET /api/web2/audit-log/list — union view qua 4 bảng audit
//   (web2_product_history · fast_sale_order_history · pbh_fulfillment_logs · web2_wallet_adjustments).
//
// Phân quyền (server-side, theo x-web2-token):
//   • admin            → xem TẤT CẢ + lọc user tự do.
//   • staff/manager/…  → CHỈ thao tác của chính mình (ô lọc User bị ẩn).
//   • chưa đăng nhập   → rỗng + thông báo cần đăng nhập.
//
// Dùng ở: web2/audit-log/index.html (trang chính) + web2/kpi/index.html (tab Audit log).
// API:
//   Web2AuditLog.mount(target, opts?)  → render filter + bảng vào target, tự load.
//        target: selector string | HTMLElement
//        opts: { showFilters=true, limit=200, autoLoad=true }
//   Web2AuditLog.reload(target?)       → tải lại (target = lần mount gần nhất nếu bỏ trống).
// =====================================================================
(function () {
    'use strict';
    if (window.Web2AuditLog) return;

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        (window.WEB2_CONFIG && window.WEB2_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = WORKER + '/api/web2/audit-log';

    // Nhãn hiển thị cho entity. 4 nguồn bảng riêng + nguồn event-sink (purchase-refund,
    // customer, payment-signal, return, kpi-assignment) + entity generic (slug) hiện raw.
    const ENTITY_LABELS = {
        product: 'Sản phẩm',
        variant: 'Biến thể',
        pbh: 'PBH',
        reconcile: 'Đối soát',
        wallet: 'Ví',
        'purchase-refund': 'Hoàn NCC',
        customer: 'Khách hàng',
        'payment-signal': 'Tín hiệu CK',
        return: 'Trả hàng',
        refund: 'Phiếu trả PBH',
        'kpi-assignment': 'Phân công KPI',
        'native-order': 'Đơn Web',
        'so-order': 'Sổ Order',
        'web2-user': 'Tài khoản',
        'supplier-wallet': 'Ví NCC',
        'delivery-invoice': 'Giao hàng',
        'jt-tracking': 'Vận đơn J&T',
        'fb-post': 'Bài FB',
        'order-tag': 'Thẻ đơn',
        campaign: 'Chiến dịch',
        'balance-transaction': 'Giao dịch CK',
    };
    // Nhãn tiếng Việt cho HÀNH ĐỘNG (action) thường gặp. Slug nào không có ở đây →
    // hiển thị raw (dropdown vẫn lọc đúng giá trị gốc). Best-effort, không bắt buộc đủ.
    const ACTION_LABELS = {
        create: 'Tạo mới',
        created: 'Tạo mới',
        insert: 'Tạo mới',
        update: 'Cập nhật',
        updated: 'Cập nhật',
        edit: 'Sửa',
        delete: 'Xoá',
        deleted: 'Xoá',
        remove: 'Xoá',
        cancel: 'Huỷ',
        cancelled: 'Huỷ',
        restock: 'Hoàn kho',
        confirm: 'Xác nhận',
        confirmed: 'Xác nhận',
        pack: 'Đóng gói',
        packed: 'Đóng gói',
        ship: 'Giao hàng',
        shipped: 'Đã giao đơn vị VC',
        deliver: 'Giao thành công',
        delivered: 'Giao thành công',
        return: 'Trả hàng',
        refund: 'Hoàn tiền',
        credit: 'Cộng ví',
        debit: 'Trừ ví',
        deposit: 'Nạp ví',
        withdraw: 'Rút ví',
        adjust: 'Điều chỉnh',
        adjustment: 'Điều chỉnh',
        reconcile: 'Đối soát',
        assign: 'Phân công',
        unassign: 'Bỏ phân công',
        split: 'Tách đơn',
        merge: 'Gộp đơn',
        reassign: 'Gán lại',
        link: 'Liên kết',
        unlink: 'Bỏ liên kết',
        tag: 'Gắn thẻ',
        untag: 'Bỏ thẻ',
    };
    function actionLabel(a) {
        if (!a) return '';
        return ACTION_LABELS[String(a).toLowerCase()] || a;
    }
    const COLSPAN = 7;

    // ---- helpers ----
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }
    function authHeaders(extra) {
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth')).token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        try {
            return new Date(ts).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        } catch {
            return new Date(ts).toLocaleString('vi-VN');
        }
    }

    // Inject CSS 1 lần — module tự lo style (KHÔNG copy CSS vào từng trang).
    function injectStyle() {
        if (document.getElementById('w2al-style')) return;
        const css = `
.w2al-filters{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
.w2al-filters select,.w2al-filters input{padding:7px 10px;border:1px solid var(--web2-border-btn,#d1d5db);border-radius:var(--web2-radius-sm,9px);font-size:13px;background:var(--surface,#fff);color:inherit}
.w2al-filters .w2al-load{padding:7px 16px;background:var(--web2-primary,#0068ff);color:#fff;border:0;border-radius:var(--web2-radius-sm,9px);cursor:pointer;font-weight:600;font-size:13px;transition:background .15s ease}
.w2al-filters .w2al-load:hover{background:var(--web2-primary-hover,#0058da)}
.w2al-scope{font-size:12px;font-weight:600;color:var(--web2-primary-hover,#0058da);display:inline-flex;align-items:center;gap:5px}
.w2al-scroll{overflow-x:auto}
.w2al-tbl td{vertical-align:top}
.w2al-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;background:#eef2f7;color:#475569}
.w2al-pill.product{background:#e0f4fc;color:#0891b2}
.w2al-pill.pbh{background:var(--web2-primary-soft,#eef5ff);color:var(--web2-primary,#0068ff)}
.w2al-pill.reconcile{background:#e3f7e8;color:#16a34a}
.w2al-pill.wallet{background:#fffbeb;color:#d97706}
.w2al-pill.purchase-refund{background:#fdeef0;color:#be123c}
.w2al-pill.customer{background:#eef0ff;color:#4f46e5}
.w2al-pill.payment-signal{background:#ecfdf5;color:#059669}
.w2al-pill.return{background:#fff7ed;color:#c2410c}
.w2al-pill.refund{background:#fef2f2;color:#dc2626}
.w2al-pill.kpi-assignment{background:#f5f3ff;color:#7c3aed}
.w2al-pill.variant{background:#e0f4fc;color:#0d9488}
.w2al-pill.native-order{background:#eef5ff;color:#2563eb}
.w2al-pill.so-order{background:#f0fdf4;color:#15803d}
.w2al-pill.web2-user{background:#fef9c3;color:#a16207}
.w2al-pill.supplier-wallet{background:#fff7ed;color:#ea580c}
.w2al-pill.delivery-invoice{background:#ecfeff;color:#0e7490}
.w2al-pill.jt-tracking{background:#f1f5f9;color:#475569}
.w2al-pill.fb-post{background:#eff6ff;color:#1d4ed8}
.w2al-pill.order-tag{background:#fdf4ff;color:#a21caf}
.w2al-pill.campaign{background:#fff1f2;color:#e11d48}
.w2al-pill.balance-transaction{background:#ecfdf5;color:#059669}
.w2al-diff{font-size:11px;max-width:360px;max-height:90px;overflow:auto;background:var(--gray-50,#f8fafc);border:1px dashed var(--border,#e5e7eb);padding:6px;margin:0;border-radius:6px;white-space:pre-wrap;word-break:break-word}
.w2al-msg{padding:20px;text-align:center;color:#94a3b8}
.w2al-msg.err{color:#dc2626}
.w2al-ov{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.42);padding:16px}
.w2al-modal{background:var(--surface,#fff);border-radius:var(--web2-radius,12px);box-shadow:0 16px 48px rgba(0,0,0,.22);width:min(860px,96vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;animation:w2alIn .16s ease}
@keyframes w2alIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.w2al-mhead{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border,#e6e9ef)}
.w2al-mhead h3{margin:0;font-size:15px;font-weight:700;flex:1;color:var(--web2-text,#1e293b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.w2al-mhead .w2al-x{border:0;background:var(--gray-50,#f1f5f9);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:17px;line-height:1;color:#64748b}
.w2al-mhead .w2al-x:hover{background:#e2e8f0}
.w2al-mbody{padding:14px 18px;overflow:auto}
@media (prefers-reduced-motion:reduce){.w2al-modal{animation:none}}
@media (max-width:768px){
  .w2al-tbl th:nth-child(3),.w2al-tbl td:nth-child(3),
  .w2al-tbl th:nth-child(6),.w2al-tbl td:nth-child(6){display:none}
}`;
        const st = document.createElement('style');
        st.id = 'w2al-style';
        st.textContent = css;
        document.head.appendChild(st);
    }

    function entityOptions(entities) {
        const list = entities && entities.length ? entities : Object.keys(ENTITY_LABELS);
        return (
            '<option value="">Tất cả entity</option>' +
            list
                .map((k) => `<option value="${esc(k)}">${esc(ENTITY_LABELS[k] || k)}</option>`)
                .join('')
        );
    }

    function actionOptions(actions) {
        return (
            '<option value="">Tất cả hành động</option>' +
            (actions || [])
                .map((a) => `<option value="${esc(a)}">${esc(actionLabel(a))}</option>`)
                .join('')
        );
    }

    // Lấy danh sách HÀNH ĐỘNG động từ server (theo entity đang chọn nếu có) → dropdown.
    async function populateActions(host) {
        const sel = host.querySelector('.w2al-action');
        if (!sel) return;
        const entity = (() => {
            const e = host.querySelector('.w2al-entity');
            return e ? e.value.trim() : '';
        })();
        try {
            const r = await fetch(
                API + '/actions' + (entity ? '?entity=' + encodeURIComponent(entity) : ''),
                {
                    credentials: 'include',
                    headers: authHeaders(),
                }
            );
            const d = await r.json();
            const actions = (d.actions || []).filter(Boolean);
            const cur = sel.value;
            sel.innerHTML = actionOptions(actions);
            // giữ lựa chọn cũ nếu còn hợp lệ, ngược lại reset về "Tất cả".
            sel.value = actions.includes(cur) ? cur : '';
        } catch {
            /* giữ dropdown hiện tại */
        }
    }

    // Lấy danh sách entity ĐỘNG từ server (4 bảng + entity-sink) → dropdown đủ.
    async function populateEntities(host) {
        const sel = host.querySelector('.w2al-entity');
        if (!sel) return;
        try {
            const r = await fetch(API + '/entities', {
                credentials: 'include',
                headers: authHeaders(),
            });
            const d = await r.json();
            const entities = (d.entities || []).filter(Boolean);
            if (entities.length) {
                const cur = sel.value;
                sel.innerHTML = entityOptions(entities);
                sel.value = cur; // giữ lựa chọn hiện tại nếu còn
            }
        } catch {
            /* giữ dropdown tĩnh fallback */
        }
    }

    function buildShell(host, opts) {
        const showFilters = opts.showFilters !== false;
        host.classList.add('w2al');
        host.innerHTML = `
            ${
                showFilters
                    ? `<div class="w2al-filters">
                <select class="w2al-entity" title="Lọc theo entity">${entityOptions()}</select>
                <select class="w2al-action" title="Lọc theo hành động chi tiết">${actionOptions()}</select>
                <input class="w2al-user" type="text" placeholder="Tên / username / user_id…" />
                <input class="w2al-from" type="date" title="Từ ngày (YYYY-MM-DD)" />
                <input class="w2al-to" type="date" title="Đến ngày (YYYY-MM-DD)" />
                <button type="button" class="w2al-load">Tải</button>
                <span class="w2al-scope"></span>
               </div>`
                    : ''
            }
            <div class="w2al-scroll">
                <table class="data-table w2al-tbl">
                    <thead><tr>
                        <th>Thời gian</th><th>Entity</th><th>ID</th>
                        <th>Action</th><th>User</th><th>Page</th><th>Changes</th>
                    </tr></thead>
                    <tbody class="w2al-body">
                        <tr><td colspan="${COLSPAN}" class="w2al-msg">Đang tải…</td></tr>
                    </tbody>
                </table>
            </div>`;
    }

    function rowHtml(it) {
        const ent = it.entity || '';
        const rawChanges = (() => {
            try {
                return JSON.stringify(it.changes, null, 2) || '';
            } catch {
                return '';
            }
        })();
        const truncated = rawChanges.length > 600;
        const diff =
            esc(rawChanges.slice(0, 600)) +
            (truncated ? ' <span style="color:#94a3b8;font-size:.85em">… (rút gọn)</span>' : '');
        return `<tr>
            <td>${esc(fmtTime(it.created_at))}</td>
            <td><span class="w2al-pill ${esc(ent)}">${esc(ENTITY_LABELS[ent] || ent)}</span></td>
            <td><code>${esc(it.entity_id || '')}</code></td>
            <td title="${esc(it.action || '')}">${esc(actionLabel(it.action))}</td>
            <td>${esc(it.user_name || it.user_id || '—')}</td>
            <td>${esc(it.source_page || '—')}</td>
            <td><pre class="w2al-diff">${diff}</pre></td>
        </tr>`;
    }

    async function load(host, opts) {
        const body = host.querySelector('.w2al-body');
        const q = new URLSearchParams();
        const get = (cls) => {
            const el = host.querySelector(cls);
            return el ? el.value.trim() : '';
        };
        // opts.entity/entityId = chế độ PER-RECORD (cố định, ưu tiên hơn filter UI).
        const e = opts.entity || get('.w2al-entity');
        const act = get('.w2al-action');
        const u = get('.w2al-user');
        const f = get('.w2al-from');
        const t = get('.w2al-to');
        if (e) q.set('entity', e);
        if (act) q.set('action', act);
        if (opts.entityId) q.set('entityId', opts.entityId);
        if (u) q.set('user', u);
        if (f) q.set('from', f);
        if (t) q.set('to', t);
        q.set('limit', String(opts.limit || 200));

        body.innerHTML = `<tr><td colspan="${COLSPAN}" style="padding:14px">${'<span class="w2-skel" style="display:block;height:16px;border-radius:6px;margin:6px 0"></span>'.repeat(4)}</td></tr>`;

        let d;
        try {
            const r = await fetch(API + '/list?' + q.toString(), {
                credentials: 'include',
                headers: authHeaders(),
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            d = await r.json();
        } catch (err) {
            body.innerHTML = `<tr><td colspan="${COLSPAN}" class="w2al-msg err">Lỗi tải: ${esc(err.message || err)} <button class="btn btn-sm w2al-load" type="button" style="margin-left:8px">Thử lại</button></td></tr>`;
            wireRetry(host, opts);
            if (window.notificationManager)
                notificationManager.show('Lỗi tải lịch sử: ' + (err.message || err), 'error');
            return;
        }

        applyScopeUi(host, d.viewer);

        const items = d.items || d.records || d.data || [];
        // expose FULL nhật ký đã nạp cho widget AI (Web2AiPageRegistry) — không chỉ DOM bảng.
        window.Web2AuditLogData = { items, viewer: d.viewer };
        if (!d.success || !items.length) {
            const msg = d.warning || 'Không có nhật ký khớp bộ lọc';
            body.innerHTML = `<tr><td colspan="${COLSPAN}" class="w2al-msg">${esc(msg)}</td></tr>`;
            return;
        }
        body.innerHTML = items.map(rowHtml).join('');
    }

    // Scope: ẩn ô lọc User khi NV (self) — họ chỉ xem của mình. Hiện badge phạm vi.
    function applyScopeUi(host, viewer) {
        const userInput = host.querySelector('.w2al-user');
        const badge = host.querySelector('.w2al-scope');
        const scope = (viewer && viewer.scope) || 'all';
        if (userInput) {
            const self = scope === 'self';
            userInput.style.display = self ? 'none' : '';
            if (self) userInput.value = '';
        }
        if (badge) {
            if (scope === 'self')
                badge.textContent =
                    '🔒 Chỉ thao tác của bạn' + (viewer.name ? ` (${viewer.name})` : '');
            else if (scope === 'all') badge.textContent = '🌐 Toàn bộ (admin)';
            else badge.textContent = '';
        }
    }

    function wireRetry(host, opts) {
        host.querySelectorAll('.w2al-load').forEach((b) => {
            b.onclick = () => load(host, opts);
        });
    }

    function resolveHost(target) {
        if (!target) return null;
        return typeof target === 'string' ? document.querySelector(target) : target;
    }

    let _last = null;

    const Web2AuditLog = {
        mount(target, opts) {
            opts = opts || {};
            const host = resolveHost(target);
            if (!host) {
                console.warn('[Web2AuditLog] mount target không tồn tại:', target);
                return;
            }
            injectStyle();
            buildShell(host, opts);
            _last = { host, opts };
            // Wire filter actions
            const btn = host.querySelector('.w2al-load');
            if (btn) btn.onclick = () => load(host, opts);
            ['.w2al-user', '.w2al-from', '.w2al-to'].forEach((cls) => {
                const el = host.querySelector(cls);
                if (el)
                    el.addEventListener('keydown', (ev) => {
                        if (ev.isComposing || ev.keyCode === 229) return; // IME tiếng Việt
                        if (ev.key === 'Enter') load(host, opts);
                    });
            });
            const entitySel = host.querySelector('.w2al-entity');
            if (entitySel)
                entitySel.addEventListener('change', () => {
                    // Đổi entity → action dropdown thu hẹp theo entity đó, rồi tải lại.
                    populateActions(host);
                    load(host, opts);
                });
            const actionSel = host.querySelector('.w2al-action');
            if (actionSel) actionSel.addEventListener('change', () => load(host, opts));
            if (opts.showFilters !== false) {
                populateEntities(host);
                populateActions(host);
            }
            if (opts.autoLoad !== false) load(host, opts);
        },
        reload(target) {
            const host = target ? resolveHost(target) : _last && _last.host;
            const opts = (target ? {} : _last && _last.opts) || {};
            if (host) load(host, opts);
        },
        // PER-RECORD history viewer (modal). Mọi trang dùng để hiện lịch sử của 1
        // record cụ thể (đơn/SP/KH/phiếu…). Scope NV/admin vẫn áp dụng server-side.
        //   opts: { entityId (bắt buộc), entity? (lọc thêm — bỏ trống = MỌI nguồn
        //           của id đó, vd PBH có cả 'pbh' + 'reconcile'), title?, limit? }
        openRecord(opts) {
            opts = opts || {};
            if (!opts.entityId) {
                console.warn('[Web2AuditLog] openRecord cần {entityId}');
                return;
            }
            injectStyle();
            const ov = document.createElement('div');
            ov.className = 'w2al-ov';
            const title = opts.title || `Lịch sử: ${opts.entityId}`;
            ov.innerHTML = `
                <div class="w2al-modal" role="dialog" aria-modal="true">
                    <div class="w2al-mhead">
                        <h3>${esc(title)}</h3>
                        <button type="button" class="w2al-x" aria-label="Đóng">×</button>
                    </div>
                    <div class="w2al-mbody"></div>
                </div>`;
            const close = () => {
                document.removeEventListener('keydown', onKey);
                ov.remove();
            };
            const onKey = (ev) => {
                if (ev.key === 'Escape') close();
            };
            ov.addEventListener('click', (ev) => {
                if (ev.target === ov) close();
            });
            ov.querySelector('.w2al-x').addEventListener('click', close);
            document.addEventListener('keydown', onKey);
            document.body.appendChild(ov);
            this.mount(ov.querySelector('.w2al-mbody'), {
                showFilters: false,
                entity: opts.entity || '', // '' = mọi entity của entityId này
                entityId: String(opts.entityId),
                limit: opts.limit || 100,
            });
            return { close };
        },
    };

    window.Web2AuditLog = Web2AuditLog;
})();
