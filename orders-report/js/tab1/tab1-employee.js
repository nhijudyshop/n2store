// #region ═══════════════════════════════════════════════════════════════════════
// ║                   SECTION 4: EMPLOYEE RANGE MANAGEMENT                      ║
// ║                            search: #EMPLOYEE                                ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// EMPLOYEE RANGE MANAGEMENT FUNCTIONS #EMPLOYEE
// =====================================================
async function loadAndRenderEmployeeTable() {
    try {
        // Initialize user loader
        if (window.userEmployeeLoader) {
            await window.userEmployeeLoader.initialize();
            const users = await window.userEmployeeLoader.loadUsers();

            if (users.length > 0) {
                renderEmployeeTable(users);
            } else {
                console.warn('[EMPLOYEE] No users found');
                const tbody = document.getElementById('employeeAssignmentBody');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Không tìm thấy nhân viên nào</td></tr>';
            }
        } else {
            console.error('[EMPLOYEE] userEmployeeLoader not available');
        }
    } catch (error) {
        console.error('[EMPLOYEE] Error loading employee table:', error);
        const tbody = document.getElementById('employeeAssignmentBody');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi tải danh sách nhân viên</td></tr>';
    }
}

function renderEmployeeTable(users) {
    const tbody = document.getElementById('employeeAssignmentBody');

    // Use global employeeRanges which is synced from Firebase
    let savedRanges = {};
    if (employeeRanges && employeeRanges.length > 0) {
        employeeRanges.forEach(range => {
            savedRanges[range.name] = { start: range.start, end: range.end };
        });
    }

    // Render table rows
    let html = '';
    users.forEach(user => {
        const savedRange = savedRanges[user.displayName] || { start: '', end: '' };

        html += `
            <tr>
                <td style="padding: 8px;">${user.displayName}</td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="start"
                        value="${savedRange.start}"
                        placeholder="Từ"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
                <td style="padding: 8px; text-align: center;">
                    <input type="number"
                        class="employee-range-input"
                        data-user-id="${user.id}"
                        data-user-name="${user.displayName}"
                        data-field="end"
                        value="${savedRange.end}"
                        placeholder="Đến"
                        style="width: 80px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 4px; text-align: center;">
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Sanitize campaign name for Firebase path (remove invalid chars: . $ # [ ] /)
function sanitizeCampaignName(campaignName) {
    if (!campaignName) return null;
    // Replace invalid Firebase key characters with underscore
    // Note: Forward slash (/) must be replaced to match tab-overview.html sanitization
    return campaignName
        .replace(/[.$#\[\]\/]/g, '_')
        .trim();
}

function applyEmployeeRanges() {
    const inputs = document.querySelectorAll('.employee-range-input');
    const rangesMap = {};

    // Collect ranges from inputs
    inputs.forEach(input => {
        const userName = input.getAttribute('data-user-name');
        const field = input.getAttribute('data-field');
        const value = input.value.trim();

        if (!rangesMap[userName]) {
            rangesMap[userName] = {};
        }

        rangesMap[userName][field] = value ? parseInt(value) : null;
    });

    // Build employee ranges array
    const newRanges = [];

    Object.keys(rangesMap).forEach(userName => {
        const range = rangesMap[userName];

        // Only include if both start and end are filled
        if (range.start !== null && range.end !== null && range.start > 0 && range.end > 0) {
            // Find user ID from input attribute
            const input = document.querySelector(`.employee-range-input[data-user-name="${userName}"]`);
            const userId = input ? input.getAttribute('data-user-id') : null;

            newRanges.push({
                id: userId,
                name: userName,
                start: range.start,
                end: range.end
            });
        }
    });

    // Determine save logic based on selected campaign
    const campaignSelector = document.getElementById('employeeCampaignSelector');
    let campaignInfo = '(cấu hình chung)';

    if (campaignSelector && campaignSelector.value) {
        // Get selected campaign data
        const selectedOption = campaignSelector.options[campaignSelector.selectedIndex];
        if (selectedOption && selectedOption.dataset.campaign) {
            const campaign = JSON.parse(selectedOption.dataset.campaign);
            const sanitizedName = sanitizeCampaignName(campaign.displayName);
            campaignInfo = `cho chiến dịch "${campaign.displayName}"`;

            console.log(`[EMPLOYEE] Saving ranges for campaign: ${campaign.displayName} (key: ${sanitizedName})`);

            // Load current campaign configs, update the specific campaign, then save
            if (database) {
                database.ref('settings/employee_ranges_by_campaign').once('value')
                    .then((snapshot) => {
                        const allCampaignRanges = snapshot.val() || {};

                        // Update this campaign's ranges
                        allCampaignRanges[sanitizedName] = newRanges;

                        // Save back to Firebase
                        return database.ref('settings/employee_ranges_by_campaign').set(allCampaignRanges);
                    })
                    .then(() => {
                        if (window.notificationManager) {
                            window.notificationManager.show(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`, 'success');
                        } else {
                            alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`);
                        }
                        toggleEmployeeDrawer();
                    })
                    .catch((error) => {
                        console.error('[EMPLOYEE] Error saving ranges to Firebase:', error);
                        alert('❌ Lỗi khi lưu lên Firebase: ' + error.message);
                    });
            } else {
                alert('❌ Lỗi: Không thể kết nối Firebase');
            }
            return; // Exit early for campaign-specific save
        }
    }

    // Save general config (default path)
    if (database) {
        database.ref('settings/employee_ranges').set(newRanges)
            .then(() => {
                if (window.notificationManager) {
                    window.notificationManager.show(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`, 'success');
                } else {
                    alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`);
                }
                toggleEmployeeDrawer();
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error saving ranges to Firebase:', error);
                alert('❌ Lỗi khi lưu lên Firebase: ' + error.message);
            });
    } else {
        alert('❌ Lỗi: Không thể kết nối Firebase');
    }
}

function getEmployeeName(stt) {
    if (!stt || employeeRanges.length === 0) return null;

    const sttNum = parseInt(stt);
    if (isNaN(sttNum)) return null;

    for (const range of employeeRanges) {
        if (sttNum >= range.start && sttNum <= range.end) {
            return range.name;
        }
    }

    return null;
}

function populateEmployeeCampaignSelector() {
    const select = document.getElementById('employeeCampaignSelector');
    if (!select) return;

    // Get campaigns from the main campaign filter
    const mainCampaignSelect = document.getElementById('campaignFilter');
    if (!mainCampaignSelect) {
        console.log('[EMPLOYEE] Main campaign filter not found');
        return;
    }

    // Clear and add default option
    select.innerHTML = '<option value="">Cấu hình chung (tất cả chiến dịch)</option>';

    // Copy campaigns from main filter
    const options = mainCampaignSelect.querySelectorAll('option');
    options.forEach(option => {
        if (option.value !== '') {
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.textContent = option.textContent;
            newOption.dataset.campaign = option.dataset.campaign;
            select.appendChild(newOption);
        }
    });

    console.log(`[EMPLOYEE] Populated campaign selector with ${select.options.length - 1} campaigns`);
}

function toggleEmployeeDrawer() {
    const drawer = document.getElementById('employeeDrawer');
    const overlay = document.getElementById('employeeDrawerOverlay');

    if (drawer && overlay) {
        const isActive = drawer.classList.contains('active');

        if (isActive) {
            // Close drawer
            drawer.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            // Open drawer - Reload table to show latest data
            populateEmployeeCampaignSelector();
            loadAndRenderEmployeeTable();
            drawer.classList.add('active');
            overlay.classList.add('active');
        }
    }
}

function toggleControlBar() {
    const controlBar = document.getElementById('controlBar');
    const btn = document.getElementById('toggleControlBarBtn');

    if (controlBar && btn) {
        const isHidden = controlBar.style.display === 'none';

        if (isHidden) {
            controlBar.style.display = 'flex'; // Or 'block' depending on layout, but flex is used in inline style in html sometimes. Let's check original css. 
            // The original div.filter-section likely has display: flex in CSS. 
            // Let's assume removing style.display will revert to CSS class definition, or set to '' to clear inline style.
            controlBar.style.display = '';

            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Ẩn bộ lọc';
        } else {
            controlBar.style.display = 'none';
            btn.innerHTML = '<i class="fas fa-sliders-h"></i> Hiển thị bộ lọc';
        }
    }
}

function checkAdminPermission() {
    const btn = document.getElementById('employeeSettingsBtn');
    if (btn) {
        // Check if user has admin permissions via detailedPermissions
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        const hasAdminAccess = auth?.detailedPermissions?.['baocaosaleonline']?.['viewRevenue'] === true ||
            auth?.roleTemplate === 'admin';
        if (!hasAdminAccess) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'inline-flex';
        }
    }
}

// Helper function to convert Firebase object to array if needed
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
        console.log(`[EMPLOYEE] Converted object with ${keys.length} keys to array`);
        return result;
    }

    return [];
}

function loadEmployeeRangesForCampaign(campaignName = null) {
    if (!database) {
        console.log('[EMPLOYEE] Database not initialized');
        return Promise.resolve();
    }

    if (campaignName) {
        // Load from campaign-specific config (object with campaign names as keys)
        const sanitizedName = sanitizeCampaignName(campaignName);
        console.log(`[EMPLOYEE] Loading ranges for campaign: ${campaignName} (key: ${sanitizedName})`);

        return database.ref('settings/employee_ranges_by_campaign').once('value')
            .then((snapshot) => {
                const allCampaignRanges = snapshot.val() || {};
                const data = allCampaignRanges[sanitizedName];
                const normalized = normalizeEmployeeRanges(data);

                if (normalized.length > 0) {
                    employeeRanges = normalized;
                    console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges for campaign: ${campaignName}`);
                } else {
                    // If no campaign-specific ranges found, fall back to general config
                    console.log('[EMPLOYEE] No campaign-specific ranges found, falling back to general config');
                    return database.ref('settings/employee_ranges').once('value')
                        .then((snapshot) => {
                            employeeRanges = normalizeEmployeeRanges(snapshot.val());
                            console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges from general config (fallback)`);
                        });
                }

                // Update employee table if drawer is open
                const drawer = document.getElementById('employeeDrawer');
                if (drawer && drawer.classList.contains('active')) {
                    loadAndRenderEmployeeTable();
                }
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error loading ranges:', error);
            });
    } else {
        // Load general config
        console.log('[EMPLOYEE] Loading general employee ranges');

        return database.ref('settings/employee_ranges').once('value')
            .then((snapshot) => {
                employeeRanges = normalizeEmployeeRanges(snapshot.val());
                console.log(`[EMPLOYEE] ✅ Loaded ${employeeRanges.length} ranges from general config`);

                // Update employee table if drawer is open
                const drawer = document.getElementById('employeeDrawer');
                if (drawer && drawer.classList.contains('active')) {
                    loadAndRenderEmployeeTable();
                }
            })
            .catch((error) => {
                console.error('[EMPLOYEE] Error loading ranges:', error);
            });
    }
}

function syncEmployeeRanges() {
    if (!database) return;

    const rangesRef = database.ref('settings/employee_ranges');
    rangesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        employeeRanges = normalizeEmployeeRanges(data);
        console.log(`[EMPLOYEE] Synced ${employeeRanges.length} ranges from Firebase`);

        // Re-apply filter to current view
        performTableSearch();
    });
}

