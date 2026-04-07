// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DISCOUNT STATS CALCULATOR
// Tính toán thống kê giảm giá cho đợt live sale
// =====================================================

class DiscountStatsCalculator {
    constructor() {
        // Ngưỡng cảnh báo margin (có thể điều chỉnh)
        this.thresholds = {
            safe: 20,      // >= 20% là an toàn
            warning: 10,   // 10-20% là cảnh báo
            danger: 0,     // 0-10% là nguy hiểm
            // < 0% là lỗ vốn
        };

        // Load thresholds từ localStorage nếu có
        this.loadThresholds();
    }

    // ========================================
    // THRESHOLD MANAGEMENT
    // ========================================

    loadThresholds() {
        try {
            const saved = localStorage.getItem('orders_discount_stats_thresholds');
            if (saved) {
                const data = JSON.parse(saved);
                this.thresholds = { ...this.thresholds, ...data };
            }
        } catch (e) {
            console.warn('[DISCOUNT-STATS] Error loading thresholds:', e);
        }
    }

    saveThresholds() {
        localStorage.setItem('orders_discount_stats_thresholds', JSON.stringify(this.thresholds));
    }

    setThresholds(safe, warning) {
        this.thresholds.safe = safe;
        this.thresholds.warning = warning;
        this.saveThresholds();
    }

    // ========================================
    // PARSE DISCOUNT FROM NOTE
    // Format: "230" hoặc "230k" → 230,000đ
    // ========================================

    parseDiscountFromNote(note) {
        if (!note || typeof note !== 'string') return null;

        // Regex để tìm số tiền trong note
        // Match: 230, 230k, 230K, 1.5tr, 1,500k, etc.
        const patterns = [
            /(\d{1,3}(?:[.,]\d{3})*)\s*k/i,     // 230k, 1,500k, 1.500k
            /(\d+(?:[.,]\d+)?)\s*tr/i,           // 1.5tr, 2tr
            /(\d{1,3}(?:[.,]\d{3})+)(?!\d)/,     // 1,500,000 hoặc 1.500.000
            /\b(\d{2,3})\b(?!\d)/,               // 230, 85 (2-3 chữ số đứng riêng)
        ];

        for (const pattern of patterns) {
            const match = note.match(pattern);
            if (match) {
                let value = match[1].replace(/[.,]/g, '');
                value = parseFloat(value);

                if (isNaN(value)) continue;

                // Xác định đơn vị
                if (/k/i.test(match[0])) {
                    return value * 1000; // 230k → 230,000
                } else if (/tr/i.test(match[0])) {
                    return value * 1000000; // 1.5tr → 1,500,000
                } else if (value >= 1000000) {
                    return value; // Đã là số đầy đủ
                } else if (value >= 100 && value < 1000) {
                    // 230 → 230,000 (giả định đơn vị nghìn)
                    return value * 1000;
                } else if (value >= 10 && value < 100) {
                    // 85 → 85,000 (có thể là 85k)
                    return value * 1000;
                }
            }
        }

        return null;
    }

    // ========================================
    // CALCULATE PRODUCT DISCOUNT
    // ========================================

    /**
     * Tính thống kê giảm giá cho 1 sản phẩm
     * @param {object} product - Product từ order.Details
     * @param {number} listPrice - Giá bán gốc (từ productSearchManager)
     * @param {number} costPrice - Giá vốn (từ standardPriceManager)
     * @returns {object|null}
     */
    calculateProductDiscount(product, listPrice, costPrice) {
        // Parse giá giảm từ note
        const discountPrice = this.parseDiscountFromNote(product.Note);

        if (discountPrice === null) {
            return null; // Không có giảm giá
        }

        const quantity = product.Quantity || 1;

        // Tính các chỉ số
        const discountAmount = listPrice - discountPrice; // Số tiền giảm
        const profitAfterDiscount = discountPrice - costPrice; // Lợi nhuận còn lại
        const marginPercent = listPrice > 0 ? ((discountPrice - costPrice) / discountPrice) * 100 : 0;
        const discountPercent = listPrice > 0 ? (discountAmount / listPrice) * 100 : 0;

        // Xác định trạng thái rủi ro
        let riskStatus = 'safe';
        let riskIcon = '🟢';
        let riskLabel = 'An toàn';

        if (marginPercent < 0) {
            riskStatus = 'loss';
            riskIcon = '⚫';
            riskLabel = 'Lỗ vốn';
        } else if (marginPercent < this.thresholds.warning) {
            riskStatus = 'danger';
            riskIcon = '🔴';
            riskLabel = 'Nguy hiểm';
        } else if (marginPercent < this.thresholds.safe) {
            riskStatus = 'warning';
            riskIcon = '🟡';
            riskLabel = 'Cảnh báo';
        }

        return {
            productId: product.ProductId,
            productCode: product.Code || '',
            productName: product.Name || '',
            quantity: quantity,
            listPrice: listPrice,           // Giá bán gốc
            costPrice: costPrice,           // Giá vốn
            discountPrice: discountPrice,   // Giá sau giảm (từ note)
            discountAmount: discountAmount, // Số tiền giảm = Giá bán - Giá giảm
            discountPercent: discountPercent, // % giảm
            profitPerUnit: profitAfterDiscount, // Lợi nhuận/SP
            totalDiscount: discountAmount * quantity, // Tổng tiền giảm
            totalProfit: profitAfterDiscount * quantity, // Tổng lợi nhuận
            marginPercent: marginPercent,   // Margin % sau giảm
            riskStatus: riskStatus,
            riskIcon: riskIcon,
            riskLabel: riskLabel,
            note: product.Note,
        };
    }

    // ========================================
    // CALCULATE ORDER DISCOUNT
    // ========================================

    /**
     * Tính thống kê giảm giá cho 1 đơn hàng
     * @param {object} order - Order với Details[]
     * @returns {object}
     */
    async calculateOrderDiscount(order) {
        const products = [];
        let totalListPrice = 0;
        let totalCostPrice = 0;
        let totalDiscountPrice = 0;
        let totalDiscountAmount = 0;
        let totalProfit = 0;
        let discountedProductCount = 0;

        if (!order.Details || !Array.isArray(order.Details)) {
            return {
                orderId: order.Id,
                orderCode: order.Code,
                orderSTT: order.SessionIndex || null,
                customerName: order.Name,
                products: [],
                summary: {
                    totalListPrice: 0,
                    totalCostPrice: 0,
                    totalDiscountPrice: 0,
                    totalDiscountAmount: 0,
                    totalProfit: 0,
                    discountedProductCount: 0,
                    averageDiscountPercent: 0,
                    averageMarginPercent: 0,
                    riskStatus: 'none',
                    riskIcon: '⚪',
                    riskLabel: 'Không có giảm giá',
                }
            };
        }

        // Ensure managers are loaded
        if (window.standardPriceManager && !window.standardPriceManager.isReady()) {
            await window.standardPriceManager.fetchProducts();
        }

        for (const detail of order.Details) {
            const productId = detail.ProductId;
            const quantity = detail.Quantity || 1;

            // Lấy giá bán gốc
            let listPrice = detail.Price || 0;
            if (window.productSearchManager) {
                const excelProduct = window.productSearchManager.excelProducts.find(p => p.Id === productId);
                if (excelProduct && excelProduct.Price) {
                    listPrice = excelProduct.Price;
                }
            }

            // Lấy giá vốn và thông tin sản phẩm từ standardPriceManager
            let costPrice = 0;
            let productInfo = null;
            if (window.standardPriceManager) {
                productInfo = window.standardPriceManager.getById(productId);
                costPrice = productInfo?.CostPrice || 0;
            }

            // Tính discount nếu có
            const discountData = this.calculateProductDiscount(detail, listPrice, costPrice);

            if (discountData) {
                // Thêm thông tin đơn hàng vào sản phẩm để hiển thị trong tab Chi Tiết SP
                discountData.orderId = order.Id;
                discountData.orderSTT = order.SessionIndex || null;

                // Lấy productCode và productName từ nhiều nguồn (ưu tiên standardPriceManager > detail)
                // detail có thể có: ProductName, ProductCode, Name, Code
                discountData.productCode = productInfo?.Code || detail.ProductCode || detail.Code || '';
                discountData.productName = productInfo?.Name || detail.ProductName || detail.Name || detail.ProductNameGet || '';

                products.push(discountData);
                totalListPrice += listPrice * quantity;
                totalCostPrice += costPrice * quantity;
                totalDiscountPrice += discountData.discountPrice * quantity;
                totalDiscountAmount += discountData.totalDiscount;
                totalProfit += discountData.totalProfit;
                discountedProductCount++;
            }
        }

        // Tính summary
        const averageDiscountPercent = totalListPrice > 0
            ? (totalDiscountAmount / totalListPrice) * 100
            : 0;
        const averageMarginPercent = totalDiscountPrice > 0
            ? ((totalDiscountPrice - totalCostPrice) / totalDiscountPrice) * 100
            : 0;

        // Xác định risk status của đơn hàng
        let riskStatus = 'none';
        let riskIcon = '⚪';
        let riskLabel = 'Không có giảm giá';

        if (discountedProductCount > 0) {
            if (totalProfit < 0) {
                riskStatus = 'loss';
                riskIcon = '⚫';
                riskLabel = 'Lỗ vốn';
            } else if (averageMarginPercent < this.thresholds.warning) {
                riskStatus = 'danger';
                riskIcon = '🔴';
                riskLabel = 'Nguy hiểm';
            } else if (averageMarginPercent < this.thresholds.safe) {
                riskStatus = 'warning';
                riskIcon = '🟡';
                riskLabel = 'Cảnh báo';
            } else {
                riskStatus = 'safe';
                riskIcon = '🟢';
                riskLabel = 'An toàn';
            }
        }

        return {
            orderId: order.Id,
            orderCode: order.Code,
            orderSTT: order.SessionIndex || null,
            customerName: order.Name,
            products: products,
            summary: {
                totalListPrice: totalListPrice,
                totalCostPrice: totalCostPrice,
                totalDiscountPrice: totalDiscountPrice,
                totalDiscountAmount: totalDiscountAmount,
                totalProfit: totalProfit,
                discountedProductCount: discountedProductCount,
                averageDiscountPercent: averageDiscountPercent,
                averageMarginPercent: averageMarginPercent,
                riskStatus: riskStatus,
                riskIcon: riskIcon,
                riskLabel: riskLabel,
            }
        };
    }

    // ========================================
    // CALCULATE LIVE SESSION STATS
    // ========================================

    /**
     * Tính thống kê tổng hợp cho toàn bộ đợt live
     * @param {Array} orders - Danh sách đơn hàng
     * @returns {object}
     */
    async calculateLiveSessionStats(orders) {
        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            return this.getEmptyStats();
        }

        // Ensure managers are loaded
        if (window.standardPriceManager && !window.standardPriceManager.isReady()) {
            await window.standardPriceManager.fetchProducts();
        }

        const orderResults = [];
        const allProducts = [];

        // Summary counters
        let totalListPrice = 0;
        let totalCostPrice = 0;
        let totalDiscountPrice = 0;
        let totalDiscountAmount = 0;
        let totalProfit = 0;
        let totalDiscountedProducts = 0;
        let ordersWithDiscount = 0;
        let ordersWithLoss = 0;

        // Risk category counters
        const riskCategories = {
            safe: { count: 0, products: [] },
            warning: { count: 0, products: [] },
            danger: { count: 0, products: [] },
            loss: { count: 0, products: [] },
        };

        // Process each order
        for (const order of orders) {
            const orderData = await this.calculateOrderDiscount(order);
            orderResults.push(orderData);

            if (orderData.summary.discountedProductCount > 0) {
                ordersWithDiscount++;
                totalListPrice += orderData.summary.totalListPrice;
                totalCostPrice += orderData.summary.totalCostPrice;
                totalDiscountPrice += orderData.summary.totalDiscountPrice;
                totalDiscountAmount += orderData.summary.totalDiscountAmount;
                totalProfit += orderData.summary.totalProfit;
                totalDiscountedProducts += orderData.summary.discountedProductCount;

                if (orderData.summary.totalProfit < 0) {
                    ordersWithLoss++;
                }

                // Categorize products by risk
                for (const product of orderData.products) {
                    allProducts.push(product);
                    if (riskCategories[product.riskStatus]) {
                        riskCategories[product.riskStatus].count++;
                        riskCategories[product.riskStatus].products.push(product);
                    }
                }
            }
        }

        // Calculate averages
        const averageDiscountPercent = totalListPrice > 0
            ? (totalDiscountAmount / totalListPrice) * 100
            : 0;
        const averageMarginPercent = totalDiscountPrice > 0
            ? ((totalDiscountPrice - totalCostPrice) / totalDiscountPrice) * 100
            : 0;

        // Find top/bottom products
        const sortedByDiscount = [...allProducts].sort((a, b) => b.discountAmount - a.discountAmount);
        const sortedByProfit = [...allProducts].sort((a, b) => b.profitPerUnit - a.profitPerUnit);

        // Scenario analysis: Nếu không giảm giá
        const scenarioNoDiscount = {
            totalRevenue: totalListPrice,
            totalProfit: totalListPrice - totalCostPrice,
            marginPercent: totalListPrice > 0
                ? ((totalListPrice - totalCostPrice) / totalListPrice) * 100
                : 0,
        };

        // Scenario: Với giảm giá
        const scenarioWithDiscount = {
            totalRevenue: totalDiscountPrice,
            totalProfit: totalProfit,
            marginPercent: averageMarginPercent,
        };

        // Calculate discount ROI
        const discountROI = totalDiscountAmount > 0
            ? totalProfit / totalDiscountAmount
            : 0;

        // Break-even discount %
        const breakEvenDiscountPercent = totalListPrice > 0 && totalCostPrice > 0
            ? ((totalListPrice - totalCostPrice) / totalListPrice) * 100
            : 0;

        return {
            // Summary KPIs
            summary: {
                totalOrders: orders.length,
                ordersWithDiscount: ordersWithDiscount,
                ordersWithLoss: ordersWithLoss,
                totalDiscountedProducts: totalDiscountedProducts,
                totalListPrice: totalListPrice,
                totalCostPrice: totalCostPrice,
                totalDiscountPrice: totalDiscountPrice,
                totalDiscountAmount: totalDiscountAmount,
                totalProfit: totalProfit,
                averageDiscountPercent: averageDiscountPercent,
                averageMarginPercent: averageMarginPercent,
                discountROI: discountROI,
                breakEvenDiscountPercent: breakEvenDiscountPercent,
            },

            // Risk analysis
            riskAnalysis: {
                categories: riskCategories,
                safePercent: totalDiscountedProducts > 0
                    ? (riskCategories.safe.count / totalDiscountedProducts) * 100
                    : 0,
                warningPercent: totalDiscountedProducts > 0
                    ? (riskCategories.warning.count / totalDiscountedProducts) * 100
                    : 0,
                dangerPercent: totalDiscountedProducts > 0
                    ? (riskCategories.danger.count / totalDiscountedProducts) * 100
                    : 0,
                lossPercent: totalDiscountedProducts > 0
                    ? (riskCategories.loss.count / totalDiscountedProducts) * 100
                    : 0,
            },

            // Scenario comparison
            scenarioAnalysis: {
                noDiscount: scenarioNoDiscount,
                withDiscount: scenarioWithDiscount,
                revenueLoss: scenarioNoDiscount.totalRevenue - scenarioWithDiscount.totalRevenue,
                profitLoss: scenarioNoDiscount.totalProfit - scenarioWithDiscount.totalProfit,
                marginDrop: scenarioNoDiscount.marginPercent - scenarioWithDiscount.marginPercent,
            },

            // Top/Bottom products
            topProducts: {
                mostDiscounted: sortedByDiscount.slice(0, 5),
                leastDiscounted: sortedByDiscount.slice(-5).reverse(),
                mostProfit: sortedByProfit.slice(0, 5),
                leastProfit: sortedByProfit.slice(-5).reverse(),
            },

            // Detailed data
            orders: orderResults,
            products: allProducts,

            // Thresholds used
            thresholds: { ...this.thresholds },

            // Timestamp
            calculatedAt: new Date().toISOString(),
        };
    }

    getEmptyStats() {
        return {
            summary: {
                totalOrders: 0,
                ordersWithDiscount: 0,
                ordersWithLoss: 0,
                totalDiscountedProducts: 0,
                totalListPrice: 0,
                totalCostPrice: 0,
                totalDiscountPrice: 0,
                totalDiscountAmount: 0,
                totalProfit: 0,
                averageDiscountPercent: 0,
                averageMarginPercent: 0,
                discountROI: 0,
                breakEvenDiscountPercent: 0,
            },
            riskAnalysis: {
                categories: { safe: { count: 0, products: [] }, warning: { count: 0, products: [] }, danger: { count: 0, products: [] }, loss: { count: 0, products: [] } },
                safePercent: 0,
                warningPercent: 0,
                dangerPercent: 0,
                lossPercent: 0,
            },
            scenarioAnalysis: {
                noDiscount: { totalRevenue: 0, totalProfit: 0, marginPercent: 0 },
                withDiscount: { totalRevenue: 0, totalProfit: 0, marginPercent: 0 },
                revenueLoss: 0,
                profitLoss: 0,
                marginDrop: 0,
            },
            topProducts: {
                mostDiscounted: [],
                leastDiscounted: [],
                mostProfit: [],
                leastProfit: [],
            },
            orders: [],
            products: [],
            thresholds: { ...this.thresholds },
            calculatedAt: new Date().toISOString(),
        };
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Format số tiền
     */
    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '-';
        return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
    }

    /**
     * Format phần trăm
     */
    formatPercent(value) {
        if (value === null || value === undefined) return '-';
        return value.toFixed(1) + '%';
    }

    /**
     * Format số lượng với K/M
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(0) + 'K';
        }
        return num.toString();
    }
}

// Create global instance — singleton guard
if (!window.discountStatsCalculator) {
    window.discountStatsCalculator = new DiscountStatsCalculator();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiscountStatsCalculator;
}
