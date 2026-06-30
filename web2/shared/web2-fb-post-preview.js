// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — xem trước bài Facebook (giống FB) trước khi đăng.
// =====================================================================
// Web 2.0 — Web2FbPostPreview: overlay xem trước 1 bài đăng GIỐNG trên Facebook
//   (header page + caption + lưới ảnh/video). NGUỒN DUY NHẤT — composer + nháp/lịch
//   dùng chung, KHÔNG dựng lại.
//
// API: Web2FbPostPreview.open({ pages:[{name,picture}], caption, media:[{type,url|dataUrl}], scheduledTime })
//   pages: các page sẽ đăng (preview dùng page đầu; nếu nhiều → ghi chú "đăng N page").
//   media item: {type:'photo'|'video', url} hoặc {type:'photo', dataUrl}.
// =====================================================================
(function () {
    'use strict';

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    function srcOf(m) {
        return m.url || m.dataUrl || '';
    }
    // Caption: giữ xuống dòng + làm nổi hashtag (#...) màu xanh như FB.
    function renderCaption(text) {
        const safe = esc(text || '');
        return safe.replace(/(#[\p{L}\p{N}_]+)/gu, '<span style="color:#0064d1">$1</span>');
    }

    function mediaGrid(media) {
        const items = (media || []).filter((m) => srcOf(m));
        if (!items.length) return '';
        const cell = (m, extra) => {
            const s = esc(srcOf(m));
            const inner =
                m.type === 'video'
                    ? `<video src="${s}" controls style="width:100%;height:100%;object-fit:cover;display:block;background:#000"></video>`
                    : `<img src="${s}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block" />`;
            return `<div style="position:relative;overflow:hidden;background:#eef2f7">${inner}${extra || ''}</div>`;
        };
        const n = items.length;
        if (n === 1) {
            const m = items[0];
            const s = esc(srcOf(m));
            return m.type === 'video'
                ? `<div style="background:#000"><video src="${s}" controls style="width:100%;max-height:500px;display:block"></video></div>`
                : `<div style="background:#000"><img src="${s}" alt="" style="width:100%;max-height:500px;object-fit:contain;display:block" /></div>`;
        }
        let grid, cells;
        if (n === 2) {
            grid = 'grid-template-columns:1fr 1fr;grid-auto-rows:220px';
            cells = items.map((m) => cell(m)).join('');
        } else if (n === 3) {
            grid = 'grid-template-columns:1fr 1fr;grid-template-rows:200px 200px';
            cells =
                `<div style="grid-row:1/3">${cell(items[0]).replace(/^<div /, '<div style="height:100%" ')}</div>` +
                cell(items[1]) +
                cell(items[2]);
            // đơn giản hoá: dùng layout 2 cột, ảnh đầu cao gấp đôi
            grid = 'grid-template-columns:1fr 1fr;grid-auto-rows:200px';
            cells = cell(items[0], '') + cell(items[1]) + cell(items[2]);
        } else {
            grid = 'grid-template-columns:1fr 1fr;grid-auto-rows:180px';
            cells = items
                .slice(0, 4)
                .map((m, i) =>
                    i === 3 && n > 4
                        ? cell(
                              m,
                              `<div style="position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.6rem;font-weight:800">+${n - 4}</div>`
                          )
                        : cell(m)
                )
                .join('');
        }
        return `<div style="display:grid;gap:3px;${grid}">${cells}</div>`;
    }

    function open(opts) {
        opts = opts || {};
        const pages = opts.pages && opts.pages.length ? opts.pages : [];
        const main = pages[0] || { name: 'Trang Facebook', picture: '' };
        const when = opts.scheduledTime
            ? '⏰ Lên lịch · ' +
              new Date(opts.scheduledTime).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
              })
            : 'Vừa xong · 🌎';
        const multiNote =
            pages.length > 1
                ? `<div style="font-size:.8rem;color:#0064d1;font-weight:600;padding:0 12px 8px">Sẽ đăng lên ${pages.length} page: ${esc(pages.map((p) => p.name).join(', '))}</div>`
                : pages.length === 0
                  ? `<div style="font-size:.8rem;color:#c87f0a;padding:0 12px 8px">⚠ Chưa chọn page — đây chỉ là xem trước.</div>`
                  : '';

        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10002;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto';
        overlay.innerHTML = `
            <div style="max-width:500px;width:100%;margin:auto">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <strong style="flex:1;color:#fff;font-size:1rem">👁 Xem trước bài đăng</strong>
                    <button data-x style="border:none;background:#fff;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer">Đóng</button>
                </div>
                ${multiNote}
                <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.25);font-family:Helvetica,Arial,sans-serif">
                    <div style="display:flex;align-items:center;gap:10px;padding:12px">
                        ${
                            main.picture
                                ? `<img src="${esc(main.picture)}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover" />`
                                : `<div style="width:42px;height:42px;border-radius:50%;background:#0064d1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">${esc((main.name || 'F')[0])}</div>`
                        }
                        <div style="min-width:0">
                            <div style="font-weight:700;color:#050505;font-size:.95rem">${esc(main.name)}</div>
                            <div style="font-size:.78rem;color:#65676b">${when}</div>
                        </div>
                    </div>
                    ${opts.caption ? `<div style="padding:0 12px 12px;color:#050505;font-size:.95rem;line-height:1.45;white-space:pre-wrap;word-break:break-word">${renderCaption(opts.caption)}</div>` : ''}
                    ${mediaGrid(opts.media)}
                    <div style="display:flex;border-top:1px solid #eef2f7;color:#65676b;font-weight:600;font-size:.88rem">
                        <div style="flex:1;text-align:center;padding:9px">👍 Thích</div>
                        <div style="flex:1;text-align:center;padding:9px">💬 Bình luận</div>
                        <div style="flex:1;text-align:center;padding:9px">↗ Chia sẻ</div>
                    </div>
                </div>
                <div style="text-align:center;color:#cbd5e1;font-size:.76rem;margin-top:10px">Bản xem trước mô phỏng — bố cục thật trên Facebook có thể hơi khác.</div>
            </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('[data-x]').onclick = close;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', function esc2(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', esc2);
            }
        });
    }

    window.Web2FbPostPreview = { open };
})();
