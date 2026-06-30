// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Thống kê tương tác FB: tính từ bài đăng (like/cmt/share) + follower.
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    let _pages = [];
    let _pageId = null;
    let _limit = 50;
    let _hadData = false; // true sau lần render thành công đầu tiên
    const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    function $(id) {
        return document.getElementById(id);
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    function nfmt(n) {
        return (Number(n) || 0).toLocaleString('vi-VN');
    }
    function parseTs(s) {
        if (!s) return 0;
        const t = new Date(s).getTime();
        return isNaN(t) ? 0 : t;
    }
    function fmtDate(s) {
        const t = parseTs(s);
        return t
            ? new Date(t).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : '';
    }
    function typeLabel(p) {
        if (p.type === 'live') return p.living ? '🔴 Đang Live' : '📺 Đã Live';
        if (p.type === 'video') return '🎬 Video';
        if (p.type === 'photo') return '🖼️ Hình';
        return '📝 Bài viết';
    }
    // Giờ GMT+7 của 1 timestamp
    function hourVN(s) {
        const t = parseTs(s);
        if (!t) return null;
        return Number(
            new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                hour12: false,
            }).format(new Date(t))
        );
    }
    function dowVN(s) {
        const t = parseTs(s);
        if (!t) return null;
        const wd = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            weekday: 'short',
        }).format(new Date(t));
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    }

    function card(label, value, sub) {
        return `<div class="fbp-card" style="margin:0;text-align:center;padding:14px">
            <div style="font-size:1.7rem;font-weight:800;color:var(--web2-primary,#0068ff)">${value}</div>
            <div style="font-size:.82rem;color:#6b7a8d;font-weight:700;margin-top:2px">${label}</div>
            ${sub ? `<div style="font-size:.72rem;color:#94a3b8;margin-top:2px">${sub}</div>` : ''}
        </div>`;
    }

    function bar(label, value, max, extra) {
        const pct = max > 0 ? Math.round((value / max) * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:.82rem">
            <div style="width:56px;flex:0 0 auto;color:#6b7a8d;font-weight:700">${esc(label)}</div>
            <div style="flex:1;background:#eef2f7;border-radius:6px;overflow:hidden;height:18px">
                <div style="width:${pct}%;height:100%;background:var(--web2-primary,#0068ff);border-radius:6px"></div>
            </div>
            <div style="width:74px;flex:0 0 auto;text-align:right;color:#5a6b80">${extra || nfmt(value)}</div>
        </div>`;
    }

    function render(data) {
        window.Web2FbInsightsData = data; // expose full cho widget AI (Web2AiPageRegistry)
        const posts = data.posts || [];
        const withEng = data.hasEngagement;
        const totLike = posts.reduce((s, p) => s + (p.likes || 0), 0);
        const totCmt = posts.reduce((s, p) => s + (p.comments || 0), 0);
        const totShare = posts.reduce((s, p) => s + (p.shares || 0), 0);
        const totEng = totLike + totCmt + totShare;
        const avg = posts.length ? Math.round(totEng / posts.length) : 0;
        // phân loại
        const byType = posts.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {});
        // khung giờ + thứ (engagement trung bình)
        const byHour = {};
        const byDow = {};
        posts.forEach((p) => {
            const h = hourVN(p.createdTime);
            const d = dowVN(p.createdTime);
            if (h != null) {
                byHour[h] = byHour[h] || { n: 0, e: 0 };
                byHour[h].n++;
                byHour[h].e += p.total || 0;
            }
            if (d != null) {
                byDow[d] = byDow[d] || { n: 0, e: 0 };
                byDow[d].n++;
                byDow[d].e += p.total || 0;
            }
        });
        const hourRows = Object.entries(byHour)
            .map(([h, v]) => ({ h: +h, avg: Math.round(v.e / v.n), n: v.n }))
            .sort((a, b) => b.avg - a.avg);
        const maxHour = hourRows[0] ? hourRows[0].avg : 0;
        const dowRows = DOW.map((lbl, i) => ({
            lbl,
            avg: byDow[i] ? Math.round(byDow[i].e / byDow[i].n) : 0,
            n: byDow[i] ? byDow[i].n : 0,
        }));
        const maxDow = Math.max(1, ...dowRows.map((r) => r.avg));
        const top = posts
            .slice()
            .sort((a, b) => (b.total || 0) - (a.total || 0))
            .slice(0, 10);

        // ── Insights THẬT (read_insights) ────────────────────────────────────
        const hasInsights = !!data.hasInsights;
        const pi = data.pageInsights || {};
        const piAvail = (data.insightsAvailable || []).length > 0;
        // ⚠ FB đã KHAI TỬ reach/impressions per-post → chỉ còn clicks + video views.
        const someClicks = posts.some((p) => p.clicks != null);
        const totClicks = posts.reduce((s, p) => s + (p.clicks || 0), 0);
        const totReactions = posts.reduce(
            (s, p) => s + (p.reactions != null ? p.reactions : p.likes || 0),
            0
        );
        // số người xem live (đồng thời) — chỉ bài đang/đã live có liveViews
        const liveRows = posts.filter((p) => p.type === 'live' && p.liveViews != null);

        // Cảnh báo: ưu tiên insights; chỉ cảnh báo khi KHÔNG có cả insights lẫn like/cmt.
        const engNote =
            hasInsights || piAvail
                ? ''
                : withEng
                  ? ''
                  : '<div class="fbp-card" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412">⚠ Chưa lấy được số liệu chi tiết. Vào <a href="../fb-posts/index.html" style="color:#0068ff;font-weight:700">Đăng bài Facebook</a> → "Đăng nhập lại (cấp thêm quyền)" để bật quyền <b>read_insights</b> (reach/impressions thật).</div>';

        $('fbiBody').innerHTML = `
            ${pageSelectorHtml()}
            ${engNote}
            <div class="fbp-card"><h3><i data-lucide="users"></i> Tổng quan page</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
                    ${card('Người theo dõi', nfmt(data.page.followers ?? data.page.fans ?? 0))}
                    ${card('Đang nói đến', nfmt(data.page.talkingAbout ?? 0), '7 ngày qua')}
                    ${card('Số bài phân tích', nfmt(posts.length))}
                    ${card('TB tương tác/bài', nfmt(avg))}
                </div>
            </div>
            ${
                piAvail
                    ? `<div class="fbp-card"><h3><i data-lucide="trending-up"></i> Số liệu trang THẬT (28 ngày qua)</h3>
                <div style="font-size:.76rem;color:#94a3b8;margin-bottom:8px">Từ Facebook Insights (read_insights) — không phải ước lượng.</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
                    ${pi.page_impressions_unique != null ? card('Tiếp cận (reach)', nfmt(pi.page_impressions_unique), '28 ngày') : ''}
                    ${pi.page_impressions != null ? card('Lượt hiển thị', nfmt(pi.page_impressions), '28 ngày') : ''}
                    ${pi.page_post_engagements != null ? card('Lượt tương tác', nfmt(pi.page_post_engagements), '28 ngày') : ''}
                    ${pi.page_views_total != null ? card('Lượt xem trang', nfmt(pi.page_views_total), '28 ngày') : ''}
                    ${pi.page_fan_adds_unique != null ? card('Follow mới', nfmt(pi.page_fan_adds_unique), '28 ngày') : ''}
                    ${pi.page_fan_removes_unique != null ? card('Bỏ follow', nfmt(pi.page_fan_removes_unique), '28 ngày') : ''}
                </div>
            </div>`
                    : ''
            }
            ${
                liveRows.length
                    ? `<div class="fbp-card"><h3><i data-lucide="radio"></i> Livestream gần đây — người xem</h3>
                <div style="font-size:.76rem;color:#94a3b8;margin-bottom:6px">👁 = người xem đồng thời (live_views) — dữ liệu Pancake KHÔNG có.</div>
                ${liveRows
                    .slice(0, 8)
                    .map(
                        (p) =>
                            `<div class="fbp-post"><div class="fbp-post-body"><p class="fbp-post-msg">${esc(p.message) || '<i>(không nội dung)</i>'}</p>
                            <div class="fbp-post-meta"><span>${fmtDate(p.createdTime)}</span><span>👁 <b>${nfmt(p.liveViews)}</b> xem</span>${p.videoViews != null ? `<span>▶️ <b>${nfmt(p.videoViews)}</b> lượt xem video</span>` : ''}</div></div></div>`
                    )
                    .join('')}
            </div>`
                    : ''
            }
            <div class="fbp-card"><h3><i data-lucide="heart"></i> Tổng tương tác (${posts.length} bài gần nhất)</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
                    ${card('Tổng tương tác', nfmt(hasInsights ? totReactions + totCmt + totShare : totEng))}
                    ${card('👍 Cảm xúc', nfmt(hasInsights ? totReactions : totLike))}
                    ${card('💬 Bình luận', nfmt(totCmt))}
                    ${card('🔁 Chia sẻ', nfmt(totShare))}
                    ${someClicks ? card('🖱 Lượt bấm', nfmt(totClicks), 'tổng các bài') : ''}
                </div>
            </div>
            <div class="fbp-card"><h3><i data-lucide="layers"></i> Phân loại bài</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${[
                        ['live', '🔴 Livestream'],
                        ['video', '🎬 Video'],
                        ['photo', '🖼️ Hình'],
                        ['text', '📝 Bài viết'],
                    ]
                        .map(
                            ([k, l]) =>
                                `<span class="fbp-status">${l}: <b>${byType[k] || 0}</b></span>`
                        )
                        .join('')}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
                <div class="fbp-card"><h3><i data-lucide="clock"></i> Khung giờ đăng hiệu quả</h3>
                    <div style="font-size:.78rem;color:#94a3b8;margin-bottom:6px">TB tương tác/bài theo giờ (GMT+7), cao → thấp</div>
                    ${
                        hourRows.length
                            ? hourRows
                                  .slice(0, 8)
                                  .map((r) =>
                                      bar(`${r.h}h`, r.avg, maxHour, `${nfmt(r.avg)} (${r.n} bài)`)
                                  )
                                  .join('')
                            : '<div class="fbp-empty">—</div>'
                    }
                </div>
                <div class="fbp-card"><h3><i data-lucide="calendar"></i> Thứ trong tuần hiệu quả</h3>
                    <div style="font-size:.78rem;color:#94a3b8;margin-bottom:6px">TB tương tác/bài theo thứ</div>
                    ${dowRows.map((r) => bar(r.lbl, r.avg, maxDow, `${nfmt(r.avg)} (${r.n})`)).join('')}
                </div>
            </div>
            <div class="fbp-card"><h3><i data-lucide="trophy"></i> Top bài tương tác cao nhất</h3>
                ${top.map((p, i) => topRow(p, i)).join('') || '<div class="fbp-empty">Chưa có bài.</div>'}
            </div>
        `;
        wirePageSelector();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _hadData = true;
    }

    function topRow(p, i) {
        return `<div class="fbp-post">
            <div style="flex:0 0 auto;width:28px;text-align:center;font-weight:800;color:var(--web2-primary,#0068ff)">${i + 1}</div>
            ${p.picture ? `<img class="fbp-post-thumb" src="${esc(p.picture)}" loading="lazy" alt="" />` : ''}
            <div class="fbp-post-body">
                <p class="fbp-post-msg">${esc(p.message) || '<i>(không nội dung)</i>'}</p>
                <div class="fbp-post-meta">
                    <span>${esc(typeLabel(p))}</span><span>${fmtDate(p.createdTime)}</span>
                    ${p.clicks != null ? `<span>🖱 <b>${nfmt(p.clicks)}</b> bấm</span>` : ''}
                    ${p.videoViews != null && p.videoViews > 0 ? `<span>▶️ <b>${nfmt(p.videoViews)}</b></span>` : ''}
                    <span>👍 <b>${nfmt(p.reactions != null ? p.reactions : p.likes)}</b></span><span>💬 <b>${nfmt(p.comments)}</b></span>
                    <span>🔁 <b>${nfmt(p.shares)}</b></span><span style="color:var(--web2-primary,#0068ff)">Σ <b>${nfmt(p.total)}</b></span>
                </div>
            </div>
            ${p.permalink ? `<div class="fbp-post-actions"><a class="fbp-btn ghost sm" href="${esc(p.permalink)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i></a></div>` : ''}
        </div>`;
    }

    function pageSelectorHtml() {
        return `<div class="fbp-card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span style="font-weight:700">Page:</span>
            <div class="fbp-pages" id="fbiPages" style="flex:1">
                ${_pages.map((p) => `<button type="button" class="fbp-page-chip ${p.id === _pageId ? 'on' : ''}" data-pid="${esc(p.id)}">${p.picture ? `<img src="${esc(p.picture)}" alt=""/>` : ''}<span>${esc(p.name)}</span></button>`).join('')}
            </div>
            <select class="fbp-input" id="fbiLimit" style="max-width:150px">
                <option value="25">25 bài gần nhất</option>
                <option value="50" selected>50 bài gần nhất</option>
                <option value="100">100 bài gần nhất</option>
            </select>
        </div></div>`;
    }
    function wirePageSelector() {
        document.querySelectorAll('#fbiPages .fbp-page-chip').forEach((c) =>
            c.addEventListener('click', () => {
                _pageId = c.dataset.pid;
                load();
            })
        );
        const lim = $('fbiLimit');
        if (lim) {
            lim.value = String(_limit);
            lim.addEventListener('change', () => {
                _limit = Number(lim.value) || 50;
                load();
            });
        }
    }

    async function load() {
        // Lần đầu chưa có dữ liệu → skeleton; reload/đổi page→ spinner nhẹ (tránh nháy cả khối).
        if (!_hadData && window.Web2Skeleton) {
            $('fbiBody').innerHTML = pageSelectorHtml() + '<div id="fbiSk"></div>';
            wirePageSelector();
            window.Web2Skeleton.stats('#fbiSk', { count: 4 });
        } else {
            $('fbiBody').innerHTML =
                pageSelectorHtml() +
                '<div class="fbp-empty"><i data-lucide="loader"></i> Đang tính thống kê…</div>';
            wirePageSelector();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            const r = await Api().engagement(_pageId, _limit);
            if (!r.success) {
                $('fbiBody').innerHTML =
                    pageSelectorHtml() + `<div class="fbp-empty">${esc(r.error || 'Lỗi')}</div>`;
                wirePageSelector();
                return;
            }
            render(r);
        } catch (e) {
            $('fbiBody').innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    async function init() {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            const st = await Api().status();
            const pill = $('fbiConnPill');
            if (!st.connected || !(st.pages || []).length) {
                pill.className = 'fbp-pill is-off';
                pill.innerHTML = '<i data-lucide="x-circle"></i> Chưa kết nối';
                $('fbiBody').innerHTML =
                    '<div class="fbp-empty"><div class="empty-state-icon">🔌</div>Chưa kết nối Facebook. Vào <a href="../fb-posts/index.html" style="color:var(--web2-primary,#0068ff);font-weight:700">Đăng bài Facebook</a> để kết nối.</div>';
                if (window.lucide?.createIcons) window.lucide.createIcons();
                return;
            }
            _pages = st.pages;
            _pageId = _pages[0].id;
            pill.className = 'fbp-pill is-on';
            pill.innerHTML = `<i data-lucide="check-circle-2"></i> ${esc(st.user?.name || '')} · ${_pages.length} page`;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            load();
        } catch (e) {
            $('fbiBody').innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
