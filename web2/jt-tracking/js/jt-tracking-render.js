// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// J&T Tracking — render: KPI strip, danh sách vận đơn, row HTML, copy/parse helpers,
// timeline modal + Lottie lifecycle (qua JtTrackingState).
(function () {
    'use strict';

    const { ST, KPI_ORDER, KPI_META, APPROVE_TTL_DAYS, $, esc, notify, icons } =
        window.JtTrackingConst;
    const { api, relTime } = window.JtTrackingApi;
    const S = window.JtTrackingState;

    // ── KPI ─────────────────────────────────────────────────────────
    function renderKpi() {
        const k = S.state.kpi || {};
        $('jtKpis').innerHTML = KPI_ORDER.map((key) => {
            const n = key === 'total' ? k.total || 0 : k[key] || 0;
            const meta = KPI_META[key];
            const active = (key === 'total' && S.state.status === 'all') || S.state.status === key;
            return `<button class="jt-kpi ${active ? 'is-active' : ''}" data-st="${key}" style="--accent:${meta.accent}" type="button">
                <div class="jt-kpi-num">${n}</div>
                <div class="jt-kpi-label"><span class="dot"></span>${meta.label}</div>
            </button>`;
        }).join('');
    }

    // Tách SĐT + tên khách từ dòng đơn ("<mã>\tShop NHI JUDY 01\t<tiền>\t<tên>\t<sđt>\t<note>").
    function parseOrderInfo(src) {
        const s = String(src || '');
        const m = s.match(/\b0\d{8,10}\b/);
        const phone = m ? m[0] : '';
        let name = '';
        if (phone) {
            const parts = s
                .split(/\t|\s{2,}/)
                .map((x) => x.trim())
                .filter(Boolean);
            const idx = parts.findIndex((p) => p.includes(phone));
            if (idx > 0)
                name = parts[idx - 1]
                    .replace(/-+\s*-+.*$/, '') // bỏ đuôi "- -76-10/06/2026"
                    .replace(/[-\s]+$/, '')
                    .trim();
        }
        return { phone, name };
    }

    // ── List ────────────────────────────────────────────────────────
    // tô đậm mã 12 số (bấm copy) + SĐT (bấm → mở modal nhắn tin Zalo/Pancake).
    function fmtSrcMsg(s) {
        const raw = String(s || '');
        const info = parseOrderInfo(raw);
        let h = esc(raw);
        h = h.replace(
            /\b(\d{12})\b/g,
            '<b class="jt-code" data-copy="$1" role="button" tabindex="0" title="Bấm để copy mã đơn">$1</b>'
        );
        const nameAttr = info.name ? ` data-msg-name="${esc(info.name)}"` : '';
        h = h.replace(
            /\b(0\d{8,10})\b/g,
            (mm, p1) =>
                `<span class="jt-phone" data-msg-phone="${p1}"${nameAttr} role="button" tabindex="0" title="Nhắn tin cho khách (Zalo / Pancake)">${p1}</span>`
        );
        return h;
    }
    function copyText(t) {
        const v = String(t || '').trim();
        if (!v) return;
        const ok = () => notify('Đã copy: ' + v, 'success');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard
                .writeText(v)
                .then(ok)
                .catch(() => fallbackCopy(v, ok));
        } else fallbackCopy(v, ok);
    }
    function fallbackCopy(v, ok) {
        try {
            const ta = document.createElement('textarea');
            ta.value = v;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            ok();
        } catch {
            notify('Copy lỗi', 'error');
        }
    }
    function approvedTag(approvedAt) {
        if (!approvedAt) return '';
        const daysGone = Math.floor((Date.now() - Number(approvedAt)) / 86400000);
        const left = Math.max(0, APPROVE_TTL_DAYS - daysGone);
        return `<span class="jt-approved-tag"><i data-lucide="check-circle-2"></i> Đã duyệt · tự xoá sau ${left} ngày</span>`;
    }
    function rowHtml(r) {
        const s = ST(r.status);
        const approved = !!r.approved_at;
        const code = esc(r.billcode); // luôn 12 số, vẫn esc để chắc chắn an toàn attr
        const when = r.latest_at_text
            ? `${esc(r.latest_at_text)} · ${esc(relTime(r.latest_at))}`
            : 'Chưa tra cứu';
        // nút mở chat nhóm J&T: dùng conv của row, hoặc fallback conv nhóm J&T (suy từ row khác)
        // → mã dán tay (không có zalo_conv_id) vẫn mở được nhóm + nhảy tới tin có mã.
        const convForChat = r.zalo_conv_id || S.getGroupConvId();
        const chatBtn = convForChat
            ? `<button class="jt-icobtn chat" data-act="chat" data-conv="${esc(convForChat)}" data-billcode="${code}" title="Mở chat nhóm Zalo + tìm tới tin có mã"><i data-lucide="message-circle"></i></button>`
            : '';
        const info = parseOrderInfo(r.src_message);
        const tagged = info.phone && S.taggedPhones.has(info.phone);
        const tagBtn = info.phone
            ? `<button class="jt-icobtn tag ${tagged ? 'is-tagged' : ''}" data-act="tag" data-phone="${esc(info.phone)}" title="${tagged ? 'Khách đã gắn thẻ XỬ LÝ BC (bấm để GỠ)' : 'Gắn thẻ Pancake: XỬ LÝ BC'}"><i data-lucide="${tagged ? 'badge-check' : 'tag'}"></i></button>`
            : '';
        const right = `${chatBtn}${tagBtn}<button class="jt-icobtn" data-act="refresh" data-code="${code}" title="Làm mới"><i data-lucide="refresh-cw"></i></button>
            ${
                approved
                    ? `<button class="jt-icobtn" data-act="unapprove" data-code="${code}" title="Trở lại (bỏ duyệt)"><i data-lucide="rotate-ccw"></i></button>`
                    : `<button class="jt-icobtn approve" data-act="approve" data-code="${code}" title="Duyệt (đã xử lý xong)"><i data-lucide="check"></i></button>`
            }`;
        return `<div class="jt-row ${approved ? 'is-approved' : ''}" data-open="${code}" role="button" tabindex="0">
            <div class="jt-row-status" style="--bg:var(--st-${s.cls}-bg);--fg:var(--st-${s.cls})"><i data-lucide="${s.icon}"></i></div>
            <div class="jt-row-mid">
                <div class="jt-row-code">
                    <span class="jt-code" data-copy="${code}" role="button" tabindex="0" title="Bấm để copy mã đơn">${code}</span>
                    <span class="jt-badge" style="--bg:var(--st-${s.cls}-bg);--fg:var(--st-${s.cls})">${s.label}</span>
                    ${approvedTag(r.approved_at)}
                </div>
                <div class="jt-row-last">${esc(r.latest_event || 'Chưa có thông tin từ J&T')}</div>
                ${r.src_message ? `<div class="jt-row-msg" title="Tin nhắn nhóm chứa mã">${fmtSrcMsg(r.src_message)}</div>` : ''}
                <div class="jt-row-meta">
                    <span class="src">${r.source === 'zalo' ? 'Zalo' : 'Nhập tay'}</span>
                    <span>${when}</span>
                    ${r.note ? `<span>· ${esc(r.note)}</span>` : ''}
                </div>
            </div>
            <div class="jt-row-right">${right}</div>
        </div>`;
    }

    function renderList() {
        const box = $('jtList');
        const items = S.state.list;
        // suy conv nhóm J&T từ row có sẵn → nút chat hiện cho cả mã dán tay (thiếu zalo_conv_id)
        S.setGroupConvId(
            (items.find((r) => r.zalo_conv_id) || {}).zalo_conv_id || S.getGroupConvId()
        );
        $('jtCount').textContent = items.length ? `${items.length} vận đơn` : '';
        if (!items.length) {
            S.destroyLottie('jtEmptyLot');
            box.innerHTML = `<div class="jt-state">
                <div class="lottie" id="jtEmptyLot"></div>
                <h3>${S.state.search || S.state.status !== 'all' ? 'Không có kết quả' : 'Chưa có vận đơn'}</h3>
                <p>Bấm <b>Quét Zalo</b> để gom mã từ tin nhắn, hoặc nhập mã 12 số ở ô phía trên.</p>
            </div>`;
            S.playLottie('jtEmptyLot', 'truck');
            return;
        }
        box.innerHTML = items.map(rowHtml).join('');
        icons();
    }

    // ── Timeline modal ──────────────────────────────────────────────
    function fmtDesc(desc) {
        // escape rồi tô đậm các đoạn 【...】 (J&T highlight)
        return esc(desc).replace(/【([^】]*)】/g, '<span class="jt-hl">【$1】</span>');
    }
    function timelineHtml(events) {
        if (!events || !events.length)
            return `<div class="jt-state" style="padding:24px"><h3>Chưa có hành trình</h3><p>J&amp;T chưa trả dữ liệu cho mã này (hoặc sai mã / SĐT gửi).</p></div>`;
        return `<div class="jt-timeline">${events
            .map(
                (
                    e,
                    i
                ) => `<div class="jt-tl-item ${i === 0 ? 'is-latest' : ''}" style="--dot:${ST(deriveFromDesc(e.desc)).hero}">
                    <span class="jt-tl-dot"></span>
                    <div class="jt-tl-when"><span class="t">${esc(e.time || '')}</span><span>${esc(e.date || '')}</span></div>
                    <div class="jt-tl-desc">${fmtDesc(e.desc || '')}</div>
                </div>`
            )
            .join('')}</div>`;
    }
    // màu dot theo nội dung từng event (nhẹ — chỉ cho timeline)
    function deriveFromDesc(d) {
        d = (d || '').toLowerCase();
        // mirror deriveStatus backend (audit 121 sự kiện J&T thật) — kết cục dứt khoát trước 'thành công'
        const failed = /(không thành công|chưa thành công)/.test(d);
        if (/(chuyển hoàn|hoàn hàng|hoàn về|trả hàng|trả về)/.test(d)) return 'returned';
        if (failed || /(từ chối|kiện khó|không liên lạc|đổi ý|thất bại|hủy|sự cố)/.test(d))
            return 'problem';
        if (/(ký nhận|giao hàng thành công|giao thành công|phát thành công)/.test(d))
            return 'delivered';
        if (/(đang giao|phát lại|đang tiến hành|giao hàng)/.test(d)) return 'delivering';
        return 'transit';
    }

    async function openTimeline(billcode) {
        const mount = $('jtModalMount');
        // dọn lottie của modal cũ (nếu mở nhanh liên tiếp) → tránh leak.
        S.destroyLottie('jtHeroLot');
        S.destroyLottie('jtLoadLot');
        mount.innerHTML = `<div class="jt-modal-back" id="jtBack">
            <div class="jt-modal" role="dialog" aria-modal="true">
                <div class="jt-modal-hero" id="jtHero" style="--hero:#334155">
                    <div class="lottie" id="jtHeroLot"></div>
                    <div class="jt-modal-hero-txt">
                        <div class="code">${esc(billcode)}</div>
                        <div class="stat" id="jtHeroStat">Đang tải…</div>
                    </div>
                    <button class="jt-modal-close" id="jtClose" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="jt-modal-body" id="jtBody">
                    <div class="jt-state" style="padding:30px"><div class="lottie" id="jtLoadLot" style="width:120px;height:120px"></div></div>
                </div>
            </div>
        </div>`;
        icons();
        requestAnimationFrame(() => $('jtBack')?.classList.add('show'));
        S.playLottie('jtLoadLot', 'loading');
        const close = () => {
            S.destroyLottie('jtHeroLot');
            S.destroyLottie('jtLoadLot');
            const b = $('jtBack');
            if (b) {
                b.classList.remove('show');
                setTimeout(() => (mount.innerHTML = ''), 220);
            }
        };
        $('jtClose').onclick = close;
        $('jtBack').onclick = (e) => {
            if (e.target.id === 'jtBack') close();
        };
        document.addEventListener('keydown', function onEsc(ev) {
            if (ev.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onEsc);
            }
        });

        try {
            const j = await api('/' + billcode);
            const r = j.data || {};
            const s = ST(r.status);
            S.destroyLottie('jtLoadLot');
            $('jtHero').style.setProperty('--hero', s.hero);
            $('jtHeroStat').innerHTML =
                `${s.label}${r.latest_at_text ? ` · ${esc(r.latest_at_text)}` : ''}`;
            if (s.lottie) S.playLottie('jtHeroLot', s.lottie);
            else
                $('jtHeroLot').innerHTML =
                    `<i data-lucide="${s.icon}" style="width:48px;height:48px;color:#fff"></i>`;
            const msgBlock = r.src_message
                ? `<div class="jt-row-msg" style="margin:0 0 16px"><div style="font-size:11px;font-weight:700;color:var(--jt-ink-mute);margin-bottom:4px">TIN NHẮN NHÓM</div>${fmtSrcMsg(r.src_message)}</div>`
                : '';
            $('jtBody').innerHTML = msgBlock + timelineHtml(r.events || []);
            icons();
        } catch (e) {
            S.destroyLottie('jtLoadLot');
            $('jtHeroStat').textContent = 'Lỗi';
            $('jtBody').innerHTML =
                `<div class="jt-state" style="padding:24px"><h3>Không tải được</h3><p>${esc(e.message)}</p></div>`;
        }
    }

    window.JtTrackingRender = {
        renderKpi,
        renderList,
        rowHtml,
        approvedTag,
        fmtSrcMsg,
        parseOrderInfo,
        copyText,
        fmtDesc,
        deriveFromDesc,
        timelineHtml,
        openTimeline,
    };
})();
