// ==========================================
// TAB OVERVIEW - TAG AGGREGATION BY EMPLOYEE
// ==========================================

// Global Variables
let database = null;
let currentCampaignData = null;
let employeeRanges = [];
let allOrders = [];
let allTags = [];
let campaignsList = [];

// Initialize Firebase
document.addEventListener('DOMContentLoaded', function () {
    console.log('[OVERVIEW] Initializing...');

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    database = firebase.database();
    console.log('[OVERVIEW] Firebase initialized');

    // Load initial data
    initializeData();
});

// Initialize Data
async function initializeData() {
    try {
        // Load campaigns
        await loadCampaigns();

        // Load available tags from cache
        await loadAvailableTags();

    } catch (error) {
        console.error('[OVERVIEW] Error initializing:', error);
        showError('Lỗi khởi tạo: ' + error.message);
    }
}

// Load Campaigns from Firebase
async function loadCampaigns() {
    console.log('[OVERVIEW] Loading campaigns from Firebase...');

    const campaignFilter = document.getElementById('campaignFilter');
    campaignFilter.innerHTML = '<option value="">-- Đang tải chiến dịch --</option>';

    try {
        const snapshot = await database.ref('settings/employee_ranges_by_campaign').once('value');
        const campaignData = snapshot.val();

        if (!campaignData) {
            campaignFilter.innerHTML = '<option value="">-- Không có chiến dịch nào --</option>';
            console.log('[OVERVIEW] No campaigns found');
            return;
        }

        // Convert to array and sort
        campaignsList = Object.keys(campaignData).map(key => ({
            key: key,
            name: key,
            employees: campaignData[key]
        }));

        console.log(`[OVERVIEW] Loaded ${campaignsList.length} campaigns`);

        // Populate select
        let html = '<option value="">-- Chọn chiến dịch --</option>';
        campaignsList.forEach(campaign => {
            html += `<option value="${campaign.key}">${campaign.name}</option>`;
        });
        campaignFilter.innerHTML = html;

    } catch (error) {
        console.error('[OVERVIEW] Error loading campaigns:', error);
        campaignFilter.innerHTML = '<option value="">-- Lỗi tải chiến dịch --</option>';
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

// Campaign Change Handler
async function onCampaignChange() {
    const campaignFilter = document.getElementById('campaignFilter');
    const selectedKey = campaignFilter.value;

    if (!selectedKey) {
        showEmptyState('Vui lòng chọn chiến dịch để xem tổng quan');
        document.getElementById('exportBtn').disabled = true;
        return;
    }

    console.log('[OVERVIEW] Campaign selected:', selectedKey);

    // Find campaign data
    currentCampaignData = campaignsList.find(c => c.key === selectedKey);

    if (!currentCampaignData) {
        showError('Không tìm thấy dữ liệu chiến dịch');
        return;
    }

    // Load data for this campaign
    await loadData();
}

// Load Data for Selected Campaign
async function loadData() {
    if (!currentCampaignData) {
        showEmptyState('Vui lòng chọn chiến dịch để xem tổng quan');
        return;
    }

    console.log('[OVERVIEW] Loading data for campaign:', currentCampaignData.name);

    showLoading('Đang tải dữ liệu...');
    document.getElementById('exportBtn').disabled = true;

    try {
        // Get employee ranges
        employeeRanges = currentCampaignData.employees || [];
        console.log(`[OVERVIEW] Loaded ${employeeRanges.length} employee ranges`);

        if (employeeRanges.length === 0) {
            showEmptyState('Chiến dịch này chưa có cài đặt phân chia nhân viên');
            return;
        }

        // Extract date range from campaign name
        const dateRange = extractDateRangeFromCampaignName(currentCampaignData.name);
        console.log('[OVERVIEW] Date range:', dateRange);

        if (!dateRange || dateRange.dates.length === 0) {
            showError('Không thể trích xuất ngày từ tên chiến dịch');
            return;
        }

        // Load orders for this campaign
        await loadOrdersForCampaign(dateRange.dates);

        // Aggregate data
        const aggregatedData = aggregateTagsByEmployee();

        // Render overview
        renderOverview(aggregatedData);

        // Enable export
        document.getElementById('exportBtn').disabled = false;

    } catch (error) {
        console.error('[OVERVIEW] Error loading data:', error);
        showError('Lỗi tải dữ liệu: ' + error.message);
    }
}

// Extract Date Range from Campaign Name
function extractDateRangeFromCampaignName(campaignName) {
    console.log('[OVERVIEW] Extracting dates from:', campaignName);

    // Extract dates like "2025-12-04, 2025-12-03, 2025-12-02, 2025-12-01"
    const datePattern = /(\d{4}-\d{2}-\d{2})/g;
    const matches = campaignName.match(datePattern);

    if (matches && matches.length > 0) {
        return {
            dates: matches,
            startDate: matches[matches.length - 1], // oldest
            endDate: matches[0] // newest
        };
    }

    // Try another pattern: DD/MM/YY or DD_MM_YYYY
    const altPattern = /(\d{2}[/_]\d{2}[/_]\d{2,4})/g;
    const altMatches = campaignName.match(altPattern);

    if (altMatches && altMatches.length > 0) {
        // Convert to YYYY-MM-DD format
        const dates = altMatches.map(dateStr => {
            const parts = dateStr.split(/[/_]/);
            const day = parts[0];
            const month = parts[1];
            let year = parts[2];

            // Convert 2-digit year to 4-digit
            if (year.length === 2) {
                year = '20' + year;
            }

            return `${year}-${month}-${day}`;
        });

        return {
            dates: dates,
            startDate: dates[dates.length - 1],
            endDate: dates[0]
        };
    }

    return null;
}

// Load Orders for Campaign
async function loadOrdersForCampaign(dates) {
    console.log('[OVERVIEW] Loading orders for dates:', dates);

    allOrders = [];

    try {
        // Convert dates to UTC ranges
        const dateRanges = dates.map(dateStr => {
            const date = new Date(dateStr);
            const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
            const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

            return {
                start: startOfDay.toISOString(),
                end: endOfDay.toISOString()
            };
        });

        // Load orders for each date range
        for (const range of dateRanges) {
            const filter = `(DateCreated ge ${range.start} and DateCreated le ${range.end})`;
            const url = `${API_CONFIG.WORKER_URL}/api/odata/SaleOnline_Order/ODataService.GetView?$top=5000&$orderby=DateCreated desc&$filter=${encodeURIComponent(filter)}&$select=Id,STT,Tag,TagSecondary,DateCreated,OrderStatus`;

            console.log('[OVERVIEW] Fetching orders for range:', range);

            const headers = await window.tokenManager.getAuthHeader();
            const response = await API_CONFIG.smartFetch(url, {
                headers: {
                    ...headers,
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const orders = data.value || [];

            console.log(`[OVERVIEW] Loaded ${orders.length} orders for range`);
            allOrders = allOrders.concat(orders);
        }

        console.log(`[OVERVIEW] Total orders loaded: ${allOrders.length}`);

    } catch (error) {
        console.error('[OVERVIEW] Error loading orders:', error);
        throw error;
    }
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
            // Primary tag
            if (order.Tag) {
                const tagName = getTagName(order.Tag);
                tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
            }

            // Secondary tag
            if (order.TagSecondary) {
                const tagName = getTagName(order.TagSecondary);
                tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
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
    if (!currentCampaignData || employeeRanges.length === 0) {
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
        data.push(['TỔNG QUAN - ' + currentCampaignData.name]);
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
        const fileName = `TongQuan_${currentCampaignData.key}_${new Date().toISOString().split('T')[0]}.xlsx`;
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
