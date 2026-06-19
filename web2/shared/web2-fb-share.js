// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — handoff "Đăng lên FB": chuyển ảnh + caption từ 1 trang sang trang Đăng bài.
// =====================================================================
// Web 2.0 — Web2FbShare: NGUỒN DUY NHẤT cho luồng "tạo nội dung ở trang A → đăng ở fb-posts".
//   Trang nguồn (product-card / photo-studio / …) gọi Web2FbShare.send({images, caption}).
//   Trang fb-posts (composer) gọi Web2FbShare.consume() để nạp vào form.
//
// images: mảng phần tử { url } (URL công khai — dùng thẳng) HOẶC { dataUrl } (ảnh canvas/base64
//   — fb-posts sẽ tự upload lên imgbb để có URL công khai cho FB pull). caption: chuỗi (tuỳ chọn).
// Truyền qua sessionStorage (one-shot, tự xoá khi consume) → không lộ ra URL/lịch sử.
// KHÔNG tự chọn page, KHÔNG tự đăng — chỉ prefill, user vẫn chọn page + bấm Đăng.
// =====================================================================
(function () {
    'use strict';

    var KEY = 'web2_fb_share_payload';

    // Mọi trang Web 2.0 đều ở /web2/<name>/ → trang đăng bài là ../fb-posts/index.html
    function fbPostsUrl() {
        return '../fb-posts/index.html?from=share';
    }

    window.Web2FbShare = {
        KEY: KEY,

        /**
         * Gửi nội dung sang trang Đăng bài rồi điều hướng tới đó.
         * @param {{images?:Array<{url?:string,dataUrl?:string,name?:string}>, caption?:string, source?:string, navigate?:boolean, target?:string}} opts
         */
        send: function (opts) {
            opts = opts || {};
            var images = (opts.images || []).filter(Boolean);
            var payload = {
                images: images,
                caption: opts.caption || '',
                source: opts.source || '',
                ts: Date.now(),
            };
            var stored = false;
            try {
                sessionStorage.setItem(KEY, JSON.stringify(payload));
                stored = true;
            } catch (e) {
                // dataURL quá lớn vượt quota → chỉ giữ ảnh có URL công khai + caption.
                try {
                    sessionStorage.setItem(
                        KEY,
                        JSON.stringify({
                            images: images.filter(function (i) {
                                return i.url;
                            }),
                            caption: payload.caption,
                            source: payload.source,
                            ts: payload.ts,
                            truncated: true,
                        })
                    );
                    stored = true;
                } catch (_) {
                    stored = false;
                }
                if (window.notificationManager)
                    window.notificationManager.warning(
                        'Ảnh quá lớn để chuyển tự động — sang trang Đăng bài thêm ảnh thủ công nhé.'
                    );
            }
            if (opts.navigate === false) return stored;
            location.href = opts.target || fbPostsUrl();
            return stored;
        },

        /** Có payload đang chờ không (không xoá). */
        has: function () {
            try {
                return !!sessionStorage.getItem(KEY);
            } catch (e) {
                return false;
            }
        },

        /** Đọc + xoá payload (one-shot). null nếu không có. */
        consume: function () {
            var raw;
            try {
                raw = sessionStorage.getItem(KEY);
            } catch (e) {
                return null;
            }
            if (!raw) return null;
            try {
                sessionStorage.removeItem(KEY);
            } catch (_) {}
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },
    };
})();
