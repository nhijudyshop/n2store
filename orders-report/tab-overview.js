// ==========================================
// TAB OVERVIEW - TAG AGGREGATION BY EMPLOYEE
// ==========================================

// Global Variables
let database = null;
let currentCampaignName = null;
let employeeRanges = [];
let allOrders = [];
let allTags = [];

// Initialize Firebase
document.addEventListener('DOMContentLoaded', function () {
    console.log('[OVERVIEW] Initializing...');

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    database = firebase.database();
    console.log('[OVERVIEW] Firebase initialized');

    // Setup listener for messages from tab1
    setupMessageListener();

    // Load available tags from cache
    loadAvailableTags();

    // Request initial data from tab1
    requestOrdersDataFromTab1();
});

// Setup Message Listener to receive data from tab1-orders
function setupMessageListener() {
    window.addEventListener('message', function(event) {
        if (event.data.type === 'ORDERS_DATA_RESPONSE') {
            console.log('[OVERVIEW] Received orders data from tab1:', event.data.orders.length);

            // Update allOrders with data from tab1
            allOrders = event.data.orders || [];

            if (allOrders.length === 0) {
                showEmptyState('Không có đơn hàng. Vui lòng load dữ liệu ở tab Quản Lý Đơn Hàng trước.');
                return;
            }

            // Debug: Log first order structure
            console.log('[OVERVIEW] First order structure:', allOrders[0]);
            console.log('[OVERVIEW] First order Tags:', allOrders[0].Tags);
            console.log('[OVERVIEW] First order LiveCampaignName:', allOrders[0].LiveCampaignName);
            console.log('[OVERVIEW] Order fields:', Object.keys(allOrders[0]));

            // Auto-detect campaign from first order
            // Try different field names
            currentCampaignName = allOrders[0].LiveCampaignName
                || allOrders[0].liveCampaignName
                || allOrders[0].CampaignName
                || allOrders[0].campaignName;

            console.log('[OVERVIEW] Auto-detected campaign:', currentCampaignName);

            if (!currentCampaignName) {
                showError('Không tìm thấy tên chiến dịch trong dữ liệu. Vui lòng kiểm tra lại.');
                console.error('[OVERVIEW] Order fields:', Object.keys(allOrders[0]));
                return;
            }

            // Load employee ranges for this campaign
            loadEmployeeRangesAndRender();
        }
    });

    console.log('[OVERVIEW] Message listener setup complete');
}

// Load employee ranges and render overview
async function loadEmployeeRangesAndRender() {
    if (!currentCampaignName) {
        showError('Không xác định được chiến dịch');
        return;
    }

    showLoading('Đang tải cài đặt nhân viên...');

    try {
        // Load employee ranges from Firebase
        await loadEmployeeRangesForCampaign(currentCampaignName);

        if (employeeRanges.length === 0) {
            showEmptyState(`Chiến dịch "${currentCampaignName}" chưa có cài đặt phân chia nhân viên`);
            return;
        }

        // Aggregate and render
        const aggregatedData = aggregateTagsByEmployee();
        renderOverview(aggregatedData);
        document.getElementById('exportBtn').disabled = false;

    } catch (error) {
        console.error('[OVERVIEW] Error loading employee ranges:', error);
        showError('Lỗi tải cài đặt nhân viên: ' + error.message);
    }
}

// Load Employee Ranges for Campaign
async function loadEmployeeRangesForCampaign(campaignName) {
    console.log('[OVERVIEW] Loading employee ranges for campaign:', campaignName);

    try {
        // Sanitize campaign name for Firebase key - replace invalid characters and forward slash, dash
        const sanitizedName = campaignName.replace(/[.$#\[\]\/\-]/g, '_');

        const snapshot = await database.ref('settings/employee_ranges_by_campaign').once('value');
        const allCampaignRanges = snapshot.val() || {};
        const data = allCampaignRanges[sanitizedName];

        if (data && data.length > 0) {
            employeeRanges = data;
            console.log(`[OVERVIEW] ✅ Loaded ${employeeRanges.length} employee ranges for campaign`);
        } else {
            // Fallback to general config
            console.log('[OVERVIEW] No campaign-specific ranges found, trying general config');
            const generalSnapshot = await database.ref('settings/employee_ranges').once('value');
            employeeRanges = generalSnapshot.val() || [];
            console.log(`[OVERVIEW] ✅ Loaded ${employeeRanges.length} ranges from general config (fallback)`);
        }

    } catch (error) {
        console.error('[OVERVIEW] Error loading employee ranges:', error);
        employeeRanges = [];
        throw error;
    }
}

// Load Available Tags
async function loadAvailableTags() {
    console.log('[OVERVIEW] Loading available tags...');

    try {
        // Try to load from cache first
        if (window.cacheManager) {
            const cached = await window.cacheManager.get('tags');
            if (cached) {
                allTags = cached;
                console.log(`[OVERVIEW] Loaded ${allTags.length} tags from cache`);
                return;
            }
        }

        // Load from API
        const headers = await window.tokenManager.getAuthHeader();
        const response = await API_CONFIG.smartFetch(
            'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
            {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        allTags = data.value || [];

        // Cache it
        if (window.cacheManager) {
            await window.cacheManager.set('tags', allTags);
        }

        console.log(`[OVERVIEW] Loaded ${allTags.length} tags from API`);

    } catch (error) {
        console.error('[OVERVIEW] Error loading tags:', error);
        allTags = [];
    }
}

// Get Tag Name by ID
function getTagName(tagId) {
    const tag = allTags.find(t => t.Id === tagId);
    return tag ? tag.Name : `Tag #${tagId}`;
}

// Get Tag Color by ID
function getTagColor(tagId) {
    const tag = allTags.find(t => t.Id === tagId);
    return tag ? tag.Color : '#6b7280';
}

// Request orders data from tab1-orders
function requestOrdersDataFromTab1() {
    console.log('[OVERVIEW] Requesting orders data from tab1-orders...');

    // Send message to parent window, which will forward to tab1
    window.parent.postMessage({
        type: 'REQUEST_ORDERS_DATA_FROM_OVERVIEW'
    }, '*');
}

// Aggregate Tags by Employee
function aggregateTagsByEmployee() {
    console.log('[OVERVIEW] Aggregating tags by employee...');

    const employeeData = [];

    employeeRanges.forEach(emp => {
        const empId = emp.id;
        const empName = emp.name;
        const startSTT = emp.start;
        const endSTT = emp.end;

        console.log(`[OVERVIEW] Processing employee: ${empName} (STT: ${startSTT}-${endSTT})`);

        // Filter orders by STT range
        const empOrders = allOrders.filter(order => {
            const stt = parseInt(order.STT);
            return stt >= startSTT && stt <= endSTT;
        });

        console.log(`[OVERVIEW] Found ${empOrders.length} orders for ${empName}`);

        // Aggregate tags
        const tagCounts = {};
        let totalOrders = empOrders.length;

        empOrders.forEach(order => {
            // Parse Tags JSON array (same format as tab1-orders)
            if (order.Tags) {
                try {
                    const tags = JSON.parse(order.Tags);
                    if (Array.isArray(tags)) {
                        tags.forEach(tag => {
                            const tagName = tag.Name || `Tag #${tag.Id}`;
                            tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
                        });
                    }
                } catch (e) {
                    console.warn(`[OVERVIEW] Failed to parse tags for order ${order.Id}:`, e);
                }
            }
        });

        employeeData.push({
            id: empId,
            name: empName,
            start: startSTT,
            end: endSTT,
            totalOrders: totalOrders,
            tagCounts: tagCounts
        });
    });

    return employeeData;
}

// Render Overview
function renderOverview(employeeData) {
    console.log('[OVERVIEW] Rendering overview...');

    const container = document.getElementById('overviewContainer');

    if (employeeData.length === 0) {
        showEmptyState('Không có dữ liệu để hiển thị');
        return;
    }

    // Calculate overall statistics
    const allTagsSet = new Set();
    employeeData.forEach(emp => {
        Object.keys(emp.tagCounts).forEach(tag => allTagsSet.add(tag));
    });
    const allTagsList = Array.from(allTagsSet).sort();

    const totalOrders = employeeData.reduce((sum, emp) => sum + emp.totalOrders, 0);

    // Build HTML
    let html = '';

    // Header
    html += `
        <div class="overview-header">
            <h2>TỔNG QUAN</h2>
        </div>
    `;

    // Summary Stats (Overall)
    html += '<div class="summary-stats">';

    // Total orders
    html += `
        <div class="stat-item">
            <div class="stat-label">Tổng Đơn</div>
            <div class="stat-value">${totalOrders}</div>
        </div>
    `;

    // Add summary for each tag
    const overallTagCounts = {};
    employeeData.forEach(emp => {
        Object.entries(emp.tagCounts).forEach(([tag, count]) => {
            overallTagCounts[tag] = (overallTagCounts[tag] || 0) + count;
        });
    });

    allTagsList.forEach(tag => {
        const count = overallTagCounts[tag] || 0;
        html += `
            <div class="stat-item">
                <div class="stat-label">${tag}</div>
                <div class="stat-value">${count}</div>
            </div>
        `;
    });

    html += '</div>';

    // Employee Sections
    employeeData.forEach(emp => {
        html += `
            <div class="employee-section">
                <div class="employee-header">
                    <div class="employee-name">
                        <i class="fas fa-user"></i>
                        ${emp.name}
                    </div>
                    <div class="employee-summary">
                        <div class="employee-summary-item">
                            <i class="fas fa-hashtag"></i>
                            Bắt Đầu: ${emp.start}
                        </div>
                        <div class="employee-summary-item">
                            <i class="fas fa-hashtag"></i>
                            Kết Thúc: ${emp.end}
                        </div>
                        <div class="employee-summary-item">
                            <i class="fas fa-shopping-cart"></i>
                            Tổng Đơn: ${emp.totalOrders}
                        </div>
                    </div>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Tag</th>
                                <th class="text-center">Số Lượng</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Sort tags by count descending
        const sortedTags = Object.entries(emp.tagCounts).sort((a, b) => b[1] - a[1]);

        if (sortedTags.length === 0) {
            html += `
                <tr>
                    <td colspan="2" class="text-center" style="padding: 40px; color: #94a3b8;">
                        <i class="fas fa-info-circle"></i> Không có tag nào
                    </td>
                </tr>
            `;
        } else {
            sortedTags.forEach(([tag, count]) => {
                html += `
                    <tr>
                        <td>${tag}</td>
                        <td class="text-center" style="font-weight: 600;">${count}</td>
                    </tr>
                `;
            });
        }

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Export to Excel
function exportToExcel() {
    if (!currentCampaignName || employeeRanges.length === 0 || allOrders.length === 0) {
        alert('Không có dữ liệu để export');
        return;
    }

    console.log('[OVERVIEW] Exporting to Excel...');

    try {
        // Aggregate data
        const employeeData = aggregateTagsByEmployee();

        // Prepare data for Excel
        const data = [];

        // Header
        data.push(['TỔNG QUAN - ' + currentCampaignName]);
        data.push(['Xuất ngày:', new Date().toLocaleString('vi-VN')]);
        data.push([]);

        // Overall summary
        data.push(['TỔNG QUAN CHUNG']);
        data.push([]);

        const allTagsSet = new Set();
        employeeData.forEach(emp => {
            Object.keys(emp.tagCounts).forEach(tag => allTagsSet.add(tag));
        });
        const allTagsList = Array.from(allTagsSet).sort();

        const overallTagCounts = {};
        employeeData.forEach(emp => {
            Object.entries(emp.tagCounts).forEach(([tag, count]) => {
                overallTagCounts[tag] = (overallTagCounts[tag] || 0) + count;
            });
        });

        // Overall stats header
        const headerRow = ['Tag', 'Số Lượng'];
        data.push(headerRow);

        allTagsList.forEach(tag => {
            const count = overallTagCounts[tag] || 0;
            data.push([tag, count]);
        });

        data.push([]);
        data.push([]);

        // Employee details
        employeeData.forEach(emp => {
            data.push([`NHÂN VIÊN: ${emp.name}`]);
            data.push([`Bắt Đầu: ${emp.start}`, `Kết Thúc: ${emp.end}`, `Tổng Đơn: ${emp.totalOrders}`]);
            data.push([]);

            // Tags
            data.push(['Tag', 'Số Lượng']);

            const sortedTags = Object.entries(emp.tagCounts).sort((a, b) => b[1] - a[1]);

            if (sortedTags.length === 0) {
                data.push(['(Không có tag)', 0]);
            } else {
                sortedTags.forEach(([tag, count]) => {
                    data.push([tag, count]);
                });
            }

            data.push([]);
            data.push([]);
        });

        // Create workbook
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tổng Quan');

        // Save file
        const sanitizedName = currentCampaignName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `TongQuan_${sanitizedName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        console.log('[OVERVIEW] Export completed:', fileName);
        alert('Đã export thành công!');

    } catch (error) {
        console.error('[OVERVIEW] Error exporting:', error);
        alert('Lỗi export: ' + error.message);
    }
}

// UI Helper Functions
function showLoading(message = 'Đang tải...') {
    const container = document.getElementById('overviewContainer');
    container.innerHTML = `
        <div class="loading-state spinning">
            <i class="fas fa-spinner"></i>
            <p>${message}</p>
        </div>
    `;
}

function showEmptyState(message) {
    const container = document.getElementById('overviewContainer');
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <h3>Không có dữ liệu</h3>
            <p>${message}</p>
        </div>
    `;
}

function showError(message) {
    const container = document.getElementById('overviewContainer');
    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Lỗi</h3>
            <p>${message}</p>
        </div>
    `;
}
