/**
 * Live Comments Readonly Modal
 * Hiển thị tất cả bình luận của khách hàng từ các bài post/video live trên Facebook
 */

(function () {
    'use strict';

    const COMPANY_ID = '10037';
    const API_BASE = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Format datetime: "15/12/2025 19:36"
     */
    function formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    /**
     * Hiện toast notification
     */
    function showToast(message, type = 'info') {
        const existingToast = document.querySelector('.live-comments-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'live-comments-toast';

        const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6b7280';
        const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle';

        toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100002;
            animation: liveToastSlideUp 0.3s ease;
        `;

        if (!document.getElementById('live-comments-toast-style')) {
            const style = document.createElement('style');
            style.id = 'live-comments-toast-style';
            style.textContent = `
                @keyframes liveToastSlideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Fetch live comments từ TPOS API
     */
    async function fetchLiveCommentsByUser(pageId, postId, userId) {
        const objectId = `${COMPANY_ID}_${pageId}_${postId}`;
        const url = `${API_BASE}/api/rest/v2.0/facebookpost/${objectId}/commentsbyuser?userId=${userId}`;

        const headers = await window.tokenManager.getAuthHeader();
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Content-Type': 'application/json;IEEE754Compatible=false;charset=utf-8',
                ...headers,
                'tposappversion': '5.11.16.1'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
            items: data.Items || [],
            objectIds: data.ObjectIds || [],
            liveCampaignId: data.LiveCampaignId
        };
    }

    /**
     * Group comments theo ObjectId (post)
     */
    function groupCommentsByPost(comments) {
        const groups = {};
        comments.forEach(comment => {
            const postId = comment.ObjectId || 'unknown';
            if (!groups[postId]) {
                groups[postId] = [];
            }
            groups[postId].push(comment);
        });

        // Sort comments trong mỗi group theo thời gian
        Object.keys(groups).forEach(postId => {
            groups[postId].sort((a, b) => {
                const timeA = new Date(a.ChannelCreatedTime || a.CreatedTime);
                const timeB = new Date(b.ChannelCreatedTime || b.CreatedTime);
                return timeA - timeB;
            });
        });

        return groups;
    }

    /**
     * Tạo HTML cho modal
     */
    function createModalHTML(comments, customerName, objectIds) {
        const grouped = groupCommentsByPost(comments);
        const postCount = Object.keys(grouped).length;
        const totalComments = comments.length;

        let commentsHTML = '';

        if (totalComments === 0) {
            commentsHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                    <i class="fas fa-comment-slash" style="font-size: 48px; margin-bottom: 16px;"></i>
                    <p>Không tìm thấy bình luận nào</p>
                </div>
            `;
        } else {
            Object.keys(grouped).forEach(postId => {
                const postComments = grouped[postId];
                const shortPostId = postId.split('_').pop() || postId;

                commentsHTML += `
                    <div style="margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f0f9ff; border-radius: 8px; margin-bottom: 8px;">
                            <i class="fas fa-video" style="color: #0ea5e9;"></i>
                            <span style="font-size: 13px; color: #0369a1; font-weight: 500;">Post: ${shortPostId}</span>
                            <span style="font-size: 12px; color: #64748b;">(${postComments.length} bình luận)</span>
                        </div>
                        <div style="padding-left: 12px; border-left: 2px solid #e2e8f0;">
                `;

                postComments.forEach(comment => {
                    const message = comment.Message || comment.Data?.message || '';
                    const time = formatDateTime(comment.ChannelCreatedTime || comment.CreatedTime);
                    const isOwner = comment.IsOwner;

                    commentsHTML += `
                        <div style="padding: 10px 12px; margin-bottom: 6px; background: ${isOwner ? '#f0fdf4' : '#ffffff'}; border-radius: 8px; border: 1px solid ${isOwner ? '#bbf7d0' : '#e5e7eb'};">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                <div style="flex: 1; font-size: 14px; color: #1f2937; line-height: 1.5; word-break: break-word;">
                                    ${isOwner ? '<span style="color: #16a34a; font-weight: 500;">[Shop] </span>' : ''}${escapeHtml(message)}
                                </div>
                                <div style="font-size: 12px; color: #9ca3af; white-space: nowrap;">${time}</div>
                            </div>
                        </div>
                    `;
                });

                commentsHTML += `
                        </div>
                    </div>
                `;
            });
        }

        return `
            <div id="liveCommentsModal" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 100001;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: liveModalFadeIn 0.2s ease;
            ">
                <div style="
                    background: white;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 600px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    animation: liveModalSlideUp 0.3s ease;
                ">
                    <!-- Header -->
                    <div style="
                        padding: 20px 24px;
                        border-bottom: 1px solid #e5e7eb;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    ">
                        <div>
                            <h3 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-list-alt" style="color: #6366f1;"></i>
                                Lịch sử bình luận Live
                            </h3>
                            <p style="margin: 0; font-size: 13px; color: #6b7280;">
                                Khách hàng: <strong>${escapeHtml(customerName)}</strong>
                            </p>
                        </div>
                        <button onclick="closeLiveCommentsModal()" style="
                            background: none;
                            border: none;
                            width: 36px;
                            height: 36px;
                            border-radius: 50%;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #6b7280;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                            <i class="fas fa-times" style="font-size: 18px;"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div style="
                        flex: 1;
                        overflow-y: auto;
                        padding: 20px 24px;
                    ">
                        ${commentsHTML}
                    </div>

                    <!-- Footer -->
                    <div style="
                        padding: 16px 24px;
                        border-top: 1px solid #e5e7eb;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: #f9fafb;
                        border-radius: 0 0 16px 16px;
                    ">
                        <span style="font-size: 13px; color: #6b7280;">
                            Tổng: <strong>${totalComments}</strong> bình luận từ <strong>${postCount}</strong> bài viết
                        </span>
                        <button onclick="closeLiveCommentsModal()" style="
                            padding: 8px 20px;
                            background: #6366f1;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-size: 14px;
                            font-weight: 500;
                            cursor: pointer;
                            transition: all 0.2s;
                        " onmouseover="this.style.background='#4f46e5'" onmouseout="this.style.background='#6366f1'">
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Escape HTML để tránh XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Inject CSS animations
     */
    function injectStyles() {
        if (document.getElementById('live-comments-modal-style')) return;

        const style = document.createElement('style');
        style.id = 'live-comments-modal-style';
        style.textContent = `
            @keyframes liveModalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes liveModalSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Main function: Mở modal hiển thị live comments
     */
    window.openLiveCommentsModal = async function () {
        try {
            injectStyles();

            // Lấy order data hiện tại
            const fullOrderData = window.currentChatOrderData;
            if (!fullOrderData) {
                showToast('Không có thông tin đơn hàng', 'error');
                return;
            }

            // Lấy thông tin Facebook
            const userId = fullOrderData.Facebook_ASUserId;
            const facebookPostId = fullOrderData.Facebook_PostId;

            if (!userId) {
                showToast('Đơn hàng không có dữ liệu Facebook User', 'error');
                return;
            }

            if (!facebookPostId) {
                showToast('Đơn hàng không có dữ liệu bài viết Live', 'error');
                return;
            }

            // Parse pageId và postId từ Facebook_PostId (format: pageId_postId)
            const parts = facebookPostId.split('_');
            if (parts.length < 2) {
                showToast('Định dạng Facebook_PostId không hợp lệ', 'error');
                return;
            }

            const pageId = parts[0];
            const postId = parts[1];
            const customerName = fullOrderData.Partner?.Name || fullOrderData.Name || 'Khách hàng';

            // Hiển thị loading
            showToast('Đang tải bình luận...', 'info');

            // Fetch comments
            const result = await fetchLiveCommentsByUser(pageId, postId, userId);

            // Đóng toast loading
            const loadingToast = document.querySelector('.live-comments-toast');
            if (loadingToast) loadingToast.remove();

            // Tạo và hiển thị modal
            const modalHTML = createModalHTML(result.items, customerName, result.objectIds);

            // Remove existing modal if any
            const existingModal = document.getElementById('liveCommentsModal');
            if (existingModal) existingModal.remove();

            // Insert modal
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            // Close on backdrop click
            const modal = document.getElementById('liveCommentsModal');
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeLiveCommentsModal();
                }
            });

            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    closeLiveCommentsModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

            console.log('[LiveComments] Modal opened with', result.items.length, 'comments');

        } catch (error) {
            console.error('[LiveComments] Error:', error);
            showToast('Lỗi khi tải bình luận: ' + error.message, 'error');
        }
    };

    /**
     * Đóng modal
     */
    window.closeLiveCommentsModal = function () {
        const modal = document.getElementById('liveCommentsModal');
        if (modal) {
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.2s ease';
            setTimeout(() => modal.remove(), 200);
        }
    };

    console.log('[LiveComments] live-comments-readonly-modal.js loaded');

})();
