// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ORDER BOOKING CRUD OPERATIONS
// Migrated from Firestore SDK to REST API (api-client.js)
// =====================================================

/**
 * Load all order bookings from API
 * Uses getAllDatHang() from data-loader.js (already loaded via loadNCCData)
 */
async function loadOrderBookings() {
    try {
        console.log('[ORDER-BOOKING-CRUD] Loading order bookings...');

        // Load NCC data if not already loaded
        if (globalState.nccList.length === 0) {
            await loadNCCData();
        }

        // Get flattened datHang from all NCCs
        const bookings = getAllDatHang();

        // Check for differences with linked shipments
        bookings.forEach(booking => {
            if (booking.linkedDotHangId) {
                booking.hasDifference = checkBookingDifference(booking);
            }
        });

        globalState.orderBookings = bookings;
        globalState.filteredOrderBookings = [...bookings];

        console.log(`[ORDER-BOOKING-CRUD] Loaded ${bookings.length} order bookings`);

        return bookings;
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error loading order bookings:', error);
        window.notificationManager?.error('Lỗi khi tải dữ liệu đơn đặt hàng');
        return [];
    }
}

/**
 * Create new order booking via API
 */
async function createOrderBooking(data) {
    try {
        const sttNCC = parseInt(data.sttNCC, 10);
        if (!sttNCC) {
            throw new Error('sttNCC is required');
        }

        const newBooking = {
            id: generateId('booking'),
            sttNCC: sttNCC,
            ngayDatHang: data.ngayDatHang,
            tenNCC: data.tenNCC || '',
            trangThai: data.trangThai || 'pending',
            sanPham: data.sanPham || [],
            tongTienHD: data.tongTienHD || 0,
            tongMon: data.tongMon || 0,
            anhHoaDon: data.anhHoaDon || [],
            ghiChu: data.ghiChu || ''
        };

        // Save via API
        const saved = await orderBookingsApi.create(newBooking);

        // Update local state
        const ncc = getNCCById(sttNCC) || await getOrCreateNCC(sttNCC);
        if (ncc) {
            if (!ncc.datHang) ncc.datHang = [];
            ncc.datHang.push(pgToBooking(saved));
        }

        // Refresh flattened data
        flattenNCCData();

        console.log('[ORDER-BOOKING-CRUD] Created order booking:', newBooking.id);

        return { ...pgToBooking(saved), sttNCC, nccDocId: `ncc_${sttNCC}` };
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error creating order booking:', error);
        throw error;
    }
}

/**
 * Update existing order booking via API
 */
async function updateOrderBooking(bookingId, data) {
    try {
        const existingBooking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!existingBooking) {
            throw new Error('Booking not found');
        }

        const sttNCC = existingBooking.sttNCC;

        // Update via API
        const saved = await orderBookingsApi.update(bookingId, data);

        // Update local state
        const ncc = getNCCById(sttNCC);
        if (ncc) {
            const idx = (ncc.datHang || []).findIndex(b => b.id === bookingId);
            if (idx !== -1) {
                ncc.datHang[idx] = pgToBooking(saved);
            }
        }

        // Refresh flattened data
        flattenNCCData();

        console.log('[ORDER-BOOKING-CRUD] Updated order booking:', bookingId);

        return { ...pgToBooking(saved), sttNCC, nccDocId: `ncc_${sttNCC}` };
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error updating order booking:', error);
        throw error;
    }
}

/**
 * Delete order booking via API
 */
async function deleteOrderBookingFromDB(bookingId) {
    try {
        const existingBooking = globalState.orderBookings.find(b => b.id === bookingId);
        if (!existingBooking) {
            throw new Error('Booking not found');
        }

        const sttNCC = existingBooking.sttNCC;

        // Delete via API
        await orderBookingsApi.delete(bookingId);

        // Update local state
        const ncc = getNCCById(sttNCC);
        if (ncc) {
            ncc.datHang = (ncc.datHang || []).filter(b => b.id !== bookingId);
        }

        flattenNCCData();

        console.log('[ORDER-BOOKING-CRUD] Deleted order booking:', bookingId);
        return true;
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error deleting order booking:', error);
        throw error;
    }
}

/**
 * Edit order booking - open modal with data
 */
function editOrderBooking(bookingId) {
    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking) {
        window.notificationManager?.error('Không tìm thấy đơn đặt hàng');
        return;
    }

    if (!permissionHelper?.can('edit_orderBooking')) {
        window.notificationManager?.error('Bạn không có quyền sửa đơn đặt hàng');
        return;
    }

    if (window.openOrderBookingModal) {
        openOrderBookingModal(booking);
    }
}

/**
 * Delete order booking with confirmation
 */
async function deleteOrderBooking(bookingId) {
    if (!permissionHelper?.can('delete_orderBooking')) {
        window.notificationManager?.error('Bạn không có quyền xóa đơn đặt hàng');
        return;
    }

    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking) {
        window.notificationManager?.error('Không tìm thấy đơn đặt hàng');
        return;
    }

    const confirmed = confirm(`Bạn có chắc muốn xóa đơn đặt hàng NCC ${booking.sttNCC}?`);
    if (!confirmed) return;

    try {
        await deleteOrderBookingFromDB(bookingId);
        renderOrderBookings(globalState.filteredOrderBookings);
        window.notificationManager?.success('Đã xóa đơn đặt hàng');
    } catch (error) {
        window.notificationManager?.error('Lỗi khi xóa đơn đặt hàng');
    }
}

/**
 * Upload images for order booking (unchanged - still uses Firebase Storage via Render proxy)
 */
async function uploadBookingImages(files) {
    const uploadedUrls = [];

    for (const file of files) {
        try {
            if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
                window.notificationManager?.warning(`Bỏ qua ${file.name} - định dạng không hỗ trợ`);
                continue;
            }

            if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
                window.notificationManager?.warning(`Bỏ qua ${file.name} - vượt quá 5MB`);
                continue;
            }

            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(7);
            const ext = file.name.split('.').pop();
            const filename = `order_booking_${timestamp}_${randomStr}.${ext}`;

            const base64 = await fileToBase64(file);

            const serverUrl = 'https://n2shop.onrender.com/api/upload/image';
            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64,
                    fileName: filename,
                    folderPath: 'order_bookings',
                    mimeType: file.type
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            console.log('[ORDER-BOOKING-CRUD] Image uploaded:', result.url);
            uploadedUrls.push(result.url);
        } catch (error) {
            console.error('Error uploading image:', error);
            window.notificationManager?.error(`Lỗi upload ${file.name}`);
        }
    }

    return uploadedUrls;
}

/**
 * Convert File to base64
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Get NCC list from order bookings for filter
 */
function getBookingNCCList() {
    const nccSet = new Set();
    globalState.orderBookings.forEach(booking => {
        if (booking.sttNCC) {
            nccSet.add(String(booking.sttNCC));
        }
    });
    return Array.from(nccSet).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Populate NCC filter dropdown for bookings
 */
function populateBookingNCCFilter() {
    const select = document.getElementById('filterBookingNCC');
    if (!select) return;

    const nccList = getBookingNCCList();
    const currentValue = select.value;

    select.innerHTML = '<option value="all">Tất cả NCC</option>';

    nccList.forEach(ncc => {
        const nccDoc = getNCCById(parseInt(ncc));
        const tenNCC = getNCCDisplayName(nccDoc);
        const option = document.createElement('option');
        option.value = ncc;
        option.textContent = tenNCC ? `NCC ${ncc} - ${tenNCC}` : `NCC ${ncc}`;
        select.appendChild(option);
    });

    if (currentValue && nccList.includes(currentValue)) {
        select.value = currentValue;
    }
}

/**
 * Get suggested tenNCC from existing NCC data
 */
function getSuggestedTenNCC(sttNCC) {
    const ncc = getNCCById(sttNCC);
    if (!ncc) return '';
    return getNCCDisplayName(ncc);
}

console.log('[ORDER-BOOKING-CRUD] Loaded successfully (API mode)');
