/**
 * Attendance Module - Quản lý chấm công
 * Đọc dữ liệu từ Firestore (được sync bởi attendance-sync service)
 * Hiển thị bảng chấm công theo tuần trên web
 */
(function () {
    'use strict';

    // ================================================================
    // CONSTANTS
    // ================================================================
    const COLLECTIONS = {
        records: 'attendance_records',
        deviceUsers: 'attendance_device_users',
        commands: 'attendance_commands',
        syncStatus: 'attendance_sync_status',
    };

    const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const SHORT_DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    // ================================================================
    // STATE
    // ================================================================
    let db = null;
    let currentWeekStart = null; // Monday of current view
    let employees = [];          // From attendance_device_users
    let weekRecords = [];        // Attendance records for current week
    let syncStatus = null;       // Sync service status
    let unsubSyncStatus = null;  // Firestore listener unsubscribe

    // ================================================================
    // INIT
    // ================================================================
    function init() {
        db = firebase.firestore();
        if (!db) {
            console.error('[Attendance] Firestore chưa khởi tạo');
            return;
        }

        currentWeekStart = getMonday(new Date());

        bindEvents();
        loadEmployees().then(() => {
            loadWeekData();
        });
        listenSyncStatus();

        console.log('[Attendance] Module loaded');
    }

    // ================================================================
    // DATE HELPERS
    // ================================================================

    /** Lấy thứ Hai của tuần chứa ngày cho trước */
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay(); // 0=CN, 1=T2, ...
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /** Lấy mảng 7 ngày trong tuần (T2 → CN) */
    function getWeekDates() {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(currentWeekStart);
            d.setDate(d.getDate() + i);
            dates.push(d);
        }
        return dates;
    }

    /** Format date thành YYYY-MM-DD (dùng làm dateKey) */
    function toDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Format giờ HH:mm */
    function formatTime(date) {
        if (!date) return '--:--';
        const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    /** Lấy tên tuần + tháng hiển thị */
    function getWeekLabel() {
        const end = new Date(currentWeekStart);
        end.setDate(end.getDate() + 6);

        // Tuần thứ mấy trong tháng
        const weekNum = Math.ceil(currentWeekStart.getDate() / 7);
        const month = currentWeekStart.getMonth() + 1;
        const year = currentWeekStart.getFullYear();

        // Nếu tuần qua 2 tháng
        if (currentWeekStart.getMonth() !== end.getMonth()) {
            const m2 = end.getMonth() + 1;
            return `Tuần ${weekNum} - Th.${month}/${year} → Th.${m2}`;
        }

        return `Tuần ${weekNum} - Th.${month} ${year}`;
    }

    /** Kiểm tra ngày hôm nay */
    function isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate()
            && date.getMonth() === today.getMonth()
            && date.getFullYear() === today.getFullYear();
    }

    // ================================================================
    // DATA LOADING
    // ================================================================

    /** Load danh sách nhân viên từ máy chấm công */
    async function loadEmployees() {
        try {
            const snapshot = await db.collection(COLLECTIONS.deviceUsers).get();
            employees = [];
            snapshot.forEach(doc => {
                employees.push({ id: doc.id, ...doc.data() });
            });
            employees.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
            console.log(`[Attendance] Loaded ${employees.length} employees`);
        } catch (err) {
            console.error('[Attendance] Lỗi load employees:', err);
            employees = [];
        }
    }

    /** Load dữ liệu chấm công cho tuần hiện tại */
    async function loadWeekData() {
        const dates = getWeekDates();
        const startKey = toDateKey(dates[0]);
        const endKey = toDateKey(dates[6]);

        try {
            const snapshot = await db.collection(COLLECTIONS.records)
                .where('dateKey', '>=', startKey)
                .where('dateKey', '<=', endKey)
                .get();

            weekRecords = [];
            snapshot.forEach(doc => {
                weekRecords.push({ id: doc.id, ...doc.data() });
            });

            console.log(`[Attendance] Loaded ${weekRecords.length} records (${startKey} → ${endKey})`);
        } catch (err) {
            console.error('[Attendance] Lỗi load attendance:', err);
            weekRecords = [];
        }

        renderTimesheet();
    }

    /** Lắng nghe trạng thái sync (real-time) */
    function listenSyncStatus() {
        if (unsubSyncStatus) unsubSyncStatus();

        unsubSyncStatus = db.collection(COLLECTIONS.syncStatus)
            .doc('current')
            .onSnapshot(doc => {
                syncStatus = doc.exists ? doc.data() : null;
                renderSyncStatus();
            }, err => {
                console.warn('[Attendance] Lỗi listen sync status:', err);
            });
    }

    // ================================================================
    // RENDERING - TIMESHEET VIEW
    // ================================================================

    function renderTimesheet() {
        renderTimesheetHeader();
        renderTimesheetBody();
        renderWeekLabel();
    }

    /** Render header với ngày tháng đúng */
    function renderTimesheetHeader() {
        const thead = document.querySelector('#viewTimesheet .ts-grid thead tr');
        if (!thead) return;

        const dates = getWeekDates();

        thead.innerHTML = `
            <th class="ts-col-fixed" style="display:flex; justify-content:space-between; align-items:center; border-bottom:none; border-right:none;">
                Nhân viên
                <span class="ts-sync-indicator" id="syncIndicator" title="Trạng thái đồng bộ"></span>
            </th>
            ${dates.map(d => {
            const dayName = DAY_NAMES[d.getDay()];
            const dayNum = d.getDate();
            const todayClass = isToday(d) ? 'ts-day-active' : '';
            return `<th class="${todayClass}">${dayName} <span>${dayNum}</span></th>`;
        }).join('')}
            <th style="min-width:90px; text-align:right;">Tổng giờ</th>
        `;
    }

    /** Render body với dữ liệu chấm công */
    function renderTimesheetBody() {
        const tbody = document.querySelector('#viewTimesheet .ts-grid tbody');
        if (!tbody) return;

        // Nếu chưa có nhân viên
        if (employees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:14px;">
                        <div style="margin-bottom:12px;">
                            <i data-lucide="fingerprint" style="width:48px; height:48px; color:#d1d5db;"></i>
                        </div>
                        <div style="font-weight:500; margin-bottom:4px;">Chưa có dữ liệu chấm công</div>
                        <div style="font-size:12px;">Cài đặt sync service trên PC công ty để bắt đầu đồng bộ</div>
                    </td>
                </tr>
            `;
            refreshIcons();
            return;
        }

        const dates = getWeekDates();
        let html = '';

        for (const emp of employees) {
            const empId = String(emp.uid || emp.id);
            let totalMinutes = 0;

            html += '<tr>';

            // Cột tên nhân viên
            html += `
                <td class="ts-col-fixed">
                    <div style="font-weight:600; color:#1e293b;">${escapeHtml(emp.name || 'N/A')}</div>
                    <div style="font-size:11px; color:#8c8c8c;">ID: ${empId}</div>
                </td>
            `;

            // 7 cột cho 7 ngày
            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );

                const cellData = processDayRecords(dayRecords);
                totalMinutes += cellData.workedMinutes;

                html += `<td>${renderDayCell(cellData, emp, dateKey)}</td>`;
            }

            // Cột tổng giờ
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const totalDisplay = totalMinutes > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : '-';

            html += `
                <td style="text-align:right;">
                    <div style="font-weight:500;">${totalDisplay}</div>
                </td>
            `;

            html += '</tr>';
        }

        tbody.innerHTML = html;
        refreshIcons();
    }

    /**
     * Xử lý records của 1 nhân viên trong 1 ngày
     * → xác định check-in, check-out, trạng thái
     */
    function processDayRecords(records) {
        if (!records.length) {
            return { status: 'absent', checkIn: null, checkOut: null, workedMinutes: 0, records };
        }

        // Sắp xếp theo thời gian
        const sorted = records
            .map(r => ({
                ...r,
                time: r.checkTime ? (r.checkTime.toDate ? r.checkTime.toDate() : new Date(r.checkTime)) : null
            }))
            .filter(r => r.time)
            .sort((a, b) => a.time - b.time);

        if (sorted.length === 0) {
            return { status: 'absent', checkIn: null, checkOut: null, workedMinutes: 0, records };
        }

        const checkIn = sorted[0].time;
        const checkOut = sorted.length > 1 ? sorted[sorted.length - 1].time : null;

        // Tính thời gian làm việc
        let workedMinutes = 0;
        if (checkIn && checkOut) {
            workedMinutes = Math.round((checkOut - checkIn) / (1000 * 60));
        }

        // Xác định trạng thái
        let status = 'on_time'; // blue
        if (!checkOut) {
            status = 'incomplete'; // red - chỉ có vào mà không có ra
        }

        return { status, checkIn, checkOut, workedMinutes, records: sorted };
    }

    /** Render 1 ô ngày */
    function renderDayCell(cellData, emp, dateKey) {
        const { status, checkIn, checkOut } = cellData;

        if (status === 'absent') {
            // Ngày trong tương lai → để trống, ngày qua → chưa chấm công
            const cellDate = new Date(dateKey);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (cellDate > today) {
                return ''; // Tương lai
            }

            return `
                <div class="ts-block" style="border-left-color:#faad14; cursor:pointer;"
                     onclick="window._attendance.showDetail('${emp.uid || emp.id}','${dateKey}')">
                    <div class="ts-block-time" style="color:#faad14;">--:--</div>
                    <div class="ts-block-status" style="color:#faad14;">Chưa chấm công</div>
                </div>
            `;
        }

        // Xác định màu border
        let borderColor = '#52c41a'; // green = đúng giờ
        let statusText = 'Đúng giờ';
        let statusColor = '#52c41a';

        if (status === 'incomplete') {
            borderColor = '#ff4d4f';
            statusText = 'Chấm công thiếu';
            statusColor = '#ff4d4f';
        }

        const inTime = formatTime(checkIn);
        const outTime = checkOut ? formatTime(checkOut) : '--:--';

        return `
            <div class="ts-block" style="border-left-color:${borderColor}; cursor:pointer;"
                 onclick="window._attendance.showDetail('${emp.uid || emp.id}','${dateKey}')">
                <div class="ts-block-name" style="font-size:11px; color:#1e293b;">${inTime} - ${outTime}</div>
                <div class="ts-block-status" style="color:${statusColor};">${statusText}</div>
            </div>
        `;
    }

    /** Render trạng thái sync */
    function renderSyncStatus() {
        const el = document.getElementById('syncIndicator');
        if (!el) return;

        if (!syncStatus) {
            el.style.cssText = 'width:8px; height:8px; border-radius:50%; background:#d1d5db; display:inline-block;';
            el.title = 'Chưa có kết nối sync service';
            return;
        }

        const connected = syncStatus.connected;
        const lastSync = syncStatus.lastSyncTime;
        let lastSyncStr = '';

        if (lastSync) {
            const d = lastSync.toDate ? lastSync.toDate() : new Date(lastSync);
            lastSyncStr = d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        }

        el.style.cssText = `width:8px; height:8px; border-radius:50%; display:inline-block; background:${connected ? '#52c41a' : '#ff4d4f'};`;
        el.title = connected
            ? `Đã kết nối máy chấm công\nSync lần cuối: ${lastSyncStr}`
            : `Mất kết nối máy chấm công\n${syncStatus.lastError || ''}`;
    }

    /** Cập nhật label tuần */
    function renderWeekLabel() {
        // Timesheet view
        const tsLabel = document.querySelector('#viewTimesheet .ts-pager span');
        if (tsLabel) tsLabel.textContent = getWeekLabel();

        // Schedule view
        const scLabel = document.querySelector('#viewSchedule .ts-pager span');
        if (scLabel) scLabel.textContent = getWeekLabel();
    }

    // ================================================================
    // EVENTS
    // ================================================================

    function bindEvents() {
        // Week navigation - Timesheet
        const tsPager = document.querySelector('#viewTimesheet .ts-pager');
        if (tsPager) {
            const btns = tsPager.querySelectorAll('button');
            if (btns[0]) btns[0].addEventListener('click', () => changeWeek(-1));
            if (btns[1]) btns[1].addEventListener('click', () => changeWeek(1));
        }

        // Week navigation - Schedule
        const scPager = document.querySelector('#viewSchedule .ts-pager');
        if (scPager) {
            const btns = scPager.querySelectorAll('button');
            if (btns[0]) btns[0].addEventListener('click', () => changeWeek(-1));
            if (btns[1]) btns[1].addEventListener('click', () => changeWeek(1));
        }

        // "Tuần này" button
        const btnThisWeek = document.querySelector('#viewSchedule .ts-header-left .ts-btn');
        if (btnThisWeek && btnThisWeek.textContent.trim() === 'Tuần này') {
            btnThisWeek.addEventListener('click', () => {
                currentWeekStart = getMonday(new Date());
                loadWeekData();
            });
        }

        // "Chọn" button in timesheet → go to this week
        const btnChoose = document.querySelector('#viewTimesheet .ts-header-left .ts-btn');
        if (btnChoose && btnChoose.textContent.trim() === 'Chọn') {
            btnChoose.textContent = 'Tuần này';
            btnChoose.addEventListener('click', () => {
                currentWeekStart = getMonday(new Date());
                loadWeekData();
            });
        }

        // Search employee
        const searchInputs = document.querySelectorAll('.ts-search input');
        searchInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                filterEmployees(e.target.value);
            });
        });

        // Sync button on approval modal "..." button → thêm sync
        const moreBtn = document.querySelector('#viewTimesheet .ts-header-right .ts-btn:last-child');
        if (moreBtn) {
            moreBtn.title = 'Đồng bộ ngay';
            moreBtn.addEventListener('click', () => sendSyncCommand());
        }
    }

    function changeWeek(delta) {
        currentWeekStart.setDate(currentWeekStart.getDate() + (7 * delta));
        loadWeekData();
    }

    function filterEmployees(keyword) {
        if (!keyword) {
            renderTimesheetBody();
            return;
        }

        const kw = keyword.toLowerCase();
        const tbody = document.querySelector('#viewTimesheet .ts-grid tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const nameCell = row.querySelector('.ts-col-fixed div');
            if (nameCell) {
                const name = nameCell.textContent.toLowerCase();
                row.style.display = name.includes(kw) ? '' : 'none';
            }
        });
    }

    // ================================================================
    // COMMANDS - Gửi lệnh xuống sync service
    // ================================================================

    /** Yêu cầu sync ngay lập tức */
    async function sendSyncCommand() {
        try {
            await db.collection(COLLECTIONS.commands).add({
                action: 'sync_now',
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: 'web_admin',
            });
            showNotification('Đã gửi lệnh đồng bộ', 'success');
            // Reload data sau 5s
            setTimeout(() => loadWeekData(), 5000);
        } catch (err) {
            showNotification('Lỗi gửi lệnh: ' + err.message, 'error');
        }
    }

    /** Thêm user vào máy chấm công (bước 1 trước khi đăng ký vân tay) */
    async function addDeviceUser(name, deviceUserId) {
        try {
            await db.collection(COLLECTIONS.commands).add({
                action: 'add_user',
                employeeName: name,
                deviceUserId: String(deviceUserId),
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: 'web_admin',
            });
            showNotification(`Đang thêm "${name}" vào máy chấm công...`, 'info');
        } catch (err) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    }

    /** Yêu cầu đăng ký vân tay */
    async function enrollFingerprint(name, deviceUserId) {
        try {
            await db.collection(COLLECTIONS.commands).add({
                action: 'enroll_fingerprint',
                employeeName: name,
                deviceUserId: String(deviceUserId),
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: 'web_admin',
            });
            showNotification(`Đang đăng ký vân tay cho "${name}". Nhân viên cần đến máy chấm công để quẹt tay.`, 'info');
        } catch (err) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    }

    // ================================================================
    // DETAIL MODAL
    // ================================================================

    /** Hiện chi tiết chấm công 1 nhân viên 1 ngày */
    function showDetail(empId, dateKey) {
        const modal = document.getElementById('attendanceModal');
        if (!modal) return;

        const emp = employees.find(e => String(e.uid || e.id) === String(empId));
        const empName = emp ? emp.name : `User ${empId}`;

        // Tìm records cho ngày này
        const dayRecords = weekRecords
            .filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
            .map(r => ({
                ...r,
                time: r.checkTime ? (r.checkTime.toDate ? r.checkTime.toDate() : new Date(r.checkTime)) : null
            }))
            .filter(r => r.time)
            .sort((a, b) => a.time - b.time);

        // Populate modal
        const inputs = modal.querySelectorAll('.form-control');
        if (inputs[0]) inputs[0].value = empName;      // Nhân viên
        if (inputs[1]) inputs[1].value = dateKey;       // Ngày

        // Giờ vào / Giờ ra
        const timeInputs = modal.querySelectorAll('input[type="time"]');
        if (dayRecords.length > 0 && timeInputs[0]) {
            timeInputs[0].value = formatTime(dayRecords[0].time);
        }
        if (dayRecords.length > 1 && timeInputs[1]) {
            timeInputs[1].value = formatTime(dayRecords[dayRecords.length - 1].time);
        }

        // Hiện danh sách tất cả lần quẹt trong ngày
        const noteArea = modal.querySelector('textarea');
        if (noteArea && dayRecords.length > 0) {
            const lines = dayRecords.map((r, i) =>
                `Lần ${i + 1}: ${formatTime(r.time)} (type: ${r.type === 1 ? 'Ra' : 'Vào'})`
            );
            noteArea.value = lines.join('\n');
        } else if (noteArea) {
            noteArea.value = 'Không có bản ghi chấm công';
        }

        // Cập nhật text ca
        if (inputs[2]) inputs[2].value = 'Vân tay (DG-600)';

        modal.style.display = 'flex';

        // Close button
        const closeBtn = modal.querySelector('.btn-icon');
        if (closeBtn) {
            closeBtn.onclick = () => { modal.style.display = 'none'; };
        }
    }

    // ================================================================
    // HELPERS
    // ================================================================

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function refreshIcons() {
        if (typeof lucide !== 'undefined') {
            try { lucide.createIcons(); } catch (e) { }
        }
    }

    function showNotification(message, type) {
        // Sử dụng notification manager nếu có
        if (window.notificationManager && window.notificationManager.show) {
            window.notificationManager.show(message, type);
            return;
        }

        // Fallback: tạo notification đơn giản
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            padding: 12px 20px; border-radius: 8px; font-size: 14px;
            color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: ${type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : '#1890ff'};
            transition: opacity 0.3s;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 4000);
    }

    // ================================================================
    // PUBLIC API
    // ================================================================
    window._attendance = {
        init,
        showDetail,
        addDeviceUser,
        enrollFingerprint,
        sendSync: sendSyncCommand,
        reload: () => loadEmployees().then(() => loadWeekData()),
    };

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Chờ firebase init xong
            setTimeout(init, 500);
        });
    } else {
        setTimeout(init, 500);
    }
})();
