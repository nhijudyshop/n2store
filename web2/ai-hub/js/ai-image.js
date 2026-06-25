// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — TẠO ẢNH free: Pollinations (no-key) · Cloudflare Workers AI · Gemini Nano Banana.
 * Pollinations trả URL (browser tự load) · CF/Gemini trả dataUrl base64.
 */
(function (global) {
    'use strict';

    const H = () => global.AiHub;
    let inited = false;
    let editImageData = null; // base64 ảnh gốc (Gemini sửa/ghép)

    function imageProviders() {
        return H().state.status?.image?.providers || [];
    }

    function fillProviders() {
        const sel = document.getElementById('aihImgProvider');
        const list = imageProviders();
        sel.innerHTML = list
            .map(
                (p) =>
                    `<option value="${p.id}" ${p.configured ? '' : 'disabled'}>${p.label}${p.configured ? '' : ' — chưa cấu hình'}</option>`
            )
            .join('');
        sel.value = (list.find((p) => p.configured) || list[0] || {}).id || 'pollinations';
        fillModels(sel.value);
        toggleEditField(sel.value);
    }
    function fillModels(providerId) {
        const sel = document.getElementById('aihImgModel');
        const p = imageProviders().find((x) => x.id === providerId);
        if (!p) return;
        sel.innerHTML = (p.models || [])
            .map((m) => `<option value="${m.id}">${m.label}</option>`)
            .join('');
    }
    function toggleEditField(providerId) {
        const p = imageProviders().find((x) => x.id === providerId);
        const field = document.getElementById('aihImgEditField');
        if (field) field.hidden = !(p && p.editsImage);
    }

    function init() {
        if (inited) return;
        inited = true;
        fillProviders();
        document.getElementById('aihImgProvider').addEventListener('change', (e) => {
            fillModels(e.target.value);
            toggleEditField(e.target.value);
            // Đổi sang nguồn KHÔNG sửa ảnh (editsImage=false) mà đang có ảnh gốc → dọn ảnh gốc +
            // card "Ảnh gốc" cho khớp thực tế (nguồn này sẽ bỏ qua ảnh gốc).
            const p = imageProviders().find((x) => x.id === e.target.value);
            if (editImageData && !(p && p.editsImage)) clearSource();
        });
        document.getElementById('aihImgGen').addEventListener('click', generate);
        // Kho ảnh free → chọn ảnh bản quyền-free làm ẢNH GỐC (Nano Banana sửa/ghép).
        document.getElementById('aihImgStock')?.addEventListener('click', () => {
            if (H().pickStock) H().pickStock((dataUrl) => setSource(dataUrl));
        });
        // 📋 Mẫu câu lệnh (nano-banana-pro-prompts) → điền vào ô mô tả.
        document.getElementById('aihImgPresets')?.addEventListener('click', () => {
            if (!global.AiPresets) return H().toast('Thư viện mẫu chưa sẵn sàng', 'warning');
            global.AiPresets.pickImage((prompt, p) => {
                const ta = document.getElementById('aihImgPrompt');
                ta.value = prompt;
                ta.focus();
                // Mẫu cần ảnh gốc nhưng chưa có → nhắc + auto chuyển Nano Banana nếu có key.
                if (p.needsImage && !editImageData) {
                    H().toast('Mẫu này cần ẢNH GỐC — hãy dán/chọn ảnh rồi bấm Tạo ảnh', 'info');
                    const gem = imageProviders().find((x) => x.id === 'gemini' && x.configured);
                    const sel = document.getElementById('aihImgProvider');
                    if (gem && sel && sel.value !== 'gemini') {
                        sel.value = 'gemini';
                        fillModels('gemini');
                        toggleEditField('gemini');
                    }
                }
            });
        });
        // 📁 Ảnh đã lưu (server) → render thành card trong gallery.
        document.getElementById('aihImgHistory')?.addEventListener('click', loadHistory);
        document.getElementById('aihImgEnhance')?.addEventListener('click', enhancePrompt);
        document.getElementById('aihImgPrompt').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate();
        });
        const file = document.getElementById('aihImgFile');
        if (file)
            file.addEventListener('change', () => {
                const f = file.files?.[0];
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => setSource(rd.result);
                rd.readAsDataURL(f);
            });
        // DÁN ảnh (Ctrl+V) khi đang ở tab Tạo ảnh → hiện NGAY ở khung kết quả + dùng làm ảnh gốc.
        document.addEventListener('paste', (e) => {
            if (H().state?.activeTab !== 'image') return;
            const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            const f = it && it.getAsFile();
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => setSource(rd.result);
            rd.readAsDataURL(f);
        });
        // Kéo-thả ảnh vào khung kết quả.
        const gal = document.getElementById('aihGallery');
        if (gal) {
            gal.addEventListener('dragover', (e) => e.preventDefault());
            gal.addEventListener('drop', (e) => {
                e.preventDefault();
                const f = [...(e.dataTransfer?.files || [])].find((x) =>
                    x.type.startsWith('image/')
                );
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => setSource(rd.result);
                rd.readAsDataURL(f);
            });
        }
    }

    // Đặt ảnh gốc (paste/chọn/kéo-thả) → hiện preview ở khung kết quả + auto chuyển Nano Banana.
    function setSource(dataUrl) {
        editImageData = dataUrl;
        showSource(dataUrl);
        const provSel = document.getElementById('aihImgProvider');
        const gem = imageProviders().find((p) => p.id === 'gemini' && p.configured);
        if (provSel && provSel.value !== 'gemini' && gem) {
            provSel.value = 'gemini';
            fillModels('gemini');
            toggleEditField('gemini');
            H().toast('Đã dán ảnh gốc → chuyển sang Nano Banana để sửa/ghép', 'info');
        } else {
            H().toast('Đã dán ảnh gốc', 'success');
        }
    }
    function showSource(dataUrl) {
        const gallery = document.getElementById('aihGallery');
        if (!gallery) return;
        gallery.querySelector('.aih-imgcard.source')?.remove();
        const card = document.createElement('div');
        card.className = 'aih-imgcard source';
        const img = new Image();
        img.alt = 'Ảnh gốc';
        img.src = dataUrl;
        card.appendChild(img);
        const bar = document.createElement('div');
        bar.className = 'aih-imgcard-bar';
        bar.style.opacity = '1';
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.textContent = '🖼 Ảnh gốc — bỏ';
        tag.onclick = () => clearSource();
        bar.appendChild(tag);
        card.appendChild(bar);
        gallery.prepend(card);
    }
    // Dọn ảnh gốc: xoá state + card "Ảnh gốc" + reset file input (dùng cho nút "bỏ" và khi đổi
    // sang nguồn không sửa ảnh).
    function clearSource() {
        editImageData = null;
        document.getElementById('aihGallery')?.querySelector('.aih-imgcard.source')?.remove();
        const f = document.getElementById('aihImgFile');
        if (f) f.value = '';
    }

    // #2 — Nút "AI viết mô tả": nhập ngắn → mở rộng thành prompt EN chi tiết tạo ảnh.
    // Điều phối module shared Web2AiDescribe (web2/shared/web2-ai-describe.js) — 1 NGUỒN
    // dùng chung với widget ✨; KHÔNG tự dựng lại call /complete ở đây.
    async function enhancePrompt() {
        const ta = document.getElementById('aihImgPrompt');
        const seed = ta.value.trim();
        if (!seed) return H().toast('Nhập vài chữ trước (vd: áo trắng nữ)', 'warning');
        const btn = document.getElementById('aihImgEnhance');
        const old = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Đang viết…';
        try {
            if (!global.Web2AiDescribe) throw new Error('Module viết mô tả chưa sẵn sàng');
            const text = await global.Web2AiDescribe.describe({ seed, kind: 'image-prompt' });
            ta.value = text;
            H().toast('AI đã viết mô tả chi tiết ✨', 'success');
        } catch (e) {
            H().toast('Lỗi AI viết mô tả: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
            if (global.lucide) global.lucide.createIcons();
        }
    }

    // ✂️ Tách nền ảnh (kết quả) qua máy shop tự host (Web2BgRemover) → card kết quả mới.
    async function removeBgFromCard(src, prompt) {
        const gallery = document.getElementById('aihGallery');
        const card = document.createElement('div');
        card.className = 'aih-imgcard loading';
        card.innerHTML = '<div class="aih-spinner"></div><span>Đang tách nền…</span>';
        gallery.prepend(card);
        try {
            const dataUrl = await global.Web2BgRemover.removeBgAuto(src);
            renderCard(card, dataUrl, (prompt || '') + ' (đã tách nền)', 'tách nền');
        } catch (e) {
            card.classList.remove('loading');
            card.innerHTML = `<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ ${H().escapeHtml(e.message || String(e))}</div>`;
            H().toast('Tách nền: ' + (e.message || e), 'warning');
        }
    }

    async function onShow() {
        if (!inited) init();
        // Tự phục hồi nếu /status fail lúc boot → providers rỗng → dropdown trống (kẹt vĩnh viễn
        // vì fillProviders chỉ chạy 1 lần trong init). Nạp lại status rồi refill khi đang rỗng.
        if (imageProviders().length === 0) {
            await H().loadStatus();
            fillProviders();
        }
        refreshQuota();
        if (global.lucide) global.lucide.createIcons();
    }

    // Hiển thị quota Nano Banana còn lại / hôm nay (hoặc cảnh báo thiếu quyền).
    async function refreshQuota() {
        const hint = document.getElementById('aihQuotaHint');
        if (!hint) return;
        try {
            const r = await fetch(H().API() + '/quota', { headers: H().authHeaders(false) });
            const j = await r.json();
            if (!j.ok || j.unlimited) {
                hint.hidden = true;
                return;
            }
            hint.hidden = false;
            hint.textContent =
                j.canUse === false
                    ? '🔒 Bạn chưa có quyền dùng Nano Banana — liên hệ admin.'
                    : `🍌 Nano Banana: còn ${j.remaining}/${j.limit} lượt hôm nay.`;
        } catch {
            hint.hidden = true;
        }
    }

    // Tải ảnh đã LƯU trên server → render thành card lịch sử trong gallery.
    async function loadHistory() {
        const gallery = document.getElementById('aihGallery');
        const btn = document.getElementById('aihImgHistory');
        if (btn) btn.disabled = true;
        try {
            const r = await fetch(H().API() + '/images?limit=40', {
                headers: H().authHeaders(false),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Lỗi tải lịch sử');
            gallery.querySelectorAll('.aih-imgcard.history').forEach((e) => {
                if (e._objUrl) URL.revokeObjectURL(e._objUrl); // dọn objectURL cũ tránh leak
                e.remove();
            });
            if (!j.images.length) return H().toast('Chưa có ảnh nào được lưu', 'info');
            j.images.forEach((im) => gallery.appendChild(renderHistoryCard(im)));
            H().toast(`Đã tải ${j.images.length} ảnh đã lưu`, 'success');
        } catch (e) {
            H().toast('Lỗi tải ảnh đã lưu: ' + (e.message || e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function renderHistoryCard(im) {
        const card = document.createElement('div');
        card.className = 'aih-imgcard history';
        const img = new Image();
        img.alt = im.prompt || '';
        img.title = im.prompt || '';
        const fail = () => {
            card.innerHTML =
                '<div style="padding:10px;font-size:.72rem;color:var(--web2-text-3)">⚠️ Ảnh lỗi</div>';
        };
        img.onerror = fail;
        card.appendChild(img);
        const bar = document.createElement('div');
        bar.className = 'aih-imgcard-bar';
        const dl = document.createElement('a');
        dl.textContent = '⬇';
        dl.download = 'ai-' + im.id + '.png';
        dl.target = '_blank';
        const del = document.createElement('button');
        del.textContent = '🗑';
        del.title = 'Xoá khỏi server';
        del.onclick = async () => {
            if (global.Popup && !(await global.Popup.confirm('Xoá ảnh này khỏi server?'))) return;
            try {
                const r = await fetch(H().API() + '/images/' + im.id, {
                    method: 'DELETE',
                    headers: H().authHeaders(false),
                });
                const j = await r.json();
                if (j.ok) {
                    if (card._objUrl) URL.revokeObjectURL(card._objUrl);
                    card.remove();
                    H().toast('Đã xoá', 'success');
                } else H().toast('Xoá thất bại', 'error');
            } catch (e) {
                H().toast('Lỗi xoá: ' + e.message, 'error');
            }
        };
        const tag = document.createElement('span');
        tag.textContent = im.kind === 'tryon' ? 'ghép đồ' : im.provider || '';
        tag.style.cssText = 'font-size:.62rem;opacity:.75';
        bar.appendChild(dl);
        bar.appendChild(del);
        bar.appendChild(tag);
        card.appendChild(bar);

        // Nạp ảnh AN TOÀN: ảnh có bytes trên server (protected) → fetch kèm `x-web2-token`
        // trong HEADER (KHÔNG nhét token vào URL → tránh lộ token qua DOM/history/Referer/log)
        // → blob → objectURL. Ảnh public (im.url) → dùng trực tiếp. Revoke objectURL khi xoá/reload.
        if (im.has_bytes) {
            fetch(H().API() + '/images/' + im.id, { headers: H().authHeaders(false) })
                .then((r) => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.blob();
                })
                .then((blob) => {
                    const u = URL.createObjectURL(blob);
                    card._objUrl = u;
                    img.src = u;
                    dl.href = u;
                })
                .catch(fail);
        } else if (im.url) {
            img.src = im.url;
            dl.href = im.url;
        } else {
            fail();
        }
        return card;
    }

    async function generate() {
        const prompt = document.getElementById('aihImgPrompt').value.trim();
        if (!prompt) return H().toast('Nhập mô tả ảnh', 'warning');
        const provider = document.getElementById('aihImgProvider').value;
        const model = document.getElementById('aihImgModel').value;
        const width = +document.getElementById('aihImgW').value;
        const height = +document.getElementById('aihImgH').value;
        const btn = document.getElementById('aihImgGen');
        const gallery = document.getElementById('aihGallery');

        // card loading (prepend)
        const card = document.createElement('div');
        card.className = 'aih-imgcard loading';
        card.innerHTML = '<div class="aih-spinner"></div><span>Đang tạo…</span>';
        gallery.prepend(card);

        // Ảnh gốc chỉ dùng được với Gemini (Nano Banana) — cảnh báo rõ nếu nguồn khác sẽ bỏ qua.
        if (editImageData && provider !== 'gemini') {
            H().toast(
                'Ảnh gốc chỉ dùng được với Nano Banana (Gemini) — nguồn hiện tại sẽ bỏ qua ảnh gốc',
                'warning'
            );
        }

        btn.disabled = true;
        try {
            const payload = { prompt, provider, model, width, height };
            if (provider === 'gemini' && editImageData) payload.image = editImageData;
            // Timeout 120s: nguồn ảnh (Pollinations/Flux) treo → KHÔNG kẹt nút mãi
            // (bug "tạo 1 hình rồi không tạo tiếp, phải F5"). Abort → catch → mở lại nút.
            const r = await fetch(H().API() + '/image', {
                method: 'POST',
                headers: H().authHeaders(true),
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(120000),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Tạo ảnh thất bại');
            const srcUrl = j.url || j.dataUrl;
            renderCard(card, srcUrl, prompt, j.provider);
            if (provider === 'gemini') refreshQuota(); // Nano Banana → cập nhật lượt còn lại
        } catch (e) {
            const msg =
                e.name === 'TimeoutError' || e.name === 'AbortError'
                    ? 'Quá lâu (nguồn ảnh bận) — bấm Tạo ảnh lại nhé.'
                    : e.message || String(e);
            card.classList.remove('loading');
            card.innerHTML = `<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ ${H().escapeHtml(msg)}</div>`;
            H().toast('Lỗi tạo ảnh: ' + msg, 'error');
        } finally {
            btn.disabled = false; // LUÔN mở lại nút → tạo tiếp được, khỏi F5
        }
    }

    function renderCard(card, src, prompt, provider) {
        const img = new Image();
        img.alt = prompt;
        img.onload = () => {
            card.classList.remove('loading');
            card.innerHTML = '';
            card.appendChild(img);
            const bar = document.createElement('div');
            bar.className = 'aih-imgcard-bar';
            const dl = document.createElement('a');
            dl.textContent = '⬇ Tải';
            dl.href = src;
            dl.download = 'ai-' + Date.now() + '.png';
            dl.target = '_blank';
            const open = document.createElement('button');
            open.textContent = provider || 'mở';
            open.onclick = () => window.open(src, '_blank');
            bar.appendChild(dl);
            bar.appendChild(open);
            // ✂️ Tách nền qua máy shop (free, on-device) — chỉ hiện nếu module có mặt.
            if (global.Web2BgRemover) {
                const cut = document.createElement('button');
                cut.textContent = '✂️ Nền';
                cut.title = 'Tách nền bằng máy shop (free)';
                cut.onclick = () => removeBgFromCard(src, prompt);
                bar.appendChild(cut);
            }
            card.appendChild(bar);
        };
        img.onerror = () => {
            card.classList.remove('loading');
            card.innerHTML =
                '<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ Ảnh lỗi/hết quota</div>';
        };
        img.src = src;
    }

    global.AiImage = { init, onShow };
})(window);
