// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat reaction bar (add-only).
// =====================================================================
// WZChat.openReactionBar(anchorEl, onReact) — thanh 6 cảm xúc nhanh nổi trên tin.
// onReact(reactionKey) với key = enum zca (HEART/LIKE/HAHA/WOW/CRY/ANGRY).
// ⚠ zca-js KHÔNG hỗ trợ gỡ reaction → chỉ thêm (add-only).
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});

    let _bar = null;
    function close() {
        if (_bar) {
            _bar.remove();
            _bar = null;
            document.removeEventListener('click', onDoc, true);
            document.removeEventListener('keydown', onKey, true);
        }
    }
    function onDoc(e) {
        if (_bar && !_bar.contains(e.target) && !e.target.closest('[data-wz-react-btn]')) close();
    }
    function onKey(e) {
        if (e.key === 'Escape') close();
    }

    WZ.openReactionBar = function (anchorEl, onReact) {
        close();
        _bar = document.createElement('div');
        _bar.className = 'wz-react-bar';
        _bar.setAttribute('role', 'menu');
        _bar.setAttribute('aria-label', 'Thả cảm xúc');
        _bar.innerHTML = WZ.REACTIONS.map(
            (r) =>
                `<button class="wz-react-opt" type="button" role="menuitem" data-key="${r.key}" title="${r.label}" aria-label="${r.label}">${r.emoji}</button>`
        ).join('');
        document.body.appendChild(_bar);

        const rect = anchorEl.getBoundingClientRect();
        _bar.style.position = 'fixed';
        const top = rect.top - 46;
        _bar.style.top = `${top < 8 ? rect.bottom + 6 : top}px`;
        _bar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
        _bar.style.zIndex = 1250;

        _bar.addEventListener('click', (e) => {
            const b = e.target.closest('.wz-react-opt');
            if (b) {
                onReact?.(b.dataset.key);
                close();
            }
        });
        setTimeout(() => {
            document.addEventListener('click', onDoc, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
        _bar.querySelector('.wz-react-opt')?.focus();
    };
    WZ.closeReactionBar = close;

    // emoji ⇄ key (cho render chip + map enum)
    WZ.reactionEmoji = (key) => (WZ.REACTIONS.find((r) => r.key === key) || {}).emoji || key;
})();
