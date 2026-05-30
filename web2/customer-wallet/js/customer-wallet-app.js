// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví KH — app controller.
//
// Flow:
//   1. Fetch PBH list from Render
//   2. Group by partner_phone → customers + tổng tiền + orderLines
//   3. Render list cards
//   4. Detail: tabs orders / history
//   5. Return modal: chọn chiến dịch → filter order_lines → tick → tạo transaction `return`
//   6. Payment modal: số tiền → transaction `payment`

(function () {
    'use strict';

    let walletState = null;
    let pbhList = []; // raw PBH from Render
    // Grouped by phone: { [phone]: { phone, name, orders: [...], totalPurchased } }
    let customers = {};
    let activePhone = null;
    let detailTab = 'orders';

    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('vi-VN');
        } catch {
            return iso;
        }
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }

    // ---------- Aggregation ----------
    // Normalize a PBH object shape from various possible API responses.
    function normalizeOrder(o) {
        return {
            number: o.number || o.Number || '',
            date: o.dateInvoice || o.date_invoice || o.dateCreated || o.date_created || '',
            displayStt: o.displayStt || o.display_stt || null,
            phone: (o.partner?.phone || o.partner_phone || '').trim(),
            customerName: (o.partner?.name || o.partner_name || 'KH ẩn').trim(),
            campaignId: o.liveCampaign?.id || o.live_campaign_id || '',
            campaignName: o.liveCampaign?.name || o.live_campaign_name || '',
            amountTotal: Number(o.totals?.total || o.amount_total || 0),
            state: o.state || 'draft',
            lines: Array.isArray(o.orderLines || o.order_lines)
                ? (o.orderLines || o.order_lines).map((l, idx) => ({
                      key: `${o.number || o.Number}#${l.lineNumber || idx}`,
                      productCode: l.productCode || l.product_code || '',
                      productName: l.productName || l.product_name || l.name || '—',
                      quantity: Number(l.quantity || l.qty || 0),
                      price: Number(l.priceUnit || l.price_unit || l.price || 0),
                  }))
                : [],
        };
    }

    // PBH state nào KHÔNG tính vào tổng mua + không cho phép trả hàng.
    const EXCLUDED_PBH_STATES = new Set(['cancelled', 'cancel', 'canceled', 'huy', 'hủy']);

    function aggregateCustomers(orders) {
        const result = {};
        for (const raw of orders) {
            const o = normalizeOrder(raw);
            if (!o.phone) continue; // skip rows without phone (cannot dedupe)
            // Skip cancelled PBH — không tính vào ví, không cho trả hàng
            if (EXCLUDED_PBH_STATES.has(String(o.state).toLowerCase())) continue;
            if (!result[o.phone]) {
                result[o.phone] = {
                    phone: o.phone,
                    name: o.customerName,
                    orders: [],
                    totalPurchased: 0,
                    campaigns: {},
                };
            }
            const c = result[o.phone];
            c.orders.push(o);
            c.totalPurchased += o.amountTotal;
            if (o.campaignId) {
                c.campaigns[o.campaignId] = o.campaignName || o.campaignId;
            }
        }
        return result;
    }

    // Merge native-orders (Đơn Web) customers vào agg map — chỉ đảm bảo entry
    // tồn tại + có tên KH, KHÔNG cộng vào totalPurchased (Đơn Web chưa lập PBH).
    // Khi user tạo PBH từ native-order, totalPurchased cập nhật ở vòng aggregateCustomers tiếp.
    function mergeNativeOrdersIntoAgg(agg, nativeOrders) {
        if (!Array.isArray(nativeOrders)) return agg;
        for (const row of nativeOrders) {
            const phone = (row.phone || row.partner_phone || '').trim();
            if (!phone) continue;
            const name = (row.customerName || row.customer_name || row.fbUserName || '').trim();
            if (!agg[phone]) {
                agg[phone] = {
                    phone,
                    name: name || phone,
                    orders: [],
                    totalPurchased: 0,
                    campaigns: {},
                    fromNativeOrder: true, // flag để debug — không cần persist
                };
            } else if (!agg[phone].name || agg[phone].name === phone) {
                // Có PBH rồi nhưng tên rỗng / fallback phone → lấy tên native-order
                if (name) agg[phone].name = name;
            }
        }
        return agg;
    }

    function mergeAggregation(wallet, agg) {
        const allPhones = new Set([...Object.keys(wallet.wallets || {}), ...Object.keys(agg)]);
        let mutated = false;
        for (const phone of allPhones) {
            const a = agg[phone];
            const w = window.CustomerWalletStorage.getOrCreateWallet(
                wallet,
                phone,
                a?.name || phone
            );
            const newTotal = a ? Math.round(a.totalPurchased) : 0;
            if (w.totalPurchased !== newTotal) {
                w.totalPurchased = newTotal;
                mutated = true;
            }
            if (a && a.name && w.name !== a.name) {
                w.name = a.name;
                mutated = true;
            }
            window.CustomerWalletStorage.recalcBalance(w);
        }
        return mutated;
    }

    // ---------- Render list ----------
    function renderList() {
        const listEl = document.getElementById('cwList');
        const emptyEl = document.getElementById('cwEmptyState');
        const search = (document.getElementById('cwSearch').value || '').trim().toLowerCase();
        const sortBy = document.getElementById('cwSort').value;
        const items = Object.keys(walletState.wallets)
            .map((p) => walletState.wallets[p])
            .filter((w) => customers[w.phone] || w.totalPurchased > 0)
            .filter(
                (w) =>
                    !search ||
                    w.name.toLowerCase().includes(search) ||
                    w.phone.toLowerCase().includes(search)
            );

        items.sort((a, b) => {
            if (sortBy === 'balance-desc') return b.balance - a.balance;
            if (sortBy === 'balance-asc') return a.balance - b.balance;
            if (sortBy === 'total-desc') return b.totalPurchased - a.totalPurchased;
            return a.name.localeCompare(b.name);
        });

        if (!items.length) {
            listEl.innerHTML = '';
            emptyEl.hidden = false;
        } else {
            emptyEl.hidden = true;
            listEl.innerHTML = items.map(cardHtml).join('');
            listEl.querySelectorAll('[data-phone]').forEach((el) => {
                el.addEventListener('click', () => openDetail(el.dataset.phone));
            });
        }
        const totalOutstanding = items.reduce((s, w) => s + Math.max(0, w.balance), 0);
        document.getElementById('cwTotalCustomers').textContent = `${items.length} KH`;
        document.getElementById('cwTotalOutstanding').textContent =
            `Công nợ: ${fmtVnd(totalOutstanding)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function tposStatusPillHtml(partner) {
        if (!partner) return '';
        const status = partner.Status || 'Normal';
        const text = partner.StatusText || window.PartnerCustomerApi?.STATUS_TEXT?.[status] || '';
        if (!text) return '';
        const cls = (window.PartnerCustomerApi?.statusClass?.(status) || '').replace(
            'pc-status-',
            'cw-tpos-status-'
        );
        return `<span class="cw-tpos-status-pill ${cls}" title="Trạng thái TPOS">${escapeHtml(text)}</span>`;
    }

    function carrierFromPartner(partner, phone) {
        if (partner?.NameNetwork) return partner.NameNetwork;
        return window.PartnerCustomerApi?.detectCarrier?.(phone) || '';
    }

    function web2BalanceBadgeHtml(phone) {
        const wallet = web2Wallets[phone];
        if (!wallet) return '';
        const bal = Number(wallet.balance || 0);
        const cls = bal > 0 ? 'cw-web2-balance has-balance' : 'cw-web2-balance';
        return `<span class="${cls}" title="Số dư ví Web 2.0 (CK SePay đã vào)">💳 ${fmtVnd(bal)}</span>`;
    }

    function cardHtml(w) {
        const debt = w.balance > 0;
        const partner = tposPartners[w.phone];
        const tposPill = tposStatusPillHtml(partner);
        const carrier = carrierFromPartner(partner, w.phone);
        const web2Balance = web2BalanceBadgeHtml(w.phone);
        return `<div class="sw-card" data-phone="${escapeHtml(w.phone)}">
            <div class="sw-card-head">
                <div>
                    <div class="sw-card-name">${escapeHtml(w.name)} ${tposPill}</div>
                    <div class="sw-card-phone">${escapeHtml(w.phone)}${carrier ? ` <span class="cw-carrier">· ${escapeHtml(carrier)}</span>` : ''} ${web2Balance}</div>
                </div>
                <span class="sw-card-badge ${debt ? 'is-debt' : ''}">${debt ? 'Còn nợ' : 'Đủ'}</span>
            </div>
            <div class="sw-card-stats">
                <div><span class="label">Tổng mua</span><span class="value">${fmtVnd(w.totalPurchased)}</span></div>
                <div><span class="label">Đã thu</span><span class="value">${fmtVnd(w.paidAmount)}</span></div>
                <div><span class="label">Đã trả</span><span class="value">${fmtVnd(w.returnedAmount)}</span></div>
                <div class="balance"><span class="label">Còn nợ</span><span class="value">${fmtVnd(w.balance)}</span></div>
            </div>
        </div>`;
    }

    // ---------- Detail ----------
    function openDetail(phone) {
        activePhone = phone;
        detailTab = 'orders';
        const w = walletState.wallets[phone];
        const c = customers[phone];
        if (!w) return;
        document.getElementById('cwDetailTitle').textContent = `${w.name} — ${phone}`;
        renderDetailExtras(phone);
        document.getElementById('cwStatTotal').textContent = fmtVnd(w.totalPurchased);
        document.getElementById('cwStatPaid').textContent = fmtVnd(w.paidAmount);
        document.getElementById('cwStatReturned').textContent = fmtVnd(w.returnedAmount);
        document.getElementById('cwStatBalance').textContent = fmtVnd(w.balance);
        renderDetailTabs();
        document.getElementById('cwDetailModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // Render sub-title + TPOS extras row (status, email, address, link).
    // Tách riêng để gọi lại được khi enrichFromTpos resolve async sau khi modal đã mở.
    function renderDetailExtras(phone) {
        const sub = document.getElementById('cwDetailSub');
        const c = customers[phone];
        const partner = tposPartners[phone];
        const w = walletState.wallets[phone];
        if (!w) return;

        const parts = [];
        if (c) {
            parts.push(`${c.orders.length} PBH · ${Object.keys(c.campaigns).length} chiến dịch`);
        }
        if (partner) {
            const statusPill = tposStatusPillHtml(partner);
            if (statusPill) parts.push(statusPill);
            const carrier = carrierFromPartner(partner, phone);
            if (carrier) parts.push(`<span class="cw-carrier">${escapeHtml(carrier)}</span>`);
        }
        const tposEditUrl = partner?.Id
            ? `../partner-customer/index.html?id=${encodeURIComponent(partner.Id)}`
            : `../partner-customer/index.html`;
        parts.push(
            `<a class="cw-tpos-link" href="${tposEditUrl}" target="_blank" rel="noopener" title="Mở thẻ KH trên Web 2.0">Mở thẻ KH ↗</a>`
        );
        sub.innerHTML = parts.join(' · ');

        // Email + Address row — inject vào header dưới subtitle
        let extras = document.getElementById('cwTposExtras');
        if (!extras) {
            extras = document.createElement('div');
            extras.id = 'cwTposExtras';
            extras.className = 'cw-tpos-extras';
            sub.parentNode.appendChild(extras);
        }
        if (!partner) {
            extras.innerHTML = '<span class="cw-tpos-loading">Đang lấy thông tin TPOS…</span>';
            return;
        }
        const email = partner.Email || '';
        const address =
            partner.FullAddress ||
            [partner.Street, partner.Ward, partner.District, partner.City]
                .filter(Boolean)
                .join(', ');
        const credit = Number(partner.Credit || 0);
        const fragments = [];
        if (email) {
            fragments.push(
                `<span class="cw-tpos-item"><i data-lucide="mail"></i>${escapeHtml(email)}</span>`
            );
        }
        if (address) {
            fragments.push(
                `<span class="cw-tpos-item"><i data-lucide="map-pin"></i>${escapeHtml(address)}</span>`
            );
        }
        if (credit && Math.abs(credit - w.balance) > 1) {
            fragments.push(
                `<span class="cw-tpos-item cw-tpos-mismatch" title="Nợ TPOS ≠ Nợ ví — cần đối soát"><i data-lucide="alert-triangle"></i>Nợ TPOS: ${fmtVnd(credit)}</span>`
            );
        }

        // Web 2.0 wallet info (số dư tiền THẬT do KH CK SePay vào)
        const web2Wallet = web2Wallets[phone];
        if (web2Wallet) {
            const bal = Number(web2Wallet.balance || 0);
            const dep = Number(web2Wallet.total_deposited || 0);
            const wd = Number(web2Wallet.total_withdrawn || 0);
            fragments.push(
                `<span class="cw-tpos-item cw-web2-wallet-info" title="Ví Web 2.0 — tiền thật trong ví"><i data-lucide="wallet"></i>Ví: <b>${fmtVnd(bal)}</b> (nạp ${fmtVnd(dep)} / chi ${fmtVnd(wd)})</span>`
            );
        }
        extras.innerHTML = fragments.join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderDetailTabs() {
        document.querySelectorAll('#cwDetailModal .sw-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === detailTab);
        });
        document.querySelectorAll('#cwDetailModal .sw-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== detailTab;
        });
        if (detailTab === 'orders') renderOrders();
        else renderHistory();
    }

    function renderOrders() {
        const c = customers[activePhone];
        const tbody = document.getElementById('cwOrdersBody');
        if (!c || !c.orders.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có PBH</td></tr>`;
            return;
        }
        const sorted = [...c.orders].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        tbody.innerHTML = sorted
            .map((o) => {
                const totalQty = o.lines.reduce((s, l) => s + l.quantity, 0);
                return `<tr>
                    <td>${escapeHtml(fmtDate(o.date))}</td>
                    <td><span class="cw-pbh-pill">${escapeHtml(o.number)}</span></td>
                    <td>${o.campaignName ? `<span class="cw-campaign-pill">${escapeHtml(o.campaignName)}</span>` : '—'}</td>
                    <td class="num">${totalQty}</td>
                    <td class="num">${fmtVnd(o.amountTotal)}</td>
                    <td><span class="sw-status-pill">${escapeHtml(o.state || '—')}</span></td>
                </tr>`;
            })
            .join('');
    }

    function renderHistory() {
        const w = walletState.wallets[activePhone];
        const tbody = document.getElementById('cwHistoryBody');
        if (!w.transactions.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch 30 ngày</td></tr>`;
            return;
        }
        const sorted = [...w.transactions].sort((a, b) => b.ts - a.ts);
        tbody.innerHTML = sorted
            .map((t) => {
                const sign = 'is-pos';
                const lbl =
                    t.type === 'return'
                        ? 'Trả hàng (hoàn)'
                        : t.type === 'payment'
                          ? 'Thu tiền'
                          : 'Mua';
                return `<tr>
                    <td>${escapeHtml(fmtTime(t.ts))}</td>
                    <td><span class="sw-txn-type" data-type="${t.type}">${lbl}</span></td>
                    <td class="num sw-txn-amount ${sign}">+${fmtVnd(t.amount)}</td>
                    <td>${escapeHtml(t.note || '')}</td>
                </tr>`;
            })
            .join('');
    }

    // ---------- Return modal ----------
    function openReturnModal() {
        const c = customers[activePhone];
        if (!c) {
            notify('Không có dữ liệu chiến dịch cho KH này', 'warning');
            return;
        }
        document.getElementById('cwReturnCustomer').textContent = c.name;
        const campSel = document.getElementById('cwReturnCampaign');
        const camps = Object.keys(c.campaigns);
        if (!camps.length) {
            campSel.innerHTML = `<option value="">(Không có chiến dịch — chọn tất cả PBH)</option>`;
        } else {
            campSel.innerHTML =
                `<option value="">— Chọn chiến dịch —</option>` +
                camps
                    .map(
                        (id) =>
                            `<option value="${escapeHtml(id)}">${escapeHtml(c.campaigns[id])}</option>`
                    )
                    .join('');
        }
        // Reset body until campaign chosen
        document.getElementById('cwReturnBody').innerHTML =
            `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Chọn chiến dịch để xem sản phẩm</td></tr>`;
        document.getElementById('cwReturnTotal').textContent = fmtVnd(0);
        document.getElementById('cwReturnModal').hidden = false;
    }

    function onCampaignChange() {
        const w = walletState.wallets[activePhone];
        const c = customers[activePhone];
        const campId = document.getElementById('cwReturnCampaign').value;
        const filtered = c.orders.filter((o) => !campId || o.campaignId === campId);
        const lines = [];
        for (const o of filtered) {
            for (const l of o.lines) {
                if (w.returnedLineKeys[l.key]) continue; // skip returned
                lines.push({ ...l, pbh: o.number });
            }
        }
        const tbody = document.getElementById('cwReturnBody');
        if (!lines.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Không có dòng nào để trả</td></tr>`;
        } else {
            tbody.innerHTML = lines
                .map(
                    (
                        l
                    ) => `<tr data-key="${escapeHtml(l.key)}" data-price="${l.price}" data-qty="${l.quantity}" data-code="${escapeHtml(l.productCode || '')}">
                <td><input type="checkbox" class="cw-return-check" /></td>
                <td>${escapeHtml(l.productName)} <small style="color:#94a3b8">${escapeHtml(l.pbh)}</small></td>
                <td class="num">${l.quantity}</td>
                <td class="num"><input type="number" class="cw-return-qty" min="0" max="${l.quantity}" value="${l.quantity}" /></td>
                <td class="num">${fmtVnd(l.price)}</td>
                <td class="num cw-return-line-total">${fmtVnd(l.quantity * l.price)}</td>
            </tr>`
                )
                .join('');
        }
        recalcReturnTotal();
    }

    function recalcReturnTotal() {
        let total = 0;
        document.querySelectorAll('#cwReturnBody tr[data-key]').forEach((tr) => {
            const check = tr.querySelector('.cw-return-check');
            const qtyInput = tr.querySelector('.cw-return-qty');
            const lineEl = tr.querySelector('.cw-return-line-total');
            const price = Number(tr.dataset.price) || 0;
            const qty = Math.min(Number(qtyInput.value) || 0, Number(tr.dataset.qty) || 0);
            const sub = check.checked ? qty * price : 0;
            lineEl.textContent = fmtVnd(qty * price);
            total += sub;
        });
        document.getElementById('cwReturnTotal').textContent = fmtVnd(total);
    }

    async function confirmReturn() {
        const selected = [];
        const stockAdjustments = [];
        let total = 0;
        document.querySelectorAll('#cwReturnBody tr[data-key]').forEach((tr) => {
            const check = tr.querySelector('.cw-return-check');
            if (!check.checked) return;
            const qty = Math.min(
                Number(tr.querySelector('.cw-return-qty').value) || 0,
                Number(tr.dataset.qty) || 0
            );
            const price = Number(tr.dataset.price) || 0;
            const amount = qty * price;
            if (amount <= 0) return;
            selected.push({ key: tr.dataset.key, qty, amount });
            total += amount;
            const code = (tr.dataset.code || '').trim();
            if (code) stockAdjustments.push({ code, delta: qty, reason: `KH trả hàng` });
        });
        if (!selected.length) {
            notify('Chưa chọn dòng nào để trả', 'warning');
            return;
        }
        // Stock adjust: KH trả = nhập kho trở lại (+qty). Best-effort.
        try {
            if (stockAdjustments.length && window.Web2ProductsApi?.adjustStock) {
                await window.Web2ProductsApi.adjustStock(stockAdjustments);
            }
        } catch (e) {
            console.warn('[customer-wallet] stock adjust fail:', e.message);
        }
        const campId = document.getElementById('cwReturnCampaign').value || '';
        window.CustomerWalletStorage.addTransaction(walletState, activePhone, {
            type: 'return',
            amount: total,
            note: `Trả ${selected.length} dòng${campId ? ` (chiến dịch ${campId})` : ''}`,
            ref: { lineKeys: selected.map((r) => r.key), lines: selected, campaignId: campId },
        });
        pushSync();
        notify(`Đã ghi trả hàng ${fmtVnd(total)}`, 'success');
        document.getElementById('cwReturnModal').hidden = true;
        renderList();
        openDetail(activePhone);
    }

    // ---------- Payment modal ----------
    function openPayModal() {
        const w = walletState.wallets[activePhone];
        document.getElementById('cwPayCustomer').textContent = w.name;
        document.getElementById('cwPayAmount').value = 0;
        document.getElementById('cwPayNote').value = '';
        document.getElementById('cwPayModal').hidden = false;
    }

    function confirmPay() {
        const amount = Number(document.getElementById('cwPayAmount').value) || 0;
        const note = document.getElementById('cwPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        window.CustomerWalletStorage.addTransaction(walletState, activePhone, {
            type: 'payment',
            amount,
            note: note || 'Thu tiền',
        });
        pushSync();
        notify(`Đã ghi thu ${fmtVnd(amount)}`, 'success');
        document.getElementById('cwPayModal').hidden = true;
        renderList();
        openDetail(activePhone);
    }

    function pushSync() {
        if (window.CustomerWalletStorage?.Sync) {
            window.CustomerWalletStorage.Sync.push(walletState);
        }
    }

    async function loadAndRender() {
        // PHASE 3 (2026-05-25): paidAmount giờ lấy từ Web 2.0 wallet
        // (/api/web2/wallets) thay vì /api/wallet-deposits (legacy Web 1).
        // KHÔNG còn pollDeposits — Web 2.0 webhook fan-out auto credit
        // web2_customer_wallets rồi enrichWeb2Wallets() đọc về.
        //
        // PBH (Tổng mua) + native-orders (entry cho KH chưa lập PBH) vẫn
        // dùng /api/fast-sale-orders + /api/native-orders vì đó là dữ liệu
        // nghiệp vụ shared (shop chỉ có 1 bộ đơn hàng).
        const [list, nativeOrders] = await Promise.all([
            window.CustomerWalletStorage.fetchPbhList(20, 500),
            window.CustomerWalletStorage.fetchNativeOrders(20, 200).catch(() => []),
        ]);
        pbhList = list;
        customers = aggregateCustomers(pbhList);
        mergeNativeOrdersIntoAgg(customers, nativeOrders);
        const mutated = mergeAggregation(walletState, customers);
        if (mutated) {
            window.CustomerWalletStorage.save(walletState);
            pushSync();
        }
        renderList();
        // Enrich từ TPOS Partner (Status / Email / Address / Carrier) — best-effort
        enrichFromTpos().catch((e) => console.warn('[CustomerWallet] enrich fail:', e?.message));
        // Enrich Web 2.0 wallet → override paidAmount + show "💳 X₫" badge
        enrichWeb2Wallets().catch((e) =>
            console.warn('[CustomerWallet] web2 enrich fail:', e?.message)
        );
    }

    // Map phone → partner record fetched from TPOS. Memory-only, not persisted.
    const tposPartners = {};
    let _enrichInflight = null;

    // Map phone → Web 2.0 wallet (balance, total_deposited, total_withdrawn).
    // Memory-only — Web 2.0 backend là source of truth.
    const web2Wallets = {};
    let _web2EnrichInflight = null;

    async function enrichWeb2Wallets() {
        if (!window.Web2WalletApi?.getWalletsByPhones) return;
        const phones = Object.keys(walletState.wallets || {}).filter((p) => p && p.length >= 9);
        if (!phones.length) return;
        if (_web2EnrichInflight) return _web2EnrichInflight;
        _web2EnrichInflight = (async () => {
            try {
                const map = await window.Web2WalletApi.getWalletsByPhones(phones, {
                    concurrency: 5,
                });
                let mutated = false;
                for (const [phone, wallet] of map.entries()) {
                    web2Wallets[phone] = wallet;
                    // PHASE 3: override paidAmount từ Web 2.0 wallet (source of truth
                    // cho SePay deposits). returnedAmount giữ từ local Firestore
                    // (return modal vẫn ghi local — TODO Phase 4 migrate qua
                    // /api/web2/wallets/:phone/withdraw).
                    const w = walletState.wallets[phone];
                    if (w) {
                        const newPaid = Number(wallet.total_deposited) || 0;
                        if (Math.abs(newPaid - (w.paidAmount || 0)) > 1) {
                            w.paidAmount = newPaid;
                            w.balance =
                                (w.totalPurchased || 0) - w.paidAmount - (w.returnedAmount || 0);
                            mutated = true;
                        }
                    }
                }
                if (mutated) {
                    window.CustomerWalletStorage.save(walletState);
                }
                renderList();
                if (activePhone && !document.getElementById('cwDetailModal').hidden) {
                    renderDetailExtras(activePhone);
                }
            } finally {
                _web2EnrichInflight = null;
            }
        })();
        return _web2EnrichInflight;
    }

    // Reload web2 wallet cho 1 phone duy nhất (sau khi nhận SSE event).
    async function refreshWeb2Wallet(phone) {
        if (!window.Web2WalletApi?.getWallet || !phone) return;
        try {
            const wallet = await window.Web2WalletApi.getWallet(phone);
            if (wallet) {
                web2Wallets[phone] = wallet;
                renderList();
                if (activePhone === phone && !document.getElementById('cwDetailModal').hidden) {
                    renderDetailExtras(phone);
                }
            }
        } catch (e) {
            console.warn('[CustomerWallet] refreshWeb2Wallet fail:', e.message);
        }
    }

    async function enrichFromTpos() {
        if (!window.PartnerCustomerApi?.listByPhones) return;
        // Phone list = mọi KH đang có trong walletState
        const phones = Object.keys(walletState.wallets || {}).filter(
            (p) => p && p.length >= 9 && !tposPartners[p]
        );
        if (!phones.length) return;
        if (_enrichInflight) return _enrichInflight;
        _enrichInflight = (async () => {
            try {
                const map = await window.PartnerCustomerApi.listByPhones(phones, {
                    chunkSize: 30,
                });
                for (const [phone, partner] of map.entries()) {
                    tposPartners[phone] = partner;
                }
                renderList();
                if (activePhone && !document.getElementById('cwDetailModal').hidden) {
                    renderDetailExtras(activePhone);
                }
            } finally {
                _enrichInflight = null;
            }
        })();
        return _enrichInflight;
    }

    // Poll SePay deposits since lastDepositSync. Idempotent qua sepayId.
    async function pollDeposits() {
        const since = Number(walletState.lastDepositSync) || 0;
        const deposits = await window.CustomerWalletStorage.fetchDeposits(since);
        if (!Array.isArray(deposits) || !deposits.length) return;
        const added = window.CustomerWalletStorage.applyDeposits(walletState, deposits);
        // Cập nhật cursor = max ts đã thấy (kể cả khi không match wallet → tránh fetch lại)
        const maxTs = deposits.reduce((m, d) => Math.max(m, Number(d.ts) || 0), since);
        if (maxTs > since) {
            walletState.lastDepositSync = maxTs;
            window.CustomerWalletStorage.save(walletState);
        }
        if (added > 0) {
            notify(`Cập nhật ${added} thanh toán SePay`, 'success');
            pushSync();
            renderList();
            if (activePhone && !document.getElementById('cwDetailModal').hidden) {
                openDetail(activePhone);
            }
        }
    }

    function wireUi() {
        document.getElementById('cwSearch').addEventListener('input', renderList);
        document.getElementById('cwSort').addEventListener('change', renderList);
        document.getElementById('cwRefreshBtn').addEventListener('click', loadAndRender);
        document.querySelectorAll('#cwDetailModal .sw-tab').forEach((b) => {
            b.addEventListener('click', () => {
                detailTab = b.dataset.detailTab;
                renderDetailTabs();
            });
        });
        document.getElementById('cwReturnBtn').addEventListener('click', openReturnModal);
        document.getElementById('cwPayBtn').addEventListener('click', openPayModal);
        document.getElementById('cwReturnConfirmBtn').addEventListener('click', confirmReturn);
        document.getElementById('cwPayConfirmBtn').addEventListener('click', confirmPay);
        document.getElementById('cwReturnCampaign').addEventListener('change', onCampaignChange);
        const returnBody = document.getElementById('cwReturnBody');
        returnBody.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('cw-return-check') ||
                e.target.classList.contains('cw-return-qty')
            ) {
                recalcReturnTotal();
            }
        });
        returnBody.addEventListener('input', (e) => {
            if (e.target.classList.contains('cw-return-qty')) recalcReturnTotal();
        });
        document.getElementById('cwReturnSelectAll').addEventListener('change', (e) => {
            document.querySelectorAll('#cwReturnBody .cw-return-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            recalcReturnTotal();
        });
        document.querySelectorAll('[data-cw-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.sw-modal')?.setAttribute('hidden', '');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.sw-modal:not([hidden])')
                    .forEach((m) => (m.hidden = true));
            }
        });
    }

    async function init() {
        // P1 2026-05-30: CustomerWalletStorage.load() giờ async (IDB read)
        walletState = await window.CustomerWalletStorage.load();
        const purged = window.CustomerWalletStorage.cleanupOldTransactions(walletState);
        if (purged) window.CustomerWalletStorage.save(walletState);
        wireUi();
        await loadAndRender();
        const ok = await window.CustomerWalletStorage.Sync.init((remote) => {
            walletState = remote;
            window.CustomerWalletStorage.cleanupOldTransactions(walletState);
            renderList();
            if (activePhone && !document.getElementById('cwDetailModal').hidden) {
                openDetail(activePhone);
            }
        });
        if (ok) {
            walletState = await window.CustomerWalletStorage.load();
            renderList();
            pushSync();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: realtime auto-refresh khi SePay webhook nhận tiền chuyển khoản.
    // Server pipeline: SePay webhook → wallet-event-processor → walletEvents
    // .emit('wallet:update') → realtime-sse.js → notifyClientsWildcard('wallet')
    // → clients subscribe topic 'wallet:*' nhận event.
    //
    // Subscribe key bất kỳ start với 'wallet:' để nhận wildcard broadcast.
    // Dùng 'wallet:all' làm convention cho admin/page-level subscriber
    // (per-customer detail page có thể subscribe 'wallet:<phone>' riêng).
    let _sseUnsubscribe = null;
    let _sseUnsubscribeFso = null; // PHASE A1: web2:fast-sale-orders
    let _sseUnsubscribeCw = null; // PHASE B2: web2:customer-wallet cross-broadcast
    let _sseUnsubscribeNo = null; // web2:native-orders → reload để ensure wallet entry
    let _ssePollTimer = null;
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[CustomerWallet-SSE] Web2SSE not loaded — skip realtime');
            return;
        }
        if (_sseUnsubscribe) return;
        // PHASE A1 + B2: subscribe 'web2:fast-sale-orders' và alias
        // 'web2:customer-wallet' (server cross-broadcast topic — Phase B2 ở
        // fast-sale-orders.js). Khi PBH confirm/cancel/create → wallet KH
        // reload PBH list + recalc. Cùng debounce với wallet:all.
        const reloadPbh = (msg, source) => {
            if (_ssePollTimer) clearTimeout(_ssePollTimer);
            _ssePollTimer = setTimeout(async () => {
                _ssePollTimer = null;
                console.log(
                    `[CustomerWallet-SSE] ${source}:`,
                    msg.data?.action,
                    msg.data?.number || ''
                );
                await loadAndRender();
            }, 800);
        };
        _sseUnsubscribeFso = window.Web2SSE.subscribe('web2:fast-sale-orders', (msg) =>
            reloadPbh(msg, 'PBH direct')
        );
        _sseUnsubscribeCw = window.Web2SSE.subscribe('web2:customer-wallet', (msg) =>
            reloadPbh(msg, 'wallet cross-broadcast')
        );
        // Native-orders (Đơn Web) thay đổi → ensure wallet entry cho KH mới
        _sseUnsubscribeNo = window.Web2SSE.subscribe('web2:native-orders', (msg) =>
            reloadPbh(msg, 'native-orders')
        );
        // PHASE 3 (2026-05-25): KHÔNG subscribe 'wallet:all' Web 1.0 nữa.
        // Web 2.0 dùng riêng 'web2:wallet:*' do web2-wallet-service.js emit
        // qua webhook fan-out. Web 1 wallet:all chỉ phục vụ legacy.

        // WEB 2.0 wallet realtime — backend mới emit 'web2:wallet:update' khi
        // SePay match Web 2.0 path. Refresh số dư ví Web 2.0 cho phone đó.
        window.Web2SSE.subscribe('web2:wallet:*', (msg) => {
            const phone = msg?.data?.phone;
            const amount = msg?.data?.transaction?.amount;
            if (!phone) return;
            console.log(
                '[CustomerWallet-SSE] web2:wallet:update:',
                phone,
                amount ? Number(amount).toLocaleString('vi-VN') + 'đ' : ''
            );
            // Reload chỉ ví Web 2.0 cho phone đó (không cần reload toàn bộ)
            refreshWeb2Wallet(phone).catch(() => {});
            if (amount && Number(amount) > 0) {
                notify(
                    `💳 Ví Web 2.0: +${Number(amount).toLocaleString('vi-VN')}đ → ${phone}`,
                    'success'
                );
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
