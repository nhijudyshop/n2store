// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo chat sticker picker.
// =====================================================================
// WZChat.openStickerPicker(anchorEl, accountKey, onPick) — popover sticker.
// Tìm sticker qua ZaloApi.stickers(accountKey,q) (zca getStickers→detail).
// Recents lưu localStorage. onPick(sticker) → composer gửi.
// =====================================================================

(function () {
    'use strict';
    const WZ = (window.WZChat = window.WZChat || {});
    const esc = WZ.esc;
    const LS_KEY = 'wz_sticker_recents';
    const SUGGEST = ['cảm ơn', 'ok', 'love', 'cute', 'haha', 'sale', 'xin chào', 'tạm biệt'];

    function recents() {
        try {
            return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        } catch {
            return [];
        }
    }
    function pushRecent(s) {
        try {
            const list = [s, ...recents().filter((x) => x.id !== s.id)].slice(0, 18);
            localStorage.setItem(LS_KEY, JSON.stringify(list));
        } catch {}
    }

    let _pop = null;
    let _cache = {};
    function close() {
        if (_pop) {
            _pop.remove();
            _pop = null;
            document.removeEventListener('click', onDoc, true);
        }
    }
    function onDoc(e) {
        if (_pop && !_pop.contains(e.target) && !e.target.closest('[data-wz-sticker-btn]')) close();
    }

    function cellHtml(s) {
        return `<button class="wz-sticker-cell" type="button" data-s='${esc(JSON.stringify(s))}' tabindex="-1"><img src="${esc(s.url)}" alt="${esc(s.text || 'sticker')}" loading="lazy" referrerpolicy="no-referrer"></button>`;
    }
    function setGrid(html) {
        const g = _pop?.querySelector('.wz-sticker-grid');
        if (g) g.innerHTML = html;
    }

    async function load(accountKey, q) {
        const key = q || '_recent';
        setGrid('<div class="wz-sticker-loading">Đang tải…</div>');
        if (_cache[key]) return setGrid(_cache[key].map(cellHtml).join(''));
        try {
            const r = await window.ZaloApi.stickers(accountKey, q || 'hi');
            const list = (r.stickers || []).filter((s) => s.url);
            _cache[key] = list;
            setGrid(
                list.length
                    ? list.map(cellHtml).join('')
                    : '<div class="wz-sticker-loading">Không có sticker</div>'
            );
        } catch (e) {
            setGrid(`<div class="wz-sticker-loading">✗ ${esc(e.message)}</div>`);
        }
    }

    WZ.openStickerPicker = function (anchorEl, accountKey, onPick) {
        close();
        _pop = document.createElement('div');
        _pop.className = 'wz-pop wz-sticker-pop';
        _pop.setAttribute('role', 'dialog');
        _pop.setAttribute('aria-label', 'Chọn sticker');
        const rec = recents();
        _pop.innerHTML = `
            <div class="wz-pop-search">
                <input type="search" placeholder="Tìm sticker…" aria-label="Tìm sticker" class="wz-sticker-search">
            </div>
            <div class="wz-sticker-tags">${SUGGEST.map((t) => `<button class="wz-tag" type="button" data-q="${esc(t)}">${esc(t)}</button>`).join('')}</div>
            <div class="wz-sticker-grid">${rec.length ? rec.map(cellHtml).join('') : ''}</div>`;
        document.body.appendChild(_pop);
        WZ._popPosition(_pop, anchorEl);

        if (!rec.length) load(accountKey, SUGGEST[0]);

        _pop.addEventListener('click', (e) => {
            const cell = e.target.closest('.wz-sticker-cell');
            if (cell) {
                try {
                    const s = JSON.parse(cell.dataset.s);
                    pushRecent(s);
                    onPick?.(s);
                    close();
                } catch {}
                return;
            }
            const tag = e.target.closest('.wz-tag');
            if (tag) {
                _pop.querySelector('.wz-sticker-search').value = tag.dataset.q;
                load(accountKey, tag.dataset.q);
            }
        });
        const search = _pop.querySelector('.wz-sticker-search');
        let t;
        search.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => load(accountKey, search.value.trim() || SUGGEST[0]), 350);
        });
        setTimeout(() => document.addEventListener('click', onDoc, true), 0);
    };
    WZ.closeStickerPicker = close;
})();
