/**
 * Attendance Module - Quản lý chấm công
 * Đọc dữ liệu từ Firestore (được sync bởi attendance-sync service)
 * Hiển thị bảng chấm công theo tuần trên web
 */
(function () {
    'use strict';

    // ================================================================
    // API CLIENT (replaces Firestore)
    // ================================================================
    const ATTENDANCE_API = 'https://n2store-fallback.onrender.com/api/attendance';

    async function apiGet(path) {
        const res = await fetch(ATTENDANCE_API + path);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }
    async function apiPost(path, body) {
        const res = await fetch(ATTENDANCE_API + path, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }
    async function apiPut(path, body) {
        const res = await fetch(ATTENDANCE_API + path, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }
    async function apiPatch(path, body) {
        const res = await fetch(ATTENDANCE_API + path, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }
    async function apiDelete(path) {
        const res = await fetch(ATTENDANCE_API + path, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    const SHORT_DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    // Salary calculation constants
    const SALARY = {
        DAILY_RATE: 200000,         // VND per day (ca 8:00-20:00, 12h)
        HOURLY_RATE: 200000 / 12,   // ~16,667 VND/hour
        LATE_PENALTY_PER_MIN: 5000, // VND per minute late after 8:00
        WORK_START_HOUR: 8,         // 8:00
        WORK_END_HOUR: 16,          // 16:00 - về trước giờ này = về sớm
        OT_START_HOUR: 20,          // 20:00 - hết ca, sau giờ này = OT
        OT_MULTIPLIER: 2,           // double rate for OT
    };

    // ================================================================
    // STATE
    // ================================================================
    let currentWeekStart = null; // Monday of current view
    let employees = [];          // From attendance_device_users
    let weekRecords = [];        // Attendance records for current week
    let syncStatus = null;       // Sync service status
    let syncStatusInterval = null; // Polling interval for sync status
    let showHidden = false;      // Toggle hiển thị nhân viên ẩn
    let viewPeriod = 'month';    // always 'month'
    let currentMonth = null;     // { year, month } for monthly view
    let monthRecords = [];       // Records for entire month
    let monthlyEmpData = [];     // Cached monthly calc data for detail view

    // Load hidden employees from localStorage
    const HIDDEN_KEY = 'attendance_hidden_employees';
    let hiddenEmployees = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));

    function saveHidden() {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenEmployees]));
    }

    function isHidden(empId) {
        return hiddenEmployees.has(String(empId));
    }

    // Full-day salary override — lưu trên server
    let fullDayOverrides = new Set();

    async function loadFullDayOverrides() {
        try {
            const data = await apiGet('/fullday');
            fullDayOverrides = new Set();
            (data.rows || []).forEach(row => fullDayOverrides.add(row.id));
            console.log(`[Attendance] Loaded ${fullDayOverrides.size} fullday overrides`);
        } catch (err) {
            console.error('[Attendance] Lỗi load fullday:', err);
        }
    }

    function isFullDay(empId, dateKey) {
        return fullDayOverrides.has(`${empId}_${dateKey}`);
    }

    async function toggleFullDay(empId, dateKey) {
        const key = `${empId}_${dateKey}`;
        try {
            if (fullDayOverrides.has(key)) {
                fullDayOverrides.delete(key);
                await apiDelete('/fullday/' + key);
            } else {
                fullDayOverrides.add(key);
                await apiPost('/fullday/' + key, {});
            }
        } catch (err) {
            console.error('[Attendance] Lỗi toggle fullday:', err);
            showNotification('Lỗi lưu Full day: ' + err.message, 'error');
        }
        renderTimesheet();
        renderSchedule();
    }

    // Allowances (Phụ cấp) — lưu trên server theo tháng
    // Key: empId_YYYY-MM, value: amount (VND)
    let monthlyAllowances = {}; // { 'empId_YYYY-MM': amount }

    async function loadAllowances() {
        if (!currentMonth) return;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        try {
            const data = await apiGet('/allowances?monthKey=' + monthKey);
            monthlyAllowances = {};
            (data.rows || []).forEach(row => {
                monthlyAllowances[`${row.emp_id}_${row.month_key}`] = row.amount || 0;
            });
            console.log(`[Attendance] Loaded ${Object.keys(monthlyAllowances).length} allowances for ${monthKey}`);
        } catch (err) {
            console.error('[Attendance] Lỗi load allowances:', err);
        }
    }

    function getAllowance(empId) {
        if (!currentMonth) return 0;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        return monthlyAllowances[`${empId}_${monthKey}`] || 0;
    }

    async function saveAllowance(empId, amount) {
        if (!currentMonth) return;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        const docId = `${empId}_${monthKey}`;
        try {
            if (amount === 0) {
                await apiDelete('/allowances/' + docId);
                delete monthlyAllowances[docId];
            } else {
                await apiPut('/allowances/' + docId, {
                    empId: String(empId),
                    monthKey: monthKey,
                    amount: amount
                });
                monthlyAllowances[docId] = amount;
            }
            renderMonthlySchedule();
        } catch (err) {
            console.error('[Attendance] Lỗi lưu phụ cấp:', err);
            showNotification('Lỗi lưu phụ cấp: ' + err.message, 'error');
        }
    }

    function showAllowanceModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        const empName = emp ? emp.name : `User ${empId}`;
        const current = getAllowance(empId);

        let modal = document.getElementById('allowanceModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'allowanceModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4);';
        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; padding:24px; width:360px; box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div>
                        <div style="font-size:15px; font-weight:600; color:#1e293b;">Phụ cấp</div>
                        <div style="font-size:12px; color:#8c8c8c;">${empName}</div>
                    </div>
                    <button onclick="document.getElementById('allowanceModal').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:#8c8c8c;">✕</button>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="font-size:13px; color:#64748b; display:block; margin-bottom:6px;">Số tiền phụ cấp (VND)</label>
                    <input type="number" id="allowanceInput" value="${current}" placeholder="0"
                        style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:15px; box-sizing:border-box; outline:none;">
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button onclick="document.getElementById('allowanceModal').remove()"
                        style="padding:8px 16px; border:1px solid #d1d5db; border-radius:8px; background:#fff; cursor:pointer; font-size:13px;">Hủy</button>
                    <button onclick="window._attendance.saveAllowance('${empId}', parseInt(document.getElementById('allowanceInput').value) || 0); document.getElementById('allowanceModal').remove();"
                        style="padding:8px 16px; border:none; border-radius:8px; background:#1890ff; color:#fff; cursor:pointer; font-size:13px; font-weight:600;">Lưu</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => {
            const input = document.getElementById('allowanceInput');
            if (input) { input.focus(); input.select(); }
        }, 100);
    }

    // ================================================================
    // PAYROLL DATA LAYER
    // ================================================================
    let payrollDataMap = {}; // { empId: { thuongItems, giamTruItems, daTra, allowances, ghiChu, salaryDaysOverride, otHoursOverride } }

    async function loadPayrollData() {
        if (!currentMonth) return;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        try {
            const data = await apiGet('/payroll?monthKey=' + monthKey);
            payrollDataMap = {};
            (data.rows || []).forEach(row => {
                // Map snake_case → camelCase for frontend compatibility
                payrollDataMap[String(row.emp_id)] = {
                    empId: row.emp_id,
                    monthKey: row.month_key,
                    thuongItems: row.thuong_items || [],
                    giamTruItems: row.giam_tru_items || [],
                    daTraItems: row.da_tra_items || [],
                    allowances: row.allowances || [],
                    ghiChu: row.ghi_chu || '',
                    salaryDaysOverride: row.salary_days_override || null,
                    otHoursOverride: row.ot_hours_override || null,
                    giamTruLateOverride: row.giam_tru_late_override,
                    giamTruNote: row.giam_tru_note || '',
                };
            });
            console.log(`[Attendance] Loaded ${Object.keys(payrollDataMap).length} payroll docs for ${monthKey}`);
        } catch (err) {
            console.error('[Attendance] Lỗi load payroll data:', err);
            payrollDataMap = {};
        }
    }

    function getPayrollDoc(empId) {
        return payrollDataMap[String(empId)] || {};
    }

    /** Lấy danh sách tên gợi ý từ tất cả NV cho 1 loại items */
    function getPayrollNameSuggestions(itemsField) {
        const names = new Set();
        Object.values(payrollDataMap).forEach(doc => {
            const items = doc[itemsField];
            if (Array.isArray(items)) {
                items.forEach(item => {
                    if (item.name && item.name.trim()) names.add(item.name.trim());
                });
            }
        });
        return Array.from(names).sort();
    }

    /** Tạo hoặc cập nhật datalist với id và danh sách tên */
    function updateDatalist(listId, names) {
        let dl = document.getElementById(listId);
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = listId;
            document.body.appendChild(dl);
        }
        dl.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
    }

    async function savePayrollField(empId, field, value) {
        if (!currentMonth) return;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        const docId = `${empId}_${monthKey}`;
        try {
            await apiPut('/payroll/' + docId, {
                empId: String(empId),
                monthKey: monthKey,
                [field]: value,
            });
            // Update local cache
            if (!payrollDataMap[String(empId)]) {
                payrollDataMap[String(empId)] = { empId: String(empId), monthKey };
            }
            payrollDataMap[String(empId)][field] = value;
        } catch (err) {
            console.error(`[Attendance] Lỗi lưu payroll ${field}:`, err);
            showNotification('Lỗi lưu: ' + err.message, 'error');
        }
    }

    async function savePayrollAllowances(empId, items) {
        if (!currentMonth) return;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        const docId = `${empId}_${monthKey}`;
        try {
            await apiPut('/payroll/' + docId, {
                empId: String(empId),
                monthKey: monthKey,
                allowances: items,
            });
            if (!payrollDataMap[String(empId)]) {
                payrollDataMap[String(empId)] = { empId: String(empId), monthKey };
            }
            payrollDataMap[String(empId)].allowances = items;
        } catch (err) {
            console.error('[Attendance] Lỗi lưu phụ cấp:', err);
            showNotification('Lỗi lưu phụ cấp: ' + err.message, 'error');
        }
    }

    async function savePayrollOverrides(empId, type, data) {
        if (!currentMonth) return;
        const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
        const docId = `${empId}_${monthKey}`;
        const field = type === 'salary' ? 'salaryDaysOverride' : 'otHoursOverride';
        try {
            await apiPut('/payroll/' + docId, {
                empId: String(empId),
                monthKey: monthKey,
                [field]: data,
            });
            if (!payrollDataMap[String(empId)]) {
                payrollDataMap[String(empId)] = { empId: String(empId), monthKey };
            }
            payrollDataMap[String(empId)][field] = data;
        } catch (err) {
            console.error(`[Attendance] Lỗi lưu ${field}:`, err);
            showNotification('Lỗi lưu: ' + err.message, 'error');
        }
    }

    // ================================================================
    // PAYROLL CALCULATION
    // ================================================================

    /** Tính chi tiết lương chính theo loại ngày */
    function calculateLuongChinhDetail(empId, empRate, empSched) {
        const records = monthRecords;
        const y = currentMonth.year;
        const m = currentMonth.month;
        const lastDay = new Date(y, m, 0).getDate();
        const payDoc = getPayrollDoc(empId);
        const overrides = payDoc.salaryDaysOverride || {};

        let weekdayDays = 0, weekendDays = 0, holidayDays = 0;
        let weekdayBase = 0, weekendBase = 0, holidayBase = 0;

        for (let d = 1; d <= lastDay; d++) {
            const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayRecs = records.filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey);
            const cellData = processDayRecords(dayRecs);
            const sal = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey), empSched);

            if (sal.baseSalary > 0) {
                const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=CN, 6=T7
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    weekendDays++;
                    weekendBase += sal.baseSalary;
                } else {
                    weekdayDays++;
                    weekdayBase += sal.baseSalary;
                }
            }
        }

        // Calculate actual salary with overrides
        const rows = [
            {
                label: 'Ngày thường',
                subLabel: '',
                dailyRate: empRate,
                actualDays: weekdayDays,
                salaryDays: overrides.weekday != null ? overrides.weekday : weekdayDays,
                amount: 0, // calculated below
            },
            {
                label: 'Ngày nghỉ',
                subLabel: '100%',
                dailyRate: empRate,
                actualDays: weekendDays,
                salaryDays: overrides.weekend != null ? overrides.weekend : weekendDays,
                amount: 0,
            },
            {
                label: 'Ngày lễ tết',
                subLabel: '100%',
                dailyRate: empRate,
                actualDays: holidayDays,
                salaryDays: overrides.holiday != null ? overrides.holiday : holidayDays,
                amount: 0,
            }
        ];

        rows.forEach(r => { r.amount = r.dailyRate * r.salaryDays; });

        return rows;
    }

    /** Tính chi tiết làm thêm theo loại ngày */
    function calculateLamThemDetail(empId, empRate, empSched) {
        const records = monthRecords;
        const y = currentMonth.year;
        const m = currentMonth.month;
        const lastDay = new Date(y, m, 0).getDate();
        const ws = (empSched && empSched.workStart != null) ? empSched.workStart : SALARY.WORK_START_HOUR;
        const we = (empSched && empSched.workEnd != null) ? empSched.workEnd : SALARY.OT_START_HOUR;
        const workHours = we - ws;
        const hourlyRate = empRate / workHours;
        const otHourlyRate = Math.round(hourlyRate * SALARY.OT_MULTIPLIER);
        const payDoc = getPayrollDoc(empId);
        const overrides = payDoc.otHoursOverride || {};

        let weekdayHours = 0, saturdayHours = 0, sundayHours = 0, holidayHours = 0;

        for (let d = 1; d <= lastDay; d++) {
            const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayRecs = records.filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey);
            const cellData = processDayRecords(dayRecs);
            const sal = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey), empSched);

            if (sal.otMinutes > 0) {
                const hours = Math.round(sal.otMinutes / 60 * 100) / 100;
                const dayOfWeek = new Date(y, m - 1, d).getDay();
                if (dayOfWeek === 0) sundayHours += hours;
                else if (dayOfWeek === 6) saturdayHours += hours;
                else weekdayHours += hours;
            }
        }

        const totalActualHours = weekdayHours + saturdayHours + sundayHours + holidayHours;
        const totalSalaryHours =
            (overrides.weekday != null ? overrides.weekday : weekdayHours) +
            (overrides.saturday != null ? overrides.saturday : saturdayHours) +
            (overrides.sunday != null ? overrides.sunday : sundayHours) +
            (overrides.holiday != null ? overrides.holiday : holidayHours);

        const rows = [
            {
                label: 'Ngày thường',
                otRate: otHourlyRate,
                actualHours: weekdayHours,
                salaryHours: overrides.weekday != null ? overrides.weekday : weekdayHours,
                amount: 0,
            },
            {
                label: 'Thứ 7',
                otRate: otHourlyRate,
                actualHours: saturdayHours,
                salaryHours: overrides.saturday != null ? overrides.saturday : saturdayHours,
                amount: 0,
            },
            {
                label: 'Chủ nhật',
                otRate: otHourlyRate,
                actualHours: sundayHours,
                salaryHours: overrides.sunday != null ? overrides.sunday : sundayHours,
                amount: 0,
            },
            {
                label: 'Ngày nghỉ',
                otRate: otHourlyRate,
                actualHours: 0,
                salaryHours: 0,
                amount: 0,
            },
            {
                label: 'Ngày lễ tết',
                otRate: otHourlyRate,
                actualHours: holidayHours,
                salaryHours: overrides.holiday != null ? overrides.holiday : holidayHours,
                amount: 0,
            }
        ];

        rows.forEach(r => { r.amount = Math.round(r.otRate * r.salaryHours); });

        return {
            defaultRate: Math.round(hourlyRate),
            totalActualHours: Math.round(totalActualHours * 100) / 100,
            totalSalaryHours: Math.round(totalSalaryHours * 100) / 100,
            totalAmount: rows.reduce((s, r) => s + r.amount, 0),
            rows
        };
    }

    /** Tính toàn bộ payroll row cho 1 nhân viên */
    function calculatePayrollRow(emp, empId) {
        const records = monthRecords;
        const y = currentMonth.year;
        const m = currentMonth.month;
        const lastDay = new Date(y, m, 0).getDate();
        const empRate = emp.dailyRate || SALARY.DAILY_RATE;
        const payDoc = getPayrollDoc(empId);
        const empSched = { workStart: emp.workStart, workEnd: emp.workEnd };

        let totalLate = 0, workedDays = 0;
        const lateDays = [];
        const otDays = [];

        for (let d = 1; d <= lastDay; d++) {
            const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayRecs = records.filter(r => String(r.deviceUserId) === empId && r.dateKey === dateKey);
            const cellData = processDayRecords(dayRecs);
            const sal = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey), empSched);
            totalLate += sal.lateDeduction;
            if (sal.totalSalary > 0) workedDays++;
            if (sal.lateDeduction > 0) lateDays.push({ dateKey, minutes: sal.lateMinutes, amount: sal.lateDeduction });
            if (sal.otPay > 0) otDays.push({ dateKey, minutes: sal.otMinutes, amount: sal.otPay });
        }

        // Lương chính: dùng override nếu có, ko thì dùng giá trị thực
        const lcDetail = calculateLuongChinhDetail(empId, empRate, empSched);
        const luongChinh = lcDetail.reduce((s, r) => s + r.amount, 0);

        // Làm thêm: dùng override nếu có
        const ltDetail = calculateLamThemDetail(empId, empRate, empSched);
        const lamThem = ltDetail.totalAmount;

        // Các field từ payroll doc
        const daTraItems = payDoc.daTraItems || [];
        const daTra = daTraItems.length > 0
            ? daTraItems.reduce((s, item) => s + (item.amount || 0), 0)
            : (payDoc.daTra || 0);
        const ghiChu = payDoc.ghiChu || '';

        // Phụ cấp
        const allowanceItems = payDoc.allowances || [];
        const phuCap = allowanceItems.reduce((s, item) => s + (item.amount || 0), 0);

        // Thưởng: items array hoặc legacy single number
        const thuongItems = payDoc.thuongItems || [];
        const thuong = thuongItems.length > 0
            ? thuongItems.reduce((s, item) => s + (item.amount || 0), 0)
            : (payDoc.thuong || 0);

        // Giảm trừ: trừ muộn (auto hoặc override) + items array hoặc legacy giamTruManual
        const giamTruItems = payDoc.giamTruItems || [];
        const giamTruManualTotal = giamTruItems.length > 0
            ? giamTruItems.reduce((s, item) => s + (item.amount || 0), 0)
            : (payDoc.giamTruManual || 0);
        const effectiveLate = payDoc.giamTruLateOverride != null ? payDoc.giamTruLateOverride : totalLate;
        const giamTru = effectiveLate + giamTruManualTotal;

        // Tổng lương
        const tongLuong = luongChinh + lamThem + phuCap + thuong - giamTru;
        const conCanTra = tongLuong - daTra;

        return {
            emp, empId, workedDays, empRate,
            luongChinh, lamThem, phuCap, thuong, giamTru, tongLuong, daTra, conCanTra,
            totalLate, giamTruManualTotal, ghiChu,
            thuongItems, giamTruItems, daTraItems,
            lateDays, otDays, allowanceItems,
            lcDetail, ltDetail
        };
    }

    function hideEmployee(empId) {
        hiddenEmployees.add(String(empId));
        saveHidden();
        renderTimesheet();
        renderSchedule();
    }

    function unhideEmployee(empId) {
        hiddenEmployees.delete(String(empId));
        saveHidden();
        renderTimesheet();
        renderSchedule();
    }

    function toggleHidden() {
        showHidden = !showHidden;
        renderTimesheet();
        renderSchedule();
    }

    // ================================================================
    // INIT
    // ================================================================
    function init() {
        currentWeekStart = getMonday(new Date());
        const now = new Date();
        currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

        bindEvents();
        injectTestButton();
        Promise.all([loadEmployees(), loadFullDayOverrides()]).then(() => {
            loadMonthData();
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
            const data = await apiGet('/device-users');
            employees = (data.rows || []).map(row => ({
                id: row.user_id,
                userId: row.user_id,
                uid: row.uid,
                name: row.display_name || row.name,
                displayName: row.display_name || null,
                _deviceName: row.name,
                role: row.role,
                dailyRate: row.daily_rate,
                workStart: row.work_start,
                workEnd: row.work_end,
            }));
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
            const data = await apiGet('/records?start=' + startKey + '&end=' + endKey);
            weekRecords = (data.rows || []).map(row => ({
                id: row.id,
                deviceUserId: row.device_user_id,
                dateKey: row.date_key,
                checkTime: new Date(row.check_time),
                type: row.type,
                source: row.source,
            }));

            console.log(`[Attendance] Loaded ${weekRecords.length} records (${startKey} → ${endKey})`);
        } catch (err) {
            console.error('[Attendance] Lỗi load attendance:', err);
            weekRecords = [];
        }

        // Gộp test data nếu có
        if (testEmployees.length > 0 || testRecords.length > 0) {
            mergeTestData();
        } else {
            renderTimesheet();
            renderSchedule();
        }
    }

    /** Load dữ liệu chấm công cho cả tháng */
    async function loadMonthData() {
        const y = currentMonth.year;
        const m = currentMonth.month;
        const startKey = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endKey = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        try {
            const data = await apiGet('/records?start=' + startKey + '&end=' + endKey);
            monthRecords = (data.rows || []).map(row => ({
                id: row.id,
                deviceUserId: row.device_user_id,
                dateKey: row.date_key,
                checkTime: new Date(row.check_time),
                type: row.type,
                source: row.source,
            }));
            console.log(`[Attendance] Month: ${monthRecords.length} records (${startKey} → ${endKey})`);
        } catch (err) {
            console.error('[Attendance] Lỗi load month data:', err);
            monthRecords = [];
        }

        await Promise.all([loadAllowances(), loadPayrollData()]);
        renderMonthlySchedule();
    }

    /** Poll trạng thái sync mỗi 10s */
    function listenSyncStatus() {
        if (syncStatusInterval) clearInterval(syncStatusInterval);

        async function poll() {
            try {
                const data = await apiGet('/sync-status');
                syncStatus = data.row ? {
                    connected: data.row.connected,
                    lastSyncTime: data.row.last_sync_time,
                    lastError: data.row.last_error,
                } : null;
                renderSyncStatus();
            } catch (e) {
                // Silent
            }
        }
        poll();
        syncStatusInterval = setInterval(poll, 10000);
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

            const empRate = emp.dailyRate || SALARY.DAILY_RATE;
            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );
                const cellData = processDayRecords(dayRecords);
                totalMinutes += cellData.workedMinutes;
                const empSched = { workStart: emp.workStart, workEnd: emp.workEnd };
                const daySalary = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey), empSched);
                weekSalary += daySalary.totalSalary;
                if (daySalary.totalSalary > 0) workedDays++;
                dayCells.push({ cellData, daySalary, dateKey });
            }

            return { emp, empId, totalMinutes, weekSalary, workedDays, dayCells };
        });

        // Sắp xếp theo lương giảm dần
        empData.sort((a, b) => b.weekSalary - a.weekSalary);

        // Tách visible / hidden
        const visibleData = empData.filter(d => !isHidden(d.empId));
        const hiddenData = empData.filter(d => isHidden(d.empId));
        const hiddenCount = hiddenData.length;

        for (const { emp, empId, totalMinutes, weekSalary, workedDays, dayCells } of visibleData) {
            grandTotalSalary += weekSalary;
            grandTotalMinutes += totalMinutes;

            html += '<tr>';

            html += renderEmpNameCell(emp, empId, false);

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
        if (visibleData.length > 0) {
            const gtHours = Math.floor(grandTotalMinutes / 60);
            const gtMins = grandTotalMinutes % 60;
            const gtDisplay = grandTotalMinutes > 0 ? `${gtHours}h${gtMins > 0 ? gtMins + 'm' : ''}` : '-';

            html += `
                <tr style="background:#fafafa; border-top:2px solid #e2e8f0;">
                    <td class="ts-col-fixed" style="background:#fafafa;">
                        <div style="font-weight:700; color:#1e293b;">Tổng cộng</div>
                        <div style="font-size:11px; color:#8c8c8c;">${visibleData.length} nhân viên</div>
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

        // Hàng nhân viên đã ẩn
        if (hiddenCount > 0) {
            html += `
                <tr>
                    <td colspan="10" style="text-align:center; padding:8px; border:none;">
                        <span onclick="window._attendance.toggleHidden()" style="cursor:pointer; color:#1890ff; font-size:12px;">
                            ${showHidden ? 'Ẩn' : 'Hiện'} ${hiddenCount} nhân viên đã ẩn
                        </span>
                    </td>
                </tr>
            `;

            if (showHidden) {
                for (const { emp, empId, totalMinutes, weekSalary, workedDays, dayCells } of hiddenData) {
                    html += `<tr style="opacity:0.5;">`;
                    html += renderEmpNameCell(emp, empId, true);
                    for (const { cellData, daySalary, dateKey } of dayCells) {
                        html += `<td>${renderDayCell(cellData, daySalary, emp, dateKey)}</td>`;
                    }
                    const hours = Math.floor(totalMinutes / 60);
                    const mins = totalMinutes % 60;
                    const totalDisplay = totalMinutes > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : '-';
                    html += `<td style="text-align:right;"><div style="font-weight:500; color:#8c8c8c;">${totalDisplay}</div></td>`;
                    html += `<td style="text-align:right;"><div style="font-weight:500; color:#8c8c8c;">${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}</div></td>`;
                    html += '</tr>';
                }
            }
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
     * - Đúng giờ: vào <= 8:00, ra 19:50-20:00 → 200,000 VND (full)
     * - Đi muộn: sau 8:00 → trừ 5,000/phút
     * - Làm thêm: ra sau 20:00 → đủ lương + OT nhân đôi
     */
    function calculateDaySalary(cellData, dailyRate, forceFullDay, empSchedule) {
        const rate = dailyRate || SALARY.DAILY_RATE;
        const startHour = (empSchedule && empSchedule.workStart != null) ? empSchedule.workStart : SALARY.WORK_START_HOUR;
        const endHour = (empSchedule && empSchedule.workEnd != null) ? empSchedule.workEnd : SALARY.OT_START_HOUR;
        const workHours = endHour - startHour;
        const hourlyRate = rate / workHours;
        const result = { baseSalary: 0, lateDeduction: 0, lateMinutes: 0, otPay: 0, otMinutes: 0, totalSalary: 0, dailyRate: rate };

        if (cellData.status === 'absent' || cellData.status === 'incomplete') {
            return result;
        }

        const checkIn = cellData.checkIn;
        const checkOut = cellData.checkOut;
        if (!checkIn || !checkOut) return result;

        // --- Late penalty ---
        const startOfDay = new Date(checkIn);
        startOfDay.setHours(startHour, 0, 0, 0);
        if (checkIn > startOfDay) {
            result.lateMinutes = Math.floor((checkIn - startOfDay) / (1000 * 60));
            result.lateDeduction = result.lateMinutes * SALARY.LATE_PENALTY_PER_MIN;
        }

        // --- Base salary = hourlyRate × giờ làm ---
        const hour8 = new Date(checkIn);
        hour8.setHours(startHour, 0, 0, 0);
        const hour20 = new Date(checkOut);
        hour20.setHours(endHour, 0, 0, 0);

        const workStart = checkIn > hour8 ? checkIn : hour8; // max(checkin, 8:00)
        let workEnd = checkOut < hour20 ? checkOut : hour20; // min(checkout, 20:00)

        // Về gần cuối ca (từ 19:50) → tính như hết ca 20:00
        const nearEnd = new Date(hour20.getTime() - 10 * 60 * 1000);
        if (workEnd >= nearEnd && workEnd < hour20) {
            workEnd = hour20;
        }

        const baseMinutes = Math.max(0, Math.floor((workEnd - workStart) / (1000 * 60)));
        result.baseMinutes = baseMinutes;

        if (forceFullDay) {
            result.baseSalary = rate;
            result.fullDayOverride = true;
        } else {
            result.baseSalary = Math.round(hourlyRate * baseMinutes / 60);
        }

        // --- OT after 20:00 at double rate ---
        if (checkOut > hour20) {
            result.otMinutes = Math.floor((checkOut - hour20) / (1000 * 60));
            result.otPay = Math.round(result.otMinutes / 60 * hourlyRate * SALARY.OT_MULTIPLIER);
        }

        result.totalSalary = Math.max(0, result.baseSalary - result.lateDeduction + result.otPay);
        return result;
    }

    /** Render ô tên nhân viên (dùng chung cho cả 3 view) */
    function renderEmpNameCell(emp, empId, isHiddenRow) {
        const rate = emp.dailyRate || SALARY.DAILY_RATE;
        const rateLabel = formatVND(rate) + 'đ/ngày';
        const nameColor = isHiddenRow ? '#8c8c8c' : '#1e293b';
        const subColor = isHiddenRow ? '#bfbfbf' : '#8c8c8c';

        if (isHiddenRow) {
            return `
                <td class="ts-col-fixed">
                    <div style="display:flex; align-items:center; gap:4px;">
                        <div style="font-weight:600; color:${nameColor}; flex:1;">${escapeHtml(emp.name || 'N/A')}</div>
                        <span onclick="window._attendance.unhideEmployee('${empId}')" title="Bỏ ẩn" style="cursor:pointer; color:#52c41a; font-size:12px;">Hiện</span>
                    </div>
                    <div style="font-size:11px; color:${subColor};">
                        <span onclick="window._attendance.showSalaryModal('${empId}')" style="cursor:pointer;" title="Chỉnh lương">${rateLabel}</span>
                    </div>
                </td>
            `;
        }

        return `
            <td class="ts-col-fixed">
                <div style="display:flex; align-items:center; gap:4px;">
                    <div style="font-weight:600; color:${nameColor}; flex:1;">${escapeHtml(emp.name || 'N/A')}</div>
                    <span onclick="window._attendance.hideEmployee('${empId}')" title="Ẩn nhân viên" style="cursor:pointer; color:#d9d9d9; font-size:14px; line-height:1;">✕</span>
                </div>
                <div style="font-size:11px; color:${subColor};">
                    <span onclick="window._attendance.showSalaryModal('${empId}')" style="cursor:pointer; color:${rate !== SALARY.DAILY_RATE ? '#1890ff' : subColor};" title="Chỉnh lương">${rateLabel}</span>
                </div>
            </td>
        `;
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
            statusText = `OT ${otDisplay} +${formatVND(daySalary.otPay)}đ`;
            if (daySalary.lateMinutes > 0) statusText = `Muộn ${daySalary.lateMinutes}p · ${statusText}`;
            statusColor = '#096dd9';
        } else if (checkOut) {
            const hour16 = new Date(checkOut);
            hour16.setHours(SALARY.WORK_END_HOUR, 0, 0, 0);
            if (checkOut < hour16) {
                // Về sớm
                borderColor = '#722ed1';
                bgColor = '#f9f0ff';
                statusText = `Về sớm ${formatVND(daySalary.baseSalary)}đ`;
                if (daySalary.lateMinutes > 0) statusText = `Muộn ${daySalary.lateMinutes}p · ${statusText}`;
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
        const checked = isFullDay(empId, dateKey);
        const showCb = status !== 'incomplete' && checkOut;

        return `
            <div class="ts-block" style="border-left:3px solid ${borderColor}; background:${bgColor}; cursor:pointer;"
                 onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                <div style="font-weight:600; font-size:12px; color:#1e293b;">${inTime} - ${outTime}</div>
                <div style="font-size:11px; color:${statusColor}; margin-top:3px;">${statusText}</div>
                ${showCb ? `<label onclick="event.stopPropagation();" style="display:flex; align-items:center; gap:3px; margin-top:3px; cursor:pointer; font-size:10px; color:#8c8c8c;">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._attendance.toggleFullDay('${empId}','${dateKey}')" style="margin:0; cursor:pointer;">
                    <span>Full</span>
                </label>` : ''}
            </div>
        `;
    }

    // ================================================================
    // RENDERING - SCHEDULE VIEW (Lịch làm việc)
    // ================================================================

    function renderSchedule() {
        if (viewPeriod === 'month') {
            renderMonthlySchedule();
        } else {
            renderScheduleHeader();
            renderScheduleBody();
            renderWeekLabel();
        }
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

            const empRate = emp.dailyRate || SALARY.DAILY_RATE;
            for (const date of dates) {
                const dateKey = toDateKey(date);
                const dayRecords = weekRecords.filter(r =>
                    String(r.deviceUserId) === empId && r.dateKey === dateKey
                );
                const cellData = processDayRecords(dayRecords);
                const empSched = { workStart: emp.workStart, workEnd: emp.workEnd };
                const daySalary = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey), empSched);
                weekSalary += daySalary.totalSalary;
                if (daySalary.totalSalary > 0) workedDays++;
                dayCells.push({ cellData, daySalary, dateKey, date });
            }

            return { emp, empId, weekSalary, workedDays, dayCells };
        });

        empData.sort((a, b) => b.weekSalary - a.weekSalary);

        // Tách visible / hidden
        const visibleData = empData.filter(d => !isHidden(d.empId));
        const hiddenData = empData.filter(d => isHidden(d.empId));
        const hiddenCount = hiddenData.length;

        // Hàng tổng cộng trên đầu
        const totalSalary = visibleData.reduce((s, e) => s + e.weekSalary, 0);
        html += `
            <tr style="background:#fafafa;">
                <td class="ts-col-fixed" style="border:none; background:#fafafa;"></td>
                <td colspan="7" style="border:none;"></td>
                <td style="text-align:right; font-weight:700; font-size:15px; color:#d4380d; border:none;">
                    ${formatVND(totalSalary)}đ
                </td>
            </tr>
        `;

        for (const { emp, empId, weekSalary, workedDays, dayCells } of visibleData) {
            html += '<tr>';

            html += renderEmpNameCell(emp, empId, false);

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

        // Hàng nhân viên đã ẩn
        if (hiddenCount > 0) {
            html += `
                <tr>
                    <td colspan="9" style="text-align:center; padding:8px; border:none;">
                        <span onclick="window._attendance.toggleHidden()" style="cursor:pointer; color:#1890ff; font-size:12px;">
                            ${showHidden ? 'Ẩn' : 'Hiện'} ${hiddenCount} nhân viên đã ẩn
                        </span>
                    </td>
                </tr>
            `;

            if (showHidden) {
                for (const { emp, empId, weekSalary, workedDays, dayCells } of hiddenData) {
                    html += `<tr style="opacity:0.5;">`;
                    html += renderEmpNameCell(emp, empId, true);
                    for (const { cellData, daySalary, dateKey, date } of dayCells) {
                        html += `<td>${renderScheduleCell(cellData, daySalary, emp, dateKey, date)}</td>`;
                    }
                    html += `
                        <td style="text-align:right;">
                            <div style="font-weight:500; color:#8c8c8c;">${weekSalary > 0 ? formatVND(weekSalary) + 'đ' : '-'}</div>
                        </td>
                    `;
                    html += '</tr>';
                }
            }
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
        const checked = isFullDay(empId, dateKey);
        const showCheckbox = status !== 'absent' && status !== 'incomplete' && cellData.checkOut;

        return `
            <div class="ts-block" style="${bgClass} cursor:pointer; position:relative;"
                 onclick="window._attendance.showDetail('${empId}','${dateKey}')">
                <div style="font-weight:600; font-size:11px; color:${labelColor};">${label}</div>
                ${salaryText ? `<div style="font-size:10px; color:#8c8c8c; margin-top:2px;">${salaryText}</div>` : ''}
                ${showCheckbox ? `<label onclick="event.stopPropagation();" style="display:flex; align-items:center; gap:3px; margin-top:3px; cursor:pointer; font-size:10px; color:#8c8c8c;">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._attendance.toggleFullDay('${empId}','${dateKey}')" style="margin:0; cursor:pointer;">
                    <span>Full</span>
                </label>` : ''}
            </div>
        `;
    }

    // ================================================================
    // RENDERING - MONTHLY VIEW (Theo tháng)
    // ================================================================

    function renderMonthlySchedule() {
        const thead = document.querySelector('#scheduleGrid thead tr');
        const tbody = document.querySelector('#scheduleGrid tbody');
        if (!thead || !tbody) return;

        // Update pager label
        const scLabel = document.querySelector('#viewSchedule .ts-pager span');
        if (scLabel) {
            const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
            scLabel.textContent = `${monthNames[currentMonth.month]} ${currentMonth.year}`;
        }

        // Header - KiotViet style
        thead.innerHTML = `
            <th style="width:40px;"></th>
            <th style="width:40px;">STT</th>
            <th>Tên nhân viên</th>
            <th>Lương chính</th>
            <th>Làm thêm</th>
            <th>Phụ cấp</th>
            <th>Thưởng</th>
            <th>Giảm trừ</th>
            <th>Tổng lương</th>
            <th>Đã trả NV</th>
            <th>Còn cần trả</th>
            <th>Ghi chú</th>
        `;

        if (employees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:60px 20px; color:#94a3b8;">Chưa có dữ liệu</td></tr>`;
            return;
        }

        // Tính payroll cho từng nhân viên
        const empData = employees.map(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            return calculatePayrollRow(emp, empId);
        });

        empData.sort((a, b) => b.tongLuong - a.tongLuong);
        monthlyEmpData = empData;

        const visibleData = empData.filter(d => !isHidden(d.empId));
        const hiddenData = empData.filter(d => isHidden(d.empId));

        let html = '';

        // Grand total row
        const gt = visibleData.reduce((acc, e) => {
            acc.luongChinh += e.luongChinh;
            acc.lamThem += e.lamThem;
            acc.phuCap += e.phuCap;
            acc.thuong += e.thuong;
            acc.giamTru += e.giamTru;
            acc.tongLuong += e.tongLuong;
            acc.daTra += e.daTra;
            acc.conCanTra += e.conCanTra;
            return acc;
        }, { luongChinh: 0, lamThem: 0, phuCap: 0, thuong: 0, giamTru: 0, tongLuong: 0, daTra: 0, conCanTra: 0 });

        html += `
            <tr class="payroll-total-row">
                <td></td>
                <td></td>
                <td></td>
                <td>${formatVND(gt.luongChinh)}</td>
                <td>${formatVND(gt.lamThem)}</td>
                <td>${formatVND(gt.phuCap)}</td>
                <td>${gt.thuong ? formatVND(gt.thuong) : '0'}</td>
                <td>${gt.giamTru ? formatVND(gt.giamTru) : '0'}</td>
                <td>${formatVND(gt.tongLuong)}</td>
                <td>${gt.daTra ? formatVND(gt.daTra) : '0'}</td>
                <td>${formatVND(gt.conCanTra)}</td>
                <td></td>
            </tr>
        `;

        visibleData.forEach((d, idx) => {
            const { emp, empId, workedDays, luongChinh, lamThem, phuCap, thuong, giamTru, tongLuong, daTra, conCanTra, ghiChu } = d;
            html += `
                <tr data-emp-id="${empId}">
                    <td>
                        <button class="payroll-delete-btn" onclick="window._attendance.hideEmployee('${empId}')" title="Ẩn nhân viên">
                            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                        </button>
                    </td>
                    <td>${idx + 1}</td>
                    <td>
                        <span class="payroll-emp-name" onclick="window._attendance.showLuongChinhModal('${empId}')">${escapeHtml(emp.name || 'N/A')}</span>
                        <button class="payroll-emp-detail-btn" onclick="window._attendance.showAttendanceDetailModal('${empId}')" title="Chi tiết chấm công">
                            <i data-lucide="calendar-days" style="width:14px;height:14px;"></i>
                        </button>
                        <button class="payroll-emp-detail-btn" onclick="window._attendance.printPayslip('${empId}')" title="In phiếu lương">
                            <i data-lucide="printer" style="width:14px;height:14px;"></i>
                        </button>
                        <div class="payroll-emp-days">${workedDays}</div>
                    </td>
                    <td>
                        <span class="payroll-cell-btn" onclick="window._attendance.showLuongChinhModal('${empId}')">
                            ${formatVND(luongChinh)}
                        </span>
                    </td>
                    <td>
                        <span class="payroll-cell-btn" onclick="window._attendance.showLamThemModal('${empId}')">
                            ${formatVND(lamThem)}
                        </span>
                    </td>
                    <td>
                        <span class="payroll-cell-btn" onclick="window._attendance.showPhuCapModal('${empId}')">
                            ${formatVND(phuCap)}
                        </span>
                    </td>
                    <td>
                        <span class="payroll-cell-btn" onclick="window._attendance.showThuongModal('${empId}')">
                            ${formatVND(thuong)}
                        </span>
                    </td>
                    <td>
                        <span class="payroll-cell-btn" onclick="window._attendance.showGiamTruModal('${empId}')">
                            ${formatVND(giamTru)}
                        </span>
                    </td>
                    <td class="payroll-cell-total">${formatVND(tongLuong)}</td>
                    <td>
                        <span class="payroll-cell-btn" onclick="window._attendance.showDaTraModal('${empId}')">
                            ${formatVND(daTra)}
                        </span>
                    </td>
                    <td class="payroll-cell-total">${formatVND(conCanTra)}</td>
                    <td>
                        <input type="text" class="payroll-note-input" data-emp="${empId}"
                            value="${escapeHtml(ghiChu || '')}" placeholder="...">
                    </td>
                </tr>
            `;
        });

        // Hidden employees
        if (hiddenData.length > 0) {
            html += `
                <tr><td colspan="12" style="text-align:center; padding:8px; border:none;">
                    <span onclick="window._attendance.toggleHidden()" style="cursor:pointer; color:#1890ff; font-size:12px;">
                        ${showHidden ? 'Ẩn' : 'Hiện'} ${hiddenData.length} nhân viên đã ẩn
                    </span>
                </td></tr>
            `;
            if (showHidden) {
                hiddenData.forEach((d, idx) => {
                    html += `
                        <tr style="opacity:0.5;" data-emp-id="${d.empId}">
                            <td></td>
                            <td>${visibleData.length + idx + 1}</td>
                            <td>
                                <span style="color:#8c8c8c;">${escapeHtml(d.emp.name || 'N/A')}</span>
                                <span onclick="window._attendance.unhideEmployee('${d.empId}')" style="cursor:pointer; color:#52c41a; font-size:12px; margin-left:8px;">Hiện</span>
                            </td>
                            <td style="color:#8c8c8c;">${formatVND(d.luongChinh)}</td>
                            <td style="color:#8c8c8c;">${formatVND(d.lamThem)}</td>
                            <td style="color:#8c8c8c;">${formatVND(d.phuCap)}</td>
                            <td style="color:#8c8c8c;">0</td>
                            <td style="color:#8c8c8c;">0</td>
                            <td style="color:#8c8c8c;">${formatVND(d.tongLuong)}</td>
                            <td style="color:#8c8c8c;">0</td>
                            <td style="color:#8c8c8c;">${formatVND(d.conCanTra)}</td>
                            <td style="color:#8c8c8c;">${escapeHtml(d.ghiChu || '')}</td>
                        </tr>
                    `;
                });
            }
        }

        tbody.innerHTML = html;
        refreshIcons();
        bindPayrollInputs();
    }

    /** Gắn event listeners cho các input inline trong bảng payroll.
     *  Dùng event delegation trên table container (không bị mất khi innerHTML tbody thay đổi).
     */
    let _payrollInputsBound = false;
    function bindPayrollInputs() {
        // Delegate trên .ts-table-container thay vì tbody (tbody.innerHTML bị replace mỗi lần render)
        const container = document.querySelector('#viewSchedule .ts-table-container');
        if (!container || _payrollInputsBound) return;
        _payrollInputsBound = true;

        container.addEventListener('focus', function (e) {
            if (e.target.classList.contains('payroll-cell-input')) {
                const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                const num = parseInt(raw) || 0;
                e.target.value = num === 0 ? '' : num;
                e.target.select();
            }
        }, true);

        container.addEventListener('blur', function (e) {
            if (e.target.classList.contains('payroll-cell-input')) {
                const field = e.target.dataset.field;
                const empId = e.target.dataset.emp;
                const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                const num = Math.max(0, parseInt(raw) || 0); // Không cho âm

                e.target.value = num ? formatVND(num) : '0';

                savePayrollField(empId, field, num).then(() => {
                    updatePayrollRowTotals(empId);
                });
            }
            if (e.target.classList.contains('payroll-note-input')) {
                const empId = e.target.dataset.emp;
                const val = e.target.value.trim();
                savePayrollField(empId, 'ghiChu', val);
            }
        }, true);

        container.addEventListener('keydown', function (e) {
            if (e.target.classList.contains('payroll-cell-input') && e.key === 'Enter') {
                e.target.blur();
            }
        }, true);
    }

    /** Cập nhật Tổng lương + Còn cần trả cho 1 row mà không re-render toàn bảng */
    function updatePayrollRowTotals(empId) {
        const row = document.querySelector(`tr[data-emp-id="${empId}"]`);
        if (!row) return;

        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const d = calculatePayrollRow(emp, empId);

        // Update tổng lương (cột 9) và còn cần trả (cột 11)
        const cells = row.querySelectorAll('td');
        if (cells[8]) cells[8].textContent = formatVND(d.tongLuong);
        if (cells[10]) cells[10].textContent = formatVND(d.conCanTra);

        // Update grand total row
        updateGrandTotalRow();
    }

    /** Cập nhật row tổng cộng */
    function updateGrandTotalRow() {
        const totalRow = document.querySelector('.payroll-total-row');
        if (!totalRow) return;

        const visibleEmps = employees.filter(emp => !isHidden(String(emp.userId || emp.uid || emp.id)));
        const gt = visibleEmps.reduce((acc, emp) => {
            const empId = String(emp.userId || emp.uid || emp.id);
            const d = calculatePayrollRow(emp, empId);
            acc.luongChinh += d.luongChinh;
            acc.lamThem += d.lamThem;
            acc.phuCap += d.phuCap;
            acc.thuong += d.thuong;
            acc.giamTru += d.giamTru;
            acc.tongLuong += d.tongLuong;
            acc.daTra += d.daTra;
            acc.conCanTra += d.conCanTra;
            return acc;
        }, { luongChinh: 0, lamThem: 0, phuCap: 0, thuong: 0, giamTru: 0, tongLuong: 0, daTra: 0, conCanTra: 0 });

        const cells = totalRow.querySelectorAll('td');
        if (cells[3]) cells[3].textContent = formatVND(gt.luongChinh);
        if (cells[4]) cells[4].textContent = formatVND(gt.lamThem);
        if (cells[5]) cells[5].textContent = formatVND(gt.phuCap);
        if (cells[6]) cells[6].textContent = gt.thuong ? formatVND(gt.thuong) : '0';
        if (cells[7]) cells[7].textContent = gt.giamTru ? formatVND(gt.giamTru) : '0';
        if (cells[8]) cells[8].textContent = formatVND(gt.tongLuong);
        if (cells[9]) cells[9].textContent = gt.daTra ? formatVND(gt.daTra) : '0';
        if (cells[10]) cells[10].textContent = formatVND(gt.conCanTra);
    }

    /** Hiện chi tiết trừ muộn / OT theo ngày */
    function showMonthlyDetail(empId, type) {
        const data = monthlyEmpData.find(d => d.empId === String(empId));
        if (!data) return;

        const empName = data.emp.name || `User ${empId}`;
        const items = type === 'late' ? data.lateDays : data.otDays;
        const title = type === 'late' ? 'Chi tiết trừ muộn' : 'Chi tiết OT';
        const color = type === 'late' ? '#cf1322' : '#096dd9';

        let total = 0;
        let listHtml = items.map(item => {
            total += item.amount;
            const d = new Date(item.dateKey);
            const dayName = SHORT_DAY_NAMES[d.getDay()];
            const dayNum = item.dateKey.split('-').reverse().join('/');
            if (type === 'late') {
                return `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0;">
                    <span>${dayName} ${dayNum} — muộn ${item.minutes} phút</span>
                    <span style="color:${color}; font-weight:600;">-${formatVND(item.amount)}đ</span>
                </div>`;
            } else {
                const h = Math.floor(item.minutes / 60);
                const m = item.minutes % 60;
                const display = h > 0 ? `${h}h${m > 0 ? m + 'p' : ''}` : `${m}p`;
                return `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0;">
                    <span>${dayName} ${dayNum} — OT ${display}</span>
                    <span style="color:${color}; font-weight:600;">+${formatVND(item.amount)}đ</span>
                </div>`;
            }
        }).join('');

        const sign = type === 'late' ? '-' : '+';

        // Show in a simple popup modal
        let modal = document.getElementById('monthlyDetailModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'monthlyDetailModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4);';
        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; padding:20px; width:400px; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div>
                        <div style="font-size:15px; font-weight:600; color:#1e293b;">${title}</div>
                        <div style="font-size:12px; color:#8c8c8c;">${empName}</div>
                    </div>
                    <button onclick="document.getElementById('monthlyDetailModal').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:#8c8c8c;">✕</button>
                </div>
                <div style="font-size:13px;">${listHtml}</div>
                <div style="display:flex; justify-content:space-between; padding:10px 0 0; margin-top:4px; font-weight:700; font-size:14px;">
                    <span>Tổng (${items.length} ngày)</span>
                    <span style="color:${color};">${sign}${formatVND(total)}đ</span>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // ================================================================
    // PAYROLL MODALS
    // ================================================================

    /** Modal: Thiết lập nhân viên */
    let _settingsEventsBound = false;
    function showPayrollSettingsModal() {
        const modal = document.getElementById('payrollSettingsModal');
        if (!modal) return;

        const tbody = modal.querySelector('#payrollSettingsTable tbody');
        if (!tbody) return;

        let html = '';
        const sortedEmps = [...employees].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

        sortedEmps.forEach(emp => {
            const empId = String(emp.userId || emp.uid || emp.id);
            const hidden = isHidden(empId);
            const rate = emp.dailyRate || SALARY.DAILY_RATE;
            const workStart = emp.workStart != null ? emp.workStart : SALARY.WORK_START_HOUR;
            const workEnd = emp.workEnd != null ? emp.workEnd : SALARY.OT_START_HOUR;

            html += `
                <tr>
                    <td style="text-align: center;">
                        <label class="payroll-toggle">
                            <input type="checkbox" ${!hidden ? 'checked' : ''} data-emp-id="${empId}" class="settings-toggle">
                            <span class="payroll-toggle-slider"></span>
                        </label>
                    </td>
                    <td>
                        <input type="text" class="payroll-settings-input settings-name" data-emp-id="${empId}"
                            value="${escapeHtml(emp.name || '')}" placeholder="Tên nhân viên">
                    </td>
                    <td>
                        <input type="number" class="payroll-settings-input settings-salary" data-emp-id="${empId}"
                            value="${rate}" step="10000" min="0" placeholder="200000" style="text-align:right;">
                    </td>
                    <td style="text-align:center;">
                        <input type="number" class="payroll-settings-input settings-work-start" data-emp-id="${empId}"
                            value="${workStart}" min="0" max="23" step="1" style="text-align:center; width:55px;">
                    </td>
                    <td style="text-align:center;">
                        <input type="number" class="payroll-settings-input settings-work-end" data-emp-id="${empId}"
                            value="${workEnd}" min="0" max="23" step="1" style="text-align:center; width:55px;">
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        modal.style.display = 'flex';
        refreshIcons();

        // Event delegation trên modal (chỉ bind 1 lần)
        if (!_settingsEventsBound) {
            _settingsEventsBound = true;

            modal.addEventListener('change', function (e) {
                if (e.target.classList.contains('settings-toggle')) {
                    const empId = e.target.dataset.empId;
                    if (e.target.checked) {
                        unhideEmployee(empId);
                    } else {
                        hideEmployee(empId);
                    }
                }
            });

            // Helper: save 1 field cho 1 employee
            async function saveSettingsField(input) {
                const empId = input.dataset ? input.dataset.empId : null;
                if (!empId) return;
                const emp = employees.find(em => String(em.userId || em.uid || em.id) === empId);
                if (!emp) return;

                const docId = String(emp.id || emp.userId);
                const isTest = docId.startsWith('test_');

                if (input.classList.contains('settings-name')) {
                    const newName = input.value.trim();
                    if (newName && newName !== emp.name) {
                        const oldName = emp.name;
                        emp.name = newName;
                        emp.displayName = newName;
                        try {
                            if (!isTest) {
                                await apiPatch('/device-users/' + docId, { display_name: newName });
                            }
                            showNotification(`Đã đổi tên: ${emp._deviceName || oldName} → ${newName}`, 'success');
                            renderMonthlySchedule();
                        } catch (err) {
                            emp.name = oldName;
                            emp.displayName = oldName === emp._deviceName ? null : oldName;
                            showNotification('Lỗi đổi tên: ' + err.message, 'error');
                        }
                    }
                }

                if (input.classList.contains('settings-salary')) {
                    const newRate = parseInt(input.value) || SALARY.DAILY_RATE;
                    if (newRate !== (emp.dailyRate || SALARY.DAILY_RATE)) {
                        const oldRate = emp.dailyRate;
                        emp.dailyRate = newRate;
                        try {
                            if (!isTest) {
                                await apiPatch('/device-users/' + docId, { daily_rate: newRate });
                            }
                            showNotification(`Đã cập nhật lương: ${formatVND(newRate)}đ/ngày`, 'success');
                            renderMonthlySchedule();
                        } catch (err) {
                            emp.dailyRate = oldRate;
                            showNotification('Lỗi: ' + err.message, 'error');
                        }
                    }
                }

                if (input.classList.contains('settings-work-start')) {
                    const val = parseInt(input.value);
                    const newStart = isNaN(val) ? SALARY.WORK_START_HOUR : Math.max(0, Math.min(23, val));
                    input.value = newStart;
                    if (newStart !== (emp.workStart != null ? emp.workStart : SALARY.WORK_START_HOUR)) {
                        const oldStart = emp.workStart;
                        emp.workStart = newStart;
                        try {
                            if (!isTest) {
                                await apiPatch('/device-users/' + docId, { work_start: newStart });
                            }
                            showNotification(`Giờ vào: ${newStart}:00`, 'success');
                            renderMonthlySchedule();
                        } catch (err) {
                            emp.workStart = oldStart;
                            showNotification('Lỗi: ' + err.message, 'error');
                        }
                    }
                }

                if (input.classList.contains('settings-work-end')) {
                    const val = parseInt(input.value);
                    const newEnd = isNaN(val) ? SALARY.OT_START_HOUR : Math.max(0, Math.min(23, val));
                    input.value = newEnd;
                    if (newEnd !== (emp.workEnd != null ? emp.workEnd : SALARY.OT_START_HOUR)) {
                        const oldEnd = emp.workEnd;
                        emp.workEnd = newEnd;
                        try {
                            if (!isTest) {
                                await apiPatch('/device-users/' + docId, { work_end: newEnd });
                            }
                            showNotification(`Giờ ra: ${newEnd}:00`, 'success');
                            renderMonthlySchedule();
                        } catch (err) {
                            emp.workEnd = oldEnd;
                            showNotification('Lỗi: ' + err.message, 'error');
                        }
                    }
                }
            }

            // Blur: save từng field khi rời input
            modal.addEventListener('blur', function (e) {
                if (e.target.classList.contains('payroll-settings-input')) {
                    saveSettingsField(e.target);
                }
            }, true);

            // Close: save tất cả thay đổi trước khi đóng
            const closeButtons = modal.querySelectorAll('[data-close-modal]');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', async function () {
                    // Save all pending changes
                    const inputs = modal.querySelectorAll('.payroll-settings-input');
                    for (const input of inputs) {
                        await saveSettingsField(input);
                    }
                    modal.style.display = 'none';
                });
            });
        }
    }

    /** Modal: Lương chính */
    function showLuongChinhModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('luongChinhModal');
        if (!modal) return;

        const empRate = emp.dailyRate || SALARY.DAILY_RATE;
        const empName = emp.name || `User ${empId}`;
        const empSched = { workStart: emp.workStart, workEnd: emp.workEnd };
        const rows = calculateLuongChinhDetail(empId, empRate, empSched);
        const totalActualDays = rows.reduce((s, r) => s + r.actualDays, 0);
        const totalSalaryDays = rows.reduce((s, r) => s + r.salaryDays, 0);
        const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

        // Set header info
        document.getElementById('lcEmpName').textContent = `Nhân viên: ${empName}`;
        document.getElementById('lcInfo').innerHTML = `
            <span>Loại lương: Theo ngày công chuẩn</span>
            <span>Ngày công chuẩn: 30</span>
            <span>Mức lương: ${formatVND(empRate * 30)}</span>
        `;

        // Build rows
        const tbody = document.getElementById('lcBody');
        let bodyHtml = `
            <tr class="total-row">
                <td></td>
                <td></td>
                <td style="text-align:center; font-weight:700;">${totalActualDays}</td>
                <td style="text-align:center; font-weight:700;">${totalSalaryDays}</td>
                <td style="text-align:right; font-weight:700;">${formatVND(totalAmount)}</td>
            </tr>
        `;

        rows.forEach((row, i) => {
            bodyHtml += `
                <tr>
                    <td>
                        ${row.label}
                        ${row.subLabel ? `<div class="payroll-detail-sub">${row.subLabel}</div>` : ''}
                    </td>
                    <td style="text-align:right;">${formatVND(row.dailyRate)}</td>
                    <td style="text-align:center;">${row.actualDays}</td>
                    <td style="text-align:center;">
                        <input type="number" class="payroll-detail-input lc-days-input" data-row="${i}"
                            value="${row.salaryDays}" min="0" step="1">
                    </td>
                    <td style="text-align:right; font-weight:600;">${formatVND(row.amount)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = bodyHtml;
        modal.style.display = 'flex';

        // Recalculate on input change
        const inputs = tbody.querySelectorAll('.lc-days-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                recalcLuongChinhModal(empRate);
            });
        });

        // Xong button
        const btnApply = document.getElementById('btnLcApply');
        btnApply.onclick = async () => {
            const overrides = {};
            const types = ['weekday', 'weekend', 'holiday'];
            inputs.forEach((input, i) => {
                const val = parseFloat(input.value);
                overrides[types[i]] = isNaN(val) ? null : val;
            });
            await savePayrollOverrides(empId, 'salary', overrides);
            modal.style.display = 'none';
            renderMonthlySchedule();
        };
    }

    /** Recalculate Lương chính modal khi thay đổi input */
    function recalcLuongChinhModal(dailyRate) {
        const tbody = document.getElementById('lcBody');
        if (!tbody) return;

        const inputs = tbody.querySelectorAll('.lc-days-input');
        const dataRows = tbody.querySelectorAll('tr:not(.total-row)');
        let totalDays = 0, totalAmount = 0;

        inputs.forEach((input, i) => {
            const days = parseFloat(input.value) || 0;
            const amount = dailyRate * days;
            totalDays += days;
            totalAmount += amount;
            // Update thành tiền cell
            if (dataRows[i]) {
                const lastTd = dataRows[i].querySelector('td:last-child');
                if (lastTd) lastTd.textContent = formatVND(amount);
            }
        });

        // Update total row
        const totalRow = tbody.querySelector('.total-row');
        if (totalRow) {
            const cells = totalRow.querySelectorAll('td');
            if (cells[3]) cells[3].textContent = totalDays;
            if (cells[4]) cells[4].textContent = formatVND(totalAmount);
        }
    }

    /** Modal: Lương làm thêm */
    function showLamThemModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('lamThemModal');
        if (!modal) return;

        const empRate = emp.dailyRate || SALARY.DAILY_RATE;
        const empName = emp.name || `User ${empId}`;
        const empSched = { workStart: emp.workStart, workEnd: emp.workEnd };
        const detail = calculateLamThemDetail(empId, empRate, empSched);

        document.getElementById('ltEmpName').textContent = `Nhân viên: ${empName}`;
        document.getElementById('ltInfo').innerHTML = `<span>Loại lương: Theo ngày công chuẩn</span>`;

        const tbody = document.getElementById('ltBody');
        let bodyHtml = `
            <tr class="default-row">
                <td>
                    Mặc định
                    <div class="payroll-detail-sub">${formatVND(detail.defaultRate)}/Giờ</div>
                </td>
                <td></td>
                <td style="text-align:center; font-weight:700;">${Math.round(detail.totalActualHours * 100) / 100}</td>
                <td style="text-align:center; font-weight:700;">${Math.round(detail.totalSalaryHours * 100) / 100}</td>
                <td style="text-align:right; font-weight:700;">${formatVND(detail.totalAmount)}</td>
            </tr>
        `;

        detail.rows.forEach((row, i) => {
            bodyHtml += `
                <tr>
                    <td>${row.label}</td>
                    <td style="text-align:right;">${formatVND(row.otRate)}</td>
                    <td style="text-align:center;">${Math.round(row.actualHours * 100) / 100}</td>
                    <td style="text-align:center;">
                        <input type="number" class="payroll-detail-input lt-hours-input" data-row="${i}"
                            value="${Math.round(row.salaryHours * 100) / 100}" min="0" step="0.01">
                    </td>
                    <td style="text-align:right; font-weight:600;">${formatVND(row.amount)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = bodyHtml;
        modal.style.display = 'flex';

        // Recalculate on input change
        const inputs = tbody.querySelectorAll('.lt-hours-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                recalcLamThemModal(detail);
            });
        });

        // Xong button
        const btnApply = document.getElementById('btnLtApply');
        btnApply.onclick = async () => {
            const overrides = {};
            const types = ['weekday', 'saturday', 'sunday', 'holiday', 'holiday']; // nghỉ + lễ map to same
            const keys = ['weekday', 'saturday', 'sunday', null, 'holiday'];
            inputs.forEach((input, i) => {
                if (keys[i] === null) return; // skip ngày nghỉ (index 3)
                const val = parseFloat(input.value);
                overrides[keys[i]] = isNaN(val) ? null : val;
            });
            await savePayrollOverrides(empId, 'ot', overrides);
            modal.style.display = 'none';
            renderMonthlySchedule();
        };
    }

    /** Recalculate Làm thêm modal khi thay đổi input */
    function recalcLamThemModal(detail) {
        const tbody = document.getElementById('ltBody');
        if (!tbody) return;

        const inputs = tbody.querySelectorAll('.lt-hours-input');
        const dataRows = tbody.querySelectorAll('tr:not(.default-row)');
        let totalHours = 0, totalAmount = 0;

        inputs.forEach((input, i) => {
            const hours = parseFloat(input.value) || 0;
            const amount = Math.round(detail.rows[i].otRate * hours);
            totalHours += hours;
            totalAmount += amount;
            if (dataRows[i]) {
                const lastTd = dataRows[i].querySelector('td:last-child');
                if (lastTd) lastTd.textContent = formatVND(amount);
            }
        });

        // Update default row
        const defaultRow = tbody.querySelector('.default-row');
        if (defaultRow) {
            const cells = defaultRow.querySelectorAll('td');
            if (cells[2]) cells[2].textContent = Math.round(totalHours * 100) / 100;
            if (cells[3]) cells[3].textContent = Math.round(totalHours * 100) / 100;
            if (cells[4]) cells[4].textContent = formatVND(totalAmount);
        }
    }

    /** Modal: Phụ cấp */
    function showPhuCapModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('phuCapModal');
        if (!modal) return;

        const empName = emp.name || `User ${empId}`;
        const payDoc = getPayrollDoc(empId);

        // Migrate from old allowance if no payroll allowances exist
        let items = payDoc.allowances ? [...payDoc.allowances] : [];
        if (items.length === 0) {
            const oldAllowance = getAllowance(empId);
            if (oldAllowance > 0) {
                items = [{ name: 'Phụ cấp', amount: oldAllowance }];
            }
        }

        document.getElementById('pcEmpName').textContent = `Nhân viên: ${empName}`;

        function renderPcRows() {
            const tbody = document.getElementById('pcBody');
            const totalAmount = items.reduce((s, item) => s + (item.amount || 0), 0);

            let html = `
                <tr class="total-row">
                    <td colspan="4"></td>
                    <td style="text-align:right; font-weight:700;">${formatVND(totalAmount)}</td>
                </tr>
            `;

            items.forEach((item, i) => {
                html += `
                    <tr>
                        <td style="width:40px;">
                            <button class="phu-cap-delete-btn" data-idx="${i}" title="Xóa">
                                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                            </button>
                        </td>
                        <td>
                            <input type="text" class="payroll-settings-input pc-name-input" data-idx="${i}"
                                value="${escapeHtml(item.name || '')}" placeholder="Tên phụ cấp" list="dlPhuCap">
                        </td>
                        <td style="text-align:center;">
                            <input type="number" class="payroll-detail-input pc-days-input" data-idx="${i}"
                                value="${item.days || ''}" min="0" style="width:60px;" placeholder="-">
                        </td>
                        <td style="text-align:right;">
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:4px;">
                                <input type="text" class="payroll-settings-input pc-amount-input" data-idx="${i}"
                                    value="${item.amount ? formatVND(item.amount) : ''}" placeholder="0"
                                    style="text-align:right; width:120px;">
                                <span style="font-size:12px; color:#8c8c8c;">/tháng</span>
                            </div>
                        </td>
                        <td style="text-align:right; font-weight:600;">${item.amount ? formatVND(item.amount) : '0'}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
            refreshIcons();

            // Delete buttons
            tbody.querySelectorAll('.phu-cap-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx);
                    items.splice(idx, 1);
                    renderPcRows();
                });
            });

            // Name/amount input sync
            tbody.querySelectorAll('.pc-name-input').forEach(input => {
                input.addEventListener('blur', () => {
                    items[parseInt(input.dataset.idx)].name = input.value.trim();
                });
            });

            tbody.querySelectorAll('.pc-amount-input').forEach(input => {
                input.addEventListener('focus', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = parseInt(raw) || 0;
                    input.value = num === 0 ? '' : num;
                    input.select();
                });
                input.addEventListener('blur', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = parseInt(raw) || 0;
                    items[parseInt(input.dataset.idx)].amount = num;
                    input.value = num ? formatVND(num) : '0';
                    // Update total and thành tiền
                    renderPcRows();
                });
            });
        }

        updateDatalist('dlPhuCap', getPayrollNameSuggestions('allowances'));
        renderPcRows();
        modal.style.display = 'flex';

        // Thêm phụ cấp khác
        document.getElementById('pcAddLink').onclick = () => {
            items.push({ name: '', amount: 0 });
            renderPcRows();
        };

        // Xong button
        document.getElementById('btnPcApply').onclick = async () => {
            // Clean up empty items
            const cleanItems = items.filter(item => item.name || item.amount);
            await savePayrollAllowances(empId, cleanItems);
            modal.style.display = 'none';
            renderMonthlySchedule();
        };
    }

    /** Modal: Các khoản thưởng */
    function showThuongModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('thuongModal');
        if (!modal) return;

        const empName = emp.name || `User ${empId}`;
        const payDoc = getPayrollDoc(empId);

        // Load items: migrate from legacy thuong number
        let items = payDoc.thuongItems ? [...payDoc.thuongItems] : [];
        if (items.length === 0 && (payDoc.thuong || 0) > 0) {
            items = [{ name: 'Thưởng', amount: payDoc.thuong }];
        }

        document.getElementById('thuongEmpName').textContent = `Nhân viên: ${empName}`;

        function renderThuongRows() {
            const tbody = document.getElementById('thuongBody');
            const totalAmount = items.reduce((s, item) => s + (item.amount || 0), 0);

            let html = `
                <tr class="total-row">
                    <td></td>
                    <td style="text-align:right; font-weight:700;">${formatVND(totalAmount)}</td>
                </tr>
            `;

            items.forEach((item, i) => {
                html += `
                    <tr>
                        <td style="display:flex; align-items:center; gap:8px;">
                            <button class="phu-cap-delete-btn thuong-delete-btn" data-idx="${i}" title="Xóa">
                                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                            </button>
                            <input type="text" class="payroll-settings-input thuong-name-input" data-idx="${i}"
                                value="${escapeHtml(item.name || '')}" placeholder="Tên khoản thưởng" style="flex:1;" list="dlThuong">
                        </td>
                        <td style="text-align:right;">
                            <input type="text" class="payroll-settings-input thuong-amount-input" data-idx="${i}"
                                value="${item.amount ? formatVND(item.amount) : '0'}" placeholder="0"
                                style="text-align:right; width:150px;">
                        </td>
                    </tr>
                `;
            });

            // Category rows
            html += `
                <tr class="thuong-category-row">
                    <td>Thưởng theo ngày làm việc</td>
                    <td style="text-align:right;">
                        <span class="phu-cap-add-link thuong-add-btn" data-cat="ngaylv" style="cursor:pointer;">+</span>
                    </td>
                </tr>
                <tr class="thuong-category-row">
                    <td>Thưởng khác</td>
                    <td style="text-align:right;">
                        <span class="phu-cap-add-link thuong-add-btn" data-cat="khac" style="cursor:pointer;">+</span>
                    </td>
                </tr>
            `;

            tbody.innerHTML = html;
            refreshIcons();

            // Delete buttons
            tbody.querySelectorAll('.thuong-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    items.splice(parseInt(btn.dataset.idx), 1);
                    renderThuongRows();
                });
            });

            // Name inputs
            tbody.querySelectorAll('.thuong-name-input').forEach(input => {
                input.addEventListener('blur', () => {
                    items[parseInt(input.dataset.idx)].name = input.value.trim();
                });
            });

            // Amount inputs
            tbody.querySelectorAll('.thuong-amount-input').forEach(input => {
                input.addEventListener('focus', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = parseInt(raw) || 0;
                    input.value = num === 0 ? '' : num;
                    input.select();
                });
                input.addEventListener('blur', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = Math.max(0, parseInt(raw) || 0);
                    items[parseInt(input.dataset.idx)].amount = num;
                    input.value = num ? formatVND(num) : '0';
                    renderThuongRows();
                });
            });

            // Add buttons
            tbody.querySelectorAll('.thuong-add-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const cat = btn.dataset.cat;
                    const name = cat === 'ngaylv' ? 'Thưởng theo ngày làm việc' : '';
                    items.push({ name, amount: 0, category: cat });
                    renderThuongRows();
                });
            });
        }

        updateDatalist('dlThuong', getPayrollNameSuggestions('thuongItems'));
        renderThuongRows();
        modal.style.display = 'flex';

        // Xong button
        document.getElementById('btnThuongApply').onclick = async () => {
            const cleanItems = items.filter(item => item.name || item.amount);
            await savePayrollField(empId, 'thuongItems', cleanItems);
            modal.style.display = 'none';
            renderMonthlySchedule();
        };
    }

    /** Modal: Các khoản giảm trừ */
    function showGiamTruModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('giamTruModal');
        if (!modal) return;

        const empName = emp.name || `User ${empId}`;
        const payDoc = getPayrollDoc(empId);
        const empRate = emp.dailyRate || SALARY.DAILY_RATE;

        // Tính trừ muộn auto từ attendance
        const d = calculatePayrollRow(emp, empId);
        const totalLateAuto = d.totalLate;

        // Load items: migrate from legacy giamTruManual
        let items = payDoc.giamTruItems ? [...payDoc.giamTruItems] : [];
        if (items.length === 0 && (payDoc.giamTruManual || 0) > 0) {
            items = [{ name: 'Giảm trừ khác', amount: payDoc.giamTruManual }];
        }

        document.getElementById('giamTruEmpName').textContent = `Nhân viên: ${empName}`;

        // Override cho giảm trừ đi muộn (mặc định = auto)
        let lateOverride = payDoc.giamTruLateOverride != null ? payDoc.giamTruLateOverride : null;
        const effectiveLate = () => lateOverride != null ? lateOverride : totalLateAuto;
        // Ghi chú giảm trừ
        let giamTruNote = payDoc.giamTruNote || '';

        function renderGiamTruRows() {
            const tbody = document.getElementById('giamTruBody');
            const itemsTotal = items.reduce((s, item) => s + (item.amount || 0), 0);
            const grandTotal = effectiveLate() + itemsTotal;

            let html = `
                <tr class="total-row">
                    <td></td>
                    <td style="text-align:right; font-weight:700;">${formatVND(grandTotal)}</td>
                </tr>
                <tr>
                    <td>Giảm trừ đi muộn, về sớm, cố định
                        ${lateOverride != null ? `<span style="color:#8c8c8c; font-size:12px;"> (gốc: ${formatVND(totalLateAuto)})</span>` : ''}
                    </td>
                    <td style="text-align:right;">
                        <input type="text" class="payroll-settings-input" id="giamTruLateInput"
                            value="${formatVND(effectiveLate())}"
                            style="text-align:right; width:150px; color:#1890ff; font-weight:600;">
                    </td>
                </tr>
            `;

            items.forEach((item, i) => {
                html += `
                    <tr>
                        <td style="display:flex; align-items:center; gap:8px;">
                            <button class="phu-cap-delete-btn giamtru-delete-btn" data-idx="${i}" title="Xóa">
                                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                            </button>
                            <input type="text" class="payroll-settings-input giamtru-name-input" data-idx="${i}"
                                value="${escapeHtml(item.name || '')}" placeholder="Tên khoản giảm trừ" style="flex:1;" list="dlGiamTru">
                        </td>
                        <td style="text-align:right;">
                            <input type="text" class="payroll-settings-input giamtru-amount-input" data-idx="${i}"
                                value="${item.amount ? formatVND(item.amount) : '0'}" placeholder="0"
                                style="text-align:right; width:150px;">
                        </td>
                    </tr>
                `;
            });

            // Category rows
            html += `
                <tr class="thuong-category-row">
                    <td>Phạt vi phạm theo ngày</td>
                    <td style="text-align:right;">
                        <span class="phu-cap-add-link giamtru-add-btn" data-cat="phat" style="cursor:pointer;">+</span>
                    </td>
                </tr>
                <tr class="thuong-category-row">
                    <td>Giảm trừ khác</td>
                    <td style="text-align:right;">
                        <span class="phu-cap-add-link giamtru-add-btn" data-cat="khac" style="cursor:pointer;">+</span>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 8px 12px;">
                        <div style="font-size:13px; color:#8c8c8c; margin-bottom:4px;">Ghi chú</div>
                        <textarea id="giamTruNoteInput" class="payroll-settings-input" rows="2"
                            placeholder="Ghi chú giảm trừ..." style="width:100%; resize:vertical;">${escapeHtml(giamTruNote)}</textarea>
                    </td>
                </tr>
            `;

            tbody.innerHTML = html;
            refreshIcons();

            // Late override input
            const lateInput = document.getElementById('giamTruLateInput');
            if (lateInput) {
                lateInput.addEventListener('focus', () => {
                    const raw = lateInput.value.replace(/\./g, '').replace(/,/g, '');
                    const num = parseInt(raw) || 0;
                    lateInput.value = num === 0 ? '' : num;
                    lateInput.select();
                });
                lateInput.addEventListener('blur', () => {
                    const raw = lateInput.value.replace(/\./g, '').replace(/,/g, '');
                    const num = Math.max(0, parseInt(raw) || 0);
                    if (num === totalLateAuto) {
                        lateOverride = null; // Reset về auto
                    } else {
                        lateOverride = num;
                    }
                    renderGiamTruRows();
                });
            }

            // Note input
            const noteInput = document.getElementById('giamTruNoteInput');
            if (noteInput) {
                noteInput.addEventListener('blur', () => {
                    giamTruNote = noteInput.value.trim();
                });
            }

            // Delete buttons
            tbody.querySelectorAll('.giamtru-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    items.splice(parseInt(btn.dataset.idx), 1);
                    renderGiamTruRows();
                });
            });

            // Name inputs
            tbody.querySelectorAll('.giamtru-name-input').forEach(input => {
                input.addEventListener('blur', () => {
                    items[parseInt(input.dataset.idx)].name = input.value.trim();
                });
            });

            // Amount inputs
            tbody.querySelectorAll('.giamtru-amount-input').forEach(input => {
                input.addEventListener('focus', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = parseInt(raw) || 0;
                    input.value = num === 0 ? '' : num;
                    input.select();
                });
                input.addEventListener('blur', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = Math.max(0, parseInt(raw) || 0);
                    items[parseInt(input.dataset.idx)].amount = num;
                    input.value = num ? formatVND(num) : '0';
                    renderGiamTruRows();
                });
            });

            // Add buttons
            tbody.querySelectorAll('.giamtru-add-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const cat = btn.dataset.cat;
                    const name = cat === 'phat' ? 'Phạt vi phạm theo ngày' : '';
                    items.push({ name, amount: 0, category: cat });
                    renderGiamTruRows();
                });
            });
        }

        updateDatalist('dlGiamTru', getPayrollNameSuggestions('giamTruItems'));
        renderGiamTruRows();
        modal.style.display = 'flex';

        // Xong button
        document.getElementById('btnGiamTruApply').onclick = async () => {
            const cleanItems = items.filter(item => item.name || item.amount);
            if (!currentMonth) return;
            const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;
            const docId = `${empId}_${monthKey}`;
            try {
                const data = {
                    empId: String(empId),
                    monthKey,
                    giamTruItems: cleanItems,
                    giamTruLateOverride: lateOverride != null ? lateOverride : null,
                    giamTruNote: giamTruNote || null,
                };
                await apiPut('/payroll/' + docId, data);
                // Update local cache
                if (!payrollDataMap[String(empId)]) {
                    payrollDataMap[String(empId)] = { empId: String(empId), monthKey };
                }
                const local = payrollDataMap[String(empId)];
                local.giamTruItems = cleanItems;
                local.giamTruLateOverride = lateOverride;
                local.giamTruNote = giamTruNote || '';
            } catch (err) {
                showNotification('Lỗi lưu: ' + err.message, 'error');
            }
            modal.style.display = 'none';
            renderMonthlySchedule();
        };
    }

    /** Modal: Đã trả nhân viên */
    function showDaTraModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('daTraModal');
        if (!modal) return;

        const empName = emp.name || `User ${empId}`;
        const payDoc = getPayrollDoc(empId);

        // Load items: migrate from legacy daTra number
        let items = payDoc.daTraItems ? [...payDoc.daTraItems] : [];
        if (items.length === 0 && (payDoc.daTra || 0) > 0) {
            items = [{ name: 'Đã trả', amount: payDoc.daTra }];
        }

        document.getElementById('daTraEmpName').textContent = `Nhân viên: ${empName}`;

        function renderDaTraRows() {
            const tbody = document.getElementById('daTraBody');
            const totalAmount = items.reduce((s, item) => s + (item.amount || 0), 0);

            let html = `
                <tr class="total-row">
                    <td></td>
                    <td style="text-align:right; font-weight:700;">${formatVND(totalAmount)}</td>
                </tr>
            `;

            items.forEach((item, i) => {
                html += `
                    <tr>
                        <td style="display:flex; align-items:center; gap:8px;">
                            <button class="phu-cap-delete-btn datra-delete-btn" data-idx="${i}" title="Xóa">
                                <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                            </button>
                            <input type="text" class="payroll-settings-input datra-name-input" data-idx="${i}"
                                value="${escapeHtml(item.name || '')}" placeholder="Nội dung" style="flex:1;" list="dlDaTra">
                        </td>
                        <td style="text-align:right;">
                            <input type="text" class="payroll-settings-input datra-amount-input" data-idx="${i}"
                                value="${item.amount ? formatVND(item.amount) : '0'}" placeholder="0"
                                style="text-align:right; width:150px;">
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
            refreshIcons();

            // Delete buttons
            tbody.querySelectorAll('.datra-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    items.splice(parseInt(btn.dataset.idx), 1);
                    renderDaTraRows();
                });
            });

            // Name inputs
            tbody.querySelectorAll('.datra-name-input').forEach(input => {
                input.addEventListener('blur', () => {
                    items[parseInt(input.dataset.idx)].name = input.value.trim();
                });
            });

            // Amount inputs
            tbody.querySelectorAll('.datra-amount-input').forEach(input => {
                input.addEventListener('focus', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = parseInt(raw) || 0;
                    input.value = num === 0 ? '' : num;
                    input.select();
                });
                input.addEventListener('blur', () => {
                    const raw = input.value.replace(/\./g, '').replace(/,/g, '');
                    const num = Math.max(0, parseInt(raw) || 0);
                    items[parseInt(input.dataset.idx)].amount = num;
                    input.value = num ? formatVND(num) : '0';
                    renderDaTraRows();
                });
            });
        }

        updateDatalist('dlDaTra', getPayrollNameSuggestions('daTraItems'));
        renderDaTraRows();
        modal.style.display = 'flex';

        // Thêm khoản trả
        document.getElementById('daTraAddLink').onclick = () => {
            items.push({ name: '', amount: 0 });
            renderDaTraRows();
        };

        // Xong button
        document.getElementById('btnDaTraApply').onclick = async () => {
            const cleanItems = items.filter(item => item.name || item.amount);
            await savePayrollField(empId, 'daTraItems', cleanItems);
            modal.style.display = 'none';
            renderMonthlySchedule();
        };
    }

    /** In phiếu lương nhân viên */
    function printPayslip(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const empName = emp.name || `User ${empId}`;
        const empRate = emp.dailyRate || SALARY.DAILY_RATE;
        const d = calculatePayrollRow(emp, empId);
        const y = currentMonth.year;
        const m = currentMonth.month;
        const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
            'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
        const lastDay = new Date(y, m, 0).getDate();

        // Thu nhập
        const thuNhap = d.luongChinh + d.lamThem + d.phuCap + d.thuong;

        const cellSt = 'border:1px solid #333; padding:6px 10px;';
        const tdIdx = `style="width:40px; text-align:center; ${cellSt}"`;
        const tdName = `style="${cellSt}"`;
        const tdAmt = `style="text-align:right; width:150px; ${cellSt}"`;

        // Build phụ cấp sub-items
        let phuCapRows = '';
        if (d.allowanceItems && d.allowanceItems.length > 0) {
            d.allowanceItems.forEach(item => {
                phuCapRows += `<tr><td ${tdIdx}></td><td style="padding-left:40px; ${cellSt}">${item.name || 'Phụ cấp'}</td><td ${tdAmt}>${fmtNum(item.amount || 0)}</td></tr>`;
            });
        }

        // Build thưởng sub-items
        let thuongRows = '';
        if (d.thuongItems && d.thuongItems.length > 0) {
            d.thuongItems.forEach(item => {
                thuongRows += `<tr><td ${tdIdx}></td><td style="padding-left:40px; ${cellSt}">${item.name || 'Thưởng'}</td><td ${tdAmt}>${fmtNum(item.amount || 0)}</td></tr>`;
            });
        }

        // Build giảm trừ sub-items
        let giamTruRows = '';
        if (d.totalLate > 0) {
            giamTruRows += `<tr><td ${tdIdx}>1</td><td ${tdName}>Đi trễ</td><td ${tdAmt}>${fmtNum(d.totalLate)}</td></tr>`;
        }
        if (d.giamTruItems && d.giamTruItems.length > 0) {
            let idx = d.totalLate > 0 ? 2 : 1;
            d.giamTruItems.forEach(item => {
                giamTruRows += `<tr><td ${tdIdx}>${idx}</td><td ${tdName}>${item.name || 'Giảm trừ khác'}</td><td ${tdAmt}>${fmtNum(item.amount || 0)}</td></tr>`;
                idx++;
            });
        }

        // Build đã trả sub-items
        let daTraRows = '';
        if (d.daTraItems && d.daTraItems.length > 0) {
            d.daTraItems.forEach((item, i) => {
                daTraRows += `<tr><td ${tdIdx}>${i + 1}</td><td ${tdName}>${item.name || 'Đã trả'}</td><td ${tdAmt}>${fmtNum(item.amount || 0)}</td></tr>`;
            });
        } else if (d.daTra > 0) {
            daTraRows = `<tr><td ${tdIdx}>1</td><td ${tdName}>Đã trả nhân viên</td><td ${tdAmt}>${fmtNum(d.daTra)}</td></tr>`;
        }

        const now = new Date();
        const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

        function fmtNum(n) { return n.toLocaleString('vi-VN'); }

        const logoUrl = new URL('../index/logo.jpg', window.location.href).href;

        const content = `
<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
    <div style="font-size:12px; color:#555;">${dateStr}</div>
    <div style="display:flex; align-items:center; gap:8px;">
        <img src="${logoUrl}" alt="N2STORE" style="height:50px;">
        <span style="font-size:24px; font-weight:700; color:#5b6abf; letter-spacing:1px;">N2STORE</span>
    </div>
</div>
<div style="text-align:center; margin:20px 0 5px; font-size:20px; font-weight:700;">PHIẾU LƯƠNG NHÂN VIÊN</div>
<div style="text-align:center; font-size:13px; margin-bottom:20px;">Bảng lương tháng ${m}/${y}</div>
<div style="margin-bottom:16px;">
    <div style="display:flex; margin-bottom:4px;"><span style="width:120px;">Nhân viên:</span><span style="font-weight:700;">${empName}</span></div>
    <div style="display:flex; margin-bottom:4px;"><span style="width:120px;">Mức lương:</span><span style="font-weight:700;">${fmtNum(empRate * 30)}</span></div>
</div>
<table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
    <tr style="font-weight:700;"><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">I</td><td style="border:1px solid #333; padding:6px 10px;">Các khoản thu nhập</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">${fmtNum(thuNhap)}</td></tr>
    <tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">1</td><td style="border:1px solid #333; padding:6px 10px;">Lương chính</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">${fmtNum(d.luongChinh)}</td></tr>
    <tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">2</td><td style="border:1px solid #333; padding:6px 10px;">Lương làm thêm giờ</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">${fmtNum(d.lamThem)}</td></tr>
    <tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">3</td><td style="border:1px solid #333; padding:6px 10px;">Phụ cấp</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">${fmtNum(d.phuCap)}</td></tr>
    ${phuCapRows}
    <tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">4</td><td style="border:1px solid #333; padding:6px 10px;">Thưởng</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">${fmtNum(d.thuong)}</td></tr>
    ${thuongRows}
    <tr style="font-weight:700;"><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">II</td><td style="border:1px solid #333; padding:6px 10px;">Các khoản giảm trừ</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">${fmtNum(d.giamTru)}</td></tr>
    ${giamTruRows || '<tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">1</td><td style="border:1px solid #333; padding:6px 10px;">Đi trễ</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">0</td></tr>'}
    <tr style="font-weight:700;"><td style="width:40px; text-align:center; border:1px solid #333; border-top:2px solid #333; padding:6px 10px;">III</td><td style="border:1px solid #333; border-top:2px solid #333; padding:6px 10px;">Tổng lương (I) - (II)</td><td style="text-align:right; width:150px; border:1px solid #333; border-top:2px solid #333; padding:6px 10px;">${fmtNum(d.tongLuong)}</td></tr>
    <tr style="font-weight:700;"><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">IV</td><td style="border:1px solid #333; padding:6px 10px;">Thanh toán lương</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;"></td></tr>
    ${daTraRows || '<tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">1</td><td style="border:1px solid #333; padding:6px 10px;">Đã trả nhân viên</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px;">0</td></tr>'}
    <tr><td style="width:40px; text-align:center; border:1px solid #333; padding:6px 10px;">${(d.daTraItems && d.daTraItems.length > 0) ? d.daTraItems.length + 1 : 2}</td><td style="border:1px solid #333; padding:6px 10px;">Còn cần trả</td><td style="text-align:right; width:150px; border:1px solid #333; padding:6px 10px; font-weight:700;">${fmtNum(d.conCanTra)}</td></tr>
</table>
<div style="font-size:12px;">
    <div style="display:flex; margin-bottom:3px;"><span style="width:200px;">Ngày công chuẩn:</span><span>${lastDay}.00</span></div>
    <div style="display:flex; margin-bottom:3px;"><span style="width:200px;">Số ngày tính lương:</span><span>${d.workedDays}.00</span></div>
</div>
${d.ghiChu ? `<div style="margin-top:12px; font-style:italic; font-size:12px;"><strong>Ghi chú:</strong> ${d.ghiChu}</div>` : '<div style="margin-top:12px; font-style:italic; font-size:12px;"><strong>Ghi chú:</strong></div>'}`;

        // Show modal
        const modal = document.getElementById('payslipModal');
        document.getElementById('payslipTitle').textContent = `Phiếu lương - ${empName}`;
        document.getElementById('payslipContent').innerHTML = content;
        modal.style.display = '';

        // Print button
        document.getElementById('payslipPrintBtn').onclick = function () {
            const printWin = window.open('', '_blank');
            printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Phiếu lương - ${empName}</title>
<style>@page{size:A4;margin:15mm 20mm}body{font-family:'Times New Roman',serif;font-size:13px;color:#000;max-width:700px;margin:0 auto;padding:20px}table{border-collapse:collapse}@media print{body{padding:0}}</style>
</head><body>${content}</body></html>`);
            printWin.document.close();
            printWin.onload = function () { printWin.print(); };
        };
    }

    /** Modal: Chi tiết chấm công tháng */
    function showAttendanceDetailModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const modal = document.getElementById('attendanceDetailModal');
        if (!modal) return;

        const empName = emp.name || `User ${empId}`;
        const empRate = emp.dailyRate || SALARY.DAILY_RATE;
        const empSched = { workStart: emp.workStart, workEnd: emp.workEnd };
        const y = currentMonth.year;
        const m = currentMonth.month;
        const lastDay = new Date(y, m, 0).getDate();
        const firstDow = new Date(y, m - 1, 1).getDay(); // 0=CN, 1=T2...
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
            'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

        document.getElementById('adTitle').textContent = `Chi tiết chấm công - ${empName}`;
        document.getElementById('adSubtitle').textContent = `${monthNames[m]} ${y}`;

        // Process each day
        let totalWorked = 0, totalLate = 0, totalOT = 0, lateCount = 0, absentCount = 0, incompleteCount = 0;
        const dayData = [];

        for (let d = 1; d <= lastDay; d++) {
            const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayRecs = monthRecords.filter(r => String(r.deviceUserId) === String(empId) && r.dateKey === dateKey);
            const cellData = processDayRecords(dayRecs);
            const sal = calculateDaySalary(cellData, empRate, isFullDay(empId, dateKey), empSched);
            const dow = new Date(y, m - 1, d).getDay();

            let statusClass = 'absent';
            let statusText = '';
            let timeText = '';

            if (cellData.status === 'absent') {
                absentCount++;
                statusText = 'Nghỉ';
            } else if (cellData.status === 'incomplete') {
                incompleteCount++;
                statusClass = 'incomplete';
                statusText = 'Thiếu';
                if (cellData.checkIn) {
                    timeText = `${cellData.checkIn.getHours()}:${String(cellData.checkIn.getMinutes()).padStart(2, '0')}`;
                }
            } else {
                totalWorked++;
                if (sal.lateMinutes > 0) {
                    lateCount++;
                    statusClass = 'late';
                    statusText = `Muộn ${sal.lateMinutes}p`;
                } else {
                    statusClass = 'ontime';
                    statusText = 'Đúng giờ';
                }

                if (cellData.checkIn && cellData.checkOut) {
                    const inH = cellData.checkIn.getHours();
                    const inM = String(cellData.checkIn.getMinutes()).padStart(2, '0');
                    const outH = cellData.checkOut.getHours();
                    const outM = String(cellData.checkOut.getMinutes()).padStart(2, '0');
                    timeText = `${inH}:${inM} - ${outH}:${outM}`;
                }

                totalLate += sal.lateDeduction;
                totalOT += sal.otPay;
            }

            dayData.push({ day: d, dateKey, dow, statusClass, statusText, timeText, sal, cellData });
        }

        // Build grid
        let html = '';

        // Summary
        html += `<div class="ad-summary">
            <div class="ad-summary-item"><strong>${totalWorked}</strong> ngày công</div>
            <div class="ad-summary-item"><strong>${lateCount}</strong> lần muộn</div>
            <div class="ad-summary-item"><strong>${incompleteCount}</strong> thiếu</div>
            <div class="ad-summary-item"><strong>${absentCount}</strong> nghỉ</div>
            ${totalLate > 0 ? `<div class="ad-summary-item">Trừ muộn: <strong style="color:#ef4444;">-${formatVND(totalLate)}</strong></div>` : ''}
            ${totalOT > 0 ? `<div class="ad-summary-item">OT: <strong style="color:#1890ff;">+${formatVND(totalOT)}</strong></div>` : ''}
        </div>`;

        // Calendar grid header
        html += '<div class="ad-grid">';
        const dayHeaders = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        dayHeaders.forEach((dh, i) => {
            html += `<div class="ad-grid-header${i === 0 ? ' weekend' : ''}">${dh}</div>`;
        });

        // Empty cells before first day
        for (let i = 0; i < firstDow; i++) {
            html += '<div class="ad-day empty"></div>';
        }

        // Day cells
        dayData.forEach(dd => {
            const isToday = dd.dateKey === todayKey;
            const isWeekend = dd.dow === 0 || dd.dow === 6;
            let cls = 'ad-day';
            if (isToday) cls += ' today';
            if (isWeekend) cls += ' weekend';

            html += `<div class="${cls}" data-datekey="${dd.dateKey}">
                <div class="ad-day-num">${dd.day}</div>
                <div><span class="ad-dot ad-dot--${dd.statusClass}"></span>
                    <span class="ad-day-status">${dd.statusText}</span>
                </div>
                ${dd.timeText ? `<div class="ad-day-time">${dd.timeText}</div>` : ''}
            </div>`;
        });

        html += '</div>';

        document.getElementById('adContent').innerHTML = html;
        modal.style.display = 'flex';

        // Click on day cell → open edit modal
        document.querySelectorAll('#adContent .ad-day:not(.empty)').forEach(el => {
            el.addEventListener('click', () => {
                const dateKey = el.getAttribute('data-datekey');
                if (dateKey) {
                    showDetail(empId, dateKey);
                }
            });
        });
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

        // "Tuần này / Tháng này" button
        const btnSchedNow = document.getElementById('btnSchedNow');
        if (btnSchedNow) {
            btnSchedNow.addEventListener('click', () => {
                if (viewPeriod === 'month') {
                    const now = new Date();
                    currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
                    loadMonthData();
                } else {
                    currentWeekStart = getMonday(new Date());
                    loadWeekData();
                }
            });
        }

        // Period select (Theo tuần / Theo tháng)
        const periodSelect = document.getElementById('schedPeriodSelect');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                viewPeriod = e.target.value;
                if (viewPeriod === 'month') {
                    btnSchedNow.textContent = 'Tháng này';
                    if (!currentMonth) {
                        const now = new Date();
                        currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
                    }
                    loadMonthData();
                } else {
                    btnSchedNow.textContent = 'Tuần này';
                    loadWeekData();
                }
            });
        }

        // Reload button
        const btnReload = document.getElementById('btnSchedReload');
        if (btnReload) {
            btnReload.addEventListener('click', () => {
                loadEmployees().then(() => {
                    if (viewPeriod === 'month') loadMonthData();
                    else loadWeekData();
                });
            });
        }

        // Settings button
        const btnSettings = document.getElementById('btnPayrollSettings');
        if (btnSettings) {
            btnSettings.addEventListener('click', () => showPayrollSettingsModal());
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

        // Sync buttons
        const moreBtn = document.querySelector('#viewTimesheet .ts-header-right .ts-btn:last-child');
        if (moreBtn) {
            moreBtn.title = 'Đồng bộ ngay';
            moreBtn.addEventListener('click', () => sendSyncCommand());
        }
        const btnSchedSync = document.getElementById('btnSchedSync');
        if (btnSchedSync) {
            btnSchedSync.addEventListener('click', () => sendSyncCommand());
        }
    }

    function changeWeek(delta) {
        if (viewPeriod === 'month') {
            let m = currentMonth.month + delta;
            let y = currentMonth.year;
            if (m > 12) { m = 1; y++; }
            if (m < 1) { m = 12; y--; }
            currentMonth = { year: y, month: m };
            loadMonthData();
        } else {
            currentWeekStart.setDate(currentWeekStart.getDate() + (7 * delta));
            loadWeekData();
        }
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
            tbody.querySelectorAll('tr[data-emp-id]').forEach(row => {
                // Tìm tên NV trong cột thứ 2 (payroll) hoặc cột fixed (timesheet)
                const nameCell = row.querySelector('.ts-col-fixed div') || row.querySelector('.payroll-emp-name') || row.querySelector('td:nth-child(2)');
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
            await apiPost('/commands', { action: 'sync_now', created_by: 'web_admin' });
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
            await apiPost('/commands', {
                action: 'add_user',
                employee_name: name,
                device_user_id: String(deviceUserId),
                created_by: 'web_admin',
            });
            showNotification(`Đang thêm "${name}" vào máy chấm công...`, 'info');
        } catch (err) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    }

    /** Yêu cầu đăng ký vân tay */
    async function enrollFingerprint(name, deviceUserId) {
        try {
            await apiPost('/commands', {
                action: 'enroll_fingerprint',
                employee_name: name,
                device_user_id: String(deviceUserId),
                created_by: 'web_admin',
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
        const empCode = emp ? (emp.empCode || `NV${String(emp.userId || emp.uid || emp.id).padStart(6, '0')}`) : '';

        // Tìm records cho ngày này (ưu tiên monthRecords, fallback weekRecords)
        const allRecords = monthRecords.length > 0 ? monthRecords : weekRecords;
        const rawDayRecords = allRecords.filter(r =>
            String(r.deviceUserId) === String(empId) && r.dateKey === dateKey
        );
        const dayRecords = rawDayRecords
            .map(r => ({
                ...r,
                time: r.checkTime ? (r.checkTime.toDate ? r.checkTime.toDate() : new Date(r.checkTime)) : null
            }))
            .filter(r => r.time)
            .sort((a, b) => a.time - b.time);

        // Calculate salary & status
        const cellData = processDayRecords(rawDayRecords);
        const empRate = emp ? (emp.dailyRate || SALARY.DAILY_RATE) : SALARY.DAILY_RATE;
        const startHour = (emp && emp.workStart != null) ? emp.workStart : SALARY.WORK_START_HOUR;
        const endHour = (emp && emp.workEnd != null) ? emp.workEnd : SALARY.OT_START_HOUR;
        const empSched = emp ? { workStart: emp.workStart, workEnd: emp.workEnd } : {};
        const fdOverride = isFullDay(String(empId), dateKey);
        const salary = calculateDaySalary(cellData, empRate, fdOverride, empSched);

        // Determine status badge
        const badge = modal.querySelector('#detailStatusBadge');
        let badgeText = '';
        let badgeCls = '';
        if (cellData.status === 'absent') {
            badgeText = 'Nghỉ';
            badgeCls = 'badge-absent';
        } else if (cellData.status === 'incomplete') {
            badgeText = 'Chấm công thiếu';
            badgeCls = 'badge-incomplete';
        } else if (salary.lateMinutes > 0 || (cellData.checkOut && cellData.checkOut.getHours() < endHour)) {
            const parts = [];
            if (salary.lateMinutes > 0) parts.push('Đi muộn');
            if (cellData.checkOut) {
                const earlyRef = new Date(cellData.checkOut);
                earlyRef.setHours(endHour, 0, 0, 0);
                if (cellData.checkOut < earlyRef) parts.push('Về sớm');
            }
            badgeText = parts.join(' / ') || 'Đúng giờ';
            badgeCls = parts.length > 0 ? '' : 'badge-ontime';
        } else {
            badgeText = 'Đúng giờ';
            badgeCls = 'badge-ontime';
        }

        // Header
        const nameEl = modal.querySelector('#detailEmpName');
        const codeEl = modal.querySelector('#detailEmpCode');
        if (nameEl) nameEl.textContent = empName;
        if (codeEl) codeEl.textContent = empCode;
        if (badge) {
            badge.textContent = badgeText;
            badge.className = 'att-status-badge';
            if (badgeCls) badge.classList.add(badgeCls);
            badge.style.display = badgeText ? '' : 'none';
        }

        // Date & shift info
        const dateParts = dateKey.split('-').map(Number);
        const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const dayName = DAY_NAMES[dateObj.getDay()];
        const dateText = `${dayName}, ${String(dateParts[2]).padStart(2, '0')}/${String(dateParts[1]).padStart(2, '0')}/${dateParts[0]}`;
        const dateEl = modal.querySelector('#detailDateText');
        if (dateEl) dateEl.textContent = dateText;

        const shiftName = emp && emp.shiftName ? emp.shiftName : 'CA BÌNH THƯỜNG';
        const shiftText = `${shiftName} (${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00)`;
        const shiftEl = modal.querySelector('#detailShiftText');
        if (shiftEl) shiftEl.textContent = shiftText;

        // Notes
        const noteArea = modal.querySelector('#detailNote');
        if (noteArea) noteArea.value = '';

        // Tabs setup
        const tabs = modal.querySelectorAll('.att-tab');
        const tabContents = modal.querySelectorAll('.att-tab-content');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(tc => { tc.classList.remove('active'); tc.style.display = 'none'; });
                tab.classList.add('active');
                const tabId = tab.getAttribute('data-atttab');
                const target = modal.querySelector(`#attTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
                if (target) { target.classList.add('active'); target.style.display = 'block'; }
            };
        });
        // Reset to first tab
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => { tc.classList.remove('active'); tc.style.display = 'none'; });
        if (tabs[0]) tabs[0].classList.add('active');
        if (tabContents[0]) { tabContents[0].classList.add('active'); tabContents[0].style.display = 'block'; }

        // Attendance type radio
        const radios = modal.querySelectorAll('input[name="attType"]');
        radios.forEach(r => { r.checked = r.value === 'working'; });
        if (cellData.status === 'absent') {
            const unpaid = modal.querySelector('input[name="attType"][value="unpaid_leave"]');
            if (unpaid) unpaid.checked = true;
        }

        // Check-in / check-out
        const checkInInput = document.getElementById('detailCheckIn');
        const checkOutInput = document.getElementById('detailCheckOut');
        const checkInEnabled = document.getElementById('attCheckInEnabled');
        const checkOutEnabled = document.getElementById('attCheckOutEnabled');

        const hasCheckIn = dayRecords.length > 0;
        const hasCheckOut = dayRecords.length > 1;
        if (checkInInput) checkInInput.value = hasCheckIn ? formatTime(dayRecords[0].time) : '';
        if (checkOutInput) checkOutInput.value = hasCheckOut ? formatTime(dayRecords[dayRecords.length - 1].time) : '';
        if (checkInEnabled) checkInEnabled.checked = hasCheckIn;
        if (checkOutEnabled) checkOutEnabled.checked = hasCheckOut;

        // Auto-fill giờ mặc định + auto-switch sang "Đi làm" khi tick checkbox
        function autoSwitchToWorking() {
            const workingRadio = modal.querySelector('input[name="attType"][value="working"]');
            if (workingRadio) workingRadio.checked = true;
        }
        if (checkInEnabled) {
            checkInEnabled.onchange = () => {
                if (checkInEnabled.checked) {
                    if (checkInInput && !checkInInput.value) {
                        checkInInput.value = `${String(startHour).padStart(2, '0')}:00`;
                    }
                    autoSwitchToWorking();
                }
            };
        }
        if (checkOutEnabled) {
            checkOutEnabled.onchange = () => {
                if (checkOutEnabled.checked) {
                    if (checkOutInput && !checkOutInput.value) {
                        checkOutInput.value = `${String(endHour).padStart(2, '0')}:00`;
                    }
                    autoSwitchToWorking();
                }
            };
        }

        // Overtime (Làm thêm) - time before shift start
        const otEnabled = document.getElementById('attOtEnabled');
        const otHours = document.getElementById('attOtHours');
        const otMinutes = document.getElementById('attOtMinutes');
        let otTotalMin = 0;
        if (cellData.checkIn) {
            const shiftStart = new Date(cellData.checkIn);
            shiftStart.setHours(startHour, 0, 0, 0);
            if (cellData.checkIn < shiftStart) {
                otTotalMin = Math.floor((shiftStart - cellData.checkIn) / (1000 * 60));
            }
        }
        // Also add OT after shift end
        if (salary.otMinutes > 0) {
            otTotalMin += salary.otMinutes;
        }
        if (otEnabled) otEnabled.checked = otTotalMin > 0;
        if (otHours) otHours.value = Math.floor(otTotalMin / 60);
        if (otMinutes) otMinutes.value = otTotalMin % 60;

        // Early leave (Về sớm) - shift end - checkout
        const earlyEnabled = document.getElementById('attEarlyEnabled');
        const earlyHours = document.getElementById('attEarlyHours');
        const earlyMinutes = document.getElementById('attEarlyMinutes');
        let earlyTotalMin = 0;
        if (cellData.checkOut) {
            const shiftEnd = new Date(cellData.checkOut);
            shiftEnd.setHours(endHour, 0, 0, 0);
            if (cellData.checkOut < shiftEnd) {
                earlyTotalMin = Math.floor((shiftEnd - cellData.checkOut) / (1000 * 60));
            }
        }
        if (earlyEnabled) earlyEnabled.checked = earlyTotalMin > 0;
        if (earlyHours) earlyHours.value = Math.floor(earlyTotalMin / 60);
        if (earlyMinutes) earlyMinutes.value = earlyTotalMin % 60;

        // Lịch sử chấm công tab
        const historyEl = document.getElementById('attHistoryContent');
        if (historyEl) {
            if (dayRecords.length > 0) {
                historyEl.innerHTML = dayRecords.map((r, i) =>
                    `<div style="padding:6px 0; border-bottom:1px solid #f5f5f5; display:flex; justify-content:space-between;">
                        <span>Lần ${i + 1}: ${formatTime(r.time)}</span>
                        <span style="color:#8c8c8c;">${r.type === 1 ? 'Ra' : 'Vào'}${r.source === 'manual_edit' ? ' (sửa tay)' : ''}</span>
                    </div>`
                ).join('');
            } else {
                historyEl.innerHTML = '<div style="color:#8c8c8c;">Không có bản ghi chấm công</div>';
            }
        }

        modal.style.display = 'flex';
        refreshIcons();

        // Close button
        const closeBtn = document.getElementById('attModalCloseBtn');
        if (closeBtn) {
            closeBtn.onclick = () => { modal.style.display = 'none'; };
        }

        // Skip button (Bỏ qua = close)
        const skipBtn = document.getElementById('btnSkipAttendance');
        if (skipBtn) {
            skipBtn.onclick = () => { modal.style.display = 'none'; };
        }

        // Overlay close
        const overlay = modal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.onclick = () => { modal.style.display = 'none'; };
        }

        // Save button (Lưu)
        const updateBtn = document.getElementById('btnUpdateAttendance');
        if (updateBtn) {
            updateBtn.onclick = async () => {
                const attType = modal.querySelector('input[name="attType"]:checked');
                const type = attType ? attType.value : 'working';

                // Nghỉ có phép / không phép → xóa records cũ
                if (type !== 'working') {
                    try {
                        const existing = allRecords.filter(r =>
                            String(r.deviceUserId) === String(empId) && r.dateKey === dateKey
                        );
                        for (const rec of existing) {
                            if (!String(rec.id).startsWith('test_')) {
                                await apiDelete('/records/' + rec.id);
                            }
                        }
                        // Remove from both arrays
                        weekRecords = weekRecords.filter(r =>
                            !(String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
                        );
                        monthRecords = monthRecords.filter(r =>
                            !(String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
                        );
                        modal.style.display = 'none';
                        renderTimesheet();
                        renderSchedule();
                        if (document.getElementById('attendanceDetailModal')?.style.display !== 'none') {
                            showAttendanceDetailModal(empId);
                        }
                        showNotification(`Đã lưu: ${type === 'paid_leave' ? 'Nghỉ có phép' : 'Nghỉ không phép'}`, 'success');
                    } catch (err) {
                        showNotification('Lỗi: ' + err.message, 'error');
                    }
                    return;
                }

                // Đi làm → save check-in/out
                const newIn = checkInInput ? checkInInput.value.trim() : '';
                const newOut = checkOutInput ? checkOutInput.value.trim() : '';
                const inOn = checkInEnabled ? checkInEnabled.checked : true;
                const outOn = checkOutEnabled ? checkOutEnabled.checked : true;

                if (inOn && !newIn) {
                    showNotification('Vui lòng nhập giờ vào', 'error');
                    return;
                }

                try {
                    const dp = dateKey.split('-').map(Number);

                    // Xóa records cũ
                    const existing = allRecords.filter(r =>
                        String(r.deviceUserId) === String(empId) && r.dateKey === dateKey
                    );
                    for (const rec of existing) {
                        if (!String(rec.id).startsWith('test_')) {
                            await apiDelete('/records/' + rec.id);
                        }
                    }
                    weekRecords = weekRecords.filter(r =>
                        !(String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
                    );
                    monthRecords = monthRecords.filter(r =>
                        !(String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
                    );

                    // Tạo record check-in mới
                    if (inOn && newIn) {
                        const [inH, inM] = newIn.split(':').map(Number);
                        const checkInDate = new Date(dp[0], dp[1] - 1, dp[2], inH, inM, 0, 0);
                        const inResult = await apiPost('/records', {
                            device_user_id: String(empId),
                            date_key: dateKey,
                            check_time: checkInDate.toISOString(),
                            type: 0,
                            source: 'manual_edit'
                        });
                        const rec = { id: inResult.id, deviceUserId: String(empId), dateKey, checkTime: checkInDate, type: 0, source: 'manual_edit' };
                        weekRecords.push(rec);
                        monthRecords.push(rec);
                    }

                    // Tạo record check-out mới
                    if (outOn && newOut) {
                        const [outH, outM] = newOut.split(':').map(Number);
                        const checkOutDate = new Date(dp[0], dp[1] - 1, dp[2], outH, outM, 0, 0);
                        const outResult = await apiPost('/records', {
                            device_user_id: String(empId),
                            date_key: dateKey,
                            check_time: checkOutDate.toISOString(),
                            type: 1,
                            source: 'manual_edit'
                        });
                        const rec = { id: outResult.id, deviceUserId: String(empId), dateKey, checkTime: checkOutDate, type: 1, source: 'manual_edit' };
                        weekRecords.push(rec);
                        monthRecords.push(rec);
                    }

                    modal.style.display = 'none';
                    renderTimesheet();
                    renderSchedule();
                    // Re-render detail modal nếu đang mở
                    if (document.getElementById('attendanceDetailModal')?.style.display !== 'none') {
                        showAttendanceDetailModal(empId);
                    }
                    showNotification('Đã cập nhật chấm công', 'success');
                } catch (err) {
                    console.error('[Attendance] Lỗi cập nhật:', err);
                    showNotification('Lỗi: ' + err.message, 'error');
                }
            };
        }

        // Delete button (Hủy)
        const deleteBtn = document.getElementById('btnDeleteAttendance');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (!confirm(`Xóa chấm công ${empName} ngày ${dateKey}?`)) return;

                try {
                    const existing = allRecords.filter(r =>
                        String(r.deviceUserId) === String(empId) && r.dateKey === dateKey
                    );
                    for (const rec of existing) {
                        if (!String(rec.id).startsWith('test_')) {
                            await apiDelete('/records/' + rec.id);
                        }
                    }
                    weekRecords = weekRecords.filter(r =>
                        !(String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
                    );
                    monthRecords = monthRecords.filter(r =>
                        !(String(r.deviceUserId) === String(empId) && r.dateKey === dateKey)
                    );

                    modal.style.display = 'none';
                    renderTimesheet();
                    renderSchedule();
                    if (document.getElementById('attendanceDetailModal')?.style.display !== 'none') {
                        showAttendanceDetailModal(empId);
                    }
                    showNotification('Đã xóa chấm công', 'success');
                } catch (err) {
                    console.error('[Attendance] Lỗi xóa:', err);
                    showNotification('Lỗi: ' + err.message, 'error');
                }
            };
        }
    }

    // ================================================================
    // SALARY EDIT MODAL
    // ================================================================

    function showSalaryModal(empId) {
        const emp = employees.find(e => String(e.userId || e.uid || e.id) === String(empId));
        if (!emp) return;

        const currentRate = emp.dailyRate || SALARY.DAILY_RATE;
        const modal = document.getElementById('salaryModal');
        if (!modal) return;

        const nameEl = modal.querySelector('#salaryEmpName');
        const input = modal.querySelector('#salaryRateInput');
        const saveBtn = modal.querySelector('#btnSaveSalary');
        const closeBtn = modal.querySelector('.btn-icon');

        if (nameEl) nameEl.textContent = emp.name || `User ${empId}`;
        if (input) input.value = currentRate;

        modal.style.display = 'flex';

        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };

        if (saveBtn) {
            saveBtn.onclick = async () => {
                const newRate = parseInt(input.value);
                if (isNaN(newRate) || newRate <= 0) {
                    showNotification('Vui lòng nhập lương hợp lệ', 'error');
                    return;
                }

                try {
                    const docId = String(emp.id || emp.userId);
                    // Test employees (in-memory only) → skip API
                    if (!docId.startsWith('test_')) {
                        await apiPatch('/device-users/' + docId, { daily_rate: newRate });
                    }
                    emp.dailyRate = newRate;
                    modal.style.display = 'none';
                    showNotification(`Đã cập nhật lương ${emp.name}: ${formatVND(newRate)}đ/ngày`, 'success');
                    renderTimesheet();
                    renderSchedule();
                } catch (err) {
                    console.error('[Attendance] Lỗi lưu lương:', err);
                    showNotification('Lỗi: ' + err.message, 'error');
                }
            };
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
    // TEST DATA - Tạo nhân viên ảo để test lương (không lưu, F5 mất)
    // ================================================================

    let testEmployees = [];
    let testRecords = [];

    function showTestModal() {
        // Xoá modal cũ nếu có
        let modal = document.getElementById('testDataModal');
        if (modal) modal.remove();

        const dates = getWeekDates();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        modal = document.createElement('div');
        modal.id = 'testDataModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4);';
        modal.innerHTML = `
            <div style="background:#fff; border-radius:12px; padding:24px; width:520px; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:16px; color:#1e293b;">Tạo nhân viên test</h3>
                    <button onclick="document.getElementById('testDataModal').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:#8c8c8c;">✕</button>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="font-size:13px; font-weight:500; color:#475569;">Tên nhân viên</label>
                    <input id="testEmpName" type="text" value="NV Test" style="width:100%; padding:8px 12px; border:1px solid #d9d9d9; border-radius:6px; margin-top:4px; font-size:14px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:16px; font-size:13px; font-weight:500; color:#475569;">Giờ vào - ra cho từng ngày:</div>
                <div id="testDayRows" style="display:flex; flex-direction:column; gap:8px;">
                    ${dates.map((d, i) => {
                        const dayName = DAY_NAMES[d.getDay()];
                        const dayNum = d.getDate();
                        const isPast = d <= today;
                        return `
                            <div style="display:flex; align-items:center; gap:8px; padding:8px; background:${isPast ? '#fafafa' : '#f8f8f8'}; border-radius:6px; opacity:${isPast ? 1 : 0.5};">
                                <label style="width:90px; font-size:12px; font-weight:500; color:#475569; flex-shrink:0;">${dayName} ${dayNum}</label>
                                <input type="checkbox" id="testDay${i}" ${isPast && d.getDay() !== 0 ? 'checked' : ''} style="margin:0;">
                                <input type="text" id="testIn${i}" value="07:55" placeholder="HH:MM" maxlength="5" style="width:60px; padding:4px 8px; border:1px solid #d9d9d9; border-radius:4px; font-size:13px; text-align:center;">
                                <span style="color:#8c8c8c;">→</span>
                                <input type="text" id="testOut${i}" value="19:50" placeholder="HH:MM" maxlength="5" style="width:60px; padding:4px 8px; border:1px solid #d9d9d9; border-radius:4px; font-size:13px; text-align:center;">
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="display:flex; gap:8px; margin-top:20px;">
                    <button id="btnAddTest" style="flex:1; padding:10px; background:#1890ff; color:#fff; border:none; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer;">Thêm nhân viên test</button>
                    <button id="btnClearTest" style="padding:10px 16px; background:#fff; color:#ff4d4f; border:1px solid #ff4d4f; border-radius:6px; font-size:14px; cursor:pointer;">Xoá test</button>
                </div>
                <div style="margin-top:12px; font-size:11px; color:#8c8c8c; text-align:center;">Dữ liệu test chỉ tồn tại trong phiên này, F5 sẽ mất</div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Add test employee
        document.getElementById('btnAddTest').addEventListener('click', () => {
            const name = document.getElementById('testEmpName').value.trim() || 'NV Test';
            const testId = 'test_' + Date.now();

            // Thêm employee ảo
            testEmployees.push({ id: testId, userId: testId, name, isTest: true });

            // Thêm records ảo cho từng ngày được chọn
            for (let i = 0; i < 7; i++) {
                const cb = document.getElementById(`testDay${i}`);
                if (!cb || !cb.checked) continue;

                const inVal = document.getElementById(`testIn${i}`).value;
                const outVal = document.getElementById(`testOut${i}`).value;
                if (!inVal) continue;

                const date = dates[i];
                const dateKey = toDateKey(date);

                // Check-in record
                const [inH, inM] = inVal.split(':').map(Number);
                const checkInTime = new Date(date);
                checkInTime.setHours(inH, inM, 0, 0);
                testRecords.push({
                    id: `test_rec_${testId}_${i}_in`,
                    deviceUserId: testId,
                    dateKey,
                    checkTime: checkInTime,
                    type: 0
                });

                // Check-out record
                if (outVal) {
                    const [outH, outM] = outVal.split(':').map(Number);
                    const checkOutTime = new Date(date);
                    checkOutTime.setHours(outH, outM, 0, 0);
                    testRecords.push({
                        id: `test_rec_${testId}_${i}_out`,
                        deviceUserId: testId,
                        dateKey,
                        checkTime: checkOutTime,
                        type: 1
                    });
                }
            }

            // Merge vào data hiện tại và re-render
            mergeTestData();
            modal.remove();
            showNotification(`Đã thêm nhân viên test "${name}"`, 'success');
        });

        // Clear all test data
        document.getElementById('btnClearTest').addEventListener('click', () => {
            clearTestData();
            modal.remove();
            showNotification('Đã xoá tất cả dữ liệu test', 'info');
        });
    }

    function mergeTestData() {
        // Gộp test employees vào employees (loại bỏ duplicates)
        employees = employees.filter(e => !e.isTest);
        employees.push(...testEmployees);
        employees.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

        // Gộp test records vào weekRecords
        weekRecords = weekRecords.filter(r => !String(r.id).startsWith('test_rec_'));
        weekRecords.push(...testRecords);

        renderTimesheet();
        renderSchedule();
    }

    function clearTestData() {
        testEmployees = [];
        testRecords = [];
        employees = employees.filter(e => !e.isTest);
        weekRecords = weekRecords.filter(r => !String(r.id).startsWith('test_rec_'));
        renderTimesheet();
        renderSchedule();
    }

    // Inject test button vào header
    function injectTestButton() {
        // Inject vào cả 2 view
        ['#viewTimesheet .ts-header-right', '#viewSchedule .ts-header-right'].forEach(sel => {
            const headerRight = document.querySelector(sel);
            if (!headerRight) return;

            const btn = document.createElement('button');
            btn.className = 'ts-btn';
            btn.style.cssText = 'background:#fff7e6; color:#d46b08; border:1px solid #ffd591;';
            btn.innerHTML = '<i data-lucide="user-plus" style="width:14px; height:14px;"></i> Test';
            btn.title = 'Tạo nhân viên ảo để test lương';
            btn.addEventListener('click', showTestModal);

            // Chèn trước nút reload/more
            const lastBtn = headerRight.querySelector('.ts-btn:last-child');
            headerRight.insertBefore(btn, lastBtn);
        });
        refreshIcons();
    }

    // ================================================================
    // PUBLIC API
    // ================================================================
    window._attendance = {
        init,
        showDetail,
        showSalaryModal,
        addDeviceUser,
        enrollFingerprint,
        sendSync: sendSyncCommand,
        reload: () => loadEmployees().then(() => loadMonthData()),
        showTestModal,
        hideEmployee,
        unhideEmployee,
        toggleHidden,
        toggleFullDay,
        showMonthlyDetail,
        showAllowanceModal,
        saveAllowance,
        // Payroll modals
        showPayrollSettingsModal,
        showLuongChinhModal,
        showLamThemModal,
        showPhuCapModal,
        showThuongModal,
        showGiamTruModal,
        showDaTraModal,
        showAttendanceDetailModal,
        printPayslip,
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
