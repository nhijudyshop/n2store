// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// IMAGE UPLOAD - INVENTORY TRACKING
// Phase 3: Firebase Storage image upload
// =====================================================

/**
 * Upload image to Firebase Storage via server endpoint (bypasses CORS)
 * @param {File} file - Image file
 * @param {string} path - Storage path (e.g., "invoices")
 * @returns {Promise<string>} Download URL
 */
async function uploadImage(file, path) {
    // Validate file
    if (!APP_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('Loai file khong hop le');
    }

    if (file.size > APP_CONFIG.MAX_IMAGE_SIZE) {
        throw new Error('File qua lon (max 5MB)');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${timestamp}_${random}.${extension}`;

    // Convert file to base64
    const base64 = await fileToBase64(file);

    // Upload via server endpoint (same server as API_BASE)
    const serverUrl =
        (typeof API_BASE !== 'undefined'
            ? API_BASE.replace('/api/v2/inventory-tracking', '')
            : 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/upload/image';

    const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image: base64,
            fileName: filename,
            folderPath: path || 'uploads',
            mimeType: file.type,
        }),
    });

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Upload failed');
    }

    console.log('[UPLOAD] Image uploaded via server:', result.url);
    return result.url;
}

/**
 * Convert File to base64 string
 * @param {File} file - File to convert
 * @returns {Promise<string>} Base64 string
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Upload multiple images
 * @param {FileList} files - Image files
 * @param {string} path - Storage path
 * @returns {Promise<string[]>} Array of download URLs
 */
async function uploadMultipleImages(files, path) {
    const urls = [];

    for (const file of files) {
        try {
            const url = await uploadImage(file, path);
            urls.push(url);
        } catch (error) {
            console.error('[UPLOAD] Error uploading file:', file.name, error);
        }
    }

    return urls;
}

/**
 * Delete image via Render server endpoint (no Firebase SDK client-side)
 * @param {string} url - Image URL
 */
async function deleteImage(url) {
    try {
        const serverUrl =
            (typeof API_BASE !== 'undefined'
                ? API_BASE.replace('/api/v2/inventory-tracking', '')
                : 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/upload/image';

        const response = await fetch(serverUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const result = await response.json();
        if (!result.success) {
            console.warn('[UPLOAD] Delete image returned:', result.message || result.error);
        } else {
            console.log('[UPLOAD] Image deleted');
        }
    } catch (error) {
        console.error('[UPLOAD] Error deleting image:', error);
    }
}

/**
 * Setup image upload area
 * @param {HTMLElement} container - Upload area container
 * @param {Function} onUpload - Callback when images uploaded
 */
function setupImageUploadArea(container, onUpload) {
    const input = container.querySelector('.image-input');
    const uploadBtn = container.querySelector('.btn-upload');
    const previewList = container.querySelector('.image-preview-list');

    if (uploadBtn && input) {
        uploadBtn.addEventListener('click', () => input.click());
    }

    if (input) {
        input.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (files.length === 0) return;

            // Show loading
            const loadingToast = window.notificationManager?.loading('Dang tai anh len...');

            try {
                const path = `invoices/${Date.now()}`;
                const urls = await uploadMultipleImages(files, path);

                if (onUpload) {
                    onUpload(urls);
                }

                // Update preview
                if (previewList) {
                    urls.forEach((url) => {
                        const preview = document.createElement('div');
                        preview.className = 'image-preview-item';
                        preview.innerHTML = `
                            <img src="${url}" alt="Preview">
                            <button type="button" class="btn-remove-image" data-url="${url}">
                                <i data-lucide="x"></i>
                            </button>
                        `;
                        previewList.appendChild(preview);
                    });
                    if (window.lucide) lucide.createIcons();
                }

                window.notificationManager?.success(`Da tai len ${urls.length} anh`);
            } catch (error) {
                window.notificationManager?.error('Khong the tai anh len');
            } finally {
                window.notificationManager?.remove(loadingToast);
                input.value = '';
            }
        });
    }
}

console.log('[UPLOAD] Image upload initialized');
