// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// J&T Tracking — modals: custom confirm, paste-history modal, chat launcher (Web2CustomerChat),
// find-message-in-chat (cuộn tới tin chứa mã trong nhóm Zalo).
(function () {
    'use strict';

    const { $, esc, notify, icons } = window.JtTrackingConst;
    const { api } = window.JtTrackingApi;
    const S = window.JtTrackingState;

    // Custom confirm (thay window.confirm) → Promise<bool>.
    function jtConfirm(message, okLabel, kind) {
        return new Promise((resolve) => {
            const mount = $('jtModalMount');
            mount.innerHTML = `<div class="jt-msg-back" id="jtCfBack">
                <div class="jt-msg-modal" style="width:min(380px,100%)" role="dialog" aria-modal="true">
                    <div class="jt-msg-head"><span><i data-lucide="alert-triangle"></i> Xác nhận</span></div>
                    <div class="jt-msg-who" style="white-space:pre-line;line-height:1.5">${esc(message)}</div>
                    <div class="jt-msg-foot">
                        <button class="jt-btn jt-btn-ghost" id="jtCfNo" type="button">Hủy</button>
                        <button class="jt-btn ${kind === 'danger' ? 'jt-btn-danger' : 'jt-btn-primary'}" id="jtCfYes" type="button">${esc(okLabel || 'OK')}</button>
                    </div>
                </div></div>`;
            icons();
            requestAnimationFrame(() => $('jtCfBack')?.classList.add('show'));
            const done = (v) => {
                const b = $('jtCfBack');
                if (b) {
                    b.classList.remove('show');
                    setTimeout(() => (mount.innerHTML = ''), 180);
                }
                resolve(v);
            };
            $('jtCfYes').onclick = () => done(true);
            $('jtCfNo').onclick = () => done(false);
            $('jtCfBack').onclick = (e) => {
                if (e.target.id === 'jtCfBack') done(false);
            };
        });
    }

    // Sau khi chat mount: tìm tin nhắn chứa mã → cuộn tới + nháy sáng. Nếu chưa thấy,
    // bấm "Tải tin cũ hơn" vài lần (mã đơn thường cũ hơn 100 tin gần nhất).
    function findMessageInChat(code) {
        if (!code) return;
        let tries = 0;
        let olderClicks = 0;
        const timer = setInterval(() => {
            tries++;
            const body = document.querySelector(
                '.w2cc-pane[data-w2cc-pane="zalo"] .wz-chat-body, #jtChatBody .wz-chat-body'
            );
            const msgs = body ? body.querySelectorAll('.wz-msg') : [];
            const target = [...msgs].reverse().find((m) => (m.textContent || '').includes(code));
            if (target) {
                body.querySelectorAll('.jt-msg-hit').forEach((el) =>
                    el.classList.remove('jt-msg-hit')
                );
                target.classList.add('jt-msg-hit'); // giữ highlight (không tự tắt) tới khi mở mã khác
                clearInterval(timer);
                // Cuộn TỨC THÌ (không 'smooth') + RE-ASSERT ~1.4s: ảnh/avatar phía trên load
                // lazy làm layout dịch → 1 lần scroll dễ trượt (tin nằm dưới khung, user
                // tưởng không highlight). Lặp lại để bám đúng tin tới khi layout ổn định.
                let re = 0;
                const bring = () => {
                    try {
                        target.scrollIntoView({ block: 'center', behavior: 'auto' });
                    } catch (e) {
                        /* phần tử có thể bị remount — bỏ qua */
                    }
                };
                bring();
                const reTimer = setInterval(() => {
                    bring();
                    if (++re >= 7) clearInterval(reTimer);
                }, 200);
                return;
            }
            // chưa thấy → tải tin cũ hơn (tối đa 8 lần) nếu nhóm còn lưu tin cũ
            const older = body && body.querySelector('#wzcvOlder');
            if (older && olderClicks < 8) {
                older.click();
                olderClicks++;
                return;
            }
            // Không còn tin cũ để tải (đã hết) mà vẫn chưa thấy → tin gốc KHÔNG nằm trong
            // nhóm đã lưu (vd mã 'dán lịch sử' — tin chưa qua hệ thống lưu). Báo rõ.
            if (!older && body && tries > 4) {
                clearInterval(timer);
                notify(
                    `Mã ${code} không có tin trong nhóm Zalo đã lưu (mã dán tay / tin cũ chưa lưu) — nhóm đã mở để bạn xem.`,
                    'info'
                );
                return;
            }
            if (tries > 40) {
                clearInterval(timer);
                notify('Không tìm thấy tin có mã trong nhóm Zalo.', 'info');
            }
        }, 250);
    }

    // ── Chat nhóm Zalo nguồn của mã — dùng chung Web2CustomerChat (Zalo-only,
    //    mở theo conversationId). Drawer cũ jt riêng đã bỏ → 1 nguồn.
    function openChat(convId, billcode) {
        if (window.Web2CustomerChat?.open) {
            window.Web2CustomerChat.open({
                conversationId: convId,
                channel: 'zalo',
                pancakeEnabled: false, // chỉ Zalo
                name: 'Nhóm Zalo nguồn',
                onReady: () => {
                    if (billcode) findMessageInChat(billcode); // cuộn tới tin có mã vận đơn
                },
            });
            return;
        }
        // Fallback (rất hiếm — Web2CustomerChat chưa load): engine Zalo trực tiếp.
        if (!window.Web2Zalo?.mountChat) {
            notify('Engine chat chưa sẵn sàng', 'warning');
            return;
        }
        window.Web2Zalo.mountChat(document.body.appendChild(document.createElement('div')), {
            convId,
            autoSeen: true,
        });
    }

    // Bấm SĐT → mở FULL chat khách (Pancake + Zalo) qua launcher dùng chung Web2CustomerChat.
    function openMsgModal(phone, name) {
        if (!phone) return;
        if (window.Web2CustomerChat?.open) window.Web2CustomerChat.open({ phone, name });
        else notify('Khung chat chưa sẵn sàng', 'warning');
    }

    // Dán text copy từ Zalo (Web/PC) → quét mã đơn cũ (bù lịch sử Zalo API không trả).
    function openPasteModal() {
        const script = (document.getElementById('jtZaloScript')?.textContent || '').trim();
        const mount = $('jtModalMount');
        mount.innerHTML = `<div class="jt-msg-back" id="jtPasteBack">
            <div class="jt-msg-modal jt-paste-modal" role="dialog" aria-modal="true" aria-label="Lấy lịch sử Zalo">
                <div class="jt-msg-head">
                    <span><i data-lucide="clipboard-paste"></i> Lấy lịch sử từ Zalo Web</span>
                    <button class="jt-msg-x" id="jtPasteClose" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <ol class="jt-paste-steps">
                    <li>Mở <b>chat.zalo.me</b> → vào nhóm J&amp;T → cuộn lên cho tin cũ hiện ra.</li>
                    <li>Nhấn <b>F12</b> → tab <b>Console</b>.</li>
                    <li>Bấm <b>Copy script</b> → dán vào Console → Enter. Một <b>ô xanh hiện góc phải</b> màn hình Zalo (tự cuộn ~30–45s). Bỏ qua dòng "Promise pending" của Console.</li>
                    <li>Khi ô báo <b>"XONG - N ma"</b>: kết quả đã bôi đen + copy sẵn. Quay lại đây, dán (<b>Ctrl+V</b>) vào ô dưới → <b>Quét mã</b>.</li>
                </ol>
                <div class="jt-paste-script">
                    <div class="jt-paste-script-head">
                        <span><i data-lucide="terminal"></i> Script (chạy trong Console Zalo Web)</span>
                        <button class="jt-btn jt-btn-ghost jt-btn-sm" id="jtCopyScript" type="button"><i data-lucide="copy"></i> Copy script</button>
                    </div>
                    <textarea id="jtScriptBox" class="jt-paste-code" rows="5" readonly spellcheck="false">${esc(script)}</textarea>
                </div>
                <label class="jt-paste-label" for="jtPasteText">Kết quả script (dán vào đây — hoặc dán text copy tay từ Zalo):</label>
                <textarea id="jtPasteText" class="jt-msg-text" rows="6" placeholder="Dán kết quả script / nội dung chat từ Zalo vào đây…"></textarea>
                <div class="jt-msg-foot">
                    <button class="jt-btn jt-btn-ghost" id="jtPasteCancel" type="button">Hủy</button>
                    <button class="jt-btn jt-btn-primary" id="jtPasteSubmit" type="button"><i data-lucide="search"></i> Quét mã</button>
                </div>
            </div>
        </div>`;
        icons();
        requestAnimationFrame(() => $('jtPasteBack')?.classList.add('show'));
        const close = () => {
            const b = $('jtPasteBack');
            if (b) {
                b.classList.remove('show');
                setTimeout(() => (mount.innerHTML = ''), 200);
            }
        };
        $('jtPasteClose').onclick = close;
        $('jtPasteCancel').onclick = close;
        $('jtPasteBack').onclick = (e) => {
            if (e.target.id === 'jtPasteBack') close();
        };
        $('jtCopyScript').onclick = async () => {
            try {
                await navigator.clipboard.writeText(script);
            } catch {
                const t = $('jtScriptBox');
                t.focus();
                t.select();
                document.execCommand('copy');
            }
            notify('Đã copy script — dán vào Console Zalo Web', 'success');
        };
        setTimeout(() => $('jtPasteText')?.focus(), 60);
        $('jtPasteSubmit').onclick = async () => {
            const text = $('jtPasteText').value.trim();
            if (!text) {
                notify('Chưa có nội dung dán', 'warning');
                return;
            }
            const btn = $('jtPasteSubmit');
            window.JtTrackingActions.setBusy(btn, true, ' Đang quét…');
            try {
                const j = await api('/scan-text', {
                    method: 'POST',
                    body: { text, convId: S.getGroupConvId() || undefined },
                });
                const msgPart = j.messagesAdded ? ` · nạp ${j.messagesAdded} tin vào chat` : '';
                notify(
                    `Tìm ${j.found} mã · thêm mới ${j.added}${msgPart}`,
                    j.added || j.messagesAdded ? 'success' : 'info'
                );
                close();
                await window.JtTrackingApp.load();
                if (j.added) window.JtTrackingActions.refreshAll();
            } catch (e) {
                notify('✗ ' + e.message, 'error');
            } finally {
                window.JtTrackingActions.setBusy(btn, false);
            }
        };
    }

    window.JtTrackingModals = {
        jtConfirm,
        findMessageInChat,
        openChat,
        openMsgModal,
        openPasteModal,
    };
})();
