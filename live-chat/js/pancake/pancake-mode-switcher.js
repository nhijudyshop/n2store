// #Note: WEB2.0 module. Tab switcher Chat ↔ Kho SP cho cột Pancake.
// State lưu localStorage. Mặc định = Kho. Wrap content sau khi Pancake init xong.

(function (global) {
    'use strict';
    if (global.PancakeModeSwitcher) return;

    const LS_KEY = 'web2_pancake_active_tab';
    const DEFAULT_MODE = 'kho';

    function getMode() {
        try {
            return localStorage.getItem(LS_KEY) || DEFAULT_MODE;
        } catch {
            return DEFAULT_MODE;
        }
    }
    function setMode(m) {
        try {
            localStorage.setItem(LS_KEY, m);
        } catch {}
    }

    function _renderSwitcher() {
        const sw = document.createElement('div');
        sw.className = 'pk-mode-switch';
        sw.innerHTML = `
            <button data-mode="chat" type="button"><i data-lucide="messages-square"></i><span>Chat Pancake</span></button>
            <button data-mode="kho" type="button"><i data-lucide="package"></i><span>Kho SP</span></button>
        `;
        return sw;
    }

    function applyMode(mode) {
        const chat = document.getElementById('pkModeChat');
        const kho = document.getElementById('pkModeKho');
        if (!chat || !kho) return;
        chat.classList.toggle('active', mode === 'chat');
        kho.classList.toggle('active', mode === 'kho');
        document.querySelectorAll('.pk-mode-switch button').forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        setMode(mode);
        // Lazy init InventoryPanel khi switch sang Kho lần đầu
        if (mode === 'kho' && !kho.dataset.initted) {
            kho.dataset.initted = '1';
            if (global.PancakeInventoryPanel?.init) {
                global.PancakeInventoryPanel.init(kho);
            }
        }
    }

    function wrap() {
        const container = document.getElementById('pancakeContent');
        if (!container) return false;
        // Đã wrap & switcher CÒN NGUYÊN → ok. KHÔNG dùng dataset flag cố định vì
        // Pancake re-render (reconnect/live) ghi đè innerHTML → switcher (tab Kho SP)
        // bị xoá nhưng flag vẫn '1' → tab biến mất vĩnh viễn. Kiểm tra DOM thật.
        if (container.querySelector('.pk-mode-switch')) return true;
        // Chỉ wrap khi Pancake đã render shell xong
        const chatShell = container.querySelector('.pancake-chat-container');
        if (!chatShell) return false;

        // Mode switcher button row
        const switcher = _renderSwitcher();

        // Chat slot wraps existing pancake-chat-container
        const chatSlot = document.createElement('div');
        chatSlot.className = 'pk-mode-content';
        chatSlot.id = 'pkModeChat';

        // Kho slot is empty container — InventoryPanel.init() will fill on first switch
        const khoSlot = document.createElement('div');
        khoSlot.className = 'pk-mode-content';
        khoSlot.id = 'pkModeKho';

        // Detach chatShell + reattach inside chatSlot
        chatShell.parentNode.removeChild(chatShell);
        chatSlot.appendChild(chatShell);

        container.innerHTML = '';
        container.appendChild(switcher);
        container.appendChild(chatSlot);
        container.appendChild(khoSlot);

        // Wire switcher
        switcher.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => applyMode(btn.dataset.mode));
        });

        // Render lucide icons trong switcher (messages-square / package)
        if (global.lucide?.createIcons) {
            try {
                global.lucide.createIcons();
            } catch {}
        }

        // Apply default
        applyMode(getMode());
        return true;
    }

    // Poll until Pancake renders its shell, then wrap + GIỮ self-healing:
    // Pancake có thể re-render #pancakeContent (reconnect/live) xoá mất switcher →
    // MutationObserver phát hiện switcher biến mất rồi wrap lại (tab Kho SP về lại).
    let _observer = null;
    function _attachObserver() {
        if (_observer) return;
        const container = document.getElementById('pancakeContent');
        if (!container || typeof MutationObserver === 'undefined') return;
        let scheduled = false;
        _observer = new MutationObserver(() => {
            if (scheduled) return;
            // Switcher còn → bỏ qua. Mất (do re-render) → wrap lại.
            if (container.querySelector('.pk-mode-switch')) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                wrap();
            });
        });
        _observer.observe(container, { childList: true });
    }

    function init() {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            const ok = wrap();
            if (ok) _attachObserver();
            if (ok || attempts > 60) clearInterval(timer);
        }, 250);
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Đợi 1 giây để Pancake init xong shell, rồi mới poll-wrap
        setTimeout(init, 1000);
    });

    global.PancakeModeSwitcher = { init, applyMode, getMode };
})(typeof window !== 'undefined' ? window : globalThis);
