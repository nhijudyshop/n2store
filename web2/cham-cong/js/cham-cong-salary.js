// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Chấm công: tính lương (pure).
// =====================================================================
// Logic tính giờ công / đi muộn / OT / lương — PURE, không đụng DOM/network.
// Cấu hình theo từng NV: daily_rate, work_start, work_end (mốc kết ca = mốc OT),
// late_penalty_per_min, ot_multiplier. Múi giờ: mọi mốc giờ tính theo GMT+7.
// =====================================================================

(function (global) {
    'use strict';

    const VN_TZ = 'Asia/Ho_Chi_Minh';

    // 'HH:MM' → phút trong ngày.
    function hmToMinutes(hm) {
        const m = String(hm || '08:00').match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return 8 * 60;
        return Number(m[1]) * 60 + Number(m[2]);
    }

    // Dựng 1 Date là mốc 'HH:MM' (GMT+7) của ngày dateKey 'YYYY-MM-DD'.
    function vnMoment(dateKey, hm) {
        const mins = hmToMinutes(hm);
        const hh = String(Math.floor(mins / 60)).padStart(2, '0');
        const mm = String(mins % 60).padStart(2, '0');
        return new Date(`${dateKey}T${hh}:${mm}:00+07:00`);
    }

    // Gom punch 1 ngày 1 NV → checkIn/checkOut/workedMinutes/status.
    function processDay(records) {
        if (!records || !records.length) return { status: 'absent', count: 0 };
        const sorted = records
            .map((r) => new Date(r.check_time))
            .filter((d) => !isNaN(d.getTime()))
            .sort((a, b) => a - b);
        if (!sorted.length) return { status: 'absent', count: 0 };
        const checkIn = sorted[0];
        const checkOut = sorted[sorted.length - 1];
        const workedMinutes = Math.max(0, Math.round((checkOut - checkIn) / 60000));
        return {
            checkIn,
            checkOut,
            workedMinutes,
            count: sorted.length,
            status: sorted.length < 2 ? 'incomplete' : 'present',
        };
    }

    // Tính lương 1 ngày. cfg = { dailyRate, workStart, workEnd, latePenaltyPerMin, otMultiplier }.
    // forceFullDay = ngày công đủ override / shop nghỉ có lương.
    function calcDay(dateKey, dayData, cfg, forceFullDay) {
        const dailyRate = Number(cfg.dailyRate) || 0;
        const startMin = hmToMinutes(cfg.workStart || '08:00');
        const endMin = hmToMinutes(cfg.workEnd || '20:00');
        const standardHours = Math.max(0.5, (endMin - startMin) / 60);
        const hourlyRate = dailyRate / standardHours;
        const latePer = Number(cfg.latePenaltyPerMin) || 0;
        // Hệ số OT: finite-check (KHÔNG `|| 1`) để cho phép cấu hình 0 = không trả OT.
        const otMult = Number.isFinite(Number(cfg.otMultiplier)) ? Number(cfg.otMultiplier) : 1;

        const out = {
            baseSalary: 0,
            lateMinutes: 0,
            lateDeduction: 0,
            earlyMinutes: 0,
            otMinutes: 0,
            otPay: 0,
            worked: false,
        };

        if (forceFullDay) {
            out.baseSalary = dailyRate;
            out.worked = true;
            return out;
        }
        if (!dayData || dayData.status === 'absent' || !dayData.checkIn) return out;
        // Punch THIẾU (chỉ 1 lượt — quên bấm vào/ra): KHÔNG tính tiền (vài phút vô nghĩa).
        // Trạng thái vẫn 'missing' (chấm thiếu) để admin chỉnh tay hoặc đánh nghỉ có phép.
        if (dayData.status === 'incomplete') {
            out.incomplete = true;
            return out;
        }

        const startMoment = vnMoment(dateKey, cfg.workStart || '08:00');
        const endMoment = vnMoment(dateKey, cfg.workEnd || '20:00');
        // Dung sai ±phút (cfg.graceMinutes, mặc định 5): vào trễ / về sớm trong khoảng
        // này coi như ĐÚNG GIỜ (vd ca 08:00 vào 08:05 không tính muộn; ca 20:00 ra 19:55
        // không tính về sớm). Áp đối xứng cho cả vào lẫn ra.
        const grace = Number.isFinite(Number(cfg.graceMinutes)) ? Number(cfg.graceMinutes) : 6;
        const graceMs = Math.max(0, grace) * 60000;
        let checkIn = dayData.checkIn;
        let checkOut = dayData.checkOut || dayData.checkIn;

        // Dung sai VÀO (2026-06-26: SMOOTH, KHÔNG cliff): THA tối đa `grace` phút đi muộn.
        // Vào ≤ grace → 0 muộn; vào grace+k → đúng k phút muộn. Trước đây vượt grace bị
        // phạt TỪ phút 0 (08:06=0' nhưng 08:07=7' — nhảy bậc vô lý). Giờ kéo checkIn về
        // tối đa `grace` phút → muộn = max(0, thực_muộn − grace), liên tục.
        if (checkIn > startMoment) {
            const forgiven = Math.min(graceMs, checkIn - startMoment);
            checkIn = new Date(checkIn.getTime() - forgiven);
        }

        // Đi muộn: phần còn vượt mốc bắt đầu sau khi đã tha dung sai.
        if (checkIn > startMoment) {
            out.lateMinutes = Math.floor((checkIn - startMoment) / 60000);
            out.lateDeduction = out.lateMinutes * latePer;
        }

        // Dung sai RA (đối xứng): THA tối đa `grace` phút về sớm → về sớm = max(0, thực − grace).
        if (checkOut < endMoment && checkOut >= startMoment) {
            const forgiven = Math.min(graceMs, endMoment - checkOut);
            checkOut = new Date(checkOut.getTime() + forgiven);
        }

        // Lương cơ bản: cửa sổ [max(in,start) .. min(out,end)].
        const workStart = checkIn > startMoment ? checkIn : startMoment;
        const workEnd = checkOut < endMoment ? checkOut : endMoment;
        const baseMinutes = Math.max(0, (workEnd - workStart) / 60000);
        out.baseSalary = Math.round((hourlyRate * baseMinutes) / 60);
        out.worked = baseMinutes > 0;

        // OT: ra sau mốc kết ca. Lương THÁNG (cố định) KHÔNG auto-OT (hourlyRate suy ra
        // từ lương tháng sẽ sai khổng lồ) → otPay=0, muốn thưởng OT thì thêm tay ở "Thưởng".
        if (checkOut > endMoment) {
            out.otMinutes = Math.round((checkOut - endMoment) / 60000);
            out.otPay =
                String(cfg.salaryType) === 'monthly'
                    ? 0
                    : Math.round((out.otMinutes / 60) * hourlyRate * otMult);
        } else if (checkOut < endMoment) {
            // Về sớm: ra trước mốc kết ca (đã loại trừ làm-tròn ≤10').
            out.earlyMinutes = Math.floor((endMoment - checkOut) / 60000);
        }
        return out;
    }

    // Phân loại trạng thái 1 ngày → 'ontime'|'lateearly'|'missing'|'absent'.
    //   dayResult = { ...calcDay(), dayData } ; isFull = công đủ override / shop nghỉ.
    function dayStatus(dayResult, isFull) {
        const dd = (dayResult && dayResult.dayData) || {};
        if (isFull) return 'ontime';
        if (!dd || dd.status === 'absent' || !dd.checkIn) return 'absent';
        if (dd.status === 'incomplete') return 'missing';
        if ((dayResult.lateMinutes || 0) > 0 || (dayResult.earlyMinutes || 0) > 0)
            return 'lateearly';
        return 'ontime';
    }
    const STATUS_LABEL = {
        ontime: 'Đúng giờ',
        lateearly: 'Đi muộn / Về sớm',
        missing: 'Chấm công thiếu',
        absent: 'Nghỉ làm',
    };

    // Danh sách dateKey 'YYYY-MM-DD' trong 1 tháng 'YYYY-MM'.
    function daysOfMonth(monthKey) {
        const [y, m] = monthKey.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        const out = [];
        for (let d = 1; d <= last; d++) {
            out.push(`${monthKey}-${String(d).padStart(2, '0')}`);
        }
        return out;
    }

    function sumItems(items) {
        if (!Array.isArray(items)) return 0;
        return items.reduce((s, it) => s + (Number(it && it.amount) || 0), 0);
    }

    // Tính bảng lương tháng 1 NV.
    //   recordsByDate: { 'YYYY-MM-DD': [records...] }
    //   cfg: cấu hình NV. payroll: dòng web2_attendance_payroll (điều chỉnh thủ công).
    //   fulldaySet: Set('YYYY-MM-DD'). holidaySet: Set('YYYY-MM-DD').
    function calcMonth(monthKey, recordsByDate, cfg, payroll, fulldaySet, holidaySet) {
        const days = daysOfMonth(monthKey);
        let luongChinh = 0;
        let lamThem = 0;
        let lateDeduction = 0;
        let workedDays = 0;
        let otMinutes = 0;
        const lateDays = [];
        const otDays = [];
        const dayResults = {};

        for (const dk of days) {
            const isFull = (fulldaySet && fulldaySet.has(dk)) || (holidaySet && holidaySet.has(dk));
            const dayData = processDay(recordsByDate[dk]);
            const day = calcDay(dk, dayData, cfg, isFull);
            dayResults[dk] = { ...day, dayData };
            if (day.worked) {
                // Số công đếm theo NGÀY (nguyên): đi làm = 1 công. Đi muộn/về sớm bị
                // phạt riêng (lateDeduction) + lương cơ bản tính theo giờ thực — KHÔNG
                // trừ vào "số công" (trước đây cộng phân số → ra 14.8, 20.54 khó hiểu).
                workedDays += 1;
                luongChinh += day.baseSalary;
            }
            if (day.otPay) {
                lamThem += day.otPay;
                otMinutes += day.otMinutes;
                otDays.push({ dateKey: dk, minutes: day.otMinutes, pay: day.otPay });
            }
            if (day.lateDeduction) {
                lateDeduction += day.lateDeduction;
                lateDays.push({ dateKey: dk, minutes: day.lateMinutes, amount: day.lateDeduction });
            }
        }

        // Overrides (nếu admin set).
        const pr = payroll || {};
        // Lương THÁNG (cố định): luongChinh = đúng số tiền nhập (ô "Lương" = lương/tháng),
        // KHÔNG nhân số ngày công. Ngày nghỉ trừ qua "Giảm trừ" thủ công ở Bảng lương.
        // workedDays vẫn đếm để hiển thị. Bỏ qua override công (lương tháng là cố định).
        const isMonthly = String(cfg.salaryType) === 'monthly';
        if (isMonthly) {
            luongChinh = Number(cfg.dailyRate) || 0;
            // Lương THÁNG = cố định → KHÔNG auto trừ phạt muộn theo phút (nhất quán với
            // OT=0 cho monthly). Muốn phạt muộn NV lương tháng → dùng "Giảm trừ thủ công".
            lateDeduction = 0;
            lateDays.length = 0;
        } else if (pr.salary_days_override != null && pr.salary_days_override !== '') {
            workedDays = Math.max(0, Number(pr.salary_days_override) || 0);
            luongChinh = workedDays * (Number(cfg.dailyRate) || 0);
            // Override công = admin CHỐT CỨNG số ngày → bỏ phạt muộn auto của punch ngày
            // thực (muốn phạt thì dùng "Giảm trừ thủ công" / override phạt muộn). OT giữ
            // nguyên (là khoản cộng riêng; admin chỉnh qua override OT nếu cần).
            lateDeduction = 0;
            lateDays.length = 0;
        }
        // OT override CHỈ áp cho lương NGÀY (!isMonthly). Với lương THÁNG, cfg.dailyRate
        // = lương CẢ THÁNG → chia cho giờ-công-1-ngày ra hr khổng lồ → OT sai gấp ~số
        // ngày công/tháng (vd lương 10tr, ca 12h → hr 833k/h, 2h OT ×2 = 3,33tr). Auto-OT
        // đã ép 0 cho monthly (calcDay), override cũng phải bỏ qua; OT tháng cộng tay qua "Thưởng".
        if (!isMonthly && pr.ot_hours_override != null && pr.ot_hours_override !== '') {
            const hr =
                (Number(cfg.dailyRate) || 0) /
                Math.max(
                    0.5,
                    (hmToMinutes(cfg.workEnd || '20:00') - hmToMinutes(cfg.workStart || '08:00')) /
                        60
                );
            const otMultOv = Number.isFinite(Number(cfg.otMultiplier))
                ? Number(cfg.otMultiplier)
                : 1;
            lamThem = Math.round(Number(pr.ot_hours_override) * hr * otMultOv);
        }
        if (pr.giam_tru_late_override != null && pr.giam_tru_late_override !== '') {
            lateDeduction = Number(pr.giam_tru_late_override);
        }

        const phuCap = sumItems(pr.allowances);
        const thuong = sumItems(pr.thuong_items);
        const giamTruManual = sumItems(pr.giam_tru_items);
        const daTra = sumItems(pr.da_tra_items);
        const giamTru = lateDeduction + giamTruManual;
        const tongLuong = luongChinh + lamThem + phuCap + thuong - giamTru;
        const conCanTra = tongLuong - daTra;

        return {
            workedDays: Math.round(workedDays * 100) / 100,
            luongChinh,
            lamThem,
            otMinutes,
            phuCap,
            thuong,
            lateDeduction,
            giamTruManual,
            giamTru,
            daTra,
            tongLuong,
            conCanTra,
            lateDays,
            otDays,
            dayResults,
        };
    }

    function fmtVnd(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function fmtHM(date) {
        if (!date) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: VN_TZ,
            hour12: false,
        }).format(date);
    }

    global.ChamCongSalary = {
        processDay,
        calcDay,
        calcMonth,
        daysOfMonth,
        hmToMinutes,
        dayStatus,
        STATUS_LABEL,
        fmtVnd,
        fmtHM,
        VN_TZ,
    };
})(window);
