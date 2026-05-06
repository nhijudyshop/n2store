// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 CHAT IMAGES - Image / Video upload & preview
   ===================================================== */

// Pending media (image & video) for upload — same queue, gửi qua cùng pdm.uploadMedia.
let _pendingImages = [];

// Cap kích thước video Pancake chấp nhận. Pancake upload_contents giới hạn ~25MB,
// để an toàn cap ở 20MB và báo user nếu vượt.
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Get pending images for upload
 */
window.getPendingImages = function () {
    return [..._pendingImages];
};

/**
 * Clear all image previews.
 * Revoke blob URLs của video previews để tránh giữ memory sau khi gửi xong.
 */
window.clearImagePreviews = function () {
    _pendingImages = [];
    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;
    container.querySelectorAll('.video-preview-item').forEach((el) => {
        const u = el.dataset.blobUrl;
        if (u) {
            try {
                URL.revokeObjectURL(u);
            } catch (e) {}
        }
    });
    container.innerHTML = '';
};

/**
 * Add image hoặc video to preview (from file input)
 * @param {File} file
 */
window.addImageToPreview = function (file) {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return;

    if (isVideo) {
        if (file.size > VIDEO_MAX_BYTES) {
            const mb = (file.size / 1024 / 1024).toFixed(1);
            const cap = (VIDEO_MAX_BYTES / 1024 / 1024).toFixed(0);
            window.notificationManager?.warning?.(
                `Video quá lớn (${mb}MB) — Pancake giới hạn ${cap}MB. Giảm chất lượng/độ dài rồi gửi lại.`,
                5000
            );
            return;
        }
        _addVideoToPreview(file);
        return;
    }

    // Image: Compress if needed (max 500KB for Pancake)
    const maxSize = 500 * 1024;
    if (file.size > maxSize && window.compressImage) {
        window
            .compressImage(file, maxSize)
            .then((result) => _addToPreview(result.blob))
            .catch((err) => {
                console.warn('[Chat] Compress failed, sending original:', err);
                _addToPreview(file);
            });
    } else {
        _addToPreview(file);
    }
};

// Backward-compat alias — clearer name khi user gọi manually.
window.addMediaToPreview = window.addImageToPreview;

function _addToPreview(file) {
    _pendingImages.push(file);

    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;

    const idx = _pendingImages.length - 1;
    const reader = new FileReader();
    reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.dataset.index = idx;
        div.innerHTML = `
            <img src="${e.target.result}" alt="Preview">
            <button class="remove-preview" onclick="window.removeImagePreview(${idx})">×</button>
        `;
        container.appendChild(div);
    };
    reader.readAsDataURL(file);
}

function _addVideoToPreview(file) {
    _pendingImages.push(file);
    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;
    const idx = _pendingImages.length - 1;
    const blobUrl = URL.createObjectURL(file);
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    const div = document.createElement('div');
    div.className = 'image-preview-item video-preview-item';
    div.dataset.index = idx;
    div.innerHTML = `
        <video src="${blobUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:6px;background:#000;"></video>
        <span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;pointer-events:none;">▶ ${sizeMb}MB</span>
        <button class="remove-preview" onclick="window.removeImagePreview(${idx})">×</button>
    `;
    container.appendChild(div);
    // Revoke blob URL khi user remove preview hoặc clear all.
    div.dataset.blobUrl = blobUrl;
}

/**
 * Fetch image URL as blob, with CF Worker proxy fallback for CORS
 */
const IMAGE_PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/image-proxy';

async function _fetchImageAsBlob(imgUrl) {
    // Skip data URLs - already a blob-like format
    if (imgUrl.startsWith('data:')) {
        const res = await fetch(imgUrl);
        return res.blob();
    }

    // Try direct fetch first
    try {
        const res = await fetch(imgUrl, { mode: 'cors' });
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) return blob;
    } catch (_) {
        /* CORS blocked, try proxy */
    }

    // Fallback: CF Worker image proxy
    try {
        const proxyUrl = `${IMAGE_PROXY_URL}?url=${encodeURIComponent(imgUrl)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(res.status);
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) return blob;
    } catch (err) {
        console.warn('[Chat] Cannot fetch image via proxy:', imgUrl, err);
    }

    return null;
}

/**
 * Remove image / video from preview.
 * Revoke blob URLs của video preview cũ để tránh memory leak khi remove giữa chừng.
 */
window.removeImagePreview = function (index) {
    _pendingImages.splice(index, 1);

    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;

    // Revoke any existing blob URLs trước khi xoá DOM cũ.
    container.querySelectorAll('.video-preview-item').forEach((el) => {
        const u = el.dataset.blobUrl;
        if (u) {
            try {
                URL.revokeObjectURL(u);
            } catch (e) {}
        }
    });
    container.innerHTML = '';

    // Re-render với cùng helper functions để giữ logic single-source.
    _pendingImages.forEach((file, i) => {
        if (file.type?.startsWith?.('video/')) {
            // Tạm thời tăng index của file rồi revert — _addVideoToPreview push vào array.
            // Đơn giản hơn: render inline không gọi helper.
            const blobUrl = URL.createObjectURL(file);
            const sizeMb = (file.size / 1024 / 1024).toFixed(1);
            const div = document.createElement('div');
            div.className = 'image-preview-item video-preview-item';
            div.dataset.index = i;
            div.dataset.blobUrl = blobUrl;
            div.innerHTML = `
                <video src="${blobUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:6px;background:#000;"></video>
                <span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;pointer-events:none;">▶ ${sizeMb}MB</span>
                <button class="remove-preview" onclick="window.removeImagePreview(${i})">×</button>
            `;
            container.appendChild(div);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'image-preview-item';
            div.dataset.index = i;
            div.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button class="remove-preview" onclick="window.removeImagePreview(${i})">×</button>
            `;
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
};

// File input change handler
document.addEventListener('DOMContentLoaded', function () {
    // Bind file input (may be created later by HTML)
    document.addEventListener('change', function (e) {
        if (e.target.id === 'chatImageInput') {
            const files = e.target.files;
            for (let i = 0; i < files.length; i++) {
                window.addImageToPreview(files[i]);
            }
            e.target.value = ''; // Reset for re-select
        }
    });

    // Paste image handler on chat input
    document.addEventListener('paste', function (e) {
        // Only handle paste when chat modal is open
        const chatModal = document.getElementById('chatModal');
        if (!chatModal || chatModal.style.display === 'none') return;

        const clipData = e.clipboardData;
        if (!clipData) return;

        // Strategy 1: Direct image blob (screenshot, some copy-image)
        if (clipData.items) {
            for (const item of clipData.items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (blob) window.addImageToPreview(blob);
                    return;
                }
            }
        }

        // Strategy 2: clipboardData.files (copy file from Finder/Explorer)
        if (clipData.files && clipData.files.length > 0) {
            for (const file of clipData.files) {
                if (file.type.startsWith('image/')) {
                    e.preventDefault();
                    window.addImageToPreview(file);
                    return;
                }
            }
        }

        // Strategy 3: HTML with <img> tag (copy image from webpage)
        const html = clipData.getData('text/html');
        if (html) {
            const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch && imgMatch[1]) {
                e.preventDefault();
                const imgUrl = imgMatch[1];
                // Try direct fetch first, fallback to CF Worker proxy on CORS error
                _fetchImageAsBlob(imgUrl).then((blob) => {
                    if (blob) {
                        const file = new File([blob], 'pasted-image.jpg', { type: blob.type });
                        window.addImageToPreview(file);
                    }
                });
                return;
            }
        }
    });

    // Fallback: Cmd/Ctrl+V anywhere inside chat modal → read clipboard via async API
    // (paste event only fires when an editable element is focused)
    document.addEventListener('keydown', async function (e) {
        if (!((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V'))) return;
        const chatModal = document.getElementById('chatModal');
        if (!chatModal || chatModal.style.display === 'none') return;
        // Skip if focus is on an editable element — native paste handler covers it
        const ae = document.activeElement;
        const tag = ae?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT' || ae?.isContentEditable) return;
        if (!navigator.clipboard?.read) return;
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imgType = item.types.find((t) => t.startsWith('image/'));
                if (imgType) {
                    const blob = await item.getType(imgType);
                    const file = new File([blob], 'pasted-image.png', { type: blob.type });
                    window.addImageToPreview(file);
                    // Focus input after paste so user can type caption
                    document.getElementById('chatInput')?.focus();
                    return;
                }
            }
        } catch (err) {
            console.warn('[Chat] Clipboard read failed:', err);
        }
    });
});
