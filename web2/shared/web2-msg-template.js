// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk Message Template Modal · ENTRY
// =====================================================
//
// Entry mỏng: wire các module core/ui/send (tham chiếu qua window.W2MT), expose
// public API + boot reattach. SPLIT từ file 961 dòng (MOVE-only, không đổi hành vi).
// Load order BẮT BUỘC: core → ui → send → entry (file này, LAST).
//
//   web2-msg-template-core.js  → constants, state, utils, persistence, template CRUD
//   web2-msg-template-ui.js    → modal DOM, render, edit modal
//   web2-msg-template-send.js  → send loop, job watch, extension drain, pill
//   web2-msg-template.js       → entry (open + boot)
//
// Public API (window.Web2MsgTemplate):
//   Web2MsgTemplate.open({orders, onComplete})  → opens modal

(function () {
    'use strict';

    const W2MT = (window.W2MT = window.W2MT || {});
    const S = W2MT.state;

    // ─── Public API ───────────────────────────────────────────────
    async function open({ orders }) {
        W2MT._loadSent();
        W2MT._ensureModal();
        // Filter: must have conversationId + fbPageId + not already sent in 24h
        const valid = [];
        let skipped = 0;
        for (const o of orders || []) {
            if (!o.fbPageId || !o.conversationId) {
                skipped++;
                continue;
            }
            if (o.code && W2MT._isSent(o.code)) {
                skipped++;
                continue;
            }
            valid.push(o);
        }
        if (skipped > 0) {
            W2MT._toast(`Bỏ qua ${skipped} đơn (đã gửi trong 24h hoặc thiếu conversation)`, 'info');
        }
        if (!valid.length) {
            W2MT._toast('Không có đơn hợp lệ để gửi', 'warning');
            return;
        }
        S.modalOrders = valid;
        S.selectedTemplateId = null;
        document.getElementById('w2tplSendBtn').disabled = true;
        document.getElementById('w2tplProgress').classList.remove('show');
        document.getElementById('w2tplOrderCount').textContent = valid.length;
        document.getElementById('w2tplSearch').value = '';
        document.getElementById('w2MsgTplModal').classList.add('active');

        // Show loading
        const grid = document.getElementById('w2tplGrid');
        grid.innerHTML = `<div class="w2tpl-empty">Đang tải template...</div>`;
        document.getElementById('w2tplCount').textContent = '...';
        await W2MT._loadTemplates();
        S.filtered = [...S.templates];
        W2MT._renderCards();
        // Nếu đã có job đang chạy (vừa tạo / sau refresh) → bám lại progress.
        W2MT._maybeReattachActive();
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
            W2MT._maybeReattachActive();
        } catch (_) {
            /* ignore */
        }
    }, 2500);
})();
