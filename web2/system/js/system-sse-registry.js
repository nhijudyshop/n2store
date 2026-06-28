// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — System/Cấu hình → tab "Realtime (SSE)" → SỔ TAY SSE (registry tĩnh: topic→publisher→subscriber→gap→luật đừng-sửa-hỏng). Nguồn data/web2-sse-registry.json.
(function () {
    'use strict';

    const DATA_URL = 'data/web2-sse-registry.json';
    let _rendered = false;

    const esc = (s) =>
        String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );

    function statusClass(st) {
        const s = String(st || '').toUpperCase();
        if (s.startsWith('OK')) return 'ok';
        if (s.includes('PARTIAL') || s.includes('TRỄ')) return 'warn';
        return '';
    }

    function topicCard(t) {
        const hasGap = (t.gaps || []).length > 0;
        const pubs = (t.publishers || [])
            .map(
                (p) =>
                    `<li><code>${esc(p.route)}</code> <span class="ssr-where">${esc(p.where)}</span><br><span class="ssr-muted">${esc(p.action)}</span></li>`
            )
            .join('');
        const subs = (t.subscribers || [])
            .map(
                (s) =>
                    `<li><span class="ssr-badge ${statusClass(s.status)}">${esc(s.status)}</span> <strong>${esc(s.page)}</strong> <code>${esc(s.file)}</code>${s.note ? `<br><span class="ssr-muted">${esc(s.note)}</span>` : ''}</li>`
            )
            .join('');
        const gaps = (t.gaps || []).map((g) => `<li>⚠️ ${esc(g)}</li>`).join('');
        const rules = (t.dontBreak || []).map((d) => `<li>🛑 ${esc(d)}</li>`).join('');
        return `
            <details class="ssr-topic${hasGap ? ' has-gap' : ''}">
                <summary>
                    <code class="ssr-topic-name">${esc(t.topic)}</code>
                    <span class="ssr-topic-purpose">${esc(t.purpose)}</span>
                    ${hasGap ? '<span class="ssr-gap-pill">' + t.gaps.length + ' gap</span>' : ''}
                </summary>
                <div class="ssr-topic-body">
                    <div class="ssr-col"><h5>📤 Publisher (backend emit sau commit)</h5><ul>${pubs || '<li class="ssr-muted">—</li>'}</ul></div>
                    <div class="ssr-col"><h5>📥 Subscriber (trang live-update)</h5><ul>${subs || '<li class="ssr-muted">—</li>'}</ul></div>
                    ${gaps ? `<div class="ssr-col ssr-col-gap"><h5>Gap / chưa live</h5><ul>${gaps}</ul></div>` : ''}
                    ${rules ? `<div class="ssr-col ssr-col-rule"><h5>Đừng sửa hỏng</h5><ul>${rules}</ul></div>` : ''}
                </div>
            </details>`;
    }

    async function render() {
        const host = document.getElementById('ssRegistry');
        if (!host || _rendered) return;
        host.innerHTML = '<div class="ssr-loading">Đang tải sổ tay SSE…</div>';
        let data;
        try {
            const r = await fetch(DATA_URL, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            data = await r.json();
        } catch (e) {
            host.innerHTML = `<div class="ssr-loading">⚠ Không tải được sổ tay SSE: ${esc(e.message)}</div>`;
            return;
        }
        _rendered = true;
        const globalRules = (data.globalRules || []).map((g) => `<li>${esc(g)}</li>`).join('');
        const topics = (data.topics || []).map(topicCard).join('');
        host.innerHTML = `
            <div class="ssr-wrap">
                <div class="ssr-head">
                    <h3>📖 Sổ tay SSE — đừng sửa hỏng</h3>
                    <span class="ssr-updated">cập nhật ${esc(data.updatedAt || '')}</span>
                </div>
                <p class="ssr-note">${esc(data._note || '')}</p>
                <details class="ssr-rules" open>
                    <summary>⚙️ Luật chung (đọc trước khi đụng SSE)</summary>
                    <ul>${globalRules}</ul>
                </details>
                <div class="ssr-topics">${topics}</div>
            </div>`;
    }

    window.SystemSSERegistry = { render };
})();
