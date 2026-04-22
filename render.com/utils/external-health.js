// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Passive external-service health tracker. Records success/failure of
 * outbound API calls (TPOS, Pancake, FB Graph) in a sliding window and
 * emits a Telegram alert when the failure rate spikes.
 *
 * Usage:
 *   const { track } = require('./utils/external-health');
 *   track('tpos', ok);  // ok = boolean
 *
 * NOT a circuit breaker — does NOT block calls. Just observability.
 */

const { sendAlert } = require('./alert');

const WINDOW_MS = 60_000;
const ALERT_COOLDOWN_MS = 10 * 60_000;  // don't re-alert same service for 10 min

const buckets = new Map(); // service → Array<{ts, ok}>
const lastAlertAt = new Map(); // service → ms

function track(service, ok, errMsg = '') {
    if (!buckets.has(service)) buckets.set(service, []);
    const arr = buckets.get(service);
    const now = Date.now();
    arr.push({ ts: now, ok });

    // Trim window
    const cutoff = now - WINDOW_MS;
    while (arr.length && arr[0].ts < cutoff) arr.shift();

    // Stats
    const total = arr.length;
    const failures = arr.filter((e) => !e.ok).length;

    // Alert thresholds: ≥10 failures AND ≥50% failure rate in last 60s
    if (total >= 10 && failures / total >= 0.5) {
        const last = lastAlertAt.get(service) || 0;
        if (now - last >= ALERT_COOLDOWN_MS) {
            lastAlertAt.set(service, now);
            sendAlert(
                `external:${service}`,
                `${service} failing: ${failures}/${total} calls in last ${Math.round(WINDOW_MS / 1000)}s`,
                errMsg ? `Latest error: ${errMsg}` : ''
            );
        }
    }
}

function stats() {
    const out = {};
    const now = Date.now();
    for (const [svc, arr] of buckets) {
        const cutoff = now - WINDOW_MS;
        const recent = arr.filter((e) => e.ts >= cutoff);
        out[svc] = {
            total: recent.length,
            failures: recent.filter((e) => !e.ok).length,
            success_rate: recent.length ? (recent.filter((e) => e.ok).length / recent.length).toFixed(2) : null
        };
    }
    return out;
}

module.exports = { track, stats };
