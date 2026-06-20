// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Trang "Đếm SP qua camera" — host MỎNG. Toàn bộ engine (camera, MediaPipe,
// vòng đếm, ổn định số) nằm trong shared Web2ProductCounter — trang chỉ mount.
// Pattern giống photo-studio: window.ProductCounterPage.init() gọi từ HTML.
// =====================================================================
(function (global) {
    'use strict';

    const ProductCounterPage = {
        _ctrl: null,
        _lifecycleBound: false,

        init() {
            if (!global.Web2ProductCounter) {
                console.warn('[ProductCounter] Web2ProductCounter chưa load');
                global.notificationManager?.show?.(
                    'Thiếu module đếm sản phẩm (web2-product-counter.js).',
                    'error'
                );
                return;
            }
            // Nhúng widget dùng chung vào trang. Engine lazy-load MediaPipe khi
            // user bấm "Bật camera" → mở trang không tải gì nặng.
            this._ctrl = global.Web2ProductCounter.mount('#pcMount', {
                facingMode: 'environment',
                excludePerson: true,
                onCount: (n) => {
                    // Đồng bộ tiêu đề tab cho dễ liếc khi đang live.
                    document.title =
                        n > 0 ? `(${n}) Đếm SP — Web 2.0` : 'Đếm SP qua camera — Web 2.0';
                },
            });

            // Giải phóng camera khi rời trang/ẩn tab — tránh leak MediaStream
            // (LED/sensor còn sáng tới khi GC). #pcBack dùng history.back()/location
            // nên không có unmount tường minh; bắt qua pagehide + visibilitychange.
            this._bindLifecycle();
        },

        // Dừng engine (cancel RAF + stopTracks) an toàn, nuốt lỗi.
        _stop() {
            try {
                this._ctrl?.stop?.();
            } catch (_) {
                /* no-op */
            }
        },

        _bindLifecycle() {
            if (this._lifecycleBound) return;
            this._lifecycleBound = true;
            const stopCam = () => this._stop();
            global.addEventListener('pagehide', stopCam);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stopCam();
            });
        },
    };

    global.ProductCounterPage = ProductCounterPage;
})(typeof window !== 'undefined' ? window : this);
