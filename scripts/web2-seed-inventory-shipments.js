#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — seed inventory_shipments (supplier-debt) theo kho SP.
//
// Tạo data ảo cho module Theo dõi nhập hàng (inventory_shipments) → supplier-debt/
// aging/360. POST /api/v2/inventory-tracking/shipments (Render direct, web2Db sau
// khi inventory-tracking chuyển web2Db). 1 shipment/NCC, san_pham từ kho, thanh
// toán 1 phần → debt khác nhau.
//
// Usage: node scripts/web2-seed-inventory-shipments.js [--dry]

const RENDER = 'https://n2store-fallback.onrender.com';
const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const DRY = process.argv.includes('--dry');

// supplier name → stt_ncc + ngày + tỉ lệ đã thanh toán (debt scenario).
// ⚠ thanh_toan_ck share theo group (ngay_di_hang, dot_so) → MỖI NCC ngày RIÊNG
// để payment không lẫn sang NCC khác.
const NCC = {
    'HÀ NỘI': { stt: 1, date: '2026-06-01', paidRatio: 0.5 },
    'HƯƠNG CHÂU': { stt: 2, date: '2026-06-02', paidRatio: 1.0 }, // trả đủ
    'QUẢNG CHÂU': { stt: 3, date: '2026-06-03', paidRatio: 0.3 },
    ADIDAS: { stt: 4, date: '2026-06-04', paidRatio: 0 }, // chưa trả
    B4: { stt: 5, date: '2026-06-05', paidRatio: 0.7 },
};

function colorFromName(name) {
    const a = String(name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/Đ/g, 'D')
        .toUpperCase();
    for (const c of [
        'XANH DUONG',
        'XANH LA',
        'XANH',
        'DEN',
        'TRANG',
        'DO',
        'XAM',
        'BE',
        'HONG',
        'VANG',
        'NAU',
    ])
        if (a.includes(c)) return c;
    return '';
}

async function fetchProducts() {
    const r = await fetch(`${WORKER}/api/web2-products/list?page=1&limit=200`);
    const j = await r.json();
    return j.data || j.items || j.products || j.records || [];
}

function buildShipment(supplier, items) {
    const meta = NCC[supplier];
    const san_pham = items.map((p, i) => {
        const soLuong = Math.max(1, Math.min(Number(p.stock) || 1, 2 + (i % 3)));
        const donGia = Number(p.originalPrice) || 0;
        return {
            maSP: p.code,
            tenSP: p.name,
            moTa: p.name,
            mauSac: colorFromName(p.name),
            soMau: 1,
            soLuong,
            donGia,
            giaDonVi: donGia,
            thanhTien: donGia * soLuong,
            anhSanPham: p.imageUrl || '',
        };
    });
    const tong_tien_hd = san_pham.reduce((s, x) => s + x.thanhTien, 0);
    const tong_mon = san_pham.reduce((s, x) => s + x.soLuong, 0);
    const tong_chi_phi = Math.round(tong_tien_hd * 0.05);
    const grand = tong_tien_hd + tong_chi_phi;
    const paid = Math.round(grand * meta.paidRatio);
    const thanh_toan_ck =
        paid > 0
            ? [
                  {
                      id: 'tt_' + meta.stt,
                      ngayTT: meta.date,
                      soTienTT: paid,
                      amount: paid,
                      ghiChu: 'Trả lần 1',
                  },
              ]
            : [];
    const kien = san_pham.length;
    return {
        stt_ncc: meta.stt,
        ten_ncc: supplier,
        ngay_di_hang: meta.date,
        // dot_so RIÊNG mỗi NCC: POST inherit thanh_toan_ck theo `WHERE dot_so=$1`
        // (không theo ngày/NCC) → dùng chung dot_so sẽ lẫn payment. stt = dot_so duy nhất.
        dot_so: meta.stt,
        kien_hang: [{ stt: 1, soKg: kien }],
        tong_kien: 1,
        tong_kg: kien,
        san_pham,
        tong_tien_hd,
        tong_mon,
        chi_phi_hang_ve: [{ loai: 'Vận chuyển', soTien: tong_chi_phi }],
        tong_chi_phi,
        thanh_toan_ck,
        ti_gia: 0,
        ghi_chu: 'Data ảo seed theo kho SP',
        anh_hoa_don: [],
    };
}

async function main() {
    const products = await fetchProducts();
    console.log(`Kho: ${products.length} SP`);
    const bySupplier = {};
    for (const p of products)
        (bySupplier[(p.supplier || '').trim()] = bySupplier[(p.supplier || '').trim()] || []).push(
            p
        );

    const shipments = [];
    for (const [sup, items] of Object.entries(bySupplier)) {
        if (!NCC[sup] || !items.length) continue;
        shipments.push(buildShipment(sup, items));
    }
    console.log(`Build ${shipments.length} shipments:`);
    for (const s of shipments) {
        const grand = s.tong_tien_hd + s.tong_chi_phi;
        const paid = s.thanh_toan_ck.reduce((x, t) => x + t.amount, 0);
        console.log(
            `  stt ${s.stt_ncc} ${s.ten_ncc.padEnd(11)} | ${s.san_pham.length} SP | HĐ ${s.tong_tien_hd.toLocaleString()} +CP ${s.tong_chi_phi.toLocaleString()} | trả ${paid.toLocaleString()} | nợ ${(grand - paid).toLocaleString()}`
        );
    }

    if (DRY) {
        console.log('[dry] không POST.');
        return;
    }
    let ok = 0;
    for (const s of shipments) {
        const r = await fetch(`${RENDER}/api/v2/inventory-tracking/shipments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.success !== false) {
            ok++;
            console.log(`  ✓ POST stt ${s.stt_ncc} ${s.ten_ncc}`);
        } else {
            console.log(`  ✗ stt ${s.stt_ncc}: ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
        }
    }
    console.log(`\nSeeded ${ok}/${shipments.length} shipments.`);
    process.exit(ok === shipments.length ? 0 : 2);
}

main().catch((e) => {
    console.error('[seed-inventory] fatal:', e.message);
    process.exit(1);
});
