// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2SoOrderUtils — 1 NGUỒN parse/gom item "đã nhận hàng" của Sổ Order.
//
// Lý do (dedup, 2026-06-19): logic flatten so-order (tabs→shipments→rows) +
// gom theo ĐƠN (NCC + shipment) đang nằm trong purchase-refund-api.js
// (loadSoOrderReceivedItems) + purchase-refund-state.js (_orderGroupKey).
// supplier-debt cũng cần cùng grouping. Gom 1 nguồn để chống over-refund
// thống nhất — 1 "đơn" = 1 lần "Tạo Đơn Hàng" = 1 shipment (KHÔNG gộp NCC).
//
// ⚠ Grouping phải KHỚP CHÍNH XÁC purchase-refund (powers over-refund guard):
//   orderGroupKey(it) = `${supplier}::${shipmentId||''}`
//
// KHÔNG auto-load (feature-specific) — trang Sổ Order/trả hàng load tường minh.
//
// API:
//   Web2SoOrderUtils.orderGroupKey(item)         → "NCC::shipmentId"
//   Web2SoOrderUtils.parseReceivedItems(soData)  → array phẳng (1 row/dòng)
//        opts thứ 2: { onlyReceived: bool } (mặc định false — KHÔNG lọc stock;
//        truyền productByKey/productLookup để biết stock thì lọc onlyReceived)
//   Web2SoOrderUtils.groupByOrder(items)         → Map(orderGroupKey → {items,…})
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2SoOrderUtils) return;

    // 2026-06-07: 1 "đơn" = 1 shipment/đợt trong Sổ Order. Group theo
    // (NCC + shipment) để SP tạo ở đợt khác tách nhóm riêng dù cùng NCC.
    // PHẢI khớp purchase-refund-state._orderGroupKey (over-refund protection).
    function orderGroupKey(it) {
        return (it && it.supplier ? it.supplier : '') + '::' + ((it && it.shipmentId) || '');
    }

    function _str(v) {
        return String(v == null ? '' : v).trim();
    }

    // Flatten so-order data (shape: { tabs: [{ id,label, shipments:[{ id,batch,
    // date, rows:[{ supplier, productName, variant, qty, price }] }] }] }) thành
    // mảng row phẳng. Mỗi item giữ ngữ cảnh đơn (supplier/shipmentId/shipBatch/
    // shipDate/tabLabel) cho groupByOrder. Bỏ row thiếu supplier+productName.
    function parseReceivedItems(soOrderData, opts) {
        var o = opts || {};
        var lookup = o.productLookup || o.productByKey || null; // (name,variant)→product
        var norm =
            o.normalize ||
            function (s) {
                return _str(s).toLowerCase();
            };
        var out = [];
        if (!soOrderData || !Array.isArray(soOrderData.tabs)) return out;
        for (var t = 0; t < soOrderData.tabs.length; t++) {
            var tab = soOrderData.tabs[t] || {};
            var shipments = Array.isArray(tab.shipments) ? tab.shipments : [];
            for (var s = 0; s < shipments.length; s++) {
                var sh = shipments[s] || {};
                var rows = Array.isArray(sh.rows) ? sh.rows : [];
                for (var r = 0; r < rows.length; r++) {
                    var row = rows[r] || {};
                    var supplier = _str(row.supplier);
                    var productName = _str(row.productName || row.name);
                    if (!supplier || !productName) continue;
                    var variant = _str(row.variant);
                    var matched = null;
                    if (lookup) {
                        var key = norm(productName) + '|' + norm(variant);
                        matched = typeof lookup.get === 'function' ? lookup.get(key) : lookup[key];
                        if (!matched && o.onlyReceived) continue; // chưa sync web2_products
                    }
                    var stock = matched ? Number(matched.stock || 0) : null;
                    if (o.onlyReceived && (stock == null || stock <= 0)) continue; // chưa nhận hàng

                    out.push({
                        supplier: supplier,
                        shipmentId: sh.id != null ? sh.id : '',
                        shipBatch: sh.batch || '',
                        shipDate: sh.date || '',
                        tabLabel: tab.label || tab.id || '',
                        code: matched ? matched.code : row.code || '',
                        name: matched ? matched.name : productName,
                        productName: productName,
                        variant: matched ? matched.variant || variant : variant,
                        imageUrl: matched ? matched.imageUrl || '' : '',
                        stock: stock,
                        qty: Number(row.qty || 0),
                        price: Number((matched && matched.price) || row.price || 0),
                    });
                }
            }
        }
        return out;
    }

    // Gom mảng item phẳng theo orderGroupKey → Map. Mỗi nhóm: { key, supplier,
    // shipmentId, shipBatch, shipDate, tabLabel, items[], totalQty }.
    function groupByOrder(items) {
        var map = new Map();
        var list = Array.isArray(items) ? items : [];
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            if (!it) continue;
            var k = orderGroupKey(it);
            var g = map.get(k);
            if (!g) {
                g = {
                    key: k,
                    supplier: it.supplier || '',
                    shipmentId: it.shipmentId || '',
                    shipBatch: it.shipBatch || '',
                    shipDate: it.shipDate || '',
                    tabLabel: it.tabLabel || '',
                    items: [],
                    totalQty: 0,
                };
                map.set(k, g);
            }
            g.items.push(it);
            g.totalQty += Number(it.qty || 0);
        }
        return map;
    }

    global.Web2SoOrderUtils = {
        orderGroupKey: orderGroupKey,
        parseReceivedItems: parseReceivedItems,
        groupByOrder: groupByOrder,
    };
})(typeof window !== 'undefined' ? window : globalThis);
