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

    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    async function confirmDo(msg) {
        if (window.Popup && window.Popup.confirm) return window.Popup.confirm(msg);
        return window.confirm(msg);
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
                    <button class="fbp-btn ghost sm" id="fbpGenFree" type="button">
                        <i data-lucide="wand-2"></i> Tạo nội dung (miễn phí)
                    </button>
                    <button class="fbp-btn ghost sm" id="fbpGenAi" type="button" ${
                        S().aiAvailable ? '' : 'disabled title="Chưa cấu hình AI key trên server"'
                    }>
                        <i data-lucide="bot"></i> AI viết lại (Groq • free)
                    </button>
                    <span class="fbp-charcount" id="fbpCharCount">0 ký tự</span>
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
                    <button class="fbp-btn ghost" id="fbpSaveDraft" type="button"><i data-lucide="save"></i> Lưu nháp</button>
                    <button class="fbp-btn" id="fbpPublish" type="button"><i data-lucide="send"></i> Đăng / Lên lịch</button>
                    <span id="fbpEditHint" style="font-size:.8rem;color:#c87f0a;align-self:center"></span>
                </div>
            </div>
        `;
        wire();
        if (window.lucide?.createIcons) window.lucide.createIcons();
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
        // generate
        document.getElementById('fbpGenFree').addEventListener('click', () => generate(false));
        document.getElementById('fbpGenAi').addEventListener('click', () => generate(true));
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
        // schedule toggle
        document.querySelectorAll('input[name="fbpWhen"]').forEach((r) => {
            r.addEventListener('change', () => {
                document.getElementById('fbpSchedAt').style.display =
                    document.querySelector('input[name="fbpWhen"]:checked').value === 'sched'
                        ? ''
                        : 'none';
            });
        });
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

    async function generate(ai) {
        const btn = document.getElementById(ai ? 'fbpGenAi' : 'fbpGenFree');
        const p = product();
        if (!p.name) {
            notify('Nhập tên sản phẩm để AI gợi ý', 'warning');
            return;
        }
        btn.disabled = true;
        const old = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader"></i> Đang tạo…';
        try {
            const r = await Api().caption(p, _style, ai);
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
