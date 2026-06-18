// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake settings page (orchestrator)
// =====================================================
//
// Manages the localStorage keys that Web2Chat reads:
//   pancake_jwt_token         (string)
//   pancake_jwt_token_expiry  (epoch seconds)
//   pancake_page_access_tokens ({ pageId: { token, ... } })
//
// All operations go through window.Web2Chat — no shared code with the
// web2-pancake module. State + utils, API calls, render, and actions are
// split into sibling modules attached to window.__PancakeSettings (NS),
// loaded BEFORE this file (state → api → render → actions → app). This
// orchestrator only wires DOM events + boots — it exposes no window.* API.

(function () {
    'use strict';

    const NS = window.__PancakeSettings;

    function init() {
        if (!window.Web2Chat) {
            NS.notify('Web2Chat không load — refresh trang', 'error');
            return;
        }
        const $ = NS.$;

        $('btnSaveJwt').addEventListener('click', NS.saveJwt);
        $('btnTestJwt').addEventListener('click', NS.testJwt);
        $('btnClearJwt').addEventListener('click', NS.clearJwt);
        $('btnRefreshPages').addEventListener('click', NS.loadPages);
        $('btnGenerateAll').addEventListener('click', NS.generateAll);
        $('btnClearPageTokens').addEventListener('click', NS.clearPageTokens);
        $('btnNuke').addEventListener('click', NS.nuke);

        const autoBtn = $('btnAutoJwt');
        if (autoBtn) autoBtn.addEventListener('click', () => NS.doAutoFetch(autoBtn));

        // Accounts card
        $('btnAddAccount')?.addEventListener('click', () => NS.toggleAddPanel());
        $('btnAddCancel')?.addEventListener('click', () => NS.toggleAddPanel(false));
        $('btnReloadAccounts')?.addEventListener('click', NS.loadAccounts);
        $('btnSyncAccountPages')?.addEventListener('click', NS.syncAccountPages);
        $('btnAddSave')?.addEventListener('click', NS.addAccountFromInput);
        $('btnAddAuto')?.addEventListener('click', NS.addAccountAuto);

        // Realtime server (WS) card
        $('btnRelaySave')?.addEventListener('click', NS.saveRelaySelection);
        $('btnRelayReload')?.addEventListener('click', NS.loadRelayPages);

        NS.wireModal();
        NS.wireCredsModal();

        NS.renderJwtInfo();
        NS.renderExtStatus();
        NS.loadAccounts();
        NS.loadRelayPages();
        if (window.Web2Chat.getJwt()) {
            // auto-load if JWT already present
            NS.loadPages();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Theo dõi expiry + auto-refresh (chạy sau cùng, không chặn render)
        setTimeout(NS.runMonitor, 350);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // sidebar mount
            if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
            init();
        });
    } else {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        init();
    }
})();
