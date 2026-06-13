// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat shared store + utils (WZChat.*).
// =====================================================================
// Nền tảng dùng chung cho mọi module chat (bubbles/composer/realtime/…).
// Giữ state phiên chat đang mở (messages, conv, replyTarget, pending files)
// + tiện ích esc/fmtTime/avatar. Tất cả attach vào window.WZChat.
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const TZ = 'Asia/Ho_Chi_Minh';

    // ── utils ──────────────────────────────────────────────────────────
    WZ.esc = (v) =>
        String(v == null ? '' : v).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    WZ.initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();

    WZ.fmtTime = (ms) => {
        if (!ms) return '';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                timeZone: TZ,
                hour: '2-digit',
                minute: '2-digit',
            }).format(new Date(Number(ms)));
        } catch {
            return '';
        }
    };
    // Khoá ngày theo GMT+7 (để gom date divider)
    WZ.dayKey = (ms) => {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: TZ,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(new Date(Number(ms)));
        } catch {
            return '';
        }
    };
    WZ.dayLabel = (ms) => {
        const k = WZ.dayKey(ms);
        const today = WZ.dayKey(Date.now());
        const yest = WZ.dayKey(Date.now() - 86400000);
        if (k === today) return 'Hôm nay';
        if (k === yest) return 'Hôm qua';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                timeZone: TZ,
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }).format(new Date(Number(ms)));
        } catch {
            return k;
        }
    };

    // Avatar <img> với fallback chữ cái đầu (CDN Zalo cần no-referrer)
    WZ.avatarHtml = (url, name, cls, style) => {
        const init = WZ.esc(WZ.initial(name));
        const st = style ? ` style="${style}"` : '';
        if (url)
            return `<img class="${cls}"${st} src="${WZ.esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-init="${init}" onerror="window.__wzAvErr&&window.__wzAvErr(this)">`;
        return `<span class="${cls}"${st}>${init}</span>`;
    };

    WZ.notify = (m, t) => window.notificationManager?.show?.(m, t || 'info');

    // ── reaction set (6 nhanh) — key = enum zca, emoji + nhãn ───────────
    WZ.REACTIONS = [
        { key: 'HEART', emoji: '❤️', label: 'Tim' },
        { key: 'LIKE', emoji: '👍', label: 'Thích' },
        { key: 'HAHA', emoji: '😆', label: 'Haha' },
        { key: 'WOW', emoji: '😮', label: 'Wow' },
        { key: 'CRY', emoji: '😢', label: 'Buồn' },
        { key: 'ANGRY', emoji: '😡', label: 'Phẫn nộ' },
    ];

    // ── store: state phiên chat đang mở ────────────────────────────────
    const _s = {
        conv: null,
        account: null, // accountKey
        messages: [],
        replyTarget: null,
        pending: [], // [{id, file, dataUrl, kind}]
    };
    let _pendId = 0;

    WZ.store = {
        get: () => _s,
        setConversation(conv, account, messages) {
            _s.conv = conv;
            _s.account = account;
            _s.messages = Array.isArray(messages) ? messages : [];
            _s.replyTarget = null;
            _s.pending = [];
        },
        setMessages(messages) {
            _s.messages = Array.isArray(messages) ? messages : [];
        },
        // reply
        setReplyTarget(m) {
            _s.replyTarget = m || null;
        },
        getReplyTarget: () => _s.replyTarget,
        clearReply() {
            _s.replyTarget = null;
        },
        // pending attachments (composer tray)
        addPending(item) {
            const it = { id: ++_pendId, ...item };
            _s.pending.push(it);
            return it;
        },
        removePending(id) {
            _s.pending = _s.pending.filter((p) => p.id !== id);
        },
        getPending: () => _s.pending,
        clearPending() {
            _s.pending = [];
        },
        // patch helpers (realtime) — trả về true nếu có thay đổi
        markRecalled(msgId) {
            const m = _find(msgId);
            if (m && !m.recalled) {
                m.recalled = true;
                return true;
            }
            return false;
        },
        markSeen() {
            let ch = false;
            for (const m of _s.messages)
                if (m.direction === 'out' && !m.seen_at) {
                    m.seen_at = Date.now();
                    ch = true;
                }
            return ch;
        },
        patchReaction(msgId, emoji, uid) {
            const m = _find(msgId);
            if (!m) return false;
            const r = m.reactions || (m.reactions = {});
            const set = new Set(r[emoji] || []);
            set.add(uid || 'kh');
            r[emoji] = [...set];
            return true;
        },
    };
    function _find(msgId) {
        const id = String(msgId);
        return _s.messages.find((m) => String(m.msg_id) === id || String(m.cli_msg_id) === id);
    }

    // ── menu dropdown dùng chung (quick reply, forward target…) ─────────
    let _menu = null;
    function _closeMenu() {
        if (_menu) {
            _menu.remove();
            _menu = null;
            document.removeEventListener('click', _onMenuDoc, true);
        }
    }
    function _onMenuDoc(e) {
        if (_menu && !_menu.contains(e.target)) _closeMenu();
    }
    WZ.openMenu = function (anchor, items, onPick) {
        _closeMenu();
        _menu = document.createElement('div');
        _menu.className = 'wz-pop wz-menu';
        _menu.setAttribute('role', 'menu');
        _menu.innerHTML = (items || [])
            .map(
                (it) =>
                    `<button class="wz-menu-item" type="button" role="menuitem" data-v="${WZ.esc(it.value)}">${WZ.esc(it.label)}</button>`
            )
            .join('');
        document.body.appendChild(_menu);
        WZ._popPosition ? WZ._popPosition(_menu, anchor) : null;
        _menu.addEventListener('click', (e) => {
            const b = e.target.closest('.wz-menu-item');
            if (b) {
                onPick?.(b.dataset.v);
                _closeMenu();
            }
        });
        setTimeout(() => document.addEventListener('click', _onMenuDoc, true), 0);
    };
    WZ.closeMenu = _closeMenu;

    // preview ngắn của 1 message (cho reply bar khi không có content)
    WZ._previewOf = function (m) {
        if (!m) return '';
        if (m.content) return m.content;
        const t = m.msg_type;
        return (
            {
                image: '[Hình ảnh]',
                sticker: '[Sticker]',
                file: '[Tệp]',
                video: '[Video]',
                voice: '[Thoại]',
            }[t] || '[Tin nhắn]'
        );
    };
})();
