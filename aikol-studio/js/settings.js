// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio Sprint 4 — Settings page (topup + Telegram link).

(function () {
    'use strict';
    const $ = (s, r) => (r || document).querySelector(s);

    function showToast(msg, kind) {
        const el = document.createElement('div');
        el.className = 'aikol-toast' + (kind ? ` aikol-toast--${kind}` : '');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4500);
    }

    // aikolConfirm now lives in shared aikol-modal.js (loaded via <script>).
    // Local alias for backwards-compat with code in this file.
    const aikolConfirm = (opts) => {
        if (typeof window.aikolConfirm === 'function') return window.aikolConfirm(opts);
        // Fallback: native confirm (only if shared module not loaded)
        return Promise.resolve(window.confirm(opts?.title || 'Xác nhận?'));
    };

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function fmtVnd(n) {
        return Number(n || 0).toLocaleString('vi-VN') + ' ₫';
    }

    function fmtDate(secs) {
        if (!secs) return '—';
        return new Date(secs * 1000).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    let activePollTimer = null;
    let lastActiveTopupId = null;

    async function refreshCredits() {
        try {
            const { balance, plan } = await window.AikolAPI.getCredits();
            $('#aikol-credits').textContent = `${balance} credits · ${plan}`;
        } catch (_) {}
    }

    // Editorial highlights — which pack is recommended (matches tikreel /pricing).
    const POPULAR_PACK = 'standard';
    const PACK_TAGLINES = {
        mini: 'Thử cho biết',
        small: 'Cá nhân',
        standard: 'Đề xuất',
        pro: 'Tăng tốc',
        power: 'Chuyên nghiệp',
        agency: 'Agency / Team',
    };

    async function loadPacks() {
        try {
            const cfg = await window.AikolAPI.getBillingPacks();
            const packs = cfg.packs || [];
            const grid = $('#packs-grid');

            grid.innerHTML = packs
                .map((p) => {
                    const isPop = p.id === POPULAR_PACK;
                    const cls = `aikol-pack${isPop ? ' aikol-pack--popular' : ''}`;
                    const vndPerCr = Math.round((p.vnd || 0) / (p.credits || 1));
                    return `
                <div class="${cls}" data-pack="${escapeHtml(p.id)}">
                    ${isPop ? '<span class="aikol-pack__badge">Đề xuất</span>' : ''}
                    <div class="aikol-pack__head">
                        <div class="aikol-pack__name">${escapeHtml(p.name)}</div>
                        <div class="aikol-pack__tagline">${escapeHtml(PACK_TAGLINES[p.id] || '')}</div>
                    </div>
                    <div class="aikol-pack__credits">
                        <span class="aikol-pack__bolt" aria-hidden="true">⚡</span>
                        <span class="aikol-pack__num">${p.credits}</span>
                        <span class="aikol-pack__unit">credits</span>
                    </div>
                    <div class="aikol-pack__vnd">${fmtVnd(p.vnd)}</div>
                    <div class="aikol-pack__rate">≈ ${fmtVnd(vndPerCr)} / credit</div>
                    <button type="button" class="aikol-btn aikol-pack__buy" data-pack="${escapeHtml(p.id)}">Nạp ngay</button>
                </div>`;
                })
                .join('');
            grid.querySelectorAll('button[data-pack]').forEach((btn) => {
                btn.addEventListener('click', () => requestAdminTopup(btn.dataset.pack, packs));
            });
        } catch (e) {
            showToast('Lỗi tải packs: ' + e.message, 'error');
        }
    }

    // Topup hiện qua admin (SePay self-service tạm tắt). Click pack → modal hướng
    // dẫn user copy thông tin yêu cầu rồi liên hệ admin để được nạp credits.
    async function requestAdminTopup(packId, packs) {
        const pack = (packs || []).find((p) => p.id === packId);
        if (!pack) {
            showToast('Không tìm thấy gói credits', 'error');
            return;
        }
        const vndPerCr = Math.round((pack.vnd || 0) / (pack.credits || 1));
        const username =
            localStorage.getItem('displayName') ||
            localStorage.getItem('username') ||
            (typeof window.authManager?.getDisplayName === 'function'
                ? window.authManager.getDisplayName()
                : null) ||
            'người dùng';
        const requestText =
            `Yêu cầu nạp credits AI KOL Studio:\n` +
            `• User: ${username}\n` +
            `• Gói: ${pack.name} — ${pack.credits} credits\n` +
            `• Số tiền: ${fmtVnd(pack.vnd)}\n` +
            `• Thời gian: ${new Date().toLocaleString('vi-VN')}`;

        const ok = await aikolConfirm({
            title: 'Liên hệ admin để nạp credits',
            body: `
                <div class="aikol-confirm__pack">
                    <div class="aikol-confirm__pack-name">${escapeHtml(pack.name)}</div>
                    <div class="aikol-confirm__pack-credits">
                        <span class="aikol-pack__bolt" aria-hidden="true">⚡</span>
                        <strong>${pack.credits}</strong> credits
                    </div>
                    <div class="aikol-confirm__pack-vnd">${escapeHtml(fmtVnd(pack.vnd))}</div>
                    <div class="aikol-confirm__pack-rate">≈ ${escapeHtml(fmtVnd(vndPerCr))} / credit</div>
                </div>
                <p class="aikol-confirm__note">
                    Tự nạp qua SePay đang tạm khoá. Vui lòng <strong>liên hệ admin</strong>
                    để được nạp credits gói này. Bấm <strong>Copy yêu cầu</strong> để gửi
                    nội dung sau cho admin.
                </p>
                <pre class="aikol-confirm__request">${escapeHtml(requestText)}</pre>`,
            confirmLabel: 'Copy yêu cầu',
            cancelLabel: 'Đóng',
        });
        if (!ok) return;

        try {
            await navigator.clipboard.writeText(requestText);
            showToast('Đã copy yêu cầu — gửi cho admin để được nạp', 'success');
        } catch (_) {
            showToast('Không copy được — vui lòng chọn và copy thủ công', 'error');
        }
    }

    function renderActiveTopup(topup) {
        lastActiveTopupId = topup.id;
        const panel = $('#active-topup-panel');
        const root = $('#active-topup');
        panel.style.display = 'block';
        const expiresAt = topup.expires_at ? new Date(topup.expires_at * 1000) : null;
        root.innerHTML = `
            <div class="aikol-topup-card aikol-topup-card--${escapeHtml(topup.state || 'pending')}">
                <div style="flex:1;min-width:0">
                    <div style="font-size:1rem;font-weight:600">${escapeHtml(topup.pack_name || topup.pack_id)} · ${topup.credits} cr</div>
                    <div style="color:var(--aikol-text-dim);font-size:0.85rem;margin-top:0.2rem">
                        ${fmtVnd(topup.amount_vnd)} → STK <code>${escapeHtml(topup.account_number || '—')}</code> · ${escapeHtml(topup.bank || '')}<br>
                        Memo: <code class="aikol-memo">${escapeHtml(topup.memo)}</code> ·
                        Hết hạn ${expiresAt ? expiresAt.toLocaleString('vi-VN') : '—'}
                    </div>
                    <div style="margin-top:0.4rem">
                        <span class="aikol-topup-badge">${escapeHtml(topup.state || 'pending')}</span>
                    </div>
                </div>
                ${
                    topup.qr_url
                        ? `<img src="${escapeHtml(topup.qr_url)}" alt="QR thanh toán" class="aikol-qr" loading="eager">`
                        : ''
                }
                <div style="display:flex;flex-direction:column;gap:0.5rem">
                    <button type="button" class="aikol-btn aikol-btn--secondary" id="btn-copy-memo">Copy memo</button>
                    <button type="button" class="aikol-btn aikol-btn--danger" id="btn-cancel-topup">Huỷ đơn</button>
                </div>
            </div>
            <p style="color:var(--aikol-text-dim);font-size:0.82rem;margin-top:0.6rem">
                💡 Sau khi chuyển khoản, đơn sẽ tự đổi sang <strong>paid</strong> và credits cộng vào ví trong vài giây.
            </p>
        `;
        $('#btn-copy-memo').addEventListener('click', () => {
            navigator.clipboard.writeText(topup.memo);
            showToast('Đã copy memo', 'success');
        });
        $('#btn-cancel-topup').addEventListener('click', () => onCancelTopup(topup.id));
    }

    async function onCancelTopup(id) {
        const ok = await aikolConfirm({
            title: 'Huỷ đơn nạp?',
            body: '<p class="aikol-confirm__note">Đơn nạp đang chờ thanh toán sẽ bị huỷ. Bạn có thể tạo đơn mới sau.</p>',
            confirmLabel: 'Huỷ đơn',
            cancelLabel: 'Quay lại',
            danger: true,
        });
        if (!ok) return;
        try {
            await window.AikolAPI.cancelTopup(id);
            showToast('Đã huỷ', 'success');
            stopPollActive();
            $('#active-topup-panel').style.display = 'none';
            await loadTopupHistory();
        } catch (e) {
            showToast('Lỗi huỷ: ' + (e.data?.detail || e.message), 'error');
        }
    }

    function stopPollActive() {
        if (activePollTimer) clearInterval(activePollTimer);
        activePollTimer = null;
    }

    function startPollActive(id) {
        stopPollActive();
        activePollTimer = setInterval(async () => {
            if (id !== lastActiveTopupId) return stopPollActive();
            try {
                const t = await window.AikolAPI.getTopup(id);
                if (t.state === 'paid') {
                    showToast(`Đã nhận thanh toán · +${t.credits} cr`, 'success');
                    stopPollActive();
                    $('#active-topup-panel').style.display = 'none';
                    await Promise.all([refreshCredits(), loadTopupHistory(), loadCreditHistory()]);
                } else if (t.state !== 'pending') {
                    stopPollActive();
                    $('#active-topup-panel').style.display = 'none';
                    await loadTopupHistory();
                }
            } catch (_) {}
        }, 4000);
    }

    async function loadTopupHistory() {
        try {
            const { topups } = await window.AikolAPI.listTopups();
            const root = $('#topup-history');
            if (!topups || topups.length === 0) {
                root.innerHTML = '<div class="aikol-empty">Chưa có đơn nạp nào.</div>';
                return;
            }
            // Show most-recent pending as the active card.
            const pending = topups.find((t) => t.state === 'pending');
            if (pending && lastActiveTopupId !== pending.id) {
                renderActiveTopup({
                    ...pending,
                    qr_url: pending.qr_url || null,
                });
                startPollActive(pending.id);
            }
            root.innerHTML = topups
                .map(
                    (t) => `
                <div class="aikol-topup-row aikol-topup-row--${escapeHtml(t.state)}">
                    <span class="aikol-topup-badge">${escapeHtml(t.state)}</span>
                    <span style="flex:1;min-width:0">
                        <strong>${escapeHtml(t.pack_id)}</strong> · ${t.credits} cr · ${fmtVnd(t.amount_vnd)}
                    </span>
                    <code class="aikol-memo">${escapeHtml(t.memo)}</code>
                    <span style="color:var(--aikol-text-dim);font-size:0.78rem">${fmtDate(t.created_at)}</span>
                </div>`
                )
                .join('');
        } catch (e) {
            $('#topup-history').innerHTML =
                `<div class="aikol-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function loadCreditHistory() {
        try {
            const { history } = await window.AikolAPI.getCreditHistory(20);
            const root = $('#credit-history');
            if (!history || history.length === 0) {
                root.innerHTML = '<div class="aikol-empty">Chưa có giao dịch nào.</div>';
                return;
            }
            root.innerHTML = history
                .map(
                    (h) => `
                <div class="aikol-credit-row">
                    <span class="aikol-credit-row__kind aikol-credit-row__kind--${escapeHtml(h.kind)}">${escapeHtml(h.kind)}</span>
                    <span class="aikol-credit-row__delta">${h.delta > 0 ? '+' : ''}${h.delta} cr</span>
                    <span style="flex:1;min-width:0;color:var(--aikol-text-dim);font-size:0.85rem">${escapeHtml(h.note || h.memo || '—')}</span>
                    <span style="color:var(--aikol-text-dim);font-size:0.78rem">${new Date(h.at).toLocaleString('vi-VN')}</span>
                </div>`
                )
                .join('');
        } catch (e) {
            $('#credit-history').innerHTML =
                `<div class="aikol-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function loadSettings() {
        try {
            const s = await window.AikolAPI.getSettings();
            $('#telegram-chat-id').value = s.telegram_chat_id || '';
            $('#notify-done').checked = s.notify_on_done !== false;
            $('#notify-error').checked = s.notify_on_error !== false;
        } catch (e) {
            console.warn('[settings] loadSettings', e);
        }
    }

    async function onTelegramLink() {
        const chatId = $('#telegram-chat-id').value.trim();
        if (!chatId) {
            showToast('Nhập chat_id trước', 'error');
            return;
        }
        const btn = $('#telegram-link-btn');
        btn.disabled = true;
        btn.textContent = 'Đang test…';
        try {
            await window.AikolAPI.linkTelegram(chatId);
            await window.AikolAPI.updateSettings({
                notify_on_done: $('#notify-done').checked,
                notify_on_error: $('#notify-error').checked,
            });
            showToast('Đã kết nối Telegram — kiểm tra tin nhắn', 'success');
        } catch (e) {
            showToast('Lỗi: ' + (e.data?.detail || e.message), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Test & Lưu';
        }
    }

    async function onTelegramSave() {
        const chatId = $('#telegram-chat-id').value.trim() || null;
        const btn = $('#telegram-save-btn');
        btn.disabled = true;
        try {
            await window.AikolAPI.updateSettings({
                telegram_chat_id: chatId,
                notify_on_done: $('#notify-done').checked,
                notify_on_error: $('#notify-error').checked,
            });
            showToast('Đã lưu', 'success');
        } catch (e) {
            showToast('Lỗi: ' + (e.data?.detail || e.message), 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // ----- Account card — read profile from shared/js/shared-auth-manager.js -----
    function getAuthData() {
        try {
            if (window.authManager?.getAuthData) {
                return window.authManager.getAuthData() || null;
            }
        } catch (_) {}
        try {
            const raw =
                sessionStorage.getItem('loginindex_auth') ||
                localStorage.getItem('loginindex_auth');
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function populateAccountCard() {
        const data = getAuthData();
        if (!data) return;
        const display = data.displayName || data.username || data.userId || '—';
        const username = data.username || data.userId || '—';
        const role =
            data.roleTemplate === 'admin' ||
            data.userType === 'admin-authenticated' ||
            data.isAdmin === true;
        const initial = (display || username).trim().charAt(0).toUpperCase() || 'A';

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setText('account-avatar', initial);
        setText('account-display', display);
        setText('account-username', '@' + username);

        const roleEl = document.getElementById('account-role');
        if (roleEl) {
            roleEl.textContent = role ? 'Admin' : data.roleTemplate || 'User';
            roleEl.classList.toggle('aikol-account__role--user', !role);
        }

        // Last login — `loginTime` is an ISO string in some installs, while
        // `timestamp` / `lastActivity` are numeric ms. Coalesce defensively.
        const sessionEl = document.getElementById('account-session');
        if (sessionEl) {
            const tsMs =
                data.timestamp ||
                data.lastActivity ||
                (data.loginTime ? Date.parse(data.loginTime) : 0);
            const last = tsMs ? fmtDate(Math.round(tsMs / 1000)) : '—';
            const remembered = data.isRemembered === true ? ' · ghi nhớ' : ' · session';
            sessionEl.textContent = `Đăng nhập: ${last}${remembered}`;
        }

        // Logout — clear cả 2 storage giống aikol-sidebar logout, redirect về
        // n2store login (../index.html). Không gọi authManager.logout() vì default
        // redirectUrl='/index.html' (gốc domain) lệch khỏi GH Pages project root.
        const btnLogout = document.getElementById('account-logout');
        if (btnLogout && !btnLogout._wired) {
            btnLogout._wired = true;
            btnLogout.addEventListener('click', async () => {
                const ok = await aikolConfirm({
                    title: 'Đăng xuất?',
                    body: '<p class="aikol-confirm__note">Bạn sẽ được đưa về trang đăng nhập n2store.</p>',
                    confirmLabel: 'Đăng xuất',
                    cancelLabel: 'Ở lại',
                    danger: true,
                });
                if (!ok) return;
                try {
                    localStorage.removeItem('loginindex_auth');
                    sessionStorage.removeItem('loginindex_auth');
                    localStorage.removeItem('isLoggedIn');
                } catch (_) {}
                window.location.href = '../index.html';
            });
        }
        // Đổi mật khẩu — admin redirect tới user-management page (đã có sẵn);
        // user thường thông báo liên hệ admin (chưa có self-service endpoint).
        const btnPw = document.getElementById('account-change-pw');
        if (btnPw && !btnPw._wired) {
            btnPw._wired = true;
            btnPw.addEventListener('click', () => {
                if (isAdminUser()) {
                    window.location.href = '../user-management/index.html';
                } else {
                    showToast('Liên hệ admin để đổi mật khẩu.', 'info');
                }
            });
        }
    }

    // ----- Admin: grant credits panel (gated by authManager.isAdminTemplate) -----
    function isAdminUser() {
        try {
            if (window.authManager?.isAdminTemplate) {
                return window.authManager.isAdminTemplate() === true;
            }
            const a = getAuthData();
            return (
                a?.roleTemplate === 'admin' ||
                a?.userType === 'admin-authenticated' ||
                a?.isAdmin === true
            );
        } catch (_) {
            return false;
        }
    }

    async function setupAdminPanel() {
        const panel = $('#admin-grant-panel');
        if (!panel || !isAdminUser()) return;
        panel.style.display = '';

        await refreshAdminUserList();
        // Bind click handler ONCE — calling setupAdminPanel again to refresh the
        // dropdown previously re-attached this listener and caused double-grants.
        $('#admin-grant-btn').addEventListener('click', onAdminGrantClick);
    }

    async function refreshAdminUserList() {
        const sel = $('#admin-grant-user');
        if (!sel) return;
        const prev = sel.value; // preserve selection across refreshes
        try {
            const { users } = await window.AikolAPI.adminListUsers();
            sel.innerHTML =
                '<option value="">— chọn user —</option>' +
                (users || [])
                    .map((u) => {
                        // Send `user_id` (UUID) — that's how aikol_credits.user_id is keyed.
                        // Fall back to username for legacy rows where user_id is null.
                        const targetId = u.user_id || u.username;
                        const lbl = `${u.username}${u.display_name ? ' (' + u.display_name + ')' : ''} · ${u.balance}cr`;
                        return `<option value="${escapeHtml(targetId)}">${escapeHtml(lbl)}</option>`;
                    })
                    .join('');
            if (prev) sel.value = prev;
        } catch (e) {
            sel.innerHTML = '<option value="">— không có quyền admin —</option>';
            $('#admin-grant-status').textContent =
                'Server từ chối: ' + (e.data?.error || e.message);
        }
    }

    async function onAdminGrantClick() {
        const target = $('#admin-grant-user').value;
        const delta = parseInt($('#admin-grant-delta').value, 10);
        const note = $('#admin-grant-note').value.trim();
        const status = $('#admin-grant-status');
        if (!target) {
            status.textContent = 'Chọn user trước';
            return;
        }
        if (!Number.isFinite(delta) || delta === 0) {
            status.textContent = 'Δ phải là số khác 0';
            return;
        }
        const sign = delta > 0 ? 'cộng' : 'trừ';
        const sel = $('#admin-grant-user');
        const targetLabel = sel?.options[sel.selectedIndex]?.textContent?.trim() || target;
        const ok = await aikolConfirm({
            title: `Xác nhận ${sign} credits`,
            body: `
                <div class="aikol-confirm__pack">
                    <div class="aikol-confirm__pack-name">${escapeHtml(targetLabel)}</div>
                    <div class="aikol-confirm__pack-credits">
                        <span class="aikol-pack__bolt" aria-hidden="true">⚡</span>
                        <strong>${delta > 0 ? '+' : ''}${delta}</strong> credits
                    </div>
                    ${note ? `<div class="aikol-confirm__pack-rate">Note: ${escapeHtml(note)}</div>` : ''}
                </div>
                <p class="aikol-confirm__note">
                    Thao tác này sẽ <strong>${sign} ${Math.abs(delta)} credits</strong>
                    cho user trên và ghi vào history (kind=admin_grant).
                </p>`,
            confirmLabel: delta > 0 ? `Cộng ${delta} cr` : `Trừ ${Math.abs(delta)} cr`,
            cancelLabel: 'Huỷ',
            danger: delta < 0,
        });
        if (!ok) return;

        const btn = $('#admin-grant-btn');
        btn.disabled = true;
        status.textContent = 'Đang xử lý…';
        try {
            const r = await window.AikolAPI.adminGrantCredits(target, delta, note);
            status.textContent = `OK · balance mới: ${r.balance}`;
            showToast(`Đã ${sign} ${Math.abs(delta)}cr cho ${target}`, 'success');
            $('#admin-grant-delta').value = '';
            $('#admin-grant-note').value = '';
            // Refresh dropdown balances + own credits + history (no re-bind).
            refreshAdminUserList();
            refreshCredits();
            loadCreditHistory();
            if (window.AikolSidebar?.refresh) window.AikolSidebar.refresh();
        } catch (e) {
            status.textContent = 'Lỗi: ' + (e.data?.detail || e.message);
            showToast('Lỗi: ' + (e.data?.detail || e.message), 'error');
        } finally {
            btn.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        populateAccountCard();
        refreshCredits();
        loadPacks();
        loadTopupHistory();
        loadCreditHistory();
        loadSettings();
        setupAdminPanel();
        $('#telegram-link-btn').addEventListener('click', onTelegramLink);
        $('#telegram-save-btn').addEventListener('click', onTelegramSave);
    });

    // aikolConfirm is now exposed by shared aikol-modal.js (loaded earlier).
})();
