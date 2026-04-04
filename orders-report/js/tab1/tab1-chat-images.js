// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 CHAT IMAGES - Image upload & preview
   ===================================================== */

// Pending images for upload
let _pendingImages = [];

/**
 * Get pending images for upload
 */
window.getPendingImages = function() {
    return [..._pendingImages];
};

/**
 * Clear all image previews
 */
window.clearImagePreviews = function() {
    _pendingImages = [];
    const container = document.getElementById('imagePreviewContainer');
    if (container) container.innerHTML = '';
};

/**
 * Add image to preview (from file input)
 */
window.addImageToPreview = function(file) {
    if (!file || !file.type.startsWith('image/')) return;

    // Compress if needed (max 500KB for Pancake)
    const maxSize = 500 * 1024;
    if (file.size > maxSize && window.compressImage) {
        window.compressImage(file, maxSize).then(compressed => {
            _addToPreview(compressed);
        });
    } else {
        _addToPreview(file);
    }
};

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
    } catch (_) { /* CORS blocked, try proxy */ }

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
 * Remove image from preview
 */
window.removeImagePreview = function(index) {
    _pendingImages.splice(index, 1);

    // Re-render all previews
    const container = document.getElementById('imagePreviewContainer');
    if (!container) return;
    container.innerHTML = '';

    _pendingImages.forEach((file, i) => {
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
document.addEventListener('DOMContentLoaded', function() {
    // Bind file input (may be created later by HTML)
    document.addEventListener('change', function(e) {
        if (e.target.id === 'chatImageInput') {
            const files = e.target.files;
            for (let i = 0; i < files.length; i++) {
                window.addImageToPreview(files[i]);
            }
            e.target.value = ''; // Reset for re-select
        }
    });

    // Paste image handler on chat input
    document.addEventListener('paste', function(e) {
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
                _fetchImageAsBlob(imgUrl).then(blob => {
                    if (blob) {
                        const file = new File([blob], 'pasted-image.jpg', { type: blob.type });
                        window.addImageToPreview(file);
                    }
                });
                return;
            }
        }
    });
});

