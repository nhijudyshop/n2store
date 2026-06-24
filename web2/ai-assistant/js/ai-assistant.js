// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Trang QUẢN LÝ trợ lý AI theo trang: bật/tắt + chọn AI free (provider/model) + thử nhanh.
// Lưu cấu hình localStorage `web2_ai_assistant` (Web2AiAssistant đọc lại qua reloadConfig).
(function (global) {
    'use strict';

    const CFG_KEY =
        (global.Web2AiAssistant && global.Web2AiAssistant.CFG_KEY) || 'web2_ai_assistant';

    function workerBase() {
        return (
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const API = () => workerBase() + '/api/web2-ai';

    function authHeaders(json) {
        const h = json ? { 'Content-Type': 'application/json' } : {};
        try {
            const a = (global.Web2Auth?.authHeaders && global.Web2Auth.authHeaders()) || {};
            Object.assign(h, a);
        } catch {}
        return h;
    }

    function toast(m, t) {
        if (global.notificationManager?.show) global.notificationManager.show(m, t || 'info');
    }

    function loadCfg() {
        try {
            const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
            return {
                enabled: c.enabled !== false,
                provider: c.provider || '',
                model: c.model || '',
            };
        } catch {
            return { enabled: true, provider: '', model: '' };
        }
    }
    function saveCfg(c) {
        localStorage.setItem(CFG_KEY, JSON.stringify(c));
        if (global.Web2AiAssistant?.reloadConfig) global.Web2AiAssistant.reloadConfig();
    }

    const state = { cfg: loadCfg(), providers: [] };

    function $(id) {
        return document.getElementById(id);
    }

    function renderEnable() {
        const el = $('aamEnable');
        el.classList.toggle('on', state.cfg.enabled);
        $('aamEnableLbl').textContent = state.cfg.enabled ? 'Đang bật' : 'Đang tắt';
    }

    function renderProviders() {
        const provSel = $('aamProvider');
        const configured = state.providers.filter((p) => p.configured);
        provSel.innerHTML =
            '<option value="">🎲 Tự động (xoay tua AI mạnh — khuyên dùng)</option>' +
            configured
                .map(
                    (p) =>
                        `<option value="${p.id}" ${p.id === state.cfg.provider ? 'selected' : ''}>${escAttr(p.label || p.id)}</option>`
                )
                .join('');
        renderModels();
        // Trạng thái provider
        const st = $('aamProvStatus');
        if (!state.providers.length) {
            st.innerHTML =
                '<span class="no">Chưa tải được danh sách AI (kiểm tra đăng nhập).</span>';
            return;
        }
        st.innerHTML =
            'AI sẵn sàng: ' +
            state.providers
                .map(
                    (p) =>
                        `<span class="${p.configured ? 'ok' : 'no'}">${escAttr(p.label || p.id)}${p.configured ? ' ✓' : ' ✕'}</span>`
                )
                .join(' &nbsp;·&nbsp; ');
    }

    function renderModels() {
        const modelSel = $('aamModel');
        const pid = $('aamProvider').value;
        if (!pid) {
            modelSel.innerHTML = '<option value="">(tự chọn theo AI)</option>';
            modelSel.disabled = true;
            return;
        }
        modelSel.disabled = false;
        const p = state.providers.find((x) => x.id === pid);
        const models = (p && p.models) || [];
        modelSel.innerHTML =
            '<option value="">Mặc định</option>' +
            models
                .map(
                    (m) =>
                        `<option value="${escAttr(m.id)}" ${m.id === state.cfg.model ? 'selected' : ''}>${escAttr(m.label || m.id)}</option>`
                )
                .join('');
    }

    function escAttr(s) {
        return String(s == null ? '' : s)
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function currentCfgFromUi() {
        return {
            enabled: state.cfg.enabled,
            provider: $('aamProvider').value || '',
            model: $('aamProvider').value ? $('aamModel').value || '' : '',
        };
    }

    async function loadStatus() {
        try {
            const r = await fetch(API() + '/status', { headers: authHeaders(false) });
            if (r.status === 401) {
                if (global.Web2Auth?.requireAuth) global.Web2Auth.requireAuth();
                return;
            }
            const j = await r.json();
            state.providers = (j.chat && j.chat.providers) || [];
            renderProviders();
        } catch (e) {
            $('aamProvStatus').innerHTML =
                '<span class="no">Lỗi tải AI: ' + escAttr(e.message) + '</span>';
        }
    }

    async function testAsk() {
        const q = $('aamTestIn').value.trim();
        if (!q) return toast('Nhập câu thử trước', 'warning');
        const out = $('aamTestOut');
        out.hidden = false;
        out.textContent = '⏳ Đang gọi AI…';
        const cfg = currentCfgFromUi();
        const body = cfg.provider
            ? {
                  provider: cfg.provider,
                  model: cfg.model || undefined,
                  messages: [{ role: 'user', content: q }],
                  maxTokens: 500,
              }
            : { messages: [{ role: 'user', content: q }], maxTokens: 500 };
        try {
            const r = await fetch(API() + (cfg.provider ? '/chat' : '/complete'), {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify(body),
            });
            if (r.status === 401) {
                out.textContent = '⚠️ Phiên hết hạn — đăng nhập lại.';
                if (global.Web2Auth?.requireAuth)
                    setTimeout(() => global.Web2Auth.requireAuth(), 1200);
                return;
            }
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.error) {
                out.textContent = '⚠️ ' + (j.error || 'Lỗi HTTP ' + r.status);
                return;
            }
            out.textContent =
                j.text ||
                j.reply ||
                j.content ||
                (j.message && j.message.content) ||
                '(không có phản hồi)';
        } catch (e) {
            out.textContent = '⚠️ ' + e.message;
        }
    }

    function init() {
        renderEnable();
        $('aamEnable').addEventListener('click', () => {
            state.cfg.enabled = !state.cfg.enabled;
            renderEnable();
            saveCfg(currentCfgFromUi());
            toast(state.cfg.enabled ? 'Đã bật trợ lý nổi' : 'Đã tắt trợ lý nổi', 'success');
        });
        $('aamProvider').addEventListener('change', renderModels);
        $('aamTestBtn').addEventListener('click', testAsk);
        $('aamSaveBtn').addEventListener('click', () => {
            state.cfg = currentCfgFromUi();
            saveCfg(state.cfg);
            toast('Đã lưu cấu hình trợ lý AI', 'success');
        });
        loadStatus();
    }

    global.AiAssistantAdmin = { init };
})(window);
