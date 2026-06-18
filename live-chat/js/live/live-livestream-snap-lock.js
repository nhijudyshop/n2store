// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-lock (capture leader lock + heartbeat + SSE)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS.LOCK_TTL_MS = 90 * 1000;

    NS.LOCK_HEARTBEAT_MS = 30 * 1000;

    NS.LOCK_CAPTURE_STALL_MS = 75 * 1000;

    NS._lockApiBase = function () {
        return (
            global.LiveState?.workerUrl ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    };

    NS._machineId = function () {
        let id = localStorage.getItem('web2_capture_machine_id');
        if (!id) {
            id = 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            localStorage.setItem('web2_capture_machine_id', id);
        }
        return id;
    };

    NS._tabId = function () {
        let id = sessionStorage.getItem('web2_capture_tab_id');
        if (!id) {
            id = 't_' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem('web2_capture_tab_id', id);
        }
        return id;
    };

    NS._holderId = function () {
        return NS._machineId() + ':' + NS._tabId();
    };

    NS._lockFetch = async function (path, opts) {
        const r = await fetch(`${NS._lockApiBase()}/api/web2/capture-lock${path}`, opts);
        return r.json().catch(() => ({}));
    };

    NS._readLock = async function () {
        try {
            const j = await NS._lockFetch('/get/global');
            return j?.record?.data || null;
        } catch (_) {
            return null;
        }
    };

    NS._postAcquire = async function (force) {
        return NS._lockFetch('/acquire', {
            method: 'POST',
            headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                holder: NS._holderId(),
                holderName: NS._user()?.name || NS._machineId(),
                force: !!force,
                ttlMs: NS.LOCK_TTL_MS,
            }),
        });
    };

    NS._acquireCaptureLock = async function (interactive) {
        let j = null;
        try {
            j = await NS._postAcquire(false);
        } catch (_) {}
        if (j?.success) return { ok: true };
        // Network/server error (không có current) → fail im lặng, KHÔNG confirm.
        if (!j?.current) return { ok: false };
        const who = j.current.holderName || j.current.holder || 'máy khác';
        if (!interactive) return { ok: false, holderName: who };
        const take = await Popup.confirm(
            `Máy khác ("${who}") đang capture livestream.\n` +
                `Chuyển capture sang máy NÀY? (máy kia sẽ tự dừng để không đè dữ liệu)`,
            { okText: 'Chuyển sang máy này' }
        );
        if (!take) return { ok: false, holderName: who };
        try {
            j = await NS._postAcquire(true);
        } catch (_) {
            j = null;
        }
        return j?.success ? { ok: true } : { ok: false, holderName: who };
    };

    NS._startLockHeartbeat = function () {
        NS._stopLockHeartbeat();
        NS.STATE._lockHbTimer = setInterval(async () => {
            const sinceFrame = Date.now() - (NS.STATE.lastFrameAt || 0);
            if (sinceFrame > NS.LOCK_CAPTURE_STALL_MS) {
                console.warn(
                    `[snap-lock] capture stalled ${Math.round(sinceFrame / 1000)}s không có frame → nhả lock cho máy khác takeover`
                );
                NS._stopFrameBuffer(); // cũng release lock + stop heartbeat
                NS.stopRealSnap();
                const wrapper = document.getElementById('live-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                NS.STATE.autoSnapStarting = false; // cho poll loop retry khi máy hồi
                // Cooldown 3 phút: máy VỪA stall không được auto re-acquire ngay
                // (release → SSE event → chính nó nhào vào thắng CAS → lại stall
                // 90s nữa → máy khỏe mãi không tới lượt). Tab visible lại → xóa
                // cooldown (stall thường do unfocused). Click tay luôn override.
                NS.STATE._stallCooldownUntil = Date.now() + 180000;
                NS.renderRealSnapChip();
                NS._toast('📵 Capture không ra frame — nhả quyền chụp cho máy khác', 'ok');
                return;
            }
            let j = null;
            try {
                j = await NS._postAcquire(false);
            } catch (_) {
                return; // network blip — thử lại tick sau, TTL 90s đủ rộng
            }
            if (j && j.success === false) {
                console.log('[snap-lock] heartbeat mất lock (force takeover) → stop capture');
                NS._stopLockHeartbeat();
                NS.stopRealSnap();
                NS._toast('📵 Máy khác đã nhận capture — máy này dừng', 'ok');
            }
        }, NS.LOCK_HEARTBEAT_MS);
    };

    NS._stopLockHeartbeat = function () {
        if (NS.STATE._lockHbTimer) {
            clearInterval(NS.STATE._lockHbTimer);
            NS.STATE._lockHbTimer = null;
        }
    };

    NS._releaseCaptureLock = async function () {
        NS._stopLockHeartbeat();
        try {
            await NS._lockFetch('/release', {
                method: 'POST',
                headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ holder: NS._holderId() }),
            });
        } catch (_) {}
    };

    NS._subscribeLockSse = function () {
        if (NS._subscribeLockSse._done) return;
        if (!global.Web2SSE?.subscribe) return;
        NS._subscribeLockSse._done = true;
        global.Web2SSE.subscribe('web2:capture-lock', async () => {
            if (!NS.STATE.captureStream && !NS.STATE.frameBufferTimer) {
                // Standby: lock vừa đổi trạng thái. Nếu đã trống → takeover.
                const cur = await NS._readLock();
                const expired =
                    cur?.holder &&
                    (Number(cur.ts) || 0) + (Number(cur.ttlMs) || NS.LOCK_TTL_MS) < Date.now();
                if (!cur?.holder || expired) {
                    NS.STATE.autoSnapStarting = false; // cho phép re-entry
                    setTimeout(() => NS._maybeShowAutoSnapBanner(), Math.random() * 1500);
                }
                return;
            }
            const cur = await NS._readLock();
            if (cur?.holder && cur.holder !== NS._holderId()) {
                console.log('[snap-lock] lock taken by another machine → stop capture');
                NS._stopFrameBuffer();
                NS.stopRealSnap();
                const wrapper = document.getElementById('live-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                NS._toast(
                    `📵 Máy "${cur.holderName || 'khác'}" đã nhận capture — máy này dừng`,
                    'ok'
                );
            }
        });
    };
})();
