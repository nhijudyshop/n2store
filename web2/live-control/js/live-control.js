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

    async function createCampaign() {
        var name = null;
        if (window.Popup && window.Popup.prompt) {
            name = await window.Popup.prompt('Tên chiến dịch livestream (vd: Live 21/06 tối):', {
                title: 'Tạo chiến dịch',
                placeholder: 'Tên chiến dịch',
                okText: 'Tạo',
            });
        } else {
            name = window.prompt('Tên chiến dịch livestream:');
        }
        name = (name || '').trim();
        if (!name) return;
        try {
            var id = await window.Web2Campaign.create(name);
            await loadCampaigns(id);
            selectCampaign(id);
            toast('Đã tạo chiến dịch', 'success');
        } catch (e) {
            toast('Lỗi tạo: ' + (e && e.message), 'error');
        }
    }

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
        } else {
            state.board = [];
            state.addedCodes = new Set();
            renderBoard();
        }
    }

    // ── Board (SP trong chiến dịch) ───────────────────
    async function loadBoard() {
        if (!state.campaignId) return;
        try {
            var items = await window.Web2Campaign.listProducts(state.campaignId);
            state.addedCodes = new Set(items.map((i) => i.code));
            state.board = window.Web2VariantGroup.group(items, { by: 'name' });
            renderBoard();
            refreshPickerAddedFlags();
        } catch (e) {
            toast('Lỗi tải SP chiến dịch: ' + (e && e.message), 'error');
        }
    }
    function scheduleBoard() {
        clearTimeout(boardTimer);
        boardTimer = setTimeout(function () {
            if (!state.editing) loadBoard();
        }, 600);
    }

    // Board "Trên TV" mỗi biến thể: NCC (ô nhập "số NCC báo" = pending_qty) + BÁN
    // (SL trong giỏ KH, gồm cọc) + CỌC (SL giỏ có đặt cọc) + CÒN (= max(0, NCC−BÁN),
    // BÁN đã gồm cọc nên KHÔNG trừ cọc lần nữa). BÁN/CỌC/CÒN read-only (tự tính).
    function vrowHtml(v) {
        var ncc = Number(v.pendingQty) || 0;
        var ban = Number(v.sold) || 0;
        var coc = Number(v.coc) || 0;
        var con = Math.max(0, ncc - ban);
        var conCls = con <= 0 ? ' zero' : '';
        return (
            '<div class="lc-vrow">' +
            '<span class="lc-vname">' +
            esc(v.variant && v.variant.trim() ? v.variant : '(mặc định)') +
            '</span>' +
            '<span class="lc-pending-edit" title="Số NCC báo (sửa được)">' +
            '<label>NCC</label>' +
            '<input class="lc-pending-input" type="number" min="0" inputmode="numeric" ' +
            'data-code="' +
            esc(v.code) +
            '" data-cur="' +
            ncc +
            '" value="' +
            ncc +
            '" />' +
            '</span>' +
            '<span class="lc-vnum lc-vban" title="Đã vào giỏ khách (gồm cọc)">' +
            ban +
            '<small>BÁN</small></span>' +
            '<span class="lc-vnum lc-vcoc" title="SL trong giỏ đã đặt cọc">' +
            coc +
            '<small>CỌC</small></span>' +
            '<span class="lc-vnum lc-vcon' +
            conCls +
            '" title="Còn lại = NCC − Bán (≥ 0)">' +
            con +
            '<small>CÒN</small></span>' +
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

    // Nhập "số NCC báo" → pending_qty (delta qua adjustPending).
    async function savePending(input) {
        var code = input.dataset.code;
        var cur = Number(input.dataset.cur) || 0;
        var next = Math.max(0, Math.floor(Number(input.value) || 0));
        if (next === cur) {
            input.classList.remove('saving');
            return;
        }
        input.classList.add('saving');
        input.disabled = true;
        try {
            // setPending = set tuyệt đối "số NCC báo" + broadcast web2:campaign-products
            // (topic TV nghe được realtime; adjust-pending dùng web2:products không tới TV).
            await window.Web2Campaign.setPending(state.campaignId, code, next);
            input.dataset.cur = String(next);
            input.value = String(next);
            input.classList.remove('saving');
            input.classList.add('saved');
            setTimeout(() => input.classList.remove('saved'), 1200);
        } catch (e) {
            input.value = String(cur); // rollback
            input.classList.remove('saving');
            toast('Lỗi lưu số chờ hàng: ' + (e && e.message), 'error');
        } finally {
            input.disabled = false;
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
                groups = window.Web2VariantGroup.group((jp && jp.items) || [], { by: 'name' });
            } else {
                var jl = await window.Web2ProductsApi.list({
                    search: state.search || undefined,
                    activeOnly: true,
                    limit: 300,
                });
                groups = window.Web2VariantGroup.group((jl && jl.products) || [], { by: 'name' });
            }
            // Lọc client theo search cho tab pending (server không filter tên).
            if (state.pickerTab === 'pending' && state.search) {
                var q = state.search.toLowerCase();
                groups = groups.filter(
                    (g) =>
                        g.name.toLowerCase().includes(q) ||
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
        var meta = [];
        if (state.showRegion && g.region)
            meta.push('<span class="lc-region-badge">📍 ' + esc(g.region) + '</span>');
        if (g.suppliers && g.suppliers.length) meta.push(esc(g.suppliers.join(', ')));
        meta.push(g.variantCount + ' biến thể');
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
    function onSse(msg) {
        var d = (msg && msg.data) || {};
        if (msg.topic === 'web2:campaign-products') {
            if (d.campaignId == null || Number(d.campaignId) === Number(state.campaignId))
                scheduleBoard();
        } else if (msg.topic === 'web2:products') {
            scheduleBoard();
            if (state.pickerTab === 'pending') loadPicker();
        }
    }

    // ── Wire ──────────────────────────────────────────
    function wire() {
        $('lcCampaign').addEventListener('change', function () {
            selectCampaign(this.value);
        });
        $('lcNewBtn').addEventListener('click', createCampaign);
        $('lcOpenTv').addEventListener('click', function () {
            if (state.campaignId)
                window.open('../live-tv/index.html?campaign=' + state.campaignId, '_blank');
        });
        $('lcHistory').addEventListener('click', openHistory);
        // Board ops + pending edit (delegated)
        $('lcBoard').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-op]');
            if (!btn) return;
            var grp = btn.closest('.lc-group');
            onBoardOp(btn.dataset.op, grp && grp.dataset.key);
        });
        $('lcBoard').addEventListener('focusin', function (e) {
            if (e.target.classList.contains('lc-pending-input')) state.editing = true;
        });
        $('lcBoard').addEventListener('change', function (e) {
            if (e.target.classList.contains('lc-pending-input')) savePending(e.target);
        });
        $('lcBoard').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.classList.contains('lc-pending-input'))
                e.target.blur();
        });
        $('lcBoard').addEventListener('focusout', function (e) {
            if (e.target.classList.contains('lc-pending-input'))
                setTimeout(() => (state.editing = false), 50);
        });
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
            // BÁN/CỌC = SL trong giỏ native-orders → đổi khi cart thay đổi. Nghe
            // web2:native-orders để board cập nhật BÁN/CỌC/CÒN realtime (không refresh).
            window.Web2SSE.subscribe('web2:native-orders', function () {
                scheduleBoard();
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
