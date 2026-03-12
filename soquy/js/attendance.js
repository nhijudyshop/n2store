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

    // Salary calculation constants
    const SALARY = {
        DAILY_RATE: 200000,         // VND per day
        HOURLY_RATE: 25000,         // 200000 / 8 hours
        LATE_PENALTY_PER_MIN: 5000, // VND per minute late after 8:00
        WORK_START_HOUR: 8,         // 8:00
        WORK_END_HOUR: 16,          // 16:00
        OT_START_HOUR: 20,          // 20:00
        OT_MULTIPLIER: 2,           // double rate for OT
    };

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
        renderSchedule();
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
            <th style="min-width:110px; text-align:right;">Lương</th>
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
                    <td colspan="10" style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:14px;">
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
        let grandTotalSalary = 0;
        let grandTotalMinutes = 0;

        // Tính lương trước để sắp xếp theo lương giảm dần
        const empData = employees.map(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            let totalMinutes = 0;
            let weekSalary = 0;
            let workedDays = 0;
            const dayCells = [];

            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );
                const cellData = processDayRecords(dayRecords);
                totalMinutes += cellData.workedMinutes;
                const daySalary = calculateDaySalary(cellData);
                weekSalary += daySalary.totalSalary;
                if (daySalary.totalSalary > 0) workedDays++;
                dayCells.push({ cellData, daySalary, dateKey });
            }

            return { emp, empId, totalMinutes, weekSalary, workedDays, dayCells };
        });

        // Sắp xếp theo lương giảm dần
        empData.sort((a, b) => b.weekSalary - a.weekSalary);

        for (const { emp, empId, totalMinutes, weekSalary, workedDays, dayCells } of empData) {
            grandTotalSalary += weekSalary;
            grandTotalMinutes += totalMinutes;

            html += '<tr>';

            // Cột tên nhân viên
            html += `
                <td class="ts-col-fixed">
                    <div style="font-weight:600; color:#1e293b;">${escapeHtml(emp.name || 'N/A')}</div>
                    <div style="font-size:11px; color:#8c8c8c;">ID: ${empId}</div>
                </td>
            `;

            // 7 cột cho 7 ngày
            for (const { cellData, daySalary, dateKey } of dayCells) {
                html += `<td>${renderDayCell(cellData, daySalary, emp, dateKey)}</td>`;
            }

            // Cột tổng giờ
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const totalDisplay = totalMinutes > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : '-';

            html += `
                <td style="text-align:right; vertical-align:middle;">
                    <div style="font-weight:600; font-size:13px; color:#1e293b;">${totalDisplay}</div>
                    ${workedDays > 0 ? `<div style="font-size:11px; color:#8c8c8c;">${workedDays} ngày</div>` : ''}
                </td>
            `;

            // Cột lương
            html += `
                <td style="text-align:right; vertical-align:middle;">
                    <div style="font-weight:700; font-size:13px; color:${weekSalary > 0 ? '#1e293b' : '#bfbfbf'};">${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}</div>
                </td>
            `;

            html += '</tr>';
        }

        // Hàng tổng cộng
        if (employees.length > 0) {
            const gtHours = Math.floor(grandTotalMinutes / 60);
            const gtMins = grandTotalMinutes % 60;
            const gtDisplay = grandTotalMinutes > 0 ? `${gtHours}h${gtMins > 0 ? gtMins + 'm' : ''}` : '-';

            html += `
                <tr style="background:#fafafa; border-top:2px solid #e2e8f0;">
                    <td class="ts-col-fixed" style="background:#fafafa;">
                        <div style="font-weight:700; color:#1e293b;">Tổng cộng</div>
                        <div style="font-size:11px; color:#8c8c8c;">${employees.length} nhân viên</div>
                    </td>
                    <td colspan="7"></td>
                    <td style="text-align:right; vertical-align:middle;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b;">${gtDisplay}</div>
                    </td>
                    <td style="text-align:right; vertical-align:middle;">
                        <div style="font-weight:700; font-size:14px; color:#d4380d;">${formatVND(grandTotalSalary)}đ</div>
                    </td>
                </tr>
            `;
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

    /**
     * Tính lương 1 ngày dựa trên dữ liệu chấm công
     * - Đúng giờ: vào <= 8:00, ra 16:00-20:00 → 200,000 VND
     * - Đi muộn: sau 8:00 → trừ 5,000/phút
     * - Về sớm: ra trước 16:00 → lương chia đôi (100,000)
     * - Làm thêm: ra 20:00-24:00 → đủ lương + OT nhân đôi
     */
    function calculateDaySalary(cellData) {
        const result = { baseSalary: 0, lateDeduction: 0, lateMinutes: 0, otPay: 0, otMinutes: 0, totalSalary: 0 };

        if (cellData.status === 'absent' || cellData.status === 'incomplete') {
            return result;
        }

        const checkIn = cellData.checkIn;
        const checkOut = cellData.checkOut;
        if (!checkIn || !checkOut) return result;

        // --- Late penalty ---
        const startOfDay = new Date(checkIn);
        startOfDay.setHours(SALARY.WORK_START_HOUR, 0, 0, 0);
        if (checkIn > startOfDay) {
            result.lateMinutes = Math.floor((checkIn - startOfDay) / (1000 * 60));
            result.lateDeduction = result.lateMinutes * SALARY.LATE_PENALTY_PER_MIN;
        }

        // --- Base salary based on checkout time ---
        const endWork = new Date(checkOut);
        const hour16 = new Date(checkOut);
        hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
        const hour20 = new Date(checkOut);
        hour20.setHours(SALARY.OT_START_HOUR, 0, 0, 0);

        if (checkOut < hour16) {
            // Về sớm trước 16h → lương chia đôi
            result.baseSalary = SALARY.DAILY_RATE / 2;
        } else if (checkOut < hour20) {
            // Ra từ 16h-20h → đủ lương
            result.baseSalary = SALARY.DAILY_RATE;
        } else {
            // Ra từ 20h-24h → đủ lương + OT nhân đôi
            result.baseSalary = SALARY.DAILY_RATE;
            result.otMinutes = Math.floor((checkOut - hour20) / (1000 * 60));
            const otHours = result.otMinutes / 60;
            result.otPay = Math.round(otHours * SALARY.HOURLY_RATE * SALARY.OT_MULTIPLIER);
        }

        result.totalSalary = Math.max(0, result.baseSalary - result.lateDeduction + result.otPay);
        return result;
    }

    /** Format số tiền VND */
    function formatVND(amount) {
        if (!amount) return '-';
        return amount.toLocaleString('vi-VN');
    }

    /** Render 1 ô ngày */
    function renderDayCell(cellData, daySalary, emp, dateKey) {
        const { status, checkIn, checkOut } = cellData;
        const empId = emp.userId || emp.uid || emp.id;

        if (status === 'absent') {
            const cellDate = new Date(dateKey);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (cellDate > today) return '';

            return `
                <div class="ts-block" style="border-left:3px solid #faad14; background:#fff7e6; cursor:pointer;"
                     onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                    <div style="color:#faad14; font-size:12px;">--:--</div>
                    <div style="color:#d48806; font-size:11px; margin-top:2px;">Nghỉ</div>
                </div>
            `;
        }

        // Xác định style theo trạng thái
        let borderColor, bgColor, statusText, statusColor;

        if (status === 'incomplete') {
            borderColor = '#ff4d4f';
            bgColor = '#fff2f0';
            statusText = 'Thiếu giờ ra';
            statusColor = '#cf1322';
        } else if (daySalary.otMinutes > 0) {
            // Làm thêm (ưu tiên hiển thị OT)
            borderColor = '#1890ff';
            bgColor = '#e6f7ff';
            const otH = Math.floor(daySalary.otMinutes / 60);
            const otM = daySalary.otMinutes % 60;
            const otDisplay = otH > 0 ? `${otH}h${otM > 0 ? otM + 'p' : ''}` : `${otM}p`;
            statusText = `OT ${otDisplay}`;
            if (daySalary.lateMinutes > 0) statusText = `Muộn ${daySalary.lateMinutes}p · ${statusText}`;
            statusColor = '#096dd9';
        } else if (checkOut) {
            const hour16 = new Date(checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (checkOut < hour16) {
                // Về sớm
                borderColor = '#722ed1';
                bgColor = '#f9f0ff';
                statusText = daySalary.lateMinutes > 0 ? `Muộn ${daySalary.lateMinutes}p · Về sớm` : 'Về sớm';
                statusColor = '#531dab';
            } else if (daySalary.lateMinutes > 0) {
                // Đi muộn nhưng ra đúng
                borderColor = '#fa8c16';
                bgColor = '#fff7e6';
                statusText = `Muộn ${daySalary.lateMinutes}p`;
                statusColor = '#d46b08';
            } else {
                // Đúng giờ
                borderColor = '#52c41a';
                bgColor = '#f6ffed';
                statusText = 'Đúng giờ';
                statusColor = '#389e0d';
            }
        } else {
            borderColor = '#52c41a';
            bgColor = '#f6ffed';
            statusText = 'Đúng giờ';
            statusColor = '#389e0d';
        }

        const inTime = formatTime(checkIn);
        const outTime = checkOut ? formatTime(checkOut) : '--:--';

        return `
            <div class="ts-block" style="border-left:3px solid ${borderColor}; background:${bgColor}; cursor:pointer;"
                 onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                <div style="font-weight:600; font-size:12px; color:#1e293b;">${inTime} - ${outTime}</div>
                <div style="font-size:11px; color:${statusColor}; margin-top:3px;">${statusText}</div>
            </div>
        `;
    }

    // ================================================================
    // RENDERING - SCHEDULE VIEW (Lịch làm việc)
    // ================================================================

    function renderSchedule() {
        renderScheduleHeader();
        renderScheduleBody();
        renderWeekLabel();
    }

    function renderScheduleHeader() {
        const thead = document.querySelector('#scheduleGrid thead tr');
        if (!thead) return;

        const dates = getWeekDates();
        thead.innerHTML = `
            <th class="ts-col-fixed">Nhân viên</th>
            ${dates.map(d => {
                const dayName = DAY_NAMES[d.getDay()];
                const dayNum = d.getDate();
                const todayClass = isToday(d) ? 'ts-day-active' : '';
                return `<th class="${todayClass}">${dayName} <span>${dayNum}</span></th>`;
            }).join('')}
            <th style="min-width:130px; text-align:right;">Lương tuần</th>
        `;
    }

    function renderScheduleBody() {
        const tbody = document.querySelector('#scheduleGrid tbody');
        if (!tbody) return;

        if (employees.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:14px;">
                        <div style="font-weight:500;">Chưa có dữ liệu nhân viên</div>
                    </td>
                </tr>
            `;
            return;
        }

        const dates = getWeekDates();
        let html = '';
        let grandTotalSalary = 0;

        // Tính lương + sắp xếp giảm dần
        const empData = employees.map(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            let weekSalary = 0;
            let workedDays = 0;
            const dayCells = [];

            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );
                const cellData = processDayRecords(dayRecords);
                const daySalary = calculateDaySalary(cellData);
                weekSalary += daySalary.totalSalary;
                if (daySalary.totalSalary > 0) workedDays++;
                dayCells.push({ cellData, daySalary, dateKey, date });
            }

            return { emp, empId, weekSalary, workedDays, dayCells };
        });

        empData.sort((a, b) => b.weekSalary - a.weekSalary);

        // Hàng tổng cộng trên đầu
        const totalSalary = empData.reduce((s, e) => s + e.weekSalary, 0);
        html += `
            <tr style="background:#fafafa;">
                <td class="ts-col-fixed" style="border:none; background:#fafafa;"></td>
                <td colspan="7" style="border:none;"></td>
                <td style="text-align:right; font-weight:700; font-size:15px; color:#d4380d; border:none;">
                    ${formatVND(totalSalary)}đ
                </td>
            </tr>
        `;

        for (const { emp, empId, weekSalary, workedDays, dayCells } of empData) {
            html += '<tr>';

            // Tên nhân viên
            html += `
                <td class="ts-col-fixed">
                    <div style="font-weight:600; color:#1e293b;">${escapeHtml(emp.name || 'N/A')}</div>
                    <div style="font-size:11px; color:#8c8c8c;">ID: ${empId}</div>
                </td>
            `;

            // 7 ngày - hiện block trạng thái
            for (const { cellData, daySalary, dateKey, date } of dayCells) {
                html += `<td>${renderScheduleCell(cellData, daySalary, emp, dateKey, date)}</td>`;
            }

            // Cột lương
            html += `
                <td style="text-align:right; vertical-align:middle;">
                    <div style="font-weight:700; font-size:14px; color:${weekSalary > 0 ? '#1e293b' : '#bfbfbf'};">
                        ${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}
                    </div>
                    ${workedDays > 0 ? `<div style="font-size:11px; color:#8c8c8c;">${workedDays} ngày</div>` : ''}
                </td>
            `;

            html += '</tr>';
        }

        tbody.innerHTML = html;
    }

    /** Render 1 ô ngày trong schedule view */
    function renderScheduleCell(cellData, daySalary, emp, dateKey, date) {
        const { status } = cellData;
        const empId = emp.userId || emp.uid || emp.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Tương lai → trống
        if (date > today && status === 'absent') return '';

        // Nghỉ
        if (status === 'absent') {
            return `
                <div class="ts-block" style="border-left:3px solid #d9d9d9; background:#fafafa; cursor:pointer; text-align:center;"
                     onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                    <div style="color:#bfbfbf; font-size:11px;">Nghỉ</div>
                </div>
            `;
        }

        // Xác định style
        let bgClass, label, labelColor;

        if (status === 'incomplete') {
            bgClass = 'background:#fff2f0; border-left:3px solid #ff4d4f;';
            label = 'Thiếu giờ ra';
            labelColor = '#cf1322';
        } else if (daySalary.otMinutes > 0) {
            bgClass = 'background:#e6f7ff; border-left:3px solid #1890ff;';
            label = 'LÀM THÊM';
            labelColor = '#096dd9';
        } else if (daySalary.lateMinutes > 0) {
            const hour16 = new Date(cellData.checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (cellData.checkOut < hour16) {
                bgClass = 'background:#f9f0ff; border-left:3px solid #722ed1;';
                label = 'MUỘN + VỀ SỚM';
                labelColor = '#531dab';
            } else {
                bgClass = 'background:#fff7e6; border-left:3px solid #fa8c16;';
                label = 'ĐI MUỘN';
                labelColor = '#d46b08';
            }
        } else if (cellData.checkOut) {
            const hour16 = new Date(cellData.checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (cellData.checkOut < hour16) {
                bgClass = 'background:#f9f0ff; border-left:3px solid #722ed1;';
                label = 'VỀ SỚM';
                labelColor = '#531dab';
            } else {
                bgClass = 'background:#f6ffed; border-left:3px solid #52c41a;';
                label = 'ĐÚNG GIỜ';
                labelColor = '#389e0d';
            }
        } else {
            bgClass = 'background:#f6ffed; border-left:3px solid #52c41a;';
            label = 'ĐÚNG GIỜ';
            labelColor = '#389e0d';
        }

        const salaryText = daySalary.totalSalary > 0 ? `${formatVND(daySalary.totalSalary)}đ` : '';

        return `
            <div class="ts-block" style="${bgClass} cursor:pointer;"
                 onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                <div style="font-weight:600; font-size:11px; color:${labelColor};">${label}</div>
                ${salaryText ? `<div style="font-size:10px; color:#8c8c8c; margin-top:2px;">${salaryText}</div>` : ''}
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
            renderScheduleBody();
            return;
        }

        const kw = keyword.toLowerCase();

        // Lọc cả 2 view
        ['#viewTimesheet .ts-grid tbody', '#scheduleGrid tbody'].forEach(sel => {
            const tbody = document.querySelector(sel);
            if (!tbody) return;
            tbody.querySelectorAll('tr').forEach(row => {
                const nameCell = row.querySelector('.ts-col-fixed div');
                if (nameCell) {
                    const name = nameCell.textContent.toLowerCase();
                    row.style.display = name.includes(kw) ? '' : 'none';
                }
            });
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

        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
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

        // Hiện danh sách tất cả lần quẹt + tính lương
        const noteArea = modal.querySelector('textarea');
        if (noteArea && dayRecords.length > 0) {
            const lines = dayRecords.map((r, i) =>
                `Lần ${i + 1}: ${formatTime(r.time)} (type: ${r.type === 1 ? 'Ra' : 'Vào'})`
            );

            // Tính lương cho ngày này
            const cellData = processDayRecords(
                weekRecords.filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
            );
            const salary = calculateDaySalary(cellData);

            lines.push('');
            lines.push('── Lương ngày ──');
            lines.push(`Lương cơ bản: ${formatVND(salary.baseSalary)}đ`);
            if (salary.lateMinutes > 0) {
                lines.push(`Đi muộn ${salary.lateMinutes} phút: -${formatVND(salary.lateDeduction)}đ`);
            }
            if (salary.otMinutes > 0) {
                const otH = Math.floor(salary.otMinutes / 60);
                const otM = salary.otMinutes % 60;
                const otDisplay = otH > 0 ? `${otH}h${otM > 0 ? otM + 'p' : ''}` : `${otM}p`;
                lines.push(`Làm thêm ${otDisplay} (x2): +${formatVND(salary.otPay)}đ`);
            }
            lines.push(`TỔNG: ${formatVND(salary.totalSalary)}đ`);

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
