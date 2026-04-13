// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// API CLIENT - INVENTORY TRACKING
// Abstraction layer: Replaces Firestore SDK with REST API calls to Render server
// =====================================================

const API_BASE = 'https://n2store-fallback.onrender.com/api/v2/inventory-tracking';

/**
 * Core fetch wrapper with auth headers
 */
async function apiFetch(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    // Pass auth data to server
    try {
        const userInfo = authManager?.getUserInfo();
        if (userInfo) {
            headers['x-auth-data'] = JSON.stringify({
                userName: userInfo.displayName || userInfo.username || 'anonymous',
                userId: userInfo.uid || userInfo.username || 'anonymous'
            });
        }
    } catch (_) { /* ignore */ }

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
}

// =====================================================
// SUPPLIERS API
// =====================================================

const suppliersApi = {
    async getAll() {
        const result = await apiFetch('/suppliers');
        return result.data;
    },

    async create(sttNCC, tenNCC) {
        const result = await apiFetch('/suppliers', {
            method: 'POST',
            body: JSON.stringify({ stt_ncc: sttNCC, ten_ncc: tenNCC })
        });
        return result.data;
    }
};

// =====================================================
// ORDER BOOKINGS API (Tab 1: Dat Hang)
// =====================================================

const orderBookingsApi = {
    async getAll(filters = {}) {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('date_from', filters.dateFrom);
        if (filters.dateTo) params.set('date_to', filters.dateTo);
        if (filters.sttNCC && filters.sttNCC !== 'all') params.set('stt_ncc', filters.sttNCC);
        if (filters.trangThai && filters.trangThai !== 'all') params.set('trang_thai', filters.trangThai);
        if (filters.search) params.set('search', filters.search);
        if (filters.limit) params.set('limit', filters.limit);

        const qs = params.toString();
        const result = await apiFetch(`/order-bookings${qs ? '?' + qs : ''}`);
        return result;
    },

    async getById(id) {
        const result = await apiFetch(`/order-bookings/${id}`);
        return result.data;
    },

    async create(data) {
        const result = await apiFetch('/order-bookings', {
            method: 'POST',
            body: JSON.stringify({
                id: data.id,
                stt_ncc: data.sttNCC,
                ngay_dat_hang: data.ngayDatHang,
                ten_ncc: data.tenNCC,
                trang_thai: data.trangThai || 'pending',
                san_pham: data.sanPham || [],
                tong_tien_hd: data.tongTienHD || 0,
                tong_mon: data.tongMon || 0,
                anh_hoa_don: data.anhHoaDon || [],
                ghi_chu: data.ghiChu || '',
                linked_dot_hang_id: data.linkedDotHangId || null
            })
        });
        return result.data;
    },

    async update(id, data) {
        const body = {};
        if (data.sttNCC !== undefined) body.stt_ncc = data.sttNCC;
        if (data.ngayDatHang !== undefined) body.ngay_dat_hang = data.ngayDatHang;
        if (data.tenNCC !== undefined) body.ten_ncc = data.tenNCC;
        if (data.trangThai !== undefined) body.trang_thai = data.trangThai;
        if (data.sanPham !== undefined) body.san_pham = data.sanPham;
        if (data.tongTienHD !== undefined) body.tong_tien_hd = data.tongTienHD;
        if (data.tongMon !== undefined) body.tong_mon = data.tongMon;
        if (data.anhHoaDon !== undefined) body.anh_hoa_don = data.anhHoaDon;
        if (data.ghiChu !== undefined) body.ghi_chu = data.ghiChu;
        if (data.linkedDotHangId !== undefined) body.linked_dot_hang_id = data.linkedDotHangId;

        const result = await apiFetch(`/order-bookings/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return result.data;
    },

    async updateStatus(id, trangThai) {
        const result = await apiFetch(`/order-bookings/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ trang_thai: trangThai })
        });
        return result.data;
    },

    async delete(id) {
        await apiFetch(`/order-bookings/${id}`, { method: 'DELETE' });
        return true;
    }
};

// =====================================================
// SHIPMENTS API (Tab 2: Theo Doi Don Hang)
// =====================================================

const shipmentsApi = {
    async getAll(filters = {}) {
        const params = new URLSearchParams();
        if (filters.dateFrom) params.set('date_from', filters.dateFrom);
        if (filters.dateTo) params.set('date_to', filters.dateTo);
        if (filters.sttNCC && filters.sttNCC !== 'all') params.set('stt_ncc', filters.sttNCC);
        if (filters.search) params.set('search', filters.search);
        if (filters.limit) params.set('limit', filters.limit);

        const qs = params.toString();
        const result = await apiFetch(`/shipments${qs ? '?' + qs : ''}`);
        return result;
    },

    async getById(id) {
        const result = await apiFetch(`/shipments/${id}`);
        return result.data;
    },

    async create(data) {
        const result = await apiFetch('/shipments', {
            method: 'POST',
            body: JSON.stringify({
                id: data.id,
                stt_ncc: data.sttNCC,
                ngay_di_hang: data.ngayDiHang,
                ten_ncc: data.tenNCC,
                kien_hang: data.kienHang || [],
                tong_kien: data.tongKien || 0,
                tong_kg: data.tongKg || 0,
                san_pham: data.sanPham || [],
                tong_tien_hd: data.tongTienHD || 0,
                tong_mon: data.tongMon || 0,
                so_mon_thieu: data.soMonThieu || 0,
                ghi_chu_thieu: data.ghiChuThieu || '',
                anh_hoa_don: data.anhHoaDon || [],
                ghi_chu: data.ghiChu || '',
                chi_phi_hang_ve: data.chiPhiHangVe || [],
                tong_chi_phi: data.tongChiPhi || 0
            })
        });
        return result.data;
    },

    async update(id, data) {
        const body = {};
        if (data.sttNCC !== undefined) body.stt_ncc = data.sttNCC;
        if (data.ngayDiHang !== undefined) body.ngay_di_hang = data.ngayDiHang;
        if (data.tenNCC !== undefined) body.ten_ncc = data.tenNCC;
        if (data.kienHang !== undefined) body.kien_hang = data.kienHang;
        if (data.tongKien !== undefined) body.tong_kien = data.tongKien;
        if (data.tongKg !== undefined) body.tong_kg = data.tongKg;
        if (data.sanPham !== undefined) body.san_pham = data.sanPham;
        if (data.tongTienHD !== undefined) body.tong_tien_hd = data.tongTienHD;
        if (data.tongMon !== undefined) body.tong_mon = data.tongMon;
        if (data.soMonThieu !== undefined) body.so_mon_thieu = data.soMonThieu;
        if (data.ghiChuThieu !== undefined) body.ghi_chu_thieu = data.ghiChuThieu;
        if (data.anhHoaDon !== undefined) body.anh_hoa_don = data.anhHoaDon;
        if (data.ghiChu !== undefined) body.ghi_chu = data.ghiChu;
        if (data.chiPhiHangVe !== undefined) body.chi_phi_hang_ve = data.chiPhiHangVe;
        if (data.tongChiPhi !== undefined) body.tong_chi_phi = data.tongChiPhi;

        const result = await apiFetch(`/shipments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return result.data;
    },

    async updateShortage(id, soMonThieu, ghiChuThieu) {
        const result = await apiFetch(`/shipments/${id}/shortage`, {
            method: 'PATCH',
            body: JSON.stringify({ so_mon_thieu: soMonThieu, ghi_chu_thieu: ghiChuThieu })
        });
        return result.data;
    },

    async delete(id) {
        await apiFetch(`/shipments/${id}`, { method: 'DELETE' });
        return true;
    }
};

// =====================================================
// PREPAYMENTS API (Tab 3)
// =====================================================

const prepaymentsApi = {
    async getAll() {
        const result = await apiFetch('/prepayments');
        return result.data;
    },

    async create(data) {
        const result = await apiFetch('/prepayments', {
            method: 'POST',
            body: JSON.stringify({
                ngay: data.ngay,
                so_tien: data.soTien,
                ghi_chu: data.ghiChu || ''
            })
        });
        return result.data;
    },

    async update(id, data) {
        const result = await apiFetch(`/prepayments/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                ngay: data.ngay,
                so_tien: data.soTien,
                ghi_chu: data.ghiChu
            })
        });
        return result.data;
    },

    async delete(id) {
        await apiFetch(`/prepayments/${id}`, { method: 'DELETE' });
        return true;
    }
};

// =====================================================
// OTHER EXPENSES API (Tab 3)
// =====================================================

const otherExpensesApi = {
    async getAll() {
        const result = await apiFetch('/other-expenses');
        return result.data;
    },

    async create(data) {
        const result = await apiFetch('/other-expenses', {
            method: 'POST',
            body: JSON.stringify({
                ngay: data.ngay,
                loai_chi: data.loaiChi || '',
                so_tien: data.soTien,
                ghi_chu: data.ghiChu || ''
            })
        });
        return result.data;
    },

    async update(id, data) {
        const result = await apiFetch(`/other-expenses/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                ngay: data.ngay,
                loai_chi: data.loaiChi,
                so_tien: data.soTien,
                ghi_chu: data.ghiChu
            })
        });
        return result.data;
    },

    async delete(id) {
        await apiFetch(`/other-expenses/${id}`, { method: 'DELETE' });
        return true;
    }
};

// =====================================================
// FINANCE SUMMARY API
// =====================================================

const financeApi = {
    async getSummary() {
        const result = await apiFetch('/finance/summary');
        return result.data;
    }
};

// =====================================================
// EDIT HISTORY API
// =====================================================

const editHistoryApi = {
    async getAll(filters = {}) {
        const params = new URLSearchParams();
        if (filters.entityType) params.set('entity_type', filters.entityType);
        if (filters.limit) params.set('limit', filters.limit);
        if (filters.offset) params.set('offset', filters.offset);

        const qs = params.toString();
        const result = await apiFetch(`/edit-history${qs ? '?' + qs : ''}`);
        return result.data;
    },

    async log(action, entityType, entityId, sttNCC, changes) {
        const result = await apiFetch('/edit-history', {
            method: 'POST',
            body: JSON.stringify({ action, entity_type: entityType, entity_id: entityId, stt_ncc: sttNCC, changes })
        });
        return result.data;
    }
};

// =====================================================
// HELPER: Convert PG snake_case row to camelCase
// =====================================================

function pgToBooking(row) {
    return {
        id: row.id,
        sttNCC: row.stt_ncc,
        nccDocId: `ncc_${row.stt_ncc}`,
        ngayDatHang: row.ngay_dat_hang ? row.ngay_dat_hang.split('T')[0] : row.ngay_dat_hang,
        tenNCC: row.ten_ncc,
        trangThai: row.trang_thai,
        sanPham: typeof row.san_pham === 'string' ? JSON.parse(row.san_pham) : (row.san_pham || []),
        tongTienHD: parseFloat(row.tong_tien_hd) || 0,
        tongMon: parseInt(row.tong_mon) || 0,
        anhHoaDon: row.anh_hoa_don || [],
        ghiChu: row.ghi_chu || '',
        linkedDotHangId: row.linked_dot_hang_id,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function pgToShipment(row) {
    return {
        id: row.id,
        sttNCC: row.stt_ncc,
        nccDocId: `ncc_${row.stt_ncc}`,
        ngayDiHang: row.ngay_di_hang ? row.ngay_di_hang.split('T')[0] : row.ngay_di_hang,
        tenNCC: row.ten_ncc,
        kienHang: typeof row.kien_hang === 'string' ? JSON.parse(row.kien_hang) : (row.kien_hang || []),
        tongKien: parseInt(row.tong_kien) || 0,
        tongKg: parseFloat(row.tong_kg) || 0,
        sanPham: typeof row.san_pham === 'string' ? JSON.parse(row.san_pham) : (row.san_pham || []),
        tongTienHD: parseFloat(row.tong_tien_hd) || 0,
        tongMon: parseInt(row.tong_mon) || 0,
        soMonThieu: parseInt(row.so_mon_thieu) || 0,
        ghiChuThieu: row.ghi_chu_thieu || '',
        anhHoaDon: row.anh_hoa_don || [],
        ghiChu: row.ghi_chu || '',
        chiPhiHangVe: typeof row.chi_phi_hang_ve === 'string' ? JSON.parse(row.chi_phi_hang_ve) : (row.chi_phi_hang_ve || []),
        tongChiPhi: parseFloat(row.tong_chi_phi) || 0,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function pgToPrepayment(row) {
    return {
        id: row.id,
        ngay: row.ngay ? row.ngay.split('T')[0] : row.ngay,
        soTien: parseFloat(row.so_tien) || 0,
        ghiChu: row.ghi_chu || '',
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function pgToOtherExpense(row) {
    return {
        id: row.id,
        ngay: row.ngay ? row.ngay.split('T')[0] : row.ngay,
        loaiChi: row.loai_chi || '',
        soTien: parseFloat(row.so_tien) || 0,
        ghiChu: row.ghi_chu || '',
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// =====================================================
// INLINE NOTES API (Multi-user Thiếu & Ghi Chú)
// =====================================================

const inlineNotesApi = {
    /**
     * Fetch all inline notes for given shipment IDs (batch)
     * @param {string[]} shipmentIds
     * @returns {Promise<Object[]>} Array of note rows
     */
    async getByShipmentIds(shipmentIds) {
        if (!shipmentIds || shipmentIds.length === 0) return [];
        const result = await apiFetch(`/inline-notes?shipment_ids=${shipmentIds.join(',')}`);
        return result.data;
    },

    /**
     * Upsert inline note (thieu + ghichu) for current user
     */
    async upsert(shipmentId, { thieuValue, ghichuText, ghichuImages, isAdmin }) {
        const result = await apiFetch('/inline-notes', {
            method: 'PUT',
            body: JSON.stringify({
                shipment_id: shipmentId,
                thieu_value: thieuValue,
                ghichu_text: ghichuText,
                ghichu_images: ghichuImages,
                is_admin: isAdmin
            })
        });
        return result.data;
    },

    /**
     * Add image to inline note
     */
    async addImage(shipmentId, imageUrl, isAdmin) {
        const result = await apiFetch('/inline-notes/image', {
            method: 'PATCH',
            body: JSON.stringify({
                shipment_id: shipmentId,
                image_url: imageUrl,
                is_admin: isAdmin
            })
        });
        return result.data;
    },

    /**
     * Remove image from inline note
     */
    async removeImage(shipmentId, imageUrl) {
        const result = await apiFetch('/inline-notes/image', {
            method: 'DELETE',
            body: JSON.stringify({
                shipment_id: shipmentId,
                image_url: imageUrl
            })
        });
        return result.data;
    }
};

console.log('[API-CLIENT] Inventory tracking API client initialized');
