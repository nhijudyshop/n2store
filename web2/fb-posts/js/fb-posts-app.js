// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài FB: orchestrator (sidebar, tabs, kết nối FB, SSE, trạng thái).
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;

    window.FBPosts = window.FBPosts || {};
    const state = {
        connected: false,
        expired: false,
        pages: [],
        aiAvailable: false,
        user: null,
        selectedPages: new Set(),
        editingDraftId: null,
        activeTab: 'composer',
    };
    window.FBPosts.state = state;

    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }

    // ── Tabs ───────────────────────────────────────────────────────────────
    function switchTab(name) {
        state.activeTab = name;
        document
            .querySelectorAll('#fbpTabs .fbp-tab')
            .forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
        document
            .querySelectorAll('.fbp-panel')
            .forEach((p) => p.classList.toggle('on', p.id === 'panel-' + name));
        renderActive();
    }
    window.FBPosts.switchTab = switchTab;

    function renderActive() {
        if (state.activeTab === 'composer') window.FBPostsComposer.render();
        else if (state.activeTab === 'list') window.FBPostsList.render();
        else if (state.activeTab === 'drafts') window.FBPostsDrafts.render();
    }
    window.FBPosts.renderActive = renderActive;

    // ── Connection pill ──────────────────────────────────────────────────────
    function renderPill() {
        const pill = document.getElementById('fbpConnPill');
        const btn = document.getElementById('fbpConnBtn');
        if (!pill) return;
        if (state.connected) {
            pill.className = 'fbp-pill is-on';
            pill.innerHTML = `<i data-lucide="check-circle-2"></i> ${esc(state.user?.name || 'Đã kết nối')} · ${state.pages.length} page`;
            btn.innerHTML = '<i data-lucide="settings"></i> Quản lý';
        } else {
            pill.className = 'fbp-pill is-off';
            pill.innerHTML = state.expired
                ? '<i data-lucide="alert-triangle"></i> Token hết hạn'
                : '<i data-lucide="x-circle"></i> Chưa kết nối';
            btn.innerHTML = '<i data-lucide="link"></i> Kết nối';
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    async function loadStatus() {
        try {
            const r = await Api().status();
            state.connected = !!r.connected;
            state.expired = !!r.expired;
            state.pages = r.pages || [];
            state.aiAvailable = !!r.aiAvailable;
            state.user = r.user || null;
            // mặc định chọn TẤT CẢ page (đăng đồng loạt)
            if (!state.selectedPages.size)
                state.selectedPages = new Set(state.pages.map((p) => p.id));
        } catch (e) {
            state.connected = false;
        }
        renderPill();
        renderActive();
    }

    // ── Connect overlay ───────────────────────────────────────────────────────
    function openConnect() {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow:auto;padding:20px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                    <i data-lucide="facebook" style="color:var(--web2-primary,#0068ff)"></i>
                    <strong style="flex:1;font-size:1.05rem">Kết nối Facebook</strong>
                    <button id="fbpCxClose" class="fbp-btn ghost sm">Đóng</button>
                </div>
                ${
                    state.connected
                        ? `<div class="fbp-connect-help">Đang kết nối: <b>${esc(state.user?.name || '')}</b> · ${state.pages.length} page (${esc(state.pages.map((p) => p.name).join(', '))}).</div>`
                        : ''
                }
                <div class="fbp-connect-help">
                    Dán <b>User Access Token</b> (có quyền <code>pages_show_list</code>, <code>pages_manage_posts</code>, <code>pages_read_engagement</code>):
                    <ol>
                        <li>Mở <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener">Graph API Explorer</a></li>
                        <li>Chọn app, bấm <i>Add a Permission</i> → tick 3 quyền trên</li>
                        <li><i>Generate Access Token</i> → đăng nhập + duyệt page → copy token</li>
                        <li>Dán vào ô dưới rồi bấm <b>Kết nối</b></li>
                    </ol>
                </div>
                <textarea id="fbpCxToken" class="fbp-textarea" style="min-height:90px;font-size:.8rem" placeholder="EAAB... (dán token vào đây)"></textarea>
                <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
                    <button id="fbpCxConnect" class="fbp-btn"><i data-lucide="link"></i> Kết nối</button>
                    ${state.connected ? '<button id="fbpCxRefresh" class="fbp-btn ghost"><i data-lucide="refresh-cw"></i> Đồng bộ page</button>' : ''}
                    ${state.connected ? '<button id="fbpCxLogout" class="fbp-btn danger" style="margin-left:auto"><i data-lucide="log-out"></i> Ngắt kết nối</button>' : ''}
                </div>
            </div>`;
        document.body.appendChild(overlay);
        if (window.lucide?.createIcons) window.lucide.createIcons();
        const close = () => overlay.remove();
        overlay.querySelector('#fbpCxClose').onclick = close;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('#fbpCxConnect').onclick = async () => {
            const token = overlay.querySelector('#fbpCxToken').value.trim();
            if (!token) {
                notify('Dán token trước', 'warning');
                return;
            }
            const b = overlay.querySelector('#fbpCxConnect');
            b.disabled = true;
            b.innerHTML = '<i data-lucide="loader"></i> Đang kết nối…';
            try {
                const r = await Api().connect(token);
                if (r.success) {
                    notify(`Đã kết nối ${r.pages.length} page`, 'success');
                    close();
                    await loadStatus();
                } else notify(r.error || 'Kết nối thất bại', 'error');
            } catch (e) {
                notify(e.message, 'error');
            } finally {
                b.disabled = false;
            }
        };
        const refreshBtn = overlay.querySelector('#fbpCxRefresh');
        if (refreshBtn)
            refreshBtn.onclick = async () => {
                try {
                    const r = await Api().refreshPages();
                    if (r.success) {
                        notify('Đã đồng bộ page', 'success');
                        close();
                        await loadStatus();
                    } else notify(r.error || 'Lỗi', 'error');
                } catch (e) {
                    notify(e.message, 'error');
                }
            };
        const logoutBtn = overlay.querySelector('#fbpCxLogout');
        if (logoutBtn)
            logoutBtn.onclick = async () => {
                const ok =
                    window.Popup && window.Popup.danger
                        ? await window.Popup.danger('Ngắt kết nối Facebook?')
                        : confirm('Ngắt kết nối?');
                if (!ok) return;
                await Api().disconnect();
                state.selectedPages = new Set();
                close();
                await loadStatus();
            };
    }

    // ── SSE ────────────────────────────────────────────────────────────────
    function setupSSE() {
        if (!window.Web2SSE || !window.Web2SSE.subscribe) return;
        let t;
        window.Web2SSE.subscribe('web2:fb-posts', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                if (state.activeTab === 'drafts') window.FBPostsDrafts.render();
                else if (state.activeTab === 'list') window.FBPostsList.render();
            }, 600);
        });
    }

    function init() {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        document
            .querySelectorAll('#fbpTabs .fbp-tab')
            .forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
        document.getElementById('fbpConnBtn').addEventListener('click', openConnect);
        if (window.lucide?.createIcons) window.lucide.createIcons();
        loadStatus();
        setupSSE();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
