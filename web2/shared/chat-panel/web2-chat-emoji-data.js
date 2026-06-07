// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).
// =====================================================================
// Web2ChatEmoji — bộ emoji theo nhóm + "recent" lưu localStorage. Dùng chung
// cho component chat hợp nhất (Web2ChatPanel). Không phụ thuộc DOM/page nào.
//   Web2ChatEmoji.categories  → [{ key, icon, label }]
//   Web2ChatEmoji.get(key)    → [emoji,...]  (recent đọc từ localStorage)
//   Web2ChatEmoji.pushRecent(emoji)          (cập nhật recent, trả mảng mới)
// =====================================================================
(function (global) {
    const LS_KEY = 'web2_chat_recent_emojis';
    const DEFAULT_RECENT = ['😊', '👍', '❤️', '😂', '🙏', '😍', '🔥', '✨'];

    const DATA = {
        smileys: [
            '😀',
            '😃',
            '😄',
            '😁',
            '😆',
            '😅',
            '🤣',
            '😂',
            '🙂',
            '😊',
            '😇',
            '🥰',
            '😍',
            '🤩',
            '😘',
            '😗',
            '😚',
            '😙',
            '🥲',
            '😋',
            '😛',
            '😜',
            '🤪',
            '😝',
            '🤑',
            '🤗',
            '🤭',
            '🤫',
            '🤔',
            '😐',
            '😴',
            '😷',
            '🥳',
            '😎',
            '🤓',
        ],
        gestures: [
            '👋',
            '🤚',
            '🖐️',
            '✋',
            '🖖',
            '👌',
            '🤌',
            '🤏',
            '✌️',
            '🤞',
            '🤟',
            '🤘',
            '🤙',
            '👈',
            '👉',
            '👆',
            '👇',
            '☝️',
            '👍',
            '👎',
            '✊',
            '👊',
            '🤛',
            '🤜',
            '👏',
            '🙌',
            '🤝',
            '🙏',
            '💪',
        ],
        hearts: [
            '❤️',
            '🧡',
            '💛',
            '💚',
            '💙',
            '💜',
            '🖤',
            '🤍',
            '🤎',
            '💔',
            '❣️',
            '💕',
            '💞',
            '💓',
            '💗',
            '💖',
            '💘',
            '💝',
            '💟',
        ],
        animals: [
            '🐶',
            '🐱',
            '🐭',
            '🐹',
            '🐰',
            '🦊',
            '🐻',
            '🐼',
            '🐨',
            '🐯',
            '🦁',
            '🐮',
            '🐷',
            '🐸',
            '🐵',
            '🐔',
            '🐧',
            '🦄',
            '🐝',
            '🦋',
        ],
        food: [
            '🍎',
            '🍐',
            '🍊',
            '🍋',
            '🍌',
            '🍉',
            '🍇',
            '🍓',
            '🍒',
            '🍑',
            '🥭',
            '🍍',
            '🥥',
            '🍅',
            '🍔',
            '🍟',
            '🍕',
            '🍰',
            '🍦',
            '☕',
            '🍵',
            '🧋',
        ],
        objects: [
            '💡',
            '📱',
            '💻',
            '⌨️',
            '🔑',
            '⚙️',
            '🔧',
            '🔨',
            '💎',
            '📷',
            '📺',
            '🎙️',
            '🎁',
            '💰',
            '🛍️',
            '📦',
            '✅',
            '❌',
            '⭐',
            '🎉',
        ],
    };

    const CATEGORIES = [
        { key: 'recent', icon: '🕐', label: 'Gần đây' },
        { key: 'smileys', icon: '😊', label: 'Mặt cười' },
        { key: 'gestures', icon: '👋', label: 'Cử chỉ' },
        { key: 'hearts', icon: '❤️', label: 'Trái tim' },
        { key: 'animals', icon: '🐱', label: 'Động vật' },
        { key: 'food', icon: '🍔', label: 'Đồ ăn' },
        { key: 'objects', icon: '💡', label: 'Đồ vật' },
    ];

    function readRecent() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (Array.isArray(raw) && raw.length) return raw.slice(0, 24);
        } catch (_) {}
        return DEFAULT_RECENT.slice();
    }

    const Web2ChatEmoji = {
        categories: CATEGORIES,
        get(key) {
            if (key === 'recent') return readRecent();
            return DATA[key] || [];
        },
        pushRecent(emoji) {
            const recent = readRecent();
            const idx = recent.indexOf(emoji);
            if (idx > -1) recent.splice(idx, 1);
            recent.unshift(emoji);
            const next = recent.slice(0, 24);
            try {
                localStorage.setItem(LS_KEY, JSON.stringify(next));
            } catch (_) {}
            return next;
        },
    };

    global.Web2ChatEmoji = Web2ChatEmoji;
})(window);
