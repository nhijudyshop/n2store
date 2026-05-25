// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared TPOS return-order STATIC CONFIG (FastPurchaseOrder refund payload schema).
 *
 * Static values that TPOS API requires in the payload — extracted out of the main modal module
 * so the entry file stays under the 800-line cap. Used by:
 *   - shared/js/return-order-modal.js (form UI)
 *   - shared/js/return-order-payload.js (submit POST body builder)
 *
 * Per-company variants: CompanyId=1 (NJD Live), CompanyId=2 (NJD Shop). Selected via
 * window.ShopConfig.getConfig().CompanyId, defaults to 1.
 */
window.ReturnOrderConfig = (function () {
    'use strict';

    const STATIC_USER_ID = 'ae5c70a1-898c-4e9f-b248-acc10b7036bc';

    function getCompanyId() {
        return window.ShopConfig?.getConfig()?.CompanyId || 1;
    }

    const COMPANY_CONFIG = {
        1: {
            JournalId: 4,
            AccountId: 4,
            PickingTypeId: 1,
            PaymentJournalId: 1,
            Company: {
                Id: 1,
                Name: 'NJD Live',
                Sender: 'Tổng đài:19003357',
                Phone: '19003357',
                Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
                CurrencyId: 1,
                Active: true,
                AllowSaleNegative: true,
                Customer: false,
                Supplier: false,
                DepositAccountId: 11,
                DeliveryCarrierId: 7,
                City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
                District: { name: 'Quận 12', code: '761', cityCode: '79' },
                Ward: {
                    name: 'Phường Trung Mỹ Tây',
                    code: '26785',
                    cityCode: '79',
                    districtCode: '761',
                },
            },
            User: {
                Id: STATIC_USER_ID,
                Email: 'nvkt@gmail.com',
                Name: 'nvkt',
                UserName: 'nvkt',
                CompanyId: 1,
                CompanyName: 'NJD Live',
                Active: true,
            },
            Journal: {
                Id: 4,
                Name: 'Nhật ký mua hàng',
                Type: 'purchase',
                TypeGet: 'Mua hàng',
                UpdatePosted: true,
                DedicatedRefund: false,
            },
            PaymentJournal: {
                Id: 1,
                Name: 'Tiền mặt',
                Type: 'cash',
                TypeGet: 'Tiền mặt',
                UpdatePosted: true,
            },
            PickingType: {
                Id: 1,
                Code: 'incoming',
                Name: 'Nhận hàng',
                Active: true,
                WarehouseId: 1,
                UseCreateLots: true,
                UseExistingLots: true,
                NameGet: 'Nhi Judy Store: Nhận hàng',
            },
            Account: {
                Id: 4,
                Name: 'Phải trả người bán',
                Code: '331',
                Active: true,
                NameGet: '331 Phải trả người bán',
                Reconcile: false,
            },
        },
        2: {
            JournalId: 11,
            AccountId: 32,
            PickingTypeId: 5,
            PaymentJournalId: 8,
            Company: {
                Id: 2,
                Name: 'NJD Shop',
                Sender: 'Tổng đài:19003357',
                Phone: '19003357',
                Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
                CurrencyId: 1,
                Active: true,
                AllowSaleNegative: true,
                Customer: false,
                Supplier: false,
                DepositAccountId: 11,
                DeliveryCarrierId: 7,
                City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
                District: { name: 'Quận 12', code: '761', cityCode: '79' },
                Ward: {
                    name: 'Phường Trung Mỹ Tây',
                    code: '26785',
                    cityCode: '79',
                    districtCode: '761',
                },
            },
            User: {
                Id: STATIC_USER_ID,
                Email: 'nvkt@gmail.com',
                Name: 'nvkt',
                UserName: 'nvkt',
                CompanyId: 2,
                CompanyName: 'NJD Shop',
                Active: true,
            },
            Journal: {
                Id: 11,
                Name: 'Nhật ký mua hàng',
                Type: 'purchase',
                TypeGet: 'Mua hàng',
                UpdatePosted: true,
                DedicatedRefund: false,
            },
            PaymentJournal: {
                Id: 8,
                Name: 'Tiền mặt',
                Type: 'cash',
                TypeGet: 'Tiền mặt',
                UpdatePosted: true,
            },
            PickingType: {
                Id: 5,
                Code: 'incoming',
                Name: 'Nhận hàng',
                Active: true,
                WarehouseId: 2,
                UseCreateLots: true,
                UseExistingLots: true,
                NameGet: 'Shop NJD: Nhận hàng',
            },
            Account: {
                Id: 32,
                Name: 'Phải trả người bán',
                Code: '331',
                Active: true,
                NameGet: '331 Phải trả người bán',
                Reconcile: false,
            },
        },
    };

    function getConfig() {
        return COMPANY_CONFIG[getCompanyId()] || COMPANY_CONFIG[1];
    }

    function toVNDateString(date) {
        const d = date || new Date();
        const offset = 7 * 60;
        const local = new Date(d.getTime() + offset * 60000);
        return local.toISOString().replace('Z', '') + '+07:00';
    }

    return {
        STATIC_USER_ID,
        COMPANY_CONFIG,
        getCompanyId,
        getConfig,
        toVNDateString,
    };
})();
