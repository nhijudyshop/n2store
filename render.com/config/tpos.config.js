// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Load environment variables
require('dotenv').config();

module.exports = {
    API_BASE: process.env.TPOS_API_BASE || 'https://tomato.tpos.vn/odata/ProductTemplate',
    AUTH_TOKEN:
        process.env.TPOS_AUTH_TOKEN || '' /* audit: gỡ JWT hardcode → đặt TPOS_AUTH_TOKEN env */,
    CREATED_BY_NAME: process.env.TPOS_CREATED_BY_NAME || 'nvkt',
    EXPAND_PARAMS:
        process.env.TPOS_EXPAND_PARAMS ||
        // Must match the string used by render.com/services/sync-tpos-products.js and
        // tpos-socket-listener.js. AttributeLines needs ($expand=Attribute,Values).
        // Note: Partner nested-expand removed — TPOS dropped the Partner navigation
        // property on ProductSupplierInfoModel (HTTP 400 loop on every sync).
        'UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines($expand=Attribute,Values),UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos',
};
