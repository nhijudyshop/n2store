// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — GitHub-style skeleton loading.
//
// Web2Skeleton — placeholder "khung xương" content-shaped hiển thị TRONG LÚC fetch,
// thay cho text "Đang tải..." / spinner trơ. Cảm giác trang load nhanh + mượt như
// GitHub (Primer SkeletonBox): khối xám bo góc + vệt sáng quét ngang (shimmer),
// dựng đúng HÌNH DẠNG nội dung sắp tới (bảng / lưới SP / list / thẻ KPI / chi tiết).
//
// SELF-CONTAINED: tự inject CSS 1 lần (id="web2-skeleton-css") → chạy được trên MỌI
// trang Web 2.0, KHÔNG phụ thuộc trang có link web2-theme.css / web2-effects.css hay không.
// Compositor-only (transform + opacity) + honor prefers-reduced-motion (tắt shimmer).
//
// Usage (drop-in thay loading text):
//   Web2Skeleton.grid('#productGrid', { count: 12 });   // lưới SP: thumb + tên + giá
//   Web2Skeleton.table('#ordersBody', { rows: 8, cols: 6 });
//   Web2Skeleton.list('#convList', { count: 6, avatar: true });
//   Web2Skeleton.stats('#kpiRow', { count: 4 });
//   Web2Skeleton.detail('#modalBody');
//   // ...sau khi có data:
//   container.innerHTML = realHtml;          // hoặc Web2Skeleton.clear(container)
//
// API:
//   show(target, opts)   opts.type = 'table'|'cards'|'grid'|'list'|'detail'|'stats'|'lines'
//   table | cards | grid | list | detail | stats | lines  (sugar wrappers)
//   html(opts) -> string   (markup để ghép inline, vd trong template lớn)
//   clear(target)          (gỡ skeleton .w2sk-root; caller thường set innerHTML mới)

(function (global) {
    'use strict';

    if (global.Web2Skeleton) return;

    const CSS_ID = 'web2-skeleton-css';
    const CSS = `
.w2sk{position:relative;overflow:hidden;background:#e8ecf2;border-radius:6px;flex:none}
.w2sk::after{content:'';position:absolute;inset:0;transform:translateX(-100%);
  background:linear-gradient(90deg,transparent 0,rgba(255,255,255,.62) 50%,transparent 100%);
  animation:w2skShimmer 1.4s ease-in-out infinite}
@keyframes w2skShimmer{100%{transform:translateX(100%)}}
.w2sk-root{animation:w2skFade .22s ease-out both}
@keyframes w2skFade{from{opacity:0}to{opacity:1}}
.w2sk-circle{border-radius:50%}
.w2sk-pill{border-radius:999px}
.w2sk-trow{display:grid;gap:14px;align-items:center;padding:11px 14px;border-bottom:1px solid #eef1f5}
.w2sk-thead{background:#f5f7fb;border-bottom:1px solid #e3e8ee}
.w2sk-card{border:1px solid #eef1f5;border-radius:12px;padding:12px;background:#fff;
  display:flex;flex-direction:column;gap:10px}
.w2sk-grid{display:grid;gap:14px}
.w2sk-lrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #eef1f5}
.w2sk-lcol{display:flex;flex-direction:column;gap:7px;flex:1;min-width:0}
.w2sk-statcard{border:1px solid #eef1f5;border-radius:12px;padding:16px;background:#fff;
  display:flex;flex-direction:column;gap:12px}
.w2sk-detail{display:flex;flex-direction:column;gap:14px;padding:4px}
@media (prefers-reduced-motion: reduce){
  .w2sk::after{animation:none}
  .w2sk-root{animation:none}
}`;

    function injectCss() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(CSS_ID)) return;
        const style = document.createElement('style');
        style.id = CSS_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function resolve(target) {
        if (!target) return null;
        return typeof target === 'string' ? document.querySelector(target) : target;
    }

    // ---- piece builders (return HTML strings) ----
    // Varied line widths → look "thật" hơn, không đều tăm tắp.
    const W = [82, 64, 92, 48, 74, 58];
    const bar = (h, w, extra) =>
        `<div class="w2sk ${extra || ''}" style="height:${h}px;${w ? `width:${w};` : 'width:100%;'}"></div>`;
    const thumb = () =>
        `<div class="w2sk" style="width:100%;aspect-ratio:1/1;border-radius:8px"></div>`;

    function linesHtml(n, opts) {
        const o = opts || {};
        const h = o.height || 12;
        let out = '';
        for (let i = 0; i < n; i++) {
            const w = i === n - 1 && n > 1 ? '55%' : `${W[i % W.length]}%`;
            out += bar(h, w);
        }
        return out;
    }

    function tableHtml(opts) {
        const o = opts || {};
        const rows = o.rows || 8;
        const cols = o.cols || 5;
        const tmpl = `grid-template-columns:repeat(${cols},1fr)`;
        let head = `<div class="w2sk-trow w2sk-thead" style="${tmpl}">`;
        for (let c = 0; c < cols; c++) head += bar(10, '62%');
        head += '</div>';
        let body = '';
        for (let r = 0; r < rows; r++) {
            body += `<div class="w2sk-trow" style="${tmpl}">`;
            for (let c = 0; c < cols; c++)
                body += bar(12, `${c === 0 ? 84 : W[(r + c) % W.length]}%`);
            body += '</div>';
        }
        return head + body;
    }

    // Table-ROWS variant — trả <tr><td> để nhét THẲNG vào <tbody> (giữ đúng
    // cấu trúc cột). Dùng cho mọi loading-state của bảng (#xxxTbody).
    function rowsHtml(opts) {
        const o = opts || {};
        const rows = o.rows || 8;
        const cols = o.cols || 5;
        let out = '';
        for (let r = 0; r < rows; r++) {
            out += '<tr class="w2sk-row">';
            for (let c = 0; c < cols; c++) {
                const w = c === 0 ? 84 : W[(r + c) % W.length];
                out += `<td><div class="w2sk" style="height:12px;width:${w}%"></div></td>`;
            }
            out += '</tr>';
        }
        return out;
    }

    function cardsHtml(opts) {
        const o = opts || {};
        const count = o.count || 8;
        const min = o.min || 200;
        const showThumb = o.thumb !== false;
        let cells = '';
        for (let i = 0; i < count; i++) {
            cells +=
                `<div class="w2sk-card">` +
                (showThumb ? thumb() : '') +
                bar(13, '78%') +
                bar(11, '52%') +
                `</div>`;
        }
        return `<div class="w2sk-grid" style="grid-template-columns:repeat(auto-fill,minmax(${min}px,1fr))">${cells}</div>`;
    }

    function gridHtml(opts) {
        // Lưới SP: thumb vuông + tên + giá (min nhỏ hơn cards)
        return cardsHtml(Object.assign({ count: 12, min: 150, thumb: true }, opts || {}));
    }

    function listHtml(opts) {
        const o = opts || {};
        const count = o.count || 6;
        const avatar = o.avatar !== false;
        let out = '';
        for (let i = 0; i < count; i++) {
            out +=
                `<div class="w2sk-lrow">` +
                (avatar
                    ? `<div class="w2sk w2sk-circle" style="width:40px;height:40px"></div>`
                    : '') +
                `<div class="w2sk-lcol">${bar(13, `${W[i % W.length]}%`)}${bar(11, '40%')}</div>` +
                bar(11, '14%', 'w2sk-pill') +
                `</div>`;
        }
        return out;
    }

    function statsHtml(opts) {
        const o = opts || {};
        const count = o.count || 4;
        const min = o.min || 170;
        let cells = '';
        for (let i = 0; i < count; i++) {
            cells +=
                `<div class="w2sk-statcard">` +
                bar(11, '48%') +
                bar(26, '64%') +
                bar(9, '36%') +
                `</div>`;
        }
        return `<div class="w2sk-grid" style="grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr))">${cells}</div>`;
    }

    function detailHtml(opts) {
        const o = opts || {};
        let out = `<div class="w2sk-detail">`;
        out += `<div style="display:flex;gap:14px;align-items:center">`;
        if (o.avatar !== false)
            out += `<div class="w2sk w2sk-circle" style="width:56px;height:56px"></div>`;
        out += `<div class="w2sk-lcol">${bar(16, '52%')}${bar(11, '34%')}</div></div>`;
        out += linesHtml(o.lines || 4);
        out +=
            `<div class="w2sk-grid" style="grid-template-columns:repeat(2,1fr);margin-top:4px">` +
            bar(40, '100%') +
            bar(40, '100%') +
            bar(40, '100%') +
            bar(40, '100%') +
            `</div>`;
        out += `</div>`;
        return out;
    }

    const BUILDERS = {
        table: tableHtml,
        cards: cardsHtml,
        grid: gridHtml,
        list: listHtml,
        stats: statsHtml,
        detail: detailHtml,
        lines: (o) => linesHtml((o && o.count) || 3, o),
    };

    function html(opts) {
        const o = opts || {};
        const build = BUILDERS[o.type] || gridHtml;
        return `<div class="w2sk-root">${build(o)}</div>`;
    }

    function show(target, opts) {
        injectCss();
        const el = resolve(target);
        if (!el) return null;
        el.innerHTML = html(opts || {});
        return el;
    }

    function clear(target) {
        const el = resolve(target);
        if (!el) return;
        el.querySelectorAll('.w2sk-root').forEach((n) => n.remove());
    }

    // Sugar wrappers — type-specific.
    function make(type) {
        return (target, opts) => show(target, Object.assign({ type }, opts || {}));
    }

    // Table-rows nhét vào <tbody> — KHÔNG bọc .w2sk-root (con tbody phải là <tr>).
    function rows(target, opts) {
        injectCss();
        const el = resolve(target);
        if (!el) return null;
        el.innerHTML = rowsHtml(opts || {});
        return el;
    }

    global.Web2Skeleton = {
        show,
        clear,
        rows,
        rowsHtml,
        html,
        injectCss,
        table: make('table'),
        cards: make('cards'),
        grid: make('grid'),
        list: make('list'),
        stats: make('stats'),
        detail: make('detail'),
        lines: make('lines'),
    };

    // Inject sớm nếu DOM đã sẵn — tránh FOUC khi caller gọi rất sớm.
    if (typeof document !== 'undefined') {
        if (document.head) injectCss();
        else document.addEventListener('DOMContentLoaded', injectCss, { once: true });
    }
})(typeof window !== 'undefined' ? window : globalThis);
