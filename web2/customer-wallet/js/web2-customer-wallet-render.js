// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerWalletApp — Render module.
// list / pagination / cards / detail modal / orders / history / QR render
// + WEB2 enrichment (current page). Extends shared namespace window.W2CW.
// =====================================================================

(function (global) {
    'use strict';

    const W2CW = global.W2CW || (global.W2CW = {});
    const { state, dom, fmtVnd, fmtTime, fmtDate, escapeHtml, normPhone } = W2CW;
    const api = W2CW.api;

    // ─── Render ─────────────────────────────────────────────────────
    // Server-paged: state.rows is the current page from /aggregate.
    // No client-side filter/sort/search — server handles everything.
    function renderList() {
        const items = state.rows;

        if (state.loading) {
            dom.list.innerHTML = `<div class="cw-loading">Đang tải…</div>`;
            dom.empty.hidden = true;
            return;
        }
        if (!items.length) {
            dom.list.innerHTML = '';
            // TASK 8: friendly empty-state for any filter (not just 'all')
            const filterLabels = {
                all: 'Chưa có khách hàng nào',
                debt: 'Không có khách nào còn nợ',
                has_balance: 'Không có khách nào có dư ví',
                paid_off: 'Không có khách nào đã thanh toán đủ',
                vip: 'Không có khách VIP nào',
                warning: 'Không có khách cảnh báo nào',
                bomb: 'Không có khách bom hàng nào',
            };
            const emptyMsg = filterLabels[state.quickFilter] || 'Không có kết quả';
            dom.empty.querySelector('p').innerHTML =
                escapeHtml(emptyMsg) +
                (state.search ? ` · tìm "<b>${escapeHtml(state.search)}</b>"` : '');
            dom.empty.hidden = false;
        } else {
            dom.empty.hidden = true;
            dom.list.innerHTML = items.map(cardHtml).join('');
            dom.list.querySelectorAll('[data-phone]').forEach((el) => {
                el.addEventListener('click', () => openDetail(el.dataset.phone));
            });
        }

        renderPagination();

        // Stats overlay:
        // - Header counter pill = WEB2 total (full customer base, 90k+)
        // - Stat cards: Tổng KH (WEB2) + Có hoạt động Web 2.0 (web2 stats)
        const s = state.stats || {};
        const web2Total = Number(s.total) || 0;
        const stateTotal = Number(state.total) || 0; // primary source khi filter=all/vip/warning/bomb
        const headerTotal = web2Total || stateTotal;
        const filteredDebt = items.reduce((acc, c) => acc + Math.max(0, c.balance || 0), 0);
        dom.totalCustomers.textContent = `${items.length} / ${headerTotal.toLocaleString('vi-VN')} KH`;
        dom.totalOutstanding.textContent = `Công nợ filter: ${fmtVnd(filteredDebt)}`;

        if (dom.statKh) dom.statKh.textContent = headerTotal.toLocaleString('vi-VN');
        if (dom.statDebt) dom.statDebt.textContent = fmtVnd(s.total_debt);
        if (dom.statWallet) dom.statWallet.textContent = fmtVnd(s.total_wallet_balance);
        if (dom.statPaid) dom.statPaid.textContent = fmtVnd(s.total_paid);

        if (dom.chipAll) dom.chipAll.textContent = headerTotal.toLocaleString('vi-VN');
        if (dom.chipDebt) dom.chipDebt.textContent = (s.debt_count || 0).toLocaleString('vi-VN');
        if (dom.chipBalance)
            dom.chipBalance.textContent = (s.has_balance_count || 0).toLocaleString('vi-VN');
        // VIP/Warning/Bomb counts require WEB2 data — leave dash until WEB2 loads
        // (these filters are still implemented client-side via WEB2 partner status)
        if (dom.chipVip) dom.chipVip.textContent = state.web2PartnerCounts?.vip ?? '—';
        if (dom.chipWarn) dom.chipWarn.textContent = state.web2PartnerCounts?.warning ?? '—';
        if (dom.chipBomb) dom.chipBomb.textContent = state.web2PartnerCounts?.bomb ?? '—';

        document.querySelectorAll('#cwChips .cw-chip').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.filter === state.quickFilter);
        });

        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderPagination() {
        const total = state.total || 0;
        const size = state.pageSize;
        const pages = Math.max(1, Math.ceil(total / size));
        const page = Math.min(Math.max(1, state.page), pages);
        const start = total === 0 ? 0 : (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        if (dom.pageInfo) {
            dom.pageInfo.textContent = `${start.toLocaleString('vi-VN')}–${end.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')}`;
        }
        if (!dom.pageButtons) return;
        const btns = [];
        const push = (label, target, opts) => {
            const disabled = opts?.disabled ? 'disabled' : '';
            const active = opts?.active ? 'is-active' : '';
            btns.push(
                `<button type="button" class="${active}" data-page="${target}" ${disabled}>${label}</button>`
            );
        };
        push('«', 1, { disabled: page <= 1 });
        push('‹', page - 1, { disabled: page <= 1 });
        const win = 5;
        let from = Math.max(1, page - 2);
        let to = Math.min(pages, from + win - 1);
        from = Math.max(1, to - win + 1);
        for (let i = from; i <= to; i++) push(String(i), i, { active: i === page });
        push('›', page + 1, { disabled: page >= pages });
        push('»', pages, { disabled: page >= pages });
        dom.pageButtons.innerHTML = btns.join('');
    }

    function web2PartnerBadge(phone) {
        const partner = state.web2Partners[phone];
        if (!partner || !partner.Status || partner.Status === 'Normal') return '';
        const text =
            partner.StatusText || window.PartnerCustomerApi?.STATUS_TEXT?.[partner.Status] || '';
        if (!text) return '';
        const cls = (window.PartnerCustomerApi?.statusClass?.(partner.Status) || '').replace(
            'pc-status-',
            'cw-web2-status-'
        );
        return `<span class="cw-web2-status-pill ${cls}">${escapeHtml(text)}</span>`;
    }

    function cardHtml(c) {
        const debt = (c.balance || 0) > 0;
        const partner = state.web2Partners[c.phone];
        const web2Pill = web2PartnerBadge(c.phone);
        const carrier =
            partner?.NameNetwork || window.PartnerCustomerApi?.detectCarrier?.(c.phone) || '';
        // Server returns walletBalance directly (no nested object); only show
        // "no wallet" pill when the row genuinely has no wallet (paid/withdraw
        // both zero AND walletBalance is exactly 0 with no deposit history).
        const hasWallet =
            c.walletBalance != null &&
            (c.walletBalance > 0 || c.totalDeposited > 0 || c.totalWithdrawn > 0);
        const w2Balance = c.walletBalance != null ? Number(c.walletBalance || 0) : null;
        const w2Pill = hasWallet
            ? `<span class="cw-web2-balance ${w2Balance > 0 ? 'has-balance' : ''}" title="Số dư ví Web 2.0 hiện tại">💳 ${fmtVnd(w2Balance)}</span>`
            : '<span class="cw-web2-balance cw-no-wallet" title="Chưa có ví Web 2.0 — sẽ tự tạo khi nhận CK">—</span>';
        return `
            <div class="sw-card" data-phone="${escapeHtml(c.phone)}">
                <div class="sw-card-head">
                    <div>
                        <div class="sw-card-name">${escapeHtml(c.name || '(không tên)')} ${web2Pill}</div>
                        <div class="sw-card-phone">${escapeHtml(c.phone)}${carrier ? ` <span class="cw-carrier">· ${escapeHtml(carrier)}</span>` : ''} ${w2Pill}</div>
                    </div>
                    <span class="sw-card-badge ${debt ? 'is-debt' : ''}">${debt ? 'Còn nợ' : 'Đủ'}</span>
                </div>
                <div class="sw-card-stats">
                    <div><span class="label">Tổng mua</span><span class="value">${fmtVnd(c.totalPurchased)}</span></div>
                    <div><span class="label">Đã thu</span><span class="value">${fmtVnd(c.paidAmount)}</span></div>
                    <div><span class="label">Đã trả</span><span class="value">${fmtVnd(c.returnedAmount)}</span></div>
                    <div class="balance"><span class="label">Còn nợ</span><span class="value">${fmtVnd(c.balance)}</span></div>
                </div>
            </div>
        `;
    }

    // ─── Detail drawer ──────────────────────────────────────────────
    async function openDetail(phone) {
        state.activePhone = phone;
        state.detailTab = 'orders';
        const c = state.cache[phone];
        if (!c) return;
        dom.detailTitle.textContent = `${c.name || '(không tên)'} — ${phone}`;
        dom.statTotal.textContent = fmtVnd(c.totalPurchased);
        dom.statPaid.textContent = fmtVnd(c.paidAmount);
        dom.statReturned.textContent = fmtVnd(c.returnedAmount);
        dom.statBalance.textContent = fmtVnd(c.balance);
        renderDetailExtras(phone);
        // TASK 7: show skeleton in orders body while PBH fetch in progress
        if (dom.ordersBody) {
            dom.ordersBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px 16px">
                <span class="w2-skel" style="display:inline-block;width:60%;height:14px;border-radius:6px;margin-bottom:8px"></span><br>
                <span class="w2-skel" style="display:inline-block;width:40%;height:12px;border-radius:6px"></span>
            </td></tr>`;
        }
        renderDetailTabs();
        dom.detailModal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        // Lazy-fetch PBH detail for this phone (not loaded for list view)
        state.detailOrders = [];
        try {
            const orders = await api.fetchPbhListForPhone(phone);
            state.detailOrders = orders;
            if (state.activePhone === phone && state.detailTab === 'orders') renderOrders();
        } catch (_) {}
    }
    function renderDetailExtras(phone) {
        const c = state.cache[phone];
        const partner = state.web2Partners[phone];
        const w2 = c
            ? {
                  balance: c.walletBalance,
                  total_deposited: c.totalDeposited,
                  total_withdrawn: c.totalWithdrawn,
              }
            : null;
        if (!c) return;
        const parts = [];
        if (c.pbhCount > 0) parts.push(`${c.pbhCount} PBH`);
        if (c.nativeCount > 0) parts.push(`${c.nativeCount} Đơn Web`);
        if (partner) {
            const web2Pill = web2PartnerBadge(phone);
            if (web2Pill) parts.push(web2Pill);
        }
        const editUrl = partner?.Id
            ? `../customers/index.html`
            : `../customers/index.html?search=${encodeURIComponent(phone)}`;
        parts.push(
            `<a class="cw-web2-link" href="${editUrl}" target="_blank" rel="noopener">Mở thẻ KH ↗</a>`
        );
        dom.detailSub.innerHTML = parts.join(' · ');

        let extras = document.getElementById('cwWeb2Extras');
        if (!extras) {
            extras = document.createElement('div');
            extras.id = 'cwWeb2Extras';
            extras.className = 'cw-web2-extras';
            dom.detailSub.parentNode.appendChild(extras);
        }
        const frags = [];
        if (partner?.Email) {
            frags.push(
                `<span class="cw-web2-item"><i data-lucide="mail"></i>${escapeHtml(partner.Email)}</span>`
            );
        }
        const addr =
            partner?.FullAddress ||
            [partner?.Street, partner?.Ward, partner?.District, partner?.City]
                .filter(Boolean)
                .join(', ');
        if (addr) {
            frags.push(
                `<span class="cw-web2-item"><i data-lucide="map-pin"></i>${escapeHtml(addr)}</span>`
            );
        }
        if (w2) {
            const bal = Number(w2.balance || 0);
            const dep = Number(w2.total_deposited || 0);
            const wd = Number(w2.total_withdrawn || 0);
            frags.push(
                `<span class="cw-web2-item cw-web2-wallet-info"><i data-lucide="wallet"></i>Ví Web 2.0: <b>${fmtVnd(bal)}</b> (nạp ${fmtVnd(dep)} / chi ${fmtVnd(wd)})</span>`
            );
        } else {
            frags.push(
                `<span class="cw-web2-item cw-web2-loading">Chưa có ví Web 2.0 — sẽ tự tạo khi KH chuyển khoản đầu tiên</span>`
            );
        }
        extras.innerHTML = frags.join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function renderDetailTabs() {
        document.querySelectorAll('#cwDetailModal .sw-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === state.detailTab);
        });
        document.querySelectorAll('#cwDetailModal .sw-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== state.detailTab;
        });
        if (state.detailTab === 'orders') renderOrders();
        else if (state.detailTab === 'history') renderHistory();
        else if (state.detailTab === 'qr') renderQrTab();
    }

    // ----- QR VietQR tab -----
    function renderQrEmpty() {
        document.getElementById('cwQrLoading').hidden = true;
        document.getElementById('cwQrContent').hidden = true;
        document.getElementById('cwQrEmpty').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }
    function renderQrData(qr) {
        document.getElementById('cwQrLoading').hidden = true;
        document.getElementById('cwQrEmpty').hidden = true;
        document.getElementById('cwQrContent').hidden = false;
        document.getElementById('cwQrImage').src = qr.vietqr_url;
        document.getElementById('cwQrCode').textContent = qr.qr_code;
        document.getElementById('cwQrPartnerId').textContent = qr.customer_id || '—';
        document.getElementById('cwQrUseCount').textContent = qr.use_count || 0;
        document.getElementById('cwQrLastUsed').textContent = qr.last_used_at
            ? new Date(qr.last_used_at).toLocaleString('vi-VN')
            : '(chưa dùng)';
        document.getElementById('cwQrCopyImage').href = qr.vietqr_url;
        if (qr.bank) {
            document.getElementById('cwQrBank').textContent =
                `${qr.bank.code} · ${qr.bank.accountNo} · ${qr.bank.accountName}`;
        }
        if (window.lucide) window.lucide.createIcons();
    }
    async function renderQrTab() {
        const phone = state.activePhone;
        if (!phone) return;
        const loading = document.getElementById('cwQrLoading');
        const content = document.getElementById('cwQrContent');
        const empty = document.getElementById('cwQrEmpty');
        loading.hidden = false;
        loading.textContent = 'Đang tải / tạo QR…';
        content.hidden = true;
        empty.hidden = true;
        try {
            const r = await api.qrFetch(`/${encodeURIComponent(phone)}/qr`);
            if (r.status === 404) {
                // Auto-create: gọi POST UPSERT (backend tự lookup WEB2 partner_id)
                const c = state.cache[phone];
                const partner = state.web2Partners[phone];
                const post = await api.qrFetch(`/${encodeURIComponent(phone)}/qr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerId: partner?.Id || c?.customerId || undefined,
                        customerName: partner?.Name || c?.name || undefined,
                    }),
                });
                if (post.status !== 200) {
                    throw new Error(post.body?.error || `HTTP ${post.status}`);
                }
                renderQrData(post.body.data);
                return;
            }
            renderQrData(r.body.data);
        } catch (e) {
            loading.textContent = `Lỗi: ${e.message}`;
        }
    }
    function renderOrders() {
        const orders = state.detailOrders;
        const pbh = Array.isArray(orders?.pbh) ? orders.pbh : [];
        if (!pbh.length) {
            dom.ordersBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">${orders === null ? 'Đang tải…' : 'Chưa có PBH'}</td></tr>`;
            return;
        }
        const sorted = [...pbh].sort((a, b) =>
            String(b.dateInvoice || b.dateCreated || '').localeCompare(
                String(a.dateInvoice || a.dateCreated || '')
            )
        );
        dom.ordersBody.innerHTML = sorted
            .map((o) => {
                const totalQty = o.totalQuantity || 0;
                const date = o.dateInvoice || o.dateCreated || '';
                return `<tr>
                    <td>${escapeHtml(fmtDate(date))}</td>
                    <td><span class="cw-pbh-pill">${escapeHtml(o.number || '')}</span></td>
                    <td>${o.liveCampaign?.name ? `<span class="cw-campaign-pill">${escapeHtml(o.liveCampaign.name)}</span>` : '—'}</td>
                    <td class="num">${totalQty}</td>
                    <td class="num">${fmtVnd(o.amountTotal)}</td>
                    <td><span class="sw-status-pill">${escapeHtml(o.state || '—')}</span></td>
                </tr>`;
            })
            .join('');
    }
    async function renderHistory() {
        const phone = state.activePhone;
        if (!phone) return;
        dom.historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Đang tải…</td></tr>`;
        try {
            const txns = await window.Web2WalletApi.getTransactions(phone, { limit: 100 });
            if (!txns.length) {
                dom.historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch</td></tr>`;
                return;
            }
            dom.historyBody.innerHTML = txns
                .map((t) => {
                    const lbl =
                        t.type === 'DEPOSIT'
                            ? t.reference_type === 'sepay'
                                ? 'CK SePay'
                                : 'Nạp tay'
                            : t.type === 'WITHDRAW'
                              ? t.reference_type === 'return'
                                  ? 'Hoàn (trả hàng)'
                                  : 'Trừ ví (mua đơn)'
                              : t.type;
                    const sign = t.type === 'DEPOSIT' ? '+' : '-';
                    const by =
                        t.performed_by || (t.reference_type === 'sepay' ? '(SePay tự động)' : '—');
                    return `<tr>
                        <td>${escapeHtml(fmtTime(t.created_at))}</td>
                        <td><span class="sw-txn-type" data-type="${t.type.toLowerCase()}">${lbl}</span></td>
                        <td class="num sw-txn-amount ${t.type === 'DEPOSIT' ? 'is-pos' : 'is-neg'}">${sign}${fmtVnd(t.amount)}</td>
                        <td>${escapeHtml(by)}</td>
                        <td>${escapeHtml(t.note || '')}</td>
                    </tr>`;
                })
                .join('');
        } catch (e) {
            dom.historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#dc2626;padding:24px;">Lỗi tải: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // ─── WEB2 enrichment (current page only, non-blocking) ────────────
    async function enrichWeb2ForCurrentPage() {
        if (!window.PartnerCustomerApi?.listByPhones) return;
        const phones = state.rows
            .map((r) => r.phone)
            .filter((p) => p && p.length >= 9 && !state.web2Partners[p]);
        if (!phones.length) return;
        try {
            // Concurrency 8 — chỉ enrich 50 phones tối đa (current page size)
            const map = await window.PartnerCustomerApi.listByPhones(phones, { concurrency: 8 });
            for (const [phone, partner] of map.entries()) {
                state.web2Partners[phone] = partner;
                // Cập nhật tên KH wallet-only nếu server trả về `<phone>` (chưa
                // có name từ PBH/native) — WEB2 partner thường có name chính xác.
                const row = state.rows.find((r) => r.phone === phone);
                if (row && row.name === row.phone && partner.Name) {
                    row.name = partner.Name;
                    if (state.cache[phone]) state.cache[phone].name = partner.Name;
                }
            }
            renderList();
            if (
                state.activePhone &&
                !dom.detailModal.hidden &&
                state.web2Partners[state.activePhone]
            ) {
                renderDetailExtras(state.activePhone);
            }
        } catch (e) {
            console.warn('[CW4] enrichWeb2ForCurrentPage fail:', e.message);
        }
    }

    // Expose render on W2CW
    W2CW.render = {
        renderList,
        renderPagination,
        web2PartnerBadge,
        cardHtml,
        openDetail,
        renderDetailExtras,
        renderDetailTabs,
        renderQrEmpty,
        renderQrData,
        renderQrTab,
        renderOrders,
        renderHistory,
        enrichWeb2ForCurrentPage,
    };
})(window);
