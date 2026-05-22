// #Note: WEB2.0 module.
// F02 — Supplier aging buckets endpoint.
//
// LƯU Ý DATA SOURCE (WEB 2.0):
//   - Web 2.0 nguồn data NCC là Firestore `so_order_v2/main` + `supplier_wallet_v1/main`
//     (cùng pattern với trang supplier-debt hiện tại).
//   - Bảng Postgres `purchase_orders` thuộc Web 1.0 (trang /purchase-orders/) — KHÔNG đọc.
//
// Backend endpoint này hiện chỉ trả placeholder empty. Frontend supplier-aging
// sẽ tự đọc Firestore + tính aging client-side qua helper `Web2Aging.bucketByAge`.

const express = require('express');
const router = express.Router();

router.get('/summary', async (req, res) => {
    res.json({
        success: true,
        ref: (req.query.ref ? new Date(req.query.ref) : new Date()).toISOString(),
        buckets: { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 },
        suppliers: [],
        note: 'Web 2.0 không đọc purchase_orders (Web 1.0). Frontend tự tính từ Firestore so_order_v2 + supplier_wallet_v1.',
    });
});

module.exports = router;
