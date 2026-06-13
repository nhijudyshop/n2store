// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat emoji picker (client-only).
// =====================================================================
// WZChat.openEmojiPicker(anchorEl, onPick) — popover chọn emoji + tìm + recents.
// Pure client (Unicode emoji), không gọi backend.
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const LS_KEY = 'wz_emoji_recents';

    const CATS = {
        'Cảm xúc':
            '😀 😁 😂 🤣 😊 😍 😘 😗 😙 🥰 😋 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 😦 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕'.split(
                ' '
            ),
        'Cử chỉ':
            '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💪 🦾 👏 🙌 👐 🤲 🤜 🤛 ✊ 👊 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝'.split(
                ' '
            ),
        'Đồ vật':
            '🎉 🎊 🎁 🎈 🛍️ 💰 💵 💴 💶 💷 💳 🧾 📦 ✅ ❌ ⭐ 🌟 ✨ 🔥 💯 ⚡ 💥 🎯 🏆 🥇 👑 💎 🔔 📣 📢 ☎️ 📱 💬 ⏰ 📅 📌 📍 ✏️ 📝 🚚 ✈️ 🚀'.split(
                ' '
            ),
        Khác: '👗 👚 👕 👖 👔 🧥 👙 👠 👡 👢 👜 👛 🎀 🕶️ 👓 💄 💍 🌸 🌺 🌷 🌹 🌻 🍀 🌈 ☀️ ⛅ 🌙 ☕ 🍵 🍰 🎂 🍓 🍎 🍊 🍇 🥗 🍜 🍱'.split(
            ' '
        ),
    };

    function recents() {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        } catch {
            return [];
        }
    }
    function pushRecent(e) {
        try {
            const r = [e, ...recents().filter((x) => x !== e)].slice(0, 24);
            localStorage.setItem(LS_KEY, JSON.stringify(r));
        } catch {}
    }

    let _pop = null;
    function close() {
        if (_pop) {
            _pop.remove();
            _pop = null;
            document.removeEventListener('click', onDoc, true);
        }
    }
    function onDoc(e) {
        if (_pop && !_pop.contains(e.target) && !e.target.closest('[data-wz-emoji-btn]')) close();
    }

    function gridHtml(list) {
        return list
            .map((e) => `<button class="wz-emoji" type="button" tabindex="-1">${e}</button>`)
            .join('');
    }

    WZ.openEmojiPicker = function (anchorEl, onPick) {
        close();
        _pop = document.createElement('div');
        _pop.className = 'wz-pop wz-emoji-pop';
        _pop.setAttribute('role', 'dialog');
        _pop.setAttribute('aria-label', 'Chọn emoji');
        const rec = recents();
        // Không có search box (không có emoji→keyword map → search rỗng gây bug);
        // recents + categories đủ dùng, scroll nhanh.
        _pop.innerHTML = `
            <div class="wz-emoji-scroll">
                ${rec.length ? `<div class="wz-emoji-cat">Gần đây</div><div class="wz-emoji-grid">${gridHtml(rec)}</div>` : ''}
                ${Object.entries(CATS)
                    .map(
                        ([name, list]) =>
                            `<div class="wz-emoji-cat">${name}</div><div class="wz-emoji-grid">${gridHtml(list)}</div>`
                    )
                    .join('')}
            </div>`;
        document.body.appendChild(_pop);
        _position(_pop, anchorEl);

        _pop.addEventListener('click', (e) => {
            const b = e.target.closest('.wz-emoji');
            if (b) {
                pushRecent(b.textContent);
                onPick?.(b.textContent);
            }
        });
        setTimeout(() => document.addEventListener('click', onDoc, true), 0);
    };
    WZ.closeEmojiPicker = close;

    // popover định vị phía trên anchor, canh trong viewport
    function _position(pop, anchor) {
        const r = anchor.getBoundingClientRect();
        pop.style.position = 'fixed';
        pop.style.bottom = `${Math.max(8, window.innerHeight - r.top + 8)}px`;
        pop.style.left = `${Math.min(r.left, window.innerWidth - 320)}px`;
        pop.style.zIndex = 1200;
    }
    WZ._popPosition = _position;
})();
