// =====================================================
// PAGE PERMISSIONS UI MANAGER
// Quản lý quyền truy cập trang (pagePermissions)
// =====================================================

// Danh sách các trang từ navigation-modern.js
const PAGE_PERMISSIONS_CONFIG = [
    {
        id: "live",
        icon: "image",
        name: "Hình Ảnh Live",
        description: "Xem và quản lý hình ảnh live stream",
    },
    {
        id: "livestream",
        icon: "video",
        name: "Báo Cáo Livestream",
        description: "Xem báo cáo và thống kê livestream",
    },
    {
        id: "sanphamlive",
        icon: "shopping-bag",
        name: "Sản Phẩm Livestream",
        description: "Quản lý sản phẩm livestream (Admin)",
        adminOnly: true,
    },
    {
        id: "nhanhang",
        icon: "scale",
        name: "Cân Nặng Hàng",
        description: "Quản lý cân nặng và nhận hàng",
    },
    {
        id: "inventoryTracking",
        icon: "package-search",
        name: "Theo Dõi Nhập Hàng SL",
        description: "Theo dõi nhập hàng số lượng và công nợ",
    },
    {
        id: "hangrotxa",
        icon: "clipboard-list",
        name: "Hàng Rớt - Xả",
        description: "Quản lý hàng rớt và xả hàng",
    },
    {
        id: "ib",
        icon: "message-circle",
        name: "Check Inbox Khách",
        description: "Kiểm tra inbox khách hàng",
    },
    {
        id: "ck",
        icon: "credit-card",
        name: "Thông Tin Chuyển Khoản",
        description: "Quản lý thông tin chuyển khoản",
    },
    {
        id: "hanghoan",
        icon: "corner-up-left",
        name: "Hàng Hoàn",
        description: "Xử lý hàng hoàn trả",
    },
    {
        id: "baocaosaleonline",
        icon: "shopping-cart",
        name: "Báo Cáo Sale-Online",
        description: "Báo cáo bán hàng online",
    },
    {
        id: "product-search",
        icon: "search",
        name: "Tìm Kiếm Sản Phẩm",
        description: "Tìm kiếm và quản lý kho",
    },
    {
        id: "hangdat",
        icon: "bookmark",
        name: "Hàng Đặt",
        description: "Quản lý hàng đặt (Admin)",
        adminOnly: true,
    },
    {
        id: "bangkiemhang",
        icon: "check-square",
        name: "Bảng Kiểm Hàng",
        description: "Kiểm tra và xác nhận hàng (Admin)",
        adminOnly: true,
    },
    {
        id: "tpos-import",
        icon: "upload",
        name: "Nhập Dữ Liệu TPOS",
        description: "Import dữ liệu từ TPOS (Admin)",
        adminOnly: true,
    },
    {
        id: "user-management",
        icon: "users",
        name: "Quản Lý Tài Khoản",
        description: "Quản lý users và phân quyền (Admin)",
        adminOnly: true,
    },
    {
        id: "lichsuchinhsua",
        icon: "bar-chart-2",
        name: "Lịch Sử Chỉnh Sửa",
        description: "Xem lịch sử thay đổi (Admin)",
        adminOnly: true,
    },
];

class PagePermissionsUI {
    constructor(containerId, formPrefix = "") {
        this.containerId = containerId;
        this.formPrefix = formPrefix;
        this.selectedPermissions = [];
        this.render();
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container #${this.containerId} not found!`);
            return;
        }

        container.innerHTML = `
            <div class="page-permissions-section">
                <div class="section-header">
                    <h3>
                        <i data-lucide="layout-grid" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>
                        Quyền Truy Cập Trang
                    </h3>
                    <div class="quick-actions">
                        <button type="button" class="btn-quick-select" onclick="window.${this.formPrefix}PagePermUI.selectAll()">
                            <i data-lucide="check-square"></i>
                            Chọn tất cả
                        </button>
                        <button type="button" class="btn-quick-select" onclick="window.${this.formPrefix}PagePermUI.selectNone()">
                            <i data-lucide="square"></i>
                            Bỏ chọn
                        </button>
                        <button type="button" class="btn-quick-select" onclick="window.${this.formPrefix}PagePermUI.selectTemplate('basic')">
                            <i data-lucide="users"></i>
                            Template: Basic
                        </button>
                        <button type="button" class="btn-quick-select" onclick="window.${this.formPrefix}PagePermUI.selectTemplate('manager')">
                            <i data-lucide="shield"></i>
                            Template: Manager
                        </button>
                    </div>
                </div>

                <div class="permissions-grid">
                    ${this.renderPageCards()}
                </div>

                <div class="permissions-summary" id="${this.formPrefix}pagePermissionsSummary">
                    <i data-lucide="info"></i>
                    <span>Chọn các trang mà user này có thể truy cập</span>
                </div>
            </div>
        `;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        this.updateSummary();
    }

    renderPageCards() {
        return PAGE_PERMISSIONS_CONFIG.map((page) => {
            const cardClass = page.adminOnly ? "page-card admin-only" : "page-card";
            const adminBadge = page.adminOnly
                ? '<span class="admin-badge"><i data-lucide="crown"></i>Admin</span>'
                : "";

            return `
                <div class="${cardClass}">
                    <div class="page-card-header">
                        <input
                            type="checkbox"
                            id="${this.formPrefix}page_${page.id}"
                            value="${page.id}"
                            onchange="window.${this.formPrefix}PagePermUI.updateSummary()"
                        />
                        <label for="${this.formPrefix}page_${page.id}">
                            <div class="page-icon">
                                <i data-lucide="${page.icon}"></i>
                            </div>
                            <div class="page-info">
                                <div class="page-name">${page.name}${adminBadge}</div>
                                <div class="page-description">${page.description}</div>
                            </div>
                        </label>
                    </div>
                </div>
            `;
        }).join("");
    }

    setPermissions(pagePermissions) {
        this.selectedPermissions = pagePermissions || [];

        // Uncheck all first
        PAGE_PERMISSIONS_CONFIG.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox) {
                checkbox.checked = false;
            }
        });

        // Check selected permissions
        this.selectedPermissions.forEach((pageId) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${pageId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });

        this.updateSummary();
    }

    getPermissions() {
        const permissions = [];
        PAGE_PERMISSIONS_CONFIG.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox && checkbox.checked) {
                permissions.push(page.id);
            }
        });
        return permissions;
    }

    selectAll() {
        PAGE_PERMISSIONS_CONFIG.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        this.updateSummary();
    }

    selectNone() {
        PAGE_PERMISSIONS_CONFIG.forEach((page) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${page.id}`);
            if (checkbox) {
                checkbox.checked = false;
            }
        });
        this.updateSummary();
    }

    selectTemplate(templateName) {
        // Templates
        const templates = {
            basic: ["live", "livestream", "hangrotxa", "ib", "ck", "hanghoan"],
            manager: [
                "live",
                "livestream",
                "nhanhang",
                "hangrotxa",
                "ib",
                "ck",
                "hanghoan",
                "baocaosaleonline",
                "product-search",
            ],
            admin: PAGE_PERMISSIONS_CONFIG.map((p) => p.id),
        };

        const selectedPages = templates[templateName] || [];

        // Uncheck all first
        this.selectNone();

        // Check template pages
        selectedPages.forEach((pageId) => {
            const checkbox = document.getElementById(`${this.formPrefix}page_${pageId}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });

        this.updateSummary();
    }

    updateSummary() {
        const permissions = this.getPermissions();
        const summary = document.getElementById(`${this.formPrefix}pagePermissionsSummary`);

        if (!summary) return;

        if (permissions.length === 0) {
            summary.className = "permissions-summary empty";
            summary.innerHTML = `
                <i data-lucide="alert-triangle"></i>
                <span>⚠️ Chưa chọn trang nào - User sẽ không truy cập được hệ thống!</span>
            `;
        } else {
            const pageNames = permissions
                .map((id) => {
                    const page = PAGE_PERMISSIONS_CONFIG.find((p) => p.id === id);
                    return page ? page.name : id;
                })
                .join(", ");

            summary.className = "permissions-summary success";
            summary.innerHTML = `
                <i data-lucide="check-circle"></i>
                <span><strong>${permissions.length}</strong> trang được phép: ${pageNames}</span>
            `;
        }

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Add CSS styles
const style = document.createElement("style");
style.textContent = `
.page-permissions-section {
    margin-top: 24px;
    padding: 20px;
    background: var(--bg-secondary, #f9fafb);
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}

.section-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #111827);
    display: flex;
    align-items: center;
}

.quick-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.btn-quick-select {
    padding: 6px 12px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--text-secondary, #374151);
    font-weight: 500;
}

.btn-quick-select:hover {
    background: var(--bg-tertiary, #f3f4f6);
    border-color: var(--accent-color, #6366f1);
}

.btn-quick-select i {
    width: 14px;
    height: 14px;
}

.permissions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
}

.page-card {
    background: white;
    border: 2px solid var(--border-color, #e5e7eb);
    border-radius: 10px;
    transition: all 0.2s;
    overflow: hidden;
}

.page-card:hover {
    border-color: var(--accent-color, #6366f1);
    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.1);
}

.page-card.admin-only {
    background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%);
    border-color: #fbbf24;
}

.page-card-header {
    padding: 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.page-card-header input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: var(--accent-color, #6366f1);
}

.page-card-header label {
    flex: 1;
    cursor: pointer;
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.page-icon {
    width: 40px;
    height: 40px;
    background: var(--bg-secondary, #f3f4f6);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.page-card:hover .page-icon {
    background: rgba(99, 102, 241, 0.1);
}

.page-card.admin-only .page-icon {
    background: rgba(251, 191, 36, 0.1);
}

.page-icon i {
    width: 20px;
    height: 20px;
    color: var(--accent-color, #6366f1);
}

.page-card.admin-only .page-icon i {
    color: #f59e0b;
}

.page-info {
    flex: 1;
}

.page-name {
    font-weight: 600;
    color: var(--text-primary, #111827);
    margin-bottom: 4px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.admin-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #fef3c7;
    color: #f59e0b;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
}

.admin-badge i {
    width: 12px;
    height: 12px;
}

.page-description {
    font-size: 12px;
    color: var(--text-tertiary, #6b7280);
    line-height: 1.4;
}

.permissions-summary {
    padding: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    line-height: 1.5;
}

.permissions-summary.empty {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
}

.permissions-summary.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #16a34a;
}

.permissions-summary i {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
}

.permissions-summary span {
    flex: 1;
}

@media (max-width: 768px) {
    .permissions-grid {
        grid-template-columns: 1fr;
    }

    .section-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .quick-actions {
        width: 100%;
    }

    .btn-quick-select {
        flex: 1;
        justify-content: center;
    }
}
`;
document.head.appendChild(style);

console.log("Page Permissions UI loaded");
