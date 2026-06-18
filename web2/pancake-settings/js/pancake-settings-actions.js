// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake settings: actions / handlers
// (jwt save/test/clear, page tokens, danger nuke, expiry modal +
//  auto-fetch monitor, accounts add/use/delete/renew, creds modal)
// =====================================================

(function () {
    'use strict';

    const NS = (window.__PancakeSettings = window.__PancakeSettings || {});
    const S = NS.state;
    const $ = NS.$;
    const notify = NS.notify;
    const escapeHtml = NS.escapeHtml;
    const REASON_MSG = NS.REASON_MSG;
    const _setBtnLoading = NS._setBtnLoading;
    const _restoreBtn = NS._restoreBtn;

    // ---- JWT save / test / clear ----
    async function saveJwt() {
        const txt = $('jwtInput').value.trim();
        if (!txt) {
            notify('Paste JWT vào ô trước đã', 'warning');
            return;
        }
        // strip "token=" prefix if user pasted full cookie
        const cleaned = txt.replace(/^token=/, '').trim();
        const decoded = window.Web2Chat.decodeJwt(cleaned);
        if (!decoded) {
            notify('Token không hợp lệ (không decode được JWT)', 'error');
            return;
        }
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
            notify('Token đã hết hạn — login lại pancake.vn', 'error');
            return;
        }
        window.Web2Chat.setJwt(cleaned);
        $('jwtInput').value = '';
        notify('Đã lưu JWT token', 'success');
        NS.renderJwtInfo();
        // Lưu account vào DB (đồng bộ mọi máy) + đặt active trên máy này
        await NS.persistActiveToDb(cleaned, decoded);
        // auto-load pages after save
        NS.loadPages();
    }

    async function testJwt() {
        if (!window.Web2Chat.getJwt()) {
            notify('Chưa có JWT — paste và lưu trước', 'warning');
            return;
        }
        notify('Đang test…', 'info');
        await NS.loadPages();
    }

    async function clearJwt() {
        if (
            !(await Popup.danger('Xoá JWT? Bạn sẽ phải paste lại từ pancake.vn.', {
                okText: 'Xoá',
            }))
        )
            return;
        window.Web2Chat.setJwt(null);
        notify('Đã xoá JWT', 'success');
        NS.renderJwtInfo();
        $('pageList').innerHTML =
            `<div class="ps-loading">Cần JWT token trước khi load pages.</div>`;
        $('pagesBadge').textContent = '—';
        $('pagesBadge').className = 'badge warn';
    }

    async function clearPageTokens() {
        if (
            !(await Popup.danger(
                'Xoá tất cả page_access_tokens? JWT giữ nguyên — bạn sẽ phải generate lại.',
                { okText: 'Xoá' }
            ))
        )
            return;
        localStorage.removeItem('pancake_page_access_tokens');
        notify('Đã xoá page tokens', 'success');
        if (S._pagesCache) NS.renderPageList(S._pagesCache);
    }

    async function generateAll() {
        if (!Array.isArray(S._pagesCache) || S._pagesCache.length === 0) {
            notify('Load pages trước đã', 'warning');
            return;
        }
        const eligible = S._pagesCache.filter((p) => !(p.id || '').startsWith('igo_'));
        notify(`Đang generate token cho ${eligible.length} pages…`, 'info');
        let ok = 0;
        for (const p of eligible) {
            const r = await window.Web2Chat.generatePageAccessToken(p.id);
            if (r.ok) ok++;
            // small delay so we don't hammer the API
            await new Promise((res) => setTimeout(res, 200));
        }
        notify(`Hoàn tất: ${ok}/${eligible.length} pages có token mới`, ok ? 'success' : 'warning');
        NS.renderPageList(S._pagesCache);
    }

    async function nuke() {
        if (
            !(await Popup.danger(
                'XOÁ TOÀN BỘ TOKEN (JWT + page tokens)? Tab1 + native-orders sẽ mất chat cho tới khi cấu hình lại.',
                { okText: 'Xoá toàn bộ' }
            ))
        )
            return;
        window.Web2Chat.clearAllTokens();
        notify('Đã xoá toàn bộ token', 'success');
        NS.renderJwtInfo();
        S._pagesCache = null;
        $('pageList').innerHTML =
            `<div class="ps-loading">Cần JWT token trước khi load pages.</div>`;
        $('pagesBadge').textContent = '—';
        $('pagesBadge').className = 'badge warn';
    }

    // =====================================================
    // Token expiry monitor + auto-refresh qua extension
    // =====================================================

    // ---- Auto-fetch dùng chung cho nút card + nút modal ----
    async function doAutoFetch(btn) {
        const PK = window.Web2PancakeToken;
        if (!PK) {
            notify('Module token chưa load — refresh trang', 'error');
            return { ok: false, reason: 'no_module' };
        }
        if (!PK.isExtensionPresent()) {
            notify(REASON_MSG.no_extension, 'warning');
            return { ok: false, reason: 'no_extension' };
        }
        _setBtnLoading(btn, 'Đang lấy…');
        const res = await PK.ensureFresh({ force: true });
        _restoreBtn(btn);
        if (res.refreshed) {
            notify('Đã lấy token Pancake mới', 'success');
            NS.renderJwtInfo();
            NS.renderBanner();
            await NS.persistActiveToDb(window.Web2Chat.getJwt(), res.decoded);
            NS.loadPages();
            return res;
        }
        notify('Không lấy được token: ' + (REASON_MSG[res.reason] || res.reason || 'lỗi'), 'error');
        return res;
    }

    // ---- Modal ----
    function openExpiryModal(status, autoFailReason) {
        const overlay = $('expiryModal');
        if (!overlay) return;
        const st = status || window.Web2PancakeToken.getStatus();
        const icon = $('expiryModalIcon');
        const title = $('expiryModalTitle');
        const desc = $('expiryModalDesc');

        let iconCls = '',
            iconName = 'key-round',
            titleTxt = 'Token Pancake sắp hết hạn',
            descTxt = '';
        if (st.state === 'none') {
            iconCls = 'none';
            iconName = 'key-round';
            titleTxt = 'Chưa cấu hình token Pancake';
            descTxt =
                'Web 2.0 cần token Pancake để gửi tin nhắn / comment. Lấy token ngay bên dưới.';
        } else if (st.state === 'expired') {
            iconCls = 'critical';
            iconName = 'alert-octagon';
            titleTxt = 'Token Pancake đã hết hạn';
            descTxt = 'Token đã hết hạn — gửi tin và chốt đơn sẽ lỗi. Lấy token mới để tiếp tục.';
        } else {
            // critical
            iconCls = 'critical';
            iconName = 'alert-triangle';
            const hrs = Math.max(0, Math.floor(st.secondsLeft / 3600));
            titleTxt = 'Token Pancake sắp hết hạn';
            descTxt = `Chỉ còn ~${hrs} giờ nữa là hết hạn. Gia hạn ngay để không gián đoạn.`;
        }
        icon.className = 'ps-modal-icon ' + iconCls;
        icon.innerHTML = `<i data-lucide="${iconName}" style="width:26px;height:26px;"></i>`;
        title.textContent = titleTxt;
        desc.textContent = descTxt;

        // Nếu auto đã fail (silent) → mở sẵn phần thủ công + nói lý do
        const manual = $('expiryManual');
        if (autoFailReason) {
            if (manual) manual.open = true;
            const hint = $('expiryAutoHint');
            if (hint)
                hint.innerHTML =
                    'Tự động không lấy được: <strong>' +
                    escapeHtml(REASON_MSG[autoFailReason] || autoFailReason) +
                    '</strong>. Thử lại hoặc dùng cách thủ công.';
        } else if (manual) {
            manual.open = false;
        }

        overlay.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function closeExpiryModal() {
        const overlay = $('expiryModal');
        if (overlay) overlay.hidden = true;
    }

    function wireModal() {
        const closeBtn = $('expiryModalClose');
        const dismiss = $('expiryDismiss');
        const autoBtn = $('expiryAutoBtn');
        const copyBtn = $('btnCopySnippet');
        const pasteSave = $('expiryPasteSave');
        const overlay = $('expiryModal');

        if (closeBtn) closeBtn.addEventListener('click', closeExpiryModal);
        if (dismiss) dismiss.addEventListener('click', closeExpiryModal);
        if (overlay)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeExpiryModal();
            });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.hidden) closeExpiryModal();
        });

        if (autoBtn)
            autoBtn.addEventListener('click', async () => {
                const res = await doAutoFetch(autoBtn);
                if (res.refreshed) {
                    closeExpiryModal();
                } else {
                    // mở phần thủ công để user tự xử lý
                    const manual = $('expiryManual');
                    if (manual) manual.open = true;
                }
            });

        if (copyBtn)
            copyBtn.addEventListener('click', async () => {
                const snippet = $('consoleSnippet')?.textContent || '';
                try {
                    await navigator.clipboard.writeText(snippet);
                    notify('Đã copy đoạn console', 'success');
                } catch {
                    notify('Không copy được — bôi đen copy tay', 'warning');
                }
            });

        if (pasteSave)
            pasteSave.addEventListener('click', async () => {
                const txt = $('expiryPasteInput')?.value || '';
                const r = window.Web2PancakeToken.applyToken(txt);
                if (!r.ok) {
                    notify(
                        'Token không hợp lệ: ' + (REASON_MSG['apply_' + r.reason] || r.reason),
                        'error'
                    );
                    return;
                }
                notify('Đã lưu token Pancake', 'success');
                $('expiryPasteInput').value = '';
                closeExpiryModal();
                NS.renderJwtInfo();
                NS.renderBanner();
                await NS.persistActiveToDb(window.Web2Chat.getJwt(), r.decoded);
                NS.loadPages();
            });
    }

    // Chạy khi load: thử auto-refresh ngầm nếu token critical/expired/none.
    async function runMonitor() {
        const PK = window.Web2PancakeToken;
        if (!PK) return;
        NS.renderExtStatus();
        const st = PK.getStatus();
        const needs = st.state === 'none' || st.state === 'expired' || st.state === 'critical';
        if (!needs) {
            NS.renderBanner();
            return;
        }
        // Thử lấy token mới ngầm (không UI) nếu có extension
        if (PK.isExtensionPresent()) {
            const res = await PK.ensureFresh({});
            if (res.refreshed) {
                notify('Đã tự động cập nhật token Pancake mới', 'success');
                NS.renderJwtInfo();
                NS.renderBanner();
                NS.loadPages();
                return;
            }
            // ngầm fail → hiện modal kèm lý do
            openExpiryModal(PK.getStatus(), res.reason);
            NS.renderBanner();
            return;
        }
        // không có extension → hiện modal hướng dẫn thủ công
        openExpiryModal(st);
        NS.renderBanner();
    }

    // =====================================================
    // Accounts (DB-backed multi-account management)
    // =====================================================

    // ---- Gia hạn ngay 1 account (dùng creds đã lưu) ----
    async function renewAccount(id, btn) {
        const PA = window.Web2PancakeAccounts;
        // Race guard: nút "Gia hạn" render trước khi getRefreshStatus() resolve →
        // _refreshStatus[id].has_creds chưa biết. Await status (có loading) trước khi quyết định.
        if (!S._refreshStatusLoaded && S._refreshStatusPromise) {
            _setBtnLoading(btn, 'Đang kiểm tra…');
            try {
                await S._refreshStatusPromise;
            } catch {
                /* status load lỗi — fallback xuống nhánh openCredsModal */
            }
            _restoreBtn(btn);
        }
        const st = S._refreshStatus[id] || {};
        if (!st.has_creds) {
            // chưa lưu mật khẩu → mở modal nhập
            openCredsModal(id);
            return;
        }
        _setBtnLoading(btn, 'Đang gia hạn…');
        const r = await PA.refreshNow(id, {});
        _restoreBtn(btn);
        if (r.ok) {
            notify(
                `Đã gia hạn ${r.name || id} → ${r.exp ? new Date(r.exp * 1000).toLocaleDateString('vi-VN') : ''}`,
                'success'
            );
            await NS.loadAccounts();
            NS.renderJwtInfo();
            NS.renderBanner();
        } else {
            notify('Gia hạn lỗi: ' + (r.reason || 'unknown'), 'error');
        }
    }

    // ---- Creds modal ----
    function openCredsModal(id) {
        S._credsAccountId = id;
        const acc = S._accountsCache.find((a) => a.account_id === id);
        const st = S._refreshStatus[id] || {};
        $('credsModalTitle').textContent = `Tự động gia hạn — ${acc?.name || id}`;
        // Server cố ý KHÔNG trả login_identity → đã lưu thì chỉ hiện placeholder
        const idInput = $('credsIdentity');
        idInput.value = '';
        idInput.placeholder = st.has_creds
            ? 'Đã lưu — nhập lại nếu muốn đổi'
            : 'Email / SĐT / Tên người dùng Pancake';
        $('credsPassword').value = '';
        $('credsAuto').checked = st.auto_refresh !== false;
        $('credsKeyWarn').style.display = S._credsKeyConfigured ? 'none' : 'block';
        $('credsDelete').style.display = st.has_creds ? '' : 'none';
        $('credsModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => $('credsIdentity').focus(), 50);
    }
    function closeCredsModal() {
        $('credsModal').hidden = true;
        S._credsAccountId = null;
    }

    async function credsSave(alsoRefresh) {
        const PA = window.Web2PancakeAccounts;
        const id = S._credsAccountId;
        const identity = $('credsIdentity').value.trim();
        const password = $('credsPassword').value;
        const auto = $('credsAuto').checked;
        if (!identity || !password) {
            notify('Nhập đủ tài khoản + mật khẩu', 'warning');
            return;
        }
        const btn = alsoRefresh ? $('credsSaveRefresh') : $('credsSaveOnly');
        _setBtnLoading(btn, alsoRefresh ? 'Đang gia hạn…' : 'Đang lưu…');
        if (alsoRefresh) {
            // POST refresh kèm save (login luôn + lưu creds)
            const r = await PA.refreshNow(id, {
                identity,
                password,
                save: true,
                auto_refresh: auto,
            });
            _restoreBtn(btn);
            if (r.ok) {
                notify(`Đã lưu + gia hạn ${r.name || id}`, 'success');
                closeCredsModal();
                await NS.loadAccounts();
                NS.renderJwtInfo();
                NS.renderBanner();
            } else {
                notify('Lỗi: ' + (r.reason || 'unknown') + ' — mật khẩu đúng chưa?', 'error');
            }
        } else {
            const r = await PA.saveCreds(id, identity, password, auto);
            _restoreBtn(btn);
            if (r.ok) {
                notify('Đã lưu mật khẩu (mã hoá)', 'success');
                closeCredsModal();
                await NS.loadAccounts();
            } else {
                notify('Lưu lỗi: ' + (r.reason || 'unknown'), 'error');
            }
        }
    }

    async function credsDelete() {
        const PA = window.Web2PancakeAccounts;
        const id = S._credsAccountId;
        if (
            !(await Popup.danger('Xoá mật khẩu đã lưu? Sẽ tắt tự động gia hạn cho account này.', {
                okText: 'Xoá',
            }))
        )
            return;
        const r = await PA.deleteCreds(id);
        if (r.ok) {
            notify('Đã xoá mật khẩu', 'success');
            closeCredsModal();
            await NS.loadAccounts();
        } else {
            notify('Xoá lỗi: ' + (r.reason || 'unknown'), 'error');
        }
    }

    function wireCredsModal() {
        $('credsModalClose')?.addEventListener('click', closeCredsModal);
        $('credsSaveRefresh')?.addEventListener('click', () => credsSave(true));
        $('credsSaveOnly')?.addEventListener('click', () => credsSave(false));
        $('credsDelete')?.addEventListener('click', credsDelete);
        const overlay = $('credsModal');
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) closeCredsModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.hidden) closeCredsModal();
        });
    }

    async function useAccount(id) {
        const acc = S._accountsCache.find((a) => a.account_id === id);
        if (!acc) return;
        if (window.Web2PancakeAccounts.isExpired(acc.token_exp)) {
            if (
                !(await Popup.confirm(
                    'Token của tài khoản này đã hết hạn — chọn dùng vẫn sẽ lỗi khi gửi tin. Tiếp tục?'
                ))
            )
                return;
        }
        const r = window.Web2PancakeAccounts.setActiveLocal(acc);
        if (!r.ok) {
            notify('Không đặt được active: ' + r.reason, 'error');
            return;
        }
        notify(`Đang dùng tài khoản: ${acc.name || acc.account_id}`, 'success');
        NS.renderAccountList(S._accountsCache);
        NS.renderJwtInfo();
        NS.renderBanner();
        NS.loadPages();
    }

    async function deleteAccount(id) {
        const acc = S._accountsCache.find((a) => a.account_id === id);
        const label = acc?.name || acc?.fb_name || id;
        if (
            !(await Popup.danger(
                `Xoá tài khoản "${label}" khỏi DB? Mọi máy sẽ không còn account này.`,
                { okText: 'Xoá' }
            ))
        )
            return;
        const snapshot = S._accountsCache;
        const apply = () => {
            S._accountsCache = snapshot.filter((a) => a.account_id !== id);
            NS.renderAccountList(S._accountsCache);
            NS.renderPageAdminStats();
        };
        const run = async () => {
            const r = await window.Web2PancakeAccounts.remove(id);
            if (!r.ok) throw new Error(r.reason || 'delete_failed');
        };
        const rollback = () => {
            S._accountsCache = snapshot;
            NS.renderAccountList(snapshot);
            NS.renderPageAdminStats();
        };
        const onSuccess = () => {
            NS.renderJwtInfo();
            NS.renderBanner();
        };
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run({
                snapshot,
                apply,
                run,
                rollback,
                onSuccess,
                successMsg: 'Đã xoá tài khoản',
                errLabel: 'Xoá tài khoản',
            });
        } else {
            apply();
            run()
                .then(() => {
                    notify('Đã xoá tài khoản', 'success');
                    onSuccess();
                })
                .catch((e) => {
                    rollback();
                    notify('Lỗi xoá tài khoản: ' + e.message, 'error');
                });
        }
    }

    function toggleAddPanel(show) {
        const panel = $('addAccountPanel');
        if (!panel) return;
        const willShow = show === undefined ? panel.hasAttribute('hidden') : show;
        if (willShow) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        if (willShow) $('addAccountInput')?.focus();
    }

    async function addAccountFromInput() {
        const PA = window.Web2PancakeAccounts;
        const input = $('addAccountInput');
        const txt = (input?.value || '').trim();
        if (!txt) {
            notify('Paste JWT token của account mới trước đã', 'warning');
            return;
        }
        const btn = $('btnAddSave');
        _setBtnLoading(btn, 'Đang thêm…');
        const r = await PA.addFromToken(txt);
        _restoreBtn(btn);
        if (!r.ok) {
            const map = {
                empty: 'Token rỗng',
                decode: 'Token không hợp lệ (không decode được)',
                expired: 'Token đã hết hạn — đăng nhập lại pancake.vn',
            };
            notify('Không thêm được: ' + (map[r.reason] || r.reason), 'error');
            return;
        }
        // account mới → đặt làm active luôn cho tiện
        PA.setActiveLocal({
            account_id: r.accountId,
            token: txt.replace(/^(?:jwt|token)=/i, '').trim(),
            exp: r.decoded?.exp,
        });
        notify('Đã thêm tài khoản vào DB', 'success');
        input.value = '';
        toggleAddPanel(false);
        await NS.loadAccounts();
        NS.renderJwtInfo();
        NS.renderBanner();
        NS.loadPages();
    }

    async function addAccountAuto() {
        const PK = window.Web2PancakeToken;
        const btn = $('btnAddAuto');
        if (!PK || !PK.isExtensionPresent()) {
            notify(REASON_MSG.no_extension, 'warning');
            return;
        }
        _setBtnLoading(btn, 'Đang lấy…');
        const res = await PK.fetchFromExtension();
        _restoreBtn(btn);
        if (!res.ok) {
            notify('Không lấy được token: ' + (REASON_MSG[res.reason] || res.reason), 'error');
            return;
        }
        const input = $('addAccountInput');
        if (input) input.value = res.token;
        notify('Đã lấy token — bấm "Thêm vào danh sách"', 'success');
    }

    // Expose on namespace.
    NS.saveJwt = saveJwt;
    NS.testJwt = testJwt;
    NS.clearJwt = clearJwt;
    NS.clearPageTokens = clearPageTokens;
    NS.generateAll = generateAll;
    NS.nuke = nuke;
    NS.doAutoFetch = doAutoFetch;
    NS.openExpiryModal = openExpiryModal;
    NS.closeExpiryModal = closeExpiryModal;
    NS.wireModal = wireModal;
    NS.runMonitor = runMonitor;
    NS.renewAccount = renewAccount;
    NS.openCredsModal = openCredsModal;
    NS.closeCredsModal = closeCredsModal;
    NS.credsSave = credsSave;
    NS.credsDelete = credsDelete;
    NS.wireCredsModal = wireCredsModal;
    NS.useAccount = useAccount;
    NS.deleteAccount = deleteAccount;
    NS.toggleAddPanel = toggleAddPanel;
    NS.addAccountFromInput = addAccountFromInput;
    NS.addAccountAuto = addAccountAuto;
})();
