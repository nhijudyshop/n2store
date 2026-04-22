// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone ↔ Orders bridge
// Hiển thị floating call bar, highlight row KH đang gọi, prompt outcome sau hangup, quick note field

const PhoneOrdersBridge = (() => {
    const FLOATING_BAR_ID = 'phoneCallBar';
    const STYLES_ID = 'phoneOrdersBridgeStyles';

    let currentCallPhone = '';
    let currentCallName = '';
    let currentOrderCode = '';
    let currentOrderId = '';
    let callStartTime = 0;
    let timerInterval = null;
    let noteTextarea = null;
    let lastCompletedCall = null; // for outcome marker
    let quickNoteSaved = false; // dedupe: only save order note once per call

    function _stripPhone(s) { return String(s || '').replace(/[^\d+]/g, ''); }
    function _fmtDur(sec) { const m = Math.floor(sec/60), s = sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

    // Resolve internal order.Id from phone via window.allOrders (populated by tab1-fast-sale-invoice-status)
    function _lookupOrderId(phone) {
        const d = _stripPhone(phone);
        if (!d || !Array.isArray(window.allOrders)) return '';
        const match = window.allOrders.find(o => _stripPhone(o.Telephone) === d);
        return match?.Id ? String(match.Id) : '';
    }

    // Save quick-note to order's Ghi chú column. Idempotent per call via quickNoteSaved flag.
    async function _saveQuickNoteToOrder(orderId, text) {
        if (!orderId || !text || quickNoteSaved) return;
        if (!window.OrderNotesStore?.add) {
            console.warn('[PhoneOrdersBridge] OrderNotesStore chưa sẵn sàng — note không lưu vào cột Ghi chú');
            return;
        }
        quickNoteSaved = true;
        try {
            const tagged = `📞 ${text}`.slice(0, 500); // prefix phone icon so CSKH note list phân biệt nguồn
            await window.OrderNotesStore.add(orderId, tagged);
            if (window.notificationManager?.show) {
                window.notificationManager.show('Đã lưu ghi chú cuộc gọi vào đơn', 'success', 2500);
            }
        } catch (err) {
            console.warn('[PhoneOrdersBridge] save quick note failed:', err.message);
            if (window.notificationManager?.show) {
                window.notificationManager.show('Không lưu được ghi chú cuộc gọi: ' + err.message, 'error', 4000);
            }
        }
    }

    function _injectStyles() {
        if (document.getElementById(STYLES_ID)) return;
        const style = document.createElement('style');
        style.id = STYLES_ID;
        style.textContent = `
        #phoneCallBar {
            position: fixed; top: 0; left: 0; right: 0; z-index: 100001;
            background: linear-gradient(135deg, #15803d, #22c55e);
            color: #fff; padding: 10px 18px; box-shadow: 0 4px 14px rgba(0,0,0,.25);
            display: flex; align-items: center; gap: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            animation: pcb-slidedown .25s cubic-bezier(.4,0,.2,1);
        }
        @keyframes pcb-slidedown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        #phoneCallBar.ringing { background: linear-gradient(135deg, #d97706, #f59e0b); animation: pcb-slidedown .25s cubic-bezier(.4,0,.2,1), pcb-pulse 1.5s infinite; }
        @keyframes pcb-pulse { 0%,100% { box-shadow: 0 4px 14px rgba(0,0,0,.25); } 50% { box-shadow: 0 4px 24px rgba(245,158,11,.6); } }
        #phoneCallBar .pcb-icon { font-size: 20px; animation: pcb-phone-ring 1.2s infinite; }
        @keyframes pcb-phone-ring { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-15deg); } 75% { transform: rotate(15deg); } }
        #phoneCallBar .pcb-info { display: flex; flex-direction: column; line-height: 1.3; }
        #phoneCallBar .pcb-name { font-size: 14px; font-weight: 700; }
        #phoneCallBar .pcb-meta { font-size: 11px; opacity: .9; }
        #phoneCallBar .pcb-timer { font-family: 'SF Mono', monospace; font-size: 16px; font-weight: 600; padding: 4px 10px; background: rgba(0,0,0,.2); border-radius: 6px; }
        #phoneCallBar .pcb-note {
            flex: 1; background: rgba(0,0,0,.18); color: #fff; border: 1px solid rgba(255,255,255,.2);
            padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none; font-family: inherit; resize: none; height: 28px; max-height: 28px;
            transition: height .2s;
        }
        #phoneCallBar .pcb-note::placeholder { color: rgba(255,255,255,.6); }
        #phoneCallBar .pcb-note:focus { height: 56px; max-height: 56px; background: rgba(0,0,0,.3); }
        #phoneCallBar .pcb-btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 36px; height: 36px; border-radius: 50%; border: none;
            cursor: pointer; font-size: 15px; transition: transform .15s; color: #fff;
            pointer-events: auto; user-select: none; flex-shrink: 0;
        }
        #phoneCallBar .pcb-btn:hover { transform: scale(1.1); }
        #phoneCallBar .pcb-btn:active { transform: scale(.95); }
        #phoneCallBar .pcb-btn * { pointer-events: none; }
        #phoneCallBar .pcb-btn.mute { background: rgba(0,0,0,.25); }
        #phoneCallBar .pcb-btn.mute.active { background: #dc2626; }
        #phoneCallBar .pcb-btn.hangup { background: #dc2626; }
        #phoneCallBar .pcb-btn.open-widget { background: rgba(0,0,0,.25); font-size: 13px; }
        #phoneCallBar .pcb-order-link { color: #fff; text-decoration: underline; font-size: 11px; opacity: .9; }
        #phoneCallBar .pcb-order-link:hover { opacity: 1; }

        /* Highlight row KH đang gọi */
        tr.phone-active-row {
            box-shadow: inset 0 0 0 2px #22c55e !important;
            background: rgba(34,197,94,.07) !important;
            animation: pcb-row-pulse 2s infinite;
        }
        @keyframes pcb-row-pulse { 0%,100% { box-shadow: inset 0 0 0 2px #22c55e; } 50% { box-shadow: inset 0 0 0 2px #22c55e, 0 0 14px rgba(34,197,94,.3); } }

        /* Outcome prompt */
        #phoneOutcomePrompt {
            position: fixed; bottom: 90px; right: 20px; z-index: 99996;
            background: #fff; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.05);
            padding: 14px; width: 280px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            animation: pcb-slidedown .2s; border-top: 3px solid #22c55e;
        }
        #phoneOutcomePrompt .pop-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
        #phoneOutcomePrompt .pop-sub { font-size: 11px; color: #64748b; margin-bottom: 10px; }
        #phoneOutcomePrompt .pop-opts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px; }
        #phoneOutcomePrompt .pop-opt {
            padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px;
            cursor: pointer; background: #f8fafc; color: #0f172a; font-weight: 600; transition: all .12s;
        }
        #phoneOutcomePrompt .pop-opt:hover { background: #eef2ff; border-color: #4f46e5; color: #4f46e5; }
        #phoneOutcomePrompt .pop-opt.success { border-color: #22c55e; color: #15803d; }
        #phoneOutcomePrompt .pop-opt.voicemail { border-color: #f59e0b; color: #b45309; }
        #phoneOutcomePrompt .pop-opt.no-answer { border-color: #64748b; }
        #phoneOutcomePrompt .pop-opt.busy { border-color: #ef4444; color: #b91c1c; }
        #phoneOutcomePrompt .pop-note { width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; margin-bottom: 8px; font-family: inherit; }
        #phoneOutcomePrompt .pop-close { position: absolute; top: 6px; right: 8px; background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; line-height: 1; }
        #phoneOutcomePrompt .pop-close:hover { color: #0f172a; }
        `;
        document.head.appendChild(style);
    }

    function _onBarClick(e) {
        const actionEl = e.target.closest('[data-pcb-action]');
        if (!actionEl) return;
        e.preventDefault();
        e.stopPropagation();
        const action = actionEl.dataset.pcbAction;
        if (action === 'mute') toggleMute();
        else if (action === 'hangup') hangup();
        else if (action === 'open-widget') openWidget();
        else if (action === 'scroll-order') {
            const code = actionEl.dataset.orderCode;
            if (code) scrollToOrder(code);
        }
    }

    function _showBar(state, phone, name, orderCode) {
        _injectStyles();
        document.body.classList.add('phone-call-active');
        let bar = document.getElementById(FLOATING_BAR_ID);
        const displayName = name || phone || 'Đang gọi';
        const orderLink = orderCode ? `<a href="#" class="pcb-order-link" data-pcb-action="scroll-order" data-order-code="${_esc(orderCode)}">Đơn ${_esc(orderCode)}</a>` : '';

        const html = `
            <span class="pcb-icon">📞</span>
            <div class="pcb-info">
                <span class="pcb-name">${_esc(displayName)}</span>
                <span class="pcb-meta">${_esc(phone)} ${orderLink}</span>
            </div>
            <span class="pcb-timer" id="pcbTimer">00:00</span>
            <textarea class="pcb-note" id="pcbNote" placeholder="📝 Ghi chú nhanh cho cuộc gọi này..." rows="1"></textarea>
            <button type="button" class="pcb-btn mute" id="pcbMute" data-pcb-action="mute" title="Tắt tiếng (Space)">🔇</button>
            <button type="button" class="pcb-btn hangup" data-pcb-action="hangup" title="Cúp máy (Esc)">✕</button>
            <button type="button" class="pcb-btn open-widget" data-pcb-action="open-widget" title="Mở widget">⚙</button>
        `;
        if (!bar) {
            bar = document.createElement('div');
            bar.id = FLOATING_BAR_ID;
            document.body.appendChild(bar);
            // Event delegation — bind once, survives innerHTML rebuilds
            bar.addEventListener('click', _onBarClick);
        }
        bar.className = state === 'ringing' ? 'ringing' : '';
        bar.innerHTML = html;

        // Adjust main content padding
        if (!document.getElementById('pcbBodyOffset')) {
            const s = document.createElement('style'); s.id = 'pcbBodyOffset';
            s.textContent = 'body.phone-call-active { padding-top: 56px; } body.phone-call-active .sidebar { top: 56px; }';
            document.head.appendChild(s);
        }
        noteTextarea = document.getElementById('pcbNote');
    }

    function _hideBar() {
        const el = document.getElementById(FLOATING_BAR_ID);
        if (el) el.remove();
        document.body.classList.remove('phone-call-active');
        document.getElementById('pcbBodyOffset')?.remove();
        _stopTimer();
    }

    function _startTimer() {
        callStartTime = Date.now();
        _stopTimer();
        timerInterval = setInterval(() => {
            const el = document.getElementById('pcbTimer'); if (!el) return;
            el.textContent = _fmtDur(Math.floor((Date.now() - callStartTime) / 1000));
        }, 1000);
    }
    function _stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

    function _highlightRow(phone) {
        _clearRowHighlight();
        if (!phone) return;
        const d = _stripPhone(phone);
        // Find matching row by phone column
        const rows = document.querySelectorAll('#ordersTable tr, .orders-table tr, tr[data-phone]');
        for (const tr of rows) {
            const telData = tr.getAttribute('data-phone') || '';
            const cell = tr.querySelector('td[data-column="phone"]');
            const txt = cell ? cell.textContent : '';
            if (_stripPhone(telData).includes(d) || _stripPhone(txt).includes(d)) {
                tr.classList.add('phone-active-row');
                // Scroll into view (smooth, centered)
                try { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
                break;
            }
        }
    }
    function _clearRowHighlight() {
        document.querySelectorAll('tr.phone-active-row').forEach(tr => tr.classList.remove('phone-active-row'));
    }

    function scrollToOrder(orderCode) {
        const el = document.querySelector(`tr[data-order-code="${orderCode}"], [data-code="${orderCode}"]`);
        if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('phone-active-row'); setTimeout(() => el.classList.remove('phone-active-row'), 2000); } catch {} }
    }

    function _showOutcomePrompt(phone, name, duration) {
        if (!phone) return;
        const existing = document.getElementById('phoneOutcomePrompt'); if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.id = 'phoneOutcomePrompt';
        wrap.innerHTML = `
            <button class="pop-close" onclick="PhoneOrdersBridge.dismissOutcome()">×</button>
            <div class="pop-title">Kết quả cuộc gọi</div>
            <div class="pop-sub">${_esc(name || phone)} • ${_fmtDur(duration)}</div>
            <div class="pop-opts">
                <button class="pop-opt success" onclick="PhoneOrdersBridge.setOutcome('success')">✓ Thành công</button>
                <button class="pop-opt voicemail" onclick="PhoneOrdersBridge.setOutcome('voicemail')">📨 Hộp thoại</button>
                <button class="pop-opt no-answer" onclick="PhoneOrdersBridge.setOutcome('no-answer')">📵 Không bắt máy</button>
                <button class="pop-opt busy" onclick="PhoneOrdersBridge.setOutcome('busy')">🚫 Máy bận</button>
            </div>
            <input type="text" class="pop-note" id="popNote" placeholder="Ghi chú thêm (tuỳ chọn)">
        `;
        document.body.appendChild(wrap);
        lastCompletedCall = { phone: _stripPhone(phone), name, duration, timestamp: Date.now() };
        // Auto-dismiss sau 30s
        setTimeout(() => { if (document.getElementById('phoneOutcomePrompt')) dismissOutcome(); }, 30000);
    }

    async function setOutcome(outcome) {
        if (!lastCompletedCall) return;
        const note = document.getElementById('popNote')?.value || '';
        try {
            await window.PhoneCloudSync?.updateLastCallOutcome?.(lastCompletedCall.phone, { outcome, note });
        } catch {}
        dismissOutcome();
        // Visual feedback
        if (window.notificationManager?.show) window.notificationManager.show('Đã lưu kết quả cuộc gọi', 'success', 2500);
    }
    function dismissOutcome() { document.getElementById('phoneOutcomePrompt')?.remove(); lastCompletedCall = null; }

    function toggleMute() {
        if (window.PhoneWidget?.toggleMute) window.PhoneWidget.toggleMute();
        const btn = document.getElementById('pcbMute'); if (btn) btn.classList.toggle('active');
    }
    function hangup() {
        // Grab note before hangup
        const note = noteTextarea?.value?.trim() || '';
        if (note && currentCallPhone) {
            // save as pre-hangup note on CDR
            try { window.PhoneCloudSync?.updateLastCallOutcome?.(_stripPhone(currentCallPhone), { note }); } catch {}
            // save to order's Ghi chú column (idempotent — observer won't re-save)
            if (currentOrderId) _saveQuickNoteToOrder(currentOrderId, note);
        }
        if (window.PhoneWidget?.hangup) window.PhoneWidget.hangup();
    }
    function openWidget() { if (window.PhoneWidget?.show) window.PhoneWidget.show(); }

    function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

    // === HOOK PHONEWIDGET EVENTS ===
    // PhoneWidget doesn't expose events — we poll its state via status observer.
    // Instead: patch PhoneWidget.makeCall to capture + observe DOM status.
    function _installObservers() {
        // Observer 1: watch pwStatusText changes
        const statusEl = () => document.getElementById('pwStatusText');
        let lastStatus = '';
        let lastState = '';
        setInterval(() => {
            const el = statusEl(); if (!el) return;
            const txt = el.textContent || '';
            if (txt === lastStatus) return;
            lastStatus = txt;

            const caller = document.getElementById('pwCaller');
            const timerEl = document.getElementById('pwTimer');
            const isInCall = caller?.classList.contains('active');
            const isRinging = caller?.classList.contains('ringing');

            if (isInCall || isRinging) {
                const phone = document.getElementById('pwDialInput')?.value || '';
                const name = document.getElementById('pwName')?.textContent || '';
                const subText = document.getElementById('pwSub')?.textContent || '';
                const orderCode = (subText.match(/\u0110\u01a1n\s+(\S+)/) || [])[1] || '';
                const cleanPhone = _stripPhone(phone);

                if (cleanPhone !== _stripPhone(currentCallPhone)) {
                    currentCallPhone = phone;
                    currentCallName = name;
                    currentOrderCode = orderCode;
                    currentOrderId = _lookupOrderId(cleanPhone);
                    quickNoteSaved = false; // reset per new call
                    _highlightRow(cleanPhone);
                }
                const state = isInCall ? 'in-call' : 'ringing';
                if (state !== lastState) {
                    _showBar(state, cleanPhone, name, orderCode);
                    if (state === 'in-call' && !timerInterval) _startTimer();
                    lastState = state;
                }
            } else {
                if (lastState && lastState !== 'ended') {
                    // Call ended — grab note BEFORE hiding bar so DOM still has value
                    const noteText = document.getElementById('pcbNote')?.value?.trim() || '';
                    const phone = currentCallPhone;
                    const name = currentCallName;
                    const orderId = currentOrderId;
                    const duration = timerInterval ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
                    _hideBar();
                    _clearRowHighlight();
                    // Save quick note to order's Ghi chú column (fire-and-forget)
                    if (noteText && orderId) _saveQuickNoteToOrder(orderId, noteText);
                    if (phone && duration > 0) _showOutcomePrompt(phone, name, duration);
                    currentCallPhone = ''; currentCallName = ''; currentOrderCode = ''; currentOrderId = '';
                    lastState = 'ended';
                }
            }
        }, 500);
    }

    function init() {
        if (typeof window === 'undefined') return;
        _installObservers();
    }

    // Auto-init
    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else setTimeout(init, 1000);
    }

    return { init, toggleMute, hangup, openWidget, scrollToOrder, setOutcome, dismissOutcome };
})();

if (typeof window !== 'undefined') window.PhoneOrdersBridge = PhoneOrdersBridge;
