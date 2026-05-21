// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk Message Template Modal
// =====================================================
//
// Port của orders-report message-template-manager.js — rút gọn, self-contained,
// dùng Web2Chat + Extension thay vì pancakeDataManager.
//
// Firestore collection `message_templates` (SHARED với orders-report) —
// schema: {Name, Content, order, active, createdAt}. Placeholders:
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

    let _templates = [];
    let _filtered = [];
    let _selectedTemplateId = null;
    let _modalOrders = [];
    let _sentOrders = new Map(); // orderCode → { ts }
    let _cancelRequested = false;

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

    // ─── Firestore: load templates ────────────────────────────────
    async function _loadTemplates() {
        // Try cache first
        try {
            const cached = localStorage.getItem(TEMPLATES_KEY);
            if (cached) _templates = JSON.parse(cached);
        } catch (_) {
            /* ignore */
        }
        if (!window.db) return _templates;
        try {
            const snap = await window.db
                .collection('message_templates')
                .orderBy('order', 'asc')
                .get();
            _templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            // Seed default 4 templates if empty
            if (_templates.length === 0) {
                await _seedDefaults();
                const snap2 = await window.db
                    .collection('message_templates')
                    .orderBy('order', 'asc')
                    .get();
                _templates = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
            try {
                localStorage.setItem(TEMPLATES_KEY, JSON.stringify(_templates));
            } catch (_) {
                /* quota */
            }
        } catch (e) {
            console.warn('[Web2MsgTemplate] loadTemplates failed:', e?.message || e);
        }
        return _templates;
    }

    async function _seedDefaults() {
        if (!window.db || !window.firebase?.firestore?.FieldValue) return;
        const ts = window.firebase.firestore.FieldValue.serverTimestamp();
        const defaults = [
            {
                Name: 'Chốt đơn',
                Content:
                    'Dạ chào chị {partner.name},\n\nEm gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:\n\n{order.details}\n\nĐơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"\n\nChị xác nhận giúp em để em gửi hàng nha ạ! 🙏',
                order: 1,
                active: true,
                createdAt: ts,
            },
            {
                Name: 'Xác nhận địa chỉ',
                Content:
                    'Dạ chị {partner.name} ơi,\n\nEm xác nhận lại địa chỉ nhận hàng của chị là:\n📍 {partner.address}\n\nChị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?',
                order: 2,
                active: true,
                createdAt: ts,
            },
            {
                Name: 'Thông báo giao hàng',
                Content:
                    'Dạ chị {partner.name} ơi,\n\nĐơn hàng #{order.code} của chị đã được giao cho đơn vị vận chuyển rồi ạ.\n\nChị chú ý điện thoại để nhận hàng nha! 📦',
                order: 3,
                active: true,
                createdAt: ts,
            },
            {
                Name: 'Cảm ơn khách hàng',
                Content:
                    'Dạ cảm ơn chị {partner.name} đã ủng hộ shop ạ! 🙏❤️\n\nChị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.\n\nChúc chị một ngày vui vẻ! 😊',
                order: 4,
                active: true,
                createdAt: ts,
            },
        ];
        const batch = window.db.batch();
        const ref = window.db.collection('message_templates');
        defaults.forEach((t) => batch.set(ref.doc(), t));
        await batch.commit();
    }

    async function _saveTemplate(data) {
        if (!window.db) throw new Error('Firestore not ready');
        const payload = {
            Name: data.Name || data.name || '',
            Content: data.Content || data.content || '',
            order: typeof data.order === 'number' ? data.order : _templates.length,
            active: data.active !== false,
        };
        if (window.firebase?.firestore?.FieldValue) {
            payload.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();
        }
        if (data.id) {
            await window.db.collection('message_templates').doc(data.id).update(payload);
        } else {
            if (window.firebase?.firestore?.FieldValue) {
                payload.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
            }
            const ref = await window.db.collection('message_templates').add(payload);
            data.id = ref.id;
        }
        await _loadTemplates();
        return data;
    }

    async function _deleteTemplate(id) {
        if (!window.db || !id) return;
        await window.db.collection('message_templates').doc(id).delete();
        await _loadTemplates();
    }

    // ─── Placeholder fill ─────────────────────────────────────────
    function _fillTemplate(text, order) {
        if (!text) return '';
        return text
            .replace(/\{partner\.name\}/g, order.customerName || order.fbUserName || 'bạn')
            .replace(/\{partner\.address\}/g, order.address || '')
            .replace(/\{partner\.phone\}/g, order.phone || '')
            .replace(/\{order\.code\}/g, order.code || '')
            .replace(/\{order\.total\}/g, _formatVnd(order.total))
            .replace(/\{order\.details\}/g, order._detailsText || _formatLines(order.lines || []));
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
            .w2tpl-head{padding:16px 22px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;display:flex;align-items:center;gap:10px;}
            .w2tpl-head h3{margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:8px;}
            .w2tpl-close{margin-left:auto;background:rgba(255,255,255,.18);border:0;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;}
            .w2tpl-close:hover{background:rgba(255,255,255,.32);}
            .w2tpl-search{padding:12px 22px;display:flex;gap:10px;border-bottom:1px solid #f1f5f9;}
            .w2tpl-search input{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;}
            .w2tpl-search input:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.12);}
            .w2tpl-newbtn{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;}
            .w2tpl-newbtn:hover{background:#15803d;}
            .w2tpl-body{padding:18px 22px;overflow:auto;flex:1;}
            .w2tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;}
            .w2tpl-card{border:2px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;background:#fff;transition:all .15s ease;position:relative;}
            .w2tpl-card:hover{border-color:#c4b5fd;transform:translateY(-2px);box-shadow:0 6px 18px rgba(124,58,237,.12);}
            .w2tpl-card.selected{border-color:#7c3aed;background:#f5f3ff;}
            .w2tpl-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
            .w2tpl-card-name{font-weight:700;font-size:14px;color:#0f172a;flex:1;}
            .w2tpl-card-badge{background:#ede9fe;color:#6d28d9;font-size:10px;font-weight:700;letter-spacing:.5px;padding:2px 8px;border-radius:999px;}
            .w2tpl-card-edit{background:transparent;border:0;width:24px;height:24px;border-radius:6px;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center;}
            .w2tpl-card-edit:hover{background:#ede9fe;color:#7c3aed;}
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
            .w2tpl-send{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:0;border-radius:8px;padding:8px 18px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;}
            .w2tpl-send:disabled{opacity:.5;cursor:not-allowed;}
            .w2tpl-send:not(:disabled):hover{filter:brightness(1.1);}
            .w2tpl-progress{padding:0 22px 14px;display:none;}
            .w2tpl-progress.show{display:block;}
            .w2tpl-progress-bar{height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-bottom:6px;}
            .w2tpl-progress-fill{height:100%;background:linear-gradient(90deg,#7c3aed,#a855f7);transition:width .3s;}
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
            .w2tpl-edit-save{background:#7c3aed;color:#fff;}
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
                      <span style="font-weight:400;color:#94a3b8;font-size:11px;margin-left:4px;">Hỗ trợ: {partner.name}, {partner.address}, {order.code}, {order.details}, {order.total}</span>
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
            if (_isSending) {
                _cancelRequested = true;
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
        if (_isSending) {
            if (!confirm('Đang gửi — đóng cũng sẽ dừng. Tiếp tục?')) return;
            _cancelRequested = true;
        }
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
        const delay = Math.max(0, parseInt(document.getElementById('w2tplDelay').value) || 1);
        const concurrency = Math.max(
            1,
            Math.min(12, parseInt(document.getElementById('w2tplConcurrency').value) || 6)
        );
        const sendBtn = document.getElementById('w2tplSendBtn');
        const cancelBtn = document.getElementById('w2tplCancelBtn');
        const progEl = document.getElementById('w2tplProgress');
        const fillEl = document.getElementById('w2tplProgressFill');
        const textEl = document.getElementById('w2tplProgressText');

        _isSending = true;
        _cancelRequested = false;
        sendBtn.disabled = true;
        sendBtn.innerHTML =
            '<i data-lucide="loader-2" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Đang gửi...';
        cancelBtn.textContent = 'Dừng';
        progEl.classList.add('show');

        // ─── Multi-worker parallel send engine ───────────────────
        //
        // Phân chia đơn theo PAGE (fbPageId): mỗi page có FB session/rate-limit
        // riêng → có thể gửi cùng lúc các page khác nhau mà không ảnh hưởng.
        // Trong 1 page, worker pool tối đa N concurrent (config từ UI).
        //
        // Pancake API path KHÔNG bị FB rate-limit (Pancake server tự handle),
        // còn extension REPLY_INBOX_PHOTO post trực tiếp lên business.facebook.com
        // → rate-limit per FB account. Mặc định 6 song song là an toàn cho 1 KH
        // gửi từ Business Suite (Pancake V2 ext cũng dùng 3-6 per account).
        const total = _modalOrders.length;
        const counters = { sent: 0, failed: 0, errors: [], done: 0 };

        // Group theo page (string key)
        const byPage = new Map();
        for (const o of _modalOrders) {
            const k = String(o.fbPageId || '__noPage__');
            if (!byPage.has(k)) byPage.set(k, []);
            byPage.get(k).push(o);
        }

        const updateProgress = () => {
            const pct = Math.round((counters.done / total) * 100);
            fillEl.style.width = pct + '%';
            textEl.textContent = `${counters.sent}/${total} đã gửi · ${counters.failed} lỗi · ${counters.done - counters.sent - counters.failed} đang chạy`;
        };
        updateProgress();

        const handleOne = async (order) => {
            if (_cancelRequested) return;
            try {
                const text = _fillTemplate(tpl.Content, order);
                await _sendOneOrder(order, text);
                _markSent(order.code);
                counters.sent++;
            } catch (e) {
                counters.failed++;
                counters.errors.push({ code: order.code, err: e?.message || String(e) });
                console.warn('[Web2MsgTemplate] send failed', order.code, e);
            }
            counters.done++;
            updateProgress();
        };

        // 1 worker pool per page (concurrent limit = N from UI). Pages run in
        // parallel — each page's queue drained by `concurrency` workers.
        const pageWorkers = Array.from(byPage.values()).map((pageQueue) =>
            (async () => {
                const pool = new Set();
                for (const order of pageQueue) {
                    if (_cancelRequested) break;
                    const task = handleOne(order);
                    pool.add(task);
                    task.finally(() => pool.delete(task));
                    if (pool.size >= concurrency) {
                        await Promise.race(pool);
                        // Optional inter-batch delay (only when delay > 0)
                        if (delay > 0 && !_cancelRequested) await _sleep(delay * 1000);
                    }
                }
                await Promise.allSettled([...pool]);
            })()
        );

        await Promise.all(pageWorkers);

        _isSending = false;
        cancelBtn.textContent = 'Đóng';
        sendBtn.innerHTML =
            '<i data-lucide="send" style="width:14px;height:14px;"></i> Gửi tin nhắn';
        sendBtn.disabled = false;
        if (window.lucide?.createIcons) {
            try {
                window.lucide.createIcons();
            } catch (_) {
                /* */
            }
        }
        const summary = _cancelRequested
            ? `Đã dừng. Gửi: ${counters.sent} · Lỗi: ${counters.failed}`
            : `Hoàn thành. Gửi: ${counters.sent} · Lỗi: ${counters.failed} · ${byPage.size} page × ${concurrency} worker`;
        _toast(summary, counters.failed === 0 && !_cancelRequested ? 'success' : 'warning');
        if (counters.errors.length) console.warn('[Web2MsgTemplate] errors:', counters.errors);
    }

    async function _sendOneOrder(order, text) {
        // ROUTE 1: extension bypass-24h (resolve global_id via Pancake API first)
        if (window.Web2Chat && order.fbPageId && order.conversationId) {
            try {
                // Pre-fetch global_id via Pancake messages endpoint (same as native-orders)
                let globalUserId = order._fbGlobalUserId;
                if (!globalUserId) {
                    try {
                        const msgRes = await window.Web2Chat.fetchMessages(
                            order.fbPageId,
                            order.conversationId,
                            order.customerUuid || null
                        );
                        if (msgRes?.ok) {
                            const cust =
                                msgRes.customers?.find?.(
                                    (c) => c?.fb_id === order.fbUserId || c?.global_id
                                ) || msgRes.customers?.[0];
                            const gid =
                                cust?.global_id ||
                                msgRes.conversation?.page_customer?.global_id ||
                                null;
                            if (gid && String(gid) !== String(order.fbUserId)) {
                                globalUserId = String(gid);
                                order._fbGlobalUserId = globalUserId;
                            }
                        }
                    } catch (_) {
                        /* fall through */
                    }
                }

                // Try extension if available
                if (window.NativeOrdersApp?._extensionRequest || window._w2ExtensionRequest) {
                    const reqFn =
                        window.NativeOrdersApp?._extensionRequest || window._w2ExtensionRequest;
                    const r = await reqFn(
                        'REPLY_INBOX_PHOTO',
                        {
                            pageId: order.fbPageId,
                            globalUserId: globalUserId || order.fbUserId,
                            threadId: order.threadId || '',
                            convId: order.threadId
                                ? 't_' + order.threadId
                                : order.conversationId || '',
                            customerName: order.customerName || '',
                            message: text,
                            attachmentType: 'SEND_TEXT_ONLY',
                            platform: 'facebook',
                            isBusiness: true,
                        },
                        30000
                    );
                    if (r?.ok) return;
                    // else fall through to Pancake API fallback
                }
            } catch (_) {
                /* fall through */
            }
        }
        // ROUTE 2: Pancake API (subject to 24h policy)
        if (!window.Web2Chat) throw new Error('Không có kênh gửi');
        const convId = order.conversationId;
        if (!convId) throw new Error('Thiếu conversationId');
        const r = await window.Web2Chat.sendMessage(order.fbPageId, convId, {
            text,
            action: 'reply_inbox',
            customerId: order.customerUuid || null,
        });
        if (!r?.ok) {
            throw new Error(r?.reason || 'Pancake API fail');
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
    }

    window.Web2MsgTemplate = { open };

    // Inject CSS keyframe for spinner (Lucide loader doesn't auto-spin)
    if (!document.getElementById('w2tplSpinKeyframe')) {
        const s = document.createElement('style');
        s.id = 'w2tplSpinKeyframe';
        s.textContent = '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }
})();
