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
        search: '',
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

    function vrowHtml(v) {
        var stockCls = v.stock <= 0 ? ' zero' : '';
        return (
            '<div class="lc-vrow">' +
            '<span class="lc-vname">' +
            esc(v.variant && v.variant.trim() ? v.variant : '(mặc định)') +
            '</span>' +
            '<span class="lc-vstock' +
            stockCls +
            '">Tồn ' +
            v.stock +
            '</span>' +
            '<span class="lc-pending-edit">' +
            '<label>Chờ</label>' +
            '<input class="lc-pending-input" type="number" min="0" inputmode="numeric" ' +
            'data-code="' +
            esc(v.code) +
            '" data-cur="' +
            v.pendingQty +
            '" value="' +
            v.pendingQty +
            '" />' +
            '</span>' +
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
            state.pickerGroups = groups;
            renderPicker();
        } catch (e) {
            box.innerHTML = '<div class="lc-empty">Lỗi: ' + esc(e && e.message) + '</div>';
        }
    }

    function pickerItemHtml(g) {
        var added = g.variants.every((v) => state.addedCodes.has(v.code));
        var img = g.imageUrl
            ? '<img class="lc-pimg" src="' + esc(safeImg(g.imageUrl)) + '" alt="" />'
            : '<span class="lc-pimg" style="display:grid;place-items:center">📦</span>';
        var meta = [];
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
        if (!state.pickerGroups.length) {
            box.innerHTML =
                '<div class="lc-empty">' +
                (state.pickerTab === 'pending'
                    ? 'Không có SP chờ hàng. Lưu nháp ở Sổ Order để tạo.'
                    : 'Không tìm thấy SP.') +
                '</div>';
            return;
        }
        var label =
            state.pickerTab === 'pending'
                ? '<div class="lc-pgroup-label">SP chờ hàng (Sổ Order)</div>'
                : '';
        box.innerHTML = label + state.pickerGroups.map(pickerItemHtml).join('');
    }
    function refreshPickerAddedFlags() {
        if (state.pickerGroups.length) renderPicker();
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
        // Picker
        $('lcPicker').addEventListener('click', function (e) {
            var btn = e.target.closest('.lc-addbtn');
            if (btn && !btn.disabled) addGroup(btn.dataset.key);
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
        wire();
        if (window.Web2Campaign && window.Web2Campaign.subscribe)
            window.Web2Campaign.subscribe(onSse);
        // CŨNG nghe web2:products → đồng bộ tồn/chờ hàng khi máy khác sửa.
        if (window.Web2SSE && window.Web2SSE.subscribe) {
            window.Web2SSE.subscribe('web2:products', function (m) {
                onSse({ topic: 'web2:products', eventType: m.eventType, data: m.data });
            });
        }
        await loadCampaigns();
        var saved = localStorage.getItem(LS_KEY);
        var params = new URLSearchParams(location.search);
        var cid = params.get('campaign') || saved;
        if (cid && $('lcCampaign').querySelector('option[value="' + cid + '"]'))
            selectCampaign(cid);
        else loadPicker();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
