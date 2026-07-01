// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Web 2.0 — Đối soát đóng gói PBH (Reconcile / Fulfillment).
// Stock đã trừ lúc tạo PBH → trang này CHỈ verify pick + state machine + audit log.
//
// reconcile-app.js — ORCHESTRATOR: bind UI + init + bootstrap.
// State/helpers/api → reconcile-state.js; data/SSE → reconcile-api.js;
// render → reconcile-render.js; actions/scanner/audit → reconcile-actions.js.
// MOVE-only split; logic giữ nguyên byte-for-byte. App nạp SAU cùng.

(function () {
    'use strict';

    const RC = window.RC || {};
    const STATE = RC.STATE;
    const RC_HISTORY_LABELS = RC.RC_HISTORY_LABELS;
    const onScannerSubmit = RC.onScannerSubmit;
    const focusScanner = RC.focusScanner;
    const loadList = RC.loadList;
    const notify = RC.notify;

    // #1: có dialog/overlay nào đang mở? (Web2Popup confirm/danger/prompt = #web2-popup-root
    // .w2p-modal · camera = .w2bc-root · OCR = .w2ocr-root · modal lịch sử = #rcAuditOverlay).
    // Khi mở → KHÔNG để router phím toàn cục nuốt ký tự/Enter vào ô quét ẩn.
    function _overlayOpen() {
        if (document.querySelector('#web2-popup-root .w2p-modal, .w2bc-root, .w2ocr-root'))
            return true;
        const au = document.getElementById('rcAuditOverlay');
        return !!(au && !au.hidden);
    }

    // ---------- init ----------
    function bindUi() {
        const refresh = document.getElementById('rcRefreshBtn');
        if (refresh) refresh.addEventListener('click', loadList);

        const search = document.getElementById('rcSearch');
        let searchTimer = null;
        if (search) {
            search.addEventListener('input', (e) => {
                STATE.search = e.target.value;
                clearTimeout(searchTimer);
                searchTimer = setTimeout(loadList, 250);
            });
        }

        const tabs = document.getElementById('rcStateTabs');
        if (tabs) {
            tabs.addEventListener('click', (e) => {
                const t = e.target.closest('.rc-tab');
                if (!t) return;
                tabs.querySelectorAll('.rc-tab').forEach((x) => {
                    x.classList.remove('is-active');
                    x.setAttribute('aria-selected', 'false'); // #51
                });
                t.classList.add('is-active');
                t.setAttribute('aria-selected', 'true');
                STATE.filterState = t.dataset.state;
                loadList();
            });
        }

        const scanner = document.getElementById('rcScannerInput');
        if (scanner) {
            scanner.addEventListener('keydown', (e) => {
                if (e.isComposing || e.keyCode === 229) return; // IME tiếng Việt đang soạn
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = scanner.value;
                    scanner.value = '';
                    onScannerSubmit(val);
                }
            });
            // Auto refocus after blur (1s grace for clicking buttons)
            scanner.addEventListener('blur', () => {
                setTimeout(() => {
                    if (
                        document.activeElement?.tagName !== 'INPUT' &&
                        document.activeElement?.tagName !== 'BUTTON'
                    ) {
                        focusScanner();
                    }
                }, 1000);
            });
        }

        // 2026-06-06: click bất kỳ đâu trên hộp quét → focus input (không cần click trúng ô).
        const scannerBox = document.querySelector('.rc-scanner-box');
        if (scannerBox) {
            scannerBox.addEventListener('click', focusScanner);
        }

        // 2026-06-18: quét bằng CAMERA điện thoại (thay máy quét gun) — Web2BarcodeScanner
        // on-device → mỗi mã đọc được gọi onScannerSubmit y như gun (bill NJ-… mở PBH,
        // còn lại = mã SP → +1). Camera mở overlay riêng nên chặn focusScanner của box.
        const camBtn = document.getElementById('rcCameraBtn');
        if (camBtn) {
            camBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // không trigger focusScanner của scannerBox
                if (!window.Web2BarcodeScanner) {
                    notify('Chưa tải được bộ quét camera (web2-barcode-scanner.js).', 'error');
                    return;
                }
                window.Web2BarcodeScanner.open({
                    title: 'Quét đối soát',
                    hint: 'Quét barcode bill (NJ-…) rồi từng mã SP',
                    continuous: true,
                    onScan: (code) => onScannerSubmit(code),
                });
            });
        }

        // 2026-06-18: ĐỌC MÃ TRÊN NHÃN bằng OCR (Web2LabelOcr) — khi không có barcode.
        // OCR chỉ là gợi ý (chữ in OK, chữ tay kém) → KHÔNG auto-submit: điền vào ô
        // quét + focus để user kiểm tra rồi Enter (an toàn vì OCR dễ nhầm O↔0…).
        const ocrBtn = document.getElementById('rcOcrBtn');
        if (ocrBtn) {
            ocrBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.Web2LabelOcr) {
                    notify('Chưa tải được bộ đọc nhãn (web2-label-ocr.js).', 'error');
                    return;
                }
                window.Web2LabelOcr.open({
                    title: 'Đọc mã trên nhãn',
                    hint: 'Ngắm dòng MÃ trên nhãn vào khung rồi bấm Chụp',
                    onResult: (text) => {
                        const inp = document.getElementById('rcScannerInput');
                        if (inp) {
                            inp.value = (text || '').trim();
                            focusScanner();
                        }
                        notify('Đã điền mã — kiểm tra rồi nhấn Enter để quét', 'info');
                    },
                });
            });
        }

        // 2026-06-06: router phím toàn cục — máy quét = bàn phím; nếu đang không gõ vào
        // ô nhập nào khác (search/checkbox/button) thì TỰ ĐƯA ký tự vào ô quét.
        // → quét nhận ngay, KHÔNG cần bấm chuột vào ô trước. Inject ký tự để không
        // mất ký tự đầu khi focus đang ở chỗ khác (focus giữa keydown hay rớt char đầu).
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (!scanner) return;
                // #1/#19: BẮT BUỘC bỏ qua khi có dialog/overlay đang mở — tránh nhồi ký tự
                // gun vào ô quét ẩn + cướp Enter khỏi nút xác nhận (surface tiền/tồn nguy hiểm).
                if (_overlayOpen()) return;
                const ae = document.activeElement;
                if (ae === scanner) return; // đã focus đúng ô → handler riêng của ô lo
                const tag = ae?.tagName;
                const typingElsewhere =
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    tag === 'BUTTON' || // #19: focus trên nút (tab/action) → đừng cướp Enter/ký tự
                    ae?.isContentEditable;
                if (typingElsewhere) return; // user đang gõ/bấm chỗ khác — đừng cướp focus
                if (e.key === 'Enter') {
                    e.preventDefault();
                    scanner.focus();
                    const v = scanner.value;
                    scanner.value = '';
                    if (v) onScannerSubmit(v);
                } else if (e.key.length === 1) {
                    // ký tự đơn của mã SP/barcode → focus + chèn để không rớt
                    e.preventDefault();
                    scanner.focus();
                    scanner.value += e.key;
                }
            },
            true
        );
    }

    // Bộ lọc theo CHIẾN DỊCH CHA (span 2 page) — dùng chung Web2CampaignPicker. Chọn
    // chiến dịch → lọc PBH thuộc chiến dịch đó (qua source_code → native_orders.parent_campaign_id).
    function mountCampaignPicker() {
        const host = document.getElementById('rcCampaignPicker');
        if (!host || !window.Web2CampaignPicker) return;
        window.Web2CampaignPicker.mount(host, {
            storageKey: 'reconcile',
            onChange(sel) {
                STATE.campaignId = (sel && sel.campaignId) || null;
                loadList();
            },
        });
    }

    async function init() {
        // Bổ sung nhãn VN cho các action đối soát vào timeline dùng chung.
        if (window.Web2HistoryTimeline?.ACTION_LABEL) {
            Object.assign(window.Web2HistoryTimeline.ACTION_LABEL, RC_HISTORY_LABELS);
        }
        bindUi();
        RC.bindAuditUi();
        mountCampaignPicker();
        await loadList();
        RC.setupSse();
        // Dò nguồn camera bằng chứng (KBVision sidecar → fallback webcam). Fire-and-forget.
        if (window.Web2EvidenceCamera) window.Web2EvidenceCamera.init().catch(() => {});
        focusScanner();
        if (window.lucide) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
