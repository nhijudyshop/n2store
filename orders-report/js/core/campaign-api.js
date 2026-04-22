// =====================================================
// CAMPAIGN API CLIENT
// Centralized API for campaign CRUD operations
// Replaces direct Firebase Firestore calls
// =====================================================

(function() {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/campaigns';

    async function _fetch(path, options = {}) {
        const url = `${API_BASE}${path}`;
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    window.CampaignAPI = {
        // =====================================================
        // CAMPAIGNS CRUD
        // =====================================================

        /** Load all campaigns */
        async loadAll() {
            const data = await _fetch('');
            return data.campaigns || [];
        },

        /** Get single campaign by ID */
        async get(id) {
            const data = await _fetch(`/${encodeURIComponent(id)}`);
            return data.campaign;
        },

        /** Create a new campaign */
        async create(campaignData) {
            const data = await _fetch('', {
                method: 'POST',
                body: JSON.stringify(campaignData)
            });
            return data.campaign;
        },

        /** Update an existing campaign */
        async update(id, updates) {
            const data = await _fetch(`/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            return data.campaign;
        },

        /** Delete a campaign */
        async delete(id) {
            return _fetch(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
        },

        // =====================================================
        // USER CAMPAIGN PREFERENCES
        // =====================================================

        /** Get user's active campaign and filter preferences */
        async getUserPref(userId) {
            const data = await _fetch(`/user-pref/${encodeURIComponent(userId)}`);
            return data; // { activeCampaignId, filterPreferences }
        },

        /** Set active campaign for user */
        async setActiveCampaign(userId, activeCampaignId) {
            return _fetch(`/user-pref/${encodeURIComponent(userId)}`, {
                method: 'PUT',
                body: JSON.stringify({ activeCampaignId })
            });
        },

        /** Save filter preferences for user */
        async saveFilterPreferences(userId, filterPreferences) {
            return _fetch(`/user-pref/${encodeURIComponent(userId)}`, {
                method: 'PUT',
                body: JSON.stringify({ filterPreferences })
            });
        },

        /** Clear active campaign for user */
        async clearActiveCampaign(userId) {
            return _fetch(`/user-pref/${encodeURIComponent(userId)}/active`, {
                method: 'DELETE'
            });
        },

        // =====================================================
        // CAMPAIGN REPORTS (Phase 2)
        // =====================================================

        /** List all reports (metadata only) */
        async listReports() {
            const data = await _fetch('/reports/list');
            return data.reports || [];
        },

        /** Get report with full orders */
        async getReport(tableName) {
            try {
                const data = await _fetch(`/reports/${encodeURIComponent(tableName)}`);
                return data.report;
            } catch (e) {
                // 404 = report not yet fetched, return null (not an error)
                if (e.message.includes('404') || e.message === 'Report not found') return null;
                throw e;
            }
        },

        /** Save/update report */
        async saveReport(tableName, reportData) {
            return _fetch(`/reports/${encodeURIComponent(tableName)}`, {
                method: 'PUT',
                body: JSON.stringify(reportData)
            });
        },

        /** Delete report */
        async deleteReport(tableName) {
            return _fetch(`/reports/${encodeURIComponent(tableName)}`, { method: 'DELETE' });
        },

        /** Rename report */
        async renameReport(oldName, newName) {
            return _fetch(`/reports/${encodeURIComponent(oldName)}/rename`, {
                method: 'PUT',
                body: JSON.stringify({ newName })
            });
        },

        // =====================================================
        // EMPLOYEE RANGES (Phase 3)
        // =====================================================

        /** Get all campaigns' employee ranges */
        async getAllEmployeeRanges() {
            const data = await _fetch('/employee-ranges');
            return data.rangesByCampaign || {};
        },

        /** Get employee ranges for specific campaign */
        async getEmployeeRanges(campaignName) {
            const data = await _fetch(`/employee-ranges/${encodeURIComponent(campaignName)}`);
            return data.employeeRanges || [];
        },

        /** Save employee ranges for campaign */
        async saveEmployeeRanges(campaignName, employeeRanges) {
            return _fetch(`/employee-ranges/${encodeURIComponent(campaignName)}`, {
                method: 'PUT',
                body: JSON.stringify({ employeeRanges })
            });
        },
    };

    console.log('[CampaignAPI] Initialized');
})();
