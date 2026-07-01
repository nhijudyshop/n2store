// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — TV livestream board (user1 xem). Realtime, read-only.
(function () {
    'use strict';

    var LS_KEY = 'ltv_campaign';
    var state = {
        campaignId: null,
        campaignName: '',
        codes: new Set(), // mã SP HIỂN THỊ (sau filter ghost/hết-hàng)
        allCodes: new Set(), // mã SP thành viên board (TRƯỚC filter) — dùng cho relevance SSE web2:products
        groups: [],
        // layout + trang + địa danh (do live-control điều khiển) — region đổi cột KH → CÒN
        control: { rows: 1, cols: 4, page: 0, region: 'HƯƠNG CHÂU' },
        _prevPage: 0, // để biết hướng slide khi đổi trang
    };
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
    // Người live xem (#2 2026-06-30): TỒN (tồn kho thật) · GIỎ (SL trong giỏ KH = v.sold)
    // · CHỜ (= max(0, GIỎ − TỒN) — cần đặt thêm). soldOut khi giỏ ≥ tồn (hết tồn).
    function variantRowHtml(v) {
        var label = v.variant && v.variant.trim() ? v.variant : '(mặc định)';
        var m = window.Web2LiveTvDisplay.khConModel(v);
        var soldOut = m.con <= 0; // hết tồn (GIỎ ≥ TỒN)
        return (
            '<div class="ltv-vrow' +
            (soldOut ? ' is-sold-out' : '') +
            '">' +
            '<span class="ltv-vlabel">' +
            esc(label) +
            '</span>' +
            '<span class="ltv-num ltv-num-ncc">' +
            m.stock +
            '<small>TỒN</small></span>' +
            '<span class="ltv-num ltv-num-ban">' +
            m.gio +
            '<small>GIỎ</small></span>' +
            '<span class="ltv-num ltv-num-con' +
            (m.choHang > 0 ? ' is-cho' : '') +
            '">' +
            m.choHang +
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
        // Trạng thái card (cảnh báo màu): hết hàng / sắp hết / nhiều KH mới.
        var st = (window.Web2LiveTvDisplay && window.Web2LiveTvDisplay.cardState(g)) || {};
        var cls = 'ltv-card';
        if (g.pinned) cls += ' is-pinned';
        if (st.soldOut) cls += ' is-card-soldout';
        else if (st.low) cls += ' is-card-low';
        if (st.hot) cls += ' is-card-hot';
        var warn = st.soldOut
            ? '<span class="ltv-warn-badge ltv-warn-out">HẾT HÀNG</span>'
            : st.low
              ? '<span class="ltv-warn-badge ltv-warn-low">SẮP HẾT · còn ' + st.con + '</span>'
              : '';
        var hot = st.hot
            ? '<span class="ltv-warn-badge ltv-warn-hot">🔥 ' + st.newCust + ' khách mới</span>'
            : '';
        return (
            '<article class="' +
            cls +
            '" data-img="' +
            esc(g.imageUrl || '') +
            '">' +
            '<div class="ltv-card-img" role="button" tabindex="0">' +
            img +
            pin +
            sup +
            warn +
            hot +
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

    function setPageInd(page, total) {
        var el = $('ltvPageInd');
        if (!el) return;
        el.textContent = 'Trang ' + page + '/' + total;
        el.hidden = total <= 1;
    }

    // Hiệu ứng slide khi ĐỔI TRANG (không chạy khi chỉ refresh data cùng trang).
    function animatePage(grid, dir) {
        grid.classList.remove('ltv-slide-l', 'ltv-slide-r');
        void grid.offsetWidth; // reflow để restart animation
        grid.classList.add(dir >= 0 ? 'ltv-slide-r' : 'ltv-slide-l');
    }

    function render() {
        var grid = $('ltvGrid');
        if (!state.groups.length) {
            showEmpty('Chiến dịch chưa có sản phẩm nào. Mở trang Điều khiển để thêm SP.', false);
            $('ltvCount').textContent = '0 sản phẩm';
            setPageInd(0, 0);
            return;
        }
        $('ltvEmpty').hidden = true;
        grid.hidden = false;
        var c = state.control;
        var pg = window.Web2LiveTvDisplay.paginate(state.groups, c.rows, c.cols, c.page);
        // Layout grid theo cấu hình (lấp đầy stage, không cuộn — mỗi trang vừa 1 màn).
        grid.style.gridTemplateColumns = 'repeat(' + c.cols + ', minmax(0, 1fr))';
        grid.style.gridTemplateRows = 'repeat(' + c.rows + ', minmax(0, 1fr))';
        grid.innerHTML = pg.pageGroups.map(cardHtml).join('');
        setPageInd(pg.page + 1, pg.totalPages);
        $('ltvCount').textContent = state.groups.length + ' sản phẩm';
        // Slide chỉ khi trang thực sự đổi.
        if (pg.page !== state._prevPage) {
            animatePage(grid, pg.page - state._prevPage);
            state._prevPage = pg.page;
        }
    }

    // ── Data ──────────────────────────────────────────
    async function reload() {
        if (state.campaignId == null) return;
        try {
            var items = await window.Web2Campaign.listProducts(state.campaignId);
            // Tập mã THÀNH VIÊN đầy đủ (TRƯỚC filter) — để relevance check của SSE
            // web2:products bắt được cả SP đang ẩn: SP bán hết (isActive=false→ẩn) rồi
            // NHẬP LẠI kho phải trigger reload để hiện lại trên TV. Nếu chỉ dùng codes
            // sau filter thì SP ẩn không bao giờ nằm trong tập → không reload (audit H2,
            // 2026-07-01).
            state.allCodes = new Set(
                items
                    .map(function (i) {
                        return i && i.code;
                    })
                    .filter(Boolean)
            );
            // Lọc GHOST (missing=true → SP xoá khỏi kho còn sót cp row) + HẾT HÀNG
            // (isActive===false → bán hết tự ẩn, logic mới 2026-06-28). Màn TV KHÔNG
            // gửi sync nên lọc client; board (live-control) sync sẽ dọn cp mồ côi.
            items = items.filter(function (it) {
                return it && !it.missing && it.isActive !== false;
            });
            state.codes = new Set(
                items.map(function (i) {
                    return i.code;
                })
            );
            // by:'parent' — gom SP CHA–CON thành 1 card nhiều biến thể (Migration 070):
            // parent_code khi có, fallback name+supplier+region. Vd ÁO SƠ MI LỤA Màu Ghi +
            // Màu Đỏ → 1 card 2 dòng biến thể (cardHtml render g.variants). Khác địa danh
            // vẫn tách (region trong key).
            state.groups = window.Web2VariantGroup.group(items, { by: 'parent' });
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

    // Tải trạng thái điều khiển (rows/cols/page) — gọi lúc chọn chiến dịch.
    async function loadControl() {
        if (state.campaignId == null) return;
        try {
            var c = await window.Web2Campaign.getTvControl(state.campaignId);
            if (c)
                state.control = {
                    rows: c.rows || 1,
                    cols: c.cols || 4,
                    page: c.page || 0,
                    region: c.region || 'HƯƠNG CHÂU',
                };
            if (state.groups.length) render();
        } catch (e) {
            /* default 1×4 — không chặn hiển thị */
        }
    }

    // Áp cấu hình điều khiển từ SSE (live-control lật trang / đổi layout) → render lại.
    function applyControl(d) {
        if (!d) return;
        if (d.campaignId != null && Number(d.campaignId) !== Number(state.campaignId)) return;
        state.control = {
            rows: Number(d.rows) || state.control.rows,
            cols: Number(d.cols) || state.control.cols,
            page: d.page != null ? Math.max(0, Number(d.page) || 0) : state.control.page,
            region: d.region != null ? d.region : state.control.region,
        };
        render();
    }

    // SSE: web2:campaign-products (membership) → reload nếu đúng chiến dịch.
    //      web2:products (tồn/chờ đổi) → reload nếu SP nằm trong board.
    function onSse(msg) {
        var d = (msg && msg.data) || {};
        if (msg.topic === 'web2:live-tv-control') {
            applyControl(d);
            return;
        }
        if (msg.topic === 'web2:campaign-products') {
            if (d.campaignId == null || Number(d.campaignId) === Number(state.campaignId))
                scheduleReload();
            return;
        }
        if (msg.topic === 'web2:products') {
            var touched = [];
            if (d.code) touched.push(String(d.code));
            if (Array.isArray(d.codes)) touched = touched.concat(d.codes.map(String));
            // So với tập THÀNH VIÊN đầy đủ (allCodes) — gồm cả SP đang ẩn (hết hàng) —
            // để SP nhập-lại kho hiện lại realtime (audit H2). Fallback codes nếu chưa reload.
            var member = state.allCodes && state.allCodes.size ? state.allCodes : state.codes;
            if (!touched.length || touched.some((c) => member.has(c))) scheduleReload();
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
        // Initial load: show skeleton grid while first fetch runs (overwritten by render()).
        if (!state.groups.length) {
            var grid = $('ltvGrid');
            if (window.Web2Skeleton) {
                $('ltvEmpty').hidden = true;
                grid.hidden = false;
                window.Web2Skeleton.grid(grid, { count: 10 });
            } else {
                showEmpty('Đang tải…', false);
            }
        }
        state._prevPage = 0;
        reload();
        loadControl();
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
        // CŨNG nghe web2:products → khi user2 nhập "số NCC báo" (pending_qty) hoặc
        // tồn kho đổi từ nguồn khác, TV tự cập nhật không refresh.
        if (window.Web2SSE && window.Web2SSE.subscribe) {
            window.Web2SSE.subscribe('web2:products', function (m) {
                onSse({ topic: 'web2:products', eventType: m.eventType, data: m.data });
            });
            // BÁN/CÒN phụ thuộc giỏ native-orders → nghe web2:native-orders để TV
            // cập nhật realtime khi KH thêm/bớt giỏ (không cần refresh).
            window.Web2SSE.subscribe('web2:native-orders', function () {
                scheduleReload();
            });
            // Điều khiển màn TV (live-control lật trang / đổi layout) → áp ngay.
            window.Web2SSE.subscribe('web2:live-tv-control', function (m) {
                onSse({ topic: 'web2:live-tv-control', eventType: m.eventType, data: m.data });
            });
        }
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
