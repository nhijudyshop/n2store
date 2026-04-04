// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ORDER IMAGE GENERATOR
// Generate order confirmation image from order data
// =====================================================

class OrderImageGenerator {
    constructor() {
        this.DEBUG_MODE = true;
        this.LOGO_URL = ''; // Optional: Set your logo URL here
        this.IMAGE_WIDTH = 700;
        this.PRODUCT_IMAGE_SIZE = 60;
        this.init();
    }

    log(...args) {
        // Debug logging disabled
    }

    init() {
        this.log('🚀 OrderImageGenerator initialized');
    }

    /**
     * Generate order image from data
     * @param {Object} orderData - Order data with products
     * @param {String} messageText - Message text with placeholders replaced
     * @returns {Promise<Blob>} - Image blob
     */
    async generateOrderImage(orderData, messageText) {
        this.log('📸 Generating order image...');
        this.log('  - Order:', orderData.code);
        this.log('  - Products:', orderData.products?.length);

        try {
            // Step 1: Fetch all product images as base64 (bypass CORS)
            this.log('⬇️ Fetching product images...');
            const productsWithBase64 = await this.fetchProductImagesAsBase64(orderData.products);

            // Step 2: Create container with base64 images
            const container = this.createImageContainer(
                { ...orderData, products: productsWithBase64 },
                messageText
            );
            document.body.appendChild(container);

            // Wait a bit for rendering
            await new Promise(resolve => setTimeout(resolve, 100));

            // Generate image using html2canvas
            this.log('🎨 Rendering with html2canvas...');
            const canvas = await html2canvas(container, {
                backgroundColor: '#ffffff',
                scale: 2, // High quality
                logging: false,
                useCORS: false,
                allowTaint: true,
                proxy: null
            });

            // Remove container
            document.body.removeChild(container);

            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/png');
            });

            this.log('✅ Image generated:', blob.size, 'bytes');
            return blob;

        } catch (error) {
            this.log('❌ Error generating image:', error);
            throw error;
        }
    }

    /**
     * Fetch product images as base64 to bypass CORS
     */
    async fetchProductImagesAsBase64(products) {
        if (!products || products.length === 0) return products;

        const results = await Promise.all(
            products.map(async (product) => {
                if (!product.imageUrl) {
                    return { ...product, imageBase64: null };
                }

                try {
                    // Use Cloudflare Worker for CORS proxy
                    const proxiedUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/image-proxy?url=${encodeURIComponent(product.imageUrl)}`;

                    this.log('🔄 Fetching via Cloudflare Worker:', product.name.substring(0, 30));

                    const response = await fetch(proxiedUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'image/*'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch: ${response.status}`);
                    }

                    const blob = await response.blob();
                    const base64 = await this.blobToBase64(blob);

                    this.log('✅ Fetched image:', product.name.substring(0, 30));
                    return { ...product, imageBase64: base64 };

                } catch (error) {
                    this.log('⚠️ Failed to fetch image for:', product.name, error.message);
                    return { ...product, imageBase64: null };
                }
            })
        );

        return results;
    }

    /**
     * Convert blob to base64
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Create HTML container for image
     */
    createImageContainer(orderData, messageText) {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: ${this.IMAGE_WIDTH}px;
            background: white;
            font-family: Arial, sans-serif;
            padding: 0;
        `;

        // Parse message text to extract parts
        const messageParts = this.parseMessageText(messageText);

        container.innerHTML = `
            <div style="background: white; padding: 20px; border: 2px solid #e5e7eb;">
                <!-- Header -->
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    border: 2px solid #000;
                    margin-bottom: 0;
                    background: white;
                ">
                    <div style="font-weight: bold; font-size: 18px;">[LOGO]</div>
                    <div style="font-weight: bold; font-size: 16px;">ĐơN HÀNG #${orderData.code || ''}</div>
                </div>

                <!-- Greeting -->
                <div style="
                    padding: 20px;
                    border-left: 2px solid #000;
                    border-right: 2px solid #000;
                    border-bottom: 2px solid #000;
                    background: white;
                    line-height: 1.6;
                    margin-bottom: 0;
                ">
                    ${messageParts.greeting}
                </div>

                <!-- Products -->
                ${this.generateProductsHTML(orderData.products)}

                <!-- Footer -->
                <div style="
                    padding: 20px;
                    border-left: 2px solid #000;
                    border-right: 2px solid #000;
                    border-bottom: 2px solid #000;
                    background: white;
                    line-height: 1.8;
                ">
                    <div style="font-weight: bold; margin-bottom: 5px;">Tổng: ${this.formatCurrency(orderData.totalAmount)}</div>
                    <div style="margin-bottom: 5px;">Địa chỉ: ${orderData.address || '(Chưa có địa chỉ)'}</div>
                    ${messageParts.signature ? `<div>${messageParts.signature}</div>` : ''}
                </div>
            </div>
        `;

        return container;
    }

    /**
     * Generate products HTML
     */
    generateProductsHTML(products) {
        if (!products || products.length === 0) {
            return `
                <div style="
                    padding: 20px;
                    border-left: 2px solid #000;
                    border-right: 2px solid #000;
                    border-bottom: 2px solid #000;
                    background: white;
                ">
                    (Chưa có sản phẩm)
                </div>
            `;
        }

        const productsHTML = products.map((product, index) => {
            const imageBase64 = product.imageBase64; // Use base64 instead of URL
            const productName = product.name || 'Sản phẩm';
            const quantity = product.quantity || 0;
            const total = product.total || 0;

            return `
                <div style="
                    display: flex;
                    align-items: center;
                    padding: 15px 20px;
                    border-left: 2px solid #000;
                    border-right: 2px solid #000;
                    ${index === products.length - 1 ? '' : 'border-bottom: 1px solid #e5e7eb;'}
                    background: white;
                    gap: 15px;
                ">
                    ${imageBase64 ? `
                        <img
                            src="${imageBase64}"
                            style="
                                width: ${this.PRODUCT_IMAGE_SIZE}px;
                                height: ${this.PRODUCT_IMAGE_SIZE}px;
                                object-fit: cover;
                                border-radius: 4px;
                                flex-shrink: 0;
                                border: 1px solid #e5e7eb;
                            "
                        />
                    ` : `
                        <div style="
                            width: ${this.PRODUCT_IMAGE_SIZE}px;
                            height: ${this.PRODUCT_IMAGE_SIZE}px;
                            background: #f3f4f6;
                            border-radius: 4px;
                            flex-shrink: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #9ca3af;
                            font-size: 12px;
                        ">[IMG]</div>
                    `}
                    <div style="flex: 1; font-size: 14px; line-height: 1.4;">
                        ${productName}<br>
                        <span style="color: #6b7280;">x${quantity} = ${this.formatCurrency(total)}</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="border-left: 2px solid #000; border-right: 2px solid #000; border-bottom: 2px solid #000; margin-bottom: 0;">
                ${productsHTML}
            </div>
        `;
    }

    /**
     * Parse message text to extract greeting and signature
     */
    parseMessageText(text) {
        // Split by product placeholder pattern
        const parts = text.split(/- .+? x\d+ = .+?₫/g);

        // If we have parts, first part is greeting, last part contains footer
        let greeting = '';
        let signature = '';

        if (parts.length > 0) {
            // First part is greeting
            greeting = parts[0].trim();

            // Remove "Em gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:" or similar
            greeting = greeting
                .replace(/Em gửi đến mình các sản phẩm.*?gồm:/gi, 'Em gửi đến mình các sản phẩm:')
                .replace(/\n\n+/g, '<br>');

            // Last part contains signature
            if (parts.length > 1) {
                const lastPart = parts[parts.length - 1];
                const signatureMatch = lastPart.match(/Nv\.\s*.+$/);
                if (signatureMatch) {
                    signature = signatureMatch[0];
                }
            }
        } else {
            // Fallback: use entire text
            greeting = text.replace(/\n/g, '<br>');
        }

        return { greeting, signature };
    }

    /**
     * Wait for all images to load
     */
    async waitForImages(container) {
        const images = container.querySelectorAll('img');
        if (images.length === 0) return;

        this.log('⏳ Waiting for', images.length, 'images to load...');

        const promises = Array.from(images).map(img => {
            return new Promise((resolve, reject) => {
                if (img.complete) {
                    resolve();
                } else {
                    img.onload = resolve;
                    img.onerror = () => {
                        this.log('⚠️ Image failed to load:', img.src);
                        // Replace with placeholder
                        img.style.display = 'none';
                        resolve(); // Continue anyway
                    };

                    // Timeout after 5 seconds
                    setTimeout(() => {
                        this.log('⏱️ Image load timeout:', img.src);
                        resolve();
                    }, 5000);
                }
            });
        });

        await Promise.all(promises);
        this.log('✅ All images loaded');
    }

    /**
     * Format currency
     */
    formatCurrency(amount) {
        const numericAmount = typeof amount === 'string'
            ? parseFloat(amount.replace(/[^\d.-]/g, ''))
            : amount;

        if (isNaN(numericAmount)) return '0₫';

        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(numericAmount);
    }
}

// =====================================================
// INITIALIZE
// =====================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderImageGenerator);
} else {
    initOrderImageGenerator();
}

function initOrderImageGenerator() {
    const orderImageGenerator = new OrderImageGenerator();
    window.orderImageGenerator = orderImageGenerator;
}
