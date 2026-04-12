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

    // Teen-style suffixes: word + last char repeated
    const SUFFIXES = [
        'BÙMMMMMM', 'DEALLLLL', 'CHÁYYY', 'SẬPPPPP', 'HOTTTTTT',
        'NỔLLLLL', 'XINH XỈUUUUU', 'PHÁTTTTT', 'GIẢMMMMM', 'CHỐTTTTT',
        'GIÁ SỐCCCC', 'HÀNG ĐẸPPPPP', 'SIÊU RẺẺẺẺ', 'XẢ KHOOOO',
        'SALE SẬPPPPP', 'PHÁ ĐẢOOOOO', 'NỔ ĐƠNNNNN', 'BÁNHHHH',
        'HÚT ĐƠNNNNN', 'VIP PROOOO', 'ĐỈNHHHHHH', 'KHỦNGGGGG',
        'SIÊU SALEEEE', 'GIÁ HỦYYYYYY', 'FULLLLLL', 'MAXXXXXS',
        'MEGA SALEEEEE', 'FLASHHHHH', 'ĐỈNH CAOOOOO', 'KHÔNGGGGG',
        'LÊN ĐƠNNNNN', 'TẤT TAYYYYY', 'SĂNNNNNN', 'RẺ VÔÔÔÔÔ',
        'BOMMMMMM', 'CHẤT LƯỢNGGGGG', 'BAOOOOOO', 'THẦNNNNN',
    ];

    // Pick a random suffix that hasn't been used
    const existingUpper = existingNames.map(n => n.toUpperCase());
    const available = SUFFIXES.filter(s => !existingUpper.some(n => n.includes(s)));
    const pool = available.length > 0 ? available : SUFFIXES;
    const suffix = pool[Math.floor(Math.random() * pool.length)];

    nameInput.value = `${prefix} ${suffix}`;
    nameInput.focus();

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

