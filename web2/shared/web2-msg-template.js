// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk Message Template Modal
// =====================================================
//
// Port của orders-report message-template-manager.js — rút gọn, self-contained,
// dùng Web2Chat + Extension thay vì pancakeDataManager.
//
// Template store: Postgres `web2_msg_templates` (web2Db) qua /api/web2-msg-templates
// — Hướng D 2026-06-14, migrate khỏi Firestore `web2_message_templates` (dọn nốt
// firebase Web 2.0). Server seed 4 default khi rỗng. Web 1.0 (orders-report
// message-template-manager.js, collection `message_templates`) KHÔNG đụng.
// schema: {id, name, content, order, active}. Placeholders:
//   {partner.name}     → order.customerName
//   {partner.address}  → order.address
//   {order.code}       → order.code
//   {order.details}    → lines summary (auto-fetched if missing)
//
// Send flow per order:
//   1. ROUTE 1: Resolve global_id via Web2Chat.fetchMessages → customers[].global_id
//   2. POST via extension REPLY_INBOX_PHOTO (bypass-24h)
//   3. Fallback Web2Chat.sendMessage(reply_inbox) if extension unavailable
//
// Public API (window.Web2MsgTemplate):
//   Web2MsgTemplate.open({orders, onComplete})  → opens modal

(function () {
    'use strict';

    const TEMPLATES_KEY = 'web2_message_templates_cache';
    const SENT_KEY = 'web2_sent_message_orders';
    const TTL_24H = 24 * 60 * 60 * 1000;

    // Server-side job API (chạy nền ở Render, refresh-safe). Qua CF worker proxy.
    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    // Mount dưới /api/web2/msg-send (CF worker forward /api/web2/* về Render).
    const API_BASE = WORKER_URL + '/api/web2/msg-send';
    // Hướng D (2026-06-14): template CRUD chuyển Firestore → Postgres (web2Db).
    // Route /api/web2-msg-templates trả {id,name,content,order,active}; client map
    // name→Name, content→Content để giữ nguyên modal code (dùng t.Name/t.Content).
    const TPL_API = WORKER_URL + '/api/web2-msg-templates';
    function _authHeaders(extra) {
        try {
            return window.Web2Auth?.authHeaders
                ? window.Web2Auth.authHeaders(extra)
                : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    let _templates = [];
    let _filtered = [];
    let _selectedTemplateId = null;
    let _modalOrders = [];
    let _sentOrders = new Map(); // orderCode → { ts }

    // ─── Active server job watch state (độc lập modal — refresh-safe) ──
    let _activeJobId = null;
    let _sseUnsub = null;
    let _pollTimer = null;
    let _draining = false;
    let _drainStop = false;
    let _watching = false;

    // ─── Persistence ─────────────────────────────────────────────
    function _loadSent() {
        try {
            const raw = localStorage.getItem(SENT_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw);
            const now = Date.now();
            arr.forEach((item) => {
                if (now - item.ts < TTL_24H) _sentOrders.set(item.code, { ts: item.ts });
            });
        } catch (_) {
            /* ignore */
        }
    }
    function _saveSent() {
        try {
            const arr = [];
            _sentOrders.forEach((v, code) => arr.push({ code, ts: v.ts }));
            localStorage.setItem(SENT_KEY, JSON.stringify(arr));
        } catch (_) {
            /* ignore */
        }
    }
    function _markSent(code) {
        _sentOrders.set(code, { ts: Date.now() });
        _saveSent();
    }
    function _isSent(code) {
        if (!code) return false;
        const e = _sentOrders.get(code);
        if (!e) return false;
        if (Date.now() - e.ts >= TTL_24H) {
            _sentOrders.delete(code);
            return false;
        }
        return true;
    }

    // ─── Postgres: load templates (Hướng D, thay Firestore) ───────
    // Map server {name,content} → {Name,Content} để modal dùng nguyên t.Name/t.Content.
    function _mapIn(it) {
        return {
            id: it.id,
            Name: it.name || '',
            Content: it.content || '',
            order: Number(it.order) || 0,
            active: it.active !== false,
        };
    }

    async function _loadTemplates() {
        // Try cache first (hiển thị ngay, revalidate sau).
        try {
            const cached = localStorage.getItem(TEMPLATES_KEY);
            if (cached) _templates = JSON.parse(cached);
        } catch (_) {
            /* ignore */
        }
        try {
            const r = await fetch(TPL_API, { headers: _authHeaders() });
            const d = await r.json().catch(() => null);
            if (r.ok && d?.success && Array.isArray(d.items)) {
                _templates = d.items.map(_mapIn);
                try {
                    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(_templates));
                } catch (_) {
                    /* quota */
                }
            }
        } catch (e) {
            console.warn('[Web2MsgTemplate] loadTemplates failed:', e?.message || e);
        }
        return _templates;
    }

    async function _saveTemplate(data) {
        const payload = {
            id: data.id || undefined,
            Name: data.Name || data.name || '',
            Content: data.Content || data.content || '',
            active: data.active !== false,
        };
        if (typeof data.order === 'number') payload.order = data.order;
        const r = await fetch(TPL_API, {
            method: 'POST',
            headers: _authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || 'HTTP ' + r.status);
        if (d.item?.id) data.id = d.item.id;
        await _loadTemplates();
        return data;
    }

    async function _deleteTemplate(id) {
        if (!id) return;
        const r = await fetch(TPL_API + '/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: _authHeaders(),
        });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || 'HTTP ' + r.status);
        await _loadTemplates();
    }

    // ─── Placeholder fill ─────────────────────────────────────────
    function _fillTemplate(text, order) {
        if (!text) return '';
        const total = _formatVnd(order.total);
        const phone = order.phone || '';
        return (
            text
                .replace(/\{partner\.name\}/g, order.customerName || order.fbUserName || 'bạn')
                .replace(/\{partner\.address\}/g, order.address || '')
                // phone: hỗ trợ cả {partner.phone} (cũ) lẫn {order.phone} (UI hint).
                .replace(/\{partner\.phone\}/g, phone)
                .replace(/\{order\.phone\}/g, phone)
                .replace(/\{order\.code\}/g, order.code || '')
                // total: hỗ trợ cả {order.total} lẫn {order.totalAmount} (UI hint).
                .replace(/\{order\.total\}/g, total)
                .replace(/\{order\.totalAmount\}/g, total)
                .replace(
                    /\{order\.details\}/g,
                    order._detailsText || _formatLines(order.lines || [])
                )
        );
    }

    function _formatVnd(n) {
        if (!n || !Number(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + 'đ';
    }

    function _formatLines(lines) {
        if (!Array.isArray(lines) || !lines.length) return '(không có sản phẩm)';
        return lines
            .map((l) => {
                const name = l.productName || l.name || l.productCode || '?';
                const qty = l.qty || l.quantity || 1;
                const price = _formatVnd(l.price || l.unitPrice || 0);
                return `• ${name} × ${qty} (${price})`;
            })
            .join('\n');
    }

    // ─── Modal DOM ────────────────────────────────────────────────
    function _ensureModal() {
        if (document.getElementById('w2MsgTplModal')) return;
        const css = `
            #w2MsgTplModal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:none;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto;}
            #w2MsgTplModal.active{display:flex;}
            .w2tpl-box{background:#fff;border-radius:14px;width:min(1100px,100%);max-height:calc(100vh - 80px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.25);}
            .w2tpl-head{padding:16px 22px;background:linear-gradient(135deg,#0068ff,#2a96ff);color:#fff;display:flex;align-items:center;gap:10px;}
            .w2tpl-head h3{margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;}
            .w2tpl-close{margin-left:auto;background:rgba(255,255,255,.18);border:0;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;}
            .w2tpl-close:hover{background:rgba(255,255,255,.32);}
            .w2tpl-search{padding:12px 22px;display:flex;gap:10px;border-bottom:1px solid #f1f5f9;}
            .w2tpl-search input{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;}
            .w2tpl-search input:focus{border-color:#0068ff;box-shadow:0 0 0 3px rgba(0, 104, 255,.12);}
            .w2tpl-newbtn{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;}
            .w2tpl-newbtn:hover{background:#15803d;}
            .w2tpl-body{padding:18px 22px;overflow:auto;flex:1;}
            .w2tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;}
            .w2tpl-card{border:2px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;background:#fff;transition:all .15s ease;position:relative;}
            .w2tpl-card:hover{border-color:#bcdcff;transform:translateY(-2px);box-shadow:0 6px 18px rgba(0, 104, 255,.12);}
            .w2tpl-card.selected{border-color:#0068ff;background:#f5f3ff;}
            .w2tpl-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
            .w2tpl-card-name{font-weight:700;font-size:14px;color:#0f172a;flex:1;}
            .w2tpl-card-badge{background:#e8f2ff;color:#0058da;font-size:10px;font-weight:700;letter-spacing:.5px;padding:2px 8px;border-radius:999px;}
            .w2tpl-card-edit{background:transparent;border:0;width:24px;height:24px;border-radius:6px;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center;}
            .w2tpl-card-edit:hover{background:#e8f2ff;color:#0068ff;}
            .w2tpl-card-body{font-size:12.5px;color:#475569;line-height:1.55;max-height:88px;overflow:hidden;position:relative;white-space:pre-wrap;}
            .w2tpl-card-fade{position:absolute;bottom:0;left:0;right:0;height:24px;background:linear-gradient(180deg,transparent,#fff);pointer-events:none;}
            .w2tpl-card.selected .w2tpl-card-fade{background:linear-gradient(180deg,transparent,#f5f3ff);}
            .w2tpl-empty{text-align:center;color:#94a3b8;padding:60px 20px;font-size:14px;}
            .w2tpl-footer{padding:14px 22px;border-top:1px solid #f1f5f9;display:flex;align-items:center;gap:14px;background:#fafafa;flex-wrap:wrap;}
            .w2tpl-stat{font-size:12px;color:#64748b;display:flex;align-items:center;gap:6px;}
            .w2tpl-stat strong{color:#0f172a;}
            .w2tpl-delay{display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;}
            .w2tpl-delay input{width:54px;border:1px solid #e2e8f0;border-radius:6px;padding:4px 6px;text-align:center;font-size:12px;}
            .w2tpl-actions{margin-left:auto;display:flex;gap:8px;}
            .w2tpl-cancel{background:#fff;border:1px solid #e2e8f0;color:#475569;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;}
            .w2tpl-cancel:hover{background:#f1f5f9;}
            .w2tpl-send{background:linear-gradient(135deg,#0068ff,#2a96ff);color:#fff;border:0;border-radius:8px;padding:8px 18px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;}
            .w2tpl-send:disabled{opacity:.5;cursor:not-allowed;}
            .w2tpl-send:not(:disabled):hover{filter:brightness(1.1);}
            .w2tpl-progress{padding:0 22px 14px;display:none;}
            .w2tpl-progress.show{display:block;}
            .w2tpl-progress-bar{height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-bottom:6px;}
            .w2tpl-progress-fill{height:100%;background:linear-gradient(90deg,#0068ff,#2a96ff);transition:width .3s;}
            .w2tpl-progress-text{font-size:12px;color:#475569;}
            .w2tpl-edit-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:none;align-items:center;justify-content:center;padding:20px;}
            .w2tpl-edit-modal.active{display:flex;}
            .w2tpl-edit-box{background:#fff;border-radius:14px;width:min(560px,100%);padding:22px;}
            .w2tpl-edit-box h3{margin:0 0 14px;font-size:16px;}
            .w2tpl-edit-box label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px;}
            .w2tpl-edit-box input,.w2tpl-edit-box textarea{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;box-sizing:border-box;}
            .w2tpl-edit-box textarea{min-height:160px;resize:vertical;}
            .w2tpl-edit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
            .w2tpl-edit-actions button{border:0;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;}
            .w2tpl-edit-cancel{background:#f1f5f9;color:#475569;}
            .w2tpl-edit-delete{background:#fee2e2;color:#dc2626;margin-right:auto;}
            .w2tpl-edit-save{background:#0068ff;color:#fff;}
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        const div = document.createElement('div');
        div.id = 'w2MsgTplModal';
        div.innerHTML = `
            <div class="w2tpl-box">
                <div class="w2tpl-head">
                    <i data-lucide="message-circle" style="width:18px;height:18px;"></i>
                    <h3>Gửi tin nhắn Facebook</h3>
                    <button class="w2tpl-close" id="w2tplClose">×</button>
                </div>
                <div class="w2tpl-search">
                    <input type="text" id="w2tplSearch" placeholder="Tìm kiếm template..." />
                    <button class="w2tpl-newbtn" id="w2tplNew">
                        <i data-lucide="plus" style="width:14px;height:14px;"></i> Mẫu mới
                    </button>
                </div>
                <div class="w2tpl-progress" id="w2tplProgress">
                    <div class="w2tpl-progress-bar"><div class="w2tpl-progress-fill" id="w2tplProgressFill" style="width:0%"></div></div>
                    <div class="w2tpl-progress-text" id="w2tplProgressText">0/0 đã gửi · 0 lỗi</div>
                </div>
                <div class="w2tpl-body"><div class="w2tpl-grid" id="w2tplGrid"></div></div>
                <div class="w2tpl-footer">
                    <span class="w2tpl-stat"><strong id="w2tplCount">0</strong> template</span>
                    <span class="w2tpl-stat"><strong id="w2tplOrderCount">0</strong> đơn</span>
                    <span class="w2tpl-delay" title="Số đơn gửi song song (tăng = nhanh hơn nhưng dễ rate-limit FB)">Song song <input type="number" id="w2tplConcurrency" value="6" min="1" max="12" /></span>
                    <span class="w2tpl-delay" title="Delay giữa các đợt gửi mỗi worker (0 = max speed)">Delay <input type="number" id="w2tplDelay" value="1" min="0" max="10" /> giây</span>
                    <div class="w2tpl-actions">
                        <button class="w2tpl-cancel" id="w2tplCancelBtn">Huỷ</button>
                        <button class="w2tpl-send" id="w2tplSendBtn" disabled>
                            <i data-lucide="send" style="width:14px;height:14px;"></i> Gửi tin nhắn
                        </button>
                    </div>
                </div>
            </div>
            <!-- Edit template modal -->
            <div class="w2tpl-edit-modal" id="w2tplEditModal">
                <div class="w2tpl-edit-box">
                    <h3 id="w2tplEditTitle">Mẫu mới</h3>
                    <label>Tên template</label>
                    <input type="text" id="w2tplEditName" placeholder="Vd: Chốt đơn" />
                    <label style="margin-top:10px;">Nội dung
                      <span style="font-weight:400;color:#94a3b8;font-size:11px;margin-left:4px;">Hỗ trợ: {partner.name}, {partner.address}, {order.phone}, {order.code}, {order.totalAmount}, {order.details}</span>
                    </label>
                    <textarea id="w2tplEditContent" placeholder="Dạ chào chị {partner.name},..."></textarea>
                    <div class="w2tpl-edit-actions">
                        <button class="w2tpl-edit-delete" id="w2tplEditDelete" style="display:none;">Xoá</button>
                        <button class="w2tpl-edit-cancel" id="w2tplEditCancel">Huỷ</button>
                        <button class="w2tpl-edit-save" id="w2tplEditSave">Lưu</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        // Wire up
        document.getElementById('w2tplClose').onclick = _closeModal;
        document.getElementById('w2tplCancelBtn').onclick = () => {
            if (_isSending && _activeJobId) {
                _cancelActiveJob();
            } else {
                _closeModal();
            }
        };
        document.getElementById('w2tplNew').onclick = () => _openEditModal(null);
        document.getElementById('w2tplSendBtn').onclick = _handleSend;
        document.getElementById('w2tplSearch').addEventListener('input', (e) => {
            const q = (e.target.value || '').toLowerCase().trim();
            _filtered = q
                ? _templates.filter(
                      (t) =>
                          (t.Name || '').toLowerCase().includes(q) ||
                          (t.Content || '').toLowerCase().includes(q)
                  )
                : [..._templates];
            _renderCards();
        });
        document.getElementById('w2tplEditCancel').onclick = () => {
            document.getElementById('w2tplEditModal').classList.remove('active');
        };
    }

    function _closeModal() {
        // Job chạy ở SERVER — đóng modal KHÔNG dừng job (refresh-safe). Pill nổi
        // vẫn theo dõi tiến độ; muốn dừng hẳn bấm "Dừng job" trên pill.
        document.getElementById('w2MsgTplModal').classList.remove('active');
    }

    function _renderCards() {
        const grid = document.getElementById('w2tplGrid');
        if (!grid) return;
        document.getElementById('w2tplCount').textContent = _filtered.length;
        if (!_filtered.length) {
            grid.innerHTML = `<div class="w2tpl-empty">Chưa có template nào. Bấm "Mẫu mới" để tạo.</div>`;
            return;
        }
        grid.innerHTML = _filtered
            .map((t) => {
                const sel = t.id === _selectedTemplateId ? ' selected' : '';
                const content = String(t.Content || '').replace(/</g, '&lt;');
                const name = String(t.Name || '(Không tên)').replace(/</g, '&lt;');
                return `
                <div class="w2tpl-card${sel}" data-id="${t.id}">
                    <div class="w2tpl-card-head">
                        <span class="w2tpl-card-name">${name}</span>
                        <span class="w2tpl-card-badge">MESSENGER</span>
                        <button class="w2tpl-card-edit" data-edit-id="${t.id}" title="Sửa">
                            <i data-lucide="pencil" style="width:13px;height:13px;"></i>
                        </button>
                    </div>
                    <div class="w2tpl-card-body">${content}<div class="w2tpl-card-fade"></div></div>
                </div>`;
            })
            .join('');
        // Wire clicks
        grid.querySelectorAll('.w2tpl-card').forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-edit-id]')) return;
                _selectedTemplateId = card.dataset.id;
                _renderCards();
                document.getElementById('w2tplSendBtn').disabled = false;
            });
        });
        grid.querySelectorAll('[data-edit-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.editId;
                const tpl = _templates.find((t) => t.id === id);
                if (tpl) _openEditModal(tpl);
            });
        });
        if (window.lucide?.createIcons) {
            try {
                window.lucide.createIcons();
            } catch (_) {
                /* */
            }
        }
    }

    function _openEditModal(template) {
        const m = document.getElementById('w2tplEditModal');
        const isEdit = !!template;
        document.getElementById('w2tplEditTitle').textContent = isEdit ? 'Sửa template' : 'Mẫu mới';
        document.getElementById('w2tplEditName').value = template?.Name || '';
        document.getElementById('w2tplEditContent').value = template?.Content || '';
        const delBtn = document.getElementById('w2tplEditDelete');
        delBtn.style.display = isEdit ? 'inline-block' : 'none';
        delBtn.onclick = async () => {
            if (!confirm(`Xoá template "${template.Name}"?`)) return;
            try {
                await _deleteTemplate(template.id);
                _filtered = [..._templates];
                _renderCards();
                m.classList.remove('active');
                _toast(`Đã xoá template "${template.Name}"`, 'success');
            } catch (e) {
                _toast('Xoá thất bại: ' + (e?.message || e), 'error');
            }
        };
        document.getElementById('w2tplEditSave').onclick = async () => {
            const name = document.getElementById('w2tplEditName').value.trim();
            const content = document.getElementById('w2tplEditContent').value.trim();
            if (!name || !content) {
                _toast('Vui lòng nhập tên và nội dung', 'warning');
                return;
            }
            try {
                await _saveTemplate({ id: template?.id, Name: name, Content: content });
                _filtered = [..._templates];
                _renderCards();
                m.classList.remove('active');
                _toast(`Đã lưu template "${name}"`, 'success');
            } catch (e) {
                _toast('Lưu thất bại: ' + (e?.message || e), 'error');
            }
        };
        m.classList.add('active');
        setTimeout(() => document.getElementById('w2tplEditName').focus(), 50);
    }

    function _toast(msg, type) {
        if (window.notificationManager?.show) {
            window.notificationManager.show(msg, type || 'info');
        } else {
            console.log('[Web2MsgTemplate]', type, msg);
        }
    }

    // ─── Send loop ────────────────────────────────────────────────
    let _isSending = false;

    // Tạo job server-side: server gửi Pancake API đa-account song song (nhanh,
    // refresh-safe). Đơn lỗi 24h → server đánh dấu needs_extension → client drain
    // qua extension (bypass). Xem render.com/routes/web2-msg-send.js + worker.
    async function _handleSend() {
        if (!_selectedTemplateId) {
            _toast('Chọn 1 template trước', 'warning');
            return;
        }
        const tpl = _templates.find((t) => t.id === _selectedTemplateId);
        if (!tpl?.Content) {
            _toast('Template không có nội dung', 'warning');
            return;
        }
        if (!_modalOrders.length) {
            _toast('Không có đơn nào để gửi', 'warning');
            return;
        }

        // Fill template per đơn ở client → server chỉ việc gửi text đã sẵn.
        const items = _modalOrders
            .map((o) => ({
                orderCode: o.code || null,
                pageId: o.fbPageId || '',
                convId: o.conversationId || '',
                customerId: o.customerUuid || null,
                customerName: o.customerName || o.fbUserName || '',
                fbUserId: o.fbUserId || '',
                globalId: o._fbGlobalUserId || '',
                threadId: o.threadId || '',
                message: _fillTemplate(tpl.Content, o),
            }))
            .filter((it) => it.message && it.pageId && it.convId);

        if (!items.length) {
            _toast('Không có đơn hợp lệ (thiếu page/conversation)', 'warning');
            return;
        }

        const sendBtn = document.getElementById('w2tplSendBtn');
        sendBtn.disabled = true;
        sendBtn.innerHTML =
            '<i data-lucide="loader-2" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Đang tạo...';
        _refreshIcons();

        let createdBy = '';
        try {
            const u = window.Web2UserInfo?.get?.();
            createdBy = u?.name || u?.username || u?.email || '';
        } catch (_) {
            /* ignore */
        }

        try {
            const r = await fetch(API_BASE + '/', {
                method: 'POST',
                headers: _authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ createdBy, templateName: tpl.Name || '', items }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d?.success) throw new Error(d?.error || 'HTTP ' + r.status);
            // Optimistic 24h-skip cho lần mở modal sau.
            items.forEach((it) => it.orderCode && _markSent(it.orderCode));
            _toast(`Đã tạo job gửi ${d.total} khách — đang chạy ở server`, 'success');
            document.getElementById('w2tplProgress').classList.add('show');
            _startWatch(d.jobId, {
                total: d.total,
                sent: 0,
                failed: 0,
                needsExt: 0,
                active: d.total,
            });
        } catch (e) {
            _toast('Tạo job thất bại: ' + (e?.message || e), 'error');
            sendBtn.disabled = false;
            sendBtn.innerHTML =
                '<i data-lucide="send" style="width:14px;height:14px;"></i> Gửi tin nhắn';
            _refreshIcons();
        }
    }

    // ─── Job watch (SSE + poll + extension drain) — độc lập modal ──────
    function _startWatch(jobId, seed) {
        if (_watching && _activeJobId === jobId) {
            if (seed) _onProgress(seed);
            return;
        }
        _activeJobId = jobId;
        _watching = true;
        _isSending = true;
        _drainStop = false;
        _ensurePill();
        if (seed) _onProgress(seed);

        // Modal UI (nếu modal đang mở).
        const sendBtn = document.getElementById('w2tplSendBtn');
        const cancelBtn = document.getElementById('w2tplCancelBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML =
                '<i data-lucide="loader-2" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Đang gửi ở server...';
        }
        if (cancelBtn) cancelBtn.textContent = 'Dừng';
        _refreshIcons();

        // SSE realtime.
        if (window.Web2SSE?.subscribe) {
            try {
                _sseUnsub = window.Web2SSE.subscribe('web2:bulk-send:' + jobId, (msg) => {
                    if (msg?.data) _onProgress(msg.data);
                });
            } catch (_) {
                /* ignore */
            }
        }
        // Poll fallback (SSE rớt) + nguồn chân lý cho state 'done'.
        if (_pollTimer) clearInterval(_pollTimer);
        _pollTimer = setInterval(() => _pollJob(jobId), 3000);
        _pollJob(jobId);
        // Extension drain cho đơn 24h.
        _drainExtension(jobId);
    }

    function _stopWatch(finalJob) {
        _watching = false;
        _isSending = false;
        _drainStop = true;
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
        if (_sseUnsub) {
            try {
                _sseUnsub();
            } catch (_) {
                /* */
            }
            _sseUnsub = null;
        }
        const sendBtn = document.getElementById('w2tplSendBtn');
        const cancelBtn = document.getElementById('w2tplCancelBtn');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML =
                '<i data-lucide="send" style="width:14px;height:14px;"></i> Gửi tin nhắn';
        }
        if (cancelBtn) cancelBtn.textContent = 'Đóng';
        _refreshIcons();
        if (finalJob) {
            const msg = `Hoàn thành. Gửi: ${finalJob.sent || 0}${finalJob.failed ? ' · Lỗi: ' + finalJob.failed : ''}`;
            _toast(msg, finalJob.failed ? 'warning' : 'success');
            _updatePill(finalJob, true);
            setTimeout(_hidePill, 6000);
        } else {
            _hidePill();
        }
    }

    async function _pollJob(jobId) {
        try {
            const r = await fetch(API_BASE + '/' + jobId);
            const d = await r.json().catch(() => null);
            if (d?.success && d.job) {
                _onProgress(d.job);
                if (d.job.state === 'done') _stopWatch(d.job);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function _onProgress(p) {
        // Modal progress bar (nếu mở).
        const fillEl = document.getElementById('w2tplProgressFill');
        const textEl = document.getElementById('w2tplProgressText');
        const total =
            p.total != null
                ? p.total
                : (p.sent || 0) + (p.failed || 0) + (p.needsExt || 0) + (p.active || 0);
        const done = (p.sent || 0) + (p.failed || 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const parts = [`${p.sent || 0}/${total} đã gửi`];
        if (p.failed) parts.push(`${p.failed} lỗi`);
        if (p.needsExt) parts.push(`${p.needsExt} chờ extension`);
        if (p.active) parts.push(`${p.active} đang chạy`);
        const txt = parts.join(' · ');
        if (fillEl) fillEl.style.width = pct + '%';
        if (textEl) textEl.textContent = txt;
        _updatePill({ ...p, total, pct, txt }, false);
    }

    async function _fetchJob(jobId) {
        try {
            const r = await fetch(API_BASE + '/' + jobId);
            const d = await r.json().catch(() => null);
            return d?.success ? d.job : null;
        } catch (_) {
            return null;
        }
    }

    // ─── Extension drain: đơn lỗi-24h → gửi qua extension (bypass) ─────
    async function _drainExtension(jobId) {
        if (_draining) return;
        _draining = true;
        const reqFn = window.NativeOrdersApp?._extensionRequest || window._w2ExtensionRequest;
        try {
            while (!_drainStop) {
                let items = [];
                try {
                    const r = await fetch(API_BASE + '/' + jobId + '/extension-items?limit=10');
                    const d = await r.json().catch(() => null);
                    items = d?.items || [];
                } catch (_) {
                    items = [];
                }
                if (!items.length) {
                    const st = await _fetchJob(jobId);
                    if (!st || (st.active === 0 && st.needsExt === 0)) break;
                    await _sleep(1500);
                    continue;
                }
                if (!reqFn) {
                    _toast(
                        `${items.length}+ đơn quá 24h cần extension — mở tab có extension để tiếp tục`,
                        'warning'
                    );
                    break; // tab này không có extension → để nguyên needs_extension
                }
                // Đa nhiệm theo KH (1 phiên FB) — pool nhỏ tránh spam rate-limit FB.
                const conc = Math.max(
                    1,
                    Math.min(6, parseInt(document.getElementById('w2tplConcurrency')?.value) || 3)
                );
                for (let i = 0; i < items.length; i += conc) {
                    if (_drainStop) break;
                    await Promise.all(
                        items
                            .slice(i, i + conc)
                            .map((it) => _sendItemViaExtension(jobId, it, reqFn))
                    );
                }
                await _sleep(300);
            }
        } finally {
            _draining = false;
        }
    }

    async function _sendItemViaExtension(jobId, item, reqFn) {
        // Claim chống double-send (server flip needs_extension → ext_inflight).
        try {
            const cr = await fetch(API_BASE + '/' + jobId + '/items/' + item.id + '/claim-ext', {
                method: 'POST',
                headers: _authHeaders(),
            });
            const cd = await cr.json().catch(() => null);
            if (!cd?.claimed) return;
        } catch (_) {
            return;
        }
        let ok = false;
        let err = null;
        try {
            await _extSendOne(item, reqFn);
            ok = true;
        } catch (e) {
            err = e?.message || String(e);
        }
        try {
            await fetch(API_BASE + '/' + jobId + '/items/' + item.id + '/result', {
                method: 'POST',
                headers: _authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ ok, via: 'extension', error: err }),
            });
        } catch (_) {
            /* ignore */
        }
    }

    // Gửi 1 item qua extension. Resolve global_id nếu thiếu (PSID ≠ global id).
    async function _extSendOne(item, reqFn) {
        let globalUserId = item.global_id || '';
        if (!globalUserId && window.Web2Chat?.fetchMessages && item.page_id && item.conv_id) {
            try {
                const msgRes = await window.Web2Chat.fetchMessages(
                    item.page_id,
                    item.conv_id,
                    item.customer_id || null
                );
                if (msgRes?.ok) {
                    const cust =
                        msgRes.customers?.find?.(
                            (c) => c?.fb_id === item.fb_user_id || c?.global_id
                        ) || msgRes.customers?.[0];
                    const gid =
                        cust?.global_id || msgRes.conversation?.page_customer?.global_id || null;
                    if (gid) globalUserId = String(gid);
                }
            } catch (_) {
                /* fall through */
            }
        }
        const r = await reqFn(
            'REPLY_INBOX_PHOTO',
            {
                pageId: item.page_id,
                globalUserId: globalUserId || item.fb_user_id,
                threadId: item.thread_id || '',
                convId: item.thread_id ? 't_' + item.thread_id : item.conv_id || '',
                customerName: item.customer_name || '',
                message: item.message,
                attachmentType: 'SEND_TEXT_ONLY',
                platform: 'facebook',
                isBusiness: true,
            },
            30000
        );
        if (!r?.ok) throw new Error(r?.error || r?.reason || 'extension fail');
    }

    function _refreshIcons() {
        if (window.lucide?.createIcons) {
            try {
                window.lucide.createIcons();
            } catch (_) {
                /* */
            }
        }
    }

    // ─── Floating pill: hiện job đang chạy ở server (refresh vẫn thấy) ─
    function _ensurePill() {
        if (document.getElementById('w2tplPill')) return;
        const style = document.createElement('style');
        style.textContent = `
            #w2tplPill{position:fixed;right:18px;bottom:18px;z-index:9998;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0068ff;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.18);padding:11px 14px;min-width:230px;max-width:320px;font-size:12.5px;color:#0f172a;display:none;}
            #w2tplPill.show{display:block;}
            #w2tplPill .w2pill-top{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:7px;}
            #w2tplPill .w2pill-top .w2pill-x{margin-left:auto;cursor:pointer;color:#94a3b8;font-weight:400;font-size:13px;}
            #w2tplPill .w2pill-bar{height:6px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-bottom:6px;}
            #w2tplPill .w2pill-fill{height:100%;background:linear-gradient(90deg,#0068ff,#2a96ff);width:0;transition:width .3s;}
            #w2tplPill .w2pill-txt{color:#475569;}
            #w2tplPill .w2pill-stop{margin-top:7px;cursor:pointer;color:#dc2626;font-weight:600;font-size:11.5px;}
        `;
        document.head.appendChild(style);
        const el = document.createElement('div');
        el.id = 'w2tplPill';
        el.innerHTML = `
            <div class="w2pill-top"><i data-lucide="send" style="width:14px;height:14px;color:#0068ff;"></i><span>Đang gửi tin nhắn</span><span class="w2pill-x" id="w2pillX">×</span></div>
            <div class="w2pill-bar"><div class="w2pill-fill" id="w2pillFill"></div></div>
            <div class="w2pill-txt" id="w2pillTxt">…</div>
            <div class="w2pill-stop" id="w2pillStop">Dừng job</div>
        `;
        document.body.appendChild(el);
        document.getElementById('w2pillX').onclick = _hidePill; // chỉ ẩn pill, job vẫn chạy
        document.getElementById('w2pillStop').onclick = _cancelActiveJob;
        _refreshIcons();
    }

    function _updatePill(p, done) {
        _ensurePill();
        const pill = document.getElementById('w2tplPill');
        const fill = document.getElementById('w2pillFill');
        const txt = document.getElementById('w2pillTxt');
        if (!pill) return;
        pill.classList.add('show');
        const total =
            p.total != null
                ? p.total
                : (p.sent || 0) + (p.failed || 0) + (p.needsExt || 0) + (p.active || 0);
        const pct =
            p.pct != null
                ? p.pct
                : total
                  ? Math.round((((p.sent || 0) + (p.failed || 0)) / total) * 100)
                  : 0;
        if (fill) fill.style.width = pct + '%';
        if (txt)
            txt.textContent =
                p.txt ||
                `${p.sent || 0}/${total} đã gửi${p.failed ? ' · ' + p.failed + ' lỗi' : ''}${p.needsExt ? ' · ' + p.needsExt + ' chờ ext' : ''}`;
        const stop = document.getElementById('w2pillStop');
        if (stop) stop.style.display = done ? 'none' : 'block';
    }

    function _hidePill() {
        const pill = document.getElementById('w2tplPill');
        if (pill) pill.classList.remove('show');
    }

    async function _cancelActiveJob() {
        if (!_activeJobId) return;
        if (!confirm('Dừng job? Các đơn chưa gửi sẽ bị huỷ (đơn đã gửi vẫn giữ).')) return;
        try {
            await fetch(API_BASE + '/' + _activeJobId + '/cancel', {
                method: 'POST',
                headers: _authHeaders(),
            });
        } catch (_) {
            /* ignore */
        }
        const job = await _fetchJob(_activeJobId);
        _stopWatch(job || { sent: 0, failed: 0 });
    }

    // Reattach job đang chạy khi mở modal / load trang (refresh-safe).
    async function _maybeReattachActive() {
        if (_watching) return;
        try {
            const r = await fetch(API_BASE + '/active');
            const d = await r.json().catch(() => null);
            const job = d?.success ? d.job : null;
            if (job && (job.state === 'running' || job.state === 'awaiting_extension')) {
                document.getElementById('w2tplProgress')?.classList.add('show');
                _startWatch(job.id, job);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function _sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    // ─── Public API ───────────────────────────────────────────────
    async function open({ orders }) {
        _loadSent();
        _ensureModal();
        // Filter: must have conversationId + fbPageId + not already sent in 24h
        const valid = [];
        let skipped = 0;
        for (const o of orders || []) {
            if (!o.fbPageId || !o.conversationId) {
                skipped++;
                continue;
            }
            if (o.code && _isSent(o.code)) {
                skipped++;
                continue;
            }
            valid.push(o);
        }
        if (skipped > 0) {
            _toast(`Bỏ qua ${skipped} đơn (đã gửi trong 24h hoặc thiếu conversation)`, 'info');
        }
        if (!valid.length) {
            _toast('Không có đơn hợp lệ để gửi', 'warning');
            return;
        }
        _modalOrders = valid;
        _selectedTemplateId = null;
        document.getElementById('w2tplSendBtn').disabled = true;
        document.getElementById('w2tplProgress').classList.remove('show');
        document.getElementById('w2tplOrderCount').textContent = valid.length;
        document.getElementById('w2tplSearch').value = '';
        document.getElementById('w2MsgTplModal').classList.add('active');

        // Show loading
        const grid = document.getElementById('w2tplGrid');
        grid.innerHTML = `<div class="w2tpl-empty">Đang tải template...</div>`;
        document.getElementById('w2tplCount').textContent = '...';
        await _loadTemplates();
        _filtered = [..._templates];
        _renderCards();
        // Nếu đã có job đang chạy (vừa tạo / sau refresh) → bám lại progress.
        _maybeReattachActive();
    }

    window.Web2MsgTemplate = { open };

    // Inject CSS keyframe for spinner (Lucide loader doesn't auto-spin)
    if (!document.getElementById('w2tplSpinKeyframe')) {
        const s = document.createElement('style');
        s.id = 'w2tplSpinKeyframe';
        s.textContent = '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }

    // Boot: sau refresh, nếu còn job đang chạy ở server → tự bám lại (hiện pill
    // tiến độ) + tiếp tục drain đơn 24h qua extension. Không cần mở modal.
    setTimeout(() => {
        try {
            _maybeReattachActive();
        } catch (_) {
            /* ignore */
        }
    }, 2500);
})();
