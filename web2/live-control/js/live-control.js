// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Điều khiển TV livestream (user2): gắn SP vào chiến dịch + nhập số NCC báo (pending_qty).
(function () {
    'use strict';

    var LS_KEY = 'lc_campaign';
    var state = {
        campaignId: null,
        board: [], // grouped SP trong chiến dịch
        addedCodes: new Set(),
        pickerTab: 'pending',
        pickerGroups: [],
        pickerGroupsAll: [], // trước khi lọc địa danh (để dựng chip)
        search: '',
        pickerRegion: '', // lọc picker theo ĐỊA DANH ('' = tất cả)
        showRegion: true, // ẩn/hiện chip+badge địa danh (localStorage lc_show_region)
        editing: false, // đang gõ input pending → hoãn re-render board
        // điều khiển màn TV (layout + trang) + địa danh CHO VƯỢT (vùng được đặt vượt NCC)
        tvControl: { rows: 1, cols: 4, page: 0, region: 'HƯƠNG CHÂU' },
    };
    var boardTimer = null;
    var searchTimer = null;

    var $ = function (id) {
        return document.getElementById(id);
    };
    var esc =
        (window.Web2Escape && window.Web2Escape.escapeHtml) ||
        function (s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        };
    var safeImg =
        (window.Web2Escape && window.Web2Escape.safeImageUrl) ||
        function (u) {
            return u || '';
        };
    function toast(msg, type) {
        if (window.notificationManager && window.notificationManager.show)
            window.notificationManager.show(msg, type || 'info');
    }
    // ĐỊA DANH nhập hàng (Sổ Order): chuẩn hoá để so khớp chip (HÀ NỘI/HƯƠNG CHÂU).
    function normRegion(s) {
        return String(s == null ? '' : s)
            .trim()
            .toUpperCase();
    }
    // CHỈ admin được đổi địa danh CHO VƯỢT (quyết định vùng nào được đặt VƯỢT NCC
    // + cách tính CÒN trên màn TV đang chiếu). Web2Perm là nguồn chuẩn (role='admin');
    // fallback đọc session khi module chưa load (defensive, không chặn nhầm admin).
    function isAdmin() {
        try {
            if (window.Web2Perm && typeof window.Web2Perm.isAdmin === 'function')
                return window.Web2Perm.isAdmin();
            var u =
                (window.Web2Auth &&
                    window.Web2Auth.getStored &&
                    window.Web2Auth.getStored()?.user) ||
                (window.Web2UserInfo && window.Web2UserInfo.get && window.Web2UserInfo.get()) ||
                null;
            return !!u && String(u.role || '').toLowerCase() === 'admin';
        } catch (_) {
            return false;
        }
    }

    // ── Campaigns ─────────────────────────────────────
    async function loadCampaigns(selectId) {
        var sel = $('lcCampaign');
        try {
            var camps = await window.Web2Campaign.list();
            var cur = selectId != null ? String(selectId) : sel.value;
            sel.innerHTML =
                '<option value="">— Chọn chiến dịch —</option>' +
                camps
                    .map(function (c) {
                        return (
                            '<option value="' +
                            c.id +
                            '">' +
                            esc(c.name) +
                            ' (' +
                            (c.post_count || 0) +
                            ' bài)</option>'
                        );
                    })
                    .join('');
            if (cur && camps.some((c) => String(c.id) === String(cur))) sel.value = cur;
        } catch (e) {
            toast('Lỗi tải chiến dịch: ' + (e && e.message), 'error');
        }
    }

    // 2026-06-30: createCampaign() ĐÃ GỠ — chiến dịch chỉ tạo/gán ở live-chat (1 nguồn).
    // live-control chỉ CHỌN chiến dịch (dropdown #lcCampaign) để chiếu lên TV.

    function selectCampaign(id) {
        state.campaignId = id ? Number(id) : null;
        $('lcCampaign').value = id || '';
        $('lcOpenTv').disabled = !state.campaignId;
        try {
            if (id) localStorage.setItem(LS_KEY, String(id));
        } catch (e) {}
        if (state.campaignId) {
            loadBoard();
            loadPicker();
            loadTvControl();
        } else {
            state.board = [];
            state.addedCodes = new Set();
            renderBoard();
            renderTvCtl(); // ẩn panel khi bỏ chọn chiến dịch
        }
    }

    // ── Board (SP trong chiến dịch) ───────────────────
    async function loadBoard() {
        if (!state.campaignId) return;
        // Skeleton chỉ ở lần tải đầu (board đang trống) — không nháy khi re-poll.
        if (!state.board.length) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.cards('#lcBoard', { count: 6 });
            }
        }
        try {
            // sync:true → server auto-add SP chờ hàng (Sổ Order) lên board, mới
            // nhất trên đầu; SP đã ✕ xoá (tombstone) KHÔNG tự thêm lại.
            var items = await window.Web2Campaign.listProducts(state.campaignId, { sync: true });
            // Lọc GHOST + HẾT HÀNG:
            //  • missing=true → SP đã xoá khỏi kho còn sót cp row (autoSync hard-delete
            //    ngay lần sync này; lọc client tránh nháy 1 frame ghost).
            //  • isActive===false → SP đã HẾT HÀNG / Tạm dừng (logic mới 2026-06-28):
            //    bán hết tự ẩn khỏi bảng live. Re-import (còn hàng lại) → isActive=true
            //    → tự hiện lại (cp row KHÔNG bị xoá nên không cần thêm lại tay).
            items = items.filter(function (it) {
                return it && !it.missing && it.isActive !== false;
            });
            state.addedCodes = new Set(items.map((i) => i.code));
            // by:'parent' — gom SP CHA–CON thành 1 card nhiều biến thể (Migration 070):
            // parent_code khi có (chuẩn nhất), fallback name+supplier+region. Vd ÁO SƠ MI
            // LỤA Màu Ghi + Màu Đỏ (cùng NCC+HƯƠNG CHÂU) → 1 nhóm 2 biến thể; 2 SP khác
            // địa danh (HƯƠNG CHÂU vs HÀ NỘI) vẫn TÁCH (region trong key → không gộp 34).
            state.board = window.Web2VariantGroup.group(items, { by: 'parent' });
            renderBoard();
            renderTvCtl(); // số trang đổi khi SP thêm/bớt → cập nhật preview + nav
            refreshPickerAddedFlags();
        } catch (e) {
            toast('Lỗi tải SP chiến dịch: ' + (e && e.message), 'error');
            renderBoard(); // dọn skeleton: state.board vẫn [] → render empty-state, không kẹt loading
        }
    }
    function scheduleBoard() {
        clearTimeout(boardTimer);
        boardTimer = setTimeout(function () {
            if (!state.editing) loadBoard();
        }, 600);
    }

    // Board "Trên TV" mỗi biến thể (#2 2026-06-30): TỒN (tồn kho thật, read-only) +
    // GIỎ (SL trong giỏ KH draft = v.sold) + MỚI (khách chưa SĐT&địa chỉ = v.newCust) +
    // CHỜ HÀNG (= max(0, GIỎ − TỒN) = cần đặt thêm NCC). Tất cả read-only (tự tính).
    function vrowHtml(v) {
        var m = window.Web2LiveTvDisplay.khConModel(v);
        var choCls = m.choHang > 0 ? ' lc-cho' : '';
        return (
            '<div class="lc-vrow">' +
            '<span class="lc-vname">' +
            esc(v.variant && v.variant.trim() ? v.variant : '(mặc định)') +
            '</span>' +
            '<span class="lc-vnum lc-vton" title="Tồn kho thật (Kho SP)">' +
            m.stock +
            '<small>TỒN</small></span>' +
            '<span class="lc-vnum lc-vban' +
            (m.gio > 0 ? ' lc-clickable' : '') +
            '" data-cart="' +
            esc(v.code) +
            '" data-cart-mode="all" title="Tổng SL món trong giỏ khách — bấm xem ai đang có">' +
            m.gio +
            '<small>GIỎ</small></span>' +
            '<span class="lc-vnum lc-vkhm' +
            (m.moi > 0 ? ' lc-clickable' : '') +
            '" data-cart="' +
            esc(v.code) +
            '" data-cart-mode="new" title="Số món của khách MỚI (chưa SĐT & địa chỉ) — bấm xem">' +
            m.moi +
            '<small>MỚI</small></span>' +
            '<span class="lc-vnum lc-vcho' +
            choCls +
            '" title="Chờ hàng = GIỎ − TỒN (cần đặt thêm từ NCC)">' +
            m.choHang +
            '<small>CHỜ</small></span>' +
            '</div>'
        );
    }
    function groupHtml(g, idx, total) {
        var img = g.imageUrl
            ? '<img class="lc-group-img" src="' + esc(safeImg(g.imageUrl)) + '" alt="" />'
            : '<span class="lc-group-img" style="display:grid;place-items:center">📦</span>';
        var supLine = g.suppliers && g.suppliers.length ? esc(g.suppliers.join(', ')) : '';
        return (
            '<div class="lc-group' +
            (g.pinned ? ' is-pinned' : '') +
            '" data-key="' +
            esc(g.key) +
            '">' +
            '<div class="lc-group-head">' +
            img +
            '<div class="lc-group-name">' +
            esc(g.name) +
            (supLine ? '<small>' + supLine + '</small>' : '') +
            '</div>' +
            '<div class="lc-group-ops">' +
            '<button class="lc-iconbtn" data-op="up" title="Lên"' +
            (idx === 0 ? ' disabled' : '') +
            '>↑</button>' +
            '<button class="lc-iconbtn" data-op="down" title="Xuống"' +
            (idx === total - 1 ? ' disabled' : '') +
            '>↓</button>' +
            '<button class="lc-iconbtn' +
            (g.pinned ? ' is-on' : '') +
            '" data-op="pin" title="Ghim lên đầu TV">📌</button>' +
            '<button class="lc-iconbtn danger" data-op="remove" title="Bỏ khỏi TV">✕</button>' +
            '</div></div>' +
            '<div class="lc-vlist">' +
            g.variants.map(vrowHtml).join('') +
            '</div>' +
            '</div>'
        );
    }
    function renderBoard() {
        var box = $('lcBoard');
        $('lcBoardCount').textContent = state.board.length;
        if (!state.campaignId) {
            box.innerHTML = '<div class="lc-empty">Chọn chiến dịch để bắt đầu.</div>';
            return;
        }
        if (!state.board.length) {
            box.innerHTML =
                '<div class="lc-empty">Chưa có SP. Thêm từ panel bên phải (ưu tiên SP chờ hàng).</div>';
            return;
        }
        box.innerHTML = state.board
            .map(function (g, i) {
                return groupHtml(g, i, state.board.length);
            })
            .join('');
    }

    function groupByKey(key) {
        return state.board.find((g) => g.key === key);
    }
    function flatCodes(groups) {
        var out = [];
        groups.forEach((g) => g.variants.forEach((v) => out.push(v.code)));
        return out;
    }

    async function onBoardOp(op, key) {
        var g = groupByKey(key);
        if (!g) return;
        var codes = g.variants.map((v) => v.code);
        try {
            if (op === 'remove') {
                for (var i = 0; i < codes.length; i++)
                    await window.Web2Campaign.removeProduct(state.campaignId, codes[i]);
            } else if (op === 'pin') {
                var nextPinned = !g.pinned;
                for (var j = 0; j < codes.length; j++)
                    await window.Web2Campaign.setPinned(state.campaignId, codes[j], nextPinned);
            } else if (op === 'up' || op === 'down') {
                var idx = state.board.indexOf(g);
                var to = op === 'up' ? idx - 1 : idx + 1;
                if (to < 0 || to >= state.board.length) return;
                var arr = state.board.slice();
                arr.splice(to, 0, arr.splice(idx, 1)[0]);
                await window.Web2Campaign.reorder(state.campaignId, flatCodes(arr));
            }
            await loadBoard();
        } catch (e) {
            toast('Lỗi: ' + (e && e.message), 'error');
        }
    }

    // 2026-06-30 (#2): BỎ savePending — NCC không còn gõ tay trên board. Sổ Order là
    // writer duy nhất của pending_qty; board chỉ hiện TỒN/GIỎ/MỚI/CHỜ HÀNG (read-only).

    // ── Điều khiển màn TV (layout hàng×cột + lật trang + preview) ──
    // Dùng CHUNG quy tắc trình bày với live-tv qua Web2LiveTvDisplay (thứ tự hết-hàng
    // xuống cuối + phân trang) → preview ở đây = đúng trang thật trên TV.
    function tvPaginate() {
        return window.Web2LiveTvDisplay.paginate(
            state.board,
            state.tvControl.rows,
            state.tvControl.cols,
            state.tvControl.page
        );
    }
    function miniCardHtml(g) {
        var st = window.Web2LiveTvDisplay.cardState(g); // TỒN/GIỎ/CHỜ HÀNG (#2)
        var cls = 'lc-mini-card';
        if (g.pinned) cls += ' is-pinned';
        if (st.soldOut) cls += ' is-soldout';
        else if (st.low) cls += ' is-low';
        if (st.hot && !st.soldOut) cls += ' is-hot';
        var img = g.imageUrl
            ? '<img class="lc-mini-img" src="' + esc(safeImg(g.imageUrl)) + '" alt="" />'
            : '<span class="lc-mini-img lc-mini-noimg">📦</span>';
        return (
            '<div class="' +
            cls +
            '">' +
            img +
            '<div class="lc-mini-body"><div class="lc-mini-name">' +
            esc(g.name) +
            '</div><div class="lc-mini-nums">' +
            '<span>' +
            st.stock +
            '<i>TỒN</i></span><span>' +
            st.sold +
            '<i>GIỎ</i></span><span class="' +
            (st.choHang > 0 ? 'cho' : '') +
            '">' +
            st.choHang +
            '<i>CHỜ</i></span></div></div></div>'
        );
    }
    function renderTvCtl() {
        var sec = $('lcTvCtl');
        if (!sec) return;
        if (!state.campaignId) {
            sec.hidden = true;
            return;
        }
        sec.hidden = false;
        var tc = state.tvControl;
        var pg = tvPaginate();
        if (pg.page !== tc.page) tc.page = pg.page; // clamp local khi SP giảm
        $('lcRows').value = tc.rows;
        $('lcCols').value = tc.cols;
        $('lcPerPage').textContent = pg.perPage;
        $('lcPageInd').textContent = 'Trang ' + (pg.page + 1) + '/' + pg.totalPages;
        var prev = $('lcTvPreview');
        prev.style.gridTemplateColumns = 'repeat(' + tc.cols + ', minmax(0, 1fr))';
        prev.style.gridTemplateRows = 'repeat(' + tc.rows + ', minmax(0, 1fr))';
        prev.innerHTML = pg.pageGroups.length
            ? pg.pageGroups.map(miniCardHtml).join('')
            : '<div class="lc-mini-empty">Chưa có SP để chiếu.</div>';
        sec.querySelectorAll('.lc-navbtn').forEach(function (b) {
            var op = b.dataset.pg;
            b.disabled =
                op === 'first' || op === 'prev' ? pg.page <= 0 : pg.page >= pg.totalPages - 1;
        });
        // Selector địa danh CHO VƯỢT — options = địa danh trong board + hiện tại.
        // CHỈ admin chỉnh được: non-admin → disabled (read-only) + hint khoá.
        var rsel = $('lcRegion');
        if (rsel) {
            rsel.innerHTML = regionOptions()
                .map(function (rr) {
                    return (
                        '<option value="' +
                        esc(rr) +
                        '"' +
                        (normRegion(rr) === normRegion(tc.region) ? ' selected' : '') +
                        '>' +
                        esc(rr) +
                        '</option>'
                    );
                })
                .join('');
            var admin = isAdmin();
            rsel.disabled = !admin;
            rsel.classList.toggle('is-locked', !admin);
            rsel.title = admin
                ? 'Địa danh CHO VƯỢT (hàng có sẵn — vùng được đặt VƯỢT số NCC báo). Vùng KHÔNG chọn = pre-order (bán mẫu trước, đặt sau).'
                : '🔒 Chỉ admin được đổi địa danh CHO VƯỢT';
        }
    }
    // Địa danh có thể chọn = địa danh trong board + hiện tại + 2 mặc định phổ biến.
    function regionOptions() {
        var seen = {};
        var out = [];
        function add(r) {
            r = String(r || '').trim();
            if (!r) return;
            var k = normRegion(r);
            if (!seen[k]) {
                seen[k] = 1;
                out.push(r);
            }
        }
        add(state.tvControl.region);
        (state.board || []).forEach(function (g) {
            add(g.region);
            (g.variants || []).forEach(function (v) {
                add(v.region);
            });
        });
        add('HƯƠNG CHÂU');
        add('HÀ NỘI');
        return out;
    }
    async function loadTvControl() {
        if (!state.campaignId) return;
        try {
            var c = await window.Web2Campaign.getTvControl(state.campaignId);
            if (c)
                state.tvControl = {
                    rows: c.rows || 1,
                    cols: c.cols || 4,
                    page: c.page || 0,
                    region: c.region || 'HƯƠNG CHÂU',
                };
        } catch (e) {
            /* default 1×4 + Hương Châu */
        }
        renderTvCtl();
        if (state.board.length) renderBoard(); // địa danh đổi cột KH ở board
    }
    // Ghi layout/trang/địa danh → backend + SSE (TV + tab khác cập nhật). Optimistic UI.
    async function saveTvControl(patch) {
        if (!state.campaignId) return;
        state.tvControl = Object.assign({}, state.tvControl, patch);
        renderTvCtl();
        if (patch && 'region' in patch && state.board.length) renderBoard();
        try {
            await window.Web2Campaign.setTvControl(state.campaignId, patch);
        } catch (e) {
            toast('Lỗi lưu điều khiển TV: ' + (e && e.message), 'error');
        }
    }
    function setTvLayout(rows, cols) {
        rows = Math.max(1, Math.min(6, Math.floor(Number(rows) || 1)));
        cols = Math.max(1, Math.min(10, Math.floor(Number(cols) || 1)));
        saveTvControl({ rows: rows, cols: cols, page: 0 });
    }
    function setTvRegion(region) {
        region = String(region || '').trim();
        if (!region || region === state.tvControl.region) return;
        saveTvControl({ region: region });
    }
    function goTvPage(op) {
        var pg = tvPaginate();
        var p = pg.page;
        if (op === 'first') p = 0;
        else if (op === 'prev') p = Math.max(0, p - 1);
        else if (op === 'next') p = Math.min(pg.totalPages - 1, p + 1);
        else if (op === 'last') p = pg.totalPages - 1;
        if (p !== pg.page) saveTvControl({ page: p });
    }
    // Áp điều khiển từ SSE (tab live-control khác) — KHÔNG ghi lại (tránh loop).
    function applyTvControlSse(d) {
        if (!d) return;
        if (d.campaignId != null && Number(d.campaignId) !== Number(state.campaignId)) return;
        var oldRegion = state.tvControl.region;
        state.tvControl = {
            rows: Number(d.rows) || state.tvControl.rows,
            cols: Number(d.cols) || state.tvControl.cols,
            page: d.page != null ? Math.max(0, Number(d.page) || 0) : state.tvControl.page,
            region: d.region != null ? d.region : state.tvControl.region,
        };
        renderTvCtl();
        if (state.tvControl.region !== oldRegion && state.board.length) renderBoard();
    }

    // ── Popup chi tiết GIỎ / KH MỚI (bấm số ở board) ──
    // Liệt kê đơn draft chứa SP (mỗi đơn = 1 giỏ khách). mode 'new' = lọc KH chưa
    // có SĐT & địa chỉ. Dùng class shared .w2p-* (popup.js) cho overlay/card/scroll.
    // URL avatar KH — như live-chat getAvatarUrl: hash pancake → content.pancake.vn;
    // else fb_id + page → worker /api/fb-avatar (resolve avatar thật từ Pancake page).
    function cartAvatarUrl(it) {
        var a = it.avatar;
        if (a && typeof a === 'string') {
            if (a.indexOf('content.pancake.vn') >= 0) return a;
            if (/^[a-f0-9]{32,}$/i.test(a)) return 'https://content.pancake.vn/2.1-25/avatars/' + a;
            if (a.indexOf('http') === 0) return a;
        }
        if (it.fbId) {
            var base =
                (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
                (window.WEB2_CONFIG && window.WEB2_CONFIG.WORKER_URL) ||
                'https://chatomni-proxy.nhijudyshop.workers.dev';
            var u = base + '/api/fb-avatar?id=' + encodeURIComponent(it.fbId);
            if (it.fbPageId) u += '&page=' + encodeURIComponent(it.fbPageId);
            return u;
        }
        return null;
    }
    function cartRowHtml(it) {
        var name = it.customerName || it.fbName || '(chưa có tên)';
        var stt = it.stt != null ? ' <span class="lc-cart-stt">#' + it.stt + '</span>' : '';
        var contact = it.phone
            ? '<span class="lc-cart-phone">' + esc(it.phone) + '</span>'
            : it.isNewCust
              ? '<span class="lc-cart-newbadge">KH mới</span>'
              : '<span class="lc-cart-muted">chưa có SĐT</span>';
        var addr = it.address ? '<div class="lc-cart-addr">📍 ' + esc(it.address) + '</div>' : '';
        // Avatar livestream (như live-chat) + fallback chữ cái đầu nếu lỗi/không có.
        var initial = esc((String(name).trim()[0] || '?').toUpperCase());
        var avatarUrl = cartAvatarUrl(it);
        var avatar = avatarUrl
            ? '<img class="lc-cart-avatar" src="' +
              esc(avatarUrl) +
              '" alt="" referrerpolicy="no-referrer" ' +
              "onerror=\"this.style.display='none';this.nextElementSibling.style.display='grid'\" />" +
              '<span class="lc-cart-avatar lc-cart-avatar-fb" style="display:none">' +
              initial +
              '</span>'
            : '<span class="lc-cart-avatar lc-cart-avatar-fb">' + initial + '</span>';
        var comment = it.comment
            ? '<div class="lc-cart-comment">“' + esc(it.comment) + '”</div>'
            : '';
        return (
            '<div class="lc-cart-row">' +
            avatar +
            '<div class="lc-cart-cinfo">' +
            '<div class="lc-cart-cname">' +
            esc(name) +
            stt +
            '</div>' +
            '<div class="lc-cart-contact">' +
            contact +
            '</div>' +
            addr +
            comment +
            '</div>' +
            '<div class="lc-cart-qty">' +
            (it.qty || 0) +
            '<small>SL</small></div>' +
            '</div>'
        );
    }
    async function openCartDetail(code, mode) {
        var isNew = mode === 'new';
        // Tên SP từ board (cho tiêu đề popup).
        var label = code;
        for (var i = 0; i < state.board.length; i++) {
            var v = (state.board[i].variants || []).find((x) => x.code === code);
            if (v) {
                label = state.board[i].name + (v.variant ? ' · ' + v.variant : '');
                break;
            }
        }
        if (window.Popup && window.Popup.ensureStyles) window.Popup.ensureStyles();
        var ov = document.createElement('div');
        ov.className = 'w2p-overlay lc-cart-overlay';
        ov.innerHTML =
            '<div class="w2p-card lc-cart-card">' +
            '<div class="lc-cart-head"><div class="lc-cart-title">' +
            (isNew ? '👤 Khách mới: ' : '🛒 Giỏ hàng: ') +
            esc(label) +
            '</div><button class="lc-cart-close" type="button" aria-label="Đóng">✕</button></div>' +
            '<div class="lc-cart-list w2p-scroll-area"><div class="lc-cart-empty">Đang tải…</div></div>' +
            '</div>';
        document.body.appendChild(ov);
        function close() {
            ov.remove();
            document.removeEventListener('keydown', onEsc);
        }
        function onEsc(e) {
            if (e.key === 'Escape') close();
        }
        document.addEventListener('keydown', onEsc);
        ov.addEventListener('click', function (e) {
            if (e.target === ov) close();
        });
        ov.querySelector('.lc-cart-close').addEventListener('click', close);
        try {
            var items = await window.Web2Campaign.getCartDetail(code);
            if (isNew) items = items.filter((it) => it.isNewCust);
            var listEl = ov.querySelector('.lc-cart-list');
            if (!items.length) {
                listEl.innerHTML =
                    '<div class="lc-cart-empty">' +
                    (isNew ? 'Chưa có khách mới nào.' : 'Chưa có ai trong giỏ.') +
                    '</div>';
                return;
            }
            var totalQty = items.reduce(function (a, it) {
                return a + (it.qty || 0);
            }, 0);
            listEl.innerHTML =
                '<div class="lc-cart-sum">' +
                items.length +
                ' khách · ' +
                totalQty +
                ' sản phẩm</div>' +
                items.map(cartRowHtml).join('');
        } catch (e) {
            ov.querySelector('.lc-cart-list').innerHTML =
                '<div class="lc-cart-empty">Lỗi tải: ' + esc(e && e.message) + '</div>';
        }
    }

    // ── Picker (thêm SP) ──────────────────────────────
    async function loadPicker() {
        var box = $('lcPicker');
        box.innerHTML = '<div class="lc-empty">Đang tải…</div>';
        try {
            var groups;
            if (state.pickerTab === 'pending') {
                var jp = await window.Web2ProductsApi.listPending();
                groups = window.Web2VariantGroup.group((jp && jp.items) || [], { by: 'parent' });
            } else {
                var jl = await window.Web2ProductsApi.list({
                    search: state.search || undefined,
                    activeOnly: true,
                    limit: 300,
                });
                groups = window.Web2VariantGroup.group((jl && jl.products) || [], { by: 'parent' });
            }
            // Lọc client theo search cho tab pending (server không filter tên).
            // Tìm theo MÃ SP + TÊN (+ NCC) — khớp placeholder "tên / mã / NCC".
            // Trước đây thiếu match MÃ → gõ mã SP không ra (bug 2026-06-25).
            if (state.pickerTab === 'pending' && state.search) {
                var q = state.search.toLowerCase();
                groups = groups.filter(
                    (g) =>
                        g.name.toLowerCase().includes(q) ||
                        (g.variants || []).some((v) =>
                            String(v.code || '')
                                .toLowerCase()
                                .includes(q)
                        ) ||
                        (g.supplier || '').toLowerCase().includes(q)
                );
            }
            state.pickerGroupsAll = groups; // nguồn để dựng chip địa danh
            // Lọc theo ĐỊA DANH (chip) — áp cả 2 tab.
            if (state.pickerRegion) {
                groups = groups.filter((g) => normRegion(g.region) === state.pickerRegion);
            }
            state.pickerGroups = groups;
            renderPicker();
        } catch (e) {
            box.innerHTML = '<div class="lc-empty">Lỗi: ' + esc(e && e.message) + '</div>';
        }
    }

    // Chip lọc ĐỊA DANH (Tất cả · Hà Nội · Hương Châu…) — dựng từ distinct region
    // của picker (trước khi lọc). Ẩn khi tắt showRegion hoặc không có địa danh nào.
    function regionChipsHtml() {
        if (!state.showRegion) return '';
        var seen = {};
        var regions = [];
        (state.pickerGroupsAll || []).forEach(function (g) {
            var r = (g.region || '').trim();
            var k = normRegion(r);
            if (r && !seen[k]) {
                seen[k] = 1;
                regions.push(r);
            }
        });
        if (!regions.length && !state.pickerRegion) return '';
        var chips =
            '<button class="lc-rchip' +
            (state.pickerRegion ? '' : ' is-active') +
            '" data-region="">Tất cả</button>';
        regions.forEach(function (r) {
            chips +=
                '<button class="lc-rchip' +
                (normRegion(r) === state.pickerRegion ? ' is-active' : '') +
                '" data-region="' +
                esc(normRegion(r)) +
                '">📍 ' +
                esc(r) +
                '</button>';
        });
        return '<div class="lc-rchips" id="lcRegionChips">' + chips + '</div>';
    }

    function pickerItemHtml(g) {
        var added = g.variants.every((v) => state.addedCodes.has(v.code));
        var img = g.imageUrl
            ? '<img class="lc-pimg" src="' + esc(safeImg(g.imageUrl)) + '" alt="" />'
            : '<span class="lc-pimg" style="display:grid;place-items:center">📦</span>';
        var v0 = (g.variants && g.variants[0]) || {};
        var meta = [];
        if (state.showRegion && g.region)
            meta.push('<span class="lc-region-badge">📍 ' + esc(g.region) + '</span>');
        if (g.suppliers && g.suppliers.length) meta.push(esc(g.suppliers.join(', ')));
        // by:'parent' → nhóm CHA–CON nhiều biến thể hiện "N biến thể"; SP phẳng 1 biến
        // thể hiện BIẾN THỂ (Màu/Size) + MÃ SP để phân biệt 2 SP trùng tên khác mã.
        if (g.variantCount > 1) meta.push(g.variantCount + ' biến thể');
        else if (v0.variant) meta.push(esc(v0.variant));
        if (g.variantCount <= 1 && v0.code)
            meta.push('<span class="lc-pcode">' + esc(v0.code) + '</span>');
        if (g.totalPending > 0) meta.push('<span class="cho">chờ ' + g.totalPending + '</span>');
        if (g.totalStock > 0) meta.push('tồn ' + g.totalStock);
        return (
            '<div class="lc-pitem' +
            (added ? ' is-added' : '') +
            '" data-key="' +
            esc(g.key) +
            '">' +
            img +
            '<div class="lc-pinfo"><div class="lc-pname">' +
            esc(g.name) +
            '</div><div class="lc-pmeta">' +
            meta.join(' · ') +
            '</div></div>' +
            '<button class="lc-addbtn" data-key="' +
            esc(g.key) +
            '"' +
            (added ? ' disabled' : '') +
            '>' +
            (added ? 'Đã thêm' : '+ Thêm') +
            '</button>' +
            '</div>'
        );
    }
    function renderPicker() {
        var box = $('lcPicker');
        if (!state.campaignId) {
            box.innerHTML = '<div class="lc-empty">Chọn chiến dịch trước.</div>';
            return;
        }
        var chips = regionChipsHtml();
        if (!state.pickerGroups.length) {
            box.innerHTML =
                chips +
                '<div class="lc-empty">' +
                (state.pickerRegion
                    ? 'Không có SP ở địa danh này.'
                    : state.pickerTab === 'pending'
                      ? 'Không có SP chờ hàng. Lưu nháp ở Sổ Order để tạo.'
                      : 'Không tìm thấy SP.') +
                '</div>';
            return;
        }
        var label =
            state.pickerTab === 'pending'
                ? '<div class="lc-pgroup-label">SP chờ hàng (Sổ Order)</div>'
                : '';
        box.innerHTML = chips + label + state.pickerGroups.map(pickerItemHtml).join('');
    }
    function refreshPickerAddedFlags() {
        if (state.pickerGroups.length) renderPicker();
    }
    // Re-lọc picker theo địa danh từ cache (KHÔNG refetch) khi bấm chip / toggle.
    function applyRegionFilter() {
        var groups = state.pickerGroupsAll || [];
        state.pickerGroups = state.pickerRegion
            ? groups.filter((g) => normRegion(g.region) === state.pickerRegion)
            : groups.slice();
        renderPicker();
    }

    async function addGroup(key) {
        var g = state.pickerGroups.find((x) => x.key === key);
        if (!g || !state.campaignId) return;
        var codes = g.variants.map((v) => v.code).filter((c) => !state.addedCodes.has(c));
        if (!codes.length) return;
        try {
            await window.Web2Campaign.addProducts(state.campaignId, codes);
            codes.forEach((c) => state.addedCodes.add(c));
            renderPicker();
            await loadBoard();
            toast('Đã thêm "' + g.name + '" lên TV', 'success');
        } catch (e) {
            toast('Lỗi thêm: ' + (e && e.message), 'error');
        }
    }

    // ── Lịch sử thao tác chiến dịch (module shared Web2AuditLog auto-load qua sidebar) ──
    function openHistory() {
        if (!state.campaignId) {
            if (window.notificationManager && window.notificationManager.show)
                window.notificationManager.show('Chưa chọn chiến dịch', 'warning');
            return;
        }
        window.Web2AuditLog?.openRecord?.({
            entity: 'campaign',
            entityId: state.campaignId,
            title: 'Lịch sử chiến dịch: ' + state.campaignId,
        });
    }

    // ── SSE ───────────────────────────────────────────
    var _campSseTimer = null;
    function onSse(msg) {
        var d = (msg && msg.data) || {};
        if (msg.topic === 'web2:campaign-products') {
            if (d.campaignId == null || Number(d.campaignId) === Number(state.campaignId))
                scheduleBoard();
        } else if (msg.topic === 'web2:products') {
            scheduleBoard();
            if (state.pickerTab === 'pending') loadPicker();
        } else if (msg.topic === 'web2:live-comments') {
            // Audit SSE 2026-06-25: chiến dịch tạo/xoá/gán ở máy khác → dropdown
            // <select id=lcCampaign> đứng yên tới khi F5 (trước đây bỏ qua topic
            // này). loadCampaigns() tự giữ lựa chọn hiện tại (cur = sel.value).
            if (d.action === 'campaign') {
                clearTimeout(_campSseTimer);
                _campSseTimer = setTimeout(function () {
                    loadCampaigns();
                }, 600);
            }
        }
    }

    // ── Wire ──────────────────────────────────────────
    function wire() {
        $('lcCampaign').addEventListener('change', function () {
            selectCampaign(this.value);
        });
        // (BỎ listener #lcNewBtn — tạo chiến dịch chuyển hẳn về live-chat)
        $('lcOpenTv').addEventListener('click', function () {
            if (state.campaignId)
                window.open('../live-tv/index.html?campaign=' + state.campaignId, '_blank');
        });
        $('lcHistory').addEventListener('click', openHistory);
        // Board ops + pending edit + bấm GIỎ/KH MỚI xem chi tiết (delegated)
        $('lcBoard').addEventListener('click', function (e) {
            var cart = e.target.closest('[data-cart].lc-clickable');
            if (cart) {
                openCartDetail(cart.dataset.cart, cart.dataset.cartMode);
                return;
            }
            var btn = e.target.closest('[data-op]');
            if (!btn) return;
            var grp = btn.closest('.lc-group');
            onBoardOp(btn.dataset.op, grp && grp.dataset.key);
        });
        // (2026-06-30 #2: BỎ listeners input NCC — không còn ô gõ NCC trên board.)
        // Picker — chip địa danh (lọc) + nút Thêm SP.
        $('lcPicker').addEventListener('click', function (e) {
            var chip = e.target.closest('.lc-rchip');
            if (chip) {
                state.pickerRegion = chip.dataset.region || '';
                applyRegionFilter();
                return;
            }
            var btn = e.target.closest('.lc-addbtn');
            if (btn && !btn.disabled) addGroup(btn.dataset.key);
        });
        // Toggle ẩn/hiện địa danh (chip + badge) — lưu localStorage.
        var regToggle = $('lcRegionToggle');
        if (regToggle)
            regToggle.addEventListener('click', function () {
                state.showRegion = !state.showRegion;
                try {
                    localStorage.setItem('lc_show_region', state.showRegion ? '1' : '0');
                } catch (e) {}
                regToggle.classList.toggle('is-on', state.showRegion);
                regToggle.setAttribute('aria-pressed', state.showRegion ? 'true' : 'false');
                if (!state.showRegion) state.pickerRegion = ''; // tắt → bỏ lọc
                applyRegionFilter();
            });
        document.querySelectorAll('.lc-tab').forEach(function (t) {
            t.addEventListener('click', function () {
                document
                    .querySelectorAll('.lc-tab')
                    .forEach((x) => x.classList.remove('is-active'));
                t.classList.add('is-active');
                state.pickerTab = t.dataset.tab;
                loadPicker();
            });
        });
        $('lcSearch').addEventListener('input', function () {
            state.search = this.value.trim();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadPicker, 300);
        });

        // ── Điều khiển màn TV: layout + presets + nav + bàn phím ──
        function onLayoutInput() {
            setTvLayout($('lcRows').value, $('lcCols').value);
        }
        if ($('lcRows')) $('lcRows').addEventListener('change', onLayoutInput);
        if ($('lcCols')) $('lcCols').addEventListener('change', onLayoutInput);
        var presets = $('lcPresets');
        if (presets)
            presets.addEventListener('click', function (e) {
                var b = e.target.closest('[data-preset]');
                if (!b) return;
                var rc = b.dataset.preset.split('x');
                setTvLayout(rc[0], rc[1]);
            });
        var tvNav = $('lcTvNav');
        if (tvNav)
            tvNav.addEventListener('click', function (e) {
                var b = e.target.closest('.lc-navbtn');
                if (b && !b.disabled) goTvPage(b.dataset.pg);
            });
        var rsel = $('lcRegion');
        if (rsel)
            rsel.addEventListener('change', async function () {
                var sel = this;
                var next = sel.value;
                var cur = state.tvControl.region;
                if (!next || next === cur) return;
                // CHỈ admin được đổi (select đã disabled cho non-admin; defensive revert
                // phòng DOM bị can thiệp).
                if (!isAdmin()) {
                    sel.value = cur;
                    toast('🔒 Chỉ admin được đổi địa danh KH', 'warning');
                    return;
                }
                // CẢNH BÁO trước khi đổi: ảnh hưởng ngay toàn bộ màn TV đang chiếu.
                var ok = true;
                if (window.Popup && window.Popup.confirm) {
                    ok = await window.Popup.confirm(
                        'Đổi địa danh CHO VƯỢT từ "' +
                            cur +
                            '" sang "' +
                            next +
                            '"?\n\nĐịa danh CHỌN = hàng có sẵn (lấy về rồi bán) → vùng đó được ĐẶT VƯỢT số NCC báo (badge VƯỢT). Vùng KHÔNG chọn = pre-order (bán mẫu trước, đặt sau). Đổi sẽ ÁP NGAY cho mọi người đang xem màn TV.',
                        { title: '⚠️ Đổi địa danh CHO VƯỢT', okText: 'Đổi địa danh', danger: true }
                    );
                } else {
                    ok = window.confirm('Đổi địa danh KH sang "' + next + '"?');
                }
                if (!ok) {
                    // Huỷ → trả lại địa danh HIỆN TẠI (đọc state, không phải snapshot cur:
                    // phòng SSE đổi region trong lúc dialog mở → select khớp state thật).
                    sel.value = state.tvControl.region;
                    return;
                }
                setTvRegion(next);
            });
        // Bàn phím: ←/→ lật trang, Home/End đầu/cuối, Space trang sau (bỏ khi đang gõ).
        document.addEventListener('keydown', function (e) {
            if (!state.campaignId) return;
            var t = e.target;
            if (
                t &&
                (t.tagName === 'INPUT' ||
                    t.tagName === 'TEXTAREA' ||
                    t.tagName === 'SELECT' ||
                    t.isContentEditable)
            )
                return;
            var op =
                e.key === 'ArrowLeft'
                    ? 'prev'
                    : e.key === 'ArrowRight'
                      ? 'next'
                      : e.key === 'Home'
                        ? 'first'
                        : e.key === 'End'
                          ? 'last'
                          : e.key === ' ' || e.code === 'Space'
                            ? 'next'
                            : null;
            if (op) {
                goTvPage(op);
                e.preventDefault();
            }
        });
    }

    async function boot() {
        if (window.Web2Sidebar && window.Web2Sidebar.mount)
            window.Web2Sidebar.mount('#web2Aside', { activeRoute: 'live-control' });
        try {
            state.showRegion = localStorage.getItem('lc_show_region') !== '0';
        } catch (e) {}
        wire();
        var regToggle0 = $('lcRegionToggle');
        if (regToggle0) {
            regToggle0.classList.toggle('is-on', state.showRegion);
            regToggle0.setAttribute('aria-pressed', state.showRegion ? 'true' : 'false');
        }
        if (window.Web2Campaign && window.Web2Campaign.subscribe)
            window.Web2Campaign.subscribe(onSse);
        // CŨNG nghe web2:products → đồng bộ tồn/chờ hàng khi máy khác sửa.
        if (window.Web2SSE && window.Web2SSE.subscribe) {
            window.Web2SSE.subscribe('web2:products', function (m) {
                onSse({ topic: 'web2:products', eventType: m.eventType, data: m.data });
            });
            // GIỎ HÀNG/KH MỚI = từ giỏ native-orders → đổi khi cart thay đổi. Nghe
            // web2:native-orders để board cập nhật GIỎ HÀNG/KH MỚI/CÒN realtime.
            window.Web2SSE.subscribe('web2:native-orders', function () {
                scheduleBoard();
            });
            // Điều khiển màn TV từ tab live-control khác (đa máy) → đồng bộ panel.
            window.Web2SSE.subscribe('web2:live-tv-control', function (m) {
                applyTvControlSse(m && m.data);
            });
        }
        await loadCampaigns();
        var saved = localStorage.getItem(LS_KEY);
        var params = new URLSearchParams(location.search);
        var cid = params.get('campaign') || saved;
        if (cid && $('lcCampaign').querySelector('option[value="' + cid + '"]'))
            selectCampaign(cid);
        else loadPicker();
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
