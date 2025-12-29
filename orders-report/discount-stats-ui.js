// =====================================================
// DISCOUNT STATS UI
// Render UI cho section Thống Kê Giảm Giá
// =====================================================

class DiscountStatsUI {
    constructor() {
        this.currentStats = null;
        this.currentSubTab = 'overview';
        this.isLoading = false;
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
    // OVERVIEW TAB
    // ========================================

    renderOverviewTab(stats) {
        const container = document.getElementById('discountOverviewContent');
        if (!container) return;

        const s = stats.summary;
        const calc = window.discountStatsCalculator;

        container.innerHTML = `
            <!-- KPI Cards -->
            <div class="discount-kpi-grid">
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
        `;

        // Rebind threshold events
        this.bindEvents();
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
                                <td class="stt clickable" onclick="window.openEditModal && window.openEditModal('${p.orderId}')" title="Click để xem chi tiết đơn hàng">${p.orderSTT || '-'}</td>
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
                                <td class="stt clickable" onclick="window.openEditModal && window.openEditModal('${o.orderId}')" title="Click để xem chi tiết đơn hàng">${o.orderSTT || '-'}</td>
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

    // ========================================
    // ANALYSIS TAB
    // ========================================

    renderAnalysisTab(stats) {
        const container = document.getElementById('discountAnalysisContent');
        if (!container) return;

        const calc = window.discountStatsCalculator;
        const scenario = stats.scenarioAnalysis;
        const top = stats.topProducts;

        container.innerHTML = `
            <!-- Scenario Comparison -->
            <div class="analysis-section">
                <h4><i class="fas fa-balance-scale"></i> So Sánh Kịch Bản</h4>
                <div class="scenario-comparison">
                    <div class="scenario-card no-discount">
                        <div class="scenario-title">Nếu KHÔNG Giảm Giá</div>
                        <div class="scenario-row">
                            <span>Doanh thu:</span>
                            <strong>${calc.formatCurrency(scenario.noDiscount.totalRevenue)}</strong>
                        </div>
                        <div class="scenario-row">
                            <span>Lợi nhuận gộp:</span>
                            <strong>${calc.formatCurrency(scenario.noDiscount.totalProfit)}</strong>
                        </div>
                        <div class="scenario-row">
                            <span>Margin:</span>
                            <strong>${calc.formatPercent(scenario.noDiscount.marginPercent)}</strong>
                        </div>
                    </div>
                    <div class="scenario-arrow">
                        <i class="fas fa-arrow-right"></i>
                        <div class="diff-badge negative">-${calc.formatCurrency(scenario.revenueLoss)}</div>
                    </div>
                    <div class="scenario-card with-discount">
                        <div class="scenario-title">Với Giảm Giá Hiện Tại</div>
                        <div class="scenario-row">
                            <span>Doanh thu:</span>
                            <strong>${calc.formatCurrency(scenario.withDiscount.totalRevenue)}</strong>
                        </div>
                        <div class="scenario-row">
                            <span>Lợi nhuận gộp:</span>
                            <strong class="${scenario.withDiscount.totalProfit >= 0 ? 'positive' : 'negative'}">${calc.formatCurrency(scenario.withDiscount.totalProfit)}</strong>
                        </div>
                        <div class="scenario-row">
                            <span>Margin:</span>
                            <strong>${calc.formatPercent(scenario.withDiscount.marginPercent)}</strong>
                        </div>
                    </div>
                </div>
                <div class="scenario-summary">
                    <div class="summary-item">
                        <span>Doanh thu mất:</span>
                        <strong class="negative">-${calc.formatCurrency(scenario.revenueLoss)}</strong>
                    </div>
                    <div class="summary-item">
                        <span>Lợi nhuận giảm:</span>
                        <strong class="negative">-${calc.formatCurrency(scenario.profitLoss)}</strong>
                    </div>
                    <div class="summary-item">
                        <span>Margin giảm:</span>
                        <strong class="negative">-${calc.formatPercent(scenario.marginDrop)}</strong>
                    </div>
                </div>
            </div>

            <!-- Top Products -->
            <div class="analysis-section">
                <h4><i class="fas fa-trophy"></i> Top Sản Phẩm</h4>
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

            <!-- CFO Insights -->
            <div class="analysis-section cfo-insights">
                <h4><i class="fas fa-lightbulb"></i> Phân Tích CFO</h4>
                <div class="insights-list">
                    ${this.generateCFOInsights(stats)}
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
