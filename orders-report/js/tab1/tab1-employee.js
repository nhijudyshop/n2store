// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
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
                tbody.innerHTML =
                    '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> Không tìm thấy nhân viên nào</td></tr>';
            }
        } else {
            console.error('[EMPLOYEE] userEmployeeLoader not available');
        }
    } catch (error) {
        console.error('[EMPLOYEE] Error loading employee table:', error);
        const tbody = document.getElementById('employeeAssignmentBody');
        tbody.innerHTML =
            '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi tải danh sách nhân viên</td></tr>';
    }
}

function renderEmployeeTable(users) {
    const tbody = document.getElementById('employeeAssignmentBody');

    // Use global employeeRanges which is synced from Firebase
    let savedRanges = {};
    if (employeeRanges && employeeRanges.length > 0) {
        employeeRanges.forEach((range) => {
            savedRanges[range.name] = { start: range.start, end: range.end };
        });
    }

    // Render table rows
    let html = '';
    users.forEach((user) => {
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
    return campaignName.replace(/[.$#\[\]\/]/g, '_').trim();
}

function applyEmployeeRanges() {
    const inputs = document.querySelectorAll('.employee-range-input');
    const rangesMap = {};

    // Collect ranges from inputs
    inputs.forEach((input) => {
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

    Object.keys(rangesMap).forEach((userName) => {
        const range = rangesMap[userName];

        // Only include if both start and end are filled
        if (range.start !== null && range.end !== null && range.start > 0 && range.end > 0) {
            // Find user ID from input attribute
            const input = document.querySelector(
                `.employee-range-input[data-user-name="${userName}"]`
            );
            const userId = input ? input.getAttribute('data-user-id') : null;

            newRanges.push({
                id: userId,
                name: userName,
                userId: userId,
                userName: userName,
                start: range.start,
                end: range.end,
            });
        }
    });

    // Use local firestoreDb or fallback to window.firestoreDb
    const db = typeof firestoreDb !== 'undefined' && firestoreDb ? firestoreDb : window.firestoreDb;

    // Determine save logic - MUST select a campaign (no general config)
    const campaignSelector = document.getElementById('employeeCampaignSelector');
    const selectedOption = campaignSelector
        ? campaignSelector.options[campaignSelector.selectedIndex]
        : null;

    if (!selectedOption || !selectedOption.dataset.campaign) {
        alert('⚠️ Vui lòng chọn chiến dịch trước khi áp dụng phân chia nhân viên.');
        return;
    }

    const campaign = JSON.parse(selectedOption.dataset.campaign);
    // Use campaign.id as the stable storage key. Name can be edited later — using id
    // keeps the link intact across renames. Server captures campaign.displayName as
    // a label so history rows stay human-readable.
    const campaignKey = campaign.id;
    const campaignInfo = `cho chiến dịch "${campaign.displayName}"`;

    const auth = window.authManager?.getAuthState?.() || {};
    const meta = {
        userId: auth.userId || auth.uid || auth.id || auth.username || null,
        userName: auth.displayName || auth.username || auth.userType || null,
        campaignLabel: campaign.displayName || null,
    };

    // Save via CampaignAPI (id-keyed)
    window.CampaignAPI.saveEmployeeRanges(campaignKey, newRanges, meta)
        .then(() => {
            // Update local state immediately
            employeeRanges = newRanges;
            window.employeeRanges = newRanges;

            if (window.notificationManager) {
                window.notificationManager.show(
                    `✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`,
                    'success'
                );
            } else {
                alert(`✅ Đã lưu phân chia cho ${newRanges.length} nhân viên ${campaignInfo}`);
            }
            toggleEmployeeDrawer();

            // Re-render table to reflect new ranges
            performTableSearch();
        })
        .catch((error) => {
            console.error('[EMPLOYEE] Error saving employee ranges:', error);
            alert('❌ Lỗi khi lưu: ' + error.message);
        });
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

    // Clear options - no general config option
    select.innerHTML = '<option value="" disabled>-- Chọn chiến dịch --</option>';

    // Get campaigns from window.campaignManager
    if (!window.campaignManager || !window.campaignManager.allCampaigns) {
        console.warn('[EMPLOYEE] window.campaignManager.allCampaigns not available');
        return;
    }

    const campaigns = window.campaignManager.allCampaigns;
    let count = 0;

    // Determine current campaign to auto-select
    const currentCampaignName =
        window.selectedCampaign?.displayName || window.selectedCampaign?.name || null;

    // Populate dropdown with campaigns
    Object.entries(campaigns).forEach(([campaignId, campaign]) => {
        const option = document.createElement('option');
        option.value = campaignId;
        const displayName = campaign.name || campaign.displayName || campaignId;
        option.textContent = displayName;
        // Store campaign data for later use
        option.dataset.campaign = JSON.stringify({
            id: campaignId,
            displayName: displayName,
        });

        // Auto-select current campaign
        if (currentCampaignName && displayName === currentCampaignName) {
            option.selected = true;
        }

        select.appendChild(option);
        count++;
    });

    // If no campaign was auto-selected, select the first real campaign
    if (!currentCampaignName && select.options.length > 1) {
        select.selectedIndex = 1;
    }

    // Load ranges for the selected campaign
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.campaign) {
        const campaign = JSON.parse(selectedOption.dataset.campaign);
        loadEmployeeRangesForCampaign(campaign).then(() => {
            // Re-render table with loaded ranges
            if (window.userEmployeeLoader && window.userEmployeeLoader.getUsers().length > 0) {
                renderEmployeeTable(window.userEmployeeLoader.getUsers());
            }
        });
    }

    // Wire change event so changing campaign in selector reloads ranges + history
    if (!select._cerWired) {
        select._cerWired = true;
        select.addEventListener('change', () => {
            const opt = select.options[select.selectedIndex];
            if (!opt || !opt.dataset.campaign) return;
            try {
                const c = JSON.parse(opt.dataset.campaign);
                loadEmployeeRangesForCampaign(c).then(() => {
                    if (
                        window.userEmployeeLoader &&
                        window.userEmployeeLoader.getUsers().length > 0
                    ) {
                        renderEmployeeTable(window.userEmployeeLoader.getUsers());
                    }
                });
            } catch (_e) {
                /* ignore parse errors */
            }
        });
    }
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
        // ✅ REMOVED PERMISSION CHECK - All users can now access employee settings
        // Previously: Only admin or users with 'viewRevenue' permission could access
        btn.style.display = 'inline-flex';
    }
}

// Helper function to convert Firebase object to array if needed
function normalizeEmployeeRanges(data) {
    if (!data) {
        return [];
    }

    // If already an array, return it
    if (Array.isArray(data)) {
        return data;
    }

    // If it's an object, convert to array
    if (typeof data === 'object') {
        const result = [];
        const allKeys = Object.keys(data);

        // Try numeric keys first (Firebase array-like object: {0: {...}, 1: {...}})
        const numericKeys = allKeys.filter((k) => !isNaN(k)).sort((a, b) => Number(a) - Number(b));

        if (numericKeys.length > 0) {
            // Has numeric keys - Firebase stored array as object
            for (const key of numericKeys) {
                if (data[key] && typeof data[key] === 'object') {
                    result.push(data[key]);
                }
            }
        } else {
            // No numeric keys - maybe keys are user IDs or other strings
            // Check if values have the expected structure (name, start, end)
            for (const key of allKeys) {
                const item = data[key];
                if (item && typeof item === 'object' && 'start' in item && 'end' in item) {
                    // Add the key as id if not present
                    if (!item.id) {
                        item.id = key;
                    }
                    result.push(item);
                }
            }
        }

        return result;
    }

    return [];
}

// Track current onSnapshot unsubscribe function
let _employeeRangesUnsubscribe = null;
let _currentListeningCampaign = null;

/**
 * Resolve a campaign argument to { id, displayName }. Accepts:
 *   - object with .id (e.g. employee-drawer dropdown — preferred path)
 *   - object with .campaignNames array (Shopify-merged main filter — fuzzy match
 *     against allCampaigns to derive id)
 *   - object with .displayName / .name only — try by-name lookup
 *   - string campaign displayName (legacy callers)
 */
function _resolveCampaign(arg) {
    if (!arg) return null;
    if (typeof arg === 'object') {
        // Preferred: explicit id
        if (arg.id) {
            return {
                id: String(arg.id),
                displayName: arg.displayName || arg.name || String(arg.id),
            };
        }
        // Shopify-merged main filter selection — fuzzy match shopifyNames → DB id
        if (Array.isArray(arg.campaignNames) && arg.campaignNames.length > 0) {
            try {
                const matchedId =
                    typeof window._findMatchingDbCampaignId === 'function'
                        ? window._findMatchingDbCampaignId(arg.campaignNames)
                        : null;
                if (matchedId) {
                    const c = window.campaignManager?.allCampaigns?.[matchedId];
                    return {
                        id: String(matchedId),
                        displayName:
                            arg.displayName || c?.name || c?.displayName || String(matchedId),
                    };
                }
            } catch (_e) {
                /* fall through */
            }
        }
        // Last attempt: by displayName / name lookup
        const name = arg.displayName || arg.name;
        if (name) return _resolveCampaign(name);
        return null;
    }

    const name = String(arg);
    const campaigns = window.campaignManager?.allCampaigns || {};
    for (const [id, c] of Object.entries(campaigns)) {
        const display = c?.name || c?.displayName || id;
        if (display === name) return { id: String(id), displayName: display };
    }
    // Fallback: treat the name itself as the key (no id available).
    return { id: null, displayName: name };
}

/**
 * Load employee ranges for a campaign.
 * Lookup order: by campaign.id (preferred, stable across renames) → by sanitized
 * displayName (legacy data). When legacy data is found, auto-migrate to id-keyed
 * row by issuing a save under the new key.
 */
function loadEmployeeRangesForCampaign(campaignArg = null) {
    if (!campaignArg) {
        employeeRanges = [];
        window.employeeRanges = [];
        stopEmployeeRangesListener();
        _resetEmployeeViewModeBtn();
        return Promise.resolve();
    }

    const c = _resolveCampaign(campaignArg);
    if (!c || (!c.id && !c.displayName)) {
        return Promise.resolve();
    }

    const sanitizedName = sanitizeCampaignName(c.displayName);

    // Real-time listener uses the resolved key (prefer id, fallback to sanitized name)
    const listenerKey = c.id || sanitizedName;
    startEmployeeRangesListener(listenerKey, c.displayName);

    const api = window.CampaignAPI;

    // 1. Try id-keyed first
    const tryId = c.id
        ? api.getEmployeeRanges(c.id).then((d) => normalizeEmployeeRanges(d))
        : Promise.resolve([]);

    return tryId
        .then(async (rangesById) => {
            if (rangesById && rangesById.length > 0) {
                return rangesById;
            }
            // 2. Legacy fallback: by sanitized displayName
            try {
                const rangesByName = normalizeEmployeeRanges(
                    await api.getEmployeeRanges(sanitizedName)
                );
                if (rangesByName.length > 0 && c.id) {
                    // Auto-migrate: persist under id key for future loads. Best-effort.
                    api.saveEmployeeRanges(c.id, rangesByName, {
                        userId: '__migration__',
                        userName: 'auto-migration (legacy name → id)',
                        campaignLabel: c.displayName,
                    }).catch((e) =>
                        console.warn('[EMPLOYEE] auto-migration save failed:', e?.message)
                    );
                }
                return rangesByName;
            } catch (_e) {
                return [];
            }
        })
        .then((normalized) => {
            employeeRanges = normalized;
            window.employeeRanges = employeeRanges;

            const drawer = document.getElementById('employeeDrawer');
            if (drawer && drawer.classList.contains('active')) {
                if (window.userEmployeeLoader && window.userEmployeeLoader.getUsers().length > 0) {
                    renderEmployeeTable(window.userEmployeeLoader.getUsers());
                }
            }
        })
        .catch((error) => {
            console.error('[EMPLOYEE] ❌ Error loading ranges:', error);
        });
}

/**
 * Start real-time listener on employee_ranges document for the given campaign key.
 * When any machine saves new ranges, every other machine receives the update on the
 * next poll interval.
 *
 * @param {string} key - the storage key (campaign.id preferred; sanitized name as fallback)
 * @param {string} [displayName] - optional human-readable campaign label (for logs only)
 */
function startEmployeeRangesListener(key, displayName) {
    if (!key) return;

    // Don't restart listener if already listening to the same key
    if (_currentListeningCampaign === key && _employeeRangesUnsubscribe) {
        return;
    }

    // Stop previous listener/polling
    stopEmployeeRangesListener();

    _currentListeningCampaign = key;

    // Poll every 30s instead of Firestore onSnapshot (employee ranges rarely change)
    const pollInterval = setInterval(async () => {
        try {
            const data = await window.CampaignAPI.getEmployeeRanges(key);
            const normalized = normalizeEmployeeRanges(data);

            // Only update if data actually changed
            const oldJSON = JSON.stringify(employeeRanges);
            const newJSON = JSON.stringify(normalized);

            if (oldJSON !== newJSON) {
                employeeRanges = normalized;
                window.employeeRanges = employeeRanges;
                // Re-apply filter to current view
                if (typeof performTableSearch === 'function') {
                    performTableSearch();
                }

                // Update employee table if drawer is open
                const drawer = document.getElementById('employeeDrawer');
                if (drawer && drawer.classList.contains('active')) {
                    if (
                        window.userEmployeeLoader &&
                        window.userEmployeeLoader.getUsers().length > 0
                    ) {
                        renderEmployeeTable(window.userEmployeeLoader.getUsers());
                    }
                }
            }
        } catch (error) {
            console.error('[EMPLOYEE] ❌ Polling error:', error);
        }
    }, 30000);

    // Store cleanup function (same interface as Firestore unsubscribe)
    _employeeRangesUnsubscribe = () => clearInterval(pollInterval);
}

/**
 * Stop the current real-time listener
 */
function stopEmployeeRangesListener() {
    if (_employeeRangesUnsubscribe) {
        _employeeRangesUnsubscribe();
        _employeeRangesUnsubscribe = null;
        _currentListeningCampaign = null;
    }
}

/**
 * Enable or disable the "Xem phân chia nhân viên" toggle button.
 * Disabled (greyed out) when the current user is already filtered to their assigned orders.
 */
function _setEmployeeToggleBtnDisabled(disabled) {
    const btn = document.getElementById('toggleEmployeeViewBtn');
    if (!btn) return;
    if (disabled) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Bạn đang xem các đơn được phân cho bạn';
        // Also reset view mode since button is disabled
        employeeViewMode = false;
        window.employeeViewMode = false;
    } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        // Restore title based on current mode
        if (employeeViewMode) {
            btn.title = 'Chuyển về xem tất cả đơn hàng';
        } else {
            btn.title = 'Chuyển sang xem phân chia nhân viên';
        }
    }
}

function _resetEmployeeViewModeBtn() {
    employeeViewMode = false;
    window.employeeViewMode = false;
    const btn = document.getElementById('toggleEmployeeViewBtn');
    if (btn) {
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        btn.innerHTML = '<i class="fas fa-layer-group"></i> Xem phân chia nhân viên';
        btn.title = 'Chuyển sang xem phân chia nhân viên';
    }
}

// ─── Employee-ranges edit-history modal ───
const _CER_HIST_MODAL_ID = 'employeeRangesHistoryModal';

function _formatHistoryTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _diffRanges(beforeArr, afterArr) {
    // Build lookup by user identity (id || name) so renamed-but-same-user rows match.
    const _key = (r) => String(r?.id || r?.userId || r?.name || r?.userName || '?');
    const before = new Map((beforeArr || []).map((r) => [_key(r), r]));
    const after = new Map((afterArr || []).map((r) => [_key(r), r]));
    const allKeys = new Set([...before.keys(), ...after.keys()]);

    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];

    for (const k of allKeys) {
        const b = before.get(k);
        const a = after.get(k);
        if (!b && a) added.push(a);
        else if (b && !a) removed.push(b);
        else if (b && a) {
            if ((b.start ?? '') !== (a.start ?? '') || (b.end ?? '') !== (a.end ?? '')) {
                changed.push({ before: b, after: a });
            } else {
                unchanged.push(a);
            }
        }
    }
    return { added, removed, changed, unchanged };
}

function _renderHistoryRow(h) {
    const userName = h.userName || h.userId || '?';
    const time = _formatHistoryTime(h.createdAt);
    const action = h.action === 'create' ? 'Tạo mới' : 'Cập nhật';
    const actionColor = h.action === 'create' ? '#10b981' : '#1d4ed8';
    const diff = _diffRanges(h.rangesBefore, h.rangesAfter);

    const renderRange = (r) =>
        `<span style="font-family:monospace;">${r?.name || r?.userName || '?'}: ${r?.start ?? '?'}–${r?.end ?? '?'}</span>`;

    const segs = [];
    if (diff.added.length > 0) {
        segs.push(
            `<div style="color:#065f46;"><b>+ Thêm:</b> ${diff.added.map(renderRange).join(', ')}</div>`
        );
    }
    if (diff.removed.length > 0) {
        segs.push(
            `<div style="color:#991b1b;"><b>− Xoá:</b> ${diff.removed.map(renderRange).join(', ')}</div>`
        );
    }
    if (diff.changed.length > 0) {
        segs.push(
            `<div style="color:#92400e;"><b>~ Đổi:</b> ${diff.changed
                .map(
                    (c) =>
                        `${renderRange(c.before)} → <span style="font-family:monospace;">${c.after.start ?? '?'}–${c.after.end ?? '?'}</span>`
                )
                .join('; ')}</div>`
        );
    }
    if (segs.length === 0) {
        segs.push(`<div style="color:#9ca3af; font-style:italic;">Không có thay đổi nào.</div>`);
    }

    return `
        <div style="padding:10px 12px; border-bottom:1px solid #f3f4f6; font-size:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div>
                    <span style="color:${actionColor}; font-weight:700; margin-right:8px;">${action}</span>
                    <b style="color:#111827;">${_escapeHtmlSafe(userName)}</b>
                </div>
                <span style="color:#6b7280; font-size:11px;" title="Giờ Vietnam (GMT+7)">${time}</span>
            </div>
            <div style="line-height:1.5;">${segs.join('')}</div>
        </div>`;
}

function _escapeHtmlSafe(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _ensureEmployeeRangesHistoryModal() {
    let modal = document.getElementById(_CER_HIST_MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = _CER_HIST_MODAL_ID;
    modal.style.cssText = [
        'position:fixed',
        'inset:0',
        'display:none',
        'z-index:10001',
        'background:rgba(15,23,42,0.45)',
        'backdrop-filter:blur(2px)',
        'align-items:center',
        'justify-content:center',
    ].join(';');
    modal.innerHTML = `
        <div style="background:#fff; border-radius:12px; box-shadow:0 16px 48px rgba(0,0,0,0.18); width:min(720px, 92vw); max-height:86vh; display:flex; flex-direction:column; overflow:hidden;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%); border-bottom:1px solid #93c5fd;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-history" style="color:#1e40af; font-size:16px;"></i>
                    <strong style="font-size:14px; color:#1e3a8a;" id="employeeRangesHistoryTitle">Lịch sử chỉnh sửa phân chia</strong>
                </div>
                <button type="button" id="employeeRangesHistoryClose" style="border:none; background:transparent; font-size:20px; line-height:1; cursor:pointer; color:#1e3a8a;" title="Đóng">×</button>
            </div>
            <div id="employeeRangesHistoryBody" style="flex:1; overflow-y:auto;">
                <div style="color:#9ca3af; padding:24px 0; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Đang tải lịch sử…</div>
            </div>
            <div style="padding:8px 18px; background:#f9fafb; border-top:1px solid #f3f4f6; font-size:11px; color:#6b7280;">
                Tối đa 50 chỉnh sửa gần nhất. Lịch sử lưu vĩnh viễn theo campaign id.
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev) => {
        if (ev.target === modal) _closeEmployeeRangesHistoryModal();
    });
    modal
        .querySelector('#employeeRangesHistoryClose')
        .addEventListener('click', _closeEmployeeRangesHistoryModal);
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && modal.style.display !== 'none')
            _closeEmployeeRangesHistoryModal();
    });
    return modal;
}

function _closeEmployeeRangesHistoryModal() {
    const modal = document.getElementById(_CER_HIST_MODAL_ID);
    if (modal) modal.style.display = 'none';
}

async function openEmployeeRangesHistory() {
    const select = document.getElementById('employeeCampaignSelector');
    const opt = select?.options?.[select.selectedIndex];
    if (!opt || !opt.dataset.campaign) {
        alert('⚠️ Vui lòng chọn chiến dịch để xem lịch sử.');
        return;
    }
    const campaign = JSON.parse(opt.dataset.campaign);
    const modal = _ensureEmployeeRangesHistoryModal();
    modal.style.display = 'flex';

    const titleEl = modal.querySelector('#employeeRangesHistoryTitle');
    if (titleEl) {
        titleEl.textContent = `Lịch sử — ${campaign.displayName || campaign.id}`;
    }
    const body = modal.querySelector('#employeeRangesHistoryBody');
    body.innerHTML = `<div style="color:#9ca3af; padding:24px 0; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Đang tải lịch sử…</div>`;

    // Try id first, then sanitized displayName (legacy data may live under name key).
    const candidates = [];
    if (campaign.id) candidates.push(String(campaign.id));
    const sanitized = sanitizeCampaignName(campaign.displayName);
    if (sanitized && !candidates.includes(sanitized)) candidates.push(sanitized);

    let allHistory = [];
    for (const key of candidates) {
        try {
            const h = await window.CampaignAPI.getEmployeeRangesHistory(key, 50);
            if (Array.isArray(h) && h.length > 0) allHistory.push(...h);
        } catch (e) {
            console.warn('[EMPLOYEE-HISTORY] fetch failed for key', key, e?.message);
        }
    }

    // Dedup by id, sort newest first.
    const seen = new Set();
    allHistory = allHistory
        .filter((h) => {
            if (seen.has(h.id)) return false;
            seen.add(h.id);
            return true;
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (allHistory.length === 0) {
        body.innerHTML = `<div style="color:#9ca3af; padding:24px 0; text-align:center; font-style:italic;">Chưa có lịch sử chỉnh sửa cho chiến dịch này.</div>`;
        return;
    }
    body.innerHTML = allHistory.map(_renderHistoryRow).join('');
}

window.openEmployeeRangesHistory = openEmployeeRangesHistory;

/**
 * Toggle between normal view and employee grouped view
 */
function toggleEmployeeViewMode() {
    const btn = document.getElementById('toggleEmployeeViewBtn');
    if (btn && btn.disabled) return; // User is filtered — button not available

    if (employeeRanges.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.show(
                '⚠️ Chưa có cấu hình phân chia nhân viên cho chiến dịch này',
                'warning'
            );
        } else {
            alert('⚠️ Chưa có cấu hình phân chia nhân viên cho chiến dịch này');
        }
        return;
    }

    employeeViewMode = !employeeViewMode;
    window.employeeViewMode = employeeViewMode;

    if (btn) {
        if (employeeViewMode) {
            btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            btn.innerHTML = '<i class="fas fa-list"></i> Xem thường';
            btn.title = 'Chuyển về xem tất cả đơn hàng';
        } else {
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            btn.innerHTML = '<i class="fas fa-layer-group"></i> Xem phân chia nhân viên';
            btn.title = 'Chuyển sang xem phân chia nhân viên';
        }
    }

    // Re-render table with new mode
    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
}
