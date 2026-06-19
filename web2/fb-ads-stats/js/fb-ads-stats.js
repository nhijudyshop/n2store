// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Thống kê quảng cáo FB: ad account insights + campaign breakdown.
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    let _accounts = [];
    let _actId = null;
    let _preset = 'last_30d';
    let _currency = '';

    const PRESETS = [
        ['today', 'Hôm nay'],
        ['last_7d', '7 ngày'],
        ['last_30d', '30 ngày'],
        ['last_90d', '90 ngày'],
        ['maximum', 'Tất cả'],
    ];
    const STATUS = {
        1: 'Đang hoạt động',
        2: 'Bị vô hiệu',
        3: 'Chưa thanh toán',
        101: 'Đã đóng',
        100: 'Chờ',
        7: 'Chờ duyệt',
    };
    // Nhãn action type (kết quả) phổ biến
    const ACTION_LABELS = {
        link_click: 'Click link',
        post_engagement: 'Tương tác bài',
        page_engagement: 'Tương tác trang',
        post_reaction: 'Cảm xúc',
        comment: 'Bình luận',
        post: 'Chia sẻ',
        video_view: 'Xem video',
        landing_page_view: 'Xem trang đích',
        like: 'Thích trang',
        photo_view: 'Xem ảnh',
        'onsite_conversion.messaging_conversation_started_7d': 'Tin nhắn (7d)',
        'onsite_conversion.messaging_first_reply': 'Tin nhắn trả lời',
        'onsite_conversion.purchase': 'Mua hàng',
        purchase: 'Mua hàng',
        lead: 'Khách tiềm năng',
    };

    function $(id) {
        return document.getElementById(id);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    function nfmt(n) {
        return (Number(n) || 0).toLocaleString('vi-VN');
    }
    function money(v) {
        const n = Number(v) || 0;
        return nfmt(Math.round(n)) + (_currency ? ' ' + _currency : '');
    }
    function dec(v, d) {
        const n = Number(v) || 0;
        return n.toLocaleString('vi-VN', { maximumFractionDigits: d == null ? 2 : d });
    }

    function card(label, value, color) {
        return `<div class="fbp-card" style="margin:0;text-align:center;padding:14px">
            <div style="font-size:1.5rem;font-weight:800;color:${color || 'var(--web2-primary,#0068ff)'}">${value}</div>
            <div style="font-size:.8rem;color:#6b7a8d;font-weight:700;margin-top:2px">${label}</div>
        </div>`;
    }

    function selectorHtml() {
        return `<div class="fbp-card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span style="font-weight:700">Tài khoản QC:</span>
            <select class="fbp-input" id="fbaAcct" style="max-width:280px">
                ${_accounts.map((a) => `<option value="${esc(a.accountId)}" ${a.accountId === _actId ? 'selected' : ''}>${esc(a.name)} ${a.status === 1 ? '🟢' : '⚪'} (${esc(a.currency)})</option>`).join('')}
            </select>
            <div class="fbp-styles" id="fbaPresets">
                ${PRESETS.map(([k, l]) => `<button type="button" class="fbp-style ${k === _preset ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}
            </div>
            <button class="fbp-btn ghost sm" id="fbaReload" type="button" style="margin-left:auto"><i data-lucide="refresh-cw"></i> Tải lại</button>
        </div></div>`;
    }
    function wireSelector() {
        const acct = $('fbaAcct');
        if (acct)
            acct.addEventListener('change', () => {
                _actId = acct.value;
                _currency = (_accounts.find((a) => a.accountId === _actId) || {}).currency || '';
                load();
            });
        document.querySelectorAll('#fbaPresets [data-p]').forEach((b) =>
            b.addEventListener('click', () => {
                _preset = b.dataset.p;
                load();
            })
        );
        $('fbaReload')?.addEventListener('click', load);
    }

    function actionsHtml(actions) {
        if (!Array.isArray(actions) || !actions.length)
            return '<div style="color:#94a3b8;font-size:.85rem">Không có dữ liệu kết quả trong khoảng này.</div>';
        return (
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">' +
            actions
                .map(
                    (a) =>
                        `<div class="fbp-status" style="display:block;text-align:center;padding:8px">
                            <div style="font-size:1.1rem;font-weight:800;color:var(--web2-primary,#0068ff)">${nfmt(a.value)}</div>
                            <div style="font-size:.72rem">${esc(ACTION_LABELS[a.action_type] || a.action_type)}</div>
                        </div>`
                )
                .join('') +
            '</div>'
        );
    }

    function render(data) {
        const s = data.summary || {};
        const camps = data.campaigns || [];
        const hasData = s.spend != null || s.impressions != null;
        const acct = _accounts.find((a) => a.accountId === _actId) || {};
        const acctList = `<div class="fbp-card"><h3><i data-lucide="wallet"></i> Tài khoản quảng cáo (${_accounts.length})</h3>
            ${_accounts
                .map(
                    (a) =>
                        `<div class="fbp-post" style="padding:8px 12px"><div class="fbp-post-body">
                            <b>${esc(a.name)}</b> <span class="fbp-status ${a.status === 1 ? 'published' : ''}">${STATUS[a.status] || 'TT ' + a.status}</span>
                            <div class="fbp-post-meta"><span>ID ${esc(a.accountId)}</span><span>Tiền tệ ${esc(a.currency)}</span></div>
                        </div></div>`
                )
                .join('')}</div>`;

        if (!hasData) {
            $('fbaBody').innerHTML =
                selectorHtml() +
                (data.error
                    ? `<div class="fbp-card" style="background:#fef3f2;border-color:#fca5a5;color:#b91c1c">⚠ ${esc(data.error)}</div>`
                    : '') +
                `<div class="fbp-empty"><div class="empty-state-icon">📭</div>Tài khoản <b>${esc(acct.name || _actId)}</b> chưa có chi tiêu trong khoảng "${esc((PRESETS.find((p) => p[0] === _preset) || [])[1] || _preset)}".<br/><span style="font-size:.85rem;color:#94a3b8">Nếu shop chạy QC ở tài khoản/Business khác, đăng nhập FB bằng tài khoản quản lý QC đó (trang Đăng bài → Kết nối).</span></div>` +
                acctList;
            wireSelector();
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        const ctr = s.ctr != null ? dec(s.ctr) + '%' : '—';
        $('fbaBody').innerHTML =
            selectorHtml() +
            `<div class="fbp-card"><h3><i data-lucide="trending-up"></i> Tổng quan — ${esc(acct.name || '')} · ${esc((PRESETS.find((p) => p[0] === _preset) || [])[1] || _preset)}</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
                    ${card('Chi tiêu', money(s.spend), '#e74c3c')}
                    ${card('Hiển thị', nfmt(s.impressions))}
                    ${card('Tiếp cận', nfmt(s.reach))}
                    ${card('Click', nfmt(s.clicks))}
                    ${card('CTR', ctr)}
                    ${card('CPC', money(s.cpc))}
                    ${card('CPM', money(s.cpm))}
                    ${card('Tần suất', dec(s.frequency, 1))}
                </div>
            </div>
            <div class="fbp-card"><h3><i data-lucide="target"></i> Kết quả</h3>${actionsHtml(s.actions)}</div>
            <div class="fbp-card"><h3><i data-lucide="megaphone"></i> Chiến dịch (${camps.length})</h3>
                ${
                    camps.length
                        ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.85rem">
                    <thead><tr style="text-align:left;color:#6b7a8d;border-bottom:2px solid #eef2f7">
                        <th style="padding:6px">Chiến dịch</th><th style="padding:6px;text-align:right">Chi tiêu</th><th style="padding:6px;text-align:right">Hiển thị</th><th style="padding:6px;text-align:right">Tiếp cận</th><th style="padding:6px;text-align:right">Click</th><th style="padding:6px;text-align:right">CTR</th></tr></thead>
                    <tbody>${camps
                        .map(
                            (c) =>
                                `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px">${esc(c.campaign_name || '')}</td>
                                <td style="padding:6px;text-align:right">${money(c.spend)}</td>
                                <td style="padding:6px;text-align:right">${nfmt(c.impressions)}</td>
                                <td style="padding:6px;text-align:right">${nfmt(c.reach)}</td>
                                <td style="padding:6px;text-align:right">${nfmt(c.clicks)}</td>
                                <td style="padding:6px;text-align:right">${c.ctr != null ? dec(c.ctr) + '%' : '—'}</td></tr>`
                        )
                        .join('')}</tbody></table></div>`
                        : '<div style="color:#94a3b8;font-size:.85rem">Không có chiến dịch trong khoảng này.</div>'
                }
            </div>
            ${acctList}`;
        wireSelector();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    async function load() {
        $('fbaBody').innerHTML =
            selectorHtml() +
            '<div class="fbp-empty"><i data-lucide="loader"></i> Đang tải số liệu quảng cáo…</div>';
        wireSelector();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            const r = await Api().adInsights(_actId, _preset);
            if (!r.success) {
                $('fbaBody').innerHTML =
                    selectorHtml() + `<div class="fbp-empty">${esc(r.error || 'Lỗi')}</div>`;
                wireSelector();
                return;
            }
            render(r);
        } catch (e) {
            $('fbaBody').innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    async function init() {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        if (window.lucide?.createIcons) window.lucide.createIcons();
        const pill = $('fbaConnPill');
        try {
            const st = await Api().status();
            if (!st.connected) {
                pill.className = 'fbp-pill is-off';
                pill.innerHTML = '<i data-lucide="x-circle"></i> Chưa kết nối';
                $('fbaBody').innerHTML =
                    '<div class="fbp-empty"><div class="empty-state-icon">🔌</div>Chưa kết nối Facebook. Vào <a href="../fb-posts/index.html" style="color:var(--web2-primary,#0068ff);font-weight:700">Đăng bài Facebook</a> để kết nối.</div>';
                if (window.lucide?.createIcons) window.lucide.createIcons();
                return;
            }
            pill.className = 'fbp-pill is-on';
            pill.innerHTML = `<i data-lucide="check-circle-2"></i> ${esc(st.user?.name || '')}`;
            const r = await Api().adAccounts();
            if (!r.success || !(r.accounts || []).length) {
                $('fbaBody').innerHTML =
                    `<div class="fbp-empty"><div class="empty-state-icon">💳</div>${r.success ? 'Tài khoản này không có tài khoản quảng cáo nào (cần quyền ads_read + là admin tài khoản QC).' : esc(r.error || 'Lỗi')}</div>`;
                if (window.lucide?.createIcons) window.lucide.createIcons();
                return;
            }
            _accounts = r.accounts;
            // ưu tiên tài khoản đang hoạt động
            const active = _accounts.find((a) => a.status === 1) || _accounts[0];
            _actId = active.accountId;
            _currency = active.currency || '';
            load();
        } catch (e) {
            $('fbaBody').innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
