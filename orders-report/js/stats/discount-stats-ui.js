// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DISCOUNT STATS UI
// Render UI cho section Thống Kê Giảm Giá
// =====================================================

class DiscountStatsUI {
    constructor() {
        this.currentStats = null;
        this.currentSubTab = 'overview';
        this.isLoading = false;

        // Chi phí Livestream
        this.livestreamCosts = {
            kpiPerItem: 10000, // 10k/món
            advertising: 0,    // Chi phí quảng cáo (tự nhập)
            operation: 0       // Chi phí vận hành (tự nhập)
        };

        // Chi phí cơ hội và lưu kho
        this.capitalCostRate = 12;  // % chi phí vốn/năm (lãi suất hoặc ROI kỳ vọng)
        this.storageCostRate = 1;   // % chi phí lưu kho/tháng theo giá vốn

        // Lịch sử các đợt Live
        this.liveSessionsKey = 'discount_live_sessions_history';
        this.loadLivestreamCosts();
        this.loadOpportunityCostSettings();
    }

    loadOpportunityCostSettings() {
        try {
            const saved = localStorage.getItem('orders_discount_opportunity_cost_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.capitalCostRate = settings.capitalCostRate ?? 12;
                this.storageCostRate = settings.storageCostRate ?? 1;
            }
        } catch (e) {
            console.warn('[DISCOUNT-UI] Error loading opportunity cost settings:', e);
        }
    }

    saveOpportunityCostSettings() {
        try {
            localStorage.setItem('orders_discount_opportunity_cost_settings', JSON.stringify({
                capitalCostRate: this.capitalCostRate,
                storageCostRate: this.storageCostRate
            }));
        } catch (e) {
            console.warn('[DISCOUNT-UI] Error saving opportunity cost settings:', e);
        }
    }

    updateCapitalCostRate() {
        const input = document.getElementById('capitalCostRate');
        if (input) {
            this.capitalCostRate = parseFloat(input.value) || 12;
            this.saveOpportunityCostSettings();
            this.refreshStats();
        }
    }

    updateStorageCostRate() {
        const input = document.getElementById('storageCostRate');
        if (input) {
            this.storageCostRate = parseFloat(input.value) || 1;
            this.saveOpportunityCostSettings();
            this.refreshStats();
        }
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    async init() {
        console.log('[DISCOUNT-UI] Initializing...');
        this.bindEvents();
    }

    bindEvents() {
        // Sub-tab click handlers
        document.querySelectorAll('.discount-sub-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.closest('.discount-sub-tab').dataset.tab;
                this.switchSubTab(tabName);
            });
        });

        // Threshold settings
        const safeInput = document.getElementById('thresholdSafe');
        const warningInput = document.getElementById('thresholdWarning');
        if (safeInput) {
            safeInput.addEventListener('change', () => this.updateThresholds());
        }
        if (warningInput) {
            warningInput.addEventListener('change', () => this.updateThresholds());
        }
    }

    switchSubTab(tabName) {
        this.currentSubTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.discount-sub-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.discount-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `discountTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
        });
    }

    updateThresholds() {
        const safe = parseFloat(document.getElementById('thresholdSafe')?.value) || 20;
        const warning = parseFloat(document.getElementById('thresholdWarning')?.value) || 10;

        if (window.discountStatsCalculator) {
            window.discountStatsCalculator.setThresholds(safe, warning);
            // Re-render if data exists
            if (this.currentStats) {
                this.refreshStats();
            }
        }
    }

    // ========================================
    // MAIN RENDER FUNCTION
    // ========================================

    async calculateAndRender(orders) {
        if (!orders || orders.length === 0) {
            this.renderEmptyState();
            return;
        }

        this.showLoading();

        try {
            // Ensure managers are loaded
            if (window.standardPriceManager && !window.standardPriceManager.isReady()) {
                await window.standardPriceManager.fetchProducts();
            }

            // Calculate stats
            if (window.discountStatsCalculator) {
                this.currentStats = await window.discountStatsCalculator.calculateLiveSessionStats(orders);
                this.render(this.currentStats);
            }
        } catch (error) {
            console.error('[DISCOUNT-UI] Error calculating stats:', error);
            this.renderError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    async refreshStats() {
        // Re-fetch and render with current orders
        // Use reportModule getter to access current data
        if (window.reportModule) {
            const cachedDetails = window.reportModule.getCachedDetails();
            const currentTable = window.reportModule.getCurrentTableName();
            const cachedData = cachedDetails?.[currentTable];
            if (cachedData?.orders) {
                await this.calculateAndRender(cachedData.orders);
            }
        }
    }

    render(stats) {
        if (!stats || stats.summary.totalDiscountedProducts === 0) {
            this.renderNoDiscountState();
            return;
        }

        // Store stats for later use (export, etc.)
        this.stats = stats;

        // Show section
        const section = document.getElementById('discountStatsSection');
        if (section) {
            section.style.display = 'block';
        }

        // Render each sub-tab
        this.renderOverviewTab(stats);
        this.renderProductsTab(stats);
        this.renderOrdersTab(stats);
        this.renderAnalysisTab(stats);
    }

    // ========================================
    // OVERVIEW TAB (deprecated - content moved to Analysis tab)
    // ========================================

    renderOverviewTab(stats) {
        // Content has been moved to renderAnalysisTab
        // This function is kept for backward compatibility
    }

    // ========================================
    // PRODUCTS TAB
    // ========================================

    renderProductsTab(stats) {
        const container = document.getElementById('discountProductsContent');
        if (!container) return;

        const calc = window.discountStatsCalculator;
        const products = stats.products;

        // Sort by discount amount desc
        const sorted = [...products].sort((a, b) => b.totalDiscount - a.totalDiscount);

        container.innerHTML = `
            <div class="discount-table-controls">
                <div class="table-info">
                    <strong>${products.length}</strong> sản phẩm giảm giá
                </div>
                <div class="table-filters">
                    <select id="productRiskFilter" onchange="window.discountStatsUI.filterProducts()">
                        <option value="all">Tất cả</option>
                        <option value="safe">🟢 An toàn</option>
                        <option value="warning">🟡 Cảnh báo</option>
                        <option value="danger">🔴 Nguy hiểm</option>
                        <option value="loss">⚫ Lỗ vốn</option>
                    </select>
                </div>
            </div>
            <div class="discount-table-wrapper">
                <table class="discount-table" id="discountProductsTable">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Mã SP</th>
                            <th>Tên sản phẩm</th>
                            <th>SL</th>
                            <th>Giá gốc</th>
                            <th>Giá giảm</th>
                            <th>Giá vốn</th>
                            <th>Tiền giảm</th>
                            <th>Lợi nhuận</th>
                            <th>Margin</th>
                            <th>Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody id="discountProductsBody">
                        ${sorted.map(p => `
                            <tr class="risk-${p.riskStatus}" data-risk="${p.riskStatus}">
                                <td class="stt clickable" onclick="window.openOrderDetailById && window.openOrderDetailById('${p.orderId}')" title="Click để xem chi tiết đơn hàng">${p.orderSTT || '-'}</td>
                                <td class="code">${p.productCode || '-'}</td>
                                <td class="name" title="${p.productName}">${this.truncate(p.productName, 30)}</td>
                                <td class="qty">${p.quantity}</td>
                                <td class="price">${calc.formatCurrency(p.listPrice)}</td>
                                <td class="discount-price">${calc.formatCurrency(p.discountPrice)}</td>
                                <td class="cost">${calc.formatCurrency(p.costPrice)}</td>
                                <td class="discount-amount negative">-${calc.formatCurrency(p.totalDiscount)}</td>
                                <td class="profit ${p.totalProfit >= 0 ? 'positive' : 'negative'}">${calc.formatCurrency(p.totalProfit)}</td>
                                <td class="margin ${p.marginPercent >= 20 ? 'positive' : p.marginPercent >= 10 ? 'warning' : 'negative'}">${calc.formatPercent(p.marginPercent)}</td>
                                <td class="status">${p.riskIcon} ${p.riskLabel}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    filterProducts() {
        const filter = document.getElementById('productRiskFilter')?.value || 'all';
        const rows = document.querySelectorAll('#discountProductsBody tr');

        rows.forEach(row => {
            if (filter === 'all' || row.dataset.risk === filter) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    // ========================================
    // ORDERS TAB
    // ========================================

    renderOrdersTab(stats) {
        const container = document.getElementById('discountOrdersContent');
        if (!container) return;

        const calc = window.discountStatsCalculator;
        const orders = stats.orders.filter(o => o.summary.discountedProductCount > 0);

        // Sort by total discount desc
        const sorted = [...orders].sort((a, b) => b.summary.totalDiscountAmount - a.summary.totalDiscountAmount);

        container.innerHTML = `
            <div class="discount-table-controls">
                <div class="table-info">
                    <strong>${orders.length}</strong> đơn có giảm giá
                </div>
                <div class="table-filters">
                    <select id="orderRiskFilter" onchange="window.discountStatsUI.filterOrders()">
                        <option value="all">Tất cả</option>
                        <option value="safe">🟢 An toàn</option>
                        <option value="warning">🟡 Cảnh báo</option>
                        <option value="danger">🔴 Nguy hiểm</option>
                        <option value="loss">⚫ Lỗ vốn</option>
                    </select>
                    <button class="btn-export-excel" onclick="window.discountStatsUI.exportOrdersToExcel()">
                        <i class="fas fa-file-excel"></i> Xuất Excel
                    </button>
                </div>
            </div>
            <div class="discount-table-wrapper">
                <table class="discount-table" id="discountOrdersTable">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Khách hàng</th>
                            <th>SP giảm</th>
                            <th>Tổng Giá Bán</th>
                            <th>Tổng sau giảm</th>
                            <th>Tổng Giá Vốn</th>
                            <th>Tiền giảm</th>
                            <th>Lợi nhuận</th>
                            <th>Margin</th>
                            <th>Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody id="discountOrdersBody">
                        ${sorted.map(o => `
                            <tr class="risk-${o.summary.riskStatus}" data-risk="${o.summary.riskStatus}">
                                <td class="stt clickable" onclick="window.openOrderDetailById && window.openOrderDetailById('${o.orderId}')" title="Click để xem chi tiết đơn hàng">${o.orderSTT || '-'}</td>
                                <td class="name">${this.truncate(o.customerName, 20)}</td>
                                <td class="qty">${o.summary.discountedProductCount}</td>
                                <td class="price">${calc.formatCurrency(o.summary.totalListPrice)}</td>
                                <td class="discount-price">${calc.formatCurrency(o.summary.totalDiscountPrice)}</td>
                                <td class="cost">${calc.formatCurrency(o.summary.totalCostPrice)}</td>
                                <td class="discount-amount negative">-${calc.formatCurrency(o.summary.totalDiscountAmount)}</td>
                                <td class="profit ${o.summary.totalProfit >= 0 ? 'positive' : 'negative'}">${calc.formatCurrency(o.summary.totalProfit)}</td>
                                <td class="margin ${o.summary.averageMarginPercent >= 20 ? 'positive' : o.summary.averageMarginPercent >= 10 ? 'warning' : 'negative'}">${calc.formatPercent(o.summary.averageMarginPercent)}</td>
                                <td class="status">${o.summary.riskIcon} ${o.summary.riskLabel}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    filterOrders() {
        const filter = document.getElementById('orderRiskFilter')?.value || 'all';
        const rows = document.querySelectorAll('#discountOrdersBody tr');

        rows.forEach(row => {
            if (filter === 'all' || row.dataset.risk === filter) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    exportOrdersToExcel() {
        if (!this.stats || !this.stats.orders) {
            alert('Không có dữ liệu để xuất');
            return;
        }

        try {
            const calc = window.discountStatsCalculator;
            const orders = this.stats.orders.filter(o => o.summary.discountedProductCount > 0);
            const sorted = [...orders].sort((a, b) => b.summary.totalDiscountAmount - a.summary.totalDiscountAmount);

            // Prepare data
            const data = [];

            // Header
            data.push(['THỐNG KÊ GIẢM GIÁ - CHI TIẾT ĐƠN']);
            data.push(['Xuất ngày:', new Date().toLocaleString('vi-VN')]);
            data.push(['Tổng đơn:', orders.length]);
            data.push([]);

            // Column headers
            data.push(['STT', 'Khách hàng', 'Tổng Giá Bán', 'Tổng Sau Giảm', 'Tiền Giảm']);

            // Data rows
            sorted.forEach(o => {
                data.push([
                    o.orderSTT || '-',
                    o.customerName || '-',
                    o.summary.totalListPrice || 0,
                    o.summary.totalDiscountPrice || 0,
                    o.summary.totalDiscountAmount || 0
                ]);
            });

            // Totals
            data.push([]);
            const totals = sorted.reduce((acc, o) => {
                acc.listPrice += o.summary.totalListPrice || 0;
                acc.discountPrice += o.summary.totalDiscountPrice || 0;
                acc.discountAmount += o.summary.totalDiscountAmount || 0;
                return acc;
            }, { listPrice: 0, discountPrice: 0, discountAmount: 0 });

            data.push(['TỔNG', '', totals.listPrice, totals.discountPrice, totals.discountAmount]);

            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(data);

            // Set column widths
            ws['!cols'] = [
                { wch: 10 },  // STT
                { wch: 25 },  // Khách hàng
                { wch: 15 },  // Tổng Giá Bán
                { wch: 15 },  // Tổng Sau Giảm
                { wch: 15 }   // Tiền Giảm
            ];

            // Create workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Chi Tiết Đơn');

            // Save file
            const fileName = `ThongKe_GiamGia_ChiTietDon_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            alert('Đã xuất Excel thành công!');
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Lỗi xuất Excel: ' + error.message);
        }
    }

    // ========================================
    // ANALYSIS TAB - DASHBOARD XẢ TỒN KHO
    // ========================================

    renderAnalysisTab(stats) {
        const container = document.getElementById('discountAnalysisContent');
        if (!container) return;

        const calc = window.discountStatsCalculator;
        const scenario = stats.scenarioAnalysis;
        const top = stats.topProducts;
        const s = stats.summary;

        // Tính toán chi phí và hiệu quả xả tồn
        const totalItemsSold = s.totalDiscountedProducts;
        const kpiCost = totalItemsSold * this.livestreamCosts.kpiPerItem;
        const totalLivestreamCost = kpiCost + this.livestreamCosts.advertising + this.livestreamCosts.operation;
        const capitalRecovered = s.totalDiscountPrice; // Vốn thu hồi từ hàng giảm giá
        const costPerItemSold = totalItemsSold > 0 ? totalLivestreamCost / totalItemsSold : 0;
        const clearanceROI = totalLivestreamCost > 0 ? capitalRecovered / totalLivestreamCost : 0;

        // Load lịch sử đợt live
        const liveHistory = this.getLiveSessionHistory();

        container.innerHTML = `
            <!-- ========================================
                 PHẦN TỔNG QUAN - từ Overview Tab
                 ======================================== -->

            <!-- KPI Cards -->
            <div class="discount-kpi-grid">
                <div class="discount-kpi-card teal">
                    <div class="kpi-icon"><i class="fas fa-cash-register"></i></div>
                    <div class="kpi-value">${calc.formatCurrency(s.totalDiscountPrice)}</div>
                    <div class="kpi-label">Tổng Doanh Thu</div>
                    <div class="kpi-sub">Sau giảm giá</div>
                </div>
                <div class="discount-kpi-card orange">
                    <div class="kpi-icon"><i class="fas fa-boxes"></i></div>
                    <div class="kpi-value">${calc.formatCurrency(s.totalCostPrice)}</div>
                    <div class="kpi-label">Tổng Vốn Hàng</div>
                    <div class="kpi-sub">Giá vốn ${s.totalDiscountedProducts} SP</div>
                </div>
                <div class="discount-kpi-card red">
                    <div class="kpi-icon"><i class="fas fa-tags"></i></div>
                    <div class="kpi-value">${calc.formatCurrency(s.totalDiscountAmount)}</div>
                    <div class="kpi-label">Tổng Tiền Giảm</div>
                    <div class="kpi-sub">${calc.formatPercent(s.averageDiscountPercent)} trung bình</div>
                </div>
                <div class="discount-kpi-card ${s.totalProfit >= 0 ? 'green' : 'black'}">
                    <div class="kpi-icon"><i class="fas fa-hand-holding-usd"></i></div>
                    <div class="kpi-value">${calc.formatCurrency(s.totalProfit)}</div>
                    <div class="kpi-label">Tổng Lợi Nhuận Còn</div>
                    <div class="kpi-sub">Margin ${calc.formatPercent(s.averageMarginPercent)}</div>
                </div>
                <div class="discount-kpi-card blue">
                    <div class="kpi-icon"><i class="fas fa-box-open"></i></div>
                    <div class="kpi-value">${s.totalDiscountedProducts}</div>
                    <div class="kpi-label">SP Giảm Giá</div>
                    <div class="kpi-sub">trong ${s.ordersWithDiscount} đơn</div>
                </div>
                <div class="discount-kpi-card ${s.ordersWithLoss > 0 ? 'warning' : 'purple'}">
                    <div class="kpi-icon"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="kpi-value">${s.ordersWithLoss}</div>
                    <div class="kpi-label">Đơn Lỗ Vốn</div>
                    <div class="kpi-sub">${s.ordersWithDiscount > 0 ? calc.formatPercent((s.ordersWithLoss / s.ordersWithDiscount) * 100) : '0%'} đơn có giảm</div>
                </div>
            </div>

            <!-- Risk Distribution -->
            <div class="discount-risk-section">
                <h4><i class="fas fa-chart-pie"></i> Phân Bổ Rủi Ro Sản Phẩm</h4>
                <div class="risk-distribution">
                    <div class="risk-bar">
                        <div class="risk-segment safe" style="width: ${stats.riskAnalysis.safePercent}%"></div>
                        <div class="risk-segment warning" style="width: ${stats.riskAnalysis.warningPercent}%"></div>
                        <div class="risk-segment danger" style="width: ${stats.riskAnalysis.dangerPercent}%"></div>
                        <div class="risk-segment loss" style="width: ${stats.riskAnalysis.lossPercent}%"></div>
                    </div>
                    <div class="risk-legend">
                        <span class="risk-item safe">🟢 An toàn: ${stats.riskAnalysis.categories.safe.count} (${calc.formatPercent(stats.riskAnalysis.safePercent)})</span>
                        <span class="risk-item warning">🟡 Cảnh báo: ${stats.riskAnalysis.categories.warning.count} (${calc.formatPercent(stats.riskAnalysis.warningPercent)})</span>
                        <span class="risk-item danger">🔴 Nguy hiểm: ${stats.riskAnalysis.categories.danger.count} (${calc.formatPercent(stats.riskAnalysis.dangerPercent)})</span>
                        <span class="risk-item loss">⚫ Lỗ vốn: ${stats.riskAnalysis.categories.loss.count} (${calc.formatPercent(stats.riskAnalysis.lossPercent)})</span>
                    </div>
                </div>
            </div>

            <!-- Quick Metrics -->
            <div class="discount-metrics-row">
                <div class="metric-box">
                    <div class="metric-label">Discount ROI</div>
                    <div class="metric-value ${s.discountROI >= 1 ? 'positive' : 'negative'}">${s.discountROI.toFixed(2)}x</div>
                    <div class="metric-hint">${s.discountROI >= 1 ? '✓ Có lời' : '✗ Lỗ'}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Ngưỡng Hòa Vốn</div>
                    <div class="metric-value">${calc.formatPercent(s.breakEvenDiscountPercent)}</div>
                    <div class="metric-hint">Giảm tối đa để không lỗ</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Giảm Trung Bình</div>
                    <div class="metric-value">${calc.formatPercent(s.averageDiscountPercent)}</div>
                    <div class="metric-hint">${s.averageDiscountPercent <= s.breakEvenDiscountPercent ? '✓ Trong ngưỡng' : '⚠ Vượt ngưỡng'}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-label">Margin Còn Lại</div>
                    <div class="metric-value ${s.averageMarginPercent >= 20 ? 'positive' : s.averageMarginPercent >= 10 ? 'warning' : 'negative'}">${calc.formatPercent(s.averageMarginPercent)}</div>
                    <div class="metric-hint">Mục tiêu: ≥20%</div>
                </div>
            </div>

            <!-- Threshold Settings -->
            <div class="threshold-settings">
                <h4><i class="fas fa-sliders-h"></i> Cài Đặt Ngưỡng Cảnh Báo</h4>
                <div class="threshold-controls">
                    <div class="threshold-item">
                        <label>Ngưỡng An toàn (🟢):</label>
                        <input type="number" id="thresholdSafe" value="${stats.thresholds.safe}" min="0" max="100" step="1">
                        <span>%</span>
                    </div>
                    <div class="threshold-item">
                        <label>Ngưỡng Cảnh báo (🟡):</label>
                        <input type="number" id="thresholdWarning" value="${stats.thresholds.warning}" min="0" max="100" step="1">
                        <span>%</span>
                    </div>
                    <button class="btn-apply-threshold" onclick="window.discountStatsUI.updateThresholds()">
                        <i class="fas fa-check"></i> Áp dụng
                    </button>
                </div>
            </div>

            <!-- ========================================
                 PHẦN PHÂN TÍCH CHI TIẾT
                 ======================================== -->

            <!-- Chi phí Livestream -->
            <div class="analysis-section livestream-costs">
                <h4><i class="fas fa-broadcast-tower"></i> Chi Phí Livestream</h4>
                <div class="costs-grid">
                    <div class="cost-item">
                        <label>KPI Live (10k/món)</label>
                        <div class="cost-value auto">
                            <span>${totalItemsSold}</span> món × 10.000đ = <strong>${calc.formatCurrency(kpiCost)}</strong>
                        </div>
                    </div>
                    <div class="cost-item">
                        <label>Chi phí Quảng cáo FB</label>
                        <div class="cost-input-wrapper">
                            <input type="number" id="costAdvertising" value="${this.livestreamCosts.advertising}"
                                   placeholder="0" onchange="window.discountStatsUI.updateLivestreamCosts()">
                            <span class="currency">đ</span>
                        </div>
                    </div>
                    <div class="cost-item">
                        <label>Chi phí Vận hành</label>
                        <div class="cost-input-wrapper">
                            <input type="number" id="costOperation" value="${this.livestreamCosts.operation}"
                                   placeholder="0" onchange="window.discountStatsUI.updateLivestreamCosts()">
                            <span class="currency">đ</span>
                        </div>
                    </div>
                    <div class="cost-item total">
                        <label>TỔNG CHI PHÍ</label>
                        <div class="cost-value total-value" id="totalLivestreamCost">
                            <strong>${calc.formatCurrency(totalLivestreamCost)}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Hiệu quả Xả Tồn -->
            <div class="analysis-section clearance-efficiency">
                <h4><i class="fas fa-box-open"></i> Hiệu Quả Xả Tồn</h4>
                <div class="clearance-kpi-grid">
                    <div class="clearance-kpi">
                        <div class="kpi-icon"><i class="fas fa-boxes"></i></div>
                        <div class="kpi-value">${totalItemsSold}</div>
                        <div class="kpi-label">SP Tồn Đã Bán</div>
                    </div>
                    <div class="clearance-kpi">
                        <div class="kpi-icon"><i class="fas fa-money-bill-wave"></i></div>
                        <div class="kpi-value">${calc.formatCurrency(capitalRecovered)}</div>
                        <div class="kpi-label">Vốn Thu Hồi</div>
                    </div>
                    <div class="clearance-kpi">
                        <div class="kpi-icon"><i class="fas fa-calculator"></i></div>
                        <div class="kpi-value" id="costPerItem">${calc.formatCurrency(costPerItemSold)}</div>
                        <div class="kpi-label">Chi phí/SP đã bán</div>
                    </div>
                    <div class="clearance-kpi ${clearanceROI >= 1 ? 'success' : 'warning'}">
                        <div class="kpi-icon"><i class="fas fa-chart-line"></i></div>
                        <div class="kpi-value" id="clearanceROI">${clearanceROI.toFixed(2)}x</div>
                        <div class="kpi-label">ROI Xả Tồn</div>
                        <div class="kpi-hint">${clearanceROI >= 1 ? '✓ Hiệu quả' : '⚠ Cần tối ưu'}</div>
                    </div>
                </div>
                <div class="clearance-summary">
                    <div class="summary-box">
                        <i class="fas fa-info-circle"></i>
                        <span>Mỗi <strong>${calc.formatCurrency(costPerItemSold)}</strong> chi phí livestream → Thu về <strong>${calc.formatCurrency(costPerItemSold > 0 ? capitalRecovered / (totalLivestreamCost / costPerItemSold) : 0)}</strong> vốn/SP</span>
                    </div>
                </div>
            </div>

            <!-- So sánh Kịch bản - Góc nhìn Tài chính Xả Tồn -->
            <div class="analysis-section inventory-comparison">
                <h4><i class="fas fa-balance-scale"></i> Phân Tích Tài Chính: Giữ Hàng vs Xả Tồn</h4>

                <!-- Thông số chi phí cơ hội -->
                <div class="opportunity-cost-settings">
                    <div class="setting-row">
                        <div class="setting-item">
                            <label><i class="fas fa-percent"></i> Chi phí vốn/năm:</label>
                            <input type="number" id="capitalCostRate" value="${this.capitalCostRate || 12}" min="0" max="50" step="1"
                                   onchange="window.discountStatsUI.updateCapitalCostRate()">
                            <span>%</span>
                            <small>Lãi suất hoặc ROI kỳ vọng</small>
                        </div>
                        <div class="setting-item">
                            <label><i class="fas fa-warehouse"></i> Chi phí lưu kho/tháng:</label>
                            <input type="number" id="storageCostRate" value="${this.storageCostRate || 1}" min="0" max="10" step="0.5"
                                   onchange="window.discountStatsUI.updateStorageCostRate()">
                            <span>% giá vốn</span>
                            <small>Kho bãi, bảo quản</small>
                        </div>
                    </div>
                </div>

                ${this.renderInventoryComparison(stats, scenario, calc)}
            </div>

            <!-- Top Sản Phẩm -->
            <div class="analysis-section">
                <h4><i class="fas fa-trophy"></i> Top Sản Phẩm Xả Tồn</h4>
                <div class="top-products-grid">
                    <div class="top-card">
                        <div class="top-title">🔥 Giảm Nhiều Nhất</div>
                        <div class="top-list">
                            ${top.mostDiscounted.slice(0, 5).map((p, i) => `
                                <div class="top-item">
                                    <span class="rank">#${i + 1}</span>
                                    <span class="name">${this.truncate(p.productCode || p.productName, 15)}</span>
                                    <span class="value negative">-${calc.formatCurrency(p.discountAmount)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="top-card">
                        <div class="top-title">💰 Lời Nhiều Nhất</div>
                        <div class="top-list">
                            ${top.mostProfit.slice(0, 5).map((p, i) => `
                                <div class="top-item">
                                    <span class="rank">#${i + 1}</span>
                                    <span class="name">${this.truncate(p.productCode || p.productName, 15)}</span>
                                    <span class="value positive">${calc.formatCurrency(p.profitPerUnit)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="top-card danger">
                        <div class="top-title">⚠️ Lỗ Nhiều Nhất</div>
                        <div class="top-list">
                            ${top.leastProfit.filter(p => p.profitPerUnit < 0).slice(0, 5).map((p, i) => `
                                <div class="top-item">
                                    <span class="rank">#${i + 1}</span>
                                    <span class="name">${this.truncate(p.productCode || p.productName, 15)}</span>
                                    <span class="value negative">${calc.formatCurrency(p.profitPerUnit)}</span>
                                </div>
                            `).join('')}
                            ${top.leastProfit.filter(p => p.profitPerUnit < 0).length === 0 ? '<div class="empty-top">Không có SP lỗ 👍</div>' : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Lưu & So sánh đợt Live -->
            <div class="analysis-section live-comparison">
                <h4><i class="fas fa-history"></i> Lịch Sử Đợt Live Xả Tồn</h4>
                <div class="save-session-row">
                    <input type="text" id="liveSessionName" placeholder="Tên đợt live (vd: 28/12 Bé Huyền)"
                           style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                    <button class="btn-save-session" onclick="window.discountStatsUI.saveCurrentSession()">
                        <i class="fas fa-save"></i> Lưu đợt Live
                    </button>
                </div>
                <div class="live-history-table" id="liveHistoryTable">
                    ${this.renderLiveHistoryTable(liveHistory)}
                </div>
            </div>

            <!-- Phân tích Xả Tồn -->
            <div class="analysis-section cfo-insights">
                <h4><i class="fas fa-lightbulb"></i> Phân Tích Xả Tồn</h4>
                <div class="insights-list">
                    ${this.generateClearanceInsights(stats, totalLivestreamCost, clearanceROI)}
                </div>
            </div>
        `;

        // Rebind threshold events (moved from renderOverviewTab)
        this.bindEvents();
    }

    // ========================================
    // INVENTORY COMPARISON - Phân tích tài chính xả tồn
    // ========================================

    renderInventoryComparison(stats, scenario, calc) {
        const s = stats.summary;
        const costPrice = s.totalCostPrice; // Giá vốn hàng tồn
        const listPrice = s.totalListPrice; // Giá bán lẻ (không giảm)
        const discountPrice = s.totalDiscountPrice; // Doanh thu thực (sau giảm)
        const discountAmount = s.totalDiscountAmount; // Số tiền giảm giá

        // Tính chi phí cơ hội theo tháng
        const monthlyCapitalCost = costPrice * (this.capitalCostRate / 100 / 12);
        const monthlyStorageCost = costPrice * (this.storageCostRate / 100);
        const totalMonthlyCost = monthlyCapitalCost + monthlyStorageCost;

        // Tính điểm hòa vốn (bao nhiêu tháng giữ hàng = thiệt hại do giảm giá)
        const breakEvenMonths = totalMonthlyCost > 0 ? discountAmount / totalMonthlyCost : 0;

        // Tính chi phí nếu giữ hàng thêm 3, 6, 12 tháng
        const cost3Months = totalMonthlyCost * 3;
        const cost6Months = totalMonthlyCost * 6;
        const cost12Months = totalMonthlyCost * 12;

        // Lợi nhuận thực từ xả tồn
        const actualProfit = s.totalProfit;

        // Vốn thu hồi có thể tái đầu tư
        const recoveredCapital = discountPrice;
        const potentialReinvestReturn = recoveredCapital * (this.capitalCostRate / 100 / 12) * 3; // ROI 3 tháng nếu tái đầu tư

        // Đánh giá hiệu quả
        const isEffective = discountAmount < cost3Months;
        const efficiency = totalMonthlyCost > 0 ? (discountAmount / totalMonthlyCost).toFixed(1) : '∞';

        return `
            <!-- So sánh 2 kịch bản -->
            <div class="inventory-scenarios">
                <!-- Kịch bản 1: Giữ hàng tồn -->
                <div class="inv-scenario hold-inventory">
                    <div class="inv-scenario-header">
                        <i class="fas fa-warehouse"></i>
                        <span>GIỮ HÀNG TỒN</span>
                        <small>Chờ bán giá gốc</small>
                    </div>
                    <div class="inv-scenario-body">
                        <div class="inv-row">
                            <span><i class="fas fa-lock"></i> Vốn bị chiếm dụng:</span>
                            <strong class="negative">${calc.formatCurrency(costPrice)}</strong>
                        </div>
                        <div class="inv-row">
                            <span><i class="fas fa-percentage"></i> Chi phí vốn/tháng:</span>
                            <strong class="negative">${calc.formatCurrency(monthlyCapitalCost)}</strong>
                        </div>
                        <div class="inv-row">
                            <span><i class="fas fa-boxes"></i> Chi phí lưu kho/tháng:</span>
                            <strong class="negative">${calc.formatCurrency(monthlyStorageCost)}</strong>
                        </div>
                        <div class="inv-row highlight">
                            <span><i class="fas fa-calculator"></i> Tổng chi phí/tháng:</span>
                            <strong class="negative">${calc.formatCurrency(totalMonthlyCost)}</strong>
                        </div>
                        <div class="inv-divider"></div>
                        <div class="inv-row sub">
                            <span>Chi phí sau 3 tháng:</span>
                            <strong class="negative">${calc.formatCurrency(cost3Months)}</strong>
                        </div>
                        <div class="inv-row sub">
                            <span>Chi phí sau 6 tháng:</span>
                            <strong class="negative">${calc.formatCurrency(cost6Months)}</strong>
                        </div>
                        <div class="inv-row sub">
                            <span>Chi phí sau 12 tháng:</span>
                            <strong class="negative">${calc.formatCurrency(cost12Months)}</strong>
                        </div>
                        <div class="inv-risks">
                            <div class="risk-item"><i class="fas fa-exclamation-triangle"></i> Rủi ro lỗi mode, hết trend</div>
                            <div class="risk-item"><i class="fas fa-exclamation-triangle"></i> Rủi ro hao hụt, hư hỏng</div>
                            <div class="risk-item"><i class="fas fa-clock"></i> Thời gian bán: Không xác định</div>
                        </div>
                    </div>
                </div>

                <!-- Dấu so sánh -->
                <div class="inv-vs">
                    <div class="vs-badge">VS</div>
                    <div class="vs-result ${isEffective ? 'effective' : 'ineffective'}">
                        ${isEffective ? '<i class="fas fa-check-circle"></i> Xả tồn hiệu quả' : '<i class="fas fa-info-circle"></i> Cân nhắc thêm'}
                    </div>
                </div>

                <!-- Kịch bản 2: Xả tồn -->
                <div class="inv-scenario clear-inventory">
                    <div class="inv-scenario-header">
                        <i class="fas fa-bolt"></i>
                        <span>XẢ TỒN NGAY</span>
                        <small>Giảm giá thu hồi vốn</small>
                    </div>
                    <div class="inv-scenario-body">
                        <div class="inv-row">
                            <span><i class="fas fa-money-bill-wave"></i> Vốn thu hồi ngay:</span>
                            <strong class="positive">${calc.formatCurrency(recoveredCapital)}</strong>
                        </div>
                        <div class="inv-row">
                            <span><i class="fas fa-tags"></i> "Thiệt hại" giảm giá:</span>
                            <strong class="negative">${calc.formatCurrency(discountAmount)}</strong>
                        </div>
                        <div class="inv-row">
                            <span><i class="fas fa-hand-holding-usd"></i> Lợi nhuận còn lại:</span>
                            <strong class="${actualProfit >= 0 ? 'positive' : 'negative'}">${calc.formatCurrency(actualProfit)}</strong>
                        </div>
                        <div class="inv-row highlight">
                            <span><i class="fas fa-sync"></i> Tiềm năng tái đầu tư (3T):</span>
                            <strong class="positive">+${calc.formatCurrency(potentialReinvestReturn)}</strong>
                        </div>
                        <div class="inv-divider"></div>
                        <div class="inv-benefits">
                            <div class="benefit-item"><i class="fas fa-check"></i> Giải phóng vốn ngay lập tức</div>
                            <div class="benefit-item"><i class="fas fa-check"></i> Không chi phí lưu kho tiếp</div>
                            <div class="benefit-item"><i class="fas fa-check"></i> Loại bỏ rủi ro hàng tồn</div>
                            <div class="benefit-item"><i class="fas fa-check"></i> Vốn có thể quay vòng</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Phân tích điểm hòa vốn -->
            <div class="breakeven-analysis">
                <h5><i class="fas fa-crosshairs"></i> Phân Tích Điểm Hòa Vốn</h5>
                <div class="breakeven-content">
                    <div class="breakeven-main">
                        <div class="breakeven-value">${breakEvenMonths.toFixed(1)}</div>
                        <div class="breakeven-unit">tháng</div>
                    </div>
                    <div class="breakeven-explain">
                        <p><strong>Giữ hàng ${breakEvenMonths.toFixed(1)} tháng</strong> = Chi phí cơ hội <strong>${calc.formatCurrency(discountAmount)}</strong></p>
                        <p class="hint">Sau ${breakEvenMonths.toFixed(1)} tháng, chi phí giữ hàng vượt qua số tiền giảm giá. Xả tồn sớm hơn = tiết kiệm chi phí.</p>
                    </div>
                </div>
                <div class="breakeven-timeline">
                    <div class="timeline-bar">
                        <div class="timeline-marker now" style="left: 0%;">
                            <span>Bây giờ</span>
                        </div>
                        <div class="timeline-marker breakeven" style="left: ${Math.min(breakEvenMonths / 12 * 100, 100)}%;">
                            <span>${breakEvenMonths.toFixed(1)}T</span>
                        </div>
                        <div class="timeline-fill" style="width: ${Math.min(breakEvenMonths / 12 * 100, 100)}%;"></div>
                    </div>
                    <div class="timeline-labels">
                        <span>0</span>
                        <span>3T</span>
                        <span>6T</span>
                        <span>9T</span>
                        <span>12T</span>
                    </div>
                </div>
            </div>

            <!-- Kết luận -->
            <div class="inventory-conclusion ${isEffective ? 'positive' : 'neutral'}">
                <div class="conclusion-icon">
                    ${isEffective ? '<i class="fas fa-thumbs-up"></i>' : '<i class="fas fa-balance-scale"></i>'}
                </div>
                <div class="conclusion-text">
                    ${isEffective
                        ? `<strong>Xả tồn là quyết định đúng!</strong> Số tiền giảm giá (${calc.formatCurrency(discountAmount)}) ít hơn chi phí giữ hàng 3 tháng (${calc.formatCurrency(cost3Months)}). Bạn tiết kiệm được <strong>${calc.formatCurrency(cost3Months - discountAmount)}</strong> và giải phóng vốn để tái đầu tư.`
                        : `<strong>Cần cân nhắc thêm.</strong> Số tiền giảm giá (${calc.formatCurrency(discountAmount)}) cao hơn chi phí giữ hàng 3 tháng. Tuy nhiên, hãy xem xét rủi ro hàng tồn và khả năng bán được với giá gốc.`
                    }
                </div>
            </div>
        `;
    }

    generateCFOInsights(stats) {
        const insights = [];
        const s = stats.summary;
        const risk = stats.riskAnalysis;

        // ROI insight
        if (s.discountROI < 1) {
            insights.push({
                type: 'danger',
                icon: '🚨',
                text: `Đợt sale đang LỖ: Chi ${s.totalDiscountAmount.toLocaleString()}đ giảm giá chỉ thu về ${s.totalProfit.toLocaleString()}đ lợi nhuận (ROI: ${s.discountROI.toFixed(2)}x)`
            });
        } else if (s.discountROI > 2) {
            insights.push({
                type: 'success',
                icon: '✅',
                text: `Hiệu quả giảm giá TỐT: ROI ${s.discountROI.toFixed(2)}x - Mỗi đồng giảm mang về ${s.discountROI.toFixed(2)} đồng lợi nhuận`
            });
        }

        // Margin insight
        if (s.averageMarginPercent < 10) {
            insights.push({
                type: 'warning',
                icon: '⚠️',
                text: `Margin quá thấp (${s.averageMarginPercent.toFixed(1)}%): Cần xem xét lại mức giảm giá, đề xuất giữ margin tối thiểu 15%`
            });
        }

        // Loss orders insight
        if (s.ordersWithLoss > 0) {
            const lossPercent = (s.ordersWithLoss / s.ordersWithDiscount) * 100;
            insights.push({
                type: 'danger',
                icon: '📉',
                text: `Có ${s.ordersWithLoss} đơn LỖ VỐN (${lossPercent.toFixed(1)}% đơn giảm giá): Cần rà soát lại các SP đang bán dưới giá vốn`
            });
        }

        // Risk distribution insight
        if (risk.lossPercent + risk.dangerPercent > 30) {
            insights.push({
                type: 'warning',
                icon: '📊',
                text: `${(risk.lossPercent + risk.dangerPercent).toFixed(1)}% SP ở vùng nguy hiểm/lỗ: Cần điều chỉnh chiến lược định giá`
            });
        }

        // Discount depth insight
        if (s.averageDiscountPercent > s.breakEvenDiscountPercent) {
            insights.push({
                type: 'danger',
                icon: '🎯',
                text: `Giảm giá VƯỢT ngưỡng hòa vốn: TB giảm ${s.averageDiscountPercent.toFixed(1)}% > Ngưỡng ${s.breakEvenDiscountPercent.toFixed(1)}%`
            });
        }

        // Positive insight if everything is good
        if (insights.length === 0 || (s.discountROI >= 1 && s.averageMarginPercent >= 20 && s.ordersWithLoss === 0)) {
            insights.push({
                type: 'success',
                icon: '🎉',
                text: `Đợt sale HIỆU QUẢ: Margin ${s.averageMarginPercent.toFixed(1)}%, ROI ${s.discountROI.toFixed(2)}x, không có đơn lỗ`
            });
        }

        return insights.map(i => `
            <div class="insight-item ${i.type}">
                <span class="insight-icon">${i.icon}</span>
                <span class="insight-text">${i.text}</span>
            </div>
        `).join('');
    }

    // ========================================
    // LIVESTREAM COSTS MANAGEMENT
    // ========================================

    loadLivestreamCosts() {
        try {
            const saved = localStorage.getItem('orders_discount_livestream_costs');
            if (saved) {
                const data = JSON.parse(saved);
                this.livestreamCosts = { ...this.livestreamCosts, ...data };
            }
        } catch (e) {
            console.error('[DISCOUNT-UI] Error loading livestream costs:', e);
        }
    }

    saveLivestreamCosts() {
        try {
            localStorage.setItem('orders_discount_livestream_costs', JSON.stringify(this.livestreamCosts));
        } catch (e) {
            console.error('[DISCOUNT-UI] Error saving livestream costs:', e);
        }
    }

    updateLivestreamCosts() {
        const adCost = parseFloat(document.getElementById('costAdvertising')?.value) || 0;
        const opCost = parseFloat(document.getElementById('costOperation')?.value) || 0;

        this.livestreamCosts.advertising = adCost;
        this.livestreamCosts.operation = opCost;
        this.saveLivestreamCosts();

        // Recalculate and update display
        if (this.currentStats) {
            const s = this.currentStats.summary;
            const totalItemsSold = s.totalDiscountedProducts;
            const kpiCost = totalItemsSold * this.livestreamCosts.kpiPerItem;
            const totalCost = kpiCost + adCost + opCost;
            const capitalRecovered = s.totalDiscountPrice;
            const costPerItem = totalItemsSold > 0 ? totalCost / totalItemsSold : 0;
            const clearanceROI = totalCost > 0 ? capitalRecovered / totalCost : 0;

            const calc = window.discountStatsCalculator;

            // Update display
            const totalEl = document.getElementById('totalLivestreamCost');
            if (totalEl) totalEl.innerHTML = `<strong>${calc.formatCurrency(totalCost)}</strong>`;

            const costPerItemEl = document.getElementById('costPerItem');
            if (costPerItemEl) costPerItemEl.textContent = calc.formatCurrency(costPerItem);

            const roiEl = document.getElementById('clearanceROI');
            if (roiEl) {
                roiEl.textContent = clearanceROI.toFixed(2) + 'x';
                roiEl.closest('.clearance-kpi').className = `clearance-kpi ${clearanceROI >= 1 ? 'success' : 'warning'}`;
            }
        }
    }

    // ========================================
    // LIVE SESSION HISTORY
    // ========================================

    getLiveSessionHistory() {
        try {
            const saved = localStorage.getItem(this.liveSessionsKey);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('[DISCOUNT-UI] Error loading live history:', e);
            return [];
        }
    }

    saveCurrentSession() {
        if (!this.currentStats) {
            alert('Chưa có dữ liệu để lưu!');
            return;
        }

        const nameInput = document.getElementById('liveSessionName');
        const sessionName = nameInput?.value.trim() || `Live ${new Date().toLocaleDateString('vi-VN')}`;

        const s = this.currentStats.summary;
        const totalItemsSold = s.totalDiscountedProducts;
        const kpiCost = totalItemsSold * this.livestreamCosts.kpiPerItem;
        const totalCost = kpiCost + this.livestreamCosts.advertising + this.livestreamCosts.operation;

        const session = {
            id: Date.now(),
            name: sessionName,
            date: new Date().toISOString(),
            itemsSold: totalItemsSold,
            ordersCount: s.ordersWithDiscount,
            capitalRecovered: s.totalDiscountPrice,
            totalDiscount: s.totalDiscountAmount,
            profit: s.totalProfit,
            livestreamCost: totalCost,
            kpiCost: kpiCost,
            adCost: this.livestreamCosts.advertising,
            opCost: this.livestreamCosts.operation,
            clearanceROI: totalCost > 0 ? s.totalDiscountPrice / totalCost : 0,
            costPerItem: totalItemsSold > 0 ? totalCost / totalItemsSold : 0
        };

        const history = this.getLiveSessionHistory();
        history.unshift(session); // Add to beginning

        // Keep only last 20 sessions
        if (history.length > 20) history.pop();

        try {
            localStorage.setItem(this.liveSessionsKey, JSON.stringify(history));

            // Clear input and refresh table
            if (nameInput) nameInput.value = '';
            document.getElementById('liveHistoryTable').innerHTML = this.renderLiveHistoryTable(history);

            if (window.notificationManager) {
                window.notificationManager.success(`Đã lưu "${sessionName}"`, 2000);
            } else {
                alert(`Đã lưu "${sessionName}"`);
            }
        } catch (e) {
            console.error('[DISCOUNT-UI] Error saving session:', e);
            alert('Lỗi lưu dữ liệu!');
        }
    }

    deleteLiveSession(sessionId) {
        if (!confirm('Xóa đợt live này?')) return;

        let history = this.getLiveSessionHistory();
        history = history.filter(s => s.id !== sessionId);

        try {
            localStorage.setItem(this.liveSessionsKey, JSON.stringify(history));
            document.getElementById('liveHistoryTable').innerHTML = this.renderLiveHistoryTable(history);
        } catch (e) {
            console.error('[DISCOUNT-UI] Error deleting session:', e);
        }
    }

    renderLiveHistoryTable(history) {
        if (!history || history.length === 0) {
            return `<div class="empty-history">Chưa có lịch sử đợt live. Lưu đợt live đầu tiên để so sánh!</div>`;
        }

        const calc = window.discountStatsCalculator;

        return `
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Đợt Live</th>
                        <th>SP Bán</th>
                        <th>Vốn Thu Hồi</th>
                        <th>Chi Phí Live</th>
                        <th>Chi phí/SP</th>
                        <th>ROI</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(s => `
                        <tr>
                            <td>
                                <div class="session-name">${s.name}</div>
                                <div class="session-date">${new Date(s.date).toLocaleDateString('vi-VN')}</div>
                            </td>
                            <td>${s.itemsSold}</td>
                            <td>${calc.formatCurrency(s.capitalRecovered)}</td>
                            <td>
                                <div>${calc.formatCurrency(s.livestreamCost)}</div>
                                <div class="cost-breakdown">KPI: ${calc.formatCurrency(s.kpiCost)} | QC: ${calc.formatCurrency(s.adCost)} | VH: ${calc.formatCurrency(s.opCost)}</div>
                            </td>
                            <td>${calc.formatCurrency(s.costPerItem)}</td>
                            <td class="${s.clearanceROI >= 1 ? 'positive' : 'negative'}">${s.clearanceROI.toFixed(2)}x</td>
                            <td>
                                <button class="btn-delete-session" onclick="window.discountStatsUI.deleteLiveSession(${s.id})" title="Xóa">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ========================================
    // CLEARANCE INSIGHTS (Xả Tồn Analysis)
    // ========================================

    generateClearanceInsights(stats, totalLivestreamCost, clearanceROI) {
        const insights = [];
        const s = stats.summary;
        const risk = stats.riskAnalysis;

        // ROI Xả tồn
        if (clearanceROI < 1) {
            insights.push({
                type: 'warning',
                icon: '⚠️',
                text: `Chi phí livestream CAO: ROI ${clearanceROI.toFixed(2)}x - Mỗi ${(1/clearanceROI).toFixed(0)}đ chi phí chỉ thu ${(1).toFixed(0)}đ vốn. Cần giảm chi phí QC/vận hành.`
            });
        } else if (clearanceROI >= 5) {
            insights.push({
                type: 'success',
                icon: '🎉',
                text: `Xả tồn RẤT HIỆU QUẢ: ROI ${clearanceROI.toFixed(1)}x - Chi phí livestream thấp so với vốn thu hồi!`
            });
        }

        // Phân tích số lượng xả
        if (s.totalDiscountedProducts >= 100) {
            insights.push({
                type: 'success',
                icon: '📦',
                text: `Xả được ${s.totalDiscountedProducts} SP tồn trong ${s.ordersWithDiscount} đơn - Tốc độ xả tốt!`
            });
        } else if (s.totalDiscountedProducts < 50) {
            insights.push({
                type: 'info',
                icon: '📊',
                text: `Chỉ xả được ${s.totalDiscountedProducts} SP. Có thể cần giảm sâu hơn hoặc tăng quảng cáo.`
            });
        }

        // Phân tích lỗ vốn
        if (s.ordersWithLoss > 0) {
            insights.push({
                type: 'danger',
                icon: '📉',
                text: `Có ${s.ordersWithLoss} đơn LỖ VỐN - Chấp nhận được nếu mục tiêu là giải phóng kho. Tổng lỗ: ${Math.abs(s.totalProfit < 0 ? s.totalProfit : 0).toLocaleString()}đ`
            });
        }

        // Chi phí cơ hội
        const holdingCostPerMonth = s.totalCostPrice * 0.015; // 1.5%/tháng
        insights.push({
            type: 'info',
            icon: '💡',
            text: `Chi phí giữ hàng tồn: ~${holdingCostPerMonth.toLocaleString()}đ/tháng. Nếu xả được, tiết kiệm chi phí lưu kho và vốn "chết".`
        });

        // Đề xuất
        if (risk.lossPercent + risk.dangerPercent > 40) {
            insights.push({
                type: 'warning',
                icon: '🎯',
                text: `${(risk.lossPercent + risk.dangerPercent).toFixed(0)}% SP ở vùng nguy hiểm/lỗ. Với mục tiêu XẢ TỒN, đây là chấp nhận được. Ưu tiên xả nhanh hơn lãi cao.`
            });
        }

        // Kết luận
        if (clearanceROI >= 1 && s.totalDiscountedProducts >= 50) {
            insights.push({
                type: 'success',
                icon: '✅',
                text: `Tổng kết: Đợt live XẢ TỒN HIỆU QUẢ! Thu hồi ${s.totalDiscountPrice.toLocaleString()}đ vốn với chi phí ${totalLivestreamCost.toLocaleString()}đ.`
            });
        }

        return insights.map(i => `
            <div class="insight-item ${i.type}">
                <span class="insight-icon">${i.icon}</span>
                <span class="insight-text">${i.text}</span>
            </div>
        `).join('');
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    truncate(str, length) {
        if (!str) return '-';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    showLoading() {
        this.isLoading = true;
        const section = document.getElementById('discountStatsSection');
        if (section) {
            section.classList.add('loading');
        }
        const loadingEl = document.getElementById('discountStatsLoading');
        if (loadingEl) {
            loadingEl.style.display = 'flex';
        }
    }

    hideLoading() {
        this.isLoading = false;
        const section = document.getElementById('discountStatsSection');
        if (section) {
            section.classList.remove('loading');
        }
        const loadingEl = document.getElementById('discountStatsLoading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    renderEmptyState() {
        const section = document.getElementById('discountStatsSection');
        if (section) {
            section.style.display = 'none';
        }
    }

    renderNoDiscountState() {
        const container = document.getElementById('discountOverviewContent');
        if (container) {
            container.innerHTML = `
                <div class="no-discount-state">
                    <i class="fas fa-tag"></i>
                    <h3>Không có sản phẩm giảm giá</h3>
                    <p>Không tìm thấy sản phẩm nào có ghi chú giá giảm trong đợt live này</p>
                </div>
            `;
        }
        const section = document.getElementById('discountStatsSection');
        if (section) {
            section.style.display = 'block';
        }
    }

    renderError(message) {
        const container = document.getElementById('discountOverviewContent');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Lỗi tải dữ liệu</h3>
                    <p>${message}</p>
                    <button onclick="window.discountStatsUI.refreshStats()" class="btn-retry">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }
}

// Create global instance
window.discountStatsUI = new DiscountStatsUI();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiscountStatsUI;
}
