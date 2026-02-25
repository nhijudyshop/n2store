/**
 * Tab Social Orders - Modal Module
 * Create/Edit order modal functionality
 */

// ===== MODAL STATE =====
let isEditMode = false;
let currentOrderProducts = [];

// ===== MOCK PRODUCTS FOR SEARCH =====
const MOCK_PRODUCTS = [
    { productId: 'p1', name: 'Áo thun trắng', code: 'AT001', price: 150000 },
    { productId: 'p2', name: 'Quần jean xanh', code: 'QJ002', price: 350000 },
    { productId: 'p3', name: 'Váy hoa', code: 'VH003', price: 450000 },
    { productId: 'p4', name: 'Giày sneaker', code: 'GS004', price: 890000 },
    { productId: 'p5', name: 'Túi xách', code: 'TX005', price: 550000 },
    { productId: 'p6', name: 'Ví da', code: 'VD006', price: 250000 },
    { productId: 'p7', name: 'Áo khoác', code: 'AK007', price: 750000 },
    { productId: 'p8', name: 'Áo sơ mi trắng', code: 'ASM008', price: 280000 },
    { productId: 'p9', name: 'Quần tây đen', code: 'QT009', price: 420000 },
    { productId: 'p10', name: 'Đầm maxi', code: 'DM010', price: 680000 },
];

// ===== OPEN MODAL =====
function openCreateOrderModal() {
    isEditMode = false;
    currentOrderProducts = [];

    // Reset form
    document.getElementById('orderForm')?.reset();
    document.getElementById('orderId').value = '';
    document.getElementById('orderProducts').value = '[]';
    document.getElementById('selectedPostId').value = '';
    document.getElementById('selectedPostThumbnail').value = '';

    // Hide post preview
    const preview = document.getElementById('selectedPostPreview');
    if (preview) {
        preview.style.display = 'none';
    }

    // Set default source to Facebook Post
    const orderSourceSelect = document.getElementById('orderSource');
    if (orderSourceSelect) {
        orderSourceSelect.value = 'facebook_post';
    }

    // Update title
    const title = document.getElementById('orderModalTitle');
    if (title) {
        title.innerHTML = '<i class="fas fa-plus-circle"></i> Tạo đơn hàng mới';
    }

    // Clear products list
    renderOrderProducts();
    updateProductsSummary();

    // Show modal
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.add('show');
    }
}

function openEditOrderModal(orderId) {
    isEditMode = true;

    const order = SocialOrderState.orders.find((o) => o.id === orderId);
    if (!order) {
        showNotification('Không tìm thấy đơn hàng', 'error');
        return;
    }

    SocialOrderState.currentEditingOrder = order;
    currentOrderProducts = [...(order.products || [])];

    // Fill form
    document.getElementById('orderId').value = order.id;
    document.getElementById('customerName').value = order.customerName || '';
    document.getElementById('customerPhone').value = order.phone || '';
    document.getElementById('customerAddress').value = order.address || '';
    document.getElementById('postUrl').value = order.postUrl || '';
    document.getElementById('orderSource').value = order.source || 'manual';
    document.getElementById('orderNote').value = order.note || '';
    document.getElementById('orderProducts').value = JSON.stringify(order.products || []);

    // Update title
    const title = document.getElementById('orderModalTitle');
    if (title) {
        title.innerHTML = `<i class="fas fa-edit"></i> Sửa đơn hàng ${order.id}`;
    }

    // Render products
    renderOrderProducts();
    updateProductsSummary();

    // Show modal
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeOrderModal() {
    const modal = document.getElementById('orderModalOverlay');
    if (modal) {
        modal.classList.remove('show');
    }

    // Clear search results
    const searchResults = document.getElementById('productSearchResults');
    if (searchResults) {
        searchResults.classList.remove('show');
        searchResults.innerHTML = '';
    }

    SocialOrderState.currentEditingOrder = null;
    currentOrderProducts = [];
}

// ===== PRODUCT SEARCH =====
function searchProducts() {
    const input = document.getElementById('productSearchInput');
    const resultsContainer = document.getElementById('productSearchResults');

    if (!input || !resultsContainer) return;

    const term = input.value.toLowerCase().trim();

    if (term.length < 1) {
        resultsContainer.classList.remove('show');
        resultsContainer.innerHTML = '';
        return;
    }

    // Search mock products
    const results = MOCK_PRODUCTS.filter(
        (p) => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
    ).slice(0, 5);

    if (results.length === 0) {
        resultsContainer.innerHTML =
            '<div class="product-search-item" style="color: #9ca3af;">Không tìm thấy sản phẩm</div>';
    } else {
        resultsContainer.innerHTML = results
            .map(
                (p) => `
            <div class="product-search-item" onclick="addProductToOrder('${p.productId}')">
                <div>
                    <div style="font-weight: 500;">${p.name}</div>
                    <div style="font-size: 11px; color: #6b7280;">${p.code}</div>
                </div>
                <div style="font-weight: 600; color: #8b5cf6;">${formatCurrency(p.price)}</div>
            </div>
        `
            )
            .join('');
    }

    resultsContainer.classList.add('show');
}

function addProductToOrder(productId) {
    const product = MOCK_PRODUCTS.find((p) => p.productId === productId);
    if (!product) return;

    // Check if already in list
    const existing = currentOrderProducts.find((p) => p.productId === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        currentOrderProducts.push({
            ...product,
            quantity: 1,
        });
    }

    // Clear search
    document.getElementById('productSearchInput').value = '';
    document.getElementById('productSearchResults').classList.remove('show');

    // Re-render
    renderOrderProducts();
    updateProductsSummary();
}

function removeProductFromOrder(productId) {
    currentOrderProducts = currentOrderProducts.filter((p) => p.productId !== productId);
    renderOrderProducts();
    updateProductsSummary();
}

function updateProductQuantity(productId, quantity) {
    const product = currentOrderProducts.find((p) => p.productId === productId);
    if (product) {
        product.quantity = Math.max(1, parseInt(quantity) || 1);
    }
    updateProductsSummary();
}

// ===== RENDER PRODUCTS IN MODAL =====
function renderOrderProducts() {
    const container = document.getElementById('orderProductsList');
    if (!container) return;

    if (currentOrderProducts.length === 0) {
        container.innerHTML = `
            <div class="products-empty">
                <i class="fas fa-shopping-basket"></i>
                <p>Chưa có sản phẩm. Tìm kiếm để thêm.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentOrderProducts
        .map(
            (p) => `
        <div class="product-item">
            <div class="product-item-info">
                <div class="product-item-name">${p.name}</div>
                <div class="product-item-code">${p.code}</div>
            </div>
            <div class="product-item-qty">
                <span>x</span>
                <input type="number" 
                       min="1" 
                       value="${p.quantity}" 
                       onchange="updateProductQuantity('${p.productId}', this.value)"
                       style="width: 50px; text-align: center;">
            </div>
            <div class="product-item-price">${formatCurrency(p.price * p.quantity)}</div>
            <button class="product-item-remove" onclick="removeProductFromOrder('${p.productId}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `
        )
        .join('');
}

function updateProductsSummary() {
    const totalQty = currentOrderProducts.reduce((sum, p) => sum + p.quantity, 0);
    const totalAmount = currentOrderProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);

    const qtyEl = document.getElementById('summaryQuantity');
    const totalEl = document.getElementById('summaryTotal');

    if (qtyEl) qtyEl.textContent = totalQty + ' cái';
    if (totalEl) totalEl.textContent = formatCurrency(totalAmount);
}

// ===== SAVE ORDER =====
function saveOrder() {
    const customerName = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    const postUrl = document.getElementById('postUrl').value.trim();
    const source = document.getElementById('orderSource').value;
    const note = document.getElementById('orderNote').value.trim();
    const orderId = document.getElementById('orderId').value;

    // Validation
    if (!customerName) {
        showNotification('Vui lòng nhập tên khách hàng', 'error');
        document.getElementById('customerName').focus();
        return;
    }

    if (!phone) {
        showNotification('Vui lòng nhập số điện thoại', 'error');
        document.getElementById('customerPhone').focus();
        return;
    }

    // Calculate totals
    const totalQuantity = currentOrderProducts.reduce((sum, p) => sum + p.quantity, 0);
    const totalAmount = currentOrderProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);

    // Generate post label from URL
    let postLabel = '';
    if (postUrl) {
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const sourceLabel =
            source === 'facebook_post'
                ? 'FB'
                : source === 'instagram'
                  ? 'IG'
                  : source === 'tiktok'
                    ? 'TT'
                    : 'Post';
        postLabel = `${sourceLabel} ${dateStr}`;
    }

    if (isEditMode && orderId) {
        // Update existing order
        const orderIndex = SocialOrderState.orders.findIndex((o) => o.id === orderId);
        if (orderIndex > -1) {
            const existingOrder = SocialOrderState.orders[orderIndex];
            SocialOrderState.orders[orderIndex] = {
                ...existingOrder,
                customerName,
                phone,
                address,
                postUrl,
                postLabel,
                source,
                products: [...currentOrderProducts],
                totalQuantity,
                totalAmount,
                note,
                updatedAt: Date.now(),
            };
            showNotification('Đã cập nhật đơn hàng', 'success');
        }
    } else {
        // Create new order
        const newOrder = {
            id: generateOrderId(),
            stt: SocialOrderState.orders.length + 1,
            customerName,
            phone,
            address,
            postUrl,
            postLabel,
            source,
            products: [...currentOrderProducts],
            totalQuantity,
            totalAmount,
            tags: [],
            status: 'draft',
            note,
            pageId: '',
            psid: '',
            conversationId: '',
            assignedUserId: '',
            assignedUserName: '',
            createdBy: 'admin',
            createdByName: 'Admin',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        SocialOrderState.orders.unshift(newOrder);
        showNotification('Đã tạo đơn hàng mới', 'success');
    }

    // Close modal and refresh
    closeOrderModal();
    performTableSearch();
}

// ===== CLOSE MODAL ON OUTSIDE CLICK =====
document.addEventListener('click', function (e) {
    const modalOverlay = document.getElementById('orderModalOverlay');
    if (e.target === modalOverlay) {
        closeOrderModal();
    }

    // Close product search results when clicking outside
    const searchResults = document.getElementById('productSearchResults');
    const searchInput = document.getElementById('productSearchInput');
    if (searchResults && !searchResults.contains(e.target) && e.target !== searchInput) {
        searchResults.classList.remove('show');
    }
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function (e) {
    // ESC to close modal
    if (e.key === 'Escape') {
        closeOrderModal();
        closeTagModal();
        closeConfirmDeleteModal();
    }
});

// ===== FACEBOOK POST SELECTION =====
let cachedPosts = [];
let filteredPosts = [];
const BASE_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const PAGE_ID = '270136663390370'; // NhiJudy Store

async function openPostSelectionModal() {
    const modal = document.getElementById('postSelectionModal');
    if (modal) {
        modal.classList.add('show');
    }

    // Show loading
    document.getElementById('postLoading').style.display = 'flex';
    document.getElementById('postList').innerHTML = '';

    // Load posts if not cached
    if (cachedPosts.length === 0) {
        await fetchFacebookPosts();
    } else {
        renderPostList(cachedPosts);
    }
}

function closePostSelectionModal() {
    const modal = document.getElementById('postSelectionModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function fetchFacebookPosts() {
    try {
        // Get JWT token from "Kỹ Thuật NJD" account specifically
        let jwtToken = null;
        if (window.pancakeTokenManager) {
            // Get all accounts and find "Kỹ Thuật NJD"
            const accounts = window.pancakeTokenManager.getAllAccounts();
            for (const [accountId, account] of Object.entries(accounts)) {
                if (account.name === 'Kỹ Thuật NJD') {
                    jwtToken = account.token;
                    console.log('[SOCIAL-POST] Using token from account:', account.name);
                    break;
                }
            }

            // Fallback to active account if "Kỹ Thuật NJD" not found
            if (!jwtToken) {
                console.log('[SOCIAL-POST] Account "Kỹ Thuật NJD" not found, using active account');
                jwtToken = await window.pancakeTokenManager.getToken();
            }
        }

        if (!jwtToken) {
            document.getElementById('postLoading').style.display = 'none';
            document.getElementById('postList').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
                    <p>Chưa đăng nhập Pancake. Vui lòng cài đặt JWT token trong tab Quản Lý Đơn Hàng.</p>
                </div>
            `;
            return;
        }

        // Fetch posts via Cloudflare worker
        // Note: access_token must be passed in URL for Pancake API, jwt is for cloudflare worker headers
        const url = `${BASE_URL}/api/pancake-direct/pages/posts?types=&current_count=0&page_id=${PAGE_ID}&jwt=${encodeURIComponent(jwtToken)}&page_ids=${PAGE_ID}&access_token=${encodeURIComponent(jwtToken)}`;

        console.log('[SOCIAL-POST] Fetching posts from:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success && result.data) {
            cachedPosts = result.data;
            filteredPosts = cachedPosts;
            renderPostList(cachedPosts);
            console.log('[SOCIAL-POST] Loaded', cachedPosts.length, 'posts');
        } else {
            throw new Error(result.message || 'Failed to load posts');
        }

    } catch (error) {
        console.error('[SOCIAL-POST] Error fetching posts:', error);
        document.getElementById('postLoading').style.display = 'none';
        document.getElementById('postList').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
                <p>Không thể tải danh sách bài viết. Vui lòng thử lại.</p>
                <p style="font-size: 11px; color: #6b7280; margin-top: 8px;">${error.message}</p>
            </div>
        `;
    }
}

function renderPostList(posts) {
    document.getElementById('postLoading').style.display = 'none';

    if (!posts || posts.length === 0) {
        document.getElementById('postList').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #6b7280;">
                <i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 12px;"></i>
                <p>Không có bài viết nào.</p>
            </div>
        `;
        return;
    }

    const html = posts.map(post => {
        // Get thumbnail
        const thumbnail = post.attachments?.data?.[0]?.url || null;
        const hasMultipleImages = (post.attachments?.data?.length || 0) > 1;

        // Get message/title
        let title = post.message || 'Không có tiêu đề';
        if (title.length > 80) {
            title = title.substring(0, 80) + '...';
        }

        // Format date
        const date = new Date(post.inserted_at);
        const dateStr = date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get post type icon
        let typeIcon = '';
        let typeLabel = '';
        switch (post.type) {
            case 'livestream':
                typeIcon = '<i class="fas fa-video"></i>';
                typeLabel = 'Live';
                break;
            case 'video':
                typeIcon = '<i class="fas fa-play"></i>';
                typeLabel = 'Video';
                break;
            case 'photo':
                typeIcon = '<i class="fas fa-image"></i>';
                typeLabel = 'Ảnh';
                break;
            default:
                typeIcon = '<i class="fas fa-file-alt"></i>';
                typeLabel = 'Text';
        }

        // Get post URL
        const postUrl = post.attachments?.target?.url || `https://www.facebook.com/${post.id}`;

        // Build thumbnail proxy URL
        const thumbnailProxyUrl = thumbnail ? `${BASE_URL}/api/image-proxy?url=${encodeURIComponent(thumbnail)}` : '';

        return `
            <div class="post-item" onclick="selectPost('${post.id}', '${postUrl.replace(/'/g, "\\'")}', '${title.replace(/'/g, "\\'")}', '${thumbnailProxyUrl.replace(/'/g, "\\'")}')">
                <div class="post-thumbnail">
                    ${thumbnail
                        ? `<img src="${thumbnailProxyUrl}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='<i class=\\'fas fa-image no-image\\'></i>';">`
                        : '<i class="fas fa-image no-image"></i>'
                    }
                    ${hasMultipleImages ? `<span class="post-type-icon">+${post.attachments.data.length - 1}</span>` : ''}
                    ${post.type === 'livestream' || post.type === 'video' ? `<span class="post-type-icon">${typeIcon}</span>` : ''}
                </div>
                <div class="post-info">
                    <div class="post-title">${title}</div>
                    <div class="post-date">${dateStr} ${timeStr}</div>
                    <div class="post-meta">
                        ${post.phone_number_count > 0 ? `<span class="post-meta-item"><i class="fas fa-phone"></i> ${post.phone_number_count}</span>` : ''}
                        ${post.comment_count > 0 ? `<span class="post-meta-item"><i class="fas fa-comment"></i> ${formatNumber(post.comment_count)}</span>` : ''}
                        ${post.share_count > 0 ? `<span class="post-meta-item"><i class="fas fa-share"></i> ${post.share_count}</span>` : ''}
                    </div>
                </div>
                <div class="post-stats">
                    <button class="post-copy-btn" onclick="event.stopPropagation(); copyPostId('${post.id}')" title="Sao chép ID">
                        <i class="far fa-copy"></i> Sao chép ID
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('postList').innerHTML = html;
}

function filterPosts() {
    const input = document.getElementById('postFilterInput');
    const term = input.value.toLowerCase().trim();

    if (!term) {
        filteredPosts = cachedPosts;
    } else {
        filteredPosts = cachedPosts.filter(post => {
            const message = (post.message || '').toLowerCase();
            return message.includes(term);
        });
    }

    renderPostList(filteredPosts);
}

function selectPost(postId, postUrl, postTitle, thumbnailUrl) {
    // Update the form fields
    document.getElementById('postUrl').value = postUrl;
    document.getElementById('selectedPostId').value = postId;
    document.getElementById('selectedPostThumbnail').value = thumbnailUrl || '';

    // Show preview
    const preview = document.getElementById('selectedPostPreview');
    const thumbImg = document.getElementById('selectedPostThumb');
    const titleEl = document.getElementById('selectedPostTitle');

    if (preview && thumbImg && titleEl) {
        if (thumbnailUrl) {
            thumbImg.src = thumbnailUrl;
            thumbImg.style.display = 'block';
        } else {
            thumbImg.style.display = 'none';
        }
        titleEl.textContent = postTitle || 'Bài viết đã chọn';
        preview.style.display = 'flex';
    }

    // Close modal
    closePostSelectionModal();

    // Show notification
    if (typeof showNotification === 'function') {
        showNotification('Đã chọn bài viết', 'success');
    }
}

function clearSelectedPost(event) {
    if (event) {
        event.stopPropagation();
    }

    // Clear form fields
    document.getElementById('postUrl').value = '';
    document.getElementById('selectedPostId').value = '';
    document.getElementById('selectedPostThumbnail').value = '';

    // Hide preview
    const preview = document.getElementById('selectedPostPreview');
    if (preview) {
        preview.style.display = 'none';
    }
}

function copyPostId(postId) {
    navigator.clipboard.writeText(postId).then(() => {
        if (typeof showNotification === 'function') {
            showNotification('Đã sao chép ID: ' + postId, 'success');
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// ===== EXPORTS =====
window.openCreateOrderModal = openCreateOrderModal;
window.openEditOrderModal = openEditOrderModal;
window.closeOrderModal = closeOrderModal;
window.searchProducts = searchProducts;
window.addProductToOrder = addProductToOrder;
window.removeProductFromOrder = removeProductFromOrder;
window.updateProductQuantity = updateProductQuantity;
window.saveOrder = saveOrder;
window.openPostSelectionModal = openPostSelectionModal;
window.closePostSelectionModal = closePostSelectionModal;
window.filterPosts = filterPosts;
window.selectPost = selectPost;
window.clearSelectedPost = clearSelectedPost;
window.copyPostId = copyPostId;
