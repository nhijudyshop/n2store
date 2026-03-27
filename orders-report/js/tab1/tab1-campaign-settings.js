// ============================================
// CAMPAIGN SETTINGS MODAL
// Extracted from tab1-orders.html
// ============================================

// Open Campaign Settings Modal
window.openCampaignSettingsModal = function() {
    const modal = document.getElementById('campaignSettingsModal');
    modal.style.display = 'flex';

    // Sync values from hidden original elements to modal
    window.syncOriginalToModal();

    // Load user campaigns
    if (typeof window.loadUserCampaigns === 'function') {
        window.loadUserCampaigns();
    }
};

// Close Campaign Settings Modal
window.closeCampaignSettingsModal = function() {
    document.getElementById('campaignSettingsModal').style.display = 'none';
};

// Sync original hidden elements to modal inputs
window.syncOriginalToModal = function() {
    // Sync realtime checkbox
    const originalRealtimeCheckbox = document.getElementById('realtimeToggleCheckbox');
    const modalRealtimeCheckbox = document.getElementById('modalRealtimeToggleCheckbox');
    if (originalRealtimeCheckbox && modalRealtimeCheckbox) {
        modalRealtimeCheckbox.checked = originalRealtimeCheckbox.checked;
    }

    // Sync realtime mode
    const originalRealtimeMode = document.getElementById('realtimeModeSelect');
    const modalRealtimeMode = document.getElementById('modalRealtimeModeSelect');
    if (originalRealtimeMode && modalRealtimeMode) {
        modalRealtimeMode.value = originalRealtimeMode.value;
    }

    // Sync chat API source label
    const originalLabel = document.getElementById('chatApiSourceLabel');
    const modalLabel = document.getElementById('modalChatApiSourceLabel');
    if (originalLabel && modalLabel) {
        modalLabel.textContent = originalLabel.textContent;
    }
};

// Setup event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener for user campaign select
    const userCampaignSelect = document.getElementById('modalUserCampaignSelect');
    if (userCampaignSelect) {
        userCampaignSelect.addEventListener('change', function() {
            if (typeof window.applyUserCampaign === 'function') {
                window.applyUserCampaign();
            }
        });
    }
});

// Toggle chat API source from modal
window.toggleChatAPISourceFromModal = function() {
    if (typeof toggleChatAPISource === 'function') {
        toggleChatAPISource();
    }
    // Update modal label after toggle
    setTimeout(function() {
        const originalLabel = document.getElementById('chatApiSourceLabel');
        const modalLabel = document.getElementById('modalChatApiSourceLabel');
        if (originalLabel && modalLabel) {
            modalLabel.textContent = originalLabel.textContent;
        }
    }, 100);
};

// Load campaigns from modal (simplified - just triggers search)
window.handleLoadCampaignsFromModal = function() {
    if (typeof window.applyCampaignSettings === 'function') {
        window.applyCampaignSettings();
    }
};

console.log('[TAB1-CAMPAIGN-SETTINGS] Module loaded');
