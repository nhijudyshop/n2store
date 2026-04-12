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

// Gemini name pool: fetch 20 names at once, cycle through them
var _namePool = window._campaignNamePool = {
    names: [],      // current batch of unused names
    used: [],       // all names used this session (to exclude from next batch)
    loading: false,
    prefix: '',
};

// Fetch 20 unique names from Gemini
async function _fetchNameBatch(prefix, existingNames) {
    const allUsed = [...existingNames, ..._namePool.used];
    const usedList = allUsed.length > 0 ? allUsed.join(', ') : 'chưa có';

    const response = await fetch('https://n2store-fallback.onrender.com/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gemini-3-pro-preview',
            contents: [{
                role: 'user',
                parts: [{ text: `Liệt kê chính xác 20 tên chiến dịch livestream, mỗi dòng 1 tên, không đánh số, không giải thích.

Format mỗi tên: ${prefix} + khoảng trắng + 1-2 từ viết HOA + lặp chữ cái cuối 4-6 lần.

Ví dụ:
${prefix} BÙMMMMMM
${prefix} DEALLLLL
${prefix} HOTTTTTT
${prefix} CHÁYYY
${prefix} SẬPPPPP
${prefix} SIÊU SALEEEE
${prefix} PHÁ ĐẢOOOOO

Tên KHÔNG được trùng: ${usedList}` }]
            }],
            generationConfig: {
                maxOutputTokens: 600,
                temperature: 1.0
            }
        })
    });

    if (!response.ok) {
        console.warn('[CAMPAIGN] Gemini API error:', response.status);
        return [];
    }

    const data = await response.json();
    console.log('[CAMPAIGN] Gemini full response:', JSON.stringify(data).substring(0, 500));
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return [];

    // Parse lines into clean names
    const usedUpper = new Set(allUsed.map(n => n.toUpperCase()));
    const names = text.split('\n')
        .map(line => line.replace(/^\d+[\.\)\-\s]+/, '').replace(/^["'\s*]+|["'\s*]+$/g, '').trim().toUpperCase())
        .filter(name => name.length > 0 && name.startsWith(prefix) && !usedUpper.has(name));
    console.log('[CAMPAIGN] Parsed', names.length, 'names:', names);
    return names;
}

// Main function: pick next name from pool, refill from Gemini when empty
window.autoGenerateCampaignName = async function() {
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

    // Reset pool if prefix changed (new T number)
    if (_namePool.prefix !== prefix) {
        _namePool.names = [];
        _namePool.used = [];
        _namePool.prefix = prefix;
    }

    // If pool empty, fetch new batch from Gemini
    if (_namePool.names.length === 0 && !_namePool.loading) {
        _namePool.loading = true;
        nameInput.value = `${prefix} ...`;
        nameInput.disabled = true;

        try {
            _namePool.names = await _fetchNameBatch(prefix, existingNames);
        } catch (err) {
            console.warn('[CAMPAIGN] Gemini batch failed:', err.message);
        }

        _namePool.loading = false;
        nameInput.disabled = false;
    }

    // Pick next name from pool
    if (_namePool.names.length > 0) {
        const name = _namePool.names.shift();
        _namePool.used.push(name);
        nameInput.value = name;
    } else {
        nameInput.value = prefix;
    }

    nameInput.focus();
    nameInput.select();
};

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

