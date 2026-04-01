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
        // Only handle paste when chat modal is open and target is chat input
        const chatModal = document.getElementById('chatModal');
        if (!chatModal || chatModal.style.display === 'none') return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    window.addImageToPreview(blob);
                }
                return;
            }
        }
    });
});

