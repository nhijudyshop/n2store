// =====================================================
// UI RENDERING & INLINE EDITING
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
    },

    createOrderRow(order, index) {
        const config = window.SoOrderConfig;
        const utils = window.SoOrderUtils;
        const tr = document.createElement("tr");
        tr.dataset.orderId = order.id;

        // Check if this date has off day info
        const offDayInfo = config.currentOffDays.get(order.ngay);
        const showOffDayColumns = !!offDayInfo;

        // STT
        const tdSTT = document.createElement("td");
        tdSTT.textContent = index + 1;
        tdSTT.className = "text-center";
        tr.appendChild(tdSTT);

        // Ngày
        const tdNgay = document.createElement("td");
        tdNgay.innerHTML = `<input type="date" class="inline-input" value="${order.ngay || ""}" data-field="ngay">`;
        tr.appendChild(tdNgay);

        // Mã đơn
        const tdMaDon = document.createElement("td");
        tdMaDon.innerHTML = `<input type="text" class="inline-input" value="${order.maDon || ""}" data-field="maDon" placeholder="A6">`;
        tr.appendChild(tdMaDon);

        // NCC
        const tdNCC = document.createElement("td");
        tdNCC.innerHTML = `<input type="text" class="inline-input" value="${order.ncc || ""}" data-field="ncc" placeholder="Tên NCC">`;
        tr.appendChild(tdNCC);

        // Thành tiền
        const tdThanhTien = document.createElement("td");
        const thanhTienValue = utils.formatMoney(order.thanhTien);
        const thanhTienClass = order.daThanhToan ? "line-through" : "";
        tdThanhTien.innerHTML = `<input type="text" class="inline-input text-right ${thanhTienClass}" value="${thanhTienValue}" data-field="thanhTien" placeholder="0">`;
        tr.appendChild(tdThanhTien);

        // Trạng thái thanh toán
        const tdDaThanhToan = document.createElement("td");
        tdDaThanhToan.className = "text-center";
        tdDaThanhToan.innerHTML = `<input type="checkbox" class="inline-checkbox" ${order.daThanhToan ? "checked" : ""} data-field="daThanhToan">`;
        tr.appendChild(tdDaThanhToan);

        // Phân loại vấn đề
        const tdPhanLoai = document.createElement("td");
        tdPhanLoai.innerHTML = `
            <select class="inline-select ${utils.getPhanLoaiClass(order.phanLoaiVanDe)}" data-field="phanLoaiVanDe">
                <option value="binhThuong" ${order.phanLoaiVanDe === "binhThuong" ? "selected" : ""}>🔹 Bình thường</option>
                <option value="duHang" ${order.phanLoaiVanDe === "duHang" ? "selected" : ""}>🔸 Dư hàng</option>
                <option value="thieuHang" ${order.phanLoaiVanDe === "thieuHang" ? "selected" : ""}>🔸 Thiếu hàng</option>
                <option value="saiGia" ${order.phanLoaiVanDe === "saiGia" ? "selected" : ""}>🔸 Sai giá</option>
            </select>
        `;
        tr.appendChild(tdPhanLoai);

        // Số tiền chênh lệch
        const tdChenhLech = document.createElement("td");
        const chenhLechValue = order.soTienChenhLech ? utils.formatMoney(order.soTienChenhLech) : "";
        tdChenhLech.innerHTML = `<input type="text" class="inline-input text-right" value="${chenhLechValue}" data-field="soTienChenhLech" placeholder="0">`;
        tr.appendChild(tdChenhLech);

        // Ghi chú
        const tdGhiChu = document.createElement("td");
        tdGhiChu.innerHTML = `<input type="text" class="inline-input" value="${order.ghiChu || ""}" data-field="ghiChu" placeholder="Ghi chú...">`;
        tr.appendChild(tdGhiChu);

        // Người Order (chỉ hiển thị khi có off day)
        if (showOffDayColumns) {
            const tdNguoiOrder = document.createElement("td");
            tdNguoiOrder.innerHTML = `<input type="text" class="inline-input" value="${order.nguoiOrder || ""}" data-field="nguoiOrder" placeholder="Tên người order">`;
            tr.appendChild(tdNguoiOrder);

            // Đã đối soát
            const tdDoiSoat = document.createElement("td");
            tdDoiSoat.className = "text-center";
            tdDoiSoat.innerHTML = `<input type="checkbox" class="inline-checkbox" ${order.daDoiSoat ? "checked" : ""} data-field="daDoiSoat">`;
            tr.appendChild(tdDoiSoat);
        }

        // Actions
        const tdActions = document.createElement("td");
        tdActions.className = "text-center";
        tdActions.innerHTML = `
            <button class="btn-icon btn-delete" data-action="delete" title="Xóa">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        tr.appendChild(tdActions);

        // Add event listeners for inline editing
        this.attachInlineEditListeners(tr, order.id);

        return tr;
    },

    // =====================================================
    // INLINE EDITING LISTENERS
    // =====================================================

    attachInlineEditListeners(row, orderId) {
        const inputs = row.querySelectorAll(".inline-input, .inline-select, .inline-checkbox");

        inputs.forEach((input) => {
            const field = input.dataset.field;

            if (input.type === "checkbox") {
                input.addEventListener("change", async (e) => {
                    await this.handleInlineUpdate(orderId, field, e.target.checked);

                    // Special handling for daThanhToan - update line-through style
                    if (field === "daThanhToan") {
                        const thanhTienInput = row.querySelector('[data-field="thanhTien"]');
                        if (thanhTienInput) {
                            if (e.target.checked) {
                                thanhTienInput.classList.add("line-through");
                            } else {
                                thanhTienInput.classList.remove("line-through");
                            }
                        }
                    }
                });
            } else if (input.tagName === "SELECT") {
                input.addEventListener("change", async (e) => {
                    await this.handleInlineUpdate(orderId, field, e.target.value);
                    // Update class for color coding
                    const utils = window.SoOrderUtils;
                    e.target.className = `inline-select ${utils.getPhanLoaiClass(e.target.value)}`;
                });
            } else {
                // Text/number/date inputs - update on blur
                input.addEventListener("blur", async (e) => {
                    let value = e.target.value;

                    // Parse money fields
                    if (field === "thanhTien" || field === "soTienChenhLech") {
                        const utils = window.SoOrderUtils;
                        value = utils.parseMoney(value);
                    }

                    await this.handleInlineUpdate(orderId, field, value);
                });

                // Format money on blur
                if (field === "thanhTien" || field === "soTienChenhLech") {
                    input.addEventListener("blur", (e) => {
                        const utils = window.SoOrderUtils;
                        const value = utils.parseMoney(e.target.value);
                        e.target.value = value ? utils.formatMoney(value) : "";
                    });

                    // Allow typing numbers
                    input.addEventListener("focus", (e) => {
                        const utils = window.SoOrderUtils;
                        const value = utils.parseMoney(e.target.value);
                        e.target.value = value || "";
                    });
                }
            }
        });

        // Delete button
        const deleteBtn = row.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async () => {
                await window.SoOrderCRUD.deleteOrder(orderId);
            });
        }
    },

    async handleInlineUpdate(orderId, field, value) {
        const updates = { [field]: value };
        await window.SoOrderCRUD.updateOrder(orderId, updates);
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
                <th>STT</th>
                <th>Ngày</th>
                <th>Mã Đơn</th>
                <th>NCC</th>
                <th>Thành Tiền</th>
                <th>Đã TT</th>
                <th>Phân Loại</th>
                <th>Chênh Lệch</th>
                <th>Ghi Chú</th>
                <th>Người Order</th>
                <th>Đã Đối Soát</th>
                <th>Thao Tác</th>
            `;
        } else {
            thead.innerHTML = `
                <th>STT</th>
                <th>Ngày</th>
                <th>Mã Đơn</th>
                <th>NCC</th>
                <th>Thành Tiền</th>
                <th>Đã TT</th>
                <th>Phân Loại</th>
                <th>Chênh Lệch</th>
                <th>Ghi Chú</th>
                <th>Thao Tác</th>
            `;
        }
    },
};
