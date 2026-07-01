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
    // GMT+7 (Asia/Ho_Chi_Minh) — quy ước hiển thị Web 2.0.
    const FMT = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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
    // 'YYYY-MM-DD' (GMT+7) → { wd:'T2', date:'29/06/2026' }. Tách chuỗi, không new Date(str) (tránh lệch UTC).
    function dayLabel(d) {
        const [y, m, dd] = String(d).split('-').map(Number);
        const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(y, m - 1, dd).getDay()];
        return { wd, date: `${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` };
    }

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
            $('#gwPhotoBtn').hidden = true;
        } catch (err) {
            toast('Lỗi ảnh: ' + err.message, 'err');
        }
    }
    function clearPhoto() {
        pendingDataUrl = null;
        $('#gwPreviewImg').src = '';
        $('#gwPreview').hidden = true;
        $('#gwPhotoBtn').hidden = false;
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
        loadReport();
    }

    async function loadReport() {
        if (_dayDrawer && _dayDrawer.isOpen()) _dayDrawer.close(); // data đổi → đóng drawer cũ
        const qs = new URLSearchParams();
        const from = $('#rpFrom').value,
            to = $('#rpTo').value,
            user = $('#rpUser').value;
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (user) qs.set('username', user);
        $('#rpBody').innerHTML = '<tr><td colspan="8" class="rp-muted">Đang tải…</td></tr>';
        try {
            REPORT = await api('/report?' + qs.toString());
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

        if (!rows.length) {
            $('#rpBody').innerHTML =
                '<tr><td colspan="8" class="rp-muted">Không có dữ liệu trong khoảng lọc.</td></tr>';
            $('#rpFoot').innerHTML = '';
            return;
        }
        $('#rpBody').innerHTML = rows
            .map((d) => {
                const dl = dayLabel(d.day);
                const act = admin
                    ? `<button class="rp-del" data-del-day="${esc(d.day)}" data-count="${d.count}" title="Xoá toàn bộ ngày này"><i data-lucide="trash-2"></i></button>`
                    : '';
                // Ảnh hiển thị ra luôn trong hàng (thumbnail); bấm → drawer xem full.
                const withImg = (d.items || []).filter((x) => x.hasImage);
                const preview = withImg.slice(0, 4);
                const more = withImg.length - preview.length;
                const thumbs = withImg.length
                    ? `<div class="rp-day-thumbs">${preview
                          .map((x) => `<img src="${GW}/img/${esc(x.id)}" loading="lazy" alt="" />`)
                          .join(
                              ''
                          )}${more > 0 ? `<span class="rp-more">+${more}</span>` : ''}</div>`
                    : '';
                return `<tr class="rp-drow" data-day="${esc(d.day)}" tabindex="0" role="button" title="Xem ảnh cân ngày này">
                    <td class="rp-day"><b>${dl.date}</b><span>${dl.wd}</span>${thumbs}</td>
                    <td class="num">${fmtInt(d.count)}</td>
                    <td class="num">${fmtKg(d.kg)}</td>
                    <td class="num">${fmtInt(d.bales)}</td>
                    <td class="num">${money(d.shipKg)}</td>
                    <td class="num">${money(d.shipBale)}</td>
                    <td class="num rp-ship">${money(d.ship)}</td>
                    <td class="rp-act">${act}</td>
                </tr>`;
            })
            .join('');
        $('#rpFoot').innerHTML = `<tr class="rp-total">
            <td>Tổng cộng</td>
            <td class="num">${fmtInt(t.count)}</td>
            <td class="num">${fmtKg(t.kg)}</td>
            <td class="num">${fmtInt(t.bales)}</td>
            <td class="num">${money(t.shipKg)}</td>
            <td class="num">${money(t.shipBale)}</td>
            <td class="num rp-ship">${money(t.ship)}</td>
            <td class="rp-act"></td>
        </tr>`;
        $('#rpBody')
            .querySelectorAll('.rp-drow')
            .forEach((row) => {
                row.addEventListener('click', (e) => {
                    if (e.target.closest('[data-del-day]')) return; // nút xoá ngày → không mở drawer
                    openDayDrawer(row.dataset.day);
                });
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDayDrawer(row.dataset.day);
                    }
                });
            });
        if (admin)
            $('#rpBody')
                .querySelectorAll('[data-del-day]')
                .forEach((b) =>
                    b.addEventListener('click', () =>
                        deleteDay(b.dataset.delDay, Number(b.dataset.count))
                    )
                );
        icons($('#panelReport'));
    }

    // ── Drawer ảnh cân theo ngày (module chung Web2Drawer) ──
    let _dayDrawer = null;
    let _drawerDay = null;
    function ensureDrawer() {
        if (_dayDrawer || !window.Web2Drawer) return _dayDrawer;
        _dayDrawer = Web2Drawer.create({
            id: 'gwDayPhotos',
            side: 'right',
            width: 460,
            backdrop: true,
            onClose: () => {
                _drawerDay = null;
            },
        });
        return _dayDrawer;
    }
    function openDayDrawer(day) {
        const row = (REPORT && REPORT.rows ? REPORT.rows : []).find((r) => r.day === day);
        if (!row) return;
        const items = row.items || [];
        const dw = ensureDrawer();
        if (!dw) {
            // Fallback: chưa nạp Web2Drawer → mở thẳng lightbox toàn bộ ảnh ngày đó.
            const urls = items
                .filter((x) => x.hasImage)
                .map((x) => `${GW}/img/${encodeURIComponent(x.id)}`);
            if (urls.length && window.Web2ImageLightbox?.open) Web2ImageLightbox.open(urls, 0);
            return;
        }
        if (dw.isOpen() && _drawerDay === day) return dw.close(); // bấm lại đúng ngày → đóng (toggle)
        _drawerDay = day;
        const dl = dayLabel(day);
        dw.setTitle(
            `Ảnh cân ${esc(dl.date)}<small>${esc(dl.wd)} · ${fmtInt(row.count)} lần cân · ${fmtKg(
                row.kg
            )} kg · ${money(row.ship)}</small>`
        );
        dw.setBody(dayPhotosHtml(items));
        wireDrawerPhotos(dw.body, items);
        dw.open();
    }
    function dayPhotosHtml(items) {
        if (!items.length) return '<div class="rp-muted">Không có bản ghi.</div>';
        const withImg = items.filter((x) => x.hasImage);
        return `<div class="rp-photos">${items
            .map((x) => {
                const idx = withImg.findIndex((w) => w.id === x.id);
                const media = x.hasImage
                    ? `<img src="${GW}/img/${esc(x.id)}" loading="lazy" data-idx="${idx}" alt="Ảnh cân" />`
                    : `<div class="rp-photo-empty"><i data-lucide="image-off"></i></div>`;
                return `<figure class="rp-photo">
                    ${media}
                    <figcaption>
                        <b>${esc(x.weightKg)} kg</b> · ${esc(x.baleCount)} kiện
                        <span>${esc(x.username || '—')} · ${esc(fmtTime(x.createdAt))}</span>
                        ${x.note ? `<span class="rp-photo-note">${esc(x.note)}</span>` : ''}
                    </figcaption>
                </figure>`;
            })
            .join('')}</div>`;
    }
    function wireDrawerPhotos(root, items) {
        const withImg = items.filter((x) => x.hasImage);
        const urls = withImg.map((x) => `${GW}/img/${encodeURIComponent(x.id)}`); // lightbox swipe
        root.querySelectorAll('img[data-idx]').forEach((im) =>
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
    }

    async function deleteDay(ymd, count) {
        if (!isAdmin()) return toast('Chỉ admin được xoá', 'err');
        const user = $('#rpUser').value;
        const dl = dayLabel(ymd);
        const who = user ? ` của "${user}"` : '';
        const msg = `Xoá TOÀN BỘ ${count} lần cân ngày ${dl.date}${who}?\nKhông thể hoàn tác.`;
        const ok = window.Popup?.confirm ? await window.Popup.confirm(msg) : confirm(msg);
        if (!ok) return;
        try {
            const qs = user ? '?username=' + encodeURIComponent(user) : '';
            const r = await api('/day/' + encodeURIComponent(ymd) + qs, { method: 'DELETE' });
            toast(`✓ Đã xoá ${r.deleted ?? count} bản ghi`, 'ok');
            loadReport();
            load(); // đồng bộ lại danh sách Lịch sử cân
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
    }

    function showTab(which) {
        const log = which !== 'report';
        $('#panelLog').hidden = !log;
        $('#panelReport').hidden = log;
        $('#tabLog').classList.toggle('is-active', log);
        $('#tabReport').classList.toggle('is-active', !log);
        document.body.classList.toggle('rp-mode', !log);
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
        $('#gwPreviewX').addEventListener('click', clearPhoto);
        $('#gwSave').addEventListener('click', save);
        $('#gwRefresh').addEventListener('click', load);
        setupReport();
        tickClock();
        setInterval(tickClock, 1000 * 30);
        icons();
        load();
        setupSSE();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
