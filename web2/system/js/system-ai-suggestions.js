// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// System / Cấu hình → tab "Gợi ý AI". Liệt kê TOÀN BỘ gợi ý + accessor của widget AI nổi ✨ theo
// từng trang Web 2.0 — nguồn window.Web2AiPageRegistry (web2/shared/web2-ai-page-registry.js).
// Dùng để quản lý: trang nào có mấy câu gợi ý, đọc data qua accessor nào, model gì, có note không.
// Lazy-start: chỉ build khi mở tab. Expose window.SystemAiSuggestions.
(function () {
    'use strict';

    let _started = false;
    const state = { q: '' };
    const $ = (id) => document.getElementById(id);
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function reg() {
        return window.Web2AiPageRegistry || null;
    }

    // Gom mọi entry: PAGES + GENERIC (fallback chung).
    function allEntries() {
        const R = reg();
        if (!R) return [];
        const pages = (R.PAGES || []).map((p) => ({
            route: p.match || '?',
            model: p.model,
            accessors: p.accessors || [],
            suggestions: p.suggestions || [],
            note: p.note || '',
        }));
        if (Array.isArray(R.GENERIC) && R.GENERIC.length) {
            pages.push({
                route: '(chung — mọi trang chưa có entry riêng)',
                model: R.DEFAULT_MODEL,
                accessors: [],
                suggestions: R.GENERIC,
                note: 'GENERIC: dùng cho trang KHÔNG khớp match nào. Widget đọc DOM + accessor chung.',
            });
        }
        return pages;
    }

    function renderSummary(entries) {
        const totalSug = entries.reduce((s, e) => s + e.suggestions.length, 0);
        const withAcc = entries.filter((e) => e.accessors.length).length;
        const noAcc = entries.filter((e) => !e.accessors.length).length;
        const cards = [
            ['🗂️ Trang có gợi ý', entries.length],
            ['💬 Tổng câu gợi ý', totalSug],
            ['🔗 Có accessor data', withAcc],
            ['⚠️ Chỉ DOM (0 accessor)', noAcc],
        ];
        $('aiSummary').innerHTML = cards
            .map(
                ([k, v]) =>
                    `<div class="sd-cost-card"><span class="sd-cost-label">${k}</span><strong class="sd-cost-value">${v}</strong></div>`
            )
            .join('');
    }

    function modelLabel(m) {
        if (!m) return '—';
        return `${esc(m.provider || '')}${m.model ? ' · ' + esc(m.model) : ''}`;
    }

    function entryCard(e) {
        const accs = e.accessors.length
            ? `<div style="margin:8px 0 4px;font-weight:600;color:#0b2545;font-size:.82rem">🔗 Accessor dữ liệu (${e.accessors.length})</div>` +
              e.accessors
                  .map(
                      (a) =>
                          `<div style="font-size:.78rem;margin:3px 0;padding:5px 8px;background:#f1f7ff;border-radius:7px"><code style="color:#0058da">${esc(a.expr)}</code><div style="color:#64748b;margin-top:2px">${esc((a.desc || '').slice(0, 160))}</div></div>`
                  )
                  .join('')
            : `<div style="margin:8px 0 4px;font-size:.8rem;color:#b45309">⚠️ Chưa có accessor — widget chỉ đọc DOM (có thể thiếu data).</div>`;
        const sugs = e.suggestions
            .map(
                (s) =>
                    `<details style="margin:4px 0;border:1px solid #eef3f9;border-radius:8px;padding:6px 9px">
                        <summary style="cursor:pointer;font-size:.82rem;font-weight:600;color:#334155">${esc(s.label || '(không nhãn)')}</summary>
                        <div style="font-size:.78rem;color:#475569;margin-top:5px;white-space:pre-wrap;line-height:1.5">${esc(s.prompt || '')}</div>
                    </details>`
            )
            .join('');
        const note = e.note
            ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:.76rem;color:#7089a8">📝 Ghi chú nguồn dữ liệu</summary><div style="font-size:.76rem;color:#64748b;margin-top:4px;line-height:1.5">${esc(e.note)}</div></details>`
            : '';
        return `<div style="border:1px solid #e8eef6;border-radius:13px;padding:13px 15px;margin-bottom:12px;background:#fff">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
                <strong style="font-size:.92rem;color:#0b2545"><code>${esc(e.route)}</code></strong>
                <span style="display:flex;gap:8px;align-items:center;font-size:.74rem;color:#64748b">
                    <span style="background:#eef3f9;padding:2px 8px;border-radius:999px">🤖 ${modelLabel(e.model)}</span>
                    <span style="background:#e8f2ff;color:#0058da;padding:2px 8px;border-radius:999px;font-weight:600">${e.suggestions.length} gợi ý</span>
                </span>
            </div>
            ${accs}
            <div style="margin:8px 0 3px;font-weight:600;color:#0b2545;font-size:.82rem">💬 Câu gợi ý</div>
            ${sugs || '<div style="font-size:.8rem;color:#94a3b8">(không có)</div>'}
            ${note}
        </div>`;
    }

    function renderList() {
        const host = $('aiHost');
        const R = reg();
        if (!R) {
            host.innerHTML =
                '<div class="sd-loading" style="color:#b45309">⚠️ Chưa tải được Web2AiPageRegistry (tải lại trang).</div>';
            $('aiSummary').innerHTML = '';
            return;
        }
        const entries = allEntries();
        renderSummary(entries);
        const q = state.q.trim().toLowerCase();
        const filtered = q
            ? entries.filter((e) => {
                  const hay = (
                      e.route +
                      ' ' +
                      e.suggestions.map((s) => s.label + ' ' + s.prompt).join(' ') +
                      ' ' +
                      e.accessors.map((a) => a.expr + ' ' + a.desc).join(' ') +
                      ' ' +
                      e.note
                  ).toLowerCase();
                  return hay.includes(q);
              })
            : entries;
        host.innerHTML = filtered.length
            ? filtered.map(entryCard).join('')
            : '<div class="sd-loading">Không có trang nào khớp tìm kiếm.</div>';
    }

    function buildToolbar() {
        const tb = $('aiToolbar');
        if (!tb) return;
        tb.innerHTML = `<input type="search" id="aiSearch" placeholder="🔎 Tìm theo trang / nội dung gợi ý / accessor…"
            style="width:100%;max-width:420px;padding:8px 12px;border:1px solid #d8e2ee;border-radius:10px;font-size:.86rem;outline:none">`;
        const inp = $('aiSearch');
        let t;
        inp.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                state.q = inp.value;
                renderList();
            }, 200);
        });
    }

    function start() {
        if (_started) return;
        _started = true;
        buildToolbar();
        renderList();
    }
    function reload() {
        renderList();
    }

    window.SystemAiSuggestions = { start, reload };
})();
