// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TABLE RENDERER - INVENTORY TRACKING
// Phase 3: Will be fully implemented
// =====================================================

// =====================================================
// UTILITIES
// =====================================================

/** Escape string for safe use in HTML attributes (onclick, title, data-*) */
function _escAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// =====================================================

const CHINESE_TO_VIETNAMESE = {
    // =====================================================
    // COLORS - MÀU SẮC (颜色)
    // =====================================================
    // Màu cơ bản
    黑色: 'Đen',
    黑: 'Đen',
    白色: 'Trắng',
    白: 'Trắng',
    红色: 'Đỏ',
    红: 'Đỏ',
    蓝色: 'Xanh dương',
    蓝: 'Xanh dương',
    绿色: 'Xanh lá',
    绿: 'Xanh lá',
    黄色: 'Vàng',
    黄: 'Vàng',
    紫色: 'Tím',
    紫: 'Tím',
    粉色: 'Hồng',
    粉红色: 'Hồng phấn',
    粉: 'Hồng',
    灰色: 'Xám',
    灰: 'Xám',
    棕色: 'Nâu',
    棕: 'Nâu',
    橙色: 'Cam',
    橙: 'Cam',
    桔色: 'Cam',
    橘色: 'Cam',

    // Màu đặc biệt / Hot trend
    咖啡色: 'Cà phê',
    咖色: 'Nâu cà phê',
    咖: 'Nâu cà phê',
    米色: 'Kem',
    米白色: 'Trắng kem',
    米白: 'Trắng kem',
    米: 'Kem',
    杏色: 'Hồng mơ',
    杏: 'Hồng mơ',
    酱色: 'Nâu đậm',
    酱红色: 'Đỏ nâu',
    酱: 'Nâu đậm',
    卡其色: 'Khaki',
    卡其: 'Khaki',
    驼色: 'Nâu lạc đà',
    驼: 'Lạc đà',
    藏青色: 'Xanh than',
    藏青: 'Xanh than',
    酒红色: 'Đỏ rượu vang',
    酒红: 'Đỏ rượu',
    墨绿色: 'Xanh rêu',
    墨绿: 'Xanh rêu',
    军绿色: 'Xanh quân đội',
    军绿: 'Xanh lính',
    焦糖色: 'Caramel',
    焦糖: 'Caramel',
    牛油果色: 'Xanh bơ',
    牛油果: 'Xanh bơ',
    奶白: 'Trắng sữa',
    奶油: 'Kem sữa',
    香槟色: 'Champagne',
    香槟: 'Champagne',
    银色: 'Bạc',
    银: 'Bạc',
    金色: 'Vàng gold',
    金: 'Vàng gold',
    玫红: 'Hồng cánh sen',
    玫瑰红: 'Hồng hoa hồng',
    宝蓝: 'Xanh hoàng gia',
    天蓝: 'Xanh da trời',
    湖蓝: 'Xanh hồ',
    雾蓝: 'Xanh sương mù',
    烟灰: 'Xám khói',
    炭灰: 'Xám than',
    花灰: 'Xám hoa',
    杂灰: 'Xám đốm',
    姜黄: 'Vàng nghệ',
    土黄: 'Vàng đất',
    芥末黄: 'Vàng mù tạt',

    // Tiền tố màu
    浅: 'Nhạt',
    深: 'Đậm',
    浅灰: 'Xám nhạt',
    深灰: 'Xám đậm',
    浅蓝: 'Xanh nhạt',
    深蓝: 'Xanh đậm',
    浅绿: 'Xanh lá nhạt',
    深绿: 'Xanh lá đậm',
    浅粉: 'Hồng nhạt',
    深粉: 'Hồng đậm',
    浅紫: 'Tím nhạt',
    深紫: 'Tím đậm',
    浅咖: 'Nâu nhạt',
    深咖: 'Nâu đậm',

    // Viết tắt màu (phổ biến trong hóa đơn viết tay)
    兰: 'Xanh dương', // Viết tắt của 蓝色

    // =====================================================
    // PATTERNS - HỌA TIẾT
    // =====================================================
    条: 'Sọc',
    条纹: 'Sọc',
    纹: 'Vân',
    格: 'Caro',
    格子: 'Caro',
    花: 'Hoa',
    碎花: 'Hoa nhỏ',
    大花: 'Hoa lớn',
    点: 'Chấm',
    波点: 'Chấm bi',
    印: 'In',
    印花: 'In hoa',
    刺绣: 'Thêu',
    绣花: 'Thêu hoa',
    山茶花: 'Hoa sơn trà',
    皇冠: 'Vương miện',
    字母: 'Chữ cái',
    数字: 'Số',
    卡通: 'Hoạt hình',

    // =====================================================
    // MATERIALS - CHẤT LIỆU (面料)
    // =====================================================
    棉: 'Cotton',
    纯棉: 'Cotton 100%',
    全棉: 'Cotton 100%',
    麻: 'Lanh',
    棉麻: 'Cotton lanh',
    丝: 'Lụa',
    真丝: 'Lụa thật',
    绒: 'Nhung',
    天鹅绒: 'Nhung thiên nga',
    金丝绒: 'Nhung vàng',
    毛: 'Len',
    羊毛: 'Len cừu',
    羊绒: 'Len cashmere',
    皮: 'Da',
    皮革: 'Da thuộc',
    革: 'Da thuộc',
    牛仔: 'Vải jean',
    雪纺: 'Voan',
    涤纶: 'Polyester',
    锦纶: 'Nylon',
    氨纶: 'Spandex',
    蕾丝: 'Ren',
    网纱: 'Lưới',
    针织: 'Dệt kim',
    梭织: 'Dệt thoi',
    弹力: 'Co giãn',

    // =====================================================
    // CLOTHING TYPES - LOẠI TRANG PHỤC (款式)
    // =====================================================
    // Áo
    上衣: 'Áo',
    T恤: 'Áo thun',
    T恤衫: 'Áo thun',
    衬衫: 'Áo sơ mi',
    衬衣: 'Áo sơ mi',
    外套: 'Áo khoác',
    夹克: 'Áo jacket',
    风衣: 'Áo măng tô',
    大衣: 'Áo khoác dài',
    棉衣: 'Áo cotton',
    棉袄: 'Áo bông',
    羽绒服: 'Áo phao',
    卫衣: 'Áo nỉ',
    毛衣: 'Áo len',
    针织衫: 'Áo len',
    打底衫: 'Áo lót',
    打底: 'Áo lót',
    马甲: 'Áo gile',
    背心: 'Áo ba lỗ',
    吊带: 'Dây đeo',
    吊带衫: 'Áo hai dây',
    西装: 'Vest',
    西服: 'Vest',
    开衫: 'Áo cardigan',

    // Quần
    裤: 'Quần',
    裤子: 'Quần',
    短裤: 'Quần short',
    长裤: 'Quần dài',
    牛仔裤: 'Quần jean',
    西裤: 'Quần tây',
    休闲裤: 'Quần casual',
    运动裤: 'Quần thể thao',
    阔腿裤: 'Quần ống rộng',
    喇叭裤: 'Quần ống loe',
    直筒裤: 'Quần ống đứng',
    九分裤: 'Quần 9 phân',
    七分裤: 'Quần 7 phân',
    五分裤: 'Quần 5 phân',
    打底裤: 'Quần legging',

    // Váy
    裙: 'Váy',
    裙子: 'Váy',
    连衣裙: 'Váy liền',
    半身裙: 'Chân váy',
    短裙: 'Váy ngắn',
    长裙: 'Váy dài',
    百褶裙: 'Váy xếp ly',
    包臀裙: 'Váy bút chì',
    A字裙: 'Váy chữ A',
    蓬蓬裙: 'Váy xòe',

    // Bộ đồ
    套装: 'Đồ bộ',
    两件套: 'Bộ 2 món',
    三件套: 'Bộ 3 món',
    四件套: 'Bộ 4 món',
    套: 'Bộ',
    睡衣: 'Đồ ngủ',
    家居服: 'Đồ mặc nhà',
    运动套装: 'Bộ thể thao',

    // Phụ kiện
    帽子: 'Mũ',
    围巾: 'Khăn choàng',
    手套: 'Găng tay',
    袜子: 'Tất',
    皮带: 'Thắt lưng',
    腰带: 'Dây lưng',
    包: 'Túi',
    手提包: 'Túi xách',
    单肩包: 'Túi đeo vai',
    斜挎包: 'Túi đeo chéo',
    双肩包: 'Balo',

    // =====================================================
    // DESIGN DETAILS - CHI TIẾT THIẾT KẾ (细节)
    // =====================================================
    // Cổ áo
    领: 'Cổ',
    圆领: 'Cổ tròn',
    V领: 'Cổ chữ V',
    高领: 'Cổ cao',
    翻领: 'Cổ lật',
    方领: 'Cổ vuông',
    一字领: 'Cổ ngang',
    娃娃领: 'Cổ búp bê',
    立领: 'Cổ đứng',
    半高领: 'Cổ lọ',
    堆堆领: 'Cổ đống',

    // Tay áo
    袖: 'Tay áo',
    长袖: 'Tay dài',
    短袖: 'Tay ngắn',
    七分袖: 'Tay 7 phân',
    无袖: 'Không tay',
    泡泡袖: 'Tay bồng',
    蝙蝠袖: 'Tay dơi',
    喇叭袖: 'Tay loe',
    灯笼袖: 'Tay lồng đèn',

    // Dáng / Kiểu
    短款: 'Dáng ngắn',
    中长款: 'Dáng trung',
    长款: 'Dáng dài',
    修身: 'Ôm body',
    宽松: 'Rộng',
    直筒: 'Ống đứng',
    交叉: 'Chéo',
    斜角: 'Xéo góc',
    系带: 'Dây buộc',
    拉链: 'Khoá kéo',
    纽扣: 'Khuy',
    扣子: 'Nút',
    铆钉: 'Đinh tán',
    流苏: 'Tua rua',
    荷叶边: 'Viền lượn sóng',
    木耳边: 'Viền bèo',
    蝴蝶结: 'Nơ',
    腰带: 'Đai lưng',
    口袋: 'Túi',
    开叉: 'Xẻ',
    褶皱: 'Xếp ly',
    收腰: 'Eo',

    // =====================================================
    // SIZES - KÍCH THƯỚC
    // =====================================================
    均码: 'Freesize',
    F: 'Freesize',
    均: 'Freesize',
    S码: 'Size S',
    M码: 'Size M',
    L码: 'Size L',
    XL码: 'Size XL',
    XXL码: 'Size XXL',
    大码: 'Size lớn',
    加大码: 'Size cực lớn',
    件: 'Cái',
    条: 'Chiếc',
    手: '1 ri',

    // =====================================================
    // ORDER STATUS - TÌNH TRẠNG ĐƠN HÀNG
    // =====================================================
    现货: 'Có sẵn',
    预售: 'Pre-order',
    欠货: 'Nợ hàng',
    退货: 'Trả hàng',
    拿货: 'Lấy hàng',
    补货: 'Bổ sung hàng',
    断货: 'Hết hàng',
    缺货: 'Thiếu hàng',

    // =====================================================
    // COMMON TERMS - TỪ THÔNG DỤNG
    // =====================================================
    色: '',
    款: 'Kiểu',
    新款: 'Mẫu mới',
    热卖: 'Bán chạy',
    爆款: 'Hot',
    苏: 'Tô',
    号: 'Số',
    小计: 'Tạm tính',
    合计: 'Tổng cộng',
    销售合计: 'Tổng bán',
    数量: 'Số lượng',
    单价: 'Đơn giá',
    金额: 'Thành tiền',
};

/**
 * Translate Chinese text to Vietnamese
 */
function translateToVietnamese(text) {
    if (!text) return text;

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE).sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

/**
 * Format color details for display in table
 * @param {Array} mauSac - Array of {mau, soLuong} objects
 * @returns {string} Formatted color string
 */
function formatColors(mauSac) {
    if (!mauSac || mauSac.length === 0) {
        return '<span class="text-muted">-</span>';
    }
    return mauSac.map((c) => `${c.mau} - SL ${c.soLuong}`).join(', ');
}

/**
 * Toggle shipment card expand/collapse — persist state via UIState
 */
function toggleShipmentCard(card) {
    const body = card.querySelector('.shipment-body');
    const chevron = card.querySelector('.shipment-chevron');
    const isCollapsed = body.classList.contains('hidden');

    if (isCollapsed) {
        body.classList.remove('hidden');
        card.classList.remove('collapsed');
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        if (window.UIState && card.dataset.id) window.UIState.setExpanded(card.dataset.id, true);
    } else {
        body.classList.add('hidden');
        card.classList.add('collapsed');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (window.UIState && card.dataset.id) window.UIState.setExpanded(card.dataset.id, false);
    }
}

/**
 * Render shipments list - each card collapsed by default
 */
function renderShipments(shipments) {
    const container = document.getElementById('shipmentsContainer');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    if (!container) return;

    // Hide loading
    if (loadingState) loadingState.classList.add('hidden');

    // Clear previous content (except loading/empty states)
    const cards = container.querySelectorAll('.shipment-card');
    cards.forEach((card) => card.remove());

    // Show empty state if no data
    if (!shipments || shipments.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Cleanup stale ids before render
    if (window.UIState && typeof window.UIState.pruneExpanded === 'function') {
        window.UIState.pruneExpanded(shipments.map((s) => s.id));
    }

    // Render each shipment (expand state loaded from UIState, default collapsed)
    shipments.forEach((shipment) => {
        const card = createShipmentCard(shipment);
        container.appendChild(card);
    });

    // Re-initialize icons
    if (window.lucide) {
        lucide.createIcons();
    }

    // Apply persisted details columns visibility to all tables
    if (window.UIState && window.UIState.isDetailsVisible()) {
        _applyDetailColsVisibility(true);
    }

    // Fetch and render notes for visible invoices
    if (typeof NoteManager !== 'undefined') {
        NoteManager.onTableRendered();
    }

    // Refresh the horizontal stats bar (Tổng KG / HĐ / CP / TT / CÒN LẠI)
    updateInventoryStatsBar();
}

/**
 * Aggregate totals across ALL đợt and push to the header stats bar.
 * - Tổng KG / HĐ / CP: summed from shipments (one per (ngày, dotSo) group).
 * - Tổng TT / CÒN LẠI: summed from dotEntries (one per dotSo) so payments aren't double-counted
 *   when one đợt spans multiple dates.
 */
function updateInventoryStatsBar() {
    const bar = document.getElementById('inventoryStatsBar');
    if (!bar) return;
    // Gate by permission — keep bar hidden if user lacks access (double check
    // even though applyToUI already hides it, in case DOM was inspected).
    if (!permissionHelper?.can('view_thanhToanCK')) {
        bar.style.display = 'none';
        return;
    }

    const shipments = globalState.shipments || [];
    let tongKg = 0,
        tongHD = 0,
        tongCP = 0;
    let tongHDVnd = 0,
        tongCPVnd = 0;
    shipments.forEach((s) => {
        const hd = parseFloat(s.tongTienHoaDon) || 0;
        const cp = parseFloat(s.tongChiPhi) || 0;
        const tg = parseFloat(s.tiGia) || 0;
        tongKg += parseFloat(s.tongKg) || 0;
        tongHD += hd;
        tongCP += cp;
        tongHDVnd += hd * tg;
        tongCPVnd += cp * tg;
    });

    let tongTT = 0,
        tongTTVnd = 0;
    if (typeof getAllDotsAggregated === 'function') {
        const dotEntries = getAllDotsAggregated();
        dotEntries.forEach((e) => {
            const payments = Array.isArray(e.thanhToanCK) ? e.thanhToanCK : [];
            const tg = parseFloat(e.tiGia) || 0;
            const tt = payments.reduce((sum, p) => sum + (parseFloat(p.soTienTT) || 0), 0);
            tongTT += tt;
            tongTTVnd += tt * tg;
        });
    }

    const conLai = tongTT - tongHD - tongCP;
    const conLaiVnd = tongTTVnd - tongHDVnd - tongCPVnd;

    const setVnd = (id, vnd) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = vnd ? `(${formatNumber(Math.round(vnd / 1000))})` : '';
    };

    const kgEl = document.getElementById('statTongKg');
    if (kgEl) kgEl.textContent = `${formatNumber(tongKg)}`;
    const hdEl = document.getElementById('statTongHD');
    if (hdEl) hdEl.textContent = formatNumber(tongHD);
    setVnd('statTongHDVnd', tongHDVnd);
    const cpEl = document.getElementById('statTongCP');
    if (cpEl) cpEl.textContent = formatNumber(tongCP);
    setVnd('statTongCPVnd', tongCPVnd);
    const ttEl = document.getElementById('statTongTT');
    if (ttEl) ttEl.textContent = formatNumber(tongTT);
    setVnd('statTongTTVnd', tongTTVnd);
    const conLaiEl = document.getElementById('statConLai');
    if (conLaiEl) {
        conLaiEl.textContent = formatNumber(conLai);
        const box = conLaiEl.closest('.stat-box');
        if (box) {
            box.classList.toggle('positive', conLai >= 0);
            box.classList.toggle('negative', conLai < 0);
        }
    }
    setVnd('statConLaiVnd', conLaiVnd);
}

/**
 * Create shipment card element
 */
function createShipmentCard(shipment) {
    const card = document.createElement('div');
    const wasExpanded = !!(window.UIState && window.UIState.isExpanded(shipment.id));
    card.className = 'shipment-card' + (wasExpanded ? '' : ' collapsed');
    card.dataset.id = shipment.id;

    const canEdit = permissionHelper?.can('edit_shipment');
    const canDelete = permissionHelper?.can('delete_shipment');
    const canViewCost = permissionHelper?.can('view_chiPhiHangVe');
    const canViewNote = permissionHelper?.can('view_ghiChuAdmin');

    // Build packages info string with checkboxes
    const packages = shipment.kienHang || [];
    const totalKg = packages.reduce((sum, p) => sum + (p.soKg || 0), 0);
    const canViewTT = permissionHelper?.can('view_thanhToanCK');
    const shipHD = parseFloat(shipment.tongTienHoaDon) || 0;
    const shipTiGia = parseFloat(shipment.tiGia) || 0;
    const shipHDVnd = shipHD * shipTiGia;
    const vndPart =
        shipHDVnd > 0
            ? ` <span class="ship-tong-hd-vnd">(${formatNumber(Math.round(shipHDVnd / 1000))})</span>`
            : '';
    const tongHDSuffix =
        canViewTT && shipHD > 0
            ? ` <span class="ship-tong-hd">| Tổng HĐ: <span class="ship-tong-hd-num">${formatNumber(shipHD)}</span>${vndPart}</span>`
            : '';
    let packagesInfo;
    if (packages.length > 0) {
        const packageWeightsHtml = packages
            .map((p, i) => {
                const received = !!p.daNhan;
                const receivedClass = received ? ' pkg-received' : '';
                const checkedAttr = received ? ' checked' : '';
                return (
                    `<label class="pkg-check-label" data-shipment="${shipment.id}" data-pkg-index="${i}" data-dot-id="${_escAttr(p._dotId || '')}" data-dot-kien-idx="${p._dotKienIdx ?? ''}">` +
                    `<input type="checkbox" class="pkg-check" onclick="event.stopPropagation(); togglePkgCheck(this)"${checkedAttr}>` +
                    `<span class="pkg-kg-text${receivedClass}">${p.soKg} KG</span></label>`
                );
            })
            .join(', ');
        const allChecked = packages.every((p) => !!p.daNhan);
        const checkAllAttr = allChecked ? ' checked' : '';
        packagesInfo =
            `${packages.length} Kiện : ${packageWeightsHtml} | Tổng ${formatNumber(totalKg)} KG${tongHDSuffix}` +
            `<label class="pkg-check-all-label" data-shipment="${shipment.id}">` +
            `<input type="checkbox" class="pkg-check-all" onclick="event.stopPropagation(); toggleAllPkgCheck(this)" title="Đánh dấu đã nhận toàn bộ"${checkAllAttr}>` +
            `</label>`;
    } else {
        packagesInfo = `0 Kiện${tongHDSuffix}`;
    }

    card.innerHTML = `
        <div class="shipment-header">
            <div class="shipment-date-packages">
                <i data-lucide="chevron-right" class="shipment-chevron"></i>
                <i data-lucide="calendar"></i>
                <span class="shipment-date-text">Ngày giao: ${formatDateDisplay(shipment.ngayDiHang)}</span>
                <span class="shipment-separator">-</span>
                <span class="shipment-dot-badge" style="background:#EEF2FF;color:#4338CA;padding:2px 8px;border-radius:6px;font-weight:600;font-size:12px">Đợt ${shipment.dotSo || 1}</span>
                <span class="shipment-separator">-</span>
                <span class="shipment-packages-badge">
                    <i data-lucide="box"></i>
                    ${packagesInfo}
                </span>
            </div>
            <div class="shipment-actions">
                ${
                    canEdit
                        ? `
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); editShipment('${shipment.id}')" title="Sửa">
                        <i data-lucide="edit"></i>
                    </button>
                `
                        : ''
                }
                ${
                    canDelete
                        ? `
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); deleteShipment('${shipment.id}')" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                `
                        : ''
                }
                <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); updateShortage('${shipment.id}')" title="Cập nhật thiếu">
                    <i data-lucide="clipboard-check"></i>
                </button>
            </div>
        </div>
        <div class="shipment-body${wasExpanded ? '' : ' hidden'}">
            ${renderInvoicesSection(shipment)}
            ${canViewNote && shipment.ghiChuAdmin ? renderAdminNoteSection(shipment) : ''}
        </div>
    `;

    // Apply chevron rotation for expanded cards (icons render async via lucide)
    if (wasExpanded) {
        requestAnimationFrame(() => {
            const chevron = card.querySelector('.shipment-chevron');
            if (chevron) chevron.style.transform = 'rotate(90deg)';
        });
    }

    // Click header to toggle body
    const header = card.querySelector('.shipment-header');
    header.addEventListener('click', () => toggleShipmentCard(card));

    return card;
}

/**
 * Render packages section
 */
function renderPackagesSection(shipment) {
    const packages = shipment.kienHang || [];
    const totalKg = packages.reduce((sum, p) => sum + (p.soKg || 0), 0);

    // Render badges inline with header
    const packageBadges = packages
        .map(
            (p) => `
        <span class="package-badge">
            <i data-lucide="package"></i>
            Kiện ${p.stt}: ${p.soKg} kg
        </span>
    `
        )
        .join('');

    return `
        <div class="shipment-section packages-inline">
            <div class="packages-header-inline">
                <i data-lucide="box"></i>
                <span class="packages-summary">KIỆN HÀNG: ${packages.length} kiện | Tổng: ${formatNumber(totalKg)} kg</span>
                <div class="packages-badges-inline">
                    ${packageBadges}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render invoices section with shipping costs as column
 */
function renderInvoicesSection(shipment) {
    const invoices = shipment.hoaDon || [];
    const costs = shipment.chiPhiHangVe || [];
    const canViewCost = permissionHelper?.can('view_chiPhiHangVe');

    if (invoices.length === 0) {
        return `
            <div class="shipment-section">
                <div class="section-title">
                    <i data-lucide="receipt"></i>
                    <span>HÓA ĐƠN NHÀ CUNG CẤP</span>
                </div>
                <p style="color: var(--gray-500);">Chưa có hóa đơn</p>
            </div>
        `;
    }

    // Support both tongTienHD (new) and tongTien (old) field names
    const totalAmount = invoices.reduce((sum, hd) => sum + (hd.tongTienHD || hd.tongTien || 0), 0);
    // Calculate tongMon from products if not available
    const totalItems = invoices.reduce((sum, hd) => {
        if (hd.tongMon) return sum + hd.tongMon;
        // Fallback: calculate from products
        const products = hd.sanPham || [];
        return sum + products.reduce((pSum, p) => pSum + (p.soLuong || 0), 0);
    }, 0);
    const totalShortage = invoices.reduce((sum, hd) => sum + (hd.soMonThieu || 0), 0);
    const totalCost = costs.reduce((sum, c) => sum + (c.soTien || 0), 0);

    // Build invoice rows with product lines
    // Costs are for the entire shipment, listed sequentially by absolute row index
    let allRows = [];
    let absoluteRowIdx = 0; // Track row index across all invoices for cost assignment

    invoices.forEach((hd, invoiceIdx) => {
        const products = hd.sanPham || [];
        const imageCount = hd.anhHoaDon?.length || 0;
        const invoiceClass = invoiceIdx % 2 === 0 ? 'invoice-even' : 'invoice-odd';

        // Calculate tongMon for this invoice (fallback from products if not set)
        const invoiceTongMon = hd.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
        const invoiceTongTienHD = hd.tongTienHD || hd.tongTien || 0;

        // Check if invoice has subInvoice
        const hasSubInvoice = !!hd.subInvoice;

        if (products.length === 0) {
            // No products - single row
            const costItem =
                canViewCost && absoluteRowIdx < costs.length ? costs[absoluteRowIdx] : null;
            allRows.push(
                renderProductRow({
                    invoiceIdx,
                    invoiceClass,
                    sttNCC: hd.sttNCC,
                    tenNCC: hd.tenNCC || '',
                    productIdx: 0,
                    product: null,
                    isFirstRow: true,
                    isLastRow: true,
                    rowSpan: 1,
                    tongTienHD: invoiceTongTienHD,
                    tongMon: invoiceTongMon,
                    soMonThieu: hd.soMonThieu,
                    imageCount,

                    ghiChu: hd.ghiChu,
                    shipmentId: shipment.id,
                    invoiceId: hd.id || invoiceIdx,
                    costItem,
                    canViewCost,
                    hasSubInvoice,
                    subInvoice: hd.subInvoice,
                    anhHoaDon: hd.anhHoaDon,
                    batchNgay: shipment.ngayDiHang,
                    batchDotSo: shipment.dotSo || 1,
                })
            );
            absoluteRowIdx++;
        } else {
            // Multiple products - cost assigned by absolute row index
            products.forEach((product, productIdx) => {
                const costItem =
                    canViewCost && absoluteRowIdx < costs.length ? costs[absoluteRowIdx] : null;
                allRows.push(
                    renderProductRow({
                        invoiceIdx,
                        invoiceClass,
                        sttNCC: hd.sttNCC,
                        tenNCC: hd.tenNCC || '',
                        productIdx,
                        product,
                        isFirstRow: productIdx === 0,
                        isLastRow: productIdx === products.length - 1,
                        rowSpan: products.length,
                        tongTienHD: invoiceTongTienHD,
                        tongMon: invoiceTongMon,
                        soMonThieu: hd.soMonThieu,
                        imageCount,

                        ghiChu: hd.ghiChu,
                        shipmentId: shipment.id,
                        invoiceId: hd.id || invoiceIdx,
                        costItem,
                        canViewCost,
                        hasSubInvoice,
                        subInvoice: hd.subInvoice,
                        anhHoaDon: hd.anhHoaDon,
                    })
                );
                absoluteRowIdx++;
            });
        }
    });

    return `
        <div class="shipment-section shipment-table-section">
            <div class="table-container">
                <table class="invoice-table invoice-table-bordered detail-cols-hidden">
                    <thead>
                        <tr>
                            <th class="col-ncc">NCC</th>
                            <th class="col-stt">STT</th>
                            <th class="col-sku">Mã hàng <span class="detail-toggle" onclick="toggleDetailColumns(this)" title="Hiện/Ẩn Mô tả & Chi tiết">&#9654;</span></th>
                            <th class="col-desc">Mô tả</th>
                            <th class="col-colors">Chi tiết màu sắc</th>
                            <th class="col-qty text-center">Tổng SL</th>
                            <th class="col-price text-right">Đơn giá</th>
                            <th class="col-amount text-right">Tiền HĐ</th>
                            <th class="col-total text-center">Tổng Món</th>
                            <th class="col-shortage text-center">Thiếu</th>
                            <th class="col-image text-center">Ảnh</th>
                            <th class="col-invoice-note">Ghi Chú</th>
                            ${canViewCost ? '<th class="col-cost text-right">Chi Phí</th>' : ''}
                            ${canViewCost ? '<th class="col-cost-note">Ghi Chú CP</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${allRows.join('')}
                    </tbody>
                    <tfoot>
                        <tr class="total-row">
                            <td class="tfoot-total-label text-right" colspan="5"><strong>TỔNG:</strong></td>
                            <td class="text-right"><strong class="total-amount">${formatNumber(totalAmount)}</strong></td>
                            <td class="text-center"><strong class="total-items">${formatNumber(totalItems)}</strong></td>
                            <td class="text-center total-shortage-cell"><strong>${totalShortage > 0 ? formatNumber(totalShortage) : '-'}</strong></td>
                            <td></td>
                            <td></td>
                            ${canViewCost ? `<td class="text-right cost-total-cell"><strong class="total-cost">${formatNumber(totalCost)}</strong></td>` : ''}
                            ${canViewCost ? '<td class="cost-note-cell"></td>' : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/**
 * Render image cell per invoice (NCC-based, merged with rowSpan)
 * Images come from independent product_images table, mapped by NCC
 * Only rendered on first row of each invoice (isFirstRow), spans all product rows
 */
function _renderImageCell(
    isFirstRow,
    rowSpan,
    sttNCC,
    borderClass,
    invoiceImages,
    invoiceId,
    batchNgay,
    batchDotSo
) {
    if (!isFirstRow) return ''; // Merged cell — skip non-first rows

    // Map productImages by (batch date, đợt, sttNCC) — real NCCs only (< 900).
    // sttNCC >= 900 = auto-assigned for name-only NCCs — no mapping.
    const productImages =
        sttNCC > 0 && sttNCC < 900 ? getProductImagesForNcc(sttNCC, batchNgay, batchDotSo) : [];
    const invoiceImgs = invoiceImages || [];
    const allImages = [...productImages];
    for (const url of invoiceImgs) {
        if (!allImages.includes(url)) allImages.push(url);
    }
    const count = allImages.length;
    const rowspanBorderClass =
        borderClass.replace('border-bottom-', 'border-bottom-') || borderClass;

    const addBtn = invoiceId
        ? `<span class="image-add-hint" onclick="addTableImage('${invoiceId}')" title="Thêm ảnh"><i data-lucide="plus" style="width:14px;height:14px;color:var(--gray-400)"></i></span>`
        : '';

    if (count > 0) {
        const thumbs = allImages
            .map((url) => {
                const delBtn =
                    invoiceId && invoiceImgs.includes(url)
                        ? `<button class="cell-img-del" onclick="event.stopPropagation(); removeTableImage('${invoiceId}', '${url}')" title="Xóa ảnh">&times;</button>`
                        : '';
                return `<div class="cell-img-wrap" onmouseenter="_positionImgZoom(this)" onmouseleave="_hideImgZoom(this)"><img src="${url}" class="cell-img-thumb" alt="NCC ${sttNCC}" onclick="openImageLightbox('${url}')"><div class="cell-img-zoom"><img src="${url}" alt="NCC ${sttNCC}"></div>${delBtn}</div>`;
            })
            .join('');

        return `
            <td class="col-image ${rowspanBorderClass}" rowspan="${rowSpan}">
                <div class="cell-img-list">
                    ${thumbs}
                    ${addBtn}
                </div>
            </td>
        `;
    }

    return `
        <td class="col-image text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
            ${addBtn || `<span class="image-add-hint" onclick="ImageManager.open()" title="Thêm ảnh"><i data-lucide="plus" style="width:14px;height:14px;color:var(--gray-400)"></i></span>`}
        </td>
    `;
}

/**
 * Render a single product row
 */
function renderProductRow(opts) {
    const {
        invoiceIdx,
        invoiceClass,
        sttNCC,
        tenNCC,
        productIdx,
        product,
        isFirstRow,
        isLastRow,
        rowSpan,
        tongTienHD,
        tongMon,
        soMonThieu,
        imageCount,
        ghiChu,
        shipmentId,
        invoiceId,
        costItem,
        canViewCost,
        hasSubInvoice,
        subInvoice,
        anhHoaDon,
        batchNgay,
        batchDotSo,
    } = opts;

    const rowClass = `${invoiceClass} ${isLastRow ? 'invoice-last-row' : ''}`;

    // Extract product details for new columns
    const maSP = product?.maSP || '-';
    const moTa = product?.moTa || '-';
    const colorDetails =
        product?.mauSac?.length > 0
            ? formatColors(product.mauSac)
            : product?.soMau
              ? `${product.soMau} màu`
              : '-';
    const tongSoLuong = product?.tongSoLuong || product?.soLuong || '-';
    const giaDonVi = product?.giaDonVi || 0;

    // Inline edit data attributes
    const editAttrs = product
        ? `data-invoice-id="${invoiceId}" data-product-idx="${productIdx}"`
        : '';

    // For rowspanned cells (rendered on first row), always apply invoice-border since their
    // bottom border appears at the end of their rowspan (which is the last row of invoice)
    // For non-rowspanned cells (STT, Products), only apply on last row
    const rowspanBorderClass = 'invoice-border';
    const borderClass = isLastRow ? 'invoice-border' : '';

    // Sub-invoice indicator and click handler
    const subInvoiceIndicator =
        hasSubInvoice && isFirstRow
            ? `<span class="sub-invoice-indicator" title="Có hóa đơn phụ - Click để xem">▼</span>`
            : '';
    const nccClickHandler =
        hasSubInvoice && isFirstRow
            ? `onclick="showSubInvoice('${shipmentId}', ${invoiceIdx}); event.stopPropagation();" style="cursor: pointer;"`
            : '';
    const nccClass = hasSubInvoice ? 'has-sub-invoice' : '';

    // Display NCC: show tenNCC name. If no name, show sttNCC number as fallback.
    // sttNCC is only used internally for productImages mapping.
    const nccDisplayName = tenNCC || String(sttNCC);
    const nccKey = _escAttr(nccDisplayName);
    const nccDone = _isNccDone(shipmentId, nccDisplayName);
    const nccCheckbox = `<label class="ncc-done-label" onclick="event.stopPropagation()"><input type="checkbox" class="ncc-done-check" data-ncc-key="${nccKey}" ${nccDone ? 'checked' : ''} onchange="toggleNccDone('${_escAttr(shipmentId)}', '${nccKey}', this.checked)"></label>`;
    const nccDeleteBtn = `<button class="btn-del-ncc" onclick="event.stopPropagation(); window.deleteNccInvoice('${_escAttr(invoiceId)}')" title="Xóa NCC ${nccKey}"><i data-lucide="trash-2"></i></button>`;
    const nccConvertBtn = `<button class="btn-convert-po" onclick="event.stopPropagation(); window.openConvertToPurchaseOrderModal('${_escAttr(invoiceId)}')" title="Chuyển NCC ${nccKey} qua Đặt hàng Nháp"><i data-lucide="shopping-cart"></i></button>`;
    const nccDisplay = `${nccCheckbox}<span class="ncc-name editable-cell" data-invoice-id="${_escAttr(invoiceId)}" data-field="tenNCC" ondblclick="event.stopPropagation(); window.startInlineEditNcc(this)" title="Nhấp đúp để sửa">${nccDisplayName}</span>${nccConvertBtn}${nccDeleteBtn}`;
    const doneClass = nccDone ? 'ncc-row-done' : '';

    return `
        <tr class="${rowClass} ${doneClass}">
            ${isFirstRow ? `<td class="col-ncc ${rowspanBorderClass} ${nccClass}" rowspan="${rowSpan}" ${nccClickHandler}>${nccDisplay}${subInvoiceIndicator}</td>` : ''}
            <td class="col-stt ${borderClass}">
                ${product ? `<span class="stt-num">${productIdx + 1}</span><button class="btn-del-stt" onclick="event.stopPropagation(); window.deleteProductRow('${invoiceId}', ${productIdx})" title="Xóa STT ${productIdx + 1}"><i data-lucide="x"></i></button>` : '-'}
            </td>
            <td class="col-sku editable-cell ${borderClass}" ${editAttrs} data-field="maSP" ondblclick="startInlineEdit(this)" title="Nhấp đúp để sửa">${maSP}</td>
            <td class="col-desc editable-cell ${borderClass}" ${editAttrs} data-field="moTa" ondblclick="startInlineEdit(this)" title="Nhấp đúp để sửa">${moTa}</td>
            <td class="col-colors editable-cell ${borderClass}" ${editAttrs} ondblclick="window.openVariantModal(this)" title="Nhấp đúp để tạo biến thể">${colorDetails}</td>
            <td class="col-qty text-center editable-cell ${borderClass}" ${editAttrs} data-field="tongSoLuong" ondblclick="startInlineEdit(this)" title="Nhấp đúp để sửa">${tongSoLuong !== '-' ? formatNumber(tongSoLuong) : '-'}</td>
            <td class="col-price text-right editable-cell ${borderClass}" ${editAttrs} data-field="giaDonVi" ondblclick="startInlineEdit(this)" title="Nhấp đúp để sửa">${giaDonVi > 0 ? formatNumber(giaDonVi) : '-'}</td>
            ${
                isFirstRow
                    ? `
                <td class="col-amount text-right ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="amount-value">${formatNumber(tongTienHD)}</strong>
                </td>
                <td class="col-total text-center ${rowspanBorderClass}" rowspan="${rowSpan}">
                    <strong class="total-value">${formatNumber(tongMon)}</strong>
                </td>
                <td class="col-shortage text-center ${rowspanBorderClass}" rowspan="${rowSpan}"
                    data-shipment-id="${shipmentId}" data-invoice-id="${invoiceId}" data-stt-ncc="${sttNCC}"
                    data-raw-value="${soMonThieu || 0}" data-tong-mon="${tongMon}"
                    onclick="startInlineShortage(this)" title="Click để sửa">
                    <strong class="shortage-value">${soMonThieu > 0 ? formatNumber(soMonThieu) : '-'}</strong>
                </td>
            `
                    : ''
            }
            ${_renderImageCell(isFirstRow, rowSpan, sttNCC, borderClass, anhHoaDon, invoiceId, batchNgay, batchDotSo)}
            ${
                isFirstRow
                    ? `
                <td class="col-invoice-note ${rowspanBorderClass}" rowspan="${rowSpan}">
                    ${typeof NoteManager !== 'undefined' ? NoteManager.renderCell(invoiceId) : ''}
                </td>
            `
                    : ''
            }
            ${
                canViewCost
                    ? `
                <td class="col-cost text-right cost-cell editable-cell"
                    data-cost-id="${costItem?.id || ''}"
                    data-invoice-id="${_escAttr(invoiceId)}"
                    ondblclick="startInlineEditCost(this)" title="Nhấp đúp để sửa">
                    ${costItem ? `<strong class="cost-value">${formatNumber(costItem.soTien)}</strong>` : ''}
                </td>
                <td class="col-cost-note cost-note-cell editable-cell"
                    data-cost-id="${costItem?.id || ''}"
                    data-invoice-id="${_escAttr(invoiceId)}"
                    ondblclick="startInlineEditCostNote(this)" title="Nhấp đúp để sửa">
                    ${costItem ? `<span class="cost-label">${costItem.loai || ''}</span>` : ''}
                </td>
            `
                    : ''
            }
        </tr>
    `;
}

/**
 * Toggle visibility of Mô tả & Chi tiết màu sắc columns — apply to ALL tables
 * và persist qua UIState để F5 nhớ lựa chọn của user.
 */
function toggleDetailColumns(btn) {
    const clickedTable = btn.closest('table');
    if (!clickedTable) return;
    // Base new state off the table that was clicked
    const newHidden = !clickedTable.classList.contains('detail-cols-hidden');
    _applyDetailColsVisibility(!newHidden);
    if (window.UIState) window.UIState.setDetailsVisible(!newHidden);
}

/**
 * Apply `detail-cols-hidden` class to all invoice tables + arrow + tfoot colspan.
 * @param {boolean} visible - true = show columns, false = hide
 */
function _applyDetailColsVisibility(visible) {
    const tables = document.querySelectorAll('table.invoice-table');
    tables.forEach((t) => {
        if (visible) t.classList.remove('detail-cols-hidden');
        else t.classList.add('detail-cols-hidden');
        const toggleBtn = t.querySelector('.detail-toggle');
        if (toggleBtn) toggleBtn.innerHTML = visible ? '&#9664;' : '&#9654;';
        const tfootLabel = t.querySelector('.tfoot-total-label');
        if (tfootLabel) tfootLabel.setAttribute('colspan', visible ? '7' : '5');
    });
}

/**
 * Render admin note section
 */
function renderAdminNoteSection(shipment) {
    if (!shipment.ghiChuAdmin) return '';

    return `
        <div class="admin-note-section">
            <div class="admin-note-label">
                <i data-lucide="lock"></i> Ghi Chú Admin:
            </div>
            <div class="admin-note-content">${shipment.ghiChuAdmin}</div>
        </div>
    `;
}

/**
 * View invoice images
 */
function viewInvoiceImages(shipmentId, invoiceIdentifier) {
    const shipment = globalState.shipments.find((s) => s.id === shipmentId);
    if (!shipment) return;

    // Find invoice by id, sttNCC, or index
    let invoiceIdx = -1;

    // Check if invoiceIdentifier is a number or numeric string (index)
    const numericId =
        typeof invoiceIdentifier === 'number' ? invoiceIdentifier : parseInt(invoiceIdentifier, 10);
    if (!isNaN(numericId) && numericId >= 0 && numericId < (shipment.hoaDon?.length || 0)) {
        // It's a valid index
        invoiceIdx = numericId;
    } else if (typeof invoiceIdentifier === 'string') {
        // Try to find by id or sttNCC
        invoiceIdx =
            shipment.hoaDon?.findIndex(
                (hd) => hd.id === invoiceIdentifier || String(hd.sttNCC) === invoiceIdentifier
            ) ?? -1;
    }

    if (invoiceIdx === -1 || !shipment.hoaDon?.[invoiceIdx]) {
        window.notificationManager?.info('Không tìm thấy hóa đơn');
        return;
    }

    const invoice = shipment.hoaDon[invoiceIdx];
    if (!invoice.anhHoaDon?.length) {
        window.notificationManager?.info('Không có ảnh hóa đơn');
        return;
    }

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = invoice.anhHoaDon
            .map(
                (url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn" onclick="openImageLightbox('${url}')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteInvoiceImage('${shipmentId}', ${invoiceIdx}, ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `
            )
            .join('');
    }

    // Store current invoice index for re-render after delete
    modal.dataset.currentInvoiceIdx = invoiceIdx;
    openModal('modalImageViewer');
}

/**
 * Delete an image from invoice
 */
async function deleteInvoiceImage(shipmentId, invoiceIdx, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) {
        return;
    }

    try {
        const shipment = globalState.shipments.find((s) => s.id === shipmentId);
        if (!shipment) {
            window.notificationManager?.error('Không tìm thấy shipment');
            return;
        }

        if (invoiceIdx < 0 || invoiceIdx >= (shipment.hoaDon?.length || 0)) {
            window.notificationManager?.error('Không tìm thấy hóa đơn');
            return;
        }

        const invoice = shipment.hoaDon[invoiceIdx];
        if (!invoice.anhHoaDon || imageIndex >= invoice.anhHoaDon.length) {
            window.notificationManager?.error('Không tìm thấy ảnh');
            return;
        }

        // Remove the image URL from array
        const updatedImages = [...invoice.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update hoaDon array
        const updatedHoaDon = [...shipment.hoaDon];
        updatedHoaDon[invoiceIdx] = {
            ...invoice,
            anhHoaDon: updatedImages,
        };

        // Update via API — update the individual dotHang (invoice)
        await shipmentsApi.update(invoice.id, { anhHoaDon: updatedImages });

        // Update local state
        shipment.hoaDon = updatedHoaDon;

        // Re-render the images modal
        if (updatedImages.length > 0) {
            viewInvoiceImages(shipmentId, invoiceIdx);
        } else {
            closeModal('modalImageViewer');
        }

        // Re-render the shipments table
        renderShipments(globalState.filteredShipments);

        window.notificationManager?.success('Đã xóa ảnh');
        console.log('[RENDERER] Image deleted from invoice');
    } catch (error) {
        console.error('[RENDERER] Delete image error:', error);
        window.notificationManager?.error('Lỗi xóa ảnh: ' + error.message);
    }
}

/**
 * Show sub-invoice modal
 * Displays the sub-invoice (invoice 2) in a modal table
 */
function showSubInvoice(shipmentId, invoiceIdx) {
    const shipment = globalState.shipments.find((s) => s.id === shipmentId);
    if (!shipment) {
        window.notificationManager?.info('Không tìm thấy shipment');
        return;
    }

    const invoice = shipment.hoaDon?.[invoiceIdx];
    if (!invoice || !invoice.subInvoice) {
        window.notificationManager?.info('Không có hóa đơn phụ');
        return;
    }

    const subInvoice = invoice.subInvoice;
    const products = subInvoice.sanPham || [];

    // Build product rows
    let productRows = '';
    products.forEach((product, idx) => {
        const text = product.rawText_vi || product.rawText || 'Sản phẩm ' + (idx + 1);
        productRows +=
            '<tr><td style="text-align:center;padding:8px;border:1px solid #ddd;">' +
            (idx + 1) +
            '</td><td style="padding:8px;border:1px solid #ddd;">' +
            text +
            '</td></tr>';
    });

    const tongMon = subInvoice.tongMon || products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
    const tongTienHD = subInvoice.tongTienHD || 0;
    const imageCount = subInvoice.anhHoaDon?.length || 0;

    // Build modal HTML
    const modalHtml =
        '<div id="subInvoiceModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;" onclick="if(event.target===this)window.closeSubInvoiceModal()">' +
        '<div style="background:white;border-radius:12px;max-width:800px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:16px 20px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;">' +
        '<h2 style="margin:0;font-size:18px;">Hóa Đơn Phụ - NCC ' +
        (invoice.tenNCC || invoice.sttNCC) +
        '</h2>' +
        '<button onclick="window.closeSubInvoiceModal()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:20px;">×</button>' +
        '</div>' +
        '<div style="padding:20px;">' +
        '<div style="margin-bottom:15px;padding:12px;background:#f5f5f5;border-radius:8px;">' +
        '<p style="margin:5px 0;"><strong>Tiền HĐ:</strong> ' +
        tongTienHD.toLocaleString() +
        ' ¥</p>' +
        '<p style="margin:5px 0;"><strong>Tổng món:</strong> ' +
        tongMon +
        '</p>' +
        (subInvoice.ghiChu
            ? '<p style="margin:5px 0;"><strong>Ghi chú:</strong> ' + subInvoice.ghiChu + '</p>'
            : '') +
        (imageCount > 0
            ? '<p style="margin:5px 0;"><strong>Ảnh:</strong> <span style="cursor:pointer;color:#3b82f6;" onclick="window.viewSubInvoiceImages(\'' +
              shipmentId +
              "'," +
              invoiceIdx +
              ')">' +
              imageCount +
              ' ảnh (click để xem)</span></p>'
            : '') +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="background:#f0f0f0;"><th style="padding:10px;border:1px solid #ddd;width:60px;">STT</th><th style="padding:10px;border:1px solid #ddd;">Chi Tiết Sản Phẩm</th></tr></thead>' +
        '<tbody>' +
        (productRows ||
            '<tr><td colspan="2" style="text-align:center;padding:20px;">Không có sản phẩm</td></tr>') +
        '</tbody>' +
        '<tfoot><tr style="background:#e8f4e8;font-weight:bold;"><td style="padding:10px;border:1px solid #ddd;text-align:right;">TỔNG:</td><td style="padding:10px;border:1px solid #ddd;">' +
        tongMon +
        ' món - ' +
        tongTienHD.toLocaleString() +
        ' ¥</td></tr></tfoot>' +
        '</table>' +
        '</div>' +
        '</div>' +
        '</div>';

    // Remove existing modal
    const existing = document.getElementById('subInvoiceModal');
    if (existing) existing.remove();

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
}

/**
 * Close sub-invoice modal
 */
function closeSubInvoiceModal() {
    const modal = document.getElementById('subInvoiceModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

/**
 * View sub-invoice images
 */
function viewSubInvoiceImages(shipmentId, invoiceIdx) {
    const shipment = globalState.shipments.find((s) => s.id === shipmentId);
    if (!shipment || !shipment.hoaDon?.[invoiceIdx]?.subInvoice?.anhHoaDon?.length) {
        window.notificationManager?.info('Không có ảnh hóa đơn phụ');
        return;
    }

    const images = shipment.hoaDon[invoiceIdx].subInvoice.anhHoaDon;

    const modal = document.getElementById('modalImageViewer');
    const body = document.getElementById('imageViewerBody');

    if (body) {
        body.innerHTML = images
            .map(
                (url, index) => `
            <div class="image-item" style="position: relative;">
                <img src="${url}" alt="Hóa đơn phụ" onclick="openImageLightbox('${url}')" style="cursor: pointer;">
                <button class="btn-delete-image" onclick="deleteSubInvoiceImage('${shipmentId}', ${invoiceIdx}, ${index})"
                    title="Xóa ảnh này" style="position: absolute; top: 5px; right: 5px;
                    background: rgba(220, 53, 69, 0.9); color: white; border: none;
                    border-radius: 50%; width: 24px; height: 24px; cursor: pointer;
                    font-size: 14px; line-height: 1; display: flex; align-items: center;
                    justify-content: center;">×</button>
            </div>
        `
            )
            .join('');
    }

    openModal('modalImageViewer');
}

/**
 * Delete sub-invoice image
 */
async function deleteSubInvoiceImage(shipmentId, invoiceIdx, imageIndex) {
    if (!confirm('Bạn có chắc muốn xóa ảnh này?')) {
        return;
    }

    try {
        const shipment = globalState.shipments.find((s) => s.id === shipmentId);
        if (!shipment || !shipment.hoaDon?.[invoiceIdx]?.subInvoice) {
            window.notificationManager?.error('Không tìm thấy hóa đơn phụ');
            return;
        }

        const subInvoice = shipment.hoaDon[invoiceIdx].subInvoice;
        if (!subInvoice.anhHoaDon || imageIndex >= subInvoice.anhHoaDon.length) {
            window.notificationManager?.error('Không tìm thấy ảnh');
            return;
        }

        // Remove the image URL from array
        const updatedImages = [...subInvoice.anhHoaDon];
        updatedImages.splice(imageIndex, 1);

        // Update subInvoice
        const updatedHoaDon = [...shipment.hoaDon];
        updatedHoaDon[invoiceIdx] = {
            ...shipment.hoaDon[invoiceIdx],
            subInvoice: {
                ...subInvoice,
                anhHoaDon: updatedImages,
            },
        };

        // Update via API
        await shipmentsApi.update(subInvoice.id, { anhHoaDon: updatedImages });

        // Update local state
        shipment.hoaDon = updatedHoaDon;

        // Re-render the images modal
        if (updatedImages.length > 0) {
            viewSubInvoiceImages(shipmentId, invoiceIdx);
        } else {
            closeModal('modalImageViewer');
        }

        // Re-render the shipments table
        renderShipments(globalState.filteredShipments);

        window.notificationManager?.success('Đã xóa ảnh');
    } catch (error) {
        console.error('[RENDERER] Delete sub-invoice image error:', error);
        window.notificationManager?.error('Lỗi xóa ảnh: ' + error.message);
    }
}

// =====================================================
// INLINE SHORTAGE EDITING
// =====================================================

/**
 * Start inline editing for shortage cell
 */
function startInlineShortage(td) {
    // Already editing
    if (td.querySelector('.shortage-inline-input')) return;

    const rawValue = parseInt(td.dataset.rawValue) || 0;
    const tongMon = parseInt(td.dataset.tongMon) || 0;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'shortage-inline-input';
    input.value = rawValue || '';
    input.placeholder = '0';
    input.min = '0';
    input.max = String(tongMon);
    input.style.cssText =
        'width: 60px; text-align: center; font-weight: 700; font-size: inherit; padding: 2px 4px; border: 2px solid var(--primary, #4a7cff); border-radius: 4px; outline: none;';

    // Replace content
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    // Stop click from re-triggering
    input.addEventListener('click', (e) => e.stopPropagation());

    // Save on blur or Enter
    input.addEventListener('blur', () => commitInlineShortage(td, input));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            cancelInlineShortage(td);
        }
    });
}

/**
 * Cancel inline editing - restore original value
 */
function cancelInlineShortage(td) {
    const rawValue = parseInt(td.dataset.rawValue) || 0;
    td.innerHTML = `<strong class="shortage-value">${rawValue > 0 ? formatNumber(rawValue) : '-'}</strong>`;
}

/**
 * Commit inline shortage edit
 */
async function commitInlineShortage(td, input) {
    const newValue = parseInt(input.value) || 0;
    const oldValue = parseInt(td.dataset.rawValue) || 0;

    // No change - restore display
    if (newValue === oldValue) {
        cancelInlineShortage(td);
        return;
    }

    const shipmentId = td.dataset.shipmentId;
    const invoiceId = td.dataset.invoiceId;
    const sttNCC = td.dataset.sttNcc;

    // Show saving state
    td.innerHTML = '<span style="color: var(--gray-400); font-size: 12px;">...</span>';

    try {
        await updateDotHangShortage(parseInt(sttNCC), invoiceId, {
            soMonThieu: newValue,
            ghiChuThieu: '',
        });

        // Update data attribute
        td.dataset.rawValue = String(newValue);

        // Show new value
        td.innerHTML = `<strong class="shortage-value">${newValue > 0 ? formatNumber(newValue) : '-'}</strong>`;

        // Update footer total
        updateShortageFooterTotal(td);
    } catch (error) {
        console.error('[SHORTAGE] Inline save error:', error);
        // Restore old value on error
        td.dataset.rawValue = String(oldValue);
        td.innerHTML = `<strong class="shortage-value">${oldValue > 0 ? formatNumber(oldValue) : '-'}</strong>`;
        window.notificationManager?.error('Không thể lưu số thiếu');
    }
}

/**
 * Recalculate and update footer total shortage
 */
function updateShortageFooterTotal(td) {
    const table = td.closest('table');
    if (!table) return;

    const shortageCells = table.querySelectorAll('tbody .col-shortage');
    let total = 0;
    shortageCells.forEach((cell) => {
        total += parseInt(cell.dataset.rawValue) || 0;
    });

    const footerCell = table.querySelector('tfoot .total-shortage-cell');
    if (footerCell) {
        footerCell.innerHTML = `<strong>${total > 0 ? formatNumber(total) : '-'}</strong>`;
    }
}

/**
 * Position hover zoom image using fixed positioning
 */
function _positionImgZoom(wrap) {
    const zoom = wrap.querySelector('.cell-img-zoom');
    if (!zoom) return;

    // Show off-screen first to measure natural size
    zoom.style.left = '-9999px';
    zoom.style.top = '-9999px';
    zoom.style.display = 'block';

    // Wait for image to render, then position
    requestAnimationFrame(() => {
        const rect = wrap.getBoundingClientRect();
        const zoomRect = zoom.getBoundingClientRect();
        const zoomW = zoomRect.width;
        const zoomH = zoomRect.height;

        // Position to the left of the thumbnail
        let left = rect.left - zoomW - 12;
        let top = rect.top + rect.height / 2 - zoomH / 2;

        // If no room on left, show on right
        if (left < 10) left = rect.right + 12;

        // Keep within viewport
        if (top < 10) top = 10;
        if (top + zoomH > window.innerHeight - 10) top = window.innerHeight - zoomH - 10;

        zoom.style.left = left + 'px';
        zoom.style.top = top + 'px';
    });
}

function _hideImgZoom(wrap) {
    const zoom = wrap.querySelector('.cell-img-zoom');
    if (zoom) zoom.style.display = 'none';
}

// =====================================================
// NCC DONE CHECKBOX (localStorage persistence)
// =====================================================

const NCC_DONE_KEY = 'inventory_ncc_done';

function _getNccDoneMap() {
    try {
        return JSON.parse(localStorage.getItem(NCC_DONE_KEY) || '{}');
    } catch (_) {
        return {};
    }
}

function _isNccDone(shipmentId, nccKey) {
    const map = _getNccDoneMap();
    return !!map[`${shipmentId}_${nccKey}`];
}

function toggleNccDone(shipmentId, nccKey, checked) {
    const map = _getNccDoneMap();
    const key = `${shipmentId}_${nccKey}`;

    if (checked) {
        map[key] = true;
    } else {
        delete map[key];
    }

    localStorage.setItem(NCC_DONE_KEY, JSON.stringify(map));

    // Update all rows for this NCC in the DOM via checkbox's parent cell
    const checkbox = document.querySelector(
        `.shipment-card[data-id="${shipmentId}"] .ncc-done-check[data-ncc-key="${nccKey}"]`
    );
    const nccCell = checkbox?.closest('.col-ncc');
    if (nccCell) {
        const tr = nccCell.closest('tr');
        let current = tr;
        const rowSpan = parseInt(nccCell.getAttribute('rowspan') || '1');
        for (let i = 0; i < rowSpan && current; i++) {
            current.classList.toggle('ncc-row-done', checked);
            current = current.nextElementSibling;
        }
    }
}

console.log('[RENDERER] Table renderer initialized');

// Expose functions to global scope for onclick handlers
window.showSubInvoice = showSubInvoice;
window.closeSubInvoiceModal = closeSubInvoiceModal;
window.viewSubInvoiceImages = viewSubInvoiceImages;
window.deleteSubInvoiceImage = deleteSubInvoiceImage;
window.viewInvoiceImages = viewInvoiceImages;
window.deleteInvoiceImage = deleteInvoiceImage;
window.startInlineShortage = startInlineShortage;
window.togglePkgCheck = togglePkgCheck;
window.toggleAllPkgCheck = toggleAllPkgCheck;
window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;

/**
 * Persist daNhan flag for one kien in its source dot, update cached dot, and PUT to server.
 */
async function _savePkgReceived(dotId, kienIdx, received) {
    const targetDot = _findDotByInvoiceId(dotId);
    if (!targetDot || !Array.isArray(targetDot.kienHang) || !targetDot.kienHang[kienIdx]) {
        throw new Error('Không tìm thấy kiện');
    }
    targetDot.kienHang[kienIdx] = { ...targetDot.kienHang[kienIdx], daNhan: !!received };
    await shipmentsApi.update(dotId, { kienHang: targetDot.kienHang });
    return targetDot;
}

/**
 * Toggle individual package check - strikethrough that KG + persist daNhan.
 */
async function togglePkgCheck(checkbox) {
    const label = checkbox.closest('.pkg-check-label');
    const kgText = label.querySelector('.pkg-kg-text');
    const dotId = label.dataset.dotId;
    const kienIdx = parseInt(label.dataset.dotKienIdx);
    const nextChecked = checkbox.checked;

    if (nextChecked) kgText.classList.add('pkg-received');
    else kgText.classList.remove('pkg-received');

    const badge = checkbox.closest('.shipment-packages-badge');
    const allChecks = badge.querySelectorAll('.pkg-check');
    const checkAll = badge.querySelector('.pkg-check-all');
    if (checkAll) {
        checkAll.checked = Array.from(allChecks).every((c) => c.checked);
    }

    if (!dotId || isNaN(kienIdx)) {
        window.notificationManager?.error('Thiếu thông tin kiện, không thể lưu');
        return;
    }

    try {
        checkbox.disabled = true;
        await _savePkgReceived(dotId, kienIdx, nextChecked);
        flattenNCCData();
    } catch (error) {
        console.error('[PKG-CHECK] Save failed:', error);
        checkbox.checked = !nextChecked;
        if (!nextChecked) kgText.classList.add('pkg-received');
        else kgText.classList.remove('pkg-received');
        if (checkAll) {
            checkAll.checked = Array.from(allChecks).every((c) => c.checked);
        }
        window.notificationManager?.error('Không thể lưu: ' + error.message);
    } finally {
        checkbox.disabled = false;
    }
}

/**
 * Toggle all packages check - strikethrough all KGs + persist per-dot kienHang.
 */
async function toggleAllPkgCheck(checkAllBox) {
    const badge = checkAllBox.closest('.shipment-packages-badge');
    const allChecks = badge.querySelectorAll('.pkg-check');
    const allLabels = badge.querySelectorAll('.pkg-check-label');
    const allKgTexts = badge.querySelectorAll('.pkg-kg-text');
    const nextChecked = checkAllBox.checked;

    allChecks.forEach((c) => {
        c.checked = nextChecked;
    });
    allKgTexts.forEach((t) => {
        if (nextChecked) t.classList.add('pkg-received');
        else t.classList.remove('pkg-received');
    });

    const byDot = new Map();
    allLabels.forEach((label) => {
        const dotId = label.dataset.dotId;
        const kienIdx = parseInt(label.dataset.dotKienIdx);
        if (!dotId || isNaN(kienIdx)) return;
        if (!byDot.has(dotId)) byDot.set(dotId, []);
        byDot.get(dotId).push(kienIdx);
    });

    if (byDot.size === 0) {
        window.notificationManager?.error('Thiếu thông tin kiện, không thể lưu');
        return;
    }

    try {
        checkAllBox.disabled = true;
        for (const [dotId, kienIndices] of byDot) {
            const targetDot = _findDotByInvoiceId(dotId);
            if (!targetDot || !Array.isArray(targetDot.kienHang)) continue;
            targetDot.kienHang = targetDot.kienHang.map((k, i) =>
                kienIndices.includes(i) ? { ...k, daNhan: nextChecked } : k
            );
            await shipmentsApi.update(dotId, { kienHang: targetDot.kienHang });
        }
        flattenNCCData();
    } catch (error) {
        console.error('[PKG-CHECK-ALL] Save failed:', error);
        checkAllBox.checked = !nextChecked;
        allChecks.forEach((c) => {
            c.checked = !nextChecked;
        });
        allKgTexts.forEach((t) => {
            if (!nextChecked) t.classList.add('pkg-received');
            else t.classList.remove('pkg-received');
        });
        window.notificationManager?.error('Không thể lưu: ' + error.message);
    } finally {
        checkAllBox.disabled = false;
    }
}

/**
 * Open image lightbox overlay (phóng lớn ảnh, không mở tab mới)
 */
function openImageLightbox(url) {
    let overlay = document.getElementById('imageLightboxOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'imageLightboxOverlay';
        overlay.className = 'image-lightbox-overlay';
        overlay.innerHTML = `
            <button class="image-lightbox-close" onclick="closeImageLightbox()">&times;</button>
            <img class="image-lightbox-img" src="" alt="Phóng lớn">
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeImageLightbox();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeImageLightbox();
        });
        document.body.appendChild(overlay);
    }
    const img = overlay.querySelector('.image-lightbox-img');
    img.src = url;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Close image lightbox overlay
 */
function closeImageLightbox() {
    const overlay = document.getElementById('imageLightboxOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// =====================================================
// INLINE EDIT — double-click cell to edit product fields
// =====================================================

/**
 * Inline edit NCC name (tenNCC)
 */
function startInlineEditNcc(span) {
    if (span.querySelector('input')) return;

    const invoiceId = span.dataset.invoiceId;
    const oldValue = span.textContent.trim();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = oldValue;
    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    const commit = async () => {
        const newValue = input.value.trim();
        if (!newValue || newValue === oldValue) {
            span.textContent = oldValue;
            return;
        }

        let targetDot = null;
        for (const ncc of globalState.nccList) {
            const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
            if (dot) {
                targetDot = dot;
                break;
            }
        }
        if (!targetDot) {
            span.textContent = oldValue;
            return;
        }

        try {
            targetDot.tenNCC = newValue;
            await shipmentsApi.update(invoiceId, { tenNCC: newValue });
            span.textContent = newValue;
            window.notificationManager?.success('Đã cập nhật NCC');
        } catch (err) {
            console.error('[INLINE-EDIT] NCC update error:', err);
            span.textContent = oldValue;
            window.notificationManager?.error('Không thể cập nhật');
        }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            span.textContent = oldValue;
        }
    });
}

function startInlineEdit(td) {
    if (td.querySelector('input, textarea')) return; // Already editing

    const field = td.dataset.field;
    const invoiceId = td.dataset.invoiceId;
    const productIdx = parseInt(td.dataset.productIdx);
    if (!field || !invoiceId || isNaN(productIdx)) return;

    const oldValue = td.textContent.trim().replace(/,/g, '');
    const isNumeric = field === 'tongSoLuong' || field === 'giaDonVi';

    const input = document.createElement(field === 'moTa' ? 'textarea' : 'input');
    if (isNumeric) {
        input.type = 'number';
        input.min = '0';
        input.step = field === 'giaDonVi' ? '0.01' : '1';
    } else {
        input.type = 'text';
    }
    input.className = 'inline-edit-input';
    input.value = oldValue === '-' ? '' : oldValue;
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const commit = () => commitInlineEdit(td, input, field, invoiceId, productIdx, oldValue);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !(e.shiftKey && field === 'moTa')) {
            e.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            td.textContent = oldValue === '' ? '-' : oldValue;
        }
    });
}

async function commitInlineEdit(td, input, field, invoiceId, productIdx, oldValue) {
    const newValue = input.value.trim();
    const isNumeric = field === 'tongSoLuong' || field === 'giaDonVi';
    const displayValue = isNumeric
        ? parseFloat(newValue) > 0
            ? formatNumber(parseFloat(newValue))
            : '-'
        : newValue || '-';

    // No change
    if (newValue === oldValue || (newValue === '' && oldValue === '-')) {
        td.textContent = oldValue === '' ? '-' : oldValue;
        return;
    }

    // Find dotHang
    let targetDot = null;
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
        if (dot) {
            targetDot = dot;
            break;
        }
    }
    if (!targetDot || !targetDot.sanPham?.[productIdx]) {
        td.textContent = oldValue;
        window.notificationManager?.error('Không tìm thấy sản phẩm');
        return;
    }

    try {
        const product = targetDot.sanPham[productIdx];
        if (isNumeric) {
            product[field] = parseFloat(newValue) || 0;
        } else {
            product[field] = newValue;
        }

        // Recalculate totals
        if (field === 'tongSoLuong' || field === 'giaDonVi') {
            product.thanhTien =
                (product.tongSoLuong || product.soLuong || 0) * (product.giaDonVi || 0);
            targetDot.tongMon = targetDot.sanPham.reduce(
                (s, p) => s + (p.tongSoLuong || p.soLuong || 0),
                0
            );
            targetDot.tongTienHD = targetDot.sanPham.reduce((s, p) => s + (p.thanhTien || 0), 0);
        }

        await shipmentsApi.update(invoiceId, {
            sanPham: targetDot.sanPham,
            tongMon: targetDot.tongMon,
            tongTienHD: targetDot.tongTienHD,
        });

        td.textContent = displayValue;
        flattenNCCData();

        // Re-render totals in current card if tongMon/tongTienHD changed
        if (field === 'tongSoLuong' || field === 'giaDonVi') {
            // Update rowspanned amount/total cells for this invoice
            const tbody = td.closest('tbody');
            if (tbody) {
                for (const r of tbody.querySelectorAll('tr')) {
                    const amt = r.querySelector('.amount-value');
                    const tot = r.querySelector('.total-value');
                    if (amt && r.querySelector(`td[data-invoice-id="${invoiceId}"]`)) {
                        amt.textContent = formatNumber(targetDot.tongTienHD);
                    }
                    if (tot && r.querySelector(`td[data-invoice-id="${invoiceId}"]`)) {
                        tot.textContent = formatNumber(targetDot.tongMon);
                    }
                }
            }
        }

        window.notificationManager?.success('Đã cập nhật');
    } catch (error) {
        console.error('[INLINE-EDIT] Error:', error);
        td.textContent = oldValue;
        window.notificationManager?.error('Không thể cập nhật: ' + error.message);
    }
}

// =====================================================
// TABLE IMAGE MANAGEMENT — add/remove with confirm
// =====================================================

/**
 * Open modal to add images (paste or file) for an invoice
 */
let _tableImgInvoiceId = null;
let _tableImgPasteHandler = null;

function addTableImage(invoiceId) {
    _tableImgInvoiceId = invoiceId;
    const previewList = document.getElementById('tableImgPreviewList');
    if (previewList) previewList.innerHTML = '';

    openModal('modalAddTableImage');
    if (window.lucide) lucide.createIcons();

    const area = document.getElementById('tableImgUploadArea');
    const fileInput = document.getElementById('tableImgFileInput');
    const btnChoose = document.getElementById('btnTableImgChoose');
    const btnSave = document.getElementById('btnTableImgSave');

    // Focus area for paste
    setTimeout(() => area?.focus(), 100);

    // File choose
    btnChoose.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        if (e.target.files?.length > 0) {
            _addTableImgPreviews(Array.from(e.target.files));
            e.target.value = '';
        }
    };

    // Paste handler
    if (_tableImgPasteHandler) document.removeEventListener('paste', _tableImgPasteHandler);
    _tableImgPasteHandler = (e) => {
        const modal = document.getElementById('modalAddTableImage');
        if (!modal?.classList.contains('active')) return;

        const items = e.clipboardData?.items;
        if (!items) return;
        const imageFiles = [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (imageFiles.length > 0) {
            e.preventDefault();
            _addTableImgPreviews(imageFiles);
        }
    };
    document.addEventListener('paste', _tableImgPasteHandler);

    // Save button
    btnSave.onclick = () => _saveTableImages();
}

/**
 * Add file previews to the modal
 */
function _addTableImgPreviews(files) {
    const previewList = document.getElementById('tableImgPreviewList');
    if (!previewList) return;

    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > (APP_CONFIG?.MAX_IMAGE_SIZE || 5 * 1024 * 1024)) {
            window.notificationManager?.warning(`"${file.name}" vượt quá 5MB`);
            continue;
        }
        const localUrl = URL.createObjectURL(file);
        const item = document.createElement('div');
        item.className = 'image-preview-item';
        item._file = file;
        item.innerHTML = `
            <img src="${localUrl}" alt="Preview">
            <button type="button" class="btn-remove-preview-image" title="Xóa">
                <i data-lucide="x"></i>
            </button>
        `;
        item.querySelector('.btn-remove-preview-image').onclick = () => {
            URL.revokeObjectURL(localUrl);
            item.remove();
        };
        previewList.appendChild(item);
    }
    if (window.lucide) lucide.createIcons();
}

/**
 * Upload and save all previewed images
 */
async function _saveTableImages() {
    const invoiceId = _tableImgInvoiceId;
    if (!invoiceId) return;

    const previewList = document.getElementById('tableImgPreviewList');
    const items = previewList?.querySelectorAll('.image-preview-item') || [];
    if (items.length === 0) {
        window.notificationManager?.warning('Chưa có ảnh nào');
        return;
    }

    // Find dotHang
    let targetDot = null;
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
        if (dot) {
            targetDot = dot;
            break;
        }
    }
    if (!targetDot) {
        window.notificationManager?.error('Không tìm thấy hóa đơn');
        return;
    }

    const loadingToast = window.notificationManager?.loading('Đang tải ảnh lên...');
    let count = 0;

    for (const item of items) {
        const file = item._file;
        if (!file) continue;
        try {
            const url = await uploadImage(file, 'invoices');
            if (!targetDot.anhHoaDon) targetDot.anhHoaDon = [];
            targetDot.anhHoaDon.push(url);
            count++;
        } catch (err) {
            console.error('[TABLE-IMG] Upload failed:', err);
        }
    }

    window.notificationManager?.remove(loadingToast);

    if (count > 0) {
        await shipmentsApi.update(invoiceId, { anhHoaDon: targetDot.anhHoaDon });
        flattenNCCData();
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
        window.notificationManager?.success(`Đã thêm ${count} ảnh`);
    }

    closeModal('modalAddTableImage');
    // Cleanup paste handler
    if (_tableImgPasteHandler) {
        document.removeEventListener('paste', _tableImgPasteHandler);
        _tableImgPasteHandler = null;
    }
    _tableImgInvoiceId = null;
}

/**
 * Remove image from invoice's anhHoaDon with confirm
 */
async function removeTableImage(invoiceId, imageUrl) {
    if (!confirm('Xóa ảnh này?')) return;

    let targetDot = null;
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
        if (dot) {
            targetDot = dot;
            break;
        }
    }
    if (!targetDot || !targetDot.anhHoaDon) return;

    targetDot.anhHoaDon = targetDot.anhHoaDon.filter((u) => u !== imageUrl);

    try {
        await shipmentsApi.update(invoiceId, { anhHoaDon: targetDot.anhHoaDon });
        flattenNCCData();
        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
        window.notificationManager?.success('Đã xóa ảnh');
    } catch (error) {
        console.error('[TABLE-IMG] Remove failed:', error);
        window.notificationManager?.error('Không thể xóa ảnh');
    }
}

// =====================================================
// INLINE EDIT — Chi Phí & Ghi Chú CP
// =====================================================

function _findCostByIdAcrossDots(costId) {
    for (const ncc of globalState.nccList) {
        for (const dot of ncc.dotHang || []) {
            const c = (dot.chiPhiHangVe || []).find((x) => x.id === costId);
            if (c) return { dot, cost: c };
        }
    }
    return null;
}

function _findDotByInvoiceId(invoiceId) {
    for (const ncc of globalState.nccList) {
        const dot = (ncc.dotHang || []).find((d) => d.id === invoiceId);
        if (dot) return dot;
    }
    return null;
}

function _renderCostValueHtml(soTien) {
    return soTien > 0 ? `<strong class="cost-value">${formatNumber(soTien)}</strong>` : '';
}

function _renderCostNoteHtml(loai) {
    return loai ? `<span class="cost-label">${loai}</span>` : '';
}

function _refreshCostTotal(td) {
    const table = td.closest('table');
    if (!table) return;
    const cells = table.querySelectorAll('tbody .cost-value');
    let total = 0;
    cells.forEach((el) => {
        const n = parseFloat(el.textContent.replace(/[.,\s]/g, '')) || 0;
        total += n;
    });
    const tfoot = table.querySelector('tfoot .total-cost');
    if (tfoot) tfoot.textContent = formatNumber(total);
}

function startInlineEditCost(td) {
    if (!permissionHelper?.can('edit_chiPhiHangVe')) return;
    if (td.querySelector('input')) return;

    const costId = td.dataset.costId || '';
    const invoiceId = td.dataset.invoiceId;
    if (!invoiceId) return;

    const oldEl = td.querySelector('.cost-value');
    const oldSoTien = oldEl ? parseFloat(oldEl.textContent.replace(/[.,\s]/g, '')) || 0 : 0;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.className = 'inline-edit-input';
    input.value = oldSoTien > 0 ? String(oldSoTien) : '';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const restore = () => {
        td.innerHTML = _renderCostValueHtml(oldSoTien);
    };
    const commit = () => commitInlineEditCost(td, input, costId, invoiceId, oldSoTien);

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            restore();
        }
    });
}

async function commitInlineEditCost(td, input, costId, invoiceId, oldSoTien) {
    const newSoTien = parseFloat(input.value) || 0;

    if (newSoTien === oldSoTien) {
        td.innerHTML = _renderCostValueHtml(oldSoTien);
        return;
    }

    let targetDot = null;
    let costRecord = null;
    if (costId) {
        const found = _findCostByIdAcrossDots(costId);
        if (found) {
            targetDot = found.dot;
            costRecord = found.cost;
        }
    }
    if (!targetDot) {
        targetDot = _findDotByInvoiceId(invoiceId);
    }
    if (!targetDot) {
        td.innerHTML = _renderCostValueHtml(oldSoTien);
        window.notificationManager?.error('Không tìm thấy hóa đơn');
        return;
    }

    try {
        if (!Array.isArray(targetDot.chiPhiHangVe)) targetDot.chiPhiHangVe = [];

        if (costRecord) {
            if (newSoTien === 0) {
                targetDot.chiPhiHangVe = targetDot.chiPhiHangVe.filter(
                    (x) => x.id !== costRecord.id
                );
                td.dataset.costId = '';
                const noteCell = td.parentElement?.querySelector('.cost-note-cell');
                if (noteCell) {
                    noteCell.dataset.costId = '';
                    noteCell.innerHTML = '';
                }
            } else {
                costRecord.soTien = newSoTien;
            }
        } else if (newSoTien > 0) {
            const newId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            targetDot.chiPhiHangVe.push({ id: newId, loai: '', soTien: newSoTien });
            td.dataset.costId = newId;
            const noteCell = td.parentElement?.querySelector('.cost-note-cell');
            if (noteCell) noteCell.dataset.costId = newId;
        }

        targetDot.tongChiPhi = targetDot.chiPhiHangVe.reduce((s, c) => s + (c.soTien || 0), 0);

        await shipmentsApi.update(targetDot.id, {
            chiPhiHangVe: targetDot.chiPhiHangVe,
            tongChiPhi: targetDot.tongChiPhi,
        });

        td.innerHTML = _renderCostValueHtml(newSoTien);
        _refreshCostTotal(td);
        flattenNCCData();
        window.notificationManager?.success('Đã cập nhật chi phí');
    } catch (error) {
        console.error('[INLINE-COST] Error:', error);
        td.innerHTML = _renderCostValueHtml(oldSoTien);
        window.notificationManager?.error('Không thể cập nhật: ' + error.message);
    }
}

function startInlineEditCostNote(td) {
    if (!permissionHelper?.can('edit_chiPhiHangVe')) return;
    if (td.querySelector('input')) return;

    const costId = td.dataset.costId || '';
    const invoiceId = td.dataset.invoiceId;
    if (!invoiceId) return;

    const oldEl = td.querySelector('.cost-label');
    const oldLoai = oldEl ? oldEl.textContent : '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = oldLoai;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const restore = () => {
        td.innerHTML = _renderCostNoteHtml(oldLoai);
    };
    const commit = () => commitInlineEditCostNote(td, input, costId, invoiceId, oldLoai);

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            restore();
        }
    });
}

async function commitInlineEditCostNote(td, input, costId, invoiceId, oldLoai) {
    const newLoai = input.value.trim();

    if (newLoai === oldLoai) {
        td.innerHTML = _renderCostNoteHtml(oldLoai);
        return;
    }

    if (!costId && !newLoai) {
        td.innerHTML = '';
        return;
    }

    let targetDot = null;
    let costRecord = null;
    if (costId) {
        const found = _findCostByIdAcrossDots(costId);
        if (found) {
            targetDot = found.dot;
            costRecord = found.cost;
        }
    }
    if (!targetDot) {
        targetDot = _findDotByInvoiceId(invoiceId);
    }
    if (!targetDot) {
        td.innerHTML = _renderCostNoteHtml(oldLoai);
        window.notificationManager?.error('Không tìm thấy hóa đơn');
        return;
    }

    try {
        if (!Array.isArray(targetDot.chiPhiHangVe)) targetDot.chiPhiHangVe = [];

        if (costRecord) {
            costRecord.loai = newLoai;
        } else if (newLoai) {
            const newId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            targetDot.chiPhiHangVe.push({ id: newId, loai: newLoai, soTien: 0 });
            td.dataset.costId = newId;
            const amtCell = td.parentElement?.querySelector('.cost-cell');
            if (amtCell) amtCell.dataset.costId = newId;
        }

        await shipmentsApi.update(targetDot.id, {
            chiPhiHangVe: targetDot.chiPhiHangVe,
        });

        td.innerHTML = _renderCostNoteHtml(newLoai);
        flattenNCCData();
        window.notificationManager?.success('Đã cập nhật ghi chú CP');
    } catch (error) {
        console.error('[INLINE-COST-NOTE] Error:', error);
        td.innerHTML = _renderCostNoteHtml(oldLoai);
        window.notificationManager?.error('Không thể cập nhật: ' + error.message);
    }
}

// =====================================================
// PAYMENT SLIDE-OVER (Thanh Toán CK — grouped by dotSo, spans all dates)
// =====================================================

function _findDotsByDotSo(dotSo) {
    const ds = parseInt(dotSo, 10) || 1;
    const out = [];
    for (const ncc of globalState.nccList) {
        for (const dot of ncc.dotHang || []) {
            if ((dot.dotSo || 1) === ds) out.push(dot);
        }
    }
    return out;
}

function _aggregateDotEntry(dotSo) {
    const dots = _findDotsByDotSo(dotSo);
    const dateSet = new Set();
    let tongTienHoaDon = 0;
    let tongChiPhi = 0;
    let thanhToanCK = [];
    let tiGia = 0;
    const hdByDate = {};
    const cpByDate = {};
    dots.forEach((d) => {
        const ngay = d.ngayDiHang;
        if (ngay) dateSet.add(ngay);
        const hd = parseFloat(d.tongTienHD) || 0;
        const cp = parseFloat(d.tongChiPhi) || 0;
        tongTienHoaDon += hd;
        tongChiPhi += cp;
        if (hd > 0 && ngay) hdByDate[ngay] = (hdByDate[ngay] || 0) + hd;
        if (cp > 0 && ngay) cpByDate[ngay] = (cpByDate[ngay] || 0) + cp;
        if (
            (!thanhToanCK || thanhToanCK.length === 0) &&
            Array.isArray(d.thanhToanCK) &&
            d.thanhToanCK.length > 0
        ) {
            thanhToanCK = d.thanhToanCK;
        }
        if (!tiGia && d.tiGia) tiGia = parseFloat(d.tiGia) || 0;
    });
    return {
        dotSo: parseInt(dotSo, 10) || 1,
        ngayDiHangList: [...dateSet].sort((a, b) => new Date(b) - new Date(a)),
        tongTienHoaDon,
        tongChiPhi,
        thanhToanCK,
        tiGia,
        hdByDate,
        cpByDate,
    };
}

function _calcPaymentTotals(entry) {
    // All amounts are in the SAME foreign currency unit (e.g. CNY).
    // VND is display-only (via tỉ giá) and must NOT enter CÒN LẠI math.
    const payments = Array.isArray(entry.thanhToanCK) ? entry.thanhToanCK : [];
    const tiGia = parseFloat(entry.tiGia) || 0;
    const tongTT = payments.reduce((s, p) => s + (parseFloat(p.soTienTT) || 0), 0);
    const tongTTVND = tongTT * tiGia; // display note only
    const tongChiPhi = parseFloat(entry.tongChiPhi) || 0;
    const tongTienHD = parseFloat(entry.tongTienHoaDon) || 0;
    const conLai = tongTT - tongChiPhi - tongTienHD; // foreign-currency math
    return { tongTT, tongTTVND, tongChiPhi, tongTienHD, conLai, tiGia };
}

// Format VND suffix (VND / 1000, rounded) — displayed in parentheses next to foreign amount.
// Example: soTien=10001, tiGia=3950 → vnd=39,503,950 → show "(39.504)" meaning 39,504 thousand VND.
function _vndSuffixHtml(soTienForeign, tiGia) {
    if (!tiGia || !soTienForeign) return '';
    const vnd = soTienForeign * tiGia;
    const k = Math.round(vnd / 1000);
    return ` <span class="vnd-inline">(${formatNumber(k)})</span>`;
}

// Formatter for soTienTT inline edit — includes VND suffix so optimistic UI restores correctly.
function _formatSoTienWithVnd(val, tiGia) {
    const n = parseFloat(val) || 0;
    if (n <= 0) return '—';
    return `${formatNumber(n)}${_vndSuffixHtml(n, tiGia)}`;
}

function _renderBreakdownRows(breakdownObj, tiGia) {
    const entries = Object.entries(breakdownObj || {}).sort(
        (a, b) => new Date(b[0]) - new Date(a[0])
    );
    if (entries.length === 0) {
        return '<div class="pp-breakdown-empty">Chưa có dữ liệu theo ngày.</div>';
    }
    return entries
        .map(
            ([ngay, soTien]) => `
        <div class="pp-breakdown-row">
            <span class="bd-ngay">${formatDateDisplay(ngay)}</span>
            <span class="bd-so-tien">${formatNumber(soTien)}${_vndSuffixHtml(soTien, tiGia)}</span>
        </div>
    `
        )
        .join('');
}

function _renderPaymentRow(dotSo, tiGia, p) {
    const soTienTT = parseFloat(p.soTienTT) || 0;
    const soTienDisplay =
        soTienTT > 0 ? `${formatNumber(soTienTT)}${_vndSuffixHtml(soTienTT, tiGia)}` : '—';
    const dataAttrs = `data-payment-id="${_escAttr(p.id)}" data-dot-so="${dotSo}"`;
    const ghiChu = p.ghiChu || '';
    const ghiChuTooltip = ghiChu ? _escAttr(ghiChu) : 'Nhấp đúp để sửa';
    return `
        <li class="payment-row" ${dataAttrs}>
            <span class="payment-cell payment-ngay-tt editable-cell" ${dataAttrs} data-field="ngayTT" ondblclick="startInlineEditPaymentNgay(this)" title="Nhấp đúp để sửa">${formatDateDisplay(p.ngayTT) || '—'}</span>
            <span class="payment-cell payment-so-tien-tt editable-cell" ${dataAttrs} data-field="soTienTT" ondblclick="startInlineEditPaymentSoTien(this)" title="Nhấp đúp để sửa">${soTienDisplay}</span>
            <span class="payment-cell payment-ghi-chu editable-cell" ${dataAttrs} data-field="ghiChu" ondblclick="startInlineEditPaymentNote(this)" title="${ghiChuTooltip}">${_escAttr(ghiChu)}</span>
            <button class="btn-del-payment" ${dataAttrs} onclick="deletePayment(this)" title="Xóa dòng">×</button>
        </li>
    `;
}

function _formatNgayList(list) {
    if (!Array.isArray(list) || list.length === 0) return '';
    return list.map(formatDateDisplay).filter(Boolean).join(', ');
}

function _renderDotSectionBodyHtml(entry) {
    const payments = Array.isArray(entry.thanhToanCK) ? entry.thanhToanCK : [];
    const totals = _calcPaymentTotals(entry);
    const dotAttr = entry.dotSo;
    const rows = payments.map((p) => _renderPaymentRow(dotAttr, totals.tiGia, p)).join('');
    const hdBreakdown = _renderBreakdownRows(entry.hdByDate || {}, totals.tiGia);
    const cpBreakdown = _renderBreakdownRows(entry.cpByDate || {}, totals.tiGia);

    // Tỉ giá and CÒN LẠI now live in the dot head (sticky at top). Body starts with totals.
    return `
        <div class="payment-panel-totals">
            <div class="pp-line"><span class="pp-label">Tổng TT</span><strong class="pp-value pp-total-tt">${formatNumber(totals.tongTT)}${_vndSuffixHtml(totals.tongTT, totals.tiGia)}</strong></div>
            <div class="pp-group">
                <div class="pp-line pp-line-expandable" data-breakdown-kind="hd" onclick="togglePaymentBreakdown(this)">
                    <span class="pp-label"><i class="pp-line-chevron" data-lucide="chevron-right"></i>Tổng HĐ</span>
                    <strong class="pp-value pp-total-hd">${formatNumber(totals.tongTienHD)}${_vndSuffixHtml(totals.tongTienHD, totals.tiGia)}</strong>
                </div>
                <div class="pp-breakdown">${hdBreakdown}</div>
            </div>
            <div class="pp-group">
                <div class="pp-line pp-line-expandable" data-breakdown-kind="cp" onclick="togglePaymentBreakdown(this)">
                    <span class="pp-label"><i class="pp-line-chevron" data-lucide="chevron-right"></i>Tổng CP</span>
                    <strong class="pp-value pp-total-cp">${formatNumber(totals.tongChiPhi)}${_vndSuffixHtml(totals.tongChiPhi, totals.tiGia)}</strong>
                </div>
                <div class="pp-breakdown">${cpBreakdown}</div>
            </div>
        </div>
        <div class="payment-list-wrap">
            <div class="payment-list-header">
                <span>Ngày TT</span>
                <span class="text-right">Số tiền</span>
                <span>Ghi chú</span>
                <span></span>
            </div>
            <ul class="payment-list">
                ${rows}
            </ul>
        </div>
        <button class="btn-add-payment" data-dot-so="${dotAttr}" onclick="addPayment(this)">
            <i data-lucide="plus"></i> Thêm thanh toán
        </button>
    `;
}

function _renderDotHeadHtml(entry) {
    const totals = _calcPaymentTotals(entry);
    const conLaiClass = totals.conLai >= 0 ? 'positive' : 'negative';
    const dotAttr = entry.dotSo;
    const vndSuf = _vndSuffixHtml(totals.conLai, totals.tiGia);
    return `
        <i class="payment-dot-chevron" data-lucide="chevron-down"></i>
        <span class="payment-dot-label">Đợt ${dotAttr}</span>
        <div class="pp-head-rate" onclick="event.stopPropagation()">
            <label>Tỉ giá:</label>
            <span class="payment-ti-gia editable-cell" data-dot-so="${dotAttr}" ondblclick="startInlineEditTiGia(this)" title="Nhấp đúp để sửa">${totals.tiGia > 0 ? totals.tiGia : '—'}</span>
        </div>
        <div class="pp-conlai pp-conlai-compact ${conLaiClass}">
            <span class="pp-conlai-label">CÒN LẠI</span>
            <strong class="pp-conlai-value pp-con-lai">${formatNumber(totals.conLai)}${vndSuf}</strong>
        </div>
    `;
}

function renderPaymentDotSection(entry) {
    const dotAttr = entry.dotSo;
    return `
        <section class="payment-dot-section" data-dot-so="${dotAttr}">
            <div class="payment-dot-head" onclick="togglePaymentDotSection(this)">
                ${_renderDotHeadHtml(entry)}
            </div>
            <div class="payment-dot-body">
                ${_renderDotSectionBodyHtml(entry)}
            </div>
        </section>
    `;
}

function togglePaymentBreakdown(el) {
    el.classList.toggle('expanded');
}

function renderPaymentSlideOverBody() {
    if (!permissionHelper?.can('view_thanhToanCK')) {
        return '<div class="payment-empty">Không có quyền xem.</div>';
    }
    const entries = typeof getAllDotsAggregated === 'function' ? getAllDotsAggregated() : [];
    if (entries.length === 0) {
        return '<div class="payment-empty">Chưa có đợt hàng nào. Thêm đợt hàng trước.</div>';
    }
    return entries.map(renderPaymentDotSection).join('');
}

function togglePaymentDotSection(headEl) {
    const section = headEl.closest('.payment-dot-section');
    if (section) section.classList.toggle('collapsed');
}

function _refreshPaymentDotSectionUI(dotSo) {
    const section = document.querySelector(`.payment-dot-section[data-dot-so="${dotSo}"]`);
    if (!section) return;

    const entry = _aggregateDotEntry(dotSo);

    // Preserve breakdown expansion state across the re-render
    const expandedKinds = [...section.querySelectorAll('.pp-line-expandable.expanded')].map(
        (el) => el.dataset.breakdownKind
    );

    // Full re-render of both head and body so CÒN LẠI + tỉ giá + VND suffixes stay consistent.
    const headEl = section.querySelector('.payment-dot-head');
    if (headEl) headEl.innerHTML = _renderDotHeadHtml(entry);
    const bodyEl = section.querySelector('.payment-dot-body');
    if (bodyEl) bodyEl.innerHTML = _renderDotSectionBodyHtml(entry);

    // Restore breakdown expansion
    expandedKinds.forEach((kind) => {
        const el = section.querySelector(`.pp-line-expandable[data-breakdown-kind="${kind}"]`);
        if (el) el.classList.add('expanded');
    });

    if (window.lucide?.createIcons) window.lucide.createIcons();
}

async function _persistPaymentByDot(dotSo, patch) {
    const ds = parseInt(dotSo, 10) || 1;
    const dots = _findDotsByDotSo(ds);
    if (patch.thanhToanCK !== undefined) {
        dots.forEach((d) => {
            d.thanhToanCK = patch.thanhToanCK;
        });
    }
    if (patch.tiGia !== undefined) {
        dots.forEach((d) => {
            d.tiGia = patch.tiGia;
        });
    }
    await shipmentsApi.updatePaymentByDot(ds, patch);
    flattenNCCData();
    _refreshPaymentDotSectionUI(ds);
    updateInventoryStatsBar();
}

function _getPaymentsForDot(dotSo) {
    const dots = _findDotsByDotSo(dotSo);
    if (dots.length === 0) return [];
    const found = dots.find((d) => Array.isArray(d.thanhToanCK) && d.thanhToanCK.length > 0);
    return found ? [...found.thanhToanCK] : [];
}

function _getTiGiaForDot(dotSo) {
    const dots = _findDotsByDotSo(dotSo);
    for (const d of dots) {
        if (d.tiGia) return parseFloat(d.tiGia) || 0;
    }
    return 0;
}

// ---------- Tỉ giá inline edit ----------

function startInlineEditTiGia(el) {
    if (!permissionHelper?.can('view_thanhToanCK')) return;
    if (el.querySelector('input')) return;

    const dotSo = parseInt(el.dataset.dotSo, 10) || 1;
    const oldVal = _getTiGiaForDot(dotSo);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.0001';
    input.className = 'inline-edit-input payment-ti-gia-input';
    input.value = oldVal > 0 ? String(oldVal) : '';
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const restore = () => {
        el.textContent = oldVal > 0 ? String(oldVal) : '—';
    };
    const commit = async () => {
        const newVal = parseFloat(input.value) || 0;
        if (newVal === oldVal) {
            restore();
            return;
        }
        el.textContent = newVal > 0 ? String(newVal) : '—';
        try {
            await _persistPaymentByDot(dotSo, { tiGia: newVal });
            window.notificationManager?.success('Đã cập nhật tỉ giá');
        } catch (error) {
            console.error('[PAYMENT] Ti gia update error:', error);
            restore();
            window.notificationManager?.error('Không thể cập nhật: ' + error.message);
        }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            restore();
        }
    });
}

// ---------- Payment row inline edits ----------

function _startInlineEditPaymentGeneric(el, inputType, formatter, parser) {
    if (!permissionHelper?.can('view_thanhToanCK')) return;
    if (el.querySelector('input')) return;

    const paymentId = el.dataset.paymentId;
    const dotSo = parseInt(el.dataset.dotSo, 10) || 1;
    const field = el.dataset.field;
    if (!paymentId || !field) return;

    const payments = _getPaymentsForDot(dotSo);
    const record = payments.find((p) => p.id === paymentId);
    if (!record) return;

    const oldVal = record[field];
    const oldDisplay = formatter(oldVal);

    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'inline-edit-input';
    input.value = oldVal === undefined || oldVal === null ? '' : String(oldVal);
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const restore = () => {
        el.innerHTML = oldDisplay;
    };
    const commit = async () => {
        const newVal = parser(input.value);
        if (newVal === oldVal || (newVal === '' && !oldVal) || Number.isNaN(newVal)) {
            restore();
            return;
        }
        const updated = payments.map((p) => (p.id === paymentId ? { ...p, [field]: newVal } : p));
        el.innerHTML = formatter(newVal);
        try {
            await _persistPaymentByDot(dotSo, { thanhToanCK: updated });
            window.notificationManager?.success('Đã cập nhật thanh toán');
        } catch (error) {
            console.error('[PAYMENT] Update error:', error);
            restore();
            window.notificationManager?.error('Không thể cập nhật: ' + error.message);
        }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.removeEventListener('blur', commit);
            commit();
        }
        if (e.key === 'Escape') {
            input.removeEventListener('blur', commit);
            restore();
        }
    });
}

function startInlineEditPaymentNgay(el) {
    _startInlineEditPaymentGeneric(
        el,
        'date',
        (v) => (v ? formatDateDisplay(v) : '—'),
        (v) => (v || '').trim()
    );
}

function startInlineEditPaymentSoTien(el) {
    // Capture tỉ giá at handler-open time so optimistic UI includes VND suffix.
    const dotSo = parseInt(el.dataset.dotSo, 10) || 1;
    const tiGia = _getTiGiaForDot(dotSo);
    _startInlineEditPaymentGeneric(
        el,
        'number',
        (v) => _formatSoTienWithVnd(v, tiGia),
        (v) => parseFloat(v) || 0
    );
}

function startInlineEditPaymentNote(el) {
    _startInlineEditPaymentGeneric(
        el,
        'text',
        (v) => _escAttr(v || ''),
        (v) => (v || '').trim()
    );
}

// ---------- Add / Delete payment ----------

async function addPayment(btn) {
    if (!permissionHelper?.can('view_thanhToanCK')) return;
    const dotSo = parseInt(btn.dataset.dotSo, 10) || 1;
    const payments = _getPaymentsForDot(dotSo);
    const newId = `tt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const today = new Date().toISOString().slice(0, 10);
    const newPayment = { id: newId, ngayTT: today, soTienTT: 0, ghiChu: '' };
    const updated = [...payments, newPayment];

    try {
        // _persistPaymentByDot triggers _refreshPaymentDotSectionUI which full-rebuilds the body.
        await _persistPaymentByDot(dotSo, { thanhToanCK: updated });
        window.notificationManager?.success('Đã thêm dòng thanh toán');
    } catch (error) {
        console.error('[PAYMENT] Add error:', error);
        window.notificationManager?.error('Không thể thêm: ' + error.message);
    }
}

async function deletePayment(btn) {
    if (!permissionHelper?.can('view_thanhToanCK')) return;
    const paymentId = btn.dataset.paymentId;
    const dotSo = parseInt(btn.dataset.dotSo, 10) || 1;
    const payments = _getPaymentsForDot(dotSo);
    const updated = payments.filter((p) => p.id !== paymentId);

    try {
        await _persistPaymentByDot(dotSo, { thanhToanCK: updated });
        window.notificationManager?.success('Đã xóa dòng thanh toán');
    } catch (error) {
        console.error('[PAYMENT] Delete error:', error);
        window.notificationManager?.error('Không thể xóa: ' + error.message);
    }
}

// ---------- Slide-over open/close ----------

function openPaymentSlideOver() {
    if (!permissionHelper?.can('view_thanhToanCK')) return;
    const slideOver = document.getElementById('paymentSlideOver');
    if (!slideOver) return;
    const body = slideOver.querySelector('#paymentSlideOverBody');
    if (body) body.innerHTML = renderPaymentSlideOverBody();
    slideOver.classList.remove('hidden');
    // Sau tick kế để transition hoạt động
    requestAnimationFrame(() => slideOver.classList.add('open'));
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

function closePaymentSlideOver() {
    const slideOver = document.getElementById('paymentSlideOver');
    if (!slideOver) return;
    slideOver.classList.remove('open');
    setTimeout(() => slideOver.classList.add('hidden'), 250);
}

// Expose functions globally for inline event handlers
window.startInlineEdit = startInlineEdit;
window.startInlineEditNcc = startInlineEditNcc;
window.startInlineEditCost = startInlineEditCost;
window.startInlineEditCostNote = startInlineEditCostNote;
window.addTableImage = addTableImage;
window.removeTableImage = removeTableImage;
window.startInlineEditTiGia = startInlineEditTiGia;
window.startInlineEditPaymentNgay = startInlineEditPaymentNgay;
window.startInlineEditPaymentSoTien = startInlineEditPaymentSoTien;
window.startInlineEditPaymentNote = startInlineEditPaymentNote;
window.addPayment = addPayment;
window.deletePayment = deletePayment;
window.togglePaymentDotSection = togglePaymentDotSection;
window.togglePaymentBreakdown = togglePaymentBreakdown;
window.openPaymentSlideOver = openPaymentSlideOver;
window.closePaymentSlideOver = closePaymentSlideOver;
