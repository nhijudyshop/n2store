// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// comments-mobile-render.js — RENDER + DOM reconcile (anti-jank) cho viewer
// comment livestream MOBILE. Tách MOVE-only từ comments-mobile.js: cardHtml,
// keyed DOM reconcile (KHÔNG nuke innerHTML), render debounce + cap, skeleton,
// bottom-sheet chi tiết, post picker. Đọc-ghi state qua window.LCM.
// =====================================================================
(function () {
    'use strict';

    const LCM = (window.LCM = window.LCM || {});

    // Đọc helpers/refs ổn định (định nghĩa ở comments-mobile-state, load TRƯỚC) ra
    // tên cục bộ → thân hàm byte-identical. State mutable + hàm cross-module gọi qua
    // LCM.* trực tiếp để luôn lấy giá trị mới nhất (KHÔNG snapshot).
    const {
        esc,
        pageOf,
        statusOf,
        nativeOrder,
        phoneOf,
        addrOf,
        nameOf,
        avatarHtml,
        ordered,
        fmtTime,
        fmtFull,
        ICO,
        PAGE,
    } = LCM;

    const listEl = LCM.listEl;
    const countEl = LCM.countEl;
    const hideCountEl = LCM.hideCountEl;
    const sheetEl = LCM.sheetEl;
    const sheetBack = LCM.sheetBack;
    const sheetBody = LCM.sheetBody;
    const pickerEl = LCM.pickerEl;
    const pickerBack = LCM.pickerBack;
    const pickerBody = LCM.pickerBody;
    const lightbox = LCM.lightbox;
    const lightboxImg = LCM.lightboxImg;
    const postSelLabel = LCM.postSelLabel;

    // ---------- render (debounce + cap → anti-jank) ----------
    function cardHtml(c) {
        const pg = pageOf(c);
        const st = statusOf(c);
        const no = nativeOrder(c); // đơn web (native-orders) của khách → STT badge
        const phone = phoneOf(c); // SĐT comment HOẶC kho — 10 số (tránh fb_id)
        const addr = addrOf(c);
        const meta =
            phone || addr
                ? `<div class="meta">
                ${phone ? `<a class="mchip mc-phone" href="tel:${esc(phone)}" onclick="event.stopPropagation()">${ICO.phone}${esc(phone)}</a>` : ''}
                ${addr ? `<span class="mchip mc-addr">${ICO.pin}<span>${esc(addr)}</span></span>` : ''}
              </div>`
                : `<div class="meta"><span class="mchip mc-empty">Chưa có SĐT/địa chỉ</span></div>`;
        return `<article class="card${ordered(c) ? ' ordered' : ''}" data-id="${esc(c.id)}">
            <div class="c-top">
                ${avatarHtml(c)}
                <div class="c-id">
                    <div class="c-name"><span class="c-nm-txt">${esc(nameOf(c))}</span><span class="st ${st.cls}">${esc(st.label)}</span>${ordered(c) ? `<span class="st st-order">✓ Đã tạo đơn</span>` : ''}${pg ? `<span class="pgbadge ${pg.c}">${esc(pg.t)}</span>` : ''}${no ? `<span class="cart-stt" title="Đơn web ${esc(no.code || '')} — STT ${esc(String(no.stt))}">🛒 ${esc(String(no.stt))}</span>` : ''}</div>
                    ${window.LiveTime ? window.LiveTime.markup(c.created_time, { tag: 'div', cls: 'c-time' }) : `<div class="c-time">${esc(fmtTime(c.created_time))}</div>`}
                </div>
            </div>
            <div class="c-body">
                <div class="c-main">
                    <p class="c-msg">${esc(c.message || '(không có nội dung)')}</p>
                    ${meta}
                </div>
            </div>
        </article>`;
    }

    // ---------- keyed DOM reconcile (anti-jank: KHÔNG nuke innerHTML) ----------
    // Chữ ký nội dung 1 card: mọi thứ cardHtml render. Đổi chữ ký mới rebuild đúng
    // card đó; giữ nguyên (KHÔNG đụng DOM) nếu không đổi → avatar/SĐT/địa chỉ/nội
    // dung card cũ giữ nguyên cache, không tải lại, không nháy.
    function cardSig(c) {
        const st = statusOf(c);
        const no = nativeOrder(c);
        const pg = pageOf(c);
        return [
            String(c.fb_id || ''),
            nameOf(c),
            st.label,
            st.cls,
            ordered(c) ? '1' : '0',
            pg ? pg.t + pg.c : '',
            no ? no.stt + '|' + (no.code || '') : '',
            phoneOf(c),
            addrOf(c),
            c.message || '',
        ].join('');
    }
    function buildCard(c, sig) {
        const tpl = document.createElement('template');
        tpl.innerHTML = cardHtml(c).trim();
        const el = tpl.content.firstElementChild;
        el.dataset.sig = sig != null ? sig : cardSig(c);
        return el;
    }
    // Khi PHẢI rebuild 1 card (nội dung đổi do enrich): giữ lại đúng node avatar ĐÃ
    // TẢI XONG nếu cùng src → không refetch ảnh (nguồn gây nháy avatar lúc enrich).
    function transplantAvatar(oldEl, newEl) {
        const o = oldEl.querySelector('img.av');
        const n = newEl.querySelector('img.av');
        if (
            o &&
            n &&
            o.getAttribute('src') === n.getAttribute('src') &&
            o.complete &&
            o.naturalWidth > 0
        )
            n.replaceWith(o);
    }
    // Reconcile danh sách card hiển thị: tái sử dụng card cũ theo data-id, chỉ tạo
    // card mới / gỡ card đã ẩn / đổi vị trí / rebuild card đổi nội dung. Trả mảng
    // card MỚI (để fade-in). Card cũ không đổi → KHÔNG bị chạm.
    function reconcileList(shown, moreCount) {
        const existing = new Map();
        for (const el of Array.from(listEl.children)) {
            if (el.classList && el.classList.contains('card') && el.dataset.id != null)
                existing.set(el.dataset.id, el);
        }
        const desired = [];
        const newEls = [];
        for (const c of shown) {
            const id = String(c.id);
            const sig = cardSig(c);
            let el = existing.get(id);
            if (el) {
                existing.delete(id);
                if (el.dataset.sig !== sig) {
                    const fresh = buildCard(c, sig);
                    transplantAvatar(el, fresh);
                    // Card đang highlight "mới" mà bị rebuild (enrich) → giữ highlight.
                    if (el.classList.contains('is-new')) {
                        fresh.classList.add('is-new');
                        fresh.addEventListener(
                            'animationend',
                            () => fresh.classList.remove('is-new'),
                            { once: true }
                        );
                    }
                    el.replaceWith(fresh);
                    el = fresh;
                }
            } else {
                el = buildCard(c, sig);
                newEls.push(el);
            }
            desired.push(el);
        }
        // Card không còn trong tầm hiển thị → gỡ.
        for (const el of existing.values()) el.remove();
        // Sắp đúng thứ tự với số thao tác DOM tối thiểu (card mới chèn ở đầu, card cũ
        // khớp vị trí thì đứng yên hoàn toàn).
        let ref = listEl.firstChild;
        for (const el of desired) {
            if (ref === el) ref = el.nextSibling;
            else listEl.insertBefore(el, ref);
        }
        // Nút "Xem thêm" luôn ở cuối.
        let moreBtn = listEl.querySelector('#moreBtn');
        if (moreCount > 0) {
            if (!moreBtn) {
                moreBtn = document.createElement('button');
                moreBtn.className = 'more-btn';
                moreBtn.id = 'moreBtn';
            }
            moreBtn.textContent = `Xem thêm ${moreCount} comment`;
            listEl.appendChild(moreBtn);
        } else if (moreBtn) {
            moreBtn.remove();
        }
        // Fade-in card mới (opacity thuần, chuẩn livestream). Burst dồn dập → bỏ qua.
        if (newEls.length && LCM.shouldAnimateNew(newEls.length)) {
            for (const el of newEls) {
                el.classList.add('is-new');
                el.addEventListener('animationend', () => el.classList.remove('is-new'), {
                    once: true,
                });
            }
        }
        return newEls;
    }

    let renderT;
    function scheduleRender() {
        clearTimeout(renderT);
        renderT = setTimeout(doRender, 80);
    }
    function doRender() {
        if (hideCountEl) hideCountEl.textContent = LCM.hiddenCount();
        LCM.updateOrderCounts();
        const rows = LCM.ALL.filter(LCM.visible);
        const _rt = LCM.realCommentTotal();
        countEl.textContent =
            (_rt != null
                ? _rt.toLocaleString('vi-VN')
                : rows.length + (rows.length >= LCM.LIMIT ? '+' : '')) + ' comment';
        if (!rows.length) {
            listEl.innerHTML = `<div class="empty"><div class="ic">🗒️</div>Chưa có comment ${LCM.filter || LCM.selectedPost || LCM.liveMode ? 'khớp bộ lọc' : 'nào'}.</div>`;
            return;
        }
        // Lần đầu có dữ liệu: bỏ skeleton / empty-state (node không phải .card).
        if (!listEl.querySelector('.card')) listEl.innerHTML = '';
        const shown = rows.slice(0, LCM.renderCap);
        const moreCount = rows.length > LCM.renderCap ? rows.length - LCM.renderCap : 0;
        const newEls = reconcileList(shown, moreCount);
        // Có card mới + user đang cuộn xuống → hiện pill "comment mới".
        if (newEls.length && window.scrollY > 240) LCM.showNewPill();
    }

    function skeleton() {
        listEl.innerHTML = Array.from({ length: 6 })
            .map(
                () => `<div class="sk">
            <div style="display:flex;gap:10px;align-items:center">
              <div class="sk-bar" style="width:44px;height:44px;border-radius:50%"></div>
              <div style="flex:1"><div class="sk-bar" style="width:46%;height:13px"></div>
              <div class="sk-bar" style="width:28%;height:10px;margin-top:7px"></div></div>
            </div>
            <div class="sk-bar" style="width:90%;height:13px;margin-top:12px"></div>
            <div class="sk-bar" style="width:60%;height:13px;margin-top:7px"></div>
          </div>`
            )
            .join('');
    }

    // ---------- detail bottom-sheet ----------
    function openSheet(id) {
        const c = LCM.ALL.find((x) => String(x.id) === String(id));
        if (!c) return;
        const pg = pageOf(c);
        const t = LCM.THUMBS[c.id] || {};
        const phone = phoneOf(c); // SĐT comment HOẶC kho — 10 số (tránh fb_id)
        const addr = addrOf(c);
        const st = statusOf(c);
        const nm = nameOf(c);
        const fb = c.fb_id ? `https://facebook.com/${esc(c.fb_id)}` : '';
        const field = (k, v) =>
            `<div class="sh-field"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
        sheetBody.innerHTML = `
            <div class="sh-hero">
                ${avatarHtml(c, true)}
                <div style="min-width:0">
                    <div class="sh-name">${esc(nm)}</div>
                    <div class="sh-sub">${pg ? esc(pg.t) + ' · ' : ''}${esc(fmtTime(c.created_time))}</div>
                </div>
            </div>
            <div class="sh-quote">${esc(c.message || '(không có nội dung)')}</div>
            ${t.thumbnailUrl ? `<img class="sh-thumb" id="shThumb" src="${esc(t.thumbnailUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            ${field('SĐT', phone ? `<a href="tel:${esc(phone)}" style="color:var(--c-primary);text-decoration:none;font-weight:700">${esc(phone)}</a>` : '')}
            ${field('Địa chỉ', esc(addr))}
            ${field('Trạng thái', `<span class="st ${st.cls}" style="display:inline-block">${esc(st.label)}</span>`)}
            ${field('Trang', esc(c.page_name || (pg ? 'NhiJudy ' + pg.t : '')))}
            ${field('FB ID', esc(c.fb_id || ''))}
            ${field('Thời gian', esc(fmtFull(c.created_time)))}
            ${t.livestreamUrl ? `<a class="sh-hide" style="display:block;text-align:center;text-decoration:none;color:var(--c-primary)" href="${esc(t.livestreamUrl)}" target="_blank" rel="noopener">🎬 Xem khoảnh khắc trong livestream</a>` : ''}
            <button class="sh-hide" id="shHidePerson" data-fbid="${esc(c.fb_id || '')}" data-name="${esc(nm)}">🙈 Ẩn tất cả comment của người này</button>`;
        const sh = sheetBody.querySelector('#shThumb');
        if (sh)
            sh.addEventListener('click', () => {
                lightboxImg.src = t.thumbnailUrl;
                lightbox.classList.add('open');
            });
        const hp = sheetBody.querySelector('#shHidePerson');
        if (hp)
            hp.addEventListener('click', (e) => {
                const fid = e.currentTarget.dataset.fbid;
                if (!fid) return LCM.toast('Không có FB ID để ẩn');
                if (window.LiveHiddenCommenters?.hide)
                    window.LiveHiddenCommenters.hide(fid, e.currentTarget.dataset.name || '');
                closeSheet();
            });
        sheetBack.classList.add('open');
        sheetEl.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeSheet() {
        sheetBack.classList.remove('open');
        sheetEl.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ---------- post picker ----------
    function postLabel(p) {
        const pg = PAGE[p.page_id];
        const tag = pg ? pg.t : 'Live';
        const ttl = (p.title || '').trim();
        return ttl ? `${tag} · ${ttl.slice(0, 42)}` : `${tag} · ${fmtTime(p.last_at)}`;
    }
    function pickerRow(p, sel) {
        const pg = PAGE[p.page_id] || { t: 'Live', c: 'pg-store' };
        const ttl = (p.title || '').trim();
        return `<div class="pk-row${sel ? ' sel' : ''}" data-post="${esc(p.post_id)}" data-page="${esc(p.page_id)}">
            <span class="pk-pg ${pg.c}">${esc(pg.t)}</span>
            <div class="pk-main">
                <div class="pk-title">${esc(ttl || 'Buổi livestream')}</div>
                <div class="pk-sub">${esc(fmtTime(p.last_at))} · cập nhật gần nhất</div>
            </div>
            <span class="pk-cnt">${p.comment_count}</span>
            ${sel ? '<span class="pk-check">✓</span>' : ''}
        </div>`;
    }
    function renderPicker() {
        const live = LCM.posts.filter(LCM.postLiving);
        const ended = LCM.posts.filter((p) => !LCM.postLiving(p));
        const selId = !LCM.liveMode && LCM.selectedPost && LCM.selectedPost.post_id;
        const allSel = !LCM.liveMode && !LCM.selectedPost;
        let html = `<div class="pk-head">Chọn livestream</div>
            <div class="pk-row${LCM.liveMode ? ' sel' : ''}" data-post="__live">
                <span class="pk-pg" style="background:#ef4444">🔴</span>
                <div class="pk-main"><div class="pk-title">Đang livestream (gộp)</div>
                <div class="pk-sub">Chỉ bài đang live — House + Store (${live.length})</div></div>
                ${LCM.liveMode ? '<span class="pk-check">✓</span>' : ''}
            </div>
            <div class="pk-row${allSel ? ' sel' : ''}" data-post="">
                <span class="pk-pg" style="background:var(--c-primary)">All</span>
                <div class="pk-main"><div class="pk-title">Tất cả livestream</div>
                <div class="pk-sub">Gộp comment mới nhất mọi bài</div></div>
                ${allSel ? '<span class="pk-check">✓</span>' : ''}
            </div>`;
        if (live.length)
            html += `<div class="pk-group-h"><span class="pk-live-dot"></span>Đang live</div>${live
                .map((p) => pickerRow(p, p.post_id === selId))
                .join('')}`;
        if (ended.length)
            html += `<div class="pk-group-h">Đã live</div>${ended
                .map((p) => pickerRow(p, p.post_id === selId))
                .join('')}`;
        if (!LCM.posts.length) html += `<div class="pk-empty">Chưa có bài livestream nào.</div>`;
        pickerBody.innerHTML = html;
    }
    function openPicker() {
        renderPicker();
        pickerBack.classList.add('open');
        pickerEl.classList.add('open');
        document.body.style.overflow = 'hidden';
        if (!LCM.posts.length) LCM.loadPosts();
    }
    function closePicker() {
        pickerBack.classList.remove('open');
        pickerEl.classList.remove('open');
        document.body.style.overflow = '';
    }
    function applyView() {
        postSelLabel.textContent = LCM.liveMode
            ? '🔴 Đang live'
            : LCM.selectedPost
              ? postLabel(LCM.selectedPost)
              : 'Tất cả livestream';
        LCM.updateLiveTag();
        closePicker();
        LCM.ALL = [];
        LCM.topId = null;
        LCM.renderCap = LCM.RENDER_CAP_STEP;
        LCM.load({ silent: false });
    }
    function selectLive() {
        LCM.liveMode = true;
        LCM.selectedPost = null;
        applyView();
    }
    function selectAll() {
        LCM.liveMode = false;
        LCM.selectedPost = null;
        applyView();
    }
    function selectPost(p) {
        LCM.liveMode = false;
        LCM.selectedPost = p;
        applyView();
    }

    // ---- expose ----
    LCM.cardHtml = cardHtml;
    LCM.cardSig = cardSig;
    LCM.buildCard = buildCard;
    LCM.transplantAvatar = transplantAvatar;
    LCM.reconcileList = reconcileList;
    LCM.scheduleRender = scheduleRender;
    LCM.doRender = doRender;
    LCM.skeleton = skeleton;
    LCM.openSheet = openSheet;
    LCM.closeSheet = closeSheet;
    LCM.postLabel = postLabel;
    LCM.pickerRow = pickerRow;
    LCM.renderPicker = renderPicker;
    LCM.openPicker = openPicker;
    LCM.closePicker = closePicker;
    LCM.applyView = applyView;
    LCM.selectLive = selectLive;
    LCM.selectAll = selectAll;
    LCM.selectPost = selectPost;
})();
