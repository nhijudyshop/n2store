// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// ============================================
// CREATE CAMPAIGN MODAL
// Extracted from tab1-orders.html
// ============================================

// Open Create Campaign Modal
window.openCreateCampaignModal = function() {
    const modal = document.getElementById('createCampaignModal');
    modal.style.display = 'flex';

    // Reset form
    document.getElementById('newCampaignName').value = '';
    document.getElementById('newCampaignCustomStartDate').value = '';
    document.getElementById('newCampaignCustomEndDate').value = '';

    // Copy current dates from hidden fields if available
    const customStartDate = document.getElementById('customStartDate');
    const customEndDate = document.getElementById('customEndDate');
    if (customStartDate && customStartDate.value) {
        document.getElementById('newCampaignCustomStartDate').value = customStartDate.value;
    }
    if (customEndDate && customEndDate.value) {
        document.getElementById('newCampaignCustomEndDate').value = customEndDate.value;
    }

    // Auto-generate campaign name via Gemini
    autoGenerateCampaignName();
};

// Auto-generate campaign name: find max T number + 1, then ask Gemini for a creative suffix
async function autoGenerateCampaignName() {
    const nameInput = document.getElementById('newCampaignName');
    const campaigns = window.campaignManager?.allCampaigns || {};
    const existingNames = Object.values(campaigns).map(c => c.name);

    // Find the highest T number
    let maxT = 0;
    for (const name of existingNames) {
        const match = name.match(/^T(\d+)\b/i);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxT) maxT = num;
        }
    }
    const nextT = maxT + 1;
    const prefix = `T${nextT}`;

    // Set prefix immediately so user sees something
    nameInput.value = `${prefix} ...`;
    nameInput.focus();

    // Ask Gemini for a creative suffix
    try {
        const namesList = existingNames.length > 0
            ? existingNames.join(', ')
            : 'chưa có chiến dịch nào';

        const response = await fetch('https://n2store-fallback.onrender.com/api/gemini/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.0-flash',
                contents: [{
                    role: 'user',
                    parts: [{ text: `Bạn đặt tên chiến dịch bán hàng livestream theo phong cách "teen" — viết HOA, 1-3 từ sau số T, và lặp chữ cái cuối 3-5 lần cho vui. Danh sách hiện có: ${namesList}. Chiến dịch tiếp theo là ${prefix}. KHÔNG đặt trùng tên đã có. Chỉ trả lời đúng 1 tên, không giải thích. Ví dụ: "${prefix} PHÁ ĐẢOOOOO", "${prefix} NỔ ĐƠNNNNN", "${prefix} CHÁY HÀNGGGGG", "${prefix} DEALLLLLL", "${prefix} SALE SẬPPPPP"` }]
                }],
                generationConfig: {
                    maxOutputTokens: 30,
                    temperature: 1.0
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const suggestion = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (suggestion) {
                // Use Gemini's suggestion, ensure it starts with the right prefix
                const cleaned = suggestion.replace(/^["'\s]+|["'\s]+$/g, '');
                nameInput.value = cleaned.toUpperCase().startsWith(prefix.toUpperCase())
                    ? cleaned.toUpperCase()
                    : `${prefix} ${cleaned.toUpperCase()}`;
            } else {
                nameInput.value = prefix;
            }
        } else {
            nameInput.value = prefix;
        }
    } catch (err) {
        console.warn('[CAMPAIGN] Gemini name suggestion failed, using prefix only:', err.message);
        nameInput.value = prefix;
    }

    nameInput.select();
}

// Close Create Campaign Modal
window.closeCreateCampaignModal = function() {
    document.getElementById('createCampaignModal').style.display = 'none';
};

// Auto-fill end date when start date changes in create modal
document.addEventListener('DOMContentLoaded', function() {
    const newCampaignStartDate = document.getElementById('newCampaignCustomStartDate');
    if (newCampaignStartDate) {
        newCampaignStartDate.addEventListener('change', function() {
            const endDateInput = document.getElementById('newCampaignCustomEndDate');
            if (this.value && endDateInput) {
                const startDate = new Date(this.value);
                const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days
                endDate.setHours(0, 0, 0, 0); // 00:00 AM

                const year = endDate.getFullYear();
                const month = String(endDate.getMonth() + 1).padStart(2, '0');
                const day = String(endDate.getDate()).padStart(2, '0');
                const hours = String(endDate.getHours()).padStart(2, '0');
                const minutes = String(endDate.getMinutes()).padStart(2, '0');

                endDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
            }
        });
    }
});

// Save new campaign to Firebase
window.saveNewCampaign = async function() {
    const name = document.getElementById('newCampaignName').value.trim();
    const customStartDate = document.getElementById('newCampaignCustomStartDate').value;
    const customEndDate = document.getElementById('newCampaignCustomEndDate').value;

    // Validation
    if (!name) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng nhập tên chiến dịch!', 'error');
        } else {
            alert('Vui lòng nhập tên chiến dịch!');
        }
        document.getElementById('newCampaignName').focus();
        return;
    }

    if (!customStartDate) {
        if (typeof showNotification === 'function') {
            showNotification('Vui lòng chọn Từ ngày!', 'error');
        } else {
            alert('Vui lòng chọn Từ ngày!');
        }
        return;
    }

    try {
        const campaignId = 'campaign_' + Date.now();

        const campaignData = {
            id: campaignId,
            name: name,
            customStartDate: customStartDate,
            customEndDate: customEndDate || '',
            timeFrame: 'custom',
        };

        await window.CampaignAPI.create(campaignData);

        // Add to local cache
        window.campaignManager.allCampaigns[campaignId] = campaignData;

        // Check if this is the first campaign or user has no active campaign
        const isFirstCampaign = Object.keys(window.campaignManager.allCampaigns).length === 1;
        const hasNoActiveCampaign = !window.campaignManager.activeCampaignId;

        // Close modal first
        window.closeCreateCampaignModal();

        if (isFirstCampaign || hasNoActiveCampaign) {
            // Auto-set as active
            if (typeof window.saveActiveCampaign === 'function') {
                await window.saveActiveCampaign(campaignId);
            }

            // Close any onboarding modals
            if (typeof window.closeNoCampaignsModal === 'function') {
                window.closeNoCampaignsModal();
            }
            if (typeof window.closeSelectCampaignModal === 'function') {
                window.closeSelectCampaignModal();
            }

            // Use continueAfterCampaignSelect() from JS to load data
            if (typeof continueAfterCampaignSelect === 'function') {
                await continueAfterCampaignSelect(campaignId);
            }
        }

        // Reload campaigns dropdown
        if (typeof window.loadUserCampaigns === 'function') {
            window.loadUserCampaigns();
        }

        if (typeof showNotification === 'function') {
            showNotification('Đã lưu chiến dịch: ' + name, 'success');
        }

    } catch (error) {
        console.error('[USER-CAMPAIGNS] Error saving campaign:', error);
        if (typeof showNotification === 'function') {
            showNotification('Lỗi lưu chiến dịch: ' + error.message, 'error');
        } else {
            alert('Lỗi lưu chiến dịch: ' + error.message);
        }
    }
};

