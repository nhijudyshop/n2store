// =====================================================
// UI RENDERING & MODAL EDITING
// File: soorder-ui.js
// =====================================================

window.SoOrderUI = {
    // =====================================================
    // RENDER TABLE
    // =====================================================

    renderTable() {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;
        const tbody = config.tbody;

        if (!tbody) return;

        tbody.innerHTML = "";
        this.updateTableHeaders();

        if (config.filteredOrders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="100%" style="text-align: center; padding: 2rem; color: #666;">
                        Không có dữ liệu
                    </td>
                </tr>
            `;
            return;
        }

        config.filteredOrders.forEach((order, index) => {
            const row = this.createOrderRow(order, index);
            tbody.appendChild(row);
        });

        lucide.createIcons();
    },

    createOrderRow(order, index) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;
        const tr = document.createElement("tr");
        tr.dataset.orderId = order.id;

        // Check if this order has been edited
        const hasBeenEdited = order.editCount && order.editCount > 0;
        if (hasBeenEdited) {
            tr.classList.add("row-edited");
        }

        // Check if this date has off day info
        const offDayInfo = config.currentOffDays.get(order.ngay);
        const showOffDayColumns = !!offDayInfo;

        // Ngày
        const tdNgay = document.createElement("td");
        tdNgay.textContent = utils.formatDisplayDate(order.ngay);
        tr.appendChild(tdNgay);

        // NCC
        const tdNCC = document.createElement("td");
        tdNCC.textContent = order.ncc || "";
        tr.appendChild(tdNCC);

        // Thành tiền
        const tdThanhTien = document.createElement("td");
        tdThanhTien.className = "text-right";
        const thanhTienClass = order.daThanhToan ? "line-through" : "";
        tdThanhTien.innerHTML = `<span class="${thanhTienClass}">${utils.formatMoney(order.thanhTien)}</span>`;
        tr.appendChild(tdThanhTien);

        // Trạng thái thanh toán
        const tdDaThanhToan = document.createElement("td");
        tdDaThanhToan.className = "text-center";
        tdDaThanhToan.innerHTML = order.daThanhToan
            ? '<span class="badge badge-success">Đã TT</span>'
            : '<span class="badge badge-pending">Chưa TT</span>';
        tr.appendChild(tdDaThanhToan);

        // Phân loại vấn đề
        const tdPhanLoai = document.createElement("td");
        tdPhanLoai.innerHTML = `<span class="badge ${utils.getPhanLoaiClass(order.phanLoaiVanDe)}">${utils.getPhanLoaiDisplay(order.phanLoaiVanDe)}</span>`;
        tr.appendChild(tdPhanLoai);

        // Số tiền chênh lệch
        const tdChenhLech = document.createElement("td");
        tdChenhLech.className = "text-right";
        if (order.soTienChenhLech) {
            const prefix = order.soTienChenhLech > 0 ? "+" : "";
            tdChenhLech.innerHTML = `<span class="${order.soTienChenhLech > 0 ? 'text-success' : 'text-danger'}">${prefix}${utils.formatMoney(order.soTienChenhLech)}</span>`;
        }
        tr.appendChild(tdChenhLech);

        // Ghi chú
        const tdGhiChu = document.createElement("td");
        tdGhiChu.className = "td-note";
        tdGhiChu.textContent = order.ghiChu || "";
        tr.appendChild(tdGhiChu);

        // Người Order (chỉ hiển thị khi có off day)
        if (showOffDayColumns) {
            const tdNguoiOrder = document.createElement("td");
            tdNguoiOrder.textContent = order.nguoiOrder || "";
            tr.appendChild(tdNguoiOrder);

            // Đã đối soát
            const tdDoiSoat = document.createElement("td");
            tdDoiSoat.className = "text-center";
            tdDoiSoat.innerHTML = order.daDoiSoat
                ? '<i data-lucide="check-circle" class="icon-success"></i>'
                : '<i data-lucide="circle" class="icon-pending"></i>';
            tr.appendChild(tdDoiSoat);
        }

        // Actions
        const tdActions = document.createElement("td");
        tdActions.className = "text-center actions-cell";
        tdActions.innerHTML = `
            <div class="action-buttons">
                ${hasBeenEdited ? '<span class="edit-indicator" title="Đã chỉnh sửa">●</span>' : ''}
                <button class="btn-icon btn-edit" data-action="edit" title="Sửa">
                    <i data-lucide="edit"></i>
                </button>
                <button class="btn-icon btn-history" data-action="history" title="Lịch sử">
                    <i data-lucide="history"></i>
                </button>
                <button class="btn-icon btn-delete" data-action="delete" title="Xóa">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        tr.appendChild(tdActions);

        // Add event listeners
        this.attachRowListeners(tr, order);

        return tr;
    },

    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    attachRowListeners(row, order) {
        // Edit button
        const editBtn = row.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.addEventListener("click", () => {
                this.showEditOrderModal(order);
            });
        }

        // History button
        const historyBtn = row.querySelector('[data-action="history"]');
        if (historyBtn) {
            historyBtn.addEventListener("click", () => {
                this.showOrderHistoryModal(order);
            });
        }

        // Delete button
        const deleteBtn = row.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async () => {
                await window.SoOrderCRUD.deleteOrder(order.id);
            });
        }
    },

    // =====================================================
    // ADD ORDER MODAL
    // =====================================================

    showAddOrderModal() {
        const utils = window.SoOrderUtils;
        const today = utils.getTodayString();

        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Thêm Đơn Mới</h3>
                    <button class="btn-close" data-action="close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Ngày <span class="required">*</span></label>
                        <input type="date" id="modal-ngay" value="${today}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Mã Đơn <span class="required">*</span></label>
                        <input type="text" id="modal-maDon" placeholder="VD: A6" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>NCC <span class="required">*</span></label>
                        <input type="text" id="modal-ncc" placeholder="Tên nhà cung cấp" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Thành Tiền <span class="required">*</span></label>
                        <input type="text" id="modal-thanhTien" placeholder="0" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="modal-daThanhToan">
                            Đã thanh toán
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Phân Loại Vấn Đề</label>
                        <select id="modal-phanLoai" class="form-control">
                            <option value="binhThuong">🔹 Bình thường</option>
                            <option value="duHang">🔸 Dư hàng</option>
                            <option value="thieuHang">🔸 Thiếu hàng</option>
                            <option value="saiGia">🔸 Sai giá</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Số Tiền Chênh Lệch</label>
                        <input type="text" id="modal-chenhLech" placeholder="0 (hoặc -1000)" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Ghi Chú</label>
                        <textarea id="modal-ghiChu" placeholder="Ghi chú..." class="form-control" rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="close">Hủy</button>
                    <button class="btn btn-primary" data-action="save">Tạo Đơn</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        lucide.createIcons();

        // Event listeners
        modal.querySelector('[data-action="close"]').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('.btn-close').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('[data-action="save"]').addEventListener("click", async () => {
            const orderData = {
                ngay: document.getElementById("modal-ngay").value,
                maDon: document.getElementById("modal-maDon").value,
                ncc: document.getElementById("modal-ncc").value,
                thanhTien: utils.parseMoney(document.getElementById("modal-thanhTien").value),
                daThanhToan: document.getElementById("modal-daThanhToan").checked,
                phanLoaiVanDe: document.getElementById("modal-phanLoai").value,
                soTienChenhLech: utils.parseMoney(document.getElementById("modal-chenhLech").value),
                ghiChu: document.getElementById("modal-ghiChu").value,
            };

            const success = await window.SoOrderCRUD.createOrder(orderData);
            if (success) {
                modal.remove();
            }
        });

        // Click outside to close
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    // =====================================================
    // EDIT ORDER MODAL
    // =====================================================

    showEditOrderModal(order) {
        const utils = window.SoOrderUtils;
        const config = window.SoOrderConfig;

        // Check if this date has off day
        const offDayInfo = config.currentOffDays.get(order.ngay);
        const showOffDayFields = !!offDayInfo;

        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal-content modal-edit">
                <div class="modal-header">
                    <h3>Chỉnh Sửa Đơn: ${order.maDon}</h3>
                    <button class="btn-close" data-action="close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Ngày <span class="required">*</span></label>
                        <input type="date" id="edit-ngay" value="${order.ngay || ""}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Mã Đơn <span class="required">*</span></label>
                        <input type="text" id="edit-maDon" value="${order.maDon || ""}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>NCC <span class="required">*</span></label>
                        <input type="text" id="edit-ncc" value="${order.ncc || ""}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Thành Tiền <span class="required">*</span></label>
                        <input type="text" id="edit-thanhTien" value="${utils.formatMoney(order.thanhTien)}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="edit-daThanhToan" ${order.daThanhToan ? "checked" : ""}>
                            Đã thanh toán
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Phân Loại Vấn Đề</label>
                        <select id="edit-phanLoai" class="form-control">
                            <option value="binhThuong" ${order.phanLoaiVanDe === "binhThuong" ? "selected" : ""}>🔹 Bình thường</option>
                            <option value="duHang" ${order.phanLoaiVanDe === "duHang" ? "selected" : ""}>🔸 Dư hàng</option>
                            <option value="thieuHang" ${order.phanLoaiVanDe === "thieuHang" ? "selected" : ""}>🔸 Thiếu hàng</option>
                            <option value="saiGia" ${order.phanLoaiVanDe === "saiGia" ? "selected" : ""}>🔸 Sai giá</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Số Tiền Chênh Lệch</label>
                        <input type="text" id="edit-chenhLech" value="${order.soTienChenhLech ? utils.formatMoney(order.soTienChenhLech) : ""}" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Ghi Chú</label>
                        <textarea id="edit-ghiChu" class="form-control" rows="3">${order.ghiChu || ""}</textarea>
                    </div>
                    ${showOffDayFields ? `
                        <div class="form-group">
                            <label>Người Order</label>
                            <input type="text" id="edit-nguoiOrder" value="${order.nguoiOrder || ""}" class="form-control" placeholder="Tên người order">
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="edit-daDoiSoat" ${order.daDoiSoat ? "checked" : ""}>
                                Đã đối soát
                            </label>
                        </div>
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="close">Hủy</button>
                    <button class="btn btn-primary" data-action="save">Lưu Thay Đổi</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        lucide.createIcons();

        // Event listeners
        modal.querySelector('[data-action="close"]').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('.btn-close').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('[data-action="save"]').addEventListener("click", async () => {
            const updates = {
                ngay: document.getElementById("edit-ngay").value,
                maDon: document.getElementById("edit-maDon").value,
                ncc: document.getElementById("edit-ncc").value,
                thanhTien: utils.parseMoney(document.getElementById("edit-thanhTien").value),
                daThanhToan: document.getElementById("edit-daThanhToan").checked,
                phanLoaiVanDe: document.getElementById("edit-phanLoai").value,
                soTienChenhLech: utils.parseMoney(document.getElementById("edit-chenhLech").value),
                ghiChu: document.getElementById("edit-ghiChu").value,
            };

            if (showOffDayFields) {
                updates.nguoiOrder = document.getElementById("edit-nguoiOrder").value;
                updates.daDoiSoat = document.getElementById("edit-daDoiSoat").checked;
            }

            const success = await window.SoOrderCRUD.updateOrder(order.id, updates);
            if (success) {
                modal.remove();
            }
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    // =====================================================
    // ORDER HISTORY MODAL
    // =====================================================

    async showOrderHistoryModal(order) {
        const utils = window.SoOrderUtils;
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal-content modal-history">
                <div class="modal-header">
                    <h3>Lịch Sử Chỉnh Sửa: ${order.maDon}</h3>
                    <button class="btn-close" data-action="close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="history-loading">
                        <div class="spinner"></div>
                        <p>Đang tải lịch sử...</p>
                    </div>
                    <div id="history-content" style="display: none;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="close">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        lucide.createIcons();

        // Load history
        const history = await window.SoOrderCRUD.getOrderHistory(order.id);
        this.renderOrderHistory(history, order);

        // Event listeners
        modal.querySelector('[data-action="close"]').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('.btn-close').addEventListener("click", () => {
            modal.remove();
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    renderOrderHistory(history, order) {
        const utils = window.SoOrderUtils;
        const loadingDiv = document.getElementById("history-loading");
        const contentDiv = document.getElementById("history-content");

        loadingDiv.style.display = "none";
        contentDiv.style.display = "block";

        if (!history || history.length === 0) {
            contentDiv.innerHTML = '<p class="text-muted">Chưa có lịch sử chỉnh sửa</p>';
            return;
        }

        let html = '<div class="history-timeline">';

        history.forEach((item, index) => {
            const date = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleString('vi-VN') : 'N/A';

            html += `
                <div class="history-item">
                    <div class="history-header">
                        <span class="history-user">${item.userName || 'Unknown'}</span>
                        <span class="history-date">${date}</span>
                    </div>
                    <div class="history-action">
                        ${this.formatHistoryAction(item)}
                    </div>
                    ${this.formatHistoryChanges(item)}
                </div>
            `;
        });

        html += '</div>';
        contentDiv.innerHTML = html;
    },

    formatHistoryAction(item) {
        const actionMap = {
            create: '🆕 Tạo mới',
            update: '✏️ Chỉnh sửa',
            delete: '🗑️ Xóa'
        };
        return actionMap[item.action] || item.action;
    },

    formatHistoryChanges(item) {
        if (!item.oldData || !item.newData) return '';

        const utils = window.SoOrderUtils;
        const changes = [];
        const fields = {
            ngay: 'Ngày',
            maDon: 'Mã đơn',
            ncc: 'NCC',
            thanhTien: 'Thành tiền',
            daThanhToan: 'Đã thanh toán',
            phanLoaiVanDe: 'Phân loại',
            soTienChenhLech: 'Chênh lệch',
            ghiChu: 'Ghi chú',
            nguoiOrder: 'Người order',
            daDoiSoat: 'Đã đối soát'
        };

        for (const [key, label] of Object.entries(fields)) {
            if (item.oldData[key] !== item.newData[key]) {
                let oldVal = item.oldData[key];
                let newVal = item.newData[key];

                // Format special fields
                if (key === 'thanhTien' || key === 'soTienChenhLech') {
                    oldVal = utils.formatMoney(oldVal);
                    newVal = utils.formatMoney(newVal);
                } else if (key === 'daThanhToan' || key === 'daDoiSoat') {
                    oldVal = oldVal ? 'Có' : 'Không';
                    newVal = newVal ? 'Có' : 'Không';
                } else if (key === 'phanLoaiVanDe') {
                    oldVal = utils.getPhanLoaiDisplay(oldVal);
                    newVal = utils.getPhanLoaiDisplay(newVal);
                }

                changes.push(`
                    <div class="change-item">
                        <strong>${label}:</strong>
                        <span class="old-value">${oldVal || '(trống)'}</span>
                        <span class="arrow">→</span>
                        <span class="new-value">${newVal || '(trống)'}</span>
                    </div>
                `);
            }
        }

        if (changes.length === 0) return '';

        return `<div class="history-changes">${changes.join('')}</div>`;
    },

    // =====================================================
    // OFF DAYS MODAL
    // =====================================================

    showOffDaysModal() {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;

        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Quản Lý Ngày Nghỉ</h3>
                    <button class="btn-close" data-action="close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Chọn Ngày Nghỉ</label>
                        <input type="date" id="offday-date" class="form-control" value="${utils.getTodayString()}">
                    </div>
                    <div class="form-group">
                        <label>Người Quản Lý</label>
                        <input type="text" id="offday-nguoiQuanLy" placeholder="Tên người quản lý" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Người Thay Thế</label>
                        <input type="text" id="offday-nguoiThayThe" placeholder="Tên người thay thế" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Ghi Chú</label>
                        <textarea id="offday-ghiChu" placeholder="Lý do nghỉ..." class="form-control" rows="2"></textarea>
                    </div>
                    <div class="offday-list" id="offday-list">
                        <h4>Danh Sách Ngày Nghỉ</h4>
                        <div id="offday-items"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-action="close">Đóng</button>
                    <button class="btn btn-primary" data-action="save">Lưu Ngày Nghỉ</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        lucide.createIcons();

        // Render existing off days
        this.renderOffDaysList();

        // Event listeners
        modal.querySelector('[data-action="close"]').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('.btn-close').addEventListener("click", () => {
            modal.remove();
        });

        modal.querySelector('[data-action="save"]').addEventListener("click", async () => {
            const date = document.getElementById("offday-date").value;
            const nguoiQuanLy = document.getElementById("offday-nguoiQuanLy").value;
            const nguoiThayThe = document.getElementById("offday-nguoiThayThe").value;
            const ghiChu = document.getElementById("offday-ghiChu").value;

            if (!date) {
                utils.showError("Vui lòng chọn ngày!");
                return;
            }

            const data = {
                isOffDay: true,
                nguoiQuanLy,
                nguoiThayThe,
                ghiChu,
            };

            const success = await window.SoOrderCRUD.saveOffDay(date, data);
            if (success) {
                this.renderOffDaysList();
                // Clear form
                document.getElementById("offday-nguoiQuanLy").value = "";
                document.getElementById("offday-nguoiThayThe").value = "";
                document.getElementById("offday-ghiChu").value = "";
            }
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    renderOffDaysList() {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;
        const container = document.getElementById("offday-items");

        if (!container) return;

        container.innerHTML = "";

        if (config.currentOffDays.size === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">Chưa có ngày nghỉ nào</p>';
            return;
        }

        const sortedDays = Array.from(config.currentOffDays.entries()).sort((a, b) => b[0].localeCompare(a[0]));

        sortedDays.forEach(([date, data]) => {
            const item = document.createElement("div");
            item.className = "offday-item";
            item.innerHTML = `
                <div class="offday-info">
                    <strong>${utils.formatDisplayDate(date)}</strong>
                    <span>${data.nguoiQuanLy || "N/A"} → ${data.nguoiThayThe || "N/A"}</span>
                    ${data.ghiChu ? `<small>${data.ghiChu}</small>` : ""}
                </div>
                <button class="btn-icon btn-delete-offday" data-date="${date}">
                    <i data-lucide="trash-2"></i>
                </button>
            `;
            container.appendChild(item);
        });

        lucide.createIcons();

        // Delete buttons
        container.querySelectorAll(".btn-delete-offday").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const date = btn.dataset.date;
                if (confirm(`Xóa ngày nghỉ ${utils.formatDisplayDate(date)}?`)) {
                    await window.SoOrderCRUD.deleteOffDay(date);
                    this.renderOffDaysList();
                }
            });
        });
    },

    // =====================================================
    // UPDATE TABLE HEADERS (for off days columns)
    // =====================================================

    updateTableHeaders() {
        const config = window.SoOrderConfig;
        const thead = document.querySelector("#orderTable thead tr");

        if (!thead) return;

        // Check if any visible order has off day
        const hasOffDay = config.filteredOrders.some((order) =>
            config.currentOffDays.has(order.ngay)
        );

        // Update header based on off day presence
        if (hasOffDay) {
            thead.innerHTML = `
                <th>Ngày</th>
                <th>NCC</th>
                <th>Thành Tiền</th>
                <th>Trạng Thái</th>
                <th>Phân Loại</th>
                <th>Chênh Lệch</th>
                <th>Ghi Chú</th>
                <th>Người Order</th>
                <th>Đối Soát</th>
                <th>Thao Tác</th>
            `;
        } else {
            thead.innerHTML = `
                <th>Ngày</th>
                <th>NCC</th>
                <th>Thành Tiền</th>
                <th>Trạng Thái</th>
                <th>Phân Loại</th>
                <th>Chênh Lệch</th>
                <th>Ghi Chú</th>
                <th>Thao Tác</th>
            `;
        }
    },
};
