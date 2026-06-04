#!/usr/bin/env node
// #Note: WEB2.0 — E2E test thu hộ ví khi tạo PBH + hoàn khi huỷ. Dùng test customer.
// Test customer mặc định: Huỳnh Thành Đạt — 0123456788 (CLAUDE.md). KHÔNG đụng KH thật.
// Chạy: node scripts/test-pbh-wallet-cod.js
const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const PHONE = '0123456788';
const NAME = 'Huỳnh Thành Đạt';
const PROD = { productCode: 'TEST-PBH-WALLET', name: 'SP test thu hộ', price: 150000, quantity: 1 };

async function j(method, path, body) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
}
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

(async () => {
    console.log('═══ E2E: thu hộ ví khi tạo PBH ═══\n');

    // 0. Số dư ví ban đầu
    let w = await j('GET', `/api/web2/wallets/by-phone/${PHONE}`);
    const startBal = w.data?.data ? Number(w.data.data.balance) || 0 : 0;
    console.log(`Ví đầu: ${fmt(startBal)}₫`);

    // 1. Nạp ví đủ trả đơn (150k) — nạp 200k để dư
    await j('POST', `/api/web2/wallets/${PHONE}/deposit`, { amount: 200000, note: 'TEST nạp ví' });
    w = await j('GET', `/api/web2/wallets/by-phone/${PHONE}`);
    const balAfterDeposit = Number(w.data.data.balance) || 0;
    console.log(`Sau nạp 200k: ${fmt(balAfterDeposit)}₫`);

    // 2. Tạo đơn web tay cho test customer
    const created = await j('POST', '/api/native-orders/create-manual', {
        customerName: NAME,
        phone: PHONE,
        address: 'TEST shop',
        products: [PROD],
        channel: 'inbox',
    });
    if (!created.data?.order) {
        console.error('✗ Tạo đơn fail:', JSON.stringify(created.data).slice(0, 200));
        process.exit(1);
    }
    const code = created.data.order.code;
    console.log(`Đơn: ${code} (tổng ${fmt(PROD.price)}₫)`);

    // 3. Tạo PBH → trừ ví thu hộ
    const pbh = await j('POST', '/api/fast-sale-orders/from-native-order', {
        nativeOrderCode: code,
        force: true,
    });
    if (!pbh.data?.success) {
        console.error('✗ Tạo PBH fail:', JSON.stringify(pbh.data).slice(0, 200));
    }
    const residual = pbh.data?.order?.payment?.residual;
    const walletDed = pbh.data?.order?.payment?.walletDeducted;
    console.log(
        `PBH ${pbh.data?.order?.number}: residual(COD)=${fmt(residual)}₫, đã trừ ví=${fmt(walletDed)}₫`
    );

    // 4. Verify ví giảm + /load badge paid
    w = await j('GET', `/api/web2/wallets/by-phone/${PHONE}`);
    const balAfterPbh = Number(w.data.data.balance) || 0;
    const load = await j('GET', `/api/native-orders/load?limit=200`);
    const o = (load.data.orders || []).find((x) => x.code === code);
    console.log(`Sau PBH ví: ${fmt(balAfterPbh)}₫ (giảm ${fmt(balAfterDeposit - balAfterPbh)}₫)`);
    console.log(
        `/load: pbhTotal=${fmt(o?.pbhTotal)} pbhResidual=${fmt(o?.pbhResidual)} → paid=${o?.pbhTotal > 0 && o?.pbhResidual <= 0}`
    );

    const okDeduct = walletDed === PROD.price && residual === 0;
    const okBal = balAfterDeposit - balAfterPbh === PROD.price;
    const okPaid = o && o.pbhTotal > 0 && o.pbhResidual <= 0;
    console.log(
        `\n✓ Trừ đúng ${PROD.price}: ${okDeduct} | ✓ Ví giảm đúng: ${okBal} | ✓ Badge paid: ${okPaid}`
    );

    // 5. Huỷ đơn → hoàn ví
    await j('POST', `/api/native-orders/${code}/cancel`, { reason: 'TEST cleanup' });
    w = await j('GET', `/api/web2/wallets/by-phone/${PHONE}`);
    const balAfterCancel = Number(w.data.data.balance) || 0;
    console.log(
        `\nSau huỷ ví: ${fmt(balAfterCancel)}₫ (hoàn ${fmt(balAfterCancel - balAfterPbh)}₫)`
    );
    const okRefund = balAfterCancel === balAfterDeposit;
    console.log(`✓ Hoàn ví đúng: ${okRefund}`);

    // 6. Cleanup: rút lại 200k đã nạp (về số dư đầu) + xoá đơn test
    if (balAfterCancel >= 200000) {
        await j('POST', `/api/web2/wallets/${PHONE}/withdraw`, {
            amount: 200000,
            referenceType: 'test-cleanup',
            referenceId: code,
            note: 'TEST hoàn tác nạp',
        });
    }
    await j('DELETE', `/api/native-orders/${code}`).catch(() => {});
    w = await j('GET', `/api/web2/wallets/by-phone/${PHONE}`);
    console.log(`\nCleanup xong. Ví cuối: ${fmt(Number(w.data?.data?.balance) || 0)}₫`);

    const allPass = okDeduct && okBal && okPaid && okRefund;
    console.log(`\n═══ ${allPass ? '✅ TẤT CẢ PASS' : '❌ CÓ FAIL'} ═══`);
    process.exit(allPass ? 0 : 1);
})();
