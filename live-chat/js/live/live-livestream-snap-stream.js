// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-stream (getDisplayMedia / embedded capture, visibility watcher)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS.ensureCaptureStream = async function () {
        if (NS.STATE.captureStream) return NS.STATE.captureStream;
        return NS._requestCaptureStream();
    };

    NS.toggleRealSnap = async function () {
        if (NS.STATE.captureStream) {
            NS.stopRealSnap();
            return;
        }
        return NS._requestCaptureStream();
    };

    NS._showPickerTutorial = function () {
        if (localStorage.getItem('web2_snap_picker_tutorial_seen')) return Promise.resolve();
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,0.7);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,sans-serif;';
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:14px;padding:24px 28px;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,0.3);">
                    <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">📷 Cách chụp livestream lần đầu</h3>
                    <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.5;">
                        Sau khi bấm "Tiếp tục", browser sẽ hiện 1 cửa sổ chọn tab.
                        Làm theo 3 bước:
                    </p>
                    <ol style="margin:0 0 16px 18px;padding:0;font-size:13px;color:#334155;line-height:1.7;">
                        <li><strong>Click hàng "(...) Facebook"</strong> trong cột trái</li>
                        <li>Cột phải sẽ hiện preview tab FB</li>
                        <li>Click nút <strong>Share</strong> (góc phải dưới)</li>
                    </ol>
                    <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;line-height:1.5;background:#f8fafc;padding:8px 10px;border-radius:6px;border-left:3px solid #f59e0b;">
                        💡 Lần sau bạn KHÔNG cần làm lại — stream giữ nguyên suốt phiên.
                    </p>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="snap-tut-skip" style="background:transparent;border:1px solid #cbd5e1;color:#475569;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;">Bỏ qua, không hỏi lại</button>
                        <button class="snap-tut-ok" style="background:#0068ff;border:none;color:#fff;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Tiếp tục</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const close = (remember) => {
                if (remember) localStorage.setItem('web2_snap_picker_tutorial_seen', '1');
                overlay.remove();
                resolve();
            };
            overlay.querySelector('.snap-tut-ok').onclick = () => close(false);
            overlay.querySelector('.snap-tut-skip').onclick = () => close(true);
        });
    };

    NS._requestCaptureStream = async function () {
        try {
            await NS._showPickerTutorial();
            // Hint user trước khi mở picker (notification toast)
            NS._toast('⚙ Browser mở picker — click tab Facebook + bấm Share', 'ok');
            // getDisplayMedia với preferences: prefer browser tab, no audio, no cursor
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'never',
                    displaySurface: 'browser',
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                },
                audio: false,
                preferCurrentTab: false,
                selfBrowserSurface: 'exclude',
            });
            NS.STATE.captureStream = stream;
            // Tạo hidden video để draw frame
            if (!NS.STATE.captureVideo) {
                NS.STATE.captureVideo = document.createElement('video');
                NS.STATE.captureVideo.muted = true;
                NS.STATE.captureVideo.playsInline = true;
                NS.STATE.captureVideo.style.cssText =
                    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
                document.body.appendChild(NS.STATE.captureVideo);
            }
            NS.STATE.captureVideo.srcObject = stream;
            await NS.STATE.captureVideo.play();
            // Lắng nghe khi user "Stop sharing" qua browser UI
            stream.getVideoTracks().forEach((t) => {
                t.addEventListener('ended', () => {
                    console.log('[snap-real] user stopped sharing → revert OFF');
                    NS._stopFrameBuffer();
                    NS.stopRealSnap();
                    NS._toast('🔴 Snap thật đã tắt (user dừng share)', 'ok');
                });
            });
            // Khởi động frame buffer — capture 1 frame mỗi 5s, giữ 720 frames
            // (1 tiếng). Mỗi entry { capturedAt: ms, blob }. Auto-snap
            // sau đó dùng buffer nearest commentTime → frame unique per comment.
            NS._startFrameBuffer();
            NS.renderRealSnapChip();
            NS.renderAutoModeChip();
            NS._toast('🔴 Snap thật ON — mỗi 📸 sẽ chụp thật từ tab đã chọn', 'ok');
        } catch (e) {
            console.warn('[snap-real] getDisplayMedia rejected:', e?.message);
            if (e?.name === 'NotAllowedError') {
                NS._toast('Đã hủy chọn tab', 'err');
            } else {
                NS._toast('Bật snap thật thất bại: ' + e.message, 'err');
            }
            NS.STATE.captureStream = null;
            NS.renderRealSnapChip();
            NS.renderAutoModeChip();
        }
    };

    NS.stopRealSnap = function () {
        NS._stopFrameBuffer();
        if (NS.STATE.captureStream) {
            NS.STATE.captureStream.getTracks().forEach((t) => t.stop());
            NS.STATE.captureStream = null;
        }
        if (NS.STATE.captureVideo) {
            NS.STATE.captureVideo.srcObject = null;
        }
        // Remove iframe wrapper (FB embed + minimize button).
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (wrapper) wrapper.remove();
        NS.renderRealSnapChip();
        NS.renderAutoModeChip();
    };

    NS._ensureVideoDock = function () {
        const col = document.getElementById('khoSpColumn');
        if (!col) return null;
        let dock = document.getElementById('live-video-dock');
        if (!dock) {
            dock = document.createElement('div');
            dock.id = 'live-video-dock';
            const host = document.getElementById('khoSpHost');
            if (host && host.parentElement === col) col.insertBefore(dock, host);
            else col.insertBefore(dock, col.firstChild);
        }
        return dock;
    };

    NS._ensureEmbeddedIframe = function (camp) {
        let wrapper = document.getElementById('live-snap-fb-wrapper');
        if (wrapper) return wrapper.querySelector('iframe');
        const fbVideoUrl = NS._buildFbLiveUrl(camp);
        if (!fbVideoUrl) return null;
        // User feedback 2026-05-26: capture lệch iframe + lag sau khi kết nối.
        // Root cause: render iframe 560×480 rồi scale 0.571 → DOM compositing
        // overhead + nếu FB plugin update layout, HEADER_OFFSET cố định lệch.
        //
        // Fix: render iframe AT WRAPPER SIZE (no scale transform), pass width
        // matching wrapper trực tiếp cho FB plugin URL. FB plugin tự render
        // responsive theo width → ít DOM + capture đúng video area.
        //
        // HEADER_OFFSET vẫn cần (FB plugin có thanh header mỏng ~30px ở size
        // nhỏ). Wrapper overflow:hidden + iframe translate Y up để skip header.
        // FB live từ điện thoại = DỌC (9:16). Khung ngang 16:9 → FB letterbox =
        // đen 2 bên (user feedback 2026-06-06). Đổi khung sang DỌC 9:16 → video dọc
        // fill full, hết đen 2 bên (và frame capture cũng full, không bake viền đen).
        const WRAPPER_W = NS.SNAP_VIDEO_W;
        const WRAPPER_H = NS.SNAP_VIDEO_H; // 9:16 video area (dọc)
        const HEADER_OFFSET = NS.SNAP_VIDEO_HEADER; // FB plugin header bar
        const IFRAME_W = WRAPPER_W;
        const IFRAME_H = WRAPPER_H + HEADER_OFFSET; // total iframe height = video + header

        const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbVideoUrl)}&show_text=false&width=${IFRAME_W}&height=${IFRAME_H}&autoplay=1&mute=1&allowfullscreen=false&show_share=false&show_captions=false`;
        wrapper = document.createElement('div');
        wrapper.id = 'live-snap-fb-wrapper';
        // Dock vào đỉnh cột Kho SP (in-flow, reserved). Fallback fixed góc dưới-phải
        // nếu layout chưa có cột Kho SP (defensive — capture vẫn chạy).
        const dock = NS._ensureVideoDock();
        // isolation:isolate → tạo stacking context cho Element Capture (restrictTo
        // yêu cầu element form a stacking context). Vô hại cho hiển thị dock/fixed.
        wrapper.style.cssText = dock
            ? `position:relative;width:${WRAPPER_W}px;height:${WRAPPER_H}px;border:2px solid #dc2626;border-radius:8px;background:#000;box-shadow:0 2px 8px rgba(0,0,0,0.25);overflow:hidden;flex:0 0 auto;isolation:isolate;`
            : `position:fixed;bottom:8px;right:8px;width:${WRAPPER_W}px;height:${WRAPPER_H}px;border:2px solid #dc2626;border-radius:8px;z-index:99000;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.3);overflow:hidden;isolation:isolate;`;

        // No scale transform — iframe rendered AT wrapper width. Chỉ
        // translate up by HEADER_OFFSET để skip FB plugin header.
        const iframe = document.createElement('iframe');
        iframe.id = 'live-snap-fb-embed';
        iframe.src = embedUrl;
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.scrolling = 'no';
        iframe.frameBorder = '0';
        iframe.style.cssText = `position:absolute;left:0;top:${-HEADER_OFFSET}px;width:${IFRAME_W}px;height:${IFRAME_H}px;display:block;border:0;`;
        wrapper.appendChild(iframe);
        wrapper._videoHeight = WRAPPER_H;
        wrapper._scale = 1; // no scaling
        // Minimize button đã gỡ — khi minimize iframe display:none → tab
        // capture trả pixel trống (44x44 pill không có video) → buffer toàn
        // frame rỗng. Giữ iframe luôn open để capture liên tục.
        (dock || document.body).appendChild(wrapper);
        return iframe;
    };

    NS._enableEmbeddedLiveCapture = async function (opts) {
        if (NS.STATE.captureStream || NS.STATE.frameBufferTimer) {
            NS._toast('Đã kết nối rồi', 'ok');
            return true;
        }
        const camp = NS._findActiveLiveCampaign();
        if (!camp?.Facebook_LiveId) {
            NS._toast('Không có live nào đang chạy', 'err');
            return false;
        }
        // LEADER LOCK: 1 máy capture duy nhất. Auto path (không interactive)
        // → máy khác giữ lock thì im lặng bỏ qua (poll loop retry sau, máy kia
        // unload/hết TTL sẽ tới lượt). Click tay → confirm cướp lock.
        const lock = await NS._acquireCaptureLock(!!opts?.interactive);
        if (!lock.ok) {
            NS.STATE.lockBlockedBy = lock.holderName || 'máy khác';
            NS.STATE.autoSnapStarting = false;
            NS.renderRealSnapChip();
            if (opts?.interactive) {
                NS._toast(
                    `📵 Máy "${NS.STATE.lockBlockedBy}" đang capture — máy này không bật`,
                    'err'
                );
            }
            return false;
        }
        NS.STATE.lockBlockedBy = null;
        const wrapperExisted = !!document.getElementById('live-snap-fb-wrapper');
        const iframe = NS._ensureEmbeddedIframe(camp);
        if (!iframe) {
            NS._toast('Không tạo được iframe embed', 'err');
            // Đã acquire lock nhưng không tới được _startFrameBuffer → nhả ngay,
            // không thì máy khác bị block tới hết TTL 90s.
            NS._releaseCaptureLock();
            return false;
        }
        // Đợi iframe load xong (FB plugin HTML + JS) RỒI thêm 7s buffer cho
        // FB player thực sự start video (khác với chỉ load HTML). User báo:
        // 'đợi iframe load xong rồi mới chụp chứ -> đừng vào là chụp liền'.
        // Trước: fixed 4s → frame đầu thường là FB loading spinner / blank.
        // Sau: load event + 7s = ~ thời điểm video bắt đầu play, capture frame
        // thật.
        if (!wrapperExisted) {
            NS._toast('⏳ Đợi iframe FB load + video play (~10s)...', 'ok');
            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    resolve();
                };
                iframe.addEventListener('load', finish, { once: true });
                // Hard timeout 6s nếu iframe load event không fire (đôi khi FB
                // plugin defer fire). Sau timeout vẫn proceed → buffer sẽ skip
                // frame xấu qua validation tick.
                setTimeout(finish, 6000);
            });
            // FB plugin sau load event vẫn cần ~7s để actual video start (init
            // player, fetch DASH manifest, buffer chunks).
            await new Promise((r) => setTimeout(r, 7000));
        } else {
            // Wrapper đã có sẵn (auto-start inject sớm) → video chắc đang play
            // rồi, chỉ cần 500ms để frame buffer query rect ổn định.
            await new Promise((r) => setTimeout(r, 500));
        }
        // AUTO-START (không có user gesture): getDisplayMedia BẮT BUỘC gesture nên
        // không gọi được → dùng extension captureVisibleTab im lặng (foreground).
        // INTERACTIVE (user bấm 🎬) → xuống dưới: getDisplayMedia + Element Capture
        // (occlusion-immune — video tí hon/bị đè/tab nền vẫn chụp chuẩn). Hủy share
        // → fallback về extension captureVisibleTab (catch ở dưới).
        if (NS.STATE.extReady && !opts?.interactive) {
            NS._startFrameBuffer();
            NS.renderRealSnapChip();
            NS.renderAutoModeChip();
            const hint = document.getElementById('live-snap-fb-hint');
            if (hint) hint.remove();
            NS._toast('✅ Auto-snap qua extension (foreground) — không popup', 'ok');
            return true;
        }
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    // Cap fps THẤP: buffer chỉ sample ~5s/lần nên không cần fps cao →
                    // giảm tải compositor/encode = giảm lag. 2-4 đủ tươi cho cả
                    // auto-snap (5s) lẫn seek-fallback, mà nhẹ hơn nhiều 4/8.
                    frameRate: { ideal: 2, max: 4 },
                },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'exclude',
            });
            // Element Capture (restrictTo) — Chrome 132+: chụp ĐÚNG pixel của wrapper,
            // BỎ QUA mọi thứ đè lên + ngoài element (occlusion-immune) → video có thể
            // tí hon / cho UI đè / tab nền vẫn chụp chuẩn. Ưu tiên. Fallback Region
            // Capture (cropTo, Chrome 104+) — crop theo bounding box (KHÔNG miễn đè).
            // restrictTo cần element tạo stacking context (wrapper có isolation:isolate).
            const track = stream.getVideoTracks()[0];
            // contentHint='detail': ưu tiên sắc nét (ảnh SP đọc được) hơn mượt
            // chuyển động — đúng cho chụp thumbnail tĩnh, nhẹ pipeline. (hint, an toàn)
            try {
                track.contentHint = 'detail';
            } catch (_) {}
            const wrapper = document.getElementById('live-snap-fb-wrapper');
            let restricted = false;
            if (wrapper && window.RestrictionTarget?.fromElement && track.restrictTo) {
                try {
                    const rt = await RestrictionTarget.fromElement(wrapper);
                    await track.restrictTo(rt);
                    restricted = true;
                    console.log('[snap] Element Capture restrictTo wrapper ✓ (occlusion-immune)');
                } catch (e) {
                    console.warn('[snap] restrictTo fail → thử Region Capture:', e.message);
                }
            }
            if (!restricted && wrapper && window.CropTarget?.fromElement && track.cropTo) {
                try {
                    const cropTarget = await CropTarget.fromElement(wrapper);
                    await track.cropTo(cropTarget);
                    console.log('[snap] Region Capture cropTo wrapper ✓');
                } catch (e) {
                    console.warn('[snap] cropTo fail (full tab capture):', e.message);
                }
            }
            NS.STATE.captureStream = stream;
            if (!NS.STATE.captureVideo) {
                NS.STATE.captureVideo = document.createElement('video');
                NS.STATE.captureVideo.muted = true;
                NS.STATE.captureVideo.playsInline = true;
                NS.STATE.captureVideo.style.cssText =
                    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
                document.body.appendChild(NS.STATE.captureVideo);
            }
            NS.STATE.captureVideo.srcObject = stream;
            await NS.STATE.captureVideo.play();
            stream.getVideoTracks().forEach((t) => {
                t.addEventListener('ended', () => {
                    NS._stopFrameBuffer();
                    NS.stopRealSnap();
                    NS._toast('🔴 Stream đã ngắt — bấm 🎬 để bật lại', 'ok');
                });
            });
            NS._startFrameBuffer();
            NS.renderRealSnapChip();
            NS.renderAutoModeChip();
            // Remove hint label sau khi connect (đã share rồi).
            const hint = document.getElementById('live-snap-fb-hint');
            if (hint) hint.remove();
            NS._toast('✅ Auto-snap đã kết nối — frame thật unique per comment', 'ok');
            return true;
        } catch (e) {
            console.warn('[snap-embed] fail:', e?.message);
            // User hủy share / không cấp quyền → nếu có extension thì fallback
            // captureVisibleTab (im lặng, foreground) để vẫn chụp được, KHÔNG fail.
            if (NS.STATE.extReady) {
                NS._toast('Đã hủy share → dùng extension (foreground)', 'ok');
                NS._startFrameBuffer();
                NS.renderRealSnapChip();
                NS.renderAutoModeChip();
                const hint = document.getElementById('live-snap-fb-hint');
                if (hint) hint.remove();
                return true;
            }
            NS._toast('Hủy share: ' + e.message, 'err');
            // Cleanup wrapper nếu user hủy + nhả lock (chưa tới _startFrameBuffer).
            const wrapper = document.getElementById('live-snap-fb-wrapper');
            if (wrapper) wrapper.remove();
            NS._releaseCaptureLock();
            return false;
        }
    };

    NS._setupVisibilityWatcher = function () {
        if (NS.STATE._visibilityWatcherInstalled) return;
        NS.STATE._visibilityWatcherInstalled = true;
        const originalTitle = document.title;
        let titleFlashTimer = null;
        let lastHiddenTs = 0;
        let currentNotif = null;

        const startTitleFlash = () => {
            if (titleFlashTimer) return;
            let toggle = false;
            titleFlashTimer = setInterval(() => {
                toggle = !toggle;
                document.title = toggle
                    ? '⚠️ QUAY LẠI TAB LIVESTREAM'
                    : '🔴 Capture đang dừng — focus lại';
            }, 1000);
        };
        const stopTitleFlash = () => {
            if (titleFlashTimer) {
                clearInterval(titleFlashTimer);
                titleFlashTimer = null;
            }
            document.title = originalTitle;
        };

        const fireNotification = () => {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'denied') return;
            const fire = () => {
                try {
                    currentNotif = new Notification('⚠️ Livestream Snap đang dừng', {
                        body: 'Tab live-chat không focus → capture không chạy. Click để quay lại.',
                        tag: 'live-snap-switch-away',
                        requireInteraction: false,
                    });
                    currentNotif.onclick = () => {
                        window.focus();
                        try {
                            currentNotif.close();
                        } catch (_) {}
                    };
                } catch (e) {
                    console.warn('[snap-vis] notification fail:', e?.message);
                }
            };
            if (Notification.permission === 'granted') {
                fire();
            } else if (Notification.permission === 'default') {
                Notification.requestPermission().then((p) => {
                    if (p === 'granted') fire();
                });
            }
        };

        document.addEventListener('visibilitychange', () => {
            const isCapturing = !!NS.STATE.frameBufferTimer;
            if (!isCapturing) {
                stopTitleFlash();
                return;
            }
            if (document.visibilityState === 'hidden') {
                lastHiddenTs = Date.now();
                startTitleFlash();
                fireNotification();
            } else if (document.visibilityState === 'visible') {
                stopTitleFlash();
                if (currentNotif) {
                    try {
                        currentNotif.close();
                    } catch (_) {}
                    currentNotif = null;
                }
                const hiddenDuration = Date.now() - lastHiddenTs;
                // Hidden > 5s → show tip toast 1 lần
                if (hiddenDuration > 5000) {
                    if (!sessionStorage.getItem('web2_snap_2browser_tip_shown')) {
                        sessionStorage.setItem('web2_snap_2browser_tip_shown', '1');
                        NS._toast(
                            '💡 Mở 2 trình duyệt riêng — 1 cho livestream, 1 cho việc khác → capture không bị dừng',
                            'ok'
                        );
                    }
                    // Hidden > 10s → comments có thể đã arrive trong khi tab inactive
                    // (captureVisibleTab fail silently → snap row tạo nhưng không
                    // có bytea). Auto-trigger Force extract silently để fill
                    // thumbnail mà user không phải click chip thủ công.
                    if (hiddenDuration > 10000) {
                        NS._runSilentForceExtract().catch((e) =>
                            console.warn('[snap-vis] auto-extract fail:', e?.message)
                        );
                    }
                }
            }
        });
    };

    NS._showExtPrompt = function (kind) {
        if (sessionStorage.getItem('web2_ext_prompt_dismiss')) return;
        if (document.getElementById('live-snap-ext-prompt')) return;
        const box = document.createElement('div');
        box.id = 'live-snap-ext-prompt';
        const title =
            kind === 'outdated'
                ? `⚠️ N2Store Extension v${NS.STATE.extVersion || '?'} đã cũ`
                : '⚠️ Cần cài N2Store Extension';
        const body =
            kind === 'outdated'
                ? `Auto-snap cần extension <strong>v${NS.REQUIRED_EXT_VERSION}+</strong>. Bạn đang chạy <strong>v${NS.STATE.extVersion || '?'}</strong>.<br><br>Mở <code>chrome://extensions</code> → "N2Store Messenger" → bấm <strong>Reload</strong>. Capture sẽ tự chạy.`
                : `Auto-snap livestream cần extension <strong>N2Store Messenger</strong>.<br><br>1. Cài: <a href="https://chromewebstore.google.com/detail/dgcicifdlgamleagjangkbbcdgbhmfea" target="_blank" style="color:#ea580c;font-weight:700;">Chrome Web Store</a><br>2. Reload trang<br><br><em>Sau khi cài, capture tự chạy ngầm — không cần thao tác gì thêm.</em>`;
        box.innerHTML = `
            <div style="font-weight:700;font-size:14px;color:#7c2d12;margin-bottom:8px;">${title}</div>
            <div style="font-size:12px;color:#451a03;line-height:1.55;">${body}</div>
            <div style="margin-top:12px;">
                <button type="button" id="live-snap-ext-prompt-ok" style="width:100%;padding:6px 12px;background:#ea580c;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Đã hiểu</button>
            </div>`;
        box.style.cssText =
            'position:fixed;bottom:80px;right:16px;width:340px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.18);z-index:99100;font-family:Inter,system-ui,sans-serif;';
        document.body.appendChild(box);
        document.getElementById('live-snap-ext-prompt-ok').onclick = () => {
            sessionStorage.setItem('web2_ext_prompt_dismiss', '1');
            box.remove();
        };
    };

    NS._maybeShowAutoSnapBanner = async function () {
        // Mobile/tablet (html.lc-mobile — chế độ đọc comment): KHÔNG auto-bật
        // iframe capture + KHÔNG prompt extension (mobile không có extension,
        // iframe floating che comment) — 2026-06-11.
        if (document.documentElement.classList.contains('lc-mobile')) return;
        if (NS.STATE.captureStream || NS.STATE.frameBufferTimer) return;
        if (NS.STATE.autoSnapStarting) return;
        // Máy vừa stall-yield lock → nhường máy khác trong cooldown (xem
        // _startLockHeartbeat). Tab visible lại sẽ xóa cooldown.
        if (NS.STATE._stallCooldownUntil && Date.now() < NS.STATE._stallCooldownUntil) return;
        const camp = NS._findActiveLiveCampaign();
        if (!camp?.Facebook_LiveId) return;

        // Đợi 1500ms cho EXTENSION_LOADED message arrive trước khi decide.
        // (Lần đầu poll fire, ext có thể chưa response — content-script chậm
        // hơn page script.)
        await new Promise((r) => setTimeout(r, 1500));

        // Extension không ready → SKIP auto-trigger để tránh getDisplayMedia
        // popup. Show prompt info 1 lần. Poll loop sẽ retry.
        if (!NS.STATE.extReady) {
            if (!NS.STATE._extPromptShown) {
                NS.STATE._extPromptShown = true;
                if (NS.STATE.extOutdated) NS._showExtPrompt('outdated');
                else if (!NS.STATE.extVersion) NS._showExtPrompt('missing');
            }
            return;
        }

        NS.STATE.autoSnapStarting = true;
        console.log('[snap] auto-enabling live capture (extension ready, no popup)');
        try {
            await NS._enableEmbeddedLiveCapture();
        } catch (e) {
            console.warn('[snap] auto-enable failed:', e?.message);
            NS.STATE.autoSnapStarting = false;
        }
    };
})();
