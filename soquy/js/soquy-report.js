// =====================================================
// SỔ QUỸ - REPORT MODULE
// File: soquy-report.js
// =====================================================

const SoquyReport = (function () {
    const config = window.SoquyConfig;
    const dbModule = window.SoquyDatabase;

    // =====================================================
    // REPORT STATE
    // =====================================================

    const reportState = {
        reportType: 'overview', // 'overview', 'payment_cn', 'payment_kd'
        fundType: 'all',
        timeFilter: 'this_year',
        customStartDate: null,
        customEndDate: null,
        categoryFilter: '',
        vouchers: [],        // raw fetched vouchers
        filtered: [],        // after filters applied
        isLoading: false
    };

    // =====================================================
    // DATA FETCHING
    // =====================================================

    function getReportDateRange() {
        const now = new Date();
        let startDate, endDate;

        switch (reportState.timeFilter) {
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                break;
            case 'this_quarter': {
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
                break;
            }
            case 'this_year':
                startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            case 'custom':
                startDate = reportState.customStartDate ? new Date(reportState.customStartDate + 'T00:00:00') : null;
                endDate = reportState.customEndDate ? new Date(reportState.customEndDate + 'T23:59:59') : null;
                break;
            default:
                startDate = null;
                endDate = null;
        }

        return { startDate, endDate };
    }

    async function fetchReportData() {
        try {
            reportState.isLoading = true;

            const snapshot = await config.soquyCollectionRef
                .orderBy('voucherDateTime', 'desc')
                .get();

            let vouchers = [];
            snapshot.forEach(doc => {
                vouchers.push({ id: doc.id, ...doc.data() });
            });

            // Normalize legacy 'payment' type
            vouchers = vouchers.map(v => {
                if (v.type === 'payment') {
                    v.type = v.businessAccounting ? 'payment_kd' : 'payment_cn';
                }
                return v;
            });

            // Only paid vouchers for reports
            vouchers = vouchers.filter(v => v.status === config.VOUCHER_STATUS.PAID);

            // Fund type filter
            if (reportState.fundType !== 'all') {
                vouchers = vouchers.filter(v => v.fundType === reportState.fundType);
            }

            // Time filter
            const { startDate, endDate } = getReportDateRange();
            if (startDate && endDate) {
                vouchers = vouchers.filter(v => {
                    const vDate = dbModule.toDate(v.voucherDateTime);
                    return vDate >= startDate && vDate <= endDate;
                });
            }

            reportState.vouchers = vouchers;
            applyReportFilters();

        } catch (error) {
            console.error('[SoquyReport] Error fetching data:', error);
            reportState.vouchers = [];
            reportState.filtered = [];
        } finally {
            reportState.isLoading = false;
        }
    }

    function applyReportFilters() {
        let vouchers = [...reportState.vouchers];

        // Category filter
        if (reportState.categoryFilter) {
            const cat = reportState.categoryFilter.toLowerCase();
            vouchers = vouchers.filter(v =>
                String(v.category || '').toLowerCase().includes(cat)
            );
        }

        reportState.filtered = vouchers;
    }

    // =====================================================
    // DATA ANALYSIS
    // =====================================================

    function getFilteredByType(type) {
        return reportState.filtered.filter(v => v.type === type);
    }

    function sumAmount(vouchers) {
        return vouchers.reduce((sum, v) => sum + Math.abs(v.amount || 0), 0);
    }

    function computeSummary() {
        const receipts = getFilteredByType('receipt');
        const paymentsCN = getFilteredByType('payment_cn');
        const paymentsKD = getFilteredByType('payment_kd');

        const totalIncome = sumAmount(receipts);
        const totalExpenseCN = sumAmount(paymentsCN);
        const totalExpenseKD = sumAmount(paymentsKD);
        const totalExpense = totalExpenseCN + totalExpenseKD;
        const balance = totalIncome - totalExpense;

        return { totalIncome, totalExpenseCN, totalExpenseKD, totalExpense, balance };
    }

    function computeCategoryBreakdown() {
        const type = reportState.reportType;
        let vouchers;

        if (type === 'overview') {
            // Show all expense categories combined
            vouchers = reportState.filtered.filter(v =>
                v.type === 'payment_cn' || v.type === 'payment_kd'
            );
        } else if (type === 'payment_cn') {
            vouchers = getFilteredByType('payment_cn');
        } else {
            vouchers = getFilteredByType('payment_kd');
        }

        // Group by category
        const categoryMap = {};
        vouchers.forEach(v => {
            const cat = v.category || '(Chưa phân loại)';
            if (!categoryMap[cat]) {
                categoryMap[cat] = { category: cat, amount: 0, count: 0, type: v.type };
            }
            categoryMap[cat].amount += Math.abs(v.amount || 0);
            categoryMap[cat].count++;
        });

        const categories = Object.values(categoryMap).sort((a, b) => b.amount - a.amount);
        const total = categories.reduce((s, c) => s + c.amount, 0);

        return categories.map(c => ({
            ...c,
            percentage: total > 0 ? (c.amount / total * 100) : 0
        }));
    }

    function computeMonthlyTrend() {
        const { startDate, endDate } = getReportDateRange();
        if (!startDate || !endDate) return [];

        // Determine months in range
        const months = [];
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        while (current <= last) {
            months.push({
                year: current.getFullYear(),
                month: current.getMonth(),
                label: `T${current.getMonth() + 1}/${current.getFullYear()}`,
                income: 0,
                expenseCN: 0,
                expenseKD: 0,
                balance: 0
            });
            current.setMonth(current.getMonth() + 1);
        }

        // Populate with data
        reportState.filtered.forEach(v => {
            const vDate = dbModule.toDate(v.voucherDateTime);
            const monthEntry = months.find(m => m.year === vDate.getFullYear() && m.month === vDate.getMonth());
            if (!monthEntry) return;

            const amount = Math.abs(v.amount || 0);
            if (v.type === 'receipt') {
                monthEntry.income += amount;
            } else if (v.type === 'payment_cn') {
                monthEntry.expenseCN += amount;
            } else if (v.type === 'payment_kd') {
                monthEntry.expenseKD += amount;
            }
        });

        months.forEach(m => {
            m.balance = m.income - m.expenseCN - m.expenseKD;
        });

        return months;
    }

    function computeTopTransactions(limit) {
        const type = reportState.reportType;
        let vouchers;

        if (type === 'overview') {
            vouchers = [...reportState.filtered];
        } else if (type === 'payment_cn') {
            vouchers = getFilteredByType('payment_cn');
        } else {
            vouchers = getFilteredByType('payment_kd');
        }

        // Sort by amount descending, take top N
        return vouchers
            .sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0))
            .slice(0, limit || 10);
    }

    function computeFundBreakdown() {
        const funds = ['cash', 'bank', 'ewallet'];
        return funds.map(fund => {
            const fundVouchers = reportState.filtered.filter(v => v.fundType === fund);
            const income = sumAmount(fundVouchers.filter(v => v.type === 'receipt'));
            const expense = sumAmount(fundVouchers.filter(v => v.type === 'payment_cn' || v.type === 'payment_kd'));
            return {
                fund,
                label: config.FUND_TYPE_LABELS[fund] || fund,
                income,
                expense,
                balance: income - expense
            };
        });
    }

    // =====================================================
    // RENDERING
    // =====================================================

    function fmt(amount) {
        return dbModule.formatCurrency(amount);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function updateReportTitle() {
        const titleEl = document.getElementById('reportTitle');
        const periodEl = document.getElementById('reportPeriod');
        const updatedEl = document.getElementById('reportUpdated');

        if (titleEl) {
            const titles = {
                'overview': 'Báo cáo tổng quan',
                'payment_cn': 'Báo cáo chi cá nhân (CN)',
                'payment_kd': 'Báo cáo chi kinh doanh (KD)'
            };
            titleEl.textContent = titles[reportState.reportType] || 'Báo cáo';
        }

        if (periodEl) {
            const labels = {
                'this_month': 'Tháng này',
                'last_month': 'Tháng trước',
                'this_quarter': 'Quý này',
                'this_year': 'Năm nay',
                'custom': 'Tùy chỉnh'
            };
            let periodText = labels[reportState.timeFilter] || '';
            if (reportState.timeFilter === 'custom' && reportState.customStartDate && reportState.customEndDate) {
                periodText = `${reportState.customStartDate} → ${reportState.customEndDate}`;
            }
            const fundLabel = config.FUND_TYPE_LABELS[reportState.fundType] || 'Tổng quỹ';
            periodEl.textContent = `${periodText} · ${fundLabel}`;
        }

        if (updatedEl) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            updatedEl.textContent = `Cập nhật lúc ${hh}:${mm}`;
        }
    }

    function renderSummaryCards() {
        const summary = computeSummary();
        const type = reportState.reportType;

        const cardsContainer = document.getElementById('reportSummaryCards');
        if (!cardsContainer) return;

        if (type === 'overview') {
            cardsContainer.innerHTML = `
                <div class="report-card report-card--income">
                    <div class="report-card-icon"><i data-lucide="trending-up"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng thu</span>
                        <span class="report-card-value">${fmt(summary.totalIncome)}</span>
                    </div>
                </div>
                <div class="report-card report-card--expense-cn">
                    <div class="report-card-icon"><i data-lucide="trending-down"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng chi CN</span>
                        <span class="report-card-value">-${fmt(summary.totalExpenseCN)}</span>
                    </div>
                </div>
                <div class="report-card report-card--expense-kd">
                    <div class="report-card-icon"><i data-lucide="trending-down"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng chi KD</span>
                        <span class="report-card-value">-${fmt(summary.totalExpenseKD)}</span>
                    </div>
                </div>
                <div class="report-card report-card--balance">
                    <div class="report-card-icon"><i data-lucide="wallet"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Số dư</span>
                        <span class="report-card-value ${summary.balance >= 0 ? '' : 'report-card-value--negative'}">${summary.balance >= 0 ? '' : '-'}${fmt(Math.abs(summary.balance))}</span>
                    </div>
                </div>
            `;
        } else {
            const isCN = type === 'payment_cn';
            const totalExpense = isCN ? summary.totalExpenseCN : summary.totalExpenseKD;
            const label = isCN ? 'Chi cá nhân' : 'Chi kinh doanh';
            const countVouchers = getFilteredByType(type).length;
            const avgExpense = countVouchers > 0 ? totalExpense / countVouchers : 0;

            cardsContainer.innerHTML = `
                <div class="report-card report-card--${isCN ? 'expense-cn' : 'expense-kd'}">
                    <div class="report-card-icon"><i data-lucide="trending-down"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng ${label}</span>
                        <span class="report-card-value">-${fmt(totalExpense)}</span>
                    </div>
                </div>
                <div class="report-card report-card--count">
                    <div class="report-card-icon"><i data-lucide="file-text"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Số phiếu chi</span>
                        <span class="report-card-value">${countVouchers}</span>
                    </div>
                </div>
                <div class="report-card report-card--avg">
                    <div class="report-card-icon"><i data-lucide="divide"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Trung bình/phiếu</span>
                        <span class="report-card-value">${fmt(Math.round(avgExpense))}</span>
                    </div>
                </div>
                <div class="report-card report-card--income">
                    <div class="report-card-icon"><i data-lucide="trending-up"></i></div>
                    <div class="report-card-content">
                        <span class="report-card-label">Tổng thu</span>
                        <span class="report-card-value">${fmt(summary.totalIncome)}</span>
                    </div>
                </div>
            `;
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function renderCategoryBreakdown() {
        const tbody = document.getElementById('reportCategoryBody');
        if (!tbody) return;

        const categories = computeCategoryBreakdown();

        if (categories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'];

        tbody.innerHTML = categories.map((cat, i) => {
            const color = colors[i % colors.length];
            const typeTag = cat.type === 'payment_cn'
                ? '<span class="report-tag report-tag--cn">CN</span>'
                : cat.type === 'payment_kd'
                    ? '<span class="report-tag report-tag--kd">KD</span>'
                    : '<span class="report-tag report-tag--thu">Thu</span>';

            return `<tr>
                <td>
                    <div class="report-cat-name">
                        <span class="report-cat-dot" style="background: ${color};"></span>
                        ${escapeHtml(cat.category)}
                        ${reportState.reportType === 'overview' ? typeTag : ''}
                    </div>
                    <span class="report-cat-count">${cat.count} phiếu</span>
                </td>
                <td style="text-align: right; font-weight: 600;">
                    ${fmt(cat.amount)}
                </td>
                <td style="text-align: right; color: #8c8c8c;">
                    ${cat.percentage.toFixed(1)}%
                </td>
                <td>
                    <div class="report-progress-bar">
                        <div class="report-progress-fill" style="width: ${cat.percentage}%; background: ${color};"></div>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    function renderMonthlyTrend() {
        const tbody = document.getElementById('reportTrendBody');
        const tfoot = document.getElementById('reportTrendFoot');
        if (!tbody) return;

        const type = reportState.reportType;

        // Update thead based on report type
        const thead = document.querySelector('#reportTrendTable thead tr');
        if (thead) {
            if (type === 'overview') {
                thead.innerHTML = `
                    <th>Tháng</th>
                    <th style="text-align: right;">Thu</th>
                    <th style="text-align: right;">Chi CN</th>
                    <th style="text-align: right;">Chi KD</th>
                    <th style="text-align: right;">Số dư</th>
                `;
            } else {
                const label = type === 'payment_cn' ? 'Chi CN' : 'Chi KD';
                thead.innerHTML = `
                    <th>Tháng</th>
                    <th style="text-align: right;">Thu</th>
                    <th style="text-align: right;">${label}</th>
                    <th style="text-align: right;">Số dư</th>
                `;
            }
        }

        const months = computeMonthlyTrend();

        if (months.length === 0) {
            const colspan = type === 'overview' ? 5 : 4;
            tbody.innerHTML = `<tr><td colspan="${colspan}" class="report-empty">Không có dữ liệu</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        let totalIncome = 0, totalCN = 0, totalKD = 0;

        tbody.innerHTML = months.map(m => {
            totalIncome += m.income;
            totalCN += m.expenseCN;
            totalKD += m.expenseKD;

            const expense = type === 'payment_cn' ? m.expenseCN : type === 'payment_kd' ? m.expenseKD : null;
            const bal = type === 'overview' ? m.balance : (m.income - (type === 'payment_cn' ? m.expenseCN : m.expenseKD));

            if (type === 'overview') {
                return `<tr>
                    <td class="report-month-label">${m.label}</td>
                    <td style="text-align: right;" class="text-success">${m.income > 0 ? fmt(m.income) : '-'}</td>
                    <td style="text-align: right;" class="text-danger">${m.expenseCN > 0 ? '-' + fmt(m.expenseCN) : '-'}</td>
                    <td style="text-align: right;" class="text-danger">${m.expenseKD > 0 ? '-' + fmt(m.expenseKD) : '-'}</td>
                    <td style="text-align: right; font-weight: 600;" class="${m.balance >= 0 ? 'text-success' : 'text-danger'}">${m.balance >= 0 ? '' : '-'}${fmt(Math.abs(m.balance))}</td>
                </tr>`;
            } else {
                return `<tr>
                    <td class="report-month-label">${m.label}</td>
                    <td style="text-align: right;" class="text-success">${m.income > 0 ? fmt(m.income) : '-'}</td>
                    <td style="text-align: right;" class="text-danger">${expense > 0 ? '-' + fmt(expense) : '-'}</td>
                    <td style="text-align: right; font-weight: 600;" class="${bal >= 0 ? 'text-success' : 'text-danger'}">${bal >= 0 ? '' : '-'}${fmt(Math.abs(bal))}</td>
                </tr>`;
            }
        }).join('');

        // Footer totals
        if (tfoot) {
            const totalBal = totalIncome - totalCN - totalKD;
            if (type === 'overview') {
                tfoot.innerHTML = `<tr class="report-trend-total">
                    <td><strong>Tổng</strong></td>
                    <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
                    <td style="text-align: right;" class="text-danger"><strong>-${fmt(totalCN)}</strong></td>
                    <td style="text-align: right;" class="text-danger"><strong>-${fmt(totalKD)}</strong></td>
                    <td style="text-align: right;" class="${totalBal >= 0 ? 'text-success' : 'text-danger'}"><strong>${totalBal >= 0 ? '' : '-'}${fmt(Math.abs(totalBal))}</strong></td>
                </tr>`;
            } else {
                const exp = type === 'payment_cn' ? totalCN : totalKD;
                const bal = totalIncome - exp;
                tfoot.innerHTML = `<tr class="report-trend-total">
                    <td><strong>Tổng</strong></td>
                    <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
                    <td style="text-align: right;" class="text-danger"><strong>-${fmt(exp)}</strong></td>
                    <td style="text-align: right;" class="${bal >= 0 ? 'text-success' : 'text-danger'}"><strong>${bal >= 0 ? '' : '-'}${fmt(Math.abs(bal))}</strong></td>
                </tr>`;
            }
        }
    }

    function renderTopTransactions() {
        const tbody = document.getElementById('reportTopBody');
        if (!tbody) return;

        const top = computeTopTransactions(10);

        if (top.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        tbody.innerHTML = top.map(v => {
            const isPayment = v.type === 'payment_cn' || v.type === 'payment_kd';
            const typeLabel = config.VOUCHER_TYPE_LABELS[v.type] || v.type;
            const amountClass = isPayment ? 'text-danger' : 'text-success';
            const amountPrefix = isPayment ? '-' : '';
            const dateStr = dbModule.formatVoucherDateTime(v.voucherDateTime);

            return `<tr>
                <td class="text-primary" style="font-weight: 500;">${escapeHtml(v.code)}</td>
                <td>${escapeHtml(dateStr)}</td>
                <td>${escapeHtml(typeLabel)}</td>
                <td>${escapeHtml(v.personName || v.category || '')}</td>
                <td style="text-align: right; font-weight: 600;" class="${amountClass}">${amountPrefix}${fmt(v.amount)}</td>
            </tr>`;
        }).join('');
    }

    function renderFundBreakdown() {
        const tbody = document.getElementById('reportFundBody');
        if (!tbody) return;

        // Only show fund breakdown when viewing all funds
        if (reportState.fundType !== 'all') {
            tbody.innerHTML = '<tr><td colspan="4" class="report-empty">Chọn "Tổng quỹ" để xem phân bổ</td></tr>';
            return;
        }

        const funds = computeFundBreakdown();

        if (funds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="report-empty">Không có dữ liệu</td></tr>';
            return;
        }

        let totalIncome = 0, totalExpense = 0;

        tbody.innerHTML = funds.map(f => {
            totalIncome += f.income;
            totalExpense += f.expense;
            return `<tr>
                <td style="font-weight: 500;">${escapeHtml(f.label)}</td>
                <td style="text-align: right;" class="text-success">${f.income > 0 ? fmt(f.income) : '-'}</td>
                <td style="text-align: right;" class="text-danger">${f.expense > 0 ? '-' + fmt(f.expense) : '-'}</td>
                <td style="text-align: right; font-weight: 600;" class="${f.balance >= 0 ? 'text-success' : 'text-danger'}">${f.balance >= 0 ? '' : '-'}${fmt(Math.abs(f.balance))}</td>
            </tr>`;
        }).join('');

        const totalBal = totalIncome - totalExpense;
        tbody.innerHTML += `<tr class="report-trend-total">
            <td><strong>Tổng</strong></td>
            <td style="text-align: right;" class="text-success"><strong>${fmt(totalIncome)}</strong></td>
            <td style="text-align: right;" class="text-danger"><strong>-${fmt(totalExpense)}</strong></td>
            <td style="text-align: right;" class="${totalBal >= 0 ? 'text-success' : 'text-danger'}"><strong>${totalBal >= 0 ? '' : '-'}${fmt(Math.abs(totalBal))}</strong></td>
        </tr>`;
    }

    // =====================================================
    // EXPORT REPORT
    // =====================================================

    function exportReport() {
        if (reportState.filtered.length === 0) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        const summary = computeSummary();
        const categories = computeCategoryBreakdown();
        const months = computeMonthlyTrend();
        const type = reportState.reportType;

        const titles = {
            'overview': 'Bao_cao_tong_quan',
            'payment_cn': 'Bao_cao_chi_ca_nhan',
            'payment_kd': 'Bao_cao_chi_kinh_doanh'
        };

        // Build CSV
        let csv = '\uFEFF'; // UTF-8 BOM
        csv += `BÁO CÁO TÀI CHÍNH\n`;
        csv += `Loại: ${type === 'overview' ? 'Tổng quan' : type === 'payment_cn' ? 'Chi cá nhân' : 'Chi kinh doanh'}\n`;
        csv += `Thời gian: ${document.getElementById('reportPeriod')?.textContent || ''}\n\n`;

        // Summary
        csv += `TỔNG KẾT\n`;
        csv += `Tổng thu,${summary.totalIncome}\n`;
        csv += `Tổng chi CN,${summary.totalExpenseCN}\n`;
        csv += `Tổng chi KD,${summary.totalExpenseKD}\n`;
        csv += `Số dư,${summary.balance}\n\n`;

        // Category breakdown
        csv += `CHI TIẾT THEO LOẠI\n`;
        csv += `Loại thu chi,Số tiền,Tỷ lệ,Số phiếu\n`;
        categories.forEach(c => {
            csv += `"${c.category}",${c.amount},${c.percentage.toFixed(1)}%,${c.count}\n`;
        });
        csv += '\n';

        // Monthly trend
        csv += `XU HƯỚNG THEO THÁNG\n`;
        if (type === 'overview') {
            csv += `Tháng,Thu,Chi CN,Chi KD,Số dư\n`;
            months.forEach(m => {
                csv += `${m.label},${m.income},${m.expenseCN},${m.expenseKD},${m.balance}\n`;
            });
        } else {
            const expLabel = type === 'payment_cn' ? 'Chi CN' : 'Chi KD';
            csv += `Tháng,Thu,${expLabel},Số dư\n`;
            months.forEach(m => {
                const exp = type === 'payment_cn' ? m.expenseCN : m.expenseKD;
                csv += `${m.label},${m.income},${exp},${m.income - exp}\n`;
            });
        }

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${titles[type] || 'Bao_cao'}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // =====================================================
    // MAIN REFRESH
    // =====================================================

    async function refreshReport() {
        await fetchReportData();
        updateReportTitle();
        renderSummaryCards();
        renderCategoryBreakdown();
        renderMonthlyTrend();
        renderTopTransactions();
        renderFundBreakdown();
    }

    function refilterReport() {
        applyReportFilters();
        updateReportTitle();
        renderSummaryCards();
        renderCategoryBreakdown();
        renderMonthlyTrend();
        renderTopTransactions();
        renderFundBreakdown();
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    return {
        reportState,
        refreshReport,
        refilterReport,
        exportReport,
        getReportDateRange
    };
})();

window.SoquyReport = SoquyReport;
