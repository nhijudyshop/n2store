// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared modal HTML markup for the TPOS return-order form. Loaded by
 * shared/js/return-order-modal.js via window.ReturnOrderMarkup.MODAL_HTML.
 */
window.ReturnOrderMarkup = {
    MODAL_HTML: `
<div class="modal-overlay" id="returnOrderModal">
    <div class="modal modal-return-order">
        <div class="modal-header">
            <h3>Đơn trả hàng nhà cung cấp</h3>
            <button class="modal-close" id="btnCloseReturnOrder">&times;</button>
        </div>
        <div class="return-action-bar">
            <button class="btn btn-save-draft" id="btnReturnSave">
                <i data-lucide="save" style="width: 14px; height: 14px"></i> Lưu
            </button>
            <button class="btn btn-go-back" id="btnReturnBack">Trở lại</button>
        </div>
        <div class="return-order-body">
            <div class="return-product-panel">
                <div class="return-product-toolbar">
                    <input type="text" id="returnProductSearch" class="return-product-search" placeholder="Tìm kiếm [F2]..." autocomplete="off" />
                    <select id="returnSortBy" class="return-sort-select">
                        <option value="DateCreated desc">Mới nhất</option>
                        <option value="QtyAvailable desc">Tồn kho</option>
                        <option value="Name asc">Tên A-Z</option>
                    </select>
                </div>
                <div class="return-product-table-header">
                    <span>Ảnh</span>
                    <span>Tên sản phẩm</span>
                    <span>ĐVT</span>
                    <span style="text-align: right">Giá mua</span>
                </div>
                <div class="return-product-list" id="returnProductList"></div>
                <div class="return-product-pagination" id="returnProductPagination"></div>
            </div>
            <div class="return-order-panel">
                <div class="return-order-header">
                    <div class="return-order-header-row">
                        <div class="form-group" style="flex: 2">
                            <label>Nhà cung cấp</label>
                            <div class="return-supplier-wrapper" id="returnSupplierWrapper">
                                <input type="text" id="returnSupplierSearch" class="form-input" placeholder="Tìm nhà cung cấp..." autocomplete="off" />
                                <div class="searchable-dropdown" id="returnSupplierDropdown" style="display: none"></div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Ngày đơn hàng</label>
                            <input type="date" id="returnOrderDate" class="form-input" />
                        </div>
                        <div class="form-group">
                            <label>Phương thức thanh toán</label>
                            <select id="returnPaymentMethod" class="form-select">
                                <option value="1">Tiền mặt</option>
                            </select>
                        </div>
                    </div>
                    <div class="return-order-header-row">
                        <div class="form-group">
                            <label>Cước phí</label>
                            <input type="text" id="returnShippingCost" class="form-input" inputmode="numeric" value="0" />
                        </div>
                        <div class="form-group">
                            <label>Số tiền thanh toán</label>
                            <input type="text" id="returnPaymentAmount" class="form-input" inputmode="numeric" value="0" />
                        </div>
                    </div>
                </div>
                <div class="return-order-table-wrap">
                    <table class="return-order-table" id="returnOrderTable">
                        <thead>
                            <tr>
                                <th class="col-stt">STT</th>
                                <th class="col-product">Sản phẩm</th>
                                <th class="col-qty">Số lượng</th>
                                <th class="col-price">Đơn giá</th>
                                <th class="col-total">Tổng</th>
                                <th class="col-action"></th>
                            </tr>
                        </thead>
                        <tbody id="returnOrderLines">
                            <tr><td colspan="6"><div class="return-order-empty"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><div>Chọn sản phẩm từ danh sách bên trái</div></div></td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="return-order-footer">
                    <div class="return-order-summary" id="returnOrderSummary">
                        <div class="return-summary-row"><span class="label">Tổng số lượng:</span><span class="value">0</span></div>
                        <div class="return-summary-row total"><span class="label">Tổng tiền:</span><span class="value">0</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>`,
};
