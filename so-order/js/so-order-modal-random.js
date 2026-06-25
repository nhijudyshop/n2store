// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — DEV/TEST random data generators (fillModalRandom / generateRandomOrders). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // =====================================================================
    // DEV/TEST — sinh dữ liệu ngẫu nhiên. 2 lối vào:
    //   • Nút "Điền ngẫu nhiên" trong modal Tạo Đơn Hàng → fillModalRandom()
    //   • Nút "Tạo data ngẫu nhiên" trên thanh công cụ → generateRandomOrders(n)
    // Chỉ tạo đơn NHÁP (Web 2.0 beta) để test nhanh — KHÔNG dùng cho data thật.
    // generateRandomOrders đi qua đúng luồng handleOrderSubmit (shipment dedup,
    // invoiceGroupId, sync Kho SP, auto-create NCC) để giống thao tác tay 100%.
    // =====================================================================
    SO._RAND = {
        products: [
            'ÁO THUN TRƠN',
            'ÁO SƠ MI LỤA',
            'QUẦN JEAN ỐNG RỘNG',
            'VÁY HOA NHÍ',
            'ÁO KHOÁC DÙ',
            'CHÂN VÁY XẾP LY',
            'SET ÁO DÀI CÁCH TÂN',
            'ÁO HOODIE NỈ',
            'QUẦN SHORT KAKI',
            'ĐẦM MAXI ĐI BIỂN',
            'ÁO BLAZER',
            'QUẦN TÂY CẠP CAO',
        ],
        // Fallback khi Kho Biến Thể chưa load. Ưu tiên lấy biến thể THẬT từ
        // Web2VariantsCache (xem _variantPools) để data random LUÔN dùng màu/size
        // đã đăng ký → mã SP encode đủ màu/size, không sinh "Xanh Navy" lạ.
        colors: ['Trắng', 'Đen', 'Đỏ', 'Be', 'Hồng', 'Vàng', 'Xám'],
        sizes: ['S', 'M', 'L', 'XL', 'Freesize'],
        // NCC (nhà cung cấp) — KHÔNG dùng HÀ NỘI/HƯƠNG CHÂU (đó là ĐỊA DANH/tab Sổ
        // Order → field region, KHÔNG phải NCC). Tránh nhầm địa danh thành NCC.
        suppliers: ['XƯỞNG SỈ A', 'KHO TÂN BÌNH', 'QUẢNG CHÂU', 'XƯỞNG MAY B'],
    };
    // Lấy pool màu/size từ Kho Biến Thể THẬT (group "Màu" / "Size"|"Cỡ"). Đảm bảo
    // mọi biến thể random đều có trong cache → findByValueExact khớp → mã encode đủ
    // màu/size. Cache rỗng → fallback _RAND hardcoded.
    SO._variantPools = function _variantPools() {
        const all = (window.Web2VariantsCache?.getAll && window.Web2VariantsCache.getAll()) || [];
        const colors = [];
        const sizes = [];
        for (const v of all) {
            const val = String(v.value || '').trim();
            if (!val) continue;
            const g = (v.groupName || '').toLowerCase();
            if (g.includes('size') || g.includes('cỡ') || g.includes('co')) sizes.push(val);
            else if (g.includes('màu') || g.includes('mau')) colors.push(val);
        }
        return {
            colors: colors.length ? colors : SO._RAND.colors,
            sizes: sizes.length ? sizes : SO._RAND.sizes,
        };
    };
    SO._rPick = function _rPick(a) {
        return a[Math.floor(Math.random() * a.length)];
    };
    SO._rInt = function _rInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    // Ảnh ngẫu nhiên cho data test = Lorem Picsum theo SEED (free, KHÔNG cần key, chỉ là
    // URL string → không fetch, hiển thị thẳng trong <img>). Cùng seed → CÙNG ảnh (ổn định
    // qua mỗi lần renderModalRows, không nhấp nháy); seed khác → ảnh khác. Seed-based nên
    // KHÔNG rot (không phụ thuộc photo id cụ thể). CDN Cloudflare → nhanh/ổn ở VN.
    // Lỗi tải (host chặn / offline) → <img onerror> tự đổi sang placeholder SVG data-URI
    // LOCAL (không cần mạng → luôn hiển thị, không bao giờ ra icon ảnh vỡ). Xem so-order-modal-image.js.
    SO._rImg = function _rImg(seed, w, h) {
        return `https://picsum.photos/seed/${encodeURIComponent(String(seed))}/${w || 400}/${h || 400}`;
    };
    SO._randomRow = function _randomRow(isVnd, rowSeed) {
        const cost = isVnd ? SO._rInt(3, 30) * 10000 : SO._rInt(20, 300);
        let sell = cost * (1.5 + Math.random());
        sell = isVnd ? Math.round(sell / 1000) * 1000 : Math.round(sell);
        const pools = SO._variantPools();
        return SO._newModalRow({
            productName: SO._rPick(SO._RAND.products),
            variant: `${SO._rPick(pools.colors)} / ${SO._rPick(pools.sizes)}`,
            qty: SO._rInt(1, 50),
            costPrice: cost,
            sellPrice: Math.max(sell, cost),
            productImage: SO._rImg(`so-${rowSeed || SO._rInt(1, 1e9)}`, 400, 400),
            // invoiceImage KHÔNG set ở đây → _newModalRow tự kế thừa SO.modalInvoiceImage
            // (đã set ở fillModalRandom TRƯỚC khi tạo rows) — ảnh hoá đơn là cấp ĐƠN.
        });
    };

    // Điền dữ liệu ngẫu nhiên vào modal Tạo Đơn Hàng đang mở (1-4 dòng SP + ảnh ngẫu nhiên).
    SO.fillModalRandom = function fillModalRandom() {
        const form = document.getElementById('soOrderForm');
        if (!form) return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const isVnd = (tab?.currency || 'VND') === 'VND';
        const eta = new Date(Date.now() + SO._rInt(3, 30) * 86400000);
        form.elements.supplier.value = SO._rPick(SO._RAND.suppliers);
        form.elements.shipBatch.value = String(SO._rInt(1, 9));
        form.elements.shipCaseCount.value = SO._rInt(1, 10);
        form.elements.shipWeightKg.value = SO._rInt(5, 80);
        form.elements.shipContractAmount.value = isVnd
            ? SO._rInt(50, 500) * 100000
            : SO._rInt(500, 5000);
        if (form.elements.shipExpectedDeliveryDate) {
            form.elements.shipExpectedDeliveryDate.value = eta.toISOString().slice(0, 10);
        }
        if (form.elements.note) form.elements.note.value = 'Đơn test ngẫu nhiên';
        // Ảnh hoá đơn ngẫu nhiên (Picsum seed, 600x400 ~ tỉ lệ ảnh scan hoá đơn). Mỗi lần
        // fill khác seed → ảnh khác. Set TRƯỚC khi tạo rows để rows kế thừa (cấp ĐƠN).
        const imgBatch = Date.now().toString(36);
        SO.modalInvoiceImage = SO._rImg(`so-inv-${imgBatch}`, 600, 400);
        SO.modalRows = Array.from({ length: SO._rInt(1, 4) }, (_, i) =>
            SO._randomRow(isVnd, `${imgBatch}-r${i}`)
        );
        SO.renderModalRows();
        SO.updateModalGrandTotals();
    };

    // Tạo nhiều đơn ngẫu nhiên — mỗi đơn 1 lô riêng (batch unique để không gộp).
    SO.generateRandomOrders = async function generateRandomOrders(count) {
        const n = Number(count) || 0;
        if (n <= 0) return;
        const btn = document.getElementById('soGenRandomBtn');
        if (btn) btn.disabled = true;
        try {
            for (let i = 0; i < n; i++) {
                SO.openOrderModal(null);
                SO.fillModalRandom();
                const form = document.getElementById('soOrderForm');
                form.elements.shipBatch.value = `T${Date.now().toString(36).slice(-3)}${i}`;
                form.requestSubmit();
                await new Promise((r) => setTimeout(r, 320));
            }
            SO.notify(`✓ Đã tạo ${n} đơn ngẫu nhiên`, 'success');
        } finally {
            if (btn) btn.disabled = false;
        }
    };
})();
