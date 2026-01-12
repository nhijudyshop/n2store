/**
 * Tab1 Orders - Search & Filtering Module
 * Table search, filtering, and sorting functions
 *
 * Dependencies: tab1-core.js, tab1-employee.js
 * Exports: Search and filter functions via window object
 */

// =====================================================
// SEARCH STATE
// =====================================================

// Use state from tab1-core.js via window.tab1State

// =====================================================
// TABLE SEARCH & FILTERING
// =====================================================

function handleTableSearch(query) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = query.trim().toLowerCase();
        document
            .getElementById("searchClearBtn")
            .classList.toggle("active", !!searchQuery);
        performTableSearch();
    }, 300);
}

function performTableSearch() {
    // Apply search filter
    let tempData = searchQuery
        ? allData.filter((order) => matchesSearchQuery(order, searchQuery))
        : [...allData];

    // Apply Employee STT Range Filter
    const auth = window.authManager ? window.authManager.getAuthState() : null;
    let isAdmin = auth?.detailedPermissions?.['baocaosaleonline']?.['viewRevenue'] === true ||
        auth?.roleTemplate === 'admin';

    const currentUserType = auth && auth.userType ? auth.userType : null;
    const currentDisplayName = auth && auth.displayName ? auth.displayName : null;
    const currentUserId = auth && auth.id ? auth.id : null;

    // Fallback: Check username string for Admin (legacy support)
    if (!isAdmin && currentUserType) {
        const lowerName = currentUserType.toLowerCase();
        if (lowerName.includes('admin') || lowerName.includes('quản trị') || lowerName.includes('administrator')) {
            isAdmin = true;
            console.log('[FILTER] User identified as Admin by name check');
        }
    }

    if (!isAdmin && employeeRanges.length > 0) {
        console.log('[FILTER] Current user:', currentDisplayName || currentUserType, 'ID:', currentUserId);

        let userRange = null;

        // 1. Try matching by ID first (most reliable)
        if (currentUserId) {
            userRange = employeeRanges.find(r => r.id === currentUserId);
            if (userRange) console.log('[FILTER] Matched by ID');
        }

        // 2. If not found, try matching by Display Name (Exact match)
        if (!userRange && currentDisplayName) {
            userRange = employeeRanges.find(r => r.name === currentDisplayName);
            if (userRange) console.log('[FILTER] Matched by Display Name');
        }

        // 3. If not found, try matching by User Type (Legacy)
        if (!userRange && currentUserType) {
            userRange = employeeRanges.find(r => r.name === currentUserType);
            if (userRange) console.log('[FILTER] Matched by User Type');
        }

        // 4. If not found, try matching by short name (before "-")
        if (!userRange && currentUserType) {
            const shortName = currentUserType.split('-')[0].trim();
            userRange = employeeRanges.find(r => r.name === shortName);
            if (userRange) console.log('[FILTER] Matched by Short Name:', shortName);
        }

        if (userRange) {
            const debugInfo = `
🔍 THÔNG TIN DEBUG:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Tài khoản hiện tại: ${currentDisplayName || currentUserType}
🆔 User ID: ${currentUserId || 'Không có'}
🔐 Là Admin? ${isAdmin ? 'CÓ' : 'KHÔNG'}
📊 STT được phân: ${userRange.start} - ${userRange.end}
👥 Tên trong setting: ${userRange.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Đang áp dụng filter cho bạn!
            `.trim();

            console.log(debugInfo);

            tempData = tempData.filter(order => {
                const stt = parseInt(order.SessionIndex);
                if (isNaN(stt)) return false;
                return stt >= userRange.start && stt <= userRange.end;
            });
            console.log(`[FILTER] Applied STT range ${userRange.start}-${userRange.end} for ${currentDisplayName || currentUserType}`);
        } else {
            console.log('[FILTER] No range found for user:', currentDisplayName || currentUserType);
        }
    } else if (isAdmin) {
        console.log('[FILTER] User is Admin - NO FILTER APPLIED');
    }

    // Apply conversation status filter (Merged Messages & Comments)
    const conversationFilter = document.getElementById('conversationFilter')?.value || 'all';

    if (window.pancakeDataManager && conversationFilter !== 'all') {
        tempData = tempData.filter(order => {
            const msgUnread = window.pancakeDataManager.getMessageUnreadInfoForOrder(order);
            const cmmUnread = window.pancakeDataManager.getCommentUnreadInfoForOrder(order);

            const hasUnreadMessage = msgUnread.hasUnread;
            const hasUnreadComment = cmmUnread.hasUnread;

            if (conversationFilter === 'unread') {
                return hasUnreadMessage || hasUnreadComment;
            } else if (conversationFilter === 'read') {
                return !hasUnreadMessage && !hasUnreadComment;
            }
            return true;
        });
    }

    // Apply Status Filter
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    if (statusFilter !== 'all') {
        tempData = tempData.filter(order => {
            if (statusFilter === 'Draft') {
                return order.Status === 'Draft';
            } else if (statusFilter === 'Confirmed') {
                return order.Status !== 'Draft';
            }
            return true;
        });
    }

    // Apply TAG filter
    const tagFilter = document.getElementById('tagFilter')?.value || 'all';

    if (tagFilter !== 'all') {
        tempData = tempData.filter(order => {
            if (!order.Tags) return false;

            try {
                const orderTags = JSON.parse(order.Tags);
                if (!Array.isArray(orderTags) || orderTags.length === 0) return false;

                return orderTags.some(tag => String(tag.Id) === String(tagFilter));
            } catch (e) {
                return false;
            }
        });
    }

    filteredData = tempData;

    // Priority sorting: STT → Phone → Name
    if (searchQuery) {
        filteredData.sort((a, b) => {
            const searchLower = searchQuery.toLowerCase();
            const aStt = String(a.SessionIndex || '').toLowerCase();
            const bStt = String(b.SessionIndex || '').toLowerCase();
            const aPhone = (a.Telephone || '').toLowerCase();
            const bPhone = (b.Telephone || '').toLowerCase();
            const aName = (a.Name || '').toLowerCase();
            const bName = (b.Name || '').toLowerCase();

            // Priority 1: STT exact match
            const aSttMatch = aStt === searchLower;
            const bSttMatch = bStt === searchLower;
            if (aSttMatch && !bSttMatch) return -1;
            if (!aSttMatch && bSttMatch) return 1;

            // Priority 2: STT starts with
            const aSttStarts = aStt.startsWith(searchLower);
            const bSttStarts = bStt.startsWith(searchLower);
            if (aSttStarts && !bSttStarts) return -1;
            if (!aSttStarts && bSttStarts) return 1;

            // Priority 3: STT contains
            const aSttContains = aStt.includes(searchLower);
            const bSttContains = bStt.includes(searchLower);
            if (aSttContains && !bSttContains) return -1;
            if (!aSttContains && bSttContains) return 1;

            // Priority 4: Phone starts with
            const aPhoneStarts = aPhone.startsWith(searchLower);
            const bPhoneStarts = bPhone.startsWith(searchLower);
            if (aPhoneStarts && !bPhoneStarts) return -1;
            if (!aPhoneStarts && bPhoneStarts) return 1;

            // Priority 5: Phone contains
            const aPhoneContains = aPhone.includes(searchLower);
            const bPhoneContains = bPhone.includes(searchLower);
            if (aPhoneContains && !bPhoneContains) return -1;
            if (!aPhoneContains && bPhoneContains) return 1;

            // Priority 6: Name starts with
            const aNameStarts = aName.startsWith(searchLower);
            const bNameStarts = bName.startsWith(searchLower);
            if (aNameStarts && !bNameStarts) return -1;
            if (!aNameStarts && bNameStarts) return 1;

            // Priority 7: Name contains
            const aNameContains = aName.includes(searchLower);
            const bNameContains = bName.includes(searchLower);
            if (aNameContains && !bNameContains) return -1;
            if (!aNameContains && bNameContains) return 1;

            // Default: keep original order
            return 0;
        });
    }

    // Reset sorting when filters change
    resetSorting();

    displayedData = filteredData;
    renderTable();
    updateStats();
    updatePageInfo();
    updateSearchResultCount();
}

function matchesSearchQuery(order, query) {
    const searchableText = [
        String(order.SessionIndex || ''), // STT - Priority field
        order.Code,
        order.Name,
        order.Telephone,
        order.Address,
        order.Note,
        order.StatusText,
    ]
        .join(" ")
        .toLowerCase();
    const normalizedText = removeVietnameseTones(searchableText);
    const normalizedQuery = removeVietnameseTones(query);
    return (
        searchableText.includes(query) ||
        normalizedText.includes(normalizedQuery)
    );
}

function updateSearchResultCount() {
    document.getElementById("searchResultCount").textContent =
        filteredData.length.toLocaleString("vi-VN");
}

function copyPhoneNumber(phone) {
    if (!phone) return;
    navigator.clipboard.writeText(phone).catch(err => {
        console.error('Failed to copy phone number:', err);
    });
}

function highlightSearchText(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =====================================================
// MERGE ORDERS BY PHONE NUMBER
// =====================================================

function mergeOrdersByPhone(orders) {
    if (!orders || orders.length === 0) return orders;

    // Normalize phone numbers (remove spaces, dots, dashes, country code)
    const normalizePhone = (phone) => {
        if (!phone) return '';
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('84')) {
            cleaned = '0' + cleaned.substring(2);
        }
        return cleaned;
    };

    // Group orders by normalized phone number
    const phoneGroups = new Map();

    orders.forEach(order => {
        const normalizedPhone = normalizePhone(order.Telephone);
        if (!normalizedPhone) {
            if (!phoneGroups.has(`no_phone_${order.Id}`)) {
                phoneGroups.set(`no_phone_${order.Id}`, []);
            }
            phoneGroups.get(`no_phone_${order.Id}`).push(order);
        } else {
            if (!phoneGroups.has(normalizedPhone)) {
                phoneGroups.set(normalizedPhone, []);
            }
            phoneGroups.get(normalizedPhone).push(order);
        }
    });

    // Merge orders in each group
    const mergedOrders = [];

    phoneGroups.forEach((groupOrders, phone) => {
        if (groupOrders.length === 1) {
            mergedOrders.push(groupOrders[0]);
        } else {
            const sortedOrders = [...groupOrders].sort((a, b) => {
                const sttA = parseInt(a.SessionIndex) || 0;
                const sttB = parseInt(b.SessionIndex) || 0;
                return sttB - sttA;
            });

            const targetOrder = sortedOrders[0];
            const sourceOrders = sortedOrders.slice(1);

            const allCodes = [];
            const allNames = new Set();
            const allAddresses = new Set();
            const allNotes = [];
            const allSTTs = [];
            let totalAmount = 0;
            let totalQuantity = 0;
            const allIds = [];
            let earliestDate = targetOrder.DateCreated;

            groupOrders.forEach(order => {
                allCodes.push(order.Code);
                if (order.Name && order.Name.trim()) allNames.add(order.Name.trim());
                if (order.Address && order.Address.trim()) allAddresses.add(order.Address.trim());
                if (order.Note && order.Note.trim()) allNotes.push(order.Note.trim());
                if (order.SessionIndex) allSTTs.push(order.SessionIndex);
                totalAmount += (order.TotalAmount || 0);
                totalQuantity += (order.TotalQuantity || 0);
                allIds.push(order.Id);

                if (new Date(order.DateCreated) < new Date(earliestDate)) {
                    earliestDate = order.DateCreated;
                }
            });

            const customerGroups = new Map();
            groupOrders.forEach(order => {
                const name = order.Name?.trim() || 'Unknown';
                if (!customerGroups.has(name)) {
                    customerGroups.set(name, []);
                }
                customerGroups.get(name).push(order);
            });

            const uniqueCustomerCount = customerGroups.size;
            const isSingleCustomer = uniqueCustomerCount === 1;

            const originalOrders = groupOrders.map(order => ({
                Id: order.Id,
                Name: order.Name,
                Code: order.Code,
                SessionIndex: order.SessionIndex,
                Facebook_ASUserId: order.Facebook_ASUserId,
                Facebook_PostId: order.Facebook_PostId,
                Telephone: order.Telephone,
                TotalAmount: order.TotalAmount || 0,
                TotalQuantity: order.TotalQuantity || 0
            }));

            const customerGroupsInfo = Array.from(customerGroups.entries()).map(([name, orders]) => {
                const sortedOrders = [...orders].sort((a, b) => {
                    const sttA = parseInt(a.SessionIndex) || 0;
                    const sttB = parseInt(b.SessionIndex) || 0;
                    return sttB - sttA;
                });

                return {
                    name,
                    orderCount: orders.length,
                    orders: sortedOrders.map(o => ({
                        id: o.Id,
                        stt: o.SessionIndex,
                        psid: o.Facebook_ASUserId,
                        channelId: window.chatDataManager ? window.chatDataManager.parseChannelId(o.Facebook_PostId) : null,
                        code: o.Code
                    }))
                };
            });

            const mergedOrder = {
                ...targetOrder,
                Code: allCodes.join(' + '),
                Name: Array.from(allNames).join(' / '),
                Address: Array.from(allAddresses).join(' | '),
                Note: allNotes.length > 0 ? allNotes.join(' | ') : targetOrder.Note,
                TotalAmount: totalAmount,
                TotalQuantity: totalQuantity,
                DateCreated: earliestDate,
                Id: allIds.join('_'),
                OriginalIds: allIds,
                MergedCount: groupOrders.length,
                SessionIndex: allSTTs.length > 1 ? allSTTs.join(' + ') : (targetOrder.SessionIndex || ''),
                AllSTTs: allSTTs,
                TargetOrderId: targetOrder.Id,
                SourceOrderIds: sourceOrders.map(o => o.Id),
                TargetSTT: targetOrder.SessionIndex,
                SourceSTTs: sourceOrders.map(o => o.SessionIndex),
                IsMerged: true,
                OriginalOrders: originalOrders,
                IsSingleCustomer: isSingleCustomer,
                UniqueCustomerCount: uniqueCustomerCount,
                CustomerGroups: customerGroupsInfo
            };

            mergedOrders.push(mergedOrder);
        }
    });

    return mergedOrders;
}

// =====================================================
// SORTING FUNCTIONS
// =====================================================

function resetSorting() {
    // Remove sort indicators from all headers
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    // Reset current sort state
    if (typeof window.currentSortColumn !== 'undefined') {
        window.currentSortColumn = null;
        window.currentSortDirection = null;
    }
}

function sortTable(column) {
    const direction = window.currentSortColumn === column && window.currentSortDirection === 'asc' ? 'desc' : 'asc';
    window.currentSortColumn = column;
    window.currentSortDirection = direction;

    // Update header indicators
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === column) {
            th.classList.add(`sort-${direction}`);
        }
    });

    // Sort displayed data
    displayedData.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        // Handle numeric sorting
        if (column === 'SessionIndex' || column === 'TotalAmount' || column === 'TotalQuantity') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        }

        // Handle date sorting
        if (column === 'DateCreated') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        }

        // Handle string sorting
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = (bVal || '').toLowerCase();
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable();
}

// =====================================================
// EXPORTS
// =====================================================

window.handleTableSearch = handleTableSearch;
window.performTableSearch = performTableSearch;
window.matchesSearchQuery = matchesSearchQuery;
window.updateSearchResultCount = updateSearchResultCount;
window.copyPhoneNumber = copyPhoneNumber;
window.highlightSearchText = highlightSearchText;
window.escapeRegex = escapeRegex;
window.mergeOrdersByPhone = mergeOrdersByPhone;
window.resetSorting = resetSorting;
window.sortTable = sortTable;

console.log('[TAB1-SEARCH] Module loaded');
