// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-ui (header chips: page/real/auto/force/backfill)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS._ensureFloatingHost = function () {
        let host = document.getElementById('live-snap-floating-host');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'live-snap-floating-host';
        // Ưu tiên mount vào topbar (#liveSnapSlot) — IN-FLOW, KHÔNG fixed → không
        // đè lên nút Pancake/CK bên phải (fix 2026-06-09). Fallback: floating cũ.
        const slot = document.getElementById('liveSnapSlot');
        if (slot) {
            host.style.cssText = 'display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;';
            slot.appendChild(host);
        } else {
            host.style.cssText =
                'position:fixed;top:8px;right:8px;z-index:1000;display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.95);padding:4px 6px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);';
            document.body.appendChild(host);
        }
        return host;
    };

    NS.ensureHeaderChip = function () {
        let chip = document.getElementById('live-snap-page-chip');
        if (chip) return chip;
        // Try mount in Live header area; fallback floating host (always visible).
        const host =
            document.querySelector('.live-header-bar') ||
            document.querySelector('.live-toolbar') ||
            document.querySelector('#liveCommentHeader') ||
            NS._ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-page-chip';
        chip.className = 'live-snap-page-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:14px;font-size:12px;font-weight:600;color:#92400e;cursor:pointer;margin-left:8px;user-select:none;';
        chip.addEventListener('click', () => {
            const next = NS._getSnapPagePref() === 'store' ? 'house' : 'store';
            NS._setSnapPagePref(next);
            NS._toast(
                `📡 Snap live: ${next === 'house' ? 'Nhi Judy House' : 'NhiJudy Store'}`,
                'ok'
            );
        });
        host.appendChild(chip);
        NS.renderHeaderChip();
        return chip;
    };

    NS.renderHeaderChip = function () {
        const chip = document.getElementById('live-snap-page-chip');
        if (!chip) return;
        const pref = NS._getSnapPagePref();
        const label = pref === 'house' ? 'House' : 'Store';
        chip.innerHTML = `📡 Snap live: <strong>${label}</strong> <span style="opacity:0.6;font-size:10px;">▼</span>`;
        chip.title = `Click để đổi (current: ${pref}). Snap button sẽ chụp từ live của page này.`;
    };

    NS.ensureRealSnapChip = function () {
        let chip = document.getElementById('live-snap-real-chip');
        if (chip) return chip;
        const host =
            document.querySelector('.live-header-bar') ||
            document.querySelector('.live-toolbar') ||
            document.querySelector('#liveCommentHeader') ||
            NS._ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-real-chip';
        chip.className = 'live-snap-real-chip';
        chip.style.cssText =
            'display:none;align-items:center;gap:6px;padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;margin-left:6px;user-select:none;';
        // Click chip = đổi mode (NOT toggle stream). Stream tự bật khi user
        // click 📸 trong mode='live' (lazy initialization, OS picker chỉ hiện
        // khi cần thật sự).
        chip.addEventListener('click', async () => {
            // Click 🎬 = 1-click toggle. Dùng EMBEDDED iframe FB live (no tab
            // switch). Nếu đã share/ext-capture → stop + remove iframe.
            if (NS.STATE.captureStream || NS.STATE.frameBufferTimer) {
                NS.stopRealSnap();
                const wrapper = document.getElementById('live-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                NS._setSnapMode(NS.MODE_LAZY);
                NS._toast('⏱️ Đã ngắt — auto-snap dùng metadata only', 'ok');
                return;
            }
            NS._setSnapMode(NS.MODE_LIVE);
            await NS._enableEmbeddedLiveCapture({ interactive: true });
        });
        host.appendChild(chip);
        NS.renderRealSnapChip();
        NS.renderAutoModeChip();
        return chip;
    };

    NS.renderRealSnapChip = function () {
        const chip = document.getElementById('live-snap-real-chip');
        if (!chip) return;
        const streamReady = !!NS.STATE.captureStream || !!NS.STATE.frameBufferTimer;
        const bufSize = NS.STATE.frameBuffer?.length || 0;
        const viaExtTab =
            NS.STATE.extReady && !NS.STATE.captureStream && !!NS.STATE.frameBufferTimer;
        if (streamReady) {
            const sourceLabel = viaExtTab ? 'EXT tab' : 'LIVE linked';
            chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> 🎬 ${sourceLabel} · ${bufSize} frames`;
            chip.style.background = '#fee2e2';
            chip.style.borderColor = '#fca5a5';
            chip.style.color = '#991b1b';
            chip.title = viaExtTab
                ? `Extension visible tab — chỉ capture khi live-chat là tab focused. Switch tab khác → capture dừng (browser security).`
                : `Stream FB đang link. Mỗi 5s capture 1 frame vào buffer (giữ 1h). Click chip để NGẮT stream.`;
        } else if (NS.STATE.lockBlockedBy) {
            chip.innerHTML = `📵 Máy "<strong>${NS._esc(NS.STATE.lockBlockedBy)}</strong>" đang chụp`;
            chip.style.background = '#f1f5f9';
            chip.style.borderColor = '#cbd5e1';
            chip.style.color = '#475569';
            chip.title = `Máy khác đang giữ capture (1 máy duy nhất để không đè dữ liệu).\nClick nếu muốn CHUYỂN capture sang máy này — máy kia sẽ tự dừng.`;
        } else {
            chip.innerHTML = `🎬 Bắt đầu chụp live · click 1 cái mở FB + share`;
            chip.style.background = '#fef3c7';
            chip.style.borderColor = '#fcd34d';
            chip.style.color = '#92400e';
            chip.title = `Click: tự mở tab FB live + 3s sau prompt share. Sau khi share, frame buffer chạy → mọi auto-snap dùng frame thật. Không cần làm gì thêm.`;
        }
    };

    NS.ensureAutoModeChip = function () {
        let chip = document.getElementById('live-snap-auto-chip');
        if (chip) return chip;
        const host = NS._ensureFloatingHost();
        if (!host) return null;
        // Ép Auto luôn ON, không cho user toggle (yêu cầu UX: tự động chạy).
        if (!NS._isAutoMode()) NS._setAutoMode(true);
        chip = document.createElement('div');
        chip.id = 'live-snap-auto-chip';
        // Auto luôn ON (không toggle) → ẩn chip status "Auto: ON (offset)·0" để
        // không đè giao diện (2026-06-09). Giữ trong DOM (mount loop + render OK).
        chip.style.cssText =
            'display:none !important;align-items:center;gap:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;user-select:none;';
        host.appendChild(chip);
        NS.renderAutoModeChip();
        return chip;
    };

    NS.renderAutoModeChip = function () {
        const chip = document.getElementById('live-snap-auto-chip');
        if (!chip) return;
        const on = NS._isAutoMode();
        const streamOk = !!NS.STATE.captureStream;
        if (on) {
            const pathLabel = streamOk ? '🎬 stream' : '⏱ offset';
            chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#16a34a;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> Auto: <strong>ON</strong> (${pathLabel}) · ${NS.STATE.autoStats.total}`;
            chip.style.background = '#dcfce7';
            chip.style.borderColor = '#86efac';
            chip.style.color = '#166534';
            chip.title = `Auto-snap ON (luôn bật).
Path: ${streamOk ? 'real-frame từ FB tab share (chính xác moment)' : 'offset computed từ commentTime + broadcastStart (chính xác giây)'}
Session: ${NS.STATE.autoStats.total} OK, ${NS.STATE.autoStats.throttled} throttled, ${NS.STATE.autoStats.errors} errors.
Throttle 30s/KH.`;
        } else {
            chip.innerHTML = `🤖 Auto: <strong>OFF</strong> · click bật`;
            chip.style.background = '#f3f4f6';
            chip.style.borderColor = '#d1d5db';
            chip.style.color = '#374151';
            chip.title =
                'Auto OFF. Click bật: mỗi comment mới tự snap với offset chính xác (không cần FB tab share).';
        }
    };

    NS.ensureInlineThumbChip = function () {
        return null;
    };

    NS.renderInlineThumbChip = function () {};

    NS.ensureForceExtractChip = function () {
        let chip = document.getElementById('live-snap-force-extract-chip');
        if (chip) return chip;
        const host = NS._ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-force-extract-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fef3c7;border:1px solid #fde68a;border-radius:14px;font-size:12px;font-weight:600;color:#92400e;cursor:pointer;user-select:none;';
        chip.innerHTML = `⚡ <strong>Force extract</strong>`;
        chip.title =
            'Force backend re-extract tất cả snap không có bytea (yt-dlp + ffmpeg).\nFilter theo live hiện tại nếu có, không thì all.\nUseful khi live vừa end + VOD đã có nhưng cron 1h chưa chạy.';
        const _resetChip = () => {
            chip.innerHTML = `⚡ <strong>Force extract</strong>`;
            chip.dataset.running = '';
            chip.style.opacity = '1';
            chip.style.pointerEvents = 'auto';
            chip.style.background = '#fef3c7';
            chip.style.borderColor = '#fde68a';
            chip.style.color = '#92400e';
        };
        const _renderProgress = (s, total) => {
            const done = s.done || 0;
            const failed = s.failed || 0;
            const drm = s.drmBlocked || 0;
            const live = s.liveActive || 0;
            const finished = done + failed + drm + live;
            const pct = Math.round((finished / Math.max(1, total)) * 100);
            const parts = [
                done > 0 ? `${done}✓` : '',
                failed > 0 ? `${failed}✗` : '',
                drm > 0 ? `${drm}🔒` : '',
                live > 0 ? `${live}🔴` : '',
            ]
                .filter(Boolean)
                .join(' ');
            chip.innerHTML = `⚡ ${finished}/${total} (${pct}%) <small style="opacity:0.75;">${parts}</small>`;
            chip.style.background = '#dbeafe';
            chip.style.borderColor = '#93c5fd';
            chip.style.color = '#1e40af';
        };
        // CLIENT-SIDE force extract (2026-06-06): backend yt-dlp/Graph bị FB chặn
        // (xem _clientCaptureAtOffset). Browser có FB auth → seek iframe VOD +
        // capture từng comment. Chỉ chạy comment CHƯA có thumbnail thật.
        chip.addEventListener('click', async () => {
            if (chip.dataset.running === '1') {
                NS._toast('Đang chạy — đợi xong rồi click lại', 'ok');
                return;
            }
            const st = global.LiveState;
            // Gom KH từ comment vào kho KH (web2_customers) — song song, không
            // chặn image flow. Backend KHÔNG ghi đè SĐT/địa chỉ/tên sẵn có:
            // trùng SĐT → thêm alt_phones (chính giữ nguyên), field rỗng mới fill.
            try {
                window.LiveColumnManager?._harvestCommentCustomers?.(
                    (st?.comments || []).filter(
                        (c) =>
                            c.from?.id &&
                            !NS._isStaffComment(c) &&
                            !global.LiveHiddenCommenters?.isHidden?.(c)
                    )
                )
                    .then((j) => {
                        if (j && (j.created || j.altAdded || j.filled || j.linked)) {
                            NS._toast(
                                `Kho KH: +${j.created || 0} mới, ` +
                                    `+${(j.altAdded || 0) + (j.filled || 0) + (j.linked || 0)} cập nhật`,
                                'ok'
                            );
                        }
                    })
                    .catch(() => {});
            } catch (_) {}
            // Pending = comment (non-staff, không bị ẩn) chưa có ảnh bytea thật.
            const pending = (st?.comments || []).filter((c) => {
                if (!c.from?.id || NS._isStaffComment(c)) return false;
                if (global.LiveHiddenCommenters?.isHidden?.(c)) return false;
                const snapRow = NS.STATE.snapByComment.get(c.id);
                return !(snapRow?.thumbnailUrl || '').includes('/api/livestream/snapshot/');
            });
            if (!pending.length) {
                NS._toast('Tất cả comment đã có thumbnail rồi', 'ok');
                return;
            }
            if (!NS.STATE.extReady && !NS.STATE.captureStream) {
                NS._toast('Chưa có capture — mở live + bật capture trước đã', 'err');
                return;
            }
            // CHẠY NỀN (2026-06-13): KHÔNG confirm chặn, KHÔNG khóa chip — user vẫn
            // kéo SP / duyệt comment trong khi trích xuất. Bấm chip lần nữa = HỦY.
            chip.dataset.running = '1';
            NS.STATE._forceExtractCancel = false;
            const isCancelled = () => NS.STATE._forceExtractCancel === true;

            // Group theo video (Facebook_LiveId) — mỗi video 1 nhóm comment.
            const byVideo = new Map();
            for (const c of pending) {
                const camp = NS._resolveCampaignForComment(c);
                if (!camp?.Facebook_LiveId) continue;
                const k = camp.Facebook_LiveId;
                if (!byVideo.has(k)) byVideo.set(k, { camp, comments: [] });
                byVideo.get(k).comments.push(c);
            }
            const total = pending.length;
            const stats = { done: 0, failed: 0 };
            const onProgress = () =>
                _renderProgress({ done: stats.done, failed: stats.failed }, total);
            onProgress();
            // ĐA NHIỆM: extReady → POOL 3 luồng song song (capture per-worker qua
            // captureVisibleTab, worker hiển thị ở strip). Không extReady (chỉ
            // getDisplayMedia stream — cropTo bind 1 wrapper, không pool được) → serial.
            const usePool = !!NS.STATE.extReady;
            const activeCamp = NS._findActiveLiveCampaign();
            try {
                if (usePool) {
                    await NS._runForceExtractParallel(
                        byVideo,
                        st,
                        total,
                        3,
                        isCancelled,
                        onProgress,
                        stats
                    );
                } else {
                    await NS._runForceExtractSerial(
                        byVideo,
                        st,
                        total,
                        isCancelled,
                        onProgress,
                        stats
                    );
                }
                NS._toast(
                    `Force extract: ${stats.done} OK, ${stats.failed} fail` +
                        (isCancelled() ? ' (đã dừng)' : ''),
                    stats.done > 0 ? 'ok' : 'err'
                );
            } catch (e) {
                NS._toast('Lỗi force extract: ' + e.message, 'err');
            } finally {
                // Serial dùng player dock → restore iframe live. Pool dùng strip
                // riêng, KHÔNG đụng dock → khỏi restore (tránh rebuild iframe thừa).
                try {
                    if (!usePool && activeCamp) await NS._clientRestoreLive(activeCamp);
                } catch (_) {}
                NS.STATE._forceExtractCancel = false;
                NS._invalidateSnapCacheAndRefresh();
                setTimeout(_resetChip, 2500);
            }
        });
        host.appendChild(chip);
        return chip;
    };

    NS.ensureBackfillChip = function () {
        let chip = document.getElementById('live-snap-backfill-chip');
        if (chip) return chip;
        const host = NS._ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-backfill-chip';
        // ẨN visually — auto-snap on new comment + Force extract pending đã đủ
        // bao phủ flow thường. Backfill chỉ cần khi user join late + chưa có
        // user khác chụp. Giữ chức năng + handlers (revive bằng đổi display).
        chip.style.cssText =
            'display:none;align-items:center;gap:4px;padding:4px 10px;background:#e8f2ff;border:1px solid #bcdcff;border-radius:14px;font-size:12px;font-weight:600;color:#0058da;cursor:pointer;user-select:none;';
        chip.innerHTML = `🔄 <strong>Backfill</strong>`;
        chip.title =
            'Click: backfill snap cho mọi comment hiện tại (offset chính xác qua broadcast_start). Shift+click: manual nhập time + KH.';
        chip.addEventListener('click', async (e) => {
            if (e.shiftKey) {
                await NS.offlineManualSnap();
                return;
            }
            const total = (global.LiveState?.comments || []).filter(
                (c) => c.from?.id && !NS._isStaffComment(c)
            ).length;
            if (
                !(await Popup.confirm(
                    `Backfill ${total} comments? (skip những comment đã có snap)`
                ))
            )
                return;
            await NS.offlineBatchAll({ skipExisting: true });
        });
        host.appendChild(chip);
        return chip;
    };
})();
