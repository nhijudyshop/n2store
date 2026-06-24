// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2AiAssistant — TRỢ LÝ AI THEO TRANG (floating, dùng chung mọi trang Web 2.0).
//
// Mục tiêu (user 2026-06-24): mỗi trang có 1 trợ lý AI đọc DỮ LIỆU ĐANG HIỆN trên
// trang (bảng số liệu, tổng cộng, hội thoại khách, đơn hàng…) để: rà soát số liệu/
// phép tính, giải thích trang, phân tích cảm xúc khách, soát đơn — bằng **AI FREE**
// (backend /api/web2-ai xoay key groq/gemini/openrouter/chatanywhere).
//
// CHỈ đọc dữ liệu CÓ SẴN ở browser (DOM hiển thị + vùng bôi đen). KHÔNG gửi
// localStorage/token (tránh lộ secret cho bên thứ 3).
//
// Cấu hình ở trang riêng web2/ai-assistant (localStorage `web2_ai_assistant`):
//   { enabled:bool, provider:'', model:'' }  — provider rỗng = auto /complete failover.
//
// API: Web2AiAssistant.open() / .close() / .reloadConfig() / .ask(text)
// Auto-mount qua web2-sidebar (nút nổi góc phải dưới).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2AiAssistant) return;

    const CFG_KEY = 'web2_ai_assistant';
    const MAX_CTX = 7000; // ký tự context tối đa gửi AI

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
    let cfg = loadCfg();

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ───────── Thu thập NGỮ CẢNH trang (chỉ DOM hiển thị, an toàn) ─────────
    function _tableText(tb, cap) {
        const rows = [...tb.querySelectorAll('tr')].slice(0, 40);
        const lines = rows.map((tr) =>
            [...tr.querySelectorAll('th,td')]
                .slice(0, 12)
                .map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())
                .join(' | ')
        );
        let out = lines.filter((l) => l).join('\n');
        if (out.length > cap) out = out.slice(0, cap) + '…';
        return out;
    }

    function pageContext() {
        const parts = [];
        const title = (
            document.querySelector('h1, .aih-title, .page-title')?.innerText ||
            document.title ||
            ''
        ).trim();
        parts.push('TRANG: ' + title + '  (' + location.pathname + ')');

        // Vùng người dùng bôi đen → ưu tiên cao nhất.
        const sel = String(window.getSelection ? window.getSelection() : '').trim();
        if (sel && sel.length > 4) parts.push('ĐOẠN ĐANG CHỌN:\n' + sel.slice(0, 2500));

        // Bảng số liệu (structured) — nguồn chính cho rà soát phép tính.
        const tables = [...document.querySelectorAll('main table, .web2-main table, table')].slice(
            0,
            4
        );
        let tbBudget = 3500;
        tables.forEach((tb, i) => {
            if (tbBudget <= 0) return;
            const t = _tableText(tb, Math.min(tbBudget, 1800));
            if (t) {
                parts.push('BẢNG ' + (i + 1) + ':\n' + t);
                tbBudget -= t.length;
            }
        });

        // Text chính của trang (gom KPI/card/hội thoại…) — fallback, cắt gọn.
        const main = document.querySelector('main, .web2-main') || document.body;
        let mainTxt = (main.innerText || '').replace(/\n{2,}/g, '\n').trim();
        const used = parts.join('\n').length;
        const room = Math.max(0, MAX_CTX - used - 200);
        if (room > 300) parts.push('NỘI DUNG HIỂN THỊ:\n' + mainTxt.slice(0, room));

        let ctx = parts.join('\n\n');
        if (ctx.length > MAX_CTX) ctx = ctx.slice(0, MAX_CTX) + '…';
        return ctx;
    }

    function systemPrompt() {
        return (
            'Bạn là TRỢ LÝ AI hỗ trợ nhân viên trên hệ thống quản lý bán hàng Web 2.0 (shop thời trang nữ N2Store). ' +
            'Người dùng đang xem 1 trang; bên dưới là DỮ LIỆU ĐANG HIỂN THỊ trên trang đó. ' +
            'CHỈ dựa vào dữ liệu này để trả lời — KHÔNG bịa số liệu/đơn/khách không có trong dữ liệu. ' +
            'Khi rà soát phép tính: tự cộng/trừ lại từ các số trong bảng, chỉ rõ dòng nào sai và số đúng. ' +
            'Khi phân tích cảm xúc khách: dựa vào lời lẽ trong hội thoại, nêu rõ vui/bình thường/khó chịu + lý do + gợi ý cách trả lời. ' +
            'Trả lời tiếng Việt, NGẮN GỌN, đi thẳng vấn đề, dùng gạch đầu dòng khi liệt kê. ' +
            'Nếu dữ liệu không đủ để kết luận, nói rõ thiếu gì.\n\n===== DỮ LIỆU TRANG =====\n' +
            pageContext()
        );
    }

    // ───────── Gọi AI free (non-stream) ─────────
    async function callAi(messages) {
        const sys = systemPrompt();
        const body = cfg.provider
            ? {
                  provider: cfg.provider,
                  model: cfg.model || undefined,
                  messages,
                  system: sys,
                  maxTokens: 900,
              }
            : { messages, system: sys, maxTokens: 900 };
        const path = cfg.provider ? '/chat' : '/complete';
        const r = await fetch(API() + path, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(body),
        });
        if (r.status === 401) {
            const e = new Error('Phiên Web 2.0 hết hạn — đăng nhập lại.');
            e.code = 401;
            throw e;
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'AI lỗi (HTTP ' + r.status + ')');
        return (
            j.text ||
            j.reply ||
            j.content ||
            (j.message && j.message.content) ||
            '(không có phản hồi)'
        );
    }

    // ───────── UI ─────────
    let _root = null;
    const QUICKS = [
        {
            t: '📊 Rà soát số liệu trang này',
            q: 'Rà soát toàn bộ số liệu đang hiển thị trên trang. Có dòng nào cộng/trừ sai, lệch tổng, hoặc bất thường không? Chỉ rõ dòng và số đúng.',
        },
        {
            t: '🧮 Kiểm tra phép tính',
            q: 'Tự tính lại các phép cộng/trừ/tổng trong các bảng trên trang. Liệt kê dòng nào sai và giá trị đúng.',
        },
        {
            t: '🙂 Phân tích cảm xúc khách',
            q: 'Dựa vào hội thoại đang hiển thị, khách đang vui / bình thường / khó chịu? Vì sao? Gợi ý câu trả lời phù hợp.',
        },
        {
            t: '🧾 Soát lại đơn hàng',
            q: 'Rà soát dữ liệu đơn hàng đang hiển thị: thiếu thông tin, số tiền lệch, trạng thái bất thường? Tóm tắt cần kiểm tra.',
        },
        {
            t: '❓ Giải thích trang này',
            q: 'Giải thích ngắn gọn trang này đang hiển thị gì và các số liệu/cột chính nghĩa là gì.',
        },
    ];
    const history = []; // {role, content}

    function injectCss() {
        if (document.getElementById('web2-ai-assistant-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-ai-assistant-css';
        st.textContent = `
.w2aa-fab{position:fixed;right:18px;bottom:18px;z-index:9400;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;
  background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:24px;box-shadow:0 8px 24px rgba(99,102,241,.42);
  display:flex;align-items:center;justify-content:center;transition:transform .15s,box-shadow .15s}
.w2aa-fab:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 12px 30px rgba(99,102,241,.5)}
.w2aa-fab[hidden]{display:none!important}
.w2aa-panel{position:fixed;right:18px;bottom:84px;z-index:9401;width:min(420px,calc(100vw - 28px));height:min(620px,calc(100vh - 120px));
  background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.26);display:none;flex-direction:column;overflow:hidden}
.w2aa-panel.open{display:flex}
.w2aa-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eef2f5;background:linear-gradient(135deg,#eef2ff,#faf5ff)}
.w2aa-head b{font-size:.96rem;color:#0f172a;flex:1}
.w2aa-head .w2aa-sub{font-size:.68rem;color:#64748b;font-weight:500}
.w2aa-ico{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px}
.w2aa-x,.w2aa-gear{border:none;background:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;color:#475569;font-size:16px}
.w2aa-x:hover,.w2aa-gear:hover{background:#eef2f5}
.w2aa-body{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:#f8fafc}
.w2aa-quicks{display:flex;flex-wrap:wrap;gap:6px}
.w2aa-quick{border:1px solid #dbe2ea;background:#fff;border-radius:999px;padding:6px 11px;font-size:.74rem;cursor:pointer;color:#334155}
.w2aa-quick:hover{border-color:#6366f1;color:#4f46e5;background:#eef2ff}
.w2aa-msg{max-width:88%;padding:9px 12px;border-radius:13px;font-size:.84rem;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.w2aa-msg.user{align-self:flex-end;background:#6366f1;color:#fff;border-bottom-right-radius:4px}
.w2aa-msg.ai{align-self:flex-start;background:#fff;border:1px solid #e6e9ef;color:#0f172a;border-bottom-left-radius:4px}
.w2aa-msg.ai b{font-weight:700}
.w2aa-empty{color:#94a3b8;font-size:.8rem;text-align:center;padding:10px 4px}
.w2aa-foot{padding:10px 12px;border-top:1px solid #eef2f5;display:flex;gap:8px;align-items:flex-end;background:#fff}
.w2aa-input{flex:1;resize:none;max-height:110px;min-height:40px;border:1px solid #d6dee2;border-radius:11px;padding:9px 11px;font:inherit;font-size:.86rem;outline:none}
.w2aa-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.w2aa-send{border:none;background:#6366f1;color:#fff;width:40px;height:40px;border-radius:11px;cursor:pointer;font-size:17px;flex:0 0 auto}
.w2aa-send:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:560px){.w2aa-panel{right:10px;left:10px;width:auto;bottom:78px}.w2aa-fab{right:12px;bottom:12px}}`;
        document.head.appendChild(st);
    }

    function render() {
        const body = _root.querySelector('.w2aa-body');
        const quicks =
            '<div class="w2aa-quicks">' +
            QUICKS.map(
                (q, i) => `<button class="w2aa-quick" data-q="${i}">${esc(q.t)}</button>`
            ).join('') +
            '</div>';
        const msgs = history.length
            ? history
                  .map(
                      (m) =>
                          `<div class="w2aa-msg ${m.role === 'user' ? 'user' : 'ai'}">${
                              m.role === 'user' ? esc(m.content) : _md(m.content)
                          }</div>`
                  )
                  .join('')
            : '<div class="w2aa-empty">Hỏi bất cứ gì về dữ liệu đang hiển thị trên trang — hoặc bấm gợi ý bên dưới.</div>';
        body.innerHTML = (history.length ? '' : quicks + '<div style="height:4px"></div>') + msgs;
        body.querySelectorAll('[data-q]').forEach((b) =>
            b.addEventListener('click', () => ask(QUICKS[+b.dataset.q].q))
        );
        body.scrollTop = body.scrollHeight;
    }

    // markdown rất nhẹ (bold + xuống dòng) trên text đã escape.
    function _md(s) {
        return esc(s)
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    function ensureUi() {
        if (_root) return _root;
        injectCss();
        const wrap = document.createElement('div');
        wrap.innerHTML = `
          <button class="w2aa-fab" title="Trợ lý AI cho trang này" aria-label="Trợ lý AI">✨</button>
          <section class="w2aa-panel" role="dialog" aria-label="Trợ lý AI theo trang">
            <div class="w2aa-head">
              <div class="w2aa-ico">✨</div>
              <b>Trợ lý AI trang này<div class="w2aa-sub">Đọc dữ liệu đang hiển thị • AI miễn phí</div></b>
              <button class="w2aa-gear" title="Cấu hình AI">⚙️</button>
              <button class="w2aa-x" title="Đóng">×</button>
            </div>
            <div class="w2aa-body"></div>
            <div class="w2aa-foot">
              <textarea class="w2aa-input" rows="1" placeholder="Hỏi về số liệu / khách / đơn trên trang…"></textarea>
              <button class="w2aa-send" title="Gửi">➤</button>
            </div>
          </section>`;
        document.body.appendChild(wrap);
        _root = wrap;

        const fab = wrap.querySelector('.w2aa-fab');
        const panel = wrap.querySelector('.w2aa-panel');
        const input = wrap.querySelector('.w2aa-input');
        const send = wrap.querySelector('.w2aa-send');

        fab.addEventListener('click', () => (panel.classList.contains('open') ? close() : open()));
        wrap.querySelector('.w2aa-x').addEventListener('click', close);
        wrap.querySelector('.w2aa-gear').addEventListener('click', () => {
            const base = location.pathname.includes('/web2/')
                ? '../ai-assistant/index.html'
                : '/web2/ai-assistant/index.html';
            location.href = base;
        });
        send.addEventListener('click', () => {
            const v = input.value.trim();
            if (v) {
                input.value = '';
                input.style.height = 'auto';
                ask(v);
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send.click();
            }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(110, input.scrollHeight) + 'px';
        });
        return _root;
    }

    function open() {
        ensureUi();
        _root.querySelector('.w2aa-panel').classList.add('open');
        render();
        setTimeout(() => _root.querySelector('.w2aa-input')?.focus(), 50);
    }
    function close() {
        if (_root) _root.querySelector('.w2aa-panel').classList.remove('open');
    }

    let _busy = false;
    async function ask(text) {
        if (_busy || !text) return;
        _busy = true;
        ensureUi();
        _root.querySelector('.w2aa-panel').classList.add('open');
        history.push({ role: 'user', content: text });
        history.push({ role: 'ai', content: '⏳ Đang đọc dữ liệu trang & suy nghĩ…' });
        render();
        try {
            // Gửi tối đa 6 lượt gần nhất (giữ nhẹ).
            const msgs = history
                .filter((m) => m.content && !m.content.startsWith('⏳'))
                .slice(-7)
                .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
            const reply = await callAi(msgs);
            history[history.length - 1] = { role: 'ai', content: reply };
        } catch (e) {
            history[history.length - 1] = {
                role: 'ai',
                content: '⚠️ ' + (e.message || 'Lỗi gọi AI'),
            };
            if (e.code === 401 && global.Web2Auth?.requireAuth)
                setTimeout(() => global.Web2Auth.requireAuth(), 1500);
        } finally {
            _busy = false;
            render();
        }
    }

    function reloadConfig() {
        cfg = loadCfg();
        if (_root) _root.querySelector('.w2aa-fab').hidden = !cfg.enabled;
    }

    function mount() {
        cfg = loadCfg();
        if (!cfg.enabled) return; // user tắt ở trang cấu hình
        // Không hiện trên trang đăng nhập / chính trang cấu hình trợ lý.
        if (
            /\/web2\/login\//.test(location.pathname) ||
            /\/web2\/ai-assistant\//.test(location.pathname)
        )
            return;
        ensureUi();
        _root.querySelector('.w2aa-fab').hidden = !cfg.enabled;
    }

    global.Web2AiAssistant = {
        open,
        close,
        ask,
        mount,
        reloadConfig,
        pageContext,
        loadCfg,
        CFG_KEY,
    };

    // Auto-mount khi DOM sẵn sàng (sidebar autoload script này).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 300));
    } else {
        setTimeout(mount, 300);
    }
})(window);
