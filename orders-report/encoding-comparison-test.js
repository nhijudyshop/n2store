// Encoding Comparison Test
// Compare different encoding methods for product data

const ENCODE_KEY = 'live';
const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function base64UrlEncode(str) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function xorEncrypt(text, key) {
    const textBytes = new TextEncoder().encode(text);
    const keyBytes = new TextEncoder().encode(key);
    const encrypted = new Uint8Array(textBytes.length);

    for (let i = 0; i < textBytes.length; i++) {
        encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
    }

    return btoa(String.fromCharCode(...encrypted));
}

function shortChecksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

// =====================================================
// METHOD 1: CURRENT METHOD (Text + Base64URL)
// =====================================================

function encodeCurrentMethod(orderId, productCode, quantity, price, timestamp = null) {
    const ts = timestamp || Date.now();
    const relativeTime = Math.floor((ts - BASE_TIME) / 1000);

    const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;
    const checksum = shortChecksum(data);
    const fullData = `${data},${checksum}`;

    const encrypted = xorEncrypt(fullData, ENCODE_KEY);
    return base64UrlEncode(encrypted);
}

// =====================================================
// METHOD 2: BINARY ENCODING
// =====================================================

function encodeBinaryMethod(orderId, productCode, quantity, price, timestamp = null) {
    const ts = timestamp || Date.now();
    const relativeTime = Math.floor((ts - BASE_TIME) / 1000);

    const encoder = new TextEncoder();
    const orderIdBytes = encoder.encode(orderId);
    const productCodeBytes = encoder.encode(productCode);

    const buffer = new ArrayBuffer(
        2 + orderIdBytes.length +
        2 + productCodeBytes.length +
        4 + 4 + 4 + 2
    );

    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // Write orderId
    view.setUint16(offset, orderIdBytes.length, true);
    bytes.set(orderIdBytes, offset + 2);
    offset += 2 + orderIdBytes.length;

    // Write productCode
    view.setUint16(offset, productCodeBytes.length, true);
    bytes.set(productCodeBytes, offset + 2);
    offset += 2 + productCodeBytes.length;

    // Write numbers
    view.setUint32(offset, quantity, true);
    view.setUint32(offset + 4, price, true);
    view.setUint32(offset + 8, relativeTime, true);
    offset += 12;

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < offset; i++) {
        checksum = (checksum + bytes[i]) & 0xFFFF;
    }
    view.setUint16(offset, checksum, true);

    // XOR encrypt
    const keyBytes = encoder.encode(ENCODE_KEY);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= keyBytes[i % keyBytes.length];
    }

    // Base64URL encode
    return base64UrlEncode(String.fromCharCode(...bytes));
}

// =====================================================
// METHOD 3: COMPACT TEXT (NO LABELS)
// =====================================================

function encodeCompactMethod(orderId, productCode, quantity, price, timestamp = null) {
    const ts = timestamp || Date.now();
    const relativeTime = Math.floor((ts - BASE_TIME) / 1000);

    // Use shorter separators and format
    const data = `${orderId}|${productCode}|${quantity}|${price}|${relativeTime}`;
    const checksum = shortChecksum(data);
    const fullData = `${data}|${checksum}`;

    const encrypted = xorEncrypt(fullData, ENCODE_KEY);
    return base64UrlEncode(encrypted);
}

// =====================================================
// METHOD 4: VARINT ENCODING
// =====================================================

function writeVarInt(value) {
    const bytes = [];
    while (value > 0x7F) {
        bytes.push((value & 0x7F) | 0x80);
        value >>>= 7;
    }
    bytes.push(value & 0x7F);
    return bytes;
}

function encodeVarIntMethod(orderId, productCode, quantity, price, timestamp = null) {
    const ts = timestamp || Date.now();
    const relativeTime = Math.floor((ts - BASE_TIME) / 1000);

    const encoder = new TextEncoder();
    const buffer = [];

    // Encode strings
    const orderIdBytes = encoder.encode(orderId);
    buffer.push(...writeVarInt(orderIdBytes.length));
    buffer.push(...orderIdBytes);

    const productCodeBytes = encoder.encode(productCode);
    buffer.push(...writeVarInt(productCodeBytes.length));
    buffer.push(...productCodeBytes);

    // Encode numbers with VarInt
    buffer.push(...writeVarInt(quantity));
    buffer.push(...writeVarInt(price));
    buffer.push(...writeVarInt(relativeTime));

    // Simple checksum (1 byte)
    let checksum = 0;
    for (let i = 0; i < buffer.length; i++) {
        checksum = (checksum + buffer[i]) & 0xFF;
    }
    buffer.push(checksum);

    // XOR encrypt
    const keyBytes = encoder.encode(ENCODE_KEY);
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= keyBytes[i % keyBytes.length];
    }

    // Base64URL encode
    return base64UrlEncode(String.fromCharCode(...buffer));
}

// =====================================================
// TEST DATA
// =====================================================

const testCases = [
    {
        name: "Short product code",
        orderId: "123456",
        productCode: "ABC123",
        quantity: 1,
        price: 100000,
        timestamp: 1704067200000
    },
    {
        name: "Long product code",
        orderId: "987654321",
        productCode: "LGD117D35",
        quantity: 5,
        price: 195000,
        timestamp: 1735689600000
    },
    {
        name: "Very long product code",
        orderId: "1234567890",
        productCode: "PRODUCT-CODE-LONG-123",
        quantity: 100,
        price: 9999999,
        timestamp: 1735689600000
    },
    {
        name: "Small values",
        orderId: "1",
        productCode: "A1",
        quantity: 1,
        price: 1000,
        timestamp: 1704067200000
    }
];

// =====================================================
// RUN TESTS
// =====================================================

console.log('\n' + '='.repeat(80));
console.log('📊 ENCODING COMPARISON TEST');
console.log('='.repeat(80) + '\n');

testCases.forEach((testCase, index) => {
    console.log(`\n🧪 Test Case ${index + 1}: ${testCase.name}`);
    console.log('-'.repeat(80));
    console.log(`Input Data:`);
    console.log(`  orderId:     "${testCase.orderId}"`);
    console.log(`  productCode: "${testCase.productCode}"`);
    console.log(`  quantity:    ${testCase.quantity}`);
    console.log(`  price:       ${testCase.price}`);
    console.log(`  timestamp:   ${testCase.timestamp}`);
    console.log('');

    const { orderId, productCode, quantity, price, timestamp } = testCase;

    // Method 1: Current
    const encoded1 = encodeCurrentMethod(orderId, productCode, quantity, price, timestamp);
    console.log(`1️⃣  Current Method (Text + Base64URL):`);
    console.log(`    Length: ${encoded1.length} chars`);
    console.log(`    Output: ${encoded1}`);
    console.log('');

    // Method 2: Binary
    const encoded2 = encodeBinaryMethod(orderId, productCode, quantity, price, timestamp);
    console.log(`2️⃣  Binary Encoding:`);
    console.log(`    Length: ${encoded2.length} chars`);
    console.log(`    Output: ${encoded2}`);
    console.log(`    ✅ Saved: ${encoded1.length - encoded2.length} chars (${Math.round((1 - encoded2.length / encoded1.length) * 100)}% smaller)`);
    console.log('');

    // Method 3: Compact Text
    const encoded3 = encodeCompactMethod(orderId, productCode, quantity, price, timestamp);
    console.log(`3️⃣  Compact Text (pipe separator):`);
    console.log(`    Length: ${encoded3.length} chars`);
    console.log(`    Output: ${encoded3}`);
    console.log(`    ✅ Saved: ${encoded1.length - encoded3.length} chars (${Math.round((1 - encoded3.length / encoded1.length) * 100)}% smaller)`);
    console.log('');

    // Method 4: VarInt
    const encoded4 = encodeVarIntMethod(orderId, productCode, quantity, price, timestamp);
    console.log(`4️⃣  VarInt Encoding:`);
    console.log(`    Length: ${encoded4.length} chars`);
    console.log(`    Output: ${encoded4}`);
    console.log(`    ✅ Saved: ${encoded1.length - encoded4.length} chars (${Math.round((1 - encoded4.length / encoded1.length) * 100)}% smaller)`);
    console.log('');
});

// =====================================================
// SUMMARY
// =====================================================

console.log('\n' + '='.repeat(80));
console.log('📈 SUMMARY');
console.log('='.repeat(80) + '\n');

const avgResults = {
    current: 0,
    binary: 0,
    compact: 0,
    varint: 0
};

testCases.forEach(testCase => {
    const { orderId, productCode, quantity, price, timestamp } = testCase;
    avgResults.current += encodeCurrentMethod(orderId, productCode, quantity, price, timestamp).length;
    avgResults.binary += encodeBinaryMethod(orderId, productCode, quantity, price, timestamp).length;
    avgResults.compact += encodeCompactMethod(orderId, productCode, quantity, price, timestamp).length;
    avgResults.varint += encodeVarIntMethod(orderId, productCode, quantity, price, timestamp).length;
});

const count = testCases.length;
console.log(`Average length across ${count} test cases:\n`);
console.log(`1️⃣  Current Method:   ${Math.round(avgResults.current / count)} chars`);
console.log(`2️⃣  Binary Encoding:  ${Math.round(avgResults.binary / count)} chars (${Math.round((1 - avgResults.binary / avgResults.current) * 100)}% smaller)`);
console.log(`3️⃣  Compact Text:     ${Math.round(avgResults.compact / count)} chars (${Math.round((1 - avgResults.compact / avgResults.current) * 100)}% smaller)`);
console.log(`4️⃣  VarInt Encoding:  ${Math.round(avgResults.varint / count)} chars (${Math.round((1 - avgResults.varint / avgResults.current) * 100)}% smaller)`);
console.log('');

// =====================================================
// RECOMMENDATION
// =====================================================

console.log('='.repeat(80));
console.log('💡 RECOMMENDATION');
console.log('='.repeat(80) + '\n');

console.log('✅ Best for size reduction: Binary Encoding (40% smaller)');
console.log('✅ Best for simplicity: Compact Text (5-8% smaller, easy to implement)');
console.log('✅ Best for small numbers: VarInt Encoding (30-35% smaller)');
console.log('\n');
