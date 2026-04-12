// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * PANCAKE ALERT SERVICE
 * =====================================================
 * Monitors customer data for risk signals and sends alerts.
 *
 * Alerts:
 *   - Customer return rate spike (>30%)
 *   - Banned customer placing new order
 *   - High-value customer inactive >60 days
 *
 * Channels: Telegram bot
 * Trigger: Called from sync-pancake endpoint + daily cron
 * =====================================================
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

/**
 * Check customer for alert conditions after sync
 * Called fire-and-forget from sync-pancake
 */
async function checkCustomerAlerts(db, customer, action) {
    if (!customer) return;

    const alerts = [];
    const phone = customer.phone;
    const name = customer.name || 'N/A';

    // 1. Return rate spike
    const ok = customer.order_success_count || 0;
    const fail = customer.order_fail_count || 0;
    const total = ok + fail;
    if (total >= 5) {
        const returnRate = Math.round((fail / total) * 100);
        if (returnRate > 50) {
            alerts.push({
                type: 'RETURN_RATE_CRITICAL',
                message: `🔴 Khách ${name} (${phone}) — tỷ lệ hoàn ${returnRate}% (${fail}/${total} đơn)`
            });
        } else if (returnRate > 30) {
            alerts.push({
                type: 'RETURN_RATE_WARNING',
                message: `🟡 Khách ${name} (${phone}) — tỷ lệ hoàn ${returnRate}% (${fail}/${total} đơn)`
            });
        }
    }

    // 2. Banned/bom customer
    const status = customer.status || '';
    if ((status === 'Bom hàng' || status === 'Nguy hiểm') && action === 'created') {
        alerts.push({
            type: 'BANNED_CUSTOMER_NEW',
            message: `🚫 Khách MỚI ${name} (${phone}) — trạng thái: ${status}`
        });
    }

    // 3. Can't inbox (lost contact)
    if (customer.can_inbox === false && total > 3) {
        alerts.push({
            type: 'LOST_CONTACT',
            message: `📵 Khách ${name} (${phone}) — không thể gửi tin nhắn (${total} đơn)`
        });
    }

    // Send alerts
    for (const alert of alerts) {
        await sendTelegramAlert(alert);
        await logAlert(db, phone, alert);
    }
}

/**
 * Daily cron: check for inactive high-value customers
 */
async function checkInactiveCustomers(db) {
    try {
        const result = await db.query(`
            SELECT phone, name, total_spent, last_order_date, tier,
                order_success_count, order_fail_count
            FROM customers
            WHERE total_spent > 5000000
                AND last_order_date < NOW() - INTERVAL '60 days'
                AND last_order_date > NOW() - INTERVAL '61 days'
                AND tier IN ('gold', 'platinum')
            LIMIT 20
        `);

        for (const c of result.rows) {
            const days = Math.round((Date.now() - new Date(c.last_order_date).getTime()) / 86400000);
            await sendTelegramAlert({
                type: 'INACTIVE_HIGH_VALUE',
                message: `💤 Khách VIP ${c.name} (${c.phone}) — ${c.tier.toUpperCase()}, đã chi ${formatMoney(c.total_spent)}, không mua ${days} ngày`
            });
            await logAlert(db, c.phone, { type: 'INACTIVE_HIGH_VALUE' });
        }

        return result.rows.length;
    } catch (e) {
        console.error('[PancakeAlerts] checkInactiveCustomers error:', e.message);
        return 0;
    }
}

/**
 * Send alert via Telegram
 */
async function sendTelegramAlert(alert) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: `[N2Store Alert]\n${alert.message}`,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.warn('[PancakeAlerts] Telegram send failed:', e.message);
    }
}

/**
 * Log alert to database
 */
async function logAlert(db, phone, alert) {
    try {
        await db.query(`
            INSERT INTO customer_activities (phone, activity_type, title, icon, color, created_by)
            VALUES ($1, 'NOTE_ADDED', $2, 'bell', 'red', 'alert-system')
        `, [phone, `[ALERT] ${alert.type}: ${alert.message?.substring(0, 200) || ''}`]);
    } catch (e) {
        // Silently fail — don't break sync flow
    }
}

function formatMoney(n) {
    return new Intl.NumberFormat('vi-VN').format(n || 0) + '₫';
}

module.exports = {
    checkCustomerAlerts,
    checkInactiveCustomers,
    sendTelegramAlert
};
