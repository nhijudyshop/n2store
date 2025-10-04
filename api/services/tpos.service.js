const fetch = require("node-fetch");
const TPOS_CONFIG = require("../config/tpos.config");
const { randomDelay, getHeaders } = require("../helpers/utils");

async function uploadExcelToTPOS(excelBase64) {
    await randomDelay();

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.ActionImportSimple`,
        {
            method: "POST",
            headers: {
                ...getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
            body: JSON.stringify({
                do_inventory: false,
                file: excelBase64,
                version: "2701",
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload Excel failed: ${response.status} - ${error}`);
    }

    return await response.json();
}

async function getLatestProducts(count) {
    await randomDelay();

    const queryParams = new URLSearchParams({
        Active: "true",
        priceId: "0",
        $top: "1000",
        $orderby: "DateCreated desc",
        $filter: "Active eq true",
        $count: "true",
    });

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2?${queryParams.toString()}`,
        {
            headers: {
                ...getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Get products failed: ${response.status}`);
    }

    const data = await response.json();
    const items = (data.value || data).filter(
        (item) => item.CreatedByName === TPOS_CONFIG.CREATED_BY_NAME,
    );

    return items.sort((a, b) => b.Id - a.Id).slice(0, count);
}

async function getProductDetail(productId) {
    await randomDelay();

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}(${productId})?$expand=${TPOS_CONFIG.EXPAND_PARAMS}`,
        {
            headers: {
                ...getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Get product detail failed: ${response.status}`);
    }

    return await response.json();
}

async function updateProductWithImageAndAttributes(
    productDetail,
    imageBase64,
    attributeLines,
) {
    await randomDelay();

    const payload = { ...productDetail };
    delete payload["@odata.context"];

    if (imageBase64) {
        payload.Image = imageBase64;
    }

    if (attributeLines && attributeLines.length > 0) {
        payload.AttributeLines = attributeLines;
    }

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.UpdateV2`,
        {
            method: "POST",
            headers: {
                ...getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
            body: JSON.stringify(payload),
        },
    );

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Update failed: ${response.status}`);
    }

    return await response.json();
}

module.exports = {
    uploadExcelToTPOS,
    getLatestProducts,
    getProductDetail,
    updateProductWithImageAndAttributes,
};
