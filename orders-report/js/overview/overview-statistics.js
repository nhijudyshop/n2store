// =====================================================
// OVERVIEW - STATISTICS: Tag & Employee Statistics
// =====================================================

// STATISTICS FUNCTIONS
// =====================================================

/**
 * Helper function to convert Firebase object to array if needed
 */
function normalizeEmployeeRanges(data) {
    if (!data) return [];

    // If already an array, return it
    if (Array.isArray(data)) {
        return data;
    }

    // If it's an object, convert to array
    if (typeof data === 'object') {
        const result = [];
        // Get all numeric keys and sort them
        const keys = Object.keys(data).filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));
        for (const key of keys) {
            result.push(data[key]);
        }
        return result;
    }

    return [];
}

/**
 * Load employee ranges from Firestore
 */
async function loadEmployeeRanges() {
    if (!database) return;

    try {
        // Only load campaign-specific ranges (no general config)
        if (currentTableName) {
            const safeName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
            const campaignDoc = await database.collection('settings').doc('employee_ranges_by_campaign').get();
            if (campaignDoc.exists) {
                const campaignData = campaignDoc.data();
                if (campaignData && campaignData[safeName]) {
                    employeeRanges = normalizeEmployeeRanges(campaignData[safeName]);
                    return;
                }
            }
        }

        // No campaign or no config found for this campaign
        employeeRanges = [];
    } catch (error) {
        console.error('[REPORT] ❌ Error loading employee ranges:', error);
        employeeRanges = [];
    }
}

/**
 * Load available tags from Firebase (cached from TPOS)
 */
async function loadAvailableTagsFromFirebase() {
    if (!database) return;

    try {
        const snapshot = await database.collection('settings').doc('tags').get();
        const data = snapshot.exists ? snapshot.data() : null;
        availableTags = data?.tags || [];
    } catch (error) {
        console.error('[REPORT] ❌ Error loading available tags:', error);
        availableTags = [];
    }
}

/**
 * Load tracked tags settings from Firebase
 */
async function loadTrackedTags() {
    if (!database) return;

    try {
        const snapshot = await database.collection('settings').doc('tracked_tags').get();
        const data = snapshot.exists ? snapshot.data() : null;
        const saved = data?.tags;
        if (saved && Array.isArray(saved)) {
            trackedTags = saved;
        } else {
            trackedTags = [...DEFAULT_TRACKED_TAGS];
        }
    } catch (error) {
        console.error('[REPORT] ❌ Error loading tracked tags:', error);
        trackedTags = [...DEFAULT_TRACKED_TAGS];
    }
}

/**
 * Save tracked tags to Firebase
 */
async function saveTrackedTags() {
    if (!database) return;

    try {
        await database.collection('settings').doc('tracked_tags').set({ tags: trackedTags });
    } catch (error) {
        console.error('[REPORT] ❌ Error saving tracked tags:', error);
    }
}

/**
 * Request employee ranges from Tab1 and save to Firebase
 */
async function requestAndSaveEmployeeRanges() {
    return new Promise((resolve) => {
        // Set up one-time listener for response
        const handler = async (event) => {
            if (event.data.type === 'EMPLOYEE_RANGES_RESPONSE') {
                window.removeEventListener('message', handler);

                const ranges = event.data.ranges || [];
                if (ranges.length > 0 && database && currentTableName) {
                    try {
                        // Save to campaign-specific path using Firestore
                        const safeName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
                        await database.collection('settings').doc('employee_ranges_by_campaign').set(
                            { [safeName]: ranges },
                            { merge: true }
                        );
                    } catch (error) {
                        console.error('[REPORT] ❌ Error saving employee ranges:', error);
                    }
                }

                resolve(ranges);
            }
        };

        window.addEventListener('message', handler);

        // Request employee ranges from Tab1
        window.parent.postMessage({
            type: 'REQUEST_EMPLOYEE_RANGES'
        }, '*');

        // Timeout after 5 seconds
        setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve([]);
        }, 5000);
    });
}

/**
 * Get employee name by STT
 */
function getEmployeeBySTT(stt) {
    if (!stt || !employeeRanges.length) return null;

    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range;
        }
    }
    return null;
}

/**
 * Match tag name against pattern
 */
function matchTagPattern(tagName, pattern) {
    if (!tagName || !pattern) return false;

    const normalizedTag = tagName.toLowerCase().trim();
    const normalizedPattern = pattern.pattern.toLowerCase().trim();

    if (pattern.type === 'exact') {
        return normalizedTag === normalizedPattern;
    } else if (pattern.type === 'startsWith') {
        return normalizedTag.startsWith(normalizedPattern);
    }
    return false;
}

/**
 * Parse order tags from JSON or comma-separated string
 */
function parseOrderTags(tagsData) {
    try {
        if (!tagsData) return [];
        if (Array.isArray(tagsData)) return tagsData;

        if (typeof tagsData === 'string') {
            // Try to parse as JSON first
            try {
                const parsed = JSON.parse(tagsData);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) {
                // Not JSON - treat as comma-separated string (from Excel)
                return tagsData.split(',').map(t => t.trim()).filter(t => t).map(name => ({
                    Name: name,
                    name: name
                }));
            }
        }
        return [];
    } catch (e) {
        return [];
    }
}

// =====================================================
// TAG XL STATISTICS (replaces TPOS tag-based statistics)
// =====================================================

/**
 * Shared helper: compute tag XL counts from a subset of orders
 * Returns detailed breakdown by category, sub-state, sub-tag, and selected flags
 */
function computeTagXLCounts(orderSubset, ptagMap) {
    const total = orderSubset.length;
    const catCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const catAmounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const catOrders = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    const subStateCounts = { OKIE_CHO_DI_DON: 0, CHO_HANG: 0 };
    const subStateAmounts = { OKIE_CHO_DI_DON: 0, CHO_HANG: 0 };
    const subStateOrders = { OKIE_CHO_DI_DON: [], CHO_HANG: [] };
    const subTagCounts = {};
    const subTagAmounts = {};
    const subTagOrders = {};
    // Initialize sub-tag counters
    for (const key of Object.keys(PTAG_SUBTAGS_META)) {
        subTagCounts[key] = 0;
        subTagAmounts[key] = 0;
        subTagOrders[key] = [];
    }
    // Flag counters (only the 3 displayed: CHO_LIVE, QUA_LAY+GIU_DON, GIAM_GIA)
    const flagCounts = { CHO_LIVE: 0, QUA_LAY_GIU_DON: 0, GIAM_GIA: 0 };
    const flagAmounts = { CHO_LIVE: 0, QUA_LAY_GIU_DON: 0, GIAM_GIA: 0 };
    const flagOrders = { CHO_LIVE: [], QUA_LAY_GIU_DON: [], GIAM_GIA: [] };

    const untaggedOrders = [];
    let untaggedAmount = 0;

    // GIỎ TRỐNG validation
    let hasGioTrongValidationError = false;
    const gioTrongInvalidOrders = [];

    orderSubset.forEach(order => {
        const code = String(order.Code || '');
        const amount = order.TotalAmount || 0;
        const tagData = ptagMap[code];
        const productCount = order.Details?.length || 0;

        if (!tagData || tagData.category === null || tagData.category === undefined) {
            untaggedOrders.push(order);
            untaggedAmount += amount;
            return;
        }

        const cat = tagData.category;
        if (catCounts[cat] !== undefined) {
            catCounts[cat]++;
            catAmounts[cat] += amount;
            catOrders[cat].push(order);
        }

        // Sub-states for cat 1
        if (cat === 1) {
            const ss = tagData.subState || 'OKIE_CHO_DI_DON';
            if (subStateCounts[ss] !== undefined) {
                subStateCounts[ss]++;
                subStateAmounts[ss] += amount;
                subStateOrders[ss].push(order);
            }
        }

        // Sub-tags for cat 2, 3, 4
        if ((cat === 2 || cat === 3 || cat === 4) && tagData.subTag) {
            if (subTagCounts[tagData.subTag] !== undefined) {
                subTagCounts[tagData.subTag]++;
                subTagAmounts[tagData.subTag] += amount;
                subTagOrders[tagData.subTag].push(order);
            }
        }

        // Flags (count across all categories)
        const flags = tagData.flags || [];
        if (flags.includes('CHO_LIVE')) {
            flagCounts.CHO_LIVE++;
            flagAmounts.CHO_LIVE += amount;
            flagOrders.CHO_LIVE.push(order);
        }
        if (flags.includes('QUA_LAY') || flags.includes('GIU_DON')) {
            flagCounts.QUA_LAY_GIU_DON++;
            flagAmounts.QUA_LAY_GIU_DON += amount;
            flagOrders.QUA_LAY_GIU_DON.push(order);
        }
        if (flags.includes('GIAM_GIA')) {
            flagCounts.GIAM_GIA++;
            flagAmounts.GIAM_GIA += amount;
            flagOrders.GIAM_GIA.push(order);
        }

        // GIỎ TRỐNG validation
        const isGioTrong = cat === 3 && tagData.subTag === 'GIO_TRONG';
        const isGop = cat === 3 && tagData.subTag === 'DA_GOP_KHONG_CHOT';
        if (isGioTrong && productCount > 0) {
            hasGioTrongValidationError = true;
            gioTrongInvalidOrders.push(order);
        }
        if (productCount === 0 && !isGioTrong && !isGop) {
            hasGioTrongValidationError = true;
            gioTrongInvalidOrders.push(order);
        }
    });

    // Badge: đơn chốt = cat 0 (ĐÃ RA ĐƠN) + cat 1 (CHỜ ĐI ĐƠN) + cat 2 (XỬ LÝ)
    const donChot = catCounts[0] + catCounts[1] + catCounts[2];

    return {
        total, catCounts, catAmounts, catOrders,
        subStateCounts, subStateAmounts, subStateOrders,
        subTagCounts, subTagAmounts, subTagOrders,
        flagCounts, flagAmounts, flagOrders,
        untaggedOrders, untaggedAmount,
        hasGioTrongValidationError, gioTrongInvalidOrders,
        badges: { total, donChot }
    };
}

/**
 * Calculate tag XL statistics from orders + processingTagsMap
 */
function calculateTagXLStats(orders) {
    return computeTagXLCounts(orders, processingTagsMap);
}

/**
 * Update the Live Stats badges in the header (Tag XL version)
 */
function updateLiveStatsBadges(badges) {
    const badgeTotalDon = document.getElementById('badgeTotalDon');
    const badgeDonChot = document.getElementById('badgeDonChot');

    if (badgeTotalDon) badgeTotalDon.textContent = `${badges.total} ĐƠN`;
    if (badgeDonChot) {
        badgeDonChot.textContent = `${badges.donChot} ĐƠN CHỐT`;
        badgeDonChot.classList.remove('mismatch');
        // Always green — donChot = cat 0 + cat 1 + cat 2
        badgeDonChot.style.background = '#22c55e';
    }
}

/**
 * Build mini-summary HTML: 6 items showing category counts inline
 * Used in both global header and employee header
 */
function _buildMiniSummary(stats) {
    const untagged = stats.untaggedOrders.length;
    let html = '';

    // Line 2: ⚠️ CHƯA GÁN TAG XL (only if > 0)
    if (untagged > 0) {
        html += `<div style="margin-top:6px;"><span style="background:#fef2f2; color:#dc2626; padding:4px 12px; border-radius:8px; font-size:14px; font-weight:700;">⚠️ Chưa gán: ${untagged}</span></div>`;
    }

    // Line 3: 5 categories with names
    const catItems = [];
    for (let cat = 0; cat <= 4; cat++) {
        const meta = PTAG_CATEGORY_META[cat];
        const count = stats.catCounts[cat];
        let label = `${meta.emoji} ${meta.short}: <strong>${count}</strong>`;
        if (cat === 1) {
            label = `${meta.emoji} ${meta.short}: <strong>${count}</strong> (${stats.subStateCounts.OKIE_CHO_DI_DON} Okie, ${stats.subStateCounts.CHO_HANG} Chờ)`;
        }
        catItems.push(`<span style="color:${meta.color}; font-size:14px; font-weight:600;">${label}</span>`);
    }
    html += `<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:5px;">${catItems.join('<span style="color:#d1d5db;">|</span>')}</div>`;

    return html;
}

/**
 * Get mismatch reason for employee badge (Tag XL version)
 * Y = tính toán (tổng - giỏ trống - gộp)
 * H = thực tế (cat 0 + cat 1 + cat 2 + cat 4)
 */
function getMismatchReason(Y, H, untaggedOrders) {
    const reasons = [];

    if (Y !== H) {
        const diff = Y - H;
        if (diff > 0) {
            reasons.push({
                type: 'missing_tags',
                text: `Thiếu ${diff} đơn chưa gắn tag XL`,
                count: untaggedOrders.length,
                orders: untaggedOrders
            });
        } else {
            reasons.push({
                type: 'excess_tags',
                text: `Dư ${Math.abs(diff)} tag chốt`,
                count: Math.abs(diff),
                orders: []
            });
        }
    }

    return reasons;
}

// Legacy getMismatchReason compatibility (old signature)
// kept for renderStatistics() legacy function
function _legacyGetMismatchReason(Y, H, hasUnacceptableDuplicate, duplicateOrders, wrongTagOrders) {
    const reasons = [];

    if (Y !== H) {
        const diff = Y - H;
        if (diff > 0) {
            reasons.push({
                type: 'missing_tags',
                text: `Thiếu ${diff} đơn chưa gắn tag chốt`,
                count: wrongTagOrders.length,
                orders: wrongTagOrders
            });
        } else {
            reasons.push({
                type: 'excess_tags',
                text: `Dư ${Math.abs(diff)} tag chốt`,
                count: Math.abs(diff),
                orders: []
            });
        }
    }

    if (hasUnacceptableDuplicate && duplicateOrders.length > 0) {
        reasons.push({
            type: 'duplicate',
            text: `${duplicateOrders.length} đơn tag trùng không hợp lệ`,
            count: duplicateOrders.length,
            orders: duplicateOrders
        });
    }

    return reasons;
}

/**
 * Calculate employee-based tag XL statistics
 */
function calculateEmployeeTagXLStats(orders) {
    if (!employeeRanges.length) return [];

    return employeeRanges.map(emp => {
        const empOrders = orders.filter(order => {
            const stt = parseInt(order.SessionIndex || 0);
            return stt >= emp.start && stt <= emp.end;
        });

        if (empOrders.length === 0) return null;

        const stats = computeTagXLCounts(empOrders, processingTagsMap);

        return {
            name: emp.name,
            start: emp.start,
            end: emp.end,
            totalOrders: empOrders.length,
            stats: stats,
            allOrders: empOrders,
            badges: stats.badges
        };
    }).filter(e => e !== null && e.totalOrders > 0);
}

// =====================================================
// LEGACY TPOS FUNCTIONS (kept for "Chi tiết đã tải" tab)
// =====================================================

// Predefined tags for Live Order Statistics (LEGACY — used by renderStatistics only)
const LIVE_STAT_TAGS = [
    { key: 'ordered', displayName: 'ĐÃ RA ĐƠN', color: '#22c55e', isSpecial: true, countAsChot: true },
    { key: 'cho_hang_ve', patterns: ['chờ hàng về', 'chờ hàng'], displayName: 'CHỜ HÀNG VỀ', color: '#6366f1', countAsChot: true },
    { key: 'xa_don', patterns: ['xả đơn', 'xã đơn'], displayName: 'XẢ ĐƠN', color: '#14b8a6', countAsChot: true },
    { key: 'ok', patterns: ['ok'], displayName: 'OK', color: '#22c55e', countAsChot: true },
    { key: 'xu_ly', patterns: ['xử lý'], displayName: 'XỬ LÝ', color: '#f97316', countAsChot: true },
    { key: 'cho_live', patterns: ['chờ live'], displayName: 'CHỜ LIVE', color: '#ec4899', countAsChot: true },
    { key: 'qua_lay', patterns: ['qua lấy'], displayName: 'QUA LẤY', color: '#3b82f6', countAsChot: true },
    { key: 'gio_trong', patterns: ['giỏ trống'], displayName: 'GIỎ TRỐNG', color: '#f59e0b', countAsChot: false },
    { key: 'gop', patterns: ['đã gộp ko chốt', 'đã gộp không chốt'], displayName: 'GỘP', color: '#8b5cf6', countAsChot: false }
];

/**
 * LEGACY: Calculate tag statistics from TPOS tags
 */
function calculateTagStats(orders) {
    const totalOrders = orders.length;
    const tagStatsMap = new Map();
    LIVE_STAT_TAGS.forEach(tag => {
        tagStatsMap.set(tag.key, {
            pattern: tag.key, type: tag.isSpecial ? 'special' : 'tag',
            displayName: tag.displayName, color: tag.color, count: 0,
            totalAmount: 0, orders: [], isSpecial: tag.isSpecial || false, countAsChot: tag.countAsChot
        });
    });
    const ordersPerCategory = new Map();
    LIVE_STAT_TAGS.forEach(tag => ordersPerCategory.set(tag.key, new Set()));
    const orderTagsMap = new Map();

    orders.forEach(order => {
        const orderTags = parseOrderTags(order.Tags);
        const orderAmount = order.TotalAmount || 0;
        const statusText = order.StatusText || order.Status || '';
        const orderId = order.Id || order.Code;
        if (!orderTagsMap.has(orderId)) orderTagsMap.set(orderId, { tagKeys: new Set(), order });

        if (statusText === 'Đơn hàng') {
            const stat = tagStatsMap.get('ordered');
            if (!ordersPerCategory.get('ordered').has(orderId)) {
                ordersPerCategory.get('ordered').add(orderId);
                stat.count++; stat.totalAmount += orderAmount; stat.orders.push(order);
            }
            orderTagsMap.get(orderId).tagKeys.add('ordered');
        }

        orderTags.forEach(orderTag => {
            const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();
            if (!tagName) return;
            LIVE_STAT_TAGS.forEach(liveTag => {
                if (liveTag.isSpecial) return;
                if ((liveTag.patterns || []).some(p => tagName.startsWith(p))) {
                    const stat = tagStatsMap.get(liveTag.key);
                    if (!ordersPerCategory.get(liveTag.key).has(orderId)) {
                        ordersPerCategory.get(liveTag.key).add(orderId);
                        stat.count++; stat.totalAmount += orderAmount; stat.orders.push(order);
                    }
                    orderTagsMap.get(orderId).tagKeys.add(liveTag.key);
                }
            });
        });
    });

    const allStats = [];
    tagStatsMap.forEach((stat) => {
        stat.percentage = totalOrders > 0 ? ((stat.count / totalOrders) * 100).toFixed(1) : 0;
        allStats.push(stat);
    });

    const wrongTagOrders = [];
    orderTagsMap.forEach((data) => { if (data.tagKeys.size === 0) wrongTagOrders.push(data.order); });
    allStats.push({
        pattern: 'gan_sai_tag', key: 'gan_sai_tag', type: 'wrong_tag', displayName: 'GẮN SAI TAG',
        color: wrongTagOrders.length > 0 ? '#ef4444' : '#22c55e', count: wrongTagOrders.length,
        totalAmount: wrongTagOrders.reduce((s, o) => s + (o.TotalAmount || 0), 0), orders: wrongTagOrders,
        isWrongTag: true, hasError: wrongTagOrders.length > 0,
        percentage: totalOrders > 0 ? ((wrongTagOrders.length / totalOrders) * 100).toFixed(1) : 0
    });

    return allStats;
}

/** LEGACY: alias for backward compatibility */
function calculateEmployeeTagStats(orders) {
    return calculateEmployeeTagStats_legacy(orders);
}

function calculateEmployeeTagStats_legacy(orders) {
    if (!employeeRanges.length) return [];

    const employeeStats = [];

    employeeRanges.forEach(emp => {
        const empOrders = orders.filter(order => {
            const stt = parseInt(order.SessionIndex || 0);
            return stt >= emp.start && stt <= emp.end;
        });

        if (empOrders.length === 0) return;

        const totalOrders = empOrders.length;

        // Initialize stats for each predefined tag (same as main tag stats)
        const tagStatsMap = new Map();
        LIVE_STAT_TAGS.forEach(tag => {
            tagStatsMap.set(tag.key, {
                key: tag.key,
                displayName: tag.displayName,
                color: tag.color,
                count: 0,
                totalAmount: 0,
                orders: [],
                isSpecial: tag.isSpecial || false,
                countAsChot: tag.countAsChot
            });
        });

        // Track unique orders per category
        const ordersPerCategory = new Map();
        LIVE_STAT_TAGS.forEach(tag => {
            ordersPerCategory.set(tag.key, new Set());
        });

        // Track duplicate tags per order for this employee
        const orderTagsMap = new Map();

        // Count orders for each category
        empOrders.forEach(order => {
            const orderTags = parseOrderTags(order.Tags);
            const orderAmount = order.TotalAmount || 0;
            const statusText = order.StatusText || order.Status || '';
            const orderId = order.Id || order.Code;

            // Initialize tag set for this order
            if (!orderTagsMap.has(orderId)) {
                orderTagsMap.set(orderId, { tagKeys: new Set(), order: order });
            }

            // Check for Ordered status (ĐÃ RA ĐƠN)
            if (statusText === 'Đơn hàng') {
                const stat = tagStatsMap.get('ordered');
                if (!ordersPerCategory.get('ordered').has(orderId)) {
                    ordersPerCategory.get('ordered').add(orderId);
                    stat.count++;
                    stat.totalAmount += orderAmount;
                    stat.orders.push(order);
                }
                // Mark this order as having a valid tag (ĐÃ RA ĐƠN counts)
                orderTagsMap.get(orderId).tagKeys.add('ordered');
            }

            // Check each order's tags against predefined patterns
            orderTags.forEach(orderTag => {
                const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();
                if (!tagName) return;

                LIVE_STAT_TAGS.forEach(liveTag => {
                    if (liveTag.isSpecial) return;

                    const patterns = liveTag.patterns || [];
                    const matches = patterns.some(p => tagName.startsWith(p));

                    if (matches) {
                        const stat = tagStatsMap.get(liveTag.key);
                        if (!ordersPerCategory.get(liveTag.key).has(orderId)) {
                            ordersPerCategory.get(liveTag.key).add(orderId);
                            stat.count++;
                            stat.totalAmount += orderAmount;
                            stat.orders.push(order);
                        }
                        // Track for duplicate detection
                        orderTagsMap.get(orderId).tagKeys.add(liveTag.key);
                    }
                });
            });
        });

        // Find duplicate orders for this employee
        // NOTE: Now includes 'ordered' status as a tag for duplicate checking
        const duplicateOrders = [];
        let hasUnacceptableDuplicate = false;

        const isAcceptableDuplicate = (tagKeys) => {
            const keys = Array.from(tagKeys);
            if (keys.length !== 2) return false;
            const sorted = keys.sort().join(',');
            return sorted === 'cho_hang_ve,cho_live' || sorted === 'cho_hang_ve,qua_lay';
        };

        orderTagsMap.forEach((data, orderId) => {
            // Include 'ordered' when checking for duplicates (ĐÃ RA ĐƠN counts as a tag)
            const tagKeys = data.tagKeys;

            if (tagKeys.size > 1) {
                duplicateOrders.push({ ...data.order, _matchedTagKeys: Array.from(tagKeys) });
                if (!isAcceptableDuplicate(tagKeys)) {
                    hasUnacceptableDuplicate = true;
                }
            }
        });

        // Validate GIỎ TRỐNG logic for this employee
        let hasGioTrongValidationError = false;
        const gioTrongInvalidOrders = [];

        empOrders.forEach(order => {
            const orderId = order.Id || order.Code;
            const productCount = order.Details?.length || 0;
            const orderData = orderTagsMap.get(orderId);
            const tagKeys = orderData?.tagKeys || new Set();

            const hasGioTrongTag = tagKeys.has('gio_trong');
            const hasGopTag = tagKeys.has('gop');

            // Case 1: Has giỏ trống tag but has products
            if (hasGioTrongTag && productCount > 0) {
                hasGioTrongValidationError = true;
                gioTrongInvalidOrders.push(order);
            }

            // Case 2: No products but missing giỏ trống or gộp tag
            if (productCount === 0 && !hasGioTrongTag && !hasGopTag) {
                hasGioTrongValidationError = true;
                gioTrongInvalidOrders.push(order);
            }
        });

        // Add validation error flag to gio_trong stat
        const gioTrongStat = tagStatsMap.get('gio_trong');
        gioTrongStat.hasValidationError = hasGioTrongValidationError;
        gioTrongStat.invalidOrders = gioTrongInvalidOrders;

        // Calculate percentages and prepare tag breakdown
        const tagBreakdown = [];
        tagStatsMap.forEach((stat, key) => {
            stat.percentage = totalOrders > 0 ? ((stat.count / totalOrders) * 100).toFixed(1) : 0;
            tagBreakdown.push(stat);
        });

        // Add duplicate stat for this employee
        const duplicateStat = {
            key: 'tag_trung',
            displayName: 'TAG TRÙNG',
            color: hasUnacceptableDuplicate ? '#ef4444' : '#22c55e',
            count: duplicateOrders.length,
            totalAmount: duplicateOrders.reduce((sum, o) => sum + (o.TotalAmount || 0), 0),
            orders: duplicateOrders,
            isSpecial: false,
            isDuplicate: true,
            hasUnacceptableDuplicate: hasUnacceptableDuplicate,
            percentage: totalOrders > 0 ? ((duplicateOrders.length / totalOrders) * 100).toFixed(1) : 0
        };
        tagBreakdown.push(duplicateStat);

        // Find orders not matching any predefined tags (GẮN SAI TAG) for this employee
        const wrongTagOrders = [];
        orderTagsMap.forEach((data, orderId) => {
            if (data.tagKeys.size === 0) {
                wrongTagOrders.push(data.order);
            }
        });

        // Add "GẮN SAI TAG" stat for this employee
        const wrongTagStat = {
            key: 'gan_sai_tag',
            displayName: 'GẮN SAI TAG',
            color: wrongTagOrders.length > 0 ? '#ef4444' : '#22c55e',
            count: wrongTagOrders.length,
            totalAmount: wrongTagOrders.reduce((sum, o) => sum + (o.TotalAmount || 0), 0),
            orders: wrongTagOrders,
            isSpecial: false,
            isWrongTag: true,
            hasError: wrongTagOrders.length > 0,
            percentage: totalOrders > 0 ? ((wrongTagOrders.length / totalOrders) * 100).toFixed(1) : 0
        };
        tagBreakdown.push(wrongTagStat);

        // Calculate badge values for this employee
        const gioTrongCount = tagStatsMap.get('gio_trong').count;
        const gopCount = tagStatsMap.get('gop').count;
        const x = totalOrders;
        const Z = gioTrongCount;
        const K = gopCount;
        const Y = x - Z - K;

        // H = actual chốt count - duplicate count
        let H = 0;
        tagStatsMap.forEach((stat, key) => {
            if (stat.countAsChot) {
                H += stat.count;
            }
        });
        H = H - duplicateOrders.length;

        employeeStats.push({
            name: emp.name,
            start: emp.start,
            end: emp.end,
            totalOrders: totalOrders,
            tagBreakdown: tagBreakdown,
            allOrders: empOrders,
            // Badge values
            badgeTotal: x,
            badgeChot: Y,
            badgeGioTrong: Z,
            badgeGop: K,
            actualChot: H,
            hasUnacceptableDuplicate: hasUnacceptableDuplicate,
            // Mismatch details for debugging
            duplicateOrders: duplicateOrders,
            wrongTagOrders: wrongTagOrders,
            mismatchReason: _legacyGetMismatchReason(Y, H, hasUnacceptableDuplicate, duplicateOrders, wrongTagOrders)
        });
    });

    return employeeStats.filter(e => e.totalOrders > 0);
}

// Tag patterns for live order statistics
// Note: "ĐÃ RA ĐƠN" is tracked by Ordered status, not tag
const LIVE_TAG_PATTERNS = [
    { pattern: 'chờ hàng về', type: 'startsWith', displayName: 'CHỜ HÀNG VỀ', color: '#6366f1', countAsChot: true },
    { pattern: 'chờ hàng', type: 'startsWith', displayName: 'CHỜ HÀNG VỀ', color: '#6366f1', countAsChot: true },
    { pattern: 'giỏ trống', type: 'startsWith', displayName: 'GIỎ TRỐNG', color: '#f59e0b', countAsChot: false },
    { pattern: 'xả đơn', type: 'startsWith', displayName: 'XẢ ĐƠN', color: '#14b8a6', countAsChot: true },
    { pattern: 'xã đơn', type: 'startsWith', displayName: 'XẢ ĐƠN', color: '#14b8a6', countAsChot: true },
    { pattern: 'ok', type: 'startsWith', displayName: 'OK', color: '#22c55e', countAsChot: true },
    { pattern: 'xử lý', type: 'startsWith', displayName: 'XỬ LÝ', color: '#f97316', countAsChot: true },
    { pattern: 'chờ live', type: 'startsWith', displayName: 'CHỜ LIVE', color: '#ec4899', countAsChot: true },
    { pattern: 'đã gộp ko chốt', type: 'startsWith', displayName: 'GỘP', color: '#8b5cf6', countAsChot: false },
    { pattern: 'đã gộp không chốt', type: 'startsWith', displayName: 'GỘP', color: '#8b5cf6', countAsChot: false }
];

// Keep old name for backward compatibility
const CLOSED_TAG_PATTERNS = LIVE_TAG_PATTERNS;

/**
 * Calculate actual closed orders statistics
 */
function calculateActualClosedStats(orders) {
    const result = {
        orderedOrders: [],
        taggedOrders: new Map(), // orderId -> { order, matchedTags[] }
        duplicateOrders: [], // Orders with 2+ closed tags
        remainingOrders: [], // Orders not in any category
        breakdown: {
            ordered: { count: 0, orders: [] }
        }
    };

    // Initialize breakdown for each tag pattern
    CLOSED_TAG_PATTERNS.forEach(p => {
        result.breakdown[p.pattern] = { count: 0, orders: [], displayName: p.displayName, color: p.color };
    });

    orders.forEach(order => {
        const statusText = order.StatusText || order.Status || '';
        const orderTags = parseOrderTags(order.Tags);
        const matchedClosedTags = [];

        // Check if order has "Đơn hàng" status
        const isOrdered = statusText === 'Đơn hàng';
        if (isOrdered) {
            result.orderedOrders.push(order);
            result.breakdown.ordered.count++;
            result.breakdown.ordered.orders.push(order);
        }

        // Check each closed tag pattern
        orderTags.forEach(orderTag => {
            const tagName = (orderTag.Name || orderTag.name || '').toLowerCase().trim();

            CLOSED_TAG_PATTERNS.forEach(pattern => {
                let matches = false;
                if (pattern.type === 'startsWith') {
                    matches = tagName.startsWith(pattern.pattern);
                } else if (pattern.type === 'exact') {
                    matches = tagName === pattern.pattern;
                }

                if (matches) {
                    matchedClosedTags.push({
                        pattern: pattern.pattern,
                        displayName: pattern.displayName,
                        color: pattern.color,
                        originalTag: orderTag.Name || orderTag.name
                    });
                }
            });
        });

        if (matchedClosedTags.length > 0) {
            result.taggedOrders.set(order.Id || order.Code, { order, matchedTags: matchedClosedTags });

            // Count for each pattern (avoid double counting same order for same pattern)
            const countedPatterns = new Set();
            matchedClosedTags.forEach(mt => {
                if (!countedPatterns.has(mt.pattern)) {
                    countedPatterns.add(mt.pattern);
                    result.breakdown[mt.pattern].count++;
                    result.breakdown[mt.pattern].orders.push(order);
                }
            });
        }

        // Build all matched tags including Ordered status for duplicate checking
        const allMatchedTags = [...matchedClosedTags];
        if (isOrdered) {
            allMatchedTags.unshift({
                pattern: '__ordered__',
                displayName: 'Ordered',
                color: '#22c55e',
                originalTag: 'Đơn hàng (Ordered)'
            });
        }

        // Check for duplicates (2+ different patterns including Ordered)
        const uniquePatterns = [...new Set(allMatchedTags.map(t => t.pattern))];
        if (uniquePatterns.length >= 2) {
            result.duplicateOrders.push({ order, matchedTags: allMatchedTags });
        }

        // Check if order is not in any category
        if (!isOrdered && matchedClosedTags.length === 0) {
            result.remainingOrders.push(order);
        }
    });

    // Calculate total unique closed orders
    const uniqueClosedOrderIds = new Set();

    // Add ordered orders
    result.orderedOrders.forEach(o => uniqueClosedOrderIds.add(o.Id || o.Code));

    // Add tagged orders
    result.taggedOrders.forEach((value, orderId) => uniqueClosedOrderIds.add(orderId));

    result.totalClosedOrders = uniqueClosedOrderIds.size;
    result.totalOrders = orders.length;

    return result;
}

/**
 * View employee remaining orders
 */
function viewEmployeeRemainingOrders(empName, start, end) {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    // Filter orders by employee
    const empOrders = orders.filter(order => {
        const stt = parseInt(order.SessionIndex || 0);
        return stt >= start && stt <= end;
    });

    // Calculate remaining orders for this employee
    const empStats = calculateActualClosedStats(empOrders);

    if (empStats.remainingOrders.length === 0) return;

    showOrdersDetailModal(`${empName} - Đơn Chưa Phân Loại (${empStats.remainingOrders.length} đơn)`, empStats.remainingOrders);
}

/**
 * View employee duplicate orders
 */
function viewEmployeeDuplicateOrders(empName, start, end) {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    // Filter orders by employee
    const empOrders = orders.filter(order => {
        const stt = parseInt(order.SessionIndex || 0);
        return stt >= start && stt <= end;
    });

    // Calculate stats for this employee
    const empStats = calculateActualClosedStats(empOrders);

    if (empStats.duplicateOrders.length === 0) return;

    showDuplicateOrdersModal(`${empName} - Đơn Có Tag Trùng`, empStats.duplicateOrders);
}

/**
 * Show duplicate orders modal with tags
 */
function showDuplicateOrdersModal(title, duplicateOrders) {
    const modal = document.getElementById('ordersDetailModal');
    const titleEl = document.getElementById('ordersDetailTitle');
    const body = document.getElementById('ordersDetailBody');

    titleEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i> ${title} <span style="font-size: 14px; opacity: 0.8;">(${duplicateOrders.length} đơn - chỉ tính 1 lần)</span>`;

    body.innerHTML = `
        <table class="orders-table">
            <thead>
                <tr>
                    <th>STT</th>
                    <th>Mã đơn</th>
                    <th>Tags trùng</th>
                    <th>Khách hàng</th>
                    <th>SĐT</th>
                    <th>SP</th>
                    <th>Tổng tiền</th>
                </tr>
            </thead>
            <tbody>
                ${duplicateOrders.map(d => `
                    <tr>
                        <td>${d.order.SessionIndex || '-'}</td>
                        <td class="order-code">${d.order.Code || ''}</td>
                        <td><div class="tags-cell">${d.matchedTags.map(t => `<span class="order-tag" style="background-color: ${t.color};">${t.originalTag}</span>`).join('')}</div></td>
                        <td>${d.order.Name || d.order.PartnerName || ''}</td>
                        <td>${d.order.Telephone || ''}</td>
                        <td>${(d.order.Details || []).length}</td>
                        <td class="amount">${(d.order.TotalAmount || 0).toLocaleString('vi-VN')}đ</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    modal.classList.add('show');
}

/**
 * Render all statistics
 */
/**
 * ⚡ NEW: Render statistics from allOrders (Tab1 data) - Single source of truth
 * This is now the primary function for rendering statistics in "Tổng quan" tab
 */
function renderStatisticsFromAllOrders() {
    const orders = allOrders || [];

    const statsContainer = document.getElementById('statisticsContainer');
    const emptyState = document.getElementById('statsEmptyState');

    if (orders.length === 0) {
        statsContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    statsContainer.style.display = 'block';
    emptyState.style.display = 'none';

    // Calculate Tag XL stats
    const tagXLStats = calculateTagXLStats(orders);
    const employeeStats = calculateEmployeeTagXLStats(orders);

    // Update header badges
    updateLiveStatsBadges(tagXLStats.badges);

    // Render tag XL stats table
    renderTagXLStatsTable(tagXLStats);

    // Render employee stats
    renderEmployeeTagXLStats(employeeStats);

    // Calculate and render empty cart reasons
    const emptyCartReasons = calculateEmptyCartReasons(orders);
    renderEmptyCartReasons(emptyCartReasons);

    // Calculate and render discount statistics
    renderDiscountStatistics(orders);

}

/**
 * ⚠️ LEGACY: Render statistics from cachedOrderDetails (Firebase data)
 * This is now only used for "Chi tiết đã tải" tab, NOT for "Tổng quan"
 * "Tổng quan" uses renderStatisticsFromAllOrders() instead
 */
function renderStatistics() {
    const cached = cachedOrderDetails[currentTableName];
    const orders = cached?.orders || [];

    const statsContainer = document.getElementById('statisticsContainer');
    const emptyState = document.getElementById('statsEmptyState');

    if (orders.length === 0) {
        statsContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    statsContainer.style.display = 'block';
    emptyState.style.display = 'none';

    // Calculate all stats
    const tagStats = calculateTagStats(orders);
    const employeeStats = calculateEmployeeTagStats(orders);

    // Render tag stats
    renderTagStatsTable(tagStats, orders.length);

    // Render employee stats
    renderEmployeeStats(employeeStats, orders);

    // Calculate and render empty cart reasons
    const emptyCartReasons = calculateEmptyCartReasons(orders);
    renderEmptyCartReasons(emptyCartReasons);

    // Calculate and render discount statistics
    renderDiscountStatistics(orders);

}

// =====================================================
// TAG XL RENDERING FUNCTIONS
// =====================================================

/**
 * Helper: build a stat row HTML
 */
function _buildStatRow(key, displayName, color, icon, count, total, totalAmount, opts = {}) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    const indent = opts.indent ? 'padding-left: 32px;' : '';
    const fontWeight = opts.indent ? 'normal' : 'bold';
    const rowClass = opts.rowClass || '';

    // Category rows get a subtle background to distinguish from sub-rows
    let bgStyle = '';
    if (opts.highlight) {
        bgStyle = 'background: rgba(239, 68, 68, 0.08);';
    } else if (opts.isCategoryRow && color) {
        bgStyle = `background: ${color}18;`; // light tint of category color
    }

    const iconHtml = icon
        ? `<span style="margin-right: 6px;">${icon}</span>`
        : (color ? `<span class="tag-color" style="background-color: ${color}; display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 8px;"></span>` : '');

    return `
    <tr class="${rowClass}" style="${bgStyle}">
        <td style="${indent}">
            <div class="tag-cell" style="font-weight: ${fontWeight};">
                ${iconHtml}
                <span>${displayName}</span>
            </div>
        </td>
        <td><strong>${count.toLocaleString('vi-VN')}</strong></td>
        <td class="percentage">${pct}%</td>
        <td class="amount">${formatCurrency(totalAmount)}</td>
        <td>
            <button class="btn-view-detail" onclick="viewTagXLOrders('${key}')" title="Xem chi tiết">
                <i class="fas fa-eye"></i>
            </button>
        </td>
    </tr>`;
}

/**
 * Build rows HTML for a tag XL stats object (used by both global and employee tables)
 */
function _buildTagXLRows(stats) {
    const total = stats.total;
    let rows = '';

    // ⚠️ CHƯA GÁN TAG XL — first row, hide if 0
    const untaggedCount = stats.untaggedOrders.length;
    if (untaggedCount > 0) {
        rows += _buildStatRow('untagged', '⚠️ CHƯA GÁN TAG XL', '#ef4444', null, untaggedCount, total, stats.untaggedAmount, {
            rowClass: 'duplicate-row-red', isCategoryRow: true
        });
    }

    // Cat 0 — ĐÃ RA ĐƠN (category row with light bg)
    const cat0 = PTAG_CATEGORY_META[0];
    rows += _buildStatRow('cat_0', `${cat0.emoji} ${cat0.short}`, cat0.color, null, stats.catCounts[0], total, stats.catAmounts[0], { isCategoryRow: true });

    // Cat 1 — CHỜ ĐI ĐƠN (category row with light bg)
    const cat1 = PTAG_CATEGORY_META[1];
    rows += _buildStatRow('cat_1', `${cat1.emoji} ${cat1.short}`, cat1.color, null, stats.catCounts[1], total, stats.catAmounts[1], { isCategoryRow: true });
    // Sub-states — hide if 0
    if (stats.subStateCounts.OKIE_CHO_DI_DON > 0) {
        const ssOkie = PTAG_SUBSTATES_META.OKIE_CHO_DI_DON;
        rows += _buildStatRow('sub_OKIE_CHO_DI_DON', ssOkie.label, ssOkie.color, null, stats.subStateCounts.OKIE_CHO_DI_DON, total, stats.subStateAmounts.OKIE_CHO_DI_DON, { indent: true });
    }
    if (stats.subStateCounts.CHO_HANG > 0) {
        const ssCho = PTAG_SUBSTATES_META.CHO_HANG;
        rows += _buildStatRow('sub_CHO_HANG', ssCho.label, ssCho.color, null, stats.subStateCounts.CHO_HANG, total, stats.subStateAmounts.CHO_HANG, { indent: true });
    }

    // Cat 2 — XỬ LÝ (category row with light bg)
    const cat2 = PTAG_CATEGORY_META[2];
    rows += _buildStatRow('cat_2', `${cat2.emoji} ${cat2.short}`, cat2.color, null, stats.catCounts[2], total, stats.catAmounts[2], { isCategoryRow: true });
    for (const [key, meta] of Object.entries(PTAG_SUBTAGS_META)) {
        if (meta.category === 2 && (stats.subTagCounts[key] || 0) > 0) {
            rows += _buildStatRow(`subtag_${key}`, meta.label, null, meta.icon, stats.subTagCounts[key], total, stats.subTagAmounts[key] || 0, { indent: true });
        }
    }

    // Cat 3 — KHÔNG CẦN CHỐT (category row with light bg)
    const cat3 = PTAG_CATEGORY_META[3];
    rows += _buildStatRow('cat_3', `${cat3.emoji} ${cat3.short}`, cat3.color, null, stats.catCounts[3], total, stats.catAmounts[3], { isCategoryRow: true });
    for (const [key, meta] of Object.entries(PTAG_SUBTAGS_META)) {
        if (meta.category === 3 && (stats.subTagCounts[key] || 0) > 0) {
            const highlight = key === 'GIO_TRONG' && stats.hasGioTrongValidationError;
            rows += _buildStatRow(`subtag_${key}`, meta.label, null, meta.icon, stats.subTagCounts[key], total, stats.subTagAmounts[key] || 0, {
                indent: true, highlight, rowClass: highlight ? 'duplicate-row-red' : ''
            });
        }
    }

    // Cat 4 — KHÁCH XÃ (category row with light bg)
    const cat4 = PTAG_CATEGORY_META[4];
    rows += _buildStatRow('cat_4', `${cat4.emoji} ${cat4.short}`, cat4.color, null, stats.catCounts[4], total, stats.catAmounts[4], { isCategoryRow: true });
    for (const [key, meta] of Object.entries(PTAG_SUBTAGS_META)) {
        if (meta.category === 4 && (stats.subTagCounts[key] || 0) > 0) {
            rows += _buildStatRow(`subtag_${key}`, meta.label, null, meta.icon, stats.subTagCounts[key], total, stats.subTagAmounts[key] || 0, { indent: true });
        }
    }

    // Separator + Flag rows (info only)
    rows += `<tr><td colspan="5" style="padding: 6px 12px; background: #f8fafc; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Thông tin thêm (không tính vào đơn chốt)</td></tr>`;

    const fChoLive = PTAG_FLAGS_META.CHO_LIVE;
    rows += _buildStatRow('flag_CHO_LIVE', `${fChoLive.icon} ${fChoLive.label}`, fChoLive.color, null, stats.flagCounts.CHO_LIVE, total, stats.flagAmounts.CHO_LIVE);
    rows += _buildStatRow('flag_QUA_LAY_GIU_DON', '🏠⌛ QUA LẤY + GIỮ ĐƠN', '#8b5cf6', null, stats.flagCounts.QUA_LAY_GIU_DON, total, stats.flagAmounts.QUA_LAY_GIU_DON);
    const fGiamGia = PTAG_FLAGS_META.GIAM_GIA;
    rows += _buildStatRow('flag_GIAM_GIA', `${fGiamGia.icon} ${fGiamGia.label}`, fGiamGia.color, null, stats.flagCounts.GIAM_GIA, total, stats.flagAmounts.GIAM_GIA);

    return rows;
}

/**
 * Render Tag XL statistics table (main/global)
 */
function renderTagXLStatsTable(stats) {
    const tbody = document.getElementById('tagStatsBody');
    if (!tbody) return;

    if (stats.total === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Không có dữ liệu</td></tr>';
        return;
    }

    tbody.innerHTML = _buildTagXLRows(stats);

    // Render mini-summary under header h2 (inside tagStatsSection)
    const section = document.getElementById('tagStatsSection');
    if (section) {
        // Remove old mini-summary
        const old = section.querySelector('.ptag-mini-summary');
        if (old) old.remove();
        const h2 = section.querySelector('h2');
        if (h2) {
            const el = document.createElement('div');
            el.className = 'ptag-mini-summary';
            el.style.cssText = 'padding: 0 0 8px 0;';
            el.innerHTML = _buildMiniSummary(stats);
            h2.after(el);
        }
    }

    // Make table collapsible — default collapsed
    _makeCollapsible('tagStatsSection');
}

/**
 * Render Tag XL employee statistics
 */
function renderEmployeeTagXLStats(employeeStats) {
    const container = document.getElementById('employeeStatsContainer');
    if (!container) return;

    if (employeeStats.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
                <i class="fas fa-user-slash" style="font-size: 40px; color: #ddd;"></i>
                <h3 style="color: #999;">Chưa cài đặt phân chia nhân viên</h3>
                <p style="color: #999;">Vui lòng cài đặt phân chia nhân viên ở tab "Quản Lý Đơn Hàng"</p>
            </div>
        `;
        return;
    }

    container.innerHTML = employeeStats.map((emp, idx) => {
        const { badges } = emp;

        // Build employee-specific onclick functions by overriding _buildStatRow's onclick
        const empStatsRows = _buildTagXLRows(emp.stats).replace(
            /viewTagXLOrders\('([^']+)'\)/g,
            `viewEmployeeTagXLOrders('${emp.name}', ${emp.start}, ${emp.end}, '$1')`
        );

        const empMiniSummary = _buildMiniSummary(emp.stats);
        const empId = `empCard_${idx}`;

        return `
        <div class="employee-card" id="${empId}">
            <div class="employee-live-header" style="cursor:pointer;" onclick="_toggleEmpCard('${empId}')">
                <div class="employee-title">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-chevron-right ptag-collapse-icon" style="font-size:11px; color:#94a3b8; transition:transform 0.2s;"></i>
                        <i class="fas fa-user"></i>
                        <span class="emp-name">${emp.name}</span>
                        <span class="employee-stt">STT ${emp.start} - ${emp.end}</span>
                        <div class="live-stats-badges" style="display: flex; align-items: center; flex-wrap: wrap;">
                            <span class="live-badge badge-total">${badges.total} ĐƠN</span>
                            <span class="live-badge badge-chot" style="background: #22c55e;">${badges.donChot} ĐƠN CHỐT</span>
                        </div>
                    </div>
                    ${empMiniSummary}
                </div>
            </div>
            <div class="stats-table-wrapper" style="display:none;">
                <table class="stats-table employee-stats-table">
                    <thead>
                        <tr>
                            <th>Tag XL</th>
                            <th>Số đơn</th>
                            <th>Tỷ lệ</th>
                            <th>Tổng tiền</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${empStatsRows}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}

// =====================================================
// TAG XL COLLAPSIBLE HELPERS
// =====================================================

/**
 * Make a section collapsible (default collapsed). Click h2 to toggle.
 */
function _makeCollapsible(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section || section.dataset.collapsible) return;
    section.dataset.collapsible = 'true';

    const h2 = section.querySelector('h2');
    const wrapper = section.querySelector('.stats-table-wrapper');
    if (!h2 || !wrapper) return;

    // Add chevron icon
    if (!h2.querySelector('.ptag-collapse-icon')) {
        const icon = document.createElement('i');
        icon.className = 'fas fa-chevron-right ptag-collapse-icon';
        icon.style.cssText = 'font-size:12px; color:#94a3b8; transition:transform 0.2s; margin-right:6px;';
        h2.insertBefore(icon, h2.firstChild);
    }

    // Default collapsed
    wrapper.style.display = 'none';
    h2.style.cursor = 'pointer';

    h2.onclick = () => {
        const isHidden = wrapper.style.display === 'none';
        wrapper.style.display = isHidden ? '' : 'none';
        const chevron = h2.querySelector('.ptag-collapse-icon');
        if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : '';
    };
}

/**
 * Toggle employee card collapse
 */
function _toggleEmpCard(empId) {
    const card = document.getElementById(empId);
    if (!card) return;
    const wrapper = card.querySelector('.stats-table-wrapper');
    const icon = card.querySelector('.ptag-collapse-icon');
    if (!wrapper) return;

    const isHidden = wrapper.style.display === 'none';
    wrapper.style.display = isHidden ? '' : 'none';
    if (icon) icon.style.transform = isHidden ? 'rotate(90deg)' : '';
}

// =====================================================
// TAG XL VIEW DETAIL FUNCTIONS
// =====================================================

/**
 * View orders by Tag XL key (category, sub-tag, flag, untagged)
 */
function viewTagXLOrders(key) {
    const orders = allOrders || [];
    const result = _filterOrdersByTagXLKey(orders, processingTagsMap, key);
    showOrdersDetailModal(`Đơn hàng: ${result.displayName}`, result.orders);
}

/**
 * View orders by Tag XL key for a specific employee
 */
function viewEmployeeTagXLOrders(empName, start, end, key) {
    const orders = (allOrders || []).filter(order => {
        const stt = parseInt(order.SessionIndex || 0);
        return stt >= start && stt <= end;
    });
    const result = _filterOrdersByTagXLKey(orders, processingTagsMap, key);

    // Special handling for GIO_TRONG validation
    if (key === 'subtag_GIO_TRONG') {
        const stats = computeTagXLCounts(orders, processingTagsMap);
        if (stats.hasGioTrongValidationError && stats.gioTrongInvalidOrders.length > 0) {
            showGioTrongValidationModal(result.orders, stats.gioTrongInvalidOrders, `${empName} - `);
            return;
        }
    }

    showOrdersDetailModal(`${empName} - ${result.displayName}`, result.orders);
}

/**
 * View mismatch (untagged) orders for employee
 */
function viewMismatchOrdersXL(empName, start, end) {
    const orders = (allOrders || []).filter(order => {
        const stt = parseInt(order.SessionIndex || 0);
        return stt >= start && stt <= end;
    });
    const result = _filterOrdersByTagXLKey(orders, processingTagsMap, 'untagged');
    showOrdersDetailModal(`${empName} - CHƯA GÁN TAG XL (${result.orders.length} đơn)`, result.orders);
}

/**
 * Filter orders by tag XL key — shared helper
 */
function _filterOrdersByTagXLKey(orders, ptagMap, key) {
    let filtered = [];
    let displayName = key;

    if (key === 'untagged') {
        displayName = 'CHƯA GÁN TAG XL';
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            return !td || td.category === null || td.category === undefined;
        });
    } else if (key.startsWith('cat_')) {
        const cat = parseInt(key.replace('cat_', ''));
        const meta = PTAG_CATEGORY_META[cat];
        displayName = meta ? `${meta.emoji} ${meta.short}` : key;
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            return td && td.category === cat;
        });
    } else if (key.startsWith('sub_')) {
        const ss = key.replace('sub_', '');
        const meta = PTAG_SUBSTATES_META[ss];
        displayName = meta ? meta.label : ss;
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            return td && td.category === 1 && (td.subState || 'OKIE_CHO_DI_DON') === ss;
        });
    } else if (key.startsWith('subtag_')) {
        const st = key.replace('subtag_', '');
        const meta = PTAG_SUBTAGS_META[st];
        displayName = meta ? meta.label : st;
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            return td && td.subTag === st;
        });

        // Special handling for GIO_TRONG validation
        if (st === 'GIO_TRONG') {
            const stats = computeTagXLCounts(orders, ptagMap);
            if (stats.hasGioTrongValidationError && stats.gioTrongInvalidOrders.length > 0) {
                showGioTrongValidationModal(filtered, stats.gioTrongInvalidOrders);
                return { orders: filtered, displayName };
            }
        }
    } else if (key === 'flag_CHO_LIVE') {
        displayName = '📺 CHỜ LIVE';
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            return td && (td.flags || []).some(f => (typeof f === 'object' ? f.id : f) === 'CHO_LIVE');
        });
    } else if (key === 'flag_QUA_LAY_GIU_DON') {
        displayName = '🏠⌛ QUA LẤY + GIỮ ĐƠN';
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            const flags = td?.flags || [];
            return flags.some(f => { const id = typeof f === 'object' ? f.id : f; return id === 'QUA_LAY' || id === 'GIU_DON'; });
        });
    } else if (key === 'flag_GIAM_GIA') {
        displayName = '🏷️ GIẢM GIÁ';
        filtered = orders.filter(o => {
            const td = ptagMap[String(o.Code || '')];
            return td && (td.flags || []).some(f => (typeof f === 'object' ? f.id : f) === 'GIAM_GIA');
        });
    }

    return { orders: filtered, displayName };
}

// =====================================================
// LEGACY RENDERING FUNCTIONS (kept for renderStatistics / "Chi tiết đã tải" tab)
// =====================================================

/**
 * Render tag statistics table
 */
function renderTagStatsTable(stats, totalOrders) {
    const tbody = document.getElementById('tagStatsBody');

    if (stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Không có dữ liệu tag</td></tr>';
        return;
    }

    tbody.innerHTML = stats.map(s => {
        // Handle special stats differently (ĐÃ RA ĐƠN)
        const isSpecial = s.isSpecial || false;
        const isDuplicate = s.isDuplicate || false;
        const isWrongTag = s.isWrongTag || false;
        const specialIcon = s.pattern === 'ordered' ? 'fa-check-circle' :
            s.pattern === '__no_tags__' ? 'fa-tag' :
                isDuplicate ? 'fa-exclamation-triangle' :
                    isWrongTag ? 'fa-times-circle' : '';

        // Determine row class based on type
        let rowClass = '';
        if (isSpecial) {
            rowClass = 'special-stat-row';
        } else if (isDuplicate) {
            rowClass = s.hasUnacceptableDuplicate ? 'duplicate-row-red' : 'duplicate-row-green';
        } else if (isWrongTag) {
            rowClass = s.hasError ? 'duplicate-row-red' : 'duplicate-row-green';
        } else if (s.key === 'gio_trong' && s.hasValidationError) {
            rowClass = 'duplicate-row-red';
        }

        return `
        <tr class="${rowClass}">
            <td>
                <div class="tag-cell">
                    ${isSpecial || isDuplicate || isWrongTag ? `<i class="fas ${specialIcon}" style="color: ${(isDuplicate || isWrongTag) ? 'white' : s.color}; margin-right: 8px;"></i>` : `<span class="tag-color" style="background-color: ${s.color}"></span>`}
                    <span>${s.displayName}</span>
                </div>
            </td>
            <td><strong>${s.count.toLocaleString('vi-VN')}</strong></td>
            <td class="percentage">${s.percentage}%</td>
            <td class="amount">${formatCurrency(s.totalAmount)}</td>
            <td>
                <button class="btn-view-detail" onclick="viewTagOrders('${s.pattern}', '${s.type}')" title="Xem chi tiết">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

/**
 * Render employee statistics (same format as Thống Kê Đơn Live)
 */
function renderEmployeeStats(stats, allOrders) {
    const container = document.getElementById('employeeStatsContainer');

    if (stats.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
                <i class="fas fa-user-slash" style="font-size: 40px; color: #ddd;"></i>
                <h3 style="color: #999;">Chưa cài đặt phân chia nhân viên</h3>
                <p style="color: #999;">Vui lòng cài đặt phân chia nhân viên ở tab "Quản Lý Đơn Hàng"</p>
            </div>
        `;
        return;
    }

    container.innerHTML = stats.map(emp => {
        // Determine badge color for ĐƠN CHỐT
        // GREEN if: Y = H AND no unacceptable duplicates (TAG TRÙNG is green)
        const isMismatch = emp.badgeChot !== emp.actualChot || emp.hasUnacceptableDuplicate;
        const chotBadgeClass = isMismatch ? 'badge-chot mismatch' : 'badge-chot';

        // Build mismatch reason HTML
        let mismatchHtml = '';
        if (isMismatch && emp.mismatchReason && emp.mismatchReason.length > 0) {
            const reasonTexts = emp.mismatchReason.map(r => r.text).join(', ');
            const totalMismatchOrders = emp.mismatchReason.reduce((sum, r) => sum + r.orders.length, 0);
            mismatchHtml = `
                <div class="mismatch-info" style="display: flex; align-items: center; gap: 8px; margin-left: 10px;">
                    <span class="mismatch-reason" style="background: #fef2f2; color: #dc2626; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                        <i class="fas fa-exclamation-circle" style="margin-right: 4px;"></i>
                        ${reasonTexts}
                    </span>
                    ${totalMismatchOrders > 0 ? `
                    <button class="btn-view-mismatch" onclick="viewMismatchOrders('${emp.name}', ${emp.start}, ${emp.end})"
                        style="background: #fee2e2; color: #dc2626; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-eye"></i> Xem ${totalMismatchOrders} đơn
                    </button>
                    ` : ''}
                </div>
            `;
        }

        return `
        <div class="employee-card">
            <div class="employee-live-header">
                <div class="employee-title">
                    <i class="fas fa-user"></i>
                    <span class="emp-name">${emp.name}</span>
                    <span class="employee-stt">STT ${emp.start} - ${emp.end}</span>
                    <div class="live-stats-badges" style="display: flex; align-items: center; flex-wrap: wrap;">
                        <span class="live-badge badge-total">${emp.badgeTotal} ĐƠN</span>
                        <span class="live-badge ${chotBadgeClass}">${emp.badgeChot} ĐƠN CHỐT</span>
                        ${mismatchHtml}
                    </div>
                </div>
            </div>
            <div class="stats-table-wrapper">
                <table class="stats-table employee-stats-table">
                    <thead>
                        <tr>
                            <th>Tag</th>
                            <th>Số đơn</th>
                            <th>Tỷ lệ</th>
                            <th>Tổng tiền</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${emp.tagBreakdown.map(tag => {
            const isSpecial = tag.isSpecial || false;
            const isDuplicate = tag.isDuplicate || false;
            const isWrongTag = tag.isWrongTag || false;
            const specialIcon = tag.key === 'ordered' ? 'fa-check-circle' :
                isDuplicate ? 'fa-exclamation-triangle' :
                    isWrongTag ? 'fa-times-circle' : '';

            // Determine row class
            let rowClass = '';
            if (isSpecial) {
                rowClass = 'special-stat-row';
            } else if (isDuplicate) {
                rowClass = tag.hasUnacceptableDuplicate ? 'duplicate-row-red' : 'duplicate-row-green';
            } else if (isWrongTag) {
                rowClass = tag.hasError ? 'duplicate-row-red' : 'duplicate-row-green';
            } else if (tag.key === 'gio_trong' && tag.hasValidationError) {
                rowClass = 'duplicate-row-red';
            }

            return `
                            <tr class="${rowClass}">
                                <td>
                                    <div class="tag-cell">
                                        ${isSpecial || isDuplicate || isWrongTag ? `<i class="fas ${specialIcon}" style="color: ${(isDuplicate || isWrongTag) ? 'white' : tag.color}; margin-right: 8px;"></i>` : `<span class="tag-color" style="background-color: ${tag.color}"></span>`}
                                        <span>${tag.displayName}</span>
                                    </div>
                                </td>
                                <td><strong>${tag.count.toLocaleString('vi-VN')}</strong></td>
                                <td class="percentage">${tag.percentage}%</td>
                                <td class="amount">${formatCurrency(tag.totalAmount)}</td>
                                <td>
                                    <button class="btn-view-detail" onclick="viewEmployeeTagOrders('${emp.name}', ${emp.start}, ${emp.end}, '${tag.key}')" title="Xem chi tiết">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join('');
}

/**
 * Build HTML for employee's actual closed stats
 */
function buildEmployeeClosedStatsHtml(emp, stats) {
    const orderedCount = stats.breakdown.ordered.count;

    // Build breakdown items
    let breakdownItems = `<span class="emp-closed-item" style="background: #22c55e;">Ordered: ${orderedCount}</span>`;

    CLOSED_TAG_PATTERNS.forEach(pattern => {
        const data = stats.breakdown[pattern.pattern];
        if (data.count > 0) {
            breakdownItems += `<span class="emp-closed-item" style="background: ${pattern.color};">${pattern.displayName}: ${data.count}</span>`;
        }
    });

    // Build duplicate orders button (clickable to open modal)
    let duplicateHtml = '';
    if (stats.duplicateOrders.length > 0) {
        duplicateHtml = `
            <div class="emp-duplicate-btn" onclick="viewEmployeeDuplicateOrders('${emp.name}', ${emp.start}, ${emp.end})">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Tag trùng</span>
                <span class="emp-duplicate-count">${stats.duplicateOrders.length}</span>
                <i class="fas fa-eye"></i>
            </div>
        `;
    }

    // Build remaining orders button (clickable to open modal)
    let remainingHtml = '';
    if (stats.remainingOrders.length > 0) {
        remainingHtml = `
            <div class="emp-remaining-btn" onclick="viewEmployeeRemainingOrders('${emp.name}', ${emp.start}, ${emp.end})">
                <i class="fas fa-question-circle"></i>
                <span>Chưa phân loại</span>
                <span class="emp-remaining-count">${stats.remainingOrders.length}</span>
                <i class="fas fa-eye"></i>
            </div>
        `;
    }

    return `
        <div class="emp-closed-stats">
            <div class="emp-closed-header">
                <span class="emp-closed-total">
                    <i class="fas fa-calculator"></i>
                    Đơn chốt thực tế: <strong>${stats.totalClosedOrders}</strong>
                </span>
                <div class="emp-closed-breakdown">
                    ${breakdownItems}
                </div>
            </div>
            ${duplicateHtml}
            ${remainingHtml}
        </div>
    `;
}

// =====================================================
