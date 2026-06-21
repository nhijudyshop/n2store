// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — TV livestream board (user1 xem). Realtime, read-only.
(function () {
    'use strict';

    var LS_KEY = 'ltv_campaign';
    var state = { campaignId: null, campaignName: '', codes: new Set(), groups: [] };
    var reloadTimer = null;

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

    function fmtTime(ts) {
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            }).format(new Date(ts));
        } catch (e) {
            return '';
        }
    }

    function hasToken() {
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            return !!(t && t.token);
        } catch (e) {
            return false;
        }
    }

    function showEmpty(msg, isError) {
        var empty = $('ltvEmpty');
        var grid = $('ltvGrid');
        $('ltvEmptyMsg').textContent = msg;
        $('ltvEmpty').querySelector('.ltv-empty-emoji').textContent = isError ? '⚠️' : '📺';
        empty.hidden = false;
        grid.hidden = true;
    }

    // ── Render ────────────────────────────────────────
    function variantRowHtml(v) {
        var label = v.variant && v.variant.trim() ? v.variant : '(mặc định)';
        var soldOut = v.stock <= 0 && v.pendingQty <= 0;
        var stockZero = v.stock <= 0 ? ' is-zero' : '';
        var pendZero = v.pendingQty <= 0 ? ' is-zero' : '';
        return (
            '<div class="ltv-vrow' +
            (soldOut ? ' is-sold-out' : '') +
            '">' +
            '<span class="ltv-vlabel">' +
            esc(label) +
            '</span>' +
            '<span class="ltv-num ltv-num-stock' +
            stockZero +
            '">' +
            v.stock +
            '<small>TỒN</small></span>' +
            '<span class="ltv-num ltv-num-pending' +
            pendZero +
            '">' +
            v.pendingQty +
            '<small>CHỜ</small></span>' +
            '</div>'
        );
    }

    function cardHtml(g) {
        var img = g.imageUrl
            ? '<img src="' +
              esc(safeImg(g.imageUrl)) +
              '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.classList.add(\'ltv-img-fail\')" />'
            : '<div class="ltv-noimg">📦</div>';
        var pin = g.pinned ? '<span class="ltv-pin-badge">📌 GHIM</span>' : '';
        var sup = g.supplier
            ? '<span class="ltv-supplier-badge">' + esc(g.supplier) + '</span>'
            : '';
        var rows = g.variants.map(variantRowHtml).join('');
        return (
            '<article class="ltv-card' +
            (g.pinned ? ' is-pinned' : '') +
            '" data-img="' +
            esc(g.imageUrl || '') +
            '">' +
            '<div class="ltv-card-img" role="button" tabindex="0">' +
            img +
            pin +
            sup +
            '</div>' +
            '<div class="ltv-card-body">' +
            '<h2 class="ltv-card-name">' +
            esc(g.name) +
            '</h2>' +
            '<div class="ltv-variants">' +
            rows +
            '</div>' +
            '</div>' +
            '</article>'
        );
    }

    function render() {
        var grid = $('ltvGrid');
        if (!state.groups.length) {
            showEmpty('Chiến dịch chưa có sản phẩm nào. Mở trang Điều khiển để thêm SP.', false);
            $('ltvCount').textContent = '0 sản phẩm';
            return;
        }
        $('ltvEmpty').hidden = true;
        grid.hidden = false;
        grid.innerHTML = state.groups.map(cardHtml).join('');
        var nSp = state.groups.length;
        var nVar = state.groups.reduce(function (a, g) {
            return a + g.variantCount;
        }, 0);
        $('ltvCount').textContent =
            nSp + ' sản phẩm' + (nVar > nSp ? ' · ' + nVar + ' biến thể' : '');
    }

    // ── Data ──────────────────────────────────────────
    async function reload() {
        if (state.campaignId == null) return;
        try {
            var items = await window.Web2Campaign.listProducts(state.campaignId);
            state.codes = new Set(
                items.map(function (i) {
                    return i.code;
                })
            );
            state.groups = window.Web2VariantGroup.group(items, { by: 'name' });
            render();
            $('ltvSync').textContent = 'Cập nhật ' + fmtTime(Date.now());
            $('ltvLiveDot').classList.add('is-live');
        } catch (e) {
            if (e && e.status === 401) {
                showEmpty('Cần đăng nhập Web 2.0 trên thiết bị này (mở /web2/login).', true);
            } else {
                showEmpty('Lỗi tải dữ liệu: ' + (e && e.message), true);
            }
            $('ltvLiveDot').classList.remove('is-live');
        }
    }

    function scheduleReload() {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(reload, 500);
    }

    // SSE: web2:campaign-products (membership) → reload nếu đúng chiến dịch.
    //      web2:products (tồn/chờ đổi) → reload nếu SP nằm trong board.
    function onSse(msg) {
        var d = (msg && msg.data) || {};
        if (msg.topic === 'web2:campaign-products') {
            if (d.campaignId == null || Number(d.campaignId) === Number(state.campaignId))
                scheduleReload();
            return;
        }
        if (msg.topic === 'web2:products') {
            var touched = [];
            if (d.code) touched.push(String(d.code));
            if (Array.isArray(d.codes)) touched = touched.concat(d.codes.map(String));
            if (!touched.length || touched.some((c) => state.codes.has(c))) scheduleReload();
        }
    }

    // ── Campaign picker ───────────────────────────────
    async function openPicker() {
        var ov = $('ltvPicker');
        var list = $('ltvPickerList');
        list.innerHTML = '<p style="color:var(--ltv-muted)">Đang tải…</p>';
        ov.hidden = false;
        try {
            var camps = await window.Web2Campaign.list();
            if (!camps.length) {
                list.innerHTML =
                    '<p style="color:var(--ltv-muted)">Chưa có chiến dịch nào. Tạo ở trang Điều khiển.</p>';
                return;
            }
            list.innerHTML = camps
                .map(function (c) {
                    return (
                        '<button class="ltv-picker-item" data-id="' +
                        c.id +
                        '" data-name="' +
                        esc(c.name) +
                        '">' +
                        '<span class="ltv-pi-name">' +
                        esc(c.name) +
                        '</span>' +
                        '<span class="ltv-pi-meta">' +
                        (c.post_count || 0) +
                        ' bài</span>' +
                        '</button>'
                    );
                })
                .join('');
        } catch (e) {
            list.innerHTML =
                '<p style="color:var(--ltv-danger)">Lỗi: ' + esc(e && e.message) + '</p>';
        }
    }

    function setCampaign(id, name) {
        state.campaignId = Number(id);
        state.campaignName = name || '';
        $('ltvCampaignName').textContent = name || 'Chiến dịch #' + id;
        try {
            localStorage.setItem(LS_KEY, String(id));
        } catch (e) {}
        var u = new URL(location.href);
        u.searchParams.set('campaign', id);
        history.replaceState(null, '', u);
        reload();
    }

    // ── Wire ──────────────────────────────────────────
    function wire() {
        $('ltvPickBtn').addEventListener('click', openPicker);
        $('ltvPickerClose').addEventListener('click', function () {
            $('ltvPicker').hidden = true;
        });
        $('ltvPickerList').addEventListener('click', function (e) {
            var btn = e.target.closest('.ltv-picker-item');
            if (!btn) return;
            $('ltvPicker').hidden = true;
            setCampaign(btn.dataset.id, btn.dataset.name);
        });
        $('ltvFsBtn').addEventListener('click', function () {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(function () {});
        });
        // Tap ảnh → phóng to
        $('ltvGrid').addEventListener('click', function (e) {
            var box = e.target.closest('.ltv-card-img');
            if (!box) return;
            var card = box.closest('.ltv-card');
            var url = card && card.dataset.img;
            if (url && window.Web2ImageLightbox && window.Web2ImageLightbox.open) {
                window.Web2ImageLightbox.open([url], 0);
            }
        });
    }

    function boot() {
        wire();
        if (!hasToken()) {
            showEmpty('Cần đăng nhập Web 2.0 trên thiết bị này (mở /web2/login).', true);
            return;
        }
        window.Web2Campaign.subscribe(onSse);
        var params = new URLSearchParams(location.search);
        var cid = params.get('campaign') || localStorage.getItem(LS_KEY);
        if (cid) {
            setCampaign(cid, '');
            // Lấy tên chiến dịch (best-effort) cho header.
            window.Web2Campaign.list()
                .then(function (camps) {
                    var c = camps.find(function (x) {
                        return Number(x.id) === Number(cid);
                    });
                    if (c) {
                        state.campaignName = c.name;
                        $('ltvCampaignName').textContent = c.name;
                    } else {
                        openPicker(); // chiến dịch đã xoá → chọn lại
                    }
                })
                .catch(function () {});
        } else {
            showEmpty('Chọn chiến dịch để bắt đầu chiếu.', false);
            openPicker();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
