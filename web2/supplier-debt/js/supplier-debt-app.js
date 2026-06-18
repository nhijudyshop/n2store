// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — ORCHESTRATOR: wire UI events, init/bootstrap, deep-link
// focus, SSE realtime refresh. REWRITE (2026-06-18 MOVE-only split): logic gốc
// tách ra state/api/render/actions/filters; file này chỉ điều phối + gọi qua
// namespace nội bộ window.__SupplierDebt (SD). KHÔNG expose public global nào
// (trang chạy bằng DOM IDs + addEventListener — onclick/inline = 0, giữ nguyên).
//
// Data sources (ĐỢT E 2026-06-12 — server ledger, audit vòng 3):
//   1. web2_so_order/main — derive purchases per supplier per shipment (Web2SoOrder).
//   2. GET /api/web2-supplier-wallet/state — wallets (ledger payment|return) + suppliers meta.
//
// Mutations (thanh toán / tạo NCC / ghi chú) ghi qua POST server — KHÔNG còn
// client-write Firestore (hết lost-update RMW + nextMoveName MAX+1 race).

(function () {
    'use strict';

    const SD = (window.__SupplierDebt = window.__SupplierDebt || {});
    const STATE = SD.STATE;

    // ---------- wire UI ----------
    function wireUi() {
        document.getElementById('sdSearchBtn').addEventListener('click', async () => {
            SD.readFilters();
            STATE.page = 1;
            await SD.loadAll();
            SD.applyFilterAndRender();
        });
        const sourceWeb2 = document.getElementById('sdSourceWeb2');
        if (sourceWeb2) {
            sourceWeb2.addEventListener('change', async (e) => {
                STATE.filters.sourceWeb2 = e.target.checked;
                await SD.loadAll();
                SD.applyFilterAndRender();
            });
        }
        document.getElementById('sdResetBtn').addEventListener('click', async () => {
            const { from, to } = SD.currentMonthRange();
            document.getElementById('sdDateFrom').value = from;
            document.getElementById('sdDateTo').value = to;
            document.getElementById('sdSearch').value = '';
            document
                .querySelectorAll('input[name="sdDisplay"]')
                .forEach((r) => (r.checked = r.value === 'all'));
            SD.readFilters();
            STATE.page = 1;
            await SD.loadAll();
            SD.applyFilterAndRender();
        });
        document.getElementById('sdExportBtn').addEventListener('click', SD.exportCsv);
        document.getElementById('sdRefreshBtn').addEventListener('click', async () => {
            await SD.loadAll();
            SD.applyFilterAndRender();
            SD.notify('Đã tải lại', 'success');
        });
        document.getElementById('sdSearch').addEventListener('input', (e) => {
            STATE.filters.search = e.target.value;
            STATE.page = 1;
            SD.applyFilterAndRender();
        });
        // Task 4 (2026-06-14): date change → auto-filter + reload (keep Áp dụng button).
        const _onDateChange = async () => {
            SD.readFilters();
            STATE.page = 1;
            await SD.loadAll();
            SD.applyFilterAndRender();
        };
        document.getElementById('sdDateFrom')?.addEventListener('change', _onDateChange);
        document.getElementById('sdDateTo')?.addEventListener('change', _onDateChange);
        document.querySelectorAll('input[name="sdDisplay"]').forEach((r) => {
            r.addEventListener('change', () => {
                STATE.filters.display = r.value;
                STATE.page = 1;
                SD.applyFilterAndRender();
            });
        });
        document.querySelectorAll('#sdTable th.sortable').forEach((th) => {
            th.addEventListener('click', () => {
                const f = th.dataset.sort;
                if (STATE.sortField === f) {
                    STATE.sortDir = STATE.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    STATE.sortField = f;
                    STATE.sortDir = 'desc';
                }
                SD.updateSortIcons();
                SD.applyFilterAndRender();
            });
        });
        document.getElementById('sdPagePrev').addEventListener('click', () => {
            if (STATE.page > 1) {
                STATE.page--;
                SD.renderTable();
                SD.renderPagination();
            }
        });
        document.getElementById('sdPageNext').addEventListener('click', () => {
            const maxPage = Math.max(1, Math.ceil(STATE.rows.length / STATE.pageSize));
            if (STATE.page < maxPage) {
                STATE.page++;
                SD.renderTable();
                SD.renderPagination();
            }
        });
        // Esc → collapse all expanded rows
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && STATE.expanded.size > 0) {
                STATE.expanded.clear();
                SD.renderTable();
            }
        });

        // Create NCC modal
        document.getElementById('sdCreateNccBtn')?.addEventListener('click', () => {
            const m = document.getElementById('sdCreateNccModal');
            document.getElementById('sdNccCode').value = '';
            document.getElementById('sdNccName').value = '';
            m.hidden = false;
            SD._populateNccNameDatalist();
            if (window.lucide?.createIcons) window.lucide.createIcons();
            setTimeout(() => document.getElementById('sdNccCode')?.focus(), 30);
        });
        document.querySelectorAll('[data-sd-modal-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.sd-modal')?.setAttribute('hidden', '');
            });
        });
        document.getElementById('sdNoteConfirmBtn')?.addEventListener('click', SD.confirmNote);
        document.getElementById('sdPayConfirmBtn')?.addEventListener('click', SD.confirmPay);
        // Enter-to-submit: trigger primary button of the currently open modal.
        // Skip when focus is in a <textarea> or when isComposing (IME input).
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            if (e.target.tagName === 'TEXTAREA') return;
            const openModal = document.querySelector('.sd-modal:not([hidden])');
            if (!openModal) return;
            e.preventDefault();
            // Find and click the primary confirm button of the open modal
            const confirmBtn = openModal.querySelector('.btn.btn-primary, .btn-primary');
            confirmBtn?.click();
        });
        document.getElementById('sdNccConfirmBtn')?.addEventListener('click', async () => {
            const code = (document.getElementById('sdNccCode')?.value || '').trim();
            const name = (document.getElementById('sdNccName')?.value || '').trim();
            if (!code || !name) {
                SD.notify('Vui lòng nhập đủ Mã + Tên', 'warning');
                return;
            }
            if (!/^[A-Za-z0-9]+$/.test(code)) {
                SD.notify('Mã chỉ được chứa chữ + số (vd B5, A12, MM2)', 'warning');
                return;
            }
            try {
                await SD.saveSupplier(code, name);
                SD.notify(`Đã tạo NCC [${code.toUpperCase()}] ${name}`, 'success');
                document.getElementById('sdCreateNccModal').hidden = true;
                SD.applyFilterAndRender();
            } catch (e) {
                SD.notify(e.message || 'Lỗi tạo NCC', 'error');
            }
        });
    }

    // ---------- init ----------
    async function init() {
        wireUi();
        SD.updateSortIcons();
        SD.setDefaultDateRange();
        SD.readFilters();
        // Loading skeleton (Task 3, 2026-06-14)
        const _tb = document.getElementById('sdTableBody');
        if (_tb) {
            _tb.innerHTML = Array.from({ length: 5 })
                .map(
                    () =>
                        '<tr><td colspan="8" style="padding:10px 14px">' +
                        '<span class="w2-skel" style="display:block;height:36px;border-radius:8px"></span>' +
                        '</td></tr>'
                )
                .join('');
        }
        await SD.loadAll();
        SD.applyFilterAndRender();
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Deep-link focus: ?supplier=<name> → filter + expand + flash row.
        // normalize('NFC'): tên NCC giữa các trang có thể khác Unicode form (NFC/NFD)
        // → filter text + match attr fail. Resolve tên thật (đúng form) rồi dùng nhất quán.
        const _dlSup = window.Web2Deeplink?.param('supplier');
        if (_dlSup) {
            const nfc = (s) => (s || '').normalize('NFC').trim().toLowerCase();
            const target = nfc(_dlSup);
            const realName =
                (STATE.suppliersList || []).map((s) => s.name).find((n) => nfc(n) === target) ||
                _dlSup;
            const srchEl = document.getElementById('sdSearch');
            if (srchEl) srchEl.value = realName;
            STATE.filters.search = realName;
            SD.applyFilterAndRender();
            if (window.lucide?.createIcons) window.lucide.createIcons();
            const targetRow = [...document.querySelectorAll('tr.sd-main-row[data-supplier]')].find(
                (r) => nfc(r.dataset.supplier) === target
            );
            if (targetRow) {
                const rn = targetRow.dataset.supplier;
                if (!STATE.expanded.has(rn)) SD.toggleExpand(rn);
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetRow.classList.add('w2-deeplink-flash');
                setTimeout(() => targetRow.classList.remove('w2-deeplink-flash'), 2400);
            } else {
                if (window.notificationManager?.show) {
                    notificationManager.show(
                        'Không thấy NCC trong khoảng ngày hiện tại: ' + _dlSup,
                        'info'
                    );
                }
            }
        }

        _sseConnect();
    }

    // SSE: realtime refresh báo cáo công nợ NCC khi data nguồn thay đổi.
    // Sources ảnh hưởng:
    //   - web2:supplier-wallet — server ledger mutation (tx/supplier/import, ĐỢT E)
    //   - SePay deposit (web2:wallet:* wildcard) — NCC refund/transfer
    //   - web2-products — so-order data feeds via products pending
    //   - web2:fast-sale-orders — PBH ảnh hưởng nếu refund NCC
    // Debounce 1500ms (shared timer) — báo cáo nặng, không cần refresh quá nhanh.
    let _sseUnsubs = [];
    let _sseReloadTimer = null;
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[SupplierDebt-SSE] Web2SSE not loaded — skip realtime');
            return;
        }
        if (_sseUnsubs.length) return;
        const scheduleReload = (topic) => () => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(async () => {
                _sseReloadTimer = null;
                console.log('[SupplierDebt-SSE] reload triggered by:', topic);
                await SD.loadAll();
                SD.applyFilterAndRender();
            }, 1500);
        };
        _sseUnsubs.push(
            window.Web2SSE.subscribe('web2:supplier-wallet', scheduleReload('web2:supplier-wallet'))
        );
        _sseUnsubs.push(window.Web2SSE.subscribe('web2:wallet:*', scheduleReload('web2:wallet:*')));
        _sseUnsubs.push(window.Web2SSE.subscribe('web2:products', scheduleReload('web2:products')));
        _sseUnsubs.push(
            window.Web2SSE.subscribe(
                'web2:fast-sale-orders',
                scheduleReload('web2:fast-sale-orders')
            )
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
