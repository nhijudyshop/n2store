/**
 * Shop Configuration Module
 * Manages multi-shop (NJD Live / NJD Shop) config for TPOS integration
 * Persists selection in localStorage, dispatches 'shopChanged' event on switch
 */

window.ShopConfig = (function() {
    'use strict';

    const STORAGE_KEY = 'n2store_selected_shop';

    const SHOPS = {
        'njd-live': {
            id: 'njd-live',
            label: 'NJD LIVE',
            CompanyId: 1,
            JournalId: 4,
            AccountId: 4,
            PickingTypeId: 1,
            PaymentJournalId: 1,
            UserId: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',

            Company: {
                Id: 1, Name: 'NJD Live',
                Sender: 'Tổng đài:19003357', Phone: '19003357',
                Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
                CurrencyId: 1, Active: true, AllowSaleNegative: true,
                Customer: false, Supplier: false,
                DepositAccountId: 11, DeliveryCarrierId: 7,
                City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
                District: { name: 'Quận 12', code: '761', cityCode: '79' },
                Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' }
            },

            PickingType: {
                Id: 1, Code: 'incoming', Name: 'Nhận hàng', Active: true,
                WarehouseId: 1, UseCreateLots: true, UseExistingLots: true,
                NameGet: 'Nhi Judy Store: Nhận hàng'
            },

            Journal: {
                Id: 4, Name: 'Nhật ký mua hàng', Type: 'purchase',
                TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false
            },

            User: {
                Id: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',
                Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt',
                CompanyId: 1, CompanyName: 'NJD Live', Active: true
            },

            PaymentJournal: {
                Id: 1, Name: 'Tiền mặt', Type: 'cash',
                TypeGet: 'Tiền mặt', UpdatePosted: true
            },

            Account: {
                Id: 4, Name: 'Phải trả người bán', Code: '331',
                Active: true, NameGet: '331 Phải trả người bán', Reconcile: false
            }
        },

        'njd-shop': {
            id: 'njd-shop',
            label: 'NJD SHOP',
            CompanyId: 2,
            JournalId: 4,
            AccountId: 4,
            PickingTypeId: 1,
            PaymentJournalId: 1,
            UserId: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',

            Company: {
                Id: 2, Name: 'NJD Shop',
                Sender: 'Tổng đài:19003357', Phone: '19003357',
                Street: '39/9A đường TMT 9A, Khu phố 2, Phường Trung Mỹ Tây, Quận 12, Hồ Chí Minh',
                CurrencyId: 1, Active: true, AllowSaleNegative: true,
                Customer: false, Supplier: false,
                DepositAccountId: 11, DeliveryCarrierId: 7,
                City: { name: 'Thành phố Hồ Chí Minh', code: '79' },
                District: { name: 'Quận 12', code: '761', cityCode: '79' },
                Ward: { name: 'Phường Trung Mỹ Tây', code: '26785', cityCode: '79', districtCode: '761' }
            },

            PickingType: {
                Id: 1, Code: 'incoming', Name: 'Nhận hàng', Active: true,
                WarehouseId: 1, UseCreateLots: true, UseExistingLots: true,
                NameGet: 'NJD Shop: Nhận hàng'
            },

            Journal: {
                Id: 4, Name: 'Nhật ký mua hàng', Type: 'purchase',
                TypeGet: 'Mua hàng', UpdatePosted: true, DedicatedRefund: false
            },

            User: {
                Id: 'ae5c70a1-898c-4e9f-b248-acc10b7036bc',
                Email: 'nvkt@gmail.com', Name: 'nvkt', UserName: 'nvkt',
                CompanyId: 2, CompanyName: 'NJD Shop', Active: true
            },

            PaymentJournal: {
                Id: 1, Name: 'Tiền mặt', Type: 'cash',
                TypeGet: 'Tiền mặt', UpdatePosted: true
            },

            Account: {
                Id: 4, Name: 'Phải trả người bán', Code: '331',
                Active: true, NameGet: '331 Phải trả người bán', Reconcile: false
            }
        }
    };

    function getSelectedShopId() {
        return localStorage.getItem(STORAGE_KEY) || 'njd-live';
    }

    function getConfig() {
        return SHOPS[getSelectedShopId()] || SHOPS['njd-live'];
    }

    function setShop(shopId) {
        if (!SHOPS[shopId]) return;
        const prev = getSelectedShopId();
        if (prev === shopId) return;
        localStorage.setItem(STORAGE_KEY, shopId);
        window.dispatchEvent(new CustomEvent('shopChanged', {
            detail: { shopId, config: SHOPS[shopId], previousShopId: prev }
        }));
    }

    function getShops() {
        return Object.values(SHOPS).map(s => ({ id: s.id, label: s.label }));
    }

    console.log('[ShopConfig] Loaded, current shop:', getSelectedShopId());

    return { getSelectedShopId, getConfig, setShop, getShops };
})();
