// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk Message Template Modal · UI
// =====================================================
//
// Phần giao diện tách từ web2-msg-template.js (MOVE-only): modal DOM, render
// danh sách template, edit modal (tạo/sửa/xoá). Tham chiếu state + utils qua
// window.W2MT; gọi send/cancel handler qua W2MT (định nghĩa ở module send).

(function () {
    'use strict';

    const W2MT = (window.W2MT = window.W2MT || {});
    const S = W2MT.state;

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
            if (S.isSending && S.activeJobId) {
                W2MT._cancelActiveJob();
            } else {
                _closeModal();
            }
        };
        document.getElementById('w2tplNew').onclick = () => _openEditModal(null);
        document.getElementById('w2tplSendBtn').onclick = W2MT._handleSend;
        document.getElementById('w2tplSearch').addEventListener('input', (e) => {
            const q = (e.target.value || '').toLowerCase().trim();
            S.filtered = q
                ? S.templates.filter(
                      (t) =>
                          (t.Name || '').toLowerCase().includes(q) ||
                          (t.Content || '').toLowerCase().includes(q)
                  )
                : [...S.templates];
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
        document.getElementById('w2tplCount').textContent = S.filtered.length;
        if (!S.filtered.length) {
            grid.innerHTML = `<div class="w2tpl-empty">Chưa có template nào. Bấm "Mẫu mới" để tạo.</div>`;
            return;
        }
        grid.innerHTML = S.filtered
            .map((t) => {
                const sel = t.id === S.selectedTemplateId ? ' selected' : '';
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
                S.selectedTemplateId = card.dataset.id;
                _renderCards();
                document.getElementById('w2tplSendBtn').disabled = false;
            });
        });
        grid.querySelectorAll('[data-edit-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.editId;
                const tpl = S.templates.find((t) => t.id === id);
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
            if (!(await window.Popup.danger(`Xoá template "${template.Name}"?`, { okText: 'Xoá' })))
                return;
            try {
                await W2MT._deleteTemplate(template.id);
                S.filtered = [...S.templates];
                _renderCards();
                m.classList.remove('active');
                W2MT._toast(`Đã xoá template "${template.Name}"`, 'success');
            } catch (e) {
                W2MT._toast('Xoá thất bại: ' + (e?.message || e), 'error');
            }
        };
        document.getElementById('w2tplEditSave').onclick = async () => {
            const name = document.getElementById('w2tplEditName').value.trim();
            const content = document.getElementById('w2tplEditContent').value.trim();
            if (!name || !content) {
                W2MT._toast('Vui lòng nhập tên và nội dung', 'warning');
                return;
            }
            try {
                await W2MT._saveTemplate({ id: template?.id, Name: name, Content: content });
                S.filtered = [...S.templates];
                _renderCards();
                m.classList.remove('active');
                W2MT._toast(`Đã lưu template "${name}"`, 'success');
            } catch (e) {
                W2MT._toast('Lưu thất bại: ' + (e?.message || e), 'error');
            }
        };
        m.classList.add('active');
        setTimeout(() => document.getElementById('w2tplEditName').focus(), 50);
    }

    W2MT._ensureModal = _ensureModal;
    W2MT._closeModal = _closeModal;
    W2MT._renderCards = _renderCards;
    W2MT._openEditModal = _openEditModal;
})();
