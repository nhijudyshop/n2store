/**
 * Shared Customer Creator Modal
 * Tạo khách hàng mới - dùng chung cho nhiều page (customer-hub, orders-report, ...)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TÍNH NĂNG: TẠO KHÁCH HÀNG MỚI (Create New Customer)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * MÔ TẢ:
 *   Modal popup cho phép tạo nhanh khách hàng (Partner) trên hệ thống TPOS.
 *   Được thiết kế dùng chung (shared module) cho nhiều trang: customer-hub,
 *   orders-report, và các module khác cần tạo khách hàng.
 *
 * FORM FIELDS:
 *   ┌──────────────────┬──────────┬───────────────────────────────────────┐
 *   │ Field            │ Bắt buộc │ Validation                            │
 *   ├──────────────────┼──────────┼───────────────────────────────────────┤
 *   │ Tên khách hàng   │ Có (*)   │ Không được để trống                   │
 *   │ Số điện thoại    │ Có (*)   │ Regex /^0\d{8,9}$/ (VN format,       │
 *   │                  │          │ bắt đầu bằng 0, tổng 10-11 số)       │
 *   │ Địa chỉ          │ Không    │ Không validation                      │
 *   └──────────────────┴──────────┴───────────────────────────────────────┘
 *
 * LUỒNG HOẠT ĐỘNG (Flow):
 *   1. User click nút "Tạo KH" → gọi CustomerCreator.open({ onSuccess })
 *   2. Modal hiện lên, reset form, focus vào ô tên
 *   3. User điền thông tin → click "Tạo khách hàng"
 *   4. Validate: tên (required), SĐT (required + regex VN)
 *   5. Gọi API tạo Partner trên TPOS:
 *      - Ưu tiên dùng window.apiService.createPartner() nếu có
 *      - Fallback: gọi trực tiếp TPOS OData qua tokenManager.authenticatedFetch()
 *      - Endpoint: POST /api/odata/Partner
 *   6. Thành công → hiện thông báo xanh, gọi callback onSuccess với dữ liệu:
 *      { id, name, phone, address, status }
 *   7. Tự đóng modal sau 1 giây
 *   8. Thất bại → hiện thông báo lỗi đỏ, không đóng modal
 *
 * TÍCH HỢP VỚI CUSTOMER-HUB (customer-search.js):
 *   - Callback onSuccess nhận dữ liệu khách hàng mới
 *   - Thêm vào đầu mảng customers bằng unshift()
 *   - Render row mới ở đầu bảng với highlight xanh lá (3 giây)
 *   - Cập nhật footer đếm số khách hàng
 *
 * API PAYLOAD:
 *   Tạo Partner object với các giá trị mặc định:
 *   - Customer: true, Supplier: false (là khách hàng, không phải NCC)
 *   - Status: "Normal", StatusText: "Bình thường"
 *   - Type: "contact", CompanyType: "person"
 *   - Bao gồm AccountPayable (331), AccountReceivable (131) mặc định
 *   - CompanyId lấy từ ShopConfig hoặc mặc định = 1
 *
 * Requires: window.tokenManager (from pancake-token-manager.js)
 * Optional: window.ShopConfig (for CompanyId)
 *           window.apiService (preferred API layer)
 *
 * Usage:
 *   window.CustomerCreator.open({
 *       onSuccess: (customer) => {
 *           // customer = { id, name, phone, address, status }
 *           console.log('Created:', customer.name, customer.phone);
 *       }
 *   });
 *
 * Exposed API:
 *   window.CustomerCreator.open(options)  — Mở modal tạo KH
 *   window.CustomerCreator.close()        — Đóng modal
 */
(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const TPOS_ODATA = `${WORKER_URL}/api/odata`;

    let modalEl = null;

    function getModalHTML() {
        return `
            <div class="cc-backdrop"></div>
            <div class="cc-center">
                <div class="cc-dialog">
                    <div class="cc-header">
                        <h3 class="cc-title">
                            <i class="fas fa-user-plus"></i>
                            Tạo khách hàng mới
                        </h3>
                        <button class="cc-close-btn" data-cc-close>×</button>
                    </div>
                    <div class="cc-body">
                        <div class="cc-field">
                            <label>Tên khách hàng <span class="cc-required">*</span></label>
                            <input type="text" id="cc-name" placeholder="Nhập tên khách hàng" />
                        </div>
                        <div class="cc-field">
                            <label>Số điện thoại <span class="cc-required">*</span></label>
                            <input type="tel" id="cc-phone" placeholder="Nhập số điện thoại" />
                        </div>
                        <div class="cc-field">
                            <label>Địa chỉ</label>
                            <input type="text" id="cc-street" placeholder="Nhập địa chỉ" />
                        </div>
                        <div id="cc-error" class="cc-msg cc-msg-error" style="display:none;"></div>
                        <div id="cc-success" class="cc-msg cc-msg-success" style="display:none;"></div>
                    </div>
                    <div class="cc-footer">
                        <button class="cc-btn-cancel" data-cc-close>Hủy</button>
                        <button class="cc-btn-submit" id="cc-submit">
                            <i class="fas fa-save"></i> Tạo khách hàng
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function getStyles() {
        return `
            .cc-modal { position: fixed; inset: 0; z-index: 10000; display: none; }
            .cc-modal.cc-show { display: block; }
            .cc-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,0.5); backdrop-filter: blur(2px); }
            .cc-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; }
            .cc-dialog { background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 420px; overflow: hidden; }
            .cc-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
            .cc-title { font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px; }
            .cc-title i { color: #3b82f6; }
            .cc-close-btn { background: none; border: none; font-size: 22px; color: #9ca3af; cursor: pointer; padding: 0 4px; line-height: 1; }
            .cc-close-btn:hover { color: #374151; }
            .cc-body { padding: 20px; }
            .cc-field { margin-bottom: 14px; }
            .cc-field label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 5px; }
            .cc-required { color: #ef4444; }
            .cc-field input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
            .cc-field input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
            .cc-msg { font-size: 13px; padding: 8px 12px; border-radius: 8px; margin-top: 8px; }
            .cc-msg-error { color: #dc2626; background: #fef2f2; }
            .cc-msg-success { color: #16a34a; background: #f0fdf4; }
            .cc-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid #e5e7eb; }
            .cc-btn-cancel { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #6b7280; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            .cc-btn-cancel:hover { background: #f3f4f6; }
            .cc-btn-submit { padding: 8px 16px; font-size: 13px; font-weight: 500; color: #fff; background: #3b82f6; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.2s; }
            .cc-btn-submit:hover { background: #2563eb; }
            .cc-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        `;
    }

    function ensureModal() {
        if (modalEl) return;

        // Inject styles
        const style = document.createElement('style');
        style.textContent = getStyles();
        document.head.appendChild(style);

        // Create modal element
        modalEl = document.createElement('div');
        modalEl.className = 'cc-modal';
        modalEl.innerHTML = getModalHTML();
        document.body.appendChild(modalEl);

        // Close handlers
        modalEl.querySelectorAll('[data-cc-close]').forEach(btn => {
            btn.addEventListener('click', close);
        });
        modalEl.querySelector('.cc-backdrop').addEventListener('click', close);
    }

    function open(options = {}) {
        ensureModal();

        const onSuccess = options.onSuccess || function () { };

        // Reset form
        modalEl.querySelector('#cc-name').value = '';
        modalEl.querySelector('#cc-phone').value = '';
        modalEl.querySelector('#cc-street').value = '';
        const errorEl = modalEl.querySelector('#cc-error');
        const successEl = modalEl.querySelector('#cc-success');
        errorEl.style.display = 'none';
        successEl.style.display = 'none';

        const submitBtn = modalEl.querySelector('#cc-submit');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Tạo khách hàng';

        // Remove old listener, add new one
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        newSubmitBtn.addEventListener('click', () => submitCreateCustomer(onSuccess));

        // Show modal
        modalEl.classList.add('cc-show');
        document.body.style.overflow = 'hidden';

        setTimeout(() => modalEl.querySelector('#cc-name').focus(), 100);
    }

    function close() {
        if (!modalEl) return;
        modalEl.classList.remove('cc-show');
        document.body.style.overflow = '';
    }

    async function submitCreateCustomer(onSuccess) {
        const name = modalEl.querySelector('#cc-name').value.trim();
        const phone = modalEl.querySelector('#cc-phone').value.trim();
        const street = modalEl.querySelector('#cc-street').value.trim();
        const errorEl = modalEl.querySelector('#cc-error');
        const successEl = modalEl.querySelector('#cc-success');
        const submitBtn = modalEl.querySelector('#cc-submit');

        errorEl.style.display = 'none';
        successEl.style.display = 'none';

        // Validate
        if (!name) {
            errorEl.textContent = 'Vui lòng nhập tên khách hàng';
            errorEl.style.display = 'block';
            return;
        }
        if (!phone) {
            errorEl.textContent = 'Vui lòng nhập số điện thoại';
            errorEl.style.display = 'block';
            return;
        }
        if (!/^0\d{8,9}$/.test(phone)) {
            errorEl.textContent = 'Số điện thoại không hợp lệ (VD: 0909123456)';
            errorEl.style.display = 'block';
            return;
        }

        // Disable button
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';

        try {
            const result = await createPartnerOnTPOS({ name, phone, street });

            successEl.textContent = `Tạo thành công: ${result.Name} (ID: ${result.Id})`;
            successEl.style.display = 'block';

            // Callback with created customer data
            if (typeof onSuccess === 'function') {
                onSuccess({
                    id: result.Id,
                    name: result.Name || name,
                    phone: result.Phone || phone,
                    address: result.Street || street || '',
                    status: result.StatusText || 'Bình thường'
                });
            }

            // Close modal after 1s
            setTimeout(() => close(), 1000);
        } catch (error) {
            console.error('[CustomerCreator] Create partner failed:', error);
            errorEl.textContent = error.message || 'Tạo khách hàng thất bại';
            errorEl.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Tạo khách hàng';
        }
    }

    async function createPartnerOnTPOS({ name, phone, street }) {
        // If apiService is available, use it
        if (window.apiService && typeof window.apiService.createPartner === 'function') {
            return window.apiService.createPartner({ name, phone, street });
        }

        // Otherwise, call TPOS directly via tokenManager
        if (!window.tokenManager || typeof window.tokenManager.authenticatedFetch !== 'function') {
            throw new Error('Không thể kết nối TPOS (thiếu tokenManager)');
        }

        const companyId = window.ShopConfig ? window.ShopConfig.getConfig().CompanyId : 1;
        const now = new Date().toISOString();

        const payload = {
            Id: 0,
            Name: name,
            DisplayName: null,
            Street: street || null,
            Phone: phone,
            Customer: true,
            Supplier: false,
            IsCompany: false,
            Active: true,
            Employee: false,
            CompanyId: companyId,
            Type: "contact",
            CompanyType: "person",
            Credit: 0,
            Debit: 0,
            CreditLimit: 0,
            OverCredit: false,
            Discount: 0,
            AmountDiscount: 0,
            CategoryId: 0,
            DateCreated: now,
            Status: "Normal",
            StatusText: "Bình thường",
            Source: "Default",
            IsNewAddress: false,
            Ward_District_City: "",
            ExtraAddress: {
                Street: street || "",
                City: {},
                District: {},
                Ward: {}
            },
            City: {},
            District: {},
            Ward: {},
            AccountPayable: {
                Id: 4, Name: "Phải trả người bán", Code: "331",
                UserTypeId: 2, UserTypeName: "Payable", Active: true,
                CompanyId: companyId, InternalType: "payable",
                NameGet: "331 Phải trả người bán", Reconcile: true
            },
            AccountReceivable: {
                Id: 1, Name: "Phải thu của khách hàng", Code: "131",
                UserTypeId: 1, UserTypeName: "Receivable", Active: true,
                CompanyId: companyId, InternalType: "receivable",
                NameGet: "131 Phải thu của khách hàng", Reconcile: true
            },
            StockCustomer: {
                Id: 9, Usage: "customer", ScrapLocation: false,
                Name: "Khách hàng", CompleteName: "Địa điểm đối tác / Khách hàng",
                ParentLocationId: 2, Active: true, ParentLeft: 13,
                ShowUsage: "Địa điểm khách hàng",
                NameGet: "Địa điểm đối tác/Khách hàng"
            },
            StockSupplier: {
                Id: 8, Usage: "supplier", ScrapLocation: false,
                Name: "Nhà cung cấp", CompleteName: "Địa điểm đối tác / Nhà cung cấp",
                ParentLocationId: 2, Active: true, ParentLeft: 15,
                ShowUsage: "Địa điểm nhà cung cấp",
                NameGet: "Địa điểm đối tác/Nhà cung cấp"
            }
        };

        console.log('[CustomerCreator] Creating TPOS Partner:', { name, phone, street, companyId });

        const response = await window.tokenManager.authenticatedFetch(
            `${TPOS_ODATA}/Partner`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json;charset=UTF-8',
                    'feature-version': '2'
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[CustomerCreator] Create Partner failed:', errorText);
            throw new Error(`Tạo khách hàng thất bại: ${response.status}`);
        }

        const result = await response.json();
        console.log('[CustomerCreator] Partner created:', result.Id, result.Name);
        return result;
    }

    // Expose globally
    window.CustomerCreator = { open, close };
})();
