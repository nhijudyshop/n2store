// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// =============================================================================
// TPOS — FINDER bill TRÙNG / KẸT (READ-ONLY, KHÔNG ghi/sửa/hủy gì hết)
// =============================================================================
//
// Mục đích: liệt kê các PBH (FastSaleOrder) trong khung giờ sự cố để tìm:
//   1. Đơn nguồn (Reference) có >1 PBH ACTIVE  → bill TRÙNG (phantom do tạo lại).
//   2. PBH do 1 user (vd "Hạnh"/hanhlive) tạo  → khoanh vùng sự cố.
//
// Cách dùng:
//   - Mở orders-report (main.html) trong trình duyệt, ĐÃ đăng nhập TPOS.
//   - Mở DevTools Console (F12) → dán TOÀN BỘ file này → Enter.
//   - Chỉnh CONFIG bên dưới nếu cần (khung giờ, lọc user).
//   - Kết quả in ra console.table + trả về object để copy.
//
// An toàn: chỉ gọi GET FastSaleOrder/ODataService.GetView (đọc). KHÔNG ActionCancel,
// KHÔNG DELETE, KHÔNG đụng InvoiceStatusStore. Chạy bao nhiêu lần cũng vô hại.
// =============================================================================

(async function findStuckDuplicateBills() {
    // -------------------------- CONFIG (chỉnh ở đây) --------------------------
    const CONFIG = {
        // Khung giờ sự cố (giờ VN). Mặc định: cả ngày 09/06/2026.
        // Định dạng ISO không timezone → TPOS hiểu theo local. Nới rộng nếu cần.
        fromDate: '2026-06-09T00:00:00',
        toDate: '2026-06-09T23:59:59',
        // Lọc theo người tạo bill (UserName chứa chuỗi này, không phân biệt hoa
        // thường). Để '' = lấy hết mọi user. Để 'hanh' hoặc 'hạnh' để khoanh vùng.
        userContains: '',
        // Chỉ in các đơn nguồn có >1 PBH active (bill trùng). false = in tất cả.
        onlyDuplicates: true,
        pageSize: 200,
    };
    // -------------------------------------------------------------------------

    if (!window.tokenManager?.getAuthHeader) {
        console.error('❌ Chưa có tokenManager — mở trang orders-report đã login rồi chạy lại.');
        return;
    }
    const tposOData =
        window.API_CONFIG?.TPOS_ODATA || 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';
    const headers = await window.tokenManager.getAuthHeader();

    const isActive = (inv) =>
        inv.State !== 'cancel' &&
        inv.State !== 'draft' &&
        inv.StateCode !== 'cancel' &&
        inv.StateCode !== 'draft' &&
        !inv.IsMergeCancel &&
        inv.ShowState !== 'Huỷ bỏ' &&
        inv.ShowState !== 'Hủy bỏ' &&
        inv.ShowState !== 'Nháp';

    // 1) Tải tất cả invoice trong khung giờ (phân trang).
    const all = [];
    const baseFilter =
        `Type eq 'invoice'` +
        ` and DateInvoice ge ${CONFIG.fromDate}Z` +
        ` and DateInvoice le ${CONFIG.toDate}Z`;
    let skip = 0;
    for (;;) {
        const url =
            `${tposOData}/FastSaleOrder/ODataService.GetView` +
            `?$top=${CONFIG.pageSize}&$skip=${skip}` +
            `&$orderby=DateInvoice desc&$filter=${encodeURIComponent(baseFilter)}`;
        let resp;
        try {
            resp = await fetch(url, { headers: { ...headers, accept: 'application/json' } });
        } catch (e) {
            console.error('❌ Lỗi mạng khi tải trang skip=' + skip, e.message);
            break;
        }
        if (!resp.ok) {
            console.error(`❌ HTTP ${resp.status} tại skip=${skip}. Thử thu hẹp khung giờ.`);
            break;
        }
        const data = await resp.json();
        const page = Array.isArray(data?.value) ? data.value : [];
        all.push(...page);
        console.log(`  …đã tải ${all.length} phiếu (trang skip=${skip}, +${page.length})`);
        if (page.length < CONFIG.pageSize) break;
        skip += CONFIG.pageSize;
        if (skip > 20000) {
            console.warn('⚠ Dừng an toàn ở 20000 phiếu — thu hẹp khung giờ.');
            break;
        }
    }

    // 2) Lọc theo user (nếu có).
    const uc = (CONFIG.userContains || '').trim().toLowerCase();
    const scoped = uc ? all.filter((inv) => (inv.UserName || '').toLowerCase().includes(uc)) : all;

    // 3) Gom theo Reference (đơn nguồn). Đếm số PBH active mỗi đơn.
    const byRef = new Map();
    for (const inv of scoped) {
        const ref = inv.Reference || '(no-ref)';
        if (!byRef.has(ref)) byRef.set(ref, []);
        byRef.get(ref).push(inv);
    }

    const rows = [];
    const dupGroups = [];
    for (const [ref, invs] of byRef.entries()) {
        const actives = invs.filter(isActive);
        const isDup = actives.length > 1;
        if (isDup) dupGroups.push({ ref, count: actives.length, invoices: actives });
        if (CONFIG.onlyDuplicates && !isDup) continue;
        for (const inv of invs) {
            rows.push({
                DonNguon: ref,
                SoPBH: inv.Number || '',
                TrangThai: inv.ShowState || inv.State || '',
                StateCode: inv.StateCode || '',
                Active: isActive(inv) ? '✅' : '—',
                NguoiTao: inv.UserName || '',
                Ngay: (inv.DateInvoice || inv.DateCreated || '').replace('T', ' ').slice(0, 16),
                KhachHang: inv.PartnerDisplayName || '',
                SDT: inv.Phone || '',
                Tien: inv.AmountTotal || 0,
                Id: inv.Id,
            });
        }
    }

    // 4) In kết quả.
    console.log(
        `\n================ KẾT QUẢ (READ-ONLY) ================\n` +
            `Khung giờ: ${CONFIG.fromDate} → ${CONFIG.toDate}\n` +
            `Tổng phiếu trong khung: ${all.length}` +
            (uc ? ` | lọc user "${CONFIG.userContains}": ${scoped.length}` : '') +
            `\nĐơn nguồn có >1 PBH ACTIVE (bill TRÙNG/kẹt): ${dupGroups.length}\n` +
            `=====================================================`
    );
    if (dupGroups.length) {
        console.log('\n🔴 ĐƠN NGUỒN BỊ TRÙNG (mỗi đơn lẽ ra chỉ 1 PBH active):');
        console.table(
            dupGroups.map((g) => ({
                DonNguon: g.ref,
                SoPBHActive: g.count,
                CacSoPBH: g.invoices.map((i) => i.Number).join(', '),
                Ids: g.invoices.map((i) => i.Id).join(', '),
            }))
        );
    }
    console.log('\n📋 CHI TIẾT TỪNG PHIẾU:');
    console.table(rows);

    const result = {
        totalInWindow: all.length,
        scopedCount: scoped.length,
        duplicateSourceOrders: dupGroups.length,
        duplicateGroups: dupGroups,
        rows,
    };
    console.log('\n➡ Object kết quả đã trả về (gõ `temp1` hoặc copy(window.__stuckBills)).');
    window.__stuckBills = result;
    return result;
})();
