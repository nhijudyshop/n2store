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
        console.log(`[REPORT] Converted object with ${keys.length} keys to array`);
        return result;
    }

    return [];
}

/**
 * Load employee ranges from Firebase
 */
async function loadEmployeeRanges() {
    if (!database) return;

    try {
        // Try campaign-specific first
        if (currentTableName) {
            const safeName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
            const campaignSnapshot = await database.ref(`settings/employee_ranges_by_campaign/${safeName}`).once('value');
            if (campaignSnapshot.exists()) {
                employeeRanges = normalizeEmployeeRanges(campaignSnapshot.val());
                console.log('[REPORT] ✅ Loaded campaign-specific employee ranges:', employeeRanges.length);
                return;
            }
        }

        // Fallback to general
        const snapshot = await database.ref(EMPLOYEE_RANGES_PATH).once('value');
        employeeRanges = normalizeEmployeeRanges(snapshot.val());
        console.log('[REPORT] ✅ Loaded general employee ranges:', employeeRanges.length);
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
        const snapshot = await database.ref('settings/tags').once('value');
        availableTags = snapshot.val() || [];
        console.log('[REPORT] ✅ Loaded available tags:', availableTags.length);
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
        const snapshot = await database.ref(TRACKED_TAGS_PATH).once('value');
        const saved = snapshot.val();
        if (saved && Array.isArray(saved)) {
            trackedTags = saved;
        } else {
            trackedTags = [...DEFAULT_TRACKED_TAGS];
        }
        console.log('[REPORT] ✅ Loaded tracked tags:', trackedTags.length);
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
        await database.ref(TRACKED_TAGS_PATH).set(trackedTags);
        console.log('[REPORT] ✅ Saved tracked tags');
    } catch (error) {
        console.error('[REPORT] ❌ Error saving tracked tags:', error);
    }
}

/**
 * Request employee ranges from Tab1 and save to Firebase
 */
async function requestAndSaveEmployeeRanges() {
    return new Promise((resolve) => {
        console.log('[REPORT] 📡 Requesting employee ranges from Tab1...');

        // Set up one-time listener for response
        const handler = async (event) => {
            if (event.data.type === 'EMPLOYEE_RANGES_RESPONSE') {
                window.removeEventListener('message', handler);

                const ranges = event.data.ranges || [];
                console.log('[REPORT] ✅ Received employee ranges:', ranges.length);

                if (ranges.length > 0 && database && currentTableName) {
                    try {
                        // Save to campaign-specific path
                        const safeName = currentTableName.replace(/[.$#\[\]\/]/g, '_');
                        await database.ref(`settings/employee_ranges_by_campaign/${safeName}`).set(ranges);
                        console.log('[REPORT] ✅ Saved employee ranges to Firebase for:', currentTableName);
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
            console.log('[REPORT] ⏱️ Employee ranges request timed out');
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

// Predefined tags for Live Order Statistics
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
 * Calculate tag statistics from cached orders for Live Order Statistics
 */
function calculateTagStats(orders) {
    const totalOrders = orders.length;

    // Initialize stats for each predefined tag
    const tagStatsMap = new Map();
    LIVE_STAT_TAGS.forEach(tag => {
        tagStatsMap.set(tag.key, {
            pattern: tag.key,
            type: tag.isSpecial ? 'special' : 'tag',
            displayName: tag.displayName,
            color: tag.color,
            count: 0,
            totalAmount: 0,
            orders: [],
            isSpecial: tag.isSpecial || false,
            countAsChot: tag.countAsChot
        });
    });

    // Track unique orders per category to avoid double counting
    const ordersPerCategory = new Map();
    LIVE_STAT_TAGS.forEach(tag => {
        ordersPerCategory.set(tag.key, new Set());
    });

    // Track duplicate tags per order
    const orderTagsMap = new Map(); // orderId -> Set of tag keys

    // Count orders for each category
    orders.forEach(order => {
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
                if (liveTag.isSpecial) return; // Skip special tags (handled above)

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
                    // Track this tag for duplicate detection
                    orderTagsMap.get(orderId).tagKeys.add(liveTag.key);
                }
            });
        });
    });

    // Find orders with duplicate tags (more than 1 tag from LIVE_STAT_TAGS)
    // NOTE: Now includes 'ordered' status as a tag for duplicate checking
    const duplicateOrders = [];
    let hasUnacceptableDuplicate = false;

    // Acceptable duplicate combinations: (cho_live + cho_hang_ve) OR (qua_lay + cho_hang_ve)
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

    // Validate GIỎ TRỐNG logic
    // 1. Orders with "giỏ trống" tag but product count > 0 → invalid
    // 2. Orders with product count = 0 but no "giỏ trống" or "đã gộp ko chốt" tag → invalid
    let hasGioTrongValidationError = false;
    const gioTrongInvalidOrders = [];

    orders.forEach(order => {
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

    // Calculate percentages and prepare final stats
    const allStats = [];
    tagStatsMap.forEach((stat, key) => {
        stat.percentage = totalOrders > 0 ? ((stat.count / totalOrders) * 100).toFixed(1) : 0;
        allStats.push(stat);
    });

    // Add duplicate tag stat
    const duplicateStat = {
        pattern: 'tag_trung',
        type: 'duplicate',
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
    allStats.push(duplicateStat);

    // Find orders not matching any predefined tags (GẮN SAI TAG)
    const wrongTagOrders = [];
    orderTagsMap.forEach((data, orderId) => {
        // Order has no tags from LIVE_STAT_TAGS
        if (data.tagKeys.size === 0) {
            wrongTagOrders.push(data.order);
        }
    });

    // Add "GẮN SAI TAG" stat
    const wrongTagStat = {
        pattern: 'gan_sai_tag',
        key: 'gan_sai_tag',
        type: 'wrong_tag',
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
    allStats.push(wrongTagStat);

    // Calculate header badge values
    const gioTrongCount = tagStatsMap.get('gio_trong').count;
    const gopCount = tagStatsMap.get('gop').count;

    // x = total orders
    const x = totalOrders;
    // Z = giỏ trống
    const Z = gioTrongCount;
    // K = gộp
    const K = gopCount;
    // Y = x - Z - K (calculated "đơn chốt")
    const Y = x - Z - K;

    // H = sum of all countAsChot tags - duplicate count (actual "đơn chốt")
    let H = 0;
    tagStatsMap.forEach((stat, key) => {
        if (stat.countAsChot) {
            H += stat.count;
        }
    });
    H = H - duplicateOrders.length;

    // Update header badges
    updateLiveStatsBadges(x, Y, Z, K, H, hasUnacceptableDuplicate);

    return allStats;
}

/**
 * Update the Live Stats badges in the header
 */
function updateLiveStatsBadges(totalDon, donChot, gioTrong, gop, actualChot, hasUnacceptableDuplicate) {
    const badgeTotalDon = document.getElementById('badgeTotalDon');
    const badgeDonChot = document.getElementById('badgeDonChot');
    const badgeGioTrong = document.getElementById('badgeGioTrong');
    const badgeGop = document.getElementById('badgeGop');

    if (badgeTotalDon) badgeTotalDon.textContent = `${totalDon} ĐƠN`;
    if (badgeDonChot) {
        badgeDonChot.textContent = `${donChot} ĐƠN CHỐT`;
        // GREEN if: Y = H AND no unacceptable duplicates (TAG TRÙNG is green)
        // RED otherwise
        if (donChot === actualChot && !hasUnacceptableDuplicate) {
            badgeDonChot.classList.remove('mismatch');
        } else {
            badgeDonChot.classList.add('mismatch');
        }
    }
    if (badgeGioTrong) badgeGioTrong.textContent = `${gioTrong} GIỎ TRỐNG`;
    if (badgeGop) badgeGop.textContent = `${gop} GỘP`;
}

/**
 * Get mismatch reason for employee badge
 * Y = tính toán (tổng - giỏ trống - gộp)
 * H = thực tế (sum countAsChot - duplicates)
 */
function getMismatchReason(Y, H, hasUnacceptableDuplicate, duplicateOrders, wrongTagOrders) {
    const reasons = [];

    if (Y !== H) {
        const diff = Y - H;
        if (diff > 0) {
            // Y > H: Có đơn chưa gắn tag chốt
            reasons.push({
                type: 'missing_tags',
                text: `Thiếu ${diff} đơn chưa gắn tag chốt`,
                count: wrongTagOrders.length,
                orders: wrongTagOrders
            });
        } else {
            // Y < H: Tag count vượt quá (có thể do logic tính toán)
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
 * Calculate employee-based tag statistics using LIVE_STAT_TAGS
 */
function calculateEmployeeTagStats(orders) {
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
            mismatchReason: getMismatchReason(Y, H, hasUnacceptableDuplicate, duplicateOrders, wrongTagOrders)
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
        console.log('[REPORT] ℹ️ No orders from Tab1, showing empty state');
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

    console.log('[REPORT] ✅ Statistics rendered from allOrders (' + orders.length + ' orders)');
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

    console.log('[REPORT] ✅ Statistics rendered from cachedOrderDetails');
}

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
