// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// reconcile-actions.js — chọn PBH (race guard) + mutation tiền/đơn (pick/pack/ship/
// deliver/return) + scanner + audit modal đối chiếu camera.
// Tách module (MOVE-only) từ reconcile-app.js gốc; logic giữ nguyên byte-for-byte.
// ⚠ MONEY/order surface: giữ nguyên await + confirm + race guard + scanner IME guard.

(function () {
    'use strict';

    const RC = (window.RC = window.RC || {});
    const STATE = RC.STATE;
    const STATE_LABELS = RC.STATE_LABELS;
    const PBH_NUMBER_RE = RC.PBH_NUMBER_RE;
    const MANUAL_CAMERA_NOTE = RC.MANUAL_CAMERA_NOTE;
    const RC_HISTORY_LABELS = RC.RC_HISTORY_LABELS;
    const api = RC.api;
    const notify = RC.notify;
    const feedback = RC.feedback;
    const escapeHtml = RC.escapeHtml;
    const focusScanner = RC.focusScanner;

    // ---------- select PBH ----------
    async function selectPbh(number) {
        STATE.selectedNumber = number;
        STATE.historyHtml = null; // reset để không nháy lịch sử PBH cũ
        STATE.historyOpen = false; // mở PBH mới → ẩn lịch sử, ưu tiên danh sách SP để quét
        RC.renderList();
        const target = document.getElementById('rcScannerTarget');
        target.textContent = `PBH: ${number}`;
        target.classList.add('is-active');
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}`);
            // Chống race: user bấm PBH khác trong lúc fetch → bỏ kết quả cũ, không đè
            // STATE.currentPbh bằng PBH không còn được chọn (tránh hiện sai chi tiết).
            if (STATE.selectedNumber !== number) return false;
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            // Cuộn panel chi tiết lên đầu → thấy toàn bộ danh sách SP cần quét.
            const panel = document.getElementById('rcDetailPanel');
            if (panel) panel.scrollTop = 0;
            focusScanner();
            // Lịch sử lazy: chỉ tải khi user mở (ẩn mặc định).
            return true;
        } catch (e) {
            // Trả false (không throw) để caller như onScannerSubmit biết bill-scan THẤT BẠI,
            // tránh báo "Mở PBH" nhầm khi GET lỗi. Vẫn notify như cũ cho click danh sách.
            notify('Lỗi tải PBH: ' + e.message, 'error');
            return false;
        }
    }

    // ---------- actions ----------
    // 2026-06-06: tích tay 1 line — checked = pick đủ (qty), unchecked = 0.
    // Lưu NGAY mỗi lần tích (không cần quét đủ cả đơn). Dùng cho SP barcode không quét được.
    // User 06/06: BẮT BUỘC confirm + ghi lịch sử "đối chiếu camera" — vì tích tay KHÔNG
    // quét barcode → cần xác nhận + lưu vết để soi lại camera khi đối chứng.
    const _manualPickInFlight = new Set();
    async function toggleManualPick(productCode, checked, need) {
        const number = STATE.currentPbh?.number;
        if (!number) return;

        // Khóa per-line khi đang xử lý: double-click không stack 2 confirm + 2 POST
        // (last-write-wins server làm UI flip-flop). Bỏ qua change event khi còn in-flight.
        const lockKey = `${number}::${productCode}`;
        if (_manualPickInFlight.has(lockKey)) {
            RC.renderDetail(); // checkbox vừa toggle visually → vẽ lại theo state server
            return;
        }
        if (!window.Popup) {
            notify('Đang tải thành phần xác nhận, thử lại sau giây lát', 'error');
            RC.renderDetail();
            return;
        }
        _manualPickInFlight.add(lockKey);

        // Confirm trước khi áp dụng. Hủy → revert checkbox về trạng thái server.
        const ok = checked
            ? await Popup.confirm(
                  `✋ TÍCH TAY (không quét barcode) cho "${productCode}"?\n\n` +
                      `→ Đánh dấu đã pick đủ ${need} mà không quét mã.\n` +
                      `→ Thao tác được LƯU LỊCH SỬ (kèm người + ngày giờ) để ĐỐI CHIẾU CAMERA khi cần.\n\n` +
                      `Xác nhận?`
              )
            : await Popup.confirm(`Bỏ tích tay "${productCode}" (đưa về 0)?`);
        if (!ok) {
            _manualPickInFlight.delete(lockKey);
            RC.renderDetail(); // checkbox đã toggle visually → vẽ lại theo state server
            return;
        }

        const pickedQty = checked ? need : 0;
        const body = { productCode, pickedQty };
        if (checked) body.note = MANUAL_CAMERA_NOTE; // server log payload.note (sau khi deploy)
        if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(body);
        try {
            const res = await api('POST', `/${encodeURIComponent(number)}/manual-pick`, body);
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(number);
            const t = res.pbh?.totals || {};
            if (checked) {
                notify(`✋ Đã tích tay ${productCode} — lưu lịch sử để đối chiếu camera`, 'info');
            }
            if (t.isComplete) {
                feedback(`✓✓ ĐỦ HÀNG ${number} — bấm "Đóng gói" để hoàn tất`, false, true);
                RC.loadList();
            } else {
                feedback(checked ? `✓ Tích tay ${productCode}` : `↩ Bỏ tích ${productCode}`);
            }
        } catch (err) {
            notify(err.message, 'error');
            RC.renderDetail(); // revert về trạng thái server
        } finally {
            _manualPickInFlight.delete(lockKey);
        }
    }

    // #16: bớt 1 đơn vị đã pick (quét dư/nhầm) — KHÔNG Reset cả đơn. Dùng endpoint
    // manual-pick sẵn có (set picked_qty = got-1). Không confirm (sửa nhẹ 1 đơn vị);
    // khóa per-line như toggleManualPick để double-click không stack 2 POST.
    async function decrementPick(productCode, got) {
        const number = STATE.currentPbh?.number;
        if (!number || !(got > 0)) return;
        const lockKey = `${number}::${productCode}`;
        if (_manualPickInFlight.has(lockKey)) return;
        _manualPickInFlight.add(lockKey);
        const body = { productCode, pickedQty: got - 1 };
        if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(body);
        try {
            const res = await api('POST', `/${encodeURIComponent(number)}/manual-pick`, body);
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(number);
            feedback(
                `−1 ${productCode} (${res.pbh?.totals?.picked ?? ''}/${res.pbh?.totals?.quantity ?? ''})`
            );
            RC.loadList();
        } catch (err) {
            notify(err.message, 'error');
            RC.renderDetail();
        } finally {
            _manualPickInFlight.delete(lockKey);
        }
    }

    async function resetPick() {
        if (!STATE.currentPbh) return;
        if (!window.Popup) return notify('Đang tải thành phần xác nhận, thử lại', 'error');
        if (!(await Popup.danger('Reset toàn bộ pick về 0?', { okText: 'Reset' }))) return;
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/reset-pick`
            );
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            notify('Đã reset pick', 'info');
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function packOrder() {
        if (!STATE.currentPbh) return;
        try {
            const res = await api('POST', `/${encodeURIComponent(STATE.currentPbh.number)}/pack`);
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            notify('Đã đóng gói ✓', 'success');
            // Refresh list để PBH chuyển tab
            RC.loadList();
        } catch (e) {
            if (e.message && e.message.includes('Chưa đủ hàng')) {
                notify('Không thể đóng gói: chưa đủ hàng', 'error');
            } else {
                notify(e.message, 'error');
            }
        }
    }

    async function cancelPack() {
        if (!STATE.currentPbh) return;
        if (!window.Popup) return notify('Đang tải thành phần xác nhận, thử lại', 'error');
        if (
            !(await Popup.danger(
                `Hủy đóng gói PBH ${STATE.currentPbh.number}? (đưa về trạng thái pick)`,
                { okText: 'Hủy đóng gói' }
            ))
        )
            return;
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/cancel-pack`
            );
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            notify('Đã hủy đóng gói', 'info');
            RC.loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function shipOrder() {
        if (!STATE.currentPbh) return;
        try {
            const res = await api('POST', `/${encodeURIComponent(STATE.currentPbh.number)}/ship`);
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            notify('Đã giao shipper ✓', 'success');
            RC.loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function deliverOrder() {
        if (!STATE.currentPbh) return;
        if (!window.Popup) return notify('Đang tải thành phần xác nhận, thử lại', 'error');
        if (!(await Popup.confirm('Xác nhận đã giao thành công cho khách?'))) return;
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/deliver`
            );
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            notify('Đã giao thành công ✓', 'success');
            RC.loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    async function returnFailedOrder() {
        if (!STATE.currentPbh) return;
        if (!window.Popup) return notify('Đang tải thành phần xác nhận, thử lại', 'error');
        const reason = await Popup.prompt('Lý do giao thất bại / trả về kho (optional):', {
            defaultValue: 'Khách từ chối nhận',
        });
        if (reason === null) return; // user cancelled
        if (
            !(await Popup.danger(
                `Đánh dấu PBH ${STATE.currentPbh.number} GIAO THẤT BẠI?\n\n` +
                    `→ Trả tồn về kho web2_products\n` +
                    `→ Hủy PBH (state='cancel')\n\n` +
                    `Hành động idempotent — chỉ trả tồn 1 lần.`,
                { okText: 'Giao thất bại' }
            ))
        ) {
            return;
        }
        try {
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/return-failed`,
                { reason: reason || null }
            );
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            const restored = res.restock?.restored || 0;
            notify(
                `✓ Đã trả về kho ${restored} dòng SP. PBH ${STATE.currentPbh.number} đã hủy.`,
                'success'
            );
            RC.loadList();
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    // ---------- scanner ----------
    // Quét barcode bill → switch PBH đó. Vẫn nhận HD-... cũ cho data legacy (PBH_NUMBER_RE).
    // Chống race quét đôi: gun nhanh / giữ phím → 2 POST /scan trước khi cái đầu resolve.
    // Server atomic (FOR UPDATE, cap maxQty) nên DB an toàn, nhưng client áp response
    // sai thứ tự sẽ render đè + báo "đủ hàng" nhầm. Dùng seq token: chỉ áp response mới nhất.
    let _scanSeq = 0;
    async function onScannerSubmit(value) {
        value = (value || '').trim();
        if (!value) return;

        // Quét barcode bill → switch PBH. selectPbh không throw mà trả boolean → chỉ báo
        // "Mở PBH" khi load thành công (tránh báo nhầm khi GET lỗi → selectPbh đã notify).
        if (PBH_NUMBER_RE.test(value)) {
            const ok = await selectPbh(value);
            if (ok) feedback(`📦 Mở PBH ${value}`);
            return;
        }

        // Mọi giá trị khác = product code → +1 picked_qty
        if (!STATE.selectedNumber) {
            feedback('Quét barcode trên bill trước, hoặc chọn 1 PBH', true);
            return;
        }
        const seq = ++_scanSeq;
        const targetNumber = STATE.selectedNumber;
        try {
            const scanBody = { productCode: value };
            if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(scanBody);
            const res = await api('POST', `/${encodeURIComponent(targetNumber)}/scan`, scanBody);
            // Bỏ kết quả cũ (response về sau lần quét mới hơn) hoặc đã switch PBH khác →
            // không đè STATE.currentPbh bằng dữ liệu lỗi thời.
            if (seq !== _scanSeq || STATE.selectedNumber !== targetNumber) return;
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(targetNumber);
            const t = res.pbh?.totals || {};
            if (t.isComplete) {
                // Đủ hết SP → server tự set 'packed' (đã đối soát + đóng gói luôn,
                // không cần bấm nút Đóng gói).
                feedback(
                    `✓✓ ĐỦ HÀNG — ĐÃ ĐỐI SOÁT XONG ${targetNumber} (tự đóng gói). Quét bill kế tiếp →`,
                    false,
                    true
                );
                RC.loadList();
            } else {
                feedback(`✓ ${value} (${t.picked}/${t.quantity})`);
            }
        } catch (e) {
            feedback('✗ ' + e.message, true);
        }
    }

    // ---------- audit modal (lịch sử toàn bộ — đối chiếu camera) ----------
    // 2026-06-06: user cần filter chi tiết (chủ yếu tích tay theo thời gian) để soi camera.
    const AUDIT = { action: 'manual-pick', from: null, to: null, search: '' };
    let _auditSearchTimer = null;
    let _bodyLockY = 0;
    let _auditPrevFocus = null; // #34: element giữ focus trước khi mở modal → trả lại khi đóng

    function pad2(n) {
        return String(n).padStart(2, '0');
    }
    // Hiển thị GMT+7 (Asia/Ho_Chi_Minh) theo quy ước Web 2.0, không phụ thuộc TZ trình duyệt.
    const _tsFmt = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    function fmtTsFull(ts) {
        const p = {};
        for (const part of _tsFmt.formatToParts(new Date(Number(ts)))) p[part.type] = part.value;
        return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
    }
    // ms → 'YYYY-MM-DDTHH:MM' theo GMT+7 (Asia/Ho_Chi_Minh) — KHÔNG theo TZ trình
    // duyệt (audit r2): trước dùng getHours()/getDate() local → filter lệch nếu máy
    // không +7. Dùng _tsFmt (đã GMT+7) build giá trị input datetime-local.
    function tsToInput(ts) {
        if (!ts) return '';
        const p = {};
        for (const part of _tsFmt.formatToParts(new Date(Number(ts)))) p[part.type] = part.value;
        return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
    }
    function inputToTs(val) {
        if (!val) return null;
        // val = 'YYYY-MM-DDTHH:MM' hiểu theo GMT+7 (offset cố định +7, VN không DST).
        const iso = val.length === 16 ? `${val}:00+07:00` : `${val}+07:00`;
        const t = new Date(iso).getTime();
        return Number.isFinite(t) ? t : null;
    }
    function lockBody() {
        _bodyLockY = window.scrollY || 0;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${_bodyLockY}px`;
        document.body.style.width = '100%';
    }
    function unlockBody() {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, _bodyLockY);
    }

    function openAuditModal() {
        const overlay = document.getElementById('rcAuditOverlay');
        if (!overlay) return;
        _auditPrevFocus = document.activeElement; // #34: nhớ focus để trả lại khi đóng
        // Mặc định: tích tay + hôm nay (00:00 → giờ hiện tại).
        if (AUDIT.from == null && AUDIT.to == null) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            AUDIT.from = start.getTime();
            AUDIT.to = now.getTime();
        }
        syncAuditInputs();
        overlay.hidden = false;
        lockBody();
        if (window.lucide) window.lucide.createIcons();
        // #34: đưa focus vào dialog (nút Đóng) — SR/bàn phím vào đúng modal.
        document.getElementById('rcAuditClose')?.focus();
        fetchAudit();
    }
    function closeAuditModal() {
        const overlay = document.getElementById('rcAuditOverlay');
        if (!overlay) return;
        overlay.hidden = true;
        unlockBody();
        // #34: trả focus về nơi đã mở modal (fallback: ô quét).
        if (_auditPrevFocus && _auditPrevFocus.focus) {
            try {
                _auditPrevFocus.focus();
            } catch {
                focusScanner();
            }
        } else {
            focusScanner();
        }
        _auditPrevFocus = null;
    }
    function syncAuditInputs() {
        const fEl = document.getElementById('rcAuditFrom');
        const tEl = document.getElementById('rcAuditTo');
        const sEl = document.getElementById('rcAuditSearch');
        if (fEl) fEl.value = tsToInput(AUDIT.from);
        if (tEl) tEl.value = tsToInput(AUDIT.to);
        if (sEl) sEl.value = AUDIT.search;
        document.querySelectorAll('#rcAuditChips .rc-achip').forEach((c) => {
            c.classList.toggle('is-active', (c.dataset.action || '') === AUDIT.action);
        });
    }
    async function fetchAudit() {
        const box = document.getElementById('rcAuditResults');
        const countEl = document.getElementById('rcAuditCount');
        if (box) box.innerHTML = '<div class="rc-audit-loading">Đang tải…</div>';
        try {
            const q = new URLSearchParams();
            if (AUDIT.action) q.set('action', AUDIT.action);
            if (AUDIT.from) q.set('from', String(AUDIT.from));
            if (AUDIT.to) q.set('to', String(AUDIT.to));
            if (AUDIT.search) q.set('search', AUDIT.search);
            q.set('limit', '500');
            const res = await api('GET', `/logs?${q.toString()}`);
            renderAuditResults(res.logs || []);
            if (countEl) countEl.textContent = `${(res.logs || []).length} kết quả`;
        } catch (e) {
            if (box)
                box.innerHTML = `<div class="rc-audit-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
            if (countEl) countEl.textContent = '—';
        }
    }
    function renderAuditResults(logs) {
        const box = document.getElementById('rcAuditResults');
        if (!box) return;
        if (!logs.length) {
            box.innerHTML = '<div class="rc-audit-empty">Không có lịch sử khớp bộ lọc</div>';
            return;
        }
        const rows = logs
            .map((l) => {
                const p = l.payload || {};
                const label = RC_HISTORY_LABELS[l.action] || l.action;
                const isManual =
                    l.action === 'manual-pick' && (p.pickedQty == null || p.pickedQty > 0);
                const cam = isManual ? '<span class="rc-audit-cam">📹 camera</span>' : '';
                const trans =
                    l.stateBefore && l.stateAfter && l.stateBefore !== l.stateAfter
                        ? `${STATE_LABELS[l.stateBefore] || l.stateBefore} → ${STATE_LABELS[l.stateAfter] || l.stateAfter}`
                        : '';
                return `
                <tr class="rc-audit-rowitem cv-auto ${isManual ? 'is-manual' : ''}">
                    <td class="rc-audit-ts">${fmtTsFull(l.createdAt)}</td>
                    <td class="rc-audit-pbh"><button type="button" class="rc-audit-open" data-number="${escapeHtml(l.pbhNumber)}">${escapeHtml(l.pbhNumber)}</button></td>
                    <td class="rc-audit-act">${escapeHtml(label)} ${cam}</td>
                    <td class="rc-audit-sp">${escapeHtml(p.productCode || '')}${p.pickedQty != null ? ` · SL ${escapeHtml(String(p.pickedQty))}` : ''}<div class="rc-audit-trans">${escapeHtml(trans)}</div></td>
                    <td class="rc-audit-user">${escapeHtml(l.userName || l.userId || '(ẩn danh)')}</td>
                </tr>`;
            })
            .join('');
        box.innerHTML = `
            <table class="rc-audit-table">
                <thead><tr>
                    <th>Thời gian</th><th>PBH</th><th>Thao tác</th><th>Sản phẩm</th><th>Người</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        // PBH clickable → mở chi tiết + đóng modal
        box.querySelectorAll('.rc-audit-open').forEach((btn) => {
            btn.addEventListener('click', () => {
                const n = btn.dataset.number;
                closeAuditModal();
                selectPbh(n); // load chi tiết bất kể tab đang lọc gì
            });
        });
    }
    function bindAuditUi() {
        const btn = document.getElementById('rcAuditBtn');
        if (btn) btn.addEventListener('click', openAuditModal);
        const close = document.getElementById('rcAuditClose');
        if (close) close.addEventListener('click', closeAuditModal);
        const overlay = document.getElementById('rcAuditOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeAuditModal(); // click nền ngoài → đóng
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.hidden) closeAuditModal();
        });
        // #25: focus trap — Tab/Shift+Tab cuộn trong modal, không thoát ra nền sau.
        const modal = overlay?.querySelector('.rc-audit-modal');
        if (modal) {
            modal.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                const f = modal.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const list = Array.from(f).filter((el) => !el.disabled && el.offsetParent !== null);
                if (!list.length) return;
                const first = list[0];
                const last = list[list.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            });
        }
        const chips = document.getElementById('rcAuditChips');
        if (chips) {
            chips.addEventListener('click', (e) => {
                const c = e.target.closest('.rc-achip');
                if (!c) return;
                AUDIT.action = c.dataset.action || '';
                syncAuditInputs();
                fetchAudit();
            });
        }
        document.querySelectorAll('.rc-audit-quick').forEach((q) => {
            q.addEventListener('click', () => {
                const now = new Date();
                let from;
                if (q.dataset.range === '2h') from = now.getTime() - 2 * 3600 * 1000;
                else if (q.dataset.range === '7d') from = now.getTime() - 7 * 86400 * 1000;
                else {
                    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    from = s.getTime();
                }
                AUDIT.from = from;
                AUDIT.to = now.getTime();
                syncAuditInputs();
                fetchAudit();
            });
        });
        const apply = document.getElementById('rcAuditApply');
        if (apply) {
            apply.addEventListener('click', () => {
                AUDIT.from = inputToTs(document.getElementById('rcAuditFrom')?.value);
                AUDIT.to = inputToTs(document.getElementById('rcAuditTo')?.value);
                AUDIT.search = document.getElementById('rcAuditSearch')?.value.trim() || '';
                fetchAudit();
            });
        }
        const search = document.getElementById('rcAuditSearch');
        if (search) {
            search.addEventListener('input', (e) => {
                AUDIT.search = e.target.value.trim();
                clearTimeout(_auditSearchTimer);
                _auditSearchTimer = setTimeout(fetchAudit, 300);
            });
        }
    }

    RC.selectPbh = selectPbh;
    RC.toggleManualPick = toggleManualPick;
    RC.decrementPick = decrementPick;
    RC.resetPick = resetPick;
    RC.packOrder = packOrder;
    RC.cancelPack = cancelPack;
    RC.shipOrder = shipOrder;
    RC.deliverOrder = deliverOrder;
    RC.returnFailedOrder = returnFailedOrder;
    RC.onScannerSubmit = onScannerSubmit;
    RC.bindAuditUi = bindAuditUi;
})();
