// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Cân nặng hàng khi về kiện.
(function () {
    'use strict';

    const API_BASE =
        window.API_CONFIG?.WORKER_URL ||
        window.WEB2_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const GW = API_BASE + '/api/web2-goods-weight';

    // ---- auth helpers (pattern canonical web2_auth = {token, expiresAt, user}) ----
    function _auth() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null');
        } catch (_) {
            return null;
        }
    }
    const token = () => _auth()?.token || '';
    const username = () =>
        (window.Web2Auth?.getStored && window.Web2Auth.getStored()?.user?.username) ||
        _auth()?.user?.username ||
        '';
    function isAdmin() {
        const u =
            (window.Web2Auth?.getStored && window.Web2Auth.getStored()?.user) || _auth()?.user;
        return !!(u && (u.role === 'admin' || u.isAdmin === true));
    }
    async function api(path, opts = {}) {
        const t = token();
        const res = await fetch(GW + path, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                ...(t ? { 'x-web2-token': t } : {}),
                ...(opts.headers || {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
    }

    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    function icons(root) {
        if (window.lucide?.createIcons)
            try {
                window.lucide.createIcons({
                    nameAttr: 'data-lucide',
                    ...(root ? { el: root } : {}),
                });
            } catch (_) {}
    }
    // GMT+7 (Asia/Ho_Chi_Minh) — hiển thị ĐẦY ĐỦ ngày + giờ:phút:giây (Lịch sử cân + đồng hồ).
    const FMT = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const fmtTime = (ms) => (ms ? FMT.format(new Date(Number(ms))) : '');

    // Đơn giá tiền ship (đồng bộ với render.com/routes/web2-goods-weight.js).
    // Server /report là nguồn-chân-lý cho báo cáo; hằng số này chỉ để hiện ship/lần cân.
    const RATE_KG = 25000; // đ / kg
    const RATE_BALE = 10000; // đ / kiện
    const VND = new Intl.NumberFormat('vi-VN');
    const money = (n) => VND.format(Math.round(Number(n) || 0)) + 'đ';
    const fmtInt = (n) => VND.format(Math.round(Number(n) || 0));
    const fmtKg = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    // Thời gian đầy đủ 1 lần cân (GMT+7): ngày + giờ:phút:giây — mỗi lần cân 1 dòng riêng, KHÔNG gộp ngày.
    const FMT_DATE = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    const FMT_HMS = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const fmtDateTime = (ms) => {
        const d = new Date(Number(ms));
        return { date: FMT_DATE.format(d), time: FMT_HMS.format(d) };
    };

    let toastTimer = null;
    function toast(msg, kind) {
        let el = $('#gwToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'gwToast';
            el.className = 'gw-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.className = 'gw-toast show ' + (kind || '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (el.className = 'gw-toast'), 2600);
    }

    // ---- ảnh: nén canvas ≤1280px, jpeg 0.8 (giảm payload từ ~4MB cam → ~300KB) ----
    let pendingDataUrl = null;
    let previewZoom = null; // Web2PinchZoom trên ảnh preview (pinch 2 ngón để zoom)
    function compress(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const MAX = 1280;
                let { width: w, height: h } = img;
                if (w > MAX || h > MAX) {
                    const r = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * r);
                    h = Math.round(h * r);
                }
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cv.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Ảnh không đọc được'));
            };
            img.src = url;
        });
    }
    async function onPhoto(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            pendingDataUrl = await compress(file);
            $('#gwPreviewImg').src = pendingDataUrl;
            $('#gwPreview').hidden = false;
            $('#gwPhotoBtns').hidden = true;
            previewZoom?.reset(); // ảnh mới → về zoom 1
        } catch (err) {
            toast('Lỗi ảnh: ' + err.message, 'err');
        }
    }
    function clearPhoto() {
        pendingDataUrl = null;
        $('#gwPreviewImg').src = '';
        $('#gwPreview').hidden = true;
        $('#gwPhotoBtns').hidden = false;
        previewZoom?.reset();
    }

    // ---- save ----
    async function save() {
        const kg = Number($('#gwKg').value);
        const bales = Math.round(Number($('#gwBales').value)) || 0; // ponytail: trống = 0 kiện (tính 0đ)
        const note = $('#gwNote').value.trim();
        if (!Number.isFinite(kg) || kg <= 0) return toast('Nhập số kg hợp lệ', 'err');
        if (!Number.isInteger(bales) || bales < 0) return toast('Số kiện không hợp lệ', 'err');
        if (!pendingDataUrl) return toast('Chụp ảnh mặt cân trước', 'err');
        const btn = $('#gwSave');
        btn.disabled = true;
        btn.classList.add('loading');
        try {
            await api('/', {
                method: 'POST',
                body: JSON.stringify({
                    weightKg: kg,
                    baleCount: bales,
                    note,
                    dataUrl: pendingDataUrl,
                }),
            });
            toast('✓ Đã lưu cân nặng', 'ok');
            $('#gwKg').value = '';
            $('#gwBales').value = '';
            $('#gwNote').value = '';
            clearPhoto();
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    // ---- list ----
    let DATA = { items: [], total: 0 };
    async function load() {
        try {
            DATA = await api('/list?limit=100');
            render();
        } catch (e) {
            $('#gwList').innerHTML = `<div class="gw-muted">Lỗi tải: ${esc(e.message)}</div>`;
        }
    }
    function render() {
        const admin = isAdmin();
        $('#gwCount').textContent = DATA.total ? `${DATA.total} bản ghi` : '';
        const items = DATA.items || [];
        if (!items.length) {
            $('#gwList').innerHTML = '<div class="gw-muted">Chưa có lần cân nào.</div>';
            return;
        }
        $('#gwList').innerHTML = items
            .map((it) => {
                const img = it.hasImage ? `${GW}/img/${esc(it.id)}` : '';
                const ship =
                    (Number(it.weightKg) || 0) * RATE_KG + (Number(it.baleCount) || 0) * RATE_BALE;
                return `<div class="gw-card">
                    ${
                        img
                            ? `<img class="gw-thumb" src="${img}" alt="Ảnh cân" data-img="${img}" loading="lazy" />`
                            : `<div class="gw-thumb gw-thumb-empty"><i data-lucide="image-off"></i></div>`
                    }
                    <div class="gw-card-body">
                        <div class="gw-card-top">
                            <span class="gw-kg">${esc(it.weightKg)} <small>kg</small></span>
                            <span class="gw-bales">${esc(it.baleCount)} kiện</span>
                            <span class="gw-ship"><i data-lucide="truck"></i> ${money(ship)}</span>
                        </div>
                        ${it.note ? `<div class="gw-note">${esc(it.note)}</div>` : ''}
                        <div class="gw-card-meta">
                            <span><i data-lucide="user"></i> ${esc(it.username || '—')}</span>
                            <span><i data-lucide="clock"></i> ${esc(fmtTime(it.createdAt))}</span>
                        </div>
                    </div>
                    ${
                        admin
                            ? `<button class="gw-del" data-del="${esc(it.id)}" title="Xoá"><i data-lucide="trash-2"></i></button>`
                            : ''
                    }
                </div>`;
            })
            .join('');
        $('#gwList')
            .querySelectorAll('[data-img]')
            .forEach((im) =>
                im.addEventListener('click', () => {
                    try {
                        if (window.Web2ImageLightbox?.open)
                            Web2ImageLightbox.open([im.dataset.img], 0);
                        else window.open(im.dataset.img, '_blank');
                    } catch (_) {
                        window.open(im.dataset.img, '_blank');
                    }
                })
            );
        $('#gwList')
            .querySelectorAll('[data-del]')
            .forEach((b) => b.addEventListener('click', () => del(b.dataset.del)));
        icons($('#gwList'));
    }
    async function del(id) {
        if (!isAdmin()) return toast('Chỉ admin được xoá', 'err');
        const ok = window.Popup?.confirm
            ? await window.Popup.confirm('Xoá bản ghi cân này?')
            : confirm('Xoá bản ghi cân này?');
        if (!ok) return;
        try {
            await api('/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('✓ Đã xoá', 'ok');
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        }
    }

    // ---- BÁO CÁO theo ngày (PC) ----
    let REPORT = null;
    let _filterDrawer = null; // thanh lọc .rp-bar nằm trong drawer chung (mở bằng nút mép "BỘ LỌC")

    function todayHCM() {
        // 'YYYY-MM-DD' hôm nay theo GMT+7 (độc lập TZ máy).
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
            new Date()
        );
    }
    function addDays(ymd, delta) {
        // Cộng ngày trên 'YYYY-MM-DD' bằng UTC (VN không có DST → an toàn).
        const [y, m, d] = ymd.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() + delta);
        return dt.toISOString().slice(0, 10);
    }
    function currentMonth() {
        return todayHCM().slice(0, 7); // 'YYYY-MM' theo GMT+7
    }
    // 12 tháng gần nhất (cũ→mới), tháng hiện tại ở cuối.
    function last12Months() {
        const [y, m] = currentMonth().split('-').map(Number);
        const arr = [];
        for (let i = 11; i >= 0; i--) {
            let mm = m - i,
                yy = y;
            while (mm <= 0) {
                mm += 12;
                yy -= 1;
            }
            arr.push({ ym: `${yy}-${String(mm).padStart(2, '0')}`, y: yy, m: mm });
        }
        return arr;
    }
    // 'YYYY-MM' → khoảng {from,to}. Tháng hiện tại: to = hôm nay (không kéo sang tương lai).
    function monthRange(ym) {
        const from = ym + '-01';
        if (ym === currentMonth()) return { from, to: todayHCM() };
        const [y, m] = ym.split('-').map(Number);
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return { from, to: `${ym}-${String(last).padStart(2, '0')}` };
    }
    function clearMonthActive() {
        document
            .querySelectorAll('#rpMonths .is-active')
            .forEach((b) => b.classList.remove('is-active'));
    }
    function buildMonths() {
        const wrap = $('#rpMonths');
        if (!wrap) return;
        wrap.innerHTML = last12Months()
            .map(
                (mo) =>
                    `<button class="rp-month" type="button" data-ym="${mo.ym}"><b>Th${mo.m}</b><span>${mo.y}</span></button>`
            )
            .join('');
        wrap.querySelectorAll('[data-ym]').forEach((b) =>
            b.addEventListener('click', () => selectMonth(b.dataset.ym))
        );
    }
    function selectMonth(ym) {
        const { from, to } = monthRange(ym);
        $('#rpFrom').value = from; // set .value programmatically → KHÔNG fire change (không clear chip)
        $('#rpTo').value = to;
        let active = null;
        $('#rpMonths')
            .querySelectorAll('[data-ym]')
            .forEach((b) => {
                const on = b.dataset.ym === ym;
                b.classList.toggle('is-active', on);
                if (on) active = b;
            });
        if (active)
            try {
                active.scrollIntoView({ inline: 'center', block: 'nearest' });
            } catch (_) {}
        loadReport(); // chip tháng nằm TRÊN bảng (ngoài drawer) → không cần đụng drawer
    }

    function reportQs() {
        const qs = new URLSearchParams();
        const from = $('#rpFrom').value,
            to = $('#rpTo').value,
            user = $('#rpUser').value;
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (user) qs.set('username', user);
        return qs.toString();
    }

    async function loadReport() {
        $('#rpBody').innerHTML = '<tr><td colspan="8" class="rp-muted">Đang tải…</td></tr>';
        try {
            REPORT = await api('/report?' + reportQs());
            renderReport();
        } catch (e) {
            $('#rpBody').innerHTML = `<tr><td colspan="8" class="rp-muted">Lỗi: ${esc(
                e.message
            )}</td></tr>`;
            $('#rpFoot').innerHTML = '';
        }
    }

    function fillUserOptions(users) {
        const sel = $('#rpUser');
        const cur = sel.value;
        sel.innerHTML =
            '<option value="">Tất cả</option>' +
            (users || []).map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
        if (cur && (users || []).includes(cur)) sel.value = cur;
    }

    function renderReport() {
        if (!REPORT) return;
        const admin = isAdmin();
        const rates = REPORT.rates || { kg: RATE_KG, bale: RATE_BALE };
        $('#rpRate').innerHTML = `Đơn giá ship: <b>${money(rates.kg)}</b>/kg · <b>${money(
            rates.bale
        )}</b>/kiện`;
        fillUserOptions(REPORT.users);

        const rows = REPORT.rows || [];
        const t = REPORT.totals || { count: 0, kg: 0, bales: 0, shipKg: 0, shipBale: 0, ship: 0 };

        $('#rpSummary').innerHTML = [
            { lb: 'Số ngày', v: fmtInt(rows.length) },
            { lb: 'Lần cân', v: fmtInt(t.count) },
            { lb: 'Tổng kg', v: fmtKg(t.kg) },
            { lb: 'Tổng kiện', v: fmtInt(t.bales) },
            { lb: 'Tổng tiền ship', v: money(t.ship), big: true },
        ]
            .map(
                (c) =>
                    `<div class="rp-stat${c.big ? ' rp-stat-hl' : ''}"><span>${c.lb}</span><b>${
                        c.v
                    }</b></div>`
            )
            .join('');

        // MỖI LẦN CÂN = 1 dòng riêng (không gộp theo ngày) — sắp mới nhất trước.
        const caps = rows
            .flatMap((d) => d.items || [])
            .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        if (!caps.length) {
            $('#rpBody').innerHTML =
                '<tr><td colspan="8" class="rp-muted">Không có dữ liệu trong khoảng lọc.</td></tr>';
            $('#rpFoot').innerHTML = '';
            return;
        }
        const withImg = caps.filter((x) => x.hasImage);
        const urls = withImg.map((x) => `${GW}/img/${encodeURIComponent(x.id)}`); // lightbox toàn bộ
        $('#rpBody').innerHTML = caps
            .map((x) => {
                const kg = Number(x.weightKg) || 0;
                const bales = Number(x.baleCount) || 0;
                const shipKg = kg * rates.kg;
                const shipBale = bales * rates.bale;
                const dt = fmtDateTime(x.createdAt);
                const idx = withImg.findIndex((w) => w.id === x.id);
                const thumb = x.hasImage
                    ? `<img class="rp-cap-thumb" src="${GW}/img/${esc(x.id)}" data-idx="${idx}" loading="lazy" alt="Ảnh cân" title="Xem ảnh to" />`
                    : `<div class="rp-cap-thumb rp-cap-empty"><i data-lucide="image-off"></i></div>`;
                const act = admin
                    ? `<button class="rp-del" data-edit="${esc(x.id)}" data-kg="${esc(x.weightKg)}" data-bales="${esc(x.baleCount)}" data-note="${esc(x.note || '')}" title="Sửa"><i data-lucide="pencil"></i></button>
                       <button class="rp-del" data-delrec="${esc(x.id)}" title="Xoá lần cân"><i data-lucide="trash-2"></i></button>`
                    : '';
                return `<tr data-cap="${esc(x.id)}">
                    <td class="rp-day"><b>${dt.date}</b><span>${dt.time} · ${esc(x.username || '—')}</span>${x.note ? `<span class="rp-cap-note">${esc(x.note)}</span>` : ''}</td>
                    <td class="rp-cap-imgcell">${thumb}</td>
                    <td class="num">${esc(x.weightKg)}</td>
                    <td class="num">${esc(x.baleCount)}</td>
                    <td class="num">${money(shipKg)}</td>
                    <td class="num">${money(shipBale)}</td>
                    <td class="num rp-ship">${money(shipKg + shipBale)}</td>
                    <td class="rp-act rp-act2">${act}</td>
                </tr>`;
            })
            .join('');
        $('#rpFoot').innerHTML = `<tr class="rp-total">
            <td>Tổng cộng (${fmtInt(t.count)} lần)</td>
            <td></td>
            <td class="num">${fmtKg(t.kg)}</td>
            <td class="num">${fmtInt(t.bales)}</td>
            <td class="num">${money(t.shipKg)}</td>
            <td class="num">${money(t.shipBale)}</td>
            <td class="num rp-ship">${money(t.ship)}</td>
            <td class="rp-act rp-act2"></td>
        </tr>`;
        // Thumbnail → lightbox (vuốt toàn bộ lần cân)
        $('#rpBody')
            .querySelectorAll('.rp-cap-thumb[data-idx]')
            .forEach((im) =>
                im.addEventListener('click', () => {
                    const i = Number(im.dataset.idx) || 0;
                    try {
                        if (window.Web2ImageLightbox?.open) Web2ImageLightbox.open(urls, i);
                        else window.open(urls[i], '_blank');
                    } catch (_) {
                        window.open(urls[i], '_blank');
                    }
                })
            );
        // admin: sửa / xoá từng lần cân
        if (admin) {
            $('#rpBody')
                .querySelectorAll('[data-edit]')
                .forEach((b) => b.addEventListener('click', () => startEditRow(b)));
            $('#rpBody')
                .querySelectorAll('[data-delrec]')
                .forEach((b) => b.addEventListener('click', () => delRecord(b.dataset.delrec)));
        }
        icons($('#panelReport'));
    }

    // ── Sửa / xoá 1 lần cân ngay trong bảng báo cáo (admin) ──
    // Sửa: bung 1 dòng form ngay dưới hàng (kg / kiện / ghi chú). Ảnh + người + giờ giữ nguyên.
    function startEditRow(btn) {
        const tr = btn.closest('tr');
        if (!tr || tr.nextElementSibling?.classList.contains('rp-erow')) return; // đang sửa rồi
        const id = btn.dataset.edit;
        const er = document.createElement('tr');
        er.className = 'rp-erow';
        er.innerHTML = `<td colspan="8"><div class="rp-edit rp-edit-inline">
            <label>Kg<input type="number" inputmode="decimal" step="0.1" min="0" class="rp-e-kg" value="${esc(btn.dataset.kg)}" /></label>
            <label>Kiện<input type="number" inputmode="numeric" step="1" min="0" class="rp-e-bales" value="${esc(btn.dataset.bales)}" /></label>
            <label class="rp-e-notewrap">Ghi chú<input type="text" class="rp-e-note" value="${esc(btn.dataset.note)}" /></label>
            <button class="rp-e-save" type="button">Lưu</button>
            <button class="rp-e-cancel" type="button">Huỷ</button>
        </div></td>`;
        tr.after(er);
        er.querySelector('.rp-e-save').addEventListener('click', () => saveEditRow(id, er));
        er.querySelector('.rp-e-cancel').addEventListener('click', () => er.remove());
        er.querySelector('.rp-e-kg').focus();
    }
    async function saveEditRow(id, er) {
        const kg = Number(er.querySelector('.rp-e-kg').value);
        const bales = Math.round(Number(er.querySelector('.rp-e-bales').value)) || 0;
        const note = er.querySelector('.rp-e-note').value.trim();
        if (!Number.isFinite(kg) || kg <= 0) return toast('Số kg không hợp lệ', 'err');
        if (bales < 0) return toast('Số kiện không hợp lệ', 'err');
        try {
            await api('/' + encodeURIComponent(id), {
                method: 'PATCH',
                body: JSON.stringify({ weightKg: kg, baleCount: bales, note }),
            });
            toast('✓ Đã sửa', 'ok');
            loadReport();
            load(); // đồng bộ tab Cân hàng
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        }
    }
    async function delRecord(id) {
        if (!isAdmin()) return toast('Chỉ admin được xoá', 'err');
        const ok = window.Popup?.confirm
            ? await window.Popup.confirm('Xoá lần cân này?')
            : confirm('Xoá lần cân này?');
        if (!ok) return;
        try {
            await api('/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('✓ Đã xoá', 'ok');
            loadReport();
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        }
    }

    function setPreset(range) {
        clearMonthActive();
        const today = todayHCM();
        let from = '',
            to = today;
        if (range === 'today') from = today;
        else if (range === '7') from = addDays(today, -6);
        else if (range === '30') from = addDays(today, -29);
        else if (range === 'month') from = today.slice(0, 7) + '-01';
        $('#rpFrom').value = from;
        $('#rpTo').value = to;
        loadReport();
        if (_filterDrawer?.isOpen()) _filterDrawer.close(); // preset = xong → đóng drawer lọc
    }

    function showTab(which) {
        const log = which !== 'report';
        $('#panelLog').hidden = !log;
        $('#panelReport').hidden = log;
        $('#tabLog').classList.toggle('is-active', log);
        $('#tabReport').classList.toggle('is-active', !log);
        document.body.classList.toggle('rp-mode', !log);
        if (_filterDrawer) {
            _filterDrawer.showToggle(!log); // nút "BỘ LỌC" chỉ hiện ở tab Báo cáo
            if (log) _filterDrawer.close();
        }
        if (!log && !REPORT) selectMonth(currentMonth()); // mặc định: tháng hiện tại
    }

    function setupReport() {
        buildMonths();
        const onDateChange = () => {
            clearMonthActive(); // sửa ngày tay → bỏ chọn tab tháng
            loadReport();
        };
        $('#tabLog').addEventListener('click', () => showTab('log'));
        $('#tabReport').addEventListener('click', () => showTab('report'));
        $('#rpFrom').addEventListener('change', onDateChange);
        $('#rpTo').addEventListener('change', onDateChange);
        $('#rpUser').addEventListener('change', loadReport); // lọc NV độc lập tháng
        $('#rpReset').addEventListener('click', () => {
            clearMonthActive();
            $('#rpFrom').value = '';
            $('#rpTo').value = '';
            $('#rpUser').value = '';
            loadReport();
        });
        $('#rpPresets')
            .querySelectorAll('[data-range]')
            .forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.range)));
        ensureFilterDrawer(); // chuyển thanh lọc .rp-bar vào drawer (module chung, mở bằng nút mép)
    }

    // Thanh lọc báo cáo (.rp-bar) → drawer trượt phải, mở bằng nút mép "BỘ LỌC" (module chung).
    function ensureFilterDrawer() {
        if (_filterDrawer || !window.Web2Drawer) return _filterDrawer;
        _filterDrawer = Web2Drawer.create({
            id: 'gwFilters',
            side: 'right',
            width: 420,
            backdrop: true,
            title: 'Bộ lọc báo cáo',
            toggle: { label: 'BỘ LỌC', icon: 'filter', title: 'Bộ lọc báo cáo' },
        });
        const bar = $('#panelReport .rp-bar');
        if (bar) _filterDrawer.body.appendChild(bar); // giữ nguyên element → wiring theo ID còn nguyên
        _filterDrawer.showToggle(false); // ẩn tới khi vào tab Báo cáo (showTab bật lại)
        return _filterDrawer;
    }

    // ---- clock (GMT+7 live) ----
    function tickClock() {
        const el = $('#gwClock')?.querySelector('b');
        if (el) el.textContent = FMT.format(new Date());
    }

    // ---- SSE realtime (đa máy/đa tab tự cập nhật) ----
    let sseDebounce = null;
    function setupSSE() {
        const reload = () => {
            load();
            if (!$('#panelReport').hidden) loadReport();
        };
        if (window.Web2SSE?.subscribeReload) {
            window.Web2SSE.subscribeReload('web2:goods-weight', reload, { debounce: 500 });
        } else if (window.Web2SSE?.subscribe) {
            Web2SSE.subscribe('web2:goods-weight', () => {
                clearTimeout(sseDebounce);
                sseDebounce = setTimeout(reload, 500);
            });
        }
    }

    function boot() {
        // Mobile-native (học unit-scan): KHÔNG mount desktop sidebar — header riêng.
        $('#gwUserName').textContent = username() || '—';
        document.body.classList.toggle('rp-admin', isAdmin()); // cột Xoá chỉ admin thấy
        $('#gwPhotoBtn').addEventListener('click', () => $('#gwPhoto').click());
        $('#gwPhoto').addEventListener('change', onPhoto);
        $('#gwUploadBtn').addEventListener('click', () => $('#gwUpload').click());
        $('#gwUpload').addEventListener('change', onPhoto);
        $('#gwPreviewX').addEventListener('click', clearPhoto);
        if (window.Web2PinchZoom)
            previewZoom = Web2PinchZoom.mount($('#gwPreviewImg'), { maxScale: 5 });
        $('#gwSave').addEventListener('click', save);
        $('#gwRefresh').addEventListener('click', load);
        setupReport();
        tickClock();
        setInterval(tickClock, 1000); // 1s: đồng hồ hiện giây chạy live
        icons();
        load();
        setupSSE();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
