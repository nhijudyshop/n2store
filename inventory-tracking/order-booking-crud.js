// =====================================================
// ORDER BOOKING CRUD OPERATIONS
// Create, Read, Update, Delete for order bookings
// =====================================================

/**
 * Load all order bookings from Firestore
 */
async function loadOrderBookings() {
    try {
        console.log('[ORDER-BOOKING-CRUD] Loading order bookings...');

        const snapshot = await orderBookingsRef.orderBy('ngayDatHang', 'desc').get();

        const bookings = [];
        snapshot.forEach(doc => {
            bookings.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Check for differences with linked shipments
        bookings.forEach(booking => {
            if (booking.linkedShipmentId) {
                booking.hasDifference = checkBookingDifference(booking);
            }
        });

        globalState.orderBookings = bookings;
        globalState.filteredOrderBookings = [...bookings];

        console.log(`[ORDER-BOOKING-CRUD] Loaded ${bookings.length} order bookings`);

        return bookings;
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error loading order bookings:', error);
        toast.error('Lỗi khi tải dữ liệu đơn đặt hàng');
        return [];
    }
}

/**
 * Create new order booking
 */
async function createOrderBooking(data) {
    try {
        const auth = authManager?.getAuthState();
        const username = auth?.userType?.split('-')[0] || 'unknown';

        const bookingData = {
            ngayDatHang: data.ngayDatHang,
            sttNCC: data.sttNCC,
            trangThai: data.trangThai || 'pending',
            anhHoaDon: data.anhHoaDon || [],
            sanPham: data.sanPham || [],
            tongTienHD: data.tongTienHD || 0,
            tongMon: data.tongMon || 0,
            ghiChu: data.ghiChu || '',
            linkedShipmentId: null,
            linkedInvoiceIdx: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: username,
            updatedBy: username
        };

        const docRef = await orderBookingsRef.add(bookingData);

        // Add to local state
        const newBooking = {
            id: docRef.id,
            ...bookingData,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        globalState.orderBookings.unshift(newBooking);
        globalState.filteredOrderBookings = [...globalState.orderBookings];

        console.log('[ORDER-BOOKING-CRUD] Created order booking:', docRef.id);

        return newBooking;
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error creating order booking:', error);
        throw error;
    }
}

/**
 * Update existing order booking
 */
async function updateOrderBooking(bookingId, data) {
    try {
        const auth = authManager?.getAuthState();
        const username = auth?.userType?.split('-')[0] || 'unknown';

        const updateData = {
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: username
        };

        // Remove undefined fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) {
                delete updateData[key];
            }
        });

        await orderBookingsRef.doc(bookingId).update(updateData);

        // Update local state
        const idx = globalState.orderBookings.findIndex(b => b.id === bookingId);
        if (idx !== -1) {
            globalState.orderBookings[idx] = {
                ...globalState.orderBookings[idx],
                ...updateData,
                updatedAt: new Date()
            };
        }

        // Update filtered list
        const filteredIdx = globalState.filteredOrderBookings.findIndex(b => b.id === bookingId);
        if (filteredIdx !== -1) {
            globalState.filteredOrderBookings[filteredIdx] = {
                ...globalState.filteredOrderBookings[filteredIdx],
                ...updateData,
                updatedAt: new Date()
            };
        }

        console.log('[ORDER-BOOKING-CRUD] Updated order booking:', bookingId);

        return globalState.orderBookings[idx];
    } catch (error) {
        console.error('[ORDER-BOOKING-CRUD] Error updating order booking:', error);
        throw error;
    }
}

/**
 * Delete order booking
 */
async function deleteOrderBookingFromDB(bookingId) {
    try {
        await orderBookingsRef.doc(bookingId).delete();

        // Remove from local state
        globalState.orderBookings = globalState.orderBookings.filter(b => b.id !== bookingId);
        globalState.filteredOrderBookings = globalState.filteredOrderBookings.filter(b => b.id !== bookingId);

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
        toast.error('Không tìm thấy đơn đặt hàng');
        return;
    }

    if (!permissionHelper?.can('edit_orderBooking')) {
        toast.error('Bạn không có quyền sửa đơn đặt hàng');
        return;
    }

    // Open modal with booking data
    if (window.openOrderBookingModal) {
        openOrderBookingModal(booking);
    }
}

/**
 * Delete order booking with confirmation
 */
async function deleteOrderBooking(bookingId) {
    if (!permissionHelper?.can('delete_orderBooking')) {
        toast.error('Bạn không có quyền xóa đơn đặt hàng');
        return;
    }

    const booking = globalState.orderBookings.find(b => b.id === bookingId);
    if (!booking) {
        toast.error('Không tìm thấy đơn đặt hàng');
        return;
    }

    const confirmed = confirm(`Bạn có chắc muốn xóa đơn đặt hàng NCC ${booking.sttNCC}?`);
    if (!confirmed) return;

    try {
        await deleteOrderBookingFromDB(bookingId);

        // Re-render
        renderOrderBookings(globalState.filteredOrderBookings);

        toast.success('Đã xóa đơn đặt hàng');
    } catch (error) {
        toast.error('Lỗi khi xóa đơn đặt hàng');
    }
}

/**
 * Upload images for order booking
 */
async function uploadBookingImages(files) {
    const uploadedUrls = [];

    for (const file of files) {
        try {
            // Validate file
            if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
                toast.warning(`Bỏ qua ${file.name} - định dạng không hỗ trợ`);
                continue;
            }

            if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
                toast.warning(`Bỏ qua ${file.name} - vượt quá 5MB`);
                continue;
            }

            // Generate unique filename
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(7);
            const ext = file.name.split('.').pop();
            const filename = `order_booking_${timestamp}_${randomStr}.${ext}`;

            // Upload to Firebase Storage
            const storageRef = storage.ref(`order_bookings/${filename}`);
            const snapshot = await storageRef.put(file);
            const url = await snapshot.ref.getDownloadURL();

            uploadedUrls.push(url);
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error(`Lỗi upload ${file.name}`);
        }
    }

    return uploadedUrls;
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

    // Keep first option
    select.innerHTML = '<option value="all">Tất cả NCC</option>';

    nccList.forEach(ncc => {
        const option = document.createElement('option');
        option.value = ncc;
        option.textContent = `NCC ${ncc}`;
        select.appendChild(option);
    });

    // Restore selection
    if (currentValue && nccList.includes(currentValue)) {
        select.value = currentValue;
    }
}

console.log('[ORDER-BOOKING-CRUD] Loaded successfully');
