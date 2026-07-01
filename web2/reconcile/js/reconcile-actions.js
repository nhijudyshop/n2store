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

    // Chuẩn hoá mã SP phía client (khớp normCode server: trim + upper).
    function normC(s) {
        return String(s == null ? '' : s)
            .trim()
            .toUpperCase();
    }

    // Tem per-unit mã hoá QR = URL /web2/unit-scan/?u=<id> (id đơn vị, KHÔNG phải mã SP).
    // Scanner đọc ra URL → cần resolve id → mã SP để khớp dòng PBH ("quét ra mã, không ra link").
    // Giữ nguyên tính năng QR-trace (điện thoại quét vẫn mở trang trace); chỉ dạy reconcile
    // hiểu scheme URL này. 1 nguồn scheme = Web2ProductUnits (web2-product-units.js).
    function parseUnitScan(value) {
        if (!/[?&](u|code)=/.test(value) && !/unit-scan/i.test(value)) return null;
        let url;
        try {
            url = new URL(value);
        } catch (_) {
            try {
                url = new URL(value, 'http://x/');
            } catch (_2) {
                return null;
            }
        }
        const u = url.searchParams.get('u');
        const code = url.searchParams.get('code');
        if (u && /^\d+$/.test(u)) return { id: Number(u) };
        if (code) return { code };
        return null;
    }
    // URL tem → mã SP (resolve qua API). null nếu không phải tem unit / resolve lỗi.
    async function scanToProductCode(value) {
        const q = parseUnitScan(value);
        if (!q || !window.Web2ProductUnits || !window.Web2ProductUnits.resolve) return null;
        try {
            const r = await window.Web2ProductUnits.resolve(q);
            return (r && (r.product?.code || r.unit?.productCode)) || null;
        } catch (_) {
            return null;
        }
    }
    const LOCKED_STATES = ['packed', 'shipped', 'delivered', 'returned'];

    // ---------- select PBH ----------
    // 2026-07-01 session model: mở PBH CHƯA đóng gói = phiên đối soát MỚI (pick trong RAM
    // từ 0, KHÔNG đọc partial server vì server không giữ partial). PBH đã đóng gói/giao =
    // read-only + tải ảnh bằng chứng cho admin xem.
    async function selectPbh(number) {
        STATE.selectedNumber = number;
        STATE.historyHtml = null; // reset để không nháy lịch sử PBH cũ
        STATE.historyOpen = false; // mở PBH mới → ẩn lịch sử, ưu tiên danh sách SP để quét
        STATE.evidence = []; // phiên mới → xoá ảnh tích-tay buffered của phiên cũ
        STATE.finalizeError = false;
        RC.renderList();
        const target = document.getElementById('rcScannerTarget');
        if (target) {
            target.textContent = `PBH: ${number}`;
            target.classList.add('is-active');
        }
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}`);
            // Chống race: user bấm PBH khác trong lúc fetch → bỏ kết quả cũ.
            if (STATE.selectedNumber !== number) return false;
            const pbh = res.pbh;
            const fState = pbh.fulfillmentState || 'pending';
            const locked = pbh.state === 'cancel' || LOCKED_STATES.includes(fState);
            if (locked) {
                STATE.sessionActive = false;
                STATE.currentPbh = pbh;
                RC.renderDetail();
                RC.loadSnapshots(number); // ảnh bằng chứng tích-tay → admin soi lại
            } else {
                // Phiên MỚI: pick client-side từ 0.
                STATE.sessionActive = true;
                (pbh.lines || []).forEach((l) => {
                    l.picked_qty = 0;
                });
                RC.recomputeTotals(pbh);
                STATE.currentPbh = pbh;
                RC.renderDetail();
                // Warm camera trong user gesture (click/scan) — im lặng nếu chưa cấp quyền.
                if (window.Web2EvidenceCamera) window.Web2EvidenceCamera.warm().catch(() => {});
            }
            const panel = document.getElementById('rcDetailPanel');
            if (panel) panel.scrollTop = 0;
            focusScanner();
            return true;
        } catch (e) {
            notify('Lỗi tải PBH: ' + e.message, 'error');
            return false;
        }
    }

    // ---------- finalize: CHỐT phiên khi đủ 100% (lưu picks + ảnh + đóng gói) ----------
    async function finalize() {
        const pbh = STATE.currentPbh;
        if (!pbh || STATE.finalizing) return;
        STATE.finalizing = true;
        STATE.finalizeError = false;
        RC.renderDetail(); // hiện trạng thái "đang lưu…"
        try {
            const pickedLines = (pbh.lines || []).map((l) => ({
                productCode: l.productCode,
                pickedQty: Number(l.picked_qty) || 0,
            }));
            // Ảnh tích-tay → base64 (chỉ cái có blob; thiếu ảnh vẫn chốt được).
            const evidence = [];
            for (const e of STATE.evidence) {
                if (!e.blob || !window.Web2EvidenceCamera) continue;
                let imageBase64 = null;
                try {
                    imageBase64 = await window.Web2EvidenceCamera.blobToBase64(e.blob);
                } catch {
                    /* bỏ ảnh lỗi */
                }
                if (imageBase64)
                    evidence.push({
                        productCode: e.productCode,
                        capturedAt: e.capturedAt,
                        source: e.source,
                        imageBase64,
                    });
            }
            const body = { pickedLines, evidence };
            if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(body);
            const res = await api('POST', `/${encodeURIComponent(pbh.number)}/finalize`, body);
            STATE.currentPbh = res.pbh;
            STATE.sessionActive = false;
            STATE.evidence = [];
            RC.renderDetail();
            feedback(
                `✓✓ ĐÃ CHỐT ${pbh.number} — đóng gói + lưu ${(res.snapshotIds || []).length} ảnh. Quét bill kế →`,
                false,
                true
            );
            RC.loadList();
            if (RC.loadCounts) RC.loadCounts();
        } catch (e) {
            STATE.finalizeError = true;
            notify('Lưu đối soát thất bại: ' + e.message + ' — bấm "Thử lưu lại"', 'error');
            RC.renderDetail();
        } finally {
            STATE.finalizing = false;
        }
    }

    // ---------- actions ----------
    // 2026-06-06: tích tay 1 line — checked = pick đủ (qty), unchecked = 0.
    // Lưu NGAY mỗi lần tích (không cần quét đủ cả đơn). Dùng cho SP barcode không quét được.
    // User 06/06: BẮT BUỘC confirm + ghi lịch sử "đối chiếu camera" — vì tích tay KHÔNG
    // quét barcode → cần xác nhận + lưu vết để soi lại camera khi đối chứng.
    // TÍCH TAY (client-side) — không quét barcode → CHỤP ẢNH camera lưu bằng chứng.
    // Ảnh giữ TRONG RAM (STATE.evidence); chỉ POST lên server lúc finalize (đủ 100%).
    const _manualPickInFlight = new Set(); // chống double-tick trong lúc chờ chụp ảnh
    async function toggleManualPick(productCode, checked, need) {
        const pbh = STATE.currentPbh;
        if (!STATE.sessionActive || !pbh) return;
        const line = (pbh.lines || []).find((l) => normC(l.productCode) === normC(productCode));
        if (!line) return;
        if (!window.Popup) {
            notify('Đang tải thành phần xác nhận, thử lại sau giây lát', 'error');
            RC.renderDetail();
            return;
        }
        const lockKey = normC(productCode);
        if (_manualPickInFlight.has(lockKey)) {
            RC.renderDetail();
            return;
        }
        _manualPickInFlight.add(lockKey);
        try {
            if (checked) {
                const ok = await Popup.confirm(
                    `✋ TÍCH TAY (không quét barcode) cho "${productCode}"?\n\n` +
                        `→ Đánh dấu đã pick đủ ${need} mà không quét mã.\n` +
                        `→ Hệ thống sẽ CHỤP ẢNH camera lưu bằng chứng (admin soi lại).\n\n` +
                        `Xác nhận?`
                );
                if (!ok) {
                    RC.renderDetail();
                    return;
                }
                // Chụp ảnh bằng chứng ngay lúc tích tay.
                let cap = null;
                try {
                    if (window.Web2EvidenceCamera) cap = await window.Web2EvidenceCamera.capture();
                } catch (e) {
                    notify(
                        'Không chụp được ảnh camera (' +
                            e.message +
                            ') — vẫn tích tay nhưng THIẾU ảnh',
                        'warning'
                    );
                }
                line.picked_qty = need;
                // Gỡ evidence cũ cùng mã (nếu tick lại) rồi push mới.
                STATE.evidence = STATE.evidence.filter((e) => normC(e.productCode) !== lockKey);
                STATE.evidence.push({
                    productCode: line.productCode,
                    capturedAt: cap?.capturedAt || Date.now(),
                    source: cap?.source || null,
                    blob: cap?.blob || null,
                });
                RC.recomputeTotals(pbh);
                RC.renderDetail();
                feedback(
                    cap
                        ? `✋📷 Tích tay ${productCode} — đã chụp ảnh`
                        : `✋ Tích tay ${productCode} (thiếu ảnh)`
                );
                if (pbh.totals.isComplete) finalize();
            } else {
                const ok = await Popup.confirm(`Bỏ tích tay "${productCode}" (đưa về 0)?`);
                if (!ok) {
                    RC.renderDetail();
                    return;
                }
                line.picked_qty = 0;
                STATE.evidence = STATE.evidence.filter((e) => normC(e.productCode) !== lockKey);
                RC.recomputeTotals(pbh);
                RC.renderDetail();
            }
        } finally {
            _manualPickInFlight.delete(lockKey);
        }
    }

    // #16: bớt 1 đơn vị đã pick (quét dư/nhầm) — client-side, KHÔNG Reset cả đơn.
    function decrementPick(productCode) {
        const pbh = STATE.currentPbh;
        if (!STATE.sessionActive || !pbh) return;
        const line = (pbh.lines || []).find((l) => normC(l.productCode) === normC(productCode));
        if (!line) return;
        const got = Number(line.picked_qty) || 0;
        if (got <= 0) return;
        line.picked_qty = got - 1;
        // Tụt dưới đủ → gỡ ảnh tích-tay cùng mã (không còn "đủ bằng tay").
        if (line.picked_qty < (Number(line.quantity) || 0)) {
            STATE.evidence = STATE.evidence.filter(
                (e) => normC(e.productCode) !== normC(productCode)
            );
        }
        RC.recomputeTotals(pbh);
        RC.renderDetail();
        feedback(`−1 ${productCode} (${pbh.totals.picked}/${pbh.totals.quantity})`);
    }

    // Xoá phiên đối soát hiện tại (client-side) — về 0 + bỏ ảnh chưa lưu.
    async function resetPick() {
        const pbh = STATE.currentPbh;
        if (!STATE.sessionActive || !pbh) return;
        if (!window.Popup) return notify('Đang tải thành phần xác nhận, thử lại', 'error');
        if (!(await Popup.danger('Xoá hết đối soát của phiên này (về 0)?', { okText: 'Xoá' })))
            return;
        (pbh.lines || []).forEach((l) => {
            l.picked_qty = 0;
        });
        STATE.evidence = [];
        STATE.finalizeError = false;
        RC.recomputeTotals(pbh);
        RC.renderDetail();
        notify('Đã xoá phiên đối soát', 'info');
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
                `Hủy đóng gói PBH ${STATE.currentPbh.number}? (đưa về trạng thái pick)\n\n` +
                    `→ Hệ thống sẽ CHỤP ẢNH camera lưu bằng chứng (như tích tay).`,
                { okText: 'Hủy đóng gói' }
            ))
        )
            return;
        // Chụp ảnh bằng chứng ngay lúc hủy đóng gói (giống tích tay) → lưu vào lịch sử.
        let cap = null;
        let imageBase64 = null;
        try {
            if (window.Web2EvidenceCamera) {
                cap = await window.Web2EvidenceCamera.capture();
                if (cap?.blob) imageBase64 = await window.Web2EvidenceCamera.blobToBase64(cap.blob);
            }
        } catch (e) {
            notify(
                'Không chụp được ảnh camera (' + e.message + ') — vẫn hủy nhưng THIẾU ảnh',
                'warning'
            );
        }
        try {
            const body = {};
            if (imageBase64) {
                body.evidence = [
                    {
                        capturedAt: cap?.capturedAt || Date.now(),
                        source: cap?.source || null,
                        imageBase64,
                    },
                ];
            }
            if (window.Web2UserInfo?.attachToBody) window.Web2UserInfo.attachToBody(body);
            const res = await api(
                'POST',
                `/${encodeURIComponent(STATE.currentPbh.number)}/cancel-pack`,
                body
            );
            STATE.currentPbh = res.pbh;
            RC.renderDetail();
            RC.loadHistory(STATE.currentPbh?.number);
            notify(
                imageBase64 ? '📷 Đã hủy đóng gói — đã chụp ảnh' : 'Đã hủy đóng gói (thiếu ảnh)',
                'info'
            );
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
    // Quét barcode bill → switch PBH (mở phiên mới). Còn lại = mã SP → +1 (client-side).
    // Không đụng server tới khi finalize (đủ 100%). Client-side đồng bộ nên không cần seq guard.
    async function onScannerSubmit(value) {
        value = (value || '').trim();
        if (!value) return;

        // Quét barcode bill → switch PBH. selectPbh trả boolean → chỉ báo "Mở PBH" khi OK.
        if (PBH_NUMBER_RE.test(value)) {
            const ok = await selectPbh(value);
            if (ok) feedback(`📦 Mở PBH ${value}`);
            return;
        }

        const pbh = STATE.currentPbh;
        if (!STATE.sessionActive || !pbh) {
            feedback('Quét barcode trên bill trước, hoặc chọn 1 PBH', true);
            return;
        }
        // Tem per-unit: QR = URL /unit-scan/?u=<id> → resolve ra mã SP. Quét mã SP thường → giữ nguyên.
        let codeToMatch = value;
        if (parseUnitScan(value)) {
            const resolved = await scanToProductCode(value);
            if (!resolved) {
                feedback('✗ Không đọc được mã SP từ tem đã quét', true);
                return;
            }
            codeToMatch = resolved;
        }
        // Quét mã SP → +1 picked_qty (trong RAM).
        const line = (pbh.lines || []).find((l) => normC(l.productCode) === normC(codeToMatch));
        if (!line) {
            feedback(`✗ Mã "${codeToMatch}" không có trong PBH này`, true);
            return;
        }
        const need = Number(line.quantity) || 0;
        const got = Number(line.picked_qty) || 0;
        if (got >= need) {
            feedback(`SP ${line.productCode} đã đủ (${got}/${need})`, true);
            return;
        }
        line.picked_qty = got + 1;
        RC.recomputeTotals(pbh);
        RC.renderDetail();
        if (pbh.totals.isComplete) {
            // Đủ 100% → tự CHỐT (lưu picks + ảnh + đóng gói). #4: "đủ thì mới trigger lưu".
            finalize();
        } else {
            feedback(`✓ ${line.productCode} (${pbh.totals.picked}/${pbh.totals.quantity})`);
        }
    }

    // ---------- audit modal (lịch sử toàn bộ — đối chiếu camera) ----------
    // 2026-06-06: user cần filter chi tiết (chủ yếu tích tay theo thời gian) để soi camera.
    // Mặc định 'Tất cả' — session model gộp log per-tick vào 1 log 'finalize' (kèm số ảnh),
    // không còn per-tick 'manual-pick'. Ảnh xem trực tiếp khi mở PBH đã đóng gói.
    const AUDIT = { action: '', from: null, to: null, search: '' };
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
                const nPhotos =
                    l.action === 'finalize' || l.action === 'cancel-pack'
                        ? Number(p.manualPhotos) || 0
                        : 0;
                const cam = isManual
                    ? '<span class="rc-audit-cam">📹 camera</span>'
                    : nPhotos > 0
                      ? `<span class="rc-audit-cam">📷 ${nPhotos} ảnh</span>`
                      : '';
                const trans =
                    l.stateBefore && l.stateAfter && l.stateBefore !== l.stateAfter
                        ? `${STATE_LABELS[l.stateBefore] || l.stateBefore} → ${STATE_LABELS[l.stateAfter] || l.stateAfter}`
                        : '';
                return `
                <tr class="rc-audit-rowitem cv-auto ${isManual || nPhotos > 0 ? 'is-manual' : ''}">
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
    RC.finalize = finalize;
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
