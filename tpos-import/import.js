// Configuration
const AUTH_TOKEN =
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZmMwZjQ0MzktOWNmNi00ZDg4LWE4YzctNzU5Y2E4Mjk1MTQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52MjAiLCJEaXNwbGF5TmFtZSI6IlTDuiIsIkF2YXRhclVybCI6IiIsIlNlY3VyaXR5U3RhbXAiOiI1ZjY1NjQwMy01NjdmLTRmYzAtYjYxNy0yODJhYzgxZGY1ZWQiLCJDb21wYW55SWQiOiIxIiwiVGVuYW50SWQiOiJ0b21hdG8udHBvcy52biIsIlJvbGVJZHMiOiI0MmZmYzk5Yi1lNGY2LTQwMDAtYjcyOS1hZTNmMDAyOGEyODksNmExZDAwMDAtNWQxYS0wMDE1LTBlNmMtMDhkYzM3OTUzMmU5LDc2MzlhMDQ4LTdjZmUtNDBiNS1hNDFkLWFlM2YwMDNiODlkZiw4YmM4ZjQ1YS05MWY4LTQ5NzMtYjE4Mi1hZTNmMDAzYWI4NTUsYTljMjAwMDAtNWRiNi0wMDE1LTQ1YWItMDhkYWIxYmZlMjIyIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIlF14bqjbiBMw70gTWFpIiwiQ8OSSSIsIkNTS0ggLSBMw6BpIiwiS2hvIFBoxrDhu5tjLSBLaeG7h3QiLCJRdeG6o24gTMO9IEtobyAtIEJvIl0sImp0aSI6IjYxMDI0MTA5LTdmOGEtNDk3Zi05NGYxLTY3YzIwMjZiZWUyNCIsImlhdCI6IjE3NTk4MTI1MzAiLCJuYmYiOjE3NTk4MTI1MzAsImV4cCI6MTc2MTEwODUzMCwiaXNzIjoiaHR0cHM6Ly90b21hdG8udHBvcy52biIsImF1ZCI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4saHR0cHM6Ly90cG9zLnZuIn0.OVAcmG1fPovK8rJ65dkNlEADtnyWu-d6BUKP0wxZuXk";

const attributeData = {
    sizeText: [
        {
            Id: 5,
            Name: "Free Size",
            Code: "FS",
            Sequence: 0,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
        {
            Id: 1,
            Name: "S",
            Code: "S",
            Sequence: 1,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
        {
            Id: 2,
            Name: "M",
            Code: "M",
            Sequence: 2,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
        {
            Id: 3,
            Name: "L",
            Code: "L",
            Sequence: 3,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
        {
            Id: 4,
            Name: "XL",
            Code: "XL",
            Sequence: 4,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
        {
            Id: 31,
            Name: "XXL",
            Code: "xxl",
            Sequence: null,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
        {
            Id: 32,
            Name: "XXXL",
            Code: "xxxl",
            Sequence: null,
            AttributeId: 1,
            AttributeName: "Size Chữ",
        },
    ],
    sizeNumber: [
        {
            Id: 80,
            Name: "27",
            Code: "27",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 81,
            Name: "28",
            Code: "28",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 18,
            Name: "29",
            Code: "29",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 19,
            Name: "30",
            Code: "30",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 20,
            Name: "31",
            Code: "31",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 21,
            Name: "32",
            Code: "32",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 46,
            Name: "34",
            Code: "34",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 33,
            Name: "35",
            Code: "35",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 34,
            Name: "36",
            Code: "36",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 35,
            Name: "37",
            Code: "37",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 36,
            Name: "38",
            Code: "38",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 37,
            Name: "39",
            Code: "39",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 44,
            Name: "40",
            Code: "40",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 91,
            Name: "41",
            Code: "41",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 92,
            Name: "42",
            Code: "42",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 93,
            Name: "43",
            Code: "43",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 94,
            Name: "44",
            Code: "44",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 22,
            Name: "1",
            Code: "1",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 23,
            Name: "2",
            Code: "2",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 24,
            Name: "3",
            Code: "3",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
        {
            Id: 48,
            Name: "4",
            Code: "4",
            Sequence: null,
            AttributeId: 4,
            AttributeName: "Size Số",
        },
    ],
    color: [
        {
            Id: 6,
            Name: "Trắng",
            Code: "trang",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 7,
            Name: "Đen",
            Code: "den",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 8,
            Name: "Đỏ",
            Code: "do",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 9,
            Name: "Vàng",
            Code: "vang",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 10,
            Name: "Cam",
            Code: "cam",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 11,
            Name: "Xám",
            Code: "xam",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 12,
            Name: "Hồng",
            Code: "hong",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 14,
            Name: "Nude",
            Code: "nude",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 15,
            Name: "Nâu",
            Code: "nau",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 16,
            Name: "Rêu",
            Code: "reu",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 17,
            Name: "Xanh",
            Code: "xanh",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 25,
            Name: "Bạc",
            Code: "bac",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
        {
            Id: 26,
            Name: "Tím",
            Code: "tim",
            Sequence: null,
            AttributeId: 3,
            AttributeName: "Màu",
        },
    ],
};

function generateRandomId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        },
    );
}

function getHeaders() {
    return {
        accept: "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json;charset=UTF-8",
        origin: "https://tomato.tpos.vn",
        referer: "https://tomato.tpos.vn/",
        "sec-ch-ua":
            '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        tposappversion: "5.9.10.1",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "x-request-id": generateRandomId(),
        authorization: AUTH_TOKEN,
    };
}

async function getProduct(tpos_product_id) {
    const url = `https://tomato.tpos.vn/odata/ProductTemplate(${tpos_product_id})?$expand=UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues)`;

    const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
    });

    const originalProduct = await response.json();
    return originalProduct;
}

function createAttributeLines(selectedAttributes) {
    const attributeLines = [];

    if (selectedAttributes.sizeText && selectedAttributes.sizeText.length > 0) {
        attributeLines.push({
            Attribute: {
                Id: 1,
                Name: "Size Chữ",
                Code: "SZCh",
                Sequence: 1,
                CreateVariant: true,
            },
            Values: selectedAttributes.sizeText.map((attr) => ({
                Id: attr.Id,
                Name: attr.Name,
                Code: attr.Code,
                Sequence: attr.Sequence,
                AttributeId: 1,
                AttributeName: "Size Chữ",
                PriceExtra: null,
                NameGet: `Size Chữ: ${attr.Name}`,
                DateCreated: null,
            })),
            AttributeId: 1,
        });
    }

    if (
        selectedAttributes.sizeNumber &&
        selectedAttributes.sizeNumber.length > 0
    ) {
        attributeLines.push({
            Attribute: {
                Id: 4,
                Name: "Size Số",
                Code: "SZS",
                Sequence: 2,
                CreateVariant: true,
            },
            Values: selectedAttributes.sizeNumber.map((attr) => ({
                Id: attr.Id,
                Name: attr.Name,
                Code: attr.Code,
                Sequence: attr.Sequence,
                AttributeId: 4,
                AttributeName: "Size Số",
                PriceExtra: null,
                NameGet: `Size Số: ${attr.Name}`,
                DateCreated: null,
            })),
            AttributeId: 4,
        });
    }

    if (selectedAttributes.color && selectedAttributes.color.length > 0) {
        attributeLines.push({
            Attribute: {
                Id: 3,
                Name: "Màu",
                Code: "mau",
                Sequence: 3,
                CreateVariant: true,
            },
            Values: selectedAttributes.color.map((attr) => ({
                Id: attr.Id,
                Name: attr.Name,
                Code: attr.Code,
                Sequence: attr.Sequence,
                AttributeId: 3,
                AttributeName: "Màu",
                PriceExtra: null,
                NameGet: `Màu: ${attr.Name}`,
                DateCreated: null,
            })),
            AttributeId: 3,
        });
    }

    return attributeLines;
}

function cartesianProduct(...arrays) {
    return arrays.reduce(
        (acc, array) => {
            return acc.flatMap((x) => array.map((y) => [x, y].flat()));
        },
        [[]],
    );
}

function generateVariants(originalProduct, attributeLines) {
    const allValues = attributeLines.map((line) => line.Values);
    const combinations = cartesianProduct(...allValues);

    const newVariants = combinations.map((combo) => {
        const attrArray = Array.isArray(combo) ? combo : [combo];
        const names = attrArray.map((a) => a.Name).join(", ");

        return {
            Id: 0,
            EAN13: null,
            DefaultCode: null,
            NameTemplate: originalProduct.Name,
            NameNoSign: null,
            ProductTmplId: originalProduct.Id,
            UOMId: 0,
            UOMName: null,
            UOMPOId: 0,
            QtyAvailable: 0,
            VirtualAvailable: 0,
            OutgoingQty: null,
            IncomingQty: null,
            NameGet: `${originalProduct.Name} (${names})`,
            POSCategId: null,
            Price: null,
            Barcode: null,
            Image: null,
            ImageUrl: null,
            Thumbnails: [],
            PriceVariant: originalProduct.ListPrice,
            SaleOK: true,
            PurchaseOK: true,
            DisplayAttributeValues: null,
            LstPrice: 0,
            Active: true,
            ListPrice: 0,
            PurchasePrice: null,
            DiscountSale: null,
            DiscountPurchase: null,
            StandardPrice: 0,
            Weight: 0,
            Volume: null,
            OldPrice: null,
            IsDiscount: false,
            ProductTmplEnableAll: false,
            Version: 0,
            Description: null,
            LastUpdated: null,
            Type: "product",
            CategId: 0,
            CostMethod: null,
            InvoicePolicy: "order",
            Variant_TeamId: 0,
            Name: `${originalProduct.Name} (${names})`,
            PropertyCostMethod: null,
            PropertyValuation: null,
            PurchaseMethod: "receive",
            SaleDelay: 0,
            Tracking: null,
            Valuation: null,
            AvailableInPOS: true,
            CompanyId: null,
            IsCombo: null,
            NameTemplateNoSign: originalProduct.NameNoSign,
            TaxesIds: [],
            StockValue: null,
            SaleValue: null,
            PosSalesCount: null,
            Factor: null,
            CategName: null,
            AmountTotal: null,
            NameCombos: [],
            RewardName: null,
            Product_UOMId: null,
            Tags: null,
            DateCreated: null,
            InitInventory: 0,
            OrderTag: null,
            StringExtraProperties: null,
            CreatedById: null,
            Error: null,
            AttributeValues: attrArray.map((a) => ({
                Id: a.Id,
                Name: a.Name,
                Code: null,
                Sequence: null,
                AttributeId: a.AttributeId,
                AttributeName: a.AttributeName,
                PriceExtra: null,
                NameGet: `${a.AttributeName}: ${a.Name}`,
                DateCreated: null,
            })),
        };
    });

    const oldVariants = originalProduct.ProductVariants.filter(
        (v) => v.Id > 0,
    ).map((oldVariant) => {
        const inactiveVariant = JSON.parse(JSON.stringify(oldVariant));
        delete inactiveVariant.UOM;
        delete inactiveVariant.Categ;
        delete inactiveVariant.UOMPO;
        delete inactiveVariant.POSCateg;
        inactiveVariant.Active = false;
        return inactiveVariant;
    });

    return [...newVariants, ...oldVariants];
}

function createPayload(originalProduct, attributeLines, variants) {
    const payload = JSON.parse(JSON.stringify(originalProduct));

    delete payload["@odata.context"];
    payload.Version = 0;
    payload.AttributeLines = attributeLines;
    payload.ProductVariants = variants;
    payload.Items = [];
    payload.UOMLines = [
        {
            Id: 109326,
            ProductTmplId: payload.Id,
            ProductTmplListPrice: null,
            UOMId: 1,
            TemplateUOMFactor: 0,
            ListPrice: payload.ListPrice,
            Barcode: "",
            Price: null,
            ProductId: 0,
            UOMName: null,
            NameGet: null,
            Factor: 0,
            UOM: payload.UOM,
        },
    ];
    payload.ComboProducts = [];
    payload.ProductSupplierInfos = [];

    return payload;
}

async function postPayload(payload) {
    const url =
        "https://tomato.tpos.vn/odata/ProductTemplate/ODataService.UpdateV2";

    const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });

    const result = await response.json();
    return result;
}

async function mainFlow(tpos_product_id, selectedAttributes) {
    try {
        const originalProduct = await getProduct(tpos_product_id);
        const attributeLines = createAttributeLines(selectedAttributes);
        const variants = generateVariants(originalProduct, attributeLines);
        const payload = createPayload(
            originalProduct,
            attributeLines,
            variants,
        );
        const result = await postPayload(payload);
        return result;
    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
}

// Example usage:
// const tpos_product_id = 107812;
// const selectedAttributes = {
//     sizeText: [
//         {Id: 2, Name: "M", Code: "M", AttributeId: 1, AttributeName: "Size Chữ"},
//         {Id: 3, Name: "L", Code: "L", AttributeId: 1, AttributeName: "Size Chữ"}
//     ],
//     color: [
//         {Id: 7, Name: "Đen", Code: "den", AttributeId: 3, AttributeName: "Màu"},
//         {Id: 6, Name: "Trắng", Code: "trang", AttributeId: 3, AttributeName: "Màu"}
//     ]
// };
// mainFlow(tpos_product_id, selectedAttributes);
