/**
 * Activity Timeline - Handles activity timeline in customer detail page
 */

const ActivityTimeline = {
    // State
    phone: null,
    activities: [],

    /**
     * Load activities
     */
    async load(phone) {
        this.phone = phone;

        try {
            const result = await CustomerService.getCustomerActivities(phone, 100);
            this.activities = result.activities || result.data || [];
            this.render();
        } catch (error) {
            console.error('Error loading activities:', error);
            this.renderError();
        }
    },

    /**
     * Render activity timeline
     */
    render() {
        const container = document.getElementById('activityTimeline');
        if (!container) return;

        if (!this.activities.length) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i data-lucide="activity"></i>
                    <p>Chưa có hoạt động nào</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        // Group activities by date
        const grouped = this.groupByDate(this.activities);

        let html = '';
        for (const [date, items] of Object.entries(grouped)) {
            html += `
                <div class="timeline-date">
                    <span class="date-label">${date}</span>
                </div>
            `;

            html += items.map(activity => this.renderActivityItem(activity)).join('');
        }

        container.innerHTML = html;
        lucide.createIcons();
    },

    /**
     * Render single activity item
     */
    renderActivityItem(activity) {
        const typeConfig = CONFIG.ACTIVITY_TYPES[activity.activity_type] || {
            color: '#6b7280',
            icon: 'circle',
            label: activity.activity_type
        };

        const time = new Date(activity.created_at).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="timeline-item">
                <div class="timeline-icon" style="background: ${typeConfig.color}20; color: ${typeConfig.color};">
                    <i data-lucide="${typeConfig.icon}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="activity-type">${typeConfig.label}</span>
                        <span class="activity-time">${time}</span>
                    </div>
                    <div class="activity-description">${activity.description || '-'}</div>
                    ${activity.metadata ? this.renderMetadata(activity.metadata) : ''}
                </div>
            </div>
        `;
    },

    /**
     * Render activity metadata
     */
    renderMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') return '';

        const items = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (value !== null && value !== undefined && value !== '') {
                const label = this.formatMetadataLabel(key);
                const formattedValue = this.formatMetadataValue(key, value);
                items.push(`<span class="meta-item"><strong>${label}:</strong> ${formattedValue}</span>`);
            }
        }

        if (!items.length) return '';

        return `<div class="activity-metadata">${items.join('')}</div>`;
    },

    /**
     * Format metadata label
     */
    formatMetadataLabel(key) {
        const labels = {
            amount: 'Số tiền',
            order_id: 'Mã đơn',
            ticket_code: 'Mã sự vụ',
            old_status: 'Trạng thái cũ',
            new_status: 'Trạng thái mới',
            old_tier: 'Tier cũ',
            new_tier: 'Tier mới',
            reason: 'Lý do',
            reference_code: 'Mã tham chiếu'
        };
        return labels[key] || key;
    },

    /**
     * Format metadata value
     */
    formatMetadataValue(key, value) {
        if (key === 'amount') {
            return Utils.formatCurrency(value);
        }
        return value;
    },

    /**
     * Group activities by date
     */
    groupByDate(activities) {
        const grouped = {};

        activities.forEach(activity => {
            const date = new Date(activity.created_at);
            const dateStr = this.formatDateLabel(date);

            if (!grouped[dateStr]) {
                grouped[dateStr] = [];
            }
            grouped[dateStr].push(activity);
        });

        return grouped;
    },

    /**
     * Format date label
     */
    formatDateLabel(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Hôm nay';
        }
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Hôm qua';
        }

        return date.toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    /**
     * Render error state
     */
    renderError() {
        const container = document.getElementById('activityTimeline');
        if (container) {
            container.innerHTML = `
                <div class="empty-state-small error">
                    <i data-lucide="alert-triangle"></i>
                    <p>Lỗi tải timeline hoạt động</p>
                </div>
            `;
            lucide.createIcons();
        }
    }
};

// Export
window.ActivityTimeline = ActivityTimeline;
