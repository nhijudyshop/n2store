// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoStock — Kho ẢNH/VIDEO miễn phí (Pexels/Pixabay) cho Xưởng Video AI.
 *
 * Mảnh MoneyPrinterTurbo còn thiếu ở video-maker: tìm stock footage chèn vào cảnh.
 * Gọi backend /api/web2-stock-media (key giấu server). Ảnh → VideoMakerPage.addSceneFromUrl;
 * video → fetch blob → Web2VideoImport.load (lồng tiếng). Key chưa cấu hình → báo gọn.
 *
 *   Web2VideoStock.open()   → mở modal tìm kiếm
 */
(function (global) {
    'use strict';
    if (global.Web2VideoStock) return;

    function workerBase() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const API = () => workerBase() + '/api/web2-stock-media';

    function toast(msg, type) {
        if (global.notificationManager && global.notificationManager.show)
            global.notificationManager.show(msg, type || 'info');
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    }

    let _injected = false;
    function injectCss() {
        if (_injected) return;
        _injected = true;
        const css = `
.vstk-ov{position:fixed;inset:0;z-index:99999;background:rgba(15,18,28,.62);display:flex;align-items:center;justify-content:center;padding:16px}
.vstk-modal{background:var(--w2-surface,#fff);color:var(--w2-text,#1a1d29);width:min(820px,96vw);max-height:90vh;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.32)}
.vstk-head{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,.08)}
.vstk-head b{font-size:15px;flex:1}
.vstk-x{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#888;padding:2px 6px;border-radius:8px}
.vstk-x:hover{background:rgba(0,0,0,.06)}
.vstk-bar{display:flex;gap:8px;padding:12px 16px;align-items:center;flex-wrap:wrap}
.vstk-bar input[type=text]{flex:1;min-width:140px;padding:9px 12px;border:1.5px solid rgba(0,0,0,.14);border-radius:10px;font-size:14px}
.vstk-bar input[type=text]:focus{outline:0;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.vstk-seg{display:inline-flex;border:1.5px solid rgba(0,0,0,.12);border-radius:10px;overflow:hidden}
.vstk-seg button{border:0;background:transparent;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:600;color:#555}
.vstk-seg button.on{background:#6366f1;color:#fff}
.vstk-go{border:0;background:#6366f1;color:#fff;padding:9px 16px;border-radius:10px;font-weight:700;cursor:pointer}
.vstk-go:disabled{opacity:.5;cursor:default}
.vstk-body{flex:1;overflow:auto;padding:12px 16px;min-height:120px}
.vstk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.vstk-cell{position:relative;border-radius:10px;overflow:hidden;cursor:pointer;aspect-ratio:9/16;background:#eef0f5;border:2px solid transparent;transition:transform .12s,border-color .12s}
.vstk-cell:hover{transform:translateY(-2px);border-color:#6366f1}
.vstk-cell img{width:100%;height:100%;object-fit:cover;display:block}
.vstk-cell .vstk-badge{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.62);color:#fff;font-size:10px;padding:2px 6px;border-radius:6px}
.vstk-cell .vstk-add{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.0);color:#fff;font-weight:800;font-size:13px;opacity:0;transition:opacity .12s}
.vstk-cell:hover .vstk-add{opacity:1;background:rgba(99,102,241,.42)}
.vstk-msg{padding:24px 8px;text-align:center;color:#777;font-size:14px;line-height:1.6}
.vstk-msg code{background:rgba(0,0,0,.06);padding:2px 6px;border-radius:6px}
.vstk-foot{padding:10px 16px;border-top:1px solid rgba(0,0,0,.08);display:flex;gap:8px;align-items:center;justify-content:space-between;font-size:12px;color:#888}
.vstk-foot button{border:1.5px solid rgba(0,0,0,.14);background:transparent;border-radius:9px;padding:6px 12px;font-weight:600;cursor:pointer;color:#444}
.vstk-foot button:disabled{opacity:.45;cursor:default}`;
        const el = document.createElement('style');
        el.textContent = css;
        document.head.appendChild(el);
    }

    const st = { q: '', type: 'photo', page: 1, ratio: '9:16', busy: false, ov: null };

    function close() {
        if (st.ov) {
            try {
                st.ov.remove();
            } catch {}
            st.ov = null;
        }
        st.onPick = null; // reset callback dùng chung (ai-hub) khi đóng
    }

    async function doSearch(resetPage) {
        if (st.busy) return;
        if (resetPage) st.page = 1;
        const body = st.ov.querySelector('.vstk-body');
        const goBtn = st.ov.querySelector('.vstk-go');
        st.q = st.ov.querySelector('.vstk-q').value.trim();
        if (!st.q) {
            body.innerHTML =
                '<div class="vstk-msg">Nhập từ khoá để tìm (vd: <b>thời trang</b>, <b>áo dài</b>, <b>shopping</b>)…</div>';
            return;
        }
        st.busy = true;
        if (goBtn) goBtn.disabled = true;
        body.innerHTML = '<div class="vstk-msg">Đang tìm…</div>';
        try {
            const u = `${API()}/search?q=${encodeURIComponent(st.q)}&type=${st.type}&page=${st.page}&ratio=${encodeURIComponent(st.ratio)}&per=24`;
            const r = await fetch(u);
            const d = await r.json().catch(() => ({}));
            if (d && d.configured === false) {
                body.innerHTML =
                    '<div class="vstk-msg">Kho ảnh/video miễn phí <b>chưa được cấu hình</b>.<br>Liên hệ admin để bật tính năng này.</div>';
                return;
            }
            const items = (d && d.items) || [];
            if (!items.length) {
                body.innerHTML =
                    '<div class="vstk-msg">Không có kết quả cho "' +
                    esc(st.q) +
                    '". Thử từ khoá khác (tiếng Anh thường nhiều kết quả hơn).</div>';
                _updateFoot();
                return;
            }
            renderGrid(items);
            _updateFoot();
        } catch (e) {
            body.innerHTML =
                '<div class="vstk-msg">Lỗi tải kho media: ' + esc(e.message) + '</div>';
        } finally {
            st.busy = false;
            if (goBtn) goBtn.disabled = false;
        }
    }

    function renderGrid(items) {
        const body = st.ov.querySelector('.vstk-body');
        const grid = document.createElement('div');
        grid.className = 'vstk-grid';
        grid.innerHTML = items
            .map((it, i) => {
                const badge =
                    it.type === 'video'
                        ? `<span class="vstk-badge">▶ ${Math.round(it.duration || 0)}s</span>`
                        : '';
                return `<div class="vstk-cell" data-i="${i}" title="${esc(it.author || '')}">
                    <img src="${esc(it.thumb || it.url)}" loading="lazy" alt="">
                    ${badge}<div class="vstk-add">+ Thêm</div></div>`;
            })
            .join('');
        grid.addEventListener('click', (e) => {
            const cell = e.target.closest('.vstk-cell');
            if (!cell) return;
            const it = items[Number(cell.dataset.i)];
            if (it) pick(it, cell);
        });
        body.innerHTML = '';
        body.appendChild(grid);
    }

    async function pick(it, cell) {
        // 2026-06-24: callback dùng chung — trang khác (ai-hub Tạo ảnh / Ghép đồ)
        // mở picker với opts.onPick(item,cell) → tự xử lý ảnh chọn, bỏ qua logic
        // riêng của video-maker bên dưới.
        if (st.onPick) {
            try {
                st.onPick(it, cell);
            } catch (e) {
                /* ignore */
            }
            return;
        }
        if (it.type === 'video') {
            toast('Đang tải video stock…', 'info');
            try {
                const blob = await (await fetch(it.url)).blob();
                const file = new File([blob], (it.id || 'stock') + '.mp4', {
                    type: blob.type || 'video/mp4',
                });
                if (global.Web2VideoImport && global.Web2VideoImport.load) {
                    await global.Web2VideoImport.load(file);
                    close();
                    // Liên kết bước: nạp video xong → qua "Giọng & Âm thanh" để
                    // lồng tiếng + xuất (trả lời "chọn video xong rồi làm gì").
                    if (global.VideoMakerPage?.gotoVoiceStep) global.VideoMakerPage.gotoVoiceStep();
                    if (global.VideoMakerPage?.refresh) global.VideoMakerPage.refresh();
                    toast('Đã nạp video → giờ tạo giọng đọc rồi bấm "Xuất video".', 'success');
                } else {
                    toast('Không nạp được video (module import thiếu)', 'error');
                }
            } catch (e) {
                toast('Tải video thất bại (CORS/kích thước). Thử ảnh hoặc video khác.', 'error');
            }
            return;
        }
        // ảnh → thêm cảnh
        const ok =
            global.VideoMakerPage &&
            global.VideoMakerPage.addSceneFromUrl &&
            (await global.VideoMakerPage.addSceneFromUrl(it.url, { title: '' }));
        if (ok) {
            if (cell) {
                cell.style.borderColor = '#22c55e';
                const a = cell.querySelector('.vstk-add');
                if (a) {
                    a.textContent = '✓ Đã thêm';
                    a.style.opacity = '1';
                    a.style.background = 'rgba(34,197,94,.5)';
                }
            }
            toast('Đã thêm cảnh từ ảnh stock', 'success');
        }
    }

    function _updateFoot() {
        const foot = st.ov.querySelector('.vstk-foot');
        if (!foot) return;
        foot.querySelector('.vstk-pg').textContent = 'Trang ' + st.page;
        foot.querySelector('.vstk-prev').disabled = st.page <= 1;
    }

    // API lập trình (KHÔNG modal) — cho luồng tự động lấy stock (topic→video).
    // Trả items[] (rỗng nếu chưa cấu hình key / lỗi / không kết quả).
    async function search(query, opts) {
        opts = opts || {};
        const q = String(query == null ? '' : query).trim();
        if (!q) return [];
        const type = opts.type === 'video' ? 'video' : 'photo';
        const ratio = opts.ratio || '9:16';
        const per = Math.min(40, Math.max(1, Number(opts.per) || 12));
        const page = Math.max(1, Number(opts.page) || 1);
        try {
            const u = `${API()}/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}&ratio=${encodeURIComponent(ratio)}&per=${per}`;
            const r = await fetch(u);
            const d = await r.json().catch(() => ({}));
            if (!d || d.configured === false) return [];
            return Array.isArray(d.items) ? d.items.filter((x) => x && x.url) : [];
        } catch (e) {
            return [];
        }
    }

    function open(opts) {
        opts = opts || {};
        injectCss();
        close();
        st.onPick = typeof opts.onPick === 'function' ? opts.onPick : null;
        // ratio từ trang nếu có (state.ratio) — mặc định dọc 9:16.
        try {
            const r =
                global.VideoMakerPage &&
                global.VideoMakerPage._state &&
                global.VideoMakerPage._state.ratio;
            if (r) st.ratio = r;
        } catch {}
        if (opts.ratio) st.ratio = opts.ratio;
        const ov = document.createElement('div');
        ov.className = 'vstk-ov';
        ov.innerHTML = `
        <div class="vstk-modal" role="dialog" aria-label="Kho ảnh/video miễn phí">
            <div class="vstk-head">
                <b>🎞️ Kho ảnh / video miễn phí</b>
                <button class="vstk-x" aria-label="Đóng">×</button>
            </div>
            <div class="vstk-bar">
                <span class="vstk-seg">
                    <button class="vstk-t on" data-t="photo">Ảnh</button>
                    <button class="vstk-t" data-t="video">Video</button>
                </span>
                <input class="vstk-q" type="text" placeholder="Từ khoá (vd: fashion, áo dài, shopping)…" />
                <button class="vstk-go">Tìm</button>
            </div>
            <div class="vstk-body"><div class="vstk-msg">Nhập từ khoá để tìm ảnh/video bản quyền-free chèn vào video.</div></div>
            <div class="vstk-foot">
                <span class="vstk-credit">Ảnh &amp; video bản quyền-free</span>
                <span>
                    <button class="vstk-prev" disabled>‹ Trước</button>
                    <span class="vstk-pg">Trang 1</span>
                    <button class="vstk-next">Sau ›</button>
                </span>
            </div>
        </div>`;
        ov.addEventListener('click', (e) => {
            if (e.target === ov) close();
        });
        ov.querySelector('.vstk-x').addEventListener('click', close);
        ov.querySelector('.vstk-go').addEventListener('click', () => doSearch(true));
        ov.querySelector('.vstk-q').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch(true);
        });
        ov.querySelectorAll('.vstk-t').forEach((b) =>
            b.addEventListener('click', () => {
                ov.querySelectorAll('.vstk-t').forEach((x) => x.classList.remove('on'));
                b.classList.add('on');
                st.type = b.dataset.t;
                doSearch(true);
            })
        );
        ov.querySelector('.vstk-prev').addEventListener('click', () => {
            if (st.page > 1) {
                st.page--;
                doSearch(false);
            }
        });
        ov.querySelector('.vstk-next').addEventListener('click', () => {
            st.page++;
            doSearch(false);
        });
        document.body.appendChild(ov);
        st.ov = ov;
        setTimeout(() => ov.querySelector('.vstk-q').focus(), 30);
    }

    global.Web2VideoStock = { open, close, search };
})(window);
