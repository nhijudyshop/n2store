// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài FB: soạn bài (page chips + AI caption + media + lịch + đăng).
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    const Media = () => window.FBPostsMedia;
    const S = () => window.FBPosts.state;

    const STYLE_LABELS = {
        sale: '🔥 Sale',
        new: '🆕 Hàng mới',
        livestream: '📣 Live',
        restock: '🔁 Về hàng',
        simple: '📝 Đơn giản',
    };
    let _style = 'sale';
    let _selectedProducts = []; // SP chọn từ Kho (cho AI + ảnh) — [{name,price,discount,code,image}]

    function toProd(p) {
        return {
            name: p.name || p.code || '',
            price: p.price || '',
            discount: p.discount || '',
            desc: p.desc || '',
            category: p.category || p.name || '',
        };
    }
    function imgOf(p) {
        return (
            p.imageUrl || p.image_url || (Array.isArray(p.images) && p.images[0]) || p.image || ''
        );
    }

    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    async function confirmDo(msg) {
        if (window.Popup && window.Popup.confirm) return window.Popup.confirm(msg);
        return window.confirm(msg);
    }

    // ── Nhận handoff "Đăng lên FB" từ trang khác (Web2FbShare) ───────────────
    // Ảnh dạng dataURL được giữ NGUYÊN (không upload imgbb) → publish route đăng bytes
    // thẳng lên FB. Ảnh có URL công khai (Kho SP) thì dùng url.
    let _shareConsumed = false;
    function maybeConsumeShare() {
        if (_shareConsumed) return;
        if (!window.Web2FbShare || !window.Web2FbShare.has || !window.Web2FbShare.has()) return;
        _shareConsumed = true;
        const payload = window.Web2FbShare.consume();
        if (!payload) return;
        if (payload.caption) {
            const m = document.getElementById('fbpMessage');
            if (m) {
                m.value = payload.caption;
                m.dispatchEvent(new Event('input'));
            }
        }
        const imgs = payload.images || [];
        if (!imgs.length) return;
        let added = 0;
        for (const it of imgs) {
            if (it.url && /^https?:\/\//.test(it.url)) {
                Media().add({ type: it.type === 'video' ? 'video' : 'photo', url: it.url });
                added++;
            } else if (it.dataUrl) {
                Media().add({ type: 'photo', dataUrl: it.dataUrl });
                added++;
            }
        }
        if (added)
            notify(
                `Đã nhận ${added} ảnh từ ${payload.source || 'trang khác'} — chọn page rồi bấm Đăng`,
                'success'
            );
    }

    function pageChipsHtml() {
        const pages = S().pages || [];
        if (!pages.length)
            return '<div style="color:#94a3b8;font-size:.85rem">Chưa kết nối Facebook — bấm "Kết nối" ở trên.</div>';
        return pages
            .map(
                (p) => `
            <label class="fbp-page-chip ${S().selectedPages.has(p.id) ? 'on' : ''}" data-pid="${esc(p.id)}">
                ${p.picture ? `<img src="${esc(p.picture)}" alt="" />` : '<i data-lucide="facebook"></i>'}
                <span>${esc(p.name)}</span>
                <i class="fbp-check" data-lucide="check"></i>
            </label>`
            )
            .join('');
    }

    function defaultSchedule() {
        const d = new Date(Date.now() + 60 * 60 * 1000);
        // datetime-local theo giờ máy (shop ở GMT+7)
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    }

    function render() {
        const el = document.getElementById('panel-composer');
        if (!el) return;
        el.innerHTML = `
            <div class="fbp-card">
                <h3><i data-lucide="check-square"></i> Đăng lên page</h3>
                <div class="fbp-pages" id="fbpPages">${pageChipsHtml()}</div>
            </div>

            <div class="fbp-card">
                <h3><i data-lucide="sparkles"></i> Nội dung</h3>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
                    <button class="fbp-btn sm" id="fbpPickKho" type="button"><i data-lucide="package"></i> Chọn SP từ Kho (cho AI)</button>
                    <span style="font-size:.78rem;color:#94a3b8">Chọn nhiều SP → AI viết caption tổng hợp + tự thêm ảnh SP</span>
                </div>
                <div id="fbpKhoChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
                <div class="fbp-fields">
                    <div class="fbp-field"><label>Tên sản phẩm (cho AI)</label>
                        <input class="fbp-input" id="fbpPName" placeholder="VD: Áo thun form rộng" /></div>
                    <div class="fbp-field"><label>Giá</label>
                        <input class="fbp-input" id="fbpPPrice" placeholder="VD: 150000" /></div>
                    <div class="fbp-field"><label>Khuyến mãi</label>
                        <input class="fbp-input" id="fbpPDiscount" placeholder="VD: 20%" /></div>
                </div>
                <p style="font-size:.76rem;color:#94a3b8;margin:-4px 0 10px">⚠ Chỉ ghi khuyến mãi/giá CÓ THẬT — giá ảo/giảm giá sai có thể bị Facebook phạt (đánh strike).</p>
                <div class="fbp-styles" id="fbpStyles">
                    ${Object.entries(STYLE_LABELS)
                        .map(
                            ([k, v]) =>
                                `<button type="button" class="fbp-style ${k === _style ? 'on' : ''}" data-style="${k}">${v}</button>`
                        )
                        .join('')}
                </div>
                <div class="fbp-gen-row">
                    <button class="fbp-btn sm" id="fbpGen" type="button">
                        <i data-lucide="wand-2"></i> ${S().aiAvailable ? 'Tạo nội dung (AI miễn phí)' : 'Tạo nội dung (miễn phí)'}
                    </button>
                    <span style="font-size:.76rem;color:#94a3b8">Bấm lại để ra bản khác · sửa tùy ý sau đó</span>
                    <span class="fbp-charcount" id="fbpCharCount" style="margin-left:auto">0 ký tự</span>
                </div>
                <textarea class="fbp-textarea" id="fbpMessage" placeholder="Nội dung bài viết… (bấm 'Tạo nội dung' để AI gợi ý, rồi chỉnh tùy ý)"></textarea>
            </div>

            <div class="fbp-card">
                <h3><i data-lucide="image"></i> Ảnh / Video</h3>
                <div class="fbp-media-bar">
                    <button class="fbp-btn sm" id="fbpMedProduct" type="button" title="An toàn nhất — ảnh của shop"><i data-lucide="package"></i> Từ Kho SP ✓</button>
                    <button class="fbp-btn ghost sm" id="fbpMedUpload" type="button"><i data-lucide="upload"></i> Tải ảnh lên</button>
                    <button class="fbp-btn ghost sm" id="fbpMedUrl" type="button"><i data-lucide="link-2"></i> Dán URL</button>
                    <input type="file" id="fbpMedFile" accept="image/*" multiple hidden />
                </div>
                <p class="fbp-media-note" style="font-size:.78rem;color:#94a3b8;margin:6px 0 0;line-height:1.5">
                    💡 Nên dùng <strong>"Từ Kho SP"</strong> (ảnh của shop) cho an toàn. Dùng ảnh/video
                    của shop/brand khác có thể bị Facebook gỡ + tính strike (lặp lại → khoá Page). Video
                    có nhạc bản quyền có thể bị tắt tiếng/chặn ở một số khu vực.
                </p>
                <div class="fbp-media-grid" id="fbpMediaGrid"></div>
            </div>

            <div class="fbp-card">
                <h3><i data-lucide="clock"></i> Thời gian đăng</h3>
                <div class="fbp-sched">
                    <label class="fbp-radio"><input type="radio" name="fbpWhen" value="now" checked /> Đăng ngay</label>
                    <label class="fbp-radio"><input type="radio" name="fbpWhen" value="sched" /> Lên lịch</label>
                    <input type="datetime-local" class="fbp-input" id="fbpSchedAt" style="max-width:230px;display:none" value="${defaultSchedule()}" />
                    <span style="font-size:.78rem;color:#94a3b8">Giờ Việt Nam (GMT+7) · cách hiện tại ≥ 10 phút</span>
                </div>
                <div class="fbp-actions">
                    <button class="fbp-btn ghost" id="fbpPreview" type="button"><i data-lucide="eye"></i> Xem trước</button>
                    <button class="fbp-btn ghost" id="fbpSaveDraft" type="button"><i data-lucide="save"></i> Lưu nháp</button>
                    <button class="fbp-btn" id="fbpPublish" type="button"><i data-lucide="send"></i> Đăng / Lên lịch</button>
                    <span id="fbpEditHint" style="font-size:.8rem;color:#c87f0a;align-self:center"></span>
                </div>
            </div>
        `;
        wire();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        maybeConsumeShare();
    }

    function wire() {
        // page chips
        document.querySelectorAll('#fbpPages .fbp-page-chip').forEach((c) => {
            c.addEventListener('click', (e) => {
                e.preventDefault();
                const pid = c.dataset.pid;
                if (S().selectedPages.has(pid)) S().selectedPages.delete(pid);
                else S().selectedPages.add(pid);
                c.classList.toggle('on');
            });
        });
        // styles
        document.querySelectorAll('#fbpStyles .fbp-style').forEach((b) => {
            b.addEventListener('click', () => {
                _style = b.dataset.style;
                document
                    .querySelectorAll('#fbpStyles .fbp-style')
                    .forEach((x) => x.classList.toggle('on', x === b));
            });
        });
        // char count
        const msg = document.getElementById('fbpMessage');
        const cc = document.getElementById('fbpCharCount');
        msg.addEventListener('input', () => (cc.textContent = `${msg.value.length} ký tự`));
        // chọn SP từ Kho (cho AI) + render chips đã chọn
        document.getElementById('fbpPickKho')?.addEventListener('click', openKhoPicker);
        renderProductChips();
        // generate
        // 1 nút: ưu tiên AI (free Groq), tự fallback mẫu nếu AI lỗi/chưa có key.
        document
            .getElementById('fbpGen')
            .addEventListener('click', () => generate(!!S().aiAvailable));
        // media
        Media().mountGrid(
            document.getElementById('fbpMediaGrid'),
            document.getElementById('fbpMedFile'),
            {
                url: document.getElementById('fbpMedUrl'),
                product: document.getElementById('fbpMedProduct'),
                upload: document.getElementById('fbpMedUpload'),
            }
        );
        // DÁN (Ctrl+V) / kéo-thả ảnh vào thanh media — module ảnh chung.
        window.Web2ImagePaste?.enhance?.('#fbpMedFile', {
            dropZone: '.fbp-media-bar',
            hintText: 'hoặc dán (Ctrl+V) / kéo-thả ảnh vào đây',
        });
        // schedule toggle
        document.querySelectorAll('input[name="fbpWhen"]').forEach((r) => {
            r.addEventListener('change', () => {
                document.getElementById('fbpSchedAt').style.display =
                    document.querySelector('input[name="fbpWhen"]:checked').value === 'sched'
                        ? ''
                        : 'none';
            });
        });
        document.getElementById('fbpPreview').addEventListener('click', openPreview);
        document.getElementById('fbpSaveDraft').addEventListener('click', saveDraft);
        document.getElementById('fbpPublish').addEventListener('click', publish);
        // edit hint
        const hint = document.getElementById('fbpEditHint');
        hint.textContent = S().editingDraftId ? `Đang sửa nháp #${S().editingDraftId}` : '';
    }

    function product() {
        return {
            name: document.getElementById('fbpPName')?.value.trim() || '',
            price: document.getElementById('fbpPPrice')?.value.trim() || '',
            discount: document.getElementById('fbpPDiscount')?.value.trim() || '',
            category: document.getElementById('fbpPName')?.value.trim() || '',
        };
    }

    // Mở picker Kho SP (đa chọn) → nạp thông tin cho AI + tự thêm ảnh SP.
    function openKhoPicker() {
        if (!window.Web2ProductPicker || !window.Web2ProductPicker.open) {
            notify('Chưa tải được công cụ chọn SP', 'error');
            return;
        }
        window.Web2ProductPicker.open({
            multi: true,
            title: 'Chọn sản phẩm cho bài đăng',
            onConfirm: (products) => {
                _selectedProducts = (products || []).slice();
                // 1 SP → đổ vào ô tên/giá/KM để chỉnh tay được; nhiều SP → để AI tổng hợp.
                if (_selectedProducts.length === 1) {
                    const p = _selectedProducts[0];
                    const set = (id, v) => {
                        const e = document.getElementById(id);
                        if (e) e.value = v == null ? '' : v;
                    };
                    set('fbpPName', p.name || p.code || '');
                    set('fbpPPrice', p.price || '');
                }
                // tự thêm ảnh SP vào media (ảnh có URL công khai từ Kho)
                let imgs = 0;
                _selectedProducts.forEach((p) => {
                    const u = imgOf(p);
                    if (u && /^https?:\/\//.test(u)) {
                        Media().add({ type: 'photo', url: u });
                        imgs++;
                    }
                });
                renderProductChips();
                notify(
                    `Đã chọn ${_selectedProducts.length} SP${imgs ? ` + thêm ${imgs} ảnh` : ''} — bấm "Tạo nội dung" để AI viết`,
                    'success'
                );
            },
        });
    }

    function renderProductChips() {
        const wrap = document.getElementById('fbpKhoChips');
        if (!wrap) return;
        wrap.innerHTML = _selectedProducts
            .map(
                (p, i) =>
                    `<span class="fbp-status" style="display:inline-flex;align-items:center;gap:6px">
                        ${esc(p.name || p.code || 'SP')}${p.price ? ` · ${Number(p.price).toLocaleString('vi-VN')}đ` : ''}
                        <button type="button" data-rm="${i}" title="Bỏ" style="border:none;background:none;cursor:pointer;color:#b91c1c;font-weight:800;font-size:1rem;line-height:1">&times;</button>
                    </span>`
            )
            .join('');
        wrap.querySelectorAll('[data-rm]').forEach((b) =>
            b.addEventListener('click', () => {
                _selectedProducts.splice(Number(b.dataset.rm), 1);
                renderProductChips();
            })
        );
    }

    async function generate(ai) {
        const btn = document.getElementById('fbpGen');
        // Ưu tiên SP đã chọn từ Kho (1 hoặc nhiều); không có thì lấy từ ô nhập tay.
        const useMulti = _selectedProducts.length > 1;
        const payload = useMulti
            ? { products: _selectedProducts.map(toProd), style: _style, ai }
            : {
                  product: _selectedProducts[0] ? toProd(_selectedProducts[0]) : product(),
                  style: _style,
                  ai,
              };
        const singleName = useMulti ? 'multi' : payload.product.name;
        if (!singleName) {
            notify('Chọn SP từ Kho hoặc nhập tên sản phẩm để AI gợi ý', 'warning');
            return;
        }
        btn.disabled = true;
        const old = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader"></i> Đang tạo…';
        try {
            const r = await Api().caption(payload);
            if (r.success) {
                const msg = document.getElementById('fbpMessage');
                msg.value = r.text || r.caption || '';
                msg.dispatchEvent(new Event('input'));
                notify(
                    ai ? `Đã tạo bằng AI (${r.provider})` : 'Đã tạo nội dung (miễn phí)',
                    'success'
                );
            } else notify(r.error || 'Lỗi tạo nội dung', 'error');
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    function gather() {
        const pageIds = [...S().selectedPages];
        const message = document.getElementById('fbpMessage').value.trim();
        const media = Media().getMedia();
        const when = document.querySelector('input[name="fbpWhen"]:checked').value;
        let scheduledTime = null;
        if (when === 'sched') {
            const v = document.getElementById('fbpSchedAt').value;
            if (v) scheduledTime = new Date(v).getTime();
        }
        return { pageIds, message, media, scheduledTime };
    }

    // Xem trước bài như trên Facebook (qua shared Web2FbPostPreview).
    function openPreview() {
        const g = gather();
        if (!g.message && !g.media.length) {
            notify('Chưa có nội dung hoặc ảnh để xem trước', 'warning');
            return;
        }
        if (!window.Web2FbPostPreview) {
            notify('Chưa tải được công cụ xem trước', 'error');
            return;
        }
        const pages = (S().pages || []).filter((p) => g.pageIds.includes(p.id));
        window.Web2FbPostPreview.open({
            pages,
            caption: g.message,
            media: g.media,
            scheduledTime: g.scheduledTime,
        });
    }

    async function saveDraft() {
        const g = gather();
        if (!g.message && !g.media.length) {
            notify('Cần nội dung hoặc ảnh', 'warning');
            return;
        }
        try {
            const r = await Api().saveDraft({
                id: S().editingDraftId || undefined,
                pageIds: g.pageIds,
                message: g.message,
                media: g.media,
                scheduledTime: g.scheduledTime,
            });
            if (r.success) {
                notify('Đã lưu nháp', 'success');
                S().editingDraftId = null;
                resetForm();
            } else notify(r.error || 'Lỗi lưu nháp', 'error');
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function publish() {
        const g = gather();
        if (!g.pageIds.length) {
            notify('Chọn ít nhất 1 page', 'warning');
            return;
        }
        if (!g.message && !g.media.length) {
            notify('Cần nội dung hoặc ảnh/video', 'warning');
            return;
        }
        const pageNames = (S().pages || [])
            .filter((p) => g.pageIds.includes(p.id))
            .map((p) => p.name)
            .join(', ');
        const what = g.scheduledTime
            ? `Lên lịch đăng lúc ${new Date(g.scheduledTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
            : 'Đăng NGAY';
        const ok = await confirmDo(`${what} lên: ${pageNames}?`);
        if (!ok) return;

        const btn = document.getElementById('fbpPublish');
        btn.disabled = true;
        const old = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader"></i> Đang đăng…';
        try {
            const r = await Api().publish({
                pageIds: g.pageIds,
                message: g.message,
                media: g.media,
                scheduledTime: g.scheduledTime,
                draftId: S().editingDraftId || undefined,
                createdBy: (window.Web2Auth && window.Web2Auth.getUserName?.()) || '',
            });
            const okCount = (r.results || []).filter((x) => x.ok).length;
            const failed = (r.results || []).filter((x) => !x.ok);
            if (okCount) {
                notify(
                    `${g.scheduledTime ? 'Đã lên lịch' : 'Đã đăng'} ${okCount}/${g.pageIds.length} page`,
                    'success'
                );
                S().editingDraftId = null;
                resetForm();
            }
            if (r.rateLimited) notify(r.message || 'Facebook tạm giới hạn — thử lại sau.', 'error');
            if (failed.length) {
                const detail = failed
                    .map((f) => `• ${f.pageName || f.pageId}: ${f.error}`)
                    .join('\n');
                if (window.Popup && window.Popup.error)
                    window.Popup.error('Một số page lỗi:\n' + detail);
                else notify('Lỗi: ' + detail, 'error');
            }
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    function resetForm() {
        const msg = document.getElementById('fbpMessage');
        if (msg) {
            msg.value = '';
            msg.dispatchEvent(new Event('input'));
        }
        Media().clear();
        _selectedProducts = [];
        renderProductChips();
        ['fbpPName', 'fbpPPrice', 'fbpPDiscount'].forEach((id) => {
            const e = document.getElementById(id);
            if (e) e.value = '';
        });
        const hint = document.getElementById('fbpEditHint');
        if (hint) hint.textContent = '';
    }

    // Nạp 1 nháp vào form (gọi từ tab Lịch & Nháp).
    function loadDraft(d) {
        S().editingDraftId = d.id;
        S().selectedPages = new Set((d.page_ids || []).map(String));
        render();
        document.getElementById('fbpMessage').value = d.message || '';
        document.getElementById('fbpMessage').dispatchEvent(new Event('input'));
        Media().setMedia(d.media || []);
        if (d.scheduled_at) {
            document.querySelector('input[name="fbpWhen"][value="sched"]').checked = true;
            document.getElementById('fbpSchedAt').style.display = '';
            const dt = new Date(d.scheduled_at);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            document.getElementById('fbpSchedAt').value = dt.toISOString().slice(0, 16);
        }
    }

    window.FBPostsComposer = { render, loadDraft };
})();
