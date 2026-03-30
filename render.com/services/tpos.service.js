const { fetchWithRetry, fetchWithTimeout } = require("../../shared/node/fetch-utils.cjs");
const TPOS_CONFIG = require("../config/tpos.config");
const tposTokenManager = require("./tpos-token-manager");
const { randomDelay, getHeaders } = require("../helpers/utils");
const { getDynamicHeaderManager } = require("../helpers/dynamic-header-manager");

// Get singleton instance
const dynamicHeaderManager = getDynamicHeaderManager();

async function uploadExcelToTPOS(excelBase64) {
    await randomDelay();

    const url = `${TPOS_CONFIG.API_BASE}/ODataService.ActionImportSimple`;
    const headers = {
        ...getHeaders(),
        authorization: `Bearer ${await tposTokenManager.getToken()}`,
    };

    // 📤 Logging (if enabled)
    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log("\n" + "=".repeat(60));
        console.log("📤 UPLOAD EXCEL TO TPOS");
        console.log("URL:", url);
        console.log("Headers:", JSON.stringify(headers, null, 2));
        console.log("=".repeat(60));
    }

    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            do_inventory: false,
            file: excelBase64,
            version: "2701",
        }),
    }, 30000);

    // 🔥 Learn from response headers
    await dynamicHeaderManager.learnFromResponse(response, { verbose: false });

    // 📥 Logging response
    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log(`📥 Response: ${response.status} ${response.statusText}\n`);
    }

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload Excel failed: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // 🔥 Learn from response body (if has config)
    await dynamicHeaderManager.learnFromResponseBody(data, { verbose: false });

    return data;
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

    const url = `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2?${queryParams.toString()}`;
    const headers = {
        ...getHeaders(),
        authorization: `Bearer ${await tposTokenManager.getToken()}`,
    };

    // 📤 Logging (if enabled)
    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log("\n" + "=".repeat(60));
        console.log("📤 GET LATEST PRODUCTS");
        console.log("URL:", url);
        console.log("Headers:", JSON.stringify(headers, null, 2));
        console.log("=".repeat(60));
    }

    const response = await fetchWithRetry(url, { headers }, 2, 1000, 15000);

    // 🔥 Learn from response
    await dynamicHeaderManager.learnFromResponse(response, { verbose: false });

    // 📥 Logging
    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log(`📥 Response: ${response.status} ${response.statusText}\n`);
    }

    if (!response.ok) {
        throw new Error(`Get products failed: ${response.status}`);
    }

    const data = await response.json();

    // 🔥 Learn from response body
    await dynamicHeaderManager.learnFromResponseBody(data, { verbose: false });

    const items = (data.value || data).filter(
        (item) => item.CreatedByName === TPOS_CONFIG.CREATED_BY_NAME,
    );

    return items.sort((a, b) => b.Id - a.Id).slice(0, count);
}

async function getProductDetail(productId) {
    await randomDelay();

    const url = `${TPOS_CONFIG.API_BASE}(${productId})?$expand=${TPOS_CONFIG.EXPAND_PARAMS}`;
    const headers = {
        ...getHeaders(),
        authorization: `Bearer ${await tposTokenManager.getToken()}`,
    };

    const response = await fetchWithRetry(url, { headers }, 2, 1000, 15000);

    // 🔥 Learn from response
    await dynamicHeaderManager.learnFromResponse(response, { verbose: false });

    if (!response.ok) {
        throw new Error(`Get product detail failed: ${response.status}`);
    }

    const data = await response.json();

    // 🔥 Learn from response body
    await dynamicHeaderManager.learnFromResponseBody(data, { verbose: false });

    return data;
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

    const url = `${TPOS_CONFIG.API_BASE}/ODataService.UpdateV2`;
    const headers = {
        ...getHeaders(),
        authorization: `Bearer ${await tposTokenManager.getToken()}`,
    };

    // 📤 Logging (if enabled)
    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log("\n" + "=".repeat(60));
        console.log("📤 UPDATE PRODUCT");
        console.log("URL:", url);
        console.log("Headers:", JSON.stringify(headers, null, 2));
        console.log("=".repeat(60));
    }

    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
    }, 30000);

    // 🔥 Learn from response
    await dynamicHeaderManager.learnFromResponse(response, { verbose: false });

    // 📥 Logging
    if (process.env.ENABLE_HEADER_LOGGING === "true") {
        console.log(`📥 Response: ${response.status} ${response.statusText}\n`);
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Update failed: ${response.status}`);
    }

    const data = await response.json();

    // 🔥 Learn from response body
    await dynamicHeaderManager.learnFromResponseBody(data, { verbose: false });

    return data;
}

module.exports = {
    uploadExcelToTPOS,
    getLatestProducts,
    getProductDetail,
    updateProductWithImageAndAttributes,
};
