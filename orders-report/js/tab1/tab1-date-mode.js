// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// ============================================
// DATE MODE - Quick date filter toggle
// Allows fetching orders by "last X days" instead of campaign dates
// ============================================

// Save date mode preference via CampaignAPI
window.saveDateModePreference = async function(pref) {
    try {
        const userId = window.campaignManager.currentUserId;
        if (!userId) return;
        await window.CampaignAPI.saveFilterPreferences(userId, { dateMode: pref });
    } catch (error) {
        console.error('[DATE-MODE] Error saving preference:', error);
    }
};

// Load date mode preference via CampaignAPI
window.loadDateModePreference = async function() {
    try {
        const userId = window.campaignManager.currentUserId;
        if (!userId) return null;
        const data = await window.CampaignAPI.getUserPref(userId);
        if (data.filterPreferences?.dateMode) {
            return data.filterPreferences.dateMode;
        }
        return null;
    } catch (error) {
        console.error('[DATE-MODE] Error loading preference:', error);
        return null;
    }
};

// Initialize date mode from saved preference
window.initDateMode = async function() {
    const pref = await window.loadDateModePreference();
    if (!pref || !pref.enabled) return false;

    const toggle = document.getElementById('dateModeToggle');
    const controls = document.getElementById('dateModeControls');
    if (!toggle || !controls) return false;

    toggle.checked = true;
    controls.style.display = 'flex';

    if (pref.type === 'quick' && pref.quickDays) {
        // Apply quick days without triggering search (init will handle search)
        applyQuickDaysUI(pref.quickDays);
    } else if (pref.type === 'custom' && pref.customStart && pref.customEnd) {
        document.getElementById('dateModeStartDate').value = pref.customStart;
        document.getElementById('dateModeEndDate').value = pref.customEnd;
    }

    // Set hidden date inputs from date mode
    syncDateModeToHiddenInputs(pref);
    return true;
};

// Set hidden inputs from date mode preference (called during init)
function syncDateModeToHiddenInputs(pref) {
    let startVal, endVal;

    if (pref.type === 'quick' && pref.quickDays) {
        const now = new Date();
        const start = new Date(now.getTime() - pref.quickDays * 24 * 60 * 60 * 1000);
        start.setHours(0, 0, 0, 0);
        startVal = formatDatetimeLocal(start);
        endVal = formatDatetimeLocal(now);
    } else if (pref.type === 'custom' && pref.customStart && pref.customEnd) {
        startVal = pref.customStart;
        endVal = pref.customEnd;
    }

    if (startVal && endVal) {
        setHiddenDates(startVal, endVal);
    }
}

// Toggle date mode on/off
window.toggleDateMode = function(enabled) {
    const controls = document.getElementById('dateModeControls');
    if (controls) {
        controls.style.display = enabled ? 'flex' : 'none';
    }

    if (enabled) {
        // Default to 15 days when first enabled
        applyQuickDays(15);
    } else {
        // Revert to campaign dates
        saveDateModePreference({ enabled: false });
        clearQuickDaysHighlight();

        const campaign = window.campaignManager.activeCampaign;
        if (campaign && campaign.customStartDate) {
            setHiddenDates(campaign.customStartDate, campaign.customEndDate || '');
            if (typeof handleSearch === 'function') {
                handleSearch();
            }
        }
    }
};

// Apply quick days (15, 20, 30)
window.applyQuickDays = function(days) {
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    const startVal = formatDatetimeLocal(start);
    const endVal = formatDatetimeLocal(now);

    // Update UI inputs
    document.getElementById('dateModeStartDate').value = startVal;
    document.getElementById('dateModeEndDate').value = endVal;

    // Highlight active button
    applyQuickDaysUI(days);

    // Set hidden inputs and fetch
    setHiddenDates(startVal, endVal);

    // Save preference
    saveDateModePreference({
        enabled: true,
        type: 'quick',
        quickDays: days
    });

    // Trigger search
    if (typeof handleSearch === 'function') {
        handleSearch();
    }
};

// Apply custom date range from inputs
window.applyCustomDateRange = function() {
    const startVal = document.getElementById('dateModeStartDate').value;
    const endVal = document.getElementById('dateModeEndDate').value;

    if (!startVal || !endVal) return;

    clearQuickDaysHighlight();
    setHiddenDates(startVal, endVal);

    // Save preference
    saveDateModePreference({
        enabled: true,
        type: 'custom',
        customStart: startVal,
        customEnd: endVal
    });

    // Trigger search
    if (typeof handleSearch === 'function') {
        handleSearch();
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function setHiddenDates(startVal, endVal) {
    const fields = ['customStartDate', 'customEndDate', 'startDate', 'endDate'];
    const values = [startVal, endVal, startVal, endVal];
    for (let i = 0; i < fields.length; i++) {
        const el = document.getElementById(fields[i]);
        if (el) el.value = values[i];
    }
}

function applyQuickDaysUI(days) {
    clearQuickDaysHighlight();
    const btns = document.querySelectorAll('.btn-quick-days');
    btns.forEach(btn => {
        if (parseInt(btn.dataset.days) === days) {
            btn.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
            btn.style.color = 'white';
            btn.style.borderColor = '#7c3aed';
        }
    });
}

function clearQuickDaysHighlight() {
    document.querySelectorAll('.btn-quick-days').forEach(btn => {
        btn.style.background = 'white';
        btn.style.color = '#7c3aed';
        btn.style.borderColor = '#8b5cf6';
    });
}

function formatDatetimeLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

